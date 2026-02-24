/**
 * Planning Timeline V2 Component
 *
 * 新版动态计划协同 - 时间轴导航组件
 * 显示四个计划阶段: PP → MPS → MRP → 智能协同
 */

import { type PlanningModuleV2, type PlanningModuleConfig } from '../../types/planningV2';

interface PlanningTimelineV2Props {
  activeModule: PlanningModuleV2;
  onModuleChange: (module: PlanningModuleV2) => void;
}

const PLANNING_MODULES: PlanningModuleConfig[] = [
  { id: 'PP', label: '产品需求计划（PP）', shortLabel: 'PP', order: 1 },
  { id: 'MPS', label: '主生产计划（MPS）', shortLabel: 'MPS', order: 2 },
  { id: 'MRP', label: '物料需求计划（MRP）', shortLabel: 'MRP', order: 3 },
  { id: 'COLLABORATION', label: '智能计划协同', shortLabel: '协同', order: 4 },
];

const PlanningTimelineV2 = ({ activeModule, onModuleChange }: PlanningTimelineV2Props) => {
  return (
    <div className="w-full py-2">
      <div className="relative flex items-center justify-center">
        {/* Timeline Container */}
        <div className="flex items-center gap-6 relative z-10">
          {PLANNING_MODULES.map((module, index) => {
            const isActive = activeModule === module.id;
            const isLast = index === PLANNING_MODULES.length - 1;

            return (
              <div key={module.id} className="flex items-center">
                {/* Module Node */}
                <button
                  onClick={() => onModuleChange(module.id)}
                  className={`
                    relative z-20 flex flex-col items-center gap-1 px-4 py-2 rounded-lg transition-all
                    ${isActive
                      ? 'bg-indigo-600 text-white shadow-lg scale-105'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }
                  `}
                >
                  <div className={`
                    w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm
                    ${isActive ? 'bg-white text-indigo-600' : 'bg-slate-300 text-slate-700'}
                  `}>
                    {module.shortLabel}
                  </div>
                  <span className={`text-xs font-medium whitespace-nowrap ${isActive ? 'text-white' : 'text-slate-700'}`}>
                    {module.label}
                  </span>
                </button>

                {/* Arrow Connection */}
                {!isLast && (
                  <div className="relative mx-4" style={{ width: '80px', height: '2px' }}>
                    <svg
                      width="80"
                      height="20"
                      className="absolute top-0 left-0"
                    >
                      <defs>
                        <marker
                          id={`arrow-v2-${module.id}`}
                          markerWidth="10"
                          markerHeight="10"
                          refX="9"
                          refY="3"
                          orient="auto"
                        >
                          <path
                            d="M0,0 L0,6 L9,3 z"
                            className={isActive || activeModule === PLANNING_MODULES[index + 1].id ? 'fill-indigo-600' : 'fill-slate-300'}
                          />
                        </marker>
                      </defs>
                      <line
                        x1="0"
                        y1="10"
                        x2="80"
                        y2="10"
                        className={isActive || activeModule === PLANNING_MODULES[index + 1].id ? 'stroke-indigo-600' : 'stroke-slate-300'}
                        strokeWidth="2"
                        markerEnd={`url(#arrow-v2-${module.id})`}
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
