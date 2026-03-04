/**
 * 数据溯源信息板（可折叠）
 *
 * 在新建任务四步流程（步骤①②③④）和监测任务详情页底部展示：
 * - 使用了哪些业务对象
 * - 查询条件
 * - 数据处理规则
 * - 实时统计结果（③④和任务详情）
 *
 * 默认收缩，点击标题行展开。
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, Database } from 'lucide-react';
import type { NewTaskStep, PlanningTask } from '../../types/planningV2';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface StepStats {
  mrpCount?: number;
  bomTotalCount?: number;
  bomMainCount?: number;
  totalMaterials?: number;
  shortageCount?: number;
  poCount?: number;
}

type PanelStep = NewTaskStep | 'task-detail';

interface DataLineagePanelProps {
  step: PanelStep;
  /** 运行时统计（步骤③④和任务详情填充） */
  stats?: StepStats;
  /** 任务对象（任务详情模式使用） */
  task?: PlanningTask;
  /** 步骤③④的产品编码（用于显示查询条件） */
  productCode?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
    {children}
  </div>
);

const ObjectTag = ({ id, label }: { id: string; label: string }) => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 border border-indigo-100 text-xs font-mono text-indigo-700">
    <Database className="w-3 h-3 shrink-0" />
    <span className="font-semibold">{id}</span>
    <span className="text-indigo-400 font-normal ml-0.5">{label}</span>
  </span>
);

const Row = ({ label, value, highlight }: { label: string; value: React.ReactNode; highlight?: boolean }) => (
  <div className="flex items-start gap-2 py-1 border-b border-slate-50 last:border-0">
    <span className="text-xs text-slate-400 w-28 shrink-0 pt-0.5">{label}</span>
    <span className={`text-xs flex-1 ${highlight ? 'text-orange-600 font-medium' : 'text-slate-700'}`}>
      {value}
    </span>
  </div>
);

const StatGrid = ({ items }: { items: { label: string; value: React.ReactNode; red?: boolean }[] }) => (
  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
    {items.map((item, i) => (
      <div key={i} className="bg-slate-50 rounded px-2.5 py-1.5">
        <div className="text-xs text-slate-400">{item.label}</div>
        <div className={`text-sm font-semibold mt-0.5 ${item.red ? 'text-red-600' : 'text-slate-800'}`}>
          {item.value ?? <span className="text-slate-300 font-normal text-xs">加载中…</span>}
        </div>
      </div>
    ))}
  </div>
);

const Code = ({ children }: { children: React.ReactNode }) => (
  <code className="px-1 py-0.5 rounded bg-slate-100 text-xs font-mono text-slate-700">{children}</code>
);

// ─────────────────────────────────────────────────────────────────────────────
// Step content renderers
// ─────────────────────────────────────────────────────────────────────────────

const Step1Content = () => (
  <div className="space-y-4">
    <div>
      <SectionTitle>业务对象</SectionTitle>
      <div className="flex flex-wrap gap-2">
        <ObjectTag id="supplychain_hd0202_pp" label="产品需求计划" />
      </div>
    </div>
    <div>
      <SectionTitle>查询条件</SectionTitle>
      <div className="space-y-0.5">
        <Row label="加载方式" value="全量加载（limit: 10000），无服务端过滤" />
        <Row label="产品列表" value={<>前端按 <Code>product_code</Code> 去重</>} />
        <Row label="缓存" value="key: pp_data，TTL 5 分钟" />
      </div>
    </div>
    <div>
      <SectionTitle>数据处理逻辑</SectionTitle>
      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
        <li>全量 PP 记录按 <Code>product_code</Code> 去重得到产品列表（共82条）</li>
        <li>选定产品后，聚合该产品所有 PP 记录：最早 <Code>planned_date</Code> 为需求开始，最晚为需求结束</li>
        <li>需求数量 = Σ <Code>planned_demand_quantity</Code></li>
        <li>时间范围和数量字段用户可手动修改后再确认</li>
      </ul>
    </div>
  </div>
);

