/**
 * Stagnant Material Analysis Dashboard
 * 
 * Displays comprehensive analysis of stagnant materials including:
 * - Total stagnant value with category breakdown (pie chart)
 * - Storage days distribution (bar chart)
 * - Top 10 high-value stagnant materials list
 */

import { useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Package, TrendingDown, Clock } from 'lucide-react';
import type { Material } from '../../../types/ontology';

interface StagnantMaterialDashboardProps {
    materials: Material[];
    loading?: boolean;
}

// Material categories for classification
const MATERIAL_CATEGORIES = {
    RAW: '原材料',
    SEMI: '半成品',
    FINISHED: '成品'
} as const;

// Storage day ranges for distribution (adjusted for snapshot data)
const STORAGE_RANGES = [
    { key: '0-30', label: '0-30天', min: 0, max: 30 },
    { key: '30-90', label: '30-90天', min: 30, max: 90 },
    { key: '90-180', label: '90-180天', min: 90, max: 180 },
    { key: '180+', label: '180天+', min: 180, max: Infinity }
] as const;

// Color palette for charts
const COLORS = {
    primary: ['#4F46E5', '#7C3AED', '#EC4899'],
    bars: '#6366F1'
};

export const StagnantMaterialDashboard = ({ materials, loading }: StagnantMaterialDashboardProps) => {
    // Calculate stagnant materials (storage days > 90 or status is stagnant)
    const stagnantMaterials = useMemo(() => {
        return materials.filter(m => {
            const storageDays = (m as any).storageDays || (m as any).maxStorageAge || 0;
            return storageDays > 90 || m.status === '呆滞' || m.status === '异常';
        });
    }, [materials]);

    // Calculate total stagnant value and category breakdown
    const categoryData = useMemo(() => {
        const categoryCounts: Record<string, { value: number; count: number }> = {
            [MATERIAL_CATEGORIES.RAW]: { value: 0, count: 0 },
            [MATERIAL_CATEGORIES.SEMI]: { value: 0, count: 0 },
            [MATERIAL_CATEGORIES.FINISHED]: { value: 0, count: 0 }
        };

        stagnantMaterials.forEach(m => {
            // Estimate value (currentStock * estimated unit price)
            const unitPrice = (m as any).unitPrice || 100; // Default 100 if not available
            const value = (m.currentStock || 0) * unitPrice;

            // Categorize material (simplified logic - can be enhanced)
            const category = (m as any).category ||
                (m.materialCode?.startsWith('RM') ? MATERIAL_CATEGORIES.RAW :
                    m.materialCode?.startsWith('SF') ? MATERIAL_CATEGORIES.SEMI :
                        MATERIAL_CATEGORIES.FINISHED);

            if (categoryCounts[category]) {
                categoryCounts[category].value += value;
                categoryCounts[category].count += 1;
            }
        });

        const totalValue = Object.values(categoryCounts).reduce((sum, cat) => sum + cat.value, 0);

        return {
            totalValue,
            pieData: Object.entries(categoryCounts)
                .filter(([_, data]) => data.value > 0)
                .map(([name, data]) => ({
                    name,
                    value: data.value,
                    percentage: totalValue > 0 ? (data.value / totalValue * 100).toFixed(2) : '0'
                }))
        };
    }, [stagnantMaterials]);

    // Calculate storage days distribution
    const storageDaysDistribution = useMemo(() => {
        const distribution = STORAGE_RANGES.map(range => ({
            range: range.label,
            count: 0
        }));

        stagnantMaterials.forEach(m => {
            const storageDays = (m as any).storageDays || (m as any).maxStorageAge || 0;

            for (let i = 0; i < STORAGE_RANGES.length; i++) {
                const range = STORAGE_RANGES[i];
                if (storageDays >= range.min && storageDays < range.max) {
                    distribution[i].count += 1;
                    break;
                }
            }
        });

        return distribution;
    }, [stagnantMaterials]);

    // Calculate TOP 10 high-value stagnant materials
    const top10Materials = useMemo(() => {
        return stagnantMaterials
            .map(m => {
                const unitPrice = (m as any).unitPrice || 100;
                const value = (m.currentStock || 0) * unitPrice;
                const storageDays = (m as any).storageDays || (m as any).maxStorageAge || 0;

                return {
                    code: m.materialCode,
                    name: m.materialName,
                    value,
                    storageDays,
                    stock: m.currentStock
                };
            })
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);
    }, [stagnantMaterials]);

    if (loading) {
        return (
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                <div className="animate-pulse space-y-4">
                    <div className="h-6 bg-slate-200 rounded w-1/3"></div>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="h-48 bg-slate-200 rounded"></div>
                        <div className="h-48 bg-slate-200 rounded"></div>
                        <div className="h-48 bg-slate-200 rounded"></div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="flex items-center gap-2 mb-6">
                <TrendingDown className="text-orange-600" size={24} />
                <h2 className="text-xl font-bold text-slate-800">呆滞料消耗分析</h2>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Total Stagnant Value Card */}
                <div className="bg-gradient-to-br from-orange-50 to-red-50 rounded-lg p-6 border border-orange-200">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <Package className="text-orange-600" size={20} />
                            <h3 className="font-semibold text-slate-700">呆滞总价值</h3>
                        </div>
                    </div>

                    <div className="mb-4">
                        <div className="text-3xl font-bold text-orange-600">
                            ¥{(categoryData.totalValue / 1000000).toFixed(2)}M
                        </div>
                        <div className="text-sm text-slate-600 mt-1">
                            共 {stagnantMaterials.length} 项物料
                        </div>
                    </div>

                    {/* Pie Chart */}
                    <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                            <Pie
                                data={categoryData.pieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={40}
                                outerRadius={70}
                                paddingAngle={2}
                                dataKey="value"
                                label={({ name, percentage }: any) => `${name} ${percentage}%`}
                            >
                                {categoryData.pieData.map((_, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS.primary[index % COLORS.primary.length]} />
                                ))}
                            </Pie>
                            <Tooltip
                                formatter={(value: unknown) => `¥${((value as number) / 10000).toFixed(2)}万`}
                            />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                {/* Storage Days Distribution */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg p-6 border border-blue-200">
                    <div className="flex items-center gap-2 mb-4">
                        <Clock className="text-blue-600" size={20} />
                        <h3 className="font-semibold text-slate-700">库存天数分布</h3>
                    </div>

                    <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={storageDaysDistribution}>
                            <XAxis
                                dataKey="range"
                                tick={{ fontSize: 12 }}
                                stroke="#94a3b8"
                            />
                            <YAxis
                                tick={{ fontSize: 12 }}
                                stroke="#94a3b8"
                            />
                            <Tooltip
                                cursor={{ fill: 'rgba(99, 102, 241, 0.1)' }}
                                contentStyle={{
                                    backgroundColor: 'white',
                                    border: '1px solid #e2e8f0',
                                    borderRadius: '8px'
                                }}
                            />
                            <Bar
                                dataKey="count"
                                fill={COLORS.bars}
                                radius={[8, 8, 0, 0]}
                            />
                        </BarChart>
                    </ResponsiveContainer>
                </div>

                {/* TOP 10 High-Value Stagnant Materials */}
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-lg p-6 border border-purple-200">
                    <div className="flex items-center gap-2 mb-4">
                        <TrendingDown className="text-purple-600" size={20} />
                        <h3 className="font-semibold text-slate-700">高价值呆滞料 TOP 10</h3>
                    </div>

                    <div className="space-y-2 max-h-[220px] overflow-y-auto">
                        {top10Materials.length === 0 ? (
                            <div className="text-center text-slate-500 py-8">
                                暂无呆滞物料
                            </div>
                        ) : (
                            top10Materials.map((material, index) => (
                                <div
                                    key={material.code}
                                    className="flex items-center justify-between p-2 bg-white rounded-lg hover:shadow-sm transition-shadow"
                                >
                                    <div className="flex items-center gap-3 flex-1 min-w-0">
                                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center text-xs font-semibold">
                                            {index + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm font-medium text-slate-700 truncate">
                                                {material.code}
                                            </div>
                                            <div className="text-xs text-slate-500 truncate">
                                                {material.name}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right flex-shrink-0 ml-2">
                                        <div className="text-sm font-semibold text-purple-600">
                                            ¥{(material.value / 10000).toFixed(1)}万
                                        </div>
                                        <div className="text-xs text-slate-500">
                                            {material.storageDays}天
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
