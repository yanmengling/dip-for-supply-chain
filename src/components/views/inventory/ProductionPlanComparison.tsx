/**
 * 步骤 3: 生产方案对比
 * 
 * 并排对比两种生产方案
 */

import { ArrowLeft, CheckCircle, AlertTriangle, Lightbulb, TrendingUp, DollarSign } from 'lucide-react';
import type { ProductionPlan } from '../../../types/stagnantInventory';

interface ProductionPlanComparisonProps {
    planA: ProductionPlan;
    planB: ProductionPlan;
    onBack: () => void;
}

export const ProductionPlanComparison = ({ planA, planB, onBack }: ProductionPlanComparisonProps) => {
    // 判断推荐哪个方案
    const recommendedPlan = planB.roi > planA.roi ? 'B' : 'A';

    return (
        <div className="space-y-6">
            {/* 产品信息 */}
            <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-semibold text-slate-900">
                    产品: {planA.product.name}
                </h3>
                <p className="text-sm text-slate-600 mt-1">
                    {planA.product.model}
                </p>
            </div>

            {/* 方案对比卡片 */}
            <div className="grid grid-cols-2 gap-6">
                {/* 方案 A */}
                <div className={`bg-white rounded-lg border-2 ${recommendedPlan === 'A' ? 'border-blue-500' : 'border-slate-200'}`}>
                    <div className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-slate-900">
                                方案 A: 最大化消纳
                            </h3>
                            {recommendedPlan === 'A' && (
                                <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-semibold rounded">
                                    推荐
                                </span>
                            )}
                        </div>

                        <p className="text-sm text-slate-600 mb-4">允许补料</p>

                        {/* 关键指标 */}
                        <div className="space-y-4">
                            <div>
                                <p className="text-sm text-slate-600 mb-1">🎯 可生产数量</p>
                                <p className="text-3xl font-bold text-slate-900">{planA.quantity} 件</p>
                            </div>

                            <div>
                                <p className="text-sm text-slate-600 mb-1">💰 补料成本</p>
                                <p className="text-xl font-semibold text-orange-600">
                                    ¥{planA.totalCost.toLocaleString()}
                                </p>
                                <p className="text-xs text-slate-500 mt-1">
                                    ({planA.supplementMaterials.length} 种物料)
                                </p>
                            </div>

                            <div>
                                <p className="text-sm text-slate-600 mb-1">♻️ 呆滞料消纳</p>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-green-600 rounded-full"
                                            style={{ width: `${planA.stagnantConsumptionRate}%` }}
                                        />
                                    </div>
                                    <span className="text-sm font-semibold text-green-600">
                                        {planA.stagnantConsumptionRate.toFixed(0)}%
                                    </span>
                                </div>
                                {planA.stagnantConsumptionRate >= 100 && (
                                    <div className="flex items-center gap-1 mt-1">
                                        <CheckCircle className="w-4 h-4 text-green-600" />
                                        <span className="text-xs text-green-600">完全消纳</span>
                                    </div>
                                )}
                            </div>

                            <div>
                                <p className="text-sm text-slate-600 mb-1">📦 产出价值</p>
                                <p className="text-xl font-semibold text-blue-600">
                                    ¥{planA.outputValue.toLocaleString()}
                                </p>
                            </div>

                            <div>
                                <p className="text-sm text-slate-600 mb-1">📈 ROI</p>
                                <p className="text-xl font-semibold text-purple-600">
                                    {planA.roi === Infinity ? '∞' : planA.roi.toFixed(2)}
                                </p>
                            </div>
                        </div>

                        {/* 风险提示 */}
                        {planA.supplementMaterials.length > 0 && (
                            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                                <div className="flex items-start gap-2">
                                    <AlertTriangle className="w-4 h-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                                    <div className="text-xs text-yellow-800">
                                        <p className="font-semibold mb-1">⚠️ 风险</p>
                                        <ul className="list-disc list-inside space-y-1">
                                            <li>补料可能产生新呆滞</li>
                                            <li>需要预算 ¥{planA.totalCost.toLocaleString()}</li>
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* 方案 B */}
                <div className={`bg-white rounded-lg border-2 ${recommendedPlan === 'B' ? 'border-purple-500' : 'border-slate-200'}`}>
                    <div className="p-6">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-slate-900">
                                方案 B: 最小化余料
                            </h3>
                            {recommendedPlan === 'B' && (
                                <span className="px-2 py-1 bg-purple-100 text-purple-700 text-xs font-semibold rounded">
                                    推荐
                                </span>
                            )}
                        </div>

                        <p className="text-sm text-slate-600 mb-4">不补料</p>

                        {/* 关键指标 */}
                        <div className="space-y-4">
                            <div>
                                <p className="text-sm text-slate-600 mb-1">🎯 可生产数量</p>
                                <p className="text-3xl font-bold text-slate-900">{planB.quantity} 件</p>
                            </div>

                            <div>
                                <p className="text-sm text-slate-600 mb-1">💰 补料成本</p>
                                <p className="text-xl font-semibold text-green-600">
                                    ¥{planB.totalCost.toLocaleString()}
                                </p>
                                <p className="text-xs text-slate-500 mt-1">(无需补料)</p>
                            </div>

                            <div>
                                <p className="text-sm text-slate-600 mb-1">♻️ 呆滞料消纳</p>
                                <div className="flex items-center gap-2">
                                    <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-green-600 rounded-full"
                                            style={{ width: `${planB.stagnantConsumptionRate}%` }}
                                        />
                                    </div>
                                    <span className="text-sm font-semibold text-green-600">
                                        {planB.stagnantConsumptionRate.toFixed(0)}%
                                    </span>
                                </div>
                                {planB.wasteValue > 0 && (
                                    <p className="text-xs text-slate-500 mt-1">
                                        剩余: ¥{planB.wasteValue.toLocaleString()}
                                    </p>
                                )}
                            </div>

                            <div>
                                <p className="text-sm text-slate-600 mb-1">📦 产出价值</p>
                                <p className="text-xl font-semibold text-blue-600">
                                    ¥{planB.outputValue.toLocaleString()}
                                </p>
                            </div>

                            <div>
                                <p className="text-sm text-slate-600 mb-1">📈 ROI</p>
                                <p className="text-xl font-semibold text-purple-600">
                                    {planB.roi === Infinity ? '∞' : planB.roi.toFixed(2)}
                                </p>
                            </div>
                        </div>

                        {/* 优势 */}
                        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                            <div className="flex items-start gap-2">
                                <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                                <div className="text-xs text-green-800">
                                    <p className="font-semibold mb-1">✅ 优势</p>
                                    <ul className="list-disc list-inside space-y-1">
                                        <li>零风险，无需投入</li>
                                        <li>立即可执行</li>
                                        <li>消纳大部分呆滞料</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* 智能推荐 */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                    <Lightbulb className="w-6 h-6 text-blue-600 flex-shrink-0" />
                    <div>
                        <h4 className="font-semibold text-blue-900 mb-2">💡 智能建议</h4>
                        <p className="text-sm text-blue-800 mb-2">
                            推荐选择 <span className="font-semibold">方案 {recommendedPlan}</span>，原因：
                        </p>
                        <ul className="text-sm text-blue-800 list-disc list-inside space-y-1">
                            {recommendedPlan === 'B' ? (
                                <>
                                    <li>零投入，立即可执行</li>
                                    <li>消纳 {planB.stagnantConsumptionRate.toFixed(0)}% 呆滞料，效果显著</li>
                                    <li>净收益更高 (¥{planB.outputValue.toLocaleString()} vs ¥{(planA.outputValue - planA.totalCost).toLocaleString()})</li>
                                    <li>无补料风险</li>
                                </>
                            ) : (
                                <>
                                    <li>完全消纳呆滞料</li>
                                    <li>产出价值更高</li>
                                    <li>ROI 合理</li>
                                </>
                            )}
                        </ul>
                    </div>
                </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex justify-between">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    返回上一步
                </button>

                <div className="flex gap-3">
                    <button className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors">
                        导出生产计划
                    </button>
                </div>
            </div>
        </div>
    );
};
