/**
 * 甘特图 Tooltip - 倒排模式
 *
 * 显示 GanttBar 的详细信息：
 * - BOM展开需求量 / 净需求量 / 可用库存
 * - MRP 投放状态明细（已投放数量、未投放建议、风险提示）
 */

import { createPortal } from 'react-dom';
import type { GanttBar, MRPDetail } from '../../../types/planningV2';

interface GanttTooltipProps {
  bar: GanttBar;
  x: number;
  y: number;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const formatDate = (date: Date) =>
  date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });

const fmt = (n: number | undefined | null) =>
  n == null ? '—' : n.toLocaleString();

/** 判断某条 MRP 明细是否已投放 */
const isDropped = (d: MRPDetail) =>
  d.dropStatusTitle === '已投放' || d.bizdropqty > 0;

/** 根据 bar 的数据推导异常/风险的具体原因 */
/**
 * 状态 Banner 原因推导（与 recalcStatusFromBOM 保持一致）：
 * - hasMRP：根据 daysToStart 说明具体情况
 * - !hasMRP：不显示 Banner（默认满足）
 */
function deriveAlert(bar: GanttBar): {
  type: 'anomaly' | 'risk' | 'po_late';
  title: string;
  detail: string;
} | null {
  if (bar.status !== 'anomaly' && bar.status !== 'risk' && bar.status !== 'ordered') return null;
  if (!bar.hasMRP) return null;

  // B类：有PO，但PO到货日晚于计划到位日
  // 优先用 bar.poDeliverDate，fallback 到 mrpDetails 里的最新 PO 到货日
  const poDeliverDate = bar.poDeliverDate
    ?? bar.mrpDetails.map(d => d.poDeliverDate).filter(Boolean).sort().at(-1);
  if (poDeliverDate) {
    const poDate = new Date(poDeliverDate);
    poDate.setHours(0, 0, 0, 0);
    const endDate = new Date(bar.endDate);
    endDate.setHours(0, 0, 0, 0);
    const lateDays = Math.floor((poDate.getTime() - endDate.getTime()) / 86400000);
    if (lateDays > 0) {
      const endDateStr = bar.endDate.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
      return {
        type: 'po_late',
        title: 'PO到货偏晚',
        detail: `PO到货日（${poDeliverDate}）晚于计划到位日（${endDateStr}）${lateDays} 天，请确认是否影响生产`,
      };
    }
  }

  if (bar.status === 'ordered') return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overduedays = Math.floor((today.getTime() - bar.startDate.getTime()) / 86400000);
  const startDateStr = bar.startDate.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });

  if (overduedays >= 0) {
    // A类：无PO，倒排已过，需立即跟进
    return {
      type: 'anomaly',
      title: '交期异常',
      detail: `倒排开始时间（${startDateStr}）已过 ${overduedays} 天，尚无PO，需立即跟进`,
    };
  }
  // 未过期但即将到来（overduedays < 0 表示 startDate 还在未来）
  const daysUntilStart = Math.floor((bar.startDate.getTime() - today.getTime()) / 86400000);
  return {
    type: 'risk',
    title: '交期提醒',
    detail: `距倒排开始（${startDateStr}）还剩 ${daysUntilStart} 天`,
  };
}

