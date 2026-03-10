import type { PlanningTask, TaskSummaryReport, KeyMonitorMaterial, TaskExportPackage, GanttBar, InventoryRecord } from '../types/planningV2';
import { ganttService } from './ganttService';
import { planningV2DataService } from './planningV2DataService';

const STORAGE_KEY = 'planning_v2_tasks';

function loadAll(): PlanningTask[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tasks: any[] = raw ? JSON.parse(raw) : [];
    // 向后兼容：迁移旧格式任务数据
    for (const t of tasks) {
      // v2.x: 'ended' 状态映射为 'completed'
      if (t.status === 'ended') {
        t.status = 'completed';
      }
      // v3.1: 迁移 production* 字段 → demand* 字段（PRD 7.1）
      if (!t.relatedForecastBillnos) {
        t.relatedForecastBillnos = [];
      }
      // 旧任务可能没有 demandEnd 但有 productionEnd，用 productionEnd 兜底
      if (!t.demandEnd && t.productionEnd) {
        t.demandEnd = t.productionEnd;
      }
      if (!t.demandStart && t.productionStart) {
        t.demandStart = t.productionStart;
      }
      if (!t.demandQuantity && t.productionQuantity) {
        t.demandQuantity = t.productionQuantity;
      }
    }
    return tasks as PlanningTask[];
  } catch {
    return [];
  }
}

/** PRD D4: localStorage 容量监控与清理 */
const STORAGE_WARN_MB = 3;
const STORAGE_CLEAN_MB = 4;
const REPORT_RETENTION_DAYS = 90;

function getLocalStorageSizeMB(): number {
  let total = 0;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key) total += (key.length + (localStorage.getItem(key)?.length || 0)) * 2;
    }
  } catch { /* ignore */ }
  return total / (1024 * 1024);
}

function autoCleanStorage(tasks: PlanningTask[]): PlanningTask[] {
  const sizeMB = getLocalStorageSizeMB();
  if (sizeMB < STORAGE_WARN_MB) return tasks;

  console.warn(`[TaskService] localStorage 容量 ${sizeMB.toFixed(1)}MB，开始清理...`);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - REPORT_RETENTION_DAYS);
  const cutoffISO = cutoff.toISOString();

  // 清理已结束任务超过 90 天的每日报告
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('planningV2_dailyReports_')) {
      try {
        const reports = JSON.parse(localStorage.getItem(key) || '[]');
        const filtered = reports.filter((r: any) => r.generatedAt > cutoffISO);
        if (filtered.length < reports.length) {
          console.log(`[TaskService] 清理每日报告 ${key}: ${reports.length} → ${filtered.length}`);
          localStorage.setItem(key, JSON.stringify(filtered));
        }
      } catch { /* ignore */ }
    }
  }

  // 如果还超 4MB，清理已结束任务的 summaryReport.keyMaterialsSnapshot
  if (sizeMB >= STORAGE_CLEAN_MB) {
    for (const t of tasks) {
      if ((t.status === 'completed' || t.status === 'incomplete') && t.summaryReport?.keyMaterialsSnapshot) {
        const endedDate = t.endedAt || t.updatedAt;
        if (endedDate < cutoffISO) {
          console.log(`[TaskService] 清理旧任务快照: ${t.id}`);
          t.summaryReport.keyMaterialsSnapshot = [];
        }
      }
    }
  }

  return tasks;
}

function saveAll(tasks: PlanningTask[]): void {
  const cleaned = autoCleanStorage(tasks);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
}

