/**
 * Entity Configuration Service
 * 
 * Service layer for CRUD operations on entities and entity configurations.
 * All operations read from and write to in-memory storage.
 */

import type {
  EntityType,
  EntityConfig,
  EntityRelation,
  EntityAction,
  BusinessLogicRule,
  PermissionConfig,
  User,
  Role,
  ActionHistory
} from '../types/ontology';
import {
  calculateProductLogicRules,
  calculateMaterialLogicRules,
  calculateOrderLogicRules
} from './logicRuleService';
import {
  loadProductEntities,
  loadInventoryEvents,
  loadBOMEvents,
  loadSupplierEntities,
  loadMonthlySalesByProduct,
  loadMaterialProcurementEvents,
  loadSupplierPerformanceScores,
  loadSalesOrderEvents,
  loadAlternativeSuppliers,
  loadMaterialEntities
} from '../services/ontologyDataService';
// Import additional types needed for local storage
import type {
  Product, Supplier, Order, Material, MaterialStock,
  Supplier360Scorecard, MainMaterialSupplier
} from '../types/ontology';

// Local storage for entities - initialized empty, populated by populateEntityConfigs
export let suppliersData: Supplier[] = [];
export let materialsData: Material[] = [];
export let productsData: Product[] = [];
export let ordersData: Order[] = [];
export let materialStocksData: MaterialStock[] = [];
export let supplierEvaluationsData: any[] = []; // Deprecated but kept for compatibility
export let supplier360ScorecardsData: Supplier360Scorecard[] = [];
export let mainMaterialSuppliersData: MainMaterialSupplier[] = [];

// Static data for entities not yet in ontology
export let factoriesData: any[] = [
  { factoryId: 'FAC-001', factoryCode: 'F001', factoryName: '深圳生产基地', capacity: 10000, location: 'Shenzhen', productList: ['PROD-T20', 'PROD-T40'], materialList: ['MAT-001'], warehouseList: ['WH-001'] }
];
export let warehousesData: any[] = [
  { warehouseCode: 'WH-001', warehouseName: '深圳中心仓', location: 'Shenzhen', capacity: 50000, currentStock: 32000, associatedFactory: 'F001', storageType: '常温', temperatureControl: '25℃' }
];
export let logisticsData: any[] = [
  { logisticsId: 'LOG-001', companyName: '顺丰速运', contact: '张调度', phone: '13800138000', vehicleCount: 50, routeCount: 120 }
];
export let customersData: any[] = [
  { customerId: 'CUST-001', customerName: '比亚迪汽车', contact: '王经理', phone: '13900000001', email: 'byd@example.com', creditRating: 'AAA', address: '深圳坪山' },
  { customerId: 'CUST-002', customerName: '吉利汽车', contact: '李经理', phone: '13900000002', email: 'geely@example.com', creditRating: 'AA', address: '杭州湾' }
];
export let actionHistories: ActionHistory[] = [];

// Configuration storage
export const entityConfigs = new Map<string, EntityConfig>();

// Static user data
export const usersData: Record<number, User> = {
  1: { userId: 1, name: '管理员', role: 'admin', email: 'admin@huida.com', phone: '13888888888', avatar: '👨‍💼', department: 'IT', status: 'active' },
  2: { userId: 2, name: '采购专员', role: 'procurement', email: 'buyer@huida.com', phone: '13888888889', avatar: '👩‍💼', department: '采购部', status: 'active' }
};

export const rolesData: Record<string, Role> = {
  'admin': { roleId: 'admin', name: '系统管理员', color: 'purple' },
  'procurement': { roleId: 'procurement', name: '采购专员', color: 'blue' },
  'viewer': { roleId: 'viewer', name: '访客', color: 'gray' }
};

// Entity CRUD operations

/**
 * Get all entities of a specific type
 * For suppliers, deduplicate by supplierId to ensure uniqueness
 */
export const getEntitiesByType = (type: EntityType): any[] => {
  // Map entity types to their corresponding data arrays
  // Each type maps to ONLY its own data array to ensure data isolation
  const dataMap: Record<EntityType, any[]> = {
    supplier: suppliersData,
    material: materialsData,
    product: productsData,
    order: ordersData,
    factory: factoriesData,
    warehouse: warehousesData,
    logistics: logisticsData,
    customer: customersData,
  };

  // Get the data array for the requested type ONLY
  // This ensures that warehouse data only appears in warehouse pages, etc.
  const sourceData = dataMap[type];

  // If no data exists or not an array, return empty array
  if (!sourceData || !Array.isArray(sourceData)) {
    return [];
  }

  // Return a deep copy to prevent mutations and ensure data isolation
  // Deduplicate suppliers by supplierId (since one supplier can supply multiple materials)
  if (type === 'supplier') {
    const seen = new Set<string>();
    const unique: any[] = [];
    sourceData.forEach((supplier: any) => {
      if (!seen.has(supplier.supplierId)) {
        seen.add(supplier.supplierId);
        // Get all materials supplied by this supplier
        const materials = suppliersData
          .filter(s => s.supplierId === supplier.supplierId)
          .map(s => ({ materialCode: s.materialCode, materialName: s.materialName }));
        unique.push({
          ...supplier,
          materials, // Add materials array
        });
      }
    });
    return unique;
  }

  // For product type, deduplicate by productId to avoid duplicates
  if (type === 'product') {
    const seen = new Set<string>();
    const unique: any[] = [];
    sourceData.forEach((product: any) => {
      if (!seen.has(product.productId)) {
        seen.add(product.productId);
        unique.push({ ...product });
      }
    });
    return unique;
  }

  // For other types, return a copy of the array with deep cloning for objects
  // This ensures data isolation - each entity type gets only its own data
  return sourceData.map(item => ({ ...item }));
};

/**
 * Get entity by type and ID
 */
