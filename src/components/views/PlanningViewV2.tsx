/**
 * Planning View V2 - 主视图
 *
 * PRD v3.1: 三步流程（需求预测 → 物料需求 → 计划协同）
 *
 * 结构：左侧 56px 窄边栏 + 右侧三视图
 * - 视图1: 监测任务列表（默认首页）
 * - 视图2: 新建任务（三步引导流程）
 * - 视图3: 任务详情（概览 + 甘特图 + 缺料清单）
 */

import { useState, useCallback, useMemo } from 'react';
import type { PlanningViewMode, NewTaskStep, Step1Data, PlanningTask } from '../../types/planningV2';
import { taskService } from '../../services/taskService';
import { pushFormDataToDIP } from '../../services/monitoringTaskApiService';
import PlanningTaskSidebar from '../planningV2/PlanningTaskSidebar';
import TaskListView from '../planningV2/TaskListView';
import TaskDetailView from '../planningV2/TaskDetailView';
import PlanningTimelineV2 from '../planningV2/PlanningTimelineV2';
import ProductDemandPanel from '../planningV2/ProductDemandPanel';
import MaterialRequirementPanel from '../planningV2/MaterialRequirementPanel';
import SmartCollaborationPanel from '../planningV2/SmartCollaborationPanel';
import DataLineagePanel from '../planningV2/DataLineagePanel';
import ConfirmDialog from '../planningV2/ConfirmDialog';
import { ArrowLeft } from 'lucide-react';

const PlanningViewV2 = () => {
  // 视图路由
  const [viewMode, setViewMode] = useState<PlanningViewMode>('task-list');
  const [currentTaskId, setCurrentTaskId] = useState<string>();

  // 新建任务流程状态（PRD v3.1: 三步流程）
  const [currentStep, setCurrentStep] = useState<NewTaskStep>(1);
  const [completedSteps, setCompletedSteps] = useState<Set<NewTaskStep>>(new Set());
  const [step1Data, setStep1Data] = useState<Step1Data>();

  // 任务数据版本号（触发重新获取）
  const [taskVersion, setTaskVersion] = useState(0);

  // 确认对话框状态
  type DialogState =
    | { type: 'none' }
    | { type: 'delete-task'; taskId: string; taskName: string }
    | { type: 'reset-step1' };
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
  }, []);

  const goToNewTask = useCallback(() => {
    setViewMode('new-task');
    setCurrentStep(1);
    setCompletedSteps(new Set());
    setStep1Data(undefined);
  }, []);

  const goToTaskDetail = useCallback((taskId: string) => {
    setViewMode('task-detail');
    setCurrentTaskId(taskId);
  }, []);

  // ======================== 任务操作 ========================

  const handleEndTask = useCallback((taskId: string) => {
    goToTaskDetail(taskId);
  }, [goToTaskDetail]);

  const handleDeleteTask = useCallback((taskId: string) => {
    const task = taskService.getTaskById(taskId);
    if (task) {
      setDialog({ type: 'delete-task', taskId, taskName: task.name });
    }
  }, []);

  const handleDialogConfirm = useCallback(() => {
    if (dialog.type === 'delete-task') {
      taskService.deleteTask(dialog.taskId);
      setTaskVersion(v => v + 1);
      if (currentTaskId === dialog.taskId) goToTaskList();
    } else if (dialog.type === 'reset-step1') {
      // 修改步骤1 → 重置步骤2和3（PRD 4.6）
      setCompletedSteps(new Set());
      setCurrentStep(1);
    }
    setDialog({ type: 'none' });
  }, [dialog, currentTaskId, goToTaskList]);

  // ======================== 三步流程 ========================

  /** 步骤1确认 → 进入步骤2 */
  const handleStep1Confirm = useCallback((data: Step1Data) => {
    setStep1Data(data);
    const next = new Set(completedSteps);
    next.add(1);
    setCompletedSteps(next);
    setCurrentStep(2);
  }, [completedSteps]);

  /** 步骤2确认 → 进入步骤3 */
  const handleStep2Confirm = useCallback(() => {
    const next = new Set(completedSteps);
    next.add(2);
    setCompletedSteps(next);
    setCurrentStep(3);
  }, [completedSteps]);

  /** 步骤3创建任务 */
  const handleCreateTask = useCallback((taskName: string) => {
    if (!step1Data) return;

    // 1. 保存到 localStorage
    const task = taskService.createTask({
      name: taskName,
      productCode: step1Data.productCode,
      productName: step1Data.productName,
      demandStart: step1Data.demandStart,
      demandEnd: step1Data.demandEnd,
      demandQuantity: step1Data.demandQuantity,
      relatedForecastBillnos: step1Data.relatedForecastBillnos,
    });

    // 2. 推送到 DIP 接口（fire-and-forget）
    void pushFormDataToDIP({
      task_name: taskName,
      product_code: step1Data.productCode,
      product_name: step1Data.productName,
      demand_start: step1Data.demandStart,
      demand_end: step1Data.demandEnd,
      demand_quantity: step1Data.demandQuantity,
      production_start: step1Data.demandStart,   // 兼容 DIP 字段
      production_end: step1Data.demandEnd,
      production_quantity: step1Data.demandQuantity,
    });

    setTaskVersion(v => v + 1);
    goToTaskDetail(task.id);
  }, [step1Data, goToTaskDetail]);

  const handleStepClick = useCallback((step: NewTaskStep) => {
    if (step < currentStep) {
      if (step === 1 && currentStep > 1) {
        setDialog({ type: 'reset-step1' });
        return;
      }
    }
    if (step <= currentStep || completedSteps.has(step)) {
      setCurrentStep(step);
    }
  }, [currentStep, completedSteps]);

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
            onTaskImported={() => setTaskVersion(v => v + 1)}
          />
        )}

        {/* 视图2: 新建任务流程（三步） */}
        {viewMode === 'new-task' && (
          <div>
            {/* 顶部导航 */}
            <div className="bg-white border-b border-slate-200 px-6 py-3">
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
                {/* 步骤1: 需求预测 */}
                <ProductDemandPanel
                  active={currentStep === 1}
                  onConfirm={handleStep1Confirm}
                  initialData={step1Data}
                />
                {/* 步骤2: 物料需求 */}
                {step1Data && (
                  <MaterialRequirementPanel
                    active={currentStep === 2}
                    step1Data={step1Data}
                    onConfirm={handleStep2Confirm}
                    onBack={handleStepBack}
                  />
                )}
                {/* 步骤3: 计划协同 */}
                {step1Data && (
                  <SmartCollaborationPanel
                    active={currentStep === 3}
                    step1Data={step1Data}
                    onCreateTask={handleCreateTask}
                    onBack={handleStepBack}
                  />
                )}
                {/* 数据溯源信息板 */}
                <DataLineagePanel
                  step={currentStep}
                  productCode={step1Data?.productCode}
                />
              </div>
            </div>
          </div>
        )}

        {/* 视图3: 任务详情 */}
        {viewMode === 'task-detail' && currentTask && (
          <TaskDetailView
            task={currentTask}
            onBack={goToTaskList}
            onTaskUpdated={() => setTaskVersion(v => v + 1)}
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
        description="修改需求预测将重置后续所有步骤，是否继续？"
        confirmLabel="继续"
        variant="warning"
        onConfirm={handleDialogConfirm}
        onCancel={() => setDialog({ type: 'none' })}
      />
    </div>
  );
};

export default PlanningViewV2;
