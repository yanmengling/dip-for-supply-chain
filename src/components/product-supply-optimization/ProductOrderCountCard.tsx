import React, { useState, useEffect } from 'react';
import { ShoppingCart, Loader2, AlertCircle } from 'lucide-react';
import { metricModelApi, createLastDaysRange } from '../../api';

import { OrderAnalysisModal } from './OrderAnalysisModal';

interface Props {
    productId: string;
}

// Product ID to Metric Model ID Mapping
const PRODUCT_METRIC_MAP: Record<string, string> = {
    'T01-000055': 'd59kpctg5lk40hvh48pg',
    'T01-000173': 'd59kqndg5lk40hvh48q0',
    'T01-000167': 'd59ksulg5lk40hvh48qg',
};

export const ProductOrderCountCard: React.FC<Props> = ({ productId }) => {
    const [loading, setLoading] = useState(false);
    const [orderCount, setOrderCount] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Modal State
    const [showModal, setShowModal] = useState(false);

    // Initial Fetch (Brain Mode API)
    useEffect(() => {
        // Only fetch if the product has a mapping
        if (!PRODUCT_METRIC_MAP[productId]) {
            setOrderCount(null);
            return;
        }

        const fetchOrderCount = async () => {
            setLoading(true);
            setError(null);
            try {
                const metricId = PRODUCT_METRIC_MAP[productId];
                const range = createLastDaysRange(1);

                const result = await metricModelApi.queryByModelId(
                    metricId,
                    {
                        instant: true,
                        start: range.start,
                        end: range.end,
                    },
                    { includeModel: true }
                );

                // Calculate total count from datas
                const total = result.datas?.reduce((sum, item) => {
                    if (!item.values || item.values.length === 0) return sum;
                    let val = 0;
                    for (let i = item.values.length - 1; i >= 0; i--) {
                        if (item.values[i] !== null && item.values[i] !== undefined) {
                            val = Number(item.values[i]);
                            break;
                        }
                    }
                    return sum + val;
                }, 0) || 0;
                setOrderCount(total);
            } catch (err) {
                console.error(`[ProductOrderCount] Failed to fetch for ${productId}:`, err);
                setError('获取失败');
            } finally {
                setLoading(false);
            }
        };

        fetchOrderCount();
    }, [productId]);

    // Handle Click - 打开弹窗，Modal 内部自己获取详细数据
    const handleClick = () => {
        if (error || loading) return;
        setShowModal(true);
    };

    // Don't render anything if no mapping
    if (!PRODUCT_METRIC_MAP[productId]) {
        return null;
    }

    return (
        <>
            <div
                onClick={handleClick}
                className={`bg-gradient-to-br from-indigo-50 to-indigo-100/50 rounded-lg p-3 border border-indigo-100 hover:shadow-md transition-all 
                ${!loading && !error ? 'cursor-pointer hover:border-indigo-200 group relative' : ''}`}
            >
                <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 bg-indigo-500/10 rounded flex items-center justify-center">
                        <ShoppingCart className="text-indigo-600" size={16} />
                    </div>
                    <div className="text-xs text-slate-600">订单数量</div>

                    {/* Hover Hint */}
                    {!loading && !error && (
                        <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-indigo-400 text-[10px] bg-white px-1 rounded shadow-sm">
                            查看交付详情
                        </div>
                    )}
                </div>
                <div className="flex items-baseline gap-1 min-h-[32px]">
                    {loading ? (
                        <Loader2 className="animate-spin text-indigo-500" size={20} />
                    ) : error ? (
                        <div className="flex items-center gap-1 text-red-500 text-xs">
                            <AlertCircle size={14} />
                            {error}
                        </div>
                    ) : (
                        <>
                            <div className="text-2xl font-bold text-slate-800">{orderCount?.toLocaleString()}</div>
                            <div className="text-xs text-slate-500">单</div>
                        </>
                    )}
                </div>
            </div>

            <OrderAnalysisModal
                isOpen={showModal}
                onClose={() => setShowModal(false)}
                productId={productId}
            />
        </>
    );
};
