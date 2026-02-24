/**
 * 产品需求计划(PP) - Product Demand Panel
 *
 * 展示产品需求计划数据，基于 API 对象 supplychain_hd0202_pp
 * 参考: /docs/PRD_动态计划协同V2.md 2.1 章节
 */

import { useState, useEffect, useMemo } from 'react';
import { Package, Calendar, TrendingUp, Search, RefreshCw, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import {
    planningV2DataService,
    type ProductDemandPlanAPI,
} from '../../services/planningV2DataService';

const PAGE_SIZE = 20; // 每页20条

interface ProductDemandPanelProps {
    active: boolean;
}

const ProductDemandPanel = ({ active }: ProductDemandPanelProps) => {
    // 状态管理
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [plans, setPlans] = useState<ProductDemandPlanAPI[]>([]);
    const [searchText, setSearchText] = useState('');
    const [selectedProductCode, setSelectedProductCode] = useState<string>('');
    const [currentPage, setCurrentPage] = useState(1);

    // 加载数据
    const loadData = async (forceReload: boolean = false) => {
        setLoading(true);
        setError(null);

        try {
            const data = await planningV2DataService.loadProductDemandPlans(forceReload);
            setPlans(data);
        } catch (err) {
            console.error('加载产品需求计划失败:', err);
            setError('加载数据失败，请检查网络连接或 API 配置');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (active) {
            loadData();
        }
    }, [active]);

    // 获取唯一产品列表（用于下拉选择）
    const uniqueProducts = useMemo(() => {
        const productMap = new Map<string, string>();
        plans.forEach(plan => {
            if (plan.product_code && !productMap.has(plan.product_code)) {
                productMap.set(plan.product_code, plan.product_name);
            }
        });
        return Array.from(productMap.entries()).map(([code, name]) => ({
            product_code: code,
            product_name: name,
        }));
    }, [plans]);

    // 过滤后的计划列表
    const filteredPlans = useMemo(() => {
        let result = plans;

        // 按产品编码筛选
        if (selectedProductCode) {
            result = result.filter(p => p.product_code === selectedProductCode);
        }

        // 按搜索文本筛选（产品名称或产品编码）
        if (searchText.trim()) {
            const lowerSearch = searchText.toLowerCase();
            result = result.filter(p =>
                p.product_name.toLowerCase().includes(lowerSearch) ||
                p.product_code.toLowerCase().includes(lowerSearch)
            );
        }

        // 按计划日期排序
        return result.sort((a, b) => a.planned_date.localeCompare(b.planned_date));
    }, [plans, selectedProductCode, searchText]);

    // 分页信息
    const pagination = useMemo(() => {
        const totalCount = filteredPlans.length;
        const totalPages = Math.ceil(totalCount / PAGE_SIZE);
        const startIndex = (currentPage - 1) * PAGE_SIZE;
        const endIndex = Math.min(startIndex + PAGE_SIZE, totalCount);
        const pageData = filteredPlans.slice(startIndex, endIndex);

        return {
            totalCount,
            totalPages,
            startIndex,
            endIndex,
            pageData,
            hasPrev: currentPage > 1,
            hasNext: currentPage < totalPages,
        };
    }, [filteredPlans, currentPage]);

    // 当筛选条件变化时，重置到第一页
    useEffect(() => {
        setCurrentPage(1);
    }, [selectedProductCode, searchText]);

    // 统计信息
    const stats = useMemo(() => ({
        totalProducts: uniqueProducts.length,
        totalQuantity: filteredPlans.reduce((sum, p) => sum + p.planned_demand_quantity, 0),
        planCount: filteredPlans.length,
    }), [uniqueProducts, filteredPlans]);

    if (!active) return null;

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                        <Package className="w-5 h-5 text-indigo-600" />
                        产品需求计划（PP）
                    </h2>
                    <p className="text-sm text-slate-500 mt-1">
                        展示产品在指定计划时间需要完成的交付数量目标
                        <span className="ml-2 text-xs text-slate-400">
                            数据源: supplychain_hd0202_pp
                        </span>
                    </p>
                </div>
                <button
                    onClick={() => loadData(true)}
                    disabled={loading}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium flex items-center gap-2 disabled:opacity-50"
                >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    刷新数据
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-slate-500">产品数量</p>
                            <p className="text-2xl font-bold text-slate-800 mt-1">{stats.totalProducts}</p>
                        </div>
                        <Package className="w-8 h-8 text-indigo-500" />
                    </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-slate-500">总需求数量</p>
                            <p className="text-2xl font-bold text-slate-800 mt-1">
                                {stats.totalQuantity.toLocaleString()}
                            </p>
                        </div>
                        <TrendingUp className="w-8 h-8 text-green-500" />
                    </div>
                </div>
                <div className="bg-white border border-slate-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-slate-500">计划条数</p>
                            <p className="text-2xl font-bold text-slate-800 mt-1">{stats.planCount}</p>
                        </div>
                        <Calendar className="w-8 h-8 text-blue-500" />
                    </div>
                </div>
            </div>

            {/* Error Message */}
            {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                    <div>
                        <p className="text-sm text-red-700">{error}</p>
                        <button
                            onClick={() => loadData(true)}
                            className="text-sm text-red-600 underline mt-1"
                        >
                            点击重试
                        </button>
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="bg-white border border-slate-200 rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-base font-semibold text-slate-800">需求计划列表</h3>
                    <div className="flex items-center gap-3">
                        {/* 产品选择器 */}
                        <select
                            value={selectedProductCode}
                            onChange={(e) => setSelectedProductCode(e.target.value)}
                            className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm bg-white"
                        >
                            <option value="">全部产品</option>
                            {uniqueProducts.map(p => (
                                <option key={p.product_code} value={p.product_code}>
                                    {p.product_code} - {p.product_name}
                                </option>
                            ))}
                        </select>

                        {/* 搜索框 */}
                        <div className="relative">
                            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                placeholder="搜索产品..."
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                className="pl-9 pr-3 py-1.5 border border-slate-300 rounded-lg text-sm w-48"
                            />
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="text-center py-12">
                        <RefreshCw className="w-8 h-8 text-slate-300 mx-auto mb-3 animate-spin" />
                        <p className="text-slate-500">加载中...</p>
                    </div>
                ) : filteredPlans.length === 0 ? (
                    <div className="text-center py-12">
                        <Package className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="text-slate-500">暂无需求计划数据</p>
                        <p className="text-sm text-slate-400 mt-1">
                            {plans.length === 0
                                ? '请检查 API 连接是否正常'
                                : '没有符合筛选条件的数据'}
                        </p>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="border-b border-slate-200">
                                    <tr className="text-left text-sm text-slate-600">
                                        <th className="pb-3 font-medium">产品编码</th>
                                        <th className="pb-3 font-medium">产品名称</th>
                                        <th className="pb-3 font-medium">需求计划时间</th>
                                        <th className="pb-3 font-medium text-right">需求数量</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {pagination.pageData.map((plan, index) => (
                                        <tr
                                            key={`${plan.product_code}-${plan.planned_date}-${index}`}
                                            className="border-b border-slate-100 hover:bg-slate-50"
                                        >
                                            <td className="py-3 text-sm text-slate-800 font-mono">
                                                {plan.product_code}
                                            </td>
                                            <td className="py-3 text-sm text-slate-800">
                                                {plan.product_name}
                                            </td>
                                            <td className="py-3 text-sm text-slate-600">
                                                {plan.planned_date}
                                            </td>
                                            <td className="py-3 text-sm text-slate-800 font-medium text-right">
                                                {plan.planned_demand_quantity.toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* 分页控件 */}
                        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
                            <div className="text-sm text-slate-500">
                                显示 {pagination.startIndex + 1} - {pagination.endIndex} 条，共 {pagination.totalCount} 条
                            </div>
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setCurrentPage(p => p - 1)}
                                    disabled={!pagination.hasPrev}
                                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm flex items-center gap-1 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <ChevronLeft className="w-4 h-4" />
                                    上一页
                                </button>
                                <span className="px-3 py-1.5 text-sm text-slate-600">
                                    {currentPage} / {pagination.totalPages}
                                </span>
                                <button
                                    onClick={() => setCurrentPage(p => p + 1)}
                                    disabled={!pagination.hasNext}
                                    className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm flex items-center gap-1 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    下一页
                                    <ChevronRight className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </>
                )}

                {/* 数据来源提示 */}
                {!loading && filteredPlans.length > 0 && (
                    <div className="mt-2 text-xs text-slate-400">
                        数据来源: Ontology API - supplychain_hd0202_pp
                    </div>
                )}
            </div>
        </div>
    );
};

export default ProductDemandPanel;
