import type { PlanningTask } from '../types/planningV2';

const STORAGE_KEY = 'planning_v2_tasks';

function loadAll(): PlanningTask[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveAll(tasks: PlanningTask[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

/** 获取所有任务（自动过期检测 + 按创建时间倒序） */
export function getTasks(): PlanningTask[] {
  const tasks = loadAll();
  const now = new Date();
  let changed = false;
  for (const t of tasks) {
    if (t.status === 'active' && new Date(t.productionEnd) < now) {
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

/** 结束任务 */
export function endTask(id: string): void {
  const tasks = loadAll();
  const task = tasks.find(t => t.id === id);
  if (task) {
    task.status = 'ended';
    task.updatedAt = new Date().toISOString();
    saveAll(tasks);
  }
}

/** 删除任务 */
export function deleteTask(id: string): void {
  const tasks = loadAll().filter(t => t.id !== id);
  saveAll(tasks);
}

export const taskService = {
  getTasks,
  getRecentTasks,
  getTaskById,
  createTask,
  endTask,
  deleteTask,
};
