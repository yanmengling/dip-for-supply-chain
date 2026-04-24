import type { MultiProductTask, MultiProductItem } from '../types/multiProductTask';
import type { ForecastRecordAPI } from './planningV2DataService';

const STORAGE_KEY = 'planning_multi_product_tasks';

function loadAll(): MultiProductTask[] {
  try {
    const json = localStorage.getItem(STORAGE_KEY);
    const tasks: MultiProductTask[] = json ? JSON.parse(json) : [];
    // 历史名称「大预测单 xxx」→ 现统一为「预测单任务 xxx」（以 forecastBillno 为准）
    let changed = false;
    for (const t of tasks) {
      if (t.name?.startsWith('大预测单 ') && t.forecastBillno) {
        t.name = `预测单任务 ${t.forecastBillno}`;
        changed = true;
      }
    }
    if (changed) {
      saveAll(tasks);
    }
    return tasks;
  } catch {
    return [];
  }
}

function saveAll(tasks: MultiProductTask[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

export function getTasks(): MultiProductTask[] {
  const tasks = loadAll();
  return tasks.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export function getTaskById(id: string): MultiProductTask | undefined {
  const tasks = loadAll();
  return tasks.find(t => t.id === id);
}

export function findActiveDuplicate(billno: string): MultiProductTask | undefined {
  const tasks = loadAll();
  return tasks.find(t => t.forecastBillno === billno && t.status === 'active');
}

export function createTask(params: { billno: string; forecastRecords: ForecastRecordAPI[] }): MultiProductTask {
  // Filter out closed records
  const activeRecords = params.forecastRecords.filter(
    r => r.closestatus_title !== '已关闭' // '已关闭' is the only closed status value in erp_mds_forecast
  );

  if (activeRecords.length === 0) {
    throw new Error(`No active forecast records for billno ${params.billno}`);
  }

  // Sort by enddate ascending
  activeRecords.sort((a, b) => a.enddate.localeCompare(b.enddate));

  // Map to MultiProductItem
  const products: MultiProductItem[] = activeRecords.map(r => ({
    productCode: r.material_number,
    productName: r.material_name,
    qty: r.qty,
    startDate: r.startdate,
    endDate: r.enddate,
    billno: r.billno,
  }));

  // Extract metadata from first non-closed record
  const firstRecord = activeRecords[0];
  const forecastMeta = {
    bizdate: firstRecord.bizdate,
    auditorName: firstRecord.auditor_name,
    creatorName: firstRecord.creator_name,
    totalProducts: products.length,
  };

  const now = new Date().toISOString();
  const task: MultiProductTask = {
    id: crypto.randomUUID(),
    taskType: 'multi-product',
    name: `预测单任务 ${params.billno}`,
    status: 'active',
    forecastBillno: params.billno,
    forecastMeta,
    products,
    createdAt: now,
    updatedAt: now,
  };

  // Prepend to list and save
  const tasks = loadAll();
  tasks.unshift(task);
  saveAll(tasks);

  return task;
}

export function closeTask(id: string): void {
  const tasks = loadAll();
  const task = tasks.find(t => t.id === id);
  if (task) {
    task.status = 'ended';
    task.updatedAt = new Date().toISOString();
    saveAll(tasks);
  }
}

export function deleteTask(id: string): void {
  const tasks = loadAll();
  const filtered = tasks.filter(t => t.id !== id);
  saveAll(filtered);
}

export function touchTask(id: string): void {
  const tasks = loadAll();
  const task = tasks.find(t => t.id === id);
  if (task) {
    task.updatedAt = new Date().toISOString();
    saveAll(tasks);
  }
}

export const multiProductTaskService = {
  getTasks,
  getTaskById,
  findActiveDuplicate,
  createTask,
  closeTask,
  deleteTask,
  touchTask,
};
