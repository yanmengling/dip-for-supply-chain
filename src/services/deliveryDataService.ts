/**
 * Delivery Data Service
 * 
 * Provides delivery order data loading from API.
 */

import { ontologyApi } from '../api';
import { apiConfigService } from './apiConfigService';
import { ApiConfigType, type OntologyObjectConfig } from '../types/apiConfig';
import type { DeliveryOrder } from '../types/ontology';

// Default Object type ID for delivery orders (sales orders) - used as fallback
const DEFAULT_DELIVERY_ORDER_OBJECT_TYPE_ID = 'supplychain_hd0202_salesorder'; // 更新为新的有效 ID

/**
 * Get delivery order object type ID from configuration
 * @returns Object type ID for sales orders
 */
function getDeliveryOrderObjectTypeId(): string {
  // 优先使用 entityType 查找（更精确）
  const config = apiConfigService.getOntologyObjectByEntityType('order');

  if (config && config.enabled) {
    console.log(`[DeliveryDataService] Using configured object type ID: ${config.objectTypeId} (${config.name})`);
    return config.objectTypeId;
  }

  console.warn(`[DeliveryDataService] No sales order configuration found (entityType: 'order'), using default: ${DEFAULT_DELIVERY_ORDER_OBJECT_TYPE_ID}`);
  return DEFAULT_DELIVERY_ORDER_OBJECT_TYPE_ID;
}

/**
 * Load delivery orders from API
 * @returns Array of delivery orders
 * 
 * NOTE: Uses sales order object type as delivery orders
 */
export async function loadDeliveryOrders(): Promise<DeliveryOrder[]> {
  console.log('[DeliveryDataService] Loading delivery orders from API...');

  try {
    // Get configurable object type ID
    const objectTypeId = getDeliveryOrderObjectTypeId();

    // Use GET method with query parameters as per ontology API documentation
    // URL: /api/ontology-query/v1/knowledge-networks/{kn_id}/object-types/{ot_id}?include_type_info=true&include_logic_params=false
    const response = await ontologyApi.queryObjectInstances(objectTypeId, {
      limit: 10000,
      need_total: false,
      include_type_info: true,
      include_logic_params: false,
    });

    console.log(`[DeliveryDataService] API returned ${response.entries.length} entries`);

    // Debug: Log first entry to see actual field names
    if (response.entries.length > 0) {
      console.log('[DeliveryDataService] First entry sample:', response.entries[0]);
      console.log('[DeliveryDataService] Available fields:', Object.keys(response.entries[0]));
    }

    const deliveryOrders: DeliveryOrder[] = response.entries.map((item: any, index: number) => {
      // Actual API fields: contract_number, product_category, product_code, shipping_quantity,
      // id, shipping_date, product_name, signing_quantity, signing_date, promised_delivery_date

      // Generate order status based on dates
      let orderStatus = '未知';
      const today = new Date();
      const shippingDate = item.shipping_date ? new Date(item.shipping_date) : null;
      const signingDate = item.signing_date ? new Date(item.signing_date) : null;
      const promisedDate = item.promised_delivery_date ? new Date(item.promised_delivery_date) : null;

      // Map quantities first to use in status logic
      const shippingQty = Number(item.shipping_quantity || 0);
      const signingQty = Number(item.signing_quantity || 0);

      if (shippingDate) {
        // If shipping quantity matches signing quantity, it's Completed
        if (shippingQty === signingQty && signingQty > 0) {
          orderStatus = '已完成';
        } else {
          // Otherwise it's In Transit (Partial or generic)
          orderStatus = '运输中';
        }
      } else if (signingDate) {
        orderStatus = '生产中';
      }

      return {
        // Basic order information - using contract_number as order identifier
        orderId: item.id ? String(item.id) : '',
        orderNumber: item.contract_number || `ORDER-${item.id || index}`,
        orderName: `${item.product_name || '未知产品'} - ${item.contract_number || ''}`,
        lineNumber: item.id,

        // Customer information - not available in this API
        customerId: '',
        customerName: '',

        // Product information
        productId: item.product_code || '',
        productCode: item.product_code || '',
        productName: item.product_name || '',
        quantity: signingQty, // Default to signing quantity as the "Order Quantity"
        shippingQuantity: shippingQty,
        signingQuantity: signingQty,
        unit: '件',

        // Amount information - not available
        standardPrice: undefined,
        discountRate: undefined,
        actualPrice: undefined,
        subtotalAmount: undefined,
        taxAmount: undefined,
        totalAmount: undefined,

        // Date information
        documentDate: item.signing_date || new Date().toISOString().split('T')[0],
        orderDate: item.signing_date || new Date().toISOString().split('T')[0],
        plannedDeliveryDate: item.promised_delivery_date || item.shipping_date || '',
        createdDate: item.signing_date || new Date().toISOString().split('T')[0],
        actualDeliveryDate: item.shipping_date || undefined,

        // Status information - derived from dates
        orderStatus: orderStatus,
        documentStatus: item.signing_date ? '已确认' : '待确认',
        deliveryStatus: shippingDate && shippingDate <= today ? '已签收' : undefined,

        // Business information
        transactionType: item.product_category,
        salesDepartment: undefined,
        salesperson: undefined,
        isUrgent: false,
        contractNumber: item.contract_number,
        projectName: undefined,
        endCustomer: undefined,

        // Logistics information
        shipmentId: undefined,
        shipmentNumber: undefined,
        shipmentDate: item.shipping_date,
        warehouseId: undefined,
        warehouseName: undefined,
        consignee: undefined,
        consigneePhone: undefined,
        deliveryAddress: undefined,
        logisticsProvider: undefined,
        trackingNumber: undefined,
        estimatedDeliveryDate: item.promised_delivery_date,

        // Production information
        productionOrderId: undefined,
        productionOrderNumber: undefined,
        factoryId: undefined,
        factoryName: undefined,
        productionLine: undefined,
        plannedStartDate: undefined,
        plannedFinishDate: undefined,
        workOrderStatus: undefined,
        priority: undefined,

        // Notes
        notes: undefined,

        // Status identifier
        status: 'Active',
      };
    });

    console.log(`[DeliveryDataService] Loaded ${deliveryOrders.length} delivery orders`);

    // Debug: Log status distribution
    const statusCounts: Record<string, number> = {};
    deliveryOrders.forEach(order => {
      statusCounts[order.orderStatus] = (statusCounts[order.orderStatus] || 0) + 1;
    });
    console.log('[DeliveryDataService] Status distribution:', statusCounts);

    // Debug: Log delivery performance
    const completed = deliveryOrders.filter(o => o.orderStatus === '已完成');
    const delayed = completed.filter(o => {
      if (!o.actualDeliveryDate || !o.plannedDeliveryDate) return false;
      return new Date(o.actualDeliveryDate) > new Date(o.plannedDeliveryDate);
    });
    console.log(`[DeliveryDataService] Delivery performance: ${completed.length} completed, ${delayed.length} delayed`);

    return deliveryOrders;
  } catch (error) {
    console.error('[DeliveryDataService] Failed to load delivery orders:', error);
    return [];
  }
}