const Step2Content = () => (
  <div className="space-y-4">
    <div>
      <SectionTitle>业务对象</SectionTitle>
      <div className="flex flex-wrap gap-2">
        <ObjectTag id="supplychain_hd0202_mps" label="工厂生产计划" />
      </div>
    </div>
    <div>
      <SectionTitle>查询条件</SectionTitle>
      <div className="space-y-0.5">
        <Row label="加载方式" value="全量加载（limit: 10000），前端过滤" />
        <Row label="匹配规则" value={<><Code>bom_code == productCode</Code>（步骤①选定产品）</>} />
        <Row label="排序" value={<>按 <Code>seq_no</Code> 升序，取第一条匹配记录</>} />
        <Row label="无 MPS 时" value="使用步骤①的需求计划数据兜底，橙色提示条提示" highlight />
        <Row label="缓存" value="key: mps_data，TTL 5 分钟" />
      </div>
    </div>
    <div>
      <SectionTitle>数据处理逻辑</SectionTitle>
      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
        <li>全量加载后前端匹配 <Code>bom_code == productCode</Code></li>
        <li>有匹配时：生产开始时间取 <Code>planned_start_date</Code>，数量取 <Code>quantity</Code>，生产结束时间回退到步骤①结束时间</li>
        <li>无匹配时：全部字段使用步骤①需求计划数据</li>
        <li>三个字段均可编辑后再确认</li>
      </ul>
    </div>
  </div>
);

const Step3Content = ({ productCode, stats }: { productCode?: string; stats?: StepStats }) => (
  <div className="space-y-4">
    <div>
      <SectionTitle>业务对象（并行查询）</SectionTitle>
      <div className="flex flex-wrap gap-2">
        <ObjectTag id="supplychain_hd0202_mrp" label="物料需求计划" />
        <ObjectTag id="supplychain_hd0202_bom" label="BOM" />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <ObjectTag id="supplychain_hd0202_material" label="物料主数据" />
        <ObjectTag id="supplychain_hd0202_pr" label="采购申请" />
        <ObjectTag id="supplychain_hd0202_po" label="采购订单" />
      </div>
    </div>
    <div>
      <SectionTitle>查询条件</SectionTitle>
      <div className="space-y-0.5">
        <Row label="MRP 条件" value={<><Code>finished_product_code == {productCode ?? '…'}</Code></>} />
        <Row label="BOM 条件" value={<><Code>bom_material_code == {productCode ?? '…'}</Code>；取 bom_version 字典序最大</>} />
        <Row label="物料集合" value={<>BOM 主料去重（<Code>alt_part</Code> 为空或 '0'），<strong>不</strong> union MRP extra codes</>} />
        <Row label="Material/PR/PO" value={<><Code>material_code / material_number in [codes]</Code>，分片 50 个/批，串行</>} />
        <Row label="缓存" value="bom_{productCode}；Material/PR/PO 按 code 列表哈希；TTL 5 分钟" />
      </div>
    </div>
    <div>
      <SectionTitle>数据处理规则</SectionTitle>
      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
        <li>替代料判定：<Code>alt_part</Code> 非空且非 <Code>'0'</Code> → 排除（与甘特图 buildBOMTreeFromRecords 同步）</li>
        <li>净需求判定：<Code>netDemand = mrpMap.get(code)?.demand ?? 0</Code>；<Code>{'< 0'}</Code> 为缺口</li>
        <li>缺口行背景浅红 <Code>bg-red-50</Code>，数值红色加粗</li>
        <li>PR/PO 仅对外购/委外物料显示，自制件显示 —</li>
      </ul>
    </div>
    {(stats?.mrpCount !== undefined || stats?.bomTotalCount !== undefined || stats?.totalMaterials !== undefined) && (
      <div>
        <SectionTitle>本次查询结果</SectionTitle>
        <StatGrid items={[
          { label: 'MRP 记录数', value: stats?.mrpCount !== undefined ? `${stats.mrpCount} 条` : undefined },
          { label: 'BOM 全部记录', value: stats?.bomTotalCount !== undefined ? `${stats.bomTotalCount} 条` : undefined },
          { label: 'BOM 主料（最新版本）', value: stats?.bomMainCount !== undefined ? `${stats.bomMainCount} 种` : undefined },
          { label: '满足物料', value: stats?.totalMaterials !== undefined && stats?.shortageCount !== undefined ? `${stats.totalMaterials - stats.shortageCount} 种` : undefined },
          { label: '缺口物料', value: stats?.shortageCount !== undefined ? `${stats.shortageCount} 种` : undefined, red: (stats?.shortageCount ?? 0) > 0 },
        ]} />
      </div>
    )}
  </div>
);

