/**
 * 生产数量分析面板 (Phase 2)
 *
 * 按照机器人事业部的设计:
 * - 按起订量分析: 实际补料金额与剩余呆滞料金额随生产数量的变化
 * - 无起订量分析: 实际补料金额与新增呆滞金额随生产数量的变化
 * 
 * 图表特征:
 * - 红色曲线(左Y轴): 实际补料金额 - 递增趋势
 * - 蓝色曲线(右Y轴): 剩余呆滞料金额 - 递减趋势
 */

import { useMemo } from 'react';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';
import {
    TrendingUp,
    Package,
    AlertTriangle,
    Lightbulb,
    Target,
    BarChart3,
} from 'lucide-react';
import type { ProductionAnalysisResult, MaterialRequirement } from '../../../services/bomInventoryService';

// ============================================================================
// 类型定义
// ============================================================================

interface ProductionAnalysisPanelProps {
    analysisResult: ProductionAnalysisResult | null;
    loading?: boolean;
}

interface ChartDataPoint {
    quantity: number;
    replenishment: number;      // 实际补料金额 (红色, 递增)
    remainingStagnant: number;  // 剩余呆滞料金额 (蓝色, 递减)
}

interface DataAnalysis {
    startPoint: number;           // 起始分析点
    startMaterial: string;        // 起始物料名称
    startStock: number;           // 起始物料库存
    optimalPoint: number;         // 最优生产节点
    optimalReason: string;        // 最优原因
    linearRelation: boolean;      // 是否线性关系
    slopeDescription: string;     // 斜率描述
    recommendation: string;       // 决策建议
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 格式化金额
 */
function formatCurrency(value: number): string {
    if (Math.abs(value) >= 10000) {
        return `${(value / 10000).toFixed(1)}万`;
    }
    return value.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

/**
 * 格式化数量
 */
function formatQuantity(value: number): string {
    return value.toLocaleString('zh-CN');
}

/**
 * 分析数据特征 - 基于专家分析逻辑
 * 
 * 最优生产节点的判定标准（按优先级）：
 * 1. 呆滞消耗边际效益：每增加1套生产消耗的呆滞金额 vs 新增补料金额的比值
 * 2. 当呆滞消耗效率显著下降（边际效益 < 1）时，达到最优点
 * 3. 综合考虑：在补料成本增速加快前的最后一个高效消耗点
 */
function analyzeData(
    data: ChartDataPoint[],
    topMaterials: MaterialRequirement[],
    withMOQ: boolean
): DataAnalysis {
    if (data.length < 2) {
        return {
            startPoint: 500,
            startMaterial: '未知物料',
            startStock: 0,
            optimalPoint: 1000,
            optimalReason: '平衡补料与呆滞',
            linearRelation: true,
            slopeDescription: '斜率较直',
            recommendation: '建议根据市场需求来做决策'
        };
    }

    // 找到起始分析点（第一个有数据的点）
    const startPoint = data[0].quantity;

    // 获取最高价值物料信息
    const topMaterial = topMaterials[0];
    const startMaterial = topMaterial?.name || '高价值物料';
    // 使用库存金额推算数量（假设平均单价约100元/单位）
    const startStock = topMaterial ? Math.floor(topMaterial.stockValue / 100) : 500;

    // 计算最优生产节点 - 基于边际效益分析
    let optimalPoint = startPoint;
    let bestEfficiencyRatio = 0;

    for (let i = 1; i < data.length; i++) {
        // 计算边际呆滞消耗（每增加1套消耗的呆滞金额）
        const stagnantConsumed = data[i - 1].remainingStagnant - data[i].remainingStagnant;
        // 计算边际补料增加（每增加1套需要的补料金额）
        const replenishmentAdded = data[i].replenishment - data[i - 1].replenishment;
        const quantityStep = data[i].quantity - data[i - 1].quantity;

        if (quantityStep > 0 && replenishmentAdded > 0) {
            // 效益比 = 消耗的呆滞金额 / 新增的补料金额
            const efficiencyRatio = stagnantConsumed / replenishmentAdded;

            // 找到效益比开始下降前的最优点
            // 当效益比还大于1（消耗呆滞比新增补料多）且仍有呆滞可消耗时，继续推进
            if (efficiencyRatio > 1 && data[i].remainingStagnant > 0) {
                if (efficiencyRatio >= bestEfficiencyRatio * 0.7) { // 允许效率下降30%
                    optimalPoint = data[i].quantity;
                    bestEfficiencyRatio = Math.max(bestEfficiencyRatio, efficiencyRatio);
                }
            } else if (optimalPoint === startPoint && data[i].remainingStagnant > 0) {
                // 如果从未达到效益比>1，取中间点作为平衡点
                optimalPoint = data[i].quantity;
            }
        }
    }

    // 如果最优点还是起始点，取数据中间位置作为合理建议
    if (optimalPoint === startPoint && data.length > 3) {
        const midIndex = Math.floor(data.length / 2);
        optimalPoint = data[midIndex].quantity;
    }

    // 计算线性关系 - 分析前后半段斜率
    const firstHalf = data.slice(0, Math.floor(data.length / 2));
    const secondHalf = data.slice(Math.floor(data.length / 2));

    const slope1 = firstHalf.length > 1
        ? (firstHalf[firstHalf.length - 1].replenishment - firstHalf[0].replenishment) /
        (firstHalf[firstHalf.length - 1].quantity - firstHalf[0].quantity)
        : 0;
    const slope2 = secondHalf.length > 1
        ? (secondHalf[secondHalf.length - 1].replenishment - secondHalf[0].replenishment) /
        (secondHalf[secondHalf.length - 1].quantity - secondHalf[0].quantity)
        : 0;

    const linearRelation = Math.abs(slope1 - slope2) < slope1 * 0.5; // 斜率变化小于50%认为是线性
    const slopeDescription = linearRelation ? '斜率较平缓' : '斜率变化明显';

    return {
        startPoint,
        startMaterial,
        startStock,
        optimalPoint,
        optimalReason: withMOQ ? '呆滞消耗边际效益最优' : '投入产出平衡点',
        linearRelation,
        slopeDescription,
        recommendation: '建议根据市场需求来做决策'
    };
}

// ============================================================================
// 子组件：分析图表（带右侧文字分析）
// ============================================================================

interface HuidaStyleChartProps {
    title: string;
    chartTitle: string;
    data: ChartDataPoint[];
    analysis: DataAnalysis;
    withMOQ: boolean;
    totalStagnantValue: number;
}

const HuidaStyleChart: React.FC<HuidaStyleChartProps> = ({
    title,
    chartTitle,
    data,
    analysis,
    withMOQ,
    totalStagnantValue
}) => {
    // 计算Y轴范围
    const maxReplenishment = Math.max(...data.map(d => d.replenishment), 1);
    const maxStagnant = Math.max(...data.map(d => d.remainingStagnant), 1);

    // 找到最优点的数据
    const optimalData = data.find(d => d.quantity === analysis.optimalPoint) || data[Math.floor(data.length / 2)];

    // 计算关键数据
    const minReplenishment = Math.min(...data.map(d => d.replenishment));
    const stagnantReduction = data.length > 0
        ? data[0].remainingStagnant - (data[data.length - 1]?.remainingStagnant || 0)
        : 0;

    return (
        <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden">
            {/* 标题栏 */}
            <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-amber-50 to-orange-50">
                <h3 className="text-base font-bold text-amber-800">{title}</h3>
            </div>

            {/* 内容区域：图表 + 分析 */}
            <div className="flex">
                {/* 左侧图表 */}
                <div className="flex-1 p-4 min-w-0">
                    {/* 图表标题 */}
                    <div className="text-center mb-2">
                        <span className="text-sm text-slate-600">{chartTitle}</span>
                    </div>

                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data} margin={{ top: 10, right: 60, left: 60, bottom: 30 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />

                                <XAxis
                                    dataKey="quantity"
                                    tick={{ fontSize: 11, fill: '#374151' }}
                                    tickFormatter={(v) => String(v)}
                                    axisLine={{ stroke: '#9ca3af' }}
                                    tickLine={{ stroke: '#9ca3af' }}
                                    label={{
                                        value: '生产数量',
                                        position: 'insideBottom',
                                        offset: -15,
                                        fontSize: 12,
                                        fill: '#374151'
                                    }}
                                />

                                {/* 左Y轴 - 实际补料金额 (红色) */}
                                <YAxis
                                    yAxisId="left"
                                    orientation="left"
                                    tick={{ fontSize: 11, fill: '#dc2626' }}
                                    tickFormatter={(v) => formatCurrency(v)}
                                    axisLine={{ stroke: '#dc2626', strokeWidth: 1 }}
                                    tickLine={{ stroke: '#dc2626' }}
                                    domain={[0, maxReplenishment * 1.1]}
                                    label={{
                                        value: '实际补料金额',
                                        angle: -90,
                                        position: 'insideLeft',
                                        offset: 0,
                                        fontSize: 11,
                                        fill: '#dc2626',
                                        style: { textAnchor: 'middle' }
                                    }}
                                />

                                {/* 右Y轴 - 剩余呆滞料金额 (蓝色) */}
                                <YAxis
                                    yAxisId="right"
                                    orientation="right"
                                    tick={{ fontSize: 11, fill: '#2563eb' }}
                                    tickFormatter={(v) => formatCurrency(v)}
                                    axisLine={{ stroke: '#2563eb', strokeWidth: 1 }}
                                    tickLine={{ stroke: '#2563eb' }}
                                    domain={[0, maxStagnant * 1.1]}
                                    label={{
                                        value: withMOQ ? '剩余呆滞料金额' : '新增呆滞金额',
                                        angle: 90,
                                        position: 'insideRight',
                                        offset: 0,
                                        fontSize: 11,
                                        fill: '#2563eb',
                                        style: { textAnchor: 'middle' }
                                    }}
                                />

                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'white',
                                        border: '1px solid #e5e7eb',
                                        borderRadius: '6px',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                                    }}
                                    formatter={(value: number, name: string) => {
                                        const label = name === 'replenishment'
                                            ? '实际补料金额'
                                            : (withMOQ ? '剩余呆滞料金额' : '新增呆滞金额');
                                        return [`¥${formatCurrency(value)}`, label];
                                    }}
                                    labelFormatter={(label) => `生产数量: ${formatQuantity(label as number)} 套`}
                                />

                                {/* 实际补料金额曲线 (红色，递增) */}
                                <Line
                                    yAxisId="left"
                                    type="monotone"
                                    dataKey="replenishment"
                                    stroke="#dc2626"
                                    strokeWidth={2}
                                    dot={{ fill: '#dc2626', strokeWidth: 0, r: 4 }}
                                    activeDot={{ r: 6, stroke: '#dc2626', strokeWidth: 2, fill: 'white' }}
                                />

                                {/* 剩余呆滞料金额曲线 (蓝色，递减) */}
                                <Line
                                    yAxisId="right"
                                    type="monotone"
                                    dataKey="remainingStagnant"
                                    stroke="#2563eb"
                                    strokeWidth={2}
                                    dot={{ fill: '#2563eb', strokeWidth: 0, r: 4 }}
                                    activeDot={{ r: 6, stroke: '#2563eb', strokeWidth: 2, fill: 'white' }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>

                    {/* 图例 */}
                    <div className="flex items-center justify-center gap-8 mt-2">
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-0.5 bg-red-600"></div>
                            <div className="w-2 h-2 rounded-full bg-red-600"></div>
                            <span className="text-xs text-slate-600">实际补料金额</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <div className="w-4 h-0.5 bg-blue-600"></div>
                            <div className="w-2 h-2 rounded-full bg-blue-600"></div>
                            <span className="text-xs text-slate-600">{withMOQ ? '剩余呆滞料金额' : '新增呆滞金额'}</span>
                        </div>
                    </div>
                </div>

                {/* 右侧分析文字 */}
                <div className="w-72 p-4 bg-slate-50 border-l border-slate-200">
                    <div className="space-y-4">
                        <h4 className="text-sm font-bold text-slate-800">数据分析{withMOQ ? '' : '（无起定量）'}：</h4>

                        {withMOQ ? (
                            // 按起订量分析的详细文字
                            <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
                                <p>
                                    原则是生产数量的权重最低，消耗呆滞料和新增补料的权重最高
                                </p>
                                <p>
                                    <span className="font-medium">1、</span>
                                    因{analysis.startMaterial}金额大库存{analysis.startStock}台，因此从生产{analysis.startPoint}套开始分析，此时投入金额最低只需¥{formatCurrency(minReplenishment)}，剩余呆滞¥{formatCurrency(totalStagnantValue)}，减少呆滞¥{formatCurrency(stagnantReduction)}；
                                </p>
                                <p>
                                    <span className="font-medium">2、</span>
                                    {analysis.startPoint}-{analysis.optimalPoint}套的新增投入金额增长缓慢，但是消耗的呆滞金额明显，因此从消耗呆滞的角度看，{analysis.optimalPoint}套是个最优的生产数量节点；
                                </p>
                                <p>
                                    <span className="font-medium">3、</span>
                                    {analysis.optimalPoint}套以上的数量投入和产出成正比例关系，即跟产品数量的关系更大，如果不好售卖的情况下是无意义的；
                                </p>
                            </div>
                        ) : (
                            // 无起订量分析的文字
                            <div className="space-y-3 text-sm text-slate-700 leading-relaxed">
                                <p>
                                    图标中看新增金额和消耗呆滞同生产数量之间是比例线性关系，{analysis.slopeDescription}，因此实际生产数量的权重比较高；
                                </p>
                                <p className="font-medium text-amber-700">
                                    {analysis.recommendation}；
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ============================================================================
// 子组件：高价值物料列表
// ============================================================================

interface TopMaterialsCardProps {
    materials: MaterialRequirement[];
}

const TopMaterialsCard: React.FC<TopMaterialsCardProps> = ({ materials }) => {
    return (
        <div className="bg-white rounded-lg border border-slate-200 p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
                    <Package size={16} className="text-white" />
                </div>
                <div>
                    <h3 className="text-sm font-semibold text-slate-800">高价值物料 (Top 5)</h3>
                    <p className="text-xs text-slate-500">建议作为生产规划起点</p>
                </div>
            </div>

            <div className="space-y-2">
                {materials.slice(0, 5).map((material, index) => (
                    <div
                        key={material.code}
                        className="flex items-center justify-between py-2 px-3 bg-slate-50 rounded-lg"
                    >
                        <div className="flex items-center gap-3 min-w-0">
                            <span className={`w-6 h-6 flex items-center justify-center text-xs font-bold rounded-full ${index === 0 ? 'bg-amber-500 text-white' :
                                    index === 1 ? 'bg-slate-400 text-white' :
                                        index === 2 ? 'bg-amber-700 text-white' :
                                            'bg-slate-200 text-slate-600'
                                }`}>
                                {index + 1}
                            </span>
                            <div className="min-w-0">
                                <div className="text-sm font-medium text-slate-700 truncate" title={material.name}>
                                    {material.name}
                                </div>
                                <div className="text-xs text-slate-400">{material.code}</div>
                            </div>
                        </div>
                        <div className="flex flex-col items-end flex-shrink-0">
                            <span className="text-sm font-bold text-amber-600">
                                ¥{formatCurrency(material.stockValue)}
                            </span>
                            {material.isStagnant && (
                                <span className="text-[10px] text-red-500 flex items-center gap-0.5">
                                    <AlertTriangle size={10} />
                                    呆滞
                                </span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ============================================================================
// 子组件：关键指标卡片
// ============================================================================

interface KeyMetricsProps {
    maxProducible: number;
    crossPoint: number;
    totalStagnantValue: number;
    topMaterialCount: number;
}

const KeyMetrics: React.FC<KeyMetricsProps> = ({
    maxProducible,
    crossPoint,
    totalStagnantValue,
    topMaterialCount
}) => {
    return (
        <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-1 text-slate-500">
                    <TrendingUp size={16} className="text-emerald-500" />
                    <span className="text-xs font-medium">最大可生产</span>
                </div>
                <div className="text-2xl font-bold text-slate-800">
                    {formatQuantity(maxProducible)}
                </div>
                <div className="text-xs text-slate-400 mt-1">套 (无需采购)</div>
            </div>

            <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-1 text-slate-500">
                    <Target size={16} className="text-purple-500" />
                    <span className="text-xs font-medium">最优生产节点</span>
                </div>
                <div className="text-2xl font-bold text-slate-800">
                    {crossPoint > 0 ? formatQuantity(crossPoint) : '-'}
                </div>
                <div className="text-xs text-slate-400 mt-1">套 (平衡呆滞消耗)</div>
            </div>

            <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-1 text-slate-500">
                    <AlertTriangle size={16} className="text-amber-500" />
                    <span className="text-xs font-medium">呆滞库存总值</span>
                </div>
                <div className="text-2xl font-bold text-slate-800">
                    ¥{formatCurrency(totalStagnantValue)}
                </div>
                <div className="text-xs text-slate-400 mt-1">待消耗</div>
            </div>

            <div className="bg-white rounded-lg p-4 border border-slate-200 shadow-sm">
                <div className="flex items-center gap-2 mb-1 text-slate-500">
                    <Package size={16} className="text-blue-500" />
                    <span className="text-xs font-medium">高价值物料</span>
                </div>
                <div className="text-2xl font-bold text-slate-800">
                    {topMaterialCount}
                </div>
                <div className="text-xs text-slate-400 mt-1">种 (优先消耗)</div>
            </div>
        </div>
    );
};

// ============================================================================
// 子组件：智能分析结论
// ============================================================================

interface AnalysisConclusionsProps {
    conclusions: string[];
}

const AnalysisConclusions: React.FC<AnalysisConclusionsProps> = ({ conclusions }) => {
    return (
        <div className="bg-gradient-to-br from-indigo-50 via-purple-50 to-blue-50 rounded-lg p-4 border border-indigo-100">
            <div className="flex items-center gap-2 text-indigo-700 mb-3">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
                    <Lightbulb size={16} className="text-white" />
                </div>
                <h3 className="text-sm font-bold">智能分析结论</h3>
            </div>
            <div className="space-y-2">
                {conclusions.map((conclusion, index) => (
                    <div key={index} className="flex items-start gap-2">
                        <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                            <span className="text-xs font-bold text-indigo-600">{index + 1}</span>
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed">
                            {conclusion.replace(/^• /, '')}
                        </p>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ============================================================================
// 主组件
// ============================================================================

export const ProductionAnalysisPanel: React.FC<ProductionAnalysisPanelProps> = ({
    analysisResult,
    loading = false
}) => {
    // 构建图表数据 - 按起订量分析
    // 红色: 实际补料金额 (newProcurementCosts - 需要采购的)
    // 蓝色: 剩余呆滞料金额 (计算：总库存 - 已消耗的)
    // 注意：暂时把所有库存都当作呆滞库存处理
    const chartDataWithMOQ = useMemo(() => {
        if (!analysisResult) return [];

        // 使用所有物料的总库存价值，而不是只用前10个
        const totalStagnant = analysisResult.totalInventoryValue ||
            analysisResult.topExpensiveMaterials.reduce((sum, m) => sum + m.stockValue, 0);

        return analysisResult.productionQuantities.map((qty, i) => ({
            quantity: qty,
            replenishment: analysisResult.newProcurementCostsWithMOQ[i], // 实际补料金额
            remainingStagnant: Math.max(0, totalStagnant - analysisResult.replenishmentCostsWithMOQ[i]), // 剩余呆滞
        }));
    }, [analysisResult]);

    // 构建图表数据 - 无起订量分析
    const chartDataNoMOQ = useMemo(() => {
        if (!analysisResult) return [];

        // 使用所有物料的总库存价值，而不是只用前10个
        const totalStagnant = analysisResult.totalInventoryValue ||
            analysisResult.topExpensiveMaterials.reduce((sum, m) => sum + m.stockValue, 0);

        return analysisResult.productionQuantities.map((qty, i) => ({
            quantity: qty,
            replenishment: analysisResult.newProcurementCosts[i], // 实际补料金额
            remainingStagnant: Math.max(0, totalStagnant - analysisResult.replenishmentCosts[i]), // 新增呆滞
        }));
    }, [analysisResult]);

    // 数据分析 - 有起订量
    const analysisWithMOQ = useMemo(() => {
        return analyzeData(chartDataWithMOQ, analysisResult?.topExpensiveMaterials || [], true);
    }, [chartDataWithMOQ, analysisResult?.topExpensiveMaterials]);

    // 数据分析 - 无起订量
    const analysisNoMOQ = useMemo(() => {
        return analyzeData(chartDataNoMOQ, analysisResult?.topExpensiveMaterials || [], false);
    }, [chartDataNoMOQ, analysisResult?.topExpensiveMaterials]);

    // 计算总呆滞价值（所有库存都当作呆滞）
    const totalStagnantValue = useMemo(() => {
        if (!analysisResult) return 0;
        // 使用所有物料的总库存价值
        return analysisResult.totalInventoryValue ||
            analysisResult.topExpensiveMaterials.reduce((sum, m) => sum + m.stockValue, 0);
    }, [analysisResult]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 border-4 border-amber-200 border-t-amber-600 rounded-full animate-spin"></div>
                    <span className="text-slate-500 text-sm">正在分析生产数据...</span>
                </div>
            </div>
        );
    }

    if (!analysisResult) {
        return (
            <div className="flex items-center justify-center h-96">
                <div className="text-center">
                    <BarChart3 size={48} className="text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500">请选择产品进行分析</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 p-4">
            {/* 关键指标卡片 - 使用分析得出的最优生产节点 */}
            <KeyMetrics
                maxProducible={analysisResult.maxProducibleWithoutPurchase}
                crossPoint={analysisWithMOQ.optimalPoint}
                totalStagnantValue={totalStagnantValue}
                topMaterialCount={analysisResult.topExpensiveMaterials.length}
            />

            {/* 按起订量分析 */}
            <HuidaStyleChart
                title="1. 按起订量分析"
                chartTitle="实际补料金额与剩余呆滞料金额随生产数量的变化"
                data={chartDataWithMOQ}
                analysis={analysisWithMOQ}
                withMOQ={true}
                totalStagnantValue={totalStagnantValue}
            />

            {/* 无起订量分析 */}
            <HuidaStyleChart
                title="2. 无起订量分析"
                chartTitle="实际补料金额与新增呆滞金额随生产数量的变化"
                data={chartDataNoMOQ}
                analysis={analysisNoMOQ}
                withMOQ={false}
                totalStagnantValue={totalStagnantValue}
            />

            {/* 底部区域 */}
            <div className="grid grid-cols-2 gap-4">
                {/* 智能分析结论 */}
                <AnalysisConclusions conclusions={analysisResult.analysisConclusions} />

                {/* 高价值物料列表 */}
                <TopMaterialsCard materials={analysisResult.topExpensiveMaterials} />
            </div>
        </div>
    );
};

export default ProductionAnalysisPanel;
