/**
 * BOM库存分析服务
 *
 * 负责加载产品、BOM、库存、物料数据，构建BOM树，解析替代料关??
 *
 * 数据?? 通过 Ontology API 动态加载，对象类型 ID 从配置服务获??
 * - 产品信息 (product)
 * - 产品BOM信息 (bom)
 * - 库存信息 (inventory)
 * - 物料信息 (material)
 */


// ============================================================================
// 类型定义
// ============================================================================

import { apiConfigService } from './apiConfigService';
import { loadProductList, loadSingleBOMTreeViaQueryInstances, initHelpers } from './bomInventoryHelpers';

/**
 * 获取对象类型ID配置
 */
export const getObjectTypeId = (entityType: string, defaultId: string) => {
    // 优先尝试从配置服务获取
    let configuredId = '';

    if (entityType === 'product') {
        configuredId = apiConfigService.getOntologyObjectId('oo_product') || '';
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

    console.warn(`[BOM服务] 未找到配置的对象ID，使用默认值 ${entityType} -> ${defaultId}`);
    return defaultId;
};

// 默认ID作为后备（更新为新的有效 ID）
export const DEFAULT_IDS = {
    products: 'supplychain_hd0202_product',
    bom: 'supplychain_hd0202_bom',
    inventory: 'supplychain_hd0202_inventory',
    material: 'supplychain_hd0202_material',
};

// 初始化帮助函数
initHelpers({
    getObjectTypeId,
    DEFAULT_IDS
});

// ============================================================================
// 数据加载 - 已迁移至 bomInventoryHelpers（直接查询 BOM 对象实例）
// ============================================================================
export interface ProductRaw {
    product_code: string;
    product_name: string;
    product_model?: string;
    product_series?: string;
    product_type?: string;
    amount?: number;
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

/** 库存状??*/
export type StockStatus = 'sufficient' | 'insufficient' | 'stagnant' | 'unknown';

/** BOM节点 */
export interface BOMNode {
    id: string; // Add unique ID for React keys
    code: string;
    name: string;
    level: number;
    description?: string;
    quantity: number;          // 单耗数??
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

    // 替代料信??
    isSubstitute: boolean;
    alternativeGroup: string | null;
    primaryMaterialCode: string | null;
    substitutes: BOMNode[];
}

/** 产品BOM??*/
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


// ============================================================================
// 替代料解??
// ============================================================================

/**
 * 解析替代料关??
 * 根据 alternative_group ??alternative_part 字段识别主料和替代料
 */
// Removed loadAllBOMTrees as it is no longer used

/**
 * 加载单个产品的BOM树
 */
export async function loadSingleBOMTree(productCode: string, identity?: any): Promise<ProductBOMTree | null> {
    const tree = await loadSingleBOMTreeViaQueryInstances(productCode, identity);
    if (tree && identity) {
        // 用 identity 中的产品名称补充树的 productName
        const productName = String(
            (identity as any).material_name ||
            (identity as any).product_name ||
            productCode
        ).trim();
        if (productName && productName !== productCode) {
            tree.productName = productName;
            if (tree.rootNode) {
                tree.rootNode.name = productName;
            }
        }
    }
    return tree;
}

// 导出产品列表加载函数
export { loadProductList };

// ============================================================================
// 阶段二：生产数量分析 (MRP运算逻辑)
// ============================================================================

/** 物料需求信??*/
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

    // X轴数??
    productionQuantities: number[];

    // 无起订量分析
    replenishmentCosts: number[];      // 补货金额（从库存消耗）
    newProcurementCosts: number[];     // 新增采购金额
    newStagnantValues?: number[];      // 新增呆滞库存金额 (无MOQ时通常??)

    // 有起订量分析 (假设MOQ=100)
    replenishmentCostsWithMOQ: number[];
    newProcurementCostsWithMOQ: number[];
    newStagnantValuesWithMOQ?: number[];  // 因MOQ产生的新增呆滞金??

    // 关键指标
    maxProducibleWithoutPurchase: number;  // 最大可生产数量（无需采购??
    crossPointQuantity: number;             // 成本交叉点的生产数量
    crossPointValue: number;                // 交叉点的成本??

    // 高价值物料列??
    topExpensiveMaterials: MaterialRequirement[];

    // 总库存价值（用于计算剩余呆滞??
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
    newStagnantCost: number;       // 新增呆滞成本（采购产生的剩余库存??
}

/**
 * 递归计算MRP成本 (Netting Logic)
 * 
 * 核心逻辑??
 * 1. 每一层级先扣减现有库??(Netting)
 * 2. 只有扣减后的净需??(Net Requirement) 才展开到下一层级
 * 3. 叶子节点的净需求计入新增采购成??
 */
function calculateMRPCosts(
    productCode: string,
    bomData: ProductBOMTree,
    quantity: number,
    inventoryMap: Map<string, InventoryRaw>, // 原始库存快照
    withMOQ: boolean = false,
    defaultMOQ: number = 100
): MRPResult {
    // 克隆库存状态，因为计算过程会模拟消??
    // 为了性能，只克隆需要的字段，这里简化为Map<code, currentStock>
    const tempStock = new Map<string, number>();
    for (const [code, inv] of inventoryMap) {
        tempStock.set(code, inv.current_stock);
    }

    // 待处理队??{ code, qty }
    const queue: { code: string; qty: number }[] = [];

    // 初始需求：成品的数量
    // 用 rootNode.code（= bomFilterValue，产品真实主键值）而非 productCode（UI编码），
    // 确保与 bomNodeMap 中的索引 key 保持一致
    queue.push({ code: bomData.rootNode.code, qty: quantity });

    let totalReplenishmentCost = 0;
    let totalProcurementCost = 0;
    let totalNewStagnantCost = 0;

    // 为了查找BOM节点信息，建立一个快速索??
    // 注意：BOMTree结构是嵌套的，我们需要一个扁平查??或??每次遍历children
    // 优化：在此函数外预处理扁平Map会更快，但为了代码独立性，这里我们使用辅助查找
    // 考虑到树规模不大，递归查找也可。更高效的是先建??flatBOM Map??
    const bomNodeMap = new Map<string, BOMNode>();
    function indexBOM(node: BOMNode) {
        if (!bomNodeMap.has(node.code)) {
            bomNodeMap.set(node.code, node);
        }
        node.children.forEach(indexBOM);
        node.substitutes.forEach(indexBOM);
    }
    indexBOM(bomData.rootNode);

    // 开始处理队??(BFS)
    while (queue.length > 0) {
        const item = queue.shift()!;
        const node = bomNodeMap.get(item.code);

        if (!node) continue; // 应该不会发生，除非数据不一??

        // 1. 获取当前库存
        const currentStock = tempStock.get(item.code) || 0;
        const unitPrice = node.unitPrice || 0;

        // 2. 扣减库存 (Netting)
        const usedStock = Math.min(currentStock, item.qty);
        const netRequirement = item.qty - usedStock;

        // 更新临时库存
        tempStock.set(item.code, currentStock - usedStock);

        // 3. 计算补货成本 (消耗的库存价??
        // 注意：成品本身通常没有单价(或者单价是售价)，如果是计算"物料"成本，不应该计入成品??库存价???
        // 通常Reverse BOM分析的是原材料消耗??
        // 如果成品有库存，我们优先发成品，这部分价值叫"成品去库????
        // 如果成品没库存，我们发半成品...
        // 这里假设：所有层级的库存消耗都计入 "补货金额" (Replenishment Cost)
        if (usedStock > 0) {
            totalReplenishmentCost += usedStock * unitPrice;
        }

        // 4. 处理净需??
        if (netRequirement > 0) {
            if (node.children.length === 0) {
                // 叶子节点 (Raw Material) -> 必须采购
                let purchaseQty = netRequirement;

                // 处理起订??(作为最小包装量/Batch Size处理，即向上取整)
                // 如果只是作为最小起订量(Floor)，当需??MOQ时就不会产生呆滞，这通常不符合实??通常有标准包??
                if (withMOQ && defaultMOQ > 0) {
                    purchaseQty = Math.ceil(netRequirement / defaultMOQ) * defaultMOQ;
                }

                totalProcurementCost += purchaseQty * unitPrice;

                // 计算新增呆滞（购买量 - 实际需求量??
                const leftoverQty = purchaseQty - netRequirement;
                if (leftoverQty > 0) {
                    totalNewStagnantCost += leftoverQty * unitPrice;
                }
            } else {
                // 非叶子节??(Assembly) -> 展开到下一??
                for (const child of node.children) {
                    const childRequiredQty = netRequirement * child.quantity;
                    queue.push({ code: child.code, qty: childRequiredQty });
                }

                // 暂时忽略替代料逻辑简化计算，未来可加??
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
 * 只要新增采购成本??，就说明库存够用
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
            // 够用，尝试更??
            max = mid;
            low = mid + 1;
        } else {
            // 不够，减??
            high = mid - 1;
        }
    }

    return max;
}

/**
 * 从BOM树提取所有物料，用于展示"高价值物??
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
 * 基于机器人事业部的分析逻辑??
 * - 分析线性关系和斜率特征
 * - 计算极差并给出决策建??
 * - 以高价值物料为起点规划消耗策??
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

    // 1. 趋势分析 - 线性关系判??
    if (replenishmentCosts && newProcurementCosts && replenishmentCosts.length >= 2) {
        const repRange = Math.max(...replenishmentCosts) - Math.min(...replenishmentCosts);
        const procRange = Math.max(...newProcurementCosts) - Math.min(...newProcurementCosts);

        // 计算简单斜??
        const n = replenishmentCosts.length;
        const repSlope = (replenishmentCosts[n - 1] - replenishmentCosts[0]) /
            ((productionQuantities?.[n - 1] || n) - (productionQuantities?.[0] || 1));

        conclusions.push(`新增金额和消耗采购同生产数量之间呈线性关系，斜率${Math.abs(repSlope) > 100 ? '陡峭' : '平缓'}`);
        conclusions.push(`实际生产数量的极差范围：${(repRange / 10000).toFixed(1)}万 ~ ${(procRange / 10000).toFixed(1)}万元`);
    }

    // 2. 最大可生产数量
    conclusions.push(`最大可生产数量（无需采购）：${maxProducible.toLocaleString()} 套`);

    // 3. 成本平衡点分??
    if (crossPoint > 0) {
        conclusions.push(`成本平衡点：生产??${crossPoint.toLocaleString()} 套时，补货成本与采购成本持平`);
    }

    // 4. 高价值物料消耗策??
    if (topMaterials.length > 0) {
        const topMaterial = topMaterials[0];
        const formatValue = (v: number) => v >= 10000 ? `￥${(v / 10000).toFixed(1)}万` : `￥${v.toLocaleString()}`;
        conclusions.push(`最高价值物料：${topMaterial.name}（${formatValue(topMaterial.stockValue)}），建议作为生产规划起点`);
    }

    // 5. 呆滞库存提醒
    if (totalStagnantValue > 0) {
        conclusions.push(`呆滞库存总价值：￥${(totalStagnantValue / 10000).toFixed(1)}万，应优先通过生产消耗`);
    }

    // 6. 决策建议
    conclusions.push(`建议：根据市场需求来做决策，合理安排采购和库存策略，避免盲目生产`);

    return conclusions;
}

/**
 * 计算产品的生产分??
 */
export function calculateProductionAnalysis(productBOM: ProductBOMTree): ProductionAnalysisResult {
    const startTime = Date.now();
    console.log(`[生产分析] ?? 开始分析产?? ${productBOM.productCode} - ${productBOM.productName}`);

    // 0. 我们需要原始的 InventoryMap 来进行计??
    // 由于 buildProductBOMTree 已经??inventory 嵌入??node 中了??
    // 我们需要重新构建一??inventoryMap 或者从 node 中提取??
    // 为了准确，我们遍历树提取当前库存快照??
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
                warehouse_name: '' // 不重??
            });
        }
        node.children.forEach(extractInv);
        node.substitutes.forEach(extractInv);
    }
    extractInv(productBOM.rootNode);
    // 关键修正：生产分析是制造过程，不应扣减产成品本身的库存
    // 即：我们计算"利用原材料能做多少套"，而非"现有库存+能做多少套"
    // 用 rootNode.code（产品真实主键值）删除，与 extractInv 的索引 key 保持一致
    const rootCode = productBOM.rootNode.code;
    if (inventoryMap.has(rootCode)) {
        inventoryMap.delete(rootCode);
    }
    console.log(`[生产分析] 提取库存快照: ${inventoryMap.size} 个 (已排除成品本身 ${rootCode})`);

    // 1. 计算最大可生产数量
    const maxProducible = findMaxProducible(productBOM.productCode, productBOM, inventoryMap);
    console.log(`[生产分析] 最大可生产数量（无需采购）：${maxProducible}`);

    // 2. 生成X轴数据点
    // 策略：覆盖从 0 ??maxProducible * 1.5 ??至少 3000
    const maxX = Math.max(maxProducible * 1.5, 3000);

    // 关键修正：步长不能是MOQ(100)的整数倍，否则在每个采样点，需求量都是MOQ的整数倍，导致呆滞????
    // 使用非整倍数步长（如 质数 ??偏移量）来暴露锯齿状的呆滞库存??
    let step = Math.max(Math.ceil(maxX / 15), 100);

    // 如果步长接近100的倍数，强制加一个偏移量（例??23），使其错开
    // 这样能确保采样点 (Step, 2*Step...) 不会总是落在 MOQ 的倍数??
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
    console.log(`[生产分析] 计算成本曲线 (${productionQuantities.length} 个数据点)...`);
    const replenishmentCosts: number[] = [];
    const newProcurementCosts: number[] = [];
    const newStagnantValues: number[] = []; // 新增

    const replenishmentCostsWithMOQ: number[] = [];
    const newProcurementCostsWithMOQ: number[] = [];
    const newStagnantValuesWithMOQ: number[] = []; // 新增

    for (let i = 0; i < productionQuantities.length; i++) {
        const qty = productionQuantities[i];
        if (i % 5 === 0) {
            console.log(`[生产分析] 计算进度: ${i + 1}/${productionQuantities.length} (数量=${qty})`);
        }

        const resNoMOQ = calculateMRPCosts(productBOM.productCode, productBOM, qty, inventoryMap, false);
        replenishmentCosts.push(resNoMOQ.replenishmentCost);
        newProcurementCosts.push(resNoMOQ.newProcurementCost);
        newStagnantValues.push(resNoMOQ.newStagnantCost); // 理应为0

        const resWithMOQ = calculateMRPCosts(productBOM.productCode, productBOM, qty, inventoryMap, true, 100);
        replenishmentCostsWithMOQ.push(resWithMOQ.replenishmentCost);
        newProcurementCostsWithMOQ.push(resWithMOQ.newProcurementCost);
        newStagnantValuesWithMOQ.push(resWithMOQ.newStagnantCost);
    }
    console.log('[生产分析] 成本曲线计算完成');

    // 4. 找交叉点 (无MOQ情况)
    let crossPointQuantity = 0;
    let crossPointValue = 0;
    for (let i = 0; i < productionQuantities.length - 1; i++) {
        const y1_rep = replenishmentCosts[i];
        const y1_proc = newProcurementCosts[i];
        const y2_rep = replenishmentCosts[i + 1];
        const y2_proc = newProcurementCosts[i + 1];

        if (y1_rep <= y1_proc && y2_rep >= y2_proc) {
            // 简单线性插值找更精确的??
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

    // 5. 高价值物料列??
    const flatMaterials = getFlatMaterialList(productBOM.rootNode);
    const sortedMaterials = flatMaterials.sort((a, b) => b.stockValue - a.stockValue);
    const topExpensive = sortedMaterials.slice(0, 10);

    // 5.1 计算所有物料的总库存价值（用于图表中的剩余呆滞计算??
    const totalInventoryValue = flatMaterials.reduce((sum, m) => sum + m.stockValue, 0);

    // 6. 呆滞总??
    const totalStagnantValue = flatMaterials
        .filter(m => m.isStagnant)
        .reduce((sum, m) => sum + m.stockValue, 0);

    // 7. 结论 - 包含斜率和极差分??
    console.log('[生产分析] 生成分析结论...');
    const conclusions = generateAnalysisConclusions(
        maxProducible,
        crossPointQuantity,
        topExpensive,
        totalStagnantValue,
        replenishmentCosts,
        newProcurementCosts,
        productionQuantities
    );

    const elapsed = Date.now() - startTime;
    console.log(`[生产分析] ??分析完成 (耗时 ${(elapsed / 1000).toFixed(2)}s)`);

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
