import React, { useMemo } from 'react';
import type { DemandForecast } from '../../types/ontology';
import { TrendingUp } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface Props {
  forecast: DemandForecast;
}

const ProductDemandForecastCardComponent: React.FC<Props> = ({ forecast }) => {
  const confidenceColors = {
    high: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    low: 'bg-red-100 text-red-700 border-red-200',
  };

  const confidenceLabels = {
    high: '高',
    medium: '中',
    low: '低',
  };

  // Generate forecast chart data - 使用useMemo避免重复计算
  const chartData = useMemo(() => {
    const weeks = Math.ceil(forecast.forecastPeriod / 7);
    return Array.from({ length: weeks }, (_, i) => ({
      period: `第${i + 1}周`,
      forecast: forecast.predictedDemand + (i * 10),
    }));
  }, [forecast.forecastPeriod, forecast.predictedDemand]);

  // 生成唯一的gradient ID，避免多个图表冲突
  const gradientId = useMemo(() =>
    `colorForecast-${forecast.productId}-${forecast.calculationMethod}`,
    [forecast.productId, forecast.calculationMethod]
  );

  return (
    <div className="mt-6 p-4 bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl border border-blue-100">
      <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2">
        <TrendingUp className="text-blue-600" size={20} />
        需求预测
      </h4>
      <div className="mb-4 grid grid-cols-3 gap-4">
        <div className="bg-white rounded-lg p-3 border border-blue-100">
          <div className="text-xs text-slate-600 mb-1">预测需求</div>
          <div className="text-2xl font-bold text-slate-800">{forecast.predictedDemand.toLocaleString()}</div>
          <div className="text-xs text-slate-500 mt-1">未来{forecast.forecastPeriod}天</div>
        </div>
        <div className="bg-white rounded-lg p-3 border border-blue-100">
          <div className="text-xs text-slate-600 mb-1">置信度</div>
          <div className={`text-base font-bold px-2 py-1 rounded-lg border-2 inline-block ${confidenceColors[forecast.confidenceLevel]}`}>
            {confidenceLabels[forecast.confidenceLevel]}
          </div>
          <div className="text-xs text-slate-500 mt-1">{forecast.historicalDataPoints}个数据点</div>
        </div>
        <div className="bg-white rounded-lg p-3 border border-blue-100">
          <div className="text-xs text-slate-600 mb-1">计算方法</div>
          <div className="text-sm font-bold text-slate-800">{forecast.forecastModel || '移动平均'}</div>
          <div className="text-xs text-slate-500 mt-1">基于历史数据</div>
        </div>
      </div>
      <div style={{ width: '100%', height: '192px' }}>
        <ResponsiveContainer width="100%" height={192}>
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="period" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Area
              type="monotone"
              dataKey="forecast"
              stroke="#3b82f6"
              strokeDasharray="5 5"
              fillOpacity={1}
              fill={`url(#${gradientId})`}
              name="预测数据"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// 使用React.memo防止不必要的重渲染
export const ProductDemandForecastCard = React.memo(ProductDemandForecastCardComponent);
