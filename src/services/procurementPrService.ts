/**
 * 采购工作台 - PR 跟单数据服务
 *
 * 数据源：知识网络 supplychain_hd0202_pr
 * 过滤策略：4 维过滤之间取「并集」（OR）；可选追加「关闭/终止」排除条件（AND）
 * 分页：cursor (search_after) 模式 + need_total
 */

import { ontologyApi } from '../api/ontologyApi';
import type { QueryCondition, QueryObjectInstancesOptions } from '../api/ontologyApiTypes';
import type { ProcurementTaskFilter } from '../types/procurementWorkbench';

const PR_OBJECT_TYPE_ID = 'supplychain_hd0202_pr';

/** PR 跟单展示用的字段子集（来自 v3 知识网络 supplychain_hd0202_pr） */
export interface PrRow {
  /** 行主键（明细主键） */
  entry_id: string;
  /** PR 主键 */
  id: string;
  /** PR 单号 */
  billno: string;
  /** 生产项目号 */
  huid_xmh_name: string;
  /** 物料编码 */
  material_number: string;
  /** 物料名称 */
  material_name: string;
  /** 数量 */
  qty: number;
  /** 已下推采购订单数量 */
  joinqty: number;
  /** 单位 */
  unit_name?: string;
  /** 业务时间 */
  biztime?: string;
  /** 审核时间 */
  auditdate?: string;
  /** 关闭状态 */
  rowclosestatus_title?: string;
  /** 终止状态 */
  rowterminatestatus_title?: string;
}

export interface PrPageResult {
  rows: PrRow[];
  total: number;
  /** 下一页游标；undefined 表示已到末页 */
  nextCursor?: any[];
}

export interface PrQueryOptions {
  /** 每页条数（默认 10） */
  pageSize?: number;
  /** 上一页返回的游标 */
  cursor?: any[];
  /** 是否包含「已关闭/已终止」（默认 false 即排除） */
  includeClosed?: boolean;
  /**
   * 额外的 AND 条件（用于搜索/状态过滤）。
   * 会与任务过滤条件做 AND 拼接。
   */
  extraAndConditions?: QueryCondition[];
}

/**
 * 把任务过滤条件转成 OntologyQuery 的 condition 子树
 *
 * - 4 维过滤之间使用 OR（任一维匹配即纳入）
 * - 同维度内多值使用 IN（material_names 例外，逐个 like）
 * - includeClosed=false 时整体外层再 AND 排除关闭/终止
 *
 * 返回 null 表示过滤为空（调用方应直接返回空结果，避免全量扫描）
 */
export function buildPrCondition(
  filter: ProcurementTaskFilter,
  includeClosed: boolean,
): QueryCondition | null {
  const orBranches: QueryCondition[] = [];

  if (filter.prBillnos.length > 0) {
    orBranches.push({ field: 'billno', operation: 'in', value: filter.prBillnos });
  }
  if (filter.projectIds.length > 0) {
    orBranches.push({ field: 'huid_xmh_name', operation: 'in', value: filter.projectIds });
  }
  if (filter.materialNumbers.length > 0) {
    orBranches.push({ field: 'material_number', operation: 'in', value: filter.materialNumbers });
  }
  if (filter.materialNames.length > 0) {
    // 模糊匹配多关键词：每个关键词一条 like，再 OR
    for (const kw of filter.materialNames) {
      orBranches.push({ field: 'material_name', operation: 'like', value: `%${kw}%` });
    }
  }

  if (orBranches.length === 0) return null;

  const filterCondition: QueryCondition =
    orBranches.length === 1
      ? orBranches[0]
      : { operation: 'or', sub_conditions: orBranches };

  if (includeClosed) {
    return filterCondition;
  }

  return {
    operation: 'and',
    sub_conditions: [
      filterCondition,
      { field: 'rowclosestatus_title', operation: '!=', value: '已关闭' },
      { field: 'rowterminatestatus_title', operation: '!=', value: '已终止' },
    ],
  };
}

/** 单页查询 PR 列表 */
export async function queryPrPage(
  filter: ProcurementTaskFilter,
  options: PrQueryOptions = {},
): Promise<PrPageResult> {
  const { pageSize = 10, cursor, includeClosed = false, extraAndConditions } = options;

  const baseCondition = buildPrCondition(filter, includeClosed);
  if (!baseCondition) {
    return { rows: [], total: 0, nextCursor: undefined };
  }

  // 合并额外 AND 条件（搜索/状态筛选）
  const condition: QueryCondition =
    extraAndConditions && extraAndConditions.length > 0
      ? { operation: 'and', sub_conditions: [baseCondition, ...extraAndConditions] }
      : baseCondition;

  const response = await ontologyApi.queryObjectInstances(PR_OBJECT_TYPE_ID, {
    condition,
    limit: pageSize,
    need_total: true,
    search_after: cursor,
  });

  const rows: PrRow[] = (response.entries ?? []).map(normalizePrRow);
  return {
    rows,
    total: response.total_count ?? rows.length,
    nextCursor: response.search_after && response.search_after.length > 0 ? response.search_after : undefined,
  };
}

/** 关键词搜索 PR 的分页选项（无任务过滤，仅 OR 关键词） */
export interface PrKeywordSearchPageOptions {
  pageSize?: number;
  cursor?: unknown[];
}

/**
 * 关键词搜索 PR 明细（跨 4 字段 OR），与 PR 跟单同源字段；支持游标分页与总数。
 *
 * 搜索范围：billno / huid_xmh_name / material_number / material_name，均 like %keyword%
 * 关键词为空时返回空页。
 */
