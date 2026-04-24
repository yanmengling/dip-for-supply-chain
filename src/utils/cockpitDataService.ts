/**
 * Cockpit Data Service
 * 
 * Service for aggregating and calculating data for the cockpit dashboard panels.
 * Provides functions to compute summaries, rankings, and statistics for various entities.
 */

import {
  suppliersData,
  materialsData,
  productsData,
  ordersData,
  materialStocksData,
  factoriesData,
  warehousesData,
} from './entityConfigService';
import {
  calculateProductLogicRules,
  calculateMaterialLogicRules,
  calculateOrderLogicRules
} from './logicRuleService';

/**
 * Supply Chain Graph Data
 * Represents data for each stage in the supply chain graph
 */
export interface SupplyChainStageData {
  stageName: string;
  totalCount: number;
  abnormalCount: number;
  navigateTo?: string;
}

/**
 * Product Inventory Summary
 */
export interface ProductInventorySummary {
  totalProducts: number;
  stagnantCount: number;
  stagnantPercentage: number;
  top10ByStock: Array<{ productName: string; stock: number }>;
  top10ByOrder: Array<{ productName: string; orderCount: number }>;
}

/**
 * Material Inventory Summary
 */
export interface MaterialInventorySummary {
  totalTypes: number;
  totalStock: number;
  top10ByStock: Array<{ materialName: string; stock: number; suppliers: string[] }>;
  stagnantCount: number;
  stagnantPercentage: number;
  stagnantDetails: Array<{ materialName: string; stock: number; suppliers: string[] }>;
}

/**
 * Procurement Summary
 */
export interface ProcurementSummary {
  monthlyPlannedTotal: number;
  monthlyPurchasedTotal: number;
  monthlyInTransitTotal: number;
  top5Materials: Array<{
    materialName: string;
    plannedQuantity: number;
    purchasedQuantity: number;
    executionPercentage: number;
  }>;
}

/**
 * Order Risk Summary
 */
export interface OrderRiskSummary {
  riskOrderCount: number;
  top10RiskOrders: Array<{
    orderId: string;
    client: string;
    product: string;
    plannedArrivalDate: string;
    riskLevel: string;
  }>;
}

/**
 * Production Plan Summary
 */
export interface ProductionPlanSummary {
  factories: Array<{
    factoryName: string;
    targetCapacity: number;
    actualCapacity: number;
    achievementRate: number;
    annualProjectedRate: number; // 全年预期达成率
    isOverCapacity: boolean; // 是否超额（>110%）
    isUnderCapacity: boolean; // 是否不足（<100%）
  }>;
}

/**
 * Get supply chain graph data for all stages
 */
export const getSupplyChainGraphData = (): SupplyChainStageData[] => {
  // Order stage
  const orderAbnormalCount = ordersData.filter(order => {
    const rules = calculateOrderLogicRules(order);
    return rules.status === '异常';
  }).length;

  // Product stage
  const productAbnormalCount = productsData.filter(product => {
    const rules = calculateProductLogicRules(product);
    return rules.status === '异常' || rules.status === '呆滞';
  }).length;

  // Warehouse stage (no specific logic rules, count total)
  // Note: warehousesData is populated by recreateWarehouseRecords()
  const warehouseCount = warehousesData.length;
  const warehouseAbnormalCount = 0; // Warehouses don't have logic rules yet

  // Material stage
  const materialAbnormalCount = materialsData.filter(material => {
    const stock = materialStocksData.find(ms => ms.materialCode === material.materialCode);
    const rules = calculateMaterialLogicRules(material, stock);
    return rules.status === '异常' || rules.status === '呆滞';
  }).length;

  // Supplier stage (no specific logic rules, count unique suppliers)
  const uniqueSuppliers = new Set(suppliersData.map(s => s.supplierId));
  const supplierCount = uniqueSuppliers.size;
  const supplierAbnormalCount = 0; // Suppliers don't have logic rules yet

  return [
    {
      stageName: '订单需求',
      totalCount: ordersData.length,
      abnormalCount: orderAbnormalCount,
      navigateTo: 'delivery',
    },
    {
      stageName: '产品',
      totalCount: productsData.length,
      abnormalCount: productAbnormalCount,
      navigateTo: 'optimization',
    },
    {
      stageName: '仓库',
      totalCount: warehouseCount,
      abnormalCount: warehouseAbnormalCount,
    },
    {
      stageName: '物料',
      totalCount: materialsData.length,
      abnormalCount: materialAbnormalCount,
    },
    {
      stageName: '供应商',
      totalCount: supplierCount,
      abnormalCount: supplierAbnormalCount,
      navigateTo: 'evaluation',
    },
  ];
};

