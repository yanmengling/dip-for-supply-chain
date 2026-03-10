/**
 * 物料齐套状态卡片
 *
 * PRD 4.5.3 / 6.4: 齐套判定、预计齐套日期、倒计时预警、降级模式处理
 * - shortage==0 && anomaly==0 → 已齐套
 * - 降级模式 → 橙色"待确认齐套"
 * - 异常物料 → 橙色警告
 */

import { useMemo } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import type { GanttBar } from '../../types/planningV2';
import type { DegradationInfo } from '../../services/ganttService';

interface MatchingStatusCardProps {
  ganttBars: GanttBar[];
  demandEnd: string;
  degradation?: DegradationInfo;
}

/** Recursively flatten non-root bars */
function flattenBars(bars: GanttBar[]): GanttBar[] {
  const result: GanttBar[] = [];
  function walk(bar: GanttBar, isRoot: boolean) {
    if (!isRoot) result.push(bar);
    bar.children.forEach(c => walk(c, false));
  }
  bars.forEach(b => walk(b, true));
  return result;
}

type MatchStatus =
  | 'matched'            // 已齐套
  | 'matched_degraded'   // 已齐套（降级模式）
  | 'unmatched'          // 未齐套
  | 'unmatched_degraded'; // 未齐套（降级模式）

interface MatchingResult {
  status: MatchStatus;
  shortageCount: number;
  anomalyCount: number;
  totalMaterials: number;
  shortageWithPO: number;
  shortageWithoutPO: number;
  estimatedMatchDate: string | null;
  daysToDeadline: number;
  urgencyLevel: 'urgent' | 'warning' | 'notice' | null;
}

