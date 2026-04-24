/**
 * Recommendation Service
 * 
 * Service for generating optimization recommendations based on logic rules.
 * Maps triggered rules and actions to human-readable recommendation text.
 */

import type { LogicRuleResult } from './logicRuleService';
import { calculateProductLogicRules, calculateMaterialLogicRules } from './logicRuleService';
import type { Product, Material } from '../types/ontology';

/**
 * Status priority mapping for recommendation sorting
 * Higher number = higher priority
 */
const STATUS_PRIORITY: Record<string, number> = {
  '呆滞': 3,
  '异常': 2,
  '正常': 1,
};

/**
 * Recommendation template mappings
 */
const RECOMMENDATION_TEMPLATES: Record<string, string> = {
  // Product recommendations
  '停止扩容库存处理': '检测到停止扩容产品仍有库存，建议进行内部消化或改装处理',
  '呆滞库存处理': '检测到呆滞库存（停止服务超过1年），建议进行改装或清退处理',
  
  // Material recommendations
  '呆滞物料处理': '检测到呆滞物料（入库超过2年），建议进行折价处理或报废处理',
  '异常物料处理': '检测到异常物料（入库超过1年），建议进行替代料复用或回售供应商',
  '库存不足处理': '检测到物料库存低于安全水位，建议立即补充物料',
  '库存过满处理': '检测到物料库存接近上限，建议停止采购',
  
  // Order recommendations
  '物料准备超期处理': '订单物料准备已超期，建议催采购',
  '生产超期处理': '订单生产已超期，建议催生产',
  '发货超期处理': '订单发货已超期，建议催发货',
  
  // Procurement recommendations
  '采购执行不足': '本月采购执行率低于预期，建议调整采购计划',
  '采购执行良好': '本月采购执行情况良好，继续保持',
};

/**
 * Action to recommendation mappings
 */
const ACTION_RECOMMENDATIONS: Record<string, string> = {
  // Product actions
  '内部消化': '建议优先在内部项目中消化库存',
  '改装': '建议将产品改装为其他型号或用途',
  '清退': '建议清退呆滞库存，释放仓储空间',
  
  // Material actions
  '折价处理': '建议对呆滞物料进行折价销售',
  '报废处理': '建议对无法使用的物料进行报废处理',
  '替代料复用': '建议寻找替代物料或复用方案',
  '回售供应商': '建议与供应商协商回售方案',
  '物料补充': '建议立即补充物料，避免影响生产',
  '停止采购': '建议暂停采购，避免库存积压',
  
  // Order actions
  '催采购': '建议立即联系采购部门，加快物料采购进度',
  '催生产': '建议立即联系生产部门，加快生产进度',
  '催发货': '建议立即联系物流部门，加快发货进度',
};

/**
 * Generate product inventory recommendations
 */
export const generateProductRecommendations = (rules: LogicRuleResult): string[] => {
  const recommendations: string[] = [];
  
  // Add recommendations based on triggered rules
  rules.triggeredRules.forEach(rule => {
    const template = RECOMMENDATION_TEMPLATES[rule];
    if (template) {
      recommendations.push(template);
    }
  });
  
  // Add recommendations based on actions
  rules.actions.forEach(action => {
    const recommendation = ACTION_RECOMMENDATIONS[action];
    if (recommendation) {
      recommendations.push(recommendation);
    }
  });
  
  // If no specific recommendations, provide general advice
  if (recommendations.length === 0) {
    if (rules.status === '正常') {
      recommendations.push('产品库存状态正常，无需特别处理');
    } else {
      recommendations.push('建议关注产品库存状态，及时处理异常情况');
    }
  }
  
  return recommendations;
};

/**
 * Generate material inventory recommendations
 */
