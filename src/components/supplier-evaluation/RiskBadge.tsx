/**
 * RiskBadge Component
 * 
 * Displays risk level badge with appropriate color and label.
 * 
 * Principle 2: Uses semantic color variables from Tailwind v4
 * Principle 1: Types imported from ontology.ts
 */

import type { RiskLevel } from '../../types/ontology';

interface RiskBadgeProps {
  riskLevel: RiskLevel;
  size?: 'sm' | 'md' | 'lg';
}

const RiskBadge = ({ riskLevel, size = 'md' }: RiskBadgeProps) => {
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-2.5 py-1 text-xs',
    lg: 'px-3 py-1.5 text-sm',
  };

  const riskConfig: Record<RiskLevel, { label: string; bg: string; text: string; border: string }> = {
    low: {
      label: '低风险',
      bg: 'bg-emerald-100',
      text: 'text-emerald-700',
      border: 'border-emerald-200',
    },
    medium: {
      label: '中风险',
      bg: 'bg-amber-100',
      text: 'text-amber-700',
      border: 'border-amber-200',
    },
    high: {
      label: '高风险',
      bg: 'bg-orange-100',
      text: 'text-orange-700',
      border: 'border-orange-200',
    },
    critical: {
      label: '严重风险',
      bg: 'bg-red-100',
      text: 'text-red-700',
      border: 'border-red-200',
    },
  };

  const config = riskConfig[riskLevel];

  // Handle invalid or undefined riskLevel
  if (!config) {
    console.error('Invalid riskLevel:', riskLevel, 'Valid values:', Object.keys(riskConfig));
    // Fallback to medium risk
    const fallbackConfig = riskConfig.medium;
    return (
      <span className={`${sizeClasses[size]} ${fallbackConfig.bg} ${fallbackConfig.text} ${fallbackConfig.border} rounded-full font-bold border`}>
        未知风险
      </span>
    );
  }

  return (
    <span className={`${sizeClasses[size]} ${config.bg} ${config.text} ${config.border} rounded-full font-bold border`}>
      {config.label}
    </span>
  );
};

export default RiskBadge;





