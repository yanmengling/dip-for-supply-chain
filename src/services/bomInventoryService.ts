/**
 * BOM库存分析服务
 * 
 * 负责加载产品、BOM、库存数据，构建BOM树，解析替代料关系
 * 
 * 数据源:
 * - 产品信息: /proxy-metric/v1/data-views/2004376134620897282
 * - 产品BOM信息: /proxy-metric/v1/data-views/2004376134629285892
 * - 库存信息: /proxy-metric/v1/data-views/2004376134625091585
 */


// ============================================================================
// 类型定义
// ============================================================================

/** 目标产品列表 */
export const TARGET_PRODUCTS = ['T01-000055', 'T01-000167', 'T01-000173'];

import { ontologyApi } from '../api/ontologyApi';
import { apiConfigService } from './apiConfigService';

/**
 * 获取对象类型ID配置
 */
/**
 * 获取对象类型ID配置
 */
const getObjectTypeId = (entityType: string, defaultId: string) => {
    // 优先尝试从配置服务获取
    let configuredId = '';

    switch (entityType) {
        case 'product':
            configuredId = apiConfigService.getOntologyObjectId('oo_product') || '';
            break;
        case 'bom':
            configuredId = apiConfigService.getOntologyObjectId('oo_bom') || '';
            break;
        case 'inventory':
            configuredId = apiConfigService.getOntologyObjectId('oo_inventory') || '';
            break;
        case 'material':
            configuredId = apiConfigService.getOntologyObjectId('oo_material') || '';
            break;
    }

    if (configuredId) {
        console.log(`[BOM服务] 使用配置的对象ID: ${entityType} -> ${configuredId}`);
        return configuredId;
    }

    const config = apiConfigService.getOntologyObjectByEntityType(entityType);
    if (config?.objectTypeId) {
        console.log(`[BOM服务] 使用配置的对象ID (by EntityType): ${entityType} -> ${config.objectTypeId}`);
        return config.objectTypeId;
    }

    console.warn(`[BOM服务] 未找到配置的对象ID，使用默认值: ${entityType} -> ${defaultId}`);
    return defaultId;
};

// 默认ID作为后备 (仍保留作为最后的FallBack)
const DEFAULT_IDS = {
    products: 'd56v4ue9olk4bpa66v00',
    bom: 'd56vqtm9olk4bpa66vfg',
    inventory: 'd56vcuu9olk4bpa66v3g',
    materials: 'd56voju9olk4bpa66vcg',
};

// ============================================================================
// 数据加载
// ============================================================================

/**
 * 加载产品信息
 */
export async function loadProductData(): Promise<ProductRaw[]> {
    try {
        console.log('[BOM服务] 加载产品信息...');
        const objectTypeId = getObjectTypeId('product', DEFAULT_IDS.products);

        // 使用 Ontology API
        const response = await ontologyApi.queryObjectInstances(objectTypeId, {
            limit: 100,
            include_type_info: true,
            include_logic_params: false
        });

        const rawData = response.entries || [];

        if (!Array.isArray(rawData)) {
            console.warn('[BOM服务] 产品数据格式异常');
            return [];
        }

        const products = rawData.map((item: any) => ({
            product_code: String(item.product_code || '').trim(),
            product_name: item.product_name || '',
            product_model: item.product_model || '',
            product_series: item.product_series || '',
            product_type: item.product_type || '',
            amount: parseFloat(item.amount) || 0,
        }));

        console.log('[BOM服务] 加载产品:', products.length, '个');
        return products;
    } catch (error) {
        console.error('[BOM服务] 加载产品信息失败:', error);
        return [];
    }
}

/**
 * 加载BOM数据
 */
export async function loadBOMData(): Promise<BOMRaw[]> {
    try {
        console.log('[BOM服务] 加载BOM数据...');
        const objectTypeId = getObjectTypeId('bom', DEFAULT_IDS.bom);
        // 使用 Ontology API
        let response;
        try {
            response = await ontologyApi.queryObjectInstances(objectTypeId, {
                limit: 5000,
                include_type_info: true,
                include_logic_params: false
            });
        } catch (firstError) {
            console.warn('[BOM服务] BOM数据加载失败，尝试缩减规模回退...', firstError);
            response = await ontologyApi.queryObjectInstances(objectTypeId, {
                limit: 1000,
                include_type_info: false,
                include_logic_params: false
            });
        }

        const rawData = response.entries || [];

        if (!Array.isArray(rawData)) {
            console.warn('[BOM服务] BOM数据格式异常');
            return [];
        }

        const boms = rawData.map((item: any) => ({
            bom_number: item.bom_number || '',
            parent_code: String(item.parent_code || '').trim(),
            parent_name: item.parent_name || '',
            child_code: String(item.child_code || '').trim(),
            child_name: item.child_name || '',
            child_quantity: parseFloat(item.quantity || item.child_quantity) || 0,
            unit: item.unit || '个',
            loss_rate: parseFloat(item.loss_rate) || 0,
            alternative_group: String(item.alternative_group ?? ''),
            alternative_part: String(item.alternative_part ?? ''),
        }));

        console.log('[BOM服务] 加载BOM:', boms.length, '条');
        return boms;
    } catch (error) {
        console.error('[BOM服务] 加载BOM数据失败:', error);
        return [];
    }
}

