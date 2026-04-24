/**
 * 采购工作台 - 任务持久化服务
 *
 * Phase 1：localStorage 存储；后续若需后端同步，参考 monitoringTaskApiService 模式扩展。
 */

import type {
  ProcurementTask,
  CreateTaskInput,
  PrDemandDateEntry,
  ProcurementTaskFilter,
} from '../types/procurementWorkbench';

const STORAGE_KEY = 'procurement_workbench_tasks';
const ACTIVE_TASK_KEY = 'procurement_workbench_active_task';

function uuid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `pwt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

class ProcurementTaskService {
  private loadAll(): ProcurementTask[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as ProcurementTask[];
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.error('[ProcurementTaskService] load failed:', err);
      return [];
    }
  }

  private saveAll(tasks: ProcurementTask[]): void {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
  }

  /** 获取所有任务（按创建时间倒序） */
  getTasks(): ProcurementTask[] {
    return this.loadAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  getActiveTasks(): ProcurementTask[] {
    return this.getTasks().filter((t) => t.status === 'active');
  }

  getById(id: string): ProcurementTask | undefined {
    return this.loadAll().find((t) => t.id === id);
  }

  create(input: CreateTaskInput, createdBy = 'amy.zhou'): ProcurementTask {
    const task: ProcurementTask = {
      id: uuid(),
      name: input.name.trim() || '未命名任务',
      createdBy,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      status: 'active',
      filter: input.filter,
      prDemandDates: {},
    };
    const tasks = this.loadAll();
    tasks.push(task);
    this.saveAll(tasks);
    return task;
  }

  rename(id: string, name: string): void {
    const tasks = this.loadAll();
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    t.name = name.trim() || t.name;
    t.updatedAt = nowIso();
    this.saveAll(tasks);
  }

  archive(id: string): void {
    const tasks = this.loadAll();
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    t.status = 'archived';
    t.updatedAt = nowIso();
    this.saveAll(tasks);
  }

  remove(id: string): void {
    this.saveAll(this.loadAll().filter((t) => t.id !== id));
  }

  updateFilter(id: string, filter: ProcurementTaskFilter): void {
    const tasks = this.loadAll();
    const t = tasks.find((x) => x.id === id);
    if (!t) return;
    t.filter = filter;
    t.updatedAt = nowIso();
    this.saveAll(tasks);
  }

  /** 写入/覆盖单条 PR 需求日期 */
  setDemandDate(taskId: string, entry: PrDemandDateEntry): void {
    const tasks = this.loadAll();
    const t = tasks.find((x) => x.id === taskId);
    if (!t) return;
    t.prDemandDates[entry.prBillno] = entry;
    t.updatedAt = nowIso();
    this.saveAll(tasks);
  }

  /** 清除单条 PR 需求日期 */
  clearDemandDate(taskId: string, prBillno: string): void {
    const tasks = this.loadAll();
    const t = tasks.find((x) => x.id === taskId);
    if (!t) return;
    if (t.prDemandDates[prBillno]) {
      delete t.prDemandDates[prBillno];
      t.updatedAt = nowIso();
      this.saveAll(tasks);
    }
  }

  /** 批量写入需求日期（用于"统一赋值"或"导入"） */
  setDemandDatesBulk(taskId: string, entries: PrDemandDateEntry[]): void {
    const tasks = this.loadAll();
    const t = tasks.find((x) => x.id === taskId);
    if (!t) return;
    for (const entry of entries) {
      t.prDemandDates[entry.prBillno] = entry;
    }
    t.updatedAt = nowIso();
    this.saveAll(tasks);
  }

  // 当前激活任务（UI 状态持久化）
  getActiveTaskId(): string | null {
    return localStorage.getItem(ACTIVE_TASK_KEY);
  }

  setActiveTaskId(id: string | null): void {
    if (id === null) {
      localStorage.removeItem(ACTIVE_TASK_KEY);
    } else {
      localStorage.setItem(ACTIVE_TASK_KEY, id);
    }
  }
}

export const procurementTaskService = new ProcurementTaskService();
export default procurementTaskService;
