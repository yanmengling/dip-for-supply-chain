/**
 * Plan Info Panel Component
 * 
 * 计划信息面板组件，显示生产计划量、库存量、在手订单量等信息
 */

import React, { useEffect, useState } from 'react';
import type { PlanInfo } from '../../types/ontology';
import { buildPlanInfo } from '../../services/mpsDataService';
import { AlertTriangle, Package, Factory, ShoppingCart, FileText } from 'lucide-react';

interface Props {
    productCode: string | null;
    productName?: string;
}

export const PlanInfoPanel: React.FC<Props> = ({ productCode, productName }) => {
    const [planInfo, setPlanInfo] = useState<PlanInfo | null>(null);
    const [loading, setLoading] = useState(false);
    const [dataSource, setDataSource] = useState<'api' | 'fallback'>('api');
    const [error, setError] = useState<string | null>(null);

    // 加载计划信息
    useEffect(() => {
        if (!productCode) {
            setPlanInfo(null);
            return;
        }

        const loadPlanInfo = async () => {
            setLoading(true);
            setError(null);

            try {
                const info = await buildPlanInfo(productCode, productName);
                setPlanInfo(info);
                setDataSource('api');
            } catch (err) {
                console.error('[PlanInfoPanel] 加载计划信息失败:', err);
                setError(err instanceof Error ? err.message : '加载计划信息失败');
            } finally {
                setLoading(false);
            }
        };

        loadPlanInfo();
    }, [productCode, productName]);

    if (!productCode) {
        return null;
    }

    if (loading) {
        return (
            <div className="mb-6 bg-white rounded-xl border shadow-sm p-6">
                <div className="text-sm text-slate-500">加载计划信息...</div>
            </div>
        );
    }

    if (!planInfo) {
        return (
            <div className="mb-6 bg-white rounded-xl border shadow-sm p-6">
                <div className="text-sm text-slate-500">暂无计划信息</div>
            </div>
        );
    }

    return (
        <div className="mb-6 bg-white rounded-xl border shadow-sm p-6">
            {/* Fallback警告提示 */}
            {dataSource === 'fallback' && (
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
                    <AlertTriangle className="text-yellow-600" size={16} />
                    <span className="text-sm text-yellow-800">
                        ⚠️ 实时API加载失败，已自动回退到Mock数据
                        {error && <span className="ml-2 text-xs">({error})</span>}
                    </span>
                </div>
            )}

            {/* 计划信息卡片 */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* 生产计划量 */}
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Factory className="text-blue-600" size={20} />
                        <span className="text-sm font-semibold text-slate-700">生产计划量</span>
                    </div>
                    <div className="text-2xl font-bold text-blue-600">
                        {planInfo.productionPlanQuantity.toLocaleString()}
                    </div>
                </div>

                {/* 库存量 */}
                <div className="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <Package className="text-green-600" size={20} />
                        <span className="text-sm font-semibold text-slate-700">库存量</span>
                    </div>
                    <div className="text-2xl font-bold text-green-600">
                        {planInfo.inventoryQuantity.toLocaleString()}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                        安全库存: {planInfo.safetyStock.toLocaleString()}
                    </div>
                </div>

                {/* 在手订单量 */}
                <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <ShoppingCart className="text-purple-600" size={20} />
                        <span className="text-sm font-semibold text-slate-700">在手订单量</span>
                    </div>
                    <div className="text-2xl font-bold text-purple-600">
                        {planInfo.pendingOrderQuantity.toLocaleString()}
                    </div>
                </div>

                {/* 产品信息 */}
                <div className="bg-gradient-to-br from-slate-50 to-gray-50 border border-slate-200 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                        <FileText className="text-slate-600" size={20} />
                        <span className="text-sm font-semibold text-slate-700">产品信息</span>
                    </div>
                    <div className="text-sm font-medium text-slate-800">
                        {planInfo.productCode}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                        {planInfo.productName}
                    </div>
                </div>
            </div>
        </div>
    );
};
