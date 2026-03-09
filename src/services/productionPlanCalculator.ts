/**
 * Production Plan Calculator
 * 
 * 加载生产计划数据并进行智能计算分析 (基于 Ontology API)
 */

// 生产计划数据类型
export interface ProductionPlan {
    order_number: string;
    code: string;
    name?: string;  // 产品名称
    quantity: number;
    ordered: number;
    start_time: string;
    end_time: string;
    status: string;
    priority: number;
    /** 合格品入库数量 (MPS xkquainwaqty) */
    qualifiedInboundQty?: number;
}

// 优先级分析结果
export interface PriorityAnalysis {
    priority: number;
    quantity: number;
    percentage: number;
    orderCount: number;
}

// 产品分析结果
export interface ProductAnalysis {
    /** 生产工单单号 (MPS billno) */
    orderNumber: string;
    code: string;
    name?: string;  // 产品名称
    order_number: string;  // 工单号
    quantity: number;
    cycleDays: number;
    startTime: string;  // 计划开工时间
    endTime: string;    // 计划完工时间
    priority: number;
    status: string;
    /** 合格品入库数量 (MPS xkquainwaqty) */
    qualifiedInboundQty?: number;
}

// 统计结果
export interface ProductionStats {
    totalQuantity: number;
    priorityAnalysis: PriorityAnalysis[];
    productAnalysis: ProductAnalysis[];
    statusDistribution: { status: string; count: number; percentage: number }[];
}

import { ontologyApi } from '../api/ontologyApi';
import type { QueryCondition } from '../api/ontologyApi';
import { apiConfigService } from './apiConfigService';
import { dynamicConfigService } from './dynamicConfigService';

const DEFAULT_MPS_OBJECT_TYPE_ID = 'supplychain_hd0202_mps';

/**
 * 获取生产计划对象类型 ID
 * 优先从 Context（dynamicConfigService 从 Ontology API 动态加载的对象类型）获取，
 * 其次从配置中心（apiConfigService）获取，最后使用默认 MPS 对象类型。
 */
async function getProductionPlanObjectTypeId(): Promise<string> {
    // 1. 从 Context/Dynamic 加载：一次性获取所有配置，避免串行两次调用
    const configs = await dynamicConfigService.getObjectTypeConfigs().catch(() => []);
    const dynamicConfig = configs.find(c => c.entityType === 'production_plan')
        || configs.find(c => c.entityType === 'mps');
    if (dynamicConfig?.objectTypeId) {
        console.log(`[ProductionPlanCalculator] 使用 Context 加载的生产计划对象类型ID: ${dynamicConfig.objectTypeId}`);
        return dynamicConfig.objectTypeId;
    }

    // 2. 从配置中心获取（entityType: salesorder 对应工厂生产计划）
    const config = apiConfigService.getOntologyObjectByEntityType('salesorder');
    if (config?.enabled && config.objectTypeId) {
        console.log(`[ProductionPlanCalculator] 使用配置中心的生产计划对象类型ID: ${config.objectTypeId}`);
        return config.objectTypeId;
    }

    // 3. 使用默认 MPS 对象类型
    console.log(`[ProductionPlanCalculator] 使用默认生产计划对象类型ID: ${DEFAULT_MPS_OBJECT_TYPE_ID}`);
    return DEFAULT_MPS_OBJECT_TYPE_ID;
}

/**
 * 获取销售订单对象类型 ID（从配置中心获取）
 * 返回 null 表示未配置，由调用方决定是否跳过查询
 */
function getSalesOrderObjectTypeId(): string | null {
    const config = apiConfigService.getOntologyObjectByEntityType('order');
    if (!config || !config.enabled || !config.objectTypeId) {
        console.warn('[ProductionPlanCalculator] 未找到启用的销售订单对象配置 (entity_type: order)，在手订单量将显示为 0');
        return null;
    }
    console.log(`[ProductionPlanCalculator] 使用配置的销售订单对象类型ID: ${config.objectTypeId}`);
    return config.objectTypeId;
}

// ── In-flight 去重：防止并发调用（如 React StrictMode 双 useEffect）发出两个 MPS 请求 ──
let _mpsInFlight: Promise<ProductionPlan[]> | null = null;

/**
 * 加载生产计划数据 (通过 Context 加载对象类型，再查询 Ontology API)
 * 带 in-flight 去重：并发调用共享同一个 Promise，避免重复请求。
 * 失败时抛出异常（不再静默返回 []），由调用方决定如何处理。
 */
export async function loadProductionPlanData(): Promise<ProductionPlan[]> {
    if (_mpsInFlight) return _mpsInFlight;

    _mpsInFlight = _doLoadProductionPlanData().finally(() => {
        _mpsInFlight = null;
    });
    return _mpsInFlight;
}

