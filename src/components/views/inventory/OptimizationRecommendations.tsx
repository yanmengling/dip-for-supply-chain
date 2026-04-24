/**
 * 库存优化 - 自动分析结果展示
 * 
 * 步骤 1: 展示系统自动分析的优化方案推荐
 */

import { useMemo } from 'react';
import { TrendingUp, Package, DollarSign, ArrowRight, Award, Zap } from 'lucide-react';
import type { ProductOptimizationResult } from '../../../services/inventoryOptimizationAnalyzer';

interface OptimizationRecommendationsProps {
    results: ProductOptimizationResult[];
    totalInventoryValue: number;
    totalMaterialCount: number;
    onSelectPlan: (result: ProductOptimizationResult) => void;
    loading?: boolean;
}

export const OptimizationRecommendations = ({
    results,
    totalInventoryValue,
    totalMaterialCount,
    onSelectPlan,
    loading,
}: OptimizationRecommendationsProps) => {

    // 计算可优化的总价值（取最高消纳价值的方案）
    const maxConsumableValue = useMemo(() => {
        if (results.length === 0) return 0;
        return results[0].consumableValue;
    }, [results]);

    if (loading) {
        return (
            <div className="space-y-6">
                <div className="animate-pulse">
                    <div className="grid grid-cols-3 gap-4 mb-6">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-24 bg-slate-200 rounded-lg"></div>
                        ))}
                    </div>
                    <div className="space-y-4">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="h-32 bg-slate-200 rounded-lg"></div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* 库存概况 KPI */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-blue-600 font-medium">库存物料</p>
                            <p className="text-2xl font-bold text-blue-900 mt-1">
                                {totalMaterialCount} 种
                            </p>
                        </div>
                        <Package className="w-8 h-8 text-blue-600 opacity-50" />
                    </div>
                </div>

                <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-purple-600 font-medium">库存总价值</p>
                            <p className="text-2xl font-bold text-purple-900 mt-1">
                                ¥{totalInventoryValue.toLocaleString()}
                            </p>
                        </div>
                        <DollarSign className="w-8 h-8 text-purple-600 opacity-50" />
                    </div>
                </div>

                <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-green-600 font-medium">最大可优化</p>
                            <p className="text-2xl font-bold text-green-900 mt-1">
                                ¥{maxConsumableValue.toLocaleString()}
                            </p>
                            <p className="text-xs text-green-600 mt-1">
                                {totalInventoryValue > 0
                                    ? `${((maxConsumableValue / totalInventoryValue) * 100).toFixed(1)}% 消纳率`
                                    : '-'
                                }
                            </p>
                        </div>
                        <TrendingUp className="w-8 h-8 text-green-600 opacity-50" />
                    </div>
                </div>
            </div>

            {/* 优化方案列表 */}
            <div className="bg-white rounded-lg border border-slate-200">
                <div className="p-4 border-b border-slate-200">
                    <h3 className="font-semibold text-slate-900 flex items-center gap-2">
                        <Zap className="w-5 h-5 text-amber-500" />
                        优化方案推荐
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">
                        系统已自动分析 {results.length} 个产品，按库存消纳价值排序
                    </p>
                </div>

                <div className="divide-y divide-slate-200">
                    {results.map((result, index) => (
                        <div
                            key={result.product.code}
                            className={`p-4 hover:bg-slate-50 cursor-pointer transition-colors ${result.isRecommended ? 'bg-amber-50/50' : ''
                                }`}
                            onClick={() => onSelectPlan(result)}
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    {/* 标题行 */}
                                    <div className="flex items-center gap-2">
                                        {result.isRecommended && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded-full">
                                                <Award className="w-3 h-3" />
                                                推荐
                                            </span>
                                        )}
                                        <h4 className="font-semibold text-slate-900">
                                            {result.product.name}
                                        </h4>
                                        <span className="text-sm text-slate-500">
                                            ({result.product.code})
                                        </span>
                                    </div>

                                    {/* 型号 */}
                                    <p className="text-sm text-slate-500 mt-1">
                                        {result.product.model}
                                    </p>

                                    {/* 指标 */}
                                    <div className="grid grid-cols-4 gap-4 mt-3">
                                        <div>
                                            <p className="text-xs text-slate-500">可消纳价值</p>
                                            <p className="text-lg font-semibold text-green-600">
                                                ¥{result.consumableValue.toLocaleString()}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500">消纳率</p>
                                            <p className="text-lg font-semibold text-blue-600">
                                                {result.consumptionRate.toFixed(1)}%
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500">涉及物料</p>
                                            <p className="text-lg font-semibold text-slate-700">
                                                {result.matchedMaterialCount}/{result.totalBOMMaterialCount}
                                            </p>
                                        </div>
                                        <div>
                                            <p className="text-xs text-slate-500">可生产</p>
                                            <p className="text-lg font-semibold text-slate-700">
                                                {result.maxProducibleQuantity.toLocaleString()} 件
                                            </p>
                                        </div>
                                    </div>

                                    {/* 补料信息 */}
                                    <div className="flex items-center gap-4 mt-2 text-sm">
                                        <span className="text-slate-600">
                                            补料成本:
                                            <span className={`font-medium ml-1 ${result.supplementCost > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                                                ¥{result.supplementCost.toLocaleString()}
                                            </span>
                                        </span>
                                        <span className="text-slate-600">
                                            产出价值:
                                            <span className="font-medium ml-1 text-blue-600">
                                                ¥{result.outputValue.toLocaleString()}
                                            </span>
                                        </span>
                                    </div>
                                </div>

                                {/* 箭头 */}
                                <div className="flex items-center h-full">
                                    <ArrowRight className="w-5 h-5 text-slate-400" />
                                </div>
                            </div>
                        </div>
                    ))}

                    {results.length === 0 && (
                        <div className="p-8 text-center text-slate-500">
                            <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                            <p>未找到可优化的方案</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
