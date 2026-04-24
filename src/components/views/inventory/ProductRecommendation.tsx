/**
 * 步骤 2: 选择目标产品
 * 
 * 显示推荐产品列表，基于呆滞料匹配度排序
 */

import { useState } from 'react';
import { Star, TrendingUp, Package, DollarSign, ArrowLeft } from 'lucide-react';
import type { MaterialData, ProductData } from '../../../types/stagnantInventory';

interface ProductRecommendationProps {
    selectedMaterials: MaterialData[];
    products: ProductData[];
    onComplete: (product: ProductData) => void;
    onBack: () => void;
}

export const ProductRecommendation = ({
    selectedMaterials,
    products,
    onComplete,
    onBack,
}: ProductRecommendationProps) => {
    const [selectedProduct, setSelectedProduct] = useState<ProductData | null>(null);

    // 计算已选物料的总价值
    const totalStagnantValue = selectedMaterials.reduce(
        (sum, m) => sum + (m.currentStock || 0) * m.unitPrice,
        0
    );

    // 模拟产品匹配度（实际应该基于 BOM 计算）
    const productsWithMatch = products.map((product, index) => ({
        product,
        matchScore: 80 - index * 10, // 模拟匹配度
        canProduceWithStagnantOnly: 50 - index * 10, // 模拟可生产数量
        stagnantValueConsumed: totalStagnantValue * (0.8 - index * 0.1), // 模拟消纳价值
        estimatedSupplementCost: 3500 + index * 500, // 模拟补料成本
        salesVolume: 1000 - index * 200, // 模拟销量
        profitMargin: 25 - index * 5, // 模拟利润率
    }));

    const handleSelectProduct = (product: ProductData) => {
        setSelectedProduct(product);
        onComplete(product);
    };

    return (
        <div className="space-y-6">
            {/* 已选物料摘要 */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">已选择呆滞物料</h3>
                <div className="flex flex-wrap gap-2">
                    {selectedMaterials.map((material) => (
                        <span
                            key={material.code}
                            className="px-3 py-1 bg-white border border-blue-300 rounded-full text-sm text-blue-700"
                        >
                            {material.code}
                        </span>
                    ))}
                </div>
                <p className="text-sm text-blue-700 mt-2">
                    共 {selectedMaterials.length} 种物料，总价值 ¥{totalStagnantValue.toLocaleString()}
                </p>
            </div>

            {/* 推荐产品列表 */}
            <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-900">
                    推荐产品（按呆滞料匹配度排序）
                </h3>

                {productsWithMatch.map((item, index) => (
                    <div
                        key={item.product.code}
                        className="bg-white rounded-lg border-2 border-slate-200 hover:border-blue-300 transition-colors"
                    >
                        <div className="p-6">
                            {/* 产品标题 */}
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-start gap-3">
                                    {index === 0 && (
                                        <Star className="w-6 h-6 text-yellow-500 fill-yellow-500 flex-shrink-0 mt-1" />
                                    )}
                                    <div>
                                        <h4 className="text-lg font-semibold text-slate-900">
                                            {item.product.name}
                                        </h4>
                                        <p className="text-sm text-slate-500 mt-1">
                                            {item.product.model}
                                        </p>
                                    </div>
                                </div>

                                {/* 匹配度 */}
                                <div className="text-right">
                                    <div className="text-sm text-slate-600 mb-1">匹配度</div>
                                    <div className="flex items-center gap-2">
                                        <div className="w-24 h-2 bg-slate-200 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-blue-600 rounded-full"
                                                style={{ width: `${item.matchScore}%` }}
                                            />
                                        </div>
                                        <span className="text-sm font-semibold text-blue-600">
                                            {item.matchScore}%
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* 关键指标 */}
                            <div className="grid grid-cols-3 gap-4 mb-4">
                                <div className="flex items-center gap-2">
                                    <TrendingUp className="w-4 h-4 text-green-600" />
                                    <div>
                                        <p className="text-xs text-slate-500">销量</p>
                                        <p className="text-sm font-semibold text-slate-900">
                                            {item.salesVolume} 件/月
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <DollarSign className="w-4 h-4 text-blue-600" />
                                    <div>
                                        <p className="text-xs text-slate-500">利润率</p>
                                        <p className="text-sm font-semibold text-slate-900">
                                            {item.profitMargin}%
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2">
                                    <Package className="w-4 h-4 text-purple-600" />
                                    <div>
                                        <p className="text-xs text-slate-500">可生产</p>
                                        <p className="text-sm font-semibold text-slate-900">
                                            {item.canProduceWithStagnantOnly} 件
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* 预估结果 */}
                            <div className="bg-slate-50 rounded-lg p-4 mb-4">
                                <h5 className="text-sm font-semibold text-slate-900 mb-3">
                                    💡 预估结果
                                </h5>
                                <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                        <span className="text-slate-600">仅用呆滞料可生产:</span>
                                        <span className="ml-2 font-semibold text-slate-900">
                                            {item.canProduceWithStagnantOnly} 件
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-slate-600">呆滞料消纳价值:</span>
                                        <span className="ml-2 font-semibold text-green-600">
                                            ¥{item.stagnantValueConsumed.toLocaleString()} ({((item.stagnantValueConsumed / totalStagnantValue) * 100).toFixed(0)}%)
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-slate-600">预估补料成本:</span>
                                        <span className="ml-2 font-semibold text-orange-600">
                                            ¥{item.estimatedSupplementCost.toLocaleString()}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-slate-600">需补料:</span>
                                        <span className="ml-2 font-semibold text-slate-900">
                                            约 15 种物料
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* 选择按钮 */}
                            <button
                                onClick={() => handleSelectProduct(item.product)}
                                className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                            >
                                选择此产品并计算详细方案 →
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* 操作按钮 */}
            <div className="flex justify-between">
                <button
                    onClick={onBack}
                    className="flex items-center gap-2 px-4 py-2 bg-slate-200 text-slate-700 rounded-md hover:bg-slate-300 transition-colors"
                >
                    <ArrowLeft className="w-4 h-4" />
                    返回上一步
                </button>
            </div>
        </div>
    );
};
