/**
 * Entity Data Service
 *
 * Fetches entity data from real data-view APIs and transforms them
 * into the format expected by EntityListPage and entity configs.
 */

import { ontologyApi } from '../api/ontologyApi';
import { apiConfigService } from './apiConfigService';
import { getCurrentEnvironment } from '../config/apiConfig';
import type { EntityType } from '../types/ontology';

/**
 * 默认ID后备（更新为新的有效 ID）
 */
const DEFAULT_IDS: Record<string, string> = {
  supplier: 'supplychain_hd0202_supplier',
  material: 'supplychain_hd0202_material',
  product: 'supplychain_hd0202_product',
  order: 'supplychain_hd0202_salesorder',
};

/**
 * 获取对象类型ID
 */
const getObjectTypeId = (type: string): string => {
  // 直接使用传入的 type 作为 entityType（不再转换 order -> sales_order）
  const config = apiConfigService.getOntologyObjectByEntityType(type);
  if (config?.objectTypeId) {
    return config.objectTypeId;
  }
  return DEFAULT_IDS[type] || '';
};

// ============================================================================
// Field Mapping Functions
// ============================================================================

// ... (mapping functions remain the same)

/**
 * Map supplier data from API to expected format
 */
const mapSupplierData = (apiData: any[]): any[] => {
  console.log('[mapSupplierData] Input data:', apiData?.length || 0, 'records');

  if (!apiData || apiData.length === 0) {
    console.warn('[mapSupplierData] No data to map');
    return [];
  }

  // Log first record to see actual field names
  console.log('[mapSupplierData] First record sample:', apiData[0]);
  console.log('[mapSupplierData] Available fields:', Object.keys(apiData[0]));

  // Group by supplier_id to deduplicate (one supplier can supply multiple materials)
  const supplierMap = new Map<string, any>();

  apiData.forEach((item, index) => {
    // Try multiple possible field names
    const supplierId = item.supplier_id || item.supplierId || item.supplier_code || item.supplierCode || item.id;

    if (!supplierId) {
      if (index < 3) {
        console.warn('[mapSupplierData] Record missing supplier ID:', item);
      }
      return;
    }

    if (!supplierMap.has(String(supplierId))) {
      supplierMap.set(String(supplierId), {
        supplierId: String(supplierId),
        supplierName: item.supplier_name || item.supplierName || item.name || '',
        supplierCode: item.supplier_code || item.supplierCode || '',
        materialName: item.material_name || item.materialName || '',
        materialCode: item.material_code || item.materialCode || '',
        contactPhone: item.contact_phone || item.contactPhone || item.phone || '',
        contactEmail: item.contact_email || item.contactEmail || item.email || '',
        address: item.address || item.registered_address || `${item.city || ''}`,
        city: item.city || '',
        country: item.country || '',
        creditRating: item.supplier_tier || item.credit_rating || 'AA',
        cooperationYears: parseInt(item.cooperation_years) || 3,
        annualPurchaseAmount: 0,
        qualityRating: parseInt(item.supplier_rating || item.quality_rating) || 85,
        riskRating: item.risk_level === '高' ? 30 : item.risk_level === '中' ? 15 : 10,
        onTimeDeliveryRate: 90,
        financialStatus: item.status === 'Active' ? '良好' : '正常',
        status: item.status || 'Active',
        materials: [],
      });
    }

    // Add material to supplier's materials list
    const materialName = item.material_name || item.materialName;
    const materialCode = item.material_code || item.materialCode;

    if (materialName && materialCode) {
      const supplier = supplierMap.get(String(supplierId));
      if (supplier) {
        supplier.materials.push({
          materialCode,
          materialName,
        });
      }
    }
  });

  const result = Array.from(supplierMap.values());
  console.log('[mapSupplierData] Mapped', result.length, 'suppliers');

  return result;
};

/**
 * Map material data from API to expected format
 */
