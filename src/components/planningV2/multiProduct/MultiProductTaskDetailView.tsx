// src/components/planningV2/multiProduct/MultiProductTaskDetailView.tsx

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { ChevronLeft, RefreshCw, Loader2, Layers } from 'lucide-react';
import { MultiProductGanttTab } from './MultiProductGanttTab';
import { MultiProductMaterialTab } from './MultiProductMaterialTab';
import MultiProductDailyReport from './MultiProductDailyReport';
import WorkOrderTracker from '../WorkOrderTracker';
import { multiProductGanttService } from '../../../services/multiProductGanttService';
import { flattenGanttBars } from '../../../services/ganttService';
import { planningV2DataService } from '../../../services/planningV2DataService';
import type { MPSWorkOrderAPI } from '../../../services/planningV2DataService';
import type { MultiProductTask, MultiProductGanttResult } from '../../../types/multiProductTask';
import type { GanttBar } from '../../../types/planningV2';

interface MultiProductTaskDetailViewProps {
  task: MultiProductTask;
  onBack: () => void;
}

type LoadPhase = 'loading' | 'loaded' | 'error';
type ActiveTab = 'gantt' | 'materials' | 'workorders' | 'report';

/**
 * 大预测单多产品监测任务详情页。
 * Tab 1: 多产品甘特图（各产品独立展开，可折叠，支持搜索）
 * Tab 2: 物料监测清单（风险文本 + 过滤分页 + 展开详情 + 共用物料面板）
 * Tab 3: 关联生产工单（聚合所有产品自制件 MRP 工单）
 * Tab 4: 每日监测报告（只读，手动生成，localStorage 持久化）
 */
