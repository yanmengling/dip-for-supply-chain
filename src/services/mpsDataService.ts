/**
 * MPS Data Service
 *
 * 提供MPS甘特图所需的数据获取和转换服务
 * 符合Constitution Principle 1 & 7: 所有数据从供应链知识网络API获取，无CSV fallback
 */

import { ontologyApi } from '../api';
import type {
  APIProduct,
  ProductionPlan,
  Inventory,
  BOMItem,
  BOMNode,
  PlanInfo
} from '../types/ontology';
import type { QueryCondition } from '../api/ontologyApi';

// ============================================================================
// 对象类型ID常量
// ============================================================================

import { apiConfigService } from './apiConfigService';

// ============================================================================
// 对象类型ID常量 (已修正：使用配置服务获取)
// ============================================================================

const getObjectTypeIds = () => ({
  PRODUCT: apiConfigService.getOntologyObjectId('oo_product') || '',           // 产品对象类型
  PRODUCTION_PLAN: apiConfigService.getOntologyObjectId('oo_production_plan') || 'd5704qm9olk4bpa66vp0',   // 工厂生产计划对象类型
  INVENTORY: apiConfigService.getOntologyObjectId('oo_inventory') || '',         // 库存对象类型
  SALES_ORDER: apiConfigService.getOntologyObjectId('oo_sales_order') || '',       // 销售订单对象类型
  BOM: apiConfigService.getOntologyObjectId('oo_bom') || '',              // 产品BOM对象类型
});

// Note: DataSourceResponse type removed - all functions now return direct data from API
// CSV fallback logic completely removed per Constitution Principle 1 & 7

// ============================================================================
// API数据获取函数
// ============================================================================

/**
 * 获取产品列表
 * 符合Constitution Principle 1: 仅从API获取数据，字段名遵循HD供应链业务知识网络.json
 */
export async function fetchProductList(): Promise<APIProduct[]> {
  const objectTypeIds = getObjectTypeIds();
  const response = await ontologyApi.queryObjectInstances(objectTypeIds.PRODUCT, {
    limit: 100,
    need_total: true,
  });

  return response.entries.map((item: any) => ({
    product_code: item.product_code || '',
    product_name: item.product_name || '',
    product_model: item.product_model,
    product_series: item.product_series,
    product_type: item.product_type,
    amount: item.amount ? parseFloat(item.amount) : undefined,
  })).filter((p: APIProduct) => p.product_code && p.product_name);
}

/**
 * 获取工厂生产计划
 * 符合Constitution Principle 1: 仅从API获取数据，字段名遵循HD供应链业务知识网络.json
 */
export async function fetchProductionPlan(productCode: string): Promise<ProductionPlan[]> {
  const condition: QueryCondition = {
    operation: '==',
    field: 'code',
    value: productCode,
    value_from: 'const',
  };

  const objectTypeIds = getObjectTypeIds();
  const response = await ontologyApi.queryObjectInstances(objectTypeIds.PRODUCTION_PLAN, {
    condition,
    limit: 1000,
  });

  return response.entries.map((item: any) => ({
    order_number: item.order_number || '',
    code: item.code || '',
    quantity: item.quantity ? parseInt(item.quantity) : 0,
    start_time: item.start_time || '',
    end_time: item.end_time || '',
    status: item.status,
    priority: item.priority ? parseInt(item.priority) : undefined,
    ordered: item.ordered ? parseInt(item.ordered) : undefined,
  })).filter((p: ProductionPlan) => p.order_number && p.code === productCode);
}

/**
 * 获取库存信息
 * 符合Constitution Principle 1: 仅从API获取数据，字段名遵循HD供应链业务知识网络.json
 */
export async function fetchInventory(productCode: string): Promise<Inventory | null> {
  const condition: QueryCondition = {
    operation: '==',
    field: 'material_code',
    value: productCode,
    value_from: 'const',
  };

  const objectTypeIds = getObjectTypeIds();
  const response = await ontologyApi.queryObjectInstances(objectTypeIds.INVENTORY, {
    condition,
    limit: 100,
  });

  if (response.entries.length === 0) {
    return null;
  }

  const item = response.entries[0];
  return {
    material_code: item.material_code || '',
    material_name: item.material_name,
    inventory_data: item.inventory_data ? parseFloat(item.inventory_data) : 0,
    safety_stock: item.safety_stock ? parseInt(item.safety_stock) : 0,
    available_quantity: item.available_quantity ? parseFloat(item.available_quantity) : undefined,
    inventory_age: item.inventory_age ? parseInt(item.inventory_age) : undefined,
    last_inbound_time: item.last_inbound_time,
    update_time: item.update_time,
  };
}