/**
 * Calculate delivery statistics
 */
export function calculateDeliveryStats(orders: DeliveryOrder[]) {
  const total = orders.length;

  // Status counts
  const completed = orders.filter(o => o.orderStatus === '已完成').length;
  const inProduction = orders.filter(o => o.orderStatus === '生产中').length;
  // Use deliveryStatus '运输中' or orderStatus '运输中'
  const inTransit = orders.filter(o => o.deliveryStatus === '运输中' || o.orderStatus === '运输中').length;

  // Performance stats
  const onTime = orders.filter(o => o.deliveryStatus === '已签收' && !o.actualDeliveryDate).length; // Note: logic from existing code seems odd (no actualDeliveryDate?), preserving onTime logic but checking below
  // Wait, existing onTime logic: `o.deliveryStatus === '已签收' && !o.actualDeliveryDate`. 
  // If actualDeliveryDate exists, it might be late? 
  // Actually, let's fix onTime logic to be more robust if possible, but for now stick to fixing missing props.
  // Existing delayed logic: actual > planned.
  const delayed = orders.filter(o => {
    if (!o.plannedDeliveryDate || !o.actualDeliveryDate) return false;
    return new Date(o.actualDeliveryDate) > new Date(o.plannedDeliveryDate);
  }).length;

  // Overdue (not yet delivered and passed planned date)
  const today = new Date();
  const overdue = orders.filter(o => {
    if (o.orderStatus === '已完成' || o.orderStatus === '已取消' || !o.plannedDeliveryDate) return false;
    return new Date(o.plannedDeliveryDate) < today;
  }).length;

  const pending = orders.filter(o => o.orderStatus === '生产中' || o.orderStatus === '待发货').length;
  const urgent = orders.filter(o => o.isUrgent).length;

  return {
    total,
    completed,
    inProduction,
    inTransit,
    onTime,
    delayed,
    overdue,
    urgent,
    pending,
    onTimeRate: completed > 0 ? (((completed - delayed) / completed) * 100).toFixed(1) : '100', // Adjusted calculation to use completed
  };
}

/**
 * Filter delivery orders by criteria
 */
interface DeliveryOrderFilters {
  status?: string;
  riskLevel?: string;
  productId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  isUrgent?: boolean;
  searchText?: string;
}

export function filterDeliveryOrders(orders: DeliveryOrder[], filters: DeliveryOrderFilters) {
  return orders.filter(order => {
    // Status filter
    if (filters.status && filters.status !== 'all' && order.orderStatus !== filters.status && order.deliveryStatus !== filters.status) {
      return false;
    }

    // Risk Level filter
    // if (filters.riskLevel && filters.riskLevel !== 'all' && order.riskLevel !== filters.riskLevel) {
    //   return false;
    // }

    // Product ID filter
    if (filters.productId && order.productId !== filters.productId) {
      return false;
    }

    // Date Range filter (using plannedDeliveryDate)
    if (filters.dateFrom || filters.dateTo) {
      if (!order.plannedDeliveryDate) return false;
      const orderDate = new Date(order.plannedDeliveryDate);

      if (filters.dateFrom) {
        // Reset time part for comparison if needed, or just compare dates
        const fromDate = new Date(filters.dateFrom);
        if (orderDate < fromDate) return false;
      }

      if (filters.dateTo) {
        const toDate = new Date(filters.dateTo);
        // Set to end of day for inclusive comparison
        toDate.setHours(23, 59, 59, 999);
        if (orderDate > toDate) return false;
      }
    }

    // Urgent filter
    if (filters.isUrgent !== undefined && order.isUrgent !== filters.isUrgent) {
      return false;
    }

    // Search Text filter
    if (filters.searchText) {
      const searchLower = filters.searchText.toLowerCase();
      // Ensure properties exist before calling toLowerCase
      const orderNo = order.orderNumber || '';
      const prodName = order.productName || '';
      const custName = order.customerName || '';

      return (
        orderNo.toLowerCase().includes(searchLower) ||
        prodName.toLowerCase().includes(searchLower) ||
        custName.toLowerCase().includes(searchLower)
      );
    }

    return true;
  });
}
