import React, { useState, useEffect } from 'react';
import type { DemandForecast } from '../../types/ontology';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp, Calendar, BarChart3 } from 'lucide-react';
import { calculateDemandForecast } from '../../services/demandForecastService';

interface Props {
  productId: string;
  productName: string;
  loading?: boolean;
}

export const DemandForecastPanel: React.FC<Props> = ({ productId, productName, loading = false }) => {
  const [forecastPeriod, setForecastPeriod] = useState<30 | 60 | 90>(30);
  const [forecast, setForecast] = useState<DemandForecast | null>(null);

  useEffect(() => {
    const loadForecast = async () => {
      const forecastData = await calculateDemandForecast(productId, forecastPeriod);
      setForecast(forecastData);
    };
    loadForecast();
  }, [productId, forecastPeriod]);

  // Generate chart data from forecast
  const forecastData = forecast ? (() => {
    const weeks = Math.ceil(forecastPeriod / 7);
    return Array.from({ length: weeks }, (_, i) => ({
      period: `第${i + 1}周`,
      forecast: forecast.predictedDemand + (i * Math.round(forecast.predictedDemand * 0.1)),
    }));
  })() : [];

  if (loading || !forecast) {
    return (
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-slate-200 rounded w-48 mb-4"></div>
          <div className="h-64 bg-slate-100 rounded"></div>
        </div>
      </div>
    );
  }

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

  return (
    <div className="bg-white rounded-xl border shadow-sm p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-100 to-indigo-50 rounded-lg flex items-center justify-center">
            <BarChart3 className="text-indigo-600" size={20} />
          </div>
          需求预测
        </h2>
        <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
          {([30, 60, 90] as const).map(period => (
            <button
              key={period}
              onClick={() => setForecastPeriod(period)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${forecastPeriod === period
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-sm'
                  : 'text-slate-600 hover:bg-slate-200'
                }`}
            >
              {period}天
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl p-5 border border-blue-100 hover:shadow-md transition-all">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
              <TrendingUp className="text-blue-600" size={16} />
            </div>
            <span className="text-sm font-medium text-slate-700">预测需求</span>
          </div>
          <div className="text-3xl font-bold text-slate-800 mb-1">{forecast.predictedDemand.toLocaleString()}</div>
          <div className="text-xs text-slate-500">未来{forecastPeriod}天</div>
        </div>
        <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-xl p-5 border border-emerald-100 hover:shadow-md transition-all">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center">
              <Calendar className="text-emerald-600" size={16} />
            </div>
            <span className="text-sm font-medium text-slate-700">置信度</span>
          </div>
          <div className={`text-base font-bold px-3 py-1.5 rounded-lg border-2 inline-block mb-1 ${confidenceColors[forecast.confidenceLevel]}`}>
            {confidenceLabels[forecast.confidenceLevel]}
          </div>
          <div className="text-xs text-slate-500">{forecast.historicalDataPoints}个数据点</div>
        </div>
        <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-xl p-5 border border-purple-100 hover:shadow-md transition-all">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 bg-purple-500/10 rounded-lg flex items-center justify-center">
              <BarChart3 className="text-purple-600" size={16} />
            </div>
            <span className="text-sm font-medium text-slate-700">计算方法</span>
          </div>
          <div className="text-lg font-bold text-slate-800">移动平均</div>
          <div className="text-xs text-slate-500 mt-1">基于历史数据</div>
        </div>
      </div>

      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={forecastData}>
            <defs>
              <linearGradient id="colorHistorical" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorForecast" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="period" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Area
              type="monotone"
              dataKey="historical"
              stroke="#3b82f6"
              fillOpacity={1}
              fill="url(#colorHistorical)"
              name="历史数据"
            />
            <Area
              type="monotone"
              dataKey="forecast"
              stroke="#10b981"
              strokeDasharray="5 5"
              fillOpacity={1}
              fill="url(#colorForecast)"
              name="预测数据"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

