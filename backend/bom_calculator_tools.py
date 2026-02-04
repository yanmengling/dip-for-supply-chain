"""
BOM计算器工具函数
符合OpenAI Function Calling协议的工具实现

这些函数可以被后端系统注册为AI Agent可调用的工具
"""

import httpx
import json
from typing import List, Dict, Any, Optional, Tuple
from datetime import datetime
import logging
from collections import defaultdict

logger = logging.getLogger(__name__)

# ============================================================================
# 配置常量
# ============================================================================

ONTOLOGY_BASE_URL = "https://dip.aishu.cn"
DEFAULT_NETWORK_ID = "supplychain_hd0202"

# 对象类型ID
OBJECT_TYPES = {
    "product": "supplychain_hd0202_product",
    "material": "supplychain_hd0202_material",
    "bom": "supplychain_hd0202_bom",
    "inventory": "supplychain_hd0202_inventory"
}


# ============================================================================
# 数据获取函数
# ============================================================================

async def fetch_ontology_data(
    network_id: str,
    object_type_id: str,
    api_token: str,
    limit: int = 5000
) -> List[Dict]:
    """从Ontology API获取数据（支持分页）"""
    url = f"{ONTOLOGY_BASE_URL}/api/ontology-query/v1/knowledge-networks/{network_id}/object-types/{object_type_id}"

    headers = {"Authorization": f"Bearer {api_token}"}
    params = {
        "include_type_info": "true",
        "include_logic_params": "false",
        "limit": limit
    }

    all_data = []
    search_after = None
    page = 1

    async with httpx.AsyncClient(timeout=120.0) as client:
        while True:
            if search_after:
                params["search_after"] = json.dumps(search_after)

            logger.info(f"获取 {object_type_id} 第{page}页...")
            response = await client.get(url, headers=headers, params=params)
            response.raise_for_status()

            data = response.json()
            entries = data.get("entries", [])

            if not entries:
                break

            all_data.extend(entries)
            logger.info(f"第{page}页: {len(entries)} 条，累计: {len(all_data)} 条")

            search_after = data.get("search_after")
            if not search_after or len(entries) < limit:
                break

            page += 1

    return all_data


# ============================================================================
# 数据处理辅助函数
# ============================================================================

def calculate_storage_days(batch_no: str) -> int:
    """从批次号计算库龄"""
    if not batch_no or not batch_no.startswith("202"):
        return 0

    try:
        date_str = batch_no[:8]
        inbound_date = datetime.strptime(date_str, "%Y%m%d")
        today = datetime.now()
        return (today - inbound_date).days
    except Exception as e:
        logger.warning(f"解析批次号失败: {batch_no}, {e}")
        return 0


def calculate_stock_status(storage_days: int, available_stock: float) -> str:
    """计算库存状态"""
    if available_stock <= 0:
        return "insufficient"
    if storage_days >= 90:
        return "stagnant"
    if storage_days >= 60:
        return "warning"
    return "sufficient"


def parse_substitution_relations(boms: List[Dict]) -> Dict[str, Dict]:
    """解析替代料关系"""
    relations = {}
    groups = defaultdict(list)

    # 按 parent_code + alternative_group 分组
    for bom in boms:
        alt_group = bom.get("alternative_group", "")
        if not alt_group:
            continue

        key = f"{bom['parent_code']}_{alt_group}"
        groups[key].append(bom)

    # 识别主料和替代料
    for key, items in groups.items():
        # 主料：alternative_part为空
        primary = next((item for item in items if not item.get("alternative_part")), None)

        # 替代料：alternative_part="替代"
        substitutes = [item for item in items if item.get("alternative_part") == "替代"]

        if primary and substitutes:
            relation_key = f"{primary['parent_code']}_{primary['child_code']}"
            relations[relation_key] = {
                "primary": primary,
                "substitutes": substitutes
            }

    logger.info(f"解析替代料关系: {len(relations)} 组")
    return relations


# ============================================================================
# 核心工具函数1: BOM树计算
# ============================================================================

