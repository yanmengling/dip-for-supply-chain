/**
 * Production Plan Calculator
 * 
 * 从CSV文件加载生产计划数据并进行智能计算分析
 */

// 生产计划数据类型
export interface ProductionPlan {
    order_number: string;
    code: string;
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
    quantity: number;
    cycleDays: number;
    priority: number;
    status: string;
}

// 统计结果
export interface ProductionStats {
    totalQuantity: number;
    totalOrders: number;
    avgCycleDays: number;
    priorityAnalysis: PriorityAnalysis[];
    productAnalysis: ProductAnalysis[];
    statusDistribution: { status: string; count: number; percentage: number }[];
}

import { ontologyApi } from '../api/ontologyApi';
import { apiConfigService } from './apiConfigService';
import { ApiConfigType, type OntologyObjectConfig } from '../types/apiConfig';

const DEFAULT_PP_OBJECT_TYPE_ID = 'd5704qm9olk4bpa66vp0';

/**
 * Get configured Production Plan Object Type ID
 */
function getProductionPlanObjectTypeId(): string {
    const configs = apiConfigService.getConfigsByType(ApiConfigType.ONTOLOGY_OBJECT) as OntologyObjectConfig[];

    // Find by entityType 'production_plan'
    const config = configs.find(c => c.enabled && c.entityType === 'production_plan');
    if (config) {
        console.log(`[ProductionPlanCalculator] Using configured object type: ${config.objectTypeId} (${config.name})`);
        return config.objectTypeId;
    }

    // Fallback: Find by tag 'production'
    const tagConfig = configs.find(c => c.enabled && c.tags?.includes('production'));
    if (tagConfig) {
        return tagConfig.objectTypeId;
    }

    console.warn(`[ProductionPlanCalculator] No configuration found, using default: ${DEFAULT_PP_OBJECT_TYPE_ID}`);
    return DEFAULT_PP_OBJECT_TYPE_ID;
}

/**
 * 加载生产计划数据 (从从知识网络获取)
 * Target Object Type: d5704qm9olk4bpa66vp0 (工厂生产计划)
 */
export async function loadProductionPlanData(): Promise<ProductionPlan[]> {
    try {
        console.log('[ProductionPlanCalculator] 尝试从知识网络加载数据 (Ontology API)...');

        // 获取配置的对象类型 ID
        const objectTypeId = getProductionPlanObjectTypeId();

        let response;
        try {
            // 尝试首选查询配置
            response = await ontologyApi.queryObjectInstances(objectTypeId, {
                include_type_info: true,
                include_logic_params: false,
                limit: 1000,
                need_total: true
            });
        } catch (firstError) {
            console.warn('[ProductionPlanCalculator] 首选查询失败，尝试安全模式回退...', firstError);

            // 安全模式回退：减少参数复杂度，降低limit
            try {
                response = await ontologyApi.queryObjectInstances(objectTypeId, {
                    include_type_info: false,
                    include_logic_params: false,
                    limit: 500,
                    need_total: false
                });
                console.log('[ProductionPlanCalculator] 安全模式回退查询成功');
            } catch (fallbackError) {
                console.error('[ProductionPlanCalculator] 安全模式回退查询也失败:', fallbackError);
                throw fallbackError;
            }
        }

        // Ontology API 返回的是 entries
        const rawData = response.entries || [];

        if (Array.isArray(rawData) && rawData.length > 0) {
            console.log(`[ProductionPlanCalculator] API返回 ${rawData.length} 条记录`);
            console.log('[ProductionPlanCalculator] 第一条数据示例:', rawData[0]);

            return rawData.map((item: any) => ({
                // 尝试匹配可能的字段名 (基于常见命名规范)
                order_number: item.order_number || item.orderNumber || item.order_no || item.id || '',
                code: item.product_code || item.productCode || item.code || '',
                quantity: parseFloat(item.quantity) || parseFloat(item.plan_quantity) || 0,
                ordered: parseFloat(item.ordered) || parseFloat(item.ordered_quantity) || 0,
                start_time: item.start_time || item.startTime || item.plan_start_time || '',
                end_time: item.end_time || item.endTime || item.plan_end_time || '',
                status: item.status || '待确认',
                priority: parseInt(item.priority) || 0,
            }));
        }

        if (rawData.length === 0) {
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
 * 计算产品分析数据
 */
export function analyzeProducts(plans: ProductionPlan[]): ProductAnalysis[] {
    return plans.map(plan => ({
        code: plan.code,
        quantity: plan.quantity,
        cycleDays: calculateProductionCycle(plan.start_time, plan.end_time),
        priority: plan.priority,
        status: plan.status,
    })).sort((a, b) => b.quantity - a.quantity);
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
    const totalOrders = plans.length;

    // 计算平均生产周期
    const cycleDays = plans.map(plan => calculateProductionCycle(plan.start_time, plan.end_time));
    const avgCycleDays = cycleDays.length > 0
        ? Math.round(cycleDays.reduce((sum, days) => sum + days, 0) / cycleDays.length * 10) / 10
        : 0;

    return {
        totalQuantity,
        totalOrders,
        avgCycleDays,
        priorityAnalysis: groupByPriority(plans),
        productAnalysis: analyzeProducts(plans),
        statusDistribution: analyzeStatus(plans),
    };
}