const MatchingStatusCard = ({ ganttBars, demandEnd, degradation }: MatchingStatusCardProps) => {
  const result = useMemo<MatchingResult>(() => {
    const allMaterials = flattenBars(ganttBars);
    const uniqueByCode = new Map<string, GanttBar>();
    allMaterials.forEach(b => {
      if (!uniqueByCode.has(b.materialCode)) uniqueByCode.set(b.materialCode, b);
    });
    const materials = Array.from(uniqueByCode.values());

    const shortageItems = materials.filter(b => b.supplyStatus === 'shortage');
    const anomalyItems = materials.filter(b => b.supplyStatus === 'anomaly');
    const isFullyMatched = shortageItems.length === 0 && anomalyItems.length === 0;
    const isDataDegraded = degradation ? (degradation.mrp || degradation.pr || degradation.po) : false;

    // PRD 4.5.3: 预计齐套日期 - 取缺口物料最晚 PO 交货日
    const shortageWithPO = shortageItems.filter(b => b.poStatus === 'has_po' && b.poDeliverDate);
    const shortageWithoutPO = shortageItems.filter(b => b.poStatus !== 'has_po' || !b.poDeliverDate);
    let estimatedMatchDate: string | null = null;
    if (shortageWithPO.length > 0 && shortageWithoutPO.length === 0) {
      const dates = shortageWithPO.map(b => b.poDeliverDate!).sort();
      estimatedMatchDate = dates[dates.length - 1];
    }

    // PRD 4.5.3: 齐套倒计时预警
    const now = new Date();
    const deadline = new Date(demandEnd);
    const daysToDeadline = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    let urgencyLevel: MatchingResult['urgencyLevel'] = null;
    if (!isFullyMatched) {
      if (daysToDeadline <= 7) urgencyLevel = 'urgent';
      else if (daysToDeadline <= 15) urgencyLevel = 'warning';
      else if (daysToDeadline <= 30) urgencyLevel = 'notice';
    }

    // PRD 4.5.3: 降级模式齐套判定
    let status: MatchStatus;
    if (isDataDegraded) {
      status = isFullyMatched ? 'matched_degraded' : 'unmatched_degraded';
    } else {
      status = isFullyMatched ? 'matched' : 'unmatched';
    }

    return {
      status,
      shortageCount: shortageItems.length,
      anomalyCount: anomalyItems.length,
      totalMaterials: materials.length,
      shortageWithPO: shortageWithPO.length,
      shortageWithoutPO: shortageWithoutPO.length,
      estimatedMatchDate,
      daysToDeadline,
      urgencyLevel,
    };
  }, [ganttBars, demandEnd, degradation]);

  // Status display config
  const statusConfig = {
    matched: {
      icon: <CheckCircle2 className="w-5 h-5 text-green-600" />,
      label: '已齐套',
      bgClass: 'bg-green-50 border-green-200',
      textClass: 'text-green-800',
    },
    matched_degraded: {
      icon: <ShieldAlert className="w-5 h-5 text-amber-600" />,
      label: '已齐套（数据精度受限）',
      bgClass: 'bg-amber-50 border-amber-200',
      textClass: 'text-amber-800',
    },
    unmatched: {
      icon: <XCircle className="w-5 h-5 text-red-600" />,
      label: '未齐套',
      bgClass: 'bg-red-50 border-red-200',
      textClass: 'text-red-800',
    },
    unmatched_degraded: {
      icon: <ShieldAlert className="w-5 h-5 text-amber-600" />,
      label: '未齐套（数据为兜底模式）',
      bgClass: 'bg-amber-50 border-amber-200',
      textClass: 'text-amber-800',
    },
  };

  const cfg = statusConfig[result.status];

  // Urgency config
  const urgencyConfig = {
    urgent: { bgClass: 'bg-red-100 text-red-700', label: `距需求截止仅 ${result.daysToDeadline} 天，仍有 ${result.shortageCount + result.anomalyCount} 项问题！` },
    warning: { bgClass: 'bg-orange-100 text-orange-700', label: `距需求截止 ${result.daysToDeadline} 天，仍有 ${result.shortageCount + result.anomalyCount} 项问题` },
    notice: { bgClass: 'bg-yellow-100 text-yellow-700', label: `距需求截止 ${result.daysToDeadline} 天，请关注缺口物料进度` },
  };

  return (
    <div className={`rounded-lg border p-4 ${cfg.bgClass}`}>
      <div className="flex items-center gap-2 mb-2">
        {cfg.icon}
        <h4 className={`font-semibold text-sm ${cfg.textClass}`}>
          物料齐套状态
        </h4>
      </div>

      {/* Main status */}
      <div className={`text-sm font-medium ${cfg.textClass} mb-2`}>
        {cfg.label}
        {result.status === 'matched' && (
          <span className="ml-2 font-normal text-green-600">所有物料已齐套，可安排生产工单</span>
        )}
        {result.status === 'matched_degraded' && (
          <span className="ml-2 font-normal text-amber-600">建议在 ERP 中确认齐套状态</span>
        )}
      </div>

      {/* Shortage details */}
      {result.shortageCount > 0 && (
        <div className="text-sm text-slate-700 space-y-0.5 mb-2">
          <p>物料缺口: {result.shortageCount} 项
            {result.shortageWithPO > 0 && (
              <span className="text-slate-500">（其中 {result.shortageWithPO} 项已下PO，等待到料）</span>
            )}
          </p>
          {result.estimatedMatchDate && (
            <p className="flex items-center gap-1 text-blue-600">
              <Clock className="w-3.5 h-3.5" />
              预计 {result.estimatedMatchDate} 可齐套（基于PO交货日，粗略估算）
            </p>
          )}
          {result.shortageWithoutPO > 0 && (
            <p className="text-red-600">
              {result.shortageWithoutPO} 项缺口未下PO，无法预估齐套日期
            </p>
          )}
        </div>
      )}

      {/* Anomaly warning */}
      {result.anomalyCount > 0 && (
        <div className="flex items-start gap-1.5 text-sm text-amber-700 bg-amber-50 rounded px-2 py-1.5 mb-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            {result.anomalyCount} 项物料异常（无MRP记录且无库存），请在 ERP 中核实
          </span>
        </div>
      )}

      {/* Degradation warning */}
      {(result.status === 'matched_degraded' || result.status === 'unmatched_degraded') && (
        <div className="text-xs text-amber-600 bg-amber-50/50 rounded px-2 py-1 mb-2">
          数据精度受限：部分查询环节使用了兜底匹配模式，缺口数据可能不精准
        </div>
      )}

      {/* Urgency countdown */}
      {result.urgencyLevel && (
        <div className={`text-xs font-medium rounded px-2 py-1 ${urgencyConfig[result.urgencyLevel].bgClass}`}>
          {urgencyConfig[result.urgencyLevel].label}
        </div>
      )}
    </div>
  );
};

export default MatchingStatusCard;
