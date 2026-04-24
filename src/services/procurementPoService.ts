/**
 * 采购工作台 - PO 跟单数据服务
 *
 * 数据源：knowledge network supplychain_hd0202_po
 * 关联策略：通过任务过滤命中的 PR 单号集合反查 PO（po.srcbillnumber IN prBillnos）
 * 取数模式：分块（100/批，并发 5）全量取回 → 前端排序/去重/分页（与 planningV2DataService 同款实践）
 *
 * 状态计算（前端推导）优先级从高到低：
 *   已关闭 → 已终止 → 已到齐 → 部分到货-逾期 → 部分到货 → 未到货-逾期 → 未到货
 */

import { ontologyApi } from '../api/ontologyApi';
import type { ProcurementTaskFilter } from '../types/procurementWorkbench';
import { fetchAllPrBillnos } from './procurementPrService';

const PO_OBJECT_TYPE_ID = 'supplychain_hd0202_po';
const BATCH_CHUNK_SIZE = 100;
const CHUNK_CONCURRENCY = 5;

export type PoStatus =
  | 'closed' // 已关闭
  | 'terminated' // 已终止
  | 'fulfilled' // 已到齐
  | 'partial_overdue' // 部分到货-逾期
  | 'partial' // 部分到货
  | 'pending_overdue' // 未到货-逾期
  | 'pending'; // 未到货

export interface PoRow {
  /** 行主键（明细主键 entry_id） */
  entry_id: string;
  /** PO 单号 */
  billno: string;
  /** 来源 PR 单号 */
  srcbillnumber: string;
  /** 供应商编码 */
  supplier_number?: string;
  /** 供应商名称 */
  supplier_name: string;
  /** 物料编码 */
  material_number: string;
  /** 物料名称 */
  material_name: string;
  /** 采购数量 */
  qty: number;
  /** 实际入库数量 */
  actqty: number;
  /** 入库数量（含未结/已结） */
  invqty: number;
  /** 退库数量 */
  returnqty?: number;
  /** 预计交货日期 (YYYY-MM-DD) */
  deliverdate: string;
  /** 审核时间 */
  auditdate?: string;
  /** 关闭状态 */
  rowclosestatus_title?: string;
  /** 终止状态 */
  rowterminatestatus_title?: string;
  /** 衍生：剩余天数（deliverdate - today，负数即逾期天数） */
  remainingDays: number | null;
  /** 衍生：状态枚举 */
  status: PoStatus;
}

export interface PoQueryOptions {
  /** 是否包含「已关闭/已终止」（默认 false 即排除） */
  includeClosed?: boolean;
}

export interface PoFullResult {
  /** 排序后的全量 PO 列表（按交期升序，无交期排末） */
  rows: PoRow[];
  /** 命中的 PR 单号数（用于 UI 提示） */
  prBillnoCount: number;
  /** 总条数（== rows.length，便于消费方对齐 PR 模块语义） */
  total: number;
}

/**
 * 全量取该任务范围下的 PO（前端分页消费）
 *
 * 流程：
 *   1. 调 fetchAllPrBillnos 拿到 PR 单号集合（已排除关闭/终止）
 *   2. 切 100/批，并发 5，IN 查询 PO
 *   3. 前端归并、去重 (entry_id)、排序、状态衍生
 */