const mapMaterialData = (apiData: any[]): any[] => {
  console.log('[mapMaterialData] Input data:', apiData?.length || 0, 'records');

  if (!apiData || apiData.length === 0) {
    console.warn('[mapMaterialData] No data to map');
    return [];
  }

  // Log first record to see actual field names
  console.log('[mapMaterialData] First record sample:', apiData[0]);
  console.log('[mapMaterialData] Available fields:', Object.keys(apiData[0]));

  const result = apiData.map((item, index) => {
    // Try multiple possible field names
    const materialId = item.material_id || item.materialId || item.id;
    const materialCode = item.material_code || item.materialCode || materialId;
    const materialName = item.material_name || item.materialName || item.name;

    if (!materialCode && index < 3) {
      console.warn('[mapMaterialData] Record missing material code:', item);
    }

    return {
      materialId: materialId || materialCode,
      materialCode: materialCode || '',
      materialName: materialName || '',
      materialType: item.material_type || item.materialType || item.type || '',
      unit: item.unit || item.main_unit || '个',
      applicableProductIds: [], // Would need product BOM data to populate this
      warehouseInDate: item.created_date || item.createdDate || new Date().toISOString().split('T')[0],
      warehouseOutDate: undefined,
      status: item.status === 'Active' ? '正常' : (item.status || '正常'),
      isVirtual: item.is_virtual === '是' || item.isVirtual === true,
      isAssembly: item.is_assembly === '是' || item.isAssembly === true,
      maxStock: 10000,
      minStock: 10,
      currentStock: Math.floor(Math.random() * 5000) + 100,
    };
  });

  console.log('[mapMaterialData] Mapped', result.length, 'materials');

  return result;
};

/**
 * Map product data from API to expected format
 */
const mapProductData = (apiData: any[]): any[] => {
  // Deduplicate by product_id
  const productMap = new Map<string, any>();

  apiData.forEach(item => {
    const productId = item.product_id || item.product_code;
    if (!productId) return;

    if (!productMap.has(productId)) {
      productMap.set(productId, {
        productId: productId,
        productName: item.product_name,
        materialCodes: [],
        startSalesDate: item.created_date || '2025-01-01',
        stopSalesDate: undefined,
        stopExpansionDate: undefined,
        stopServiceDate: undefined,
        status: item.status === 'Active' ? '销售中' : '停止销售',
        stockQuantity: Math.floor(Math.random() * 500) + 21,
        stockUnit: item.main_unit || '套',
      });
    }
  });

  return Array.from(productMap.values());
};

/**
 * Map factory data from API to expected format
 */
const mapFactoryData = (apiData: any[]): any[] => {
  return apiData.map(item => ({
    factoryCode: item.factory_id || item.factory_code,
    factoryName: item.factory_name,
    location: item.location || item.address || '',
    productionLines: 3,
    totalCapacity: 1000,
    capacityUtilization: 85,
    efficiency: 90,
    employeeCount: 100,
    productList: [],
    qualityPassRate: 98,
    equipmentStatus: 'operational' as const,
    certifications: ['ISO9001', 'ISO14001'],
    materialList: [],
    targetCapacity: 1000,
    actualCapacity: 850,
  }));
};

/**
 * Map customer data from API to expected format
 */
const mapCustomerData = (apiData: any[]): any[] => {
  // Deduplicate by customer_id
  const customerMap = new Map<string, any>();

  apiData.forEach(item => {
    const customerId = item.customer_id;
    if (!customerId) return;

    if (!customerMap.has(customerId)) {
      customerMap.set(customerId, {
        customerId: customerId,
        customerName: item.customer_name || '',
        contactPerson: item.contact_person || '',
        phone: item.contact_phone || '',
        email: item.contact_email || '',
        address: item.address || `${item.province || ''}${item.city || ''}`,
        creditRating: item.customer_level || 'T3',
        totalOrders: 0,
        totalSpend: parseInt(item.annual_revenue) || 0,
        lastOrderDate: item.created_date || new Date().toISOString().split('T')[0],
        // 额外字段
        customerCode: item.customer_code || '',
        customerType: item.customer_type || '',
        industry: item.industry || '',
        companySize: item.company_size || '',
        status: item.status || 'Active',
      });
    }
  });

  return Array.from(customerMap.values());
};

/**
 * Map sales order data from API to expected format
 */
