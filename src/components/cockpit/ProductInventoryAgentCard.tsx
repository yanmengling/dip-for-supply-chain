/**
 * 产品库存智能体卡片组件
 *
 * 通过指标模型 API 获取产品库存数据：
 * 从配置中心配置的"产品库存优化模型"（mm_product_inventory_optimization）查询。
 */

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, TrendingUp } from 'lucide-react';
import { metricModelApi, createLastDaysRange } from '../../api/metricModelApi';
import { apiConfigService } from '../../services/apiConfigService';
import type { ProductInventoryResult } from '../../services/productInventoryCalculator';

// ============================================================================
// 指标模型 ID 解析
// ============================================================================

/**
 * 从配置中心获取"产品库存优化模型"的 modelId，
 * 回退到默认 modelId。
 */
const getProductInventoryModelId = () =>
    apiConfigService.getMetricModelId('mm_product_inventory_optimization') || 'd58keb5g5lk40hvh48og';



// ============================================================================
// 主组件
// ============================================================================

const ProductInventoryAgentCard = () => {
    const [products, setProducts] = useState<ProductInventoryResult[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        async function fetchData() {
            try {
                setLoading(true);
                setError(null);

                const modelId = getProductInventoryModelId();
                console.log('[产品库存] 查询指标模型，modelId:', modelId);

                const timeRange = createLastDaysRange(1);

                // ── 第一步：不传维度，获取 model.analysis_dimensions ────
                const firstResult = await metricModelApi.queryByModelId(
                    modelId,
                    { instant: true, start: timeRange.start, end: timeRange.end },
                    { includeModel: true }
                );

                // 从模型信息中提取有效的分析维度，只保留需要的字段
                const rawDims = firstResult.model?.analysis_dimensions ?? [];
                const allDims: string[] = rawDims.map((d) =>
                    typeof d === 'string' ? d : (d as { name: string }).name
                ).filter(Boolean);

                // material_name 在底层 SQL 视图中跨多表存在（Column is ambiguous），不能用作维度
                // 数量查询只用无歧义的编码 + 数量字段
                const NEEDED_DIMS = ['material_code', 'inventory_qty', 'available_inventory_qty'];
                const validDims = NEEDED_DIMS.filter(d => allDims.includes(d));

                console.log('[产品库存] 全部维度:', allDims, '使用维度:', validDims);

                // ── 第二步：用有效维度下钻，否则沿用第一步结果 ──────────
                let result = firstResult;
                if (validDims.length > 0) {
                    result = await metricModelApi.queryByModelId(
                        modelId,
                        {
                            instant: true,
                            start: timeRange.start,
                            end: timeRange.end,
                            analysis_dimensions: validDims,
                        },
                        { includeModel: false, ignoringHcts: true }
                    );
                }

                console.log('[产品库存] 指标模型返回数据条数:', result.datas?.length ?? 0);

                // ── 第三步：单独查询 material_code + material_name 建立名称映射 ──
                // 由于产品库存模型的 material_name 有歧义，我们从无歧义的物料库存模型获取映射
                const nameMap = new Map<string, string>();
                const materialModelId = apiConfigService.getMetricModelId('mm_material_inventory_optimization') || 'd58ihclg5lk40hvh48mg';
                const nameDims = ['material_code', 'material_name'];
                try {
                    const nameResult = await metricModelApi.queryByModelId(
                        materialModelId,
                        {
                            instant: true,
                            start: timeRange.start,
                            end: timeRange.end,
                            analysis_dimensions: nameDims,
                        },
                        { includeModel: false, ignoringHcts: true }
                    );
                    if (nameResult.datas) {
                        const NIL_LIKE_NAME = /^(\\<nil\\>|nil|null|undefined|none)$/i;
                        for (const s of nameResult.datas) {
                            const c = (s.labels?.material_code || '').trim();
                            const n = (s.labels?.material_name || '').trim();
                            if (c && !NIL_LIKE_NAME.test(c) && n && !NIL_LIKE_NAME.test(n)) {
                                nameMap.set(c, n);
                            }
                        }
                    }
                    console.log('[产品库存] 名称映射条数:', nameMap.size);
                } catch (nameErr) {
                    console.warn('[产品库存] 名称查询失败，降级显示编号:', nameErr);
                }


                // 使用 Map 按 code 合并，避免同一产品编码因多条 series 重复出现
                const mergedMap = new Map<string, ProductInventoryResult>();

                if (result.datas && result.datas.length > 0) {
                    for (const series of result.datas) {
                        const labels = series.labels || {};

                        const code = (
                            labels.material_code ||
                            labels.product_code ||
                            labels.material_number ||
                            ''
                        ).trim();

                        const name = (
                            labels.material_name ||
                            labels.product_name ||
                            ''
                        ).trim();

                        const NIL_LIKE = /^(\\<nil\\>|nil|null|undefined|none)$/i;
                        if (!code || NIL_LIKE.test(code)) continue;

                        // 优先从 labels 中读取库存量，否则取 values 末尾最新值
                        let availableQuantity = 0;
                        const qtyFromLabel =
                            labels.available_quantity ??
                            labels.available_inventory_qty ??
                            labels.inventory_qty ??
                            null;
                        if (qtyFromLabel !== null && qtyFromLabel !== undefined) {
                            availableQuantity = parseFloat(String(qtyFromLabel)) || 0;
                        } else if (series.values && series.values.length > 0) {
                            for (let i = series.values.length - 1; i >= 0; i--) {
                                if (series.values[i] !== null) {
                                    availableQuantity = series.values[i]!;
                                    break;
                                }
                            }
                        }

                        const qty = Math.floor(availableQuantity);

                        if (mergedMap.has(code)) {
                            // 相同编码：累加库存量，name 取已有的（非空优先）
                            const existing = mergedMap.get(code)!;
                            existing.calculatedStock += qty;
                            if (!existing.productName || existing.productName === code) {
                                existing.productName = nameMap.get(code) || name || code;
                            }
                        } else {
                            mergedMap.set(code, {
                                productCode: code,
                                productName: nameMap.get(code) || name || code,
                                calculatedStock: qty,
                                details: [],
                            });
                        }
                    }
                }

                const resultList: ProductInventoryResult[] = Array.from(mergedMap.values());

                // 按库存量降序排序
                resultList.sort((a, b) => b.calculatedStock - a.calculatedStock);

                console.log('[产品库存] 最终合并结果数量:', resultList.length);
                setProducts(resultList);
            } catch (err) {
                console.error('[产品库存] 指标模型查询失败:', err);
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