/**
 * 加载物料信息（含单价）
 */
export async function loadMaterialData(): Promise<Map<string, { name: string; unitPrice: number }>> {
    try {
        console.log('[BOM服务] 加载物料信息...');
        const materialMap = new Map<string, { name: string; unitPrice: number }>();
        const objectTypeId = getObjectTypeId('material', DEFAULT_IDS.materials);

        // 分页获取所有物料，使用 search_after
        const limit = 1000;
        let searchAfter: any[] | undefined = undefined;
        let count = 0;

        while (true) {
            console.log(`[BOM服务] 加载物料分页: count=${count}, limit=${limit}`);
            const response = await ontologyApi.queryObjectInstances(objectTypeId, {
                limit,
                search_after: searchAfter,
                include_type_info: true,
                include_logic_params: false
            });

            const rawData = response.entries || [];

            if (!Array.isArray(rawData) || rawData.length === 0) {
                break;
            }

            rawData.forEach((item: any) => {
                const rawCode = item.material_code || item.item_code || item.code || item['物料编码'] || '';
                const materialCode = String(rawCode).trim();

                if (materialCode && !materialMap.has(materialCode)) {
                    const unitPrice = parseFloat(item.unit_price) ||
                        parseFloat(item.price) ||
                        parseFloat(item['单价']) ||
                        parseFloat(item.standard_price) || 0;

                    materialMap.set(materialCode, {
                        name: item.material_name || item.item_name || item['物料名称'] || '',
                        unitPrice: unitPrice,
                    });
                }
            });

            count += rawData.length;

            if (rawData.length < limit || !response.search_after) {
                break;
            }
            searchAfter = response.search_after;
        }

        console.log('[BOM服务] 加载物料信息完成, 共:', materialMap.size, '条');
        return materialMap;
    } catch (error) {
        console.error('[BOM服务] 加载物料信息失败:', error);
        return new Map();
    }
}

/**
 * 加载库存数据
 */
export async function loadInventoryData(): Promise<Map<string, InventoryRaw>> {
    try {
        console.log('[BOM服务] 加载库存数据...');
        const objectTypeId = getObjectTypeId('inventory', DEFAULT_IDS.inventory);

        const limit = 2000;
        let searchAfter: any[] | undefined = undefined;
        const rawDataAll: any[] = [];
        let count = 0;

        while (true) {
            console.log(`[BOM服务] 加载库存分页: count=${count}, limit=${limit}`);
            const response = await ontologyApi.queryObjectInstances(objectTypeId, {
                limit,
                search_after: searchAfter,
                include_type_info: true,
                include_logic_params: false
            });

            const pageData = response.entries || [];

            if (!Array.isArray(pageData) || pageData.length === 0) {
                break;
            }

            rawDataAll.push(...pageData);
            count += pageData.length;

            if (pageData.length < limit || !response.search_after) {
                break;
            }
            searchAfter = response.search_after;
        }

        const rawData = rawDataAll;

        if (!Array.isArray(rawData)) {
            console.warn('[BOM服务] 库存数据格式异常');
            return new Map();
        }

        // 打印第一条数据的所有字段名
        if (rawData.length > 0) {
            console.log('[BOM服务] 库存数据字段:', Object.keys(rawData[0]));
            if (rawData.length > 5000) {
                console.log(`[BOM服务] 已加载大量库存数据: ${rawData.length} 条`);
            }
        }

        const inventoryMap = new Map<string, InventoryRaw>();

        rawData.forEach((item: any) => {
            // 根据实际API返回的字段名匹配物料编码
            const rawCode = item.item_code || item.material_code || item.code ||
                item['物料编码'] || item.material_id || '';
            const materialCode = String(rawCode).trim();

            if (materialCode) {
                // 根据API返回的字段: inventory_data 是库存量, available_quantity 是可用量
                const stockQuantity = parseFloat(item.inventory_data) ||
                    parseFloat(item.available_quantity) ||
                    parseFloat(item.quantity) ||
                    parseFloat(item.current_stock) || 0;

                // 如果同一物料有多条记录(多仓库)，累加库存
                const existing = inventoryMap.get(materialCode);
                const currentStock = existing ? existing.current_stock + stockQuantity : stockQuantity;

                // 库龄字段: inventory_age 或 max_storage_age
                const storageDays = parseInt(item.inventory_age) ||
                    parseInt(item.max_storage_age) ||
                    parseInt(item.storage_days) || 0;

                inventoryMap.set(materialCode, {
                    material_code: materialCode,
                    material_name: item.item_name || item.material_name || item['物料名称'] || '',
                    current_stock: currentStock,
                    available_stock: parseFloat(item.available_quantity) || currentStock,
                    storage_days: storageDays,
                    unit_price: parseFloat(item.unit_price) || 0,
                    warehouse_name: item.warehouse_name || '',
                });
            }
        });

        console.log('[BOM服务] 加载库存:', inventoryMap.size, '条');

        // 打印几条样例数据验证
        let sampleCount = 0;
        for (const [code, inv] of inventoryMap) {
            if (sampleCount < 5) {
                console.log(`[BOM服务] 库存样例 ${code}: 库存=${inv.current_stock}, 库龄=${inv.storage_days}天`);
                sampleCount++;
            }
        }

        return inventoryMap;
    } catch (error) {
        console.error('[BOM服务] 加载库存数据失败:', error);
        return new Map();
    }
}
export interface ProductRaw {
    product_code: string;
    product_name: string;
    product_model?: string;
    product_series?: string;
    product_type?: string;
    amount?: number;
}

