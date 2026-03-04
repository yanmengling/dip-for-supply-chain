/**
 * 全局组合优化面板
 * 
 * 将所有物料库存作为整体，分析最佳产品组合，使全局效益最大化
 * 
 * 核心算法：
 * 1. 分析物料共用关系
 * 2. 基于边际效益的贪心算法分配物料
 * 3. 输出最优产品组合方案
 */

import { useMemo, useState } from 'react';
import {
    Target,
    Package,
    TrendingUp,
    AlertTriangle,
    Lightbulb,
    BarChart3,
    CheckCircle,
    ArrowRight,
    Layers,
} from 'lucide-react';
import type { ProductBOMTree, BOMNode } from '../../../services/bomInventoryService';

// ============================================================================
// 类型定义
// ============================================================================

interface GlobalOptimizationPanelProps {
    bomTrees: ProductBOMTree[];
    loading?: boolean;
}

interface ProductAllocation {
    productCode: string;
    productName: string;
    recommendedQuantity: number;
    stagnantConsumed: number;      // 消耗的呆滞金额
    newProcurement: number;         // 新增采购金额
    netBenefit: number;             // 净效益 = 消耗呆滞 - 新增采购
    efficiency: number;             // 效益比
    materialCount: number;          // 涉及物料数
}

interface SharedMaterial {
    code: string;
    name: string;
    totalStock: number;
    stockValue: number;
    usedByProducts: string[];       // 使用该物料的产品列表
    allocation: Map<string, number>; // 分配给各产品的数量
    // 替代料信息
    isSubstitute: boolean;          // 是否为替代料
    isPrimary: boolean;             // 是否为主料（有替代料的主物料）
    alternativeGroup: string | null; // 替代组标识
    primaryMaterialCode: string | null; // 如果是替代料，指向主料编码
}

interface OptimizationResult {
    allocations: ProductAllocation[];
    totalStagnantConsumed: number;
    totalNewProcurement: number;
    totalNetBenefit: number;
    sharedMaterials: SharedMaterial[];
    optimizationSummary: string[];
}

// ============================================================================
// 辅助函数
// ============================================================================

