/**
 * supplyStatusService.ts
 *
 * 供应状态判断纯函数模块（单品物料监测）
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 状态判断规则（顺序判断，匹配即返回）
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * 前提计算：
 *   supply = (availableInventoryQty ?? 0) + (inTransitQty ?? 0)
 *
 * [STEP 1] supply >= (grossRequirement ?? 0)
 *   → 'sufficient'（库存满足，无需进一步判断）
 *
 * [STEP 2] 外购 / 委外 物料：
 *   2.1 无 MRP 记录（hasMRP = false）
 *       → 'anomaly'
 *   2.2 有 PO（poStatus = 'has_po'）且 poDeliverDate ≤ 今天
 *       → 'po_overdue'（PO 交期已过）
 *   2.3 有 PO 且 poDeliverDate > endDate
 *       → 'deadline_risk'（PO 交期超过需求截止日）
 *   2.4 无 PO 且 (今天 + standardLeadtime) > endDate
 *       → 'deadline_risk'（现在下单也来不及）
 *   2.5 无 PR（prStatus = 'no_pr'）
 *       → 'no_pr'
 *   2.6 有 PR 且无 PO（poStatus = 'no_po'）
 *       → 'no_po'
 *   2.7 其他（有 PR、有 PO、未交期）
 *       → 'po_in_transit'
 *
 * [STEP 3] 自制 物料：
 *   3.1 hasShortage = true
 *       → 'child_short'（子件缺口，等待齐套）
 *   3.2 无 MRP 记录
 *       → 'unscheduled'（子料齐套，但未下达生产计划）
 *   3.3 有 MRP 记录
 *       → 'plan_gap'（库存缺口，有计划）
 *
 * [STEP 4] 其他类型物料：
 *   4.1 无 MRP 记录
 *       → 'anomaly'
 *   4.2 有 MRP 记录
 *       → 'plan_gap'
 *
 * ══════════════════════════════════════════════════════════════════════════════
 * 风险等级映射
 * ══════════════════════════════════════════════════════════════════════════════
 *   danger  : anomaly, deadline_risk, po_overdue
 *   warning : no_pr, no_po, child_short
 *   info    : unscheduled, plan_gap, po_in_transit
 *   normal  : sufficient
 * ══════════════════════════════════════════════════════════════════════════════
 */

import type { KeyMonitorMaterial } from '../types/planningV2';

// ─── Types ────────────────────────────────────────────────────────────────────

export type MaterialSupplyStatus =
  | 'sufficient'
  | 'anomaly'
  | 'deadline_risk'
  | 'no_pr'
  | 'no_po'
  | 'po_overdue'
  | 'child_short'
  | 'unscheduled'
  | 'plan_gap'
  | 'po_in_transit';

export type RiskLevel = 'danger' | 'warning' | 'info' | 'normal';

// ─── Internal helper ──────────────────────────────────────────────────────────

/**
 * Returns the number of calendar days from today to `dateStr`.
 * Negative = dateStr is in the past, positive = future.
 */
function daysFromToday(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const t = new Date(dateStr);
  t.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - today.getTime()) / 86400000);
}

// ─── Core status logic ────────────────────────────────────────────────────────

/**
 * Derives the supply status for a single monitored material.
 * Rules are applied in strict priority order — return on first match.
 */
