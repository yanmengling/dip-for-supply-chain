/**
 * 缺料清单组件 - 支持 CSV 导出
 *
 * 从甘特图数据中筛选缺口物料，以表格形式展示
 */

import React, { useMemo } from 'react';
import { Download } from 'lucide-react';
import type { GanttBar } from '../../types/planningV2';
import { ganttService } from '../../services/ganttService';

interface ShortageListProps {
  bars: GanttBar[];
}

function exportCSV(rows: GanttBar[]): void {
  const headers = '物料编码,物料名称,物料类型,BOM层级,缺口数量,PR状态,PO状态,交期天数,计划到货日\n';
  const lines = rows.map(r =>
    [
      r.materialCode,
      `"${r.materialName}"`,
      r.materialType,
      `L${r.bomLevel}`,
      r.shortageQuantity,
      r.prStatus === 'has_pr' ? '已PR' : r.prStatus === 'no_pr' ? '未PR' : '-',
      r.poStatus === 'has_po' ? '已PO' : r.poStatus === 'no_po' ? '未PO' : '-',
      r.leadtime,
      r.endDate.toISOString().slice(0, 10),
    ].join(',')
  ).join('\n');
  const blob = new Blob(['\ufeff' + headers + lines], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `缺料清单_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ShortageList({ bars }: ShortageListProps) {
  const shortageItems = useMemo(() => {
    const flat = ganttService.flattenGanttBars(bars);
    return flat.filter(b => b.hasShortage);
  }, [bars]);

  if (shortageItems.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">缺料清单</h3>
        <div className="text-center py-6 text-slate-400 text-sm">
          无缺料物料
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      {/* 标题 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-800">
          缺料清单
          <span className="ml-2 text-xs font-normal text-red-500">({shortageItems.length} 项)</span>
        </h3>
        <button
          onClick={() => exportCSV(shortageItems)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <Download size={14} />
          导出CSV
        </button>
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-600">
              <th className="text-left px-3 py-2 font-medium">物料编码</th>
              <th className="text-left px-3 py-2 font-medium">物料名称</th>
              <th className="text-right px-3 py-2 font-medium">缺口数量</th>
              <th className="text-center px-3 py-2 font-medium">PR</th>
              <th className="text-center px-3 py-2 font-medium">PO</th>
              <th className="text-right px-3 py-2 font-medium">交期</th>
            </tr>
          </thead>
          <tbody>
            {shortageItems.map(item => (
              <tr key={item.materialCode} className="border-t border-slate-100 hover:bg-red-50/30">
                <td className="px-3 py-2 font-mono text-slate-700">{item.materialCode}</td>
                <td className="px-3 py-2 text-slate-800">{item.materialName}</td>
                <td className="px-3 py-2 text-right text-red-600 font-semibold">
                  {item.shortageQuantity.toLocaleString()}
                </td>
                <td className="px-3 py-2 text-center">
                  {item.prStatus === 'has_pr' ? (
                    <span className="text-green-600">✅</span>
                  ) : item.prStatus === 'no_pr' ? (
                    <span className="text-red-500">❌</span>
                  ) : (
                    <span className="text-slate-300">-</span>
                  )}
                </td>
                <td className="px-3 py-2 text-center">
                  {item.poStatus === 'has_po' ? (
                    <span className="text-green-600">✅</span>
                  ) : item.poStatus === 'no_po' ? (
                    <span className="text-red-500">❌</span>
                  ) : (
                    <span className="text-slate-300">-</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right text-slate-600">{item.leadtime}天</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
