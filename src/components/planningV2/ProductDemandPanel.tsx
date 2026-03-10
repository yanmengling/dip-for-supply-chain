/**
 * 产品需求预测(步骤1) - 产品选择 + 预测单按月分组
 *
 * PRD v3.1 / 4.3 章节:
 *   产品列表: supplychain_hd0202_product（material_number / material_name）
 *   需求数据: supplychain_hd0202_forecast（startdate / enddate / qty），按 material_number 查询
 *   预测单按 startdate 月份分组，用户勾选月份后自动聚合
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, ChevronRight, ChevronDown, ChevronUp, Loader2, AlertCircle, Info, Check } from 'lucide-react';
import {
    planningV2DataService,
    type ProductAPI,
    type ForecastRecordAPI,
} from '../../services/planningV2DataService';
import type { Step1Data } from '../../types/planningV2';

// ============================================================================
// Types
// ============================================================================

interface ProductDemandPanelProps {
    active: boolean;
    onConfirm: (data: Step1Data) => void;
    initialData?: Step1Data;
}

/** 按月分组的预测单 */
interface MonthGroup {
    /** 月份 key: "YYYY-MM" */
    monthKey: string;
    /** 显示标签: "2026年4月" */
    label: string;
    /** 是否为推荐月份（当前月的下一个月） */
    isRecommended: boolean;
    /** 该月份下的所有预测单 */
    records: ForecastRecordAPI[];
    /** 该月份数量小计 */
    subtotal: number;
}

// ============================================================================
// 辅助：按月份分组预测单（PRD 4.3.3）
// ============================================================================

function groupForecastByMonth(records: ForecastRecordAPI[]): MonthGroup[] {
    if (records.length === 0) return [];

    // 按 startdate 的年月分组
    const groupMap = new Map<string, ForecastRecordAPI[]>();
    for (const r of records) {
        const date = r.startdate?.slice(0, 7) || 'unknown'; // "YYYY-MM"
        if (!groupMap.has(date)) groupMap.set(date, []);
        groupMap.get(date)!.push(r);
    }

    // 推荐月份：当前月份的下一个月
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const recommendedKey = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;

    // 排序 & 构建 MonthGroup
    const sortedKeys = [...groupMap.keys()].sort();
    return sortedKeys.map(monthKey => {
        const recs = groupMap.get(monthKey)!;
        const [year, month] = monthKey.split('-').map(Number);
        return {
            monthKey,
            label: `${year}年${month}月`,
            isRecommended: monthKey === recommendedKey,
            records: recs.sort((a, b) => (a.startdate || '').localeCompare(b.startdate || '')),
            subtotal: recs.reduce((sum, r) => sum + r.qty, 0),
        };
    });
}

/** 从选中的月份组聚合需求数据 */
function aggregateSelectedGroups(groups: MonthGroup[], selectedMonths: Set<string>): {
    demandStart: string;
    demandEnd: string;
    demandQuantity: number;
    billnos: string[];
} {
    const selectedRecords = groups
        .filter(g => selectedMonths.has(g.monthKey))
        .flatMap(g => g.records);

    if (selectedRecords.length === 0) {
        return { demandStart: '', demandEnd: '', demandQuantity: 0, billnos: [] };
    }

    const startDates = selectedRecords.map(r => r.startdate).filter(Boolean).sort();
    const endDates = selectedRecords.map(r => r.enddate).filter(Boolean).sort();
    const demandQuantity = selectedRecords.reduce((sum, r) => sum + r.qty, 0);
    const billnos = selectedRecords.map(r => r.billno).filter(Boolean);

    // demandEnd: 选中月份中最后一个月的最后一天（PRD 4.3.4）
    // 使用 enddate 最大值，如果没有则使用 startdate 最大值
    const demandEnd = endDates[endDates.length - 1] || startDates[startDates.length - 1] || '';

    return {
        demandStart: startDates[0] || '',
        demandEnd,
        demandQuantity,
        billnos,
    };
}