export function getSupplyStatus(m: KeyMonitorMaterial): MaterialSupplyStatus {
  const supply = (m.availableInventoryQty ?? 0) + (m.inTransitQty ?? 0);
  const grossReq = m.grossRequirement ?? 0;

  // Step 1: supply sufficient
  if (supply >= grossReq) return 'sufficient';

  const isExternal = m.materialType === '外购' || m.materialType === '委外';
  const isSelfMade = m.materialType === '自制';

  // Step 2: external materials
  if (isExternal) {
    if (!m.hasMRP) return 'anomaly';

    if (m.poStatus === 'has_po' && m.poDeliverDate) {
      if (daysFromToday(m.poDeliverDate) <= 0) return 'po_overdue';
      if (daysFromToday(m.poDeliverDate) > daysFromToday(m.endDate)) return 'deadline_risk';
    }

    if (m.poStatus !== 'has_po') {
      // No PO — check if ordering now is too late
      const daysUntilEnd = daysFromToday(m.endDate);
      if (m.standardLeadtime > daysUntilEnd) return 'deadline_risk';
    }

    if (m.prStatus === 'no_pr') return 'no_pr';
    if (m.prStatus === 'has_pr' && m.poStatus === 'no_po') return 'no_po';
    return 'po_in_transit';
  }

  // Step 3: self-made materials
  if (isSelfMade) {
    if (m.hasShortage) return 'child_short';
    if (!m.hasMRP) return 'unscheduled';
    return 'plan_gap';
  }

  // Step 4: other types
  if (!m.hasMRP) return 'anomaly';
  return 'plan_gap';
}

// ─── Risk level ───────────────────────────────────────────────────────────────

export function getRiskLevel(status: MaterialSupplyStatus): RiskLevel {
  switch (status) {
    case 'anomaly':
    case 'deadline_risk':
    case 'po_overdue':
      return 'danger';
    case 'no_pr':
    case 'no_po':
    case 'child_short':
      return 'warning';
    case 'unscheduled':
    case 'plan_gap':
    case 'po_in_transit':
      return 'info';
    case 'sufficient':
    default:
      return 'normal';
  }
}

// ─── Human-readable text ──────────────────────────────────────────────────────

export function getSupplyStatusText(
  m: KeyMonitorMaterial,
  status: MaterialSupplyStatus,
): string {
  switch (status) {
    case 'sufficient': {
      if (m.materialType === '外购' || m.materialType === '委外') {
        return m.hasMRP ? '库存满足，注意MRP有记录' : '库存满足，无需采购';
      }
      if (m.materialType === '自制') return '库存满足，暂无需生产';
      return '库存满足';
    }

    case 'anomaly':
      return '无MRP且库存不足，需ERP核查';

    case 'po_overdue': {
      const days = Math.abs(daysFromToday(m.poDeliverDate!));
      return `PO交期已过 ${days} 天，物料未到`;
    }

    case 'deadline_risk': {
      if (m.poStatus === 'has_po' && m.poDeliverDate) {
        return `PO交期 ${m.poDeliverDate} 超过需求截止日 ${m.endDate}`;
      }
      return `标准交期 ${m.standardLeadtime} 天已超截止日 ${m.endDate}，现在下单也来不及`;
    }

    case 'no_pr':
      return '有MRP缺口，尚未生成PR';

    case 'no_po':
      return 'PR已生成，尚未下达PO';

    case 'po_in_transit':
      return '有MRP缺口，PO在途';

    case 'child_short':
      return '子件有缺口，等待齐套';

    case 'unscheduled':
      return '子料已齐套，未下达生产计划';

    case 'plan_gap': {
      const supply = (m.availableInventoryQty ?? 0) + (m.inTransitQty ?? 0);
      const gap = Math.max(0, (m.grossRequirement ?? 0) - supply);
      return `库存缺口 ${gap} 件，子料已齐套`;
    }

    default:
      return '';
  }
}

// ─── Tailwind style helpers ───────────────────────────────────────────────────

export function getStatusTextColor(level: RiskLevel): string {
  switch (level) {
    case 'danger':  return 'text-red-600';
    case 'warning': return 'text-amber-600';
    case 'info':    return 'text-blue-600';
    case 'normal':  return 'text-green-600';
  }
}

export function getRowBgClass(level: RiskLevel): string {
  switch (level) {
    case 'danger':  return 'bg-red-50';
    case 'warning': return 'bg-amber-50/60';
    default:        return '';
  }
}
