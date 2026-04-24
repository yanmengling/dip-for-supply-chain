/**
 * 采购工作台 - 类型定义
 *
 * 对应 PRD `docs/PRD_采购数字员工_草案_20260409.md` v0.3.3 第 4 章
 */

/**
 * 任务过滤条件（四维；PR 查询时各维度分支之间为 OR，同维多值为 IN，见 buildPrCondition）。
 * 新建任务：按每条已加明细上「当前关键词」的命中字段（单号→项目号→物料编码→物料名称优先）
 * 写入对应维度，与跟单任务过滤语义一致。
 */
export interface ProcurementTaskFilter {
  /** PR 单号列表（精确匹配） */
  prBillnos: string[];
  /** 生产项目号列表（精确匹配，对应 pr.huid_xmh_name） */
  projectIds: string[];
  /** 物料编码列表（精确匹配） */
  materialNumbers: string[];
  /** 物料名称（模糊匹配） */
  materialNames: string[];
}

export type ProcurementTaskStatus = 'active' | 'archived';

/**
 * 任务级 PR 需求日期表项
 *
 * 来源优先级：用户修订 > ERP 同步值 > 未设置
 */
export interface PrDemandDateEntry {
  /** PR 单号 */
  prBillno: string;
  /** 需求日期 yyyy-mm-dd（未设置时为空字符串） */
  demandDate: string;
  /** 来源 */
  source: 'erp' | 'user' | 'import';
  /** ERP 原始值（仅当 source=user 时保留以便回退） */
  erpOriginalValue?: string;
  /** 最后修改时间 ISO-8601 */
  updatedAt: string;
}

/**
 * 采购工作台任务
 *
 * 持久化存储在 localStorage[procurement_workbench_tasks]
 */
export interface ProcurementTask {
  /** UUID */
  id: string;
  /** 用户自定义名称 */
  name: string;
  /** 创建人（Phase 1 不引入用户体系，所有用户共享，此处仅记录创建者标识） */
  createdBy: string;
  /** 创建时间 ISO-8601 */
  createdAt: string;
  /** 最后更新时间 ISO-8601 */
  updatedAt: string;
  /** 状态 */
  status: ProcurementTaskStatus;
  /** 过滤条件（创建时录入，可后续编辑） */
  filter: ProcurementTaskFilter;
  /** 任务级 PR 需求日期表（key = prBillno） */
  prDemandDates: Record<string, PrDemandDateEntry>;
}

/** 用于新建任务的输入 */
export interface CreateTaskInput {
  name: string;
  filter: ProcurementTaskFilter;
}

/** 校验过滤条件至少包含一个维度的非空值 */
export function isFilterEmpty(filter: ProcurementTaskFilter): boolean {
  return (
    filter.prBillnos.length === 0 &&
    filter.projectIds.length === 0 &&
    filter.materialNumbers.length === 0 &&
    filter.materialNames.length === 0
  );
}
