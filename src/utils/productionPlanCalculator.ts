/**
 * Production Plan Calculator
 *
 * Implements production planning logic for three modes:
 * - Default: Simple fixed-time calculation
 * - Material Ready: Wait for all materials, then continuous production
 * - Delivery Priority: Start production immediately with available stock, wait for materials, continue
 *
 * Data field mappings from HD供应链业务知识网络.json:
 * - Material delivery cycle: delivery_duration (物料对象)
 * - Product assembly time: assembly_time (产品对象)
 * - Available inventory: available_quantity (库存对象)
 * - BOM quantity: child_quantity (产品BOM对象)
 * - BOM loss rate: loss_rate (产品BOM对象)
 */

import type {
  BOMItem,
  GanttTaskExtended,
  MaterialRequirementAnalysis,
  ProductionPhase,
  ProductionPlanMode,
  RiskAlert,
  GanttCalculationResult,
  Inventory,
} from '../types/ontology';

// Default values when data is not available from API
const DEFAULT_DELIVERY_CYCLE = 15; // days
const DEFAULT_ASSEMBLY_TIME = 5;   // days
const DEFAULT_CAPACITY_PER_DAY = 10; // units per day
const DEFAULT_MATERIAL_PROCESSING_TIME = 3; // days
const DEFAULT_COMPONENT_PROCESSING_TIME = 5; // days

/**
 * Calculate material requirement analysis for all BOM items
 */
export function analyzeMaterialRequirements(
  bomItems: BOMItem[],
  plannedQuantity: number,
  inventoryMap: Map<string, number>,
  deliveryCycleMap: Map<string, number>,
  startDate: Date = new Date()
): MaterialRequirementAnalysis[] {
  const results: MaterialRequirementAnalysis[] = [];

  // Flatten BOM to get all leaf materials
  const flattenBOM = (items: BOMItem[], parentQuantity: number = 1): void => {
    for (const item of items) {
      const quantityPerUnit = (item.quantity || item.quantityPerSet || 1) * parentQuantity;
      const lossRate = item.loss_rate || 0;
      const effectiveQuantity = quantityPerUnit * (1 + lossRate);

      if (item.type === 'material' || !item.children || item.children.length === 0) {
        // This is a leaf material
        const requiredQuantity = Math.ceil(plannedQuantity * effectiveQuantity);
        const currentInventory = inventoryMap.get(item.child_code) || 0;
        const shortage = Math.max(0, requiredQuantity - currentInventory);
        const deliveryCycle = deliveryCycleMap.get(item.child_code) || item.deliveryCycle || DEFAULT_DELIVERY_CYCLE;

        const arrivalDate = new Date(startDate);
        arrivalDate.setDate(arrivalDate.getDate() + deliveryCycle);

        const canSupportQuantity = Math.floor(currentInventory / effectiveQuantity);

        results.push({
          materialCode: item.child_code,
          materialName: item.child_name,
          requiredQuantity,
          currentInventory,
          shortage,
          deliveryCycle,
          arrivalDate,
          canSupportQuantity,
          quantityPerUnit: effectiveQuantity,
        });
      }

      // Recurse into children
      if (item.children && item.children.length > 0) {
        flattenBOM(item.children, effectiveQuantity);
      }
    }
  };

  flattenBOM(bomItems);
  return results;
}

/**
 * Calculate production plan using default mode (simple fixed time)
 */
