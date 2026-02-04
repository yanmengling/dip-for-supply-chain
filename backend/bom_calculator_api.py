"""
BOM计算器后端API实现
符合OpenAPI 3.0规范的FastAPI服务

功能：
- BOM树构建
- MRP生产数量分析
- 替代料处理
- 全局优化分析
"""

from fastapi import FastAPI, HTTPException, BackgroundTasks, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime, timedelta
from enum import Enum
import asyncio
import httpx
import hashlib
import json
from functools import lru_cache
import logging

# 配置日志
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ============================================================================
# FastAPI应用初始化
# ============================================================================

app = FastAPI(
    title="BOM Calculator API",
    description="BOM库存分析和MRP计算服务",
    version="1.0.0",
    docs_url="/api/docs",
    redoc_url="/api/redoc"
)

# CORS配置
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境需要限制
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================================================
# 数据模型定义
# ============================================================================

class StockStatus(str, Enum):
    SUFFICIENT = "sufficient"
    WARNING = "warning"
    STAGNANT = "stagnant"
    INSUFFICIENT = "insufficient"
    UNKNOWN = "unknown"


class BOMNodeResponse(BaseModel):
    code: str
    name: str
    level: int
    quantity: float
    unit: str
    current_stock: float
    available_stock: float
    stock_status: StockStatus
    storage_days: int
    unit_price: float
    moq: Optional[int] = None
    children: List['BOMNodeResponse'] = []
    substitutes: List[Dict[str, Any]] = []


class BOMStatistics(BaseModel):
    total_materials: int
    total_inventory_value: float
    stagnant_count: int
    insufficient_count: int


class BOMTreeResponse(BaseModel):
    product_code: str
    product_name: str
    root_node: BOMNodeResponse
    statistics: BOMStatistics


class BOMTreeRequest(BaseModel):
    product_codes: List[str] = Field(..., description="产品编码列表")
    knowledge_network_id: str = Field(default="supplychain_hd0202")
    include_substitutes: bool = Field(default=True)
    include_inventory: bool = Field(default=True)
    cache: bool = Field(default=True)


class QuantityRange(BaseModel):
    min: int = Field(default=0)
    max: Optional[int] = None
    step: Optional[int] = None


class ProductionAnalysisRequest(BaseModel):
    product_code: str
    knowledge_network_id: str = Field(default="supplychain_hd0202")
    quantity_range: Optional[QuantityRange] = None
    include_moq: bool = Field(default=True)
    cache: bool = Field(default=True)


class CostAnalysis(BaseModel):
    replenishment_costs: List[float]
    new_procurement_costs: List[float]
    new_stagnant_costs: List[float]


class KeyMetrics(BaseModel):
    max_producible_without_purchase: int
    cross_point_quantity: int
    cross_point_value: float
    total_inventory_value: float


class MaterialRequirement(BaseModel):
    code: str
    name: str
    stock_value: float
    is_stagnant: bool


class ProductionAnalysisResponse(BaseModel):
    product_code: str
    product_name: str
    production_quantities: List[int]
    without_moq: CostAnalysis
    with_moq: CostAnalysis
    key_metrics: KeyMetrics
    top_expensive_materials: List[MaterialRequirement]
    analysis_conclusions: List[str]
    processing_time_ms: int


# ============================================================================
# Ontology API客户端
# ============================================================================

