import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, ReferenceLine } from 'recharts';
import { TrendingUp, BarChart3, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { demandPlanningService } from '../../services/demandPlanningService';
import {
  simpleExponentialSmoothing,
  holtLinearSmoothing,
  holtWintersSmoothing,
  type SmoothingParams,
  type ProphetParams,
} from '../../services/forecastAlgorithmService';
import { forecastOperatorService, type ProphetForecastInput } from '../../services/forecastOperatorService';
import { AlgorithmParameterPanel, DEFAULT_PARAMETERS, type AlgorithmParameters } from './AlgorithmParameterPanel';
import type { ProductSalesHistory } from '../../types/ontology';

interface Props {
  productId: string;
  productName: string;
  loading?: boolean;
}

// Use a subset of ForecastAlgorithm for this panel
type PanelForecastAlgorithm = 'prophet' | 'simple_exponential' | 'holt_linear' | 'holt_winters';

interface ForecastComparisonData {
  month: string;
  actual: number | null;       // 历史真实数据
  backtest: number | null;     // 历史回测数据（算法拟合值）
  forecast: number | null;     // 未来预测数据（与回测连续）
  isHistorical: boolean;
  isForecastStart?: boolean;   // 预测起点标记
}

interface ForecastStats {
  avgActual: number;
  avgForecast: number;
  totalForecast: number;
  backtestMAPE: number;        // 回测平均绝对百分比误差
  confidenceLevel: 'high' | 'medium' | 'low';
}

const ALGORITHM_OPTIONS: { value: PanelForecastAlgorithm; label: string; description: string }[] = [
  { value: 'simple_exponential', label: '简单指数平滑', description: '适用于无趋势的稳定数据' },
  { value: 'holt_linear', label: 'Holt线性指数平滑', description: '适用于有趋势但无季节性' },
  { value: 'holt_winters', label: 'Holt-Winters三重指数平滑', description: '适用于有趋势和季节性' },
  { value: 'prophet', label: 'Prophet预测', description: '适用于复杂季节性和长期趋势' },
];

export const ProductDemandForecastPanelNew: React.FC<Props> = ({ productId, productName, loading: externalLoading = false }) => {
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<PanelForecastAlgorithm>('simple_exponential');
  const [algorithmParameters, setAlgorithmParameters] = useState<AlgorithmParameters>(DEFAULT_PARAMETERS['simple_exponential']);
  const [forecastData, setForecastData] = useState<ForecastComparisonData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasGenerated, setHasGenerated] = useState(false);
  const [stats, setStats] = useState<ForecastStats | null>(null);
  // Store cached history to avoid re-fetching when only algorithm changes
  const [cachedHistory, setCachedHistory] = useState<ProductSalesHistory[] | null>(null);
  // Track if Prophet used fallback (Holt-Winters) due to API unavailability
  const [usedProphetFallback, setUsedProphetFallback] = useState(false);

  // Handle algorithm change - reset parameters to defaults
  const handleAlgorithmChange = useCallback((newAlgorithm: PanelForecastAlgorithm) => {
    setSelectedAlgorithm(newAlgorithm);
    setAlgorithmParameters(DEFAULT_PARAMETERS[newAlgorithm]);
  }, []);

  // Use refs to track latest state values for closures
  const cachedHistoryRef = useRef(cachedHistory);
  const hasGeneratedRef = useRef(hasGenerated);

  useEffect(() => {
    cachedHistoryRef.current = cachedHistory;
  }, [cachedHistory]);

  useEffect(() => {
    hasGeneratedRef.current = hasGenerated;
  }, [hasGenerated]);

  // Helper functions
  const formatMonth = (monthStr: string): string => {
    const parts = monthStr.split('-');
    if (parts.length >= 2) {
      return `${parts[0].slice(2)}年${parts[1]}月`;
    }
    return monthStr;
  };

  const addMonths = (monthStr: string, months: number): string => {
    const parts = monthStr.split('-');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]);

    const newDate = new Date(year, month - 1 + months, 1);
    const newYear = newDate.getFullYear();
    const newMonth = String(newDate.getMonth() + 1).padStart(2, '0');

    return `${newYear}-${newMonth}`;
  };

  // Generate forecast - algorithm parameter to ensure fresh value is used
  // Use useCallback to create stable function reference
  const generateForecast = useCallback(async (
    algorithm: PanelForecastAlgorithm,
    useCache: boolean = false,
    params?: AlgorithmParameters
  ) => {
    if (!productId) return;

    setLoading(true);
    setError(null);
    setUsedProphetFallback(false); // Reset fallback flag

    // Convert AlgorithmParameters to SmoothingParams (for non-Prophet algorithms)
    const smoothingParams: SmoothingParams = {
      alpha: params?.alpha,
      beta: params?.beta,
      gamma: params?.gamma,
      seasonLength: params?.seasonLength,
    };

    console.log(`[DemandForecast] Starting forecast generation with algorithm: ${algorithm}, useCache: ${useCache}, params:`, params);

    try {
      let history: ProductSalesHistory[];

      // Use cached history if available and requested
      // Use ref to get latest cached history value (avoid stale closure)
      const currentCachedHistory = cachedHistoryRef.current;
      if (useCache && currentCachedHistory && currentCachedHistory.length > 0) {
        console.log(`[DemandForecast] Using cached history with ${currentCachedHistory.length} points`);
        history = currentCachedHistory;
      } else {
        // Fetch historical sales data directly from the service
        // This returns the raw ProductSalesHistory[] sorted by month
        history = await demandPlanningService.fetchProductSalesHistory(productId);

        console.log(`[DemandForecast] Raw history fetched: ${history.length} months`);

        if (history.length === 0) {
          setError('暂无历史销售数据，无法生成预测');
          setForecastData([]);
          setStats(null);
          return;
        }

        // Take the last 12 months of history (API may return more)
        if (history.length > 12) {
          history = history.slice(-12);
          console.log(`[DemandForecast] Trimmed to last 12 months`);
        }

        console.log(`[DemandForecast] History months:`, history.map(h => h.month));

        // Cache the history for algorithm switching
        setCachedHistory(history);
      }

      if (history.length === 0) {
        setError('暂无历史销售数据，无法生成预测');
        setForecastData([]);
        setStats(null);
        return;
      }

      // 生成回测数据（对历史数据进行拟合）和未来12个月预测（含本月）
      // 回测逻辑：使用前N个月的数据预测第N+1个月，逐步滚动
      const backtestValues: number[] = [];
      const futureForecasts: number[] = [];
      const FORECAST_MONTHS = 12; // 未来预测12个月（含本月）

      // 为每个月生成回测值（从第3个月开始，因为需要至少2个数据点）
      for (let i = 0; i < history.length; i++) {
        if (i < 2) {
          // 前2个月没有足够数据进行回测，使用实际值
          backtestValues.push(history[i].quantity);
        } else {
          // 使用前i个月的数据预测第i+1个月
          const trainingData = history.slice(0, i);
          let predicted: number;

          switch (algorithm) {
            case 'prophet':
            case 'holt_winters': {
              // Holt-Winters 内部会根据数据量自动回退
              const hwResult = holtWintersSmoothing(trainingData, 1, smoothingParams);
              predicted = hwResult[0];
              break;
            }
            case 'holt_linear': {
              const holtResult = holtLinearSmoothing(trainingData, 1, smoothingParams);
              predicted = holtResult[0];
              break;
            }
            case 'simple_exponential':
            default: {
              const simpleResult = simpleExponentialSmoothing(trainingData, 1, smoothingParams);
              predicted = simpleResult[0];
              break;
            }
          }

          // Ensure predicted value is valid (not NaN or Infinity)
          if (!isFinite(predicted) || isNaN(predicted)) {
            console.warn(`[DemandForecast] Invalid predicted value at index ${i}: ${predicted}, using training data average instead`);
            predicted = trainingData.reduce((sum, d) => sum + d.quantity, 0) / trainingData.length;
          }

          backtestValues.push(Math.round(Math.max(0, predicted)));
        }
      }

      console.log(`[DemandForecast] Backtest values (first 5):`, backtestValues.slice(0, 5));
      console.log(`[DemandForecast] Backtest values (last 5):`, backtestValues.slice(-5));

      // 生成未来12个月的预测
      console.log(`[DemandForecast] Generating future forecast with algorithm: ${algorithm}, history length: ${history.length}`);
      switch (algorithm) {
        case 'prophet': {
          // Prophet uses forecastOperatorService which tries API first, then falls back to Holt-Winters
          console.log(`[DemandForecast] Using Prophet via forecastOperatorService`);
          const prophetInput: ProphetForecastInput = {
            product_id: productId,
            historical_data: history.map(h => ({ month: h.month, quantity: h.quantity })),
            forecast_periods: FORECAST_MONTHS,
            parameters: {
              seasonalityMode: params?.seasonalityMode || 'multiplicative',
              yearlySeasonality: params?.yearlySeasonality ?? true,
              weeklySeasonality: params?.weeklySeasonality ?? false,
              changepointPriorScale: params?.changepointPriorScale || 0.05,
              seasonalityPriorScale: params?.seasonalityPriorScale || 10,
              intervalWidth: params?.intervalWidth || 0.95,
              growth: params?.growth || 'linear',
            },
          };
          const prophetResult = await forecastOperatorService.forecast('prophet', prophetInput);
          console.log(`[DemandForecast] Prophet result:`, prophetResult);
          futureForecasts.push(...prophetResult.forecast_values);
          // Track if fallback was used
          if (prophetResult.usedFallback) {
            setUsedProphetFallback(true);
            console.log(`[DemandForecast] Prophet used Holt-Winters fallback`);
          }
          break;
        }
        case 'holt_winters': {
          // Holt-Winters需要至少24个月数据（2个完整季节），否则会回退到Holt Linear
          const hwResult = holtWintersSmoothing(history, FORECAST_MONTHS, smoothingParams);
          console.log(`[DemandForecast] Holt-Winters result:`, hwResult);
          futureForecasts.push(...hwResult);
          break;
        }
        case 'holt_linear': {
          const hlResult = holtLinearSmoothing(history, FORECAST_MONTHS, smoothingParams);
          console.log(`[DemandForecast] Holt-Linear result:`, hlResult);
          futureForecasts.push(...hlResult);
          break;
        }
        case 'simple_exponential':
        default: {
          const seResult = simpleExponentialSmoothing(history, FORECAST_MONTHS, smoothingParams);
          console.log(`[DemandForecast] Simple Exponential result:`, seResult);
          futureForecasts.push(...seResult);
          break;
        }
      }

      // 构建对比数据：历史12个月 + 未来12个月（含本月）
      const comparisonData: ForecastComparisonData[] = [];

      // 添加历史数据（过去12个月）：包含真实值和回测值
      history.forEach((h, idx) => {
        comparisonData.push({
          month: formatMonth(h.month),
          actual: h.quantity,
          backtest: backtestValues[idx],
          forecast: null,
          isHistorical: true,
        });
      });

      // 添加预测数据（未来12个月含本月）：回测曲线延续为预测曲线
      const lastMonth = history[history.length - 1]?.month || new Date().toISOString().slice(0, 7);

      for (let i = 0; i < FORECAST_MONTHS; i++) {
        const futureMonth = addMonths(lastMonth, i + 1);
        const forecastValue = Math.round(Math.max(0, futureForecasts[i]));
        comparisonData.push({
          month: formatMonth(futureMonth),
          actual: null,
          backtest: null,
          // 第一个预测点需要与最后一个回测点连接
          forecast: forecastValue,
          isHistorical: false,
          isForecastStart: i === 0,
        });
      }

      // 为了让回测曲线和预测曲线连续：
      // 1. 在最后一个历史数据点添加forecast值（使用最后的backtest值，作为预测曲线的起点）
      // 2. 这样预测曲线会从最后一个回测点开始延伸
      if (comparisonData.length > 0 && futureForecasts.length > 0) {
        const lastHistoricalIdx = history.length - 1;
        // 预测起点使用最后一个backtest值，确保曲线连续
        comparisonData[lastHistoricalIdx].forecast = backtestValues[backtestValues.length - 1];
      }

      console.log(`[DemandForecast] Setting forecastData with ${comparisonData.length} points, first forecast value: ${comparisonData.find(d => d.forecast !== null)?.forecast}`);
      setForecastData(comparisonData);

      // 计算统计数据
      const actualValues = history.map(h => h.quantity);
      const avgActual = actualValues.reduce((a, b) => a + b, 0) / actualValues.length;
      const avgForecast = futureForecasts.reduce((a, b) => a + b, 0) / futureForecasts.length;
      const totalForecast = futureForecasts.reduce((a, b) => a + b, 0);

      // 计算回测MAPE (Mean Absolute Percentage Error)
      let mapeSum = 0;
      let mapeCount = 0;
      const mapeErrors: Array<{ month: string; actual: number; predicted: number; error: number }> = [];

      for (let i = 2; i < history.length; i++) {
        const actual = history[i].quantity;
        const predicted = backtestValues[i];
        if (actual > 0) {
          const error = Math.abs((actual - predicted) / actual);
          mapeSum += error;
          mapeCount++;
          mapeErrors.push({
            month: history[i].month,
            actual,
            predicted,
            error: Math.round(error * 1000) / 10, // percentage
          });
        }
      }

      // Find months with highest errors
      const topErrors = mapeErrors
        .sort((a, b) => b.error - a.error)
        .slice(0, 3);

      const backtestMAPE = mapeCount > 0 ? (mapeSum / mapeCount) * 100 : 0;
      console.log(`[DemandForecast] MAPE calculation: totalError=${Math.round(mapeSum * 100) / 100}, count=${mapeCount}, MAPE=${Math.round(backtestMAPE * 10) / 10}%`);
      console.log(`[DemandForecast] Top 3 error months:`, topErrors);

      // 基于历史数据点数和回测误差确定置信度
      const confidenceLevel: 'high' | 'medium' | 'low' =
        history.length >= 12 && backtestMAPE < 15 ? 'high' :
          history.length >= 6 && backtestMAPE < 25 ? 'medium' : 'low';

      const newStats = {
        avgActual: Math.round(avgActual),
        avgForecast: Math.round(avgForecast),
        totalForecast: Math.round(totalForecast),
        backtestMAPE: Math.round(backtestMAPE * 10) / 10,
        confidenceLevel,
      };
      console.log(`[DemandForecast] Setting stats:`, newStats);
      setStats(newStats);

      setHasGenerated(true);
      console.log(`[DemandForecast] Forecast generation completed for algorithm: ${algorithm}`);
    } catch (err) {
      console.error('Failed to generate forecast:', err);
      setError('生成预测失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [productId]); // Only depend on productId, use ref for cachedHistory

  // Track previous product to detect changes
  const prevProductIdRef = useRef<string | null>(null);

  // Reset state when product changes
  useEffect(() => {
    const prevProductId = prevProductIdRef.current;
    const productChanged = prevProductId !== null && prevProductId !== productId;

    console.log(`[DemandForecast] Product effect:`, {
      productId,
      prevProductId,
      productChanged,
    });

    prevProductIdRef.current = productId;

    if (productChanged) {
      // Product changed - reset state
      console.log(`[DemandForecast] Product changed, resetting state`);
      setCachedHistory(null);
      setHasGenerated(false);
      setForecastData([]);
      setStats(null);
      setError(null);
    }
  }, [productId]);

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

  // Generate unique gradient IDs
  const actualGradientId = useMemo(() => `colorActual-${productId}`, [productId]);
  const backtestGradientId = useMemo(() => `colorBacktest-${productId}`, [productId]);
  const forecastGradientId = useMemo(() => `colorForecast-${productId}`, [productId]);

  if (externalLoading) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-slate-200 rounded w-48 mb-4"></div>
          <div className="h-64 bg-slate-100 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-6 bg-white rounded-xl border border-slate-200 shadow-sm p-6 hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-100 to-blue-50 rounded-lg flex items-center justify-center">
            <BarChart3 className="text-blue-600" size={18} />
          </div>
          需求预测对比
        </h3>

        {/* Algorithm Selector and Generate Button */}
        <div className="flex items-center gap-3">
          <select
            value={selectedAlgorithm}
            onChange={(e) => handleAlgorithmChange(e.target.value as PanelForecastAlgorithm)}
            className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
          >
            {ALGORITHM_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <button
            onClick={() => generateForecast(selectedAlgorithm, !!cachedHistory, algorithmParameters)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-lg text-sm font-medium hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <Loader2 className="animate-spin" size={16} />
            ) : (
              <RefreshCw size={16} />
            )}
            生成需求预测
          </button>
        </div>
      </div>

      {/* Algorithm Parameter Panel */}
      <AlgorithmParameterPanel
        algorithm={selectedAlgorithm}
        parameters={algorithmParameters}
        onParametersChange={setAlgorithmParameters}
      />

      {/* Error State */}
      {error && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="text-amber-600 mt-0.5" size={18} />
            <div>
              <h4 className="text-sm font-semibold text-amber-900 mb-1">无法生成预测</h4>
              <p className="text-sm text-amber-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Prophet Fallback Notice */}
      {hasGenerated && usedProphetFallback && selectedAlgorithm === 'prophet' && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="text-amber-600 flex-shrink-0" size={16} />
            <p className="text-sm text-amber-700">
              Prophet 预测服务暂时不可用，已自动切换到 Holt-Winters 算法生成预测结果
            </p>
          </div>
        </div>
      )}

      {/* Stats Cards */}
      {hasGenerated && stats && (
        <div className="grid grid-cols-5 gap-3 mb-6">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100/50 rounded-xl p-3 border border-blue-100">
            <div className="text-xs text-slate-600 mb-1">平均实际值</div>
            <div className="text-lg font-bold text-slate-800">{stats.avgActual.toLocaleString()}</div>
            <div className="text-xs text-slate-500 mt-1">过去12个月</div>
          </div>
          <div className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-xl p-3 border border-emerald-100">
            <div className="text-xs text-slate-600 mb-1">平均预测值</div>
            <div className="text-lg font-bold text-slate-800">{stats.avgForecast.toLocaleString()}</div>
            <div className="text-xs text-slate-500 mt-1">未来12个月</div>
          </div>
          <div className="bg-gradient-to-br from-purple-50 to-purple-100/50 rounded-xl p-3 border border-purple-100">
            <div className="text-xs text-slate-600 mb-1">预测总量</div>
            <div className="text-lg font-bold text-slate-800">{stats.totalForecast.toLocaleString()}</div>
            <div className="text-xs text-slate-500 mt-1">未来12个月总计</div>
          </div>
          <div className="bg-gradient-to-br from-orange-50 to-orange-100/50 rounded-xl p-3 border border-orange-100">
            <div className="text-xs text-slate-600 mb-1">回测误差</div>
            <div className={`text-lg font-bold ${stats.backtestMAPE < 15 ? 'text-emerald-600' : stats.backtestMAPE < 25 ? 'text-amber-600' : 'text-red-600'}`}>
              {stats.backtestMAPE}%
            </div>
            <div className="text-xs text-slate-500 mt-1">MAPE指标</div>
          </div>
          <div className="bg-gradient-to-br from-amber-50 to-amber-100/50 rounded-xl p-3 border border-amber-100">
            <div className="text-xs text-slate-600 mb-1">置信度</div>
            <div className={`text-sm font-bold px-2 py-1 rounded-lg border inline-block ${confidenceColors[stats.confidenceLevel]}`}>
              {confidenceLabels[stats.confidenceLevel]}
            </div>
            <div className="text-xs text-slate-500 mt-1">基于回测</div>
          </div>
        </div>
      )}

      {/* Chart */}
      {hasGenerated && forecastData.length > 0 && (
        <div className="h-72 min-h-[288px] w-full">
          <ResponsiveContainer width="100%" height="100%" minHeight={288}>
            <AreaChart data={forecastData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={actualGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id={backtestGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
                <linearGradient id={forecastGradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10 }}
                interval={1}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e2e8f0',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                }}
                formatter={(value: number, name: string) => {
                  if (value === null || value === undefined) return ['-', ''];
                  const labels: Record<string, string> = {
                    actual: '历史实际',
                    backtest: '回测拟合',
                    forecast: '预测值'
                  };
                  return [value.toLocaleString(), labels[name] || name];
                }}
              />
              <Legend
                formatter={(value) => {
                  const labels: Record<string, string> = {
                    actual: '历史实际销量',
                    backtest: '回测拟合曲线',
                    forecast: '未来预测'
                  };
                  return labels[value] || value;
                }}
              />
              {/* Reference line to mark forecast start point */}
              <ReferenceLine
                x={forecastData.find(d => d.isForecastStart)?.month}
                stroke="#64748b"
                strokeWidth={2}
                strokeDasharray="4 4"
                label={{ value: '预测起点', position: 'top', fontSize: 10, fill: '#475569', fontWeight: 'bold' }}
              />
              {/* Historical actual data - solid blue line */}
              <Area
                type="monotone"
                dataKey="actual"
                stroke="#3b82f6"
                strokeWidth={2}
                fillOpacity={1}
                fill={`url(#${actualGradientId})`}
                name="actual"
                connectNulls={false}
                dot={{ fill: '#3b82f6', strokeWidth: 0, r: 3 }}
              />
              {/* Backtest fitted curve - orange dashed line (historical period) */}
              <Area
                type="monotone"
                dataKey="backtest"
                stroke="#f97316"
                strokeWidth={2}
                strokeDasharray="3 3"
                fillOpacity={1}
                fill={`url(#${backtestGradientId})`}
                name="backtest"
                connectNulls={true}
                dot={false}
              />
              {/* Future forecast - green line (continues from backtest) */}
              <Area
                type="monotone"
                dataKey="forecast"
                stroke="#10b981"
                strokeWidth={2.5}
                fillOpacity={1}
                fill={`url(#${forecastGradientId})`}
                name="forecast"
                connectNulls={true}
                dot={{ fill: '#10b981', strokeWidth: 0, r: 3 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Empty state */}
      {!hasGenerated && !loading && !error && (
        <div className="text-center py-12 text-slate-500">
          <TrendingUp className="mx-auto mb-3 text-slate-300" size={48} />
          <p>点击"生成需求预测"按钮开始预测分析</p>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="text-center py-12">
          <Loader2 className="mx-auto mb-3 animate-spin text-blue-500" size={48} />
          <p className="text-slate-500">正在生成预测...</p>
        </div>
      )}
    </div>
  );
};