/** 原始BOM数据 */
export interface BOMRaw {
    bom_number: string;
    parent_code: string;
    parent_name: string;
    child_code: string;
    child_name: string;
    child_quantity: number;
    unit: string;
    loss_rate: number;
    alternative_group: string;
    alternative_part: string;
}

/** 原始库存数据 */
export interface InventoryRaw {
    material_code: string;
    material_name?: string;
    current_stock: number;
    available_stock?: number;
    storage_days?: number;
    unit_price?: number;
    warehouse_name?: string;
}

/** 库存状态 */
export type StockStatus = 'sufficient' | 'insufficient' | 'stagnant' | 'unknown';

/** BOM节点 */
export interface BOMNode {
    code: string;
    name: string;
    level: number;
    quantity: number;          // 单耗数量
    unit: string;
    isLeaf: boolean;
    parentCode: string | null;
    children: BOMNode[];

    // 库存信息
    currentStock: number;
    availableStock: number;
    stockStatus: StockStatus;
    storageDays: number;
    unitPrice: number;

    // 替代料信息
    isSubstitute: boolean;
    alternativeGroup: string | null;
    primaryMaterialCode: string | null;
    substitutes: BOMNode[];
}

/** 产品BOM树 */
export interface ProductBOMTree {
    productCode: string;
    productName: string;
    productModel?: string;
    rootNode: BOMNode;
    totalMaterials: number;
    totalInventoryValue: number;
    stagnantCount: number;
    insufficientCount: number;
}

/** 替代料关系 */
interface SubstitutionRelation {
    parentCode: string;
    alternativeGroup: string;
    primaryMaterialCode: string;
    primaryMaterialName: string;
    primaryQuantity: number;
    substitutes: {
        code: string;
        name: string;
        quantity: number;
        ratio: number;
    }[];
}


// ============================================================================
// 替代料解析
// ============================================================================

/**
 * 解析替代料关系
 * 根据 alternative_group 和 alternative_part 字段识别主料和替代料
 */
export function parseSubstitutionRelations(bomData: BOMRaw[]): Map<string, SubstitutionRelation> {
    const relations = new Map<string, SubstitutionRelation>();

    // 按 parent_code + alternative_group 分组
    const groupedByAltGroup = new Map<string, BOMRaw[]>();

    for (const row of bomData) {
        if (row.alternative_group && row.alternative_group.trim() !== '') {
            const groupKey = `${row.parent_code}_${row.alternative_group}`;
            if (!groupedByAltGroup.has(groupKey)) {
                groupedByAltGroup.set(groupKey, []);
            }
            groupedByAltGroup.get(groupKey)!.push(row);
        }
    }

    // 识别主料和替代料
    for (const [groupKey, rows] of groupedByAltGroup) {
        // 主料: alternative_part 为空
        const primary = rows.find(r => !r.alternative_part || String(r.alternative_part).trim() === '');

        // 替代料: alternative_part = "替代"
        const substitutes = rows.filter(r => String(r.alternative_part).trim() === '替代');

        if (primary && substitutes.length > 0) {
            const relation: SubstitutionRelation = {
                parentCode: primary.parent_code,
                alternativeGroup: primary.alternative_group,
                primaryMaterialCode: primary.child_code,
                primaryMaterialName: primary.child_name,
                primaryQuantity: primary.child_quantity,
                substitutes: substitutes.map(sub => ({
                    code: sub.child_code,
                    name: sub.child_name,
                    quantity: sub.child_quantity,
                    ratio: sub.child_quantity / primary.child_quantity,
                })),
            };

            // 使用主料编码作为key，方便查找
            relations.set(`${primary.parent_code}_${primary.child_code}`, relation);
        }
    }

    console.log('[BOM服务] 解析替代料关系:', relations.size, '组');
    return relations;
}

// ============================================================================
// BOM树构建
// ============================================================================

/**
 * 计算库存状态
 */
function calculateStockStatus(storageDays: number, currentStock: number): StockStatus {
    if (currentStock <= 0) {
        return 'insufficient';
    }
    if (storageDays >= 60) {
        return 'stagnant';
    }
    if (storageDays >= 30) {
        return 'insufficient';
    }
    return 'sufficient';
}

/**
 * 递归构建BOM树
 */
