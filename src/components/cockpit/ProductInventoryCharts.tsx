/**
 * 产品库存图表组件
 * 
 * 在弹框中展示产品库存的可视化图表
 */

import { useMemo } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import type { ProductInventoryResult } from '../../services/productInventoryCalculator';

interface Props {
    products: ProductInventoryResult[];
}

const COLORS = {
    available: '#10b981',    // 绿色 - 有库存
    outOfStock: '#ef4444',   // 红色 - 无库存
    bars: ['#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899', '#f43f5e'],
};

const ProductInventoryCharts = ({ products }: Props) => {
    // 计算库存状态分布
    const stockDistribution = useMemo(() => {
        const available = products.filter(p => p.calculatedStock > 0).length;
        const outOfStock = products.filter(p => p.calculatedStock === 0).length;

        return [
            { name: '有库存', value: available, color: COLORS.available },
            { name: '无库存', value: outOfStock, color: COLORS.outOfStock },
        ].filter(item => item.value > 0);
    }, [products]);

    // 产品库存柱状图数据
    const barChartData = useMemo(() => {
        return products
            .sort((a, b) => b.calculatedStock - a.calculatedStock)
            .slice(0, 10)
            .map(product => {
                // 组合产品ID和名称用于Y轴显示
                const displayName = `${product.productCode} ${product.productName}`;
                return {
                    name: displayName.length > 15
                        ? displayName.substring(0, 15) + '...'
                        : displayName,
                    fullName: `${product.productCode} - ${product.productName}`,
                    stock: product.calculatedStock,
                };
            });
    }, [products]);

    // 自定义 Tooltip
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div className="bg-white px-3 py-2 shadow-lg rounded-lg border border-slate-200">
                    <p className="text-sm font-medium text-slate-800">{data.fullName || label}</p>
                    <p className="text-sm text-indigo-600">
                        库存: <span className="font-semibold">{payload[0].value}</span> 件
                    </p>
                </div>
            );
        }
        return null;
    };

    const totalStock = products.reduce((sum, p) => sum + p.calculatedStock, 0);
    const outOfStockCount = products.filter(p => p.calculatedStock === 0).length;

    return (
        <>
            {/* 统计摘要 */}
            <div className="col-span-2 grid grid-cols-3 gap-4 mb-2">
                <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-4 border border-indigo-100">
                    <div className="text-sm text-indigo-700 font-medium">产品总数</div>
                    <div className="text-2xl font-bold text-indigo-900">{products.length}</div>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-4 border border-green-100">
                    <div className="text-sm text-green-700 font-medium">总库存</div>
                    <div className="text-2xl font-bold text-green-900">{totalStock}</div>
                </div>
                <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-xl p-4 border border-red-100">
                    <div className="text-sm text-red-700 font-medium">缺货产品</div>
                    <div className="text-2xl font-bold text-red-900">{outOfStockCount}</div>
                </div>
            </div>

            {/* 库存状态分布饼图 */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">库存状态分布</h4>
                <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={200}>
                        <PieChart>
                            <Pie
                                data={stockDistribution}
                                cx="50%"
                                cy="50%"
                                innerRadius={50}
                                outerRadius={80}
                                paddingAngle={4}
                                dataKey="value"
                                label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}
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

            {/* 产品库存柱状图 */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <h4 className="text-sm font-semibold text-slate-700 mb-3">产品库存 TOP10</h4>
                <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={200}>
                        <BarChart data={barChartData} layout="vertical">
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis type="number" tick={{ fontSize: 12 }} />
                            <YAxis
                                type="category"
                                dataKey="name"
                                width={80}
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
        </>
    );
};

export default ProductInventoryCharts;
