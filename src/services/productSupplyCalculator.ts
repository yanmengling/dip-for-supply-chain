/**
 * 产品供应优化智能计算服务
 * 
 * 基于HD供应链CSV文件进行综合分析，提供：
 * - 产品供应分析（库存状态、需求趋势、供应风险）
 * - 优化建议（NPI选型、EOL决策、库存优化）
 * - 需求预测（基于历史订单数据）
 */

// ============================================================================
// 类型定义
// ============================================================================

/** 产品信息 */
export interface ProductInfo {
    product_code: string;
    product_name: string;
    product_model: string;
    product_series: string;
    product_type: string;
    amount: number;
}

/** 订单信息 */
export interface OrderInfo {
    id: number;
    signing_date: string;
    contract_number: string;
    product_category: string;
    product_code: string;
    product_name: string;
    signing_quantity: number;
    shipping_quantity: number;
    shipping_date: string;
    promised_delivery_date: string;
}

/** 供应商信息 */
export interface SupplierInfo {
    supplier: string;
    supplier_code: string;
    unit_price_with_tax: number;
    payment_terms: string;
    is_lowest_price_alternative: string;
    is_basic_material: string;
    provided_material_code: string;
    provided_material_name: string;
}

/** BOM信息 */
export interface BOMInfo {
    parent_id: string;
    parent_code: string;
    parent_name: string;
    parent_type: string;
    child_id: string;
    child_code: string;
    child_name: string;
    child_type: string;
    quantity: number;
    unit: string;
    status: string;
}

/** 库存信息 */
export interface InventoryInfo {
    item_id: string;
    item_code: string;
    item_name: string;
    item_type: string;
    quantity: string;
    warehouse_id: string;
    warehouse_name: string;
    snapshot_month: string;
    status: string;
}

/** 库存状态分析 */
export interface ProductInventoryStatus {
    productId: string;
    productName: string;
    currentStock: number;
    safetyStock: number;
    stockDays: number;
    stockStatus: 'sufficient' | 'warning' | 'critical';
}

/** 需求趋势分析 */
export interface DemandTrend {
    productId: string;
    last30DaysDemand: number;
    last90DaysDemand: number;
    averageDailyDemand: number;
    demandGrowthRate: number;
    peakDemandDate: string;
    demandHistory: { date: string; quantity: number }[];
}

/** 供应风险评估 */
export interface SupplyRisk {
    productId: string;
    riskLevel: 'low' | 'medium' | 'high';
    riskScore: number;
    riskFactors: {
        materialShortage: boolean;
        supplierConcentration: boolean;
        longLeadTime: boolean;
        priceVolatility: boolean;
    };
    bottleneckMaterials: string[];
}

/** 库存优化建议 */
export interface InventoryOptimization {
    productId: string;
    currentStock: number;
    recommendedStock: number;
    adjustmentAction: 'increase' | 'decrease' | 'maintain';
    adjustmentQuantity: number;
    reason: string;
}

/** NPI选型建议 */
export interface NPIRecommendation {
    productId: string;
    isRecommended: boolean;
    score: number;
    factors: {
        demandGrowth: number;
        profitMargin: number;
        supplyStability: number;
        marketPotential: number;
    };
    suggestion: string;
}

/** EOL决策建议 */
export interface EOLRecommendation {
    productId: string;
    shouldEOL: boolean;
    eolScore: number;
    factors: {
        demandDecline: boolean;
        lowProfitability: boolean;
        highInventory: boolean;
        obsoleteTechnology: boolean;
    };
    recommendation: string;
}

/** 需求预测 */
export interface DemandForecast {
    productId: string;
    forecastPeriod: number;
    predictions: {
        movingAverage: number[];
        exponentialSmoothing: number[];
        linearRegression: number[];
    };
    confidence: number;
}

/** 综合产品供应分析 */
export interface ProductSupplyAnalysis {
    productId: string;
    productName: string;
    inventoryStatus: ProductInventoryStatus;
    demandTrend: DemandTrend;
    supplyRisk: SupplyRisk;
    inventoryOptimization: InventoryOptimization;
    npiRecommendation: NPIRecommendation;
    eolRecommendation: EOLRecommendation;
    demandForecast: DemandForecast;
}