function buildBOMTreeRecursive(
    parentCode: string,
    bomData: BOMRaw[],
    inventoryMap: Map<string, InventoryRaw>,
    substitutionRelations: Map<string, SubstitutionRelation>,
    currentQuantity: number,
    level: number,
    visited: Set<string>
): BOMNode[] {
    // 防止循环引用
    if (visited.has(parentCode)) {
        console.warn('[BOM服务] 检测到循环引用:', parentCode);
        return [];
    }
    visited.add(parentCode);

    // 查找当前父级的所有子物料（排除替代料）
    const children = bomData.filter(row =>
        row.parent_code === parentCode &&
        String(row.alternative_part).trim() !== '替代'
    );

    const nodes: BOMNode[] = [];

    for (const child of children) {
        const inventory = inventoryMap.get(child.child_code);
        const currentStock = inventory?.current_stock || 0;
        const storageDays = inventory?.storage_days || 0;

        // 检查是否有替代料
        const substitutionKey = `${parentCode}_${child.child_code}`;
        const substitution = substitutionRelations.get(substitutionKey);

        // 递归构建子节点
        const childNodes = buildBOMTreeRecursive(
            child.child_code,
            bomData,
            inventoryMap,
            substitutionRelations,
            currentQuantity * child.child_quantity,
            level + 1,
            new Set(visited)
        );

        // 构建替代料节点
        const substituteNodes: BOMNode[] = substitution ?
            substitution.substitutes.map(sub => {
                const subInventory = inventoryMap.get(sub.code);
                const subStock = subInventory?.current_stock || 0;
                const subStorageDays = subInventory?.storage_days || 0;

                return {
                    code: sub.code,
                    name: sub.name,
                    level: level + 1,
                    quantity: sub.quantity,
                    unit: child.unit,
                    isLeaf: true,
                    parentCode: parentCode,
                    children: [],
                    currentStock: subStock,
                    availableStock: subInventory?.available_stock || subStock,
                    stockStatus: calculateStockStatus(subStorageDays, subStock),
                    storageDays: subStorageDays,
                    unitPrice: subInventory?.unit_price || 0,
                    isSubstitute: true,
                    alternativeGroup: substitution.alternativeGroup,
                    primaryMaterialCode: child.child_code,
                    substitutes: [],
                };
            }) : [];

        const node: BOMNode = {
            code: child.child_code,
            name: child.child_name,
            level,
            quantity: child.child_quantity,
            unit: child.unit,
            isLeaf: childNodes.length === 0,
            parentCode,
            children: childNodes,
            currentStock,
            availableStock: inventory?.available_stock || currentStock,
            stockStatus: calculateStockStatus(storageDays, currentStock),
            storageDays,
            unitPrice: inventory?.unit_price || 0,
            isSubstitute: false,
            alternativeGroup: substitution?.alternativeGroup || null,
            primaryMaterialCode: null,
            substitutes: substituteNodes,
        };

        nodes.push(node);
    }

    return nodes;
}

/**
 * 构建产品BOM树
 */
export function buildProductBOMTree(
    productCode: string,
    productName: string,
    productModel: string | undefined,
    bomData: BOMRaw[],
    inventoryMap: Map<string, InventoryRaw>,
    substitutionRelations: Map<string, SubstitutionRelation>
): ProductBOMTree {
    console.log(`[BOM服务] 构建产品BOM树: ${productCode}`);

    // 构建根节点
    const children = buildBOMTreeRecursive(
        productCode,
        bomData,
        inventoryMap,
        substitutionRelations,
        1,
        1,
        new Set()
    );

    const inventory = inventoryMap.get(productCode);

    const rootNode: BOMNode = {
        code: productCode,
        name: productName,
        level: 0,
        quantity: 1,
        unit: '套',
        isLeaf: false,
        parentCode: null,
        children,
        currentStock: inventory?.current_stock || 0,
        availableStock: inventory?.available_stock || 0,
        stockStatus: 'unknown',
        storageDays: 0,
        unitPrice: inventory?.unit_price || 0,
        isSubstitute: false,
        alternativeGroup: null,
        primaryMaterialCode: null,
        substitutes: [],
    };

    // 统计信息
    let totalMaterials = 0;
    let totalInventoryValue = 0;
    let stagnantCount = 0;
    let insufficientCount = 0;

    function countStats(node: BOMNode) {
        totalMaterials++;
        totalInventoryValue += node.currentStock * node.unitPrice;
        if (node.stockStatus === 'stagnant') stagnantCount++;
        if (node.stockStatus === 'insufficient') insufficientCount++;

        node.children.forEach(countStats);
        node.substitutes.forEach(sub => {
            totalMaterials++;
            totalInventoryValue += sub.currentStock * sub.unitPrice;
            if (sub.stockStatus === 'stagnant') stagnantCount++;
            if (sub.stockStatus === 'insufficient') insufficientCount++;
        });
    }

    children.forEach(countStats);

    console.log(`[BOM服务] 产品 ${productCode} BOM统计:`, {
        totalMaterials,
        totalInventoryValue: totalInventoryValue.toFixed(2),
        stagnantCount,
        insufficientCount,
    });

    return {
        productCode,
        productName,
        productModel,
        rootNode,
        totalMaterials,
        totalInventoryValue,
        stagnantCount,
        insufficientCount,
    };
}

// ============================================================================
// 主入口函数
// ============================================================================

/**
 * 加载所有数据并构建BOM树
 */
