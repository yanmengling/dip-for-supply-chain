/**
 * 甘特图倒排算法服务
 *
 * 基于 BOM 层级的齐套模式倒排：
 * - 子级到位时间 = 父级开工时间 - 1天
 * - 倒排起点 = 步骤②的生产开始时间
 */

import type { GanttBar, BOMRecord, MaterialRecord } from '../types/planningV2';
import { planningV2DataService } from './planningV2DataService';

/** 加载并构建倒排甘特图数据 */
export async function buildGanttData(
  productCode: string,
  productionStart: string,
  productionEnd: string,
): Promise<GanttBar[]> {
  console.log(`[GanttService] 开始构建甘特图: ${productCode}, ${productionStart} ~ ${productionEnd}`);

  // 1. 并行查询 BOM + MRP
  const [bomRecords, mrpRecords] = await Promise.all([
    planningV2DataService.loadBOMByProduct(productCode),
    planningV2DataService.getMRPByProduct(productCode),
  ]);
  console.log(`[GanttService] BOM: ${bomRecords.length} 条, MRP: ${mrpRecords.length} 条`);

  // 2. 收集所有物料编码
  const allMaterialCodes = new Set<string>();
  allMaterialCodes.add(productCode);
  bomRecords.forEach(b => {
    allMaterialCodes.add(b.material_code);
    if (b.parent_material_code) allMaterialCodes.add(b.parent_material_code);
  });
  mrpRecords.forEach(m => {
    if (m.main_material) allMaterialCodes.add(m.main_material);
  });

  // 3. 串行分批查询物料主数据、PR、PO、库存（避免并行大量请求导致超时）
  const codeList = Array.from(allMaterialCodes);
  console.log(`[GanttService] 去重物料编码: ${codeList.length} 个，开始分批查询...`);

  const materials = await planningV2DataService.loadMaterialsByCode(codeList);
  console.log(`[GanttService] 物料主数据加载完成: ${materials.length} 条`);

  const prRecords = await planningV2DataService.loadPRByMaterials(codeList);
  console.log(`[GanttService] PR加载完成: ${prRecords.length} 条`);

  const poRecords = await planningV2DataService.loadPOByMaterials(codeList);
  console.log(`[GanttService] PO加载完成: ${poRecords.length} 条`);

  const inventoryRecords = await planningV2DataService.loadInventoryByMaterials(codeList);
  console.log(`[GanttService] 库存加载完成: ${inventoryRecords.length} 条`);

  // 4. 构建查找映射
  const materialMap = new Map<string, MaterialRecord>();
  materials.forEach(m => materialMap.set(m.material_code, m));

  const mrpMap = new Map<string, number>();
  mrpRecords.forEach(m => {
    mrpMap.set(m.main_material, m.material_demand_quantity);
  });

  const prByMaterial = new Map<string, number>();
  prRecords.forEach(pr => {
    prByMaterial.set(pr.material_number, (prByMaterial.get(pr.material_number) || 0) + 1);
  });

  const poByMaterial = new Map<string, typeof poRecords>();
  poRecords.forEach(po => {
    const list = poByMaterial.get(po.material_number) || [];
    list.push(po);
    poByMaterial.set(po.material_number, list);
  });

  // 可用库存汇总：同一物料可能有多条记录（不同批次/仓库），累加 available_inventory_qty
  const availableInvMap = new Map<string, number>();
  inventoryRecords.forEach(inv => {
    const prev = availableInvMap.get(inv.material_code) || 0;
    availableInvMap.set(inv.material_code, prev + (inv.available_inventory_qty || 0));
  });

  // 5. 构建 BOM 树（parent_material_code -> children）
  const bomTree = buildBOMTreeFromRecords(bomRecords, productCode);

  // 6. 倒排计算
  const productMat = materialMap.get(productCode);
  const productLeadtime = productMat
    ? parseFloat(productMat.product_fixedleadtime) || 7
    : 7;

  const startDate = new Date(productionStart);
  const endDate = new Date(productionEnd);

  // L0 产品层
  const root: GanttBar = {
    materialCode: productCode,
    materialName: productMat?.material_name || productCode,
    bomLevel: 0,
    parentCode: null,
    startDate,
    endDate,
    leadtime: productLeadtime,
    materialType: '自制',
    status: 'on_time',
    hasShortage: false,
    shortageQuantity: 0,
    poStatus: 'not_applicable',
    prStatus: 'not_applicable',
    availableInventoryQty: availableInvMap.get(productCode),
    children: [],
  };

  // BFS 倒排遍历（visited 防止环路导致无限循环）
  const visited = new Set<string>();
  visited.add(productCode);

  const queue: { parentBar: GanttBar; childRecords: BOMRecord[] }[] = [];
  const level1 = bomTree.get(productCode) || [];
  if (level1.length > 0) {
    queue.push({ parentBar: root, childRecords: level1 });
  }

  const MAX_NODES = 2000; // 安全上限，防止异常数据导致内存溢出
  let nodeCount = 1; // 已包含 root

  while (queue.length > 0) {
    const { parentBar, childRecords } = queue.shift()!;

    for (const bomItem of childRecords) {
      // 防止环路
      if (visited.has(bomItem.material_code)) continue;
      if (nodeCount >= MAX_NODES) {
        console.warn(`[GanttService] 节点数超过上限 ${MAX_NODES}，截断渲染`);
        break;
      }
      const mat = materialMap.get(bomItem.material_code);
      const isExternal = mat?.materialattr === '外购' || mat?.materialattr === '委外';
      const rawLeadtime = isExternal
        ? parseFloat(mat?.purchase_fixedleadtime || '0')
        : parseFloat(mat?.product_fixedleadtime || '0');
      const leadtime = rawLeadtime > 0 ? rawLeadtime : 7;
      // 倒排核心：子件结束 = 父级开始 - 1天
      const childEnd = new Date(parentBar.startDate);
      childEnd.setDate(childEnd.getDate() - 1);
      const childStart = new Date(childEnd);
      childStart.setDate(childStart.getDate() - leadtime);

      // MRP 缺口
      const demand = mrpMap.get(bomItem.material_code) ?? 0;
      const hasShortage = demand < 0;

      // PR/PO 状态
      const prCount = prByMaterial.get(bomItem.material_code) || 0;
      const pos = poByMaterial.get(bomItem.material_code) || [];
      const hasPR = prCount > 0;
      const hasPO = pos.length > 0;

      // 最新PO交货日（按 biztime 降序取第一条）
      let poDeliverDate: string | undefined;
      if (pos.length > 0) {
        const sorted = [...pos].sort((a, b) =>
          new Date(b.biztime).getTime() - new Date(a.biztime).getTime()
        );
        poDeliverDate = sorted[0].deliverdate;
      }

      // 状态判定
      let status: GanttBar['status'] = 'on_time';
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (hasPO) {
        status = 'ordered';
      } else if (childStart < today || childEnd > parentBar.startDate) {
        status = 'risk';
      }

      const bar: GanttBar = {
        materialCode: bomItem.material_code,
        materialName: bomItem.material_name || mat?.material_name || bomItem.material_code,
        bomLevel: bomItem.bom_level,
        parentCode: bomItem.parent_material_code,
        startDate: childStart,
        endDate: childEnd,
        leadtime,
        materialType: mat?.materialattr || '自制',
        status,
        hasShortage,
        shortageQuantity: hasShortage ? Math.abs(demand) : 0,
        poStatus: isExternal ? (hasPO ? 'has_po' : 'no_po') : 'not_applicable',
        prStatus: isExternal ? (hasPR ? 'has_pr' : 'no_pr') : 'not_applicable',
        poDeliverDate,
        availableInventoryQty: availableInvMap.get(bomItem.material_code),
        children: [],
      };

      visited.add(bomItem.material_code);
      nodeCount++;
      parentBar.children.push(bar);

      // 递归子级
      const grandChildren = bomTree.get(bomItem.material_code) || [];
      if (grandChildren.length > 0) {
        queue.push({ parentBar: bar, childRecords: grandChildren });
      }
    }
  }

  console.log(`[GanttService] 甘特图构建完成，共 ${nodeCount} 个节点`);
  return [root];
}