export function calculateDefaultMode(
  bomItems: BOMItem[],
  plannedQuantity: number,
  startDate: Date = new Date()
): GanttCalculationResult {
  const tasks: GanttTaskExtended[] = [];
  const risks: RiskAlert[] = [];
  let maxEndDate = new Date(startDate);

  // Helper to create tasks recursively with backward scheduling
  const createTasks = (
    items: BOMItem[],
    parentEndDate: Date,
    level: number,
    parentId?: string
  ): GanttTaskExtended[] => {
    const result: GanttTaskExtended[] = [];

    for (const item of items) {
      // Determine processing time based on type
      let processingTime: number;
      switch (item.type) {
        case 'product':
          processingTime = item.processingTime || DEFAULT_ASSEMBLY_TIME;
          break;
        case 'module':
          processingTime = item.processingTime || DEFAULT_COMPONENT_PROCESSING_TIME + 1;
          break;
        case 'component':
          processingTime = item.processingTime || DEFAULT_COMPONENT_PROCESSING_TIME;
          break;
        case 'material':
        default:
          processingTime = item.processingTime || DEFAULT_MATERIAL_PROCESSING_TIME;
      }

      // Backward scheduling: end date is parent's start date
      const endDate = new Date(parentEndDate);
      const taskStartDate = new Date(endDate);
      taskStartDate.setDate(taskStartDate.getDate() - processingTime);

      // Track max end date for total cycle calculation
      if (endDate > maxEndDate) {
        maxEndDate = new Date(endDate);
      }

      const hasChildren = item.children && item.children.length > 0;
      const task: GanttTaskExtended = {
        id: `${item.child_code}-${level}`,
        name: item.child_name,
        type: item.type || 'material',
        level,
        startDate: taskStartDate,
        endDate: endDate,
        duration: processingTime,
        status: 'normal',
        mode: 'default',
        isExpanded: level === 0, // Only product level expanded by default
        canExpand: hasChildren,
        parentId,
        bomItem: item,
      };

      // Process children recursively
      if (hasChildren) {
        task.children = createTasks(
          item.children!,
          taskStartDate, // Children end when this task starts
          level + 1,
          task.id
        );
      }

      result.push(task);
    }

    return result;
  };

  // Calculate end date for the product (start from today + total cycle)
  const estimatedTotalCycle = estimateTotalCycle(bomItems);
  const productEndDate = new Date(startDate);
  productEndDate.setDate(productEndDate.getDate() + estimatedTotalCycle);

  // Create tasks with backward scheduling from product end date
  const createdTasks = createTasks(bomItems, productEndDate, 0);
  tasks.push(...createdTasks);

  const totalCycle = Math.ceil((maxEndDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  return {
    totalCycle,
    tasks,
    risks,
    materialAnalysis: [],
    completionDate: maxEndDate,
  };
}

// ============================================================================
// Helper Functions for Parallel Calculation Logic
// ============================================================================

/**
 * 计算BOM树中每一层级的最大组装时间（用于并行组装）
 */
function calculateMaxAssemblyTimeByLevel(
  bomItems: BOMItem[],
  targetLevel: number,
  currentLevel: number = 0
): number {
  if (bomItems.length === 0) return 0;

  if (currentLevel === targetLevel) {
    // 当前层级，找最大组装时间
    let maxTime = 0;
    for (const item of bomItems) {
      const processingTime = item.processingTime ||
        (item.type === 'material' ? DEFAULT_MATERIAL_PROCESSING_TIME : DEFAULT_COMPONENT_PROCESSING_TIME);
      maxTime = Math.max(maxTime, processingTime);
    }
    return maxTime;
  }

  // 递归查找目标层级
  let maxTime = 0;
  for (const item of bomItems) {
    if (item.children && item.children.length > 0) {
      const childMaxTime = calculateMaxAssemblyTimeByLevel(
        item.children,
        targetLevel,
        currentLevel + 1
      );
      maxTime = Math.max(maxTime, childMaxTime);
    }
  }
  return maxTime;
}

/**
 * 计算BOM树的最大深度
 */
function calculateBOMDepth(bomItems: BOMItem[], currentDepth: number = 0): number {
  if (bomItems.length === 0) return currentDepth;

  let maxDepth = currentDepth;
  for (const item of bomItems) {
    if (item.children && item.children.length > 0) {
      const childDepth = calculateBOMDepth(item.children, currentDepth + 1);
      maxDepth = Math.max(maxDepth, childDepth);
    }
  }
  return maxDepth;
}

/**
 * Calculate production plan using material-ready mode
 * Wait for all materials to arrive, then produce continuously
 *
 * 修复逻辑：
 * 1. 所有缺货物料并行采购，等待时间 = max(所有物料交付周期)
 * 2. 各级组件并行组装，从底层往上累加时间
 */
export function calculateMaterialReadyMode(
  bomItems: BOMItem[],
  plannedQuantity: number,
  inventoryMap: Map<string, number>,
  deliveryCycleMap: Map<string, number>,
  capacityPerDay: number = DEFAULT_CAPACITY_PER_DAY,
  startDate: Date = new Date()
): GanttCalculationResult {
  const risks: RiskAlert[] = [];

  console.log(`[物料齐套模式] ========== 开始计算 ==========`);

  // Step 1: Analyze material requirements
  const materialAnalysis = analyzeMaterialRequirements(
    bomItems,
    plannedQuantity,
    inventoryMap,
    deliveryCycleMap,
    startDate
  );

  // Step 2: 所有缺货物料并行采购，取最长交付周期（修复：不再累加）
  const shortageMaterials = materialAnalysis.filter(m => m.shortage > 0);
  let materialReadyDate = new Date(startDate);

  if (shortageMaterials.length > 0) {
    // 并行采购：等待最长交付周期的物料到货
    const maxDeliveryCycle = Math.max(...shortageMaterials.map(m => m.deliveryCycle));
    materialReadyDate.setDate(materialReadyDate.getDate() + maxDeliveryCycle);

    console.log(`[物料齐套模式] ${shortageMaterials.length}个物料缺货，并行采购，最长交付周期：${maxDeliveryCycle}天`);
    console.log(`[物料齐套模式] 物料到齐时间：${materialReadyDate.toISOString().split('T')[0]}`);

    for (const material of shortageMaterials) {
      risks.push({
        type: 'material_shortage',
        level: material.shortage > material.requiredQuantity * 0.5 ? 'critical' : 'warning',
        message: `物料 ${material.materialName} 短缺 ${material.shortage} 个，需等待 ${material.deliveryCycle} 天到货（并行采购）`,
        itemId: material.materialCode,
        itemName: material.materialName,
        aiSuggestion: `建议提前采购或寻找替代供应商，缩短交付周期`,
      });
    }
  } else {
    console.log(`[物料齐套模式] 所有物料库存充足，无需等待`);
  }

  // Step 3: 计算各层级的并行组装时间（修复：从底层往上累加，不再递归累加）
  const bomDepth = calculateBOMDepth(bomItems);
  console.log(`[物料齐套模式] BOM深度：${bomDepth}层`);

  let totalAssemblyTime = 0;
  const levelAssemblyTimes: number[] = [];

  // 从底层往上计算（Level bomDepth-1 是最底层，Level 0 是产品）
  for (let level = bomDepth - 1; level >= 0; level--) {
    const maxTime = calculateMaxAssemblyTimeByLevel(bomItems, level);
    levelAssemblyTimes.push(maxTime);
    totalAssemblyTime += maxTime;
    console.log(`[物料齐套模式] Level ${level} 并行组装时间：${maxTime}天`);
  }

  console.log(`[物料齐套模式] 总组装时间：${totalAssemblyTime}天`);

  // Step 4: 计算最终完成时间
  const productionEndDate = new Date(materialReadyDate);
  productionEndDate.setDate(productionEndDate.getDate() + totalAssemblyTime);

  console.log(`[物料齐套模式] 生产完成时间：${productionEndDate.toISOString().split('T')[0]}`);

  // Step 5: 构建任务（使用修复后的并行逻辑）
  const tasks = buildTasksWithMaterialReadyParallel(
    bomItems,
    startDate,
    materialReadyDate,
    productionEndDate,
    materialAnalysis,
    levelAssemblyTimes,
    0
  );

  const totalCycle = Math.ceil((productionEndDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

  console.log(`[物料齐套模式] 总周期：${totalCycle}天`);
  console.log(`[物料齐套模式] ========== 计算完成 ==========`);

  return {
    totalCycle,
    tasks,
    risks,
    materialAnalysis,
    completionDate: productionEndDate,
  };
}

/**
 * Calculate production plan using delivery-priority mode
 * Start production immediately with available stock, wait for materials, continue
 *
 * 修复逻辑：
 * 1. 计算现有库存可支持的数量（取所有物料的最小支持数）
 * 2. 缺货物料并行采购，等待时间 = max(所有缺货物料交付周期)
 * 3. 物料到齐后继续生产
 */


/**
 * Main calculation function - routes to appropriate mode calculator
 */
export function calculateProductionPlan(
  bomItems: BOMItem[],
  plannedQuantity: number,
  mode: ProductionPlanMode,
  inventoryMap: Map<string, number> = new Map(),
  deliveryCycleMap: Map<string, number> = new Map(),
  capacityPerDay: number = DEFAULT_CAPACITY_PER_DAY,
  startDate: Date = new Date()
): GanttCalculationResult {
  switch (mode) {
    case 'material-ready-v2':
      return calculateMaterialReadyMode(
        bomItems,
        plannedQuantity,
        inventoryMap,
        deliveryCycleMap,
        capacityPerDay,
        startDate
      );

    case 'default':
    default:
      return calculateDefaultMode(bomItems, plannedQuantity, startDate);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Estimate total cycle for default mode based on BOM depth
 */
function estimateTotalCycle(bomItems: BOMItem[]): number {
  let maxDepth = 0;

  const findMaxDepth = (items: BOMItem[], depth: number): void => {
    if (depth > maxDepth) maxDepth = depth;
    for (const item of items) {
      if (item.children && item.children.length > 0) {
        findMaxDepth(item.children, depth + 1);
      }
    }
  };

  findMaxDepth(bomItems, 1);

  // Estimate: each level adds some processing time
  return maxDepth * DEFAULT_COMPONENT_PROCESSING_TIME + DEFAULT_ASSEMBLY_TIME;
}

/**
 * Build tasks for material-ready mode with parallel logic (修复版)
 * 物料并行采购，组件并行组装
 */
function buildTasksWithMaterialReadyParallel(
  bomItems: BOMItem[],
  overallStartDate: Date,
  materialReadyDate: Date,
  productionEndDate: Date,
  materialAnalysis: MaterialRequirementAnalysis[],
  levelAssemblyTimes: number[],
  level: number,
  parentId?: string
): GanttTaskExtended[] {
  const tasks: GanttTaskExtended[] = [];
  const materialMap = new Map(materialAnalysis.map(m => [m.materialCode, m]));

  // 计算当前层级的结束时间（从产品往下倒推）
  let currentLevelEndDate = new Date(productionEndDate);
  for (let i = 0; i < level; i++) {
    const prevLevelTime = levelAssemblyTimes[i] || 0;
    currentLevelEndDate.setDate(currentLevelEndDate.getDate() - prevLevelTime);
  }

  for (const item of bomItems) {
    const hasChildren = item.children && item.children.length > 0;
    const analysis = materialMap.get(item.child_code);

    let taskStartDate: Date;
    let taskEndDate: Date;
    let processingTime: number;

    if (item.type === 'material') {
      // 物料：从开始时间到物料到齐时间
      processingTime = item.processingTime || DEFAULT_MATERIAL_PROCESSING_TIME;
      taskStartDate = new Date(overallStartDate);
      taskEndDate = new Date(materialReadyDate);
    } else {
      // 组件/产品：在当前层级内并行组装
      processingTime = item.processingTime ||
        (item.type === 'product' ? DEFAULT_ASSEMBLY_TIME : DEFAULT_COMPONENT_PROCESSING_TIME);
      taskEndDate = new Date(currentLevelEndDate);
      taskStartDate = new Date(taskEndDate);
      taskStartDate.setDate(taskStartDate.getDate() - processingTime);
    }

    const task: GanttTaskExtended = {
      id: `${item.child_code}-${level}`,
      name: item.child_name,
      type: item.type || 'material',
      level,
      startDate: taskStartDate,
      endDate: taskEndDate,
      duration: processingTime,
      status: analysis && analysis.shortage > 0 ? 'warning' : 'normal',
      mode: 'material-ready-v2',
      isExpanded: level === 0,
      canExpand: hasChildren,
      parentId,
      bomItem: item,
      materialAnalysis: analysis ? [analysis] : undefined,
    };

    if (hasChildren) {
      task.children = buildTasksWithMaterialReadyParallel(
        item.children!,
        overallStartDate,
        materialReadyDate,
        taskStartDate, // 子级的结束时间 = 父级的开始时间
        materialAnalysis,
        levelAssemblyTimes,
        level + 1,
        task.id
      );
    }

    tasks.push(task);
  }

  return tasks;
}

/**
 * Build tasks for material-ready mode (旧版本 - 保留以防回滚)
 * @deprecated 使用 buildTasksWithMaterialReadyParallel 代替
 */
function buildTasksWithMaterialReady(
  bomItems: BOMItem[],
  materialReadyDate: Date,
  productionEndDate: Date,
  materialAnalysis: MaterialRequirementAnalysis[],
  level: number,
  parentId?: string
): GanttTaskExtended[] {
  const tasks: GanttTaskExtended[] = [];
  const materialMap = new Map(materialAnalysis.map(m => [m.materialCode, m]));

  for (const item of bomItems) {
    const hasChildren = item.children && item.children.length > 0;
    const analysis = materialMap.get(item.child_code);

    // For materials, use their delivery dates
    // For components/products, use backward scheduling from production end
    let taskStartDate: Date;
    let taskEndDate: Date;
    let processingTime: number;

    if (item.type === 'material') {
      processingTime = item.processingTime || DEFAULT_MATERIAL_PROCESSING_TIME;
      taskEndDate = new Date(materialReadyDate);
      taskStartDate = new Date(taskEndDate);
      taskStartDate.setDate(taskStartDate.getDate() - processingTime);
    } else {
      processingTime = item.processingTime || DEFAULT_COMPONENT_PROCESSING_TIME;
      taskEndDate = new Date(productionEndDate);
      taskStartDate = new Date(taskEndDate);
      taskStartDate.setDate(taskStartDate.getDate() - processingTime);
    }

    const task: GanttTaskExtended = {
      id: `${item.child_code}-${level}`,
      name: item.child_name,
      type: item.type || 'material',
      level,
      startDate: taskStartDate,
      endDate: taskEndDate,
      duration: processingTime,
      status: analysis && analysis.shortage > 0 ? 'warning' : 'normal',
      mode: 'material-ready-v2',
      isExpanded: level === 0,
      canExpand: hasChildren,
      parentId,
      bomItem: item,
      materialAnalysis: analysis ? [analysis] : undefined,
    };

    if (hasChildren) {
      task.children = buildTasksWithMaterialReady(
        item.children!,
        materialReadyDate,
        taskStartDate,
        materialAnalysis,
        level + 1,
        task.id
      );
    }

    tasks.push(task);
  }

  return tasks;
}

/**
 * Build tasks for delivery-priority mode with phases
 */


/**
 * Build inventory map from Inventory array
 */
export function buildInventoryMap(inventories: Inventory[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const inv of inventories) {
    map.set(inv.material_code, inv.available_quantity || inv.inventory_data || 0);
  }
  return map;
}

/**
 * Build delivery cycle map from material data
 * Note: delivery_duration should come from Material object in knowledge network
 */
export function buildDeliveryCycleMap(
  materials: Array<{ material_code: string; delivery_duration?: number }>
): Map<string, number> {
  const map = new Map<string, number>();
  for (const mat of materials) {
    if (mat.delivery_duration) {
      map.set(mat.material_code, mat.delivery_duration);
    }
  }
  return map;
}

/**
 * Get visible tasks based on expanded state
 */
export function getVisibleTasks(
  tasks: GanttTaskExtended[],
  expandedState: Map<string, boolean>
): GanttTaskExtended[] {
  const visibleTasks: GanttTaskExtended[] = [];

  const traverse = (taskList: GanttTaskExtended[], isVisible: boolean): void => {
    for (const task of taskList) {
      if (isVisible) {
        visibleTasks.push(task);
      }

      if (task.children && task.children.length > 0) {
        const isExpanded = expandedState.get(task.id) ?? task.isExpanded ?? false;
        traverse(task.children, isVisible && isExpanded);
      }
    }
  };

  traverse(tasks, true);
  return visibleTasks;
}

/**
 * Initialize expanded state - only expand product level by default
 */
export function initializeExpandedState(
  tasks: GanttTaskExtended[]
): Map<string, boolean> {
  const state = new Map<string, boolean>();

  const traverse = (taskList: GanttTaskExtended[]): void => {
    for (const task of taskList) {
      // Only product level (level 0) expanded by default
      state.set(task.id, task.level === 0);

      if (task.children && task.children.length > 0) {
        traverse(task.children);
      }
    }
  };

  traverse(tasks);
  return state;
}
