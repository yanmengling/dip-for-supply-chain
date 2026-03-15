/**
 * 甘特图倒排算法服务
 *
 * 基于 BOM 层级的齐套模式倒排：
 * - 子级到位时间 = 父级开工时间 - 1天
 * - 倒排起点 = demandEnd（需求截止时间）
 *
 * v3.7 Phase B: 精确查询链 + 物料供需三分类
 */

import type { GanttBar, BOMRecord, MaterialRecord, SupplyStatus, InventoryRecord } from '../types/planningV2';
import { planningV2DataService } from './planningV2DataService';
import type { MRPPlanOrderAPI, DegradedResult } from './planningV2DataService';

/** 各环节降级状态（v3.7 Phase B） */
export interface DegradationInfo {
  mrp: boolean;   // MRP 是否降级（rootdemandbillno 无结果）
  pr: boolean;    // PR 是否降级（srcbillid 无结果）
  po: boolean;    // PO 是否降级（srcbillid 无结果）
}

/** buildGanttData 返回结果（v3.7 Phase B） */
export interface GanttBuildResult {
  bars: GanttBar[];
  degradation: DegradationInfo;
  /** Phase 2 优化：透传库存原始数据，供 buildKeyMaterialList 复用，避免重复查询 */
  inventoryRecords: InventoryRecord[];
}

