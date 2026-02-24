/**
 * 齐套模式甘特图 - Material Ready Mode Gantt Chart
 *
 * 基于齐套模式的倒排甘特图，显示物料交付进度和风险
 */

import { useState, useMemo, useEffect, useRef } from 'react';
import { ChevronRight, ChevronDown, Maximize2, Minimize2 } from 'lucide-react';
import type { MaterialTask } from '../../../types/planningV2';
import GanttTimeAxis from './GanttTimeAxis';
import GanttTaskBar from './GanttTaskBar';
import GanttTooltip from './GanttTooltip';
import GanttLegend from './GanttLegend';

interface GanttChartProps {
  tasks: MaterialTask[];
  startDate: Date;
  endDate: Date;
  productionEndDate: Date;
  highlightedTaskId?: string;  // 高亮显示的任务ID
  onMaterialSelect?: (task: MaterialTask) => void;
}

const GanttChart = ({ tasks, startDate, endDate, productionEndDate, highlightedTaskId, onMaterialSelect }: GanttChartProps) => {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());
  const [hoveredTask, setHoveredTask] = useState<{ task: MaterialTask; x: number; y: number } | null>(null);
  const hideTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 自动展开包含高亮任务的所有父节点
  const expandToTask = (taskId: string) => {
    const task = tasks.find(t => t.materialCode === taskId);
    if (!task) return;

    const newExpanded = new Set(expandedNodes);
    let currentTask = task;

    // 向上遍历找到所有父节点并展开
    while (currentTask.parentCode) {
      newExpanded.add(currentTask.parentCode);
      currentTask = tasks.find(t => t.materialCode === currentTask.parentCode)!;
    }

    setExpandedNodes(newExpanded);
  };

  // 当highlightedTaskId变化时,自动展开并滚动到目标任务
  useEffect(() => {
    if (highlightedTaskId) {
      expandToTask(highlightedTaskId);

      // 延迟滚动,确保DOM已更新
      setTimeout(() => {
        const element = document.getElementById(`gantt-task-${highlightedTaskId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 100);
    }
  }, [highlightedTaskId]);

  // 计算总天数
  const totalDays = useMemo(() => {
    return Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  }, [startDate, endDate]);

  // 定义树节点类型
  type TreeNode = MaterialTask & {
    children: TreeNode[];
    id: string;
  };

  // 构建树形结构
  const buildTree = (tasks: MaterialTask[]): TreeNode[] => {
    const taskMap = new Map<string, TreeNode>();
    const rootTasks: TreeNode[] = [];

    // 初始化所有任务 - 使用materialCode作为id
    tasks.forEach(task => {
      taskMap.set(task.materialCode, { ...task, id: task.materialCode, children: [] });
    });

    // 构建父子关系
    tasks.forEach(task => {
      const taskWithChildren = taskMap.get(task.materialCode)!;
      if (task.parentCode) {
        const parent = taskMap.get(task.parentCode);
        if (parent) {
          parent.children.push(taskWithChildren);
        }
      } else {
        rootTasks.push(taskWithChildren);
      }
    });

    return rootTasks;
  };

  const treeData = useMemo(() => buildTree(tasks), [tasks]);

  // 全部展开
  const expandAll = () => {
    const allIds = new Set<string>();
    tasks.forEach(task => {
      allIds.add(task.materialCode);
    });
    setExpandedNodes(allIds);
  };

  // 全部折叠
  const collapseAll = () => {
    setExpandedNodes(new Set());
  };

  const toggleExpand = (taskId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(taskId)) {
      newExpanded.delete(taskId);
    } else {
      newExpanded.add(taskId);
    }
    setExpandedNodes(newExpanded);
  };

  const renderTaskRow = (
    task: TreeNode,
    level: number = 0
  ): React.ReactNode[] => {
    const isExpanded = expandedNodes.has(task.id);
    const hasChildren = task.children.length > 0;
    const rows: React.ReactNode[] = [];

    // 当前任务行
    const isHighlighted = highlightedTaskId && task.materialCode === highlightedTaskId;

    rows.push(
      <div
        key={task.id}
        id={`gantt-task-${task.materialCode}`}
        className={`flex border-b border-slate-100 hover:bg-slate-50 transition-colors
          ${isHighlighted ? 'bg-yellow-50 ring-2 ring-yellow-400 ring-inset' : ''}`}
      >
        {/* 左侧BOM树 */}
        <div className="w-80 flex-shrink-0 border-r border-slate-200 py-2 px-3 flex items-center gap-2"
          style={{ paddingLeft: `${level * 24 + 12}px` }}>
          {hasChildren ? (
            <button
              onClick={() => toggleExpand(task.id)}
              className="p-0.5 hover:bg-slate-200 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-slate-600" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-600" />
              )}
            </button>
          ) : (
            <div className="w-5" />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className={`px-1.5 py-0.5 text-xs rounded font-medium
                ${task.materialType === 'product' ? 'bg-indigo-100 text-indigo-700' : ''}
                ${task.materialType === 'manufactured' ? 'bg-purple-100 text-purple-700' : ''}
                ${task.materialType === 'purchased' ? 'bg-green-100 text-green-700' : ''}
                ${task.materialType === 'outsourced' ? 'bg-orange-100 text-orange-700' : ''}
              `}>
                {task.materialType === 'product' && '产品'}
                {task.materialType === 'manufactured' && '自制'}
                {task.materialType === 'purchased' && '外购'}
                {task.materialType === 'outsourced' && '委外'}
              </span>
              <span className="text-xs text-slate-600 font-mono">{task.materialCode}</span>
            </div>
            <div className="text-sm text-slate-800 truncate mt-0.5">{task.materialName}</div>
          </div>
        </div>

        {/* 右侧甘特图区域 */}
        <div className="flex-1 relative py-2 px-2">
          <GanttTaskBar
            task={task}
            startDate={startDate}
            totalDays={totalDays}
            productionEndDate={productionEndDate}
            onMouseEnter={(e) => {
              // 清除任何待执行的隐藏timeout
              if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
                hideTimeoutRef.current = null;
              }

              const rect = e.currentTarget.getBoundingClientRect();
              setHoveredTask({
                task,
                x: rect.right + 10,
                y: rect.top
              });
            }}
            onMouseLeave={() => {
              // 延迟隐藏，给用户时间移动到tooltip
              hideTimeoutRef.current = setTimeout(() => {
                setHoveredTask(null);
              }, 200);
            }}
          />
        </div>
      </div>
    );

    // 如果展开且有子节点，递归渲染子节点
    if (isExpanded && hasChildren) {
      task.children.forEach(child => {
        rows.push(...renderTaskRow(child, level + 1));
      });
    }

    return rows;
  };

  return (
    <div className="space-y-0">
      <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
        {/* 表头 */}
        <div className="flex border-b-2 border-slate-300 bg-slate-50">
          <div className="w-80 flex-shrink-0 border-r border-slate-300 py-3 px-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-800">物料BOM结构</div>
                <div className="text-xs text-slate-500 mt-0.5">Material BOM Structure</div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={expandAll}
                  className="p-1 hover:bg-slate-200 rounded transition-colors"
                  title="全部展开"
                >
                  <Maximize2 className="w-4 h-4 text-slate-600" />
                </button>
                <button
                  onClick={collapseAll}
                  className="p-1 hover:bg-slate-200 rounded transition-colors"
                  title="全部折叠"
                >
                  <Minimize2 className="w-4 h-4 text-slate-600" />
                </button>
              </div>
            </div>
          </div>
          <div className="flex-1 py-3 px-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-semibold text-slate-800">齐套倒排甘特图 (Material-Ready Backward Scheduling)</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  从生产结束时间向前倒推，确保所有物料在上级生产前齐套完成
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-medium text-indigo-600">
                  目标交付: {productionEndDate.toLocaleDateString('zh-CN')}
                </div>
                <div className="text-xs text-slate-500 mt-0.5">
                  原则: 子级结束时间 = 父级开始时间 - 1天
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 时间轴 */}
        <div className="flex border-b border-slate-200 bg-slate-50">
          <div className="w-80 flex-shrink-0 border-r border-slate-200" />
          <div className="flex-1">
            <GanttTimeAxis startDate={startDate} endDate={endDate} totalDays={totalDays} />
          </div>
        </div>

        {/* 任务列表 */}
        <div className="overflow-y-auto" style={{ maxHeight: '600px' }}>
          {treeData.map(task => renderTaskRow(task))}
        </div>

        {/* Tooltip */}
        {hoveredTask && (
          <GanttTooltip
            task={hoveredTask.task}
            x={hoveredTask.x}
            y={hoveredTask.y}
            allTasks={tasks}
            onAskAI={onMaterialSelect}
            onMouseEnter={() => {
              // 鼠标进入tooltip时，取消隐藏
              if (hideTimeoutRef.current) {
                clearTimeout(hideTimeoutRef.current);
                hideTimeoutRef.current = null;
              }
            }}
            onMouseLeave={() => {
              // 鼠标离开tooltip时，立即隐藏
              setHoveredTask(null);
            }}
          />
        )}
      </div>

      {/* 图例说明 */}
      <GanttLegend />
    </div>
  );
};

export default GanttChart;
