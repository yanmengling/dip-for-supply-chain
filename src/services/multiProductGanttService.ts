// src/services/multiProductGanttService.ts

import { buildGanttData, flattenGanttBars } from './ganttService';
import { planningV2DataService, loadMaterialsByCode, loadInventoryByMaterials, loadPOByMaterials } from './planningV2DataService';
import type { GanttBar, BOMRecord, PORecord, InventoryRecord } from '../types/planningV2';
import type {
  MultiProductTask,
  MultiProductItem,
  MultiProductGanttResult,
  MultiProductGanttEntry,
  SharedMaterial,
  SharedMaterialProduct,
  AllocationSuggestion,
} from '../types/multiProductTask';

/**
 * 并行构建大预测单下所有产品的甘特图，并分析共用物料。
 * 实时调用（不缓存结果），与产品监测任务详情页行为一致。
 */
export async function buildMultiProductGanttData(
  task: MultiProductTask,
): Promise<MultiProductGanttResult> {
  const { products, forecastBillno } = task;

  console.log(`[MultiProductGanttService] 开始构建 ${products.length} 个产品的甘特图, billno=${forecastBillno}`);
  performance.mark('mpg:start');

  // 0. 预热缓存（一次性批量加载所有产品 BOM 涉及的物料主数据、库存、外购件PO）
  // 这样后续并行构建甘特图时，各产品的数据查询全部命中缓存，不再重复请求 API
  performance.mark('mpg:prewarm:start');
  const allBoms = await Promise.all(
    products.map(p => planningV2DataService.loadBOMByProduct(p.productCode).catch(() => [] as BOMRecord[]))
  );
  const allMaterialCodes = new Set<string>();
  for (let i = 0; i < products.length; i++) {
    allMaterialCodes.add(products[i].productCode);
    for (const r of allBoms[i]) {
      allMaterialCodes.add(r.material_code);
      if (r.parent_material_code) allMaterialCodes.add(r.parent_material_code);
    }
  }
  const allCodeList = Array.from(allMaterialCodes);

  // 物料主数据、库存、PO 三路并行查询（PO 直接用全部编码，自制件无 PO 记录不影响结果）
  const tPW = performance.now();
  const [allMaterials, preloadedInventoryRecords, preloadedAllMatPORecords] = await Promise.all([
    loadMaterialsByCode(allCodeList).then(r => { performance.measure(`[Perf] 0.5a. 物料主数据预热`, { start: tPW, duration: Math.round(performance.now() - tPW) }); return r; }),
    loadInventoryByMaterials(allCodeList).then(r => { performance.measure(`[Perf] 0.5b. 库存预热`, { start: tPW, duration: Math.round(performance.now() - tPW) }); return r; }),
    loadPOByMaterials(allCodeList).catch(() => [] as PORecord[]).then(r => { performance.measure(`[Perf] 0.5c. PO预热`, { start: tPW, duration: Math.round(performance.now() - tPW) }); return r; }),
  ]);

  const allExternalCodes = allMaterials
    .filter(m => m.materialattr === '外购' || m.materialattr === '委外')
    .map(m => m.material_code);
  console.log(`[MultiProductGanttService] 外购/委外物料: ${allExternalCodes.length} 个编码, PO 预热: ${preloadedAllMatPORecords.length} 条`);

  performance.mark('mpg:prewarm:end');
  performance.measure(`[Perf] 0.5. 物料/库存/PO缓存预热 (${allCodeList.length} 个编码, ${allExternalCodes.length} 个外购件)`, 'mpg:prewarm:start', 'mpg:prewarm:end');

  // 1. 并行为每个产品构建甘特图（BOM/物料主数据/库存均已预热，不再重复查 API）
  performance.mark('mpg:gantt:start');
  const entries = await Promise.all(
    products.map(p => buildSingleProductGantt(p, forecastBillno, preloadedAllMatPORecords))
  );
  performance.mark('mpg:gantt:end');
  performance.measure(`[Perf] 1. 甘特图构建 (${products.length} 个产品)`, 'mpg:gantt:start', 'mpg:gantt:end');

  const productGantts = new Map<string, MultiProductGanttEntry>();
  for (const entry of entries) {
    productGantts.set(entry.productCode, entry);
  }

  // 1.5 跨产品净需求重算：合计所有产品对每个物料的毛需求，扣减一次库存，得到真实净需求
  // 解决问题：各产品独立计算时，库存被重复计用（每个产品都独享了全部库存）
  performance.mark('mpg:recalc:start');
  recalcMultiProductNetRequirements(products, productGantts, allBoms, preloadedInventoryRecords, preloadedAllMatPORecords);
  performance.mark('mpg:recalc:end');
  performance.measure(`[Perf] 1.5. 跨产品净需求重算`, 'mpg:recalc:start', 'mpg:recalc:end');

  // 2. 组装 BOM 映射（BOM 已在步骤0预热，此处直接使用缓存结果，无额外 API 调用）
  performance.mark('mpg:bom:start');
  const bomByProduct = new Map<string, BOMRecord[]>();
  for (let i = 0; i < products.length; i++) {
    bomByProduct.set(products[i].productCode, allBoms[i]);
  }
  performance.mark('mpg:bom:end');
  performance.measure(`[Perf] 2. BOM 映射组装 (${products.length} 个产品, 已从预热缓存复用)`, 'mpg:bom:start', 'mpg:bom:end');

  // 3. 识别共用物料并计算折算需求
  performance.mark('mpg:shared:start');
  const { sharedMaterials, exclusiveMaterialCodes } = analyzeSharedMaterials(
    products,
    bomByProduct,
    productGantts,
  );
  performance.mark('mpg:shared:end');
  performance.measure(`[Perf] 3. 共用物料分析 (${sharedMaterials.size} 个共用物料)`, 'mpg:shared:start', 'mpg:shared:end');

  performance.mark('mpg:end');
  performance.measure(`[Perf] 0. 总加载耗时`, 'mpg:start', 'mpg:end');

  return { productGantts, sharedMaterials, exclusiveMaterialCodes };
}