export const getEntityById = (type: EntityType, id: string): any | null => {
  const entities = getEntitiesByType(type);
  // Use type-specific ID fields to ensure correct identification
  return entities.find((e: any) => {
    switch (type) {
      case 'supplier':
        return e.supplierId === id;
      case 'material':
        return e.materialCode === id;
      case 'product':
        return e.productId === id;
      case 'order':
        return e.orderId === id;
      case 'warehouse':
        return e.warehouseCode === id;
      case 'factory':
        return e.factoryCode === id;
      case 'logistics':
        return e.logisticsId === id;
      case 'customer':
        return e.customerId === id;
      default:
        return e[`${type}Id`] === id || e.id === id;
    }
  }) || null;
};

/**
 * Create a new entity
 * Also creates corresponding entity configuration
 */
export const createEntity = (type: EntityType, data: Partial<any>): any => {
  const entities = getEntitiesByType(type);
  // Generate ID if not provided
  const id = data.id || data[`${type}Id`] || `${type.toUpperCase()}-${Date.now()}`;
  const newEntity = { ...data, id, [`${type}Id`]: id };
  entities.push(newEntity);

  // Bidirectional sync: create entity config
  const configKey = `${type}-${id}`;
  if (!entityConfigs.has(configKey)) {
    entityConfigs.set(configKey, {
      entityId: id,
      entityType: type,
      attributes: { ...data, id, [`${type}Id`]: id },
      relations: [],
      logicRules: [],
      actions: [],
      permissions: { roles: [], users: [] },
    });
  }

  return newEntity;
};

/**
 * Update an existing entity
 * Also syncs changes to entity configuration if exists
 */
export const updateEntity = (type: EntityType, id: string, data: Partial<any>): any => {
  const entity = getEntityById(type, id);
  if (!entity) {
    throw new Error(`Entity ${id} of type ${type} not found`);
  }
  Object.assign(entity, data);

  // Bidirectional sync: update entity config
  const configKey = `${type}-${id}`;
  const config = entityConfigs.get(configKey);
  if (config) {
    config.attributes = { ...config.attributes, ...data };
    entityConfigs.set(configKey, config);
  }

  return entity;
};

/**
 * Delete an entity
 * Also removes corresponding entity configuration
 */
export const deleteEntity = (type: EntityType, id: string): boolean => {
  const entities = getEntitiesByType(type);
  const index = entities.findIndex((e: any) => {
    if (e[`${type}Id`]) return e[`${type}Id`] === id;
    if (e.id) return e.id === id;
    if (e.materialCode && type === 'material') return e.materialCode === id;
    if (e.productId && type === 'product') return e.productId === id;
    if (e.orderId && type === 'order') return e.orderId === id;
    return false;
  });

  if (index === -1) {
    return false;
  }

  entities.splice(index, 1);

  // Bidirectional sync: delete entity config
  const configKey = `${type}-${id}`;
  entityConfigs.delete(configKey);

  return true;
};

/**
 * Get entity configuration by type and ID
 */
export const getEntityConfig = (entityType: EntityType, entityId: string): EntityConfig | null => {
  const key = `${entityType}-${entityId}`;
  return entityConfigs.get(key) || null;
};

// Knowledge Graph operations

/**
 * Get knowledge graph data for visualization
 * Returns nodes (entity types with counts) and edges (relationships)
 */
export const getKnowledgeGraphData = (): {
  nodes: Array<{ type: EntityType; count: number; name: string }>;
  edges: Array<{ source: EntityType; target: EntityType; relationType: string; count: number }>;
} => {
  const entityTypeNames: Record<EntityType, string> = {
    supplier: '供应商',
    material: '物料',
    factory: '工厂',
    product: '产品',
    warehouse: '仓库',
    order: '订单',
    logistics: '物流',
    customer: '客户',
  };

  // Create nodes with counts
  const nodes = (['supplier', 'material', 'factory', 'product', 'warehouse', 'order', 'logistics', 'customer'] as EntityType[]).map(type => ({
    type,
    count: getEntitiesByType(type).length,
    name: entityTypeNames[type],
  }));

  // Build edges from entity configs relations
  const edgeMap = new Map<string, { source: EntityType; target: EntityType; relationType: string; count: number }>();

  entityConfigs.forEach((config) => {
    config.relations?.forEach((relation) => {
      const edgeKey = `${config.entityType}-${relation.targetType}`;
      const existing = edgeMap.get(edgeKey);
      if (existing) {
        existing.count += relation.count;
      } else {
        edgeMap.set(edgeKey, {
          source: config.entityType,
          target: relation.targetType as EntityType,
          relationType: relation.relationType,
          count: relation.count,
        });
      }
    });
  });

  const edges = Array.from(edgeMap.values());

  return { nodes, edges };
};

// AI Assistant operations

/**
 * Generate business rule from natural language input
 */
export const generateBusinessRule = (input: string, _entityType: EntityType): BusinessLogicRule | null => {
  const lowerInput = input.toLowerCase();

  // Pattern: 库存预警
  if ((lowerInput.includes('库存') || lowerInput.includes('stock')) &&
    (lowerInput.includes('预警') || lowerInput.includes('警告') || lowerInput.includes('alert'))) {
    // Extract threshold if mentioned
    const thresholdMatch = input.match(/(\d+)/);
    const threshold = thresholdMatch ? thresholdMatch[1] : '100';
    return {
      ruleId: `rule-${Date.now()}`,
      ruleType: 'trigger' as const,
      name: '库存预警规则',
      condition: `currentStock < ${threshold}`,
      action: 'sendAlert',
      level: 'critical' as const,
    };
  }

  // Pattern: 质量检查
  if ((lowerInput.includes('质量') || lowerInput.includes('quality')) &&
    (lowerInput.includes('检查') || lowerInput.includes('check'))) {
    return {
      ruleId: `rule-${Date.now()}`,
      ruleType: 'trigger' as const,
      name: '质量检查规则',
      condition: 'qualityRating < 80',
      action: 'qualityCheck',
      level: 'warning' as const,
    };
  }

  return null;
};

// User Management operations

