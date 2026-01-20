/**
 * EvaluationRadarChart Component
 * 
 * Displays 7 evaluation dimensions in a radar chart using Recharts.
 * 
 * Principle 1: Types imported from ontology.ts
 * Principle 2: Uses semantic color variables
 */

import { RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from 'recharts';
import type { Supplier360Scorecard } from '../../types/ontology';

interface EvaluationRadarChartProps {
  dimensions: Supplier360Scorecard['dimensions'];
  size?: 'sm' | 'md' | 'lg';
}

const EvaluationRadarChart = ({ dimensions, size = 'md' }: EvaluationRadarChartProps) => {
  const dimensionLabels: Record<string, string> = {
    qualityRating: '质量',
    onTimeDeliveryRate: '交付',
    riskRating: '风险控制',
    responseSpeed: '响应速度',
  };

  // Only chart the scored dimensions
  const chartKeys = ['qualityRating', 'onTimeDeliveryRate', 'riskRating', 'responseSpeed'];

  const chartData = chartKeys.map(key => ({
    dimension: dimensionLabels[key] || key,
    score: dimensions[key as keyof typeof dimensions] as number,
    fullMark: 100,
  }));

  const sizeConfig = {
    sm: { height: 200 },
    md: { height: 300 },
    lg: { height: 400 },
  };

  const { height } = sizeConfig[size];

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RadarChart data={chartData}>
        <PolarGrid />
        <PolarAngleAxis
          dataKey="dimension"
          tick={{ fontSize: 12, fill: '#94a3b8' }}
        />
        <PolarRadiusAxis
          angle={90}
          domain={[0, 100]}
          tick={{ fontSize: 10, fill: '#64748b' }}
        />
        <Radar
          name="评估分数"
          dataKey="score"
          stroke="#6366f1"
          fill="#6366f1"
          fillOpacity={0.6}
        />
      </RadarChart>
    </ResponsiveContainer>
  );
};

export default EvaluationRadarChart;