async function buildSingleProductGantt(
  product: MultiProductItem,
  forecastBillno: string,
  preloadedAllMatPORecords?: PORecord[],
): Promise<MultiProductGanttEntry> {
  const t0 = performance.now();
  try {
    const result = await buildGanttData(
      product.productCode,
      product.startDate,      // productionStart = 预测开始日
      product.endDate,        // productionEnd = 交货截止日（倒排锚点）
      [forecastBillno],       // forecastBillnos
      product.startDate,      // demandStart
      product.qty,            // plannedDemandQty
      preloadedAllMatPORecords,
    );
    const elapsed = (performance.now() - t0).toFixed(0);
    console.log(`[Perf] 单产品甘特图 ${product.productCode} 耗时 ${elapsed}ms, bars=${result.bars.length}`);
    return {
      productCode: product.productCode,
      productName: product.productName,
      qty: product.qty,
      endDate: product.endDate,
      bars: result.bars,
      loaded: true,
      selfMadeMrpBillnos: result.selfMadeMrpBillnos,
      selfMadeMrpDroptimeMap: result.selfMadeMrpDroptimeMap,
    };
  } catch (err) {
    console.error(`[MultiProductGanttService] 产品 ${product.productCode} 甘特图构建失败:`, err);
    return {
      productCode: product.productCode,
      productName: product.productName,
      qty: product.qty,
      endDate: product.endDate,
      bars: [],
      loaded: false,
      errorMsg: err instanceof Error ? err.message : String(err),
      selfMadeMrpBillnos: [],
      selfMadeMrpDroptimeMap: {},
    };
  }
}