/**
 * 获取在手订单量（累计签约数量 - 累计发货数量）
 * 符合Constitution Principle 1: 仅从API获取数据，字段名遵循HD供应链业务知识网络.json
 *
 * 计算逻辑：
 * - 查询该产品的所有销售订单
 * - 累加所有订单的 signing_quantity（签约数量）
 * - 累加所有订单的 shipping_quantity（发货数量）
 * - 返回差值：累计签约数量 - 累计发货数量
 */
export async function fetchPendingOrders(productCode: string): Promise<number> {
  const condition: QueryCondition = {
    operation: '==',
    field: 'product_code',
    value: productCode,
    value_from: 'const',
  };

  const objectTypeIds = getObjectTypeIds();
  const response = await ontologyApi.queryObjectInstances(objectTypeIds.SALES_ORDER, {
    condition,
    limit: 1000,
  });

  // 累加所有匹配记录的签约数量和发货数量
  let totalSigningQuantity = 0;
  let totalShippingQuantity = 0;

  response.entries.forEach((item: any) => {
    const signingQty = item.signing_quantity ? parseInt(item.signing_quantity) : 0;
    const shippingQty = item.shipping_quantity ? parseFloat(item.shipping_quantity) : 0;
    totalSigningQuantity += signingQty;
    totalShippingQuantity += shippingQty;
  });

  // 在手订单量 = 累计签约数量 - 累计发货数量
  const pendingOrderQuantity = totalSigningQuantity - totalShippingQuantity;

  console.log(`[mpsDataService] 在手订单量计算: 签约${totalSigningQuantity} - 发货${totalShippingQuantity} = ${pendingOrderQuantity}`);

  return Math.max(0, pendingOrderQuantity); // 确保不返回负数
}

/**
 * 获取BOM数据（递归查询）
 * 符合Constitution Principle 1 & 7: 仅从API获取数据，字段名遵循HD供应链业务知识网络.json
 * 递归查询所有BOM层级，包括替代件
 */
