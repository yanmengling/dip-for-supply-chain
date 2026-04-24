/**
 * 生产计划确认面板 - Step ② of 4-step planning flow
 *
 * 根据步骤①选定的产品，自动查询 MPS 生产计划并填充表单；
 * 用户可编辑生产时间与数量后确认进入下一步。
 *
 * 数据源: supplychain_hd0202_mps (通过 planningV2DataService)
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Loader2, AlertTriangle } from 'lucide-react';
import {
    planningV2DataService,
    type ProductionPlanAPI,
} from '../../services/planningV2DataService';
import type { Step1Data, Step2Data } from '../../types/planningV2';

interface MasterProductionPanelProps {
    active: boolean;
    step1Data: Step1Data;
    onConfirm: (data: Step2Data) => void;
    onBack: () => void;
    initialData?: Step2Data;
}

const MasterProductionPanel = ({
    active,
    step1Data,
    onConfirm,
    onBack,
    initialData,
}: MasterProductionPanelProps) => {
    // --------------- 状态 ---------------
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [noMpsData, setNoMpsData] = useState(false);
    const [matchedPlan, setMatchedPlan] = useState<ProductionPlanAPI | null>(null);

    // 表单字段
    const [productionStart, setProductionStart] = useState('');
    const [productionEnd, setProductionEnd] = useState('');
    const [productionQuantity, setProductionQuantity] = useState<number>(0);

    // 防止重复加载
    const loadedForProductRef = useRef<string>('');

    // --------------- 数据加载 ---------------
    const loadMpsData = useCallback(async () => {
        // 如果有 initialData（用户从后续步骤返回），优先使用
        if (initialData) {
            setProductionStart(initialData.productionStart);
            setProductionEnd(initialData.productionEnd);
            setProductionQuantity(initialData.productionQuantity);
            setNoMpsData(false);
            setError(null);
            setMatchedPlan(null);
            loadedForProductRef.current = step1Data.productCode;
            return;
        }

        // 避免对同一产品重复请求
        if (loadedForProductRef.current === step1Data.productCode) return;

        setLoading(true);
        setError(null);
        setNoMpsData(false);
        setMatchedPlan(null);

        try {
            const allPlans = await planningV2DataService.loadProductionPlans();
            const matched = allPlans.filter(
                (p) => p.bom_code === step1Data.productCode
            );

            if (matched.length > 0) {
                // 取第一条匹配记录（按 seq_no 已排序）
                const plan = matched[0];
                setMatchedPlan(plan);
                setProductionStart(plan.planned_start_date || step1Data.demandStart);
                setProductionQuantity(plan.quantity);
                // productionEnd: 理想情况需要 planned_start_date + product_fixedleadtime，
                // 但此处可能没有 leadtime 数据，使用 demandEnd 作为回退
                setProductionEnd(step1Data.demandEnd);
                setNoMpsData(false);
            } else {
                // 无 MPS 数据，用需求计划数据兜底
                setProductionStart(step1Data.demandStart);
                setProductionEnd(step1Data.demandEnd);
                setProductionQuantity(step1Data.demandQuantity);
                setNoMpsData(true);
            }

            loadedForProductRef.current = step1Data.productCode;
        } catch (err) {
            console.error('[MasterProductionPanel] 加载生产计划失败:', err);
            setError('加载生产计划数据失败，请检查网络连接后重试');
            // 出错时也用需求计划兜底，确保用户可以继续
            setProductionStart(step1Data.demandStart);
            setProductionEnd(step1Data.demandEnd);
            setProductionQuantity(step1Data.demandQuantity);
        } finally {
            setLoading(false);
        }
    }, [step1Data, initialData]);

    // 当面板激活时触发加载
    useEffect(() => {
        if (active) {
            loadMpsData();
        }
    }, [active, loadMpsData]);

    // 当 active 变为 false 时重置 ref，以便再次进入时可重新加载
    useEffect(() => {
        if (!active) {
            loadedForProductRef.current = '';
        }
    }, [active]);

    // --------------- 提交 ---------------
    const handleConfirm = () => {
        onConfirm({
            productionStart,
            productionEnd,
            productionQuantity,
        });
    };

    // --------------- 渲染 ---------------
    if (!active) return null;

    return (
        <div className="space-y-6">
            {/* 标题区 */}
            <div>
                <h2 className="text-lg font-semibold text-slate-800">
                    确认生产计划
                </h2>
                <p className="text-sm text-slate-500 mt-1">
                    基于产品{' '}
                    <span className="font-mono text-indigo-600">{step1Data.productCode}</span>{' '}
                    <span className="font-medium text-slate-700">{step1Data.productName}</span>{' '}
                    的生产计划：
                </p>
            </div>

            {/* 加载状态 */}
            {loading && (
                <div className="flex items-center justify-center py-16">
                    <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
                    <span className="ml-3 text-sm text-slate-500">正在查询生产计划...</span>
                </div>
            )}

            {/* 错误提示 */}
            {error && !loading && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm text-red-700">{error}</p>
                        <button
                            onClick={() => {
                                loadedForProductRef.current = '';
                                loadMpsData();
                            }}
                            className="text-sm text-red-600 underline mt-1"
                        >
                            点击重试
                        </button>
                    </div>
                </div>
            )}

            {/* 无 MPS 数据警告 */}
            {noMpsData && !loading && (
                <div className="bg-orange-50 border border-orange-200 rounded-lg p-4 flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-orange-700">
                        该产品当前没有生产计划数据，已使用需求计划数据作为默认值
                    </p>
                </div>
            )}

            {/* MPS 匹配信息 */}
            {matchedPlan && !loading && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                    <p className="text-sm text-indigo-700">
                        已匹配到 MPS 生产计划记录
                        {matchedPlan.order_type && (
                            <span className="ml-2 px-2 py-0.5 rounded text-xs font-medium bg-indigo-100 text-indigo-700">
                                {matchedPlan.order_type}
                            </span>
                        )}
                        {matchedPlan.product_category && (
                            <span className="ml-1 text-xs text-indigo-500">
                                | {matchedPlan.product_category}
                            </span>
                        )}
                    </p>
                </div>
            )}

            {/* 表单区 */}
            {!loading && (
                <div className="bg-white border border-slate-200 rounded-lg p-6 space-y-5">
                    {/* 生产开始时间 */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            生产开始时间
                        </label>
                        <input
                            type="date"
                            value={productionStart}
                            onChange={(e) => setProductionStart(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm
                                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                                       transition-colors"
                        />
                    </div>

                    {/* 生产结束时间 */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            生产结束时间
                        </label>
                        <input
                            type="date"
                            value={productionEnd}
                            onChange={(e) => setProductionEnd(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm
                                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                                       transition-colors"
                        />
                    </div>

                    {/* 生产数量 */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            生产数量
                        </label>
                        <input
                            type="number"
                            min={0}
                            value={productionQuantity}
                            onChange={(e) => setProductionQuantity(Number(e.target.value) || 0)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm
                                       focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500
                                       transition-colors"
                        />
                    </div>

                    {/* 来源对照：需求计划参考 */}
                    <div className="pt-4 border-t border-slate-100">
                        <p className="text-xs text-slate-400 mb-2">需求计划参考</p>
                        <div className="grid grid-cols-3 gap-4 text-sm">
                            <div>
                                <span className="text-slate-500">需求开始：</span>
                                <span className="text-slate-700">{step1Data.demandStart}</span>
                            </div>
                            <div>
                                <span className="text-slate-500">需求结束：</span>
                                <span className="text-slate-700">{step1Data.demandEnd}</span>
                            </div>
                            <div>
                                <span className="text-slate-500">需求数量：</span>
                                <span className="text-slate-700">{step1Data.demandQuantity.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* 底部按钮 */}
            {!loading && (
                <div className="flex items-center justify-between pt-2">
                    <button
                        onClick={onBack}
                        className="px-4 py-2 border border-slate-300 rounded-lg text-sm font-medium
                                   text-slate-700 hover:bg-slate-50 transition-colors
                                   flex items-center gap-1.5"
                    >
                        <ChevronLeft className="w-4 h-4" />
                        上一步
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={!productionStart || !productionEnd || productionQuantity <= 0}
                        className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium
                                   hover:bg-indigo-700 transition-colors
                                   flex items-center gap-1.5
                                   disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        确认，进入下一步
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            )}
        </div>
    );
};

export default MasterProductionPanel;