/**
 * Get all users
 */
export const getUsers = (): User[] => {
  return Object.values(usersData);
};

/**
 * Get user by ID
 */
export const getUserById = (userId: number): User | null => {
  return usersData[userId] || null;
};

/**
 * Create a new user
 */
export const createUser = (data: Partial<User>): User => {
  const userId = Object.keys(usersData).length + 1;
  const newUser: User = {
    userId,
    name: `用户${userId}`,
    email: data.email || `user${userId}@example.com`,
    role: data.role || 'viewer',
    phone: '',
    avatar: '👤',
    department: '未分配',
    status: data.status || 'active',
  };
  usersData[userId] = newUser;
  return newUser;
};

/**
 * Update an existing user
 */
export const updateUser = (userId: number, data: Partial<User>): User => {
  const user = getUserById(userId);
  if (!user) {
    throw new Error(`User ${userId} not found`);
  }
  Object.assign(user, data);
  return user;
};

/**
 * Delete a user
 */
export const deleteUser = (userId: number): boolean => {
  if (!usersData[userId]) {
    return false;
  }
  delete usersData[userId];
  return true;
};

// Action execution operations

/**
 * Execute an action and record it in history
 */
export const executeAction = (
  entityType: EntityType,
  entityId: string,
  actionName: string,
  executedBy?: string
): ActionHistory => {
  const history: ActionHistory = {
    actionId: `action-${Date.now()}`,
    entityType,
    entityId,
    actionName,
    executedAt: new Date().toISOString().split('T')[0],
    executedBy,
    result: '已执行',
  };

  actionHistories.push(history);
  return history;
};

/**
 * Get action history for an entity
 */
export const getActionHistory = (entityType: EntityType, entityId: string): ActionHistory[] => {
  return actionHistories.filter(
    (h: ActionHistory) => h.entityType === entityType && h.entityId === entityId
  );
};

// Role Management operations

/**
 * Get all roles
 */
export const getRoles = (): Role[] => {
  return Object.values(rolesData);
};

/**
 * Get role by ID
 */
export const getRoleById = (roleId: string): Role | null => {
  return rolesData[roleId] || null;
};

/**
 * Populate entity configurations from mock data
 * This function should be called after recreateAllMockDataRecords() to ensure
 * data consistency between in-memory data and entityConfigs Map.
 */
