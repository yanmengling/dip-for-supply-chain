/**
 * 动态计划协同 V2 - 数据服务
 *
 * 基于 Ontology API 对象加载数据
 * 参考: /docs/PRD_动态计划协同V2.md 和 /docs/HD供应链业务知识网络_v2-3.json
 *
 * v2.9 变更：步骤①数据源改为 product + forecast，废弃 PP 对象
 */

import { ontologyApi } from '../api';
import type { BOMRecord, MaterialRecord, PRRecord, PORecord, InventoryRecord } from '../types/planningV2';

// ============================================================================
// Object Type IDs (对接 HD供应链业务知识网络)
// ============================================================================

const OBJECT_TYPE_IDS = {
    // 产品主数据 (v2.9 新增，替代 PP 作为步骤①产品来源)
    PRODUCT: 'supplychain_hd0202_product',
    // 需求预测 (v2.9 新增，替代 PP 作为步骤①需求数据)
    FORECAST: 'supplychain_hd0202_forecast',
    // 工厂生产计划 - 6条数据
    MPS: 'supplychain_hd0202_mps',
    // 物料需求计划 - 663条数据
    MRP: 'supplychain_hd0202_mrp',
    // BOM - 数百条/产品
    BOM: 'supplychain_hd0202_bom',
    // 物料主数据 - 26339条
    MATERIAL: 'supplychain_hd0202_material',
    // 采购申请 - 32306条
    PR: 'supplychain_hd0202_pr',
    // 采购订单 - 31732条
    PO: 'supplychain_hd0202_po',
    // 库存 - 38608条
    INVENTORY: 'supplychain_hd0202_inventory',
};

// ============================================================================
// API 数据类型定义 (严格匹配 JSON 文件字段)
// ============================================================================

/**
 * 产品主数据 (v2.9，替代 PP 作为步骤①产品列表来源)
 * API 对象: supplychain_hd0202_product
 * 数据源: HD_产品
 * 主键: material_number
 */
export interface ProductAPI {
    /** 产品编码（主键，mapped: material_code） */
    material_number: string;
    /** 产品名称 */
    material_name: string;
}

/**
 * 需求预测 (v2.9，替代 PP 作为步骤①需求数据)
 * API 对象: supplychain_hd0202_forecast
 * 数据源: erp_mds_forecast
 * 主键: billno + material_number
 */
export interface ForecastRecordAPI {
    /** 预测单号（主键之一） */
    billno: string;
    /** 物料编码（产品编码，主键之一） */
    material_number: string;
    /** 物料名称（产成品名称） */
    material_name: string;
    /** 预测交货日期（该产品预测需要交货的日期） */
    startdate: string;
    /** 预测终止日期 */
    enddate: string;
    /** 预测数量 */
    qty: number;
    /** 单据创建时间 */
    bizdate: string;
    /** 创建人 */
    creator_name: string;
    /** 审核日期 */
    auditdate: string;
    /** 审核人 */
    auditor_name: string;
}

/**
 * 产品需求计划 (PP) — 已废弃，v2.9 起不再用于步骤①
 * 保留类型定义供历史数据向后兼容，代码中不再调用 loadProductDemandPlans
 * API 对象: supplychain_hd0202_pp
 * 数据源: product_demand_plan
 * 数据量: 82 条
 */
export interface ProductDemandPlanAPI {
    /** 产品名称 */
    product_name: string;
    /** 产品编码 (主键) */
    product_code: string;
    /** 需求计划时间 - 产品需要完成交付的截止时间 */
    planned_date: string;
    /** 需求数量 */
    planned_demand_quantity: number;
}

/**
 * 工厂生产计划 (MPS)
 * API 对象: supplychain_hd0202_mps
 * 数据源: production_plan
 * 数据量: 6 条
 */
export interface ProductionPlanAPI {
    /** 产品编码 (主键) */
    bom_code: string;
    /** 产品类别 */
    product_category: string;
    /** 生产数量 */
    quantity: number;
    /** 产品名称 */
    product_name: string;
    /** 计划开工时间 */
    planned_start_date: string;
    /** 工单类型 */
    order_type: string;
    /** 生产序号 */
    seq_no: number;
}

/**
 * 物料需求计划 (MRP) - 旧版接口（向后兼容）
 * @deprecated v3.7 Phase B: 使用 MRPPlanOrderAPI 替代
 */
export interface MaterialRequirementPlanAPI {
    finished_product_code: string;
    specification: string;
    component_name: string;
    planned_date: string;
    material_demand_quantity: number;
    main_material: string;
}

/**
 * MRP 计划订单（ERP 新接口，PRD v3.7 Phase B）
 * API 对象: supplychain_hd0202_mrp
 * 数据源: erp_mrp_plan_order
 *
 * 关键字段说明:
 *   - bizorderqty: PMC 修正后的实际需求量（优先使用）
 *   - adviseorderqty: MRP 系统计算的理论需求量（fallback）
 *   - rootdemandbillno: 关联到预测单号，实现全链路溯源
 *   - closestatus_title: 正向筛选 '正常' 或 'A'（v3.6）
 */
export interface MRPPlanOrderAPI {
    /** 需求计划订单单据编号 */
    billno: string;
    /** 物料编码 */
    materialplanid_number: string;
    /** 物料名称 */
    materialplanid_name: string;
    /** 物料属性（自制/委外/外购） */
    materialattr_title: string;
    /** 建议订单数量（MRP 理论值） */
    adviseorderqty: number;
    /** 订单数量（PMC 修正后的实际需求） */
    bizorderqty: number;
    /** 投放数量（确定性的采购数量） */
    bizdropqty: number;
    /** 建议投放时间 */
    advisedroptime: string;
    /** 建议开始时间 */
    advisestartdate: string;
    /** 建议结束时间 */
    adviseenddate: string;
    /** 计划开始日期 */
    startdate: string;
    /** 计划完成日期 */
    enddate: string;
    /** 计划准备日期 */
    orderdate: string;
    /** 可用日期 */
    availabledate: string;
    /** 关闭状态（A:正常, B:关闭, C:拆分关闭, D:合并关闭, E:投放关闭） */
    closestatus_title: string;
    /** 投放状态 */
    dropstatus_title: string;
    /** 投放单据类型 */
    dropbilltype_name: string;
    /** 投放时间 */
    droptime: string;
    /** 根需求单号（关联预测单号） */
    rootdemandbillno: string;
    /** 计划运算单号 */
    planoperatenum: string;
    /** 创建时间 */
    createtime: string;
    /** 创建人 */
    creator_name: string;
}

// ============================================================================
// 缓存管理
// ============================================================================

interface CacheEntry<T> {
    data: T;
    timestamp: number;
}

const cache = new Map<string, CacheEntry<any>>();
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

/** In-Flight 去重：多处并发调用同一 cacheKey 共享同一个 Promise */
const pendingRequests = new Map<string, Promise<any>>();

function getCached<T>(key: string): T | null {
    const entry = cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > CACHE_TTL) {
        cache.delete(key);
        return null;
    }

    return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
    cache.set(key, { data, timestamp: Date.now() });
}

/**
 * 带缓存 + in-flight 去重的通用加载包装器
 * @param cacheKey 缓存键
 * @param loader 实际加载函数（仅在缓存未命中且无 in-flight 请求时调用）
 */
