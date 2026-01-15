/**
 * Plan Mode Selector Component
 *
 * Allows users to switch between three production planning modes:
 * - Default: Simple fixed-time calculation (快速预览)
 * - Material Ready: Wait for all materials, then continuous production (物料齐套后连续生产)
 * - Delivery Priority: Start immediately with available stock, wait for materials, continue (交付优先)
 */

import { Factory, Package, Truck } from 'lucide-react';
import type { ProductionPlanMode } from '../../types/ontology';

interface PlanModeSelectorProps {
  currentMode: ProductionPlanMode;
  onModeChange: (mode: ProductionPlanMode) => void;
  disabled?: boolean;
}

const modeConfig: Array<{
  mode: ProductionPlanMode;
  label: string;
  description: string;
  icon: typeof Factory;
  color: string;
  activeColor: string;
}> = [
  {
    mode: 'default',
    label: '默认模式',
    description: '快速预览，固定时间计算',
    icon: Factory,
    color: 'text-slate-400 border-slate-600 bg-slate-800/50',
    activeColor: 'text-blue-400 border-blue-500 bg-blue-500/20',
  },
  {
    mode: 'material-ready',
    label: '物料齐套',
    description: '等物料到齐后连续生产',
    icon: Package,
    color: 'text-slate-400 border-slate-600 bg-slate-800/50',
    activeColor: 'text-emerald-400 border-emerald-500 bg-emerald-500/20',
  },
  {
    mode: 'delivery-priority',
    label: '交付优先',
    description: '立即生产，分段执行',
    icon: Truck,
    color: 'text-slate-400 border-slate-600 bg-slate-800/50',
    activeColor: 'text-amber-400 border-amber-500 bg-amber-500/20',
  },
];

export function PlanModeSelector({
  currentMode,
  onModeChange,
  disabled = false,
}: PlanModeSelectorProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-400 mr-1">计划模式:</span>
      <div className="flex gap-1">
        {modeConfig.map(({ mode, label, description, icon: Icon, color, activeColor }) => {
          const isActive = currentMode === mode;
          return (
            <button
              key={mode}
              onClick={() => !disabled && onModeChange(mode)}
              disabled={disabled}
              title={description}
              className={`
                flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border text-xs
                transition-all duration-200
                ${isActive ? activeColor : color}
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-90 cursor-pointer'}
              `}
            >
              <Icon className="w-3.5 h-3.5" />
              <span className="font-medium">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default PlanModeSelector;
