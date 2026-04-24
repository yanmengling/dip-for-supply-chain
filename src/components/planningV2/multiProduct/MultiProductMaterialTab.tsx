// src/components/planningV2/multiProduct/MultiProductMaterialTab.tsx

import React, { useState, useMemo, useEffect } from 'react';
import { ChevronDown, ChevronRight, Share2, Search, Filter } from 'lucide-react';
import { SharedMaterialPanel } from './SharedMaterialPanel';
import type { MultiProductGanttResult } from '../../../types/multiProductTask';
import { flattenGanttBars } from '../../../services/ganttService';
import type { GanttBar, MRPDetail, SupplyStatus } from '../../../types/planningV2';

interface MultiProductMaterialTabProps {
  result: MultiProductGanttResult | null;
  isLoading: boolean;
  externalSearch?: string;
  /** 已排产的 MRP 单号集合（sourcebillnumber），由 MultiProductTaskDetailView 统一加载 */
  scheduledMrpBillnos?: Set<string>;
}

type TypeFilter = 'all' | '外购' | '委外' | '自制';

/** 物料状态过滤选项 key */
export type StatusFilterKey =
  | 'anomaly'       // ① 数据异常-无MRP且库存不足
  | 'deadline_risk' // ② 外购/委外-交期风险
  | 'no_pr'         // ③ 外购/委外-未下PR
  | 'no_po'         // ④ 外购/委外-未下PO
  | 'po_overdue'    // ⑤ 外购/委外-PO已逾期
  | 'child_short'   // ⑥ 自制件-子料缺料
  | 'scheduled'     // ⑦ 自制件-齐套已排产
  | 'unscheduled'   // ⑧ 自制件-齐套未排产
  | 'plan_gap'      // ⑨ 自制件-有计划但有缺口
  | 'sufficient';   // ⑩ 所有物料-库存满足

const STATUS_FILTER_OPTIONS: { key: StatusFilterKey; label: string }[] = [
  { key: 'anomaly',       label: '数据异常-无MRP且库存不足' },
  { key: 'deadline_risk', label: '外购/委外-交期风险' },
  { key: 'no_pr',         label: '外购/委外-未下PR' },
  { key: 'no_po',         label: '外购/委外-未下PO' },
  { key: 'po_overdue',    label: '外购/委外-PO已逾期' },
  { key: 'child_short',   label: '自制件-子料缺料' },
  { key: 'scheduled',     label: '自制件-齐套已排产' },
  { key: 'unscheduled',   label: '自制件-齐套未排产' },
  { key: 'plan_gap',      label: '自制件-有计划但有缺口' },
  { key: 'sufficient',    label: '所有物料-库存满足' },
];

/** 风险选项 = 除 sufficient 以外的全部（选项①~⑨） */
const RISK_FILTER_KEYS: Set<StatusFilterKey> = new Set(
  STATUS_FILTER_OPTIONS.filter(o => o.key !== 'sufficient').map(o => o.key)
);

export function matchesStatusFilter(
  m: AggMaterial,
  key: StatusFilterKey,
  scheduledMrpBillnos: Set<string>,
): boolean {
  const isExternal = m.materialType === '外购' || m.materialType === '委外';
  const isSelfMade = m.materialType === '自制';
  const supply = m.availableInventoryQty + m.inTransitQty;
  const isSufficient = supply >= m.grossRequirement; // 库存满足需求

  // ── sufficient：库存满足（全类型，不论有无MRP） ──
  if (key === 'sufficient') return isSufficient;

  // ── 以下全部为风险/异常状态，库存满足的物料一律排除 ──
  if (isSufficient) return false;

  switch (key) {
    // ① 数据异常：无MRP且库存不足（外购/委外/自制均适用）
    case 'anomaly':
      return !m.hasMRP && !isSelfMade;

    // ② 外购/委外-交期风险：库存不足，且交期无法达成
    case 'deadline_risk': {
      if (!isExternal) return false;
      if (m.poStatus === 'has_po' && m.poDeliverDate) {
        // (a) PO交期已过今天
        if (daysFromToday(m.poDeliverDate) <= 0) return true;
        // (b) PO交期晚于物料需求截止日
        if (m.endDate) {
          const poDate = new Date(m.poDeliverDate); poDate.setHours(0, 0, 0, 0);
          const deadline = new Date(m.endDate); deadline.setHours(0, 0, 0, 0);
          if (poDate > deadline) return true;
        }
      }
      // (c) 无PO且 今天+采购提前期 > 需求截止日（现在下单也来不及）
      if (m.poStatus !== 'has_po' && m.endDate && m.standardLeadtime > 0) {
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const arrivalDate = new Date(today.getTime() + m.standardLeadtime * 86400000);
        const deadline = new Date(m.endDate); deadline.setHours(0, 0, 0, 0);
        if (arrivalDate > deadline) return true;
      }
      return false;
    }

    // ③ 外购/委外-未下PR：有MRP + 库存不足 + 无PR
    case 'no_pr':
      return isExternal && m.hasMRP && m.prStatus === 'no_pr';

    // ④ ��购/委外-未下PO：有MRP + 库存不足 + 有PR + 无PO
    case 'no_po':
      return isExternal && m.hasMRP && m.prStatus === 'has_pr' && m.poStatus === 'no_po';

    // ⑤ 外购/委外-PO已逾期：有PO + 库存不足 + PO交期已过
    case 'po_overdue':
      return isExternal && m.poStatus === 'has_po'
        && !!m.poDeliverDate && daysFromToday(m.poDeliverDate) <= 0;

    // ⑥ 自制件-子料缺料：库存不足 + 子料有缺口
    case 'child_short':
      return isSelfMade && m.shortageChildCount > 0;

    // ⑦ 自制件-齐套已排产：库存不足 + 子料无缺口 + 有工单关联MRP
    case 'scheduled': {
      if (!isSelfMade || m.shortageChildCount > 0) return false;
      return m.mrpDetails.some(d => d.mrpBillno && scheduledMrpBillnos.has(d.mrpBillno));
    }

    // ⑧ 自制件-齐套未排产：库存不足 + 无MRP + 子料无缺口
    case 'unscheduled':
      return isSelfMade && !m.hasMRP && m.shortageChildCount === 0;

    // ⑨ 自制件-有计划但有缺口：库存不足 + 有MRP
    case 'plan_gap':
      return isSelfMade && m.hasMRP;

    default:
      return false;
  }
}