async function withCachedLoader<T>(cacheKey: string, loader: () => Promise<T>): Promise<T> {
    // 1. 命中缓存
    const cached = getCached<T>(cacheKey);
    if (cached) return cached;
    // 2. In-flight 去重
    const pending = pendingRequests.get(cacheKey);
    if (pending) return pending as Promise<T>;
    // 3. 发起新请求
    const promise = loader()
        .then(data => { setCache(cacheKey, data); pendingRequests.delete(cacheKey); return data; })
        .catch(err => { pendingRequests.delete(cacheKey); throw err; });
    pendingRequests.set(cacheKey, promise);
    return promise;
}

/** 批量分片大小 - 避免 in 条件过大导致 API 超时 */
const BATCH_CHUNK_SIZE = 100;

/** 分片并行最大并发数 — 避免 API 限流 */
const CHUNK_CONCURRENCY = 5;

/** 将数组分片 */
function chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}

/**
 * 并行执行分片任务，控制最大并发数。
 * Phase 2b 性能优化：将串行 for...of 改为受控并行。
 */
async function parallelChunks<T>(
    chunks: T[][],
    fn: (chunk: T[]) => Promise<any[]>,
    concurrency = CHUNK_CONCURRENCY,
): Promise<any[]> {
    const allData: any[] = [];
    for (let i = 0; i < chunks.length; i += concurrency) {
        const batch = chunks.slice(i, i + concurrency);
        const results = await Promise.all(batch.map(chunk => fn(chunk)));
        results.forEach(r => allData.push(...r));
    }
    return allData;
}

/**
 * 将日期字符串补全为 OpenSearch 兼容的 datetime 格式。
 * OpenSearch 的 biztime 字段要求 `yyyy-MM-dd HH:mm:ss` 格式，
 * 而前端传入的 demandStart 通常是 `yyyy-MM-dd` 纯日期。
 * BUG-001 修复。
 */
function ensureDatetime(dateStr: string): string {
    if (!dateStr) return dateStr;
    // 已经包含时间部分则原样返回
    if (dateStr.includes(' ') || dateStr.includes('T')) return dateStr;
    return `${dateStr} 00:00:00`;
}

// ============================================================================
// 产品主数据加载 (v2.9，步骤①产品列表来源)
// ============================================================================

/**
 * 全量加载产品主数据（步骤①产品选择列表）
 *
 * 数据溯源:
 *   API 对象: supplychain_hd0202_product（数据视图 HD_产品）
 *   字段: material_number（产品编码），material_name（产品名称）
 *   缓存: product_list，TTL 5min
 */
export async function loadProducts(forceReload = false): Promise<ProductAPI[]> {
    const cacheKey = 'product_list';
    if (forceReload) { cache.delete(cacheKey); pendingRequests.delete(cacheKey); }

    return withCachedLoader(cacheKey, async () => {
        console.log('[PlanningV2DataService] 从 API 加载产品列表...');
        const response = await ontologyApi.queryObjectInstances(OBJECT_TYPE_IDS.PRODUCT, {
            limit: 10000,
            need_total: true,
        });

        const data: ProductAPI[] = response.entries.map((item: any) => ({
            material_number: item.material_number || '',
            material_name: item.material_name || '',
        })).filter((p: ProductAPI) => p.material_number !== '');

        data.sort((a, b) => a.material_number.localeCompare(b.material_number));
        console.log(`[PlanningV2DataService] 产品列表: ${data.length} 条`);
        return data;
    });
}

// ============================================================================
// 需求预测数据加载 (v2.9，步骤①需求数据来源)
// ============================================================================

/**
 * 按产品编码查询需求预测记录（步骤①选产品后自动聚合）
 *
 * 数据溯源:
 *   API 对象: supplychain_hd0202_forecast（数据视图 erp_mds_forecast）
 *   查询条件: material_number == productCode
 *   关键字段: startdate（预测交货日期）, enddate（预测终止日期）, qty（预测数量）
 *   缓存: forecast_{productCode}，TTL 5min
 */
export async function loadForecastByProduct(productCode: string): Promise<ForecastRecordAPI[]> {
    const cacheKey = `forecast_${productCode}`;

    return withCachedLoader(cacheKey, async () => {
        console.log(`[PlanningV2DataService] 加载需求预测: ${productCode}...`);
        const response = await ontologyApi.queryObjectInstances(OBJECT_TYPE_IDS.FORECAST, {
            condition: {
                operation: 'and',
                sub_conditions: [
                    { field: 'material_number', operation: '==', value: productCode }
                ]
            },
            limit: 10000,
            need_total: true,
        });

        const data: ForecastRecordAPI[] = response.entries.map((item: any) => ({
            billno: item.billno || '',
            material_number: item.material_number || '',
            material_name: item.material_name || '',
            startdate: item.startdate || '',
            enddate: item.enddate || '',
            qty: parseFloat(item.qty) || 0,
            bizdate: item.bizdate || '',
            creator_name: item.creator_name || '',
            auditdate: item.auditdate || '',
            auditor_name: item.auditor_name || '',
        }));

        data.sort((a, b) => (a.startdate > b.startdate ? 1 : -1));
        console.log(`[PlanningV2DataService] 需求预测 ${productCode}: ${data.length} 条`);
        return data;
    });
}

// ============================================================================
// 产品需求计划 (PP) 数据加载
// ============================================================================

/**
 * 加载产品需求计划数据
 * @param forceReload 是否强制刷新缓存
 */
export async function loadProductDemandPlans(forceReload: boolean = false): Promise<ProductDemandPlanAPI[]> {
    const cacheKey = 'pp_data';
    if (forceReload) { cache.delete(cacheKey); pendingRequests.delete(cacheKey); }

    return withCachedLoader(cacheKey, async () => {
        console.log('[PlanningV2DataService] 从 API 加载产品需求计划数据...');
        const response = await ontologyApi.queryObjectInstances('supplychain_hd0202_pp', {
            limit: 10000,
            need_total: true,
        });

        const plans: ProductDemandPlanAPI[] = response.entries.map((item: any) => ({
            product_name: item.product_name || '',
            product_code: item.product_code || '',
            planned_date: item.planned_date || '',
            planned_demand_quantity: typeof item.planned_demand_quantity === 'number'
                ? item.planned_demand_quantity
                : parseInt(item.planned_demand_quantity) || 0,
        }));

        console.log(`[PlanningV2DataService] 加载了 ${plans.length} 条产品需求计划`);
        return plans;
    }).catch(error => {
        const knId = ontologyApi.getKnowledgeNetworkId();
        const msg = error instanceof Error ? error.message : String(error);
        if (msg.includes('对象类不存在') || msg.includes('ObjectTypeNotFound')) {
            throw new Error(`当前业务知识网络（${knId}）中不存在对象类型 supplychain_hd0202_pp。若在其它浏览器可正常加载，请在本页面「管理配置」中将业务知识网络改为与其它浏览器一致（如 DIP 供应链业务知识网络）。`);
        }
        throw new Error(`加载产品需求计划失败：${msg}。请确认业务知识网络已选择且包含产品需求计划对象（supplychain_hd0202_pp）。`);
    });
}

/**
 * 按产品编码筛选需求计划
 */
export async function getProductDemandPlansByProduct(productCode: string): Promise<ProductDemandPlanAPI[]> {
    const allPlans = await loadProductDemandPlans();
    return allPlans.filter(p => p.product_code === productCode);
}

