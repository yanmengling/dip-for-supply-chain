import React, { useState, useEffect } from 'react';
import { Package, Loader2 } from 'lucide-react';
import { metricModelApi, createLastDaysRange } from '../../api';


interface Props {
    productId: string;
    defaultInventory: number;
    unit?: string;
}

import { apiConfigService } from '../../services/apiConfigService';

// 统一使用产品库存指标模型
const getProductInventoryModelId = () => apiConfigService.getMetricModelId('mm_product_inventory_optimization') || 'd58keb5g5lk40hvh48og';
const PRODUCT_INVENTORY_DIMENSIONS = ['material_code', 'material_name', 'available_quantity'];

// 支持的产品列表
const SUPPORTED_PRODUCTS = ['T01-000055', 'T01-000167', 'T01-000173'];

export const ProductInventoryCard: React.FC<Props> = ({ productId, defaultInventory, unit = '单位' }) => {
    // Determine if we should use API mode for this product
    const shouldUseApi = SUPPORTED_PRODUCTS.includes(productId);
    const [inventoryCount, setInventoryCount] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!shouldUseApi) {
            setInventoryCount(null);
            return;
        }

        const fetchInventory = async () => {
            setLoading(true);
            try {
                const range = createLastDaysRange(1);

                const result = await metricModelApi.queryByModelId(
                    getProductInventoryModelId(),
                    {
                        instant: true,
                        start: range.start,
                        end: range.end,
                        analysis_dimensions: PRODUCT_INVENTORY_DIMENSIONS,
                    },
                    { includeModel: true }
                );

                // 从返回数据中找到匹配当前产品的记录
                // material_code 对应 productId
                let total = 0;
                if (result.datas && result.datas.length > 0) {
                    for (const series of result.datas) {
                        const materialCode = series.labels?.material_code || '';

                        // 匹配产品 ID
                        if (materialCode === productId) {
                            // 获取 available_quantity
                            const availableQty = series.labels?.available_quantity;
                            if (availableQty) {
                                const qty = parseFloat(availableQty);
                                if (!isNaN(qty)) {
                                    total += qty;
                                }
                            } else if (series.values && series.values.length > 0) {
                                // 从 values 中获取最新值
                                for (let i = series.values.length - 1; i >= 0; i--) {
                                    if (series.values[i] !== null && series.values[i] !== undefined) {
                                        total += Number(series.values[i]);
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }

                setInventoryCount(Math.floor(total));
            } catch (err) {
                console.error(`[ProductInventoryCard] Failed to fetch for ${productId}:`, err);
            } finally {
                setLoading(false);
            }
        };

        fetchInventory();
    }, [productId, shouldUseApi]);

    // Display value: API result (if available) or default prop
    const displayValue = shouldUseApi && inventoryCount !== null ? inventoryCount : defaultInventory;

    return (
        <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-lg p-3 border border-amber-100 hover:shadow-md transition-all h-full">
            <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 bg-amber-500/10 rounded flex items-center justify-center">
                    <Package className="text-amber-600" size={16} />
                </div>
                <div className="text-xs text-slate-600">当前库存</div>
            </div>
            <div className="flex items-baseline gap-1 min-h-[32px]">
                {loading ? (
                    <Loader2 className="animate-spin text-amber-500" size={20} />
                ) : (
                    <>
                        <div className="text-2xl font-bold text-slate-800">{displayValue.toLocaleString()}</div>
                        <div className="text-xs text-slate-500">{unit}</div>
                    </>
                )}
            </div>
        </div>
    );
};
