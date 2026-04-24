/**
 * 物料库存图表组件
 * 
 * 在弹框中展示物料库存的可视化图表
 * 只展示TOP10数据以提高渲染性能
 */

import { useMemo, useState, useEffect } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { useDimensionMetricData, useMetricData, latestValueTransform } from '../../hooks/useMetricData';
import { Loader2, AlertTriangle, CheckCircle } from 'lucide-react';

import { apiConfigService } from '../../services/apiConfigService';
import { metricModelApi, createLastDaysRange } from '../../api';

// 获取指标 ID 的辅助函数
const getMetricIds = () => {
    try {
        const metrics = apiConfigService.getMetricModelConfigs();
        const stockMetric = metrics.find(m =>
            m.tags?.includes('material') &&
            m.tags?.includes('optimization')
        );
        const stagnantMetric = metrics.find(m =>
            m.tags?.includes('material') &&
            m.tags?.includes('stagnant')
        );

        return {
            TOTAL_MATERIAL_STOCK: stockMetric?.modelId || 'd58je8lg5lk40hvh48n0',
            STAGNANT_MATERIALS: stagnantMetric?.modelId || 'd58jomlg5lk40hvh48o0',
        };
    } catch (error) {
        return {
            TOTAL_MATERIAL_STOCK: 'd58je8lg5lk40hvh48n0',
            STAGNANT_MATERIALS: 'd58jomlg5lk40hvh48o0',
        };
    }
};

const COLORS = {
    normal: '#10b981',     // 绿色 - 正常
    stagnant: '#f59e0b',   // 橙色 - 呆滞
};