/** 获取所有任务（自动过期检测 + 按创建时间倒序） */
export function getTasks(): PlanningTask[] {
  const tasks = loadAll();
  const now = new Date();
  let changed = false;
  for (const t of tasks) {
    if (t.status === 'active' && new Date(t.demandEnd) < now) {
      t.status = 'expired';
      t.updatedAt = now.toISOString();
      changed = true;
    }
  }
  if (changed) saveAll(tasks);
  return tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** 获取最近 N 个任务 */
export function getRecentTasks(count: number = 3): PlanningTask[] {
  return getTasks().slice(0, count);
}

/** 按 ID 获取任务 */
export function getTaskById(id: string): PlanningTask | undefined {
  return loadAll().find(t => t.id === id);
}

/** 创建任务 */
export function createTask(
  task: Omit<PlanningTask, 'id' | 'status' | 'createdAt' | 'updatedAt'>
): PlanningTask {
  const now = new Date().toISOString();
  const newTask: PlanningTask = {
    ...task,
    id: crypto.randomUUID(),
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };
  const tasks = loadAll();
  tasks.unshift(newTask);
  saveAll(tasks);
  return newTask;
}

// ============================================================================
// 任务结束流程（含入库检查 + 总结报告生成）
// ============================================================================

export interface EndTaskResult {
  status: 'completed' | 'incomplete';
  message: string;
  inboundDate: string | null;
  inboundQuantity: number | null;
  timeDiffDays: number | null;
  hasSignificantDelay: boolean;
}

/**
 * 检查产品入库情况（结束前预检）
 *
 * 数据溯源:
 *   API 对象: supplychain_hd0202_inventory
 *   查询条件: material_code == productCode
 *   取值逻辑: 多条记录取 inbound_date 最大值，inventory_qty 求和
 */
export async function checkProductInbound(task: PlanningTask): Promise<EndTaskResult> {
  console.log(`[TaskService] 检查产品入库: ${task.productCode}`);

  const inventoryRecords = await planningV2DataService.loadInventoryByMaterials([task.productCode]);
  const productRecords = inventoryRecords.filter(r => r.material_code === task.productCode);

  console.log(`[TaskService] 产品 ${task.productCode} 库存记录: ${productRecords.length} 条`);

  if (productRecords.length === 0) {
    return {
      status: 'incomplete',
      message: '监测期间未发现产品入库记录，任务将标记为未完成',
      inboundDate: null,
      inboundQuantity: null,
      timeDiffDays: null,
      hasSignificantDelay: false,
    };
  }

  // 取最新 inbound_date 和总数量
  let latestDate = '';
  let totalQty = 0;
  for (const r of productRecords) {
    if (r.inbound_date && r.inbound_date > latestDate) {
      latestDate = r.inbound_date;
    }
    totalQty += r.inventory_qty;
  }

  const inboundDateObj = new Date(latestDate);
  const planEndObj = new Date(task.demandEnd);
  const diffMs = inboundDateObj.getTime() - planEndObj.getTime();
  const diffDays = Math.round(diffMs / 86400000);
  const hasSignificantDelay = diffDays > 30;

  let message: string;
  if (diffDays <= 0) {
    message = `产品已按计划入库（入库时间 ${latestDate.slice(0, 10)}）`;
  } else if (diffDays <= 30) {
    message = `产品已入库，比计划延迟 ${diffDays} 天（入库时间 ${latestDate.slice(0, 10)}）`;
  } else {
    message = `产品入库时间与计划差异超过1个月（延迟 ${diffDays} 天），请关注`;
  }

  console.log(`[TaskService] 入库检查结果: ${message}, 数量=${totalQty}`);

  return {
    status: 'completed',
    message,
    inboundDate: latestDate,
    inboundQuantity: totalQty,
    timeDiffDays: diffDays,
    hasSignificantDelay,
  };
}

/**
 * 结束任务（完整流程：生成总结报告 + 更新状态）
 *
 * 数据溯源:
 *   1. buildGanttData → 获取当前甘特图数据
 *   2. loadInventoryByMaterials → 查询物料库存
 *   3. 组装 TaskSummaryReport → 写入 task.summaryReport
 */
export async function endTaskWithReport(
  taskId: string,
  endResult: EndTaskResult,
  ganttBars: GanttBar[],
  keyMaterials: KeyMonitorMaterial[],
): Promise<PlanningTask | null> {
  const tasks = loadAll();
  const task = tasks.find(t => t.id === taskId);
  if (!task) return null;

  const flat = ganttService.flattenGanttBars(ganttBars);
  const materials = flat.filter(b => b.bomLevel > 0);

  const report: TaskSummaryReport = {
    generatedAt: new Date().toISOString(),
    planVsActual: {
      demandPeriod: { start: task.demandStart, end: task.demandEnd },
      actualInboundDate: endResult.inboundDate,
      inboundQuantity: endResult.inboundQuantity,
      timeDiffDays: endResult.timeDiffDays,
      hasSignificantDelay: endResult.hasSignificantDelay,
    },
    productCompletion: {
      plannedQuantity: task.demandQuantity,
      inboundQuantity: endResult.inboundQuantity,
      completionRate: endResult.inboundQuantity != null
        ? Math.round((endResult.inboundQuantity / task.demandQuantity) * 100)
        : null,
    },
    materialCompletion: {
      totalMaterials: materials.length,
      withPO: materials.filter(b => b.poStatus === 'has_po').length,
      withoutPO: materials.filter(b => b.poStatus === 'no_po').length,
      shortageCount: materials.filter(b => b.hasShortage).length,
      riskCount: materials.filter(b => b.status === 'risk').length,
    },
    keyMaterialsSnapshot: keyMaterials,
  };

  task.status = endResult.status;
  task.endedAt = new Date().toISOString();
  task.updatedAt = new Date().toISOString();
  task.summaryReport = report;
  saveAll(tasks);

  console.log(`[TaskService] 任务 ${taskId} 已结束: status=${task.status}, 报告已生成`);
  return task;
}

/** 删除任务 */
export function deleteTask(id: string): void {
  const tasks = loadAll().filter(t => t.id !== id);
  saveAll(tasks);
}

// ============================================================================
// 导入导出
// ============================================================================

/**
 * 导出任务为 JSON 包（.scb.json）
 */
export function exportTaskAsJSON(
  task: PlanningTask,
  ganttBars: GanttBar[],
  keyMaterials: KeyMonitorMaterial[],
): TaskExportPackage {
  console.log(`[TaskService] 导出任务 JSON: ${task.id}`);
  return {
    version: '1.0',
    exportedAt: new Date().toISOString(),
    exportedBy: '供应链大脑',
    task,
    ganttSnapshot: ganttBars,
    keyMaterials,
  };
}

/**
 * 导入任务（从 .scb.json 恢复）
 *
 * 导入规则:
 *   - 生成新 id
 *   - 保留原 createdAt
 *   - 更新 updatedAt 为当前时间
 *   - active 任务检查是否过期
 *   - completed/incomplete 保持不变
 */
export function importTask(pkg: TaskExportPackage): PlanningTask {
  console.log(`[TaskService] 导入任务: version=${pkg.version}, exportedAt=${pkg.exportedAt}`);

  if (pkg.version !== '1.0' || !pkg.task) {
    throw new Error('导入文件格式不正确或版本不支持');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imported: any = { ...pkg.task };
  imported.id = crypto.randomUUID();
  imported.updatedAt = new Date().toISOString();

  // 向后兼容旧 ended 状态
  if (imported.status === 'ended') {
    imported.status = 'completed';
  }

  // PRD D6: v2.10 格式兼容 — production* → demand*
  if (!imported.demandEnd && imported.productionEnd) {
    imported.demandEnd = imported.productionEnd;
  }
  if (!imported.demandStart && imported.productionStart) {
    imported.demandStart = imported.productionStart;
  }
  if (!imported.demandQuantity && imported.productionQuantity) {
    imported.demandQuantity = imported.productionQuantity;
  }
  if (!imported.relatedForecastBillnos) {
    imported.relatedForecastBillnos = [];
  }

  // active 任务检查是否过期
  if (imported.status === 'active') {
    const now = new Date();
    if (new Date(imported.demandEnd) < now) {
      imported.status = 'expired';
      console.log(`[TaskService] 导入的 active 任务已过期，自动设为 expired`);
    }
  }

  const tasks = loadAll();
  tasks.unshift(imported);
  saveAll(tasks);

  console.log(`[TaskService] 任务导入完成: newId=${imported.id}, status=${imported.status}`);
  return imported;
}

// ============================================================================
// 关键监测物料清单构建
// ============================================================================

/**
 * 构建关键监测物料清单
 *
 * 筛选范围（PRD v3.2 第 6.6.1 节）:
 *   展示全部 BOM 物料（不做筛选过滤）
 *
 * 数据溯源:
 *   - 甘特图数据: ganttBars（已由 ganttService.buildGanttData 构建，含 availableInventoryQty）
 *   - 库存数据: supplychain_hd0202_inventory, material_code in [物料编码]
 *   - 新入库判定: inbound_date >= task.createdAt（PRD 6.6.3）
 */
export async function buildKeyMaterialList(
  ganttBars: GanttBar[],
  taskCreatedAt: string,
): Promise<KeyMonitorMaterial[]> {
  const flat = ganttService.flattenGanttBars(ganttBars);

  // PRD v3.2: 展示全部 BOM 物料，不做筛选
  const filtered = flat;
  console.log(`[TaskService] 关键监测物料: 总BOM ${flat.length} 条`);

  // 查询库存数据
  const materialCodes = filtered.map(b => b.materialCode);
  const inventoryRecords = await planningV2DataService.loadInventoryByMaterials(materialCodes);
  console.log(`[TaskService] 库存查询返回: ${inventoryRecords.length} 条`);

  // 按 material_code 汇总库存
  const inventoryMap = new Map<string, {
    totalQty: number;
    availableQty: number;
    newInboundQty: number;
    latestInboundDate: string;
  }>();

  const baseDate = new Date(taskCreatedAt);

  for (const inv of inventoryRecords) {
    const existing = inventoryMap.get(inv.material_code) || {
      totalQty: 0,
      availableQty: 0,
      newInboundQty: 0,
      latestInboundDate: '',
    };

    existing.totalQty += inv.inventory_qty;
    existing.availableQty += inv.available_inventory_qty;

    // 新入库：inbound_date >= task.createdAt（PRD 6.6.3）
    if (inv.inbound_date && new Date(inv.inbound_date) >= baseDate) {
      existing.newInboundQty += inv.inventory_qty;
      if (inv.inbound_date > existing.latestInboundDate) {
        existing.latestInboundDate = inv.inbound_date;
      }
    }

    inventoryMap.set(inv.material_code, existing);
  }

  // 组装关键监测物料列表
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const result: KeyMonitorMaterial[] = filtered.map(bar => {
    const inv = inventoryMap.get(bar.materialCode);
    return {
      materialCode: bar.materialCode,
      materialName: bar.materialName,
      materialType: bar.materialType,
      bomLevel: bar.bomLevel,
      shortageQuantity: bar.shortageQuantity,
      hasShortage: bar.hasShortage,
      inventoryQty: inv ? inv.totalQty : null,
      availableInventoryQty: inv ? inv.availableQty : null,
      newInboundQty: inv && inv.newInboundQty > 0 ? inv.newInboundQty : null,
      latestInboundDate: inv && inv.latestInboundDate ? inv.latestInboundDate.slice(0, 10) : null,
      prStatus: bar.prStatus,
      poStatus: bar.poStatus,
      poDeliverDate: bar.poDeliverDate,
      startDate: fmt(bar.startDate),
      endDate: fmt(bar.endDate),
      leadtime: bar.leadtime,
    };
  });

  return result;
}

export const taskService = {
  getTasks,
  getRecentTasks,
  getTaskById,
  createTask,
  checkProductInbound,
  endTaskWithReport,
  deleteTask,
  exportTaskAsJSON,
  importTask,
  buildKeyMaterialList,
};
