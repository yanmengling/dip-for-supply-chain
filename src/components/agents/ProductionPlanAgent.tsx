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

/** 过滤掉「完工」状态的生产计划 */
const COMPLETED_STATUSES = ['完工', 'C'];

const PAGE_SIZE = 10;

/** 格式化日期时间显示（保留日期+时间或仅日期） */
function formatDateTimeString(dateStr: string): string {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const h = date.getHours();
    const min = date.getMinutes();
    if (h === 0 && min === 0) return `${y}-${m}-${d}`;
    return `${y}-${m}-${d} ${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/** 计划完工时间是否已逾期（早于今天） */
function isPlannedEndOverdue(endTime: string): boolean {
    if (!endTime) return false;
    const end = new Date(endTime);
    if (isNaN(end.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    end.setHours(0, 0, 0, 0);
    return end.getTime() < today.getTime();
}

export const ProductionPlanAgent = () => {
    const _initValid =
        !!(_planCache && Date.now() - _planCacheTime < _PLAN_CACHE_TTL);
    const [plans, setPlans] = useState<ProductionPlan[]>(_initValid ? _planCache!.plans : []);
    const [stats, setStats] = useState<ProductionStats | null>(_initValid ? _planCache!.stats : null);
    const [loading, setLoading] = useState(!_initValid);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);

    // 数据条数变少时，若当前页超出范围则回到第 1 页
    useEffect(() => {
        if (!stats?.productAnalysis.length) return;
        const totalPages = Math.max(1, Math.ceil(stats.productAnalysis.length / PAGE_SIZE));
        if (page > totalPages) setPage(1);
    }, [stats?.productAnalysis.length, page]);

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
                // 过滤掉完工状态的生产计划
                const filtered = data.filter(
                    (p) => !COMPLETED_STATUSES.includes(p.status)
                );
                setPlans(filtered);
                setError(null);

                if (filtered.length > 0) {
                    const calculatedStats = calculateProductionStats(filtered);
                    _planCache = { plans: filtered, stats: calculatedStats };
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
                <div className="grid grid-cols-1 gap-4">
                    <div className="p-3 bg-indigo-50 rounded-lg max-w-xs">
                        <div className="text-xs text-indigo-600 mb-1">计划产量</div>
                        <div className="text-2xl font-bold text-indigo-700">
                            {stats.totalQuantity.toLocaleString()}
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
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">生产工单单号</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">产品</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">计划产量</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">合格品入库数量</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">计划开工时间</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">计划完工时间</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">状态</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-slate-200">
                                {(() => {
                                    const total = stats.productAnalysis.length;
                                    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
                                    const from = (page - 1) * PAGE_SIZE;
                                    const to = Math.min(from + PAGE_SIZE, total);
                                    const pageList = stats.productAnalysis.slice(from, to);
                                    return pageList.map((product, i) => {
                                        const overdue = isPlannedEndOverdue(product.endTime);
                                        return (
                                            <tr key={from + i}>
                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-700 font-medium">
                                                    {product.orderNumber || '-'}
                                                </td>
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
                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                                                    {product.qualifiedInboundQty != null
                                                        ? product.qualifiedInboundQty.toLocaleString()
                                                        : '-'}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                                                    {formatDateTimeString(product.startTime)}
                                                </td>
                                                <td className="px-4 py-3 whitespace-nowrap text-sm text-slate-600">
                                                    {formatDateTimeString(product.endTime)}
                                                </td>
                                                <td className={`px-4 py-3 whitespace-nowrap text-sm font-medium ${overdue ? 'text-red-600' : 'text-slate-600'}`}>
                                                    {product.status}
                                                </td>
                                            </tr>
                                        );
                                    });
                                })()}
                            </tbody>
                        </table>
                    </div>

                    {/* 分页：每页 10 条 */}
                    {(() => {
                        const total = stats.productAnalysis.length;
                        const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
                        if (totalPages <= 1) return null;
                        return (
                            <div className="mt-4 pt-4 border-t border-slate-200 flex justify-between items-center text-sm">
                                <span className="text-slate-500">
                                    共 {total} 条，第 {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} 条
                                </span>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        disabled={page <= 1}
                                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                                        className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-50 disabled:pointer-events-none transition-colors"
                                    >
                                        上一页
                                    </button>
                                    <span className="text-slate-600 font-medium min-w-[4rem] text-center">
                                        {page} / {totalPages}
                                    </span>
                                    <button
                                        type="button"
                                        disabled={page >= totalPages}
                                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                        className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg disabled:opacity-50 disabled:pointer-events-none transition-colors"
                                    >
                                        下一页
                                    </button>
                                </div>
                            </div>
                        );
                    })()}
                </div>

            </div>
        </div>
    );
};

export default ProductionPlanAgent;