export async function fetchBOMData(productCode: string): Promise<BOMItem[]> {
  console.log(`[mpsDataService] ========== fetchBOMData 开始 ==========`);
  console.log(`[mpsDataService] 产品编码: ${productCode}`);

  const objectTypeIds = getObjectTypeIds();
  console.log(`[mpsDataService] BOM对象类型ID: ${objectTypeIds.BOM}`);

  // 🔍 DEBUG: 首先查询所有BOM数据（无条件）以验证数据是否存在
  console.log(`[mpsDataService] 🔍 DEBUG: 查询所有BOM数据（无条件）...`);
  try {
    const debugResponse = await ontologyApi.queryObjectInstances(objectTypeIds.BOM, {
      limit: 10,
      need_total: true,
    });
    console.log(`[mpsDataService] 🔍 DEBUG: 知识网络中BOM数据总数: ${debugResponse.total_count || debugResponse.entries.length}`);
    if (debugResponse.entries.length > 0) {
      console.log(`[mpsDataService] 🔍 DEBUG: BOM数据示例（前5条）:`, debugResponse.entries.slice(0, 5).map((item: any) => ({
        bom_number: item.bom_number,
        parent_code: item.parent_code,
        child_code: item.child_code,
        child_name: item.child_name,
      })));
    } else {
      console.warn(`[mpsDataService] ⚠️ 知识网络中没有任何BOM数据！请检查数据是否已导入。`);
    }
  } catch (err) {
    console.error(`[mpsDataService] ❌ DEBUG查询失败:`, err);
  }

  // ⚠️ 问题诊断：parent_code字段未建立索引，条件查询返回空结果
  // 解决方案：获取所有BOM数据，然后在客户端递归过滤
  console.log(`[mpsDataService] 🔧 使用客户端过滤方案（parent_code字段未索引）`);

  // Step 1: 获取所有BOM数据（一次性查询，避免多次网络往返）
  console.log(`[mpsDataService] Step 1: 获取所有BOM数据...`);
  const response = await ontologyApi.queryObjectInstances(objectTypeIds.BOM, {
    limit: 10000, // 假设BOM总数不超过10000条
    need_total: true,
  });

  console.log(`[mpsDataService] ✅ 获取到${response.entries.length}条BOM数据`);

  // Step 2: 映射API响应到BOMItem类型
  const allBOMRecords = response.entries.map((item: any) => ({
    bom_id: item.bom_id || item.bom_number || '',
    parent_code: item.parent_code || '',
    child_code: item.child_code || '',
    child_name: item.child_name || '',
    quantity: item.quantity || item.child_quantity ? parseFloat(item.quantity || item.child_quantity) : undefined,
    unit: item.unit || '',
    alternative_part: item.alternative_part,
    alternative_group: item.alternative_group,
    relationship_type: item.relationship_type,
    sequence: item.sequence ? parseInt(item.sequence) : undefined,
    effective_date: item.effective_date,
    expiry_date: item.expiry_date,
    loss_rate: item.loss_rate ? parseFloat(item.loss_rate) : undefined,
  })).filter((bom: BOMItem) => bom.bom_id && bom.parent_code && bom.child_code);

  console.log(`[mpsDataService] 映射后有效BOM记录数: ${allBOMRecords.length}`);

  // Step 3: 客户端递归过滤，构建指定产品的BOM树
  const allBOMItems: BOMItem[] = [];
  const processedCodes = new Set<string>();

  function filterChildren(parentCode: string, level: number = 0) {
    const indent = '  '.repeat(level);

    // 防止循环引用
    if (processedCodes.has(parentCode)) {
      console.log(`${indent}[filterChildren] ⚠️ 跳过已处理的parentCode: ${parentCode}`);
      return;
    }

    // 客户端过滤：查找parent_code匹配的记录
    const children = allBOMRecords.filter(bom => bom.parent_code === parentCode);

    console.log(`${indent}[filterChildren] level=${level}, parentCode=${parentCode}, 找到${children.length}个子项`);

    if (children.length === 0) {
      return; // 自然终止
    }

    if (level === 0 && children.length > 0) {
      console.log(`${indent}[filterChildren] 顶层子项示例（前3条）:`, children.slice(0, 3).map(c => ({
        parent_code: c.parent_code,
        child_code: c.child_code,
        child_name: c.child_name,
      })));
    }

    allBOMItems.push(...children);
    processedCodes.add(parentCode);

    // 递归处理子项
    for (const child of children) {
      filterChildren(child.child_code, level + 1);
    }
  }

  console.log(`[mpsDataService] Step 3: 客户端递归过滤，起始产品编码: ${productCode}`);
  filterChildren(productCode, 0);

  console.log(`[mpsDataService] ========== fetchBOMData 完成 ==========`);
  console.log(`[mpsDataService] 共提取 ${allBOMItems.length} 条相关BOM数据`);

  return allBOMItems;
}

/**
 * 构建BOM树形结构
 * T012: 实现buildBOMTree函数
 */
export function buildBOMTree(
  bomItems: BOMItem[],
  rootCode: string,
  hideAlternatives: boolean = true
): BOMNode[] {
  // 创建节点映射表
  const nodeMap = new Map<string, BOMNode>();
  const alternativeGroups = new Map<number, BOMItem[]>();

  // 第一遍：创建所有节点（不包括替代件，如果hideAlternatives=true）
  for (const item of bomItems) {
    if (hideAlternatives && item.alternative_part === '替代') {
      // 收集替代件到替代组
      if (item.alternative_group) {
        if (!alternativeGroups.has(item.alternative_group)) {
          alternativeGroups.set(item.alternative_group, []);
        }
        alternativeGroups.get(item.alternative_group)!.push(item);
      }
      continue;
    }

    // 创建或更新子节点
    if (!nodeMap.has(item.child_code)) {
      nodeMap.set(item.child_code, {
        code: item.child_code,
        name: item.child_name || item.child_code,
        type: determineNodeType(item.child_code, item.child_name),
        level: 0, // 将在后续计算
        quantity: item.quantity,
        unit: item.unit,
        children: [],
        isExpanded: false,
        alternativeGroup: item.alternative_group,
        alternatives: [],
        isAlternative: item.alternative_part === '替代',
      });
    }
  }

  // 第二遍：构建父子关系
  const rootNodes: BOMNode[] = [];

  function buildNode(parentCode: string, level: number): BOMNode[] {
    const children: BOMNode[] = [];

    for (const item of bomItems) {
      if (item.parent_code !== parentCode) continue;
      if (hideAlternatives && item.alternative_part === '替代') continue;

      const node = nodeMap.get(item.child_code);
      if (!node) continue;

      node.level = level;
      node.children = buildNode(item.child_code, level + 1);

      // 处理替代组
      if (item.alternative_group && alternativeGroups.has(item.alternative_group)) {
        const alternatives = alternativeGroups.get(item.alternative_group)!;
        node.alternatives = alternatives.map(alt => ({
          code: alt.child_code,
          name: alt.child_name || alt.child_code,
          type: determineNodeType(alt.child_code, alt.child_name),
          level: level + 1,
          quantity: alt.quantity,
          unit: alt.unit,
          children: [],
          isExpanded: false,
          alternativeGroup: alt.alternative_group,
          alternatives: [],
          isAlternative: true,
        }));
      }

      children.push(node);
    }

    return children;
  }

  const rootNode = nodeMap.get(rootCode);
  if (rootNode) {
    rootNode.level = 0;
    rootNode.children = buildNode(rootCode, 1);
    rootNodes.push(rootNode);
  } else {
    // 如果根节点不在BOM数据中，创建一个虚拟根节点
    rootNodes.push({
      code: rootCode,
      name: rootCode,
      type: 'product',
      level: 0,
      children: buildNode(rootCode, 1),
      isExpanded: true,
      isAlternative: false,
    });
  }

  return rootNodes;
}