async function _doLoadProductionPlanData(): Promise<ProductionPlan[]> {
    const productionPlanObjectTypeId = await getProductionPlanObjectTypeId();

    const response = await ontologyApi.queryObjectInstances(productionPlanObjectTypeId, {
        limit: 10000,
        timeout: 120000,
    });

    const entries = response.entries || [];

    if (entries.length > 0) {
        console.log(`[ProductionPlanCalculator] Ontology API 返回 ${entries.length} 条生产计划记录`);
        console.log('[ProductionPlanCalculator] 第一条数据示例:', entries[0]);

        return entries.map((item: any) => {
            // 优先使用 supplychain_hd0202_mps (HD供应链业务知识网络 v3) 字段，再兼容旧格式
            // v3 工厂生产计划: material_number=物料编码, material_name=物料名称, qty=生产数量,
            // planbegintime=计划开工时间, planendtime=计划完工时间, billno=生产工单单号,
            // taskstatus_title=任务状态[A:未开工,B:开工,C:完工,D:部分完工], billstatus=单据状态
            const code =
                item.material_number ??
                item.product_code ??
                item.productCode ??
                item.code ??
                item.bom_code ??
                '';
            const name =
                item.material_name ??
                item.product_name ??
                item.productName ??
                item.name ??
                '';
            const orderNumber =
                item.billno ?? item.order_number ?? item.orderNumber ?? item.id ?? `mps-${item.seq_no ?? ''}`;
            const startTime =
                item.planbegintime ??
                item.start_time ??
                item.startTime ??
                item.startDate ??
                item.planned_start_date ??
                '';
            const endTime =
                item.planendtime ??
                item.end_time ??
                item.endTime ??
                item.endDate ??
                item.planned_end_date ??
                '';
            const quantity = parseFloat(item.qty ?? item.quantity) || 0;
            const status =
                item.taskstatus_title ??
                item.billstatus ??
                item.status ??
                item.order_type ??
                '待确认';
            const qualifiedInboundQty = parseFloat(item.xkquainwaqty) || 0;

            return {
                order_number: orderNumber,
                code,
                name: name || undefined,
                quantity,
                ordered: parseFloat(item.ordered) || 0,
                start_time: startTime,
                end_time: endTime,
                status,
                priority: parseInt(item.priority) || 0,
                qualifiedInboundQty: qualifiedInboundQty || undefined,
            };
        });

        const entries = response.entries || [];

        if (entries.length > 0) {
            console.log(`[ProductionPlanCalculator] Ontology API 返回 ${entries.length} 条生产计划记录`);
            console.log('[ProductionPlanCalculator] 第一条数据示例:', entries[0]);

            return entries.map((item: any) => {
                // 兼容 MPS 格式 (bom_code, planned_start_date) 与销售订单格式 (order_number, code, start_time)
                const code = item.product_code || item.productCode || item.code || item.bom_code || '';
                const orderNumber = item.order_number || item.orderNumber || item.id || `mps-${item.seq_no ?? ''}`;
                const startTime = item.start_time || item.startTime || item.startDate || item.planned_start_date || '';
                const endTime = item.end_time || item.endTime || item.endDate || item.planned_end_date || '';
                // quantity 有时 API 返回字符串，统一转为数字
                const rawQty = item.quantity ?? item.planned_quantity ?? item.qty ?? 0;
                const quantity = typeof rawQty === 'number' ? rawQty : parseFloat(String(rawQty).replace(/,/g, '')) || 0;

                return {
                    order_number: orderNumber,
                    code,
                    name: item.product_name || item.productName || item.name || '',
                    quantity,
                    ordered: parseFloat(item.ordered) || 0,
                    start_time: startTime,
                    end_time: endTime,
                    status: item.status || item.order_type || '待确认',
                    priority: parseInt(item.priority) || parseInt(item.seq_no) || 0,
                };
            });
        }

        console.warn('[ProductionPlanCalculator] Ontology API 返回空数据');
        return [];

    } catch (error) {
        console.error('[ProductionPlanCalculator] Ontology API 加载失败:', error);
        return [];
    }

    console.warn('[ProductionPlanCalculator] Ontology API 返回空数据');
    return [];
}

/**
 * 解析日期字符串 (支持 "12月1号" 和 "YYYY-MM-DD")
 */
function parseDateString(dateStr: string): Date | null {
    if (!dateStr) return null;

    // 尝试标准格式
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
        return date;
    }

    // 尝试中文格式 "12月1号"
    try {
        const match = dateStr.match(/(\d+)月(\d+)号/);
        if (!match) return null;

        const month = parseInt(match[1]);
        const day = parseInt(match[2]);
        const year = new Date().getFullYear();

        return new Date(year, month - 1, day);
    } catch (e) {
        return null;
    }
}

