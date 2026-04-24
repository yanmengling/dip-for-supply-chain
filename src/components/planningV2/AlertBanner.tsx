/**
 * 预警横幅 + 预警明细面板
 *
 * PRD 10.1 / 10.3: 6 类预警维度，紧急/高/中分级展示
 * 在任务详情页顶部展示预警汇总横幅，可展开查看明细。
 *
 * 当前实现的预警维度（基于前端可获取的数据）：
 * 1. 齐套倒计时预警（demandEnd 倒计时）
 * 2. 缺口物料未下 PO
 * 3. PO 交期已过但未到料（based on poDeliverDate）
 * 4. 异常物料（无MRP且无库存）
 *
 * 注：PR/PO 未按 MRP 投放时间下达、重点物料进度异常等需要 MRP 详细数据
 *     或多次报告对比，暂不实现。
 */

import { useState, useMemo } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Clock,
  Package,
  XCircle,
} from 'lucide-react';
import type { GanttBar } from '../../types/planningV2';

interface AlertBannerProps {
  ganttBars: GanttBar[];
  demandEnd: string;
}

type AlertLevel = 'urgent' | 'high' | 'medium';

interface AlertItem {
  level: AlertLevel;
  type: string;
  materialCode: string;
  materialName: string;
  reason: string;
  deadline?: string;
}

/** Recursively flatten non-root bars, deduplicated by materialCode */
function flattenUniqueBars(bars: GanttBar[]): GanttBar[] {
  const map = new Map<string, GanttBar>();
  function walk(bar: GanttBar, isRoot: boolean) {
    if (!isRoot && !map.has(bar.materialCode)) {
      map.set(bar.materialCode, bar);
    }
    bar.children.forEach(c => walk(c, false));
  }
  bars.forEach(b => walk(b, true));
  return Array.from(map.values());
}

const levelConfig: Record<AlertLevel, { label: string; bgClass: string; textClass: string; icon: React.ReactNode }> = {
  urgent: {
    label: '紧急',
    bgClass: 'bg-red-100',
    textClass: 'text-red-700',
    icon: <XCircle className="w-3.5 h-3.5" />,
  },
  high: {
    label: '高',
    bgClass: 'bg-red-50',
    textClass: 'text-red-600',
    icon: <AlertCircle className="w-3.5 h-3.5" />,
  },
  medium: {
    label: '中',
    bgClass: 'bg-orange-50',
    textClass: 'text-orange-600',
    icon: <AlertTriangle className="w-3.5 h-3.5" />,
  },
};