const mapSalesOrderData = (apiData: any[]): any[] => {
  return apiData.map(item => ({
    orderId: item.sales_order_id || item.sales_order_number,
    orderName: `销售订单 ${item.sales_order_number || ''}`,
    client: item.customer_name || '',
    productId: item.product_id || item.product_code,
    quantity: parseInt(item.quantity) || 0,
    orderDate: item.document_date || item.created_date,
    dueDate: item.planned_delivery_date || item.document_date,
    status: mapOrderStatus(item.order_status),
    orderInitiateDate: item.created_date,
    plannedArrivalDate: item.planned_delivery_date,
  }));
};

/**
 * Map warehouse data - using inventory events as proxy
 */
const mapWarehouseData = (apiData: any[]): any[] => {
  // Group by warehouse to create unique warehouse records
  const warehouseMap = new Map<string, any>();

  apiData.forEach(item => {
    const warehouseId = item.warehouse_id;
    const warehouseName = item.warehouse_name;

    if (!warehouseId) return;

    if (!warehouseMap.has(warehouseId)) {
      warehouseMap.set(warehouseId, {
        warehouseCode: warehouseId,
        warehouseName: warehouseName || `仓库${warehouseId}`,
        location: '',
        capacity: 5000,
        currentStock: 0,
        associatedFactory: 'FAC-001',
        storageType: 'normal' as const,
        temperatureControl: false,
      });
    }

    // Accumulate stock from inventory events
    const warehouse = warehouseMap.get(warehouseId);
    warehouse.currentStock += parseFloat(item.quantity) || 0;
  });

  return Array.from(warehouseMap.values());
};

/**
 * Helper function to map order status from API to UI format
 */
const mapOrderStatus = (apiStatus: string): string => {
  const statusMap: Record<string, string> = {
    '已发货': '运输中',
    '已取消': '已取消',
    '生产中': '生产中',
    '已确认': '生产中',
    '待发货': '采购中',
  };
  return statusMap[apiStatus] || '生产中';
};

// ============================================================================
// Main API Fetching Function
// ============================================================================

/**
 * Fetch entities by type from real Ontology APIs
 */
export const fetchEntitiesByType = async (type: EntityType): Promise<any[]> => {
  try {
    console.log(`[EntityDataService] Fetching ${type} data from Ontology API...`);

    const objectTypeId = getObjectTypeId(type);
    if (!objectTypeId) {
      console.warn(`[EntityDataService] No objectTypeId found for type: ${type}`);
      return [];
    }

    const response = await ontologyApi.queryObjectInstances(objectTypeId, {
      limit: 1000,
      include_type_info: false,
      include_logic_params: false
    });

    const entries = response.entries || [];
    console.log(`[EntityDataService] ${type} - Total records retrieved: ${entries.length}`);

    // Brain Mode: Return raw data as requested by user
    if (getCurrentEnvironment() === 'dip-cloud') {
      return entries;
    }

    // Map to standard format based on type
    switch (type) {
      case 'supplier':
        return mapSupplierData(entries);
      case 'material':
        return mapMaterialData(entries);
      case 'product':
        return mapProductData(entries);
      case 'factory':
        return mapFactoryData(entries);
      case 'warehouse':
        return mapWarehouseData(entries);
      case 'order':
        return mapSalesOrderData(entries);
      case 'customer':
        return mapCustomerData(entries);
      case 'logistics':
        return [];
      default:
        console.warn(`[EntityDataService] Unknown entity type: ${type}`);
        return [];
    }
  } catch (error) {
    console.error(`[EntityDataService] Failed to fetch ${type} data from Ontology:`, error);
    throw error;
  }
};

/**
 * Fetch entity by ID from API (for future use)
 */
export const fetchEntityById = async (type: EntityType, id: string): Promise<any | null> => {
  try {
    // Fetch all entities and filter by ID
    // In a production system, this would be optimized with a specific API endpoint
    const entities = await fetchEntitiesByType(type);

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
          return e.id === id;
      }
    }) || null;
  } catch (error) {
    console.error(`[EntityDataService] Failed to fetch ${type} by ID ${id}:`, error);
    return null;
  }
};