/**
 * 计算生产周期（天数）
 */
export function calculateProductionCycle(startTime: string, endTime: string): number {
    const startDate = parseDateString(startTime);
    const endDate = parseDateString(endTime);

    if (!startDate || !endDate) return 0;

    const diffTime = endDate.getTime() - startDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
}

/**
 * 按优先级分组统计
 */
export function groupByPriority(plans: ProductionPlan[]): PriorityAnalysis[] {
    const priorityMap = new Map<number, { quantity: number; orderCount: number }>();

    plans.forEach(plan => {
        const existing = priorityMap.get(plan.priority) || { quantity: 0, orderCount: 0 };
        existing.quantity += plan.quantity;
        existing.orderCount += 1;
        priorityMap.set(plan.priority, existing);
    });

    const totalQuantity = plans.reduce((sum, plan) => sum + plan.quantity, 0);

    return Array.from(priorityMap.entries())
        .map(([priority, data]) => ({
            priority,
            quantity: data.quantity,
            orderCount: data.orderCount,
            percentage: totalQuantity > 0 ? Math.round((data.quantity / totalQuantity) * 100 * 10) / 10 : 0,
        }))
        .sort((a, b) => a.priority - b.priority);
}

/**
 * 获取产品的在手订单数量
 * 基于产品编码查询销售订单，计算：签约数量 - 发货数量
 */
export async function getPendingOrderQuantity(productCode: string): Promise<number> {
    try {
        // 从配置中心获取销售订单对象类型 ID，未配置则跳过查询
        const salesOrderObjectTypeId = getSalesOrderObjectTypeId();
        if (!salesOrderObjectTypeId) return 0;

        const condition: QueryCondition = {
            operation: '==',
            field: 'product_code',
            value: productCode,
            value_from: 'const',
        };

        const response = await ontologyApi.queryObjectInstances(salesOrderObjectTypeId, {
            condition,
            limit: 1000,
        });

        // 累加所有匹配记录的签约数量和发货数量
        let totalSigningQuantity = 0;
        let totalShippingQuantity = 0;

        response.entries.forEach((item: any) => {
            const signingQty = item.signing_quantity ? parseFloat(item.signing_quantity) : 0;
            const shippingQty = item.shipping_quantity ? parseFloat(item.shipping_quantity) : 0;
            totalSigningQuantity += signingQty;
            totalShippingQuantity += shippingQty;
        });

        // 在手订单数量 = 累计签约数量 - 累计发货数量
        const pendingOrderQuantity = totalSigningQuantity - totalShippingQuantity;

        console.log(`[ProductionPlanCalculator] 产品 ${productCode} 在手订单量: 签约${totalSigningQuantity} - 发货${totalShippingQuantity} = ${pendingOrderQuantity}`);

        return Math.max(0, pendingOrderQuantity); // 确保不返回负数
    } catch (error) {
        console.error(`[ProductionPlanCalculator] 获取产品 ${productCode} 在手订单数量失败:`, error);
        return 0;
    }
}

/**
 * 计算产品分析数据（不含在手订单）
 */
export function analyzeProducts(plans: ProductionPlan[]): ProductAnalysis[] {
    return plans
        .map(plan => ({
            orderNumber: plan.order_number,
            order_number: plan.order_number,
            code: plan.code,
            name: plan.name,
            quantity: plan.quantity,
            cycleDays: calculateProductionCycle(plan.start_time, plan.end_time),
            startTime: plan.start_time,
            endTime: plan.end_time,
            priority: plan.priority,
            status: plan.status,
            qualifiedInboundQty: plan.qualifiedInboundQty,
        }))
        .sort((a, b) => b.quantity - a.quantity);
}

/**
 * 计算状态分布
 */
export function analyzeStatus(plans: ProductionPlan[]): { status: string; count: number; percentage: number }[] {
    const statusMap = new Map<string, number>();

    plans.forEach(plan => {
        const count = statusMap.get(plan.status) || 0;
        statusMap.set(plan.status, count + 1);
    });

    const total = plans.length;

    return Array.from(statusMap.entries())
        .map(([status, count]) => ({
            status,
            count,
            percentage: total > 0 ? Math.round((count / total) * 100 * 10) / 10 : 0,
        }))
        .sort((a, b) => b.count - a.count);
}

/**
 * 计算所有统计数据
 */
export function calculateProductionStats(plans: ProductionPlan[]): ProductionStats {
    const totalQuantity = plans.reduce((sum, plan) => sum + plan.quantity, 0);

    return {
        totalQuantity,
        priorityAnalysis: groupByPriority(plans),
        productAnalysis: analyzeProducts(plans),
        statusDistribution: analyzeStatus(plans),
    };
}
