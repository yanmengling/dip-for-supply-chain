/**
 * Planning View V2 - 主视图（优化版）
 *
 * 结构：左侧 56px 窄边栏 + 右侧三视图
 * - 视图1: 监测任务列表（默认首页）
 * - 视图2: 新建任务（四步引导流程）
 * - 视图3: 任务详情（概览 + 甘特图 + 缺料清单）
 */

import { useState, useCallback, useMemo } from 'react';
import type { PlanningViewMode, NewTaskStep, Step1Data, Step2Data, PlanningTask } from '../../types/planningV2';
import { taskService } from '../../services/taskService';
import PlanningTaskSidebar from '../planningV2/PlanningTaskSidebar';
import TaskListView from '../planningV2/TaskListView';
import TaskDetailView from '../planningV2/TaskDetailView';
import PlanningTimelineV2 from '../planningV2/PlanningTimelineV2';
import ProductDemandPanel from '../planningV2/ProductDemandPanel';
import MasterProductionPanel from '../planningV2/MasterProductionPanel';
import MaterialRequirementPanel from '../planningV2/MaterialRequirementPanel';
import SmartCollaborationPanel from '../planningV2/SmartCollaborationPanel';
import ConfirmDialog from '../planningV2/ConfirmDialog';
import { ArrowLeft } from 'lucide-react';

