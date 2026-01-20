/**
 * 物料库存图表组件
 * 
 * 在弹框中展示物料库存的可视化图表
 * 只展示TOP10数据以提高渲染性能
 */

import { useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { getMaterialInventorySummary } from '../../utils/cockpitDataService';
import { useDimensionMetricData, useMetricData, latestValueTransform } from '../../hooks/useMetricData';
import { Loader2, AlertTriangle, CheckCircle } from 'lucide-react';

import { apiConfigService } from '../../services/apiConfigService';

// 获取指标 ID 的辅助函数
const getMetricIds = () => {
    try {
        const metrics = apiConfigService.getMetricModelConfigs();
        const stockMetric = metrics.find(m =>
            m.tags?.includes('material') &&
            m.tags?.includes('inventory_data')
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

    // 获取物料库存排名数据 - 只获取TOP10
    const {
        items: materialStockRankingItems,
        loading: stockRankingLoading,
        error: stockRankingError,
    } = useDimensionMetricData(
        METRIC_IDS.TOTAL_MATERIAL_STOCK,
        ['material_name', 'inventory_data'],
        { instant: true }
    );

    // 获取呆滞物料数据
    const {
        items: stagnantMaterialItems,
        loading: stagnantLoading,
    } = useDimensionMetricData(
        METRIC_IDS.STAGNANT_MATERIALS,
        ['item_name', 'warehouse_name'],
        { instant: true }
    );

    // 大脑模式：直接获取总库存量
    const {
        value: totalMaterialStockFromApi,
        loading: totalMaterialStockLoading,
    } = useMetricData(
        METRIC_IDS.TOTAL_MATERIAL_STOCK,
        {
            instant: true,
            transform: latestValueTransform,
        }
    );

    // 计算总库存量
    const totalMaterialStock = useMemo(() => {
        // 大脑模式：直接使用API返回的总量
        return totalMaterialStockFromApi ?? summary.totalStock;
    }, [totalMaterialStockFromApi, summary.totalStock]);

    // 库存TOP10柱状图数据 - 优化：直接取前10
    const top10StockData = useMemo(() => {
        if (stockRankingError || materialStockRankingItems.length === 0) {
            return summary.top10ByStock.slice(0, 10).map(item => ({
                name: item.materialName.length > 12 ? item.materialName.substring(0, 12) + '...' : item.materialName,
                fullName: item.materialName,
                stock: item.stock,
            }));
        }
        // 只取前10条
        return materialStockRankingItems
            .slice(0, 10)
            .map(item => {
                const name = item.labels.material_name || item.labels.item_name || '未知物料';
                return {
                    name: name.length > 12 ? name.substring(0, 12) + '...' : name,
                    fullName: name,
                    stock: item.value ?? 0,
                };
            });
    }, [materialStockRankingItems, stockRankingError, summary.top10ByStock]);

    // 呆滞物料数据 - 只取TOP10
    const stagnantMaterials = useMemo(() => {
        return stagnantMaterialItems
            .filter(item => (item.value ?? 0) > 115)
            .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
            .slice(0, 10)
            .map(item => ({
                name: (item.labels.item_name || '未知').substring(0, 10),
                fullName: item.labels.item_name || '未知物料',
                age: item.value ?? 0,
                warehouse: item.labels.warehouse_name || '未知仓库',
            }));
    }, [stagnantMaterialItems]);

    // 呆滞物料数量
    const stagnantCount = stagnantMaterials.length;
    const hasStagnantMaterials = stagnantCount > 0;

    // 物料种类数量
    const totalMaterialTypes = useMemo(() => {
        return materialStockRankingItems.length;
    }, [materialStockRankingItems.length]);

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