async def calculate_bom_tree(
    product_codes: List[str],
    knowledge_network_id: str = DEFAULT_NETWORK_ID,
    include_substitutes: bool = True,
    api_token: str = None
) -> Dict[str, Any]:
    """
    计算产品BOM树结构

    参数:
        product_codes: 产品编码列表
        knowledge_network_id: 知识网络ID
        include_substitutes: 是否包含替代料
        api_token: API认证Token

    返回:
        包含BOM树结构和统计信息的字典
    """
    start_time = datetime.now()

    if not api_token:
        raise ValueError("api_token is required")

    # 1. 并行获取所有数据
    logger.info("开始获取数据...")
    products_data, materials_data, boms_data, inventory_data = await asyncio.gather(
        fetch_ontology_data(knowledge_network_id, OBJECT_TYPES["product"], api_token),
        fetch_ontology_data(knowledge_network_id, OBJECT_TYPES["material"], api_token),
        fetch_ontology_data(knowledge_network_id, OBJECT_TYPES["bom"], api_token),
        fetch_ontology_data(knowledge_network_id, OBJECT_TYPES["inventory"], api_token)
    )

    # 2. 构建索引
    logger.info("构建数据索引...")

    # 产品索引
    product_map = {p.get("product_code"): p for p in products_data}

    # 物料索引（包含MOQ等信息）
    material_map = {}
    for m in materials_data:
        code = m.get("material_code") or m.get("number", "")
        if code:
            material_map[code] = {
                "name": m.get("material_name") or m.get("name", ""),
                "moq": int(m.get("purchase_huid_minlotsize", 0) or 0),
                "unit_price": float(m.get("unit_price", 0) or 0),
                "unit": m.get("baseunit_name", "个")
            }

    # 库存索引（多仓库聚合）
    inventory_map = defaultdict(lambda: {
        "current_stock": 0,
        "available_stock": 0,
        "storage_days": 0,
        "unit_price": 0
    })

    for inv in inventory_data:
        code = inv.get("material_code") or inv.get("item_code", "")
        if not code:
            continue

        available_qty = float(inv.get("available_quantity") or inv.get("available_base_qty", 0) or 0)
        base_qty = float(inv.get("quantity") or inv.get("base_qty", 0) or 0)
        storage_days = calculate_storage_days(inv.get("batch_no", ""))

        inventory_map[code]["current_stock"] += base_qty
        inventory_map[code]["available_stock"] += available_qty
        inventory_map[code]["storage_days"] = max(
            inventory_map[code]["storage_days"],
            storage_days
        )
        inventory_map[code]["unit_price"] = float(inv.get("unit_price", 0) or 0)

    # BOM关系索引
    bom_children = defaultdict(list)
    for bom in boms_data:
        parent = bom.get("parent_code", "")
        if parent and bom.get("alternative_part") != "替代":
            bom_children[parent].append({
                "child_code": bom.get("child_code", ""),
                "child_name": bom.get("child_name", ""),
                "child_quantity": float(bom.get("child_quantity") or bom.get("quantity", 1) or 1),
                "unit": bom.get("unit", "个"),
                "alternative_group": bom.get("alternative_group", "")
            })

    # 替代料关系
    substitution_relations = parse_substitution_relations(boms_data) if include_substitutes else {}

    # 3. 构建BOM树
    logger.info("构建BOM树...")
    trees = []

    def build_node(code: str, quantity: float, level: int, visited: set) -> Dict:
        """递归构建BOM节点"""
        if code in visited:
            return None

        visited.add(code)

        # 获取物料和库存信息
        material = material_map.get(code, {})
        inventory = inventory_map.get(code, {})

        # 构建子节点
        children = []
        for child_bom in bom_children.get(code, []):
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
        if include_substitutes:
            relation_key = f"{code}_{code}"
            relation = substitution_relations.get(relation_key)
            if relation:
                for sub in relation["substitutes"]:
                    sub_inv = inventory_map.get(sub["child_code"], {})
                    substitutes.append({
                        "code": sub["child_code"],
                        "name": sub["child_name"],
                        "quantity": sub["child_quantity"],
                        "ratio": sub["child_quantity"] / quantity if quantity else 1,
                        "current_stock": sub_inv["current_stock"],
                        "available_stock": sub_inv["available_stock"]
                    })

        # 构建节点
        storage_days = inventory.get("storage_days", 0)
        available_stock = inventory.get("available_stock", 0)

        return {
            "code": code,
            "name": material.get("name", code),
            "level": level,
            "quantity": quantity,
            "unit": material.get("unit", "个"),
            "current_stock": inventory.get("current_stock", 0),
            "available_stock": available_stock,
            "stock_status": calculate_stock_status(storage_days, available_stock),
            "storage_days": storage_days,
            "unit_price": inventory.get("unit_price", 0),
            "moq": material.get("moq"),
            "children": children,
            "substitutes": substitutes
        }

    # 为每个产品构建BOM树
    for product_code in product_codes:
        product = product_map.get(product_code)
        if not product:
            logger.warning(f"产品不存在: {product_code}")
            continue

        root_node = build_node(product_code, 1, 0, set())

        # 统计信息
        total_materials = 0
        total_inventory_value = 0
        stagnant_count = 0
        insufficient_count = 0

        def count_stats(node: Dict):
            nonlocal total_materials, total_inventory_value, stagnant_count, insufficient_count

            total_materials += 1
            total_inventory_value += node["current_stock"] * node["unit_price"]

            if node["stock_status"] == "stagnant":
                stagnant_count += 1
            if node["stock_status"] == "insufficient":
                insufficient_count += 1

            for child in node.get("children", []):
                count_stats(child)

        if root_node:
            count_stats(root_node)

        trees.append({
            "product_code": product_code,
            "product_name": product.get("product_name", product_code),
            "root_node": root_node,
            "statistics": {
                "total_materials": total_materials,
                "total_inventory_value": total_inventory_value,
                "stagnant_count": stagnant_count,
                "insufficient_count": insufficient_count
            }
        })

    processing_time = (datetime.now() - start_time).total_seconds() * 1000

    return {
        "trees": trees,
        "processing_time_ms": int(processing_time)
    }


