/**
 * Logic Rule Service
 * 
 * Service for calculating business logic rules for entities in real-time.
 * Provides functions to evaluate entity states and trigger corresponding actions.
 */

import type { Product, Material, Order } from '../types/ontology';

/**
 * Status priority mapping
 * Higher number = higher priority
 */
const STATUS_PRIORITY: Record<string, number> = {
  '呆滞': 3,
  '异常': 2,
  '正常': 1,
};

/**
 * Result type for logic rule calculations
 */
export interface LogicRuleResult {
  status: string;
  actions: string[];
  triggeredRules: string[];
}

/**
 * Calculate logic rules for Product entity
 * 
 * Rules:
 * 1. If stockQuantity > 0 and status is '停止扩容', trigger '停止扩容库存处理' action
 * 2. If stockQuantity > 0 and status is '停止服务' and (current time - stopServiceDate) >= 365 days, trigger '呆滞库存处理' action
 */
export const calculateProductLogicRules = (product: Product): LogicRuleResult => {
  const triggeredRules: string[] = [];
  const actions: string[] = [];
  let status = '正常';

  // Rule 1: If stockQuantity > 0 and status is '停止扩容'
  if (product.stockQuantity && product.stockQuantity > 0 && product.status === '停止扩容') {
    triggeredRules.push('停止扩容库存处理');
    actions.push('内部消化', '改装');
    status = '异常';
  }

  // Rule 2: If stockQuantity > 0 and status is '停止服务' and (current time - stopServiceDate) > 1 year
  if (product.stockQuantity && product.stockQuantity > 0 && product.status === '停止服务' && product.stopServiceDate) {
    try {
      // Validate date format and handle edge cases
      if (!product.stopServiceDate || product.stopServiceDate.trim() === '') {
        return { status, actions, triggeredRules };
      }
      
      const stopServiceDate = new Date(product.stopServiceDate);
      // Check if date is valid
      if (isNaN(stopServiceDate.getTime())) {
        console.warn('Invalid stopServiceDate format for product:', product.productId, product.stopServiceDate);
        return { status, actions, triggeredRules };
      }
      
      const currentDate = new Date();
      // Handle timezone issues by using UTC dates
      const diffTime = currentDate.getTime() - stopServiceDate.getTime();
      const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365);
      
      if (diffYears >= 1) {  // >= 365 days
        triggeredRules.push('呆滞库存处理');
        actions.push('改装', '清退');
        status = '呆滞';
      }
    } catch (error) {
      // Invalid date, skip this rule
      console.warn('Error calculating stopServiceDate for product:', product.productId, error);
    }
  }

  return { status, actions, triggeredRules };
};

/**
 * Calculate logic rules for Material entity
 * 
 * Rules:
 * 1. If (current time - warehouseInDate) >= 730 days, status is '呆滞', trigger '呆滞物料处理' action
 * 2. If (current time - warehouseInDate) >= 365 days, status is '异常', trigger '异常物料处理' action
 * 3. If (currentStock - minStock) < 10, trigger '物料补充' action
 * 4. If (maxStock - currentStock) < 100, trigger '停止采购' action
 */
export const calculateMaterialLogicRules = (material: Material, materialStock?: { remainingStock?: number }): LogicRuleResult => {
  const triggeredRules: string[] = [];
  const actions: string[] = [];
  let status = '正常';

  // Get current stock from material or materialStock
  const currentStock = material.currentStock || materialStock?.remainingStock || 0;
  const maxStock = material.maxStock || 10000;
  const minStock = material.minStock || 10;

  // Rule 1 & 2: Check warehouseInDate
  if (material.warehouseInDate) {
    try {
      // Validate date format and handle edge cases
      if (!material.warehouseInDate || material.warehouseInDate.trim() === '') {
        // Skip date-based rules if date is empty
      } else {
        const warehouseInDate = new Date(material.warehouseInDate);
        // Check if date is valid
        if (isNaN(warehouseInDate.getTime())) {
          console.warn('Invalid warehouseInDate format for material:', material.materialCode, material.warehouseInDate);
        } else {
          const currentDate = new Date();
          // Handle timezone issues by using UTC dates
          const diffTime = currentDate.getTime() - warehouseInDate.getTime();
          const diffYears = diffTime / (1000 * 60 * 60 * 24 * 365);

          // Rule 1: >= 2 years = 呆滞
          if (diffYears >= 2) {  // >= 730 days
            triggeredRules.push('呆滞物料处理');
            actions.push('折价处理', '报废处理');
            status = '呆滞';
          }
          // Rule 2: >= 1 year = 异常
          else if (diffYears >= 1) {  // >= 365 days
            triggeredRules.push('异常物料处理');
            actions.push('替代料复用', '回售供应商');
            status = '异常';
          }
        }
      }
    } catch (error) {
      // Invalid date, skip this rule
      console.warn('Error calculating warehouseInDate for material:', material.materialCode, error);
    }
  }

  // Rule 3: If (currentStock - minStock) < 10, trigger '物料补充'
  if (currentStock - minStock < 10) {
    triggeredRules.push('库存不足处理');
    actions.push('物料补充');
  }

  // Rule 4: If (maxStock - currentStock) < 100, trigger '停止采购'
  if (maxStock - currentStock < 100) {
    triggeredRules.push('库存过满处理');
    actions.push('停止采购');
  }

  return { status, actions, triggeredRules };
};

/**
 * Calculate logic rules for Order entity
 * 
 * Rules:
 * 1. If current time > plannedArrivalDate and status is '物料准备中', trigger '催采购' action
 * 2. If current time > plannedArrivalDate and status is '生产中', trigger '催生产' action
 * 3. If current time > plannedArrivalDate and status is '库存中', trigger '催发货' action
 */
export const calculateOrderLogicRules = (order: Order): LogicRuleResult => {
  const triggeredRules: string[] = [];
  const actions: string[] = [];
  let status = '正常';

  if (!order.plannedArrivalDate) {
    return { status, actions, triggeredRules };
  }

  try {
    const plannedArrivalDate = new Date(order.plannedArrivalDate);
    const currentDate = new Date();

    // Check if current time > plannedArrivalDate
    if (currentDate > plannedArrivalDate) {
      // Rule 1: status is '物料准备中'
      if (order.status === '物料准备中') {
        triggeredRules.push('物料准备超期处理');
        actions.push('催采购');
        status = '异常';
      }
      // Rule 2: status is '生产中'
      else if (order.status === '生产中') {
        triggeredRules.push('生产超期处理');
        actions.push('催生产');
        status = '异常';
      }
      // Rule 3: status is '库存中'
      else if (order.status === '库存中') {
        triggeredRules.push('发货超期处理');
        actions.push('催发货');
        status = '异常';
      }
    }
  } catch (error) {
    // Invalid date, skip this rule
    console.warn('Invalid plannedArrivalDate for order:', order.orderId, error);
  }

  return { status, actions, triggeredRules };
};

/**
 * Get priority status from multiple statuses
 * Returns the status with highest priority (呆滞 > 异常 > 正常)
 */
export const getPriorityStatus = (statuses: string[]): string => {
  if (statuses.length === 0) return '正常';
  
  const sorted = statuses.sort((a, b) => {
    const priorityA = STATUS_PRIORITY[a] || 0;
    const priorityB = STATUS_PRIORITY[b] || 0;
    return priorityB - priorityA; // Descending order
  });
  
  return sorted[0];
};