export const generateMaterialRecommendations = (rules: LogicRuleResult): string[] => {
  const recommendations: string[] = [];
  
  // Add recommendations based on triggered rules
  rules.triggeredRules.forEach(rule => {
    const template = RECOMMENDATION_TEMPLATES[rule];
    if (template) {
      recommendations.push(template);
    }
  });
  
  // Add recommendations based on actions
  rules.actions.forEach(action => {
    const recommendation = ACTION_RECOMMENDATIONS[action];
    if (recommendation) {
      recommendations.push(recommendation);
    }
  });
  
  // If no specific recommendations, provide general advice
  if (recommendations.length === 0) {
    if (rules.status === '正常') {
      recommendations.push('物料库存状态正常，无需特别处理');
    } else {
      recommendations.push('建议关注物料库存状态，及时处理异常情况');
    }
  }
  
  return recommendations;
};

/**
 * Generate procurement recommendations
 */
export const generateProcurementRecommendations = (
  executionPercentage: number,
  topMaterials: Array<{ materialName: string; executionPercentage: number }>
): string[] => {
  const recommendations: string[] = [];
  
  // Overall execution rate recommendation
  if (executionPercentage < 50) {
    recommendations.push('本月采购执行率较低，建议加强采购管理，提高执行效率');
  } else if (executionPercentage < 80) {
    recommendations.push('本月采购执行率一般，建议优化采购流程，提升执行效率');
  } else if (executionPercentage >= 80) {
    recommendations.push('本月采购执行情况良好，继续保持');
  }
  
  // Material-specific recommendations
  const lowExecutionMaterials = topMaterials.filter(m => m.executionPercentage < 50);
  if (lowExecutionMaterials.length > 0) {
    const materialNames = lowExecutionMaterials.map(m => m.materialName).join('、');
    recommendations.push(`以下物料执行率较低：${materialNames}，建议重点关注并加快采购进度`);
  }
  
  // High execution materials
  const highExecutionMaterials = topMaterials.filter(m => m.executionPercentage >= 100);
  if (highExecutionMaterials.length > 0) {
    recommendations.push('部分物料已超额完成采购，建议评估是否需要调整后续采购计划');
  }
  
  // If no specific recommendations
  if (recommendations.length === 0) {
    recommendations.push('采购执行情况正常，建议继续保持当前采购节奏');
  }
  
  return recommendations;
};

/**
 * Generate production plan recommendations
 */
export const generateProductionPlanRecommendations = (
  factory: {
    factoryName: string;
    achievementRate: number;
    annualProjectedRate: number;
    isOverCapacity: boolean;
    isUnderCapacity: boolean;
  }
): string[] => {
  const recommendations: string[] = [];
  
  // Annual projected rate recommendation
  if (factory.annualProjectedRate > 100) {
    recommendations.push(`${factory.factoryName}全年预期达成率${factory.annualProjectedRate.toFixed(1)}%，预计将超额完成年度目标`);
  } else if (factory.annualProjectedRate < 100) {
    recommendations.push(`${factory.factoryName}全年预期达成率${factory.annualProjectedRate.toFixed(1)}%，预计将无法完成年度目标，需要加强产能管理`);
  } else {
    recommendations.push(`${factory.factoryName}全年预期达成率${factory.annualProjectedRate.toFixed(1)}%，预计将刚好完成年度目标`);
  }
  
  // Over-capacity recommendations (>110%)
  if (factory.isOverCapacity) {
    recommendations.push(`【${factory.factoryName}产能超额】实际产能超过目标产能10%以上，建议：产能调配、订单分配优化、设备维护计划`);
  }
  
  // Under-capacity recommendations (<100%)
  if (factory.isUnderCapacity) {
    recommendations.push(`【${factory.factoryName}产能不足】【工厂不能停产】实际产能低于目标产能，建议：订单延期、产能调配、外协生产`);
  }
  
  // If no specific recommendations
  if (recommendations.length === 0) {
    recommendations.push(`${factory.factoryName}产能状态正常，无需特别处理`);
  }
  
  return recommendations;
};

/**
 * Generate aggregated product recommendations across all products
 * Returns top 3-5 recommendations sorted by priority
 */