const PAGE_SIZE = 20;

const supplyStatusPriority: Record<string, number> = {
  sufficient: 0,
  sufficient_no_mrp: 1,
  shortage: 2,
  anomaly: 3,
};

function worstSupplyStatus(a: SupplyStatus, b: SupplyStatus): SupplyStatus {
  return (supplyStatusPriority[a] ?? 0) >= (supplyStatusPriority[b] ?? 0) ? a : b;
}

function daysFromToday(dateStr: string): number {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t = new Date(dateStr); t.setHours(0, 0, 0, 0);
  return Math.round((t.getTime() - today.getTime()) / 86400000);
}

export interface AggMaterial {
  materialCode: string;
  materialName: string;
  materialType: string;
  bomLevel: number;
  parentCode: string;
  leadtime: number;
  standardLeadtime: number;
  /** 物料需求截止日（取各产品 GanttBar 中最早的 endDate） */
  endDate?: string;
  supplyStatus: SupplyStatus;
  hasMRP: boolean;
  hasShortage: boolean;
  prStatus: 'has_pr' | 'no_pr' | 'not_applicable';
  poStatus: 'has_po' | 'no_po' | 'not_applicable';
  poDeliverDate?: string;
  grossRequirement: number;
  netRequirement: number;
  availableInventoryQty: number;
  inTransitQty: number;
  mrpDetails: MRPDetail[];
  dropStatusTitle: string;
  isShared: boolean;
  shortageChildCount: number;
}

export function aggregateMaterials(result: MultiProductGanttResult): AggMaterial[] {
  const allBarsMap = new Map<string, GanttBar[]>();

  for (const entry of result.productGantts.values()) {
    if (!entry.loaded) continue;
    for (const bar of flattenGanttBars(entry.bars)) {
      if (!allBarsMap.has(bar.materialCode)) allBarsMap.set(bar.materialCode, []);
      allBarsMap.get(bar.materialCode)!.push(bar);
    }
  }

  const aggMap = new Map<string, AggMaterial>();

  for (const [materialCode, bars] of allBarsMap.entries()) {
    const first = bars[0];
    const mrpBillnoSeen = new Set<string>();
    const dedupedMrpDetails: MRPDetail[] = [];
    for (const bar of bars) {
      for (const d of bar.mrpDetails ?? []) {
        const key = d.mrpBillno || `${d.demandQty}_${d.dropStatusTitle}`;
        if (!mrpBillnoSeen.has(key)) {
          mrpBillnoSeen.add(key);
          dedupedMrpDetails.push(d);
        }
      }
    }

    let supplyStatus = first.supplyStatus ?? 'sufficient';
    let prStatus: 'has_pr' | 'no_pr' | 'not_applicable' = first.prStatus ?? 'not_applicable';
    let poStatus: 'has_po' | 'no_po' | 'not_applicable' = first.poStatus ?? 'not_applicable';
    let poDeliverDate: string | undefined = first.poDeliverDate;
    let netRequirement = first.netRequirement ?? 0;
    let grossRequirement = first.grossRequirement ?? 0;
    let hasShortage = first.hasShortage ?? false;
    let hasMRP = first.hasMRP ?? false;
    let inTransitQty = first.inTransitQty ?? 0;
    // 取各产品 bar 中最早的 endDate 作为物料需求截止日
    let earliestEndDate: Date | undefined = first.endDate instanceof Date ? first.endDate : undefined;
    const hasDropped = dedupedMrpDetails.some(d => d.dropStatusTitle === '已投放');

    for (let i = 1; i < bars.length; i++) {
      const bar = bars[i];
      supplyStatus = worstSupplyStatus(supplyStatus, bar.supplyStatus ?? 'sufficient');
      if (bar.prStatus === 'has_pr') prStatus = 'has_pr';
      else if (prStatus === 'not_applicable' && bar.prStatus === 'no_pr') prStatus = 'no_pr';
      if (bar.poStatus === 'has_po') poStatus = 'has_po';
      else if (poStatus === 'not_applicable' && bar.poStatus === 'no_po') poStatus = 'no_po';
      if (bar.poDeliverDate && (!poDeliverDate || bar.poDeliverDate > poDeliverDate)) {
        poDeliverDate = bar.poDeliverDate;
      }
      netRequirement += bar.netRequirement ?? 0;
      grossRequirement += bar.grossRequirement ?? 0;
      if (bar.hasShortage) hasShortage = true;
      if (bar.hasMRP) hasMRP = true;
      // 同一物料跨产品的在途量来自同一批PO，取最大值避免重复累加
      if ((bar.inTransitQty ?? 0) > inTransitQty) inTransitQty = bar.inTransitQty ?? 0;
      // 取最早 endDate
      if (bar.endDate instanceof Date) {
        if (!earliestEndDate || bar.endDate < earliestEndDate) earliestEndDate = bar.endDate;
      }
    }

    // 优先用 SharedMaterial.totalRequiredQty 作为毛需求：
    // 该值通过 BOM记录路径连乘积计算，能正确处理同一物料在同一BOM中出现在多条路径的情况。
    // bars BFS 每个物料只生成一条bar，无法表达多路径引用，会低估需求。
    const sharedEntry = result.sharedMaterials.get(materialCode);
    if (sharedEntry) grossRequirement = sharedEntry.totalRequiredQty;

    // 有MRP时：MRP计划量是整体计划，已在dedupedMrpDetails去重，直接用MRP合计作为grossRequirement
    // 避免多个产品bar各自把MRP量当grossRequirement累加导致翻倍
    const mrpTotal = dedupedMrpDetails.reduce((s, d) => s + d.demandQty, 0);
    if (mrpTotal > 0) grossRequirement = mrpTotal;

    aggMap.set(materialCode, {
      materialCode,
      materialName: first.materialName,
      materialType: first.materialType,
      bomLevel: Math.min(...bars.map(b => b.bomLevel)),
      parentCode: first.parentCode ?? '',
      leadtime: first.leadtime ?? 0,
      standardLeadtime: first.standardLeadtime ?? 0,
      endDate: earliestEndDate ? earliestEndDate.toISOString().slice(0, 10) : undefined,
      supplyStatus,
      hasMRP,
      hasShortage,
      prStatus,
      poStatus,
      poDeliverDate,
      grossRequirement,
      netRequirement,
      availableInventoryQty: first.availableInventoryQty ?? 0,
      inTransitQty,
      mrpDetails: dedupedMrpDetails,
      dropStatusTitle: hasDropped ? '已投放' : (dedupedMrpDetails.length > 0 ? '未投放' : ''),
      isShared: !result.exclusiveMaterialCodes.has(materialCode),
      shortageChildCount: 0,
    });
  }

  for (const [, agg] of aggMap.entries()) {
    if (agg.materialType !== '自制') continue;
    let cnt = 0;
    for (const [, child] of aggMap.entries()) {
      if (child.parentCode !== agg.materialCode) continue;
      // 统一使用 getChildShortage 判定：有缺口（供应量 < 需求量/计划量）即算缺料
      if (getChildShortage(child) > 0) cnt++;
    }
    agg.shortageChildCount = cnt;
  }

  return Array.from(aggMap.values());
}