/** 加载并构建倒排甘特图数据（v3.7 Phase B: 精确查询链） */
export async function buildGanttData(
  productCode: string,
  productionStart: string,
  productionEnd: string,
  forecastBillnos?: string[],
  demandStart?: string,
): Promise<GanttBuildResult> {
  console.log(`[GanttService] 开始构建甘特图: ${productCode}, ${productionStart} ~ ${productionEnd}, billnos=${forecastBillnos?.length ?? 0}`);

  // ⏱ 性能计量（Phase 1）
  const perfStart = performance.now();
  const perf: Record<string, number> = {};

  const degradation: DegradationInfo = { mrp: true, pr: true, po: true };

  // 1. 并行查询 BOM + MRP（精确查询链 B2）
  const t1 = performance.now();
  const [bomRecords, mrpResult] = await Promise.all([
    planningV2DataService.loadBOMByProduct(productCode),
    (forecastBillnos && forecastBillnos.length > 0)
      ? planningV2DataService.loadMRPByBillnos(forecastBillnos, productCode)
      : Promise.resolve({ data: [] as MRPPlanOrderAPI[], isDegraded: true } as DegradedResult<MRPPlanOrderAPI[]>),
  ]);
  perf['1_BOM+MRP(并行)'] = Math.round(performance.now() - t1);

  // 使用全部 MRP 记录（含已关闭），不做 filterActiveMRP 过滤
  const mrpRecords = mrpResult.allMrpRecords ?? mrpResult.data;
  degradation.mrp = mrpResult.isDegraded;
  console.log(`[GanttService] BOM: ${bomRecords.length} 条, MRP(全量): ${mrpRecords.length} 条 (降级=${degradation.mrp})`);

  // PRD D3: BOM 为空时友好提示
  if (bomRecords.length === 0) {
    console.warn(`[GanttService] 产品 ${productCode} 无 BOM 数据，请检查 ERP 中是否已维护 BOM`);
    throw new Error(`产品 ${productCode} 未找到 BOM 数据，请在 ERP 中确认该产品是否已维护物料清单(BOM)`);
  }

  // 2. 收集所有物料编码（仅 BOM 范围）
  const allMaterialCodes = new Set<string>();
  allMaterialCodes.add(productCode);
  bomRecords.forEach(b => {
    allMaterialCodes.add(b.material_code);
    if (b.parent_material_code) allMaterialCodes.add(b.parent_material_code);
  });

  // MRP 降级时返回全量数据（包含其他产品的物料），不应扩展 codeList
  // 仅在精确查询时（isDegraded=false）才将 MRP 物料加入
  if (!degradation.mrp) {
    mrpRecords.forEach(m => {
      if (m.materialplanid_number) allMaterialCodes.add(m.materialplanid_number);
    });
  }
  const mrpSkipped = degradation.mrp ? mrpRecords.filter(m => m.materialplanid_number && !allMaterialCodes.has(m.materialplanid_number)).length : 0;

  const codeList = Array.from(allMaterialCodes);
  console.log(`[GanttService] 去重物料编码: ${codeList.length} 个${mrpSkipped > 0 ? `（MRP降级，跳过 ${mrpSkipped} 条非BOM物料）` : ''}，开始分批查询...`);

  // ── Phase 2 优化：重排数据加载流程 ──
  // 流程: Step2+5 并行 → 用物料属性过滤外购件 → Step3+4(PR+PO) 并行
  // 用全部 MRP billno（含已关闭），因为已关闭的 MRP 可能已生成 PR/PO
  const mrpBillnos = mrpResult.allMrpBillnos ?? mrpRecords.map(m => m.billno).filter(Boolean);
  console.log(`[GanttService] MRP billnos (${mrpBillnos.length} 个，含已关闭):`, mrpBillnos.slice(0, 5), mrpBillnos.length > 5 ? `...共 ${mrpBillnos.length}` : '');
  const effectiveDemandStart = demandStart || productionStart;
  console.log(`[GanttService] effectiveDemandStart=${effectiveDemandStart}, demandStart=${demandStart}, productionStart=${productionStart}`);

  // ── Round 1: 物料主数据 + 库存（并行） ──
  const tR1 = performance.now();
  let inventoryRecords: InventoryRecord[] = [];
  let inventoryUnavailable = false;

  const [materials, inventoryResult] = await Promise.all([
    // Step 2: 物料主数据
    planningV2DataService.loadMaterialsByCode(codeList),
    // Step 5: 库存（PRD D3: 异常时不崩溃）
    planningV2DataService.loadInventoryByMaterials(codeList)
      .catch((err: unknown) => {
        console.error(`[GanttService] 库存加载异常，齐套判定将受限:`, err);
        inventoryUnavailable = true;
        return [] as InventoryRecord[];
      }),
  ]);
  inventoryRecords = inventoryResult;

  perf['2_物料主数据'] = Math.round(performance.now() - tR1);
  perf['5_库存查询'] = Math.round(performance.now() - tR1);
  perf['2+5_并行实际'] = Math.round(performance.now() - tR1);
  console.log(`[GanttService] 物料主数据加载完成: ${materials.length} 条`);
  console.log(`[GanttService] 库存加载完成: ${inventoryRecords.length} 条`);

  // ── 过滤外购件编码（用于 PR/PO fallback，自制件不走采购） ──
  const materialMap = new Map<string, MaterialRecord>();
  materials.forEach(m => materialMap.set(m.material_code, m));
  const externalCodes = codeList.filter(code => {
    const attr = materialMap.get(code)?.materialattr;
    return attr === '外购' || attr === '委外';
  });
  console.log(`[GanttService] 外购/委外物料: ${externalCodes.length} 个（总 ${codeList.length} 个），PR/PO fallback 仅查外购件`);

  // ── Round 2: PR → PO（串行链：PR 结果的 billno 用于 PO 精确查询） ──
  const tR2 = performance.now();

  // Step 3: PR（精确查询: srcbillnumber in [mrpBillnos]）
  const prResult = await planningV2DataService.loadPRByMRPBillnos(mrpBillnos, externalCodes, effectiveDemandStart);
  perf['3_PR查询'] = Math.round(performance.now() - tR2);

  // Step 4: PO（精确查询: srcbillnumber in [prBillnos]，需要 PR 结果）
  const tPO = performance.now();
  const prBillnos = prResult.data.map(pr => pr.billno).filter(Boolean);
  const poResult = await planningV2DataService.loadPOByPRBillnos(prBillnos, externalCodes, effectiveDemandStart);
  perf['4_PO查询'] = Math.round(performance.now() - tPO);
  perf['3+4_串行实际'] = Math.round(performance.now() - tR2);

  const prRecords = prResult.data;
  degradation.pr = prResult.isDegraded;
  console.log(`[GanttService] PR加载完成: ${prRecords.length} 条 (降级=${degradation.pr})`);
  const poRecords = poResult.data;
  degradation.po = poResult.isDegraded;
  console.log(`[GanttService] PO加载完成: ${poRecords.length} 条 (降级=${degradation.po})`);

  // 4. 构建查找映射 + 倒排计算
  const t6 = performance.now();
  // materialMap 已在 Round 1 后构建（用于过滤外购件）

  // MRP 映射：物料编码 → 需求量（优先 bizorderqty，fallback adviseorderqty）
  const mrpMap = new Map<string, number>();
  const mrpHasRecord = new Set<string>();  // 记录哪些物料有 MRP 记录（用于三分类）
  // MRP 投放信息映射：物料编码 → { dropStatusTitle, bizdropqty }（累加投放数量，取最新投放状态）
  const mrpDropMap = new Map<string, { dropStatusTitle: string; bizdropqty: number }>();
  mrpRecords.forEach(m => {
    const code = m.materialplanid_number;
    if (!code) return;
    mrpHasRecord.add(code);
    const qty = planningV2DataService.getMRPDemandQty(m);
    // 同一物料可能有多条 MRP，累加
    mrpMap.set(code, (mrpMap.get(code) || 0) + qty);
    // 投放信息累加
    const existing = mrpDropMap.get(code);
    if (existing) {
      existing.bizdropqty += m.bizdropqty || 0;
      // 取最新一条的投放状态
      if (m.dropstatus_title) existing.dropStatusTitle = m.dropstatus_title;
    } else {
      mrpDropMap.set(code, {
        dropStatusTitle: m.dropstatus_title || '',
        bizdropqty: m.bizdropqty || 0,
      });
    }
  });

  // 诊断：MRP 记录数 vs 唯一物料数
  console.log(`[GanttService] MRP映射: ${mrpRecords.length}条记录 → ${mrpHasRecord.size}个唯一物料, mrpDropMap=${mrpDropMap.size}个`);
  // 打印每个MRP物料的记录数
  const mrpCountByCode = new Map<string, number>();
  mrpRecords.forEach(m => { if (m.materialplanid_number) mrpCountByCode.set(m.materialplanid_number, (mrpCountByCode.get(m.materialplanid_number) || 0) + 1); });
  const multiMrpCodes = [...mrpCountByCode.entries()].filter(([, c]) => c > 1);
  if (multiMrpCodes.length > 0) console.log(`[GanttService] 多条MRP的物料(${multiMrpCodes.length}个):`, multiMrpCodes.map(([code, cnt]) => `${code}×${cnt}`));

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

  // 可用库存汇总
  const availableInvMap = new Map<string, number>();
  inventoryRecords.forEach(inv => {
    const prev = availableInvMap.get(inv.material_code) || 0;
    availableInvMap.set(inv.material_code, prev + (inv.available_inventory_qty || 0));
  });

  // 5. 构建 BOM 树（parent_material_code -> children）
  const bomTree = buildBOMTreeFromRecords(bomRecords, productCode);
  // 检查 BOM 数据中的孤立父节点（有子级但自身不在任何子件列表中）
  const allChildCodes = new Set<string>();
  bomRecords.forEach(r => allChildCodes.add(r.material_code));
  const allParentCodes = new Set<string>();
  bomRecords.forEach(r => { if (r.parent_material_code) allParentCodes.add(r.parent_material_code); });
  const orphanParents = [...allParentCodes].filter(p => p !== productCode && !allChildCodes.has(p));
  if (orphanParents.length > 0) {
    const orphanChildCount = orphanParents.reduce((s, p) => s + (bomTree.get(p)?.length || 0), 0);
    console.warn(`[GanttService] BOM数据存在 ${orphanParents.length} 个孤立父节点（${orphanChildCount} 条子记录），已补充到甘特图:`, orphanParents);
  }

  // 6. 倒排计算
  const productMat = materialMap.get(productCode);
  const productLeadtime = productMat
    ? parseFloat(productMat.product_fixedleadtime) || 7
    : 7;

  const endDate = new Date(productionEnd);
  // 产品行倒排：startDate = demandEnd - 生产固定提前期
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - productLeadtime);

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
    supplyStatus: 'sufficient',  // 产品根节点默认满足
    poStatus: 'not_applicable',
    prStatus: 'not_applicable',
    hasMRP: mrpHasRecord.has(productCode),
    availableInventoryQty: availableInvMap.get(productCode),
    children: [],
  };

  // BFS 倒排遍历
  // visitedPositions: 按 BOM 位置（parent+child）去重，允许同一物料在不同父组件下出现
  // 环路检测: 通过 ancestorChain 追踪祖先链，防止 A→B→C→A 的循环
  const visitedPositions = new Set<string>();
  visitedPositions.add(`_root_>${productCode}`);

  const queue: { parentBar: GanttBar; childRecords: BOMRecord[]; ancestors: Set<string> }[] = [];
  const level1 = bomTree.get(productCode) || [];
  if (level1.length > 0) {
    queue.push({ parentBar: root, childRecords: level1, ancestors: new Set([productCode]) });
  }

  const MAX_NODES = 2000; // 安全上限，防止异常数据导致内存溢出
  let nodeCount = 1; // 已包含 root

  while (queue.length > 0) {
    const { parentBar, childRecords, ancestors } = queue.shift()!;

    for (const bomItem of childRecords) {
      // 环路检测：如果子件已在祖先链上，跳过（真正的循环引用）
      if (ancestors.has(bomItem.material_code)) {
        console.warn(`[GanttService] 检测到环路: ${parentBar.materialCode} -> ${bomItem.material_code}，跳过`);
        continue;
      }
      // BOM 位置去重：同一 parent 下同一 material 只保留一次
      const posKey = `${parentBar.materialCode}>${bomItem.material_code}`;
      if (visitedPositions.has(posKey)) continue;
      visitedPositions.add(posKey);

      if (nodeCount >= MAX_NODES) {
        console.warn(`[GanttService] 节点数超过上限 ${MAX_NODES}，截断渲染`);
        break;
      }
      const mat = materialMap.get(bomItem.material_code);
      const isExternal = mat?.materialattr === '外购' || mat?.materialattr === '委外';

      // MRP 缺口 + 三分类（v3.7 Phase B: B6）
      const demand = mrpMap.get(bomItem.material_code) ?? 0;
      const hasMRP = mrpHasRecord.has(bomItem.material_code);

      // 提前期：有MRP记录用物料提前期，无MRP记录（库存满足）倒排1天
      const rawLeadtime = isExternal
        ? parseFloat(mat?.purchase_fixedleadtime || '0')
        : parseFloat(mat?.product_fixedleadtime || '0');
      const leadtime = hasMRP ? (rawLeadtime > 0 ? rawLeadtime : 7) : 1;
      // 倒排核心：子件结束 = 父级开始 - 1天
      const childEnd = new Date(parentBar.startDate);
      childEnd.setDate(childEnd.getDate() - 1);
      const childStart = new Date(childEnd);
      childStart.setDate(childStart.getDate() - leadtime);
      const hasShortage = hasMRP;  // 有MRP记录即为缺货
      const availableQty = availableInvMap.get(bomItem.material_code) ?? 0;

      // 物料供需三分类：有MRP=缺货（需采购跟踪），无MRP+有库存=就绪，无MRP+无库存=异常
      let supplyStatus: SupplyStatus;
      if (hasMRP) {
        supplyStatus = 'shortage';  // 有MRP记录即表示需采购，统一标记为缺货
      } else {
        // 无 MRP 记录
        supplyStatus = availableQty > 0 ? 'sufficient_no_mrp' : 'anomaly';
      }

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
      if (!hasMRP && supplyStatus === 'sufficient_no_mrp') {
        // 无MRP + 有库存 = 就绪，绿色
        status = 'ready';
      } else if (!hasMRP && supplyStatus === 'anomaly') {
        // 无MRP + 无库存 = 异常，黄色
        status = 'anomaly';
      } else if (hasPO) {
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
        supplyStatus,
        poStatus: isExternal ? (hasPO ? 'has_po' : 'no_po') : 'not_applicable',
        prStatus: isExternal ? (hasPR ? 'has_pr' : 'no_pr') : 'not_applicable',
        poDeliverDate,
        hasMRP,
        availableInventoryQty: availableInvMap.get(bomItem.material_code),
        dropStatusTitle: mrpDropMap.get(bomItem.material_code)?.dropStatusTitle,
        bizdropqty: mrpDropMap.get(bomItem.material_code)?.bizdropqty,
        children: [],
      };

      nodeCount++;
      parentBar.children.push(bar);

      // 递归子级：传递新的祖先链（加上当前节点）
      const grandChildren = bomTree.get(bomItem.material_code) || [];
      if (grandChildren.length > 0) {
        const childAncestors = new Set(ancestors);
        childAncestors.add(bomItem.material_code);
        queue.push({ parentBar: bar, childRecords: grandChildren, ancestors: childAncestors });
      }
    }
  }

  // 孤立父节点是替代料（alt_priority>0 被过滤掉了），其子级记录的 parent 指向替代料编码
  // 这些子级不应出现在甘特图中，仅打印警告供排查
  if (orphanParents.length > 0) {
    const orphanChildCount = orphanParents.reduce((s, p) => s + (bomTree.get(p)?.length || 0), 0);
    console.warn(`[GanttService] 跳过 ${orphanParents.length} 个替代料父节点的 ${orphanChildCount} 条子记录（替代料已被 alt_priority=0 过滤）:`, orphanParents);
  }

  perf['6_BOM树+倒排'] = Math.round(performance.now() - t6);

  // ── MRP vs BOM 物料差异诊断（排查步骤②与步骤③记录数不一致）──
  const ganttMaterialCodes = new Set(flattenGanttBars([root]).map(b => b.materialCode));
  const mrpMaterialCodes = new Set(mrpRecords.map(m => m.materialplanid_number).filter(Boolean));
  const mrpNotInGantt = [...mrpMaterialCodes].filter(c => !ganttMaterialCodes.has(c));
  if (mrpNotInGantt.length > 0) {
    console.warn(`[GanttService] MRP有${mrpMaterialCodes.size}个唯一物料, 甘特图有${ganttMaterialCodes.size - 1}个(不含产品), ${mrpNotInGantt.length}个MRP物料不在甘特图中:`, mrpNotInGantt);
    // 进一步检查：这些物料是否在 BOM 原始数据中
    const bomMaterialCodes = new Set(bomRecords.map(b => b.material_code));
    const notInBom = mrpNotInGantt.filter(c => !bomMaterialCodes.has(c));
    const inBomButFiltered = mrpNotInGantt.filter(c => bomMaterialCodes.has(c));
    if (notInBom.length > 0) console.warn(`[GanttService]   - 不在BOM中: ${notInBom.length}个`, notInBom);
    if (inBomButFiltered.length > 0) console.warn(`[GanttService]   - 在BOM中但被甘特图遍历跳过: ${inBomButFiltered.length}个`, inBomButFiltered);
  } else {
    console.log(`[GanttService] MRP物料(${mrpMaterialCodes.size}个)全部在甘特图中`);
  }
  // 额外诊断：甘特图中有 dropStatusTitle 的节点数（即"有MRP"的BOM位置）
  const ganttNodesWithMRP = flattenGanttBars([root]).filter(b => b.dropStatusTitle != null && b.dropStatusTitle !== undefined);
  console.log(`[GanttService] 甘特图节点中有MRP标记: ${ganttNodesWithMRP.length}个（MRP唯一物料=${mrpMaterialCodes.size}个, MRP总记录=${mrpRecords.length}条）`);

  // ⏱ 性能报告汇总
  perf['总耗时_ms'] = Math.round(performance.now() - perfStart);
  perf['BOM条数'] = bomRecords.length;
  perf['MRP条数'] = mrpRecords.length;
  perf['物料编码数(全部)'] = codeList.length;
  perf['物料编码数(外购)'] = externalCodes.length;
  perf['分片数(物料)'] = Math.ceil(codeList.length / 100);
  perf['分片数(外购PR/PO)'] = Math.ceil(externalCodes.length / 100);
  perf['PR条数'] = prRecords.length;
  perf['PR降级'] = degradation.pr ? 1 : 0;
  perf['PO条数'] = poRecords.length;
  perf['PO降级'] = degradation.po ? 1 : 0;
  perf['库存条数'] = inventoryRecords.length;
  perf['甘特节点数'] = nodeCount;
  console.log('%c[GanttService] ⏱ 性能报告', 'color: #6366f1; font-weight: bold');
  console.table(perf);

  console.log(`[GanttService] 甘特图构建完成，共 ${nodeCount} 个节点（BOM位置），唯一物料 ${new Set(flattenGanttBars([root]).map(b => b.materialCode)).size - 1} 种（不含根）`);
  console.log(`[GanttService] 降级状态: MRP=${degradation.mrp}, PR=${degradation.pr}, PO=${degradation.po}`);
  return { bars: [root], degradation, inventoryRecords };
}