const MaterialInventoryCharts = () => {
    // 动态获取指标 ID
    const METRIC_IDS = useMemo(() => getMetricIds(), []);
    // 只在组件挂载时计算一次
    const summary = useMemo(() => {
        return {
            totalTypes: 0,
            totalStock: 0,
            top10ByStock: [] as any[],
            stagnantCount: 0,
            stagnantPercentage: 0,
            stagnantDetails: [] as any[],
        };
    }, []);

    // 动态获取库存排名数据
    const [materialStockRankingItems, setMaterialStockRankingItems] = useState<any[]>([]);
    const [stockRankingLoading, setStockRankingLoading] = useState(true);
    const [stockRankingError, setStockRankingError] = useState<string | null>(null);

    useEffect(() => {
        const fetchStockRankings = async () => {
            setStockRankingLoading(true);
            setStockRankingError(null);
            try {
                const modelId = METRIC_IDS.TOTAL_MATERIAL_STOCK;
                const timeRange = createLastDaysRange(1);

                // 第一步：获取模型维度信息
                const firstResult = await metricModelApi.queryByModelId(
                    modelId,
                    { instant: true, start: timeRange.start, end: timeRange.end },
                    { includeModel: true }
                );

                const rawDims = firstResult.model?.analysis_dimensions ?? [];
                const allDims: string[] = rawDims.map((d: any) =>
                    typeof d === 'string' ? d : d.name
                ).filter(Boolean);

                // 第二步：匹配合法维度
                const NEEDED_DIMS = ['material_code', 'material_number', 'material_name', 'item_code', 'item_name', 'inventory_qty', 'available_inventory_qty', 'available_quantity'];
                const validDims = NEEDED_DIMS.filter(d => allDims.includes(d));

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

                // 第三步：提取数据
                const transformedItems: any[] = [];
                if (result.datas && result.datas.length > 0) {
                    for (const series of result.datas) {
                        let latestValue: number | null = null;

                        // 尝试从标签中获取库存数量（如果模型将数量作为维度返回）
                        const labels = series.labels || {};
                        const qtyFromLabel = labels.available_quantity ?? labels.available_inventory_qty ?? labels.inventory_qty ?? null;

                        if (qtyFromLabel !== null && qtyFromLabel !== undefined) {
                            latestValue = parseFloat(String(qtyFromLabel)) || 0;
                        } else if (series.values && series.values.length > 0) {
                            for (let i = series.values.length - 1; i >= 0; i--) {
                                if (series.values[i] !== null) {
                                    latestValue = series.values[i];
                                    break;
                                }
                            }
                        }

                        transformedItems.push({
                            labels: labels,
                            value: latestValue,
                        });
                    }
                }

                setMaterialStockRankingItems(transformedItems);
            } catch (err: any) {
                console.error('Failed to fetch material stock ranking:', err);
                setStockRankingError(err.message || '获取数据失败');
            } finally {
                setStockRankingLoading(false);
            }
        };

        fetchStockRankings();
    }, [METRIC_IDS.TOTAL_MATERIAL_STOCK]);


    // 获取呆滞物料数据
    const {
        items: stagnantMaterialItems,
        loading: stagnantLoading,
    } = useDimensionMetricData(
        METRIC_IDS.STAGNANT_MATERIALS,
        ['material_code', 'material_name', 'inventory_age'],
        { instant: true }
    );

    // 计算总库存量
    const totalMaterialStock = useMemo(() => {
        // 通过累加所有带维度的库存数据
        if (materialStockRankingItems.length > 0) {
            return materialStockRankingItems.reduce((sum, item) => sum + (item.value || 0), 0);
        }
        return summary.totalStock || 0;
    }, [materialStockRankingItems, summary.totalStock]);

    // 异步加载物料名称映射
    const [materialNameMap, setMaterialNameMap] = useState<Map<string, string>>(new Map());

    useEffect(() => {
        const fetchMaterialData = async () => {
            try {
                // 利用 ontologyDataService 中的 loadMaterialEntities
                const { loadMaterialEntities } = await import('../../services/ontologyDataService');
                const materials = await loadMaterialEntities();
                if (materials && materials.length > 0) {
                    const map = new Map<string, string>();
                    const NIL_LIKE = /^(\\<nil\\>|nil|null|undefined|none)$/i;
                    for (const m of materials) {
                        const code = (m.material_code || '').trim();
                        const name = (m.material_name || '').trim();
                        if (code && !NIL_LIKE.test(code) && name && !NIL_LIKE.test(name)) {
                            map.set(code, name);
                        }
                    }
                    setMaterialNameMap(map);
                }
            } catch (err) {
                console.warn('[MaterialInventoryCharts] 无法加载物料主数据作为名称映射');
            }
        };
        fetchMaterialData();
    }, []);

    const NIL_LIKE_REGEX = /^(\\<nil\\>|nil|null|undefined|none)$/i;

    // 库存TOP10柱状图数据 - 优化：直接取前10，并且如果API数据不完整，使用后备计算数据
    const top10StockData = useMemo(() => {
        if (stockRankingError || materialStockRankingItems.length === 0) {
            return summary.top10ByStock.slice(0, 10).map(item => ({
                name: item.materialName.length > 12 ? item.materialName.substring(0, 12) + '...' : item.materialName,
                fullName: item.materialName,
                stock: item.stock,
            }));
        }

        // 把数据聚合，以防同一个 code 出现多次
        const aggregatedMap = new Map<string, { code: string, rawName: string, stock: number }>();

        for (const item of materialStockRankingItems) {
            const code = (item.labels.material_code || item.labels.item_code || item.labels.material_number || '').trim();
            const defaultName = (item.labels.material_name || item.labels.item_name || '').trim();

            // 没有 code 就跳过
            if (!code || NIL_LIKE_REGEX.test(code)) continue;

            const currStock = item.value ?? 0;
            if (aggregatedMap.has(code)) {
                aggregatedMap.get(code)!.stock += currStock;
            } else {
                aggregatedMap.set(code, { code, rawName: defaultName, stock: currStock });
            }
        }

        // 按 stock 降序排
        const sortedItems = Array.from(aggregatedMap.values()).sort((a, b) => b.stock - a.stock).slice(0, 10);

        return sortedItems.map(item => {
            let finalName = materialNameMap.get(item.code) || item.rawName || item.code;
            if (NIL_LIKE_REGEX.test(finalName)) {
                finalName = item.code || '未知物料';
            }
            return {
                name: finalName.length > 12 ? finalName.substring(0, 12) + '...' : finalName,
                fullName: finalName,
                stock: Math.floor(item.stock),
            };
        });
    }, [materialStockRankingItems, stockRankingError, summary.top10ByStock, materialNameMap]);

    // 呆滞物料数据 - 只取TOP10
    const stagnantMaterials = useMemo(() => {
        const aggregatedMap = new Map<string, { code: string, rawName: string, age: number, warehouse: string }>();

        console.log("[DEBUG] Stagnant Material Items Count:", stagnantMaterialItems.length);
        if (stagnantMaterialItems.length > 0) {
            console.log("[DEBUG] Sample Stagnant Material Item:", stagnantMaterialItems[0]);
        }

        for (const item of stagnantMaterialItems) {
            const code = (item.labels.material_code || item.labels.item_code || item.labels.material_number || '').trim();
            const defaultName = (item.labels.item_name || item.labels.material_name || '').trim();

            // 库龄可能作为维度传回，如果不存在则使用指标值
            const mappedAge = Number(item.labels.inventory_age);
            const age = (!isNaN(mappedAge) && mappedAge > 0) ? mappedAge : (item.value ?? 0);

            if (!code || NIL_LIKE_REGEX.test(code)) continue;

            // 同样物料取最大库龄
            if (aggregatedMap.has(code)) {
                if (age > aggregatedMap.get(code)!.age) {
                    aggregatedMap.get(code)!.age = age;
                }
            } else {
                aggregatedMap.set(code, {
                    code,
                    rawName: defaultName,
                    age,
                    warehouse: item.labels.warehouse_name || '缺省仓库' // 当前模型中未提供仓库维度
                });
            }
        }

        return Array.from(aggregatedMap.values())
            .filter(item => item.age > 90) // > 90天算呆滞
            .sort((a, b) => b.age - a.age)
            .slice(0, 10)
            .map(item => {
                let finalName = materialNameMap.get(item.code) || item.rawName || item.code;
                if (NIL_LIKE_REGEX.test(finalName)) {
                    finalName = item.code || '未知物料';
                }
                return {
                    name: finalName.length > 10 ? finalName.substring(0, 10) + '...' : finalName,
                    fullName: finalName,
                    age: item.age,
                    warehouse: item.warehouse,
                };
            });
    }, [stagnantMaterialItems, materialNameMap]);

    // 呆滞物料数量
    const stagnantCount = stagnantMaterials.length;
    const hasStagnantMaterials = stagnantCount > 0;

    // 物料种类数量
    const totalMaterialTypes = useMemo(() => {
        // 使用去重后的 code 数作为物料种类数
        const codes = new Set<string>();
        for (const item of materialStockRankingItems) {
            const code = (item.labels.material_code || item.labels.item_code || item.labels.material_number || '').trim();
            if (code && !NIL_LIKE_REGEX.test(code)) {
                codes.add(code);
            }
        }
        return codes.size || materialStockRankingItems.length;
    }, [materialStockRankingItems]);

    // 库存状态分布
    const stockDistribution = useMemo(() => {
        const normalCount = totalMaterialTypes - stagnantCount;
        return [
            { name: '正常库存', value: normalCount, color: COLORS.normal },
            { name: '呆滞物料', value: stagnantCount, color: COLORS.stagnant },
        ].filter(item => item.value > 0);
    }, [stagnantCount, totalMaterialTypes]);

    // 自定义 Tooltip
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className="bg-white px-3 py-2 shadow-lg rounded-lg border border-slate-200">
                    <p className="text-sm font-medium text-slate-800">{data.fullName}</p>
                    <p className="text-sm text-indigo-600">
                        {data.stock !== undefined ? `库存: ${data.stock} 个` : `库龄: ${data.age} 天`}
                    </p>
                    {data.warehouse && (
                        <p className="text-xs text-slate-500">仓库: {data.warehouse}</p>
                    )}
                </div>
            );
        }
        return null;
    };

    // 只在核心数据加载时显示loading
    const isLoading = stockRankingLoading;

    if (isLoading) {
        return (
            <div className="col-span-2 flex items-center justify-center h-64">
                <div className="text-center">
                    <Loader2 className="animate-spin text-indigo-600 mx-auto mb-4" size={32} />
                    <p className="text-slate-600">加载物料数据中...</p>
                </div>
            </div>
        );
    }

    return (
        <>
            {/* 统计摘要 */}
            <div className="col-span-2 grid grid-cols-3 gap-4 mb-2">
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-100">
                    <div className="text-sm text-indigo-700 font-medium">物料种类</div>
                    <div className="text-2xl font-bold text-indigo-900">{totalMaterialTypes}</div>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-100">
                    <div className="text-sm text-green-700 font-medium">总库存量</div>
                    <div className="text-2xl font-bold text-green-900">{totalMaterialStock.toLocaleString()}</div>
                </div>
                <div className={`bg-gradient-to-br rounded-xl p-4 border ${hasStagnantMaterials
                    ? 'from-orange-50 to-amber-50 border-orange-100'
                    : 'from-green-50 to-emerald-50 border-green-100'}`}>
                    <div className={`text-sm font-medium ${hasStagnantMaterials ? 'text-orange-700' : 'text-green-700'}`}>
                        呆滞物料
                    </div>
                    <div className={`text-2xl font-bold ${hasStagnantMaterials ? 'text-orange-900' : 'text-green-900'}`}>
                        {stagnantCount}
                    </div>
                </div>
            </div>

            {/* 库存状态分布饼图 */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">库存状态分布</h4>
                <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%" debounce={100}>
                        <PieChart>
                            <Pie
                                data={stockDistribution}
                                cx="50%"
                                cy="50%"
                                innerRadius={50}
                                outerRadius={80}
                                paddingAngle={4}
                                dataKey="value"
                                label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
                                labelLine={{ stroke: '#94a3b8', strokeWidth: 1 }}
                            >
                                {stockDistribution.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.color} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 库存TOP10柱状图 */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">物料库存 TOP10</h4>
                <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%" debounce={100}>
                        <BarChart data={top10StockData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis type="number" tick={{ fontSize: 12 }} />
                            <YAxis
                                type="category"
                                dataKey="name"
                                width={100}
                                tick={{ fontSize: 11 }}
                            />
                            <Tooltip content={<CustomTooltip />} />
                            <Bar
                                dataKey="stock"
                                fill="#6366f1"
                                radius={[0, 4, 4, 0]}
                                name="库存数量"
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* 呆滞物料区域 */}
            <div className="col-span-2 bg-slate-50 rounded-xl p-4 border border-slate-200">
                <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
                    {hasStagnantMaterials ? (
                        <AlertTriangle className="text-orange-500" size={16} />
                    ) : (
                        <CheckCircle className="text-green-500" size={16} />
                    )}
                    呆滞物料情况
                    {stagnantLoading && <Loader2 className="animate-spin text-slate-400 ml-2" size={14} />}
                </h4>

                {hasStagnantMaterials ? (
                    // 有呆滞物料：显示柱状图
                    <div className="h-48">
                        <ResponsiveContainer width="100%" height="100%" debounce={100}>
                            <BarChart data={stagnantMaterials}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                                <XAxis
                                    dataKey="name"
                                    tick={{ fontSize: 11 }}
                                    interval={0}
                                    angle={-15}
                                    textAnchor="end"
                                    height={45}
                                />
                                <YAxis tick={{ fontSize: 12 }} label={{ value: '库龄(天)', angle: -90, position: 'insideLeft', fontSize: 12 }} />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar
                                    dataKey="age"
                                    fill="#f59e0b"
                                    radius={[4, 4, 0, 0]}
                                    name="库龄(天)"
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    // 无呆滞物料：显示提示
                    <div className="flex items-center justify-center h-32 text-slate-500">
                        <div className="text-center">
                            <CheckCircle className="text-green-400 mx-auto mb-2" size={32} />
                            <p className="text-green-600 font-medium">暂无呆滞物料</p>
                            <p className="text-sm text-slate-400 mt-1">所有物料库龄均在正常范围内</p>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

export default MaterialInventoryCharts;