/**
 * 获取所有产品列表（去重）
 */
export async function getUniqueProducts(): Promise<{ product_code: string; product_name: string }[]> {
    const allPlans = await loadProductDemandPlans();
    const productMap = new Map<string, string>();

    allPlans.forEach(plan => {
        if (plan.product_code && !productMap.has(plan.product_code)) {
            productMap.set(plan.product_code, plan.product_name);
        }
    });

    return Array.from(productMap.entries()).map(([code, name]) => ({
        product_code: code,
        product_name: name,
    }));
}

/**
 * 获取需求计划统计信息
 */
export async function getProductDemandStats(): Promise<{
    totalProducts: number;
    totalQuantity: number;
    planCount: number;
}> {
    const allPlans = await loadProductDemandPlans();
    const products = await getUniqueProducts();

    return {
        totalProducts: products.length,
        totalQuantity: allPlans.reduce((sum, p) => sum + p.planned_demand_quantity, 0),
        planCount: allPlans.length,
    };
}

// ============================================================================
// 工厂生产计划 (MPS) 数据加载
// ============================================================================

/**
 * 加载工厂生产计划数据
 */
export async function loadProductionPlans(forceReload: boolean = false): Promise<ProductionPlanAPI[]> {
    const cacheKey = 'mps_data';
    if (forceReload) { cache.delete(cacheKey); pendingRequests.delete(cacheKey); }

    return withCachedLoader(cacheKey, async () => {
        console.log('[PlanningV2DataService] 从 API 加载生产计划数据...');
        const response = await ontologyApi.queryObjectInstances(OBJECT_TYPE_IDS.MPS, {
            limit: 10000,
            need_total: true,
            timeout: 120000,
        });

        const plans: ProductionPlanAPI[] = response.entries.map((item: any) => ({
            bom_code: item.bom_code || '',
            product_category: item.product_category || '',
            quantity: typeof item.quantity === 'number'
                ? item.quantity
                : parseInt(item.quantity) || 0,
            product_name: item.product_name || '',
            planned_start_date: item.planned_start_date || '',
            order_type: item.order_type || '',
            seq_no: typeof item.seq_no === 'number'
                ? item.seq_no
                : parseInt(item.seq_no) || 0,
        }));

        plans.sort((a, b) => a.seq_no - b.seq_no);
        console.log(`[PlanningV2DataService] 加载了 ${plans.length} 条生产计划`);
        return plans;
    }).catch(error => {
        console.error('[PlanningV2DataService] 加载生产计划失败:', error);
        return [];
    });
}

// ============================================================================
// 物料需求计划 (MRP) 数据加载
// ============================================================================

/**
 * 加载物料需求计划数据
 */
export async function loadMaterialRequirementPlans(forceReload: boolean = false): Promise<MaterialRequirementPlanAPI[]> {
    const cacheKey = 'mrp_data';
    if (forceReload) { cache.delete(cacheKey); pendingRequests.delete(cacheKey); }

    return withCachedLoader(cacheKey, async () => {
        console.log('[PlanningV2DataService] 从 API 加载物料需求计划数据...');
        const response = await ontologyApi.queryObjectInstances(OBJECT_TYPE_IDS.MRP, {
            limit: 10000,
            need_total: true,
            timeout: 120000,
        });

        const plans: MaterialRequirementPlanAPI[] = response.entries.map((item: any) => ({
            finished_product_code: item.finished_product_code || '',
            specification: item.specification || '',
            component_name: item.component_name || '',
            planned_date: item.planned_date || '',
            material_demand_quantity: typeof item.material_demand_quantity === 'number'
                ? item.material_demand_quantity
                : parseFloat(item.material_demand_quantity) || 0,
            main_material: item.main_material || '',
        }));

        console.log(`[PlanningV2DataService] 加载了 ${plans.length} 条物料需求计划`);
        return plans;
    }).catch(error => {
        console.error('[PlanningV2DataService] 加载物料需求计划失败:', error);
        return [];
    });
}

/**
 * 按产品编码筛选物料需求计划
 */
export async function getMRPByProduct(productCode: string): Promise<MaterialRequirementPlanAPI[]> {
    const allPlans = await loadMaterialRequirementPlans();
    return allPlans.filter(p => p.finished_product_code === productCode);
}

/**
 * 获取缺口物料（净需求 < 0）
 */
export async function getShortfallMaterials(): Promise<MaterialRequirementPlanAPI[]> {
    const allPlans = await loadMaterialRequirementPlans();
    return allPlans.filter(p => p.material_demand_quantity < 0);
}

/**
 * 获取MRP统计信息
 */
export async function getMRPStats(): Promise<{
    totalMaterials: number;
    shortfallCount: number;
    sufficientCount: number;
}> {
    const allPlans = await loadMaterialRequirementPlans();
    const shortfalls = allPlans.filter(p => p.material_demand_quantity < 0);

    return {
        totalMaterials: allPlans.length,
        shortfallCount: shortfalls.length,
        sufficientCount: allPlans.length - shortfalls.length,
    };
}

// ============================================================================
// MRP 精确查询（v3.7 Phase B: B1+B2）
// ============================================================================

/** 降级结果包装 */
export interface DegradedResult<T> {
    data: T;
    isDegraded: boolean;
    /** MRP 精确查询时返回过滤前的全部 billno（含已关闭），供 PR/PO 精确关联用 */
    allMrpBillnos?: string[];
    /** MRP 精确查询时返回过滤前的全部记录（含已关闭），供步骤②展示全部 MRP 用 */
    allMrpRecords?: MRPPlanOrderAPI[];
}

/**
 * 解析 MRP API 原始记录为 MRPPlanOrderAPI
 */
function parseMRPPlanOrder(item: any): MRPPlanOrderAPI {
    return {
        billno: item.billno || '',
        materialplanid_number: item.materialplanid_number || '',
        materialplanid_name: item.materialplanid_name || '',
        materialattr_title: item.materialattr_title || '',
        adviseorderqty: parseFloat(item.adviseorderqty) || 0,
        bizorderqty: parseFloat(item.bizorderqty) || 0,
        bizdropqty: parseFloat(item.bizdropqty) || 0,
        advisedroptime: item.advisedroptime || '',
        advisestartdate: item.advisestartdate || '',
        adviseenddate: item.adviseenddate || '',
        startdate: item.startdate || '',
        enddate: item.enddate || '',
        orderdate: item.orderdate || '',
        availabledate: item.availabledate || '',
        closestatus_title: item.closestatus_title || '',
        dropstatus_title: item.dropstatus_title || '',
        dropbilltype_name: item.dropbilltype_name || '',
        droptime: item.droptime || '',
        rootdemandbillno: item.rootdemandbillno || '',
        planoperatenum: item.planoperatenum || '',
        createtime: item.createtime || '',
        creator_name: item.creator_name || '',
    };
}

/**
 * MRP 正向过滤：仅保留「正常」状态的计划订单（PRD 4.4.4 v3.6）
 */
function filterActiveMRP(records: MRPPlanOrderAPI[]): MRPPlanOrderAPI[] {
    return records.filter(r =>
        r.closestatus_title === '正常' || r.closestatus_title === 'A'
    );
}

/**
 * MRP 取数优先级：优先 bizorderqty，fallback adviseorderqty（PRD 4.4.4）
 */
