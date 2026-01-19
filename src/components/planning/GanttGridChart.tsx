/**
 * Gantt Grid Chart Component
 * 
 * Renders a grid-based Gantt chart with time axis on horizontal axis and BOM hierarchy on vertical axis.
 * Uses CSS Grid layout to ensure perfect alignment between task names and task bars.
 */

import { useMemo } from 'react';
import type { GanttTask, MaterialReadyGanttTask, TimeRange } from '../../types/ontology';
import {
  calculateTimeRange,
  generateTimeColumns,
  getTaskGridPosition,
  flattenBOMHierarchy,
} from '../../utils/ganttUtils';
import { GanttTaskBar } from './GanttTaskBar';

interface GanttGridChartProps {
  tasks: (GanttTask | MaterialReadyGanttTask)[];
  onTaskHover?: (task: GanttTask | MaterialReadyGanttTask, position: { x: number; y: number }) => void;
  onTaskLeave?: () => void;
}

export function GanttGridChart({ tasks, onTaskHover, onTaskLeave }: GanttGridChartProps) {
  // 根据层级获取行背景色（FR-026）
  const getRowBackgroundColor = (taskLevel: number): string => {
    // level 0: 产品 -> bg-white
    // level 1: 一级组件 -> bg-white
    // level 2: 二级组件 -> bg-slate-50
    // level 3: 三级组件 -> bg-blue-50
    // level 4+: 物料 -> bg-purple-50
    if (taskLevel === 0 || taskLevel === 1) {
      return 'bg-white';
    } else if (taskLevel === 2) {
      return 'bg-slate-50';
    } else if (taskLevel === 3) {
      return 'bg-blue-50';
    } else {
      return 'bg-purple-50';
    }
  };

  // Sort tasks by level and start date
  const sortedTasks = useMemo(() => {
    try {
      return flattenBOMHierarchy(tasks);
    } catch (error) {
      console.error('Error flattening BOM hierarchy:', error);
      return [];
    }
  }, [tasks]);

  // Calculate time range from all tasks
  const timeRange = useMemo(() => {
    try {
      return calculateTimeRange(tasks);
    } catch (error) {
      console.error('Error calculating time range:', error);
      const now = new Date();
      return { start: now, end: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) };
    }
  }, [tasks]);

  // Generate time columns (one per day)
  const timeColumns = useMemo(() => {
    try {
      return generateTimeColumns(timeRange);
    } catch (error) {
      console.error('Error generating time columns:', error);
      return [];
    }
  }, [timeRange]);

  // Calculate task positions
  const taskPositions = useMemo(
    () => {
      try {
        return sortedTasks.map((task) => getTaskGridPosition(task as any, timeRange));
      } catch (error) {
        console.error('Error calculating task positions:', error);
        return [];
      }
    },
    [sortedTasks, timeRange]
  );

  // Calculate total days for grid columns
  const totalDays = Math.max(1, timeColumns.length); // Ensure at least 1 column

  // Handle task hover
  const handleTaskHover = (task: GanttTask | MaterialReadyGanttTask, e: React.MouseEvent) => {
    if (onTaskHover) {
      const rect = e.currentTarget.getBoundingClientRect();
      onTaskHover(task, {
        x: rect.left + rect.width / 2,
        y: rect.top,
      });
    }
  };

  // Handle task leave
  const handleTaskLeave = () => {
    if (onTaskLeave) {
      onTaskLeave();
    }
  };

  // Format date for display (M/D format)
  const formatDate = (date: Date): string => {
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  if (!tasks || tasks.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p>暂无任务数据</p>
      </div>
    );
  }

  if (!sortedTasks || sortedTasks.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p>暂无任务数据</p>
      </div>
    );
  }

  if (totalDays === 0 || !timeColumns || timeColumns.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500">
        <p>时间范围无效</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <div
        className="inline-grid min-w-full"
        style={{
          gridTemplateColumns: `192px repeat(${totalDays}, 60px)`,
          gridTemplateRows: `3rem repeat(${sortedTasks.length}, 3.5rem)`,
        }}
      >
        {/* Time axis header - empty cell for task name column */}
        <div className="border-b border-r border-slate-200 sticky left-0 z-20 bg-white"></div>

        {/* Time axis header - date labels */}
        {timeColumns.map((date, index) => (
          <div
            key={`header-${index}`}
            className="border-b border-l border-slate-200 flex items-end pb-1 px-1 sticky top-0 z-10 bg-white"
            style={{ height: '3rem' }}
          >
            <div className="text-xs text-slate-500 whitespace-nowrap">
              {formatDate(date)}
            </div>
          </div>
        ))}

        {/* Task rows */}
        {sortedTasks.flatMap((taskItem, rowIndex) => {
          const task = taskItem as GanttTask | MaterialReadyGanttTask;
          const position = taskPositions[rowIndex];
          if (!position) {
            return [];
          }
          const indentLevel = task.level;
          const startCol = position.startColumn - 1; // Convert to 0-based index

          const taskLevel = task.level !== undefined ? task.level : 0;
          const bgColor = getRowBackgroundColor(taskLevel);

          return [
            // Task name cell
            <div
              key={`name-${task.id}`}
              className={`text-sm text-slate-700 text-right pr-2 border-b border-r border-slate-100 sticky left-0 z-10 ${bgColor}`}
              style={{
                height: '3.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'flex-end',
                paddingLeft: `${indentLevel * 1}rem`,
                boxSizing: 'border-box',
              }}
              title={task.name}
            >
              <div
                style={{
                  lineHeight: '1.2rem',
                  maxHeight: '2.4rem',
                  overflow: 'hidden',
                  display: '-webkit-box',
                  WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical',
                  wordBreak: 'break-word',
                  textOverflow: 'ellipsis',
                  textAlign: 'right',
                }}
              >
                {task.name}
              </div>
            </div>,
            // Task bar cells
            ...timeColumns.map((_, colIndex) => {
              const isTaskStart = colIndex === startCol;

              return (
                <div
                  key={`cell-${task.id}-${colIndex}`}
                  className={`relative border-b border-l border-slate-100 ${bgColor}`}
                  style={{
                    height: '3.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    boxSizing: 'border-box',
                  }}
                >
                  {isTaskStart && (
                    <div
                      className="absolute inset-y-0 flex items-center"
                      style={{
                        left: 0,
                        width: `${position.spanColumns * 60}px`,
                      }}
                    >
                      <GanttTaskBar
                        task={task}
                        startColumn={position.startColumn}
                        spanColumns={position.spanColumns}
                        onHover={(e) => handleTaskHover(task, e)}
                        onLeave={handleTaskLeave}
                      />
                    </div>
                  )}
                </div>
              );
            })
          ];
        })}
      </div>
    </div>
  );
}

