/**
 * Algorithm Selector Component
 * 
 * Compact dropdown selector for choosing forecast algorithm.
 * Supports Prophet and three exponential smoothing algorithms.
 * Displays algorithm usage scenario description after selection.
 */

import type { ForecastAlgorithm } from '../../types/ontology';

export interface AlgorithmSelectorProps {
  selectedAlgorithm: ForecastAlgorithm;
  onAlgorithmChange: (algorithm: ForecastAlgorithm) => void;
}

const ALGORITHM_OPTIONS: Array<{
  value: ForecastAlgorithm;
  label: string;
  description: string;
}> = [
  {
    value: 'prophet',
    label: 'Prophet',
    description: 'Prophet 适合具有强季节性和长期趋势的需求预测，由 Meta 开发',
  },
  {
    value: 'simple_exponential',
    label: '简单指数平滑',
    description: '适用于无明显趋势和季节性的数据',
  },
  {
    value: 'holt_linear',
    label: 'Holt 线性指数平滑',
    description: '适用于具有线性趋势但无季节性的数据',
  },
  {
    value: 'holt_winters',
    label: 'Holt-Winters 三重指数平滑',
    description: '适用于具有趋势和季节性的数据',
  },
];

const AlgorithmSelector = ({ selectedAlgorithm, onAlgorithmChange }: AlgorithmSelectorProps) => {
  const selectedOption = ALGORITHM_OPTIONS.find((opt) => opt.value === selectedAlgorithm);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    onAlgorithmChange(e.target.value as ForecastAlgorithm);
  };

  return (
    <div className="w-full space-y-2">
      <label className="block text-sm font-medium text-slate-700">
        选择预测算法
      </label>

      {/* Compact dropdown */}
      <select
        value={selectedAlgorithm}
        onChange={handleChange}
        className="w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white text-slate-700"
      >
        {ALGORITHM_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default AlgorithmSelector;