export function getMRPDemandQty(record: MRPPlanOrderAPI): number {
    return (record.bizorderqty && record.bizorderqty !== 0)
        ? record.bizorderqty
        : record.adviseorderqty;
}

/**
 * 按预测单号精确查询 MRP（PRD 4.4.5 v3.4）
 *
 * 策略1: rootdemandbillno in [billnos]（精确关联）
 * 策略2: 全量加载后按 finished_product_code 过滤（fallback，旧逻辑）
 *
 * 返回: { data, isDegraded }
 *   - isDegraded=false: 精确关联成功
 *   - isDegraded=true: 降级到产品编码过滤
 */
export async function loadMRPByBillnos(
    forecastBillnos: string[],
    productCode: string,
): Promise<DegradedResult<MRPPlanOrderAPI[]>> {
    if (forecastBillnos.length === 0) {
        console.warn('[PlanningV2DataService] loadMRPByBillnos: 无预测单号，直接降级');
        return { data: [], isDegraded: true };
    }

    const sortedBillnos = [...forecastBillnos].sort();
    const cacheKey = `mrp_precise_${sortedBillnos.join(',')}`;

    // 策略1: 精确关联
    const preciseResult = await withCachedLoader(cacheKey, async () => {
        console.log(`[PlanningV2DataService] MRP 精确查询: rootdemandbillno in [${forecastBillnos.length} 个单号]`, forecastBillnos);
        const chunks = chunkArray(forecastBillnos, BATCH_CHUNK_SIZE);
        // Phase 2b: 分片并行化
        const allData: MRPPlanOrderAPI[] = await parallelChunks(chunks, async (chunk) => {
            const response = await ontologyApi.queryObjectInstances(OBJECT_TYPE_IDS.MRP, {
                condition: {
                    operation: 'and',
                    sub_conditions: [
                        { field: 'rootdemandbillno', operation: 'in', value: chunk }
                    ]
                },
                limit: 10000,
                need_total: true,
                timeout: 120000,
            });
            console.log(`[PlanningV2DataService] MRP 精确查询 API 响应: entries=${response.entries?.length}, total=${(response as any).total_count ?? 'N/A'}`);
            if (response.entries?.length > 0) {
                console.log(`[PlanningV2DataService] MRP 首条记录 rootdemandbillno="${response.entries[0].rootdemandbillno}"`, response.entries[0]);
            }
            return response.entries.map((item: any) => parseMRPPlanOrder(item));
        });

        console.log(`[PlanningV2DataService] MRP 精确查询: ${allData.length} 条（过滤前）`);
        return allData;
    }).catch(error => {
        console.error('[PlanningV2DataService] MRP 精确查询失败:', error);
        return [] as MRPPlanOrderAPI[];
    });

    // 精确关联有结果 → 正向过滤后返回
    if (preciseResult.length > 0) {
        const allBillnos = preciseResult.map(r => r.billno).filter(Boolean);
        const filtered = filterActiveMRP(preciseResult);
        console.log(`[PlanningV2DataService] MRP 精确查询结果: ${preciseResult.length} 条 → 正向过滤后 ${filtered.length} 条，全部billno ${allBillnos.length} 个`);
        return { data: filtered, isDegraded: false, allMrpBillnos: allBillnos, allMrpRecords: preciseResult };
    }

    // 策略2: 降级到产品编码全量加载
    console.warn(`[PlanningV2DataService] MRP 精确查询无结果，降级到 productCode=${productCode} 全量查询`);
    const fallbackCacheKey = `mrp_fallback_${productCode}`;
    const fallbackResult = await withCachedLoader(fallbackCacheKey, async () => {
        const response = await ontologyApi.queryObjectInstances(OBJECT_TYPE_IDS.MRP, {
            limit: 10000,
            need_total: true,
            timeout: 120000,
        });
        return response.entries.map((item: any) => parseMRPPlanOrder(item));
    }).catch(error => {
        console.error('[PlanningV2DataService] MRP fallback 查询失败:', error);
        return [] as MRPPlanOrderAPI[];
    });

    // 按 materialplanid_number 的产品编码不好过滤（MRP 是物料级别，不是产品级别）
    // fallback 使用旧 finished_product_code 逻辑（兼容旧数据视图字段）
    // 注：如果新 API 没有 finished_product_code，则返回全部并让 ganttService 通过 BOM 过滤
    const filtered = filterActiveMRP(fallbackResult);
    console.log(`[PlanningV2DataService] MRP fallback: ${fallbackResult.length} 条 → 正向过滤后 ${filtered.length} 条`);
    return { data: filtered, isDegraded: true };
}

// ============================================================================
// PR 精确关联（v3.7 Phase B: B3）
// ============================================================================

/**
 * 按 MRP 单号精确查询 PR（PRD 1.6.2）
 *
 * 策略1: srcbillnumber in [mrpBillnos]（精确关联，PR.srcbillnumber = MRP.billno）
 * 策略2: material_number in [materialCodes] + 前推6个月时间窗口（fallback）
 */
export async function loadPRByMRPBillnos(
    mrpBillnos: string[],
    materialCodes: string[],
    demandStart: string,
): Promise<DegradedResult<PRRecord[]>> {
    if (mrpBillnos.length === 0 && materialCodes.length === 0) {
        return { data: [], isDegraded: true };
    }

    // 策略1: 精确关联（srcbillnumber in [mrpBillnos]，PR.srcbillnumber = MRP.billno）
    if (mrpBillnos.length > 0) {
        const sortedBillnos = [...mrpBillnos].sort();
        const cacheKey = `pr_precise_${sortedBillnos.length}_${sortedBillnos[0]}_${demandStart}`;

        const preciseResult = await withCachedLoader(cacheKey, async () => {
            console.log(`[PlanningV2DataService] PR 精确查询: srcbillnumber in [${mrpBillnos.length} 个MRP单号]`, mrpBillnos);
            const chunks = chunkArray(mrpBillnos, BATCH_CHUNK_SIZE);
            // Phase 2b: 分片并行化
            const allData: PRRecord[] = await parallelChunks(chunks, async (chunk) => {
                const response = await ontologyApi.queryObjectInstances(OBJECT_TYPE_IDS.PR, {
                    condition: {
                        operation: 'and',
                        sub_conditions: [
                            { field: 'srcbillnumber', operation: 'in', value: chunk },
                        ]
                    },
                    limit: 10000,
                    need_total: true,
                    timeout: 120000,
                });
                return response.entries.map((item: any) => parsePRRecord(item));
            });

            console.log(`[PlanningV2DataService] PR 精确查询: ${allData.length} 条`);
            return allData;
        }).catch(error => {
            console.error('[PlanningV2DataService] PR 精确查询失败:', error);
            return [] as PRRecord[];
        });

        // 精确查询链完整（有 MRP billno 可查），无论结果是否为空都不算降级
        // 0 条只是意味着这些 MRP 还没走到 PR 阶段
        return { data: preciseResult, isDegraded: false };
    }

    // 策略2: fallback（无 MRP billno，只能用 material_number 模糊查询）
    if (materialCodes.length === 0) {
        return { data: [], isDegraded: true };
    }

    const sortedCodes = [...materialCodes].sort();
    const fallbackCacheKey = `pr_fallback_${sortedCodes.length}_${sortedCodes[0]}_${demandStart}`;

    const fallbackResult = await withCachedLoader(fallbackCacheKey, async () => {
        // 前推 6 个月：PR 的 biztime 远早于需求交货日期
        const startDate = new Date(demandStart);
        startDate.setMonth(startDate.getMonth() - 6);
        const biztimeFloor = ensureDatetime(startDate.toISOString().slice(0, 10));
        console.log(`[PlanningV2DataService] PR fallback: material_number in [${materialCodes.length}], biztime >= ${biztimeFloor} (demandStart前推6个月)...`);
        const chunks = chunkArray(materialCodes, BATCH_CHUNK_SIZE);
        // Phase 2b: 分片并行化
        const allData: PRRecord[] = await parallelChunks(chunks, async (chunk) => {
            const response = await ontologyApi.queryObjectInstances(OBJECT_TYPE_IDS.PR, {
                condition: {
                    operation: 'and',
                    sub_conditions: [
                        { field: 'material_number', operation: 'in', value: chunk },
                        { field: 'biztime', operation: '>=', value: biztimeFloor },
                    ]
                },
                limit: 10000,
                need_total: true,
                timeout: 120000,
            });
            return response.entries.map((item: any) => parsePRRecord(item));
        });

        console.log(`[PlanningV2DataService] PR fallback: ${allData.length} 条`);
        return allData;
    }).catch(error => {
        console.error('[PlanningV2DataService] PR fallback 查询失败:', error);
        return [] as PRRecord[];
    });

    return { data: fallbackResult, isDegraded: true };
}

