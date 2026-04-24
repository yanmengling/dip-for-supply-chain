/**
 * 物料库存智能体卡片组件
 * 
 * 在DIP供应链大脑模式下，从API获取物料库存数据
 */

import { useEffect, useState } from 'react';
import { ClipboardList, AlertTriangle, TrendingUp, Loader2 } from 'lucide-react';
import { useMetricData, latestValueTransform } from '../../hooks/useMetricData';

// 物料库存指标模型 ID
const MATERIAL_INVENTORY_METRIC_ID = 'd58ihclg5lk40hvh48mg';

interface Props {
    onNavigate?: (view: string) => void;
}

const MaterialInventoryAgentCard = ({ onNavigate }: Props) => {
    // 从API获取物料库存总量
    const {
        value: totalMaterialsFromApi,
        loading,
        error,
    } = useMetricData(MATERIAL_INVENTORY_METRIC_ID, {
        instant: true,
        transform: latestValueTransform,
    });

    if (loading) {
        return (
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-6 border border-amber-100">
                <div className="flex items-center justify-center gap-2 text-amber-600">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm">正在加载物料库存数据...</span>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 rounded-xl p-6 border border-red-200">
                <div className="flex items-center gap-2 text-red-600">
                    <AlertTriangle className="w-5 h-5" />
                    <span className="text-sm">加载失败: {error}</span>
                </div>
            </div>
        );
    }

    const totalMaterials = totalMaterialsFromApi ?? 0;

    return (
        <div className="space-y-3">
            {/* 总库存卡片 */}
            <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-6 border border-amber-100">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-sm text-amber-700 font-medium mb-1">
                            物料库存总量
                        </div>
                        <div className="text-3xl font-bold text-amber-900">
                            {totalMaterials}
                        </div>
                        <div className="text-xs text-amber-600 mt-1">
                            从API实时获取
                        </div>
                    </div>
                    <div className="p-3 bg-amber-100 rounded-lg">
                        <TrendingUp className="text-amber-600" size={24} />
                    </div>
                </div>
            </div>

            {/* 说明 */}
            <div className="text-xs text-gray-500 bg-gray-50 rounded p-3">
                💡 物料库存数据从DIP数据API实时获取（指标模型: {MATERIAL_INVENTORY_METRIC_ID}）
            </div>
        </div>
    );
};

export default MaterialInventoryAgentCard;