/**
 * 根据编码和名称判断节点类型
 */
function determineNodeType(code: string, name?: string): 'product' | 'component' | 'material' {
  // 简单的启发式判断：可以根据实际业务规则调整
  if (code.startsWith('T') || code.startsWith('PROD-')) {
    return 'product';
  }
  if (name?.includes('BOM') || name?.includes('组件') || name?.includes('模块')) {
    return 'component';
  }
  return 'material';
}

/**
 * 构建计划信息
 * 符合Constitution Principle 1: 仅从API获取数据并聚合
 */
export async function buildPlanInfo(productCode: string, productName?: string): Promise<PlanInfo> {
  // 并行获取所有数据
  const [productionPlans, inventory, pendingOrderQuantity] = await Promise.all([
    fetchProductionPlan(productCode),
    fetchInventory(productCode),
    fetchPendingOrders(productCode),
  ]);

  // 累加生产计划量
  const productionPlanQuantity = productionPlans.reduce(
    (sum, plan) => sum + plan.quantity,
    0
  );

  return {
    productCode,
    productName: productName || productCode,
    productionPlanQuantity,
    inventoryQuantity: inventory?.inventory_data ?? 0,
    safetyStock: inventory?.safety_stock ?? 0,
    pendingOrderQuantity,
  };
}

// ============================================================================
// 齐套模式V2 数据服务函数
// ============================================================================

// 物料对象类型ID
// const MATERIAL_OBJECT_TYPE_ID = 'd56voju9olk4bpa66vcg'; // Removed, using dynamic getter

/**
 * 物料信息接口（从API获取）
 */
export interface MaterialInfo {
  material_code: string;
  material_name: string;
  material_type: '自制' | '外购' | '委外';
  delivery_duration: string;    // 格式: "10天/次" 或 "1000/天"
  specification?: string;
  unit_price?: number;
}

/**
 * 产品扩展信息（包含assembly_time）
 */
export interface ProductExtendedInfo extends APIProduct {
  assembly_time?: string;       // 格式: "1000/天"
}

/**
 * 解析交付时长/生产效率字符串
 *
 * 支持两种格式:
 * - "10天/次" -> { type: 'duration', value: 10 } 表示固定交付周期10天
 * - "1000/天" -> { type: 'rate', value: 1000 } 表示每天可生产1000件
 *
 * @param durationStr 交付时长字符串
 * @returns 解析结果
 */