/** 解析 PR 记录 */
function parsePRRecord(item: any): PRRecord {
    return {
        billno: item.billno || '',
        material_number: item.material_number || '',
        material_name: item.material_name || '',
        qty: parseFloat(item.qty) || 0,
        biztime: item.biztime || '',
        joinqty: parseFloat(item.joinqty) || 0,
        auditdate: item.auditdate || '',
        org_name: item.org_name || '',
        billtype_name: item.billtype_name || '',
        srcbillnumber: item.srcbillnumber || '',
    };
}

// ============================================================================
// PO 精确关联（v3.7 Phase B: B4）
// ============================================================================

/**
 * 按 PR 单号精确查询 PO（PRD 1.6.2）
 *
 * 策略1: srcbillnumber in [prBillnos]（精确关联，PO.srcbillnumber = PR.billno）
 * 策略2: material_number in [materialCodes] + biztime >= demandStart（fallback）
 */
export async function loadPOByPRBillnos(
    prBillnos: string[],
    materialCodes: string[],
    demandStart: string,
): Promise<DegradedResult<PORecord[]>> {
    if (prBillnos.length === 0 && materialCodes.length === 0) {
        return { data: [], isDegraded: true };
    }

    // 策略1: 精确关联（srcbillnumber in [prBillnos]，PO.srcbillnumber = PR.billno）
    if (prBillnos.length > 0) {
        const sortedBillnos = [...prBillnos].sort();
        const cacheKey = `po_precise_${sortedBillnos.length}_${sortedBillnos[0]}_${demandStart}`;

        const preciseResult = await withCachedLoader(cacheKey, async () => {
            // 精确关联已通过 srcbillnumber 锁定单据，不再用 biztime 过滤
            console.log(`[PlanningV2DataService] PO 精确查询: srcbillnumber in [${prBillnos.length} 个PR单号]`, prBillnos.slice(0, 5));
            const chunks = chunkArray(prBillnos, BATCH_CHUNK_SIZE);
            // Phase 2b: 分片并行化
            const allData: PORecord[] = await parallelChunks(chunks, async (chunk) => {
                const response = await ontologyApi.queryObjectInstances(OBJECT_TYPE_IDS.PO, {
                    condition: {
                        operation: 'and',
                        sub_conditions: [
                            { field: 'srcbillnumber', operation: 'in', value: chunk },
                        ]
                    },
                    limit: 10000,
                    need_total: true,
                    timeout: 120000,
                });
                return response.entries.map((item: any) => parsePORecord(item));
            });

            console.log(`[PlanningV2DataService] PO 精确查询: ${allData.length} 条`);
            return allData;
        }).catch(error => {
            console.error('[PlanningV2DataService] PO 精确查询失败:', error);
            return [] as PORecord[];
        });

        // 精确查询链完整（有 PR billno 可查），无论结果是否为空都不算降级
        // 0 条只是意味着这些 PR 还没走到 PO 阶段
        return { data: preciseResult, isDegraded: false };
    }

    // 策略2: fallback（无 PR billno，只能用 material_number 模糊查询）
    if (materialCodes.length === 0) {
        return { data: [], isDegraded: true };
    }

    const sortedCodes = [...materialCodes].sort();
    const fallbackCacheKey = `po_fallback_${sortedCodes.length}_${sortedCodes[0]}_${demandStart}`;

    const fallbackResult = await withCachedLoader(fallbackCacheKey, async () => {
        // 前推 6 个月：PO 的 biztime 远早于需求交货日期
        const startDate = new Date(demandStart);
        startDate.setMonth(startDate.getMonth() - 6);
        const biztimeFloor = startDate.toISOString().slice(0, 10); // PO biztime 使用 strict_date 格式(yyyy-MM-dd)
        console.log(`[PlanningV2DataService] PO fallback: material_number in [${materialCodes.length}], biztime >= ${biztimeFloor} (demandStart前推6个月)...`);
        const chunks = chunkArray(materialCodes, BATCH_CHUNK_SIZE);
        // Phase 2b: 分片并行化
        const allData: PORecord[] = await parallelChunks(chunks, async (chunk) => {
            const response = await ontologyApi.queryObjectInstances(OBJECT_TYPE_IDS.PO, {
                condition: {
                    operation: 'and',
                    sub_conditions: [
                        { field: 'material_number', operation: 'in', value: chunk },
                        { field: 'biztime', operation: '>=', value: biztimeFloor },
                    ]
                },
                limit: 10000,
                need_total: true,
                timeout: 120000,
            });
            return response.entries.map((item: any) => parsePORecord(item));
        });

        console.log(`[PlanningV2DataService] PO fallback: ${allData.length} 条`);
        return allData;
    }).catch(error => {
        console.error('[PlanningV2DataService] PO fallback 查询失败:', error);
        return [] as PORecord[];
    });

    return { data: fallbackResult, isDegraded: true };
}

/** 解析 PO 记录 */
function parsePORecord(item: any): PORecord {
    return {
        billno: item.billno || '',
        material_number: item.material_number || '',
        material_name: item.material_name || '',
        qty: parseFloat(item.qty) || 0,
        biztime: item.biztime || '',
        deliverdate: item.deliverdate || '',
        supplier_name: item.supplier_name || '',
        operatorname: item.operatorname || '',
        srcbillnumber: item.srcbillnumber || '',
        actqty: parseFloat(item.actqty) || 0,
    };
}

// ============================================================================
// BOM 数据加载
// ============================================================================

/**
 * 按产品编码查询 BOM 数据（仅主料、最新版本）
 *
 * 查询策略（两步精确查询）：
 *   Step 1: 用 bom_material_code 查询少量数据（limit=1），获取最新 bom_version
 *   Step 2: 用 bom_material_code + bom_version + alt_priority=0 三条件精确查询
 *
 * 数据量对比（以 943-000003 为例）：
 *   旧方案（全版本）: 14,504 条 → limit 截断到 10,000 → 客户端过滤 → 271 条（数据丢失！）
 *   新方案（精确查询）: 直接返回 392 条，无截断风险
 */
