/**
 * 甘特图倒排算法服务
 *
 * 基于 BOM 层级的齐套模式倒排：
 * - 子级到位时间 = 父级开工时间 - 1天
 * - 倒排起点 = demandEnd（需求截止时间）
 *
 * v3.7 Phase B: 精确查询链 + 物料供需三分类
 */

import type { GanttBar, BOMRecord, MaterialRecord, SupplyStatus, InventoryRecord, MRPDetail, PRRecord, PORecord } from '../types/planningV2';
import { planningV2DataService } from './planningV2DataService';
import type { MRPPlanOrderAPI, DegradedResult } from './planningV2DataService';
import { navigationConfigService } from './navigationConfigService';

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
  /** v4.2: 自制件 MRP 单号列表（materialattr_title=自制），供生产工单精确关联查询 */
  selfMadeMrpBillnos: string[];
  /** v4.2: 自制件 MRP billno → 投放时间 映射，供工单追踪展示 */
  selfMadeMrpDroptimeMap: Record<string, string>;
}

/** 加载并构建倒排甘特图数据（v3.7 Phase B: 精确查询链） */
export async function buildGanttData(
  productCode: string,
  productionStart: string,
  productionEnd: string,
  forecastBillnos?: string[],
  demandStart?: string,
  plannedDemandQty?: number,
  preloadedAllMatPORecords?: PORecord[],
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
  performance.measure(`[Perf] ${productCode} ① BOM+MRP`, { start: t1, duration: perf['1_BOM+MRP(并行)'] });

  // 使用预测单号精确关联的全部 MRP 记录（含已关闭，与步骤②一致）
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
  const confirmedNoMRP = !degradation.mrp && mrpRecords.length === 0;
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
  performance.measure(`[Perf] ${productCode} ② 物料+库存`, { start: tR1, duration: perf['2+5_并行实际'] });
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

  // ── Round 2: PR → PO（串行链）+ 按物料查全量PO（并行） ──
  // 说明：
  //   - PR/PO 精确链（MRP→PR→PO）：用于 MRP 投放明细的 PR/PO 状态标记
  //   - allMatPORecords（按物料编码查全量PO）：用于在途库存计算，不受预测单范围限制
  const tR2 = performance.now();
  let prResult: DegradedResult<PRRecord[]>;
  let poResult: DegradedResult<PORecord[]>;
  let allMatPORecords: PORecord[] = [];

  if (!confirmedNoMRP && mrpBillnos.length > 0) {
    // MRP存在：PR 和全量PO 并行
    const tPR = performance.now();
    [prResult, allMatPORecords] = await Promise.all([
      planningV2DataService.loadPRByMRPBillnos(mrpBillnos, effectiveDemandStart),
      preloadedAllMatPORecords !== undefined
        ? Promise.resolve(preloadedAllMatPORecords.filter(po => externalCodes.includes(po.material_number)))
        : externalCodes.length > 0
          ? planningV2DataService.loadPOByMaterials(externalCodes).catch(() => [] as PORecord[])
          : Promise.resolve([] as PORecord[]),
    ]);
    perf['3_PR查询'] = Math.round(performance.now() - tPR);
    performance.measure(`[Perf] ${productCode} ③a PR等待`, { start: tPR, duration: perf['3_PR查询'] });
    const tPO = performance.now();
    const prBillnos = prResult.data.map(pr => pr.billno).filter(Boolean);
    poResult = await planningV2DataService.loadPOByPRBillnos(prBillnos, effectiveDemandStart);
    perf['4_PO查询'] = Math.round(performance.now() - tPO);
    performance.measure(`[Perf] ${productCode} ③b PO查询`, { start: tPO, duration: perf['4_PO查询'] });
  } else {
    // 无MRP：只查全量PO（用于在途）
    prResult = { data: [], isDegraded: false };
    poResult = { data: [], isDegraded: false };
    if (externalCodes.length > 0) {
      allMatPORecords = preloadedAllMatPORecords !== undefined
        ? preloadedAllMatPORecords.filter(po => externalCodes.includes(po.material_number))
        : await planningV2DataService.loadPOByMaterials(externalCodes).catch(() => [] as PORecord[]);
      console.log(`[GanttService] 无MRP，仍按物料查全量PO用于在途计算: ${allMatPORecords.length} 条`);
    } else {
      console.log(`[GanttService] 确认无MRP记录，跳过PR/PO查询`);
    }
  }
  perf['3+4_串行实际'] = Math.round(performance.now() - tR2);
  performance.measure(`[Perf] ${productCode} ③ PR+PO`, { start: tR2, duration: perf['3+4_串行实际'] });

  const prRecords = prResult.data;
  degradation.pr = prResult.isDegraded;
  console.log(`[GanttService] PR加载完成: ${prRecords.length} 条 (降级=${degradation.pr})`);
  const poRecords = poResult.data;
  degradation.po = poResult.isDegraded;
  console.log(`[GanttService] PO加载完成: ${poRecords.length} 条 (降级=${degradation.po})`);
  console.log(`[GanttService] 全量PO（在途基准）: ${allMatPORecords.length} 条`);

  // 4. 构建查找映射 + 倒排计算
  const t6 = performance.now();
  // materialMap 已在 Round 1 后构建（用于过滤外购件）

  // v4.2: MRP 明细映射 — 物料编码 → MRPDetail[]（不再累加，按单呈现）
  const mrpHasRecord = new Set<string>();
  const mrpDetailMap = new Map<string, MRPDetail[]>();
  // 汇总值映射（供甘特图条形渲染，向后兼容）
  const mrpSummaryMap = new Map<string, { totalDemand: number; dropStatusTitle: string; totalDropQty: number }>();

  // ── PR/PO 精确关联（物料编码 + 单号双重匹配） ──
  // MRP billno → 物料编码 映射（一条 MRP 对应一个物料）
  const mrpBillnoToMaterial = new Map<string, string>();
  mrpRecords.forEach(m => {
    if (m.billno && m.materialplanid_number) {
      mrpBillnoToMaterial.set(m.billno, m.materialplanid_number);
    }
  });

  // PR 按「物料编码 + MRP单号」精确关联
  // key = "物料编码|MRP单号"，value = PR 记录
  const prByMaterialAndMrp = new Map<string, PRRecord>();
  prRecords.forEach(pr => {
    if (pr.srcbillnumber && pr.material_number) {
      const key = `${pr.material_number}|${pr.srcbillnumber}`;
      prByMaterialAndMrp.set(key, pr);
    }
  });

  // PO 按「物料编码 + PR单号」精确关联
  // key = "物料编码|PR单号"，value = PO 信息
  const poByMaterialAndPr = new Map<string, { count: number; latestDeliverDate?: string }>();
  poRecords.forEach(po => {
    if (po.srcbillnumber && po.material_number) {
      const key = `${po.material_number}|${po.srcbillnumber}`;
      const existing = poByMaterialAndPr.get(key);
      if (existing) {
        existing.count++;
        if (po.deliverdate && (!existing.latestDeliverDate || po.deliverdate > existing.latestDeliverDate)) {
          existing.latestDeliverDate = po.deliverdate;
        }
      } else {
        poByMaterialAndPr.set(key, { count: 1, latestDeliverDate: po.deliverdate });
      }
    }
  });

  // 构建每条 MRP 的明细
  mrpRecords.forEach(m => {
    const code = m.materialplanid_number;
    if (!code) return;
    mrpHasRecord.add(code);
    const qty = planningV2DataService.getMRPDemandQty(m);

    // PR: 物料编码 + srcbillnumber = MRP.billno
    const prKey = `${code}|${m.billno}`;
    const prRecord = prByMaterialAndMrp.get(prKey);
    const hasPR = !!prRecord;
    const prCount = hasPR ? 1 : 0;

    // PO: 物料编码 + srcbillnumber = PR.billno
    let hasPO = false;
    let poDeliverDate: string | undefined;
    if (prRecord) {
      const poKey = `${code}|${prRecord.billno}`;
      const poInfo = poByMaterialAndPr.get(poKey);
      if (poInfo && poInfo.count > 0) {
        hasPO = true;
        poDeliverDate = poInfo.latestDeliverDate;
      }
    }

    const detail: MRPDetail = {
      mrpBillno: m.billno,
      demandQty: qty,
      adviseorderqty: m.adviseorderqty || 0,
      dropStatusTitle: m.dropstatus_title || '',
      bizdropqty: m.bizdropqty || 0,
      closestatus: m.closestatus_title || '',
      hasPR,
      hasPO,
      prCount,
      poDeliverDate,
    };
    const list = mrpDetailMap.get(code) || [];
    list.push(detail);
    mrpDetailMap.set(code, list);

    // 汇总值
    const summary = mrpSummaryMap.get(code);
    if (summary) {
      summary.totalDemand += qty;
      summary.totalDropQty += m.bizdropqty || 0;
      if (m.dropstatus_title) summary.dropStatusTitle = m.dropstatus_title;
    } else {
      mrpSummaryMap.set(code, {
        totalDemand: qty,
        dropStatusTitle: m.dropstatus_title || '',
        totalDropQty: m.bizdropqty || 0,
      });
    }
  });
  console.log(`[GanttService] MRP明细映射: ${mrpRecords.length}条记录 → ${mrpHasRecord.size}个唯一物料`);

  // PR/PO 按物料编码汇总（用于甘特图 prStatus/poStatus）
  // 仅统计本预测单 MRP 范围内的物料，避免合并单中其他物料的 PR/PO 被错误关联
  const prByMaterial = new Map<string, number>();
  prRecords.forEach(pr => {
    if (!pr.material_number || !mrpHasRecord.has(pr.material_number)) return;
    prByMaterial.set(pr.material_number, (prByMaterial.get(pr.material_number) || 0) + 1);
  });

  const poByMaterial = new Map<string, typeof poRecords>();
  poRecords.forEach(po => {
    if (!po.material_number || !mrpHasRecord.has(po.material_number)) return;
    const list = poByMaterial.get(po.material_number) || [];
    list.push(po);
    poByMaterial.set(po.material_number, list);
  });

  // 可用库存汇总（按综合配置中的有效仓库过滤，null 表示不过滤）
  const validWarehouses = navigationConfigService.getValidWarehouses();
  const availableInvMap = new Map<string, number>();
  inventoryRecords.forEach(inv => {
    if (validWarehouses && !validWarehouses.has(inv.warehouse)) return;
    const prev = availableInvMap.get(inv.material_code) || 0;
    availableInvMap.set(inv.material_code, prev + (inv.available_inventory_qty || 0));
  });

  // 在途订单量：基于全量PO（按物料编码查询），统计 qty - actqty > 0 的未完全入库部分
  // 使用 allMatPORecords 而非 poRecords（精确链），确保跨采购批次的在途量都被纳入
  const inTransitMap = new Map<string, number>();
  allMatPORecords.forEach(po => {
    if (!po.material_number) return;
    const inTransit = (po.qty || 0) - (po.actqty || 0);
    if (inTransit > 0) {
      inTransitMap.set(po.material_number, (inTransitMap.get(po.material_number) || 0) + inTransit);
    }
  });
  console.log(`[GanttService] 在途订单汇总（全量PO基准）: ${inTransitMap.size} 个物料有在途量`);

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
  const productStandardLeadtime = productMat
    ? parseFloat(productMat.product_fixedleadtime) || 0
    : 0;

  const endDate = new Date(productionEnd);
  // 产品行倒排：startDate = demandEnd - 生产固定提前期
  const startDate = new Date(endDate);
  startDate.setDate(startDate.getDate() - productStandardLeadtime);

  // L0 产品层
  const root: GanttBar = {
    materialCode: productCode,
    materialName: productMat?.material_name || productCode,
    bomLevel: 0,
    parentCode: null,
    startDate,
    endDate,
    leadtime: productStandardLeadtime,
    standardLeadtime: productStandardLeadtime,
    materialType: '自制',
    status: 'on_time',
    hasShortage: false,
    shortageQuantity: 0,
    supplyStatus: 'sufficient',  // 产品根节点默认满足
    poStatus: 'not_applicable',
    prStatus: 'not_applicable',
    hasMRP: mrpHasRecord.has(productCode),
    availableInventoryQty: availableInvMap.get(productCode),
    inTransitQty: inTransitMap.get(productCode) ?? 0,
    mrpDetails: mrpDetailMap.get(productCode) || [],
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

  const MAX_NODES = 5000; // 安全上限，防止异常数据导致内存溢出
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

      // MRP 明细 + 汇总（v4.2: 按单呈现）
      const details = mrpDetailMap.get(bomItem.material_code) || [];
      const summary = mrpSummaryMap.get(bomItem.material_code);
      const demand = summary?.totalDemand ?? 0;
      const hasMRP = mrpHasRecord.has(bomItem.material_code);

      // 标准交期时长（物料固有属性，不因库存/MRP/PO状态改变）
      const standardLeadtime = isExternal
        ? parseFloat(mat?.purchase_fixedleadtime || '0')
        : parseFloat(mat?.product_fixedleadtime || '0');

      // 倒排核心：子件结束 = 父级开始 - 1天
      const childEnd = new Date(parentBar.startDate);
      childEnd.setDate(childEnd.getDate() - 1);

      // 甘特条长度：库存满足 → 1天（已就绪），库存不足 → 标准交期
      // 注意：倒排阶段 grossRequirement 尚未计算，用 hasMRP + supply 简化判断
      //   hasMRP = true → ERP MRP 运算产生了净需求，即库存不满足
      //   hasMRP = false && supply > 0 → 无 MRP 需求记录且有库存，即满足
      const supply = (availableInvMap.get(bomItem.material_code) ?? 0)
                   + (inTransitMap.get(bomItem.material_code) ?? 0);
      const isFulfilled = !hasMRP && supply > 0;
      const ganttLeadtime = isFulfilled ? 1 : Math.max(standardLeadtime, 1);

      const childStart = new Date(childEnd);
      childStart.setDate(childStart.getDate() - ganttLeadtime);
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
        leadtime: ganttLeadtime,
        standardLeadtime,
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
        inTransitQty: inTransitMap.get(bomItem.material_code) ?? 0,
        dropStatusTitle: summary?.dropStatusTitle,
        bizdropqty: summary?.totalDropQty,
        mrpDetails: details,
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

  // v4.2: 筛选自制件 MRP 单号（materialattr_title=自制），供生产工单精确关联
  const selfMadeMrpRecords = mrpRecords
    .filter(m => m.materialattr_title === '自制' || m.materialattr_title === 'SelfMade');
  const selfMadeMrpBillnos = selfMadeMrpRecords.map(m => m.billno).filter(Boolean);
  const selfMadeMrpDroptimeMap: Record<string, string> = {};
  selfMadeMrpRecords.forEach(m => { if (m.billno) selfMadeMrpDroptimeMap[m.billno] = m.droptime || ''; });
  console.log(`[GanttService] 自制件 MRP 单号: ${selfMadeMrpBillnos.length} 个`);

  // 无论是否有MRP，始终执行BOM展开库存评估，并基于结果重算状态
  if (plannedDemandQty != null && plannedDemandQty > 0) {
    console.log(`[GanttService] 执行BOM展开库存评估: plannedDemandQty=${plannedDemandQty}, confirmedNoMRP=${confirmedNoMRP}`);
    calcBomNetRequirements(root, plannedDemandQty, bomRecords, availableInvMap, inTransitMap);
    // 基于动态净需求重算状态（覆盖 BFS 阶段的初步状态）
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    recalcStatusFromBOM(root, false, today);
    // BFS 阶段用 supply>0 简化判断可能误将"有在途但量不足"的物料标为 leadtime=1
    // BOM 展开后 canFulfillByInventory 已精确计算，用它修正甘特条长度
    correctLeadtimesAfterBOMExpansion([root]);
    const allBars = flattenGanttBars([root]);
    const shortageNodes = allBars.filter(b => b.hasShortage);
    console.log(`[GanttService] BOM展开+状态重算完成: ${shortageNodes.length} 个物料有缺口（共 ${allBars.length} 个节点）`);
  }

  console.log(`[GanttService] 甘特图构建完成，共 ${nodeCount} 个节点（BOM位置），唯一物料 ${new Set(flattenGanttBars([root]).map(b => b.materialCode)).size - 1} 种（不含根）`);
  console.log(`[GanttService] 降级状态: MRP=${degradation.mrp}, PR=${degradation.pr}, PO=${degradation.po}`);
  return { bars: [root], degradation, inventoryRecords, selfMadeMrpBillnos, selfMadeMrpDroptimeMap };
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

/** 交期分析中的延迟物料条目 */
export interface DelayItem {
  bar: GanttBar;
  /** 延迟类型：A=排不下（无PO，倒排开始已过），B=PO超期 */
  type: 'A' | 'B';
  /** 延迟天数 */
  delayDays: number;
  /** 预计到货日 */
  estimatedArrival: string;
  /** 延迟原因（人类可读） */
  reason: string;
}

export interface GanttSummary {
  /** 用户填写的生产计划开始日 */
  planStart: string;
  /** 用户填写的生产计划结束日 */
  planEnd: string;
  /** 倒排后实际最早需要开始的日期（所有物料 startDate 最小值） */
  actualEarliestStart: Date;
  /** 计划周期天数（planStart ~ planEnd） */
  planDays: number;
  /** BOM物料总数（bomLevel > 0 的唯一物料编码数） */
  totalMaterials: number;
  /** 缺料数（hasShortage === true 的唯一物料编码数） */
  shortageCount: number;

  // ── 交期分析 ──
  /** A类延迟物料：排不下（倒排开始已过、无PO、库存不满足） */
  delayTypeA: DelayItem[];
  /** B类延迟物料：PO超期（有PO、PO到货日 > 倒排结束日） */
  delayTypeB: DelayItem[];
  /** 产品级最大延迟天数（BOM树中所有延迟的最大值） */
  maxDelayDays: number;
  /** 产品预计交付日（= planEnd + maxDelayDays） */
  estimatedDeliveryDate: string;
  /** 是否能按计划交付（maxDelayDays === 0） */
  canDeliverOnTime: boolean;

  // ── 向后兼容（供现有 SummaryCard 使用） ──
  overdueItems: GanttBar[];
  pastDueItems: GanttBar[];
  abnormalCount: number;
  totalDays: number;
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

  // 按唯一物料编码统计
  const uniqueMaterialCodes = new Set(materials.map(b => b.materialCode));
  const totalMaterials = uniqueMaterialCodes.size;
  const shortageCodes = new Set(materials.filter(b => b.hasShortage).map(b => b.materialCode));
  const shortageCount = shortageCodes.size;

  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  // ── 交期分析 ──

  // A类：排不下（倒排开始已过、无PO、库存不满足）
  // 按 materialCode 去重，保留延迟最大的节点
  const typeAMap = new Map<string, DelayItem>();
  for (const b of materials) {
    const isExternal = b.materialType === '外购' || b.materialType === '委外';
    if (!isExternal) continue;
    if (b.startDate >= today) continue;       // 还没过期
    if (b.poStatus === 'has_po') continue;    // 已有PO
    if (b.canFulfillByInventory) continue;    // 库存满足

    const arrival = new Date(today);
    arrival.setDate(arrival.getDate() + b.standardLeadtime);
    const delayDays = Math.max(0, Math.ceil((arrival.getTime() - b.endDate.getTime()) / 86400000));
    if (delayDays <= 0) continue;

    const pastDays = Math.ceil((today.getTime() - b.startDate.getTime()) / 86400000);
    const item: DelayItem = {
      bar: b,
      type: 'A',
      delayDays,
      estimatedArrival: fmt(arrival),
      reason: `应在 ${fmt(b.startDate)} 开始采购（已过 ${pastDays} 天），标准交期 ${b.standardLeadtime} 天，今天下单最早 ${fmt(arrival)} 到货`,
    };

    const existing = typeAMap.get(b.materialCode);
    if (!existing || delayDays > existing.delayDays) {
      typeAMap.set(b.materialCode, item);
    }
  }
  const delayTypeA = [...typeAMap.values()].sort((a, b) => b.delayDays - a.delayDays);

  // B类：PO超期（有PO、PO到货日 > 倒排结束日）
  // 按 materialCode 去重，保留延迟最大的节点
  const typeBMap = new Map<string, DelayItem>();
  for (const b of materials) {
    if (b.poStatus !== 'has_po' || !b.poDeliverDate) continue;
    if (b.canFulfillByInventory) continue;

    const poDate = new Date(b.poDeliverDate);
    poDate.setHours(0, 0, 0, 0);
    const delayDays = Math.ceil((poDate.getTime() - b.endDate.getTime()) / 86400000);
    if (delayDays <= 0) continue;

    const item: DelayItem = {
      bar: b,
      type: 'B',
      delayDays,
      estimatedArrival: b.poDeliverDate,
      reason: `PO到货日 ${b.poDeliverDate} 晚于计划到位日 ${fmt(b.endDate)}，超期 ${delayDays} 天`,
    };

    const existing = typeBMap.get(b.materialCode);
    if (!existing || delayDays > existing.delayDays) {
      typeBMap.set(b.materialCode, item);
    }
  }
  const delayTypeB = [...typeBMap.values()].sort((a, b) => b.delayDays - a.delayDays);

  // 产品级最大延迟
  const allDelays = [...delayTypeA, ...delayTypeB];
  const maxDelayDays = allDelays.length > 0 ? Math.max(...allDelays.map(d => d.delayDays)) : 0;
  const estimatedDelivery = new Date(planEndDate);
  estimatedDelivery.setDate(estimatedDelivery.getDate() + maxDelayDays);

  // 向后兼容
  const overdueItems = delayTypeB.map(d => d.bar);
  const pastDueItems = delayTypeA.map(d => d.bar);
  const abnormalCodes = new Set([
    ...delayTypeA.map(d => d.bar.materialCode),
    ...delayTypeB.map(d => d.bar.materialCode),
  ]);

  return {
    planStart: productionStart,
    planEnd: productionEnd,
    actualEarliestStart,
    planDays,
    totalDays,
    totalMaterials,
    shortageCount,
    delayTypeA,
    delayTypeB,
    maxDelayDays,
    estimatedDeliveryDate: fmt(estimatedDelivery),
    canDeliverOnTime: maxDelayDays === 0,
    overdueItems,
    pastDueItems,
    abnormalCount: abnormalCodes.size,
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
      ` | 标准交期：${bar.standardLeadtime}天 | 倒排：${bar.leadtime}天` +
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

/**
 * 状态判定（简化版）：
 *
 * hasMRP = true  → 仅根据倒排开始时间（childStart）判定：
 *   daysToStart > 3   → on_time（正常）
 *   0 < daysToStart ≤ 3 → risk（提醒）
 *   daysToStart ≤ 0   → anomaly（异常）
 *
 * hasMRP = false → ready（物料满足，绿色进度）
 *
 * BOM展开净需求仅用于 Tooltip 显示，不影响状态判定。
 */
function recalcStatusFromBOM(bar: GanttBar, _parentSatisfied: boolean, today: Date): void {
  if (!bar.hasMRP) {
    // 无MRP：按净需求判断，而非无条件清零
    // netRequirement 已由 calcBomNetRequirements 计算（库存不足时 > 0）
    const net = bar.netRequirement ?? 0;
    bar.hasShortage = net > 0;
    bar.shortageQuantity = net;
    if (net > 0) {
      // 有缺口：库存不足，标为异常
      bar.supplyStatus = 'anomaly';
      bar.status = 'anomaly';
    } else {
      // 无缺口：库存满足
      bar.supplyStatus = 'sufficient_no_mrp';
      bar.status = 'ready';
    }
  } else {
    const daysToStart = Math.ceil((bar.startDate.getTime() - today.getTime()) / 86400000);
    if (daysToStart > 3) {
      bar.status = 'on_time';
    } else if (daysToStart > 0) {
      bar.status = 'risk';
    } else {
      bar.status = 'anomaly';
    }
    bar.supplyStatus = 'shortage';
    bar.hasShortage = (bar.netRequirement ?? 0) > 0;
    bar.shortageQuantity = bar.netRequirement ?? 0;
  }

  for (const child of bar.children) recalcStatusFromBOM(child, false, today);
}

/**
 * 修正 BFS 阶段因"有在途但量不足"被误设为 leadtime=1 的甘特条
 *
 * BFS 阶段用 isFulfilled = !hasMRP && (available + inTransit) > 0 做简化判断，
 * 只要有任何库存/在途就将 ganttLeadtime 设为 1 天。
 * BOM 展开后 canFulfillByInventory = (netRequirement === 0) 才是精确的数量感知判断。
 * 当两者矛盾时（canFulfillByInventory=false 但 leadtime=1），用 standardLeadtime 修正。
 */
function correctLeadtimesAfterBOMExpansion(bars: GanttBar[]): void {
  const flat = flattenGanttBars(bars);
  let corrected = 0;
  for (const bar of flat) {
    if (bar.bomLevel === 0) continue; // 跳过根节点
    if (bar.canFulfillByInventory === false && bar.leadtime === 1) {
      const correctLeadtime = Math.max(bar.standardLeadtime, 1);
      bar.leadtime = correctLeadtime;
      // 保持 endDate（父级开工约束）不变，往前推 correctLeadtime 天重算 startDate
      const newStart = new Date(bar.endDate);
      newStart.setDate(newStart.getDate() - correctLeadtime);
      bar.startDate = newStart;
      corrected++;
    }
  }
  if (corrected > 0) {
    console.log(`[GanttService] correctLeadtimes: 修正 ${corrected} 个节点（BOM展开后库存不足，恢复标准交期）`);
  }
}

/**
 * BOM展开动态净需求计算
 * 动态净需求 = max(0, 毛需求 - 可用库存 - 在途订单量)
 * 在途订单量 = PO 中未入库部分（qty - actqty > 0）
 */
function calcBomNetRequirements(
  root: GanttBar,
  plannedDemandQty: number,
  bomRecords: BOMRecord[],
  availableInvMap: Map<string, number>,
  inTransitMap: Map<string, number>,
): void {
  const usageMap = new Map<string, number>();
  bomRecords.forEach(b => {
    const key = `${b.parent_material_code || root.materialCode}>${b.material_code}`;
    usageMap.set(key, b.standard_usage);
  });

  root.grossRequirement = plannedDemandQty;
  const rootInv = availableInvMap.get(root.materialCode) ?? 0;
  const rootInTransit = inTransitMap.get(root.materialCode) ?? 0;
  root.inTransitQty = rootInTransit;
  root.netRequirement = Math.max(0, plannedDemandQty - rootInv - rootInTransit);
  root.bomShortageQty = root.netRequirement;
  root.canFulfillByInventory = root.netRequirement === 0;

  const queue: GanttBar[] = [root];
  while (queue.length > 0) {
    const parent = queue.shift()!;
    for (const child of parent.children) {
      const usageKey = `${parent.materialCode}>${child.materialCode}`;
      const usage = usageMap.get(usageKey) ?? (() => {
        console.warn(`[GanttService] BOM用量缺失: ${usageKey}，默认按 1 计算`);
        return 1;
      })();
      // grossRequirement = 父层毛需求 × BOM用量（不扣库存，反映真实需求量）
      // netRequirement = max(0, 毛需求 - 可用库存 - 在途量)
      const gross = (parent.grossRequirement ?? 0) * usage;
      const inv = availableInvMap.get(child.materialCode) ?? 0;
      const inTransit = inTransitMap.get(child.materialCode) ?? 0;
      child.inTransitQty = inTransit;
      const net = Math.max(0, gross - inv - inTransit);
      child.grossRequirement = gross;
      child.netRequirement = net;
      child.bomShortageQty = net;
      child.canFulfillByInventory = net === 0;
      queue.push(child);
    }
  }
}

/**
 * 诊断工具：追踪 预测单→MRP→PR→PO 完整链路
 * 用法（浏览器 console）：
 *   import('/src/services/ganttService.ts').then(m => m.diagnoseLinkChain('YCD2026022800000048', '130-000218'))
 */
export async function diagnoseLinkChain(
  forecastBillno: string,
  materialCode?: string,
): Promise<void> {
  const log = (tag: string, ...args: any[]) => console.log(`%c[诊断] ${tag}`, 'color: #e11d48; font-weight: bold', ...args);

  // ── Step 1: 预测单 → MRP ──
  log('Step 1', `查询 MRP: rootdemandbillno = "${forecastBillno}"`);
  const mrpResult = await planningV2DataService.loadMRPByBillnos([forecastBillno], '');
  const allMrp = mrpResult.allMrpRecords ?? mrpResult.data;
  log('Step 1 结果', `全量 MRP ${allMrp.length} 条, 活跃 ${mrpResult.data.length} 条`);

  // 按物料分组
  const mrpByMat = new Map<string, typeof allMrp>();
  allMrp.forEach(m => {
    const code = m.materialplanid_number;
    if (!code) return;
    const list = mrpByMat.get(code) || [];
    list.push(m);
    mrpByMat.set(code, list);
  });
  log('Step 1 物料', `${mrpByMat.size} 个唯一物料:`, [...mrpByMat.keys()].sort());
  // 列出每个物料的 MRP 概况
  console.table([...mrpByMat.entries()].map(([code, records]) => ({
    物料编码: code,
    MRP条数: records.length,
    MRP单号: records.map(r => r.billno).join(', '),
    关闭状态: records.map(r => r.closestatus_title).join(', '),
    投放状态: records.map(r => r.dropstatus_title).join(', '),
  })));

  // 如果指定了物料，聚焦显示
  const targetMrp = materialCode ? mrpByMat.get(materialCode) : undefined;
  if (materialCode) {
    if (targetMrp && targetMrp.length > 0) {
      log('Step 1 目标物料', `${materialCode} 有 ${targetMrp.length} 条 MRP:`);
      targetMrp.forEach(m => {
        console.table({
          MRP单号: m.billno,
          物料: m.materialplanid_number,
          需求量: m.bizorderqty || m.adviseorderqty,
          投放状态: m.dropstatus_title,
          投放数量: m.bizdropqty,
          关闭状态: m.closestatus_title,
          根需求单号: m.rootdemandbillno,
        });
      });
    } else {
      log('Step 1 ⚠️', `物料 ${materialCode} 在预测单 ${forecastBillno} 的 MRP 中未找到！`);
      log('Step 1 ⚠️', `实际找到的物料:`, [...mrpByMat.keys()].sort());
      return;
    }
  }

  // ── Step 2: MRP → PR ──
  const targetMrpBillnos = targetMrp
    ? targetMrp.map(m => m.billno).filter(Boolean)
    : allMrp.map(m => m.billno).filter(Boolean);
  log('Step 2', `查询 PR: srcbillnumber in [${targetMrpBillnos.length} 个MRP单号]`, targetMrpBillnos);

  const prResult = await planningV2DataService.loadPRByMRPBillnos(targetMrpBillnos, '2020-01-01');
  const prRecords = prResult.data;
  log('Step 2 结果', `PR ${prRecords.length} 条`);

  if (prRecords.length > 0) {
    prRecords.forEach(pr => {
      console.table({
        PR单号: pr.billno,
        物料: pr.material_number,
        数量: pr.qty,
        来源MRP: pr.srcbillnumber,
        业务时间: pr.biztime,
        审批日期: pr.auditdate,
      });
    });
  } else {
    log('Step 2 ⚠️', `无 PR 记录！可能原因:`);
    log('Step 2 ⚠️', `  1. PR.srcbillnumber 字段存的不是 MRP.billno`);
    log('Step 2 ⚠️', `  2. MRP 尚未投放生成 PR`);
    log('Step 2 ⚠️', `  3. PR 的 srcbillnumber 可能是 MRP 的其他标识字段`);

    // 用物料编码兜底查一下 PR，看看到底有没有
    if (materialCode) {
      log('Step 2 兜底', `按物料编码 ${materialCode} 直接查 PR...`);
      const prByMat = await planningV2DataService.loadPRByMaterials([materialCode]);
      log('Step 2 兜底结果', `按物料查到 ${prByMat.length} 条 PR:`);
      prByMat.forEach(pr => {
        console.table({
          PR单号: pr.billno,
          物料: pr.material_number,
          数量: pr.qty,
          来源单号_srcbillnumber: pr.srcbillnumber,
          业务时间: pr.biztime,
        });
      });
      if (prByMat.length > 0) {
        log('Step 2 ⚠️ 关键发现', `物料 ${materialCode} 有 PR，但 PR.srcbillnumber 不在 MRP billnos 中！`);
        log('Step 2 ⚠️', `PR.srcbillnumber 值:`, prByMat.map(pr => pr.srcbillnumber));
        log('Step 2 ⚠️', `MRP.billno 值:`, targetMrpBillnos);
        log('Step 2 ⚠️', `说明 PR.srcbillnumber 存的不是 MRP.billno，链路断裂！`);
      }
    }
  }

  // ── Step 3: PR → PO ──
  const prBillnos = prRecords.map(pr => pr.billno).filter(Boolean);
  if (prBillnos.length > 0) {
    log('Step 3', `查询 PO: srcbillnumber in [${prBillnos.length} 个PR单号]`, prBillnos);
    const poResult = await planningV2DataService.loadPOByPRBillnos(prBillnos, '2020-01-01');
    const poRecords = poResult.data;
    log('Step 3 结果', `PO ${poRecords.length} 条`);
    poRecords.forEach(po => {
      console.table({
        PO单号: po.billno,
        物料: po.material_number,
        数量: po.qty,
        来源PR: po.srcbillnumber,
        交货日: po.deliverdate,
        供应商: po.supplier_name,
        已入库: po.actqty,
      });
    });

    if (poRecords.length === 0 && materialCode) {
      log('Step 3 兜底', `按物料编码 ${materialCode} 直接查 PO...`);
      const poByMat = await planningV2DataService.loadPOByMaterials([materialCode]);
      log('Step 3 兜底结果', `按物料查到 ${poByMat.length} 条 PO:`);
      poByMat.forEach(po => {
        console.table({
          PO单号: po.billno,
          物料: po.material_number,
          数量: po.qty,
          来源单号_srcbillnumber: po.srcbillnumber,
          交货日: po.deliverdate,
        });
      });
      if (poByMat.length > 0) {
        log('Step 3 ⚠️', `PO.srcbillnumber 值:`, poByMat.map(po => po.srcbillnumber));
        log('Step 3 ⚠️', `PR.billno 值:`, prBillnos);
      }
    }
  } else if (materialCode) {
    // PR 为空但直接查 PO
    log('Step 3', `PR 为空，按物料编码 ${materialCode} 直接查 PO...`);
    const poByMat = await planningV2DataService.loadPOByMaterials([materialCode]);
    log('Step 3 结果', `按物料查到 ${poByMat.length} 条 PO:`);
    poByMat.forEach(po => {
      console.table({
        PO单号: po.billno,
        物料: po.material_number,
        数量: po.qty,
        来源单号_srcbillnumber: po.srcbillnumber,
        交货日: po.deliverdate,
        供应商: po.supplier_name,
      });
    });
  }

  log('完成', '链路诊断结束');
}

export const ganttService = {
  buildGanttData,
  flattenGanttBars,
  getGanttTimeRange,
  getGanttSummary,
  exportGanttAsMarkdown,
  diagnoseLinkChain,
};

// ══════════════════════════════════════════════════════════════════════════════
// 齐套倒排与交期分析规则
// ══════════════════════════════════════════════════════════════════════════════
//
// 一、齐套倒排（计划视角）
//
//   目标：按 BOM 层级从交付日往前推算，确定每个物料最晚到位时间
//
//   L0 产品层:
//     endDate   = 需求截止时间（demandEnd）
//     startDate = endDate - product_fixedleadtime（生产固定提前期）
//
//   子件层（BFS 逐层展开）:
//     childEnd   = parentBar.startDate - 1天（子件必须在父级开工前就绪）
//     childStart = childEnd - ganttLeadtime
//
//   标准交期时长（standardLeadtime）— 物料固有属性:
//     外购 / 委外 → purchase_fixedleadtime（采购固定提前期）
//     自制        → product_fixedleadtime（生产固定提前期）
//     不做任何兜底，ERP 数据为 0 则如实记录 0
//
//   甘特条长度（ganttLeadtime → leadtime 字段）:
//     【BFS 阶段简化判断】
//     !hasMRP && supply > 0（supply = available + inTransit）→ 1天（暂定已就绪）
//     otherwise → max(standardLeadtime, 1)
//
//     【BOM展开后精确修正 — correctLeadtimesAfterBOMExpansion】
//     calcBomNetRequirements 计算 canFulfillByInventory = (netRequirement === 0)
//     条件：canFulfillByInventory === false && leadtime === 1
//       → leadtime = max(standardLeadtime, 1)
//       → startDate = endDate - leadtime（endDate 不变）
//     典型案例：有在途但量不足（如 200 在途 / 12000 需求），
//              BFS 误判为满足(1天)，BOM展开后修正为标准交期(126天)
//
// 二、交期分析（现状视角）
//
//   目标：对比计划与现状，判断产品能否按时交付
//
//   A类延迟 — 排不下的物料:
//     条件: 倒排开始日 < 今天 且 无PO 且 库存不满足
//     延迟天数 = (今天 + standardLeadtime) - childEnd
//     含义: 今天下单，按标准交期，最早到货日仍晚于计划到位日
//
//   B类延迟 — PO超期的物料:
//     条件: 有PO 且 poDeliverDate > childEnd
//     延迟天数 = poDeliverDate - childEnd
//     含义: 供应商承诺的到货日晚于计划要求的到位日
//
//   产品级延迟:
//     maxDelayDays = 所有延迟物料中延迟天数的最大值
//     预计交付日 = planEnd + maxDelayDays
//     延迟沿 BOM 向上传导，瓶颈物料决定产品交付
//
// 三、PO 到货时间不参与倒排
//
//   甘特图是计划视角，PO 是现状视角，两者不混淆
//   PO 超期通过交期分析的 B 类延迟标识
//   supplyStatusService 的 deadline_risk 状态也用于标色
//
// ══════════════════════════════════════════════════════════════════════════════
