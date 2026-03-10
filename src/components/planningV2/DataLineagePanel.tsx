/**
 * 数据溯源信息板（可折叠）
 *
 * 在新建任务四步流程（步骤①②③④）和监测任务详情页底部展示：
 * - 使用了哪些业务对象（Ontology API 对象类型）
 * - 查询条件与过滤规则
 * - 数据处理逻辑（BOM 主料过滤、MRP 净需求、甘特图倒排）
 * - 实时统计结果（步骤③④和任务详情）
 *
 * 默认收缩，点击标题行展开。
 *
 * 数据源对应关系：
 *   步骤① → product + forecast（产品选择 + 需求预测聚合）
 *   步骤② → mps（生产计划匹配，无匹配时用步骤①兜底）
 *   步骤③ → bom + mrp + material + pr + po（BOM 展开 + MRP 缺口 + 采购状态）
 *   步骤④ → 同步骤③ + inventory（甘特图倒排 + 库存汇总）
 *   任务详情 → 同步骤④（从 task 对象读取倒排锚点，API 实时查询）
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
        <Row label="无 MPS 时" value="使用步骤①的需求计划数据兜底（开始/结束/数量），橙色提示条提示" highlight />
        <Row label="缓存" value="key: mps_data，TTL 5 分钟" />
      </div>
    </div>
    <div>
      <SectionTitle>数据处理逻辑</SectionTitle>
      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
        <li>全量加载 MPS 后前端匹配 <Code>bom_code == productCode</Code></li>
        <li>有匹配时：生产开始取 <Code>planned_start_date</Code>，数量取 <Code>quantity</Code>，生产结束回退到步骤① <Code>demandEnd</Code></li>
        <li>无匹配或加载失败：开始/结束/数量全部使用步骤① <Code>demandStart / demandEnd / demandQuantity</Code></li>
        <li>三个字段均可手动编辑后再确认</li>
        <li>确认后输出 <Code>productionStart / productionEnd / productionQuantity</Code>，作为后续步骤甘特图倒排锚点</li>
      </ul>
    </div>
  </div>
);

const Step3Content = ({ productCode, stats }: { productCode?: string; stats?: StepStats }) => (
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
      <SectionTitle>查询条件</SectionTitle>
      <div className="space-y-0.5">
        <Row label="BOM 查询" value={<>两步精确查询：Step1 取 <Code>bom_material_code == {productCode ?? '…'}</Code> 的 100 条获取最新版本号（字典序最大）；Step2 按 <Code>bom_material_code + bom_version + alt_priority == 0</Code> 三条件精确查询</>} />
        <Row label="MRP 查询" value={<>全量加载后前端过滤 <Code>finished_product_code == {productCode ?? '…'}</Code></>} />
        <Row label="物料集合" value={<>BOM 可达主料 <Code>material_code</Code> 去重，<strong>不</strong> union MRP 额外物料编码</>} />
        <Row label="Material/PR/PO" value={<><Code>material_code / material_number in [codes]</Code>，分片 50 个/批，串行</>} />
        <Row label="缓存" value={<>bom_&#123;productCode&#125;、mrp_data、Material/PR/PO 按列表哈希；TTL 均 5 分钟</>} />
      </div>
    </div>
    <div>
      <SectionTitle>BOM 数据处理</SectionTitle>
      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
        <li>API 层过滤：<Code>alt_priority == 0</Code> 仅查主料（替代料在服务端已排除）</li>
        <li>可达性遍历：从产品根节点 BFS 遍历 <Code>parent_material_code → material_code</Code>，排除替代料残留子级（parent 指向已被过滤的替代料编码的记录）</li>
        <li>物料统计 = BOM 可达记录中 <Code>material_code</Code> 的唯一值数量</li>
      </ul>
    </div>
    <div>
      <SectionTitle>MRP 数据处理</SectionTitle>
      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
        <li>净需求取值：<Code>mrpMap.get(code) = material_demand_quantity</Code></li>
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

const Step4Content = ({ productCode, stats }: { productCode?: string; stats?: StepStats }) => (
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
      <SectionTitle>查询条件</SectionTitle>
      <div className="space-y-0.5">
        <Row label="BOM" value={<>同步骤③：两步精确查询取最新版本主料（<Code>alt_priority == 0</Code>）+ 可达性遍历</>} />
        <Row label="MRP" value={<>全量加载后前端过滤 <Code>finished_product_code == {productCode ?? '…'}</Code></>} />
        <Row label="物料集合" value={<>BOM 所有可达 <Code>material_code</Code> + 产品自身 + MRP 中 <Code>main_material</Code>（合并去重）</>} />
        <Row label="Material/PR/PO/库存" value={<><Code>in [allMaterialCodes]</Code>，分片 50 个/批，<strong>串行</strong>依次查询</>} />
        <Row label="缓存" value="各查询均有独立缓存 key，TTL 5 分钟" />
      </div>
    </div>
    <div>
      <SectionTitle>甘特图倒排规则</SectionTitle>
      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
        <li>倒排锚点：L0 产品层 <Code>startDate = productionStart</Code>（步骤②确认），<Code>endDate = productionEnd</Code></li>
        <li>BFS 倒排：子件 <Code>endDate = parent.startDate - 1天</Code>；<Code>startDate = endDate - leadtime</Code></li>
        <li>BOM 位置去重：按 <Code>parentCode{'>'}childCode</Code> 去重，同一物料可在多个父组件下出现</li>
        <li>环路检测：祖先链 <Code>ancestors Set</Code> 防止 A→B→C→A 循环</li>
        <li>Leadtime：外购/委外取 <Code>purchase_fixedleadtime</Code>，自制取 <Code>product_fixedleadtime</Code>，≤0 兜底 7 天</li>
        <li>安全截断：<Code>MAX_NODES = 2000</Code></li>
      </ul>
    </div>
    <div>
      <SectionTitle>状态判定</SectionTitle>
      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
        <li>缺口：MRP <Code>material_demand_quantity {'< 0'}</Code> → <Code>hasShortage = true</Code></li>
        <li>PO 状态：外购/委外物料有 PO 记录 → <Code>ordered</Code>（绿色），无 PO 且时间风险 → <Code>risk</Code>（红色）</li>
        <li>PO 交货日：同一物料多条 PO 按 <Code>biztime</Code> 降序取第一条的 <Code>deliverdate</Code></li>
        <li>可用库存：<Code>inventory</Code> 按 <Code>material_code</Code> 汇总 <Code>available_inventory_qty</Code></li>
        <li>物料统计：按唯一 <Code>materialCode</Code> 去重（Set），与步骤③物料数口径一致</li>
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
        <Row label="倒排锚点" value={<>来自任务对象 <Code>task.productionStart ~ task.productionEnd</Code></>} />
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
        <ObjectTag id="supplychain_hd0202_inventory" label="库存" />
      </div>
      <div className="space-y-0.5">
        <Row label="BOM" value={<>两步精确查询：<Code>bom_material_code == {task?.productCode ?? '…'}</Code> 取最新版本 + <Code>alt_priority == 0</Code> + 可达性遍历</>} />
        <Row label="MRP" value={<>全量加载后前端过滤 <Code>finished_product_code == {task?.productCode ?? '…'}</Code></>} />
        <Row label="物料集合" value={<>BOM 可达物料 + 产品自身 + MRP <Code>main_material</Code>，合并去重</>} />
        <Row label="批量查询" value={<>Material → PR → PO → 库存，<Code>in [codes]</Code> 分片 50 个/批，串行执行</>} />
        <Row label="缓存" value="各查询独立缓存 key，TTL 5 分钟" />
      </div>
    </div>
    <div>
      <SectionTitle>倒排规则与状态判定</SectionTitle>
      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
        <li>L0 产品层：<Code>startDate = productionStart</Code>，<Code>endDate = productionEnd</Code></li>
        <li>BFS 倒排：子件 <Code>endDate = parent.startDate - 1天</Code>，<Code>startDate = endDate - leadtime</Code></li>
        <li>BOM 位置去重（<Code>parent{'>'}child</Code>）+ 祖先链防环路</li>
        <li>Leadtime：外购/委外取 <Code>purchase_fixedleadtime</Code>，自制取 <Code>product_fixedleadtime</Code>，≤0 兜底 7 天</li>
        <li>缺口：MRP <Code>material_demand_quantity {'< 0'}</Code> → <Code>hasShortage = true</Code></li>
        <li>PO 交货日：同一物料多条 PO 按 <Code>biztime</Code> 降序取第一条的 <Code>deliverdate</Code></li>
        <li>可用库存：按 <Code>material_code</Code> 汇总 <Code>available_inventory_qty</Code></li>
        <li>物料统计：按唯一 <Code>materialCode</Code> 去重（Set），与步骤③口径一致</li>
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
