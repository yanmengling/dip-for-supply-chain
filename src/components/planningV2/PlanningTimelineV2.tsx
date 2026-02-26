/**
 * Planning Timeline V2 Component
 *
 * 四步引导导航: ① 产品需求计划 → ② 生产计划 → ③ 物料需求计划 → ④ 计划协同
 */

import type { NewTaskStep } from '../../types/planningV2';
import { Check } from 'lucide-react';

interface PlanningTimelineV2Props {
  currentStep: NewTaskStep;
  completedSteps: Set<NewTaskStep>;
  onStepClick: (step: NewTaskStep) => void;
}

const STEPS: { step: NewTaskStep; label: string; shortLabel: string }[] = [
  { step: 1, label: '产品需求计划', shortLabel: '①' },
  { step: 2, label: '生产计划', shortLabel: '②' },
  { step: 3, label: '物料需求计划', shortLabel: '③' },
  { step: 4, label: '计划协同', shortLabel: '④' },
];

const PlanningTimelineV2 = ({ currentStep, completedSteps, onStepClick }: PlanningTimelineV2Props) => {
  return (
    <div className="w-full py-2">
      <div className="relative flex items-center justify-center">
        <div className="flex items-center gap-4">
          {STEPS.map((s, index) => {
            const isActive = currentStep === s.step;
            const isCompleted = completedSteps.has(s.step);
            const canClick = isCompleted || s.step <= currentStep;
            const isLast = index === STEPS.length - 1;

            return (
              <div key={s.step} className="flex items-center">
                <button
                  onClick={() => canClick && onStepClick(s.step)}
                  disabled={!canClick}
                  className={`
                    relative z-10 flex items-center gap-2 px-4 py-2 rounded-lg transition-all
                    ${isActive
                      ? 'bg-indigo-600 text-white shadow-md'
                      : isCompleted
                        ? 'bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                    }
                  `}
                >
                  <div className={`
                    w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold
                    ${isActive
                      ? 'bg-white text-indigo-600'
                      : isCompleted
                        ? 'bg-green-500 text-white'
                        : 'bg-slate-300 text-slate-500'
                    }
                  `}>
                    {isCompleted && !isActive ? <Check size={14} /> : s.shortLabel}
                  </div>
                  <span className="text-xs font-medium whitespace-nowrap">{s.label}</span>
                </button>

                {/* 箭头连接 */}
                {!isLast && (
                  <div className="mx-3">
                    <svg width="40" height="12" viewBox="0 0 40 12">
                      <defs>
                        <marker
                          id={`step-arrow-${s.step}`}
                          markerWidth="8"
                          markerHeight="8"
                          refX="7"
                          refY="3"
                          orient="auto"
                        >
                          <path
                            d="M0,0 L0,6 L7,3 z"
                            className={isCompleted ? 'fill-green-400' : isActive ? 'fill-indigo-400' : 'fill-slate-300'}
                          />
                        </marker>
                      </defs>
                      <line
                        x1="0" y1="6" x2="32" y2="6"
                        className={isCompleted ? 'stroke-green-400' : isActive ? 'stroke-indigo-400' : 'stroke-slate-300'}
                        strokeWidth="2"
                        markerEnd={`url(#step-arrow-${s.step})`}
                      />
                    </svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default PlanningTimelineV2;