/** 从 BOM 记录构建 parent -> children 映射 */
function buildBOMTreeFromRecords(
  records: BOMRecord[],
  rootCode: string
): Map<string, BOMRecord[]> {
  const tree = new Map<string, BOMRecord[]>();

  // BOM 数据已在 API 层用 alt_priority=0 过滤了主料，无需客户端再过滤
  // 注：alt_part 字段表示"是否存在替代料组"，主料也可能有 alt_part 非空值
  for (const record of records) {
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

  // 过期物料：应开始采购日已过，且外购/委外未下PO，且MRP有净需求缺口（shortage）
  // 没有MRP记录或MRP净需求已满足的物料，无需采购，没PO是正常的
  const pastDueItems = materials.filter(
    b => b.startDate < today && b.poStatus === 'no_po' && b.materialType !== '自制' && b.supplyStatus === 'shortage',
  );

  // 按唯一物料编码统计（同一物料在不同父组件下只算一种），与 MRP 面板口径一致
  const uniqueMaterialCodes = new Set(materials.map(b => b.materialCode));
  const totalMaterials = uniqueMaterialCodes.size;
  // 缺料也按唯一物料编码统计
  const shortageCodes = new Set(materials.filter(b => b.hasShortage).map(b => b.materialCode));
  const shortageCount = shortageCodes.size;
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