export function parseDeliveryDuration(durationStr: string | undefined | null): {
  type: 'duration' | 'rate';
  value: number;
} {
  if (!durationStr || typeof durationStr !== 'string') {
    // 默认返回15天交付周期
    return { type: 'duration', value: 15 };
  }

  const trimmed = durationStr.trim();

  // 匹配 "10天/次" 格式（固定交付周期）
  const durationMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*天\s*[\/\\]?\s*次?$/);
  if (durationMatch) {
    return { type: 'duration', value: parseFloat(durationMatch[1]) };
  }

  // 匹配 "1000/天" 格式（生产效率）
  const rateMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*[\/\\]?\s*天$/);
  if (rateMatch) {
    return { type: 'rate', value: parseFloat(rateMatch[1]) };
  }

  // 尝试匹配纯数字（假定为天数）
  const numberMatch = trimmed.match(/^(\d+(?:\.\d+)?)$/);
  if (numberMatch) {
    return { type: 'duration', value: parseFloat(numberMatch[1]) };
  }

  console.warn(`[parseDeliveryDuration] 无法解析: "${durationStr}", 使用默认值15天`);
  return { type: 'duration', value: 15 };
}

/**
 * 解析产品组装时长
 *
 * 格式: "1000/天" -> 每天可生产1000件
 *
 * @param assemblyTimeStr 组装时长字符串
 * @returns 每天生产数量
 */
export function parseProductionRate(assemblyTimeStr: string | undefined | null): number {
  if (!assemblyTimeStr || typeof assemblyTimeStr !== 'string') {
    // 默认返回每天1000件
    return 1000;
  }

  const trimmed = assemblyTimeStr.trim();

  // 匹配 "1000/天" 格式
  const rateMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*[\/\\]?\s*天$/);
  if (rateMatch) {
    return parseFloat(rateMatch[1]);
  }

  // 尝试匹配纯数字
  const numberMatch = trimmed.match(/^(\d+(?:\.\d+)?)$/);
  if (numberMatch) {
    return parseFloat(numberMatch[1]);
  }

  console.warn(`[parseProductionRate] 无法解析: "${assemblyTimeStr}", 使用默认值1000/天`);
  return 1000;
}

/**
 * 计算组装/交付时长（天数）
 *
 * @param quantity 需求数量
 * @param deliveryDuration 交付时长字符串
 * @param materialType 物料类型
 * @returns 天数
 */
export function calculateDuration(
  quantity: number,
  deliveryDuration: string | undefined | null,
  materialType: '自制' | '外购' | '委外'
): number {
  const parsed = parseDeliveryDuration(deliveryDuration);

  if (materialType === '自制') {
    // 自制物料（组件）：按生产效率计算
    if (parsed.type === 'rate' && parsed.value > 0) {
      return Math.ceil(quantity / parsed.value);
    }
    // 如果是duration类型，可能是数据异常，使用默认生产效率
    console.warn(`[calculateDuration] 自制物料使用了duration格式: ${deliveryDuration}`);
    return Math.ceil(quantity / 1000);
  } else {
    // 外购/委外物料：使用固定交付周期
    if (parsed.type === 'duration') {
      return parsed.value;
    }
    // 如果是rate类型，可能是数据异常，使用默认交付周期
    console.warn(`[calculateDuration] 外购/委外物料使用了rate格式: ${deliveryDuration}`);
    return 15;
  }
}

/**
 * 获取物料详细信息（包含delivery_duration和material_type）
 *
 * @param materialCodes 物料编码列表
 * @returns 物料信息Map
 */
export async function fetchMaterialDetails(
  materialCodes: string[]
): Promise<Map<string, MaterialInfo>> {
  if (materialCodes.length === 0) {
    return new Map();
  }

  console.log(`[mpsDataService] fetchMaterialDetails: 查询 ${materialCodes.length} 个物料`);

  // 使用in操作查询多个物料
  const condition: QueryCondition = {
    operation: 'in',
    field: 'material_code',
    value: materialCodes,
    value_from: 'const',
  };

  const objectTypeIds = getObjectTypeIds();
  // Using material ID from config if possible, but fetching dynamically
  const materialObjectId = apiConfigService.getOntologyObjectId('oo_material') || '';

  const response = await ontologyApi.queryObjectInstances(materialObjectId, {
    condition,
    limit: 10000,
  });

  const materialMap = new Map<string, MaterialInfo>();

  for (const item of response.entries) {
    const materialCode = item.material_code;
    if (materialCode) {
      materialMap.set(materialCode, {
        material_code: materialCode,
        material_name: item.material_name || materialCode,
        material_type: item.material_type || '外购',
        delivery_duration: item.delivery_duration || '',
        specification: item.specification,
        unit_price: item.unit_price ? parseFloat(item.unit_price) : undefined,
      });
    }
  }

  console.log(`[mpsDataService] fetchMaterialDetails: 获取到 ${materialMap.size} 个物料信息`);
  return materialMap;
}