export const MultiProductTaskDetailView: React.FC<MultiProductTaskDetailViewProps> = ({
  task,
  onBack,
}) => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('gantt');
  const [materialSearch, setMaterialSearch] = useState<string | undefined>(undefined);
  const [loadPhase, setLoadPhase] = useState<LoadPhase>('loading');
  const [result, setResult] = useState<MultiProductGanttResult | null>(null);
  const [mpsOrders, setMpsOrders] = useState<MPSWorkOrderAPI[]>([]);
  const [scheduledMrpBillnos, setScheduledMrpBillnos] = useState<Set<string>>(new Set());
  const [errorMsg, setErrorMsg] = useState('');
  const [dataTime, setDataTime] = useState('');
  const [perfEntries, setPerfEntries] = useState<{ name: string; duration: number }[]>([]);
  const [showPerf, setShowPerf] = useState(false);
  const loadGenRef = useRef(0);

  const loadData = useCallback(async () => {
    const gen = ++loadGenRef.current;
    setLoadPhase('loading');
    setErrorMsg('');
    performance.clearMarks();
    performance.clearMeasures();
    try {
      const r = await multiProductGanttService.buildMultiProductGanttData(task);
      if (gen !== loadGenRef.current) return;
      setResult(r);
      setDataTime(
        new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
      );
      // 采集所有 [Perf] 前缀的 measure 条目
      const entries = performance.getEntriesByType('measure')
        .filter(e => e.name.startsWith('[Perf]'))
        .map(e => ({ name: e.name.replace('[Perf] ', ''), duration: Math.round(e.duration) }));
      setPerfEntries(entries);
      setLoadPhase('loaded');

      // 并行加载 MPS 生产工单（供 Tab2 物料状态过滤 + Tab3 关联工单共用）
      const allBillnos: string[] = [];
      for (const entry of r.productGantts.values()) {
        for (const billno of entry.selfMadeMrpBillnos) allBillnos.push(billno);
      }
      const uniqueBillnos = Array.from(new Set(allBillnos));
      if (uniqueBillnos.length > 0) {
        planningV2DataService.loadMPSBySelfMadeMrpBillnos(uniqueBillnos)
          .then(orders => {
            if (gen !== loadGenRef.current) return;
            setMpsOrders(orders);
            const scheduled = new Set<string>();
            for (const order of orders) {
              if (order.sourcebillnumber) scheduled.add(order.sourcebillnumber);
            }
            setScheduledMrpBillnos(scheduled);
          })
          .catch(err => {
            console.error('[MultiProductTaskDetailView] MPS 加载失败:', err);
          });
      } else {
        setMpsOrders([]);
        setScheduledMrpBillnos(new Set());
      }
    } catch (err) {
      if (gen !== loadGenRef.current) return;
      setErrorMsg(err instanceof Error ? err.message : String(err));
      setLoadPhase('error');
    }
  }, [task]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 汇总所有产品的自制件 MRP 单号和投放时间，供 Tab3 使用
  const { allSelfMadeMrpBillnos, allMrpDroptimeMap } = useMemo(() => {
    if (!result) return { allSelfMadeMrpBillnos: [], allMrpDroptimeMap: {} };
    const billnoSet = new Set<string>();
    const droptimeMap: Record<string, string> = {};
    for (const entry of result.productGantts.values()) {
      for (const billno of entry.selfMadeMrpBillnos) {
        billnoSet.add(billno);
      }
      Object.assign(droptimeMap, entry.selfMadeMrpDroptimeMap);
    }
    return { allSelfMadeMrpBillnos: Array.from(billnoSet), allMrpDroptimeMap: droptimeMap };
  }, [result]);

  // 汇总卡片数据
  const summary = useMemo(() => {
    if (!result) return null;
    const seenMaterials = new Set<string>();
    let riskProductCount = 0;
    let allocationIssueCount = 0;

    for (const entry of result.productGantts.values()) {
      if (!entry.loaded) continue;
      let hasRisk = false;
      for (const bar of flattenGanttBars(entry.bars)) {
        seenMaterials.add(bar.materialCode);
        if (bar.supplyStatus === 'shortage' || bar.supplyStatus === 'anomaly') hasRisk = true;
      }
      if (hasRisk) riskProductCount++;
    }
    for (const sm of result.sharedMaterials.values()) {
      if (sm.allocationSuggestion) allocationIssueCount++;
    }
    const sharedCount = result.exclusiveMaterialCodes
      ? result.sharedMaterials.size - result.exclusiveMaterialCodes.size
      : result.sharedMaterials.size;

    return {
      totalMaterials: seenMaterials.size,
      sharedCount,
      riskProductCount,
      allocationIssueCount,
    };
  }, [result]);

  return (
    <div className="flex flex-col h-full">
      {/* 页头 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white flex-shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <Layers className="w-4 h-4 text-indigo-500" />
          <div>
            <div className="font-semibold text-slate-800 text-sm">{task.name}</div>
            <div className="text-xs text-slate-400">
              {task.forecastBillno} · {task.forecastMeta.auditorName} · {task.products.length} 个产品
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          {dataTime && <span>数据时间 {dataTime}</span>}
          {perfEntries.length > 0 && (
            <button
              type="button"
              onClick={() => setShowPerf(v => !v)}
              className={`px-2 py-0.5 rounded text-[11px] border transition-colors ${
                showPerf
                  ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
                  : 'border-slate-200 text-slate-400 hover:bg-slate-50'
              }`}
            >
              ⏱ 性能
            </button>
          )}
          <button
            onClick={loadData}
            disabled={loadPhase === 'loading'}
            className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-600 disabled:opacity-50"
            title="刷新数据"
          >
            {loadPhase === 'loading'
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <RefreshCw className="w-3.5 h-3.5" />
            }
          </button>
        </div>
      </div>

      {/* 汇总卡片 */}
      {summary && (
        <div className="flex border-b border-slate-200 bg-slate-50 flex-shrink-0">
          {([
            ['总产品', task.products.length],
            ['物料种类', summary.totalMaterials],
            ['共用物料', summary.sharedCount],
            ['风险产品', summary.riskProductCount],
            ['分配不足', summary.allocationIssueCount],
          ] as [string, number][]).map(([label, value]) => (
            <div key={label} className="flex-1 text-center py-2 border-r border-slate-200 last:border-r-0">
              <div className="text-base font-semibold text-slate-800">{value}</div>
              <div className="text-[11px] text-slate-400">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* 性能面板 */}
      {showPerf && perfEntries.length > 0 && (() => {
        const summary = perfEntries.filter(e => /^\d/.test(e.name)); // "0.", "1.", "2.", "3."
        const perProduct = perfEntries.filter(e => /^[A-Za-z0-9].*[①②③]/.test(e.name));
        // 按产品编码分组
        const productGroups = new Map<string, { name: string; duration: number }[]>();
        for (const e of perProduct) {
          const code = e.name.split(' ')[0];
          if (!productGroups.has(code)) productGroups.set(code, []);
          productGroups.get(code)!.push(e);
        }
        const durationColor = (ms: number) =>
          ms > 3000 ? 'text-red-500' : ms > 1000 ? 'text-amber-500' : 'text-green-600';
        return (
          <div className="border-b border-slate-200 bg-slate-50 px-4 py-2 flex-shrink-0 text-[11px]">
            {/* 顶层汇总 */}
            <div className="flex flex-wrap gap-x-5 gap-y-1 mb-2">
              {summary.map(e => (
                <div key={e.name} className="flex items-center gap-1.5">
                  <span className="text-slate-500">{e.name}</span>
                  <span className={`font-mono font-semibold ${durationColor(e.duration)}`}>{e.duration}ms</span>
                </div>
              ))}
            </div>
            {/* 单产品明细（可折叠） */}
            {productGroups.size > 0 && (
              <details>
                <summary className="cursor-pointer text-slate-400 hover:text-slate-600 select-none mb-1">
                  单产品明细（{productGroups.size} 个）
                </summary>
                <div className="space-y-0.5 mt-1">
                  {Array.from(productGroups.entries()).map(([code, steps]) => (
                    <div key={code} className="flex items-center gap-3">
                      <span className="font-mono text-slate-500 w-28 flex-shrink-0">{code}</span>
                      {steps.map(s => {
                        const label = s.name.replace(code + ' ', '');
                        return (
                          <span key={s.name} className="flex items-center gap-1">
                            <span className="text-slate-400">{label}</span>
                            <span className={`font-mono font-medium ${durationColor(s.duration)}`}>{s.duration}ms</span>
                          </span>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        );
      })()}

      {/* Tab 切换 */}
      <div className="flex border-b border-slate-200 bg-white flex-shrink-0">
        {([
          ['gantt', '多产品甘特图'],
          ['materials', '物料监测清单'],
          ['workorders', '关联生产工单'],
          ['report', '每日监测报告'],
        ] as [ActiveTab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2.5 text-sm border-b-2 transition-colors ${
              activeTab === key
                ? 'border-indigo-500 text-indigo-600 font-medium'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-y-auto p-4">
        {loadPhase === 'error' && (
          <div className="text-center py-12">
            <div className="text-red-500 text-sm mb-2">{errorMsg}</div>
            <button onClick={loadData} className="text-xs text-indigo-500 hover:underline">
              重试
            </button>
          </div>
        )}

        {activeTab === 'gantt' && (
          <MultiProductGanttTab
            task={task}
            result={result}
            isLoading={loadPhase === 'loading'}
            onMaterialClick={(code) => {
              setMaterialSearch(code);
              setActiveTab('materials');
            }}
          />
        )}

        {activeTab === 'materials' && (
          <MultiProductMaterialTab
            result={result}
            isLoading={loadPhase === 'loading'}
            externalSearch={materialSearch}
            scheduledMrpBillnos={scheduledMrpBillnos}
          />
        )}

        {activeTab === 'workorders' && (
          <WorkOrderTracker
            orders={mpsOrders}
            mrpDroptimeMap={allMrpDroptimeMap}
          />
        )}

        {activeTab === 'report' && (
          <MultiProductDailyReport
            task={task}
            result={result}
            scheduledMrpBillnos={scheduledMrpBillnos}
          />
        )}
      </div>
    </div>
  );
};