// ============================================================================
// Component
// ============================================================================

const ProductDemandPanel = ({ active, onConfirm, initialData }: ProductDemandPanelProps) => {
    // -------- 产品列表 --------
    const [productsLoading, setProductsLoading] = useState(true);
    const [productsError, setProductsError] = useState<string | null>(null);
    const [products, setProducts] = useState<ProductAPI[]>([]);

    // -------- 需求预测 --------
    const [forecastLoading, setForecastLoading] = useState(false);
    const [forecastRecords, setForecastRecords] = useState<ForecastRecordAPI[]>([]);
    const [forecastLoaded, setForecastLoaded] = useState(false);

    // -------- 月份分组 & 选择 --------
    const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());
    const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());

    // -------- 交互状态 --------
    const [searchText, setSearchText] = useState('');
    const [selectedProductCode, setSelectedProductCode] = useState<string>('');

    // -------- 表单状态（可编辑字段） --------
    const [demandStart, setDemandStart] = useState('');
    const [demandEnd, setDemandEnd] = useState('');
    const [demandQuantity, setDemandQuantity] = useState<number | ''>('');
    const [relatedBillnos, setRelatedBillnos] = useState<string[]>([]);

    // ========================================================================
    // 月份分组
    // ========================================================================

    const monthGroups = useMemo(() => groupForecastByMonth(forecastRecords), [forecastRecords]);

    // ========================================================================
    // 加载产品列表
    // ========================================================================

    const loadProducts = useCallback(async () => {
        setProductsLoading(true);
        setProductsError(null);
        try {
            const data = await planningV2DataService.loadProducts();
            setProducts(data);
        } catch (err) {
            console.error('[ProductDemandPanel] 加载产品列表失败:', err);
            setProductsError('加载产品数据失败，请检查网络连接后重试');
        } finally {
            setProductsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (active) loadProducts();
    }, [active, loadProducts]);

    // ========================================================================
    // 选择产品 -> 查询 forecast -> 按月分组 -> 默认选中推荐月份
    // ========================================================================

    const handleSelectProduct = useCallback(async (productCode: string) => {
        setSelectedProductCode(productCode);
        setForecastLoaded(false);
        setForecastRecords([]);
        setSelectedMonths(new Set());
        setExpandedMonths(new Set());
        setDemandStart('');
        setDemandEnd('');
        setDemandQuantity('');
        setRelatedBillnos([]);

        setForecastLoading(true);
        try {
            const records = await planningV2DataService.loadForecastByProduct(productCode);
            setForecastRecords(records);
            setForecastLoaded(true);
            console.log(`[ProductDemandPanel] 需求预测 ${productCode}: ${records.length} 条`);

            // 默认选中推荐月份（下月）（PRD 4.3.3）
            const groups = groupForecastByMonth(records);
            const recommended = groups.find(g => g.isRecommended);
            if (recommended) {
                const newSelected = new Set([recommended.monthKey]);
                setSelectedMonths(newSelected);
                // 自动聚合
                const agg = aggregateSelectedGroups(groups, newSelected);
                setDemandStart(agg.demandStart);
                setDemandEnd(agg.demandEnd);
                setDemandQuantity(agg.demandQuantity > 0 ? agg.demandQuantity : '');
                setRelatedBillnos(agg.billnos);
            } else if (groups.length > 0) {
                // 无推荐月份则选中第一个月份
                const firstMonth = groups[0].monthKey;
                const newSelected = new Set([firstMonth]);
                setSelectedMonths(newSelected);
                const agg = aggregateSelectedGroups(groups, newSelected);
                setDemandStart(agg.demandStart);
                setDemandEnd(agg.demandEnd);
                setDemandQuantity(agg.demandQuantity > 0 ? agg.demandQuantity : '');
                setRelatedBillnos(agg.billnos);
            }
        } catch (err) {
            console.error(`[ProductDemandPanel] 加载需求预测失败 ${productCode}:`, err);
            setForecastLoaded(true);
        } finally {
            setForecastLoading(false);
        }
    }, []);

    // ========================================================================
    // 切换月份选择 -> 重新聚合
    // ========================================================================

    const toggleMonth = useCallback((monthKey: string) => {
        setSelectedMonths(prev => {
            const next = new Set(prev);
            if (next.has(monthKey)) {
                next.delete(monthKey);
            } else {
                next.add(monthKey);
            }
            // 重新聚合
            const agg = aggregateSelectedGroups(monthGroups, next);
            setDemandStart(agg.demandStart);
            setDemandEnd(agg.demandEnd);
            setDemandQuantity(agg.demandQuantity > 0 ? agg.demandQuantity : '');
            setRelatedBillnos(agg.billnos);
            return next;
        });
    }, [monthGroups]);

    const toggleMonthExpand = useCallback((monthKey: string) => {
        setExpandedMonths(prev => {
            const next = new Set(prev);
            if (next.has(monthKey)) next.delete(monthKey);
            else next.add(monthKey);
            return next;
        });
    }, []);

    // ========================================================================
    // 回填 initialData（回退编辑场景）
    // ========================================================================

    useEffect(() => {
        if (initialData && products.length > 0 && !selectedProductCode) {
            setSelectedProductCode(initialData.productCode);
            setDemandStart(initialData.demandStart);
            setDemandEnd(initialData.demandEnd);
            setDemandQuantity(initialData.demandQuantity);
            setRelatedBillnos(initialData.relatedForecastBillnos || []);
            setForecastLoaded(true);
        }
    }, [initialData, products, selectedProductCode]);

    // ========================================================================
    // 搜索过滤
    // ========================================================================

    const filteredProducts = useMemo(() => {
        if (!searchText.trim()) return products;
        const q = searchText.toLowerCase();
        return products.filter(
            p =>
                p.material_name.toLowerCase().includes(q) ||
                p.material_number.toLowerCase().includes(q),
        );
    }, [products, searchText]);

    const selectedProduct = useMemo(
        () => products.find(p => p.material_number === selectedProductCode),
        [products, selectedProductCode],
    );

    // ========================================================================
    // 确认按钮
    // ========================================================================

    const canConfirm =
        !!selectedProductCode &&
        !!selectedProduct &&
        !!demandStart &&
        !!demandEnd &&
        demandQuantity !== '' &&
        Number(demandQuantity) > 0;

    const handleConfirm = () => {
        if (!canConfirm || !selectedProduct) return;
        onConfirm({
            productCode: selectedProductCode,
            productName: selectedProduct.material_name,
            demandStart,
            demandEnd,
            demandQuantity: Number(demandQuantity),
            relatedForecastBillnos: relatedBillnos,
        });
    };

    if (!active) return null;

    // ========================================================================
    // Loading / Error
    // ========================================================================

    if (productsLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
                <p className="text-sm text-gray-500">正在加载产品数据...</p>
            </div>
        );
    }

    if (productsError) {
        return (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex flex-col items-center justify-center py-12">
                    <AlertCircle className="w-10 h-10 text-red-400 mb-4" />
                    <p className="text-sm text-red-600 mb-4">{productsError}</p>
                    <button
                        onClick={loadProducts}
                        className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                        重新加载
                    </button>
                </div>
            </div>
        );
    }

    // ========================================================================
    // Render
    // ========================================================================

    return (
        <div className="space-y-5">
            {/* ---- 产品选择区域 ---- */}
            <div className="bg-white rounded-lg border border-gray-200 p-4">
                <h3 className="text-sm font-semibold text-gray-800 mb-3">选择产品</h3>

                {/* 搜索框 */}
                <div className="relative mb-3">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                        type="text"
                        placeholder="搜索产品名称或编码..."
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors"
                    />
                </div>

                {/* 产品列表（radio） */}
                <div className="max-h-[300px] overflow-y-auto border border-gray-100 rounded-lg">
                    {filteredProducts.length === 0 ? (
                        <div className="py-8 px-4 text-center text-sm text-gray-500 space-y-3">
                            {products.length === 0 ? (
                                <>
                                    <p>暂无产品数据。</p>
                                    <p className="text-xs text-gray-400 max-w-sm mx-auto">
                                        请确认业务知识网络中已配置产品对象（supplychain_hd0202_product）。
                                    </p>
                                    <button
                                        type="button"
                                        onClick={loadProducts}
                                        className="text-indigo-600 hover:text-indigo-700 text-xs font-medium"
                                    >
                                        重新加载
                                    </button>
                                </>
                            ) : (
                                '没有匹配的产品'
                            )}
                        </div>
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {filteredProducts.map(product => {
                                const isSelected = selectedProductCode === product.material_number;
                                return (
                                    <li
                                        key={product.material_number}
                                        onClick={() => handleSelectProduct(product.material_number)}
                                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                                            isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'
                                        }`}
                                    >
                                        <span
                                            className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                                isSelected ? 'border-indigo-600' : 'border-gray-300'
                                            }`}
                                        >
                                            {isSelected && (
                                                <span className="w-2 h-2 rounded-full bg-indigo-600" />
                                            )}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                            <p className={`text-sm font-medium truncate ${
                                                isSelected ? 'text-indigo-700' : 'text-gray-800'
                                            }`}>
                                                {product.material_name}
                                            </p>
                                            <p className="text-xs text-gray-400 font-mono mt-0.5">
                                                {product.material_number}
                                            </p>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                <p className="text-xs text-gray-400 mt-2">
                    共 {products.length} 个产品
                    {searchText.trim() && `，筛选后 ${filteredProducts.length} 个`}
                </p>
            </div>

            {/* ---- 预测单按月分组（PRD 4.3.3） ---- */}
            {selectedProductCode && selectedProduct && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h3 className="text-sm font-semibold text-gray-800 mb-3">
                        需求预测信息
                    </h3>

                    {/* 产品信息（只读） */}
                    <div className="mb-4">
                        <label className="block text-xs font-medium text-gray-500 mb-1">产品信息</label>
                        <div className="px-3 py-2 bg-gray-50 rounded-lg border border-gray-100 text-sm text-gray-700">
                            {selectedProduct.material_name}
                            <span className="ml-2 text-xs text-gray-400 font-mono">
                                ({selectedProductCode})
                            </span>
                        </div>
                    </div>

                    {/* forecast 加载中 */}
                    {forecastLoading && (
                        <div className="flex items-center gap-2 py-4 text-slate-500">
                            <Loader2 className="w-4 h-4 animate-spin text-indigo-500" />
                            <span className="text-sm">正在查询需求预测数据...</span>
                        </div>
                    )}

                    {/* 无预测数据提示 */}
                    {!forecastLoading && forecastLoaded && forecastRecords.length === 0 && (
                        <div className="flex items-start gap-2 mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                            <Info className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                            <p className="text-xs text-amber-700">
                                该产品暂无需求预测数据，请手动填写需求计划时间和数量。
                            </p>
                        </div>
                    )}

                    {/* 有预测数据：按月分组展示 */}
                    {!forecastLoading && forecastLoaded && monthGroups.length > 0 && (
                        <div className="mb-4 space-y-2">
                            <p className="text-xs text-gray-500 mb-2">
                                勾选月份后自动聚合需求数据（已选 {selectedMonths.size} 个月份）
                            </p>
                            {monthGroups.map(group => {
                                const isChecked = selectedMonths.has(group.monthKey);
                                const isExpanded = expandedMonths.has(group.monthKey);
                                return (
                                    <div
                                        key={group.monthKey}
                                        className={`border rounded-lg transition-colors ${
                                            isChecked ? 'border-indigo-300 bg-indigo-50/50' : 'border-gray-200'
                                        }`}
                                    >
                                        {/* 月份头 */}
                                        <div className="flex items-center gap-3 px-4 py-3">
                                            {/* checkbox */}
                                            <button
                                                type="button"
                                                onClick={() => toggleMonth(group.monthKey)}
                                                className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                                    isChecked
                                                        ? 'bg-indigo-600 border-indigo-600'
                                                        : 'border-gray-300 hover:border-indigo-400'
                                                }`}
                                            >
                                                {isChecked && <Check className="w-3.5 h-3.5 text-white" />}
                                            </button>

                                            {/* 月份标签 */}
                                            <div className="flex-1 min-w-0">
                                                <span className="text-sm font-medium text-gray-800">
                                                    {group.label}
                                                </span>
                                                {group.isRecommended && (
                                                    <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">
                                                        推荐
                                                    </span>
                                                )}
                                                <span className="ml-2 text-xs text-gray-400">
                                                    {group.records.length} 单 · 小计 {group.subtotal.toLocaleString()}
                                                </span>
                                            </div>

                                            {/* 展开/收起明细 */}
                                            <button
                                                type="button"
                                                onClick={() => toggleMonthExpand(group.monthKey)}
                                                className="flex items-center gap-1 text-xs text-gray-400 hover:text-indigo-600"
                                            >
                                                {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                            </button>
                                        </div>

                                        {/* 月份明细 */}
                                        {isExpanded && (
                                            <div className="border-t border-gray-100 px-4 pb-3">
                                                <table className="w-full text-xs mt-2">
                                                    <thead className="text-gray-400">
                                                        <tr>
                                                            <th className="py-1 text-left font-medium">预测单号</th>
                                                            <th className="py-1 text-left font-medium">交货日期</th>
                                                            <th className="py-1 text-left font-medium">终止日期</th>
                                                            <th className="py-1 text-right font-medium">数量</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {group.records.map((r, i) => (
                                                            <tr key={i} className="border-t border-gray-50">
                                                                <td className="py-1.5 font-mono text-gray-600">{r.billno || '-'}</td>
                                                                <td className="py-1.5 text-gray-600">{r.startdate?.slice(0, 10) || '-'}</td>
                                                                <td className="py-1.5 text-gray-600">{r.enddate?.slice(0, 10) || '-'}</td>
                                                                <td className="py-1.5 text-right text-gray-700 font-medium">{r.qty.toLocaleString()}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* 可编辑字段 */}
                    {!forecastLoading && (
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">
                                    需求计划时间
                                </label>
                                <div className="flex items-center gap-2">
                                    <input
                                        type="date"
                                        value={demandStart}
                                        onChange={e => setDemandStart(e.target.value)}
                                        className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors"
                                    />
                                    <span className="text-gray-400 text-sm">至</span>
                                    <input
                                        type="date"
                                        value={demandEnd}
                                        onChange={e => setDemandEnd(e.target.value)}
                                        className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-medium text-gray-500 mb-1">
                                    需求数量
                                </label>
                                <input
                                    type="number"
                                    min={0}
                                    value={demandQuantity}
                                    onChange={e => {
                                        const val = e.target.value;
                                        setDemandQuantity(val === '' ? '' : Number(val));
                                    }}
                                    placeholder="请输入需求数量"
                                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-colors"
                                />
                            </div>

                            {/* 关联预测单号（只读） */}
                            {relatedBillnos.length > 0 && (
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">
                                        关联预测单号（{relatedBillnos.length} 单）
                                    </label>
                                    <div className="px-3 py-2 bg-gray-50 rounded-lg border border-gray-100 text-xs text-gray-500 font-mono">
                                        {relatedBillnos.join('、')}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* ---- 确认按钮 ---- */}
            <div className="flex justify-end">
                <button
                    disabled={!canConfirm}
                    onClick={handleConfirm}
                    className={`inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium rounded-lg transition-colors ${
                        canConfirm
                            ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                            : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                >
                    确认，进入下一步
                    <ChevronRight className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
};

export default ProductDemandPanel;