/**
 * 获取产品扩展信息（包含assembly_time）
 *
 * @param productCode 产品编码
 * @returns 产品扩展信息
 */
export async function fetchProductExtendedInfo(
  productCode: string
): Promise<ProductExtendedInfo | null> {
  const condition: QueryCondition = {
    operation: '==',
    field: 'product_code',
    value: productCode,
    value_from: 'const',
  };

  const objectTypeIds = getObjectTypeIds();
  const response = await ontologyApi.queryObjectInstances(objectTypeIds.PRODUCT, {
    condition,
    limit: 1,
  });

  if (response.entries.length === 0) {
    return null;
  }

  const item = response.entries[0];
  return {
    product_code: item.product_code || '',
    product_name: item.product_name || '',
    product_model: item.product_model,
    product_series: item.product_series,
    product_type: item.product_type,
    amount: item.amount ? parseFloat(item.amount) : undefined,
    assembly_time: item.assembly_time,
  };
}

/**
 * 批量获取库存信息
 *
 * @param materialCodes 物料编码列表
 * @returns 库存信息Map (material_code -> available_quantity)
 */
export async function fetchInventoryBatch(
  materialCodes: string[]
): Promise<Map<string, number>> {
  if (materialCodes.length === 0) {
    return new Map();
  }

  console.log(`[mpsDataService] fetchInventoryBatch: 查询 ${materialCodes.length} 个物料库存`);

  const condition: QueryCondition = {
    operation: 'in',
    field: 'material_code',
    value: materialCodes,
    value_from: 'const',
  };

  const objectTypeIds = getObjectTypeIds();
  const response = await ontologyApi.queryObjectInstances(objectTypeIds.INVENTORY, {
    condition,
    limit: 10000,
  });

  const inventoryMap = new Map<string, number>();

  for (const item of response.entries) {
    const materialCode = item.material_code;
    if (materialCode) {
      // 优先使用available_quantity，其次inventory_data
      const quantity = item.available_quantity
        ? parseFloat(item.available_quantity)
        : (item.inventory_data ? parseFloat(item.inventory_data) : 0);
      inventoryMap.set(materialCode, quantity);
    }
  }

  console.log(`[mpsDataService] fetchInventoryBatch: 获取到 ${inventoryMap.size} 个库存记录`);
  return inventoryMap;
}

/**
 * 获取齐套模式V2所需的完整数据
 *
 * @param productCode 产品编码
 * @returns 齐套模式V2数据包
 */
export async function fetchMaterialReadyV2Data(productCode: string): Promise<{
  product: ProductExtendedInfo | null;
  productionPlan: ProductionPlan | null;
  bomItems: BOMItem[];
  materialDetails: Map<string, MaterialInfo>;
  inventoryMap: Map<string, number>;
}> {
  console.log(`[mpsDataService] ========== fetchMaterialReadyV2Data 开始 ==========`);
  console.log(`[mpsDataService] 产品编码: ${productCode}`);

  // Step 1: 获取产品信息和生产计划
  const [product, productionPlans] = await Promise.all([
    fetchProductExtendedInfo(productCode),
    fetchProductionPlan(productCode),
  ]);

  // 取第一个生产计划（或优先级最高的）
  const productionPlan = productionPlans.length > 0
    ? productionPlans.sort((a, b) => (a.priority || 999) - (b.priority || 999))[0]
    : null;

  console.log(`[mpsDataService] 产品信息:`, product);
  console.log(`[mpsDataService] 生产计划:`, productionPlan);

  // Step 2: 获取BOM数据
  const bomItems = await fetchBOMData(productCode);
  console.log(`[mpsDataService] BOM数据: ${bomItems.length} 条`);

  // Step 3: 提取所有物料编码
  const allMaterialCodes = new Set<string>();
  for (const bom of bomItems) {
    allMaterialCodes.add(bom.child_code);
  }
  const materialCodeList = Array.from(allMaterialCodes);

  // Step 4: 并行获取物料详情和库存
  const [materialDetails, inventoryMap] = await Promise.all([
    fetchMaterialDetails(materialCodeList),
    fetchInventoryBatch(materialCodeList),
  ]);

  console.log(`[mpsDataService] ========== fetchMaterialReadyV2Data 完成 ==========`);

  return {
    product,
    productionPlan,
    bomItems,
    materialDetails,
    inventoryMap,
  };
}