const Step4Content = ({ productCode, stats }: { productCode?: string; stats?: StepStats }) => (
  <div className="space-y-4">
    <div>
      <SectionTitle>业务对象（同步骤③）</SectionTitle>
      <div className="flex flex-wrap gap-2">
        <ObjectTag id="supplychain_hd0202_bom" label="BOM" />
        <ObjectTag id="supplychain_hd0202_mrp" label="MRP" />
        <ObjectTag id="supplychain_hd0202_material" label="物料主数据" />
        <ObjectTag id="supplychain_hd0202_pr" label="PR" />
        <ObjectTag id="supplychain_hd0202_po" label="PO" />
      </div>
    </div>
    <div>
      <SectionTitle>查询条件</SectionTitle>
      <div className="space-y-0.5">
        <Row label="BOM 条件" value={<><Code>bom_material_code == {productCode ?? '…'}</Code>；取最新版本</>} />
        <Row label="MRP 条件" value={<><Code>finished_product_code == {productCode ?? '…'}</Code></>} />
        <Row label="Material/PR/PO" value={<><Code>in [allMaterialCodes]</Code>（含产品自身），分片 50 个/批</>} />
      </div>
    </div>
    <div>
      <SectionTitle>甘特图倒排规则（buildGanttData）</SectionTitle>
      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
        <li>buildBOMTreeFromRecords：过滤替代料建主料父→子映射</li>
        <li>BFS 倒排：子件 <Code>endDate = parent.startDate - 1天</Code>；<Code>startDate = endDate - leadtime</Code></li>
        <li>Leadtime：外购/委外取 <Code>purchase_fixedleadtime</Code>，自制取 <Code>product_fixedleadtime</Code>，≤0 兜底 7 天（字符串需 parseFloat）</li>
        <li>安全截断：<Code>MAX_NODES = 2000</Code>，visited Set 防环路</li>
        <li>缺口：<Code>mrpMap.get(code) {'< 0'}</Code> → <Code>hasShortage = true</Code></li>
      </ul>
    </div>
    {(stats?.totalMaterials !== undefined) && (
      <div>
        <SectionTitle>本次甘特图统计</SectionTitle>
        <StatGrid items={[
          { label: '物料种数（非根）', value: `${stats.totalMaterials} 种` },
          { label: '缺口物料', value: `${stats.shortageCount ?? 0} 种`, red: (stats.shortageCount ?? 0) > 0 },
          { label: '已下PO', value: `${stats.poCount ?? 0} 项` },
        ]} />
      </div>
    )}
  </div>
);