const GanttTooltip = ({ bar, x, y, onMouseEnter, onMouseLeave }: GanttTooltipProps) => {
  const duration = Math.ceil(
    (bar.endDate.getTime() - bar.startDate.getTime()) / (1000 * 60 * 60 * 24)
  );

  const statusLabel =
    bar.status === 'on_time' ? '按时' :
    bar.status === 'risk'    ? '风险' :
    bar.status === 'ready'   ? '就绪' :
    bar.status === 'anomaly' ? '异常' : '已下单';

  const statusColor =
    bar.status === 'on_time' ? 'text-indigo-600'  :
    bar.status === 'risk'    ? 'text-yellow-600'  :
    bar.status === 'anomaly' ? 'text-red-600'      : 'text-green-600';

  const grossReq  = bar.grossRequirement;
  const netReq    = bar.netRequirement;
  const availInv  = bar.availableInventoryQty;
  const inTransit = bar.inTransitQty;

  const alert = deriveAlert(bar);

  const tooltip = (
    <div
      className="fixed z-50"
      style={{
        left: `${Math.min(x, window.innerWidth - 340)}px`,
        top: `${y}px`,
        transform: 'translateY(-50%)',
        pointerEvents: 'auto',
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="bg-white border border-slate-300 rounded-lg shadow-xl w-80">

        {/* ── 标题 ── */}
        <div className="px-3 py-2 border-b border-slate-200 bg-slate-50 rounded-t-lg">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-mono text-slate-600">{bar.materialCode}</span>
            <span className={`px-1.5 py-0.5 text-[10px] rounded font-medium ${
              bar.materialType === '外购' ? 'bg-green-100 text-green-700' :
              bar.materialType === '委外' ? 'bg-orange-100 text-orange-700' :
              'bg-purple-100 text-purple-700'
            }`}>
              {bar.materialType || '自制'}
            </span>
            <span className="text-[10px] text-slate-400">L{bar.bomLevel}</span>
            {bar.hasMRP ? (
              <span className="px-1.5 py-0.5 text-[10px] rounded font-medium bg-green-100 text-green-700">MRP ✓</span>
            ) : (
              <span className="px-1.5 py-0.5 text-[10px] rounded font-medium bg-gray-100 text-gray-500">无MRP</span>
            )}
          </div>
          <div className="text-sm font-semibold text-slate-900">{bar.materialName}</div>
        </div>

        <div className="px-3 py-2 space-y-2 text-xs">

          {/* ── 异常/风险 Banner ── */}
          {alert && (
            <div className={`rounded-md px-2.5 py-2 text-[11px] flex gap-2 ${
              alert.type === 'anomaly' ? 'bg-red-50 border border-red-200 text-red-700' :
              alert.type === 'po_late' ? 'bg-purple-50 border border-purple-200 text-purple-700' :
              'bg-amber-50 border border-amber-200 text-amber-700'
            }`}>
              <span className="text-base leading-none mt-0.5 shrink-0">
                {alert.type === 'anomaly' ? '🚨' : '⚠️'}
              </span>
              <div>
                <div className="font-semibold">{alert.title}</div>
                <div className="mt-0.5 leading-snug">{alert.detail}</div>
              </div>
            </div>
          )}

          {/* ── 时间 ── */}
          <div className="space-y-1">
            <div className="flex justify-between">
              <span className="text-slate-500">状态:</span>
              <span className={`font-medium ${statusColor}`}>{statusLabel}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">标准交期:</span>
              <span className="text-slate-800">{bar.standardLeadtime} 天</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">交期倒排:</span>
              <span className="text-slate-800">
                {formatDate(bar.startDate)} ~ {formatDate(bar.endDate)}（{duration}天）
              </span>
            </div>
          </div>

          {/* ── BOM 展开评估 ── */}
          <div className="border-t border-slate-100 pt-2 space-y-1">
            <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1">BOM 展开评估</div>
            <div className="flex justify-between">
              <span className="text-slate-500">展开需求量:</span>
              <span className="text-slate-800 font-medium">{fmt(grossReq)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">可用库存:</span>
              <span className={
                availInv === undefined ? 'text-slate-400' :
                availInv <= 0 ? 'text-red-600 font-medium' :
                'text-emerald-700 font-medium'
              }>
                {fmt(availInv)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">在途订单量:</span>
              <span className={
                !inTransit || inTransit <= 0 ? 'text-slate-400' : 'text-blue-600 font-medium'
              }>
                {inTransit && inTransit > 0 ? inTransit.toLocaleString() : '—'}
              </span>
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-1 mt-0.5">
              <span className="text-slate-600 font-medium">实时需求:</span>
              <span className={
                netReq == null ? 'text-slate-400' :
                netReq > 0 ? 'text-red-600 font-semibold' :
                'text-emerald-700 font-semibold'
              }>
                {netReq == null ? '—' : netReq > 0 ? `缺 ${netReq.toLocaleString()}` : '✓ 满足'}
              </span>
            </div>
          </div>

          {/* ── MRP 投放明细 ── */}
          {bar.hasMRP && bar.mrpDetails.length > 0 ? (
            <div className="border-t border-slate-100 pt-2">
              <div className="text-[10px] font-medium text-slate-400 uppercase tracking-wide mb-1.5">MRP 投放明细</div>
              <table className="w-full text-[11px] border-collapse">
                <thead>
                  <tr className="text-[10px] text-slate-400 border-b border-slate-100">
                    <th className="text-left font-normal pb-1 pr-1">MRP单号</th>
                    <th className="text-center font-normal pb-1 px-1">状态</th>
                    <th className="text-right font-normal pb-1 px-1">建议/投放量</th>
                    <th className="text-center font-normal pb-1 px-1">PR</th>
                    <th className="text-center font-normal pb-1 px-1">PO</th>
                    <th className="pb-1 pl-1"></th>
                  </tr>
                </thead>
                <tbody>
                  {bar.mrpDetails.map((d, i) => {
                    const dropped = isDropped(d);
                    return (
                      <>
                        <tr
                          key={i}
                          className={dropped ? 'bg-green-50/60' : ''}
                        >
                          <td className="py-1 pr-1 font-mono text-[10px] text-slate-400 truncate max-w-[72px]">
                            {d.mrpBillno.slice(-10)}
                          </td>
                          <td className="py-1 px-1 text-center">
                            <span className={`px-1 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${
                              dropped ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                            }`}>
                              {d.dropStatusTitle || (dropped ? '已投放' : '未投放')}
                            </span>
                          </td>
                          <td className="py-1 px-1 text-right font-medium text-slate-800">
                            {dropped
                              ? d.bizdropqty.toLocaleString()
                              : (d.adviseorderqty > 0 ? d.adviseorderqty.toLocaleString() : '—')}
                          </td>
                          <td className="py-1 px-1 text-center">
                            {d.hasPR
                              ? <span className="text-emerald-600 font-medium" title={`${d.prCount} 张PR`}>✓{d.prCount > 1 ? `×${d.prCount}` : ''}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="py-1 px-1 text-center">
                            {d.hasPO
                              ? <span className="text-emerald-600 font-medium" title={d.poDeliverDate ? `交货：${d.poDeliverDate}` : ''}>✓{d.poDeliverDate ? <span className="text-[9px] text-slate-500 ml-0.5">{d.poDeliverDate.slice(5)}</span> : ''}</span>
                              : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="py-1 pl-1 text-right">
                            {!dropped && (
                              <button
                                className="text-[10px] px-1.5 py-0.5 bg-indigo-600 text-white rounded hover:bg-indigo-700 transition-colors cursor-pointer whitespace-nowrap"
                                onClick={(e) => { e.stopPropagation(); /* TODO: 投放接口 */ }}
                              >
                                投放
                              </button>
                            )}
                          </td>
                        </tr>
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : !bar.hasMRP ? (
            <div className="border-t border-slate-100 pt-2">
              <div className="text-[11px] text-slate-500 bg-slate-50 rounded px-2 py-1.5 border border-slate-200">
                无MRP记录 — 基于BOM展开库存评估
              </div>
            </div>
          ) : null}

          {/* ── 倒排提示 ── */}
          {bar.bomLevel > 0 && (
            <div className="text-[11px] text-indigo-600 bg-indigo-50 rounded px-2 py-1 border border-indigo-100">
              倒排: 需在父级开工前 1 天齐套完成
            </div>
          )}
        </div>
      </div>
    </div>
  );

  return createPortal(tooltip, document.body);
};

export default GanttTooltip;
