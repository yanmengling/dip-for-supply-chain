/**
 * 步骤 1: 选择库存物料
 * 
 * 显示所有有库存的物料列表，支持筛选和多选
 * 
 * 📝 注意：由于当前库存天数数据为快照（所有物料均为22天），
 *         暂时不按"呆滞"筛选，而是显示所有有库存的物料
 */

import { useState, useMemo } from 'react';
import { Search, Package, TrendingUp, DollarSign, Lightbulb } from 'lucide-react';
import type { MaterialData } from '../../../types/stagnantInventory';

interface StagnantMaterialSelectorProps {
    materials: MaterialData[];
    onComplete: (selectedMaterials: MaterialData[]) => void;
}

export const StagnantMaterialSelector = ({ materials, onComplete }: StagnantMaterialSelectorProps) => {
    const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [sortBy, setSortBy] = useState<'excess' | 'value' | 'stock'>('value');

    // 筛选和排序物料（显示所有有库存的物料）
    const filteredMaterials = useMemo(() => {
        let filtered = materials.filter(m => (m.currentStock || 0) > 0);

        // 搜索过滤
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            filtered = filtered.filter(m =>
                m.code.toLowerCase().includes(query) ||
                m.name.toLowerCase().includes(query)
            );
        }

        // 排序
        filtered.sort((a, b) => {
            if (sortBy === 'excess') {
                const excessA = (a.safetyStock || 0) > 0 ? (a.currentStock || 0) / (a.safetyStock || 1) : 999;
                const excessB = (b.safetyStock || 0) > 0 ? (b.currentStock || 0) / (b.safetyStock || 1) : 999;
                return excessB - excessA;
            } else if (sortBy === 'value') {
                const valueA = (a.currentStock || 0) * a.unitPrice;
                const valueB = (b.currentStock || 0) * b.unitPrice;
                return valueB - valueA;
            } else {
                return (b.currentStock || 0) - (a.currentStock || 0);
            }
        });

        return filtered;
    }, [materials, searchQuery, sortBy]);

    // 计算统计数据
    const stats = useMemo(() => {
        const materialsWithStock = materials.filter(m => (m.currentStock || 0) > 0);
        const totalValue = materialsWithStock.reduce(
            (sum, m) => sum + (m.currentStock || 0) * m.unitPrice,
            0
        );

        // 计算平均库存超标倍数（仅对有安全库存的物料）
        const materialsWithSafety = materialsWithStock.filter(m => (m.safetyStock || 0) > 0);
        const avgExcess = materialsWithSafety.length > 0
            ? materialsWithSafety.reduce((sum, m) => sum + (m.currentStock || 0) / (m.safetyStock || 1), 0) / materialsWithSafety.length
            : 0;

        return {
            totalValue,
            count: materialsWithStock.length,
            avgExcess,
        };
    }, [materials]);

    // 选中物料的统计
    const selectedStats = useMemo(() => {
        const selected = materials.filter(m => selectedCodes.has(m.code));
        const totalValue = selected.reduce(
            (sum, m) => sum + (m.currentStock || 0) * m.unitPrice,
            0
        );
        return {
            count: selected.length,
            totalValue,
        };
    }, [materials, selectedCodes]);

    // 切换选择
    const toggleSelect = (code: string) => {
        const newSelected = new Set(selectedCodes);
        if (newSelected.has(code)) {
            newSelected.delete(code);
        } else {
            newSelected.add(code);
        }
        setSelectedCodes(newSelected);
    };

    // 全选
    const selectAll = () => {
        const allCodes = new Set(filteredMaterials.map(m => m.code));
        setSelectedCodes(allCodes);
    };

    // 取消全选
    const deselectAll = () => {
        setSelectedCodes(new Set());
    };

    // 完成选择
    const handleComplete = () => {
        const selected = materials.filter(m => selectedCodes.has(m.code));
        if (selected.length === 0) {
            alert('请至少选择一个物料');
            return;
        }
        onComplete(selected);
    };

    // 计算库存超标倍数
    const getExcessRatio = (material: MaterialData): number => {
        if ((material.safetyStock || 0) === 0) {
            return 0; // 无安全库存设置
        }
        return (material.currentStock || 0) / (material.safetyStock || 1);
    };

    // 获取超标倍数的颜色和标签
    const getExcessInfo = (material: MaterialData) => {
        const ratio = getExcessRatio(material);
        if (ratio === 0) {
            return { color: 'text-slate-500 bg-slate-50', label: '无安全库存' };
        }
        if (ratio >= 10) return { color: 'text-red-600 bg-red-50', label: `超标 ${ratio.toFixed(1)}x` };
        if (ratio >= 5) return { color: 'text-orange-600 bg-orange-50', label: `超标 ${ratio.toFixed(1)}x` };
        if (ratio >= 3) return { color: 'text-yellow-600 bg-yellow-50', label: `超标 ${ratio.toFixed(1)}x` };
        return { color: 'text-green-600 bg-green-50', label: `正常 ${ratio.toFixed(1)}x` };
    };

    return (
        <div className="space-y-6">
            {/* KPI 卡片 */}
            <div className="grid grid-cols-3 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-blue-600 font-medium">库存总价值</p>
                            <p className="text-2xl font-bold text-blue-900 mt-1">
                                ¥{stats.totalValue.toLocaleString()}
                            </p>
                        </div>
                        <DollarSign className="w-8 h-8 text-blue-600 opacity-50" />
                    </div>
                </div>

                <div className="bg-purple-50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-purple-600 font-medium">物料种类</p>
                            <p className="text-2xl font-bold text-purple-900 mt-1">
                                {stats.count} 种
                            </p>
                        </div>
                        <Package className="w-8 h-8 text-purple-600 opacity-50" />
                    </div>
                </div>

                <div className="bg-orange-50 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="text-sm text-orange-600 font-medium">平均超标倍数</p>
                            <p className="text-2xl font-bold text-orange-900 mt-1">
                                {stats.avgExcess > 0 ? `${stats.avgExcess.toFixed(1)}x` : '-'}
                            </p>
                            <p className="text-xs text-orange-600 mt-1">
                                库存 ÷ 安全库存
                            </p>
                        </div>
                        <TrendingUp className="w-8 h-8 text-orange-600 opacity-50" />
                    </div>
                </div>
            </div>

            {/* 筛选和搜索 */}
            <div className="bg-white rounded-lg border border-slate-200 p-4">
                <div className="flex items-center gap-4">
                    {/* 搜索框 */}
                    <div className="flex-1 relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                        <input
                            type="text"
                            placeholder="搜索物料编码或名称..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                    </div>

                    {/* 排序 */}
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as any)}
                        className="px-4 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="value">按价值排序</option>
                        <option value="excess">按超标倍数</option>
                        <option value="stock">按库存数量</option>
                    </select>

                    {/* 全选按钮 */}
                    <button
                        onClick={selectAll}
                        className="px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100 transition-colors"
                    >
                        全选
                    </button>
                    <button
                        onClick={deselectAll}
                        className="px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 rounded-md hover:bg-slate-200 transition-colors"
                    >
                        取消全选
                    </button>
                </div>
            </div>

            {/* 已选择摘要 */}
            {selectedStats.count > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Package className="w-5 h-5 text-blue-600" />
                            <span className="text-sm font-medium text-blue-900">
                                已选择 {selectedStats.count} 种物料，总价值 ¥{selectedStats.totalValue.toLocaleString()}
                            </span>
                        </div>
                        <button
                            onClick={() => setSelectedCodes(new Set())}
                            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                            清空选择
                        </button>
                    </div>
                </div>
            )}

            {/* 物料列表 */}
            <div className="bg-white rounded-lg border border-slate-200">
                <div className="p-4 border-b border-slate-200">
                    <h3 className="font-semibold text-slate-900">
                        库存物料列表 ({filteredMaterials.length})
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                        💡 提示：选择要优化的物料，系统将计算如何用这些物料生产产品
                    </p>
                </div>

                <div className="divide-y divide-slate-200 max-h-96 overflow-y-auto">
                    {filteredMaterials.map((material) => {
                        const isSelected = selectedCodes.has(material.code);
                        const value = (material.currentStock || 0) * material.unitPrice;
                        const excessInfo = getExcessInfo(material);

                        return (
                            <div
                                key={material.code}
                                className={`p-4 hover:bg-slate-50 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : ''
                                    }`}
                                onClick={() => toggleSelect(material.code)}
                            >
                                <div className="flex items-start gap-4">
                                    {/* 复选框 */}
                                    <input
                                        type="checkbox"
                                        checked={isSelected}
                                        onChange={() => { }}
                                        className="mt-1 w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                                    />

                                    {/* 物料信息 */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1">
                                                <h4 className="font-medium text-slate-900">
                                                    {material.code} - {material.name}
                                                </h4>
                                                {material.specification && (
                                                    <p className="text-sm text-slate-500 mt-1">
                                                        {material.specification}
                                                    </p>
                                                )}

                                                {/* 统计信息 */}
                                                <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
                                                    <span className="text-slate-600">
                                                        库存: <span className="font-medium">{material.currentStock}</span>
                                                    </span>
                                                    <span className="text-slate-600">
                                                        安全库存: <span className="font-medium">{material.safetyStock || 0}</span>
                                                    </span>
                                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${excessInfo.color}`}>
                                                        {excessInfo.label}
                                                    </span>
                                                    <span className="text-slate-600">
                                                        单价: <span className="font-medium">¥{material.unitPrice.toFixed(2)}</span>
                                                    </span>
                                                    <span className="text-slate-600">
                                                        价值: <span className="font-medium">¥{value.toLocaleString()}</span>
                                                    </span>
                                                </div>

                                                {/* 智能提示 */}
                                                <div className="flex items-start gap-2 mt-2 text-sm text-blue-600">
                                                    <Lightbulb className="w-4 h-4 mt-0.5 flex-shrink-0" />
                                                    <span>可用于生产 3 种产品</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}

                    {filteredMaterials.length === 0 && (
                        <div className="p-8 text-center text-slate-500">
                            <Package className="w-12 h-12 mx-auto mb-2 opacity-50" />
                            <p>未找到符合条件的物料</p>
                        </div>
                    )}
                </div>
            </div>

            {/* 操作按钮 */}
            <div className="flex justify-end gap-3">
                <button
                    onClick={handleComplete}
                    disabled={selectedStats.count === 0}
                    className="px-6 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
                >
                    下一步: 选择产品 ({selectedStats.count})
                </button>
            </div>
        </div>
    );
};
