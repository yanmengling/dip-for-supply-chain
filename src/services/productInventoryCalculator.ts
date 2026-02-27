/**
 * 产品库存计算服务
 * 
 * 基于产品BOM和物料库存数据，智能计算可组装的产品数量
 */

import { ontologyApi } from '../api/ontologyApi';
import { apiConfigService } from './apiConfigService';

// ============================================================================
// 类型定义
// ============================================================================

/** BOM项 */
export interface BOMItem {
    bomNumber: string;
    parentCode: string;
    parentName: string;
    childCode: string;
    childName: string;
    childQuantity: number;
    unit: string;
    lossRate: number;
    alternativeGroup?: string;
}

/** 物料库存 */
export interface MaterialInventory {
    materialCode: string;
    materialName: string;
    inventoryData: number;
    availableQuantity: number;
    safetyStock: number;
    lastInboundTime: string;
    inventoryAge: number;
    updateTime: string;
}

/** 产品信息 */
export interface ProductInfo {
    productCode: string;
    productName: string;
    productModel: string;
    productSeries: string;
    productType: string;
    amount: number;
}

/** 产品库存计算结果 */
export interface ProductInventoryResult {
    productCode: string;
    productName: string;
    calculatedStock: number;
    bottleneckMaterial?: {
        code: string;
        name: string;
        required: number;
        available: number;
    };
    details: {
        materialCode: string;
        materialName: string;
        required: number;
        available: number;
        canMake: number;
        isAlternative?: boolean;
        groupId?: string;
    }[];
}

// ============================================================================
// ============================================================================


// ============================================================================
// ============================================================================

/**
 * 加载产品BOM数据
 */