export async function loadBOMByProduct(productCode: string): Promise<BOMRecord[]> {
    const cacheKey = `bom_${productCode}`;

    return withCachedLoader(cacheKey, async () => {
        console.log(`[PlanningV2DataService] 加载 BOM 数据: ${productCode}...`);

        // Step 1: 获取最新 bom_version（只查 1 条，取版本号即可）
        const versionResp = await ontologyApi.queryObjectInstances(OBJECT_TYPE_IDS.BOM, {
            condition: {
                operation: 'and',
                sub_conditions: [
                    { field: 'bom_material_code', operation: '==', value: productCode },
                ]
            },
            limit: 100,
            need_total: false,
            timeout: 120000,
        });
        const versionEntries = versionResp.entries || [];
        const allVersions = [...new Set(versionEntries.map((r: any) => r.bom_version || ''))].sort();
        console.log(`[PlanningV2DataService] BOM ${productCode}: Step1 返回 ${versionEntries.length} 条, 版本列表: ${allVersions.join(', ')}`);
        const latestVersion = versionEntries.reduce(
            (max: string, r: any) => ((r.bom_version || '') > max ? (r.bom_version || '') : max), ''
        );

        if (!latestVersion) {
            console.warn(`[PlanningV2DataService] BOM ${productCode}: 未找到任何版本`);
            return [];
        }
        console.log(`[PlanningV2DataService] BOM ${productCode}: 最新版本 "${latestVersion}"`);

        // Step 2: 精确查询 = bom_material_code + bom_version + alt_priority=0
        const response = await ontologyApi.queryObjectInstances(OBJECT_TYPE_IDS.BOM, {
            condition: {
                operation: 'and',
                sub_conditions: [
                    { field: 'bom_material_code', operation: '==', value: productCode },
                    { field: 'bom_version', operation: '==', value: latestVersion },
                    { field: 'alt_priority', operation: '==', value: 0 },
                ]
            },
            limit: 10000,
            need_total: true,
            timeout: 120000,
        });

        console.log(`[PlanningV2DataService] BOM ${productCode}: API 返回 ${response.entries?.length ?? 0} 条, total=${(response as any).total ?? 'N/A'}`);

        // PRD D2: BOM 字段容错解析
        const data: BOMRecord[] = response.entries.map((item: any) => {
            const altPriority = item.alt_priority != null ? parseInt(item.alt_priority) : 0;
            return {
                bom_material_code: item.bom_material_code || '',
                material_code: item.material_code || '',
                material_name: item.material_name || '',
                parent_material_code: item.parent_material_code || '',
                bom_level: parseInt(item.bom_level) || 1,
                standard_usage: parseFloat(item.standard_usage) || 0,
                bom_version: item.bom_version || '',
                alt_part: item.alt_part || '',
                alt_priority: isNaN(altPriority) ? 0 : altPriority,
                alt_method: item.alt_method || '',
                alt_group_no: item.alt_group_no || '',
            };
        }).filter(item => {
            // 容错：跳过缺少关键字段的记录
            if (!item.material_code) {
                console.warn(`[PlanningV2DataService] BOM 跳过缺少 material_code 的记录`);
                return false;
            }
            return true;
        });

        // 从根节点做可达性遍历，只保留能从产品根节点到达的 BOM 记录
        // 排除替代料（alt_priority>0 已被 API 过滤）的残留子级（parent 指向替代料编码）
        const childMap = new Map<string, typeof data>();
        for (const r of data) {
            const parent = r.parent_material_code || productCode;
            const list = childMap.get(parent) || [];
            list.push(r);
            childMap.set(parent, list);
        }

        const reachable: BOMRecord[] = [];
        const queue = [productCode];
        const visited = new Set<string>();
        visited.add(productCode);
        while (queue.length > 0) {
            const parentCode = queue.shift()!;
            const children = childMap.get(parentCode) || [];
            for (const child of children) {
                reachable.push(child);
                if (!visited.has(child.material_code)) {
                    visited.add(child.material_code);
                    queue.push(child.material_code);
                }
            }
        }

        if (reachable.length < data.length) {
            console.warn(`[PlanningV2DataService] BOM ${productCode}: 过滤了 ${data.length - reachable.length} 条不可达记录（替代料残留子级）`);
        }
        console.log(`[PlanningV2DataService] BOM ${productCode}: 版本 "${latestVersion}" 主料 ${reachable.length} 条`);
        return reachable;
    });
    // 注意：BOM 加载失败直接抛出，让调用方感知失败
}

/**
 * 加载指定产品 BOM 中的替代料记录（alt_priority > 0）
 * 用于步骤② MRP 面板展示替代料信息
 *
 * 逻辑：查询同产品 + 同版本，不限 alt_priority，
 * 然后筛出 alt_method="替代" 且 alt_priority>0 的记录
 */
export async function loadBOMSubstitutes(productCode: string): Promise<BOMRecord[]> {
    const cacheKey = `bom_subs_${productCode}`;

    return withCachedLoader(cacheKey, async () => {
        console.log(`[PlanningV2DataService] 加载 BOM 替代料: ${productCode}...`);

        // Step 1: 获取最新 bom_version（复用同逻辑）
        const versionResp = await ontologyApi.queryObjectInstances(OBJECT_TYPE_IDS.BOM, {
            condition: {
                operation: 'and',
                sub_conditions: [
                    { field: 'bom_material_code', operation: '==', value: productCode },
                ]
            },
            limit: 100,
            need_total: false,
            timeout: 120000,
        });
        const latestVersion = (versionResp.entries || []).reduce(
            (max: string, r: any) => ((r.bom_version || '') > max ? (r.bom_version || '') : max), ''
        );
        if (!latestVersion) return [];

        // Step 2: 查询全部记录（不限 alt_priority），筛选替代料
        const response = await ontologyApi.queryObjectInstances(OBJECT_TYPE_IDS.BOM, {
            condition: {
                operation: 'and',
                sub_conditions: [
                    { field: 'bom_material_code', operation: '==', value: productCode },
                    { field: 'bom_version', operation: '==', value: latestVersion },
                ]
            },
            limit: 10000,
            need_total: true,
            timeout: 120000,
        });

        const allRecords: BOMRecord[] = (response.entries || []).map((item: any) => {
            const altPriority = item.alt_priority != null ? parseInt(item.alt_priority) : 0;
            return {
                bom_material_code: item.bom_material_code || '',
                material_code: item.material_code || '',
                material_name: item.material_name || '',
                parent_material_code: item.parent_material_code || '',
                bom_level: parseInt(item.bom_level) || 1,
                standard_usage: parseFloat(item.standard_usage) || 0,
                bom_version: item.bom_version || '',
                alt_part: item.alt_part || '',
                alt_priority: isNaN(altPriority) ? 0 : altPriority,
                alt_method: item.alt_method || '',
                alt_group_no: item.alt_group_no || '',
            };
        }).filter((item: BOMRecord) => !!item.material_code);

        console.log(`[PlanningV2DataService] BOM ${productCode} 替代料: 全部 ${allRecords.length} 条`);
        return allRecords;
    }).catch(error => {
        console.error('[PlanningV2DataService] 加载 BOM 替代料失败:', error);
        return [];
    });
}