function analyzeSharedMaterials(
  products: MultiProductItem[],
  bomByProduct: Map<string, BOMRecord[]>,
  productGantts: Map<string, MultiProductGanttEntry>,
): { sharedMaterials: Map<string, SharedMaterial>; exclusiveMaterialCodes: Set<string> } {
  // 1. 统计每个物料编码出现在哪些产品的 BOM 中（仅主料 alt_priority == 0）
  const materialToProducts = new Map<string, Set<string>>();
  // 存储每个物料的基本信息（名称）
  const materialNames = new Map<string, string>();

  for (const [productCode, bomRecords] of bomByProduct.entries()) {
    const mainMaterials = bomRecords.filter(
      r => (r.alt_priority ?? 0) === 0
    );
    for (const r of mainMaterials) {
      if (!materialToProducts.has(r.material_code)) {
        materialToProducts.set(r.material_code, new Set());
        materialNames.set(r.material_code, r.material_name);
      }
      materialToProducts.get(r.material_code)!.add(productCode);
    }
  }

  const sharedMaterials = new Map<string, SharedMaterial>();
  const exclusiveMaterialCodes = new Set<string>();

  for (const [materialCode, productCodes] of materialToProducts.entries()) {
    // 独占物料（只属于1个产品）也生成关联产品面板，只是 relatedProducts 只有1条
    if (productCodes.size < 2) {
      exclusiveMaterialCodes.add(materialCode);
    }

    // 计算各产品的折算需求量（共用物料和独占物料均处理）
    const relatedProducts: SharedMaterialProduct[] = [];

    for (const productCode of productCodes) {
      const product = products.find(p => p.productCode === productCode);
      if (!product) continue;

      const bomRecords = bomByProduct.get(productCode) ?? [];
      const { requiredQty, bomPath, bomLevel } = calcBomPathQty(
        productCode,
        materialCode,
        product.qty,
        bomRecords,
      );

      relatedProducts.push({
        productCode,
        productName: product.productName,
        qty: product.qty,
        endDate: product.endDate,
        requiredQty,
        bomPath,
        bomLevel,
      });
    }

    // 3. 按 endDate 升序排列（最早交期排首位 = 倒排基准产品）
    relatedProducts.sort((a, b) => a.endDate.localeCompare(b.endDate));
    const anchorProductCode = relatedProducts[0].productCode;
    const totalRequiredQty = relatedProducts.reduce((sum, p) => sum + p.requiredQty, 0);

    // 4. 从 anchor 产品的甘特图 bar 中提取 MRP 数量和库存信息
    // NOTE: Inventory/MRP is read from the anchor product's bar only (earliest endDate).
    // This is a deliberate simplification — true shared pool accounting would require
    // aggregating across all related products' bars, which is left for a future enhancement.
    let mrpQty: number | null = null;
    let materialType = '';
    let availableInventoryQty = 0;
    let inTransitQty = 0;

    const anchorGantt = productGantts.get(anchorProductCode);
    if (anchorGantt) {
      const bar = flattenBars(anchorGantt.bars).find(b => b.materialCode === materialCode);
      if (bar) {
        materialType = bar.materialType;
        availableInventoryQty = bar.availableInventoryQty ?? 0;
        inTransitQty = bar.inTransitQty ?? 0;
        const totalMrpQty = bar.mrpDetails.reduce((sum, d) => sum + d.demandQty, 0);
        mrpQty = totalMrpQty > 0 ? totalMrpQty : null;
      }
    }

    const qtyDiff = mrpQty !== null ? totalRequiredQty - mrpQty : null;
    const canFulfillAll = (availableInventoryQty + inTransitQty) >= totalRequiredQty;

    // 5. 生成分配建议（库存不足时）
    let allocationSuggestion: AllocationSuggestion | undefined;
    if (!canFulfillAll) {
      allocationSuggestion = buildAllocationSuggestion(
        relatedProducts,
        availableInventoryQty + inTransitQty,
      );
    }

    sharedMaterials.set(materialCode, {
      materialCode,
      materialName: materialNames.get(materialCode) ?? materialCode,
      materialType,
      relatedProducts,
      totalRequiredQty,
      mrpQty,
      qtyDiff,
      anchorProductCode,
      canFulfillAll,
      allocationSuggestion,
    });
  }

  return { sharedMaterials, exclusiveMaterialCodes };
}

