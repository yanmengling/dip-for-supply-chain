/**
 * Monitoring Task API Service — SupplyChainBrain
 *
 * 把 PlanningTask（localStorage "planning_v2_tasks"）转换为
 * monitoring_task 数据库行格式，用于 AI Agent 工具调用。
 *
 * 对应数据库表 DDL:
 *   CREATE TABLE monitoring_task (
 *     task_id VARCHAR(64) NOT NULL PRIMARY KEY,
 *     task_name VARCHAR(200) NOT NULL,
 *     task_status VARCHAR(100) NOT NULL DEFAULT 'active',
 *     created_at DATETIME(3) NOT NULL,
 *     updated_at DATETIME(3) NOT NULL,
 *     ended_at DATETIME(3) NULL DEFAULT NULL,
 *     description_entries JSON NULL,
 *     product_code VARCHAR(64) NOT NULL,
 *     product_name VARCHAR(200) NOT NULL,
 *     demand_start DATE NOT NULL,
 *     demand_end DATE NOT NULL,
 *     demand_quantity INT UNSIGNED NOT NULL,
 *     production_start DATE NOT NULL,
 *     production_end DATE NOT NULL,
 *     production_quantity INT UNSIGNED NOT NULL,
 *     created_by VARCHAR(64) NOT NULL,
 *     ...
 *   )
 */

import { getTasks } from './taskService';
import type { PlanningTask } from '../types/planningV2';

// ─── DB Row Types ─────────────────────────────────────────────────────────────

/**
 * monitoring_task 数据库行格式（snake_case，与 DB 列名一一对应）。
 */
export interface MonitoringTaskRecord {
    /** VARCHAR(64) PRIMARY KEY */
    task_id: string;
    /** VARCHAR(200) */
    task_name: string;
    /** VARCHAR(100): 'active' | 'ended' | 'expired' */
    task_status: string;
    /** DATETIME(3) ISO-8601 精确到毫秒 */
    created_at: string;
    /** DATETIME(3) ISO-8601 精确到毫秒 */
    updated_at: string;
    /** DATETIME(3) | null — 仅 ended/expired 时有值 */
    ended_at: string | null;
    /**
     * JSON null — 预留字段（当前 PlanningTask 无 MRP 摘要）。
     * 若后续 PlanningTask 增加 descriptionEntries 字段可在此填充。
     */
    description_entries: null;
    /** VARCHAR(64) */
    product_code: string;
    /** VARCHAR(200) */
    product_name: string;
    /** DATE YYYY-MM-DD */
    demand_start: string;
    /** DATE YYYY-MM-DD */
    demand_end: string;
    /** INT UNSIGNED */
    demand_quantity: number;
    /** DATE YYYY-MM-DD */
    production_start: string;
    /** DATE YYYY-MM-DD */
    production_end: string;
    /** INT UNSIGNED */
    production_quantity: number;
    /** VARCHAR(64) */
    created_by: string;
}

// ─── OpenAPI 3.0 Response Envelope ───────────────────────────────────────────

