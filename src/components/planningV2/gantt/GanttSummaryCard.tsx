/**
 * 甘特图产品交期分析卡片
 *
 * 显示在甘特图上方：
 * - 产品交期分析标题 + 交付状态徽标
 * - 4列数字摘要：计划周期、倒排最早开始、产品BOM物料、预计交付
 * - A类延迟（排不下的物料）和B类延迟（PO超期物料）可展开列表
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, AlertTriangle, Clock, Calendar, TrendingUp, Package } from 'lucide-react';
import type { GanttSummary, DelayItem } from '../../../services/ganttService';

interface GanttSummaryCardProps {
  summary: GanttSummary;
  productCode?: string;
  productName?: string;
  forecastBillnos?: string[];
}

const fmt = (d: Date) => d.toISOString().slice(0, 10);

const DelayTable = ({ items }: { items: DelayItem[] }) => {
  if (items.length === 0) return null;

  return (
    <div className="overflow-x-auto mt-3">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-slate-50 text-slate-600">
            <th className="text-left px-3 py-1.5 font-medium">物料编码</th>
            <th className="text-left px-3 py-1.5 font-medium">物料名称</th>
            <th className="text-center px-3 py-1.5 font-medium">类型</th>
            <th className="text-center px-3 py-1.5 font-medium">层级</th>
            <th className="text-left px-3 py-1.5 font-medium">延迟原因</th>
            <th className="text-right px-3 py-1.5 font-medium">计划到位日</th>
            <th className="text-right px-3 py-1.5 font-medium">预计到货日</th>
            <th className="text-center px-3 py-1.5 font-medium">延迟天数</th>
            <th className="text-center px-3 py-1.5 font-medium">PR</th>
            <th className="text-center px-3 py-1.5 font-medium">PO</th>
          </tr>
        </thead>
        <tbody>
          {items.map(item => (
            <tr key={`${item.bar.materialCode}-${item.type}`} className="border-t border-slate-100 hover:bg-slate-50">
              <td className="px-3 py-1.5 font-mono text-slate-700">{item.bar.materialCode}</td>
              <td className="px-3 py-1.5 text-slate-800 max-w-[150px] truncate">{item.bar.materialName}</td>
              <td className="px-3 py-1.5 text-center">
                <span className={`px-1 py-0.5 rounded text-[10px] font-medium ${
                  item.bar.materialType === '外购' ? 'bg-green-100 text-green-700' :
                  item.bar.materialType === '委外' ? 'bg-orange-100 text-orange-700' :
                  'bg-purple-100 text-purple-700'
                }`}>
                  {item.bar.materialType}
                </span>
              </td>
              <td className="px-3 py-1.5 text-center text-slate-500">L{item.bar.bomLevel}</td>
              <td className="px-3 py-1.5 text-slate-600 max-w-[200px] truncate" title={item.reason}>{item.reason}</td>
              <td className="px-3 py-1.5 text-right text-slate-600">{fmt(item.bar.endDate)}</td>
              <td className="px-3 py-1.5 text-right text-slate-600">{item.estimatedArrival}</td>
              <td className="px-3 py-1.5 text-center text-red-600 font-bold">{item.delayDays} 天</td>
              <td className="px-3 py-1.5 text-center">
                {item.bar.prStatus === 'has_pr' ? <span className="text-green-600">✅</span>
                 : item.bar.prStatus === 'no_pr' ? <span className="text-red-500">❌</span>
                 : <span className="text-slate-300">-</span>}
              </td>
              <td className="px-3 py-1.5 text-center">
                {item.bar.poStatus === 'has_po' ? <span className="text-green-600">✅</span>
                 : item.bar.poStatus === 'no_po' ? <span className="text-red-500">❌</span>
                 : <span className="text-slate-300">-</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const GanttSummaryCard = ({ summary, productCode, productName, forecastBillnos }: GanttSummaryCardProps) => {
  const [showTypeA, setShowTypeA] = useState(false);
  const [showTypeB, setShowTypeB] = useState(false);

  const planStartDate = new Date(summary.planStart);
  const isEarlyStart = summary.actualEarliestStart < planStartDate;
  const earlyByDays = isEarlyStart
    ? Math.ceil((planStartDate.getTime() - summary.actualEarliestStart.getTime()) / 86400000)
    : 0;

  return (
    <div className="bg-white border border-slate-200 rounded-lg mb-3 overflow-hidden">
      {/* 标题栏 */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-200">
        <TrendingUp className="w-4 h-4 text-indigo-500" />
        <span className="text-sm font-semibold text-slate-800">产品交期分析</span>
        {productCode && (
          <span className="text-xs text-slate-500 font-mono">{productCode}</span>
        )}
        {productName && (
          <span className="text-xs text-slate-600">{productName}</span>
        )}
        <span className="ml-auto">
          {summary.canDeliverOnTime ? (
            <span className="flex items-center gap-1 text-xs text-green-700 bg-green-50 border border-green-200 rounded px-2 py-0.5 font-medium">
              ✅ 可按计划交付
            </span>
          ) : (
            <span className="flex items-center gap-1 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-0.5 font-medium">
              <AlertTriangle className="w-3.5 h-3.5" />
              预计延迟 {summary.maxDelayDays} 天（预计交付日: {summary.estimatedDeliveryDate}）
            </span>
          )}
        </span>
      </div>

      {/* 四列数字摘要 */}
      <div className="grid grid-cols-4 divide-x divide-slate-100 px-0">
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
            {isEarlyStart ? `比计划早 ${earlyByDays} 天` : '与生产同步'}
          </div>
        </div>

        {/* 产品BOM物料 */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <Package className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px] text-slate-500">产品BOM物料</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xs font-semibold text-slate-800">{summary.totalMaterials}</span>
            <span className="text-[11px] text-slate-400">种</span>
          </div>
          {summary.shortageCount > 0 && (
            <div className="text-[11px] text-red-600 mt-0.5 font-medium">
              缺料 {summary.shortageCount} 种
            </div>
          )}
        </div>

        {/* 预计交付 */}
        <div className="px-4 py-3">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-[11px] text-slate-500">预计交付</span>
          </div>
          {summary.canDeliverOnTime ? (
            <div className="text-xs font-semibold text-green-600">可按时交付</div>
          ) : (
            <>
              <div className="text-xs font-semibold text-red-600">延迟 {summary.maxDelayDays} 天</div>
              <div className="text-[11px] text-slate-500 mt-0.5">{summary.estimatedDeliveryDate}</div>
            </>
          )}
        </div>
      </div>

      {/* A类延迟：排不下的物料 */}
      {summary.delayTypeA.length > 0 && (
        <div className="border-t border-slate-100">
          <button
            onClick={() => setShowTypeA(v => !v)}
            className="w-full flex items-center gap-2 px-4 py-2 text-xs text-red-700 bg-red-50 hover:bg-red-100 transition-colors text-left"
          >
            {showTypeA ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <span className="font-medium">排不下的物料 ({summary.delayTypeA.length} 项)</span>
            <span className="text-red-500 text-[11px]">— 倒排开始已过，尚未下PO，今天下单仍来不及</span>
          </button>
          {showTypeA && (
            <div className="px-4 pb-3">
              <DelayTable items={summary.delayTypeA} />
            </div>
          )}
        </div>
      )}

      {/* B类延迟：PO超期物料 */}
      {summary.delayTypeB.length > 0 && (
        <div className="border-t border-slate-100">
          <button
            onClick={() => setShowTypeB(v => !v)}
            className="w-full flex items-center gap-2 px-4 py-2 text-xs text-orange-700 bg-orange-50 hover:bg-orange-100 transition-colors text-left"
          >
            {showTypeB ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            <span className="font-medium">PO超期物料 ({summary.delayTypeB.length} 项)</span>
            <span className="text-orange-500 text-[11px]">— PO到货日晚于倒排计划到位日</span>
          </button>
          {showTypeB && (
            <div className="px-4 pb-3">
              <DelayTable items={summary.delayTypeB} />
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default GanttSummaryCard;
