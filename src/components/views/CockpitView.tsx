import { lazy, Suspense, useState, useEffect } from 'react';
import { MessageSquare } from 'lucide-react';

// 首屏立即加载（图谱面板最重要）
import SupplyChainGraphPanel from '../cockpit/SupplyChainGraphPanel';

// 其余面板懒加载，按批次错开挂载，缓解并发请求压力
const AIAnalysisPanel      = lazy(() => import('../cockpit/AIAnalysisPanel'));
const ProductInventoryPanel = lazy(() => import('../cockpit/ProductInventoryPanel'));
const MaterialInventoryPanel = lazy(() => import('../cockpit/MaterialInventoryPanel'));
const ProcurementPanel     = lazy(() => import('../cockpit/ProcurementPanel'));
const OrderRiskPanel       = lazy(() => import('../cockpit/OrderRiskPanel'));
const ProductionPlanPanel  = lazy(() => import('../cockpit/ProductionPlanPanel'));

const PanelFallback = () => (
  <div className="bg-white rounded-xl border border-slate-200 p-6 animate-pulse">
    <div className="h-4 bg-slate-100 rounded w-1/3 mb-4" />
    <div className="h-24 bg-slate-100 rounded" />
  </div>
);

interface Props {
  onNavigate?: (view: string) => void;
  toggleCopilot?: () => void;
}

/**
 * 分批渲染策略：
 * batch 0 = 立即 — SupplyChainGraphPanel（使用 metricModelApi，相对轻量）
 * batch 1 = 800ms — 产品库存 + 物料库存（metricModelApi，不占用 ontology 连接）
 * batch 2 = 1600ms — 采购面板 + 订单面板（ontology: po/pr/salesorder）
 * batch 3 = 2400ms — 生产计划面板（ontology: mps）+ AI 分析
 * 每批间隔 800ms，确保前一批请求已基本发出后再发下一批，避免 6 连接限制打满。
 */
const CockpitView = ({ onNavigate, toggleCopilot }: Props) => {
  const [batch, setBatch] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setBatch(1), 800);
    const t2 = setTimeout(() => setBatch(2), 1600);
    const t3 = setTimeout(() => setBatch(3), 2400);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">供应链驾驶舱</h1>
      </div>

      {/* Batch 0 — 立即渲染 */}
      <SupplyChainGraphPanel onNavigate={onNavigate} />

      {/* Batch 1 — 800ms 后挂载 */}
      {batch >= 1 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Suspense fallback={<PanelFallback />}>
            <ProductInventoryPanel onNavigate={onNavigate} />
          </Suspense>
          <Suspense fallback={<PanelFallback />}>
            <MaterialInventoryPanel onNavigate={onNavigate} />
          </Suspense>
        </div>
      )}

      {/* Batch 2 — 1600ms 后挂载（ontology: po/pr/salesorder） */}
      {batch >= 2 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Suspense fallback={<PanelFallback />}>
            <ProcurementPanel onNavigate={onNavigate} />
          </Suspense>
          <Suspense fallback={<PanelFallback />}>
            <OrderRiskPanel onNavigate={onNavigate} />
          </Suspense>
        </div>
      )}

      {/* Batch 3 — 2400ms 后挂载（ontology: mps + AI） */}
      {batch >= 3 && (
        <>
          <Suspense fallback={<PanelFallback />}>
            <ProductionPlanPanel onNavigate={onNavigate} />
          </Suspense>
          <Suspense fallback={<PanelFallback />}>
            <AIAnalysisPanel />
          </Suspense>
        </>
      )}

      {/* Floating Chat Bubble Button */}
      {toggleCopilot && (
        <button
          onClick={toggleCopilot}
          className="fixed bottom-8 right-8 w-14 h-14 bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center z-40"
          aria-label="打开AI助手"
        >
          <MessageSquare size={24} />
        </button>
      )}
    </div>
  );
};

export default CockpitView;