export const populateEntityConfigs = async (): Promise<void> => {
  // Clear existing entityConfigs to avoid stale data
  entityConfigs.clear();

  console.log('=== Populating Entity Configurations from Ontology CSV ===');

  try {
    // Load all required data from Ontology Data Service
    const [
      pEntities,
      invEvents,
      bomEvents,
      sEntities,
      mEntities,
      procEvents,
      perfScores,
      salesOrders
    ] = await Promise.all([
      loadProductEntities(),
      loadInventoryEvents(),
      loadBOMEvents(),
      loadSupplierEntities(),
      loadMaterialEntities(),
      loadMaterialProcurementEvents(),
      loadSupplierPerformanceScores(),
      loadSalesOrderEvents()
    ]);

    console.log(`Loaded Ontology Data: ${pEntities.length} products, ${sEntities.length} suppliers, ${mEntities.length} materials`);

    // Map Products
    productsData.length = 0;
    pEntities.forEach(p => {
      const bom = bomEvents.filter(b => b.parent_id === p.product_id).map(b => b.child_code);
      const inventory = invEvents.find(i => i.item_id === p.product_id);
      productsData.push({
        productId: p.product_id,
        productName: p.product_name,
        materialCodes: bom,
        stockQuantity: inventory ? parseInt(inventory.quantity) : 0,
        // @ts-ignore
        status: p.status === 'Active' ? '销售中' : '停止销售',
        startSalesDate: p.created_date
      });
    });

    // Map Materials
    materialsData.length = 0;
    mEntities.forEach(m => {
      const inventory = invEvents
        .filter(i => i.item_code === m.material_code)
        .reduce((sum, i) => sum + parseInt(i.quantity), 0);
      // Reverse lookup BOM for applicable products
      const usedIn = bomEvents.filter(b => b.child_code === m.material_code).map(b => b.parent_id);
      materialsData.push({
        materialCode: m.material_code,
        materialName: m.material_name,
        currentStock: inventory,
        applicableProductIds: Array.from(new Set(usedIn))
      });
    });

    // Map Suppliers (Supplier-Material pairs)
    suppliersData.length = 0;
    // Use procurement events to identify which supplier supplies which material
    const uniquePairs = new Set<string>();
    procEvents.forEach(e => {
      // Create unique key for supplier-material pair
      uniquePairs.add(`${e.supplier_id}|${e.supplier_name}|${e.material_code}|${e.material_name}`);
    });

    uniquePairs.forEach(pair => {
      const [sid, sname, mcode, mname] = pair.split('|');
      suppliersData.push({
        supplierId: sid,
        supplierName: sname,
        materialCode: mcode,
        materialName: mname,
        // Defaults as these fields might not be in procurement event
        qualityRating: 90,
        riskRating: 10
      });
    });

    // If no procurement events, fallback to just supplier entities (without specific material info)
    if (suppliersData.length === 0 && sEntities.length > 0) {
      sEntities.forEach(s => {
        suppliersData.push({
          supplierId: s.supplier_id,
          supplierName: s.supplier_name,
          materialCode: 'UNKNOWN',
          materialName: 'Unknown Material'
        });
      });
    }

    // Map Orders
    ordersData.length = 0;
    salesOrders.forEach(o => {
      ordersData.push({
        orderId: o.sales_order_id,
        orderName: o.sales_order_number,
        client: o.customer_name,
        productId: o.product_id,
        quantity: parseInt(o.quantity),
        orderDate: o.document_date,
        dueDate: o.planned_delivery_date,
        status: o.order_status
      });
    });

    // Map Supplier Scorecards
    supplier360ScorecardsData.length = 0;
    perfScores.forEach(s => {
      supplier360ScorecardsData.push({
        supplierId: s.supplier_id,
        supplierName: s.supplier_name,
        evaluationDate: s.evaluation_date,
        overallScore: parseFloat(s.overall_score),
        dimensions: {
          qualityRating: parseFloat(s.quality_score),
          onTimeDeliveryRate: parseFloat(s.otif_rate),
          responseSpeed: parseFloat(s.service_score),
          riskRating: 10,
          onTimeDeliveryRate2: parseFloat(s.delivery_score),
          annualPurchaseAmount: 1000000
        },
        riskAssessment: {
          supplierId: s.supplier_id,
          assessmentDate: s.evaluation_date,
          financialStatus: { score: 80, lastUpdated: s.evaluation_date },
          publicSentiment: { score: 80, source: 'manual', lastUpdated: s.evaluation_date },
          productionAnomalies: { count: 0, severity: 'low', source: 'manual', lastUpdated: s.evaluation_date },
          legalRisks: { score: 0, source: 'auto', lastUpdated: s.evaluation_date, risks: [] },
          overallRiskLevel: 'low'
        }
      });
    });

    // Map Main Material Suppliers
    mainMaterialSuppliersData.length = 0;
    materialsData.forEach(m => {
      const suppliers = suppliersData.filter(s => s.materialCode === m.materialCode);
      if (suppliers.length > 0) {
        mainMaterialSuppliersData.push({
          materialCode: m.materialCode,
          materialName: m.materialName,
          supplierId: suppliers[0].supplierId,
          supplierName: suppliers[0].supplierName,
          currentStock: m.currentStock || 0,
          qualityRating: 90,
          riskRating: 10,
          onTimeDeliveryRate: 98,
          annualPurchaseAmount: 500000,
          riskCoefficient: 10,
          qualityEvents: [],
          rank: 1
        });
      }
    });

  } catch (error) {
    console.error('Failed to populate entity configs from Ontology CSVs:', error);
  }

  console.log('=== Populating Entity Configurations ===');

  // Helper functions for default values
  const getDefaultAttributes = (_type: EntityType): Record<string, any> => {
    return {};
  };

  const getEntityTypeDisplayName = (type: EntityType): string => {
    const typeNames: Record<EntityType, string> = {
      supplier: '供应商',
      material: '物料',
      factory: '工厂',
      product: '产品',
      warehouse: '仓库',
      order: '订单',
      logistics: '物流',
      customer: '客户',
    };
    return typeNames[type] || type;
  };

  const getDefaultLogicRules = (type: EntityType, entity?: any): BusinessLogicRule[] => {
    const typeName = getEntityTypeDisplayName(type);
    const commonRules: BusinessLogicRule[] = [
      {
        ruleId: `rule-${type}-validation-001`,
        ruleType: 'validation',
        name: `${typeName}数据验证规则`,
        condition: `${type}Id !== null && ${type}Name !== ''`,
        level: 'warning',
      },
    ];

    switch (type) {
      case 'supplier':
        return [
          ...commonRules,
          {
            ruleId: 'rule-supplier-quality-001',
            ruleType: 'validation',
            name: '供应商质量评级检查',
            condition: 'qualityRating >= 70',
            level: 'warning',
          },
          {
            ruleId: 'rule-supplier-risk-001',
            ruleType: 'trigger',
            name: '供应商风险预警',
            condition: 'riskLevel === "high"',
            action: 'sendRiskAlert',
            level: 'critical',
          },
          {
            ruleId: 'rule-supplier-delivery-001',
            ruleType: 'calculation',
            name: '准时交付率计算',
            condition: 'onTimeDeliveryRate < 80',
            formula: 'onTimeDeliveryRate = (deliveredOnTime / totalDeliveries) * 100',
            level: 'warning',
          },
        ];
      case 'material':
        // Use calculated logic rules if entity is provided
        if (entity) {
          const materialStock = materialStocksData.find(ms => ms.materialCode === entity.materialCode);
          const calculatedRules = calculateMaterialLogicRules(entity, materialStock);
          const dynamicRules: BusinessLogicRule[] = calculatedRules.triggeredRules.map((rule, index) => ({
            ruleId: `rule-material-calculated-${index}`,
            ruleType: 'trigger' as const,
            name: rule,
            condition: '实时计算',
            action: calculatedRules.actions[index] || '',
            level: calculatedRules.status === '呆滞' ? 'critical' as const : 'warning' as const,
          }));
          return [...commonRules, ...dynamicRules];
        }
        return [
          ...commonRules,
          {
            ruleId: 'rule-material-stock-001',
            ruleType: 'trigger',
            name: '物料库存预警',
            condition: 'currentStock < safetyStock',
            action: 'sendStockAlert',
            level: 'critical',
          },
          {
            ruleId: 'rule-material-supplier-001',
            ruleType: 'validation',
            name: '物料供应商检查',
            condition: 'supplierCount > 0',
            level: 'warning',
          },
        ];
      case 'product':
        // Use calculated logic rules if entity is provided
        if (entity) {
          const calculatedRules = calculateProductLogicRules(entity);
          const dynamicRules: BusinessLogicRule[] = calculatedRules.triggeredRules.map((rule, index) => ({
            ruleId: `rule-product-calculated-${index}`,
            ruleType: 'trigger' as const,
            name: rule,
            condition: '实时计算',
            action: calculatedRules.actions[index] || '',
            level: calculatedRules.status === '呆滞' ? 'critical' as const : 'warning' as const,
          }));
          return [...commonRules, ...dynamicRules];
        }
        return [
          ...commonRules,
          {
            ruleId: 'rule-product-bom-001',
            ruleType: 'validation',
            name: 'BOM完整性检查',
            condition: 'BOM.length > 0',
            level: 'warning',
          },
          {
            ruleId: 'rule-product-lifecycle-001',
            ruleType: 'trigger',
            name: '产品生命周期预警',
            condition: 'lifecycle === "Decline"',
            action: 'sendLifecycleAlert',
            level: 'warning',
          },
        ];
      case 'order':
        // Use calculated logic rules if entity is provided
        if (entity) {
          const calculatedRules = calculateOrderLogicRules(entity);
          const dynamicRules: BusinessLogicRule[] = calculatedRules.triggeredRules.map((rule, index) => ({
            ruleId: `rule-order-calculated-${index}`,
            ruleType: 'trigger' as const,
            name: rule,
            condition: '实时计算',
            action: calculatedRules.actions[index] || '',
            level: calculatedRules.status === '异常' ? 'critical' as const : 'warning' as const,
          }));
          return [...commonRules, ...dynamicRules];
        }
        return [
          ...commonRules,
          {
            ruleId: 'rule-order-delay-001',
            ruleType: 'trigger',
            name: '订单延期预警',
            condition: 'delay > 3',
            action: 'sendDelayAlert',
            level: 'critical',
          },
          {
            ruleId: 'rule-order-status-001',
            ruleType: 'validation',
            name: '订单状态检查',
            condition: 'status !== null',
            level: 'warning',
          },
        ];
      case 'warehouse':
        return [
          ...commonRules,
          {
            ruleId: 'rule-warehouse-capacity-001',
            ruleType: 'trigger',
            name: '仓库容量预警',
            condition: 'utilizationRate > 90',
            action: 'sendCapacityAlert',
            level: 'warning',
          },
        ];
      case 'customer':
        return [
          ...commonRules,
          {
            ruleId: 'rule-customer-credit-001',
            ruleType: 'validation',
            name: '客户信用评级检查',
            condition: 'creditRating !== null',
            level: 'warning',
          },
        ];
      default:
        return commonRules;
    }
  };

  const getDefaultActions = (type: EntityType, entity?: any): EntityAction[] => {
    const typeName = getEntityTypeDisplayName(type);
    const commonActions: EntityAction[] = [
      {
        actionId: `action-${type}-view-001`,
        name: '查看详情',
        description: `查看${typeName}的详细信息`,
        icon: 'FileText',
        color: 'blue',
      },
      {
        actionId: `action-${type}-edit-001`,
        name: '编辑',
        description: `编辑${typeName}信息`,
        icon: 'Edit',
        color: 'indigo',
      },
    ];

    switch (type) {
      case 'supplier':
        return [
          ...commonActions,
          {
            actionId: 'action-supplier-evaluate-001',
            name: '评估供应商',
            description: '启动供应商评估流程',
            icon: 'Star',
            color: 'amber',
          },
          {
            actionId: 'action-supplier-risk-001',
            name: '风险分析',
            description: '查看供应商风险分析报告',
            icon: 'AlertTriangle',
            color: 'red',
          },
        ];
      case 'material':
        // Add calculated actions if entity is provided
        const materialActions = [...commonActions];
        if (entity) {
          const materialStock = materialStocksData.find(ms => ms.materialCode === entity.materialCode);
          const calculatedRules = calculateMaterialLogicRules(entity, materialStock);
          calculatedRules.actions.forEach((actionName, index) => {
            materialActions.push({
              actionId: `action-material-calculated-${index}`,
              name: actionName,
              description: `执行行动：${actionName}`,
              icon: 'Zap',
              color: calculatedRules.status === '呆滞' ? 'red' : calculatedRules.status === '异常' ? 'orange' : 'blue',
            });
          });
        }
        return [
          ...materialActions,
          {
            actionId: 'action-material-purchase-001',
            name: '发起采购',
            description: '为该物料发起采购订单',
            icon: 'ShoppingCart',
            color: 'green',
          },
          {
            actionId: 'action-material-stock-001',
            name: '库存管理',
            description: '查看和管理物料库存',
            icon: 'Package',
            color: 'blue',
          },
        ];
      case 'product':
        // Add calculated actions if entity is provided
        const productActions = [...commonActions];
        if (entity) {
          const calculatedRules = calculateProductLogicRules(entity);
          calculatedRules.actions.forEach((actionName, index) => {
            productActions.push({
              actionId: `action-product-calculated-${index}`,
              name: actionName,
              description: `执行行动：${actionName}`,
              icon: 'Zap',
              color: calculatedRules.status === '呆滞' ? 'red' : calculatedRules.status === '异常' ? 'orange' : 'blue',
            });
          });
        }
        return [
          ...productActions,
          {
            actionId: 'action-product-bom-001',
            name: '管理BOM',
            description: '编辑产品BOM结构',
            icon: 'Layers',
            color: 'purple',
          },
          {
            actionId: 'action-product-lifecycle-001',
            name: '生命周期管理',
            description: '查看产品生命周期分析',
            icon: 'TrendingUp',
            color: 'emerald',
          },
        ];
      case 'order':
        // Add calculated actions if entity is provided
        const orderActions = [...commonActions];
        if (entity) {
          const calculatedRules = calculateOrderLogicRules(entity);
          calculatedRules.actions.forEach((actionName, index) => {
            orderActions.push({
              actionId: `action-order-calculated-${index}`,
              name: actionName,
              description: `执行行动：${actionName}`,
              icon: 'Zap',
              color: calculatedRules.status === '异常' ? 'orange' : 'blue',
            });
          });
        }
        return [
          ...orderActions,
          {
            actionId: 'action-order-track-001',
            name: '跟踪订单',
            description: '查看订单执行进度',
            icon: 'Truck',
            color: 'blue',
          },
          {
            actionId: 'action-order-delivery-001',
            name: '交付管理',
            description: '管理订单交付流程',
            icon: 'Package',
            color: 'green',
          },
        ];
      case 'warehouse':
        return [
          ...commonActions,
          {
            actionId: 'action-warehouse-inventory-001',
            name: '库存盘点',
            description: '执行仓库库存盘点',
            icon: 'Package',
            color: 'green',
          },
        ];
      case 'customer':
        return [
          ...commonActions,
          {
            actionId: 'action-customer-order-001',
            name: '查看订单历史',
            description: '查看客户的所有订单',
            icon: 'ShoppingBag',
            color: 'blue',
          },
        ];
      default:
        return commonActions;
    }
  };

  const getDefaultPermissions = (_type: EntityType): PermissionConfig => {
    return { roles: [], users: [] };
  };

  // Populate Supplier configs
  console.log('Populating supplier configs...');
  const uniqueSupplierIds = Array.from(new Set(suppliersData.map(s => s.supplierId)));
  console.log('Unique supplier IDs:', uniqueSupplierIds.length);
  uniqueSupplierIds.forEach(supplierId => {
    const supplierEntries = suppliersData.filter(s => s.supplierId === supplierId);
    const firstEntry = supplierEntries[0];
    const key = `supplier-${supplierId}`;

    const evaluations = supplierEvaluationsData.filter(e => e.supplierId === supplierId);
    const avgQualityRating = evaluations.length > 0
      ? Math.round(evaluations.reduce((sum, e) => sum + e.totalScore, 0) / evaluations.length)
      : 85;
    const riskLevel = evaluations.length > 0 && evaluations[0].riskLevel
      ? evaluations[0].riskLevel
      : 'low' as const;

    // Get supplier 360 scorecard for additional attributes
    const scorecard = supplier360ScorecardsData.find((sc: any) => sc.supplierId === supplierId);
    const materialCodes = supplierEntries.map(s => s.materialCode);
    const uniqueMaterialCodes = Array.from(new Set(materialCodes));

    // Calculate total annual purchase amount from mainMaterialSuppliersData
    const totalAnnualPurchase = mainMaterialSuppliersData
      .filter((m: any) => m.supplierId === supplierId)
      .reduce((sum: number, m: any) => sum + m.annualPurchaseAmount, 0);

    const attributes = {
      ...getDefaultAttributes('supplier'),
      supplierId: supplierId,
      supplierName: firstEntry.supplierName,
      supplyMaterials: uniqueMaterialCodes,
      supplyMaterialCount: uniqueMaterialCodes.length,
      qualityRating: avgQualityRating,
      riskLevel: riskLevel,
      contact: `联系人-${supplierId}`,
      phone: `138-${supplierId.slice(-4)}-${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`,
      email: `supplier${supplierId.toLowerCase()}@example.com`,
      address: `供应商地址-${firstEntry.supplierName}`,
      establishedYear: 2015 + (supplierId.charCodeAt(supplierId.length - 1) % 10),
      registeredCapital: `${(500 + Math.floor(Math.random() * 2000))}万元`,
      certifications: ['ISO9001', 'ISO14001'],
      onTimeDeliveryRate: scorecard?.dimensions.onTimeDeliveryRate || 75,
      responseSpeed: scorecard?.dimensions.responseSpeed || 75,
      annualPurchaseAmount: totalAnnualPurchase > 0 ? `${(totalAnnualPurchase / 10000).toFixed(0)}万元` : '0万元',
    };

    const relations: EntityRelation[] = [
      {
        targetType: 'material',
        relationType: '一对多',
        count: uniqueMaterialCodes.length,
        sampleItems: uniqueMaterialCodes.slice(0, 3).map(code => {
          const material = materialsData.find(m => m.materialCode === code);
          return material?.materialName || code;
        }),
      },
    ];

    const config: EntityConfig = {
      entityId: supplierId,
      entityType: 'supplier',
      attributes,
      relations,
      logicRules: getDefaultLogicRules('supplier'),
      actions: getDefaultActions('supplier'),
      permissions: getDefaultPermissions('supplier'),
    };

    entityConfigs.set(key, config);
  });

  // Populate Material configs
  materialsData.forEach(material => {
    const key = `material-${material.materialCode}`;
    const supplierIds = Array.from(new Set(suppliersData
      .filter(s => s.materialCode === material.materialCode)
      .map(s => s.supplierId)));
    const allStockInfos = materialStocksData.filter(ms => ms.materialCode === material.materialCode);
    const totalStock = allStockInfos.reduce((sum, stock) => sum + stock.remainingStock, 0);
    const totalPurchaseQuantity = allStockInfos.reduce((sum, stock) => sum + stock.purchaseQuantity, 0);

    // Get main supplier info from mainMaterialSuppliersData
    const mainSupplier = mainMaterialSuppliersData.find((m: any) => m.materialCode === material.materialCode);

    // Determine unit - 统一使用"件"作为单位
    const getUnit = (materialName: string): string => {
      return '件'; // 统一使用"件"作为单位
    };

    const unit = getUnit(material.materialName);
    const unitPrice = material.materialCode === 'MAT-001' ? '5000' : material.materialCode === 'MAT-002' ? '8000' : '3000';

    const attributes = {
      ...getDefaultAttributes('material'),
      materialCode: material.materialCode,
      materialName: material.materialName,
      applicableProducts: material.applicableProductIds || [],
      applicableProductCount: material.applicableProductIds?.length || 0,
      warehouseInDate: material.warehouseInDate || '', // 入库时间
      warehouseOutDate: material.warehouseOutDate || '', // 出库时间
      currentStock: totalStock,
      currentStockWithUnit: `${totalStock} ${unit}`,
      safetyStock: Math.floor(totalStock * 0.3),
      safetyStockWithUnit: `${Math.floor(totalStock * 0.3)} ${unit}`,
      totalPurchaseQuantity: totalPurchaseQuantity,
      totalPurchaseQuantityWithUnit: `${totalPurchaseQuantity} ${unit}`,
      unit: unit,
      unitPrice: `${unitPrice}元/${unit}`,
      minOrderQuantity: 100,
      minOrderQuantityWithUnit: `100 ${unit}`,
      shelfLife: '12个月',
      specifications: '标准规格',
      mainSupplier: mainSupplier?.supplierName || supplierIds[0] || '',
      mainSupplierId: mainSupplier?.supplierId || supplierIds[0] || '',
      supplierCount: supplierIds.length,
      riskCoefficient: mainSupplier?.riskCoefficient || 20,
    };

    const relations: EntityRelation[] = [
      {
        targetType: 'product',
        relationType: '多对多',
        count: material.applicableProductIds?.length || 0,
        sampleItems: (material.applicableProductIds || []).slice(0, 3),
      },
      {
        targetType: 'supplier',
        relationType: '多对多',
        count: supplierIds.length,
        sampleItems: supplierIds.slice(0, 3),
      },
    ];

    const config: EntityConfig = {
      entityId: material.materialCode,
      entityType: 'material',
      attributes,
      relations,
      logicRules: getDefaultLogicRules('material', material),
      actions: getDefaultActions('material', material),
      permissions: getDefaultPermissions('material'),
    };

    entityConfigs.set(key, config);
  });

  // Populate Product configs (deduplicate by productId to avoid duplicates)
  const seenProductIds = new Set<string>();
  productsData.forEach(product => {
    // Skip if we've already processed this productId
    if (seenProductIds.has(product.productId)) {
      return;
    }
    seenProductIds.add(product.productId);

    const key = `product-${product.productId}`;
    const orderIds = ordersData
      .filter(o => o.productId === product.productId)
      .map(o => o.orderId);
    const totalOrderQuantity = ordersData
      .filter(o => o.productId === product.productId)
      .reduce((sum, o) => sum + o.quantity, 0);

    const attributes = {
      ...getDefaultAttributes('product'),
      productId: product.productId,
      productName: product.productName,
      BOM: product.materialCodes || [],
      BOMCount: product.materialCodes?.length || 0,
      series: product.productId.startsWith('PROD-T') ? 'T系列' : product.productId.startsWith('PROD-M') ? 'M系列' : '标准系列',
      lifecycle: product.productId.includes('T20') ? '衰退期' : product.productId.includes('T40') || product.productId.includes('M3E') ? '成熟期' : '成长期',
      price: product.productId.includes('T20') ? '120000' : product.productId.includes('T40') ? '80000' : product.productId.includes('M3E') ? '18000' : '50000',
      cost: product.productId.includes('T20') ? '80000' : product.productId.includes('T40') ? '55000' : product.productId.includes('M3E') ? '12000' : '35000',
      warranty: '12个月',
      weight: product.productId.includes('T20') ? '25kg' : product.productId.includes('T40') ? '20kg' : product.productId.includes('M3E') ? '900g' : '10kg',
      totalOrderCount: orderIds.length,
      totalOrderQuantity: totalOrderQuantity,
      status: totalOrderQuantity > 0 ? '在产' : '停产',
      // Add lifecycle and stock information
      stockQuantity: product.stockQuantity,
      stockUnit: product.stockUnit || '套',
      startSalesDate: product.startSalesDate,
      stopSalesDate: product.stopSalesDate,
      stopExpansionDate: product.stopExpansionDate,
      stopServiceDate: product.stopServiceDate,
      lifecycleStatus: product.status,
    };

    const relations: EntityRelation[] = [
      {
        targetType: 'material',
        relationType: '多对多',
        count: product.materialCodes?.length || 0,
        sampleItems: (product.materialCodes || []).slice(0, 3),
      },
      {
        targetType: 'order',
        relationType: '一对多',
        count: orderIds.length,
        sampleItems: orderIds.slice(0, 3),
      },
    ];

    const config: EntityConfig = {
      entityId: product.productId,
      entityType: 'product',
      attributes,
      relations,
      logicRules: getDefaultLogicRules('product', product),
      actions: getDefaultActions('product', product),
      permissions: getDefaultPermissions('product'),
    };

    entityConfigs.set(key, config);
  });

  // Populate Order configs
  ordersData.forEach(order => {
    const key = `order-${order.orderId}`;
    const product = productsData.find(p => p.productId === order.productId);
    const customer = customersData.find(c => c.customerName === order.client);

    // Calculate delay days
    const dueDate = new Date(order.dueDate);
    const today = new Date();
    const delayDays = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));

    // Calculate order amount (mock)
    const orderAmount = order.quantity * 5; // Mock calculation: 5万 per unit

    // Determine stage based on status
    const stage = order.status === '采购中' ? 'procurement' : order.status === '生产中' ? 'production' : order.status === '运输中' ? 'shipping' : 'completed';

    // Determine customer level
    const customerLevel = customer?.creditRating === 'AAA' ? 'VIP' : customer?.creditRating === 'AA' ? 'A' : 'B';

    const attributes = {
      ...getDefaultAttributes('order'),
      orderId: order.orderId,
      orderName: order.orderName,
      client: order.client,
      productId: order.productId,
      productName: product?.productName || order.productId,
      quantity: order.quantity,
      orderDate: order.orderDate,
      dueDate: order.dueDate,
      status: order.status,
      amount: `¥${orderAmount}w`,
      delay: delayDays,
      stage: stage,
      customer_level: customerLevel,
      priority: delayDays > 5 ? 'critical' : delayDays > 2 ? 'high' : 'medium',
    };

    const relations: EntityRelation[] = [
      {
        targetType: 'product',
        relationType: '多对一',
        count: 1,
        sampleItems: [order.productId],
      },
      {
        targetType: 'customer',
        relationType: '多对一',
        count: 1,
        sampleItems: customer ? [customer.customerId] : [order.client],
      },
    ];

    const config: EntityConfig = {
      entityId: order.orderId,
      entityType: 'order',
      attributes,
      relations,
      logicRules: getDefaultLogicRules('order', order),
      actions: getDefaultActions('order', order),
      permissions: getDefaultPermissions('order'),
    };

    entityConfigs.set(key, config);
  });

  // Populate Factory configs
  factoriesData.forEach(factory => {
    const key = `factory-${factory.factoryCode}`;
    const attributes = {
      ...getDefaultAttributes('factory'),
      ...factory,
    };

    // 获取关联的产品名称
    const productNames = (factory.productList || []).map((id: string) => {
      const product = productsData.find(p => p.productId === id);
      return product?.productName || id;
    });

    // 获取关联的物料名称
    const materialNames = (factory.materialList || []).map((code: string) => {
      const material = materialsData.find(m => m.materialCode === code);
      return material?.materialName || code;
    });

    // 获取关联的仓库名称
    const warehouseNames = (factory.warehouseList || []).map((code: string) => {
      const warehouse = warehousesData.find(w => w.warehouseCode === code);
      return warehouse?.warehouseName || code;
    });

    const relations: EntityRelation[] = [
      {
        targetType: 'product',
        relationType: '多对多',  // 修正：从"一对多"改为"多对多"
        count: factory.productList?.length || 0,
        sampleItems: productNames.slice(0, 3),
      },
      {
        targetType: 'material',
        relationType: '多对多',
        count: factory.materialList?.length || 0,
        sampleItems: materialNames.slice(0, 3),
      },
      {
        targetType: 'warehouse',
        relationType: '一对多',
        count: factory.warehouseList?.length || 0,
        sampleItems: warehouseNames.slice(0, 3),
      },
    ];

    const config: EntityConfig = {
      entityId: factory.factoryCode,
      entityType: 'factory',
      attributes,
      relations,
      logicRules: getDefaultLogicRules('factory'),
      actions: getDefaultActions('factory'),
      permissions: getDefaultPermissions('factory'),
    };
    entityConfigs.set(key, config);
  });

  // Populate Warehouse configs
  warehousesData.forEach(warehouse => {
    const key = `warehouse-${warehouse.warehouseCode}`;
    const associatedFactory = factoriesData.find(f => f.factoryCode === warehouse.associatedFactory);
    const utilizationRate = warehouse.capacity > 0 ? Math.round((warehouse.currentStock / warehouse.capacity) * 100) : 0;

    const attributes = {
      ...getDefaultAttributes('warehouse'),
      warehouseCode: warehouse.warehouseCode,
      warehouseName: warehouse.warehouseName,
      location: warehouse.location,
      capacity: warehouse.capacity,
      currentStock: warehouse.currentStock,
      utilizationRate: `${utilizationRate}%`,
      associatedFactory: warehouse.associatedFactory,
      associatedFactoryName: associatedFactory?.factoryName || warehouse.associatedFactory,
      storageType: warehouse.storageType,
      temperatureControl: warehouse.temperatureControl,
      availableCapacity: warehouse.capacity - warehouse.currentStock,
    };

    const relations: EntityRelation[] = [
      {
        targetType: 'factory',
        relationType: '多对一',
        count: 1,
        sampleItems: [warehouse.associatedFactory || 'FAC-001'],
      },
    ];

    const config: EntityConfig = {
      entityId: warehouse.warehouseCode,
      entityType: 'warehouse',
      attributes,
      relations,
      logicRules: getDefaultLogicRules('warehouse'),
      actions: getDefaultActions('warehouse'),
      permissions: getDefaultPermissions('warehouse'),
    };

    entityConfigs.set(key, config);
  });

  // Populate Logistics configs
  logisticsData.forEach((logistics, index) => {
    const key = `logistics-${logistics.logisticsId}`;
    const attributes = {
      ...getDefaultAttributes('logistics'),
      ...logistics,
    };
    const orderIds = ordersData
      .filter((_, idx) => idx % logisticsData.length === index)
      .map(o => o.orderId);
    const relations: EntityRelation[] = [
      {
        targetType: 'order',
        relationType: '一对多',
        count: orderIds.length,
        sampleItems: orderIds.slice(0, 3),
      },
    ];
    const config: EntityConfig = {
      entityId: logistics.logisticsId,
      entityType: 'logistics',
      attributes,
      relations,
      logicRules: getDefaultLogicRules('logistics'),
      actions: getDefaultActions('logistics'),
      permissions: getDefaultPermissions('logistics'),
    };
    entityConfigs.set(key, config);
  });

  // Populate Customer configs
  console.log('Populating customer configs...');
  console.log('Customers data length:', customersData.length);
  customersData.forEach(customer => {
    const key = `customer-${customer.customerId}`;
    const customerOrders = ordersData.filter(o => o.client === customer.customerName);

    const attributes = {
      ...getDefaultAttributes('customer'),
      customerId: customer.customerId,
      customerName: customer.customerName,
      contact: customer.contact || `联系人-${customer.customerId}`,
      phone: customer.phone || `138-0000-${customer.customerId.slice(-4)}`,
      email: customer.email || `customer${customer.customerId.toLowerCase()}@example.com`,
      address: customer.address || `地址-${customer.customerName}`,
      serviceRegion: customer.serviceRegion || ['华东'],
      creditRating: customer.creditRating || 'BBB',
      orderHistory: customer.orderHistory || customerOrders.map(o => o.orderId),
      totalOrderCount: customerOrders.length,
      totalOrderAmount: customerOrders.reduce((sum, o) => sum + o.quantity * 5, 0), // Estimated calculation
    };

    const relations: EntityRelation[] = [
      {
        targetType: 'order',
        relationType: '一对多',
        count: customerOrders.length,
        sampleItems: customerOrders.map(o => o.orderId).slice(0, 3),
      },
    ];

    const config: EntityConfig = {
      entityId: customer.customerId,
      entityType: 'customer',
      attributes,
      relations,
      logicRules: getDefaultLogicRules('customer'),
      actions: getDefaultActions('customer'),
      permissions: getDefaultPermissions('customer'),
    };

    entityConfigs.set(key, config);
  });

  console.log('Entity configurations populated. Total configs:', entityConfigs.size);
  console.log('=== Entity Config Population Complete ===');
};

/**
 * Initialize entity data
 * Triggers async population of entity configs from API/CSV
 */
export const initializeEntityData = (): void => {
  populateEntityConfigs().catch(error => {
    console.error('Failed to initialize entity data:', error);
  });
};