export function getRiskText(m: AggMaterial): string {
  const isExternal = m.materialType === '外购' || m.materialType === '委外';
  const isSelfMade = m.materialType === '自制';
  const supply = m.availableInventoryQty + m.inTransitQty;

  // ── 第一步：库存满足需求 → 不再进入风险判定 ──
  if (supply >= m.grossRequirement) {
    if (m.hasMRP) return '库存满足，注意MRP有记录';
    if (isExternal) return '库存满足，无需采购';
    if (isSelfMade) return '库存满足，暂无需生产';
    return '库存满足';
  }

  // ── 第二步：库存不足，按物料类型分别判定 ──

  // 无MRP且库存不足 = 数据异常
  if (!m.hasMRP && !isSelfMade) return '无MRP且库存不足，需ERP核查';

  if (isSelfMade) {
    if (!m.hasMRP) {
      // 无MRP + 库存不足 → 需要生产 → 看子料
      if (m.shortageChildCount > 0) return `子料缺 ${m.shortageChildCount} 项，等待齐套`;
      return '子料已齐套，未下达生产计划';
    }
    // 有MRP + 库存不足 → 看子料齐套
    if (m.shortageChildCount > 0) return `子料缺 ${m.shortageChildCount} 项，等待齐套`;
    return `库存缺口 ${Math.max(0, m.grossRequirement - supply).toLocaleString()} 件，子料已齐套`;
  }

  if (isExternal) {
    // 有MRP + 库存不足 → 看采购进度
    if (m.poStatus === 'has_po' && m.poDeliverDate) {
      const days = daysFromToday(m.poDeliverDate);
      if (days <= 0) return `PO交期已过 ${Math.abs(days)} 天，物料未到`;
      if (days <= 3) return `PO交期还剩 ${days} 天，注意到货`;
    }
    if (m.prStatus !== 'has_pr') return '有MRP缺口，尚未生成PR';
    if (m.poStatus !== 'has_po') return 'PR已生成，尚未下达PO';
    return '有MRP缺口，PO在途';
  }

  return '';
}

/** 仅风险过滤：只保留需要人工介入的项，与 getRiskText 逻辑保持一致 */
export function isRiskItem(m: AggMaterial): boolean {
  const supply = m.availableInventoryQty + m.inTransitQty;

  // 库存满足需求 → 不算风险
  if (supply >= m.grossRequirement) return false;

  // 以下均为库存不足（supply < grossRequirement）
  const isExternal = m.materialType === '外购' || m.materialType === '委外';
  const isSelfMade = m.materialType === '自制';

  // 无MRP且库存不足 = 数据异常（全类型）
  if (!m.hasMRP && !isSelfMade) return true;

  if (isExternal) {
    // 有MRP + 库存不足 → 需跟踪采购进度，是风险
    return true;
  }

  if (isSelfMade) {
    // 库存不足 → 需要生产 → 是风险（不论有无MRP、子料状态如何）
    return true;
  }

  return false;
}