export async function loadAllBOMTrees(): Promise<ProductBOMTree[]> {
    console.log('[BOM服务] 开始加载所有BOM树...');

    // 串行加载数据,避免同时发起多个请求导致服务器500错误
    console.log('[BOM服务] 1/4 加载产品数据...');
    const products = await loadProductData();

    console.log('[BOM服务] 2/4 加载BOM数据...');
    const bomData = await loadBOMData();

    console.log('[BOM服务] 3/4 加载库存数据...');
    const inventoryMap = await loadInventoryData();

    console.log('[BOM服务] 4/4 加载物料数据...');
    const materialMap = await loadMaterialData();

    if (products.length === 0 || bomData.length === 0) {
        console.error('[BOM服务] 数据加载失败，无法构建BOM树');
        return [];
    }

    // 将物料单价合并到库存数据中，并确保所有物料都在inventoryMap中（即使库存为0）
    console.log('[BOM服务] 合并物料单价到库存数据...');
    let priceMatchCount = 0;

    // 1. 先更新已有的库存记录
    for (const [code, inventory] of inventoryMap) {
        const material = materialMap.get(code);
        if (material && material.unitPrice > 0) {
            inventory.unit_price = material.unitPrice;
            priceMatchCount++;
        }
    }

    // 2. 补充那些在物料表中存在，但不在库存表中的记录（即库存为0的物料）
    // 这对生产分析至关重要，因为我们需要知道"缺料"时的采购单价
    let missingCount = 0;
    for (const [code, material] of materialMap) {
        if (!inventoryMap.has(code)) {
            // 创建一个库存为0的虚拟记录
            inventoryMap.set(code, {
                material_code: code,
                material_name: material.name,
                current_stock: 0,
                available_stock: 0,
                storage_days: 0,
                unit_price: material.unitPrice,
                warehouse_name: 'Virtual'
            });
            missingCount++;
        }
    }

    console.log(`[BOM服务] 匹配单价: ${priceMatchCount}, 补充无库存物料: ${missingCount}, 总数: ${inventoryMap.size}`);

    // 打印几条有单价的库存
    let sampleCount = 0;
    for (const [code, inv] of inventoryMap) {
        if (sampleCount < 3 && (inv.unit_price ?? 0) > 0) {
            console.log(`[BOM服务] 库存金额样例 ${code}: ${inv.current_stock}    price: ${(inv.unit_price ?? 0) * (inv.current_stock ?? 0)}`);
            sampleCount++;
        }
    }

    // 解析替代料关系
    const substitutionRelations = parseSubstitutionRelations(bomData);

    // 过滤目标产品
    const targetProducts = products.filter(p =>
        TARGET_PRODUCTS.includes(p.product_code)
    );

    console.log('[BOM服务] 目标产品:', targetProducts.map(p => p.product_code));

    // 构建每个产品的BOM树
    const bomTrees: ProductBOMTree[] = [];

    for (const product of targetProducts) {
        const tree = buildProductBOMTree(
            product.product_code,
            product.product_name,
            product.product_model,
            bomData,
            inventoryMap,
            substitutionRelations
        );
        bomTrees.push(tree);
    }

    // 按产品编码顺序排序
    bomTrees.sort((a, b) => {
        const indexA = TARGET_PRODUCTS.indexOf(a.productCode);
        const indexB = TARGET_PRODUCTS.indexOf(b.productCode);
        return indexA - indexB;
    });

    console.log('[BOM服务] 完成加载:', bomTrees.length, '个产品BOM树');
    return bomTrees;
}

/**
 * 加载单个产品的BOM树
 */
export async function loadSingleBOMTree(productCode: string): Promise<ProductBOMTree | null> {
    const allTrees = await loadAllBOMTrees();
    return allTrees.find(t => t.productCode === productCode) || null;
}

// ============================================================================
// 阶段二：生产数量分析 (MRP运算逻辑)
// ============================================================================

/** 物料需求信息 */
export interface MaterialRequirement {
    code: string;
    name: string;
    stockValue: number;          // 库存金额
    isStagnant: boolean;         // 是否呆滞
}

/** 生产分析结果 */
export interface ProductionAnalysisResult {
    productCode: string;
    productName: string;

    // X轴数据
    productionQuantities: number[];

    // 无起订量分析
    replenishmentCosts: number[];      // 补货金额（从库存消耗）
    newProcurementCosts: number[];     // 新增采购金额
    newStagnantValues?: number[];      // 新增呆滞库存金额 (无MOQ时通常为0)

    // 有起订量分析 (假设MOQ=100)
    replenishmentCostsWithMOQ: number[];
    newProcurementCostsWithMOQ: number[];
    newStagnantValuesWithMOQ?: number[];  // 因MOQ产生的新增呆滞金额

    // 关键指标
    maxProducibleWithoutPurchase: number;  // 最大可生产数量（无需采购）
    crossPointQuantity: number;             // 成本交叉点的生产数量
    crossPointValue: number;                // 交叉点的成本值

    // 高价值物料列表
    topExpensiveMaterials: MaterialRequirement[];

    // 总库存价值（用于计算剩余呆滞）
    totalInventoryValue: number;

    // 智能分析文字
    analysisConclusions: string[];
}

/**
 * MRP计算结果
 */
