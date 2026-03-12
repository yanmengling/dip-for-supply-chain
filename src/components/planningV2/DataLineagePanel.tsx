/**
 * 数据溯源信息板（可折叠）
 *
 * 在新建任务三步流程（步骤①②③）和监测任务详情页底部展示：
 * - 使用了哪些业务对象（Ontology API 对象类型）
 * - 查询条件与过滤规则
 * - 数据处理逻辑（BOM 主料过滤、MRP 净需求、甘特图倒排）
 * - 实时统计结果（步骤②③和任务详情）
 *
 * 默认收缩，点击标题行展开。
 *
 * 数据源对应关系（v3.7 三步流程）：
 *   步骤① → product + forecast（产品选择 + 需求预测按月分组）
 *   步骤② → bom + mrp + material + pr + po（BOM 展开 + MRP 精确查询 + 采购状态）
 *   步骤③ → 同步骤② + inventory（甘特图倒排 + 库存汇总 + 精确查询链）
 *   任务详情 → 同步骤③（从 task 对象读取倒排锚点，API 实时查询）
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
        <ObjectTag id="supplychain_hd0202_product" label="产品主数据" />
        <ObjectTag id="supplychain_hd0202_forecast" label="需求预测" />
      </div>
    </div>
    <div>
      <SectionTitle>查询条件</SectionTitle>
      <div className="space-y-0.5">
        <Row label="产品列表" value={<>全量加载 <Code>supplychain_hd0202_product</Code>（limit: 10000），按 <Code>material_number</Code> 排序</>} />
        <Row label="需求预测" value={<>选定产品后，按 <Code>material_number == productCode</Code> 查询 <Code>supplychain_hd0202_forecast</Code></>} />
        <Row label="缓存" value={<>产品列表 key: product_list；预测数据 key: forecast_&#123;productCode&#125;，TTL 均 5 分钟</>} />
      </div>
    </div>
    <div>
      <SectionTitle>数据处理逻辑</SectionTitle>
      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
        <li>产品列表来源于 <Code>supplychain_hd0202_product</Code>（产品主数据），非 PP 去重</li>
        <li>选定产品后，查询该产品的需求预测记录（<Code>supplychain_hd0202_forecast</Code>）</li>
        <li>自动聚合：最早 <Code>startdate</Code> 为需求开始，最晚 <Code>enddate</Code> 为需求结束</li>
        <li>需求数量 = Σ <Code>qty</Code>（所有预测单的预测数量之和）</li>
        <li>若无预测数据，提示用户手动填写需求计划时间和数量</li>
        <li>时间范围和数量字段用户可手动修改后再确认</li>
      </ul>
    </div>
  </div>
);

const Step2Content = ({ productCode, stats }: { productCode?: string; stats?: StepStats }) => (
  <div className="space-y-4">
    <div>
      <SectionTitle>业务对象</SectionTitle>
      <div className="flex flex-wrap gap-2">
        <ObjectTag id="supplychain_hd0202_bom" label="BOM" />
        <ObjectTag id="supplychain_hd0202_mrp" label="物料需求计划" />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <ObjectTag id="supplychain_hd0202_material" label="物料主数据" />
        <ObjectTag id="supplychain_hd0202_pr" label="采购申请" />
        <ObjectTag id="supplychain_hd0202_po" label="采购订单" />
      </div>
    </div>
    <div>
      <SectionTitle>查询条件（v3.7 精确查询链）</SectionTitle>
      <div className="space-y-0.5">
        <Row label="BOM 查询" value={<>两步精确查询：Step1 取 <Code>bom_material_code == {productCode ?? '…'}</Code> 的 100 条获取最新版本号（字典序最大）；Step2 按 <Code>bom_material_code + bom_version + alt_priority == 0</Code> 三条件精确查询</>} />
        <Row label="MRP 查询" value={<>优先精确关联 <Code>rootdemandbillno in [预测单号]</Code>；无结果降级到全量加载</>} highlight />
        <Row label="MRP 过滤" value={<>正向筛选 <Code>closestatus_title === &apos;正常&apos;</Code>（v3.6），排除关闭/拆分/合并/投放关闭状态</>} />
        <Row label="MRP 取数" value={<>优先 <Code>bizorderqty</Code>（PMC 修正值），fallback <Code>adviseorderqty</Code>（MRP 理论值）</>} />
        <Row label="物料集合" value={<>BOM 可达主料 <Code>material_code</Code> 去重，<strong>不</strong> union MRP 额外物料编码</>} />
        <Row label="PR 查询" value={<>优先 <Code>srcbillid in [MRP.billno]</Code>（精确关联）；降级到 <Code>material_number in [codes]</Code> + 时间过滤</>} highlight />
        <Row label="PO 查询" value={<>优先 <Code>srcbillnumber in [PR.billno]</Code>（精确关联）；降级到 <Code>material_number in [codes]</Code> + 时间过滤</>} highlight />
        <Row label="分片/缓存" value={<>分片 50 个/批，串行执行；各查询独立缓存 key，TTL 5 分钟</>} />
      </div>
    </div>
    <div>
      <SectionTitle>BOM 数据处理</SectionTitle>
      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
        <li>API 层过滤：<Code>alt_priority == 0</Code> 仅查主料（替代料在服务端已排除）</li>
        <li>可达性遍历：从产品根节点 BFS 遍历 <Code>parent_material_code → material_code</Code>，排除替代料残留子级</li>
        <li>物料统计 = BOM 可达记录中 <Code>material_code</Code> 的唯一值数量</li>
      </ul>
    </div>
    <div>
      <SectionTitle>MRP 数据处理</SectionTitle>
      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
        <li>净需求取值：优先 <Code>bizorderqty</Code>（PMC 修正值），为 0 时退回 <Code>adviseorderqty</Code></li>
        <li>缺口判定：<Code>netDemand {'< 0'}</Code> 为缺口，行背景浅红 <Code>bg-red-50</Code></li>
        <li>排序：缺口物料置顶，其次按 BOM 层级升序</li>
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

const Step3Content = ({ productCode, stats }: { productCode?: string; stats?: StepStats }) => (
  <div className="space-y-4">
    <div>
      <SectionTitle>业务对象（ganttService.buildGanttData）</SectionTitle>
      <div className="flex flex-wrap gap-2">
        <ObjectTag id="supplychain_hd0202_bom" label="BOM" />
        <ObjectTag id="supplychain_hd0202_mrp" label="MRP" />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <ObjectTag id="supplychain_hd0202_material" label="物料主数据" />
        <ObjectTag id="supplychain_hd0202_pr" label="PR" />
        <ObjectTag id="supplychain_hd0202_po" label="PO" />
        <ObjectTag id="supplychain_hd0202_inventory" label="库存" />
      </div>
    </div>
    <div>
      <SectionTitle>精确查询链（v3.7 全链路溯源）</SectionTitle>
      <div className="space-y-0.5">
        <Row label="BOM" value={<>同步骤②：两步精确查询取最新版本主料（<Code>alt_priority == 0</Code>）+ 可达性遍历</>} />
        <Row label="MRP" value={<>优先 <Code>rootdemandbillno in [预测单号]</Code> 精确关联；降级到全量加载 + 正向过滤</>} highlight />
        <Row label="PR" value={<>优先 <Code>srcbillid in [MRP.billno]</Code>（精确关联）；降级到 <Code>material_number in [codes]</Code> + 时间过滤</>} highlight />
        <Row label="PO" value={<>优先 <Code>srcbillnumber in [PR.billno]</Code>（精确关联）；降级到 <Code>material_number in [codes]</Code> + 时间过滤</>} highlight />
        <Row label="物料集合" value={<>BOM 所有可达 <Code>material_code</Code> + 产品自身 + MRP <Code>materialplanid_number</Code>（合并去重）</>} />
        <Row label="串行查询" value={<>物料主数据 → PR → PO → 库存，<Code>in [codes]</Code> 分片 50 个/批</>} />
        <Row label="缓存" value="各查询均有独立缓存 key，TTL 5 分钟" />
      </div>
    </div>
    <div>
      <SectionTitle>甘特图倒排规则</SectionTitle>
      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
        <li>倒排锚点：L0 产品层 <Code>startDate = demandStart</Code>（步骤①确认），<Code>endDate = demandEnd</Code></li>
        <li>BFS 倒排：子件 <Code>endDate = parent.startDate - 1天</Code>；<Code>startDate = endDate - leadtime</Code></li>
        <li>BOM 位置去重：按 <Code>parentCode{'>'}childCode</Code> 去重，同一物料可在多个父组件下出现</li>
        <li>环路检测：祖先链 <Code>ancestors Set</Code> 防止 A→B→C→A 循环</li>
        <li>Leadtime：外购/委外取 <Code>purchase_fixedleadtime</Code>，自制取 <Code>product_fixedleadtime</Code>，≤0 兜底 7 天</li>
        <li>安全截断：<Code>MAX_NODES = 2000</Code></li>
      </ul>
    </div>
    <div>
      <SectionTitle>物料供需三分类（v3.7）</SectionTitle>
      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
        <li><strong>shortage</strong>（缺料）：有 MRP 记录且需求量 {'< 0'}</li>
        <li><strong>sufficient</strong>（满足）：有 MRP 记录且需求量 {'>'}= 0</li>
        <li><strong>sufficient_no_mrp</strong>（无MRP有库存）：无 MRP 记录但可用库存 {'>'} 0，灰色提示</li>
        <li><strong>anomaly</strong>（异常）：无 MRP 记录且无可用库存，橙色告警</li>
      </ul>
    </div>
    <div>
      <SectionTitle>状态判定</SectionTitle>
      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
        <li>PO 状态：外购/委外物料有 PO → <Code>ordered</Code>（绿色），无 PO 且时间风险 → <Code>risk</Code>（红色）</li>
        <li>PO 交货日：同一物料多条 PO 按 <Code>biztime</Code> 降序取第一条的 <Code>deliverdate</Code></li>
        <li>可用库存：<Code>inventory</Code> 按 <Code>material_code</Code> 汇总 <Code>available_inventory_qty</Code></li>
        <li>物料统计：按唯一 <Code>materialCode</Code> 去重（Set），与步骤②物料数口径一致</li>
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
        <Row label="倒排锚点" value={<>来自任务对象 <Code>task.demandStart ~ task.demandEnd</Code></>} />
        <Row label="关联预测单" value={<><Code>task.relatedForecastBillnos</Code>（用于 MRP/MPS 精确关联）</>} />
      </div>
    </div>
    <div>
      <SectionTitle>甘特图计算（v3.7 精确查询链）</SectionTitle>
      <div className="flex flex-wrap gap-2 mb-2">
        <ObjectTag id="supplychain_hd0202_bom" label="BOM" />
        <ObjectTag id="supplychain_hd0202_mrp" label="MRP" />
        <ObjectTag id="supplychain_hd0202_material" label="物料主数据" />
        <ObjectTag id="supplychain_hd0202_pr" label="PR" />
        <ObjectTag id="supplychain_hd0202_po" label="PO" />
        <ObjectTag id="supplychain_hd0202_inventory" label="库存" />
      </div>
      <div className="space-y-0.5">
        <Row label="BOM" value={<>两步精确查询：<Code>bom_material_code == {task?.productCode ?? '…'}</Code> 取最新版本 + <Code>alt_priority == 0</Code> + 可达性遍历</>} />
        <Row label="MRP" value={<>优先 <Code>rootdemandbillno in [预测单号]</Code> 精确关联；降级到全量加载 + <Code>closestatus_title === &apos;正常&apos;</Code> 正向过滤</>} highlight />
        <Row label="PR" value={<>优先 <Code>srcbillid in [MRP.billno]</Code>（精确关联）；降级到 <Code>material_number in [codes]</Code> + 时间过滤</>} highlight />
        <Row label="PO" value={<>优先 <Code>srcbillnumber in [PR.billno]</Code>（精确关联）；降级到 <Code>material_number in [codes]</Code> + 时间过滤</>} highlight />
        <Row label="物料集合" value={<>BOM 可达物料 + 产品自身 + MRP <Code>materialplanid_number</Code>，合并去重</>} />
        <Row label="串行链" value={<>物料主数据+库存（并行）→ PR（精确）→ PO（精确，依赖PR结果）</>} />
        <Row label="缓存" value="各查询独立缓存 key，TTL 5 分钟" />
      </div>
    </div>
    <div>
      <SectionTitle>倒排规则与物料三分类</SectionTitle>
      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
        <li>L0 产品层：<Code>startDate = demandStart</Code>，<Code>endDate = demandEnd</Code></li>
        <li>BFS 倒排：子件 <Code>endDate = parent.startDate - 1天</Code>，<Code>startDate = endDate - leadtime</Code></li>
        <li>BOM 位置去重（<Code>parent{'>'}child</Code>）+ 祖先链防环路</li>
        <li>Leadtime：外购/委外取 <Code>purchase_fixedleadtime</Code>，自制取 <Code>product_fixedleadtime</Code>，≤0 兜底 7 天</li>
        <li><strong>shortage</strong>：有 MRP 且需求量 {'< 0'}；<strong>sufficient</strong>：有 MRP 且 {'>'}= 0；<strong>sufficient_no_mrp</strong>：无 MRP 有库存；<strong>anomaly</strong>：无 MRP 无库存</li>
        <li>PO 交货日：同一物料多条 PO 按 <Code>biztime</Code> 降序取第一条的 <Code>deliverdate</Code></li>
        <li>可用库存：按 <Code>material_code</Code> 汇总 <Code>available_inventory_qty</Code></li>
        <li>安全截断：<Code>MAX_NODES = 2000</Code></li>
      </ul>
    </div>
    {stats !== undefined && (
      <div>
        <SectionTitle>本次实时统计</SectionTitle>
        <StatGrid items={[
          { label: '物料总数', value: stats.totalMaterials !== undefined ? `${stats.totalMaterials} 种` : undefined },
          { label: '缺口物料', value: stats.shortageCount !== undefined ? `${stats.shortageCount} 种` : undefined, red: (stats.shortageCount ?? 0) > 0 },
          { label: '已下PO', value: stats.poCount !== undefined ? `${stats.poCount} 项` : undefined },
        ]} />
      </div>
    )}
  </div>
);

// ─────────────────────────────────────────────────────────────────────────────
// Step label map
// ─────────────────────────────────────────────────────────────────────────────

const STEP_LABEL: Record<PanelStep, string> = {
  1: '步骤①：需求预测',
  2: '步骤②：物料需求',
  3: '步骤③：计划协同',
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
      case 2: return <Step2Content productCode={productCode} stats={stats} />;
      case 3: return <Step3Content productCode={productCode} stats={stats} />;
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