# ============================================================================
# 核心工具函数2: MRP生产分析
# ============================================================================

async def calculate_mrp_production_analysis(
    product_code: str,
    knowledge_network_id: str = DEFAULT_NETWORK_ID,
    max_quantity: Optional[int] = None,
    sample_points: int = 15,
    include_moq_analysis: bool = True,
    api_token: str = None
) -> Dict[str, Any]:
    """
    MRP生产数量分析

    基于Netting Logic计算不同生产数量下的成本

    参数:
        product_code: 产品编码
        knowledge_network_id: 知识网络ID
        max_quantity: 最大生产数量（自动计算）
        sample_points: 采样点数量
        include_moq_analysis: 是否包含MOQ分析
        api_token: API认证Token

    返回:
        包含成本曲线和关键指标的字典
    """
    start_time = datetime.now()

    # 注意：完整实现需要先调用 calculate_bom_tree 获取BOM结构
    # 然后实现 MRP Netting Logic 算法
    # 这里提供框架，完整实现见文档

    logger.info(f"MRP分析: {product_code}")

    # TODO: 实现完整的MRP计算逻辑
    # 1. 获取BOM树
    # 2. 实现Netting Logic
    # 3. 计算成本曲线
    # 4. 找平衡点
    # 5. 生成分析结论

    processing_time = (datetime.now() - start_time).total_seconds() * 1000

    return {
        "product_code": product_code,
        "product_name": "待实现",
        "production_quantities": [],
        "without_moq": {
            "replenishment_costs": [],
            "new_procurement_costs": [],
            "new_stagnant_costs": []
        },
        "with_moq": {
            "replenishment_costs": [],
            "new_procurement_costs": [],
            "new_stagnant_costs": []
        },
        "key_metrics": {
            "max_producible_without_purchase": 0,
            "cross_point_quantity": 0,
            "cross_point_value": 0,
            "total_inventory_value": 0
        },
        "top_expensive_materials": [],
        "analysis_conclusions": [
            "MRP分析功能开发中，请参考文档完成实现"
        ],
        "processing_time_ms": int(processing_time)
    }


# ============================================================================
# 工具注册配置
# ============================================================================

# 导出工具列表（供后端系统注册）
BOM_CALCULATOR_TOOLS = [
    {
        "name": "calculate_bom_tree",
        "function": calculate_bom_tree,
        "schema_file": "bom_calculator_tool_schema.json"
    },
    {
        "name": "calculate_mrp_production_analysis",
        "function": calculate_mrp_production_analysis,
        "schema_file": "mrp_analysis_tool_schema.json"
    }
]


# ============================================================================
# 测试函数
# ============================================================================

async def test_tool():
    """测试工具函数"""
    import os

    api_token = os.getenv("ONTOLOGY_API_TOKEN", "")

    if not api_token:
        print("请设置环境变量 ONTOLOGY_API_TOKEN")
        return

    # 测试BOM树计算
    result = await calculate_bom_tree(
        product_codes=["PROD001"],
        api_token=api_token
    )

    print(json.dumps(result, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    import asyncio
    asyncio.run(test_tool())
