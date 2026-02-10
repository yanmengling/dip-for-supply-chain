/**
 * 产品供应优化智能体组件
 * 
 * 基于供应链数据智能计算展示：
 * - 产品供应分析
 * - 优化建议
 * - 需求预测
 */

import React, { useState, useEffect } from 'react';
import { Loader2, TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Package, BarChart3 } from 'lucide-react';
import { calculateAllProductsSupplyAnalysis, type ProductSupplyAnalysis } from '../../services/productSupplyCalculator';

export const ProductSupplyAgent: React.FC = () => {
    const [analyses, setAnalyses] = useState<ProductSupplyAnalysis[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedProduct, setSelectedProduct] = useState<ProductSupplyAnalysis | null>(null);

    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                const data = await calculateAllProductsSupplyAnalysis();
                setAnalyses(data);
                if (data.length > 0) {
                    setSelectedProduct(data[0]);
                }
            } catch (err) {
                console.error('加载产品供应分析失败:', err);
                setError('加载数据失败');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, []);

    if (loading) {
        return (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
                <div className="flex items-center justify-center">
                    <Loader2 className="animate-spin text-indigo-500 mr-2" size={24} />
                    <span className="text-slate-600">正在分析产品供应数据...</span>
                </div>
            </div>
        );
    }

    if (error || analyses.length === 0) {
        return (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8">
                <p className="text-slate-500 text-center">{error || '暂无数据'}</p>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* 产品选择 */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">产品列表</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {analyses.map((analysis) => (
                        <button
                            key={analysis.productId}
                            onClick={() => setSelectedProduct(analysis)}
                            className={`p-4 rounded-lg border-2 transition-all text-left ${selectedProduct?.productId === analysis.productId
                                ? 'border-indigo-500 bg-indigo-50'
                                : 'border-slate-200 hover:border-indigo-300'
                                }`}
                        >
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <p className="font-medium text-slate-800 text-sm">{analysis.productName}</p>
                                    <p className="text-xs text-slate-500 mt-1">{analysis.productId}</p>
                                </div>
                                <div className={`px-2 py-1 rounded text-xs font-medium ${analysis.inventoryStatus.stockStatus === 'sufficient'
                                    ? 'bg-green-100 text-green-700'
                                    : analysis.inventoryStatus.stockStatus === 'warning'
                                        ? 'bg-yellow-100 text-yellow-700'
                                        : 'bg-red-100 text-red-700'
                                    }`}>
                                    {analysis.inventoryStatus.stockStatus === 'sufficient' ? '充足' :
                                        analysis.inventoryStatus.stockStatus === 'warning' ? '警告' : '紧急'}
                                </div>
                            </div>
                            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                <div>
                                    <span className="text-slate-500">库存:</span>
                                    <span className="ml-1 font-medium">{analysis.inventoryStatus.currentStock}</span>
                                </div>
                                <div>
                                    <span className="text-slate-500">可用:</span>
                                    <span className="ml-1 font-medium">{analysis.inventoryStatus.stockDays}天</span>
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* 产品详情 */}
            {selectedProduct && (
                <>
                    {/* 库存状态 */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                        <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                            <Package size={20} className="text-indigo-500" />
                            库存状态
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="p-4 bg-slate-50 rounded-lg">
                                <p className="text-sm text-slate-500">当前库存</p>
                                <p className="text-2xl font-bold text-slate-800 mt-1">
                                    {selectedProduct.inventoryStatus.currentStock}
                                </p>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-lg">
                                <p className="text-sm text-slate-500">安全库存</p>
                                <p className="text-2xl font-bold text-slate-800 mt-1">
                                    {selectedProduct.inventoryStatus.safetyStock}
                                </p>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-lg">
                                <p className="text-sm text-slate-500">可用天数</p>
                                <p className="text-2xl font-bold text-slate-800 mt-1">
                                    {selectedProduct.inventoryStatus.stockDays}
                                </p>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-lg">
                                <p className="text-sm text-slate-500">状态</p>
                                <p className={`text-lg font-bold mt-1 ${selectedProduct.inventoryStatus.stockStatus === 'sufficient'
                                    ? 'text-green-600'
                                    : selectedProduct.inventoryStatus.stockStatus === 'warning'
                                        ? 'text-yellow-600'
                                        : 'text-red-600'
                                    }`}>
                                    {selectedProduct.inventoryStatus.stockStatus === 'sufficient' ? '充足' :
                                        selectedProduct.inventoryStatus.stockStatus === 'warning' ? '警告' : '紧急'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* 需求趋势 */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                        <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                            <BarChart3 size={20} className="text-indigo-500" />
                            需求趋势
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="p-4 bg-slate-50 rounded-lg">
                                <p className="text-sm text-slate-500">近30天需求</p>
                                <p className="text-2xl font-bold text-slate-800 mt-1">
                                    {selectedProduct.demandTrend.last30DaysDemand}
                                </p>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-lg">
                                <p className="text-sm text-slate-500">近90天需求</p>
                                <p className="text-2xl font-bold text-slate-800 mt-1">
                                    {selectedProduct.demandTrend.last90DaysDemand}
                                </p>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-lg">
                                <p className="text-sm text-slate-500">平均日需求</p>
                                <p className="text-2xl font-bold text-slate-800 mt-1">
                                    {Math.round(selectedProduct.demandTrend.averageDailyDemand)}
                                </p>
                            </div>
                            <div className="p-4 bg-slate-50 rounded-lg">
                                <p className="text-sm text-slate-500">增长率</p>
                                <p className={`text-2xl font-bold mt-1 flex items-center gap-1 ${selectedProduct.demandTrend.demandGrowthRate > 0 ? 'text-green-600' : 'text-red-600'
                                    }`}>
                                    {selectedProduct.demandTrend.demandGrowthRate > 0 ? (
                                        <TrendingUp size={20} />
                                    ) : (
                                        <TrendingDown size={20} />
                                    )}
                                    {Math.abs(selectedProduct.demandTrend.demandGrowthRate).toFixed(1)}%
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* 供应风险 */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                        <h3 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                            <AlertTriangle size={20} className="text-indigo-500" />
                            供应风险评估
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <div className="flex items-center justify-between mb-4">
                                    <span className="text-sm font-medium text-slate-700">风险等级</span>
                                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${selectedProduct.supplyRisk.riskLevel === 'low'
                                        ? 'bg-green-100 text-green-700'
                                        : selectedProduct.supplyRisk.riskLevel === 'medium'
                                            ? 'bg-yellow-100 text-yellow-700'
                                            : 'bg-red-100 text-red-700'
                                        }`}>
                                        {selectedProduct.supplyRisk.riskLevel === 'low' ? '低风险' :
                                            selectedProduct.supplyRisk.riskLevel === 'medium' ? '中风险' : '高风险'}
                                    </span>
                                </div>
                                <div className="space-y-2">
                                    {Object.entries(selectedProduct.supplyRisk.riskFactors).map(([key, value]) => (
                                        <div key={key} className="flex items-center justify-between text-sm">
                                            <span className="text-slate-600">
                                                {key === 'materialShortage' ? '物料短缺' :
                                                    key === 'supplierConcentration' ? '供应商集中' :
                                                        key === 'longLeadTime' ? '交付周期长' : '价格波动'}
                                            </span>
                                            {value ? (
                                                <AlertTriangle size={16} className="text-red-500" />
                                            ) : (
                                                <CheckCircle size={16} className="text-green-500" />
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            {selectedProduct.supplyRisk.bottleneckMaterials.length > 0 && (
                                <div>
                                    <p className="text-sm font-medium text-slate-700 mb-2">瓶颈物料</p>
                                    <div className="space-y-1">
                                        {selectedProduct.supplyRisk.bottleneckMaterials.map((material, idx) => (
                                            <div key={idx} className="text-sm text-slate-600 bg-red-50 px-3 py-2 rounded">
                                                {material}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 优化建议 */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {/* 库存优化 */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                            <h4 className="font-semibold text-slate-800 mb-3">库存优化</h4>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-slate-500">推荐库存:</span>
                                    <span className="font-medium">{selectedProduct.inventoryOptimization.recommendedStock}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">调整动作:</span>
                                    <span className={`font-medium ${selectedProduct.inventoryOptimization.adjustmentAction === 'increase' ? 'text-blue-600' :
                                        selectedProduct.inventoryOptimization.adjustmentAction === 'decrease' ? 'text-orange-600' :
                                            'text-green-600'
                                        }`}>
                                        {selectedProduct.inventoryOptimization.adjustmentAction === 'increase' ? '增加' :
                                            selectedProduct.inventoryOptimization.adjustmentAction === 'decrease' ? '减少' : '维持'}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-600 mt-3 p-2 bg-slate-50 rounded">
                                    {selectedProduct.inventoryOptimization.reason}
                                </p>
                            </div>
                        </div>

                        {/* NPI建议 */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                            <h4 className="font-semibold text-slate-800 mb-3">NPI选型</h4>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-slate-500">综合评分:</span>
                                    <span className="font-medium">{selectedProduct.npiRecommendation.score.toFixed(0)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">推荐度:</span>
                                    <span className={`font-medium ${selectedProduct.npiRecommendation.isRecommended ? 'text-green-600' : 'text-red-600'
                                        }`}>
                                        {selectedProduct.npiRecommendation.isRecommended ? '推荐' : '不推荐'}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-600 mt-3 p-2 bg-slate-50 rounded">
                                    {selectedProduct.npiRecommendation.suggestion}
                                </p>
                            </div>
                        </div>

                        {/* EOL建议 */}
                        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
                            <h4 className="font-semibold text-slate-800 mb-3">EOL决策</h4>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-slate-500">EOL评分:</span>
                                    <span className="font-medium">{selectedProduct.eolRecommendation.eolScore.toFixed(0)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-slate-500">建议:</span>
                                    <span className={`font-medium ${selectedProduct.eolRecommendation.shouldEOL ? 'text-red-600' : 'text-green-600'
                                        }`}>
                                        {selectedProduct.eolRecommendation.shouldEOL ? '建议EOL' : '继续销售'}
                                    </span>
                                </div>
                                <p className="text-xs text-slate-600 mt-3 p-2 bg-slate-50 rounded">
                                    {selectedProduct.eolRecommendation.recommendation}
                                </p>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};