interface MRPResult {
    replenishmentCost: number;     // 补货成本（消耗现有库存）
    newProcurementCost: number;    // 新增采购成本（缺料采购）
    newStagnantCost: number;       // 新增呆滞成本（采购产生的剩余库存）
}

/**
 * 递归计算MRP成本 (Netting Logic)
 * 
 * 核心逻辑：
 * 1. 每一层级先扣减现有库存 (Netting)
 * 2. 只有扣减后的净需求 (Net Requirement) 才展开到下一层级
 * 3. 叶子节点的净需求计入新增采购成本
 */
function calculateMRPCosts(
    productCode: string,
    bomData: ProductBOMTree,
    quantity: number,
    inventoryMap: Map<string, InventoryRaw>, // 原始库存快照
    withMOQ: boolean = false,
    defaultMOQ: number = 100
): MRPResult {
    // 克隆库存状态，因为计算过程会模拟消耗
    // 为了性能，只克隆需要的字段，这里简化为Map<code, currentStock>
    const tempStock = new Map<string, number>();
    for (const [code, inv] of inventoryMap) {
        tempStock.set(code, inv.current_stock);
    }

    // 待处理队列 { code, qty }
    const queue: { code: string; qty: number }[] = [];

    // 初始需求：成品的数量
    queue.push({ code: productCode, qty: quantity });

    let totalReplenishmentCost = 0;
    let totalProcurementCost = 0;
    let totalNewStagnantCost = 0;

    // 为了查找BOM节点信息，建立一个快速索引
    // 注意：BOMTree结构是嵌套的，我们需要一个扁平查找 或者 每次遍历children
    // 优化：在此函数外预处理扁平Map会更快，但为了代码独立性，这里我们使用辅助查找
    // 考虑到树规模不大，递归查找也可。更高效的是先建立 flatBOM Map。
    const bomNodeMap = new Map<string, BOMNode>();
    function indexBOM(node: BOMNode) {
        if (!bomNodeMap.has(node.code)) {
            bomNodeMap.set(node.code, node);
        }
        node.children.forEach(indexBOM);
        node.substitutes.forEach(indexBOM);
    }
    indexBOM(bomData.rootNode);

    // 开始处理队列 (BFS)
    while (queue.length > 0) {
        const item = queue.shift()!;
        const node = bomNodeMap.get(item.code);

        if (!node) continue; // 应该不会发生，除非数据不一致

        // 1. 获取当前库存
        const currentStock = tempStock.get(item.code) || 0;
        const unitPrice = node.unitPrice || 0;

        // 2. 扣减库存 (Netting)
        const usedStock = Math.min(currentStock, item.qty);
        const netRequirement = item.qty - usedStock;

        // 更新临时库存
        tempStock.set(item.code, currentStock - usedStock);

        // 3. 计算补货成本 (消耗的库存价值)
        // 注意：成品本身通常没有单价(或者单价是售价)，如果是计算"物料"成本，不应该计入成品的"库存价值"?
        // 通常Reverse BOM分析的是原材料消耗。
        // 如果成品有库存，我们优先发成品，这部分价值叫"成品去库存"。
        // 如果成品没库存，我们发半成品...
        // 这里假设：所有层级的库存消耗都计入 "补货金额" (Replenishment Cost)
        if (usedStock > 0) {
            totalReplenishmentCost += usedStock * unitPrice;
        }

        // 4. 处理净需求
        if (netRequirement > 0) {
            if (node.children.length === 0) {
                // 叶子节点 (Raw Material) -> 必须采购
                let purchaseQty = netRequirement;

                // 处理起订量 (作为最小包装量/Batch Size处理，即向上取整)
                // 如果只是作为最小起订量(Floor)，当需求>MOQ时就不会产生呆滞，这通常不符合实际(通常有标准包装)
                if (withMOQ && defaultMOQ > 0) {
                    purchaseQty = Math.ceil(netRequirement / defaultMOQ) * defaultMOQ;
                }

                totalProcurementCost += purchaseQty * unitPrice;

                // 计算新增呆滞（购买量 - 实际需求量）
                const leftoverQty = purchaseQty - netRequirement;
                if (leftoverQty > 0) {
                    totalNewStagnantCost += leftoverQty * unitPrice;
                }
            } else {
                // 非叶子节点 (Assembly) -> 展开到下一层
                for (const child of node.children) {
                    const childRequiredQty = netRequirement * child.quantity;
                    queue.push({ code: child.code, qty: childRequiredQty });
                }

                // 暂时忽略替代料逻辑简化计算，未来可加入
            }
        }
    }

    return {
        replenishmentCost: totalReplenishmentCost,
        newProcurementCost: totalProcurementCost,
        newStagnantCost: totalNewStagnantCost
    };
}

/**
 * 查找最大可生产数量 (Binary Search)
 * 只要新增采购成本为0，就说明库存够用
 */
function findMaxProducible(
    productCode: string,
    bomData: ProductBOMTree,
    inventoryMap: Map<string, InventoryRaw>
): number {
    let low = 0;
    let high = 100000; // 假设上限
    let max = 0;

    while (low <= high) {
        const mid = Math.floor((low + high) / 2);
        if (mid === 0) {
            low = 1;
            continue;
        }

        const res = calculateMRPCosts(productCode, bomData, mid, inventoryMap, false);

        if (res.newProcurementCost === 0) {
            // 够用，尝试更多
            max = mid;
            low = mid + 1;
        } else {
            // 不够，减少
            high = mid - 1;
        }
    }

    return max;
}