export async function fetchAllPoByTask(
  filter: ProcurementTaskFilter,
  options: PoQueryOptions = {},
): Promise<PoFullResult> {
  const { includeClosed = false } = options;

  // Step 1: 拿到 PR 单号集合（PR 端是否排除关闭/终止由 includeClosed 决定，与 PO 模块过滤口径一致）
  const prBillnos = await fetchAllPrBillnos(filter, includeClosed);
  if (prBillnos.length === 0) {
    return { rows: [], prBillnoCount: 0, total: 0 };
  }

  // Step 2: 分块并发查询 PO
  const chunks = chunkArray(prBillnos, BATCH_CHUNK_SIZE);
  const allEntries: any[] = [];

  for (let i = 0; i < chunks.length; i += CHUNK_CONCURRENCY) {
    const batch = chunks.slice(i, i + CHUNK_CONCURRENCY);
    const results = await Promise.all(
      batch.map(async (chunk) => {
        const conditions: any[] = [
          { field: 'srcbillnumber', operation: 'in', value: chunk },
        ];
        if (!includeClosed) {
          conditions.push(
            { field: 'rowclosestatus_title', operation: '!=', value: '已关闭' },
            { field: 'rowterminatestatus_title', operation: '!=', value: '已终止' },
          );
        }
        const resp = await ontologyApi.queryObjectInstances(PO_OBJECT_TYPE_ID, {
          condition: { operation: 'and', sub_conditions: conditions },
          limit: 10000,
          need_total: false,
          timeout: 120000,
        });
        return resp.entries ?? [];
      }),
    );
    for (const arr of results) allEntries.push(...arr);
  }

  // Step 3: 去重 + 归一化 + 状态推导
  const seen = new Set<string>();
  const today = todayYmd();
  const rows: PoRow[] = [];
  for (const raw of allEntries) {
    const key = String(raw.entry_id ?? '') || `${raw.billno ?? ''}-${raw.material_number ?? ''}-${raw.srcbillnumber ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push(normalizePoRow(raw, today));
  }

  // 排序：交期升序；无交期排末；同交期再按 PO 单号
  rows.sort((a, b) => {
    const ad = a.deliverdate || '9999-99-99';
    const bd = b.deliverdate || '9999-99-99';
    if (ad !== bd) return ad < bd ? -1 : 1;
    return a.billno.localeCompare(b.billno);
  });

  return { rows, prBillnoCount: prBillnos.length, total: rows.length };
}

/** 前端分页：从全量结果切片 */
export function paginatePoRows(rows: PoRow[], pageIndex: number, pageSize = 10): PoRow[] {
  const start = pageIndex * pageSize;
  return rows.slice(start, start + pageSize);
}

// =====================================================================
// helpers
// =====================================================================

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function todayYmd(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function normalizePoRow(raw: any, today: string): PoRow {
  const qty = Number(raw.qty ?? 0);
  const actqty = Number(raw.actqty ?? 0);
  const deliverdate = normalizeDate(raw.deliverdate);
  const closed = raw.rowclosestatus_title === '已关闭';
  const terminated = raw.rowterminatestatus_title === '已终止';
  const remainingDays = deliverdate ? daysBetween(today, deliverdate) : null;
  const overdue = remainingDays != null && remainingDays < 0;

  let status: PoStatus;
  if (closed) status = 'closed';
  else if (terminated) status = 'terminated';
  else if (qty > 0 && actqty >= qty) status = 'fulfilled';
  else if (actqty > 0 && actqty < qty) status = overdue ? 'partial_overdue' : 'partial';
  else status = overdue ? 'pending_overdue' : 'pending';

  return {
    entry_id: String(raw.entry_id ?? ''),
    billno: String(raw.billno ?? ''),
    srcbillnumber: String(raw.srcbillnumber ?? ''),
    supplier_number: raw.supplier_number != null ? String(raw.supplier_number) : undefined,
    supplier_name: String(raw.supplier_name ?? ''),
    material_number: String(raw.material_number ?? ''),
    material_name: String(raw.material_name ?? ''),
    qty,
    actqty,
    invqty: Number(raw.invqty ?? 0),
    returnqty: raw.returnqty != null ? Number(raw.returnqty) : undefined,
    deliverdate,
    auditdate: raw.auditdate != null ? String(raw.auditdate) : undefined,
    rowclosestatus_title: raw.rowclosestatus_title != null ? String(raw.rowclosestatus_title) : undefined,
    rowterminatestatus_title: raw.rowterminatestatus_title != null ? String(raw.rowterminatestatus_title) : undefined,
    remainingDays,
    status,
  };
}

/** 归一为 YYYY-MM-DD；空/非法返回空串 */
function normalizeDate(raw: any): string {
  if (!raw) return '';
  const s = String(raw);
  if (s.includes('T')) return s.split('T')[0];
  if (s.includes(' ')) return s.split(' ')[0];
  return s;
}

/** end - start 天数；输入为 YYYY-MM-DD */
function daysBetween(start: string, end: string): number {
  const a = new Date(`${start}T00:00:00Z`).getTime();
  const b = new Date(`${end}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}
