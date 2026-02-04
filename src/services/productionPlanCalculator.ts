/**
 * Production Plan Calculator
 * 
 * 从CSV文件加载生产计划数据并进行智能计算分析
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
    code: string;
    name?: string;  // 产品名称
    quantity: number;
    cycleDays: number;
    startTime: string;  // 计划开始时间
    endTime: string;    // 计划结束时间
    priority: number;
    status: string;
    pendingOrderQuantity?: number;  // 在手订单数量（签约数量-发货数量）
}

// 统计结果
export interface ProductionStats {
    totalQuantity: number;
    totalPendingOrderQuantity: number;  // 所有产品的在手订单数量总和
    priorityAnalysis: PriorityAnalysis[];
    productAnalysis: ProductAnalysis[];
    statusDistribution: { status: string; count: number; percentage: number }[];
}

import { ontologyApi } from '../api/ontologyApi';
import type { QueryCondition } from '../api/ontologyApi';
import { apiConfigService } from './apiConfigService';

/**
 * 获取生产计划对象类型 ID（从配置中心获取）
 * 注意：使用 entityType: 'salesorder' 对应工厂生产计划 (supplychain_hd0202_mps)
 */
function getProductionPlanObjectTypeId(): string {
    const config = apiConfigService.getOntologyObjectByEntityType('salesorder');
    if (!config || !config.enabled) {
        console.error('[ProductionPlanCalculator] 未找到启用的生产计划对象配置 (entity_type: salesorder)');
        throw new Error('生产计划对象未配置，请在配置中心添加 salesorder 类型的业务对象配置');
    }
    console.log(`[ProductionPlanCalculator] 使用配置的生产计划对象类型ID: ${config.objectTypeId}`);
    return config.objectTypeId;
}

/**
 * 获取销售订单对象类型 ID（从配置中心获取）
 * 注意：使用 entityType: 'order' 对应销售订单 (supplychain_hd0202_salesorder)
 */
function getSalesOrderObjectTypeId(): string {
    const config = apiConfigService.getOntologyObjectByEntityType('order');
    if (!config || !config.enabled) {
        console.error('[ProductionPlanCalculator] 未找到启用的销售订单对象配置 (entity_type: order)');
        throw new Error('销售订单对象未配置，请在配置中心添加 order 类型的业务对象配置');
    }
    console.log(`[ProductionPlanCalculator] 使用配置的销售订单对象类型ID: ${config.objectTypeId}`);
    return config.objectTypeId;
}

/**
 * 加载生产计划数据 (通过 Ontology API)
 */
export async function loadProductionPlanData(): Promise<ProductionPlan[]> {
    try {
        console.log('[ProductionPlanCalculator] 通过 Ontology API 加载生产计划数据...');

        // 从配置中心获取生产计划对象类型 ID
        const productionPlanObjectTypeId = getProductionPlanObjectTypeId();

        const response = await ontologyApi.queryObjectInstances(productionPlanObjectTypeId, {
            limit: 1000,
        });

        const entries = response.entries || [];

        if (entries.length > 0) {
            console.log(`[ProductionPlanCalculator] Ontology API 返回 ${entries.length} 条生产计划记录`);
            console.log('[ProductionPlanCalculator] 第一条数据示例:', entries[0]);

            return entries.map((item: any) => ({
                order_number: item.order_number || item.orderNumber || item.id || '',
                code: item.product_code || item.productCode || item.code || '',
                name: item.product_name || item.productName || item.name || '',
                quantity: parseFloat(item.quantity) || 0,
                ordered: parseFloat(item.ordered) || 0,
                start_time: item.start_time || item.startTime || item.startDate || '',
                end_time: item.end_time || item.endTime || item.endDate || '',
                status: item.status || '待确认',
                priority: parseInt(item.priority) || 0,
            }));
        }

        console.warn('[ProductionPlanCalculator] Ontology API 返回空数据');
        return [];

    } catch (error) {
        console.error('[ProductionPlanCalculator] Ontology API 加载失败:', error);
        return [];
    }
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
        // 从配置中心获取销售订单对象类型 ID
        const salesOrderObjectTypeId = getSalesOrderObjectTypeId();

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
 * 计算产品分析数据（异步，包含在手订单数量）
 */
export async function analyzeProducts(plans: ProductionPlan[]): Promise<ProductAnalysis[]> {
    // 获取所有唯一的产品编码
    const uniqueProductCodes = [...new Set(plans.map(plan => plan.code).filter(code => code))];
    
    // 并行查询所有产品的在手订单数量
    const pendingOrderMap = new Map<string, number>();
    await Promise.all(
        uniqueProductCodes.map(async (code) => {
            const pendingQty = await getPendingOrderQuantity(code);
            pendingOrderMap.set(code, pendingQty);
        })
    );

    // 构建产品分析数据
    const productAnalysis = plans.map(plan => ({
        code: plan.code,
        name: plan.name,  // 包含产品名称
        quantity: plan.quantity,
        cycleDays: calculateProductionCycle(plan.start_time, plan.end_time),
        startTime: plan.start_time,  // 计划开始时间
        endTime: plan.end_time,      // 计划结束时间
        priority: plan.priority,
        status: plan.status,
        pendingOrderQuantity: pendingOrderMap.get(plan.code) || 0,  // 在手订单数量
    })).sort((a, b) => b.quantity - a.quantity);

    return productAnalysis;
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
 * 计算所有统计数据（异步）
 */
export async function calculateProductionStats(plans: ProductionPlan[]): Promise<ProductionStats> {
    const totalQuantity = plans.reduce((sum, plan) => sum + plan.quantity, 0);

    // 获取产品分析（包含在手订单数量）
    const productAnalysis = await analyzeProducts(plans);
    
    // 计算所有产品的在手订单数量总和
    const totalPendingOrderQuantity = productAnalysis.reduce(
        (sum, product) => sum + (product.pendingOrderQuantity || 0), 
        0
    );

    return {
        totalQuantity,
        totalPendingOrderQuantity,
        priorityAnalysis: groupByPriority(plans),
        productAnalysis,
        statusDistribution: analyzeStatus(plans),
    };
}
