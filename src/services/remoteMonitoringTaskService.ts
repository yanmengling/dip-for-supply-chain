import { httpClient } from '../api/httpClient';
import type { QueryCondition, ObjectInstancesResponse } from '../api/ontologyApiTypes';
import type { PlanningTask } from '../types/planningV2';

const QUERY_KN_ID = 'supplychain_hd0202_test';
const OBJECT_TYPE_ID = 'supplychain_hd0202_monitoring_task';
const QUERY_URL = `/api/ontology-query/v1/knowledge-networks/${QUERY_KN_ID}/object-types/${OBJECT_TYPE_ID}`;

interface RemoteMonitoringTaskRow {
  task_id?: string;
  task_name?: string;
  task_status?: string;
  created_at?: string;
  updated_at?: string;
  ended_at?: string;
  product_code?: string;
  product_name?: string;
  demand_start?: string;
  demand_end?: string;
  demand_quantity?: number | string;
  production_start?: string;
  production_end?: string;
  production_quantity?: number | string;
  description_entries?: unknown;
}

function normalizeStatus(value?: string): PlanningTask['status'] {
  switch ((value ?? '').toLowerCase()) {
    case 'active':
    case '开始':
    case '进行中':
    case 'pending':
    case 'running':
      return 'active';
    case 'completed':
    case '已完成':
      return 'completed';
    case 'incomplete':
    case '未完成':
      return 'incomplete';
    case 'expired':
    case '已过期':
      return 'expired';
    default:
      return 'active';
  }
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function extractForecastBillnos(descriptionEntries: unknown): string[] {
  if (!descriptionEntries || typeof descriptionEntries !== 'object') return [];
  const raw = (descriptionEntries as Record<string, unknown>).related_forecast_billnos;
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string');
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapRemoteRowToPlanningTask(row: RemoteMonitoringTaskRow): PlanningTask | null {
  if (!row.task_id || !row.task_name || !row.product_code) return null;

  const status = normalizeStatus(row.task_status);
  const task: PlanningTask = {
    id: row.task_id,
    taskType: 'small-forecast',
    name: row.task_name,
    status,
    createdAt: row.created_at || new Date().toISOString(),
    updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
    productCode: row.product_code,
    productName: row.product_name || '',
    demandStart: row.demand_start || '',
    demandEnd: row.demand_end || '',
    demandQuantity: toNumber(row.demand_quantity),
    relatedForecastBillnos: extractForecastBillnos(row.description_entries),
  };

  if (row.production_start) task.productionStart = row.production_start;
  if (row.production_end) task.productionEnd = row.production_end;
  if (row.production_quantity != null) task.productionQuantity = toNumber(row.production_quantity);
  if (row.ended_at) task.endedAt = row.ended_at;

  if (task.status === 'active' && task.demandEnd && new Date(task.demandEnd) < new Date()) {
    task.status = 'expired';
  }

  return task;
}

async function queryRemoteTasks(condition?: QueryCondition): Promise<PlanningTask[]> {
  const body: Record<string, unknown> = {
    limit: 200,
    need_total: true,
  };
  if (condition) body.condition = condition;

  const response = await httpClient.postAsGet<ObjectInstancesResponse>(QUERY_URL, body);
  // Ontology query returns "datas" key; fall back to "entries" for type compatibility.
  const entries = (response.data as unknown as { datas?: unknown[] }).datas ?? response.data.entries ?? [];
  return entries
    .map(entry => mapRemoteRowToPlanningTask(entry as RemoteMonitoringTaskRow))
    .filter((task): task is PlanningTask => Boolean(task))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function listRemoteMonitoringTasks(): Promise<PlanningTask[]> {
  return queryRemoteTasks();
}

export async function getRemoteMonitoringTaskById(taskId: string): Promise<PlanningTask | undefined> {
  const condition: QueryCondition = {
    field: 'task_id',
    operation: '==',
    value: taskId,
  };
  const tasks = await queryRemoteTasks(condition);
  return tasks[0];
}

