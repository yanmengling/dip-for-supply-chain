import React from 'react';
import { Info } from 'lucide-react';

// Algorithm types supported by this panel
type PanelForecastAlgorithm = 'prophet' | 'simple_exponential' | 'holt_linear' | 'holt_winters';

// Algorithm parameters interface
export interface AlgorithmParameters {
  // Simple exponential
  alpha?: number;

  // Holt linear (inherits alpha)
  beta?: number;

  // Holt-Winters (inherits alpha, beta)
  gamma?: number;
  seasonLength?: number;

  // Prophet-specific parameters
  seasonalityMode?: 'additive' | 'multiplicative';
  yearlySeasonality?: boolean;
  weeklySeasonality?: boolean;
  changepointPriorScale?: number;
  seasonalityPriorScale?: number;
  intervalWidth?: number;
  growth?: 'linear' | 'logistic' | 'flat';
}

// Default parameters for each algorithm
// Note: Prophet currently uses Holt-Winters as local fallback, so it shares the same base parameters
export const DEFAULT_PARAMETERS: Record<PanelForecastAlgorithm, AlgorithmParameters> = {
  simple_exponential: {
    alpha: 0.2,
  },
  holt_linear: {
    alpha: 0.3,
    beta: 0.1,
  },
  holt_winters: {
    alpha: 0.3,
    beta: 0.1,
    gamma: 0.2,
    seasonLength: 12,
  },
  prophet: {
    // Prophet-specific parameters
    seasonalityMode: 'multiplicative',
    yearlySeasonality: true,
    weeklySeasonality: false,
    changepointPriorScale: 0.05,
    seasonalityPriorScale: 10,
    intervalWidth: 0.95,
    growth: 'linear',
  },
};

// Season length options
const SEASON_LENGTH_OPTIONS = [
  { value: 3, label: '3个月 (季度)' },
  { value: 4, label: '4个月' },
  { value: 6, label: '6个月 (半年)' },
  { value: 12, label: '12个月 (年度)' },
];

// Algorithm descriptions
const ALGORITHM_DESCRIPTIONS: Record<PanelForecastAlgorithm, string> = {
  prophet: 'Prophet 适合具有强季节性和长期趋势的需求预测，由 Meta 开发',
  simple_exponential: '适用于无明显趋势和季节性的数据',
  holt_linear: '适用于具有线性趋势但无季节性的数据',
  holt_winters: '适用于具有趋势和季节性的数据',
};

interface Props {
  algorithm: PanelForecastAlgorithm;
  parameters: AlgorithmParameters;
  onParametersChange: (params: AlgorithmParameters) => void;
}

// Slider component for smoothing coefficients
const ParameterSlider: React.FC<{
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  hint?: string;
}> = ({ label, value, min, max, step, onChange, hint }) => {
  // Parse label to extract text before and inside parentheses
  const parseLabel = (labelText: string) => {
    const match = labelText.match(/^(.+?)\s*\((.+?)\)$/);
    if (match) {
      return { main: match[1], paren: match[2] };
    }
    return { main: labelText, paren: null };
  };

  const { main, paren } = parseLabel(label);

  return (
    <div className="flex-1">
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-medium text-slate-600">
          {main}
          {paren && (
            <>
              {' '}
              <span className="text-xs font-normal text-slate-500">({paren})</span>
            </>
          )}
        </label>
        <span className="text-sm font-semibold text-slate-800">{value.toFixed(2)}</span>
      </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-500"
    />
    <div className="flex justify-between text-xs text-slate-400 mt-0.5">
      <span>{min}</span>
      <span>{max}</span>
    </div>
    </div>
  );
};