/** 按交期优先级建议分配库存（贪心：最早交期优先分配）*/
function buildAllocationSuggestion(
  relatedProducts: SharedMaterialProduct[],  // 已按 endDate 升序
  availableQty: number,
): AllocationSuggestion {
  let remaining = availableQty;
  const allocations = relatedProducts.map(p => {
    const suggestedQty = Math.min(remaining, p.requiredQty);
    remaining = Math.max(0, remaining - suggestedQty);
    return {
      productCode: p.productCode,
      productName: p.productName,
      requiredQty: p.requiredQty,
      suggestedQty,
      canFulfill: suggestedQty >= p.requiredQty,
    };
  });
  return { availableQty, allocations };
}

/**
 * 计算物料在产品 BOM 中的折算需求量和路径描述。
 * 沿 BOM 路径从产品根节点逐层连乘 standard_usage。
 */
function calcBomPathQty(
  productCode: string,
  targetMaterialCode: string,
  productQty: number,
  bomRecords: BOMRecord[],
): { requiredQty: number; bomPath: string; bomLevel: number } {
  // 仅使用主料
  const mainRecords = bomRecords.filter(r => (r.alt_priority ?? 0) === 0);

  // 找到目标物料行（可能有多条路径）
  const targetRows = mainRecords.filter(r => r.material_code === targetMaterialCode);
  if (targetRows.length === 0) {
    return { requiredQty: 0, bomPath: '', bomLevel: 0 };
  }

  // 对每条路径计算用量，取总和
  let totalQty = 0;
  let bomPath = '';
  let bomLevel = 0;

  for (const target of targetRows) {
    const { pathQty, pathDesc, level } = tracePathFromRoot(
      productCode,
      target,
      mainRecords,
      productQty,
    );
    totalQty += pathQty;
    if (!bomPath) {
      bomPath = pathDesc;
      bomLevel = level;
    }
  }

  return { requiredQty: Math.round(totalQty), bomPath, bomLevel };
}

/** 从根产品沿 BOM 路径追踪到目标物料，返回路径连乘用量 */
function tracePathFromRoot(
  productCode: string,
  targetRow: BOMRecord,
  allRecords: BOMRecord[],
  productQty: number,
): { pathQty: number; pathDesc: string; level: number } {
  // 从 targetRow 向上追溯到 productCode
  const path: BOMRecord[] = [targetRow];
  let current = targetRow;

  const MAX_DEPTH = 10;
  for (let i = 0; i < MAX_DEPTH; i++) {
    if (!current.parent_material_code || current.parent_material_code === productCode) break;
    const parent = allRecords.find(r => r.material_code === current.parent_material_code);
    if (!parent) break;
    path.unshift(parent);
    current = parent;
  }

  // 连乘 standard_usage
  let qty = productQty;
  for (const row of path) {
    qty *= (row.standard_usage ?? 1);
  }

  // 构建路径描述："P1 → A002(×2) → M001(×3)"
  const segments = [productCode, ...path.map(r => `${r.material_code}(×${r.standard_usage ?? 1})`)];
  const pathDesc = segments.join(' → ');

  return { pathQty: qty, pathDesc, level: path.length };
}

/** 扁平化 GanttBar 树 */
function flattenBars(bars: GanttBar[]): GanttBar[] {
  const result: GanttBar[] = [];
  const queue = [...bars];
  while (queue.length > 0) {
    const bar = queue.shift()!;
    result.push(bar);
    if (bar.children.length > 0) queue.push(...bar.children);
  }
  return result;
}

/**
 * 跨产品净需求重算（方案B）
 *
 * 问题：各产品独立调用 buildGanttData 时，每个产品都独享全部库存，导致库存被重复计用。
 *
 * 正确算法：BFS 按层处理，从上到下逐层修正——
 *   1. 同一层中，合计所有产品对同一物料的毛需求
 *   2. 扣减一次库存+在途，得到真实总净需求
 *   3. 按毛需求比例分摊净需求到各产品 bar
 *   4. 基于修正后的净需求，重新计算下一层子节点的毛需求（net × usage）
 *   5. 逐层向下，直至叶节点
 *
 * 关键：必须先合并同层物料的需求再向下传播，不能先递归再合并。
 */