const AlertBanner = ({ ganttBars, demandEnd }: AlertBannerProps) => {
  const [expanded, setExpanded] = useState(false);

  const alerts = useMemo<AlertItem[]>(() => {
    const items: AlertItem[] = [];
    const materials = flattenUniqueBars(ganttBars);
    const now = new Date();
    const deadline = new Date(demandEnd);
    const daysToDeadline = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    // 1. 齐套倒计时预警 (PRD 4.5.3)
    const shortageOrAnomaly = materials.filter(
      b => b.supplyStatus === 'shortage' || b.supplyStatus === 'anomaly'
    );
    if (shortageOrAnomaly.length > 0 && daysToDeadline <= 30) {
      const level: AlertLevel = daysToDeadline <= 7 ? 'urgent' : daysToDeadline <= 15 ? 'high' : 'medium';
      items.push({
        level,
        type: '齐套倒计时',
        materialCode: '-',
        materialName: '(全局)',
        reason: `距需求截止${daysToDeadline <= 0 ? '已过期' : `仅 ${daysToDeadline} 天`}，仍有 ${shortageOrAnomaly.length} 项物料问题`,
        deadline: demandEnd,
      });
    }

    // 2. 缺口物料未下 PO
    const shortageNoPO = materials.filter(
      b => b.supplyStatus === 'shortage' && (b.poStatus !== 'has_po')
    );
    for (const m of shortageNoPO) {
      items.push({
        level: 'high',
        type: '缺口未下PO',
        materialCode: m.materialCode,
        materialName: m.materialName,
        reason: `缺口 ${Math.abs(m.shortageQuantity)}，尚未下达 PO`,
        deadline: m.endDate.toISOString().slice(0, 10),
      });
    }

    // 3. PO 交期已过未到料
    const poOverdue = materials.filter(m => {
      if (m.poStatus !== 'has_po' || !m.poDeliverDate) return false;
      return new Date(m.poDeliverDate) < now && m.supplyStatus === 'shortage';
    });
    for (const m of poOverdue) {
      items.push({
        level: 'high',
        type: '超期未到料',
        materialCode: m.materialCode,
        materialName: m.materialName,
        reason: `PO 交期 ${m.poDeliverDate} 已过，物料仍有缺口`,
        deadline: m.poDeliverDate,
      });
    }

    // 4. 异常物料（无 MRP 且无库存）
    const anomalyMaterials = materials.filter(b => b.supplyStatus === 'anomaly');
    for (const m of anomalyMaterials) {
      items.push({
        level: 'medium',
        type: '异常物料',
        materialCode: m.materialCode,
        materialName: m.materialName,
        reason: '无 MRP 记录且无库存，请在 ERP 中核实',
      });
    }

    // Sort: urgent > high > medium
    const levelOrder: Record<AlertLevel, number> = { urgent: 0, high: 1, medium: 2 };
    items.sort((a, b) => levelOrder[a.level] - levelOrder[b.level]);

    return items;
  }, [ganttBars, demandEnd]);

  if (alerts.length === 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
        <Package className="w-4 h-4" />
        当前无异常预警
      </div>
    );
  }

  const urgentCount = alerts.filter(a => a.level === 'urgent').length;
  const highCount = alerts.filter(a => a.level === 'high').length;
  const mediumCount = alerts.filter(a => a.level === 'medium').length;

  return (
    <div className="border border-red-200 rounded-lg overflow-hidden">
      {/* Banner */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-red-50 hover:bg-red-100 transition-colors"
      >
        <div className="flex items-center gap-2 text-sm">
          <AlertTriangle className="w-4 h-4 text-red-500" />
          <span className="font-medium text-red-700">预警提示</span>
          <div className="flex items-center gap-2 text-xs">
            {urgentCount > 0 && (
              <span className="px-1.5 py-0.5 bg-red-200 text-red-800 rounded">紧急 {urgentCount}</span>
            )}
            {highCount > 0 && (
              <span className="px-1.5 py-0.5 bg-red-100 text-red-700 rounded">高 {highCount}</span>
            )}
            {mediumCount > 0 && (
              <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 rounded">中 {mediumCount}</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-red-500">
          {expanded ? '收起' : '查看明细'}
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </div>
      </button>

      {/* Detail panel */}
      {expanded && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
                <th className="text-left px-3 py-2 font-medium w-16">级别</th>
                <th className="text-left px-3 py-2 font-medium w-24">类型</th>
                <th className="text-left px-3 py-2 font-medium">物料编码</th>
                <th className="text-left px-3 py-2 font-medium">物料名称</th>
                <th className="text-left px-3 py-2 font-medium">异常原因</th>
                <th className="text-left px-3 py-2 font-medium w-24">截止时间</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((alert, i) => {
                const cfg = levelConfig[alert.level];
                return (
                  <tr key={i} className={`border-b border-slate-100 ${cfg.bgClass}`}>
                    <td className="px-3 py-2">
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium ${cfg.textClass}`}>
                        {cfg.icon}
                        {cfg.label}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-700">{alert.type}</td>
                    <td className="px-3 py-2 font-mono text-slate-700">{alert.materialCode}</td>
                    <td className="px-3 py-2 text-slate-700 max-w-[140px] truncate" title={alert.materialName}>
                      {alert.materialName}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{alert.reason}</td>
                    <td className="px-3 py-2 text-slate-500">{alert.deadline || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AlertBanner;