export const AlgorithmParameterPanel: React.FC<Props> = ({
  algorithm,
  parameters,
  onParametersChange,
}) => {
  const updateParam = <K extends keyof AlgorithmParameters>(
    key: K,
    value: AlgorithmParameters[K]
  ) => {
    onParametersChange({ ...parameters, [key]: value });
  };

  // Render parameters based on selected algorithm
  const renderParameters = () => {
    switch (algorithm) {
      case 'simple_exponential':
        return (
          <div className="space-y-4">
            <ParameterSlider
              label="α (平滑系数：值越大对近期数据越敏感，适合波动较大的数据)"
              value={parameters.alpha ?? 0.2}
              min={0.01}
              max={1}
              step={0.01}
              onChange={(v) => updateParam('alpha', v)}
            />
          </div>
        );

      case 'holt_linear':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <ParameterSlider
                label="α (水平平滑：控制水平变化敏感度)"
                value={parameters.alpha ?? 0.3}
                min={0.01}
                max={1}
                step={0.01}
                onChange={(v) => updateParam('alpha', v)}
              />
              <ParameterSlider
                label="β (趋势平滑：控制趋势变化敏感度)"
                value={parameters.beta ?? 0.1}
                min={0.01}
                max={1}
                step={0.01}
                onChange={(v) => updateParam('beta', v)}
              />
            </div>
          </div>
        );

      case 'holt_winters':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <ParameterSlider
                label="α (水平)"
                value={parameters.alpha ?? 0.3}
                min={0.01}
                max={1}
                step={0.01}
                onChange={(v) => updateParam('alpha', v)}
              />
              <ParameterSlider
                label="β (趋势)"
                value={parameters.beta ?? 0.1}
                min={0.01}
                max={1}
                step={0.01}
                onChange={(v) => updateParam('beta', v)}
              />
              <ParameterSlider
                label="γ (季节)"
                value={parameters.gamma ?? 0.2}
                min={0.01}
                max={1}
                step={0.01}
                onChange={(v) => updateParam('gamma', v)}
              />
            </div>
            <div className="flex items-center gap-3">
              <label className="text-sm font-medium text-slate-600">季节周期:</label>
              <select
                value={parameters.seasonLength ?? 12}
                onChange={(e) => updateParam('seasonLength', parseInt(e.target.value))}
                className="px-3 py-1.5 text-sm border border-slate-200 rounded-lg bg-white hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {SEASON_LENGTH_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        );

      case 'prophet':
        // Prophet-specific parameters UI
        return (
          <div className="space-y-4">
            {/* Seasonality Mode & Yearly Seasonality */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-slate-600 mb-1.5 block">
                  季节性模式
                </label>
                <select
                  value={parameters.seasonalityMode ?? 'multiplicative'}
                  onChange={(e) => updateParam('seasonalityMode', e.target.value as 'additive' | 'multiplicative')}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                >
                  <option value="additive">加法季节性</option>
                  <option value="multiplicative">乘法季节性</option>
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  乘法适合波动与水平成比例的数据
                </p>
              </div>

              <div>
                <label className="text-sm font-medium text-slate-600 mb-1.5 block">
                  季节性组件
                </label>
                <div className="space-y-2 mt-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={parameters.yearlySeasonality ?? true}
                      onChange={(e) => updateParam('yearlySeasonality', e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-slate-700">年度季节性</span>
                  </label>
                </div>
              </div>
            </div>

            {/* Changepoint Prior Scale & Confidence Interval Width */}
            <div className="grid grid-cols-2 gap-4">
              <ParameterSlider
                label="变化点灵敏度 (值越大对趋势变化越敏感，可能导致过拟合)"
                value={parameters.changepointPriorScale ?? 0.05}
                min={0.001}
                max={0.5}
                step={0.001}
                onChange={(v) => updateParam('changepointPriorScale', v)}
              />

              <ParameterSlider
                label="置信区间宽度 (预测区间的概率覆盖范围)"
                value={parameters.intervalWidth ?? 0.95}
                min={0.5}
                max={0.99}
                step={0.01}
                onChange={(v) => updateParam('intervalWidth', v)}
              />
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="bg-gradient-to-br from-slate-50 to-slate-100/50 border border-slate-200 rounded-xl p-4 mb-4">
      <div className="flex items-center gap-2 mb-3">
        <Info className="text-slate-400" size={16} />
        <span className="text-sm font-medium text-slate-600">
          算法参数配置
          <span className="text-xs font-normal text-slate-500 ml-2">
            ({ALGORITHM_DESCRIPTIONS[algorithm]})
          </span>
        </span>
      </div>
      {renderParameters()}
    </div>
  );
};