/**
 * Get product inventory summary
 */
export const getProductInventorySummary = (): ProductInventorySummary => {
  const totalProducts = productsData.length;

  // Calculate stagnant products
  const stagnantProducts = productsData.filter(product => {
    const rules = calculateProductLogicRules(product);
    return rules.status === '呆滞';
  });
  const stagnantCount = stagnantProducts.length;
  const stagnantPercentage = totalProducts > 0 ? (stagnantCount / totalProducts) * 100 : 0;

  // Calculate product stock (minimum stock from materials)
  const productStockData = productsData.map(product => {
    const materialStocks = product.materialCodes.map(materialCode => {
      return materialStocksData
        .filter(stock => stock.materialCode === materialCode)
        .reduce((sum, stock) => sum + stock.remainingStock, 0);
    });
    const minStock = materialStocks.length > 0 ? Math.min(...materialStocks) : 0;
    return {
      productName: product.productName,
      stock: minStock,
    };
  });

  // Top 10 by stock (descending)
  const top10ByStock = productStockData
    .sort((a, b) => b.stock - a.stock)
    .slice(0, 10);

  // Calculate order count per product
  const productOrderData = productsData.map(product => {
    const orderCount = ordersData.filter(o => o.productId === product.productId).length;
    return {
      productName: product.productName,
      orderCount,
    };
  });

  // Top 10 by order count (descending)
  const top10ByOrder = productOrderData
    .sort((a, b) => b.orderCount - a.orderCount)
    .slice(0, 10);

  return {
    totalProducts,
    stagnantCount,
    stagnantPercentage,
    top10ByStock,
    top10ByOrder,
  };
};

/**
 * Get material inventory summary
 */
export const getMaterialInventorySummary = (): MaterialInventorySummary => {
  const totalMaterials = materialsData.length;

  // Calculate total stock
  const totalStock = materialStocksData.reduce((sum, stock) => sum + stock.remainingStock, 0);

  // Calculate stock per material with suppliers
  const materialStockData = materialsData.map(material => {
    const stocks = materialStocksData.filter(ms => ms.materialCode === material.materialCode);
    const stock = stocks.reduce((sum, s) => sum + s.remainingStock, 0);
    const supplierIds = new Set(stocks.map(s => s.supplierId));
    const suppliers = Array.from(supplierIds).map(id => {
      const supplier = suppliersData.find(s => s.supplierId === id);
      return supplier?.supplierName || id;
    });
    return {
      materialName: material.materialName,
      stock,
      suppliers,
    };
  });

  // Top 10 by stock (descending)
  const top10ByStock = materialStockData
    .sort((a, b) => b.stock - a.stock)
    .slice(0, 10);

  // Calculate stagnant materials
  const stagnantMaterials = materialsData
    .map(material => {
      const stock = materialStocksData.find(ms => ms.materialCode === material.materialCode);
      const rules = calculateMaterialLogicRules(material, stock);
      return {
        material,
        rules,
        stock,
      };
    })
    .filter(item => item.rules.status === '呆滞')
    .map(item => {
      const stocks = materialStocksData.filter(ms => ms.materialCode === item.material.materialCode);
      const supplierIds = new Set(stocks.map(s => s.supplierId));
      const suppliers = Array.from(supplierIds).map(id => {
        const supplier = suppliersData.find(s => s.supplierId === id);
        return supplier?.supplierName || id;
      });
      return {
        materialName: item.material.materialName,
        stock: item.stock?.remainingStock || 0,
        suppliers,
      };
    });

  const stagnantCount = stagnantMaterials.length;
  const stagnantPercentage = totalMaterials > 0 ? (stagnantCount / totalMaterials) * 100 : 0;

  return {
    totalTypes: totalMaterials,
    totalStock,
    top10ByStock,
    stagnantCount,
    stagnantPercentage,
    stagnantDetails: stagnantMaterials,
  };
};

/**
 * Get procurement summary for current month
 */