/** 从 BOM 记录构建 parent -> children 映射（仅保留主料，过滤替代料） */
function buildBOMTreeFromRecords(
  records: BOMRecord[],
  rootCode: string
): Map<string, BOMRecord[]> {
  const tree = new Map<string, BOMRecord[]>();

  // 过滤替代料（alt_part 为空或不存在为主料）
  const mainRecords = records.filter(r => {
    return !r.alt_part || r.alt_part === '' || r.alt_part === '0';
  });

  for (const record of mainRecords) {
    const parent = record.parent_material_code || rootCode;
    const children = tree.get(parent) || [];
    children.push(record);
    tree.set(parent, children);
  }
  return tree;
}

/** 将树形 GanttBar 展平为一维数组（用于表格渲染） */
export function flattenGanttBars(bars: GanttBar[]): GanttBar[] {
  const result: GanttBar[] = [];
  function walk(bar: GanttBar) {
    result.push(bar);
    bar.children.forEach(walk);
  }
  bars.forEach(walk);
  return result;
}

/** 计算甘特图时间范围（完整范围：取所有物料的最早 startDate 到最晚 endDate） */
export function getGanttTimeRange(bars: GanttBar[]): { start: Date; end: Date } {
  const flat = flattenGanttBars(bars);
  if (flat.length === 0) {
    const now = new Date();
    return { start: now, end: new Date(now.getTime() + 30 * 86400000) };
  }

  let minDate = flat[0].startDate;
  let minBar = flat[0];
  let maxDate = flat[0].endDate;
  for (const bar of flat) {
    if (bar.startDate < minDate) { minDate = bar.startDate; minBar = bar; }
    if (bar.endDate > maxDate) maxDate = bar.endDate;
  }
  console.log(`[GanttService] 最早开始物料: ${minBar.materialCode} "${minBar.materialName}" L${minBar.bomLevel} parent=${minBar.parentCode} startDate=${minDate.toISOString()} leadtime=${minBar.leadtime}天 type=${minBar.materialType}`);

  // 前后各留 2 天缓冲
  const start = new Date(minDate);
  start.setDate(start.getDate() - 2);
  const end = new Date(maxDate);
  end.setDate(end.getDate() + 2);

  return { start, end };
}

