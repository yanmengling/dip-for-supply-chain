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

import { httpClient } from '../api/httpClient';
import { ontologyApi } from '../api/ontologyApi';
import type { QueryCondition } from '../api/ontologyApi';

// 销售订单对象类型 ID
const SALES_ORDER_OBJECT_TYPE_ID = 'd56vh169olk4bpa66v80';

/**
 * 加载生产计划数据 (仅API)
 */
export async function loadProductionPlanData(): Promise<ProductionPlan[]> {
    try {
        console.log('[ProductionPlanCalculator] 尝试从API加载数据 (Direct HttpClient)...');

        // 使用用户指定的完整 API 路径 (通过 Proxy 转发)
        // 目标: https://dip.aishu.cn/api/mdl-uniquery/v1/data-views/2004376134633480194?include_view=true
        const viewId = '2004376134633480194';
        const url = `/api/mdl-uniquery/v1/data-views/${viewId}?include_view=true`;

        const requestBody = {
            limit: 1000,
            offset: 0
        };

        const response = await httpClient.postAsGet<any>(url, requestBody);

        // 兼容不同的响应结构
        const rawData = response.data?.entries || response.data || [];

        if (Array.isArray(rawData) && rawData.length > 0) {
            console.log(`[ProductionPlanCalculator] API返回 ${rawData.length} 条记录`);
            console.log('[ProductionPlanCalculator] 第一条数据示例:', rawData[0]);

            return rawData.map((item: any) => ({
                order_number: item.order_number || item.orderNumber || item.id || '',
                code: item.product_code || item.productCode || item.code || '',
                name: item.product_name || item.productName || item.name || '',  // 提取产品名称
                quantity: parseFloat(item.quantity) || 0,
                ordered: parseFloat(item.ordered) || 0,
                start_time: item.start_time || item.startTime || item.startDate || '',
                end_time: item.end_time || item.endTime || item.endDate || '',
                status: item.status || '待确认',
                priority: parseInt(item.priority) || 0,
            }));
        }

        if (!Array.isArray(rawData)) {
            console.warn('[ProductionPlanCalculator] API响应数据格式不正确:', response.data);
        } else {
            console.warn('[ProductionPlanCalculator] API返回空数据');
        }

        return [];

    } catch (error) {
        console.error('[ProductionPlanCalculator] API加载失败:', error);
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
        const condition: QueryCondition = {
            operation: '==',
            field: 'product_code',
            value: productCode,
            value_from: 'const',
        };

        const response = await ontologyApi.queryObjectInstances(SALES_ORDER_OBJECT_TYPE_ID, {
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
