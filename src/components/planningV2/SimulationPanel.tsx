/**
 * 模拟演示面板 - Simulation Demo Panel
 *
 * 提供正常变化和异常变化的模拟控制和步骤展示
 */

import { useState, useEffect } from 'react';
import { Play, Pause, RotateCcw, SkipForward, SkipBack, X } from 'lucide-react';
import { planningSimulationService, type SimulationStep } from '../../services/planningSimulationV2';

interface SimulationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  simulationType: 'normal' | 'abnormal' | null;
  onSimulationStart: (type: 'normal' | 'abnormal') => void;
  onStepChange?: (step: SimulationStep | null) => void;
}

const SimulationPanel = ({ isOpen, onClose, simulationType, onSimulationStart, onStepChange }: SimulationPanelProps) => {
  const [currentStep, setCurrentStep] = useState<SimulationStep | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [logs, setLogs] = useState<string[]>([]);

  useEffect(() => {
    if (simulationType) {
      planningSimulationService.start(simulationType);
      updateState();
      addLog(`开始${simulationType === 'normal' ? '正常变化' : '异常变化'}模拟`);
    }
  }, [simulationType]);

  useEffect(() => {
    if (!isPlaying) return;

    const step = planningSimulationService.getCurrentStep();
    if (!step) return;

    const timer = setTimeout(() => {
      const hasNext = planningSimulationService.next();
      if (hasNext) {
        updateState();
        const nextStep = planningSimulationService.getCurrentStep();
        if (nextStep) {
          addLog(`步骤 ${nextStep.stepNumber}: ${nextStep.title}`);
        }
      } else {
        setIsPlaying(false);
        addLog('模拟完成');
      }
    }, step.duration);

    return () => clearTimeout(timer);
  }, [isPlaying, currentStep]);

  const updateState = () => {
    const step = planningSimulationService.getCurrentStep();
    setCurrentStep(step);
    setProgress(planningSimulationService.getProgress());

    // 通知父组件步骤变化
    if (onStepChange) {
      onStepChange(step);
    }
  };

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    setLogs(prev => [...prev, `[${timestamp}] ${message}`]);
  };

  const handlePlay = () => {
    if (planningSimulationService.isLastStep()) {
      handleReset();
      return;
    }
    setIsPlaying(true);
    planningSimulationService.resume();
    addLog('继续播放');
  };

  const handlePause = () => {
    setIsPlaying(false);
    planningSimulationService.pause();
    addLog('暂停播放');
  };

  const handleNext = () => {
    setIsPlaying(false);
    planningSimulationService.pause();
    const hasNext = planningSimulationService.next();
    if (hasNext) {
      updateState();
      const step = planningSimulationService.getCurrentStep();
      if (step) {
        addLog(`步骤 ${step.stepNumber}: ${step.title}`);
      }
    }
  };

  const handlePrevious = () => {
    setIsPlaying(false);
    planningSimulationService.pause();
    const hasPrev = planningSimulationService.previous();
    if (hasPrev) {
      updateState();
      const step = planningSimulationService.getCurrentStep();
      if (step) {
        addLog(`返回步骤 ${step.stepNumber}: ${step.title}`);
      }
    }
  };

  const handleReset = () => {
    setIsPlaying(false);
    planningSimulationService.reset();
    setCurrentStep(null);
    setProgress(0);
    setLogs([]);
    addLog('模拟已重置');
  };

  const handleClose = () => {
    setIsPlaying(false);
    planningSimulationService.reset();
    setCurrentStep(null);
    setProgress(0);
    setLogs([]);
    onClose();
  };

  const handleSelectSimulation = (type: 'normal' | 'abnormal') => {
    setIsPlaying(false);
    planningSimulationService.reset();
    setLogs([]);
    onSimulationStart(type);
  };

  if (!isOpen) return null;

  const totalSteps = planningSimulationService.getTotalSteps();
  const currentStepIndex = planningSimulationService.getCurrentStepIndex();

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-xl font-semibold text-slate-800">模拟演示</h2>
            <p className="text-sm text-slate-500 mt-1">
              {simulationType === 'normal' && '正常变化流程演示 (7步)'}
              {simulationType === 'abnormal' && '异常变化响应演示 (5步)'}
              {!simulationType && '请选择模拟场景'}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {/* Simulation Type Selector */}
        {!simulationType && (
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="grid grid-cols-2 gap-6 w-full max-w-2xl">
              <button
                onClick={() => handleSelectSimulation('normal')}
                className="p-8 border-2 border-slate-300 rounded-xl hover:border-indigo-500 hover:bg-indigo-50 transition-all group"
              >
                <div className="text-5xl mb-4">✅</div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2 group-hover:text-indigo-600">
                  正常变化流程
                </h3>
                <p className="text-sm text-slate-600">
                  演示从计划生成到物料到货的完整流程 (7个步骤)
                </p>
              </button>
              <button
                onClick={() => handleSelectSimulation('abnormal')}
                className="p-8 border-2 border-slate-300 rounded-xl hover:border-orange-500 hover:bg-orange-50 transition-all group"
              >
                <div className="text-5xl mb-4">⚠️</div>
                <h3 className="text-lg font-semibold text-slate-800 mb-2 group-hover:text-orange-600">
                  异常变化响应
                </h3>
                <p className="text-sm text-slate-600">
                  演示交期延误的检测、分析和协同响应 (5个步骤)
                </p>
              </button>
            </div>
          </div>
        )}

        {/* Simulation Content */}
        {simulationType && (
          <>
            {/* Progress Bar */}
            <div className="px-6 py-4 border-b border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-slate-700">
                  步骤 {currentStepIndex + 1} / {totalSteps}
                </span>
                <span className="text-sm font-medium text-indigo-600">
                  {Math.round(progress)}%
                </span>
              </div>
              <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Current Step Display */}
            <div className="flex-1 overflow-y-auto">
              <div className="p-6 space-y-4">
                {currentStep && (
                  <div className={`border-2 rounded-lg p-6 ${
                    currentStep.type === 'normal'
                      ? 'border-indigo-200 bg-indigo-50'
                      : 'border-orange-200 bg-orange-50'
                  }`}>
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white ${
                        currentStep.type === 'normal' ? 'bg-indigo-600' : 'bg-orange-600'
                      }`}>
                        {currentStep.stepNumber}
                      </div>
                      <div className="flex-1">
                        <h3 className={`text-lg font-semibold mb-2 ${
                          currentStep.type === 'normal' ? 'text-indigo-900' : 'text-orange-900'
                        }`}>
                          {currentStep.title}
                        </h3>
                        <p className={`text-sm mb-4 ${
                          currentStep.type === 'normal' ? 'text-indigo-700' : 'text-orange-700'
                        }`}>
                          {currentStep.description}
                        </p>

                        {/* Changes Display */}
                        {currentStep.changes && currentStep.changes.length > 0 && (
                          <div className="bg-white border border-slate-200 rounded-lg p-4 mb-3">
                            <h4 className="text-sm font-semibold text-slate-800 mb-2">📝 数据变化:</h4>
                            <ul className="space-y-2">
                              {currentStep.changes.map((change, idx) => (
                                <li key={idx} className="text-sm">
                                  <span className="font-medium text-slate-700">{change.field}:</span>{' '}
                                  <span className="text-slate-500 line-through">{String(change.oldValue)}</span>
                                  {' → '}
                                  <span className="text-green-600 font-medium">{String(change.newValue)}</span>
                                  <div className="text-xs text-slate-500 mt-1">理由: {change.reason}</div>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {/* New Risks Display */}
                        {currentStep.newRisks && currentStep.newRisks.length > 0 && (
                          <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-4">
                            <h4 className="text-sm font-semibold text-yellow-900 mb-2">⚠️ 新增风险告警:</h4>
                            {currentStep.newRisks.map((risk, idx) => (
                              <div key={idx} className="text-sm text-yellow-800">
                                {risk.description && <p className="mb-2">{risk.description}</p>}
                                {risk.suggestions && risk.suggestions.length > 0 && (
                                  <div>
                                    <p className="font-medium mb-1">💡 协同建议:</p>
                                    <ul className="list-disc list-inside space-y-1 ml-2">
                                      {risk.suggestions.map((suggestion, sidx) => (
                                        <li key={sidx}>{suggestion}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Simulation Log */}
                <div className="bg-slate-900 rounded-lg p-4 max-h-48 overflow-y-auto">
                  <h4 className="text-sm font-semibold text-slate-300 mb-2">📋 模拟日志:</h4>
                  <div className="space-y-1 font-mono text-xs">
                    {logs.map((log, idx) => (
                      <div key={idx} className="text-green-400">
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Control Panel */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50">
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={handlePrevious}
                  disabled={planningSimulationService.isFirstStep()}
                  className="p-2 border border-slate-300 rounded-lg hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="上一步"
                >
                  <SkipBack className="w-5 h-5 text-slate-700" />
                </button>
                {!isPlaying ? (
                  <button
                    onClick={handlePlay}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
                  >
                    <Play className="w-5 h-5" />
                    {planningSimulationService.isLastStep() ? '重新播放' : '播放'}
                  </button>
                ) : (
                  <button
                    onClick={handlePause}
                    className="px-6 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors flex items-center gap-2"
                  >
                    <Pause className="w-5 h-5" />
                    暂停
                  </button>
                )}
                <button
                  onClick={handleNext}
                  disabled={planningSimulationService.isLastStep()}
                  className="p-2 border border-slate-300 rounded-lg hover:bg-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  title="下一步"
                >
                  <SkipForward className="w-5 h-5 text-slate-700" />
                </button>
                <button
                  onClick={handleReset}
                  className="p-2 border border-slate-300 rounded-lg hover:bg-white transition-colors ml-4"
                  title="重置"
                >
                  <RotateCcw className="w-5 h-5 text-slate-700" />
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default SimulationPanel;
