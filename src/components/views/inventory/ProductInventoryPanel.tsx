import React, { useState, useMemo, useEffect } from 'react';
import { Package, Search, Filter, Loader2, MoreHorizontal, AlertTriangle } from 'lucide-react';
import { metricModelApi, createLastDaysRange } from '../../../api';

import { apiConfigService } from '../../../services/apiConfigService';

// 指标模型 ID 和分析维度配置
const getProductInventoryModelId = () => apiConfigService.getMetricModelId('mm_product_inventory_optimization_huida') || 'd58keb5g5lk40hvh48og';
const PRODUCT_INVENTORY_DIMENSIONS = ['material_code', 'material_name', 'available_quantity'];

// 组件内部使用的产品数据类型
interface ProductData {
    productId: string;
    productName: string;
    stockQuantity: number;
    inventoryStatus: string;
}

interface Props {
    // Props 变为可选，组件内部自行获取数据
    onNavigate?: (view: string) => void;
}

export const ProductInventoryPanel: React.FC<Props> = ({ onNavigate }) => {
    const [products, setProducts] = useState<ProductData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);
    const itemsPerPage = 8;
    const [searchText, setSearchText] = useState('');

    // 从 API 获取数据
    useEffect(() => {
        async function fetchData() {
            try {
                setLoading(true);
                setError(null);

                const timeRange = createLastDaysRange(1);


                const result = await metricModelApi.queryByModelId(
                    getProductInventoryModelId(),
                    {
                        instant: true,
                        start: timeRange.start,
                        end: timeRange.end,
                        analysis_dimensions: PRODUCT_INVENTORY_DIMENSIONS,
                    },
                    { includeModel: true }
                );

                // 转换 API 数据为组件期望的格式
                const transformedData: ProductData[] = [];

                if (result.datas && result.datas.length > 0) {
                    for (const series of result.datas) {
                        const materialCode = series.labels?.material_code || '';
                        const materialName = series.labels?.material_name || '';
                        let availableQuantity = 0;

                        if (series.labels?.available_quantity) {
                            availableQuantity = parseFloat(series.labels.available_quantity) || 0;
                        } else if (series.values && series.values.length > 0) {
                            for (let i = series.values.length - 1; i >= 0; i--) {
                                if (series.values[i] !== null) {
                                    availableQuantity = series.values[i]!;
                                    break;
                                }
                            }
                        }

                        const stock = Math.floor(availableQuantity);
                        transformedData.push({
                            productId: materialCode,
                            productName: materialName,
                            stockQuantity: stock,
                            inventoryStatus: stock === 0 ? '缺货' : stock < 10 ? '慢动' : '正常',
                        });
                    }
                }

                // 按库存量降序排序
                transformedData.sort((a, b) => b.stockQuantity - a.stockQuantity);

                setProducts(transformedData);
            } catch (err) {
                console.error('[ProductInventoryPanel] API call failed:', err);
                setError(err instanceof Error ? err.message : '获取数据失败');
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    const filteredProducts = useMemo(() => {
        return products.filter(p =>
            p.productName.toLowerCase().includes(searchText.toLowerCase()) ||
            p.productId.toLowerCase().includes(searchText.toLowerCase())
        );
    }, [products, searchText]);

    const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
    const paginatedItems = filteredProducts.slice((page - 1) * itemsPerPage, page * itemsPerPage);

    if (loading) {
        return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-indigo-500" /></div>;
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center p-8 text-red-600">
                <AlertTriangle className="w-8 h-8 mb-2" />
                <span>{error}</span>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] ring-1 ring-slate-100 flex flex-col h-full overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-slate-100/80 flex justify-between items-center bg-gradient-to-r from-white to-slate-50/50">
                <div className="flex items-center gap-3">
                    <div className="bg-indigo-50/80 p-2.5 rounded-xl border border-indigo-100/50">
                        <Package className="text-indigo-600" size={20} />
                    </div>
                    <div>
                        <h2 className="font-bold text-slate-800 tracking-tight">产品库存智能体</h2>
                        <p className="text-xs text-slate-500 font-medium">{filteredProducts.length} 个产品监控中</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <div className="relative group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-indigo-400 transition-colors" size={15} />
                        <input
                            type="text"
                            placeholder="搜索产品..."
                            className="pl-9 pr-4 py-2 text-sm bg-slate-50/50 border border-slate-200 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all w-32 md:w-56 hover:bg-white"
                            value={searchText}
                            onChange={e => { setSearchText(e.target.value); setPage(1); }}
                        />
                    </div>
                </div>
            </div>

            {/* List */}
            <div className="p-5 flex-1 overflow-auto min-h-[400px]">
                <div className="space-y-3">
                    {paginatedItems.map((product, idx) => (
                        <div key={idx} className="group relative bg-white border border-slate-100 rounded-2xl p-4 hover:shadow-[0_4px_20px_-8px_rgba(79,70,229,0.15)] hover:border-indigo-300/30 transition-all duration-300 cursor-pointer">
                            {/* Status Badge */}
                            <div className="absolute top-4 right-4 flex gap-2">
                                <span className={`px-2.5 py-1 text-xs font-semibold rounded-full shadow-sm ${product.inventoryStatus === '呆滞' ? 'bg-red-50 text-red-600 ring-1 ring-red-100' :
                                    product.inventoryStatus === '缺货' ? 'bg-orange-50 text-orange-600 ring-1 ring-orange-100' :
                                        product.inventoryStatus === '慢动' ? 'bg-yellow-50 text-yellow-600 ring-1 ring-yellow-100' :
                                            'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100'
                                    }`}>
                                    {product.inventoryStatus || '正常'}
                                </span>
                            </div>

                            <div className="mb-3 pr-20">
                                <h3 className="font-bold text-slate-800 text-base tracking-tight group-hover:text-indigo-700 transition-colors">{product.productName}</h3>
                                <p className="text-xs text-slate-400 mt-1 font-medium font-mono">编码: {product.productId}</p>
                            </div>

                            {/* Stock Display */}
                            <div className="space-y-2.5">
                                <div className="flex justify-between text-xs text-slate-600 mb-1">
                                    <span className="font-medium">可用库存</span>
                                    <span className="text-lg font-bold text-slate-800">{product.stockQuantity}</span>
                                </div>
                                {/* Visual Bar */}
                                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden ring-1 ring-slate-100">
                                    <div
                                        className={`h-full ${product.stockQuantity === 0 ? 'bg-red-500' : product.stockQuantity < 10 ? 'bg-yellow-500' : 'bg-emerald-500'}`}
                                        style={{ width: `${Math.min(100, (product.stockQuantity / 100) * 100)}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="p-4 border-t border-slate-100 bg-slate-50/50 rounded-b-2xl flex justify-between items-center text-sm">
                    <button
                        disabled={page === 1}
                        onClick={() => setPage(p => p - 1)}
                        className="px-4 py-1.5 text-slate-600 hover:bg-white border border-transparent hover:border-slate-200 hover:shadow-sm rounded-lg disabled:opacity-50 transition-all"
                    >
                        上一页
                    </button>
                    <span className="text-slate-500 font-medium">{page} / {totalPages}</span>
                    <button
                        disabled={page === totalPages}
                        onClick={() => setPage(p => p + 1)}
                        className="px-4 py-1.5 text-slate-600 hover:bg-white border border-transparent hover:border-slate-200 hover:shadow-sm rounded-lg disabled:opacity-50 transition-all"
                    >
                        下一页
                    </button>
                </div>
            )}
        </div>
    );
};