export async function searchPrRecordsPage(
  keyword: string,
  options: PrKeywordSearchPageOptions = {},
): Promise<PrPageResult> {
  const kw = keyword.trim();
  const { pageSize = 10, cursor } = options;
  if (!kw) {
    return { rows: [], total: 0, nextCursor: undefined };
  }

  const condition: QueryCondition = {
    operation: 'or',
    sub_conditions: [
      { field: 'billno', operation: 'like', value: `%${kw}%` },
      { field: 'huid_xmh_name', operation: 'like', value: `%${kw}%` },
      { field: 'material_number', operation: 'like', value: `%${kw}%` },
      { field: 'material_name', operation: 'like', value: `%${kw}%` },
    ],
  };

  const response = await ontologyApi.queryObjectInstances(PR_OBJECT_TYPE_ID, {
    condition,
    limit: pageSize,
    need_total: true,
    search_after: cursor as QueryObjectInstancesOptions['search_after'],
  });

  const rows: PrRow[] = (response.entries ?? []).map(normalizePrRow);
  return {
    rows,
    total: response.total_count ?? rows.length,
    nextCursor:
      response.search_after && response.search_after.length > 0 ? response.search_after : undefined,
  };
}

export interface PrCountStats {
  /** 全部 PR 行数（含关闭/终止） */
  totalRows: number;
  /** joinqty < qty 的行数：该 PR 行尚未完全下推到 PO */
  pendingRows: number;
}

/**
 * 统计任务范围内 PR 行总数和待转单行数
 *
 * - 包含已关闭/终止（全量统计口径）
 * - 每批 1000 条游标取数，仅累计计数，不保留完整行对象
 * - "待转单"定义：joinqty < qty，即该行数量尚未完全下推到采购订单
 */
export async function fetchPrCountStats(
  filter: ProcurementTaskFilter,
  batchSize = 1000,
): Promise<PrCountStats> {
  const condition = buildPrCondition(filter, true /* includeClosed */);
  if (!condition) return { totalRows: 0, pendingRows: 0 };

  let totalRows = 0;
  let pendingRows = 0;
  let cursor: any[] | undefined;
  const MAX_TOTAL = 50000;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const resp = await ontologyApi.queryObjectInstances(PR_OBJECT_TYPE_ID, {
      condition,
      limit: batchSize,
      need_total: false,
      search_after: cursor,
    });
    const entries = resp.entries ?? [];
    for (const e of entries) {
      totalRows++;
      const qty = Number((e as any).qty ?? 0);
      const joinqty = Number((e as any).joinqty ?? 0);
      if (joinqty < qty) pendingRows++;
    }
    if (!resp.search_after || resp.search_after.length === 0 || entries.length < batchSize) break;
    if (totalRows >= MAX_TOTAL) {
      console.warn(`[procurementPrService] fetchPrCountStats 达到 MAX_TOTAL=${MAX_TOTAL}，可能未取完`);
      break;
    }
    cursor = resp.search_after;
  }

  return { totalRows, pendingRows };
}

/**
 * 全量取 PR 单号集合（仅用于 PO 模块的反向关联）
 *
 * 因 PO 服务端 IN 通常有上限，调用方需要按 chunk（如 100 个/批）拆分查询。
 */
export async function fetchAllPrBillnos(
  filter: ProcurementTaskFilter,
  includeClosed = false,
  batchSize = 1000,
): Promise<string[]> {
  const condition = buildPrCondition(filter, includeClosed);
  if (!condition) return [];

  const billnos = new Set<string>();
  let cursor: any[] | undefined;

  // 防御：单任务最多取 50000 条 PR，避免异常配置打爆
  const MAX_TOTAL = 50000;
  let fetched = 0;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const resp = await ontologyApi.queryObjectInstances(PR_OBJECT_TYPE_ID, {
      condition,
      limit: batchSize,
      need_total: false,
      search_after: cursor,
    });
    const entries = resp.entries ?? [];
    for (const e of entries) {
      const bn = (e as any).billno;
      if (bn) billnos.add(String(bn));
    }
    fetched += entries.length;
    if (!resp.search_after || resp.search_after.length === 0 || entries.length < batchSize) break;
    if (fetched >= MAX_TOTAL) {
      console.warn(`[procurementPrService] fetchAllPrBillnos 达到 MAX_TOTAL=${MAX_TOTAL}，可能未取完`);
      break;
    }
    cursor = resp.search_after;
  }

  return Array.from(billnos);
}

function normalizePrRow(raw: any): PrRow {
  return {
    entry_id: String(raw.entry_id ?? ''),
    id: String(raw.id ?? ''),
    billno: String(raw.billno ?? ''),
    huid_xmh_name: String(raw.huid_xmh_name ?? ''),
    material_number: String(raw.material_number ?? ''),
    material_name: String(raw.material_name ?? ''),
    qty: Number(raw.qty ?? 0),
    joinqty: Number(raw.joinqty ?? 0),
    unit_name: raw.unit_name != null ? String(raw.unit_name) : undefined,
    biztime: raw.biztime != null ? String(raw.biztime) : undefined,
    auditdate: raw.auditdate != null ? String(raw.auditdate) : undefined,
    rowclosestatus_title: raw.rowclosestatus_title != null ? String(raw.rowclosestatus_title) : undefined,
    rowterminatestatus_title: raw.rowterminatestatus_title != null ? String(raw.rowterminatestatus_title) : undefined,
  };
}