// ============================================================================
// 物料主数据加载
// ============================================================================

/**
 * 按物料编码列表批量查询物料主数据（自动分片，避免 in 条件过大）
 */
export async function loadMaterialsByCode(codes: string[]): Promise<MaterialRecord[]> {
    if (codes.length === 0) return [];

    const sortedCodes = [...codes].sort();
    const cacheKey = `material_${sortedCodes.length}_${sortedCodes[0]}_${sortedCodes[sortedCodes.length - 1]}`;

    return withCachedLoader(cacheKey, async () => {
        console.log(`[PlanningV2DataService] 加载物料主数据: ${codes.length} 个编码...`);
        const chunks = chunkArray(codes, BATCH_CHUNK_SIZE);
        console.log(`[PlanningV2DataService] 物料主数据分 ${chunks.length} 批查询`);

        // Phase 2b: 分片并行化
        const allData: MaterialRecord[] = await parallelChunks(chunks, async (chunk) => {
            const response = await ontologyApi.queryObjectInstances(OBJECT_TYPE_IDS.MATERIAL, {
                condition: {
                    operation: 'and',
                    sub_conditions: [
                        { field: 'material_code', operation: 'in', value: chunk }
                    ]
                },
                limit: 10000,
                need_total: true,
                timeout: 120000,
            });
            return response.entries.map((item: any) => ({
                material_code: item.material_code || '',
                material_name: item.material_name || '',
                materialattr: item.materialattr || '',
                purchase_fixedleadtime: item.purchase_fixedleadtime || '0',
                product_fixedleadtime: item.product_fixedleadtime || '0',
            }));
        });

        console.log(`[PlanningV2DataService] 物料主数据: ${allData.length} 条`);
        return allData;
    }).catch(error => {
        console.error('[PlanningV2DataService] 加载物料主数据失败:', error);
        return [];
    });
}

// ============================================================================
// PR 采购申请数据加载
// ============================================================================

/**
 * 按物料编码列表查询采购申请（自动分片）
 */
export async function loadPRByMaterials(materialCodes: string[]): Promise<PRRecord[]> {
    if (materialCodes.length === 0) return [];

    const sortedCodes = [...materialCodes].sort();
    const cacheKey = `pr_${sortedCodes.length}_${sortedCodes[0]}_${sortedCodes[sortedCodes.length - 1]}`;

    return withCachedLoader(cacheKey, async () => {
        console.log(`[PlanningV2DataService] 加载 PR 数据: ${materialCodes.length} 个物料...`);
        const chunks = chunkArray(materialCodes, BATCH_CHUNK_SIZE);
        console.log(`[PlanningV2DataService] PR 分 ${chunks.length} 批查询`);

        // Phase 2b: 分片并行化
        const allData: PRRecord[] = await parallelChunks(chunks, async (chunk) => {
            const response = await ontologyApi.queryObjectInstances(OBJECT_TYPE_IDS.PR, {
                condition: {
                    operation: 'and',
                    sub_conditions: [
                        { field: 'material_number', operation: 'in', value: chunk }
                    ]
                },
                limit: 10000,
                need_total: true,
                timeout: 120000,
            });
            return response.entries.map((item: any) => ({
                billno: item.billno || '',
                material_number: item.material_number || '',
                material_name: item.material_name || '',
                qty: parseFloat(item.qty) || 0,
                biztime: item.biztime || '',
                joinqty: parseFloat(item.joinqty) || 0,
                auditdate: item.auditdate || '',
                org_name: item.org_name || '',
                billtype_name: item.billtype_name || '',
            }));
        });

        console.log(`[PlanningV2DataService] PR: ${allData.length} 条`);
        return allData;
    }).catch(error => {
        console.error('[PlanningV2DataService] 加载 PR 失败:', error);
        return [];
    });
}

// ============================================================================
// PO 采购订单数据加载
// ============================================================================

/**
 * 按物料编码列表查询采购订单（自动分片）
 */
export async function loadPOByMaterials(materialCodes: string[]): Promise<PORecord[]> {
    if (materialCodes.length === 0) return [];

    const sortedCodes = [...materialCodes].sort();
    const cacheKey = `po_${sortedCodes.length}_${sortedCodes[0]}_${sortedCodes[sortedCodes.length - 1]}`;

    return withCachedLoader(cacheKey, async () => {
        console.log(`[PlanningV2DataService] 加载 PO 数据: ${materialCodes.length} 个物料...`);
        const chunks = chunkArray(materialCodes, BATCH_CHUNK_SIZE);
        console.log(`[PlanningV2DataService] PO 分 ${chunks.length} 批查询`);

        // Phase 2b: 分片并行化
        const allData: PORecord[] = await parallelChunks(chunks, async (chunk) => {
            const response = await ontologyApi.queryObjectInstances(OBJECT_TYPE_IDS.PO, {
                condition: {
                    operation: 'and',
                    sub_conditions: [
                        { field: 'material_number', operation: 'in', value: chunk }
                    ]
                },
                limit: 10000,
                need_total: true,
                timeout: 120000,
            });
            return response.entries.map((item: any) => ({
                billno: item.billno || '',
                material_number: item.material_number || '',
                material_name: item.material_name || '',
                qty: parseFloat(item.qty) || 0,
                biztime: item.biztime || '',
                deliverdate: item.deliverdate || '',
                supplier_name: item.supplier_name || '',
                operatorname: item.operatorname || '',
                srcbillnumber: item.srcbillnumber || '',
                actqty: parseFloat(item.actqty) || 0,
            }));
        });

        console.log(`[PlanningV2DataService] PO: ${allData.length} 条`);
        return allData;
    }).catch(error => {
        console.error('[PlanningV2DataService] 加载 PO 失败:', error);
        return [];
    });
}

// ============================================================================
// 库存数据加载
// ============================================================================

/**
 * 按物料编码列表查询库存记录（自动分片）
 *
 * 数据溯源:
 *   API 对象: supplychain_hd0202_inventory (38608条)
 *   查询条件: material_code in [codes]
 *   分片: 50个/批，串行执行
 */
export async function loadInventoryByMaterials(materialCodes: string[]): Promise<InventoryRecord[]> {
    if (materialCodes.length === 0) return [];

    const sortedCodes = [...materialCodes].sort();
    const cacheKey = `inv_${sortedCodes.length}_${sortedCodes[0]}_${sortedCodes[sortedCodes.length - 1]}`;

    return withCachedLoader(cacheKey, async () => {
        console.log(`[PlanningV2DataService] 加载库存数据: ${materialCodes.length} 个物料...`);
        const chunks = chunkArray(materialCodes, BATCH_CHUNK_SIZE);
        console.log(`[PlanningV2DataService] 库存数据分 ${chunks.length} 批查询`);

        // Phase 2b: 分片并行化（原串行 for...of → 受控并发）
        const allData: InventoryRecord[] = await parallelChunks(chunks, async (chunk) => {
            const response = await ontologyApi.queryObjectInstances(OBJECT_TYPE_IDS.INVENTORY, {
                condition: {
                    operation: 'and',
                    sub_conditions: [
                        { field: 'material_code', operation: 'in', value: chunk }
                    ]
                },
                limit: 10000,
                need_total: true,
                timeout: 120000,
            });
            return response.entries.map((item: any) => ({
                seq_no: parseInt(item.seq_no) || 0,
                material_code: item.material_code || '',
                material_name: item.material_name || '',
                inventory_qty: parseFloat(item.inventory_qty) || 0,
                available_inventory_qty: parseFloat(item.available_inventory_qty) || 0,
                reserved_inventory_qty: parseFloat(item.reserved_inventory_qty) || 0,
                inbound_date: item.inbound_date || '',
                warehouse: item.warehouse || '',
                stock_status: item.stock_status || '',
                stock_type: item.stock_type || '',
                batch_no: item.batch_no || '',
                purchase_qty: parseFloat(item.purchase_qty) || 0,
            }));
        });

        console.log(`[PlanningV2DataService] 库存数据: ${allData.length} 条`);
        return allData;
    }).catch(error => {
        console.error('[PlanningV2DataService] 加载库存数据失败:', error);
        return [];
    });
}

