/**
 * 甘特图计划进度总结卡片
 *
 * 显示在甘特图上方：
 * - 计划周期（用户填写的生产计划时间）
 * - 倒排后实际最早开始时间
 * - 实际所需总天数
 * - 过期物料（应已开始采购但未下PO）
 * - 超期物料（到货日晚于生产结束日）
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle, Clock, Calendar, TrendingUp } from 'lucide-react';
import type { GanttSummary } from '../../../services/ganttService';
import type { GanttBar } from '../../../types/planningV2';

interface GanttSummaryCardProps {
  summary: GanttSummary;
  productCode?: string;
  productName?: string;
  forecastBillnos?: string[];
}

const fmt = (d: Date) => d.toISOString().slice(0, 10);

const AbnormalTable = ({ items, type }: { items: GanttBar[]; type: 'overdue' | 'pastdue' }) => {
  if (items.length === 0) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="overflow-x-auto mt-3">
      <table className="w-full text-xs">
        <thead>
          <tr className={`${type === 'overdue' ? 'bg-orange-50' : 'bg-red-50'} text-slate-600`}>
            <th className="text-left px-3 py-1.5 font-medium">物料编码</th>
            <th className="text-left px-3 py-1.5 font-medium">物料名称</th>
            <th className="text-center px-3 py-1.5 font-medium">类型</th>
            <th className="text-center px-3 py-1.5 font-medium">层级</th>
            <th className="text-left px-3 py-1.5 font-medium">异常原因</th>
            <th className="text-right px-3 py-1.5 font-medium">计划开始</th>
            <th className="text-right px-3 py-1.5 font-medium">计划到货</th>
            <th className="text-center px-3 py-1.5 font-medium">PR</th>
            <th className="text-center px-3 py-1.5 font-medium">PO</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => {
            const reason = type === 'overdue'
              ? `到货日超出计划结束日`
              : `应开始采购日已过期 ${Math.ceil((today.getTime() - item.startDate.getTime()) / 86400000)} 天`;
            return (
              <tr key={item.materialCode} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-1.5 font-mono text-slate-700">{item.materialCode}</td>
                <td className="px-3 py-1.5 text-slate-800 max-w-[150px] truncate">{item.materialName}</td>
                <td className="px-3 py-1.5 text-center">
                  <span className={`px-1 py-0.5 rounded text-[10px] font-medium ${
                    item.materialType === '外购' ? 'bg-green-100 text-green-700' :
                    item.materialType === '委外' ? 'bg-orange-100 text-orange-700' :
                    'bg-purple-100 text-purple-700'
                  }`}>
                    {item.materialType}
                  </span>
                </td>
                <td className="px-3 py-1.5 text-center text-slate-500">L{item.bomLevel}</td>
                <td className="px-3 py-1.5 text-orange-700">{reason}</td>
                <td className="px-3 py-1.5 text-right text-slate-600">{fmt(item.startDate)}</td>
                <td className={`px-3 py-1.5 text-right font-medium ${type === 'overdue' ? 'text-orange-600' : 'text-red-600'}`}>
                  {fmt(item.endDate)}
                </td>
                <td className="px-3 py-1.5 text-center">
                  {item.prStatus === 'has_pr' ? <span className="text-green-600">✅</span>
                   : item.prStatus === 'no_pr' ? <span className="text-red-500">❌</span>
                   : <span className="text-slate-300">-</span>}
                </td>
                <td className="px-3 py-1.5 text-center">
                  {item.poStatus === 'has_po' ? <span className="text-green-600">✅</span>
                   : item.poStatus === 'no_po' ? <span className="text-red-500">❌</span>
                   : <span className="text-slate-300">-</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};

const GanttSummaryCard = ({ summary, productCode, productName, forecastBillnos }: GanttSummaryCardProps) => {
  const [showOverdue, setShowOverdue] = useState(false);
  const [showPastDue, setShowPastDue] = useState(false);

  const hasAbnormal = summary.overdueItems.length > 0 || summary.pastDueItems.length > 0;
  const isEarlyStart = summary.actualEarliestStart < new Date(summary.planStart);

  return (
    <div className="bg-white border border-slate-200 rounded-lg mb-3 overflow-hidden">
      {/* 标题栏 */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <TrendingUp className="w-4 h-4 text-indigo-500" />
        <span className="text-sm font-semibold text-slate-800">计划进度总结</span>
        {productCode && (
          <span className="text-xs text-slate-500 font-mono">{productCode}</span>
        )}
        {productName && (
          <span className="text-xs text-slate-600">{productName}</span>
        )}
        {hasAbnormal && (
          <span className="ml-auto flex items-center gap-1 text-xs text-orange-600 font-medium">
            <AlertTriangle className="w-3.5 h-3.5" />
            存在异常物料
          </span>
        )}
      </div>

      {/* 四列数字摘要 */}
      <div className="grid grid-cols-3 divide-x divide-slate-100 px-0">
        {/* 计划周期 */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px] text-slate-500">计划周期</span>
          </div>
          <div className="text-xs font-medium text-slate-800">
            {summary.planStart} ~ {summary.planEnd}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">{summary.planDays} 天</div>
          {forecastBillnos && forecastBillnos.length > 0 && (
            <div className="text-[11px] text-indigo-500 mt-1 truncate" title={forecastBillnos.join(', ')}>
              预测单：{forecastBillnos.length === 1 ? forecastBillnos[0] : `${forecastBillnos[0]} 等${forecastBillnos.length}单`}
            </div>
          )}
        </div>

        {/* 倒排最早开始 */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px] text-slate-500">倒排最早开始</span>
          </div>
          <div className={`text-xs font-medium ${isEarlyStart ? 'text-orange-600' : 'text-slate-800'}`}>
            {fmt(summary.actualEarliestStart)}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">
            {isEarlyStart
              ? `比生产开始早 ${Math.ceil((new Date(summary.planStart).getTime() - summary.actualEarliestStart.getTime()) / 86400000)} 天`
              : '与生产同步'}
          </div>
        </div>

        {/* BOM 物料情况 */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px] text-slate-500">产品BOM物料</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs font-semibold text-slate-800">{summary.totalMaterials}</span>
            <span className="text-[11px] text-slate-400">种</span>
          </div>
        </div>
      </div>

      {/* 异常物料明细（可展开） */}
      {summary.pastDueItems.length > 0 && (
        <div className="border-t border-slate-100">
          <button
            onClick={() => setShowPastDue(v => !v)}
            className="w-full flex items-center gap-2 px-4 py-2 text-xs text-red-700 bg-red-50 hover:bg-red-100 transition-colors text-left"
          >
            {showPastDue ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <span className="font-medium">采购过期物料 ({summary.pastDueItems.length} 项)</span>
            <span className="text-red-500 text-[11px]">— 应开始采购的日期已过，且尚未下PO，需立即行动</span>
          </button>
          {showPastDue && (
            <div className="px-4 pb-3">
              <AbnormalTable items={summary.pastDueItems} type="pastdue" />
            </div>
          )}
        </div>
      )}

      {summary.overdueItems.length > 0 && (
        <div className="border-t border-slate-100">
          <button
            onClick={() => setShowOverdue(v => !v)}
            className="w-full flex items-center gap-2 px-4 py-2 text-xs text-orange-700 bg-orange-50 hover:bg-orange-100 transition-colors text-left"
          >
            {showOverdue ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <span className="font-medium">到货超期物料 ({summary.overdueItems.length} 项)</span>
            <span className="text-orange-500 text-[11px]">— 计划到货日晚于生产结束日，会影响齐套</span>
          </button>
          {showOverdue && (
            <div className="px-4 pb-3">
              <AbnormalTable items={summary.overdueItems} type="overdue" />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GanttSummaryCard;
