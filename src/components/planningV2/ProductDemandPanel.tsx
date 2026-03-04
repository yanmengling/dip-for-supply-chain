/**
 * 产品需求计划(PP) - Step ① 产品选择 + 需求确认面板
 *
 * v2.9 数据源变更：
 *   产品列表: supplychain_hd0202_product（material_number / material_name）
 *   需求数据: supplychain_hd0202_forecast（startdate / enddate / qty），按 material_number 查询
 *   原 PP 对象（supplychain_hd0202_pp）已废弃，不再使用
 *
 * 参考: /docs/PRD_动态计划协同V2.md 4.3 章节
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, ChevronRight, ChevronDown, ChevronUp, Loader2, AlertCircle, Info } from 'lucide-react';
import {
    planningV2DataService,
    type ProductAPI,
    type ForecastRecordAPI,
} from '../../services/planningV2DataService';
import type { Step1Data } from '../../types/planningV2';

// ============================================================================
// Props
// ============================================================================

interface ProductDemandPanelProps {
    active: boolean;
    onConfirm: (data: Step1Data) => void;
    initialData?: Step1Data;
}

// ============================================================================
// 辅助：根据 forecast 记录聚合需求计划信息
// ============================================================================

function aggregateForecast(records: ForecastRecordAPI[]): {
    demandStart: string;
    demandEnd: string;
    demandQuantity: number;
} {
    if (records.length === 0) {
        return { demandStart: '', demandEnd: '', demandQuantity: 0 };
    }

    const startDates = records.map(r => r.startdate).filter(Boolean).sort();
    const endDates = records.map(r => r.enddate).filter(Boolean).sort();
    const demandQuantity = records.reduce((sum, r) => sum + r.qty, 0);

    return {
        demandStart: startDates[0] || '',
        demandEnd: endDates[endDates.length - 1] || startDates[startDates.length - 1] || '',
        demandQuantity,
    };
}

// ============================================================================
// Component
// ============================================================================

const ProductDemandPanel = ({ active, onConfirm, initialData }: ProductDemandPanelProps) => {
    // -------- 产品列表加载 --------
    const [productsLoading, setProductsLoading] = useState(true);
    const [productsError, setProductsError] = useState<string | null>(null);
    const [products, setProducts] = useState<ProductAPI[]>([]);

    // -------- 需求预测加载 --------
    const [forecastLoading, setForecastLoading] = useState(false);
    const [forecastRecords, setForecastRecords] = useState<ForecastRecordAPI[]>([]);
    const [forecastLoaded, setForecastLoaded] = useState(false);
    const [forecastDetailOpen, setForecastDetailOpen] = useState(false);

    // -------- 交互状态 --------
    const [searchText, setSearchText] = useState('');
    const [selectedProductCode, setSelectedProductCode] = useState<string>('');

    // -------- 表单状态（可编辑字段） --------
    const [demandStart, setDemandStart] = useState('');
    const [demandEnd, setDemandEnd] = useState('');
    const [demandQuantity, setDemandQuantity] = useState<number | ''>('');

    // ========================================================================
    // 加载产品列表
    // ========================================================================

    const loadProducts = useCallback(async () => {
        setProductsLoading(true);
        setProductsError(null);
        try {
            const data = await planningV2DataService.loadProducts();
            setProducts(data);
            console.log(`[ProductDemandPanel] 产品列表加载完成: ${data.length} 条`);
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
    // 选择产品 -> 查询 forecast -> 自动聚合
    // ========================================================================

    const handleSelectProduct = useCallback(async (productCode: string) => {
        setSelectedProductCode(productCode);
        setForecastLoaded(false);
        setForecastRecords([]);
        setDemandStart('');
        setDemandEnd('');
        setDemandQuantity('');

        setForecastLoading(true);
        try {
            const records = await planningV2DataService.loadForecastByProduct(productCode);
            setForecastRecords(records);
            setForecastLoaded(true);
            console.log(`[ProductDemandPanel] 需求预测 ${productCode}: ${records.length} 条`);

            const agg = aggregateForecast(records);
            setDemandStart(agg.demandStart);
            setDemandEnd(agg.demandEnd);
            setDemandQuantity(agg.demandQuantity > 0 ? agg.demandQuantity : '');
        } catch (err) {
            console.error(`[ProductDemandPanel] 加载需求预测失败 ${productCode}:`, err);
            setForecastLoaded(true); // 失败也标记已加载，显示手动填写提示
        } finally {
            setForecastLoading(false);
        }
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
        });
    };

    if (!active) return null;

    // ========================================================================
    // 加载中（产品列表）
    // ========================================================================

    if (productsLoading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
                <p className="text-sm text-gray-500">正在加载产品数据...</p>
            </div>
        );
    }

    // ========================================================================
    // 错误状态
    // ========================================================================

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
    // 正常渲染
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

            {/* ---- 需求预测信息 ---- */}
            {selectedProductCode && selectedProduct && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h3 className="text-sm font-semibold text-gray-800 mb-4">
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

                    {/* 有预测数据：展示聚合结果 + 明细入口 */}
                    {!forecastLoading && forecastLoaded && forecastRecords.length > 0 && (
                        <div className="mb-4">
                            <div className="flex items-center justify-between mb-1">
                                <span className="text-xs text-green-600 font-medium">
                                    已从 {forecastRecords.length} 条预测单自动聚合
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setForecastDetailOpen(v => !v)}
                                    className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800"
                                >
                                    {forecastDetailOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                                    {forecastDetailOpen ? '收起明细' : '查看明细'}
                                </button>
                            </div>

                            {forecastDetailOpen && (
                                <div className="mt-2 border border-slate-100 rounded-lg overflow-hidden">
                                    <table className="w-full text-xs">
                                        <thead className="bg-slate-50">
                                            <tr className="text-slate-500">
                                                <th className="py-1.5 px-3 text-left font-medium">预测单号</th>
                                                <th className="py-1.5 px-3 text-left font-medium">交货日期</th>
                                                <th className="py-1.5 px-3 text-left font-medium">终止日期</th>
                                                <th className="py-1.5 px-3 text-right font-medium">数量</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {forecastRecords.map((r, i) => (
                                                <tr key={i} className="border-t border-slate-100">
                                                    <td className="py-1.5 px-3 font-mono text-slate-600">{r.billno || '-'}</td>
                                                    <td className="py-1.5 px-3 text-slate-600">{r.startdate?.slice(0, 10) || '-'}</td>
                                                    <td className="py-1.5 px-3 text-slate-600">{r.enddate?.slice(0, 10) || '-'}</td>
                                                    <td className="py-1.5 px-3 text-right text-slate-700 font-medium">{r.qty.toLocaleString()}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
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
