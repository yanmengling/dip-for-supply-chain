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
  readyCount?: number;
  anomalyCount?: number;
  orderedCount?: number;
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
        <Row label="BOM 查询" value={<>两步精确查询：Step1 <Code>bom_material_code == {productCode ?? '…'}</Code> limit=1 取任意一条获取 bom_version（业务约定各版本物料相同，取任意版本即可）；Step2 按 <Code>bom_material_code + bom_version + alt_priority == 0</Code> 三条件精确查询</>} />
        <Row label="MRP 查询" value={<><Code>rootdemandbillno in [预测单号]</Code> 精确关联；无预测单号或无匹配结果均返回空（不再降级全量加载，避免引入无关产品的 MRP 记录）</>} />
        <Row label="MRP 过滤" value={<>正向筛选 <Code>closestatus_title === &apos;正常&apos;</Code>，排除关闭/拆分/合并/投放关闭状态</>} />
        <Row label="MRP 取数" value={<>优先 <Code>bizorderqty</Code>（PMC 修正值），为 0 时退回 <Code>adviseorderqty</Code>（MRP 理论值）</>} />
        <Row label="物料集合" value={<>BOM 可达主料 <Code>material_code</Code> 去重，<strong>不</strong> union MRP 额外物料编码</>} />
        <Row label="PR 查询" value={<><Code>srcbillnumber in [MRP.billno]</Code> 精确关联；无 MRP 单号时直接返回空（不降级，不走物料编码兜底）</>} />
        <Row label="PO 查询" value={<><Code>srcbillnumber in [PR.billno]</Code> 精确关联；无 PR 单号时直接返回空（不降级）</>} />
        <Row label="分片/缓存" value={<>分片 50 个/批，串行执行；各查询独立缓存 key，TTL 5 分钟</>} />
      </div>
    </div>
    <div>
      <SectionTitle>BOM 数据处理（含数据质量说明）</SectionTitle>
      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
        <li>API 层过滤：<Code>alt_priority == 0</Code> 仅查主料（替代料在服务端已排除）</li>
        <li>可达性遍历（第一层过滤）：从产品根节点 BFS 遍历 <Code>parent_material_code → material_code</Code>，排除替代料残留子级。以 948-000077 为例：API 返回 983 条 → 可达 771 条，过滤 212 条不可达记录（127 种子件）。不可达原因：这 212 条子件的 <Code>parent_material_code</Code> 指向替代料编码（如 748-000148/748-000004/135-000290/135-000291/748-000042/135-000589），该父节点因 <Code>alt_priority {'>'} 0</Code> 未出现在 Step2 结果中，子件 BFS 无法到达</li>
        <li>位置去重（第二层过滤）：可达记录中存在相同 <Code>parent {'>'} child</Code> 的重复行（BOM 数据重复导入所致）。以 948-000077 为例：771 条可达记录中有 311 条重复位置行，去重后唯一位置 460 个。重复集中于父件 135-000626 的全部子件（均为 ×2），系该组件 BOM 被导入两遍</li>
        <li>物料统计 = 唯一位置去重后的 <Code>material_code</Code> 唯一值数量（不含 L0 产品根节点）</li>
        <li>甘特图"460 项"= 去重后唯一 BOM 位置数（含 L0 根节点）；"369 种"= 去重后唯一物料编码数（不含 L0 根节点）</li>
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
        <Row label="BOM" value={<>同步骤②：Step1 limit=1 取任意一条获取 bom_version（各版本物料相同），Step2 按 <Code>bom_material_code + bom_version + alt_priority == 0</Code> 精确查询 + 可达性遍历 + 位置去重（见步骤②数据质量说明）</>} />
        <Row label="MRP" value={<><Code>rootdemandbillno in [预测单号]</Code> 精确关联；无结果则返回空，不降级</>} />
        <Row label="PR" value={<><Code>srcbillnumber in [MRP.billno]</Code> 精确关联；无 MRP 单号时返回空，不降级</>} />
        <Row label="PO" value={<><Code>srcbillnumber in [PR.billno]</Code> 精确关联；无 PR 单号时返回空，不降级</>} />
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
        <li>标准交期（standardLeadtime）：外购/委外取 <Code>purchase_fixedleadtime</Code>，自制取 <Code>product_fixedleadtime</Code>，不做兜底</li>
        <li>甘特条长度（leadtime）：库存满足需求 → 1天（已就绪），库存不满足 → standardLeadtime（最小1天）</li>
        <li>安全截断：<Code>MAX_NODES = 2000</Code></li>
      </ul>
    </div>
    <div>
      <SectionTitle>物料供需三分类（v3.7）</SectionTitle>
      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
        <li><strong>shortage</strong>（缺货）：有 MRP 记录，表示需采购跟踪</li>
        <li><strong>sufficient_no_mrp</strong>（就绪）：无 MRP 记录但可用库存 {'>'} 0</li>
        <li><strong>anomaly</strong>（异常）：无 MRP 记录且无可用库存</li>
      </ul>
    </div>
    <div>
      <SectionTitle>甘特图状态判定（五分类）</SectionTitle>
      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
        <li><Code>ready</Code>（绿色 #16A34A）：无 MRP + 有库存 → 就绪，无需采购跟踪</li>
        <li><Code>anomaly</Code>（黄色 #EAB308）：无 MRP + 无库存 → 异常，需核实</li>
        <li><Code>ordered</Code>（翡翠 #059669）：有 PO → 已下单</li>
        <li><Code>risk</Code>（红色 #DC2626）：无 PO 且（开始日已过 或 到货日超父件开工）→ 风险</li>
        <li><Code>on_time</Code>（靛蓝 #4F46E5）：其他正常物料</li>
        <li>PO 交货日：同一物料多条 PO 按 <Code>biztime</Code> 降序取第一条的 <Code>deliverdate</Code></li>
        <li>可用库存：<Code>inventory</Code> 按 <Code>material_code</Code> 汇总 <Code>available_inventory_qty</Code></li>
      </ul>
    </div>
    {(stats?.totalMaterials !== undefined) && (
      <div>
        <SectionTitle>本次甘特图统计</SectionTitle>
        <StatGrid items={[
          { label: '物料种数（非根）', value: `${stats.totalMaterials} 种` },
          { label: '就绪', value: `${stats.readyCount ?? 0} 种` },
          { label: '缺货（有MRP）', value: `${stats.shortageCount ?? 0} 种`, red: (stats.shortageCount ?? 0) > 0 },
          { label: '异常（无MRP无库存）', value: `${stats.anomalyCount ?? 0} 种`, red: (stats.anomalyCount ?? 0) > 0 },
          { label: '已下PO', value: `${stats.orderedCount ?? 0} 项` },
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
        <Row label="存储位置" value={<>对象类 <Code>supplychain_hd0202_monitoring_task</Code>（远端读取）</>} />
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
        <Row label="BOM" value={<>两步精确查询：Step1 <Code>bom_material_code == {task?.productCode ?? '…'}</Code> limit=1 取任意一条获取 bom_version（各版本物料相同）；Step2 按 <Code>bom_material_code + bom_version + alt_priority == 0</Code> 精确查询，再经可达性遍历 + 位置去重，最终输出唯一位置列表</>} />
        <Row label="MRP" value={<><Code>rootdemandbillno in [预测单号]</Code> 精确关联；无结果则返回空，不降级</>} />
        <Row label="PR" value={<><Code>srcbillnumber in [MRP.billno]</Code> 精确关联；无 MRP 单号时返回空，不降级</>} />
        <Row label="PO" value={<><Code>srcbillnumber in [PR.billno]</Code> 精确关联；无 PR 单号时返回空，不降级</>} />
        <Row label="物料集合" value={<>BOM 可达物料 + 产品自身 + MRP <Code>materialplanid_number</Code>，合并去重</>} />
        <Row label="串行链" value={<>物料主数据+库存（并行）→ PR（精确）→ PO（精确，依赖PR结果）</>} />
        <Row label="缓存" value="各查询独立缓存 key，TTL 5 分钟" />
      </div>
    </div>
    <div>
      <SectionTitle>倒排规则与甘特图状态五分类</SectionTitle>
      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
        <li>L0 产品层：<Code>startDate = demandStart</Code>，<Code>endDate = demandEnd</Code></li>
        <li>BFS 倒排：子件 <Code>endDate = parent.startDate - 1天</Code>，<Code>startDate = endDate - leadtime</Code></li>
        <li>BOM 位置去重（<Code>parent{'>'}child</Code>）+ 祖先链防环路</li>
        <li>标准交期（standardLeadtime）：外购/委外取 <Code>purchase_fixedleadtime</Code>，自制取 <Code>product_fixedleadtime</Code>，不做兜底</li>
        <li>甘特条长度（leadtime）：库存满足需求 → 1天（已就绪），库存不满足 → standardLeadtime（最小1天）</li>
        <li><strong>ready</strong>（绿色）：无 MRP + 有库存 → 就绪；<strong>anomaly</strong>（黄色）：无 MRP + 无库存 → 异常</li>
        <li><strong>ordered</strong>（翡翠）：有 PO → 已下单；<strong>risk</strong>（红色）：无 PO + 时间风险；<strong>on_time</strong>（靛蓝）：正常</li>
        <li>供需三分类：<strong>shortage</strong> = 有MRP（需采购跟踪），<strong>sufficient_no_mrp</strong> = 无MRP有库存，<strong>anomaly</strong> = 无MRP无库存</li>
        <li>安全截断：<Code>MAX_NODES = 2000</Code></li>
      </ul>
    </div>
    {stats !== undefined && (
      <div>
        <SectionTitle>本次实时统计</SectionTitle>
        <StatGrid items={[
          { label: '物料总数', value: stats.totalMaterials !== undefined ? `${stats.totalMaterials} 种` : undefined },
          { label: '就绪', value: stats.readyCount !== undefined ? `${stats.readyCount} 种` : undefined },
          { label: '缺货（有MRP）', value: stats.shortageCount !== undefined ? `${stats.shortageCount} 种` : undefined, red: (stats.shortageCount ?? 0) > 0 },
          { label: '异常（无MRP无库存）', value: stats.anomalyCount !== undefined ? `${stats.anomalyCount} 种` : undefined, red: (stats.anomalyCount ?? 0) > 0 },
          { label: '已下PO', value: stats.orderedCount !== undefined ? `${stats.orderedCount} 项` : undefined },
        ]} />
      </div>
    )}
  </div>
);

const SupplyStatusLogicContent = () => (
  <div className="space-y-4">
    <div>
      <SectionTitle>供应状态判定逻辑（单产品监测任务）</SectionTitle>
      <p className="text-xs text-slate-500 mb-2">
        每个物料根据以下规则顺序判定，命中即返回。判定结果显示在关键物料监测清单的"物料状态提示"列。
      </p>
    </div>

    <div>
      <SectionTitle>输入计算</SectionTitle>
      <div className="space-y-0.5">
        <Row label="供给量" value={<><Code>supply = availableInventoryQty + inTransitQty</Code></>} />
        <Row label="库存满足" value={<><Code>{'isSufficient = supply ≥ grossRequirement'}</Code>（BOM展开毛需求）</>} />
      </div>
    </div>

    <div>
      <SectionTitle>第一步：库存满足判定</SectionTitle>
      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
        <li><strong>⑩ sufficient</strong>（库存满足）：<Code>{'supply ≥ grossRequirement'}</Code> → 不进入风险判定</li>
      </ul>
    </div>

    <div>
      <SectionTitle>第二步：库存不足 — 外购/委外物料</SectionTitle>
      <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
        <li><strong className="text-red-600">① anomaly</strong>（数据异常）：无 MRP 且库存不足 → 需 ERP 核查</li>
        <li><strong className="text-red-600">⑤ po_overdue</strong>（PO已逾期）：有 PO + <Code>{'PO交期 ≤ 今天'}</Code></li>
        <li><strong className="text-red-600">② deadline_risk</strong>（交期风险）：有 PO + <Code>{'PO交期 > 需求截止日'}</Code>；或无 PO + <Code>{'今天 + 采购提前期 > 需求截止日'}</Code></li>
        <li><strong className="text-amber-600">③ no_pr</strong>（未下PR）：有 MRP + 库存不足 + <Code>prStatus = no_pr</Code></li>
        <li><strong className="text-amber-600">④ no_po</strong>（未下PO）：有 MRP + 有 PR + <Code>poStatus = no_po</Code></li>
        <li><strong className="text-blue-600">po_in_transit</strong>（PO在途）：有 PO，未命中以上条件</li>
      </ul>
    </div>

    <div>
      <SectionTitle>第二步：库存不足 — 自制件</SectionTitle>
      <ul className="text-xs text-slate-600 space-y-1.5 list-disc list-inside">
        <li><strong className="text-amber-600">⑥ child_short</strong>（子件有缺口）：<Code>hasShortage = true</Code></li>
        <li><strong className="text-blue-600">⑧ unscheduled</strong>（齐套未排产）：子件无缺口 + 无 MRP</li>
        <li><strong className="text-blue-600">⑨ plan_gap</strong>（有计划但有缺口）：子件无缺口 + 有 MRP</li>
      </ul>
    </div>

    <div>
      <SectionTitle>风险等级与颜色映射</SectionTitle>
      <div className="grid grid-cols-2 gap-2 mt-1">
        <div className="bg-red-50 rounded px-2.5 py-1.5">
          <div className="text-xs text-red-600 font-medium">danger（紧急）</div>
          <div className="text-[11px] text-red-500 mt-0.5">anomaly / deadline_risk / po_overdue</div>
        </div>
        <div className="bg-amber-50 rounded px-2.5 py-1.5">
          <div className="text-xs text-amber-600 font-medium">warning（警告）</div>
          <div className="text-[11px] text-amber-500 mt-0.5">no_pr / no_po / child_short</div>
        </div>
        <div className="bg-blue-50 rounded px-2.5 py-1.5">
          <div className="text-xs text-blue-600 font-medium">info（信息）</div>
          <div className="text-[11px] text-blue-500 mt-0.5">unscheduled / plan_gap / po_in_transit</div>
        </div>
        <div className="bg-green-50 rounded px-2.5 py-1.5">
          <div className="text-xs text-green-600 font-medium">normal（正常）</div>
          <div className="text-[11px] text-green-500 mt-0.5">sufficient</div>
        </div>
      </div>
    </div>

    <div>
      <SectionTitle>与多产品监测的差异</SectionTitle>
      <ul className="text-xs text-slate-600 space-y-1 list-disc list-inside">
        <li>多产品有 <Code>⑦ scheduled</Code>（齐套已排产）状态，需要工单关联数据；单产品暂不实现，归入 plan_gap</li>
        <li>多产品的 <Code>child_short</Code> 使用 <Code>shortageChildCount</Code>（子件缺口数量）；单产品使用 <Code>hasShortage</Code>（布尔值）</li>
        <li>多产品有跨产品库存争抢和分配建议逻辑；单产品不涉及</li>
      </ul>
    </div>
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
  const [activeTab, setActiveTab] = useState<'lineage' | 'supply-status'>('lineage');

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
        <div className="bg-white border-t border-slate-100">
          {step === 'task-detail' ? (
            <>
              <div className="flex border-b border-slate-100 px-4">
                <button
                  onClick={() => setActiveTab('lineage')}
                  className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                    activeTab === 'lineage'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  数据溯源
                </button>
                <button
                  onClick={() => setActiveTab('supply-status')}
                  className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
                    activeTab === 'supply-status'
                      ? 'border-indigo-500 text-indigo-600'
                      : 'border-transparent text-slate-400 hover:text-slate-600'
                  }`}
                >
                  供应状态判定逻辑
                </button>
              </div>
              <div className="px-4 py-4">
                {activeTab === 'lineage'
                  ? <TaskDetailContent task={task} stats={stats} />
                  : <SupplyStatusLogicContent />
                }
              </div>
            </>
          ) : (
            <div className="px-4 py-4">
              {renderContent()}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DataLineagePanel;
