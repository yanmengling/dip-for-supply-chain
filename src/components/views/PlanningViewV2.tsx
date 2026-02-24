/**
 * Planning View V2 Component
 *
 * 新版动态计划协同系统主视图
 * 集成4个模块: PP → MPS → MRP → 智能协同
 */

import { useState, useEffect } from 'react';
import type { PlanningModuleV2, MaterialTask, RiskAlert } from '../../types/planningV2';
import PlanningTimelineV2 from '../planningV2/PlanningTimelineV2';
import ProductDemandPanel from '../planningV2/ProductDemandPanel';
import MasterProductionPanel from '../planningV2/MasterProductionPanel';
import MaterialRequirementPanel from '../planningV2/MaterialRequirementPanel';
import SmartCollaborationPanel from '../planningV2/SmartCollaborationPanel';
import PlanningAssistant from '../planningV2/PlanningAssistant';
import { MessageSquare, Sparkles } from 'lucide-react';

const PlanningViewV2 = () => {
  const [activeModule, setActiveModule] = useState<PlanningModuleV2>('PP');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialTask | undefined>();
  const [currentPlanCode, setCurrentPlanCode] = useState<string>('');
  const [allTasks, setAllTasks] = useState<MaterialTask[]>([]);
  const [riskAlerts, setRiskAlerts] = useState<RiskAlert[]>([]);
  const [headerHeight, setHeaderHeight] = useState<number>(0);

  // Calculate header height for assistant positioning
  useEffect(() => {
    const calculateHeaderHeight = () => {
      // Find the header element by ID (added to SupplyChainApp)
      const header = document.getElementById('app-header') as HTMLElement;
      if (header) {
        const height = header.offsetHeight;
        setHeaderHeight(height);
        console.log('Planning Assistant: Header height calculated:', height);
      } else {
        console.warn('Planning Assistant: Header element not found');
      }
    };

    // Calculate initially with a small delay to ensure DOM is ready
    const timer = setTimeout(calculateHeaderHeight, 100);

    // Recalculate on window resize
    window.addEventListener('resize', calculateHeaderHeight);

    // Cleanup
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', calculateHeaderHeight);
    };
  }, []);

  const handleModuleChange = (module: PlanningModuleV2) => {
    setActiveModule(module);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800 flex items-center gap-2">
            新版动态计划协同
            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-medium rounded">
              V2
            </span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Dynamic Planning Collaboration V2 - 基于齐套模式的智能计划协同系统
          </p>
        </div>
      </div>

      {/* Timeline Navigation */}
      <div className="bg-white rounded-lg shadow-sm px-6 py-3 border border-slate-200">
        <PlanningTimelineV2
          activeModule={activeModule}
          onModuleChange={handleModuleChange}
        />
      </div>

      {/* Module Panels Container */}
      <div className="bg-white rounded-lg shadow-sm p-6 border border-slate-200 min-h-[500px]">
        <ProductDemandPanel active={activeModule === 'PP'} />
        <MasterProductionPanel active={activeModule === 'MPS'} />
        <MaterialRequirementPanel active={activeModule === 'MRP'} />
        <SmartCollaborationPanel
          active={activeModule === 'COLLABORATION'}
          onPlanDataChange={(planCode, tasks, risks) => {
            setCurrentPlanCode(planCode);
            setAllTasks(tasks);
            setRiskAlerts(risks);
          }}
          onMaterialSelect={(material) => {
            setSelectedMaterial(material);
            setAssistantOpen(true);
          }}
        />
      </div>

      {/* Footer Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">💡 系统说明</p>
            <ul className="space-y-1 text-blue-700">
              <li>• <strong>产品需求计划(PP)</strong>: 制定产品销售需求预测</li>
              <li>• <strong>主生产计划(MPS)</strong>: 明确产品生产计划和时间</li>
              <li>• <strong>物料需求计划(MRP)</strong>: 根据BOM展开物料需求</li>
              <li>• <strong>智能计划协同</strong>: 基于齐套模式的甘特图实时跟踪物料交付</li>
            </ul>
            <p className="mt-2 text-xs text-blue-600">
              注: 本系统使用模拟数据，与现有系统完全隔离
            </p>
          </div>
        </div>
      </div>

      {/* Floating Chat Bubble Button */}
      {!assistantOpen && (
        <button
          onClick={() => setAssistantOpen(true)}
          className="fixed bottom-8 right-8 w-14 h-14 bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center z-40"
          aria-label="打开AI助手"
        >
          <MessageSquare size={24} />
        </button>
      )}

      {/* Planning Assistant */}
      <PlanningAssistant
        isOpen={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        topOffset={headerHeight}
        currentPlan={currentPlanCode}
        selectedMaterial={selectedMaterial}
        allTasks={allTasks}
        riskAlerts={riskAlerts}
      />
    </div>
  );
};

export default PlanningViewV2;
