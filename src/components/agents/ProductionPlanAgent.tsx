import { useState, useEffect } from 'react';
import { Loader2, BarChart3, AlertCircle } from 'lucide-react';
import {
    loadProductionPlanData,
    calculateProductionStats,
    type ProductionPlan,
    type ProductionStats,
} from '../../services/productionPlanCalculator';

// ── 模块级结果缓存（3 分钟 TTL，页面切换时不重复请求）─────────────────────
// 同时缓存 plans 和 stats，避免 calculateProductionStats 的额外 API 请求
const _PLAN_CACHE_TTL = 3 * 60 * 1000;
interface _PlanCacheEntry { plans: ProductionPlan[]; stats: ProductionStats }
let _planCache: _PlanCacheEntry | null = null;
let _planCacheTime = 0;

/**
 * 格式化日期字符串显示
 */
function formatDateString(dateStr: string): string {
    if (!dateStr) return '';

    // 如果已经是标准格式（YYYY-MM-DD），直接返回
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
        return dateStr;
    }

    // 尝试解析并格式化
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // 如果无法解析，返回原始字符串
    return dateStr;
}

export const ProductionPlanAgent = () => {
    const _initValid =
        !!(_planCache && Date.now() - _planCacheTime < _PLAN_CACHE_TTL);
    const [plans, setPlans] = useState<ProductionPlan[]>(_initValid ? _planCache!.plans : []);
    const [stats, setStats] = useState<ProductionStats | null>(_initValid ? _planCache!.stats : null);
    const [loading, setLoading] = useState(!_initValid);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadData = async () => {
            // 命中模块级缓存则直接渲染，跳过所有 API 请求（含 calculateProductionStats 的额外请求）
            const now = Date.now();
            if (_planCache && now - _planCacheTime < _PLAN_CACHE_TTL) {
                setPlans(_planCache.plans);
                setStats(_planCache.stats);
                setLoading(false);
                return;
            }

            try {
                setLoading(true);
                const data = await loadProductionPlanData();
                setPlans(data);
                setError(null);

                if (data.length > 0) {
                    const calculatedStats = await calculateProductionStats(data);
                    _planCache = { plans: data, stats: calculatedStats };
                    _planCacheTime = Date.now();
                    setStats(calculatedStats);
                } else {
                    setStats(null);
                }
            } catch (err) {
                console.error('[ProductionPlanAgent] 加载数据失败:', err);
                setError('加载生产计划数据失败');
                setStats(null);
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, []);

    if (loading) {
        return (
            <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-center py-8">
                    <Loader2 className="animate-spin text-indigo-500" size={24} />
                    <span className="ml-2 text-slate-600">加载生产计划数据...</span>
                </div>
            </div>
        );
    }

    if (error || !stats) {
        return (
            <div className="bg-white rounded-lg shadow p-6">
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
                    <AlertCircle className="text-yellow-600" size={20} />
                    <p className="text-sm text-yellow-700">
                        {error || '暂无生产计划数据'}
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-slate-200">
                <h2 className="text-lg font-semibold text-slate-800">生产计划面板</h2>
            </div>

            <div className="p-6 space-y-6">
                {/* 总体统计 */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-indigo-50 rounded-lg">
                        <div className="text-xs text-indigo-600 mb-1">计划产量</div>
                        <div className="text-2xl font-bold text-indigo-700">
                            {stats.totalQuantity.toLocaleString()}
                        </div>
                    </div>
                    <div className="p-3 bg-purple-50 rounded-lg">
                        <div className="text-xs text-purple-600 mb-1">在手订单数量</div>
                        <div className="text-2xl font-bold text-purple-700">
                            {stats.totalPendingOrderQuantity.toLocaleString()}
                        </div>
                    </div>
                </div>

                {/* 生产线优化分析 */}
                <div>
                    <h3 className="text-sm font-semibold text-slate-700 mb-4 flex items-center gap-2">
                        <BarChart3 className="text-indigo-500" size={18} />
                        生产线优化分析
                    </h3>

                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200">
                            <thead className="bg-slate-50">
                                <tr>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">产品</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">计划产量</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">在手订单数量</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">优先级</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">生产周期</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">状态</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                                {stats.productAnalysis.map((product, index) => (
                                    <tr key={index}>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-slate-900">
                                            <div className="flex flex-col">
                                                <span>{product.code}</span>
                                                {product.name && (
                                                    <span className="text-xs text-slate-500 mt-0.5">{product.name}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                                            {product.quantity.toLocaleString()}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700 font-medium">
                                            {product.pendingOrderQuantity !== undefined
                                                ? product.pendingOrderQuantity.toLocaleString()
                                                : '-'}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap">
                                            <span className={`text-xs px-2 py-1 rounded ${product.priority === 1 ? 'bg-red-100 text-red-700' :
                                                product.priority === 2 ? 'bg-yellow-100 text-yellow-700' :
                                                    'bg-slate-100 text-slate-700'
                                                }`}>
                                                {product.priority}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-indigo-600 font-semibold">
                                            {product.startTime && product.endTime ? (
                                                <span>{product.cycleDays}天（{formatDateString(product.startTime)}-{formatDateString(product.endTime)}）</span>
                                            ) : (
                                                <span>{product.cycleDays}天</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                                            {product.status}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProductionPlanAgent;