// ============================================================================
// API 数据加载
// ============================================================================

import { ontologyApi } from '../api/ontologyApi';
import { apiConfigService } from './apiConfigService';

/**
 * 获取对象类型ID配置 (与BOM服务保持一致)
 */
const getObjectTypeId = (entityType: string, defaultId: string) => {
    const config = apiConfigService.getOntologyObjectByEntityType(entityType);
    if (config?.objectTypeId) {
        console.log(`[智能计算] 使用配置的对象ID: ${entityType} -> ${config.objectTypeId}`);
        return config.objectTypeId;
    }
    console.warn(`[智能计算] 未找到配置的对象ID，使用默认值: ${entityType} -> ${defaultId}`);
    return defaultId;
};

// 默认ID作为后备
const DEFAULT_IDS = {
    product: 'd56v4ue9olk4bpa66v00',
    sales_order: 'd56vh169olk4bpa66v80',
    supplier: '2004376134633480193',
    bom: 'd56vqtm9olk4bpa66vfg',
    inventory: 'd56vcuu9olk4bpa66v3g',
};

/**
 * 通用Ontology API加载辅助函数
 */
async function loadDataFromOntology<T>(entityType: string, defaultId: string, mapper: (item: any) => T, name: string): Promise<T[]> {
    try {
        console.log(`[API] Loading ${name} from Ontology...`);
        const objectTypeId = getObjectTypeId(entityType, defaultId);

        // 使用防御性加载逻辑 (Safe Mode fallback)
        let response;
        try {
            response = await ontologyApi.queryObjectInstances(objectTypeId, {
                limit: 2000,
                include_type_info: true,
                include_logic_params: false
            });
        } catch (firstError) {
            console.warn(`[API] ${name} 加载失败，尝试简化请求回退...`, firstError);
            response = await ontologyApi.queryObjectInstances(objectTypeId, {
                limit: 500,
                include_type_info: false,
                include_logic_params: false
            });
            console.log(`[API] ${name} 回退加载成功`);
        }

        const rawData = response.entries || [];

        if (Array.isArray(rawData)) {
            console.log(`[API] Loaded ${name}: ${rawData.length} records`);
            if (rawData.length > 0 && name.includes('Sample')) {
                console.log(`[API] Sample data:`, rawData[0]);
            }
            return rawData.map(mapper);
        } else {
            console.warn(`[API] ${name} invalid format`, response);
            return [];
        }
    } catch (error) {
        console.error(`[智能计算] ${name} 加载失败:`, error);
        throw new Error(`Failed to load ${name}: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 加载产品信息CSV
 */
/**
 * 加载产品信息 (API)
 * ID: 2004376134620897282
 */
export async function loadProductInfo(): Promise<ProductInfo[]> {
    return loadDataFromOntology('product', DEFAULT_IDS.product, (item) => ({
        product_code: item.product_code || item.code || '',
        product_name: item.product_name || item.name || '',
        product_model: item.product_model || item.model || '',
        product_series: item.product_series || item.series || '',
        product_type: item.product_type || item.type || '',
        amount: parseFloat(item.amount) || 0,
    }), '产品信息');
}

/**
 * 加载订单信息CSV
 */
/**
 * 加载订单信息 (API)
 * ID: 2004376134629285890
 */
export async function loadOrderInfo(): Promise<OrderInfo[]> {
    return loadDataFromOntology('sales_order', DEFAULT_IDS.sales_order, (item) => ({
        id: parseInt(item.id) || 0,
        signing_date: item.signing_date || '',
        contract_number: item.contract_number || '',
        product_category: item.product_category || '',
        product_code: item.product_code || '',
        product_name: item.product_name || '',
        signing_quantity: parseFloat(item.signing_quantity) || 0,
        shipping_quantity: parseFloat(item.shipping_quantity) || 0,
        shipping_date: item.shipping_date || '',
        promised_delivery_date: item.promised_delivery_date || '',
    }), '订单信息');
}

/**
 * 加载供应商信息CSV
 */
/**
 * 加载供应商信息 (API)
 * ID: 2004376134633480193
 */
export async function loadSupplierInfo(): Promise<SupplierInfo[]> {
    return loadDataFromOntology('supplier', DEFAULT_IDS.supplier, (item) => ({
        supplier: item.supplier || item.supplier_name || '',
        supplier_code: item.supplier_code || '',
        unit_price_with_tax: parseFloat(item.unit_price_with_tax) || 0,
        payment_terms: item.payment_terms || '',
        is_lowest_price_alternative: item.is_lowest_price_alternative || '否',
        is_basic_material: item.is_basic_material || '否',
        provided_material_code: item.provided_material_code || '',
        provided_material_name: item.provided_material_name || '',
    }), '供应商信息');
}

/**
 * 加载BOM信息CSV
 */
/**
 * 加载BOM信息 (API)
 * ID: 2004376134629285892
 */
export async function loadBOMInfo(): Promise<BOMInfo[]> {
    return loadDataFromOntology('bom', DEFAULT_IDS.bom, (item) => ({
        parent_id: item.parent_id || '',
        parent_code: item.parent_code || '',
        parent_name: item.parent_name || '',
        parent_type: item.parent_type || '',
        child_id: item.child_id || '',
        child_code: item.child_code || '',
        child_name: item.child_name || '',
        child_type: item.child_type || '',
        quantity: parseFloat(item.quantity) || 0,
        unit: item.unit || '',
        status: item.status || 'Active',
    }), 'BOM信息');
}

/**
 * 加载库存信息CSV
 */
/**
 * 加载库存信息 (API)
 * ID: 2004376134625091585
 */
export async function loadInventoryInfo(): Promise<InventoryInfo[]> {
    return loadDataFromOntology('inventory', DEFAULT_IDS.inventory, (item) => ({
        item_id: item.item_id || '',
        item_code: item.item_code || '',
        item_name: item.item_name || '',
        item_type: item.item_type || '',
        quantity: item.quantity ? String(item.quantity) : '0',
        warehouse_id: item.warehouse_id || '',
        warehouse_name: item.warehouse_name || '',
        snapshot_month: item.snapshot_month || '',
        status: item.status || 'Active',
    }), '库存信息');
}

// ============================================================================
// 计算函数
// ============================================================================

/**
 * 基于BOM和物料库存计算产品可生产数量
 */
export function calculateProductStockFromMaterials(
    productCode: string,
    boms: BOMInfo[],
    inventories: InventoryInfo[]
): { stock: number; bottleneckMaterials: string[] } {


    // 获取该产品的BOM
    // 注意：API返回的数据可能缺失 parent_type 字段，因此主要依赖 parent_code 进行匹配
    const productBOMs = boms.filter(
        bom => bom.parent_code === productCode &&
            (bom.status === 'Active' || !bom.status) // 兼容 status 为空的情况
    );



    if (productBOMs.length === 0) {
        // 如果没有BOM，尝试直接从库存中查找产品
        const productInventories = inventories.filter(
            inv => inv.item_code === productCode &&
                inv.item_type === 'Product' &&
                inv.status === 'Active'
        );

        const directStock = productInventories.reduce(
            (sum, inv) => sum + (parseInt(inv.quantity) || 0),
            0
        );


        return { stock: directStock, bottleneckMaterials: [] };
    }

    let minProductQuantity = Infinity;
    const bottleneckMaterials: string[] = [];

    // 对每个物料，计算可生产的产品数量
    for (const bom of productBOMs) {
        // 获取该物料的库存
        const materialInventories = inventories.filter(
            inv => inv.item_code === bom.child_code &&
                inv.item_type === 'Material' &&
                inv.status === 'Active'
        );

        // 汇总该物料的总库存
        const totalMaterialStock = materialInventories.reduce(
            (sum, inv) => sum + (parseInt(inv.quantity) || 0),
            0
        );

        // 计算该物料可支持的产品数量
        const productQuantityFromThisMaterial = bom.quantity > 0
            ? Math.floor(totalMaterialStock / bom.quantity)
            : 0;

        // 更新最小值（瓶颈）
        if (productQuantityFromThisMaterial < minProductQuantity) {
            minProductQuantity = productQuantityFromThisMaterial;
            bottleneckMaterials.length = 0;
            bottleneckMaterials.push(bom.child_name);
        } else if (productQuantityFromThisMaterial === minProductQuantity) {
            bottleneckMaterials.push(bom.child_name);
        }
    }

    const finalStock = minProductQuantity === Infinity ? 0 : minProductQuantity;


    return {
        stock: finalStock,
        bottleneckMaterials,
    };
}

/**
 * 计算需求趋势
 */
export function calculateDemandTrend(
    productCode: string,
    orders: OrderInfo[]
): DemandTrend {
    const productOrders = orders.filter(o => o.product_code === productCode);

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const oneEightyDaysAgo = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);

    let last30DaysDemand = 0;
    let last90DaysDemand = 0;
    let prev90DaysDemand = 0;
    let peakDemand = 0;
    let peakDemandDate = '';

    const demandHistory: { date: string; quantity: number }[] = [];

    productOrders.forEach(order => {
        const orderDate = new Date(order.signing_date);
        const quantity = order.signing_quantity;

        if (orderDate >= thirtyDaysAgo) {
            last30DaysDemand += quantity;
        }
        if (orderDate >= ninetyDaysAgo) {
            last90DaysDemand += quantity;
        }
        if (orderDate >= oneEightyDaysAgo && orderDate < ninetyDaysAgo) {
            prev90DaysDemand += quantity;
        }

        if (quantity > peakDemand) {
            peakDemand = quantity;
            peakDemandDate = order.signing_date;
        }

        demandHistory.push({
            date: order.signing_date,
            quantity: quantity,
        });
    });

    const averageDailyDemand = last90DaysDemand / 90;
    const demandGrowthRate = prev90DaysDemand > 0
        ? ((last90DaysDemand - prev90DaysDemand) / prev90DaysDemand) * 100
        : 0;

    return {
        productId: productCode,
        last30DaysDemand,
        last90DaysDemand,
        averageDailyDemand,
        demandGrowthRate,
        peakDemandDate,
        demandHistory: demandHistory.sort((a, b) => a.date.localeCompare(b.date)),
    };
}

/**
 * 计算库存状态
 */
export function calculateInventoryStatus(
    productCode: string,
    productName: string,
    currentStock: number,
    demandTrend: DemandTrend
): ProductInventoryStatus {
    const safetyStock = Math.ceil(demandTrend.averageDailyDemand * 30);
    const stockDays = demandTrend.averageDailyDemand > 0
        ? Math.floor(currentStock / demandTrend.averageDailyDemand)
        : 999;

    let stockStatus: 'sufficient' | 'warning' | 'critical';
    if (stockDays > 30) {
        stockStatus = 'sufficient';
    } else if (stockDays >= 15) {
        stockStatus = 'warning';
    } else {
        stockStatus = 'critical';
    }

    return {
        productId: productCode,
        productName,
        currentStock,
        safetyStock,
        stockDays,
        stockStatus,
    };
}

/**
 * 计算供应风险
 */
export function calculateSupplyRisk(
    productCode: string,
    orders: OrderInfo[],
    suppliers: SupplierInfo[],
    bottleneckMaterials: string[] = []
): SupplyRisk {
    const productOrders = orders.filter(o => o.product_code === productCode);

    // 计算交付准时率
    let onTimeDeliveries = 0;
    let totalDeliveries = 0;
    productOrders.forEach(order => {
        if (order.shipping_date && order.promised_delivery_date) {
            totalDeliveries++;
            const shippingDate = new Date(order.shipping_date);
            const promisedDate = new Date(order.promised_delivery_date);
            if (shippingDate <= promisedDate) {
                onTimeDeliveries++;
            }
        }
    });

    const onTimeRate = totalDeliveries > 0 ? onTimeDeliveries / totalDeliveries : 1;

    // 风险因素评估
    const riskFactors = {
        materialShortage: bottleneckMaterials.length > 0,
        supplierConcentration: suppliers.length < 3,
        longLeadTime: onTimeRate < 0.8,
        priceVolatility: false,  // 需要历史价格数据
    };

    // 计算风险分数
    const riskCount = Object.values(riskFactors).filter(v => v).length;
    const riskScore = (riskCount / 4) * 100;

    let riskLevel: 'low' | 'medium' | 'high';
    if (riskScore < 30) {
        riskLevel = 'low';
    } else if (riskScore < 60) {
        riskLevel = 'medium';
    } else {
        riskLevel = 'high';
    }

    return {
        productId: productCode,
        riskLevel,
        riskScore,
        riskFactors,
        bottleneckMaterials,
    };
}

/**
 * 生成库存优化建议
 */
export function generateInventoryOptimization(
    productCode: string,
    inventoryStatus: ProductInventoryStatus,
    demandTrend: DemandTrend
): InventoryOptimization {
    const recommendedStock = Math.ceil(demandTrend.averageDailyDemand * 30 * 1.2);
    const currentStock = inventoryStatus.currentStock;
    const difference = recommendedStock - currentStock;

    let adjustmentAction: 'increase' | 'decrease' | 'maintain';
    let reason: string;

    if (Math.abs(difference) < demandTrend.averageDailyDemand * 5) {
        adjustmentAction = 'maintain';
        reason = '当前库存水平合理，建议维持';
    } else if (difference > 0) {
        adjustmentAction = 'increase';
        reason = `库存不足，建议增加${Math.abs(difference)}件以满足30天需求`;
    } else {
        adjustmentAction = 'decrease';
        reason = `库存过剩，建议减少${Math.abs(difference)}件以降低库存成本`;
    }

    return {
        productId: productCode,
        currentStock,
        recommendedStock,
        adjustmentAction,
        adjustmentQuantity: Math.abs(difference),
        reason,
    };
}

/**
 * 生成NPI选型建议
 */
export function generateNPIRecommendation(
    productCode: string,
    demandTrend: DemandTrend,
    supplyRisk: SupplyRisk,
    productAmount: number
): NPIRecommendation {
    // 需求增长分数 (0-100)
    const demandGrowth = Math.min(100, Math.max(0, demandTrend.demandGrowthRate + 50));

    // 利润率分数 (假设基于产品金额)
    const profitMargin = Math.min(100, productAmount / 2);

    // 供应稳定性分数 (100 - 风险分数)
    const supplyStability = 100 - supplyRisk.riskScore;

    // 市场潜力分数 (基于需求量)
    const marketPotential = Math.min(100, (demandTrend.last90DaysDemand / 100) * 10);

    // 综合评分 (加权平均)
    const score = (
        demandGrowth * 0.3 +
        profitMargin * 0.2 +
        supplyStability * 0.3 +
        marketPotential * 0.2
    );

    const isRecommended = score >= 60;

    let suggestion: string;
    if (score >= 80) {
        suggestion = '强烈推荐：该产品需求增长强劲，供应稳定，市场潜力大';
    } else if (score >= 60) {
        suggestion = '推荐：该产品综合表现良好，适合作为NPI选型';
    } else if (score >= 40) {
        suggestion = '谨慎考虑：该产品存在一定风险，建议进一步评估';
    } else {
        suggestion = '不推荐：该产品风险较高或市场潜力有限';
    }

    return {
        productId: productCode,
        isRecommended,
        score,
        factors: {
            demandGrowth,
            profitMargin,
            supplyStability,
            marketPotential,
        },
        suggestion,
    };
}

/**
 * 生成EOL决策建议
 */
export function generateEOLRecommendation(
    productCode: string,
    demandTrend: DemandTrend,
    inventoryStatus: ProductInventoryStatus,
    productAmount: number
): EOLRecommendation {
    // EOL因素评估
    const demandDecline = demandTrend.demandGrowthRate < -30;
    const lowProfitability = productAmount < 50;
    const highInventory = inventoryStatus.stockDays > 90;
    const obsoleteTechnology = false;  // 需要额外数据判断

    const factors = {
        demandDecline,
        lowProfitability,
        highInventory,
        obsoleteTechnology,
    };

    // 计算EOL评分
    const factorCount = Object.values(factors).filter(v => v).length;
    const eolScore = (factorCount / 4) * 100;

    const shouldEOL = eolScore >= 50;

    let recommendation: string;
    if (eolScore >= 75) {
        recommendation = '强烈建议EOL：多项指标表明该产品应该退市';
    } else if (eolScore >= 50) {
        recommendation = '建议EOL：该产品存在明显的退市信号';
    } else if (eolScore >= 25) {
        recommendation = '观察期：该产品需要密切关注，暂不建议EOL';
    } else {
        recommendation = '不建议EOL：该产品表现良好，应继续销售';
    }

    return {
        productId: productCode,
        shouldEOL,
        eolScore,
        factors,
        recommendation,
    };
}

/**
 * 计算需求预测
 */
export function calculateDemandForecast(
    productCode: string,
    demandTrend: DemandTrend,
    forecastDays: number = 30
): DemandForecast {
    const history = demandTrend.demandHistory;
    const avgDemand = demandTrend.averageDailyDemand || 0;

    // 移动平均预测
    const movingAverage: number[] = [];
    for (let i = 0; i < forecastDays; i++) {
        movingAverage.push(Math.max(0, avgDemand));
    }

    // 指数平滑预测
    const alpha = 0.3;
    const exponentialSmoothing: number[] = [];
    let lastValue = avgDemand;
    for (let i = 0; i < forecastDays; i++) {
        const forecast = alpha * lastValue + (1 - alpha) * avgDemand;
        exponentialSmoothing.push(Math.max(0, forecast));
        lastValue = forecast;
    }

    // 线性回归预测
    const linearRegression: number[] = [];
    const slope = (demandTrend.demandGrowthRate / 100) * avgDemand / 90;
    for (let i = 0; i < forecastDays; i++) {
        const forecast = avgDemand + slope * i;
        linearRegression.push(Math.max(0, forecast));
    }

    // 置信度 (基于历史数据量)
    const confidence = Math.min(95, Math.max(10, (history.length / 100) * 100));

    return {
        productId: productCode,
        forecastPeriod: forecastDays,
        predictions: {
            movingAverage,
            exponentialSmoothing,
            linearRegression,
        },
        confidence,
    };
}

/**
 * 计算所有产品的供应分析
 */
export async function calculateAllProductsSupplyAnalysis(): Promise<ProductSupplyAnalysis[]> {
    try {
        const [products, orders, suppliers, boms, inventories] = await Promise.all([
            loadProductInfo(),
            loadOrderInfo(),
            loadSupplierInfo(),
            loadBOMInfo(),
            loadInventoryInfo(),
        ]);

        const analyses: ProductSupplyAnalysis[] = [];

        for (const product of products) {
            // 计算需求趋势
            const demandTrend = calculateDemandTrend(product.product_code, orders);

            // 基于BOM和物料库存计算产品库存
            const { stock: currentStock, bottleneckMaterials } = calculateProductStockFromMaterials(
                product.product_code,
                boms,
                inventories
            );

            // 计算库存状态
            const inventoryStatus = calculateInventoryStatus(
                product.product_code,
                product.product_name,
                currentStock,
                demandTrend
            );

            // 计算供应风险
            const supplyRisk = calculateSupplyRisk(
                product.product_code,
                orders,
                suppliers,
                bottleneckMaterials
            );

            // 生成优化建议
            const inventoryOptimization = generateInventoryOptimization(
                product.product_code,
                inventoryStatus,
                demandTrend
            );
            const npiRecommendation = generateNPIRecommendation(
                product.product_code,
                demandTrend,
                supplyRisk,
                product.amount
            );
            const eolRecommendation = generateEOLRecommendation(
                product.product_code,
                demandTrend,
                inventoryStatus,
                product.amount
            );
            const demandForecast = calculateDemandForecast(product.product_code, demandTrend);

            analyses.push({
                productId: product.product_code,
                productName: product.product_name,
                inventoryStatus,
                demandTrend,
                supplyRisk,
                inventoryOptimization,
                npiRecommendation,
                eolRecommendation,
                demandForecast,
            });
        }

        return analyses;
    } catch (error) {
        console.error('计算产品供应分析失败:', error);
        return [];
    }
}