function riskTextColor(riskText: string): string {
  if (!riskText) return '';
  if (riskText.includes('核查') || riskText.includes('已过') || riskText.includes('未到')) {
    return 'text-red-600';
  }
  if (riskText.includes('还剩') || riskText.includes('尚未') || riskText.includes('等待') || riskText.includes('未生成') || riskText.includes('未下达') || riskText.includes('缺口')) {
    return 'text-amber-600';
  }
  if (riskText.includes('库存满足') || riskText.includes('无需') || riskText.includes('齐套')) {
    return 'text-green-600';
  }
  if (riskText.includes('PO在途')) {
    return 'text-blue-600';
  }
  return 'text-slate-500';
}

type ChildStatus = '有计划库存满足' | '库存满足' | '已有计划' | '计划不足' | '无计划' | '异常';

function getChildStatus(c: AggMaterial): ChildStatus {
  if (c.supplyStatus === 'anomaly') return '异常';
  const supply = c.availableInventoryQty + c.inTransitQty;
  const mrpQty = c.mrpDetails.reduce((s, d) => s + d.demandQty, 0);
  if (mrpQty > 0) {
    // 计划量优先：以mrpQty vs supply判断
    if (supply >= mrpQty) return '有计划库存满足'; // 有计划且库存已覆盖计划量
    return '已有计划'; // 计划已安排，缺口 = mrpQty - supply
  }
  // 无MRP：退回毛需求估算
  const demand = c.grossRequirement;
  if (supply >= demand) return '库存满足';
  return '无计划'; // 缺口 = demand - supply
}

function getChildShortage(c: AggMaterial): number {
  const supply = c.availableInventoryQty + c.inTransitQty;
  const mrpQty = c.mrpDetails.reduce((s, d) => s + d.demandQty, 0);
  if (mrpQty > 0) return Math.max(0, mrpQty - supply); // 计划量 - 供应量
  return Math.max(0, c.grossRequirement - supply); // 毛需求 - 供应量
}

function childStatusBadge(status: ChildStatus, shortage?: number) {
  switch (status) {
    case '有计划库存满足': return <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-50 text-green-600 border border-green-200">有计划，库存满足</span>;
    case '库存满足': return <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-50 text-green-600 border border-green-200">库存满足</span>;
    case '已有计划': return <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-50 text-blue-600 border border-blue-200">已有计划{shortage != null && shortage > 0 ? `，缺 ${shortage.toLocaleString()} 件` : ''}</span>;
    case '计划不足': return <span className="px-1.5 py-0.5 rounded text-[10px] bg-orange-50 text-orange-600 border border-orange-200">计划不足{shortage != null ? `，缺 ${shortage.toLocaleString()} 件` : ''}</span>;
    case '无计划': return <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-50 text-red-600 border border-red-200">无计划</span>;
    case '异常': return <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-50 text-amber-600 border border-amber-200">异常</span>;
  }
}

