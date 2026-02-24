/**
 * 动态计划协同 V2 - 数据服务
 *
 * 基于 Ontology API 对象加载 PP/MPS/MRP 数据
 * 参考: /docs/PRD_动态计划协同V2.md 和 /docs/HD供应链业务知识网络_v2.json
 */

import { ontologyApi } from '../api';

// ============================================================================
// Object Type IDs (对接 HD供应链业务知识网络)
// ============================================================================

const OBJECT_TYPE_IDS = {
    // 产品需求计划 - 82条数据
    PP: 'supplychain_hd0202_pp',
    // 工厂生产计划 - 6条数据
    MPS: 'supplychain_hd0202_mps',
    // 物料需求计划 - 663条数据
    MRP: 'supplychain_hd0202_mrp',
};

// ============================================================================
// API 数据类型定义 (严格匹配 JSON 文件字段)
// ============================================================================

/**
 * 产品需求计划 (PP)
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
 * 物料需求计划 (MRP)
 * API 对象: supplychain_hd0202_mrp
 * 数据源: material_demand_plan
 * 数据量: 663 条
 */
export interface MaterialRequirementPlanAPI {
    /** 成品料号 */
    finished_product_code: string;
    /** 规格 */
    specification: string;
    /** 物料名称 (显示键) */
    component_name: string;
    /** 计划日期 */
    planned_date: string;
    /** 物料净需求 (负数=缺口，正数=满足) */
    material_demand_quantity: number;
    /** 物料编码 (主键) */
    main_material: string;
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

// ============================================================================
// 产品需求计划 (PP) 数据加载
// ============================================================================

/**
 * 加载产品需求计划数据
 * @param forceReload 是否强制刷新缓存
 */
export async function loadProductDemandPlans(forceReload: boolean = false): Promise<ProductDemandPlanAPI[]> {
    const cacheKey = 'pp_data';

    if (!forceReload) {
        const cached = getCached<ProductDemandPlanAPI[]>(cacheKey);
        if (cached) {
            console.log('[PlanningV2DataService] 使用缓存的产品需求计划数据');
            return cached;
        }
    }

    console.log('[PlanningV2DataService] 从 API 加载产品需求计划数据...');

    try {
        const response = await ontologyApi.queryObjectInstances(OBJECT_TYPE_IDS.PP, {
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
        setCache(cacheKey, plans);
        return plans;
    } catch (error) {
        console.error('[PlanningV2DataService] 加载产品需求计划失败:', error);
        return [];
    }
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

    if (!forceReload) {
        const cached = getCached<ProductionPlanAPI[]>(cacheKey);
        if (cached) {
            console.log('[PlanningV2DataService] 使用缓存的生产计划数据');
            return cached;
        }
    }

    console.log('[PlanningV2DataService] 从 API 加载生产计划数据...');

    try {
        const response = await ontologyApi.queryObjectInstances(OBJECT_TYPE_IDS.MPS, {
            limit: 10000,
            need_total: true,
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

        // 按生产序号排序
        plans.sort((a, b) => a.seq_no - b.seq_no);

        console.log(`[PlanningV2DataService] 加载了 ${plans.length} 条生产计划`);
        setCache(cacheKey, plans);
        return plans;
    } catch (error) {
        console.error('[PlanningV2DataService] 加载生产计划失败:', error);
        return [];
    }
}

// ============================================================================
// 物料需求计划 (MRP) 数据加载
// ============================================================================

/**
 * 加载物料需求计划数据
 */
export async function loadMaterialRequirementPlans(forceReload: boolean = false): Promise<MaterialRequirementPlanAPI[]> {
    const cacheKey = 'mrp_data';

    if (!forceReload) {
        const cached = getCached<MaterialRequirementPlanAPI[]>(cacheKey);
        if (cached) {
            console.log('[PlanningV2DataService] 使用缓存的物料需求计划数据');
            return cached;
        }
    }

    console.log('[PlanningV2DataService] 从 API 加载物料需求计划数据...');

    try {
        const response = await ontologyApi.queryObjectInstances(OBJECT_TYPE_IDS.MRP, {
            limit: 10000,
            need_total: true,
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
        setCache(cacheKey, plans);
        return plans;
    } catch (error) {
        console.error('[PlanningV2DataService] 加载物料需求计划失败:', error);
        return [];
    }
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
// 清除缓存
// ============================================================================

export function clearPlanningV2Cache(): void {
    cache.clear();
    console.log('[PlanningV2DataService] 缓存已清除');
}

// ============================================================================
// 导出服务对象
// ============================================================================

export const planningV2DataService = {
    // PP
    loadProductDemandPlans,
    getProductDemandPlansByProduct,
    getUniqueProducts,
    getProductDemandStats,
    // MPS
    loadProductionPlans,
    // MRP
    loadMaterialRequirementPlans,
    getMRPByProduct,
    getShortfallMaterials,
    getMRPStats,
    // Cache
    clearCache: clearPlanningV2Cache,
};