const PlanningViewV2 = () => {
  // 视图路由
  const [viewMode, setViewMode] = useState<PlanningViewMode>('task-list');
  const [currentTaskId, setCurrentTaskId] = useState<string>();

  // 新建任务流程状态
  const [currentStep, setCurrentStep] = useState<NewTaskStep>(1);
  const [completedSteps, setCompletedSteps] = useState<Set<NewTaskStep>>(new Set());
  const [step1Data, setStep1Data] = useState<Step1Data>();
  const [step2Data, setStep2Data] = useState<Step2Data>();

  // 任务数据版本号（触发重新获取）
  const [taskVersion, setTaskVersion] = useState(0);

  // 确认对话框状态
  type DialogState =
    | { type: 'none' }
    | { type: 'end-task'; taskId: string }
    | { type: 'delete-task'; taskId: string; taskName: string }
    | { type: 'reset-step1' }
    | { type: 'reset-step2' };
  const [dialog, setDialog] = useState<DialogState>({ type: 'none' });

  // 获取任务列表
  const tasks = useMemo(() => taskService.getTasks(), [taskVersion]);
  const recentTasks = useMemo(() => tasks.slice(0, 3), [tasks]);

  // ======================== 视图切换 ========================

  const goToTaskList = useCallback(() => {
    setViewMode('task-list');
    setCurrentTaskId(undefined);
    // 重置新建流程
    setCurrentStep(1);
    setCompletedSteps(new Set());
    setStep1Data(undefined);
    setStep2Data(undefined);
  }, []);

  const goToNewTask = useCallback(() => {
    setViewMode('new-task');
    setCurrentStep(1);
    setCompletedSteps(new Set());
    setStep1Data(undefined);
    setStep2Data(undefined);
  }, []);

  const goToTaskDetail = useCallback((taskId: string) => {
    setViewMode('task-detail');
    setCurrentTaskId(taskId);
  }, []);

  // ======================== 任务操作 ========================

  const handleEndTask = useCallback((taskId: string) => {
    setDialog({ type: 'end-task', taskId });
  }, []);

  const handleDeleteTask = useCallback((taskId: string) => {
    const task = taskService.getTaskById(taskId);
    if (task) {
      setDialog({ type: 'delete-task', taskId, taskName: task.name });
    }
  }, []);

  const handleDialogConfirm = useCallback(() => {
    if (dialog.type === 'end-task') {
      taskService.endTask(dialog.taskId);
      setTaskVersion(v => v + 1);
    } else if (dialog.type === 'delete-task') {
      taskService.deleteTask(dialog.taskId);
      setTaskVersion(v => v + 1);
      if (currentTaskId === dialog.taskId) goToTaskList();
    } else if (dialog.type === 'reset-step1') {
      setStep2Data(undefined);
      setCompletedSteps(new Set());
      setCurrentStep(1);
    } else if (dialog.type === 'reset-step2') {
      setCompletedSteps(prev => {
        const next = new Set(prev);
        next.delete(2); next.delete(3); next.delete(4);
        return next;
      });
      setCurrentStep(2);
    }
    setDialog({ type: 'none' });
  }, [dialog, currentTaskId, goToTaskList]);

  // ======================== 步骤流程 ========================

  const handleStep1Confirm = useCallback((data: Step1Data) => {
    setStep1Data(data);
    const next = new Set(completedSteps);
    next.add(1);
    setCompletedSteps(next);
    setCurrentStep(2);
  }, [completedSteps]);

  const handleStep2Confirm = useCallback((data: Step2Data) => {
    setStep2Data(data);
    const next = new Set(completedSteps);
    next.add(2);
    setCompletedSteps(next);
    setCurrentStep(3);
  }, [completedSteps]);

  const handleStep3Confirm = useCallback(() => {
    const next = new Set(completedSteps);
    next.add(3);
    setCompletedSteps(next);
    setCurrentStep(4);
  }, [completedSteps]);

  const handleCreateTask = useCallback((taskName: string) => {
    if (!step1Data || !step2Data) return;
    const task = taskService.createTask({
      name: taskName,
      productCode: step1Data.productCode,
      productName: step1Data.productName,
      demandStart: step1Data.demandStart,
      demandEnd: step1Data.demandEnd,
      demandQuantity: step1Data.demandQuantity,
      productionStart: step2Data.productionStart,
      productionEnd: step2Data.productionEnd,
      productionQuantity: step2Data.productionQuantity,
    });
    setTaskVersion(v => v + 1);
    goToTaskDetail(task.id);
  }, [step1Data, step2Data, goToTaskDetail]);

  const handleStepClick = useCallback((step: NewTaskStep) => {
    if (step < currentStep) {
      if (step === 1 && currentStep > 1) {
        setDialog({ type: 'reset-step1' });
        return;
      } else if (step === 2 && currentStep > 2) {
        setDialog({ type: 'reset-step2' });
        return;
      }
    }
    setCurrentStep(step);
  }, [currentStep]);

  const handleStepBack = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep((currentStep - 1) as NewTaskStep);
    }
  }, [currentStep]);

  // ======================== 当前任务详情 ========================

  const currentTask = useMemo<PlanningTask | undefined>(() => {
    if (viewMode === 'task-detail' && currentTaskId) {
      return taskService.getTaskById(currentTaskId);
    }
    return undefined;
  }, [viewMode, currentTaskId, taskVersion]);

  // ======================== Render ========================

  return (
    <div className="flex min-h-full bg-slate-50">
      {/* 左侧窄边栏 */}
      <PlanningTaskSidebar
        currentView={viewMode}
        currentTaskId={currentTaskId}
        recentTasks={recentTasks}
        onViewChange={setViewMode}
        onTaskSelect={goToTaskDetail}
        onNewTask={goToNewTask}
      />

      {/* 右侧内容区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 视图1: 任务列表 */}
        {viewMode === 'task-list' && (
          <TaskListView
            tasks={tasks}
            shortageCountMap={{}}
            onViewDetail={goToTaskDetail}
            onEndTask={handleEndTask}
            onDeleteTask={handleDeleteTask}
            onNewTask={goToNewTask}
          />
        )}

        {/* 视图2: 新建任务流程 */}
        {viewMode === 'new-task' && (
          <div>
            {/* 顶部导航（sticky 固定在视口顶部） */}
            <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3">
              <div className="flex items-center gap-3 mb-3">
                <button
                  onClick={goToTaskList}
                  className="p-1 hover:bg-slate-100 rounded-lg"
                  title="返回任务列表"
                >
                  <ArrowLeft size={18} className="text-slate-500" />
                </button>
                <h2 className="text-base font-semibold text-slate-800">新建计划协同任务</h2>
              </div>
              <PlanningTimelineV2
                currentStep={currentStep}
                completedSteps={completedSteps}
                onStepClick={handleStepClick}
              />
            </div>

            {/* 步骤内容区 */}
            <div className="p-6">
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                <ProductDemandPanel
                  active={currentStep === 1}
                  onConfirm={handleStep1Confirm}
                  initialData={step1Data}
                />
                {step1Data && (
                  <MasterProductionPanel
                    active={currentStep === 2}
                    step1Data={step1Data}
                    onConfirm={handleStep2Confirm}
                    onBack={handleStepBack}
                    initialData={step2Data}
                  />
                )}
                {step1Data && (
                  <MaterialRequirementPanel
                    active={currentStep === 3}
                    step1Data={step1Data}
                    onConfirm={handleStep3Confirm}
                    onBack={handleStepBack}
                  />
                )}
                {step1Data && step2Data && (
                  <SmartCollaborationPanel
                    active={currentStep === 4}
                    step1Data={step1Data}
                    step2Data={step2Data}
                    onCreateTask={handleCreateTask}
                    onBack={handleStepBack}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* 视图3: 任务详情 */}
        {viewMode === 'task-detail' && currentTask && (
          <TaskDetailView
            task={currentTask}
            onBack={goToTaskList}
            onEndTask={(id) => {
              handleEndTask(id);
              setTaskVersion(v => v + 1);
            }}
          />
        )}

        {/* 任务不存在时的回退 */}
        {viewMode === 'task-detail' && !currentTask && (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="text-center">
              <p className="text-slate-500 mb-2">任务不存在或已被删除</p>
              <button onClick={goToTaskList} className="text-indigo-600 hover:underline text-sm">
                返回任务列表
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 确认对话框 */}
      <ConfirmDialog
        open={dialog.type === 'end-task'}
        title="结束计划协同任务"
        description="确认结束该计划协同任务？结束后任务将变为只读，无法继续监测。"
        confirmLabel="结束任务"
        variant="warning"
        onConfirm={handleDialogConfirm}
        onCancel={() => setDialog({ type: 'none' })}
      />
      <ConfirmDialog
        open={dialog.type === 'delete-task'}
        title="删除计划协同任务"
        description={dialog.type === 'delete-task' ? `确认删除任务「${dialog.taskName}」？删除后不可恢复。` : ''}
        confirmLabel="删除"
        variant="danger"
        onConfirm={handleDialogConfirm}
        onCancel={() => setDialog({ type: 'none' })}
      />
      <ConfirmDialog
        open={dialog.type === 'reset-step1'}
        title="重置后续步骤"
        description="修改产品需求计划将重置后续所有步骤，是否继续？"
        confirmLabel="继续"
        variant="warning"
        onConfirm={handleDialogConfirm}
        onCancel={() => setDialog({ type: 'none' })}
      />
      <ConfirmDialog
        open={dialog.type === 'reset-step2'}
        title="重置后续步骤"
        description="修改生产计划将重置后续步骤，是否继续？"
        confirmLabel="继续"
        variant="warning"
        onConfirm={handleDialogConfirm}
        onCancel={() => setDialog({ type: 'none' })}
      />
    </div>
  );
};

export default PlanningViewV2;
