/**
 * 产品需求预测(步骤1) - 产品选择 + 预测单单选
 *
 * PRD v4.3:
 *   - 预测单改为单选（radio），不再按月分组聚合
 *   - 按交货日期(startdate)倒排
 *   - 每页 10 条，"第 X/Y 页"分页导航
 *   - 默认选中最近交货日期的第一条（倒排后首条）
 *
 *   产品列表: supplychain_hd0202_product（material_number / material_name）
 *   需求数据: supplychain_hd0202_forecast（startdate / enddate / qty），按 material_number 查询
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, ChevronRight, ChevronLeft, Loader2, AlertCircle, Info } from 'lucide-react';
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
    /** v4.1: 从大预测单进入时为 true，展示只读确认卡片，用户可点"修改"切换到完整编辑模式 */
    readOnly?: boolean;
}

const PAGE_SIZE = 10;

// ============================================================================
// 推荐判定：startdate 在下月范围内
// ============================================================================

function isRecommended(startdate: string): boolean {
    if (!startdate) return false;
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const recommendedKey = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}`;
    return startdate.slice(0, 7) === recommendedKey;
}

// ============================================================================
// Component
// ============================================================================

const ProductDemandPanel = ({ active, onConfirm, initialData, readOnly = false }: ProductDemandPanelProps) => {
    // -------- 只读确认模式（从大预测单进入时） --------
    // 当 readOnly=true 时，初始显示只读摘要卡片；用户点"修改"后切为完整编辑表单
    const [isEditingReadOnly, setIsEditingReadOnly] = useState(false);

    // -------- 产品列表 --------
    const [productsLoading, setProductsLoading] = useState(true);
    const [productsError, setProductsError] = useState<string | null>(null);
    const [products, setProducts] = useState<ProductAPI[]>([]);

    // -------- 需求预测 --------
    const [forecastLoading, setForecastLoading] = useState(false);
    const [forecastRecords, setForecastRecords] = useState<ForecastRecordAPI[]>([]);
    const [forecastLoaded, setForecastLoaded] = useState(false);

    // -------- 预测单选择 & 分页 --------
    const [selectedBillno, setSelectedBillno] = useState<string>('');
    const [currentPage, setCurrentPage] = useState(1);

    // -------- 交互状态 --------
    const [searchText, setSearchText] = useState('');
    const [selectedProductCode, setSelectedProductCode] = useState<string>('');

    // -------- 表单状态（可编辑字段） --------
    const [demandStart, setDemandStart] = useState('');
    const [demandEnd, setDemandEnd] = useState('');
    const [demandQuantity, setDemandQuantity] = useState<number | ''>('');

    // ========================================================================
    // 排序后的预测单（startdate 倒排）
    // ========================================================================

    const sortedRecords = useMemo(() =>
        [...forecastRecords].sort((a, b) =>
            (b.startdate || '').localeCompare(a.startdate || '')
        ),
        [forecastRecords],
    );

    const totalPages = Math.max(1, Math.ceil(sortedRecords.length / PAGE_SIZE));
    const safePage = Math.min(currentPage, totalPages);
    const pageRecords = sortedRecords.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

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
    // 选中一条预测单 → 填充表单
    // ========================================================================

    const selectRecord = useCallback((record: ForecastRecordAPI) => {
        setSelectedBillno(record.billno);
        setDemandStart(record.startdate?.slice(0, 10) || '');
        setDemandEnd(record.enddate?.slice(0, 10) || '');
        setDemandQuantity(record.qty > 0 ? record.qty : '');
    }, []);

    // ========================================================================
    // 选择产品 → 查询 forecast → 倒排 → 默认选中第一条
    // ========================================================================

    const handleSelectProduct = useCallback(async (productCode: string) => {
        setSelectedProductCode(productCode);
        setForecastLoaded(false);
        setForecastRecords([]);
        setSelectedBillno('');
        setCurrentPage(1);
        setDemandStart('');
        setDemandEnd('');
        setDemandQuantity('');

        setForecastLoading(true);
        try {
            const records = await planningV2DataService.loadForecastByProduct(productCode);
            setForecastRecords(records);
            setForecastLoaded(true);
            console.log(`[ProductDemandPanel] 需求预测 ${productCode}: ${records.length} 条`);

            // 默认选中：优先推荐记录（下月），无推荐则取倒排第一条
            const sorted = [...records].sort((a, b) =>
                (b.startdate || '').localeCompare(a.startdate || '')
            );
            const defaultRecord =
                sorted.find(r => isRecommended(r.startdate || '')) ?? sorted[0];
            if (defaultRecord) {
                selectRecord(defaultRecord);
                // 自动跳到默认选中记录所在页
                const idx = sorted.indexOf(defaultRecord);
                setCurrentPage(Math.floor(idx / PAGE_SIZE) + 1);
            }
        } catch (err) {
            console.error(`[ProductDemandPanel] 加载需求预测失败 ${productCode}:`, err);
            setForecastLoaded(true);
        } finally {
            setForecastLoading(false);
        }
    }, [selectRecord]);

    // ========================================================================
    // 回填 initialData（回退编辑场景）
    // ========================================================================

    useEffect(() => {
        if (initialData && products.length > 0 && !selectedProductCode) {
            setSelectedProductCode(initialData.productCode);
            setDemandStart(initialData.demandStart);
            setDemandEnd(initialData.demandEnd);
            setDemandQuantity(initialData.demandQuantity);
            setSelectedBillno(initialData.relatedForecastBillnos?.[0] || '');
            setForecastLoaded(true);
        }
    }, [initialData, products, selectedProductCode]);

    // ========================================================================
    // 搜索过滤（产品列表）
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
        !!selectedBillno &&
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
            relatedForecastBillnos: [selectedBillno],
        });
    };

    if (!active) return null;

    // ========================================================================
    // 只读确认卡片（readOnly=true 且用户未点击"修改"）
    // ========================================================================

    if (readOnly && !isEditingReadOnly && initialData) {
        return (
            <div className="space-y-5">
                {/* 只读摘要卡片 */}
                <div className="bg-indigo-50 rounded-lg border border-indigo-200 p-5">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-semibold text-indigo-800">需求预测信息（来自大预测单）</h3>
                        <button
                            type="button"
                            onClick={() => setIsEditingReadOnly(true)}
                            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium border border-indigo-300 rounded-md px-3 py-1 hover:bg-indigo-100 transition-colors"
                        >
                            修改
                        </button>
                    </div>
                    <dl className="space-y-3">
                        <div className="flex gap-2">
                            <dt className="text-xs font-medium text-gray-500 w-24 flex-shrink-0">产品编码</dt>
                            <dd className="text-sm text-gray-800 font-mono">{initialData.productCode}</dd>
                        </div>
                        <div className="flex gap-2">
                            <dt className="text-xs font-medium text-gray-500 w-24 flex-shrink-0">产品名称</dt>
                            <dd className="text-sm text-gray-800">{initialData.productName}</dd>
                        </div>
                        <div className="flex gap-2">
                            <dt className="text-xs font-medium text-gray-500 w-24 flex-shrink-0">需求时间</dt>
                            <dd className="text-sm text-gray-800">
                                {initialData.demandStart} 至 {initialData.demandEnd}
                            </dd>
                        </div>
                        <div className="flex gap-2">
                            <dt className="text-xs font-medium text-gray-500 w-24 flex-shrink-0">需求数量</dt>
                            <dd className="text-sm text-gray-800 font-medium">
                                {Number(initialData.demandQuantity).toLocaleString()}
                            </dd>
                        </div>
                        {initialData.relatedForecastBillnos?.[0] && (
                            <div className="flex gap-2">
                                <dt className="text-xs font-medium text-gray-500 w-24 flex-shrink-0">关联预测单号</dt>
                                <dd className="text-xs text-gray-500 font-mono">{initialData.relatedForecastBillnos[0]}</dd>
                            </div>
                        )}
                    </dl>
                </div>

                {/* 确认进入下一步 */}
                <div className="flex justify-end">
                    <button
                        type="button"
                        onClick={() => onConfirm(initialData)}
                        className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                    >
                        确认，进入下一步
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        );
    }

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

            {/* ---- 需求预测单选择 ---- */}
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

                    {/* 预测单列表（单选，倒排，分页） */}
                    {!forecastLoading && forecastLoaded && sortedRecords.length > 0 && (
                        <div className="mb-4">
                            <p className="text-xs text-gray-500 mb-2">
                                选择一条预测单（共 {sortedRecords.length} 条，按交货日期倒排）
                            </p>

                            {/* 预测单表格 */}
                            <div className="border border-gray-200 rounded-lg overflow-hidden">
                                <table className="w-full text-xs">
                                    <thead className="bg-gray-50 text-gray-500 border-b border-gray-200">
                                        <tr>
                                            <th className="w-8 py-2 px-3" />
                                            <th className="text-left py-2 px-3 font-medium">预测单号</th>
                                            <th className="text-center py-2 px-3 font-medium whitespace-nowrap">交货日期</th>
                                            <th className="text-center py-2 px-3 font-medium whitespace-nowrap">终止日期</th>
                                            <th className="text-right py-2 px-3 font-medium">数量</th>
                                            <th className="text-center py-2 px-3 font-medium">标记</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {pageRecords.map(record => {
                                            const isSelected = selectedBillno === record.billno;
                                            const recommended = isRecommended(record.startdate || '');
                                            return (
                                                <tr
                                                    key={record.billno}
                                                    onClick={() => selectRecord(record)}
                                                    className={`border-b border-gray-100 last:border-0 cursor-pointer transition-colors ${
                                                        isSelected ? 'bg-indigo-50' : 'hover:bg-gray-50'
                                                    }`}
                                                >
                                                    {/* radio */}
                                                    <td className="py-2.5 px-3">
                                                        <span className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                                            isSelected ? 'border-indigo-600' : 'border-gray-300'
                                                        }`}>
                                                            {isSelected && <span className="w-2 h-2 rounded-full bg-indigo-600" />}
                                                        </span>
                                                    </td>
                                                    <td className={`py-2.5 px-3 font-mono ${isSelected ? 'text-indigo-700' : 'text-gray-600'}`}>
                                                        {record.billno || '-'}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-center text-gray-600">
                                                        {record.startdate?.slice(0, 10) || '-'}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-center text-gray-600">
                                                        {record.enddate?.slice(0, 10) || '-'}
                                                    </td>
                                                    <td className={`py-2.5 px-3 text-right font-medium ${isSelected ? 'text-indigo-700' : 'text-gray-700'}`}>
                                                        {record.qty.toLocaleString()}
                                                    </td>
                                                    <td className="py-2.5 px-3 text-center">
                                                        {recommended && (
                                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">
                                                                推荐
                                                            </span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* 分页控件 */}
                            {totalPages > 1 && (
                                <div className="flex items-center justify-center gap-3 mt-3">
                                    <button
                                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                        disabled={safePage === 1}
                                        className="px-3 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                                    >
                                        <ChevronLeft className="w-3 h-3" />上一页
                                    </button>
                                    <span className="text-xs text-gray-500 select-none">
                                        第 <span className="font-medium text-gray-700">{safePage}</span> / <span className="font-medium text-gray-700">{totalPages}</span> 页
                                    </span>
                                    <button
                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                        disabled={safePage === totalPages}
                                        className="px-3 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1"
                                    >
                                        下一页<ChevronRight className="w-3 h-3" />
                                    </button>
                                </div>
                            )}
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
                            {selectedBillno && (
                                <div>
                                    <label className="block text-xs font-medium text-gray-500 mb-1">
                                        关联预测单号
                                    </label>
                                    <div className="px-3 py-2 bg-gray-50 rounded-lg border border-gray-100 text-xs text-gray-500 font-mono">
                                        {selectedBillno}
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
