/**
 * Gantt Chart Utilities
 * 
 * 提供甘特图相关的工具函数，包括时间计算、位置计算等
 */

// ============================================================================
// 时间计算函数
// ============================================================================

/**
 * 计算任务条的位置和宽度
 * T015: 实现calculateTaskPosition函数
 * 
 * @param taskStartDate 任务开始日期
 * @param taskEndDate 任务结束日期
 * @param timelineStartDate 时间轴起始日期
 * @param pixelsPerDay 每天像素宽度
 * @returns 任务条的位置和宽度（像素）
 */
export function calculateTaskPosition(
  taskStartDate: Date,
  taskEndDate: Date,
  timelineStartDate: Date,
  pixelsPerDay: number
): { left: number; width: number } {
  // 计算任务开始日期相对于时间轴起始日期的天数
  const daysFromStart = Math.floor(
    (taskStartDate.getTime() - timelineStartDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  // 计算任务持续时间（天数）
  const durationDays = Math.ceil(
    (taskEndDate.getTime() - taskStartDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  // 计算位置和宽度
  const left = Math.max(0, daysFromStart * pixelsPerDay);
  let width = durationDays * pixelsPerDay;
  
  // 确保最小宽度为60px（SC-003要求）
  const MIN_WIDTH = 60;
  if (width < MIN_WIDTH) {
    width = MIN_WIDTH;
  }
  
  return { left, width };
}

/**
 * 格式化日期标签
 * T016: 实现formatDateLabel函数
 * 
 * @param date 日期对象
 * @returns 格式化后的日期字符串（"月/日"格式，如"1/8"）
 */
export function formatDateLabel(date: Date): string {
  const month = date.getMonth() + 1; // getMonth()返回0-11
  const day = date.getDate();
  return `${month}/${day}`;
}

/**
 * 构建时间轴配置
 * T017: 实现buildTimeline函数
 * 
 * @param startDate 时间轴起始日期
 * @param endDate 时间轴结束日期
 * @param pixelsPerDay 每天像素宽度
 * @returns 时间轴配置对象，包含日期标签和像素位置
 */
export interface TimelineConfig {
  dates: Array<{
    date: Date;
    label: string;
    position: number; // 像素位置
  }>;
  totalWidth: number; // 总宽度（像素）
}

export function buildTimeline(
  startDate: Date,
  endDate: Date,
  pixelsPerDay: number
): TimelineConfig {
  const dates: TimelineConfig['dates'] = [];
  const currentDate = new Date(startDate);
  
  // 按天生成时间轴刻度
  while (currentDate <= endDate) {
    const daysFromStart = Math.floor(
      (currentDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );
    
    dates.push({
      date: new Date(currentDate),
      label: formatDateLabel(currentDate),
      position: daysFromStart * pixelsPerDay,
    });
    
    // 移动到下一天
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  // 计算总宽度
  const totalDays = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  const totalWidth = totalDays * pixelsPerDay;
  
  return { dates, totalWidth };
}

/**
 * 计算每天像素宽度
 * T018: 实现calculatePixelsPerDay函数
 * 
 * @param timelineStartDate 时间轴起始日期
 * @param timelineEndDate 时间轴结束日期
 * @param containerWidth 容器宽度（像素）
 * @returns 每天像素宽度
 */
export function calculatePixelsPerDay(
  timelineStartDate: Date,
  timelineEndDate: Date,
  containerWidth: number
): number {
  // 计算时间范围（天数）
  const totalDays = Math.ceil(
    (timelineEndDate.getTime() - timelineStartDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  if (totalDays <= 0) {
    return 1; // 默认值
  }
  
  // 计算基础像素宽度
  let pixelsPerDay = containerWidth / totalDays;
  
  // 确保任务条最小宽度为60px
  // 如果计算出的像素宽度太小，调整容器宽度或像素宽度
  const MIN_TASK_WIDTH = 60;
  const MIN_PIXELS_PER_DAY = MIN_TASK_WIDTH; // 假设最小任务持续1天
  
  if (pixelsPerDay < MIN_PIXELS_PER_DAY) {
    pixelsPerDay = MIN_PIXELS_PER_DAY;
  }
  
  return pixelsPerDay;
}

/**
 * 计算时间范围（基于任务列表）
 * 
 * @param tasks 任务列表
 * @returns 时间范围（起始日期和结束日期）
 */
export function calculateTimeRange(tasks: Array<{ startDate: Date; endDate: Date }>): {
  start: Date;
  end: Date;
} {
  if (tasks.length === 0) {
    // 默认显示未来3个月
    const start = new Date();
    const end = new Date();
    end.setMonth(end.getMonth() + 3);
    return { start, end };
  }
  
  let minStart = tasks[0].startDate;
  let maxEnd = tasks[0].endDate;
  
  for (const task of tasks) {
    if (task.startDate < minStart) {
      minStart = task.startDate;
    }
    if (task.endDate > maxEnd) {
      maxEnd = task.endDate;
    }
  }
  
  // 直接使用任务的最早开始日期和最晚结束日期，不添加边距
  const start = new Date(minStart);
  const end = new Date(maxEnd);
  
  return { start, end };
}

/**
 * 生成时间列（每天一个日期）
 * 用于向后兼容现有的GanttBOMTree和GanttGridChart组件
 * 
 * @param timeRange 时间范围
 * @returns 日期数组
 */
export function generateTimeColumns(timeRange: { start: Date; end: Date }): Date[] {
  const columns: Date[] = [];
  const currentDate = new Date(timeRange.start);
  
  while (currentDate <= timeRange.end) {
    columns.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  return columns;
}

/**
 * 获取任务在网格中的位置
 * 用于向后兼容现有的GanttBOMTree和GanttGridChart组件
 * 
 * @param task 任务对象
 * @param timeRange 时间范围
 * @returns 任务位置信息
 */
export function getTaskGridPosition(
  task: { startDate: Date; endDate: Date; duration?: number },
  timeRange: { start: Date; end: Date }
): {
  startColumn: number;
  endColumn: number;
  spanColumns: number;
} {
  // 计算任务开始日期相对于时间轴起始日期的天数偏移
  // 注意：需要将日期规范化到当天的开始（00:00:00），以避免时间部分导致的精度问题
  const normalizeDate = (date: Date): Date => {
    const normalized = new Date(date);
    normalized.setHours(0, 0, 0, 0);
    return normalized;
  };
  
  const normalizedTaskStart = normalizeDate(task.startDate);
  const normalizedTimeRangeStart = normalizeDate(timeRange.start);
  
  const dayOffset = Math.floor(
    (normalizedTaskStart.getTime() - normalizedTimeRangeStart.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Grid布局：第0列是任务名称列，日期列从第1列开始
  // startColumn是1-based（1 = 第一个日期列）
  const startColumn = dayOffset + 1;

  // 计算任务持续天数
  // 优先使用duration字段（如果存在），因为它更准确
  // 如果duration字段不存在或为0，则通过endDate - startDate计算
  let durationDays: number;
  if (task.duration !== undefined && task.duration > 0) {
    // 直接使用duration字段
    durationDays = task.duration;
  } else {
    // 通过endDate - startDate计算
    // 注意：在甘特图中，如果任务持续N天，应该跨越N个单元格
    // endDate应该是startDate + N天（不包含），所以计算时应该+1来包含最后一天
    const millisecondsDiff = task.endDate.getTime() - task.startDate.getTime();
    const daysDiff = millisecondsDiff / (1000 * 60 * 60 * 24);
    // 使用Math.ceil确保至少包含1天
    durationDays = Math.ceil(daysDiff);
    // 如果计算出来是0或负数，说明endDate <= startDate，应该至少显示1个单元格
    if (durationDays <= 0) {
      durationDays = 1;
    }
  }

  // spanColumns表示任务条跨越的列数
  const spanColumns = Math.max(1, durationDays);

  // endColumn = startColumn + spanColumns
  const endColumn = startColumn + spanColumns;

  const result = {
    startColumn: Math.max(1, startColumn), // 最小为1（第一个日期列）
    endColumn: Math.max(2, endColumn),     // 最小为2（确保至少跨1列）
    spanColumns,
  };

  return result;
}

/**
 * 展平BOM层次结构
 * 用于向后兼容现有的GanttGridChart组件
 * 
 * @param tasks 任务列表（可能包含children）
 * @returns 展平后的任务列表
 */
export function flattenBOMHierarchy(
  tasks: Array<{ id: string; children?: any[]; [key: string]: any }>
): Array<{ id: string; [key: string]: any }> {
  const result: Array<{ id: string; [key: string]: any }> = [];
  
  function flatten(tasks: Array<{ id: string; children?: any[]; [key: string]: any }>) {
    for (const task of tasks) {
      const { children, ...taskWithoutChildren } = task;
      result.push(taskWithoutChildren);
      
      if (children && children.length > 0) {
        flatten(children);
      }
    }
  }
  
  flatten(tasks);
  return result;
}

/**
 * 构建BOM树为GanttTask树结构
 * 用于向后兼容MPSPrototype组件
 * 
 * @param bom BOM项列表
 * @param rootTask 根任务
 * @param plannedQuantity 计划数量
 * @param currentDate 当前日期
 * @returns 包含完整子任务树的根任务
 */
export function buildBOMTree(
  bom: Array<{
    id: string;
    name: string;
    type: 'product' | 'module' | 'component' | 'material';
    quantityPerSet: number;
    deliveryCycle?: number;
    processingTime?: number;
    children?: any[];
    [key: string]: any;
  }>,
  rootTask: {
    id: string;
    name: string;
    type: string;
    level: number;
    startDate: Date;
    endDate: Date;
    duration: number;
    status: string;
    [key: string]: any;
  },
  plannedQuantity: number,
  currentDate: Date
): {
  id: string;
  name: string;
  type: string;
  level: number;
  startDate: Date;
  endDate: Date;
  duration: number;
  status: string;
  children?: any[];
  [key: string]: any;
} {
  let maxEndDate = new Date(currentDate);
  const children: any[] = [];
  
  // 递归处理BOM项
  function processBOMItem(
    item: {
      id: string;
      name: string;
      type: string;
      quantityPerSet: number;
      deliveryCycle?: number;
      processingTime?: number;
      children?: any[];
      [key: string]: any;
    },
    level: number,
    parentStartDate: Date
  ): any {
    const itemStartDate = new Date(parentStartDate);
    let itemDuration = 0;
    
    // 根据类型计算持续时间
    if (item.type === 'material') {
      itemDuration = item.deliveryCycle || 0;
    } else if (item.type === 'module' || item.type === 'component') {
      itemDuration = item.processingTime || 0;
    }
    
    const itemEndDate = new Date(itemStartDate);
    itemEndDate.setDate(itemEndDate.getDate() + itemDuration);
    
    // 更新最大结束日期
    if (itemEndDate > maxEndDate) {
      maxEndDate = itemEndDate;
    }
    
    // 创建子任务
    const childTask: any = {
      id: item.id,
      name: item.name,
      type: item.type,
      level,
      startDate: itemStartDate,
      endDate: itemEndDate,
      duration: itemDuration,
      status: 'normal',
    };
    
    // 递归处理子项
    if (item.children && item.children.length > 0) {
      childTask.children = item.children.map((child: any) => 
        processBOMItem(child, level + 1, itemStartDate)
      );
    }
    
    return childTask;
  }
  
  // 处理所有BOM项
  bom.forEach((item) => {
    children.push(processBOMItem(item, rootTask.level + 1, currentDate));
  });
  
  // 更新根任务的结束日期和持续时间
  rootTask.endDate = maxEndDate;
  rootTask.duration = Math.ceil(
    (maxEndDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24)
  );
  
  return {
    ...rootTask,
    children,
  };
}