function formatCurrency(value: number): string {
    if (isNaN(value) || !isFinite(value)) {
        return '0';
    }
    if (Math.abs(value) >= 10000) {
        return `${(value / 10000).toFixed(1)}万`;
    }
    return value.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

function formatQuantity(value: number): string {
    return value.toLocaleString('zh-CN');
}

/**
 * 物料信息（包含替代料标记）
 */
interface MaterialInfo {
    code: string;
    name: string;
    requiredPerUnit: number;
    stock: number;
    stockValue: number;
    unitPrice: number;
    // 替代料关系
    isSubstitute: boolean;          // 是否为替代料
    isPrimary: boolean;             // 是否为主料（有替代料的主物料）
    alternativeGroup: string | null; // 替代组标识
    primaryMaterialCode: string | null; // 如果是替代料，指向主料编码
}

/**
 * 递归收集BOM树中所有物料
 * 正确处理替代料关系，标记主料和替代料
 * 
 * 参考 data_structure_implementation.md 中的替代料数据结构：
 * - alternative_group: 替代组编号（非空且相同值 = 同一替代组）
 * - alternative_part: 空值 = 主物料, "替代" = 替代料
 */
function collectAllMaterials(node: BOMNode, parentQuantity: number = 1): Map<string, MaterialInfo> {
    const materials = new Map<string, MaterialInfo>();
    
    const traverse = (n: BOMNode, multiplier: number, isSubstituteNode: boolean = false, primaryCode: string | null = null) => {
        // 跳过根节点（根节点通常没有 parentCode 或者 level === 0）
        const isRootNode = n.parentCode === null && n.level === 0;
        
        if (!isRootNode) {
            const existing = materials.get(n.code);
            const requiredQty = n.quantity * multiplier;
            
            // 计算库存价值
            const stockValue = n.currentStock * n.unitPrice;
            
            // 使用节点的 unitPrice，如果没有则默认 1
            const unitPrice = n.unitPrice > 0 ? n.unitPrice : 1;
            
            // 判断是否有替代料（即是否为主料）
            const hasSubs = n.substitutes && n.substitutes.length > 0;
            
            // 从 BOMNode 获取替代料信息
            // BOMNode 已包含: isSubstitute, alternativeGroup, primaryMaterialCode, substitutes
            const nodeIsSubstitute = isSubstituteNode || n.isSubstitute;
            const nodeIsPrimary = hasSubs || (n.alternativeGroup !== null && !n.isSubstitute);
            const nodeAltGroup = n.alternativeGroup;
            const nodePrimaryCode = primaryCode || n.primaryMaterialCode;
            
            if (existing) {
                existing.requiredPerUnit += requiredQty;
                // 合并替代料信息（如果之前不是主料/替代料，但现在是，更新标记）
                if (nodeIsSubstitute && !existing.isSubstitute) {
                    existing.isSubstitute = true;
                    existing.primaryMaterialCode = nodePrimaryCode;
                }
                if (nodeIsPrimary && !existing.isPrimary) {
                    existing.isPrimary = true;
                }
                if (nodeAltGroup && !existing.alternativeGroup) {
                    existing.alternativeGroup = nodeAltGroup;
                }
            } else {
                materials.set(n.code, {
                    code: n.code,
                    name: n.name,
                    requiredPerUnit: requiredQty,
                    stock: n.currentStock || 0,
                    stockValue: stockValue || 0,
                    unitPrice: unitPrice,
                    isSubstitute: nodeIsSubstitute,
                    isPrimary: nodeIsPrimary,
                    alternativeGroup: nodeAltGroup,
                    primaryMaterialCode: nodePrimaryCode,
                });
            }
        }
        
        // 递归处理子节点：子节点乘数 = 父节点乘数 × 当前节点单耗，保证多层 BOM 正确累积
        n.children.forEach(child => {
            traverse(child, isRootNode ? 1 : multiplier * n.quantity, false, null);
        });

        // 处理替代料 - 标记为替代料，并记录主料编码
        n.substitutes.forEach(sub => {
            traverse(sub, isRootNode ? 1 : multiplier * n.quantity, true, n.code);
        });
    };
    
    traverse(node, parentQuantity);
    return materials;
}

/**
 * 全局优化算法
 *
 * 三项核心改进：
 * 1. 效益指标 → 库存自给率（现有库存可覆盖的单位生产成本占比）
 * 2. 共用物料 → 按需求比例分配（替代贪心先到先得）
 * 3. 推荐数量 → 直接用比例分配后的可生产上限（去掉 0.7 魔法系数）
 */
function calculateGlobalOptimization(bomTrees: ProductBOMTree[]): OptimizationResult {
    if (bomTrees.length === 0) {
        return {
            allocations: [],
            totalStagnantConsumed: 0,
            totalNewProcurement: 0,
            totalNetBenefit: 0,
            sharedMaterials: [],
            optimizationSummary: ['暂无产品数据'],
        };
    }

    // ── 1. 收集所有产品的物料需求 ────────────────────────────────────────────
    const productMaterials = new Map<string, Map<string, MaterialInfo>>();
    bomTrees.forEach(tree => {
        productMaterials.set(tree.productCode, collectAllMaterials(tree.rootNode));
    });

    // ── 2. 构建全局物料库存池 ────────────────────────────────────────────────
    const globalInventory = new Map<string, {
        code: string; name: string;
        totalStock: number; stockValue: number; unitPrice: number;
        usedByProducts: string[];
        isSubstitute: boolean; isPrimary: boolean;
        alternativeGroup: string | null; primaryMaterialCode: string | null;
    }>();

    productMaterials.forEach((materials, productCode) => {
        materials.forEach((mat, code) => {
            if (globalInventory.has(code)) {
                const existing = globalInventory.get(code)!;
                if (!existing.usedByProducts.includes(productCode)) {
                    existing.usedByProducts.push(productCode);
                }
                if (mat.isSubstitute && !existing.isSubstitute) {
                    existing.isSubstitute = true;
                    existing.primaryMaterialCode = mat.primaryMaterialCode;
                }
                if (mat.isPrimary && !existing.isPrimary) existing.isPrimary = true;
                if (mat.alternativeGroup && !existing.alternativeGroup) {
                    existing.alternativeGroup = mat.alternativeGroup;
                }
            } else {
                globalInventory.set(code, {
                    code: mat.code, name: mat.name,
                    totalStock: mat.stock, stockValue: mat.stockValue, unitPrice: mat.unitPrice,
                    usedByProducts: [productCode],
                    isSubstitute: mat.isSubstitute, isPrimary: mat.isPrimary,
                    alternativeGroup: mat.alternativeGroup, primaryMaterialCode: mat.primaryMaterialCode,
                });
            }
        });
    });

    // ── 3. 按需求比例预分配各物料给各产品 ────────────────────────────────────
    // 对每种物料：各产品按自身单耗占所有产品总单耗的比例来分配库存
    // 例：物料X库存100，产品A单耗80，产品B单耗60 → A得 100×(80/140)≈57，B得 100×(60/140)≈43
    // proportionalAlloc[materialCode][productCode] = 分配到的库存量
    const proportionalAlloc = new Map<string, Map<string, number>>();

    globalInventory.forEach((matGlobal, matCode) => {
        let totalDemandPerUnit = 0;
        const productDemand = new Map<string, number>();

        productMaterials.forEach((materials, productCode) => {
            const mat = materials.get(matCode);
            if (mat && mat.requiredPerUnit > 0) {
                productDemand.set(productCode, mat.requiredPerUnit);
                totalDemandPerUnit += mat.requiredPerUnit;
            }
        });

        if (totalDemandPerUnit === 0) return;

        const alloc = new Map<string, number>();
        productDemand.forEach((demand, productCode) => {
            alloc.set(productCode, matGlobal.totalStock * (demand / totalDemandPerUnit));
        });
        proportionalAlloc.set(matCode, alloc);
    });

    // ── 4. 计算每个产品的推荐数量、自给率、消耗/采购金额 ─────────────────────
    const materialAllocations = new Map<string, Map<string, number>>(); // 用于共用物料展示
    const allocations: ProductAllocation[] = [];

    bomTrees.forEach(tree => {
        const { productCode } = tree;
        const materials = productMaterials.get(productCode)!;

        // 推荐数量：为消耗完分配到的库存中最多的那种物料需要生产多少套
        // 与逆向计算器方案A（最大化消纳）语义一致：由库存最充裕的物料驱动，
        // 缺料的物料计入新增采购，不阻断推荐数量
        let recommendedQuantity = 0;
        materials.forEach((mat, matCode) => {
            if (mat.requiredPerUnit <= 0) return;
            const allocated = proportionalAlloc.get(matCode)?.get(productCode) ?? 0;
            if (allocated > 0) {
                const neededToConsumeAll = Math.ceil(allocated / mat.requiredPerUnit);
                recommendedQuantity = Math.max(recommendedQuantity, neededToConsumeAll);
            }
        });

        // 消耗呆滞 / 新增采购
        let stagnantConsumed = 0;
        let newProcurement = 0;

        // 库存自给率计算（基于单耗，与推荐数量无关）
        // 自给率 = Σ(min(库存量, 单耗) × 单价) / Σ(单耗 × 单价)
        let coveredValue = 0;
        let totalRequiredValue = 0;

        materials.forEach((mat, matCode) => {
            const required = mat.requiredPerUnit * recommendedQuantity;
            const allocated = proportionalAlloc.get(matCode)?.get(productCode) ?? 0;
            const fromStock = Math.min(required, allocated);
            const needPurchase = Math.max(0, required - fromStock);

            stagnantConsumed += fromStock * mat.unitPrice;
            newProcurement += needPurchase * mat.unitPrice;

            if (fromStock > 0) {
                if (!materialAllocations.has(matCode)) materialAllocations.set(matCode, new Map());
                materialAllocations.get(matCode)!.set(productCode, fromStock);
            }

            coveredValue += Math.min(mat.stock, mat.requiredPerUnit) * mat.unitPrice;
            totalRequiredValue += mat.requiredPerUnit * mat.unitPrice;
        });

        const efficiency = totalRequiredValue > 0 ? coveredValue / totalRequiredValue : 0;
        const netBenefit = stagnantConsumed - newProcurement;

        allocations.push({
            productCode,
            productName: tree.rootNode.name,
            recommendedQuantity,
            stagnantConsumed: isNaN(stagnantConsumed) ? 0 : stagnantConsumed,
            newProcurement: isNaN(newProcurement) ? 0 : newProcurement,
            netBenefit: isNaN(netBenefit) ? 0 : netBenefit,
            efficiency: isNaN(efficiency) ? 0 : efficiency,
            materialCount: materials.size,
        });
    });

    // ── 5. 按自给率降序排序（自给率越高 = 越少依赖采购 = 优先生产）─────────────
    allocations.sort((a, b) => b.efficiency - a.efficiency);

    // ── 6. 统计共用物料 ───────────────────────────────────────────────────────
    const sharedMaterials: SharedMaterial[] = [];
    globalInventory.forEach((mat, code) => {
        if (mat.usedByProducts.length > 1) {
            sharedMaterials.push({
                code: mat.code, name: mat.name,
                totalStock: mat.totalStock, stockValue: mat.stockValue,
                usedByProducts: mat.usedByProducts,
                allocation: materialAllocations.get(code) || new Map(),
                isSubstitute: mat.isSubstitute, isPrimary: mat.isPrimary,
                alternativeGroup: mat.alternativeGroup, primaryMaterialCode: mat.primaryMaterialCode,
            });
        }
    });

    sharedMaterials.sort((a, b) => {
        if (a.isPrimary && !b.isPrimary) return -1;
        if (!a.isPrimary && b.isPrimary) return 1;
        return b.usedByProducts.length - a.usedByProducts.length;
    });

    // ── 7. 汇总 + 优化建议 ───────────────────────────────────────────────────
    const totalStagnantConsumed = allocations.reduce((sum, a) => sum + a.stagnantConsumed, 0);
    const totalNewProcurement = allocations.reduce((sum, a) => sum + a.newProcurement, 0);
    const totalNetBenefit = totalStagnantConsumed - totalNewProcurement;
    const totalRecommended = allocations.reduce((sum, a) => sum + a.recommendedQuantity, 0);

    const optimizationSummary: string[] = [];

    if (allocations.length > 0) {
        const best = allocations[0]; // 已按自给率排序
        optimizationSummary.push(
            `最优自给率产品：${best.productName}，库存自给率 ${(best.efficiency * 100).toFixed(0)}%`
        );
    }

    if (sharedMaterials.length > 0) {
        optimizationSummary.push(
            `共有 ${sharedMaterials.length} 种物料被多产品共用，已按需求比例分配库存`
        );
    }

    optimizationSummary.push(
        `建议总生产 ${formatQuantity(totalRecommended)} 套，预计消耗呆滞 ¥${formatCurrency(totalStagnantConsumed)}`
    );

    if (totalNetBenefit > 0) {
        optimizationSummary.push(
            `预计净效益 ¥${formatCurrency(totalNetBenefit)}（消耗库存价值 > 新增采购）`
        );
    }

    optimizationSummary.push('建议根据市场需求调整各产品比例，优先生产高自给率产品');

    return {
        allocations,
        totalStagnantConsumed,
        totalNewProcurement,
        totalNetBenefit,
        sharedMaterials,
        optimizationSummary,
    };
}

// ============================================================================
// 子组件：产品分配卡片
// ============================================================================

interface ProductAllocationCardProps {
    allocation: ProductAllocation;
    rank: number;
}

const ProductAllocationCard: React.FC<ProductAllocationCardProps> = ({ allocation, rank }) => {
    const isTopEfficiency = rank === 1;
    
    return (
        <div className={`bg-white rounded-lg border p-4 ${
            isTopEfficiency ? 'border-amber-300 shadow-md' : 'border-slate-200'
        }`}>
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                    <span className={`w-6 h-6 flex items-center justify-center text-xs font-bold rounded-full ${
                        rank === 1 ? 'bg-amber-500 text-white' :
                        rank === 2 ? 'bg-slate-400 text-white' :
                        rank === 3 ? 'bg-amber-700 text-white' :
                        'bg-slate-200 text-slate-600'
                    }`}>
                        {rank}
                    </span>
                    <div>
                        <h4 className="text-sm font-semibold text-slate-800">{allocation.productCode}</h4>
                        <p className="text-xs text-slate-500 truncate max-w-[150px]" title={allocation.productName}>
                            {allocation.productName}
                        </p>
                    </div>
                </div>
                {isTopEfficiency && (
                    <span className="px-2 py-0.5 text-[10px] font-medium bg-amber-100 text-amber-700 rounded">
                        最优
                    </span>
                )}
            </div>

            <div className="space-y-2">
                <div className="flex justify-between items-center">
                    <span className="text-xs text-slate-500">建议生产</span>
                    <span className="text-lg font-bold text-indigo-600">
                        {formatQuantity(allocation.recommendedQuantity)} 套
                    </span>
                </div>
                
                <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-green-50 rounded p-2">
                        <div className="text-green-600 font-medium">消耗呆滞</div>
                        <div className="text-green-700 font-semibold">¥{formatCurrency(allocation.stagnantConsumed)}</div>
                    </div>
                    <div className="bg-red-50 rounded p-2">
                        <div className="text-red-600 font-medium">新增采购</div>
                        <div className="text-red-700 font-semibold">¥{formatCurrency(allocation.newProcurement)}</div>
                    </div>
                </div>

                <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                    <span className="text-xs text-slate-500">净效益</span>
                    <span className={`text-sm font-bold ${
                        allocation.netBenefit >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                        {allocation.netBenefit >= 0 ? '+' : ''}¥{formatCurrency(allocation.netBenefit)}
                    </span>
                </div>

                <div className="flex justify-between items-center text-xs text-slate-500">
                    <span>涉及 {allocation.materialCount} 种物料</span>
                    <span>自给率 {(allocation.efficiency * 100).toFixed(0)}%</span>
                </div>
            </div>
        </div>
    );
};

// ============================================================================
// 子组件：汇总指标
// ============================================================================

interface SummaryMetricsProps {
    result: OptimizationResult;
    productCount: number;
}

const SummaryMetrics: React.FC<SummaryMetricsProps> = ({ result, productCount }) => {
    const totalQuantity = result.allocations.reduce((sum, a) => sum + a.recommendedQuantity, 0);
    
    return (
        <div className="grid grid-cols-5 gap-4">
            <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-1 text-slate-500">
                    <Layers size={16} className="text-indigo-500" />
                    <span className="text-xs font-medium">分析产品</span>
                </div>
                <div className="text-2xl font-bold text-slate-800">{productCount}</div>
                <div className="text-xs text-slate-400 mt-1">个产品</div>
            </div>

            <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-1 text-slate-500">
                    <Target size={16} className="text-purple-500" />
                    <span className="text-xs font-medium">建议总产量</span>
                </div>
                <div className="text-2xl font-bold text-slate-800">{formatQuantity(totalQuantity)}</div>
                <div className="text-xs text-slate-400 mt-1">套</div>
            </div>

            <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-1 text-slate-500">
                    <TrendingUp size={16} className="text-green-500" />
                    <span className="text-xs font-medium">消耗呆滞</span>
                </div>
                <div className="text-2xl font-bold text-green-600">¥{formatCurrency(result.totalStagnantConsumed)}</div>
                <div className="text-xs text-slate-400 mt-1">库存价值</div>
            </div>

            <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-1 text-slate-500">
                    <AlertTriangle size={16} className="text-red-500" />
                    <span className="text-xs font-medium">新增采购</span>
                </div>
                <div className="text-2xl font-bold text-red-600">¥{formatCurrency(result.totalNewProcurement)}</div>
                <div className="text-xs text-slate-400 mt-1">需额外投入</div>
            </div>

            <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-1 text-slate-500">
                    <CheckCircle size={16} className="text-amber-500" />
                    <span className="text-xs font-medium">净效益</span>
                </div>
                <div className={`text-2xl font-bold ${
                    result.totalNetBenefit >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                    {result.totalNetBenefit >= 0 ? '+' : ''}¥{formatCurrency(result.totalNetBenefit)}
                </div>
                <div className="text-xs text-slate-400 mt-1">全局收益</div>
            </div>
        </div>
    );
};

// ============================================================================
// 子组件：共用物料分析
// ============================================================================

interface SharedMaterialsCardProps {
    sharedMaterials: SharedMaterial[];
}

const SharedMaterialsCard: React.FC<SharedMaterialsCardProps> = ({ sharedMaterials }) => {
    const [expanded, setExpanded] = useState(false);
    const displayMaterials = expanded ? sharedMaterials : sharedMaterials.slice(0, 5);

    if (sharedMaterials.length === 0) {
        return (
            <div className="bg-white rounded-lg border border-slate-200 p-4">
                <div className="flex items-center gap-2 text-slate-500">
                    <Package size={16} />
                    <span className="text-sm">无共用物料</span>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <Package size={16} className="text-purple-500" />
                    <h3 className="text-sm font-semibold text-slate-800">
                        共用物料分析 ({sharedMaterials.length} 种)
                    </h3>
                </div>
                <div className="flex items-center gap-2">
                    {/* 图例 */}
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700 rounded border border-blue-200">
                        主料
                    </span>
                    <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 rounded border border-amber-200">
                        替代
                    </span>
                    <span className="text-xs text-slate-400 ml-1">需合理分配</span>
                </div>
            </div>

            <div className="space-y-2">
                {displayMaterials.map((mat, index) => (
                    <div key={mat.code} className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                            <span className="text-xs font-medium text-slate-400 w-4">{index + 1}</span>
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-medium text-slate-700 truncate" title={mat.name}>
                                        {mat.name}
                                    </span>
                                    {/* 主料/替代料标记 */}
                                    {mat.isPrimary && (
                                        <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-blue-100 text-blue-700 rounded border border-blue-200">
                                            主料
                                        </span>
                                    )}
                                    {mat.isSubstitute && (
                                        <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-amber-100 text-amber-700 rounded border border-amber-200">
                                            替代
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-400">{mat.code}</span>
                                    {/* 显示替代组信息 */}
                                    {mat.alternativeGroup && (
                                        <span className="text-[10px] text-slate-400">
                                            组:{mat.alternativeGroup}
                                        </span>
                                    )}
                                    {/* 如果是替代料，显示对应的主料编码 */}
                                    {mat.isSubstitute && mat.primaryMaterialCode && (
                                        <span className="text-[10px] text-slate-400">
                                            →{mat.primaryMaterialCode.slice(-6)}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-4 flex-shrink-0">
                            <div className="text-right">
                                <div className="text-xs text-slate-500">库存</div>
                                <div className="text-sm font-medium text-slate-700">{formatQuantity(mat.totalStock)}</div>
                            </div>
                            <div className="flex items-center gap-1">
                                {mat.usedByProducts.map((p) => (
                                    <span key={p} className="px-1.5 py-0.5 text-[10px] font-medium bg-purple-100 text-purple-700 rounded">
                                        {p.slice(-3)}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {sharedMaterials.length > 5 && (
                <button
                    onClick={() => setExpanded(!expanded)}
                    className="mt-3 w-full py-2 text-xs font-medium text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded transition-colors"
                >
                    {expanded ? '收起' : `查看全部 ${sharedMaterials.length} 种共用物料`}
                </button>
            )}
        </div>
    );
};

// ============================================================================
// 子组件：优化建议
// ============================================================================

interface OptimizationSuggestionsProps {
    suggestions: string[];
}

const OptimizationSuggestions: React.FC<OptimizationSuggestionsProps> = ({ suggestions }) => {
    return (
        <div className="bg-white rounded-lg border border-slate-200 p-4">
            <div className="flex items-center gap-2 mb-3">
                <Lightbulb size={16} className="text-amber-500" />
                <h3 className="text-sm font-semibold text-slate-800">智能优化建议</h3>
            </div>
            <div className="space-y-2">
                {suggestions.map((suggestion, index) => (
                    <div key={index} className="flex items-start gap-2">
                        <ArrowRight size={14} className="text-amber-500 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-slate-600">{suggestion}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ============================================================================
// 主组件
// ============================================================================

export const GlobalOptimizationPanel: React.FC<GlobalOptimizationPanelProps> = ({
    bomTrees,
    loading = false,
}) => {
    // 计算全局优化结果
    const optimizationResult = useMemo(() => {
        return calculateGlobalOptimization(bomTrees);
    }, [bomTrees]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin"></div>
                    <span className="text-slate-500 text-sm">正在计算全局最优组合...</span>
                </div>
            </div>
        );
    }

    if (bomTrees.length === 0) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <BarChart3 size={48} className="text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500">暂无产品数据</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 p-4">
            {/* 汇总指标 */}
            <SummaryMetrics result={optimizationResult} productCount={bomTrees.length} />

            {/* 标题区域 */}
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg border border-amber-200 p-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                        <Target className="text-white" size={20} />
                    </div>
                    <div>
                        <h2 className="text-base font-bold text-amber-800">全局组合优化方案</h2>
                        <p className="text-sm text-amber-600">
                            基于物料共用关系和边际效益分析，推荐最优产品组合
                        </p>
                    </div>
                </div>
            </div>

            {/* 产品分配建议 */}
            <div>
                <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    <BarChart3 size={16} className="text-indigo-500" />
                    产品生产分配建议（按效益排序）
                </h3>
                <div className="grid grid-cols-3 gap-4">
                    {optimizationResult.allocations.map((allocation, index) => (
                        <ProductAllocationCard
                            key={allocation.productCode}
                            allocation={allocation}
                            rank={index + 1}
                        />
                    ))}
                </div>
            </div>

            {/* 底部区域 */}
            <div className="grid grid-cols-2 gap-4">
                {/* 共用物料分析 */}
                <SharedMaterialsCard sharedMaterials={optimizationResult.sharedMaterials} />

                {/* 优化建议 */}
                <OptimizationSuggestions suggestions={optimizationResult.optimizationSummary} />
            </div>
        </div>
    );
};

export default GlobalOptimizationPanel;
