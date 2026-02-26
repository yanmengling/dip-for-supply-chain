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

  // 3. 串行分批查询物料主数据、PR、PO（避免并行大量请求导致超时）
  const codeList = Array.from(allMaterialCodes);
  console.log(`[GanttService] 去重物料编码: ${codeList.length} 个，开始分批查询...`);

  const materials = await planningV2DataService.loadMaterialsByCode(codeList);
  console.log(`[GanttService] 物料主数据加载完成: ${materials.length} 条`);

  const prRecords = await planningV2DataService.loadPRByMaterials(codeList);
  console.log(`[GanttService] PR加载完成: ${prRecords.length} 条`);

  const poRecords = await planningV2DataService.loadPOByMaterials(codeList);
  console.log(`[GanttService] PO加载完成: ${poRecords.length} 条`);

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

/** 计算甘特图时间范围 */
export function getGanttTimeRange(bars: GanttBar[]): { start: Date; end: Date } {
  const flat = flattenGanttBars(bars);
  if (flat.length === 0) {
    const now = new Date();
    return { start: now, end: new Date(now.getTime() + 30 * 86400000) };
  }

  let minDate = flat[0].startDate;
  let maxDate = flat[0].endDate;
  for (const bar of flat) {
    if (bar.startDate < minDate) minDate = bar.startDate;
    if (bar.endDate > maxDate) maxDate = bar.endDate;
  }

  // 前后各留 2 天
  const start = new Date(minDate);
  start.setDate(start.getDate() - 2);
  const end = new Date(maxDate);
  end.setDate(end.getDate() + 2);

  return { start, end };
}

export const ganttService = {
  buildGanttData,
  flattenGanttBars,
  getGanttTimeRange,
};
