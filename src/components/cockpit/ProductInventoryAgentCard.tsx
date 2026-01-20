/**
 * 产品库存智能体卡片组件
 * 
 * 直接通过指标模型 API 获取产品库存数据
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, TrendingUp, Package } from 'lucide-react';
import { metricModelApi, createLastDaysRange } from '../../api';
import type { ProductInventoryResult } from '../../services/productInventoryCalculator';

import { apiConfigService } from '../../services/apiConfigService';

// 指标模型 ID 和分析维度配置
const getProductInventoryModelId = () => apiConfigService.getMetricModelId('mm_product_inventory_optimization_huida') || 'd58keb5g5lk40hvh48og';
const PRODUCT_INVENTORY_DIMENSIONS = ['material_code', 'material_name', 'available_quantity'];

const ProductInventoryAgentCard = () => {
    const [products, setProducts] = useState<ProductInventoryResult[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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
                const transformedData: ProductInventoryResult[] = [];

                if (result.datas && result.datas.length > 0) {
                    for (const series of result.datas) {
                        const materialCode = series.labels?.material_code || '';
                        const materialName = series.labels?.material_name || '';
                        // 获取 available_quantity：可能在 labels 中作为维度，或在 values 中作为度量值
                        let availableQuantity = 0;

                        // 优先从 labels 中获取（如果作为维度传递）
                        if (series.labels?.available_quantity) {
                            availableQuantity = parseFloat(series.labels.available_quantity) || 0;
                        }
                        // 其次从 values 中获取最新值（如果作为度量值）
                        else if (series.values && series.values.length > 0) {
                            // 取最后一个非空值
                            for (let i = series.values.length - 1; i >= 0; i--) {
                                if (series.values[i] !== null) {
                                    availableQuantity = series.values[i]!;
                                    break;
                                }
                            }
                        }

                        transformedData.push({
                            productCode: materialCode,
                            productName: materialName,
                            calculatedStock: Math.floor(availableQuantity),
                            details: [],
                        });
                    }
                }

                // 按库存量降序排序
                transformedData.sort((a, b) => b.calculatedStock - a.calculatedStock);

                setProducts(transformedData);
            } catch (err) {
                console.error('[Product Inventory Agent] API call failed:', err);
                setError(err instanceof Error ? err.message : '获取数据失败');
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-100">
                <div className="text-center text-blue-600">
                    正在获取产品库存...
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-xl p-6 border border-red-100">
                <div className="text-center text-red-600">
                    <AlertTriangle className="mx-auto mb-2" size={24} />
                    <div className="text-sm">{error}</div>
                </div>
            </div>
        );
    }

    const totalStock = products.reduce((sum, p) => sum + p.calculatedStock, 0);

    return (
        <div className="space-y-3">
            {/* 总库存卡片 */}
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-6 border border-green-100">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-sm text-green-700 font-medium mb-1">
                            库存产品总数
                        </div>
                        <div className="text-3xl font-bold text-green-900">
                            {totalStock}
                        </div>
                        <div className="text-xs text-green-600 mt-1">
                            基于指标模型实时查询
                        </div>
                    </div>
                    <div className="p-3 bg-green-100 rounded-lg">
                        <TrendingUp className="text-green-600" size={24} />
                    </div>
                </div>
            </div>

            {/* 产品明细 */}
            {products.map((product) => (
                <div
                    key={product.productCode}
                    className={`rounded-xl p-4 border ${product.calculatedStock > 0
                        ? 'bg-white border-gray-200'
                        : 'bg-red-50 border-red-200'
                        }`}
                >
                    <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                            <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900 text-sm">
                                    {product.productName}
                                </span>
                                {product.calculatedStock > 0 ? (
                                    <CheckCircle className="text-green-500" size={14} />
                                ) : (
                                    <AlertTriangle className="text-red-500" size={14} />
                                )}
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                                {product.productCode}
                            </div>
                        </div>
                        <div className="text-right">
                            <div className={`text-xl font-bold ${product.calculatedStock > 0 ? 'text-gray-900' : 'text-red-600'
                                }`}>
                                {product.calculatedStock}
                            </div>
                            <div className="text-xs text-gray-500">件</div>
                        </div>
                    </div>

                    {/* 瓶颈提示 */}
                    {product.bottleneckMaterial && product.calculatedStock === 0 && (
                        <div className="mt-2 pt-2 border-t border-red-100">
                            <div className="flex items-start gap-1.5 text-xs">
                                <AlertTriangle className="text-red-500 flex-shrink-0 mt-0.5" size={12} />
                                <div className="text-red-700">
                                    <span className="font-medium">瓶颈物料:</span>{' '}
                                    {product.bottleneckMaterial.name}
                                    <div className="text-red-600 mt-0.5">
                                        库存: {product.bottleneckMaterial.available} / 需求: {product.bottleneckMaterial.required}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            ))}
        </div>
    );
};

export default ProductInventoryAgentCard;