export async function loadBOMData(): Promise<BOMItem[]> {
    try {
        const objectTypeId = apiConfigService.getOntologyObjectByEntityType('bom')?.objectTypeId || '';
        const response = await ontologyApi.queryObjectInstances(objectTypeId, { limit: 5000 });
        const rawData = response.entries || [];

        return rawData.map(item => {
            const parentCode = item.parent_code ?? item.parentCode ?? item.parent_id ?? item.parentId ?? '';
            const childCode = item.child_code ?? item.childCode ?? item.child_id ?? item.childId ?? '';

            return {
                bomNumber: item.bom_number ?? item.bomNumber ?? '',
                parentCode: String(parentCode),
                parentName: item.parent_name ?? item.parentName ?? '',
                childCode: String(childCode),
                childName: item.child_name ?? item.childName ?? '',
                childQuantity: parseFloat(item.child_quantity ?? item.childQuantity ?? 0),
                unit: item.unit ?? '',
                lossRate: parseFloat(item.loss_rate ?? item.lossRate ?? 0),
                alternativeGroup: String(item.alternative_group ?? item.alternativeGroup ?? ''),
            };
        });
    } catch (error) {
        console.error('[Product Inventory] Failed to load BOM data from Ontology:', error);
        throw new Error(`Failed to load BOM data: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 加载库存数据
 */
export async function loadInventoryData(): Promise<MaterialInventory[]> {
    try {
        const objectTypeId = apiConfigService.getOntologyObjectByEntityType('inventory')?.objectTypeId || '';
        const response = await ontologyApi.queryObjectInstances(objectTypeId, { limit: 2000 });
        const rawData = response.entries || [];

        return rawData.map(item => {
            const materialCode = item.material_code ?? item.item_code ?? item.materialCode ?? item.itemCode ?? item.item_id ?? item.itemId ?? '';

            // 优先使用 inventory_data，必须显式检查 undefined/null 以免 0 被忽略
            let qty = 0;
            if (item.inventory_data !== undefined && item.inventory_data !== null) qty = parseFloat(item.inventory_data);
            else if (item.inventoryData !== undefined && item.inventoryData !== null) qty = parseFloat(item.inventoryData);
            else if (item.available_quantity !== undefined && item.available_quantity !== null) qty = parseFloat(item.available_quantity);
            else if (item.quantity !== undefined && item.quantity !== null) qty = parseFloat(item.quantity);
            else if (item.currentStock !== undefined && item.currentStock !== null) qty = parseFloat(item.currentStock);

            return {
                materialCode: String(materialCode),
                materialName: item.material_name ?? item.item_name ?? item.materialName ?? item.itemName ?? '',
                inventoryData: qty,
                availableQuantity: qty,
                safetyStock: parseFloat(item.safety_stock ?? item.safetyStock ?? 0),
                lastInboundTime: item.last_inbound_time ?? item.lastInboundTime ?? '',
                inventoryAge: parseInt(item.inventory_age ?? item.inventoryAge ?? 0),
                updateTime: item.update_time ?? item.updateTime ?? '',
            };
        });
    } catch (error) {
        console.error('[Product Inventory] Failed to load inventory data from Ontology:', error);
        throw new Error(`Failed to load inventory data: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 加载产品信息
 */
export async function loadProductData(): Promise<ProductInfo[]> {
    try {
        const objectTypeId = apiConfigService.getOntologyObjectByEntityType('product')?.objectTypeId || '';
        const response = await ontologyApi.queryObjectInstances(objectTypeId, { limit: 1000 });
        const rawData = response.entries || [];

        return rawData.map(item => {
            const productCode = item.material_number ?? item.product_code ?? item.item_code ?? item.productCode ?? item.itemCode ?? item.product_id ?? item.item_id ?? item.productId ?? item.itemId ?? item.code ?? '';

            return {
                productCode: String(productCode),
                productName: item.material_name ?? item.product_name ?? item.item_name ?? item.productName ?? item.itemName ?? item.name ?? '',
                productModel: item.product_model ?? item.productModel ?? item.model ?? '',
                productSeries: item.product_series ?? item.productSeries ?? item.series ?? '',
                productType: item.product_type ?? item.productType ?? item.type ?? '',
                amount: parseFloat(item.amount ?? 0),
            };
        });
    } catch (error) {
        console.error('[Product Inventory] Failed to load product data from Ontology:', error);
        throw new Error(`Failed to load product data: ${error instanceof Error ? error.message : String(error)}`);
    }
}

// ============================================================================
// 计算函数
// ============================================================================

/**
 * 计算单个产品的库存（支持递归和替代料）
 * 
 * @param productCode 产品代码
 * @param bomData 全量BOM数据
 * @param inventoryData 仓库物料库存数据
 * @param cache 递归缓存
 */
export function calculateProductInventory(
    productCode: string,
    productName: string,
    bomData: BOMItem[],
    inventoryData: MaterialInventory[],
    cache: Map<string, number> = new Map()
): ProductInventoryResult {
    // 1. 检查缓存，防止循环依赖
    if (cache.has(productCode)) {
        return {
            productCode,
            productName,
            calculatedStock: cache.get(productCode) || 0,
            details: [],
        };
    }

    // 2. 获取该产品的直接库存（某些产品可能既是产成品也是库存商品）
    const directInventory = inventoryData.find(inv => inv.materialCode === productCode);
    const directStock = directInventory?.availableQuantity || 0;

    // 3. 获取该产品的所有BOM项
    const productBOM = bomData.filter(item => item.parentCode === productCode);

    if (productBOM.length === 0) {
        // 如果没有BOM，则该项为纯物料，库存即为直接库存
        cache.set(productCode, directStock);
        return {
            productCode,
            productName,
            calculatedStock: directStock,
            details: [],
        };
    }

    // 将自己加入缓存（初始化为0，处理循环引用）
    cache.set(productCode, 0);

    // 4. 按替代组分组合 BOM 项
    // 如果 alternativeGroup 为空或无效，则每项自成一组（必选件）
    const groups: Record<string, BOMItem[]> = {};
    const mandatoryItems: BOMItem[] = [];

    productBOM.forEach(item => {
        if (item.alternativeGroup && item.alternativeGroup !== '' && item.alternativeGroup !== '0') {
            if (!groups[item.alternativeGroup]) groups[item.alternativeGroup] = [];
            groups[item.alternativeGroup].push(item);
        } else {
            mandatoryItems.push(item);
        }
    });

    const analysisDetails: any[] = [];
    let minAssembledStock = Infinity;
    let bottleneck: any = undefined;

    // 5. 计算必选件的支持能力
    for (const item of mandatoryItems) {
        // 递归计算子件的可用数量
        const childResult = calculateProductInventory(item.childCode, item.childName, bomData, inventoryData, cache);
        const childAvailable = childResult.calculatedStock;
        const canMake = item.childQuantity > 0 ? Math.floor(childAvailable / item.childQuantity) : 0;

        analysisDetails.push({
            materialCode: item.childCode,
            materialName: item.childName,
            required: item.childQuantity,
            available: childAvailable,
            canMake,
        });

        if (canMake < minAssembledStock) {
            minAssembledStock = canMake;
            bottleneck = {
                code: item.childCode,
                name: item.childName,
                required: item.childQuantity,
                available: childAvailable,
            };
        }
    }

    // 6. 计算替代组的支持能力（组内平级求和）
    for (const groupId in groups) {
        const groupItems = groups[groupId];
        let totalGroupCanMake = 0;

        // 替代组逻辑：组内任何一个子件可用都可以制造产品
        // 实际上是 SUM(可用量 / 需求量)
        groupItems.forEach(item => {
            const childResult = calculateProductInventory(item.childCode, item.childName, bomData, inventoryData, cache);
            const childAvailable = childResult.calculatedStock;
            const itemCanMake = item.childQuantity > 0 ? childAvailable / item.childQuantity : 0;
            totalGroupCanMake += itemCanMake;

            analysisDetails.push({
                materialCode: item.childCode,
                materialName: item.childName,
                required: item.childQuantity,
                available: childAvailable,
                canMake: Math.floor(itemCanMake),
                isAlternative: true,
                groupId,
            });
        });

        const floorGroupCanMake = Math.floor(totalGroupCanMake);
        if (floorGroupCanMake < minAssembledStock) {
            minAssembledStock = floorGroupCanMake;
            // 找出组内库存最少的作为瓶颈（简化处理）
            bottleneck = {
                code: `GROUP-${groupId}`,
                name: `替代组 ${groupId}`,
                required: 1,
                available: floorGroupCanMake,
            };
        }
    }

    const assembledStock = minAssembledStock === Infinity ? 0 : minAssembledStock;
    const totalCalculatedStock = directStock + assembledStock;

    // 更新准确的缓存
    cache.set(productCode, totalCalculatedStock);

    return {
        productCode,
        productName,
        calculatedStock: totalCalculatedStock,
        bottleneckMaterial: bottleneck,
        details: analysisDetails,
    };
}

/**
 * 计算所有产品的库存
 */
export async function calculateAllProductInventory(): Promise<ProductInventoryResult[]> {
    const [bomData, inventoryData, productData] = await Promise.all([
        loadBOMData(),
        loadInventoryData(),
        loadProductData(),
    ]);



    const globalCache = new Map<string, number>();
    const results = productData.map(product =>
        calculateProductInventory(
            product.productCode,
            product.productName,
            bomData,
            inventoryData,
            globalCache
        )
    );

    // 计算总库存
    const totalStock = results.reduce((sum, r) => sum + r.calculatedStock, 0);


    return results;
}
