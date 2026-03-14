/**
 * 总结报告展示组件
 *
 * PRD v2.8 第 8.3.2 节
 * 已结束任务（completed / incomplete）的详情页中展示
 */

import React from 'react';
import type { TaskSummaryReport as TSR } from '../../types/planningV2';

interface TaskSummaryReportProps {
  report: TSR;
}

export default function TaskSummaryReport({ report }: TaskSummaryReportProps) {
  const { planVsActual, productCompletion, materialCompletion } = report;

  const timeDiffLabel = (() => {
    if (planVsActual.timeDiffDays == null) return null;
    if (planVsActual.timeDiffDays <= 0) return `比计划提前 ${Math.abs(planVsActual.timeDiffDays)} 天`;
    return `比计划延迟 ${planVsActual.timeDiffDays} 天`;
  })();

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
        <h3 className="text-sm font-semibold text-slate-800">总结报告</h3>
        <p className="text-[10px] text-slate-400 mt-0.5">
          生成时间：{new Date(report.generatedAt).toLocaleString('zh-CN')}
        </p>
      </div>

      <div className="p-4 space-y-4">
        {/* 计划 vs 实际 */}
        <div className="border border-slate-100 rounded-lg p-3">
          <h4 className="text-xs font-medium text-slate-600 mb-2">计划 vs 实际</h4>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-400">计划生产周期</span>
              <div className="text-slate-700 mt-0.5">
                {planVsActual.productionPeriod?.start ?? '-'} ~ {planVsActual.productionPeriod?.end ?? '-'}
              </div>
            </div>
            <div>
              <span className="text-slate-400">实际入库时间</span>
              <div className="mt-0.5">
                {planVsActual.actualInboundDate ? (
                  <span className={planVsActual.hasSignificantDelay ? 'text-red-600 font-medium' : 'text-slate-700'}>
                    {planVsActual.actualInboundDate.slice(0, 10)}
                    {timeDiffLabel && (
                      <span className="ml-1 text-[10px] text-slate-500">({timeDiffLabel})</span>
                    )}
                  </span>
                ) : (
                  <span className="text-orange-500">无入库记录</span>
                )}
              </div>
            </div>
            <div>
              <span className="text-slate-400">计划数量</span>
              <div className="text-slate-700 mt-0.5">{productCompletion.plannedQuantity.toLocaleString()} 套</div>
            </div>
            <div>
              <span className="text-slate-400">入库数量</span>
              <div className="mt-0.5">
                {productCompletion.inboundQuantity != null ? (
                  <span className="text-slate-700">
                    {productCompletion.inboundQuantity.toLocaleString()} 套
                    {productCompletion.completionRate != null && (
                      <span className="ml-1 text-[10px] text-slate-500">
                        (完成率 {productCompletion.completionRate}%)
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-orange-500">-</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 物料完成统计 */}
        <div className="border border-slate-100 rounded-lg p-3">
          <h4 className="text-xs font-medium text-slate-600 mb-2">物料完成统计</h4>
          <div className="flex items-center gap-4 text-xs">
            <div>
              <span className="text-slate-400">物料总数</span>
              <div className="text-slate-700 font-medium mt-0.5">{materialCompletion.totalMaterials}</div>
            </div>
            <div>
              <span className="text-slate-400">已下PO</span>
              <div className="text-green-600 font-medium mt-0.5">{materialCompletion.withPO}</div>
            </div>
            <div>
              <span className="text-slate-400">未下PO</span>
              <div className="text-orange-600 font-medium mt-0.5">{materialCompletion.withoutPO}</div>
            </div>
            <div>
              <span className="text-slate-400">缺口</span>
              <div className="text-red-600 font-medium mt-0.5">{materialCompletion.shortageCount}</div>
            </div>
            <div>
              <span className="text-slate-400">风险</span>
              <div className="text-amber-600 font-medium mt-0.5">{materialCompletion.riskCount}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