/**
 * 从BOM树提取所有物料，用于展示"高价值物料"
 * 只需要扁平化列表，不需要计算逻辑
 */
function getFlatMaterialList(rootNode: BOMNode): MaterialRequirement[] {
    const list: MaterialRequirement[] = [];
    const seen = new Set<string>();

    function traverse(node: BOMNode) {
        if (!seen.has(node.code) && node.level > 0) {
            seen.add(node.code);
            list.push({
                code: node.code,
                name: node.name,
                stockValue: node.currentStock * node.unitPrice,
                isStagnant: node.stockStatus === 'stagnant' // 假设node已经计算过status
            });
        }
        node.children.forEach(traverse);
        node.substitutes.forEach(traverse);
    }

    traverse(rootNode);
    return list;
}

/**
 * 生成智能分析结论
 * 
 * 基于机器人事业部的分析逻辑：
 * - 分析线性关系和斜率特征
 * - 计算极差并给出决策建议
 * - 以高价值物料为起点规划消耗策略
 */
function generateAnalysisConclusions(
    maxProducible: number,
    crossPoint: number,
    topMaterials: MaterialRequirement[],
    totalStagnantValue: number,
    replenishmentCosts?: number[],
    newProcurementCosts?: number[],
    productionQuantities?: number[]
): string[] {
    const conclusions: string[] = [];

    // 1. 趋势分析 - 线性关系判断
    if (replenishmentCosts && newProcurementCosts && replenishmentCosts.length >= 2) {
        const repRange = Math.max(...replenishmentCosts) - Math.min(...replenishmentCosts);
        const procRange = Math.max(...newProcurementCosts) - Math.min(...newProcurementCosts);

        // 计算简单斜率
        const n = replenishmentCosts.length;
        const repSlope = (replenishmentCosts[n - 1] - replenishmentCosts[0]) /
            ((productionQuantities?.[n - 1] || n) - (productionQuantities?.[0] || 1));

        conclusions.push(`新增金额和消耗采购同生产数量之间呈线性关系，斜率较${Math.abs(repSlope) > 100 ? '陡' : '平缓'}`);
        conclusions.push(`实际生产数量的极差范围：${(repRange / 10000).toFixed(1)}万 ~ ${(procRange / 10000).toFixed(1)}万元`);
    }

    // 2. 最大可生产数量
    conclusions.push(`最大可生产数量（无需采购）：${maxProducible.toLocaleString()} 套`);

    // 3. 成本平衡点分析
    if (crossPoint > 0) {
        conclusions.push(`成本平衡点：生产约 ${crossPoint.toLocaleString()} 套时，补货成本与采购成本持平`);
    }

    // 4. 高价值物料消耗策略
    if (topMaterials.length > 0) {
        const topMaterial = topMaterials[0];
        const formatValue = (v: number) => v >= 10000 ? `¥${(v / 10000).toFixed(1)}万` : `¥${v.toLocaleString()}`;
        conclusions.push(`最高价值物料：${topMaterial.name}（${formatValue(topMaterial.stockValue)}），建议作为生产规划起点`);
    }

    // 5. 呆滞库存提醒
    if (totalStagnantValue > 0) {
        conclusions.push(`呆滞库存总价值：¥${(totalStagnantValue / 10000).toFixed(1)}万，应优先通过生产消耗`);
    }

    // 6. 决策建议
    conclusions.push(`建议：根据市场需求来做决策，合理安排采购和库存策略，避免盲目生产`);

    return conclusions;
}

/**
 * 计算产品的生产分析
 */
