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

import { useState, useCallback, useEffect, useMemo } from 'react';
import type {
  PlanningViewMode,
  PlanningPrimaryWorkArea,
  NewTaskStep,
  Step1Data,
  PlanningTask,
} from '../../types/planningV2';
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
import { LargeForecastBrowsePanel } from '../planningV2/LargeForecastBrowsePanel';
import { MultiProductTaskDetailView } from '../planningV2/multiProduct/MultiProductTaskDetailView';
import { multiProductTaskService } from '../../services/multiProductTaskService';
import { listRemoteMonitoringTasks } from '../../services/remoteMonitoringTaskService';
import type { MultiProductTask } from '../../types/multiProductTask';
import DemandFulfillmentSection from '../planningV2/demandFulfillment/DemandFulfillmentSection';
import { ArrowLeft } from 'lucide-react';

const PlanningViewV2 = () => {
  /** 与「需求承接分析」并列的顶层工作区 */
  const [primaryWorkArea, setPrimaryWorkArea] = useState<PlanningPrimaryWorkArea>('demand-fulfillment');

  // 视图路由
  const [viewMode, setViewMode] = useState<PlanningViewMode>('task-list');
  const [currentTaskId, setCurrentTaskId] = useState<string>();

  // 新建任务流程状态（PRD v3.1: 三步流程）
  const [currentStep, setCurrentStep] = useState<NewTaskStep>(1);
  const [completedSteps, setCompletedSteps] = useState<Set<NewTaskStep>>(new Set());
  const [step1Data, setStep1Data] = useState<Step1Data>();
  /** v4.3: 步骤②MRP记录数（null=未加载完, 0=无记录置灰, >0=正常） */
  const [mrpCount, setMrpCount] = useState<number | null>(null);

  const [currentMultiProductTask, setCurrentMultiProductTask] = useState<MultiProductTask | undefined>(undefined);
  const [step1ReadOnly, setStep1ReadOnly] = useState(false);

  // 任务数据版本号（触发重新获取）
  const [taskVersion, setTaskVersion] = useState(0);
  const [tasks, setTasks] = useState<PlanningTask[]>([]);

  // 确认对话框状态
  type DialogState =
    | { type: 'none' }
    | { type: 'reset-step1' };
  const [dialog, setDialog] = useState<DialogState>({ type: 'none' });

  useEffect(() => {
    let cancelled = false;
    void listRemoteMonitoringTasks()
      .then((remoteTasks) => {
        if (!cancelled) setTasks(remoteTasks);
      })
      .catch((error) => {
        console.error('[PlanningViewV2] 加载监测任务失败:', error);
        if (!cancelled) setTasks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [taskVersion]);

  // 最近访问的任务列表（合并单产品 + 多产品，按访问顺序排列）
  const recentTasks = useMemo(() => {
    const recentRaw = localStorage.getItem('planning_v2_recently_accessed');
    const recentIds = recentRaw ? JSON.parse(recentRaw) as string[] : [];
    if (recentIds.length === 0) return tasks.slice(0, 3);

    const singleMap = new Map(tasks.map(t => [t.id, t]));
    const multiMap = new Map(multiProductTaskService.getTasks().map(t => [t.id, t]));

    const result: (typeof tasks[number] | MultiProductTask)[] = [];
    for (const id of recentIds) {
      const task = singleMap.get(id) ?? multiMap.get(id);
      if (task) {
        result.push(task);
        if (result.length >= 3) break;
      }
    }

    if (result.length < 3) {
      const seen = new Set(result.map(t => t.id));
      for (const task of tasks) {
        if (!seen.has(task.id)) {
          result.push(task);
          if (result.length >= 3) break;
        }
      }
    }

    return result;
  }, [tasks, taskVersion]);

  // ======================== 视图切换 ========================

  const goToTaskList = useCallback(() => {
    setPrimaryWorkArea('completeness-monitoring');
    setViewMode('task-list');
    setCurrentTaskId(undefined);
    // 重置新建流程
    setCurrentStep(1);
    setCompletedSteps(new Set());
    setStep1Data(undefined);
  }, []);

  const goToNewTask = useCallback((productCode?: string) => {
    setPrimaryWorkArea('completeness-monitoring');
    setViewMode('new-task');
    setCurrentTaskId(undefined);
    setCurrentStep(1);
    setCompletedSteps(new Set());
    setStep1Data(productCode ? {
      productCode,
      productName: '',
      demandStart: '',
      demandEnd: '',
      demandQuantity: 0,
      relatedForecastBillnos: [],
    } : undefined);
    setMrpCount(null);
    setStep1ReadOnly(false);
  }, []);

  const goToTaskDetail = useCallback((taskId: string) => {
    const recentRaw = localStorage.getItem('planning_v2_recently_accessed');
    const recent = recentRaw ? JSON.parse(recentRaw) as string[] : [];
    const next = recent.filter(rid => rid !== taskId);
    next.unshift(taskId);
    localStorage.setItem('planning_v2_recently_accessed', JSON.stringify(next.slice(0, 20)));
    setPrimaryWorkArea('completeness-monitoring');
    setCurrentTaskId(taskId);
    setViewMode('task-detail');
  }, []);

  const findMonitoringTaskByProduct = useCallback((productCode: string) => {
    return tasks.find(task => task.productCode === productCode);
  }, [tasks]);

  const goToLargeForecast = useCallback(() => {
    setPrimaryWorkArea('completeness-monitoring');
    setViewMode('large-forecast');
  }, []);

  const goToMultiProductDetail = useCallback((task: MultiProductTask) => {
    setPrimaryWorkArea('completeness-monitoring');
    setCurrentMultiProductTask(task);
    setViewMode('multi-product-detail');
    setTaskVersion(v => v + 1);
  }, []);

  // ======================== 任务操作 ========================

  const handleDialogConfirm = useCallback(() => {
    if (dialog.type === 'reset-step1') {
      // 修改步骤1 → 重置步骤2和3（PRD 4.6）
      setCompletedSteps(new Set());
      setCurrentStep(1);
      setMrpCount(null);
    }
    setDialog({ type: 'none' });
  }, [dialog.type]);

  // ======================== 三步流程 ========================

  /** 步骤1确认 → 进入步骤2 */
  const handleStep1Confirm = useCallback((data: Step1Data) => {
    setStep1Data(data);
    setMrpCount(null); // 重置，等步骤②加载完成后更新
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
  const handleCreateTask = useCallback(async (taskName: string) => {
    if (!step1Data) return;

    const taskId = crypto.randomUUID();
    const result = await pushFormDataToDIP({
      task_id: taskId,
      task_name: taskName,
      product_code: step1Data.productCode,
      product_name: step1Data.productName,
      demand_start: step1Data.demandStart,
      demand_end: step1Data.demandEnd,
      demand_quantity: step1Data.demandQuantity,
      production_start: step1Data.demandStart,   // 兼容 DIP 字段
      production_end: step1Data.demandEnd,
      production_quantity: step1Data.demandQuantity,
      description_entries: {
        scenario: '产品监测任务创建',
        source: 'planning_v2',
        product_code: step1Data.productCode,
        product_name: step1Data.productName,
        forecast_billno: step1Data.relatedForecastBillnos?.[0] || '',
        related_forecast_billnos: step1Data.relatedForecastBillnos,
        reason: '用户在供应链大脑中完成产品、预测单、物料需求计划与计划协同后创建监测任务',
      },
    });

    if (!result.success) {
      console.warn('[PlanningViewV2] 创建监测任务失败:', result.error);
      window.alert(`创建监测任务失败：${result.error || '未知错误'}`);
      return;
    }

    setTaskVersion(v => v + 1);
    setStep1ReadOnly(false);
    goToTaskList();
  }, [step1Data, goToTaskList]);

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
      return tasks.find(t => t.id === currentTaskId);
    }
    return undefined;
  }, [viewMode, currentTaskId, tasks]);

  // ======================== Render ========================

  return (
    <div className="flex min-h-full bg-slate-50">
      {/* 左侧窄边栏 */}
      <PlanningTaskSidebar
        currentView={viewMode}
        primaryWorkArea={primaryWorkArea}
        currentTaskId={currentTaskId}
        currentMultiProductTaskId={currentMultiProductTask?.id}
        recentTasks={recentTasks}
        onGoToTaskList={goToTaskList}
        onTaskSelect={goToTaskDetail}
        onMultiProductTaskSelect={goToMultiProductDetail}
        onNewTask={goToNewTask}
        onLargeForecast={goToLargeForecast}
        onDemandFulfillment={() => setPrimaryWorkArea('demand-fulfillment')}
      />

      {/* 右侧内容区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {primaryWorkArea === 'demand-fulfillment' ? (
          <DemandFulfillmentSection
            findMonitoringTaskByProduct={findMonitoringTaskByProduct}
            onNavigateToMonitoringTask={goToTaskDetail}
            onOpenNewMonitoringTask={goToNewTask}
            onOpenTaskList={goToTaskList}
          />
        ) : (
          <>
        {/* 视图1: 任务列表 */}
        {viewMode === 'task-list' && (
          <TaskListView
            tasks={tasks}
            shortageCountMap={{}}
            onViewDetail={goToTaskDetail}
            onNewTask={goToNewTask}
            onTaskImported={() => setTaskVersion(v => v + 1)}
            onViewMultiProductTask={goToMultiProductDetail}
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
                <h2 className="text-base font-semibold text-slate-800">新建产品监测任务</h2>
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
                  readOnly={step1ReadOnly}
                />
                {/* 步骤2: 物料需求 */}
                {step1Data && (
                  <MaterialRequirementPanel
                    active={currentStep === 2}
                    step1Data={step1Data}
                    onConfirm={handleStep2Confirm}
                    onBack={handleStepBack}
                    onMrpCountChange={setMrpCount}
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
            allowLifecycleActions={false}
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

        {/* 视图4: 大预测单浏览面板 */}
        {viewMode === 'large-forecast' && (
          <LargeForecastBrowsePanel
            existingTasks={tasks}
            onMonitoringTaskCreated={({ billno, forecastRecords }) => {
              const multiTask = multiProductTaskService.createTask({
                billno,
                forecastRecords,
              });
              goToMultiProductDetail(multiTask);
              setTaskVersion(v => v + 1);
            }}
            onBack={goToTaskList}
          />
        )}

        {/* 视图5: 预测单多产品监测任务详情 */}
        {viewMode === 'multi-product-detail' && currentMultiProductTask && (
          <MultiProductTaskDetailView
            task={currentMultiProductTask}
            onBack={goToTaskList}
          />
        )}
          </>
        )}
      </div>

      {/* 确认对话框 */}
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
