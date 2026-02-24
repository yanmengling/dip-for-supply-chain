/**
 * 智能计划协同 - Smart Planning Collaboration Panel
 *
 * 基于齐套模式的甘特图、风险警告面板、模拟功能
 */

import { useState, useEffect } from 'react';
import { Network, AlertTriangle, Play, ChevronDown, ChevronUp } from 'lucide-react';
import { mockDataServiceV2 } from '../../services/mockDataV2';
import type { RiskLevel, MaterialTask, RiskAlert } from '../../types/planningV2';
import GanttChart from './gantt/GanttChart';
import SimulationPanel from './SimulationPanel';

interface SmartCollaborationPanelProps {
  active: boolean;
  onPlanDataChange?: (planCode: string, tasks: MaterialTask[], risks: RiskAlert[]) => void;
  onMaterialSelect?: (material: MaterialTask) => void;
}

const SmartCollaborationPanel = ({ active, onPlanDataChange, onMaterialSelect }: SmartCollaborationPanelProps) => {
  if (!active) return null;

  const [selectedFilter, setSelectedFilter] = useState<RiskLevel | 'all'>('all');
  const [expandedRisks, setExpandedRisks] = useState<Set<string>>(new Set());
  const [selectedPlan, setSelectedPlan] = useState<string>('');
  const [showGantt, setShowGantt] = useState(false);
  const [highlightedMaterial, setHighlightedMaterial] = useState<string>('');
  const [highlightedRisk, setHighlightedRisk] = useState<string>('');
  const [showSimulation, setShowSimulation] = useState(false);
  const [simulationType, setSimulationType] = useState<'normal' | 'abnormal' | null>(null);
  const [simulatedTasks, setSimulatedTasks] = useState<MaterialTask[]>([]);

  const allRisks = mockDataServiceV2.getRiskAlerts();
  const filteredRisks = selectedFilter === 'all'
    ? allRisks
    : allRisks.filter(r => r.level === selectedFilter);

  const availablePlans = mockDataServiceV2.getMasterProductionSchedules();
  const baseTasks = selectedPlan ? mockDataServiceV2.getMaterialTasks(selectedPlan) : [];

  // 如果正在模拟，使用模拟后的数据；否则使用原始数据
  const ganttTasks = showSimulation && simulatedTasks.length > 0 ? simulatedTasks : baseTasks;

  // 通知父组件数据变化
  useEffect(() => {
    if (selectedPlan && onPlanDataChange) {
      onPlanDataChange(selectedPlan, ganttTasks, allRisks);
    }
  }, [selectedPlan, ganttTasks.length, allRisks.length]);

  const handleGenerateGantt = () => {
    if (selectedPlan) {
      setShowGantt(true);
    }
  };

  const handleLocateInGantt = (materialCode: string) => {
    // 如果甘特图未显示,先显示它
    if (!showGantt && selectedPlan) {
      setShowGantt(true);
    }

    // 设置高亮的物料编码
    setHighlightedMaterial(materialCode);

    // 3秒后清除高亮
    setTimeout(() => {
      setHighlightedMaterial('');
    }, 3000);
  };

  // 反向定位：从甘特图任务定位到风险面板
  const handleMaterialClick = (task: MaterialTask) => {
    // 查找该物料对应的风险项
    const relatedRisk = allRisks.find(risk => risk.itemCode === task.materialCode);

    if (relatedRisk) {
      // 高亮风险项
      setHighlightedRisk(relatedRisk.id);

      // 展开该风险项
      const newExpanded = new Set(expandedRisks);
      newExpanded.add(relatedRisk.id);
      setExpandedRisks(newExpanded);

      // 切换筛选器以确保该风险可见
      if (selectedFilter !== 'all' && selectedFilter !== relatedRisk.level) {
        setSelectedFilter('all');
      }

      // 滚动到风险项
      setTimeout(() => {
        const element = document.getElementById(`risk-${relatedRisk.id}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);

      // 3秒后清除高亮
      setTimeout(() => {
        setHighlightedRisk('');
      }, 3000);
    }

    // 同时调用父组件的onMaterialSelect
    if (onMaterialSelect) {
      onMaterialSelect(task);
    }
  };

  const riskCounts = {
    severe: allRisks.filter(r => r.level === 'severe').length,
    abnormal: allRisks.filter(r => r.level === 'abnormal').length,
    advance_notice: allRisks.filter(r => r.level === 'advance_notice').length,
  };

  const toggleRiskExpand = (riskId: string) => {
    const newExpanded = new Set(expandedRisks);
    if (newExpanded.has(riskId)) {
      newExpanded.delete(riskId);
    } else {
      newExpanded.add(riskId);
    }
    setExpandedRisks(newExpanded);
  };

  const handleOpenSimulation = () => {
    setShowSimulation(true);
    setSimulationType(null);
  };

  const handleSimulationStart = (type: 'normal' | 'abnormal') => {
    setSimulationType(type);
    // 初始化模拟数据为基础数据的副本
    setSimulatedTasks([...baseTasks]);
  };

  const handleCloseSimulation = () => {
    setShowSimulation(false);
    setSimulationType(null);
    setSimulatedTasks([]);
  };

  // 处理模拟步骤变化，应用到甘特图
  const handleSimulationStepChange = (step: any) => {
    if (!step || !step.changes || baseTasks.length === 0) {
      // 重置为初始状态
      setSimulatedTasks([...baseTasks]);
      return;
    }

    // 应用变化到任务数据
    const updatedTasks = baseTasks.map(task => {
      // 查找该任务是否有变化
      const taskChange = step.changes.find((change: any) => {
        // 由于模拟数据使用的是假ID，我们需要找到实际对应的物料
        // 这里简化处理：基于步骤类型和任务状态匹配
        if (change.field === 'ganttStatus' || change.field === 'status') {
          return task.status === change.oldValue;
        }
        return false;
      });

      if (taskChange) {
        // 应用状态变化
        return {
          ...task,
          status: taskChange.newValue,
          poNumber: taskChange.field === 'status' && taskChange.newValue === 'po_placed'
            ? `PO-${Date.now().toString().slice(-8)}`
            : task.poNumber,
        };
      }

      return task;
    });

    setSimulatedTasks(updatedTasks);
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
            <Network className="w-5 h-5 text-indigo-600" />
            智能计划协同（Planning Collaboration）
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            基于齐套模式的甘特图，实时跟踪物料交付和风险警告
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleOpenSimulation}
            className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium flex items-center gap-2"
          >
            <Play className="w-4 h-4" />
            模拟演示
          </button>
        </div>
      </div>

      {/* Product Selector */}
      <div className="bg-white border border-slate-200 rounded-lg p-4">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-slate-700">选择生产计划:</label>
          <select
            className="flex-1 max-w-md px-3 py-2 border border-slate-300 rounded-lg text-sm"
            value={selectedPlan}
            onChange={(e) => {
              setSelectedPlan(e.target.value);
              setShowGantt(false);
            }}
          >
            <option value="">请选择生产计划</option>
            {availablePlans.map(plan => (
              <option key={plan.id} value={plan.planCode}>
                {plan.planCode} - {plan.productName} ({plan.plannedQuantity} PCS)
              </option>
            ))}
          </select>
          <button
            onClick={handleGenerateGantt}
            disabled={!selectedPlan}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium disabled:bg-slate-300 disabled:cursor-not-allowed"
          >
            生成甘特图
          </button>
        </div>
      </div>

      {/* Gantt Chart */}
      {showGantt && ganttTasks.length > 0 ? (
        <GanttChart
          tasks={ganttTasks}
          startDate={new Date('2026-01-15')}
          endDate={new Date('2026-03-01')}
          productionEndDate={new Date('2026-02-28')}
          highlightedTaskId={highlightedMaterial}
          onMaterialSelect={handleMaterialClick}
        />
      ) : (
        <div className="bg-white border border-slate-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-slate-800">齐套模式甘特图</h3>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">计划模式:</span>
              <select className="px-2 py-1 border border-slate-300 rounded text-xs">
                <option>齐套模式(倒排)</option>
                <option>正排模式</option>
              </select>
            </div>
          </div>

          <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-lg">
            <Network className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-500 text-lg font-medium">甘特图视图</p>
            <p className="text-sm text-slate-400 mt-2">
              请选择生产计划并点击"生成甘特图"按钮查看物料齐套进度
            </p>
          </div>
        </div>
      )}

      {/* Risk Alerts Panel */}
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-orange-500" />
            风险警告与协同建议
            <span className="text-sm font-normal text-slate-500">
              (共{allRisks.length}项风险)
            </span>
          </h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedFilter('all')}
              className={`px-3 py-1 text-xs border rounded ${selectedFilter === 'all'
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'border-slate-300 hover:bg-slate-50'
                }`}
            >
              全部
            </button>
            <button
              onClick={() => setSelectedFilter('advance_notice')}
              className={`px-3 py-1 text-xs border rounded ${selectedFilter === 'advance_notice'
                ? 'bg-yellow-600 text-white border-yellow-600'
                : 'border-slate-300 hover:bg-slate-50'
                }`}
            >
              提前告示 ({riskCounts.advance_notice})
            </button>
            <button
              onClick={() => setSelectedFilter('abnormal')}
              className={`px-3 py-1 text-xs border rounded ${selectedFilter === 'abnormal'
                ? 'bg-orange-600 text-white border-orange-600'
                : 'border-slate-300 hover:bg-slate-50'
                }`}
            >
              异常告警 ({riskCounts.abnormal})
            </button>
            <button
              onClick={() => setSelectedFilter('severe')}
              className={`px-3 py-1 text-xs border rounded ${selectedFilter === 'severe'
                ? 'bg-red-600 text-white border-red-600'
                : 'border-slate-300 hover:bg-slate-50'
                }`}
            >
              严重风险 ({riskCounts.severe})
            </button>
          </div>
        </div>

        {/* Risk List */}
        <div className="space-y-3">
          {filteredRisks.map((risk) => {
            const isExpanded = expandedRisks.has(risk.id);
            const levelIcon = risk.level === 'severe' ? '🔴' : risk.level === 'abnormal' ? '🟠' : '🟡';
            const levelColor = risk.level === 'severe' ? 'text-red-700' : risk.level === 'abnormal' ? 'text-orange-700' : 'text-yellow-700';

            const isHighlighted = highlightedRisk === risk.id;

            return (
              <div
                key={risk.id}
                id={`risk-${risk.id}`}
                className={`border rounded-lg p-4 transition-all duration-300 ${
                  isHighlighted
                    ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-300'
                    : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{levelIcon}</span>
                      <span className={`text-sm font-semibold ${levelColor}`}>
                        [{risk.category === 'material' ? '物料' : risk.category === 'component' ? '组件' : risk.category === 'outsource' ? '委外' : '产品'}]
                      </span>
                      <span className="text-sm font-medium text-slate-800">
                        {risk.itemCode} {risk.itemName}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 mb-2">{risk.description}</p>
                    {risk.impact && (
                      <p className="text-sm text-orange-600 mb-2">
                        ⚠ 影响: {risk.impact}
                      </p>
                    )}
                    {isExpanded && (
                      <div className="mt-3 space-y-2">
                        {risk.suggestions.length > 0 && (
                          <div className="bg-blue-50 border border-blue-200 rounded p-3">
                            <p className="text-sm font-medium text-blue-800 mb-1">💡 协同建议:</p>
                            <ul className="text-sm text-blue-700 space-y-1">
                              {risk.suggestions.map((suggestion, idx) => (
                                <li key={idx}>• {suggestion}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        <div className="flex items-center gap-4 text-xs text-slate-500">
                          {risk.prCode && <span>PR: {risk.prCode}</span>}
                          {risk.poCode && <span>PO: {risk.poCode}</span>}
                          {risk.supplierName && <span>供应商: {risk.supplierName}</span>}
                          {risk.assignee && <span>采购员: {risk.assignee}</span>}
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => toggleRiskExpand(risk.id)}
                    className="ml-4 p-1 hover:bg-slate-100 rounded"
                  >
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>
                {risk.actions.length > 0 && (
                  <div className="mt-3 flex items-center gap-2">
                    {risk.actions.map((action, idx) => (
                      <button
                        key={idx}
                        onClick={() => {
                          if (action.type === 'locate_gantt') {
                            handleLocateInGantt(risk.itemCode);
                          }
                        }}
                        className="px-3 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50 hover:border-indigo-400 hover:text-indigo-600 transition-colors"
                      >
                        {action.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Simulation Panel */}
      <SimulationPanel
        isOpen={showSimulation}
        onClose={handleCloseSimulation}
        simulationType={simulationType}
        onSimulationStart={handleSimulationStart}
        onStepChange={handleSimulationStepChange}
      />
    </div>
  );
};

export default SmartCollaborationPanel;