function SelfMadeChildPanel({ materialCode, allMaterials, sharedMaterialCodes, onSearch }: {
  materialCode: string;
  allMaterials: AggMaterial[];
  sharedMaterialCodes: Set<string>;
  onSearch: (q: string) => void;
}) {
  const children = allMaterials.filter(m => m.parentCode === materialCode);
  if (children.length === 0) {
    return <div className="px-6 py-3 text-xs text-slate-400 bg-slate-50">暂无子料数据</div>;
  }

  // Sort: anomaly/shortage first
  const sorted = [...children].sort((a, b) => {
    const sa = getChildStatus(a);
    const sb = getChildStatus(b);
    const order: Record<ChildStatus, number> = { '异常': 0, '无计划': 1, '计划不足': 2, '已有计划': 3, '库存满足': 4, '有计划库存满足': 5 };
    return order[sa] - order[sb];
  });

  const problemChildren = sorted.filter(c => {
    const s = getChildStatus(c);
    // 有缺口的状态：异常、无计划、计划不足、已有计划但缺口 > 0
    if (s === '异常' || s === '无计划' || s === '计划不足') return true;
    if (s === '已有计划' && getChildShortage(c) > 0) return true;
    return false;
  });

  return (
    <div className="px-6 py-3 bg-purple-50 border-t border-purple-100">
      <div className="text-xs font-medium text-purple-700 mb-2">
        子料齐套明细（共 {children.length} 种，{problemChildren.length} 种缺料）
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-500">
            <th className="text-left py-1 pr-3">物料编码</th>
            <th className="text-left py-1 pr-3">物料名称</th>
            <th className="text-left py-1 pr-3">类型</th>
            <th className="text-right py-1">需求量 / 计划量</th>
            <th className="text-right py-1 px-3">可用库存</th>
            <th className="text-left py-1">状态</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(c => {
            const status = getChildStatus(c);
            const isProblem = status === '异常' || status === '无计划' || status === '计划不足' || status === '已有计划';
            const mrpQty = c.mrpDetails.reduce((s, d) => s + d.demandQty, 0);
            const shortage = (status === '已有计划' || status === '计划不足') ? getChildShortage(c) : undefined;
            return (
              <tr key={c.materialCode} className={`border-t border-purple-100 ${isProblem ? '' : 'opacity-60'}`}>
                <td className="py-1 pr-3">
                  <button
                    type="button"
                    onClick={() => onSearch(c.materialCode)}
                    className="font-mono text-indigo-600 hover:text-indigo-800 hover:underline text-left cursor-pointer"
                  >{c.materialCode}</button>
                  {sharedMaterialCodes.has(c.materialCode) && (
                    <span className="ml-1 inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] bg-blue-50 text-blue-600 border border-blue-200 align-middle">
                      <Share2 className="w-2 h-2" />共用
                    </span>
                  )}
                </td>
                <td className="py-1 pr-3">
                  <button
                    type="button"
                    onClick={() => onSearch(c.materialCode)}
                    className="text-slate-600 hover:text-indigo-600 hover:underline text-left cursor-pointer"
                  >{c.materialName}</button>
                </td>
                <td className="py-1 pr-3 text-slate-500">{c.materialType}</td>
                <td className="py-1 text-right text-slate-600">
                  <span>{c.grossRequirement.toLocaleString()}</span>
                  <span className="text-slate-300 mx-1">/</span>
                  <span className={mrpQty > 0 ? 'text-blue-600' : 'text-slate-400'}>
                    {mrpQty > 0 ? mrpQty.toLocaleString() : '—'}
                  </span>
                </td>
                <td className="py-1 text-right px-3 text-slate-600">{c.availableInventoryQty.toLocaleString()}</td>
                <td className="py-1">{childStatusBadge(status, shortage)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function MrpDetailPanel({ mrpDetails, isSelfMade }: { mrpDetails: MRPDetail[]; isSelfMade?: boolean }) {
  const [open, setOpen] = useState(false);
  const title = 'MRP 明细';
  if (mrpDetails.length === 0) {
    return isSelfMade ? null : <div className="px-6 py-3 text-xs text-slate-400 bg-slate-50">无 MRP 记录</div>;
  }
  return (
    <div className="bg-blue-50 border-t border-blue-100">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 w-full px-6 py-2 text-xs font-medium text-blue-700 hover:bg-blue-100 transition-colors"
      >
        <span className="text-blue-500 text-[11px] leading-none flex-shrink-0">{open ? '▼' : '▶'}</span>
        <span>{title}（{mrpDetails.length} 条）</span>
      </button>
      {open && (
    <div className="px-6 pb-3">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-slate-500">
            <th className="text-left py-1 pr-3">MRP单号</th>
            <th className="text-right py-1 pr-3">{isSelfMade ? '计划数量' : '需求量'}</th>
            <th className="text-left py-1 pr-3">投放状态</th>
            {!isSelfMade && <th className="text-left py-1">PR状态</th>}
            {!isSelfMade && <th className="text-left py-1 px-3">PO状态</th>}
            {!isSelfMade && <th className="text-left py-1">PO交期</th>}
          </tr>
        </thead>
        <tbody>
          {mrpDetails.map((d, i) => (
            <tr key={d.mrpBillno || i} className="border-t border-blue-100">
              <td className="py-1 pr-3 font-mono text-slate-600">{d.mrpBillno || '—'}</td>
              <td className="py-1 pr-3 text-right text-slate-600">{d.demandQty.toLocaleString()}</td>
              <td className="py-1 pr-3">
                <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                  d.dropStatusTitle === '已投放'
                    ? 'bg-green-50 text-green-600 border border-green-200'
                    : 'bg-gray-50 text-gray-500 border border-gray-200'
                }`}>{d.dropStatusTitle || '—'}</span>
              </td>
              {!isSelfMade && (
                <td className="py-1">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                    d.hasPR
                      ? 'bg-green-50 text-green-600 border border-green-200'
                      : 'bg-orange-50 text-orange-600 border border-orange-200'
                  }`}>{d.hasPR ? '已PR' : '未PR'}</span>
                </td>
              )}
              {!isSelfMade && (
                <td className="py-1 px-3">
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                    d.hasPO
                      ? 'bg-green-50 text-green-600 border border-green-200'
                      : 'bg-red-50 text-red-600 border border-red-200'
                  }`}>{d.hasPO ? '已PO' : '未PO'}</span>
                </td>
              )}
              {!isSelfMade && (
                <td className="py-1 text-slate-600">{d.poDeliverDate || '—'}</td>
              )}
            </tr>
          ))}
          {/* 合计行 */}
          <tr className="border-t-2 border-blue-200 bg-blue-50/50">
            <td className="py-1 pr-3 text-slate-500 font-medium">合计</td>
            <td className="py-1 pr-3 text-right font-semibold text-slate-700">
              {mrpDetails.reduce((s, d) => s + d.demandQty, 0).toLocaleString()}
            </td>
            <td colSpan={isSelfMade ? 1 : 4} />
          </tr>
        </tbody>
      </table>
    </div>
      )}
    </div>
  );
}

export const MultiProductMaterialTab: React.FC<MultiProductMaterialTabProps> = ({
  result,
  isLoading,
  externalSearch,
  scheduledMrpBillnos = new Set(),
}) => {
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [statusFilters, setStatusFilters] = useState<Set<StatusFilterKey>>(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  // 外部搜索触发（从甘特图点击跳转）
  useEffect(() => {
    if (externalSearch !== undefined) {
      setSearchText(externalSearch);
      setExpandedRows(new Set());
      setCurrentPage(1);
    }
  }, [externalSearch]);

  const toggleExpand = (code: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  };

  const allMaterials = useMemo(() => {
    if (!result) return [];
    return aggregateMaterials(result);
  }, [result]);

  const sharedMaterialCodes = useMemo(() => {
    if (!result) return new Set<string>();
    // 共用物料 = 不在独占集合里的物料
    const codes = new Set<string>();
    for (const code of result.sharedMaterials.keys()) {
      if (!result.exclusiveMaterialCodes.has(code)) codes.add(code);
    }
    return codes;
  }, [result]);

  // 各状态选项的命中计数（基于 typeFilter + searchText 前置过滤）
  const statusCounts = useMemo(() => {
    let base = allMaterials;
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      base = base.filter(m =>
        m.materialCode.toLowerCase().includes(q) ||
        m.materialName.toLowerCase().includes(q)
      );
    }
    if (typeFilter !== 'all') base = base.filter(m => m.materialType === typeFilter);
    const counts: Record<StatusFilterKey, number> = {} as any;
    for (const opt of STATUS_FILTER_OPTIONS) {
      counts[opt.key] = base.filter(m => matchesStatusFilter(m, opt.key, scheduledMrpBillnos)).length;
    }
    return counts;
  }, [allMaterials, searchText, typeFilter, scheduledMrpBillnos]);

  const filteredMaterials = useMemo(() => {
    let items = allMaterials;
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      items = items.filter(m =>
        m.materialCode.toLowerCase().includes(q) ||
        m.materialName.toLowerCase().includes(q)
      );
    }
    if (typeFilter !== 'all') items = items.filter(m => m.materialType === typeFilter);
    // 多选状态过滤：OR 逻辑
    if (statusFilters.size > 0) {
      items = items.filter(m =>
        Array.from(statusFilters).some(key => matchesStatusFilter(m, key, scheduledMrpBillnos))
      );
    }
    return items;
  }, [allMaterials, searchText, typeFilter, statusFilters, scheduledMrpBillnos]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchText, typeFilter, statusFilters]);

  const totalPages = Math.max(1, Math.ceil(filteredMaterials.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedItems = filteredMaterials.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
        正在加载物料数据...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* 搜索 + 过滤栏 */}
      <div className="space-y-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            type="text"
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            placeholder="搜索物料编码 / 名称"
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-300"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as TypeFilter)}
            className="border border-slate-200 rounded px-2 py-1 text-slate-600 bg-white focus:outline-none focus:ring-1 focus:ring-indigo-300"
          >
            <option value="all">类型: 全部</option>
            <option value="外购">类型: 外购</option>
            <option value="委外">类型: 委外</option>
            <option value="自制">类型: 自制</option>
          </select>
        </div>

        {/* 物料状态多选过滤 */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          {/* 仅风险快捷键 */}
          <button
            type="button"
            onClick={() => {
              const allRiskSelected = Array.from(RISK_FILTER_KEYS).every(k => statusFilters.has(k));
              if (allRiskSelected) {
                // 取消所有风险选项
                setStatusFilters(prev => {
                  const next = new Set(prev);
                  for (const k of RISK_FILTER_KEYS) next.delete(k);
                  return next;
                });
              } else {
                // 全选所有风险选项
                setStatusFilters(prev => {
                  const next = new Set(prev);
                  for (const k of RISK_FILTER_KEYS) next.add(k);
                  next.delete('sufficient');
                  return next;
                });
              }
            }}
            className={`flex items-center gap-1 px-2 py-1 rounded border transition-colors ${
              Array.from(RISK_FILTER_KEYS).every(k => statusFilters.has(k))
                ? 'bg-red-50 text-red-600 border-red-200 font-medium'
                : 'border-slate-200 text-slate-500 hover:bg-slate-100'
            }`}
          >
            <Filter className="w-3 h-3" />
            仅风险
          </button>

          <span className="text-slate-300 mx-0.5">|</span>

          {STATUS_FILTER_OPTIONS.map(opt => {
            const active = statusFilters.has(opt.key);
            const count = statusCounts[opt.key];
            return (
              <button
                key={opt.key}
                type="button"
                onClick={() => {
                  setStatusFilters(prev => {
                    const next = new Set(prev);
                    if (next.has(opt.key)) {
                      next.delete(opt.key);
                    } else {
                      next.add(opt.key);
                      // 选具体风险项时取消 sufficient；选 sufficient 时取消所有风险项
                      if (opt.key === 'sufficient') {
                        for (const k of RISK_FILTER_KEYS) next.delete(k);
                      } else {
                        next.delete('sufficient');
                      }
                    }
                    return next;
                  });
                }}
                className={`px-2 py-1 rounded border transition-colors whitespace-nowrap ${
                  active
                    ? opt.key === 'sufficient'
                      ? 'bg-green-50 text-green-600 border-green-200 font-medium'
                      : 'bg-amber-50 text-amber-700 border-amber-200 font-medium'
                    : count === 0
                      ? 'border-slate-100 text-slate-300 cursor-default'
                      : 'border-slate-200 text-slate-500 hover:bg-slate-100'
                }`}
                disabled={count === 0 && !active}
              >
                {opt.label}
                <span className={`ml-1 ${active ? 'opacity-80' : 'opacity-50'}`}>({count})</span>
              </button>
            );
          })}

          {statusFilters.size > 0 && (
            <button
              type="button"
              onClick={() => setStatusFilters(new Set())}
              className="px-2 py-1 rounded border border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              清除
            </button>
          )}
        </div>
        <div className="text-xs text-slate-400 text-right">
          {filteredMaterials.length} / {allMaterials.length} 条
        </div>
      </div>

      {/* 物料表格 */}
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              <th className="w-6"></th>
              <th className="px-3 py-2 text-left font-medium text-slate-500">物料</th>
              <th className="px-3 py-2 text-left font-medium text-slate-500">类型</th>
              <th className="px-3 py-2 text-right font-medium text-slate-500">需求量</th>
              <th className="px-3 py-2 text-right font-medium text-slate-500">可用库存</th>
              <th className="px-3 py-2 text-right font-medium text-slate-500">在途订单</th>
              <th className="px-3 py-2 text-left font-medium text-slate-500">物料状态提示</th>
            </tr>
          </thead>
          <tbody>
            {pagedItems.map(m => {
              const riskText = getRiskText(m);
              const isExpanded = expandedRows.has(m.materialCode);
              const shared = result?.sharedMaterials.get(m.materialCode);

              return (
                <React.Fragment key={m.materialCode}>
                  <tr
                    className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                    onClick={() => toggleExpand(m.materialCode)}
                  >
                    <td className="pl-2">
                      <span className="inline-flex w-4 h-4 items-center justify-center rounded border border-slate-300 bg-white flex-shrink-0">
                        {isExpanded
                          ? <ChevronDown className="w-3 h-3 text-slate-500" />
                          : <ChevronRight className="w-3 h-3 text-slate-500" />}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1.5">
                        <div>
                          <div className="font-medium text-slate-700">{m.materialCode}</div>
                          <div className="text-slate-400">{m.materialName}</div>
                        </div>
                        {m.isShared && (
                          <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[10px] bg-blue-50 text-blue-600 border border-blue-200 flex-shrink-0">
                            <Share2 className="w-2.5 h-2.5" />共用
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                        m.materialType === '外购' ? 'bg-green-50 text-green-700' :
                        m.materialType === '委外' ? 'bg-orange-50 text-orange-700' :
                        'bg-purple-50 text-purple-700'
                      }`}>{m.materialType}</span>
                    </td>
                    <td className="px-3 py-2 text-right text-slate-700">
                      {m.grossRequirement > 0 ? m.grossRequirement.toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600">
                      {m.availableInventoryQty.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right text-slate-600">
                      {m.inTransitQty > 0 ? m.inTransitQty.toLocaleString() : '—'}
                    </td>
                    <td className="px-3 py-2">
                      {riskText ? (
                        <span className={`text-[11px] font-medium ${riskTextColor(riskText)}`}>
                          {riskText}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>

                  {isExpanded && (
                    <tr>
                      <td colSpan={7} className="p-0">
                        {m.materialType === '自制' ? (
                          <>
                            {/* 自制件：同时展示 MRP 生产计划记录和子料齐套明细 */}
                            <MrpDetailPanel mrpDetails={m.mrpDetails} isSelfMade />
                            <SelfMadeChildPanel
                              materialCode={m.materialCode}
                              allMaterials={allMaterials}
                              sharedMaterialCodes={sharedMaterialCodes}
                              onSearch={(q) => { setSearchText(q); setExpandedRows(new Set()); }}
                            />
                          </>
                        ) : (
                          <MrpDetailPanel mrpDetails={m.mrpDetails} />
                        )}
                        {shared && (
                          <SharedMaterialPanel material={shared} />
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>

        {pagedItems.length === 0 && (
          <div className="text-center py-8 text-sm text-slate-400">
            {allMaterials.length === 0 ? '暂无物料数据' : '无符合条件的物料'}
          </div>
        )}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>第 {safePage} / {totalPages} 页，共 {filteredMaterials.length} 条</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(1)}
              disabled={safePage === 1}
              className="p-1 rounded hover:bg-slate-100 disabled:opacity-40"
            >«</button>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={safePage === 1}
              className="px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-40"
            >上一页</button>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={safePage === totalPages}
              className="px-2 py-1 rounded hover:bg-slate-100 disabled:opacity-40"
            >下一页</button>
            <button
              onClick={() => setCurrentPage(totalPages)}
              disabled={safePage === totalPages}
              className="p-1 rounded hover:bg-slate-100 disabled:opacity-40"
            >»</button>
          </div>
        </div>
      )}

      {/* 计算公式说明 */}
      <div className="mt-4 px-4 py-3 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-500 space-y-2">
        <div className="font-medium text-slate-600 mb-1">计算公式说明</div>
        <div className="space-y-1.5">
          <div>
            <span className="font-medium text-slate-600">① 可用库存口径：</span>
            可用库存 = 仓库实物库存 − 已分配在制工单占用 − 质检锁定 − 报废/不良品仓 − 委外加工仓等非有效仓。系统按综合配置中的有效仓库过滤。
          </div>
          <div>
            <span className="font-medium text-slate-600">② 产品净需求：</span>
            产品净需求 = max(0, 产品预测需求量 − 产品可用库存 − 在途未入库量)
          </div>
          <div>
            <span className="font-medium text-slate-600">③ L1 物料需求量：</span>
            L1 物料毛需求 = 产品净需求 × BOM 标准用量
          </div>
          <div>
            <span className="font-medium text-slate-600">④ L2+ 物料需求量（计划量优先）：</span>
            父级有 MRP 计划时：子料毛需求 = 父级 MRP 合计计划量 × BOM 标准用量；父级无 MRP 时：子料毛需求 = 父级毛需求 × BOM 标准用量
          </div>
          <div>
            <span className="font-medium text-slate-600">⑤ 多产品共用物料：</span>
            各产品对同一物料的毛需求直接求和，统一与可用库存对比，不做净需求分摊
          </div>
          <div>
            <span className="font-medium text-slate-600">⑥ 在途量口径：</span>
            在途量 = Σ max(0, PO 订单数量 − PO 已入库数量)，仅计入未完全到货的采购订单。
          </div>
          <div>
            <span className="font-medium text-slate-600">⑦ 物料状态判定总原则：</span>
            所有物料类型统一：先判库存是否满足需求（可用库存 + 在途量 ≥ 毛需求量）。满足 → 库存满足（有MRP则提示"注意MRP有记录"）。不满足 → 按物料类型进入具体状态判定。
          </div>
          <div>
            <span className="font-medium text-slate-600">⑧ 外购/委外件（库存不足时）：</span>
            有 MRP → 跟踪采购进度（未PR / 未PO / PO交期风险 / PO在途）；无 MRP → 数据异常（需 ERP 核查）。
          </div>
          <div>
            <span className="font-medium text-slate-600">⑨ 自制件（库存不足时）：</span>
            先看子料齐套：子料有缺口 → 等待齐套；子料无缺口 + 有MRP → 子料已齐套，看是否已排产；子料无缺口 + 无MRP → 子料已齐套，未下达生产计划。
          </div>
          <div>
            <span className="font-medium text-slate-600">⑩ 子料状态矩阵：</span>
            子料需求量（列）= 该子料毛需求（MRP计划量优先，无MRP则为父料毛需求 × BOM用量）；子料计划量（列）= 该子料 MRP 合计计划数量。
            状态以"计划量优先"为判据：有 MRP 计划时，供应量（库存 + 在途）≥ 计划量 → 有计划，库存满足（绿）；供应量 &lt; 计划量 → 已有计划，缺口 = 计划量 − 供应量（蓝）。无 MRP 时，退回毛需求估算：供应量 ≥ 毛需求 → 库存满足（绿）；供应量 &lt; 毛需求 → 无计划，缺口 = 毛需求 − 供应量（红）。无 MRP + 零库存 → 异常（黄）。
          </div>
        </div>
      </div>

      {/* 物料状态过滤逻辑说明 */}
      <details className="mt-3 px-4 py-3 bg-slate-50 rounded-lg border border-slate-200 text-[11px] text-slate-500">
        <summary className="font-medium text-slate-600 cursor-pointer select-none hover:text-slate-800">
          物料状态过滤逻辑说明
        </summary>
        <div className="space-y-1.5 mt-2">
          <div className="font-medium text-slate-500 mb-1">名词定义</div>
          <div>• <span className="font-medium text-slate-600">库存缺口</span>：可用库存 + 在途量 &lt; 毛需求量</div>
          <div>• <span className="font-medium text-slate-600">毛需求量</span>：产品预测数量 × BOM路径连乘用量，跨产品累加</div>
          <div>• <span className="font-medium text-slate-600">已排产</span>：ERP生产工单的来源单据号(sourcebillnumber) = 该物料的MRP计划单号(mrpBillno)</div>

          <div className="font-medium text-slate-500 mt-3 mb-1">各状态判定条件</div>
          <div>
            <span className="font-medium text-slate-600">① 数据异常-无MRP且库存不足：</span>
            外购或委外件无MRP计划记录，且存在库存缺口。说明ERP中MRP未覆盖到该物料，需ERP核查。
          </div>
          <div>
            <span className="font-medium text-slate-600">② 外购/委外-交期风险：</span>
            外购或委外件存在库存缺口，且满足以下任一：(a) 已有PO但交期已过今天；(b) 已有PO但PO交期晚于物料需求截止日；(c) 未有PO且 今天+采购提前期 &gt; 物料需求截止日。
          </div>
          <div>
            <span className="font-medium text-slate-600">③ 外购/委外-未下PR：</span>
            有MRP记录但尚未生成采购申请(PR)。
          </div>
          <div>
            <span className="font-medium text-slate-600">④ 外购/委外-未下PO：</span>
            PR已生成但尚未下达采购订单(PO)。
          </div>
          <div>
            <span className="font-medium text-slate-600">⑤ 外购/委外-PO已逾期：</span>
            已有PO，PO承诺交期 ≤ 今天，物料尚未到货（存在库存缺口）。
          </div>
          <div>
            <span className="font-medium text-slate-600">⑥ 自制件-子料缺料：</span>
            至少1种子料存在库存缺口。
          </div>
          <div>
            <span className="font-medium text-slate-600">⑦ 自制件-齐套已排产：</span>
            所有子料无缺口，且ERP中有生产工单关联到该物料的MRP计划单号。
          </div>
          <div>
            <span className="font-medium text-slate-600">⑧ 自制件-齐套未排产：</span>
            所有子料无缺口，无MRP记录，且存在库存缺口（需要生产但ERP未安排）。
          </div>
          <div>
            <span className="font-medium text-slate-600">⑨ 自制件-有计划但有缺口：</span>
            有MRP记录，且存在库存缺口（生产计划已安排但成品库存仍不足）。
          </div>
          <div>
            <span className="font-medium text-slate-600">⑩ 所有物料-库存满足：</span>
            可用库存 + 在途量 ≥ 毛需求量。不论物料类型、有无MRP、子料状态如何，库存满足需求即归入此类。
          </div>
          <div className="mt-2 text-slate-400">
            「仅风险」= 同时选中①~⑨；多选为 OR 逻辑（命中任一选项即显示）；与物料类型过滤为 AND 关系。
          </div>
        </div>
      </details>
    </div>
  );
};