class OntologyAPIClient:
    """Ontology API客户端，负责数据获取"""

    def __init__(self, base_url: str, api_token: str):
        self.base_url = base_url
        self.api_token = api_token
        self.session = None

    async def __aenter__(self):
        self.session = httpx.AsyncClient(
            timeout=120.0,
            headers={"Authorization": f"Bearer {self.api_token}"}
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.aclose()

    async def query_object_instances(
        self,
        network_id: str,
        object_type_id: str,
        limit: int = 5000,
        search_after: Optional[List] = None
    ) -> Dict:
        """查询对象实例"""
        url = f"{self.base_url}/api/ontology-query/v1/knowledge-networks/{network_id}/object-types/{object_type_id}"

        params = {
            "include_type_info": "true",
            "include_logic_params": "false",
            "limit": limit
        }

        if search_after:
            params["search_after"] = json.dumps(search_after)

        try:
            response = await self.session.get(url, params=params)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            logger.error(f"API请求失败: {e}")
            raise HTTPException(status_code=500, detail=f"Ontology API error: {str(e)}")

    async def load_all_pages(
        self,
        network_id: str,
        object_type_id: str,
        limit: int = 2000
    ) -> List[Dict]:
        """分页加载所有数据"""
        all_data = []
        search_after = None
        page = 1

        while True:
            logger.info(f"加载 {object_type_id} 第{page}页...")
            response = await self.query_object_instances(
                network_id, object_type_id, limit, search_after
            )

            entries = response.get("entries", [])
            if not entries:
                break

            all_data.extend(entries)
            logger.info(f"第{page}页加载 {len(entries)} 条，累计 {len(all_data)} 条")

            search_after = response.get("search_after")
            if not search_after or len(entries) < limit:
                break

            page += 1

        return all_data


# ============================================================================
# 数据处理服务
# ============================================================================

class BOMCalculatorService:
    """BOM计算服务核心逻辑"""

    def __init__(self, api_client: OntologyAPIClient, network_id: str):
        self.api_client = api_client
        self.network_id = network_id
        self._cache = {}  # 简单内存缓存，生产环境应使用Redis

    async def load_materials(self) -> tuple[List[Dict], List[Dict]]:
        """加载物料和产品数据"""
        logger.info("开始加载物料/产品数据...")

        # 加载物料数据
        material_data = await self.api_client.load_all_pages(
            self.network_id,
            "supplychain_hd0202_material"
        )

        # 分离产品和物料
        products = []
        materials = []

        for item in material_data:
            # 这里需要根据实际字段名调整
            material_info = {
                "material_code": item.get("material_code") or item.get("number", ""),
                "material_name": item.get("material_name") or item.get("name", ""),
                "group_name": item.get("group_name", ""),
                "moq": int(item.get("purchase_huid_minlotsize", 0) or 0),
                "unit_price": float(item.get("unit_price", 0) or 0),
                "baseunit_name": item.get("baseunit_name", "个")
            }

            # 根据group_name区分产品和物料
            if material_info["group_name"] == "库存商品-产成品":
                products.append(material_info)
            else:
                materials.append(material_info)

        logger.info(f"加载完成: {len(products)} 个产品, {len(materials)} 个物料")
        return products, materials

    async def load_boms(self) -> List[Dict]:
        """加载BOM数据"""
        logger.info("开始加载BOM数据...")

        bom_data = await self.api_client.load_all_pages(
            self.network_id,
            "supplychain_hd0202_bom"
        )

        boms = []
        for item in bom_data:
            # 计算单耗：优先使用standard_usage，否则用分数计算
            standard_usage = item.get("standard_usage")
            if standard_usage:
                quantity = float(standard_usage)
            else:
                numerator = float(item.get("usage_numerator", 1))
                denominator = float(item.get("usage_denominator", 1))
                quantity = numerator / denominator if denominator else 0

            bom = {
                "parent_code": item.get("bom_material_code", ""),
                "child_code": item.get("material_code", ""),
                "child_name": item.get("material_name", ""),
                "child_quantity": quantity,
                "unit": item.get("unit", "个"),
                "alt_group_no": item.get("alt_group_no", ""),
                "alt_part": item.get("alt_part", ""),
                "alt_priority": int(item.get("alt_priority", 999) or 999),
                "bom_level": int(item.get("bom_level", 0) or 0)
            }
            boms.append(bom)

        logger.info(f"加载完成: {len(boms)} 条BOM记录")
        return boms

    async def load_inventory(self) -> Dict[str, Dict]:
        """加载库存数据并按物料编码聚合"""
        logger.info("开始加载库存数据...")

        inventory_data = await self.api_client.load_all_pages(
            self.network_id,
            "supplychain_hd0202_inventory"
        )

        # 按物料编码聚合（多仓库）
        inventory_map = {}

        for item in inventory_data:
            material_code = item.get("material_code", "")
            if not material_code:
                continue

            available_qty = float(item.get("available_base_qty", 0) or 0)
            base_qty = float(item.get("base_qty", 0) or 0)

            # 计算库龄
            storage_days = self._calculate_storage_days(item.get("batch_no", ""))

            if material_code in inventory_map:
                # 累加库存
                inventory_map[material_code]["available_stock"] += available_qty
                inventory_map[material_code]["current_stock"] += base_qty
                # 库龄取最大值（最老的库存）
                inventory_map[material_code]["storage_days"] = max(
                    inventory_map[material_code]["storage_days"],
                    storage_days
                )
            else:
                inventory_map[material_code] = {
                    "material_code": material_code,
                    "current_stock": base_qty,
                    "available_stock": available_qty,
                    "storage_days": storage_days,
                    "unit_price": float(item.get("unit_price", 0) or 0)
                }

        logger.info(f"加载完成: {len(inventory_map)} 个物料的库存")
        return inventory_map

    def _calculate_storage_days(self, batch_no: str) -> int:
        """从批次号计算库龄"""
        if not batch_no or not batch_no.startswith("202"):
            return 0

        try:
            # 提取日期部分（前8位：YYYYMMDD）
            date_str = batch_no[:8]
            inbound_date = datetime.strptime(date_str, "%Y%m%d")
            today = datetime.now()
            delta = today - inbound_date
            return delta.days
        except Exception as e:
            logger.warning(f"解析批次号失败: {batch_no}, {e}")
            return 0

    def _calculate_stock_status(self, storage_days: int, available_stock: float) -> StockStatus:
        """计算库存状态"""
        if available_stock <= 0:
            return StockStatus.INSUFFICIENT
        if storage_days >= 90:
            return StockStatus.STAGNANT
        if storage_days >= 60:
            return StockStatus.WARNING
        return StockStatus.SUFFICIENT

    def parse_substitution_relations(self, boms: List[Dict]) -> Dict[str, Dict]:
        """解析替代料关系"""
        relations = {}

        # 按 parent_code + alt_group_no 分组
        groups = {}
        for bom in boms:
            if not bom["alt_group_no"]:
                continue

            key = f"{bom['parent_code']}_{bom['alt_group_no']}"
            if key not in groups:
                groups[key] = []
            groups[key].append(bom)

        # 识别主料和替代料
        for key, items in groups.items():
            # 主料：alt_part为空
            primary = next((item for item in items if not item["alt_part"]), None)

            # 替代料：alt_part="替代"
            substitutes = [
                item for item in items
                if item["alt_part"] == "替代"
            ]

            if primary and substitutes:
                # 按优先级排序
                substitutes.sort(key=lambda x: x["alt_priority"])

                relation_key = f"{primary['parent_code']}_{primary['child_code']}"
                relations[relation_key] = {
                    "primary": primary,
                    "substitutes": substitutes
                }

        logger.info(f"解析替代料关系: {len(relations)} 组")
        return relations

    async def build_bom_tree(
        self,
        product_code: str,
        products: List[Dict],
        materials: List[Dict],
        boms: List[Dict],
        inventory_map: Dict[str, Dict],
        substitution_relations: Dict[str, Dict]
    ) -> BOMTreeResponse:
        """构建BOM树"""
        logger.info(f"构建BOM树: {product_code}")

        # 查找产品信息
        product = next((p for p in products if p["material_code"] == product_code), None)
        if not product:
            raise HTTPException(status_code=404, detail=f"产品不存在: {product_code}")

        # 构建物料信息映射（包含MOQ）
        material_map = {m["material_code"]: m for m in materials + products}

        # 递归构建树
        def build_node(code: str, quantity: float, level: int, visited: set) -> BOMNodeResponse:
            if code in visited:
                logger.warning(f"检测到循环引用: {code}")
                return None

            visited.add(code)

            # 获取物料信息
            material = material_map.get(code, {})
            inventory = inventory_map.get(code, {})

            # 查找子节点
            children_boms = [
                b for b in boms
                if b["parent_code"] == code and b["alt_part"] != "替代"
            ]

            # 递归构建子节点
            children = []
            for child_bom in children_boms:
                child_node = build_node(
                    child_bom["child_code"],
                    child_bom["child_quantity"],
                    level + 1,
                    visited.copy()
                )
                if child_node:
                    children.append(child_node)

            # 处理替代料
            substitutes = []
            relation_key = f"{code}_{code}"  # 简化处理
            if relation_key in substitution_relations:
                relation = substitution_relations[relation_key]
                for sub in relation["substitutes"]:
                    sub_inventory = inventory_map.get(sub["child_code"], {})
                    substitutes.append({
                        "code": sub["child_code"],
                        "name": sub["child_name"],
                        "quantity": sub["child_quantity"],
                        "priority": sub["alt_priority"],
                        "ratio": sub["child_quantity"] / quantity if quantity else 1,
                        "current_stock": sub_inventory.get("current_stock", 0),
                        "available_stock": sub_inventory.get("available_stock", 0)
                    })

            # 创建节点
            storage_days = inventory.get("storage_days", 0)
            available_stock = inventory.get("available_stock", 0)

            return BOMNodeResponse(
                code=code,
                name=material.get("material_name", code),
                level=level,
                quantity=quantity,
                unit=material.get("baseunit_name", "个"),
                current_stock=inventory.get("current_stock", 0),
                available_stock=available_stock,
                stock_status=self._calculate_stock_status(storage_days, available_stock),
                storage_days=storage_days,
                unit_price=inventory.get("unit_price", 0),
                moq=material.get("moq"),
                children=children,
                substitutes=substitutes
            )

        # 构建根节点
        root_node = build_node(product_code, 1, 0, set())

        # 统计信息
        total_materials = 0
        total_inventory_value = 0
        stagnant_count = 0
        insufficient_count = 0

        def count_stats(node: BOMNodeResponse):
            nonlocal total_materials, total_inventory_value, stagnant_count, insufficient_count

            total_materials += 1
            total_inventory_value += node.current_stock * node.unit_price

            if node.stock_status == StockStatus.STAGNANT:
                stagnant_count += 1
            if node.stock_status == StockStatus.INSUFFICIENT:
                insufficient_count += 1

            for child in node.children:
                count_stats(child)

        count_stats(root_node)

        return BOMTreeResponse(
            product_code=product_code,
            product_name=product.get("material_name", product_code),
            root_node=root_node,
            statistics=BOMStatistics(
                total_materials=total_materials,
                total_inventory_value=total_inventory_value,
                stagnant_count=stagnant_count,
                insufficient_count=insufficient_count
            )
        )


# ============================================================================
# API路由
# ============================================================================

@app.post("/api/bom/calculate/tree", response_model=Dict)
async def calculate_bom_tree(
    request: BOMTreeRequest,
    authorization: Optional[str] = Header(None)
):
    """
    获取产品BOM树

    - **product_codes**: 产品编码列表
    - **include_substitutes**: 是否包含替代料
    - **cache**: 是否使用缓存
    """
    start_time = datetime.now()

    try:
        # 提取Token
        token = authorization.replace("Bearer ", "") if authorization else ""

        async with OntologyAPIClient("https://dip.aishu.cn", token) as client:
            service = BOMCalculatorService(client, request.knowledge_network_id)

            # 加载所有数据
            products, materials = await service.load_materials()
            boms = await service.load_boms()
            inventory_map = await service.load_inventory()
            substitution_relations = service.parse_substitution_relations(boms)

            # 构建BOM树
            trees = []
            for product_code in request.product_codes:
                tree = await service.build_bom_tree(
                    product_code,
                    products,
                    materials,
                    boms,
                    inventory_map,
                    substitution_relations
                )
                trees.append(tree)

        processing_time = (datetime.now() - start_time).total_seconds() * 1000

        return {
            "code": 0,
            "message": "success",
            "data": {
                "trees": [t.dict() for t in trees],
                "cache_hit": False,
                "processing_time_ms": int(processing_time)
            }
        }

    except Exception as e:
        logger.error(f"BOM树构建失败: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/bom/calculate/production-analysis", response_model=Dict)
async def calculate_production_analysis(
    request: ProductionAnalysisRequest,
    authorization: Optional[str] = Header(None)
):
    """
    MRP生产数量分析

    计算不同生产数量下的成本分析（补货、采购、呆滞）
    """
    start_time = datetime.now()

    # TODO: 实现MRP计算逻辑
    # 这里需要实现完整的Netting Logic算法

    return {
        "code": 0,
        "message": "success",
        "data": {
            "product_code": request.product_code,
            "message": "MRP分析功能开发中..."
        }
    }


@app.get("/api/health")
async def health_check():
    """健康检查"""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "version": "1.0.0"
    }


# ============================================================================
# 应用启动
# ============================================================================

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "bom_calculator_api:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
