/**
 * 呆滞库存优化 - 类型定义
 */

// ==================== 基础数据类型 ====================

/**
 * 物料数据
 */
export interface MaterialData {
    code: string;              // 物料编码
    name: string;              // 物料名称
    specification: string;     // 规格说明
    type: string;              // 物料类型（自制/外购/委外）
    unitPrice: number;         // 单价

    // 库存相关
    isStagnant?: boolean;      // 是否呆滞
    storageDays?: number;      // 库龄（天）
    currentStock?: number;     // 当前库存
    safetyStock?: number;      // 安全库存
}

/**
 * BOM 数据
 */
export interface BOMData {
    bomNumber: string;         // BOM 编号
    parentCode: string;        // 父级编码
    parentName: string;        // 父级名称
    childCode: string;         // 子级编码
    childName: string;         // 子级名称
    childQuantity: number;     // 单耗数量
    unit: string;              // 单位
    lossRate: number;          // 损耗率
    alternativeGroup: string;  // 替代组编号
    alternativePart: string;   // 替代标识（空=主料，"替代"=替代料）
}

/**
 * 产品数据
 */
export interface ProductData {
    code: string;              // 产品编码
    name: string;              // 产品名称
    model: string;             // 产品型号
    series: string;            // 产品系列
    type: string;              // 产品类型
    amount: number;            // 金额
}

// ==================== 替代料相关 ====================

/**
 * 替代料关系
 */
export interface SubstitutionRelation {
    primaryMaterialCode: string;      // 主料编码
    substituteMaterialCode: string;   // 替代料编码
    ratio: number;                    // 替代比例（替代料数量 / 主料数量）
    priority: number;                 // 优先级 1-10
    costDifference: number;           // 成本差异（替代料单价 - 主料单价）
    applicableScenarios: string[];    // 适用场景（产品编码列表）
}

/**
 * 替代料决策
 */
export interface SubstitutionDecision {
    primaryMaterial: MaterialData;        // 主料
    substituteMaterial: MaterialData;     // 替代料
    substitutionRatio: number;            // 替代比例
    primaryUsed: number;                  // 使用的主料数量
    substituteUsed: number;               // 使用的替代料数量
    reason: string;                       // 替代原因
    costImpact: number;                   // 成本影响
    stagnantValueConsumed: number;        // 消纳的呆滞料价值
}

// ==================== BOM 相关 ====================

/**
 * BOM 树节点
 */
export interface BOMTree {
    code: string;              // 物料/产品编码
    name: string;              // 名称
    quantity: number;          // 数量
    level: number;             // 层级（0=顶层）
    children: BOMTree[];       // 子节点
    isLeaf: boolean;           // 是否为最底层物料
}

/**
 * 物料需求
 */
export interface MaterialRequirement {
    materialCode: string;      // 物料编码
    materialName: string;      // 物料名称
    requiredQuantity: number;  // 需求数量
    availableQuantity: number; // 可用数量
    shortage: number;          // 缺口数量
}

/**
 * 增强的物料需求（含替代料合并计算）
 */
export interface EnhancedMaterialRequirement {
    materialCode: string;              // 主料编码
    materialName: string;              // 主料名称
    requiredPerUnit: number;           // 单位产品需求量
    availableFromPrimary: number;      // 主料可用库存
    availableFromSubstitutes: Map<string, number>; // 替代料可用库存 (编码 -> 数量)
    totalAvailable: number;            // 总可用量（主料 + 替代料）
    canProduce: number;                // 可生产数量
    hasSubstitutes: boolean;           // 是否有替代料
}

// ==================== 生产计划相关 ====================

/**
 * 物料使用情况
 */
export interface MaterialUsage {
    material: MaterialData;    // 物料信息
    requiredQuantity: number;  // 需求数量
    usedQuantity: number;      // 使用数量
    remainingQuantity: number; // 剩余数量
    value: number;             // 价值
    isStagnant: boolean;       // 是否呆滞料
}

/**
 * 补料信息
 */
export interface MaterialSupplement {
    material: MaterialData;    // 物料信息
    shortage: number;          // 缺口数量
    supplementQuantity: number;// 补料数量（考虑 MOQ）
    cost: number;              // 补料成本
    moq?: number;              // 最小起订量（暂不使用）
    excessQuantity?: number;   // 超出数量（MOQ 导致）
}

/**
 * 生产方案
 */
export interface ProductionPlan {
    product: ProductData;                      // 产品信息
    quantity: number;                          // 可生产数量
    stagnantMaterialsUsed: MaterialUsage[];    // 呆滞料使用情况
    substitutionDecisions: SubstitutionDecision[]; // 替代料决策
    supplementMaterials: MaterialSupplement[]; // 补料清单
    totalCost: number;                         // 总成本（补料成本）
    outputValue: number;                       // 产出价值
    roi: number;                               // 投资回报率
    wasteValue: number;                        // 余料价值
    stagnantConsumptionRate: number;           // 呆滞料消纳率（百分比）
}

// ==================== UI 相关 ====================

/**
 * 步骤类型
 */
export type OptimizerStep = 1 | 2 | 3;

/**
 * 产品匹配信息
 */
export interface ProductMatchInfo {
    product: ProductData;              // 产品信息
    matchScore: number;                // 匹配度（0-100）
    canProduceWithStagnantOnly: number;// 仅用呆滞料可生产数量
    stagnantValueConsumed: number;     // 呆滞料消纳价值
    estimatedSupplementCost: number;   // 预估补料成本
    salesVolume?: number;              // 销量（模拟数据）
    profitMargin?: number;             // 利润率（模拟数据）
}