const TaskDetailContent = ({ task, stats }: { task?: PlanningTask; stats?: StepStats }) => (
  <div className="space-y-4">
    <div>
      <SectionTitle>任务持久化</SectionTitle>
      <div className="space-y-0.5">
        <Row label="存储位置" value={<>localStorage，key: <Code>planning_v2_tasks</Code></>} />
        <Row label="任务 ID" value={<Code>{task?.id ?? '—'}</Code>} />
        <Row label="创建时间" value={task?.createdAt ? new Date(task.createdAt).toLocaleString('zh-CN') : '—'} />
        <Row label="甘特图数据" value="不持久化，每次进入页面实时从 API 重新计算" highlight />
      </div>
    </div>
    <div>
      <SectionTitle>甘特图计算（ganttService.buildGanttData）</SectionTitle>
      <div className="flex flex-wrap gap-2 mb-2">
        <ObjectTag id="supplychain_hd0202_bom" label="BOM" />
        <ObjectTag id="supplychain_hd0202_mrp" label="MRP" />
        <ObjectTag id="supplychain_hd0202_material" label="物料主数据" />
        <ObjectTag id="supplychain_hd0202_pr" label="PR" />
        <ObjectTag id="supplychain_hd0202_po" label="PO" />
      </div>
      <div className="space-y-0.5">
        <Row label="BOM 条件" value={<><Code>bom_material_code == {task?.productCode ?? '…'}</Code>；取最新 bom_version</>} />
        <Row label="MRP 条件" value={<><Code>finished_product_code == {task?.productCode ?? '…'}</Code></>} />
        <Row label="批量查询" value={<><Code>in [codes]</Code>，分片 50 个/批，串行执行</>} />
        <Row label="缓存 TTL" value="5 分钟（planningV2DataService 内部 Map）" />
      </div>
    </div>
    <div>
      <SectionTitle>数据处理规则</SectionTitle>
      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
        <li>BOM 取最新版本（bom_version 字典序最大），过滤替代料建主料树</li>
        <li>BFS 倒排：子件 <Code>endDate = 父级 startDate - 1天</Code></li>
        <li>Leadtime：外购/委外取 <Code>purchase_fixedleadtime</Code>，自制取 <Code>product_fixedleadtime</Code>，≤0 兜底 7 天</li>
        <li><Code>MAX_NODES = 2000</Code>，visited Set 防环路</li>
        <li>MRP 净需求 &lt; 0 → hasShortage = true</li>
      </ul>
    </div>
    {stats !== undefined && (
      <div>
        <SectionTitle>本次实时统计</SectionTitle>
        <StatGrid items={[
          { label: '物料总数', value: stats.totalMaterials !== undefined ? `${stats.totalMaterials} 种` : undefined },
          { label: '缺口物料', value: stats.shortageCount !== undefined ? `${stats.shortageCount} 种` : undefined, red: (stats.shortageCount ?? 0) > 0 },
          { label: '已下PO', value: stats.poCount !== undefined ? `${stats.poCount} 项` : undefined },
          { label: '批量分片大小', value: '50 个/批' },
          { label: '缓存 TTL', value: '5 分钟' },
        ]} />
      </div>
    )}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Step label map
// ─────────────────────────────────────────────────────────────────────────────

const STEP_LABEL: Record<PanelStep, string> = {
  1: '步骤①：产品需求计划',
  2: '步骤②：生产计划（MPS）',
  3: '步骤③：物料需求计划（MRP）',
  4: '步骤④：智能计划协同',
  'task-detail': '监测任务详情',
};

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

const DataLineagePanel = ({ step, stats, task, productCode }: DataLineagePanelProps) => {
  const [expanded, setExpanded] = useState(false);

  const label = STEP_LABEL[step];

  const renderContent = () => {
    switch (step) {
      case 1: return <Step1Content />;
      case 2: return <Step2Content />;
      case 3: return <Step3Content productCode={productCode} stats={stats} />;
      case 4: return <Step4Content productCode={productCode} stats={stats} />;
      case 'task-detail': return <TaskDetailContent task={task} stats={stats} />;
    }
  };

  return (
    <div className="mt-6 border border-slate-200 rounded-lg overflow-hidden">
      {/* Header / toggle */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
          <Database className="w-3.5 h-3.5 text-slate-400" />
          <span>数据溯源</span>
          <span className="text-slate-400">·</span>
          <span>{label}</span>
        </div>
        {expanded
          ? <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
          : <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
        }
      </button>

      {/* Content */}
      {expanded && (
        <div className="px-4 py-4 bg-white border-t border-slate-100">
          {renderContent()}
        </div>
      )}
    </div>
  );
};

export default DataLineagePanel;