// ============================================================================
// MPS 精确关联（v3.7 Phase B: B7）
// ============================================================================

/**
 * MPS 生产工单 ERP 接口（PRD 5.1.5）
 */
export interface MPSWorkOrderAPI {
    /** 工单编号 */
    billno: string;
    /** 产品编码 */
    material_number: string;
    /** 产品名称 */
    material_name: string;
    /** 生产数量 */
    qty: number;
    /** 计划开工时间 */
    planstartdate: string;
    /** 计划完工时间 */
    planfinishdate: string;
    /** 实际开工时间 */
    actualstartdate: string;
    /** 实际完工时间 */
    actualfinishdate: string;
    /** 合格入库数 */
    stockinqty: number;
    /** 任务状态 */
    taskstatus_title: string;
    /** 领料状态 */
    pickstatus_title: string;
    /** 来源单据编号（关联预测单号） */
    sourcebillnumber: string;
    /** 来源单据类型 */
    sourcebilltype: string;
}

/**
 * 按预测单号精确查询生产工单（PRD 5.1.5）
 *
 * 策略1: sourcebillnumber in [billnos]（精确关联）
 * 策略2: material_number == productCode（fallback）
 */
export async function loadMPSByForecastBillnos(
    forecastBillnos: string[],
    productCode: string,
): Promise<DegradedResult<MPSWorkOrderAPI[]>> {
    // 策略1: 精确关联
    if (forecastBillnos.length > 0) {
        const sortedBillnos = [...forecastBillnos].sort();
        const cacheKey = `mps_precise_${sortedBillnos.join(',')}`;

        const preciseResult = await withCachedLoader(cacheKey, async () => {
            console.log(`[PlanningV2DataService] MPS 精确查询: sourcebillnumber in [${forecastBillnos.length} 个单号]...`);
            const chunks = chunkArray(forecastBillnos, BATCH_CHUNK_SIZE);
            // Phase 2b: 分片并行化
            const allData: MPSWorkOrderAPI[] = await parallelChunks(chunks, async (chunk) => {
                const response = await ontologyApi.queryObjectInstances(OBJECT_TYPE_IDS.MPS, {
                    condition: {
                        operation: 'and',
                        sub_conditions: [
                            { field: 'sourcebillnumber', operation: 'in', value: chunk }
                        ]
                    },
                    limit: 10000,
                    need_total: true,
                    timeout: 120000,
                });
                return response.entries.map((item: any) => parseMPSWorkOrder(item));
            });

            console.log(`[PlanningV2DataService] MPS 精确查询: ${allData.length} 条`);
            return allData;
        }).catch(error => {
            console.error('[PlanningV2DataService] MPS 精确查询失败:', error);
            return [] as MPSWorkOrderAPI[];
        });

        if (preciseResult.length > 0) {
            return { data: preciseResult, isDegraded: false };
        }
        console.warn('[PlanningV2DataService] MPS 精确查询无结果，降级到 material_number 查询');
    }

    // 策略2: fallback（material_number == productCode）
    const fallbackCacheKey = `mps_fallback_${productCode}`;
    const fallbackResult = await withCachedLoader(fallbackCacheKey, async () => {
        console.log(`[PlanningV2DataService] MPS fallback: material_number == ${productCode}...`);
        const response = await ontologyApi.queryObjectInstances(OBJECT_TYPE_IDS.MPS, {
            condition: {
                operation: 'and',
                sub_conditions: [
                    { field: 'material_number', operation: '==', value: productCode }
                ]
            },
            limit: 10000,
            need_total: true,
            timeout: 120000,
        });
        const data = response.entries.map((item: any) => parseMPSWorkOrder(item));
        console.log(`[PlanningV2DataService] MPS fallback: ${data.length} 条`);
        return data;
    }).catch(error => {
        console.error('[PlanningV2DataService] MPS fallback 查询失败:', error);
        return [] as MPSWorkOrderAPI[];
    });

    return { data: fallbackResult, isDegraded: true };
}

/** 解析 MPS 工单记录 */
function parseMPSWorkOrder(item: any): MPSWorkOrderAPI {
    return {
        billno: item.billno || '',
        material_number: item.material_number || '',
        material_name: item.material_name || '',
        qty: parseFloat(item.qty) || 0,
        planstartdate: item.planstartdate || '',
        planfinishdate: item.planfinishdate || '',
        actualstartdate: item.actualstartdate || '',
        actualfinishdate: item.actualfinishdate || '',
        stockinqty: parseFloat(item.stockinqty) || 0,
        taskstatus_title: item.taskstatus_title || '',
        pickstatus_title: item.pickstatus_title || '',
        sourcebillnumber: item.sourcebillnumber || '',
        sourcebilltype: item.sourcebilltype || '',
    };
}

// ============================================================================
// 清除缓存
// ============================================================================

export function clearPlanningV2Cache(): void {
    cache.clear();
    pendingRequests.clear();
    console.log('[PlanningV2DataService] 缓存已清除');
}

// ============================================================================
// 导出服务对象
// ============================================================================

export const planningV2DataService = {
    // Product (v2.9，步骤①)
    loadProducts,
    // Forecast (v2.9，步骤①)
    loadForecastByProduct,
    // PP（已废弃，保留供内部其他逻辑向后兼容）
    loadProductDemandPlans,
    getProductDemandPlansByProduct,
    getUniqueProducts,
    getProductDemandStats,
    // MPS（旧接口）
    loadProductionPlans,
    // MPS 精确关联（v3.7 Phase B: B7）
    loadMPSByForecastBillnos,
    // MRP（旧接口，向后兼容）
    loadMaterialRequirementPlans,
    getMRPByProduct,
    getShortfallMaterials,
    getMRPStats,
    // MRP 精确查询（v3.7 Phase B: B1+B2）
    loadMRPByBillnos,
    getMRPDemandQty,
    // BOM
    loadBOMByProduct,
    loadBOMSubstitutes,
    // Material
    loadMaterialsByCode,
    // PR（旧接口，向后兼容）
    loadPRByMaterials,
    // PR 精确关联（v3.7 Phase B: B3）
    loadPRByMRPBillnos,
    // PO（旧接口，向后兼容）
    loadPOByMaterials,
    // PO 精确关联（v3.7 Phase B: B4）
    loadPOByPRBillnos,
    // Inventory
    loadInventoryByMaterials,
    // Cache
    clearCache: clearPlanningV2Cache,
};
