/**
 * 产品库存智能体组件
 *
 * 通过指标模型 API 获取产品库存数据：
 * 从配置中心配置的"产品库存优化模型"（mm_product_inventory_optimization）查询。
 */

import { useEffect, useState } from 'react';
import { Package, AlertTriangle, CheckCircle, Loader2 } from 'lucide-react';
import { metricModelApi, createLastDaysRange } from '../../api/metricModelApi';
import { apiConfigService } from '../../services/apiConfigService';
import { loadProductData, type ProductInventoryResult } from '../../services/productInventoryCalculator';

// ============================================================================
// 指标模型 ID 解析
// ============================================================================

const getProductInventoryModelId = () =>
    apiConfigService.getMetricModelId('mm_product_inventory_optimization') || 'd58keb5g5lk40hvh48og';

// ── 模块级结果缓存（3 分钟 TTL，页面切换时不重复请求）─────────────────────
const _PRODUCT_AGENT_CACHE_TTL = 3 * 60 * 1000;
let _productAgentCache: ProductInventoryResult[] | null = null;
let _productAgentCacheTime = 0;

// ============================================================================
// 主组件
// ============================================================================


interface Props {
    onNavigate?: (view: string) => void;
}

const PAGE_SIZE = 10;

const ProductInventoryAgent = ({ onNavigate: _onNavigate }: Props) => {
    const _initCached =
        _productAgentCache && Date.now() - _productAgentCacheTime < _PRODUCT_AGENT_CACHE_TTL
            ? _productAgentCache : null;
    const [products, setProducts] = useState<ProductInventoryResult[]>(_initCached ?? []);
    const [loading, setLoading] = useState(!_initCached);
    const [error, setError] = useState<string | null>(null);
    const [page, setPage] = useState(1);

    useEffect(() => {
        let isMounted = true;

        async function fetchData() {
            // 命中模块级缓存则直接渲染，跳过所有 API 请求
            const now = Date.now();
            if (_productAgentCache && now - _productAgentCacheTime < _PRODUCT_AGENT_CACHE_TTL) {
                if (isMounted) {
                    setProducts(_productAgentCache);
                    setLoading(false);
                }
                return;
            }

            try {
                setLoading(true);
                setError(null);

                const modelId = getProductInventoryModelId();
                console.log('[产品库存智能体] 查询指标模型，modelId:', modelId);

                const timeRange = createLastDaysRange(1);

                // ── 第一步：不传维度，查询模型获取 model.analysis_dimensions ─
                const firstResult = await metricModelApi.queryByModelId(
                    modelId,
                    { instant: true, start: timeRange.start, end: timeRange.end },
                    { includeModel: true }
                );

                if (!isMounted) return;

                // 从模型信息中提取有效的分析维度，只保留需要的字段
                const rawDims = firstResult.model?.analysis_dimensions ?? [];
                const allDims: string[] = rawDims.map((d) =>
                    typeof d === 'string' ? d : (d as { name: string }).name
                ).filter(Boolean);

                // material_name 在底层 SQL 视图中跨多表存在（Column is ambiguous），不能用作维度
                // 数量查询只用无歧义的编码 + 数量字段
                const NEEDED_DIMS = ['material_code', 'inventory_qty', 'available_inventory_qty'];
                const validDims = NEEDED_DIMS.filter(d => allDims.includes(d));

                console.log('[产品库存智能体] 全部维度:', allDims, '使用维度:', validDims);

                // ── 第二步：若有有效维度则用其下钻，否则使用第一步结果 ───
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
                    if (!isMounted) return;
                }

                console.log('[产品库存智能体] 指标模型返回数据条数:', result.datas?.length ?? 0);

                // ── 第三步：建立名称映射 ──
                // 由于产品库存模型的 material_name 字段在底层 SQL 有歧义，单独查询也会报错，
                // 这里我们直接从本体数据加载产品基础信息，以建立准确的编号到名称的映射
                const nameMap = new Map<string, string>();

                try {
                    const productData = await loadProductData();
                    if (isMounted && productData) {
                        const NIL_LIKE_NAME = /^(\\<nil\\>|nil|null|undefined|none)$/i;
                        for (const p of productData) {
                            const c = (p.productCode || '').trim();
                            const n = (p.productName || '').trim();
                            if (c && !NIL_LIKE_NAME.test(c) && n && !NIL_LIKE_NAME.test(n)) {
                                nameMap.set(c, n);
                            }
                        }
                    }
                    console.log('[产品库存智能体] 从本体加载产品名称映射条数:', nameMap.size);
                } catch (nameErr) {
                    // 名称查询失败不影响库存数据显示，降级为显示编号
                    console.warn('[产品库存智能体] 产品名称查询失败，降级显示编号:', nameErr);
                }

                // 使用 Map 按 code 合并，避免同一产品编码因多条 series 重复出现
                const mergedMap = new Map<string, ProductInventoryResult>();

                if (result.datas && result.datas.length > 0) {
                    for (const series of result.datas) {
                        const labels = series.labels || {};

                        // 自适应读取编码字段（优先 material_code，次之 product_code 等）
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

                        // 过滤空值及后端返回的 nil 类字符串（"<nil>", "nil", "null" 等脏数据）
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
                                // 优先使用第三步名称映射，其次 labels 里的 name，最后回退到 code
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

                console.log('[产品库存智能体] 最终结果数量:', resultList.length);
                // 写入模块级缓存
                _productAgentCache = resultList;
                _productAgentCacheTime = Date.now();
                if (!isMounted) return;
                setProducts(resultList);
            } catch (err) {
                if (!isMounted) return;
                console.error('[产品库存智能体] 指标模型查询失败:', err);
                setError(err instanceof Error ? err.message : '获取数据失败');
            } finally {
                if (isMounted) setLoading(false);
            }
        }

        fetchData();

        return () => { isMounted = false; };
    }, []);

    // 计算总库存
    const totalStock = products.reduce((sum, p) => sum + p.calculatedStock, 0);

    // 分页计算
    const totalPages = Math.ceil(products.length / PAGE_SIZE);
    const pagedProducts = products.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

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
                    <span>获取失败: {error}</span>
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
                        基于产品库存优化模型实时查询
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
                <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-gray-700">产品明细</div>
                    <div className="text-xs text-gray-400">
                        共 {products.length} 个产品，第 {page}/{totalPages || 1} 页
                    </div>
                </div>

                {pagedProducts.map((product) => (
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

            {/* 分页控件 */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-1">
                    <button
                        onClick={() => setPage(p => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        上一页
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                        <button
                            key={p}
                            onClick={() => setPage(p)}
                            className={`w-8 h-8 text-sm rounded-lg border transition-colors ${p === page
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                                }`}
                        >
                            {p}
                        </button>
                    ))}
                    <button
                        onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                        下一页
                    </button>
                </div>
            )}


        </div>
    );
};

export default ProductInventoryAgent;
