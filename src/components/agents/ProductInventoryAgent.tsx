/**
 * 产品库存智能体组件
 * 
 * 直接通过指标模型 API 获取产品库存数据
 */

import { useEffect, useState } from 'react';
import { Package, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { metricModelApi, createLastDaysRange } from '../../api';
import type { ProductInventoryResult } from '../../services/productInventoryCalculator';

// 指标模型 ID 和分析维度配置
const PRODUCT_INVENTORY_MODEL_ID = 'd58keb5g5lk40hvh48og';
const PRODUCT_INVENTORY_DIMENSIONS = ['material_code', 'material_name'];

interface Props {
    onNavigate?: (view: string) => void;
}

const ProductInventoryAgent = ({ onNavigate }: Props) => {
    const [products, setProducts] = useState<ProductInventoryResult[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // 创建 AbortController 用于取消请求
        const abortController = new AbortController();
        let isMounted = true;

        async function fetchData() {
            try {
                setLoading(true);
                setError(null);

                console.log('[Product Inventory Agent] Fetching from API...');

                const timeRange = createLastDaysRange(1);

                const result = await metricModelApi.queryByModelId(
                    PRODUCT_INVENTORY_MODEL_ID,
                    {
                        instant: true,
                        start: timeRange.start,
                        end: timeRange.end,
                        analysis_dimensions: PRODUCT_INVENTORY_DIMENSIONS,
                    },
                    { includeModel: true }
                );

                // 检查组件是否已卸载
                if (!isMounted || abortController.signal.aborted) {
                    console.log('[Product Inventory Agent] Request cancelled');
                    return;
                }

                // 转换 API 数据为组件期望的格式
                const transformedData: ProductInventoryResult[] = [];

                if (result.datas && result.datas.length > 0) {
                    for (const series of result.datas) {
                        const materialCode = series.labels?.material_code || '';
                        const materialName = series.labels?.material_name || '';
                        // 获取 available_quantity
                        let availableQuantity = 0;

                        // 优先从 labels 中获取（如果作为维度传递）
                        if (series.labels?.available_quantity) {
                            availableQuantity = parseFloat(series.labels.available_quantity) || 0;
                        }
                        // 其次从 values 中获取最新值（如果作为度量值）
                        else if (series.values && series.values.length > 0) {
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

                // 再次检查组件是否已卸载
                if (!isMounted) {
                    return;
                }

                setProducts(transformedData);
                console.log('[Product Inventory Agent] Data fetched:', transformedData);
            } catch (err) {
                // 忽略 AbortError
                if (err instanceof Error && err.name === 'AbortError') {
                    console.log('[Product Inventory Agent] Request aborted');
                    return;
                }

                // 检查组件是否已卸载
                if (!isMounted) {
                    return;
                }

                console.error('[Product Inventory Agent] API call failed:', err);
                setError(err instanceof Error ? err.message : '获取数据失败');
            } finally {
                if (isMounted) {
                    setLoading(false);
                }
            }
        }

        fetchData();

        // 清理函数：取消未完成的请求
        return () => {
            isMounted = false;
            abortController.abort();
            console.log('[Product Inventory Agent] Cleanup: aborted request');
        };
    }, []);

    // 计算总库存
    const totalStock = products.reduce((sum, p) => sum + p.calculatedStock, 0);

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                <span className="ml-2 text-gray-600">正在获取产品库存...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center text-red-800">
                    <AlertTriangle className="w-5 h-5 mr-2" />
                    <span>计算失败: {error}</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {/* 标题和说明 */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                        <Package className="w-5 h-5 mr-2 text-indigo-600" />
                        产品库存智能体
                    </h3>
                    <p className="text-sm text-gray-500 mt-1">
                        基于指标模型实时查询
                    </p>
                </div>
            </div>

            {/* 总库存卡片 */}
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg p-6 border border-indigo-100">
                <div className="text-sm text-indigo-700 font-medium mb-2">
                    库存产品总数
                </div>
                <div className="text-4xl font-bold text-indigo-900">
                    {totalStock}
                </div>
                <div className="text-sm text-indigo-600 mt-2">
                    产品可用库存数量
                </div>
            </div>

            {/* 产品明细列表 */}
            <div className="space-y-3">
                <div className="text-sm font-medium text-gray-700">产品明细</div>

                {products.map((product) => (
                    <div
                        key={product.productCode}
                        className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow"
                    >
                        <div className="flex items-start justify-between">
                            <div className="flex-1">
                                <div className="flex items-center">
                                    <h4 className="font-medium text-gray-900">
                                        {product.productName}
                                    </h4>
                                    {product.calculatedStock > 0 ? (
                                        <CheckCircle className="w-4 h-4 ml-2 text-green-500" />
                                    ) : (
                                        <AlertTriangle className="w-4 h-4 ml-2 text-orange-500" />
                                    )}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                    {product.productCode}
                                </div>
                            </div>

                            <div className="text-right">
                                <div className="text-2xl font-bold text-gray-900">
                                    {product.calculatedStock}
                                </div>
                                <div className="text-xs text-gray-500">件</div>
                            </div>
                        </div>

                        {/* 瓶颈物料提示 */}
                        {product.bottleneckMaterial && product.calculatedStock === 0 && (
                            <div className="mt-3 pt-3 border-t border-gray-100">
                                <div className="flex items-start text-sm">
                                    <AlertTriangle className="w-4 h-4 mr-2 text-orange-500 flex-shrink-0 mt-0.5" />
                                    <div>
                                        <div className="text-orange-700 font-medium">
                                            瓶颈物料: {product.bottleneckMaterial.name}
                                        </div>
                                        <div className="text-gray-600 text-xs mt-1">
                                            库存: {product.bottleneckMaterial.available} / 需求: {product.bottleneckMaterial.required}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            {/* 说明 */}
            <div className="text-xs text-gray-500 bg-gray-50 rounded p-3">
                💡 产品库存数据来自指标模型实时查询
            </div>
        </div>
    );
};

export default ProductInventoryAgent;