/** get_monitoring_tasks 工具的响应体（符合 OpenAPI 3.0） */
export interface GetMonitoringTasksResponse {
    success: boolean;
    total: number;
    data: MonitoringTaskRecord[];
    error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** 保证日期字符串为 YYYY-MM-DD 格式 */
function toDateOnly(value: string): string {
    if (!value) return '';
    // 已是 YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toISOString().slice(0, 10);
}

/** 保证 ISO-8601 精确到毫秒（DATETIME(3)）格式 */
function toDatetime3(value: string): string {
    if (!value) return new Date().toISOString();
    const d = new Date(value);
    if (isNaN(d.getTime())) return new Date().toISOString();
    return d.toISOString();
}

// ─── Mapping ──────────────────────────────────────────────────────────────────

/**
 * 将单个 PlanningTask 映射为 monitoring_task 数据库行。
 *
 * 字段对应关系：
 *   PlanningTask.id              → task_id
 *   PlanningTask.name            → task_name
 *   PlanningTask.status          → task_status
 *   PlanningTask.createdAt       → created_at
 *   PlanningTask.updatedAt       → updated_at
 *   (ended/expired 时)           → ended_at = updatedAt
 *   PlanningTask.productCode     → product_code
 *   PlanningTask.productName     → product_name
 *   PlanningTask.demandStart     → demand_start
 *   PlanningTask.demandEnd       → demand_end
 *   PlanningTask.demandQuantity  → demand_quantity
 *   PlanningTask.productionStart → production_start
 *   PlanningTask.productionEnd   → production_end
 *   PlanningTask.productionQuantity → production_quantity
 *   'dip-for-supply-chain'         → created_by
 */
export function mapPlanningTaskToRecord(task: PlanningTask): MonitoringTaskRecord {
    const isTerminated = (task.status as string) === 'ended' || task.status === 'expired';

    return {
        task_id: task.id,
        task_name: task.name || `${task.productCode}-${task.productName}`.slice(0, 200),
        task_status: task.status,
        created_at: toDatetime3(task.createdAt),
        updated_at: toDatetime3(task.updatedAt),
        // ended_at：使用 updatedAt 作为结束时间（taskService.endTask 在 end 时更新 updatedAt）
        ended_at: isTerminated ? toDatetime3(task.updatedAt) : null,
        description_entries: null,
        product_code: task.productCode,
        product_name: task.productName,
        demand_start: toDateOnly(task.demandStart),
        demand_end: toDateOnly(task.demandEnd),
        demand_quantity: task.demandQuantity,
        production_start: toDateOnly(task.demandStart),   // v3.1: 使用 demandStart 兼容 DIP 字段
        production_end: toDateOnly(task.demandEnd),
        production_quantity: task.demandQuantity,
        created_by: 'supply-chain-brain',
    };
}

/** 批量映射 */
export function mapPlanningTasksToRecords(tasks: PlanningTask[]): MonitoringTaskRecord[] {
    return tasks.map(mapPlanningTaskToRecord);
}

// ─── Entry points ─────────────────────────────────────────────────────────────

/**
 * 读取所有监测任务并转换为 DB 格式。
 * 内部调用 taskService.getTasks()，自动触发过期检测。
 */
export function getMonitoringTasksPayload(): MonitoringTaskRecord[] {
    const tasks = getTasks();
    return mapPlanningTasksToRecords(tasks);
}

/**
 * 构建 get_monitoring_tasks 工具的完整 OpenAPI 响应对象。
 */
export function buildGetMonitoringTasksResponse(): GetMonitoringTasksResponse {
    try {
        const data = getMonitoringTasksPayload();
        return { success: true, total: data.length, data };
    } catch (err) {
        return {
            success: false,
            total: 0,
            data: [],
            error: err instanceof Error ? err.message : 'Unknown error',
        };
    }
}

// ─── 业务知识网络行动类执行 ────────────────────────────────────────────────────

/**
 * 执行行动类 create_monitor_task
 *
 * API: POST /api/ontology-query/v1/knowledge-networks/supplychain_hd0202
 *           /action-types/create_monitor_task/execute
 *
 * 请求体: { _instance_identities: [], dynamic_params: { ...MonitoringTaskRecord } }
 */
const ACTION_TYPE_EXECUTE_PATH =
    '/api/ontology-query/v1/knowledge-networks/supplychain_hd0202/action-types/create_monitor_task/execute';

/**
 * 点击"添加监测任务"按钮时调用，通过行动类接口写入 DIP / MySQL。
 *
 * @param fields 表单字段（与 MonitoringTaskRecord / DB 列名对齐）
 * @returns { success, record }
 */
export async function pushFormDataToDIP(fields: {
    task_name: string;
    product_code: string;
    product_name: string;
    demand_start: string;
    demand_end: string;
    demand_quantity: number;
    production_start: string;
    production_end: string;
    production_quantity: number;
    created_by?: string;
}): Promise<{ success: boolean; record: MonitoringTaskRecord; error?: string }> {
    const now = new Date().toISOString();

    const record: MonitoringTaskRecord = {
        task_id: crypto.randomUUID(),
        task_name: fields.task_name,
        task_status: 'active',
        created_at: now,
        updated_at: now,
        ended_at: null,
        description_entries: null,
        product_code: fields.product_code,
        product_name: fields.product_name,
        demand_start: toDateOnly(fields.demand_start),
        demand_end: toDateOnly(fields.demand_end),
        demand_quantity: fields.demand_quantity,
        production_start: toDateOnly(fields.production_start),
        production_end: toDateOnly(fields.production_end),
        production_quantity: fields.production_quantity,
        created_by: fields.created_by ?? 'dip-for-supply-chain',
    };

    const body = {
        _instance_identities: [],
        dynamic_params: {
            data: {
                task_id: record.task_id,
                task_name: record.task_name,
                task_status: record.task_status,
                created_at: record.created_at,
                updated_at: record.updated_at,
                ended_at: record.ended_at ?? '',
                description_entries: record.description_entries ?? '',
                product_code: record.product_code,
                product_name: record.product_name,
                demand_start: record.demand_start,
                demand_end: record.demand_end,
                demand_quantity: record.demand_quantity,
                production_start: record.production_start,
                production_end: record.production_end,
                production_quantity: record.production_quantity,
                created_by: record.created_by,
            },
        },
    };

    try {
        const { fetchWithAuth } = await import('../api/httpClient');
        const res = await fetchWithAuth(ACTION_TYPE_EXECUTE_PATH, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });

        if (!res.ok) {
            const errText = await res.text().catch(() => '');
            console.warn('[MonitoringTask] Action type execute failed:', res.status, errText);
            return { success: false, record, error: `HTTP ${res.status}: ${errText}` };
        }

        console.log('[MonitoringTask] Action type executed:', record.task_id);
        return { success: true, record };

    } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error';
        console.warn('[MonitoringTask] Action type execute error:', msg);
        return { success: false, record, error: msg };
    }
}