export function calculateProductionAnalysis(productBOM: ProductBOMTree): ProductionAnalysisResult {
    console.log(`[生产分析] 开始分析产品: ${productBOM.productCode}`);

    // 0. 我们需要原始的 InventoryMap 来进行计算
    // 由于 buildProductBOMTree 已经把 inventory 嵌入到 node 中了，
    // 我们需要重新构建一个 inventoryMap 或者从 node 中提取。
    // 为了准确，我们遍历树提取当前库存快照。
    const inventoryMap = new Map<string, InventoryRaw>();
    function extractInv(node: BOMNode) {
        if (!inventoryMap.has(node.code)) {
            // 重构 InventoryRaw 的最小集
            inventoryMap.set(node.code, {
                material_code: node.code,
                material_name: node.name,
                current_stock: node.currentStock,
                available_stock: node.availableStock,
                storage_days: node.storageDays,
                unit_price: node.unitPrice,
                warehouse_name: '' // 不重要
            });
        }
        node.children.forEach(extractInv);
        node.substitutes.forEach(extractInv);
    }
    extractInv(productBOM.rootNode);
    // 关键修正：生产分析应该分析"制造"过程，不应扣减"产成品"本身的库存。
    // 即：我们要计算"利用原材料能做多少个"，而不是"现有库存+能做多少个"。
    if (inventoryMap.has(productBOM.productCode)) {
        inventoryMap.delete(productBOM.productCode);
    }
    console.log(`[生产分析] 提取库存快照: ${inventoryMap.size} 条 (已排除成品本身)`);

    // 1. 计算最大可生产数量
    const maxProducible = findMaxProducible(productBOM.productCode, productBOM, inventoryMap);
    console.log(`[生产分析] 最大可生产数量（无需采购）: ${maxProducible}`);

    // 2. 生成X轴数据点
    // 策略：覆盖从 0 到 maxProducible * 1.5 或 至少 3000
    const maxX = Math.max(maxProducible * 1.5, 3000);

    // 关键修正：步长不能是MOQ(100)的整数倍，否则在每个采样点，需求量都是MOQ的整数倍，导致呆滞为0。
    // 使用非整倍数步长（如 质数 或 偏移量）来暴露锯齿状的呆滞库存。
    let step = Math.max(Math.ceil(maxX / 15), 100);

    // 如果步长接近100的倍数，强制加一个偏移量（例如 23），使其错开
    // 这样能确保采样点 (Step, 2*Step...) 不会总是落在 MOQ 的倍数上
    if (step % 50 === 0) {
        step += 13;
    } else if (step % 100 === 0) {
        step += 23;
    }

    const productionQuantities: number[] = [];
    for (let qty = step; qty <= maxX; qty += step) {
        productionQuantities.push(qty);
    }

    // 3. 计算各点成本
    const replenishmentCosts: number[] = [];
    const newProcurementCosts: number[] = [];
    const newStagnantValues: number[] = []; // 新增

    const replenishmentCostsWithMOQ: number[] = [];
    const newProcurementCostsWithMOQ: number[] = [];
    const newStagnantValuesWithMOQ: number[] = []; // 新增

    for (const qty of productionQuantities) {
        const resNoMOQ = calculateMRPCosts(productBOM.productCode, productBOM, qty, inventoryMap, false);
        replenishmentCosts.push(resNoMOQ.replenishmentCost);
        newProcurementCosts.push(resNoMOQ.newProcurementCost);
        newStagnantValues.push(resNoMOQ.newStagnantCost); // 理应是0

        const resWithMOQ = calculateMRPCosts(productBOM.productCode, productBOM, qty, inventoryMap, true, 100);
        replenishmentCostsWithMOQ.push(resWithMOQ.replenishmentCost);
        newProcurementCostsWithMOQ.push(resWithMOQ.newProcurementCost);
        newStagnantValuesWithMOQ.push(resWithMOQ.newStagnantCost);
    }

    // 4. 找交叉点 (无MOQ情况)
    let crossPointQuantity = 0;
    let crossPointValue = 0;
    for (let i = 0; i < productionQuantities.length - 1; i++) {
        const y1_rep = replenishmentCosts[i];
        const y1_proc = newProcurementCosts[i];
        const y2_rep = replenishmentCosts[i + 1];
        const y2_proc = newProcurementCosts[i + 1];

        if (y1_rep <= y1_proc && y2_rep >= y2_proc) {
            // 简单线性插值找更精确的点
            // (y_rep - y_proc) 从负变正
            // diff = y_rep - y_proc
            // diff1 < 0, diff2 > 0
            // x = x1 + (0 - diff1) / (diff2 - diff1) * (x2 - x1)
            const diff1 = y1_rep - y1_proc;
            const diff2 = y2_rep - y2_proc;
            const ratio = (0 - diff1) / (diff2 - diff1);
            crossPointQuantity = Math.floor(productionQuantities[i] + ratio * (productionQuantities[i + 1] - productionQuantities[i]));
            crossPointValue = y1_rep + ratio * (y2_rep - y1_rep);
            break;
        }
    }

    // 5. 高价值物料列表
    const flatMaterials = getFlatMaterialList(productBOM.rootNode);
    const sortedMaterials = flatMaterials.sort((a, b) => b.stockValue - a.stockValue);
    const topExpensive = sortedMaterials.slice(0, 10);

    // 5.1 计算所有物料的总库存价值（用于图表中的剩余呆滞计算）
    const totalInventoryValue = flatMaterials.reduce((sum, m) => sum + m.stockValue, 0);

    // 6. 呆滞总值
    const totalStagnantValue = flatMaterials
        .filter(m => m.isStagnant)
        .reduce((sum, m) => sum + m.stockValue, 0);

    // 7. 结论 - 包含斜率和极差分析
    const conclusions = generateAnalysisConclusions(
        maxProducible,
        crossPointQuantity,
        topExpensive,
        totalStagnantValue,
        replenishmentCosts,
        newProcurementCosts,
        productionQuantities
    );

    return {
        productCode: productBOM.productCode,
        productName: productBOM.productName,
        productionQuantities,
        replenishmentCosts,
        newProcurementCosts,
        newStagnantValues, // 新增
        replenishmentCostsWithMOQ,
        newProcurementCostsWithMOQ,
        newStagnantValuesWithMOQ, // 新增
        maxProducibleWithoutPurchase: maxProducible,
        crossPointQuantity,
        crossPointValue,
        topExpensiveMaterials: topExpensive,
        totalInventoryValue,
        analysisConclusions: conclusions,
    };
}
