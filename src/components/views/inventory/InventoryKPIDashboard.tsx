import React from 'react';
import { TrendingUp, AlertTriangle, Package, DollarSign, Activity } from 'lucide-react';

interface KPICardProps {
    title: string;
    value: string | number;
    subValue?: string;
    icon: React.ElementType;
    colorClass: string;
    bgClass: string;
}

const KPICard: React.FC<KPICardProps> = ({ title, value, subValue, icon: Icon, colorClass, bgClass }) => (
    <div className={`p-6 bg-white rounded-2xl shadow-[0_2px_8px_-2px_rgba(0,0,0,0.05)] ring-1 ring-slate-100/50 hover:shadow-[0_4px_16px_-4px_rgba(0,0,0,0.1)] transition-all duration-300 transform hover:-translate-y-0.5`}>
        <div className="flex justify-between items-start">
            <div>
                <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
                <h3 className="text-2xl font-bold text-slate-800 tracking-tight">{value}</h3>
                {subValue && <p className={`text-xs mt-1.5 font-medium ${colorClass}`}>{subValue}</p>}
            </div>
            <div className={`p-3.5 rounded-xl ${bgClass} bg-opacity-60 backdrop-blur-sm`}>
                <Icon className={colorClass} size={24} />
            </div>
        </div>
    </div>
);

interface Props {
    stats: {
        totalValue: number;
        stockoutCount: number;
        stagnantCount: number;
        turnoverRate: number;
        inTransitCount: number;
    };
}

export const InventoryKPIDashboard: React.FC<Props> = ({ stats }) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
            <KPICard
                title="库存总货值 (预估)"
                value={`¥${(stats.totalValue / 10000).toFixed(1)}万`}
                subValue="+12% 较上月"
                icon={DollarSign}
                colorClass="text-emerald-600"
                bgClass="bg-emerald-50"
            />
            <KPICard
                title="缺货预警"
                value={stats.stockoutCount}
                subValue={stats.stockoutCount > 0 ? "需紧急补货" : "库存充足"}
                icon={AlertTriangle}
                colorClass="text-red-600"
                bgClass="bg-red-50"
            />
            <KPICard
                title="呆滞/慢动库存"
                value={stats.stagnantCount}
                subValue="建议促销或清理"
                icon={Activity}
                colorClass="text-orange-600"
                bgClass="bg-orange-50"
            />
            <KPICard
                title="在途物资"
                value={stats.inTransitCount}
                subValue="预计本周到货"
                icon={Package}
                colorClass="text-blue-600"
                bgClass="bg-blue-50"
            />
        </div>
    );
};