function recalcMultiProductNetRequirements(
  _products: MultiProductItem[],
  productGantts: Map<string, MultiProductGanttEntry>,
  allBoms: BOMRecord[][],
  _inventoryRecords: InventoryRecord[],
  _allMatPORecords: PORecord[],
): void {
  // 构建全局 BOM usageMap（parent>child → standard_usage）
  const usageMap = new Map<string, number>();
  for (const bomRecords of allBoms) {
    for (const b of bomRecords) {
      if (b.parent_material_code && b.material_code) {
        const key = `${b.parent_material_code}>${b.material_code}`;
        if (!usageMap.has(key)) usageMap.set(key, b.standard_usage ?? 1);
      }
    }
  }

  // 收集所有产品的根节点（L0），保留 grossRequirement（产品净需求由 buildGanttData 已计算好）
  const rootBars: GanttBar[] = [];
  for (const [, entry] of productGantts) {
    if (!entry.loaded || entry.bars.length === 0) continue;
    const root = entry.bars[0];
    // 根节点（产品本身）是独立 SKU，各自独立扣减，不做跨产品合并
    // grossRequirement 由 buildGanttData 设置，保持不变
    rootBars.push(root);
  }

  // BFS 逐层处理（毛需求传播）：
  // currentLayer = 上一层已设置好 grossRequirement 的 bars
  // 每轮：
  //   Step A: child.grossRequirement = parent.grossRequirement × BOM用量
  //   Step B: 按 materialCode 分组，更新状态
  //   不扣库存，不分摊净需求
  let currentLayer: GanttBar[] = rootBars;

  while (currentLayer.length > 0) {
    const childGroups = new Map<string, GanttBar[]>();

    for (const parentBar of currentLayer) {
      const parentGross = parentBar.grossRequirement ?? 0;

      for (const child of parentBar.children) {
        const usageKey = `${parentBar.materialCode}>${child.materialCode}`;
        const usage = usageMap.get(usageKey) ?? 1;
        child.grossRequirement = parentGross * usage;
        const key = child.materialCode;
        if (!childGroups.has(key)) childGroups.set(key, []);
        childGroups.get(key)!.push(child);
      }
    }

    // Step B：按 materialCode 分组，更新状态（不扣库存，不分摊净需求）
    const nextLayer: GanttBar[] = [];

    for (const [, bars] of childGroups) {
      for (const bar of bars) {
        updateBarStatus(bar);
        nextLayer.push(bar);
      }
    }

    currentLayer = nextLayer;
  }

  // 诊断：打印关键共用物料的重算结果
  for (const [, entry] of productGantts) {
    if (!entry.loaded) continue;
    for (const bar of flattenGanttBars(entry.bars)) {
      if (bar.materialCode === '743-000001' || bar.materialCode === '743-000003') {
        console.log(`[Recalc] ${entry.productCode} → ${bar.materialCode} L${bar.bomLevel}: gross=${bar.grossRequirement} inv=${bar.availableInventoryQty} inTransit=${bar.inTransitQty}`);
      }
    }
  }
  console.log(`[MultiProductGanttService] 跨产品毛需求传播完成`);
}

/** 基于毛需求 vs 可用库存+在途量重算 bar 的 hasShortage / supplyStatus / status */
function updateBarStatus(bar: GanttBar): void {
  const gross = bar.grossRequirement ?? 0;
  const supply = (bar.availableInventoryQty ?? 0) + (bar.inTransitQty ?? 0);
  const shortage = Math.max(0, gross - supply);
  if (bar.hasMRP) {
    bar.hasShortage = shortage > 0;
    bar.shortageQuantity = shortage;
    bar.supplyStatus = 'shortage';
  } else {
    bar.hasShortage = shortage > 0;
    bar.shortageQuantity = shortage;
    bar.supplyStatus = shortage > 0 ? 'anomaly' : 'sufficient_no_mrp';
    bar.status = shortage > 0 ? 'anomaly' : 'ready';
  }
}

export const multiProductGanttService = {
  buildMultiProductGanttData,
};