export const getProcurementSummary = (): ProcurementSummary => {
  // Get current month range (first day to last day)
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();
  const firstDay = new Date(currentYear, currentMonth, 1);
  const lastDay = new Date(currentYear, currentMonth + 1, 0);

  // For now, we'll use materialStocksData as a proxy for procurement data
  // In a real system, this would come from a procurement table
  // Calculate monthly planned/purchased based on purchaseTime
  const monthlyStocks = materialStocksData.filter(stock => {
    try {
      const purchaseDate = new Date(stock.purchaseTime);
      return purchaseDate >= firstDay && purchaseDate <= lastDay;
    } catch {
      return false;
    }
  });

  const monthlyPlannedTotal = monthlyStocks.reduce((sum, stock) => sum + stock.purchaseQuantity, 0);
  const monthlyPurchasedTotal = monthlyStocks.reduce((sum, stock) => sum + stock.purchaseQuantity, 0);
  const monthlyInTransitTotal = 0; // Would need additional data source

  // Top 5 materials by planned quantity
  const materialProcurement = new Map<string, { planned: number; purchased: number }>();
  monthlyStocks.forEach(stock => {
    const existing = materialProcurement.get(stock.materialCode) || { planned: 0, purchased: 0 };
    existing.planned += stock.purchaseQuantity;
    existing.purchased += stock.purchaseQuantity;
    materialProcurement.set(stock.materialCode, existing);
  });

  const top5Materials = Array.from(materialProcurement.entries())
    .map(([materialCode, data]) => {
      const material = materialsData.find(m => m.materialCode === materialCode);
      const executionPercentage = data.planned > 0 ? (data.purchased / data.planned) * 100 : 0;
      return {
        materialName: material?.materialName || materialCode,
        plannedQuantity: data.planned,
        purchasedQuantity: data.purchased,
        executionPercentage,
      };
    })
    .sort((a, b) => b.plannedQuantity - a.plannedQuantity)
    .slice(0, 5);

  return {
    monthlyPlannedTotal,
    monthlyPurchasedTotal,
    monthlyInTransitTotal,
    top5Materials,
  };
};

/**
 * Get order risk summary
 */
export const getOrderRiskSummary = (): OrderRiskSummary => {
  // Calculate risk orders (status is '异常')
  const riskOrders = ordersData
    .map(order => {
      const rules = calculateOrderLogicRules(order);
      return {
        order,
        rules,
      };
    })
    .filter(item => item.rules.status === '异常');

  const riskOrderCount = riskOrders.length;

  // Top 10 risk orders
  const top10RiskOrders = riskOrders
    .map(item => {
      const product = productsData.find(p => p.productId === item.order.productId);
      return {
        orderId: item.order.orderId,
        client: item.order.client,
        product: product?.productName || item.order.productId,
        plannedArrivalDate: item.order.plannedArrivalDate || item.order.dueDate,
        riskLevel: item.rules.status === '异常' ? '高风险' : '正常',
      };
    })
    .sort((a, b) => {
      // Sort by risk level first, then by planned arrival date
      if (a.riskLevel !== b.riskLevel) {
        return a.riskLevel === '高风险' ? -1 : 1;
      }
      const dateA = new Date(a.plannedArrivalDate).getTime();
      const dateB = new Date(b.plannedArrivalDate).getTime();
      return dateA - dateB;
    })
    .slice(0, 10);

  return {
    riskOrderCount,
    top10RiskOrders,
  };
};

/**
 * Get production plan summary with annual projection
 */
export const getProductionPlanSummary = (): ProductionPlanSummary => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const yearStart = new Date(currentYear, 0, 1);
  const yearEnd = new Date(currentYear, 11, 31);
  const daysElapsed = Math.ceil((now.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24));
  const totalDays = Math.ceil((yearEnd.getTime() - yearStart.getTime()) / (1000 * 60 * 60 * 24));
  const progressRatio = daysElapsed / totalDays; // 已过时间占比

  // Use actual factoriesData from entityConfigService
  const factories = factoriesData.map((factory: any) => {
    const targetCapacity = factory.targetCapacity || 0;
    const actualCapacity = factory.actualCapacity || 0;
    const achievementRate = targetCapacity > 0
      ? (actualCapacity / targetCapacity) * 100
      : 0;

    // Calculate annual projected achievement rate
    // 假设当前实际产能是已过时间段的累计值，推算全年
    const annualProjectedRate = progressRatio > 0
      ? (achievementRate / progressRatio)
      : achievementRate;

    // Determine if over-capacity (>10%)
    const isOverCapacity = achievementRate > 110;
    const isUnderCapacity = achievementRate < 100;

    return {
      factoryName: factory.factoryName || factory.factoryCode || '未知工厂',
      targetCapacity,
      actualCapacity,
      achievementRate: Math.round(achievementRate * 10) / 10, // Round to 1 decimal
      annualProjectedRate: Math.round(annualProjectedRate * 10) / 10,
      isOverCapacity,
      isUnderCapacity,
    };
  });

  return { factories };
};

