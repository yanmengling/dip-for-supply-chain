/**
 * Function Card Section
 * 
 * Displays interactive cards for accessing key inventory optimization tools:
 * - Reverse Production Calculator
 * - MOQ Analysis Tool
 * - Order Delivery Timeline
 */

import { Calculator, TrendingUp, Clock, ArrowRight, type LucideIcon } from 'lucide-react';

interface FunctionCardSectionProps {
    onOpenReverseCalculator?: () => void;
    onOpenMOQAnalysis?: () => void;
    onOpenDeliveryTimeline?: () => void;
}

interface CardProps {
    id: string;
    title: string;
    description: string;
    icon: LucideIcon;
    colorClass: string;
    bgClass: string;
    onClick: () => void;
}

export const FunctionCardSection = ({
    onOpenReverseCalculator = () => { },
    onOpenMOQAnalysis = () => { },
    onOpenDeliveryTimeline = () => { }
}: FunctionCardSectionProps = {}) => {
    const cards: CardProps[] = [
        {
            id: 'reverse-calculator',
            title: '逆向生产计算器',
            description: '基于现有库存智能推算可生产数量，优化产能分配',
            icon: Calculator,
            colorClass: 'text-blue-600',
            bgClass: 'bg-blue-50',
            onClick: onOpenReverseCalculator
        },
        {
            id: 'moq-analysis',
            title: 'MOQ 影响分析',
            description: '深度分析最小起订量对库存成本与资金占用的影响',
            icon: TrendingUp,
            colorClass: 'text-purple-600',
            bgClass: 'bg-purple-50',
            onClick: onOpenMOQAnalysis
        },
        {
            id: 'delivery-timeline',
            title: '订单交期预警',
            description: 'AI 预测交付时间，提前识别延期风险并智能预警',
            icon: Clock,
            colorClass: 'text-orange-600',
            bgClass: 'bg-orange-50',
            onClick: onOpenDeliveryTimeline
        }
    ];

    return (
        <section className="mb-8">
            <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">智能工具箱</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {cards.map((card) => {
                    const Icon = card.icon;

                    return (
                        <button
                            key={card.id}
                            onClick={card.onClick}
                            className="group relative flex flex-col bg-white rounded-2xl p-6 border border-slate-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ease-in-out text-left overflow-hidden"
                        >
                            {/* Decorative background circle */}
                            <div className={`absolute -right-4 -top-4 w-24 h-24 rounded-full ${card.bgClass} opacity-50 blur-2xl group-hover:scale-150 transition-transform duration-500`} />

                            <div className="relative z-10 flex flex-col h-full">
                                {/* Header */}
                                <div className="flex items-start justify-between mb-4">
                                    <div className={`p-3 rounded-xl ${card.bgClass} ${card.colorClass} group-hover:scale-110 transition-transform duration-300`}>
                                        <Icon size={24} strokeWidth={2.5} />
                                    </div>
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300 ${card.bgClass}`}>
                                        <ArrowRight size={16} className={card.colorClass} />
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="flex-1">
                                    <h3 className="text-lg font-bold text-slate-800 mb-2 group-hover:text-slate-900 transition-colors">
                                        {card.title}
                                    </h3>
                                    <p className="text-sm text-slate-500 font-medium leading-relaxed group-hover:text-slate-600 transition-colors">
                                        {card.description}
                                    </p>
                                </div>

                                {/* Bottom Accent Line */}
                                <div className={`absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-${card.colorClass.split('-')[1]}-500 to-transparent transform scale-x-0 group-hover:scale-x-100 transition-transform duration-500 origin-left`} />
                            </div>
                        </button>
                    );
                })}
            </div>
        </section>
    );
};