export const generateAggregatedProductRecommendations = (
  products: Product[]
): string[] => {
  if (products.length === 0) {
    return [];
  }

  // Collect all recommendations with metadata
  const allRecommendations: Array<{
    text: string;
    status: string;
    stockQuantity: number;
    productId: string;
  }> = [];

  products.forEach(product => {
    const rules = calculateProductLogicRules(product);
    const recommendations = generateProductRecommendations(rules);
    
    recommendations.forEach(rec => {
      allRecommendations.push({
        text: rec,
        status: rules.status,
        stockQuantity: product.stockQuantity || 0,
        productId: product.productId,
      });
    });
  });

  // Deduplicate by text, keep highest priority instance
  const deduplicated = new Map<string, typeof allRecommendations[0]>();
  allRecommendations.forEach(rec => {
    const existing = deduplicated.get(rec.text);
    if (!existing) {
      deduplicated.set(rec.text, rec);
    } else {
      // Compare priority: status first, then stock quantity
      const existingPriority = STATUS_PRIORITY[existing.status] || 0;
      const newPriority = STATUS_PRIORITY[rec.status] || 0;
      
      if (newPriority > existingPriority || 
          (newPriority === existingPriority && rec.stockQuantity > existing.stockQuantity)) {
        deduplicated.set(rec.text, rec);
      }
    }
  });

  // Sort by priority (status desc, stock quantity desc)
  const sorted = Array.from(deduplicated.values()).sort((a, b) => {
    const priorityA = STATUS_PRIORITY[a.status] || 0;
    const priorityB = STATUS_PRIORITY[b.status] || 0;
    
    if (priorityB !== priorityA) {
      return priorityB - priorityA;  // Status priority descending
    }
    return b.stockQuantity - a.stockQuantity;  // Stock quantity descending
  });

  // Return top 3-5
  return sorted.slice(0, 5).map(rec => rec.text);
};

/**
 * Generate aggregated material recommendations across all materials
 * Returns top 3-5 recommendations sorted by priority
 */
export const generateAggregatedMaterialRecommendations = (
  materials: Material[]
): string[] => {
  if (materials.length === 0) {
    return [];
  }

  // Collect all recommendations with metadata
  const allRecommendations: Array<{
    text: string;
    status: string;
    currentStock: number;
    materialCode: string;
  }> = [];

  materials.forEach(material => {
    const rules = calculateMaterialLogicRules(material);
    const recommendations = generateMaterialRecommendations(rules);
    
    recommendations.forEach(rec => {
      allRecommendations.push({
        text: rec,
        status: rules.status,
        currentStock: material.currentStock || 0,
        materialCode: material.materialCode,
      });
    });
  });

  // Deduplicate by text, keep highest priority instance
  const deduplicated = new Map<string, typeof allRecommendations[0]>();
  allRecommendations.forEach(rec => {
    const existing = deduplicated.get(rec.text);
    if (!existing) {
      deduplicated.set(rec.text, rec);
    } else {
      // Compare priority: status first, then current stock
      const existingPriority = STATUS_PRIORITY[existing.status] || 0;
      const newPriority = STATUS_PRIORITY[rec.status] || 0;
      
      if (newPriority > existingPriority || 
          (newPriority === existingPriority && rec.currentStock > existing.currentStock)) {
        deduplicated.set(rec.text, rec);
      }
    }
  });

  // Sort by priority (status desc, current stock desc)
  const sorted = Array.from(deduplicated.values()).sort((a, b) => {
    const priorityA = STATUS_PRIORITY[a.status] || 0;
    const priorityB = STATUS_PRIORITY[b.status] || 0;
    
    if (priorityB !== priorityA) {
      return priorityB - priorityA;  // Status priority descending
    }
    return b.currentStock - a.currentStock;  // Current stock descending
  });

  // Return top 3-5
  return sorted.slice(0, 5).map(rec => rec.text);
};

