/**
 * 产品需求计划(PP) - Step ① 产品选择 + 需求确认面板
 *
 * 用户选择一个产品，自动聚合该产品的需求计划信息（时间范围、需求总量），
 * 允许手动修改后确认，进入下一步。
 *
 * 数据源: supplychain_hd0202_pp
 * 参考: /docs/PRD_动态计划协同V2.md 2.1 章节
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Search, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import {
    planningV2DataService,
    type ProductDemandPlanAPI,
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
// 辅助：根据选中产品的 PP 记录，聚合需求计划信息
// ============================================================================

function aggregateDemand(records: ProductDemandPlanAPI[]): {
    demandStart: string;
    demandEnd: string;
    demandQuantity: number;
} {
    if (records.length === 0) {
        return { demandStart: '', demandEnd: '', demandQuantity: 0 };
    }

    const dates = records
        .map(r => r.planned_date)
        .filter(Boolean)
        .sort();

    const demandStart = dates[0] || '';
    const demandEnd = dates[dates.length - 1] || '';
    const demandQuantity = records.reduce((sum, r) => sum + r.planned_demand_quantity, 0);

    return { demandStart, demandEnd, demandQuantity };
}

// ============================================================================
// Component
// ============================================================================

const ProductDemandPanel = ({ active, onConfirm, initialData }: ProductDemandPanelProps) => {
    // -------- 数据加载状态 --------
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [plans, setPlans] = useState<ProductDemandPlanAPI[]>([]);

    // -------- 交互状态 --------
    const [searchText, setSearchText] = useState('');
    const [selectedProductCode, setSelectedProductCode] = useState<string>('');

    // -------- 表单状态（可编辑字段） --------
    const [demandStart, setDemandStart] = useState('');
    const [demandEnd, setDemandEnd] = useState('');
    const [demandQuantity, setDemandQuantity] = useState<number | ''>('');

    // ========================================================================
    // 数据加载
    // ========================================================================

    const loadData = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            const data = await planningV2DataService.loadProductDemandPlans();
            setPlans(data);
        } catch (err) {
            console.error('加载产品需求计划失败:', err);
            setError('加载产品需求计划数据失败，请检查网络连接后重试');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (active) {
            loadData();
        }
    }, [active, loadData]);

    // ========================================================================
    // 去重产品列表
    // ========================================================================

    const uniqueProducts = useMemo(() => {
        const map = new Map<string, string>();
        plans.forEach(p => {
            if (p.product_code && !map.has(p.product_code)) {
                map.set(p.product_code, p.product_name);
            }
        });
        return Array.from(map.entries()).map(([code, name]) => ({
            product_code: code,
            product_name: name,
        }));
    }, [plans]);

    // ========================================================================
    // 搜索过滤
    // ========================================================================

    const filteredProducts = useMemo(() => {
        if (!searchText.trim()) return uniqueProducts;
        const q = searchText.toLowerCase();
        return uniqueProducts.filter(
            p =>
                p.product_name.toLowerCase().includes(q) ||
                p.product_code.toLowerCase().includes(q),
        );
    }, [uniqueProducts, searchText]);

    // ========================================================================
    // 选中产品名称（只读展示用）
    // ========================================================================

    const selectedProduct = useMemo(
        () => uniqueProducts.find(p => p.product_code === selectedProductCode),
        [uniqueProducts, selectedProductCode],
    );

    // ========================================================================
    // 选择产品 -> 自动聚合
    // ========================================================================

    const handleSelectProduct = useCallback(
        (productCode: string) => {
            setSelectedProductCode(productCode);

            const records = plans.filter(p => p.product_code === productCode);
            const agg = aggregateDemand(records);
            setDemandStart(agg.demandStart);
            setDemandEnd(agg.demandEnd);
            setDemandQuantity(agg.demandQuantity);
        },
        [plans],
    );

    // ========================================================================
    // 回填 initialData（回退编辑场景）
    // ========================================================================

    useEffect(() => {
        if (initialData && plans.length > 0) {
            setSelectedProductCode(initialData.productCode);
            setDemandStart(initialData.demandStart);
            setDemandEnd(initialData.demandEnd);
            setDemandQuantity(initialData.demandQuantity);
        }
    }, [initialData, plans]);

    // ========================================================================
    // 确认按钮是否可用
    // ========================================================================

    const canConfirm =
        !!selectedProductCode &&
        !!selectedProduct &&
        !!demandStart &&
        !!demandEnd &&
        demandQuantity !== '' &&
        demandQuantity > 0;

    const handleConfirm = () => {
        if (!canConfirm || !selectedProduct) return;

        onConfirm({
            productCode: selectedProductCode,
            productName: selectedProduct.product_name,
            demandStart,
            demandEnd,
            demandQuantity: Number(demandQuantity),
        });
    };

    // ========================================================================
    // 非激活时不渲染
    // ========================================================================

    if (!active) return null;

    // ========================================================================
    // 加载中
    // ========================================================================

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
                <p className="text-sm text-gray-500">正在加载产品需求计划数据...</p>
            </div>
        );
    }

    // ========================================================================
    // 错误状态
    // ========================================================================

    if (error) {
        return (
            <div className="bg-white rounded-lg border border-gray-200 p-6">
                <div className="flex flex-col items-center justify-center py-12">
                    <AlertCircle className="w-10 h-10 text-red-400 mb-4" />
                    <p className="text-sm text-red-600 mb-4">{error}</p>
                    <button
                        onClick={loadData}
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
                        <div className="py-8 text-center text-sm text-gray-400">
                            {uniqueProducts.length === 0
                                ? '暂无产品需求计划数据'
                                : '没有匹配的产品'}
                        </div>
                    ) : (
                        <ul className="divide-y divide-gray-100">
                            {filteredProducts.map(product => {
                                const isSelected =
                                    selectedProductCode === product.product_code;

                                return (
                                    <li
                                        key={product.product_code}
                                        onClick={() =>
                                            handleSelectProduct(product.product_code)
                                        }
                                        className={`flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors ${
                                            isSelected
                                                ? 'bg-indigo-50'
                                                : 'hover:bg-gray-50'
                                        }`}
                                    >
                                        {/* Radio indicator */}
                                        <span
                                            className={`flex-shrink-0 w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                                isSelected
                                                    ? 'border-indigo-600'
                                                    : 'border-gray-300'
                                            }`}
                                        >
                                            {isSelected && (
                                                <span className="w-2 h-2 rounded-full bg-indigo-600" />
                                            )}
                                        </span>

                                        {/* Product info */}
                                        <div className="min-w-0 flex-1">
                                            <p
                                                className={`text-sm font-medium truncate ${
                                                    isSelected
                                                        ? 'text-indigo-700'
                                                        : 'text-gray-800'
                                                }`}
                                            >
                                                {product.product_name}
                                            </p>
                                            <p className="text-xs text-gray-400 font-mono mt-0.5">
                                                {product.product_code}
                                            </p>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>

                <p className="text-xs text-gray-400 mt-2">
                    共 {uniqueProducts.length} 个产品
                    {searchText.trim() &&
                        `，筛选后 ${filteredProducts.length} 个`}
                </p>
            </div>

            {/* ---- 已选择产品需求计划信息 ---- */}
            {selectedProductCode && selectedProduct && (
                <div className="bg-white rounded-lg border border-gray-200 p-4">
                    <h3 className="text-sm font-semibold text-gray-800 mb-4">
                        已选择产品需求计划信息
                    </h3>

                    <div className="space-y-4">
                        {/* 产品信息（只读） */}
                        <div>
                            <label className="block text-xs font-medium text-gray-500 mb-1">
                                产品信息
                            </label>
                            <div className="px-3 py-2 bg-gray-50 rounded-lg border border-gray-100 text-sm text-gray-700">
                                {selectedProduct.product_name}
                                <span className="ml-2 text-xs text-gray-400 font-mono">
                                    ({selectedProductCode})
                                </span>
                            </div>
                        </div>

                        {/* 需求计划时间（可编辑） */}
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

                        {/* 需求数量（可编辑） */}
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