// ─────────────────────────────────────────────────────────────────────────────
// 计划进度总结
// ─────────────────────────────────────────────────────────────────────────────

export interface GanttSummary {
  /** 用户填写的生产计划开始日 */
  planStart: string;
  /** 用户填写的生产计划结束日 */
  planEnd: string;
  /** 倒排后实际最早需要开始的日期（所有物料 startDate 最小值） */
  actualEarliestStart: Date;
  /** 计划周期天数（planStart ~ planEnd） */
  planDays: number;
  /** 实际需要的总天数（actualEarliestStart ~ planEnd） */
  totalDays: number;
  /** 会导致任务超期的物料：endDate > planEnd（且 bomLevel > 0） */
  overdueItems: GanttBar[];
  /**
   * 开始时间已过期的外购/委外物料：startDate < 今天 且未下PO
   * 代表"本应在这个日期开始采购，但现在已经来不及了"
   */
  pastDueItems: GanttBar[];
  /** BOM物料总数（bomLevel > 0 的物料节点数） */
  totalMaterials: number;
  /** 缺料数（hasShortage === true） */
  shortageCount: number;
  /** 异常物料数（pastDueItems + overdueItems 去重后合集） */
  abnormalCount: number;
}

/** 计算甘特图的计划进度总结（用于在甘特图上方展示总览卡片） */
export function getGanttSummary(
  bars: GanttBar[],
  productionStart: string,
  productionEnd: string,
): GanttSummary {
  const flat = flattenGanttBars(bars);
  const materials = flat.filter(b => b.bomLevel > 0);

  const planStartDate = new Date(productionStart);
  const planEndDate = new Date(productionEnd);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 最早开始日期
  let actualEarliestStart = planStartDate;
  for (const bar of flat) {
    if (bar.startDate < actualEarliestStart) actualEarliestStart = bar.startDate;
  }

  const planDays = Math.ceil((planEndDate.getTime() - planStartDate.getTime()) / 86400000);
  const totalDays = Math.ceil((planEndDate.getTime() - actualEarliestStart.getTime()) / 86400000);

  // 超期物料：到货日晚于生产计划结束日
  const overdueItems = materials.filter(b => b.endDate > planEndDate);

  // 过期物料：应开始采购日已过，且外购/委外未下PO
  const pastDueItems = materials.filter(
    b => b.startDate < today && (b.poStatus === 'no_po') && b.materialType !== '自制',
  );

  const totalMaterials = materials.length;
  const shortageCount = materials.filter(b => b.hasShortage).length;
  // 异常物料：pastDue 和 overdue 的并集（按 materialCode 去重）
  const abnormalCodes = new Set([
    ...pastDueItems.map(b => b.materialCode),
    ...overdueItems.map(b => b.materialCode),
  ]);
  const abnormalCount = abnormalCodes.size;

  return {
    planStart: productionStart,
    planEnd: productionEnd,
    actualEarliestStart,
    planDays,
    totalDays,
    overdueItems,
    pastDueItems,
    totalMaterials,
    shortageCount,
    abnormalCount,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Markdown 导出（供智能体消费）
// ─────────────────────────────────────────────────────────────────────────────

export interface GanttExportOptions {
  taskName: string;
  productCode: string;
  productName: string;
  productionStart: string;
  productionEnd: string;
  productionQuantity: number;
  demandStart: string;
  demandEnd: string;
  demandQuantity: number;
}

/**
 * 将甘特图数据导出为 Markdown 格式（结构化，供智能体/LLM 消费）
 *
 * 输出结构：
 * 1. 任务基本信息
 * 2. 全局统计
 * 3. 缺料风险清单（优先告知，便于智能体聚焦高优先级）
 * 4. 物料倒排甘特表（按 BOM 层级缩进，含关键字段）
 */
export function exportGanttAsMarkdown(
  bars: GanttBar[],
  opts: GanttExportOptions,
): string {
  const flat = flattenGanttBars(bars);
  const materials = flat.filter(b => b.bomLevel > 0);
  const shortageList = materials.filter(b => b.hasShortage);
  const riskList = materials.filter(b => b.status === 'risk');
  const noPOList = materials.filter(b => b.poStatus === 'no_po');

  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const today = fmt(new Date());
  const indent = (level: number) => '  '.repeat(level);
  const statusLabel = (bar: GanttBar) => {
    if (bar.status === 'ordered') return '✅ 已下PO';
    if (bar.status === 'risk') return '⚠️ 风险';
    return '🔵 正常';
  };
  const shortageTag = (bar: GanttBar) =>
    bar.hasShortage ? ` | ❗缺口 ${bar.shortageQuantity.toLocaleString()}` : '';

  // ── 1. 任务信息 ──
  const lines: string[] = [
    `# 生产计划倒排甘特图`,
    ``,
    `> 导出时间：${today}  `,
    `> 适用场景：供应链智能体分析、采购跟进、风险预警`,
    ``,
    `## 1. 任务基本信息`,
    ``,
    `| 字段 | 值 |`,
    `|------|----|`,
    `| 任务名称 | ${opts.taskName} |`,
    `| 产品编码 | ${opts.productCode} |`,
    `| 产品名称 | ${opts.productName} |`,
    `| 产品需求周期 | ${opts.demandStart} ~ ${opts.demandEnd} |`,
    `| 需求数量 | ${opts.demandQuantity.toLocaleString()} 套 |`,
    `| 生产计划周期 | ${opts.productionStart} ~ ${opts.productionEnd} |`,
    `| 生产数量 | ${opts.productionQuantity.toLocaleString()} 套 |`,
    ``,
    // ── 2. 统计 ──
    `## 2. 全局统计`,
    ``,
    `| 指标 | 数量 |`,
    `|------|------|`,
    `| 物料总数（含半成品） | ${materials.length} 种 |`,
    `| 缺口物料数 | ${shortageList.length} 种 |`,
    `| 风险物料数（时间冲突） | ${riskList.length} 种 |`,
    `| 未下PO的外购/委外物料 | ${noPOList.length} 种 |`,
    ``,
  ];

  // ── 3. 缺料/风险清单 ──
  if (shortageList.length > 0 || riskList.length > 0 || noPOList.length > 0) {
    lines.push(`## 3. 风险与缺料清单`);
    lines.push(``);
    lines.push(`> 以下物料需要重点关注，建议智能体优先处理。`);
    lines.push(``);

    if (shortageList.length > 0) {
      lines.push(`### 3.1 存在库存缺口的物料`);
      lines.push(``);
      lines.push(`| 物料编码 | 物料名称 | BOM层级 | 物料类型 | 缺口数量 | 计划区间 |`);
      lines.push(`|----------|----------|---------|---------|---------|---------|`);
      shortageList.forEach(b => {
        lines.push(
          `| ${b.materialCode} | ${b.materialName} | L${b.bomLevel} | ${b.materialType} | ${b.shortageQuantity.toLocaleString()} | ${fmt(b.startDate)} ~ ${fmt(b.endDate)} |`
        );
      });
      lines.push(``);
    }

    if (noPOList.length > 0) {
      lines.push(`### 3.2 外购/委外但未下PO的物料`);
      lines.push(``);
      lines.push(`| 物料编码 | 物料名称 | BOM层级 | 物料类型 | 计划到货日 | PR状态 |`);
      lines.push(`|----------|----------|---------|---------|-----------|-------|`);
      noPOList.forEach(b => {
        const prTag = b.prStatus === 'has_pr' ? '✅ 已PR' : '❌ 无PR';
        lines.push(
          `| ${b.materialCode} | ${b.materialName} | L${b.bomLevel} | ${b.materialType} | ${fmt(b.endDate)} | ${prTag} |`
        );
      });
      lines.push(``);
    }

    if (riskList.length > 0) {
      lines.push(`### 3.3 时间风险物料（计划开工时间已过或时间冲突）`);
      lines.push(``);
      lines.push(`| 物料编码 | 物料名称 | BOM层级 | 计划区间 | 交货日 |`);
      lines.push(`|----------|----------|---------|---------|-------|`);
      riskList.forEach(b => {
        const deliver = b.poDeliverDate ?? '-';
        lines.push(
          `| ${b.materialCode} | ${b.materialName} | L${b.bomLevel} | ${fmt(b.startDate)} ~ ${fmt(b.endDate)} | ${deliver} |`
        );
      });
      lines.push(``);
    }
  } else {
    lines.push(`## 3. 风险与缺料清单`);
    lines.push(``);
    lines.push(`> ✅ 当前无缺料或时间风险物料。`);
    lines.push(``);
  }

  // ── 4. 完整甘特表 ──
  lines.push(`## 4. 物料倒排甘特表`);
  lines.push(``);
  lines.push(`> 按 BOM 层级缩进展示，L0=产品，L1=一级子件，L2=二级子件，以此类推。`);
  lines.push(`> 字段说明：`);
  lines.push(`> - **状态**：✅ 已下PO | ⚠️ 风险（时间冲突）| 🔵 正常`);
  lines.push(`> - **PO交货日**：最新采购订单的交货日期`);
  lines.push(`> - **缺口**：净需求为负时显示缺口数量`);
  lines.push(``);

  const writeBar = (bar: GanttBar) => {
    const pfx = indent(bar.bomLevel);
    const levelTag = bar.bomLevel === 0 ? '**[产品]**' : `L${bar.bomLevel}`;
    const poDate = bar.poDeliverDate ? ` | PO交货：${bar.poDeliverDate}` : '';
    const shortage = shortageTag(bar);
    lines.push(
      `${pfx}- ${levelTag} \`${bar.materialCode}\` ${bar.materialName}` +
      ` (${bar.materialType})` +
      ` | 📅 ${fmt(bar.startDate)} ~ ${fmt(bar.endDate)}` +
      ` | 提前期：${bar.leadtime}天` +
      ` | ${statusLabel(bar)}${poDate}${shortage}`
    );
    bar.children.forEach(writeBar);
  };

  bars.forEach(writeBar);

  lines.push(``);
  lines.push(`---`);
  lines.push(`*本文档由供应链大脑系统自动生成，可直接提供给智能体进行分析和决策支持。*`);

  return lines.join('\n');
}

export const ganttService = {
  buildGanttData,
  flattenGanttBars,
  getGanttTimeRange,
  getGanttSummary,
  exportGanttAsMarkdown,
};
