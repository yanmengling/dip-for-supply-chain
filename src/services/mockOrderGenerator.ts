/**
 * 模拟订单数据生成器
 * 用于生成差异化的测试订单数据
 */

import type { DeliveryOrder } from '../types/ontology';

/**
 * 生成随机日期
 */
function randomDate(start: Date, end: Date): string {
  const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return date.toISOString().split('T')[0];
}

/**
 * 添加天数到日期
 */
function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

/**
 * 生成差异化的模拟订单数据
 */
export function generateMockOrders(): DeliveryOrder[] {
  const orders: DeliveryOrder[] = [];
  const today = new Date();
  
  // 客户列表
  const customers = [
    { id: '10001', name: '广州绿野农技技术有限公司' },
    { id: '10002', name: '西安沃土植保科技有限公司' },
    { id: '10003', name: '青岛田园农科有限公司' },
    { id: '10004', name: '上海绿野农业服务有限公司' },
    { id: '10005', name: '西安惠农农科科技有限公司' },
    { id: '10006', name: '北京现代农业科技集团' },
    { id: '10007', name: '深圳智慧农业有限公司' },
    { id: '10008', name: '成都天府农业科技公司' },
  ];
  
  // 产品列表
  const products = [
    { id: 'P0006', code: 'UAV-JF-ENT-AG', name: '极风农业版整机', price: 22999 },
    { id: 'P0009', code: 'UAV-BF-IND-H20', name: '霸风20L植保无人机', price: 45999 },
    { id: 'P0010', code: 'UAV-BF-IND-H30', name: '霸风30L植保无人机', price: 58999 },
    { id: 'P0001', code: 'UAV-XF-BASIC', name: '旋风基础版整机', price: 38369 },
    { id: 'P0002', code: 'UAV-XF-BASIC-PLUS', name: '旋风增强版整机', price: 35451 },
  ];
  
  // 销售人员
  const salespeople = ['张伟', '李娜', '王强', '刘芳', '陈明', '赵敏', '孙丽', '周杰'];
  
  // 物流商
  const logistics = ['顺丰速运', '京东物流', '德邦物流', '中通快递', '圆通速递'];
  
  let orderIdCounter = 1;
  
  // ========== 1. 紧急订单（5天内到期，未完成）==========
  for (let i = 0; i < 5; i++) {
    const customer = customers[Math.floor(Math.random() * customers.length)];
    const product = products[Math.floor(Math.random() * products.length)];
    const quantity = Math.floor(Math.random() * 15) + 5;
    const daysUntilDue = Math.floor(Math.random() * 5) + 1; // 1-5天
    
    const orderDate = addDays(today.toISOString().split('T')[0], -20);
    const plannedDeliveryDate = addDays(today.toISOString().split('T')[0], daysUntilDue);
    
    orders.push({
      orderId: `SO${String(orderIdCounter++).padStart(7, '0')}`,
      orderNumber: `SO-202512-${String(orderIdCounter).padStart(5, '0')}`,
      orderName: `${customer.name}紧急采购订单`,
      lineNumber: 10,
      customerId: customer.id,
      customerName: customer.name,
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      quantity,
      unit: '台',
      standardPrice: product.price,
      discountRate: 0,
      actualPrice: product.price,
      subtotalAmount: product.price * quantity,
      taxAmount: product.price * quantity * 0.13,
      totalAmount: product.price * quantity * 1.13,
      documentDate: orderDate,
      orderDate: orderDate,
      plannedDeliveryDate: plannedDeliveryDate,
      createdDate: orderDate,
      orderStatus: '生产中',
      documentStatus: '已确认',
      deliveryStatus: undefined,
      transactionType: '直销',
      salesDepartment: '销售一部',
      salesperson: salespeople[Math.floor(Math.random() * salespeople.length)],
      isUrgent: true,
      contractNumber: undefined,
      projectName: undefined,
      endCustomer: customer.name,
      notes: '客户要求加急处理',
      status: 'Active',
    });
  }
  
  // ========== 2. 逾期订单（1-15天逾期，未完成）==========
  for (let i = 0; i < 3; i++) {
    const customer = customers[Math.floor(Math.random() * customers.length)];
    const product = products[Math.floor(Math.random() * products.length)];
    const quantity = Math.floor(Math.random() * 20) + 10;
    const daysOverdue = Math.floor(Math.random() * 15) + 1; // 1-15天逾期
    
    const orderDate = addDays(today.toISOString().split('T')[0], -45);
    const plannedDeliveryDate = addDays(today.toISOString().split('T')[0], -daysOverdue);
    
    orders.push({
      orderId: `SO${String(orderIdCounter++).padStart(7, '0')}`,
      orderNumber: `SO-202511-${String(orderIdCounter).padStart(5, '0')}`,
      orderName: `${customer.name}设备采购订单`,
      lineNumber: 10,
      customerId: customer.id,
      customerName: customer.name,
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      quantity,
      unit: '台',
      standardPrice: product.price,
      discountRate: 5,
      actualPrice: product.price * 0.95,
      subtotalAmount: product.price * 0.95 * quantity,
      taxAmount: product.price * 0.95 * quantity * 0.13,
      totalAmount: product.price * 0.95 * quantity * 1.13,
      documentDate: orderDate,
      orderDate: orderDate,
      plannedDeliveryDate: plannedDeliveryDate,
      createdDate: orderDate,
      orderStatus: '生产中',
      documentStatus: '已确认',
      deliveryStatus: undefined,
      transactionType: '项目销售',
      salesDepartment: '销售一部',
      salesperson: salespeople[Math.floor(Math.random() * salespeople.length)],
      isUrgent: false,
      contractNumber: `HT-2025-${Math.floor(Math.random() * 900) + 100}`,
      projectName: `${customer.name}农业项目`,
      endCustomer: customer.name,
      notes: '生产延期，需协调资源',
      status: 'Active',
    });
  }
  
  // ========== 3. 运输中订单（正常，未逾期）==========
  for (let i = 0; i < 8; i++) {
    const customer = customers[Math.floor(Math.random() * customers.length)];
    const product = products[Math.floor(Math.random() * products.length)];
    const quantity = Math.floor(Math.random() * 30) + 10;
    const daysUntilDue = Math.floor(Math.random() * 10) + 7; // 7-16天后到期
    
    const orderDate = addDays(today.toISOString().split('T')[0], -30);
    const plannedDeliveryDate = addDays(today.toISOString().split('T')[0], daysUntilDue);
    const shipmentDate = addDays(today.toISOString().split('T')[0], -3);
    const estimatedDeliveryDate = addDays(today.toISOString().split('T')[0], 3);
    
    orders.push({
      orderId: `SO${String(orderIdCounter++).padStart(7, '0')}`,
      orderNumber: `SO-202512-${String(orderIdCounter).padStart(5, '0')}`,
      orderName: `${customer.name}常规采购订单`,
      lineNumber: 10,
      customerId: customer.id,
      customerName: customer.name,
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      quantity,
      unit: '台',
      standardPrice: product.price,
      discountRate: Math.random() * 10,
      actualPrice: product.price * (1 - Math.random() * 0.1),
      subtotalAmount: product.price * (1 - Math.random() * 0.1) * quantity,
      taxAmount: product.price * (1 - Math.random() * 0.1) * quantity * 0.13,
      totalAmount: product.price * (1 - Math.random() * 0.1) * quantity * 1.13,
      documentDate: orderDate,
      orderDate: orderDate,
      plannedDeliveryDate: plannedDeliveryDate,
      createdDate: orderDate,
      orderStatus: '运输中',
      documentStatus: '已确认',
      deliveryStatus: '运输中',
      transactionType: '项目销售',
      salesDepartment: '销售一部',
      salesperson: salespeople[Math.floor(Math.random() * salespeople.length)],
      isUrgent: false,
      contractNumber: `HT-2025-${Math.floor(Math.random() * 900) + 100}`,
      projectName: `${customer.name}农业项目`,
      endCustomer: customer.name,
      shipmentId: `SH${String(orderIdCounter).padStart(7, '0')}`,
      shipmentNumber: `SH-202512-${String(orderIdCounter).padStart(4, '0')}`,
      shipmentDate: shipmentDate,
      warehouseId: 'WH001',
      warehouseName: '中央成品仓',
      consignee: customer.name,
      consigneePhone: `138${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
      deliveryAddress: ['广东省广州市', '陕西省西安市', '山东省青岛市', '上海市', '北京市'][Math.floor(Math.random() * 5)],
      logisticsProvider: logistics[Math.floor(Math.random() * logistics.length)],
      trackingNumber: `SF${today.getFullYear()}${String(Math.floor(Math.random() * 1000000)).padStart(6, '0')}`,
      estimatedDeliveryDate: estimatedDeliveryDate,
      status: 'Active',
    });
  }
  
  // ========== 4. 生产中订单（正常）==========
  for (let i = 0; i < 6; i++) {
    const customer = customers[Math.floor(Math.random() * customers.length)];
    const product = products[Math.floor(Math.random() * products.length)];
    const quantity = Math.floor(Math.random() * 25) + 15;
    const daysUntilDue = Math.floor(Math.random() * 20) + 15; // 15-34天后到期
    
    const orderDate = addDays(today.toISOString().split('T')[0], -10);
    const plannedDeliveryDate = addDays(today.toISOString().split('T')[0], daysUntilDue);
    const plannedStartDate = addDays(today.toISOString().split('T')[0], -5);
    const plannedFinishDate = addDays(today.toISOString().split('T')[0], 10);
    
    orders.push({
      orderId: `SO${String(orderIdCounter++).padStart(7, '0')}`,
      orderNumber: `SO-202512-${String(orderIdCounter).padStart(5, '0')}`,
      orderName: `${customer.name}批量采购订单`,
      lineNumber: 10,
      customerId: customer.id,
      customerName: customer.name,
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      quantity,
      unit: '台',
      standardPrice: product.price,
      discountRate: Math.random() * 15,
      actualPrice: product.price * (1 - Math.random() * 0.15),
      subtotalAmount: product.price * (1 - Math.random() * 0.15) * quantity,
      taxAmount: product.price * (1 - Math.random() * 0.15) * quantity * 0.13,
      totalAmount: product.price * (1 - Math.random() * 0.15) * quantity * 1.13,
      documentDate: orderDate,
      orderDate: orderDate,
      plannedDeliveryDate: plannedDeliveryDate,
      createdDate: orderDate,
      orderStatus: '生产中',
      documentStatus: '已确认',
      deliveryStatus: undefined,
      transactionType: '项目销售',
      salesDepartment: '销售一部',
      salesperson: salespeople[Math.floor(Math.random() * salespeople.length)],
      isUrgent: false,
      contractNumber: `HT-2025-${Math.floor(Math.random() * 900) + 100}`,
      projectName: `${customer.name}农业项目`,
      endCustomer: customer.name,
      productionOrderId: `PO${String(orderIdCounter).padStart(7, '0')}`,
      productionOrderNumber: `MO-202512${String(orderIdCounter).padStart(3, '0')}`,
      factoryId: 'FAC001',
      factoryName: '深圳天翼无人机总装厂',
      productionLine: ['总装线A', '总装线B', '总装线C'][Math.floor(Math.random() * 3)],
      plannedStartDate: plannedStartDate,
      plannedFinishDate: plannedFinishDate,
      workOrderStatus: '生产中',
      priority: ['高', '中'][Math.floor(Math.random() * 2)],
      status: 'Active',
    });
  }
  
  // ========== 5. 已完成订单（近期）==========
  for (let i = 0; i < 15; i++) {
    const customer = customers[Math.floor(Math.random() * customers.length)];
    const product = products[Math.floor(Math.random() * products.length)];
    const quantity = Math.floor(Math.random() * 40) + 10;
    const daysAgo = Math.floor(Math.random() * 30) + 1; // 1-30天前完成
    
    const orderDate = addDays(today.toISOString().split('T')[0], -daysAgo - 30);
    const plannedDeliveryDate = addDays(today.toISOString().split('T')[0], -daysAgo - 5);
    const shipmentDate = addDays(today.toISOString().split('T')[0], -daysAgo - 3);
    const actualDeliveryDate = addDays(today.toISOString().split('T')[0], -daysAgo);
    
    orders.push({
      orderId: `SO${String(orderIdCounter++).padStart(7, '0')}`,
      orderNumber: `SO-202511-${String(orderIdCounter).padStart(5, '0')}`,
      orderName: `${customer.name}采购订单`,
      lineNumber: 10,
      customerId: customer.id,
      customerName: customer.name,
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      quantity,
      unit: '台',
      standardPrice: product.price,
      discountRate: Math.random() * 12,
      actualPrice: product.price * (1 - Math.random() * 0.12),
      subtotalAmount: product.price * (1 - Math.random() * 0.12) * quantity,
      taxAmount: product.price * (1 - Math.random() * 0.12) * quantity * 0.13,
      totalAmount: product.price * (1 - Math.random() * 0.12) * quantity * 1.13,
      documentDate: orderDate,
      orderDate: orderDate,
      plannedDeliveryDate: plannedDeliveryDate,
      createdDate: orderDate,
      orderStatus: '已完成',
      documentStatus: '已确认',
      deliveryStatus: '已签收',
      transactionType: Math.random() > 0.5 ? '项目销售' : '直销',
      salesDepartment: '销售一部',
      salesperson: salespeople[Math.floor(Math.random() * salespeople.length)],
      isUrgent: false,
      contractNumber: Math.random() > 0.3 ? `HT-2025-${Math.floor(Math.random() * 900) + 100}` : undefined,
      projectName: Math.random() > 0.3 ? `${customer.name}农业项目` : undefined,
      endCustomer: customer.name,
      shipmentId: `SH${String(orderIdCounter).padStart(7, '0')}`,
      shipmentNumber: `SH-202511-${String(orderIdCounter).padStart(4, '0')}`,
      shipmentDate: shipmentDate,
      warehouseId: 'WH001',
      warehouseName: '中央成品仓',
      consignee: customer.name,
      consigneePhone: `138${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
      deliveryAddress: ['广东省广州市', '陕西省西安市', '山东省青岛市', '上海市', '北京市'][Math.floor(Math.random() * 5)],
      logisticsProvider: logistics[Math.floor(Math.random() * logistics.length)],
      trackingNumber: `SF${today.getFullYear()}${String(Math.floor(Math.random() * 1000000)).padStart(6, '0')}`,
      estimatedDeliveryDate: addDays(today.toISOString().split('T')[0], -daysAgo),
      actualDeliveryDate: actualDeliveryDate,
      status: 'Active',
    });
  }
  
  // ========== 6. 已取消订单 ==========
  for (let i = 0; i < 2; i++) {
    const customer = customers[Math.floor(Math.random() * customers.length)];
    const product = products[Math.floor(Math.random() * products.length)];
    const quantity = Math.floor(Math.random() * 20) + 5;
    const daysAgo = Math.floor(Math.random() * 20) + 5;
    
    const orderDate = addDays(today.toISOString().split('T')[0], -daysAgo);
    const plannedDeliveryDate = addDays(today.toISOString().split('T')[0], 15);
    
    orders.push({
      orderId: `SO${String(orderIdCounter++).padStart(7, '0')}`,
      orderNumber: `SO-202512-${String(orderIdCounter).padStart(5, '0')}`,
      orderName: `${customer.name}采购订单`,
      lineNumber: 10,
      customerId: customer.id,
      customerName: customer.name,
      productId: product.id,
      productCode: product.code,
      productName: product.name,
      quantity,
      unit: '台',
      standardPrice: product.price,
      discountRate: 0,
      actualPrice: product.price,
      subtotalAmount: product.price * quantity,
      taxAmount: product.price * quantity * 0.13,
      totalAmount: product.price * quantity * 1.13,
      documentDate: orderDate,
      orderDate: orderDate,
      plannedDeliveryDate: plannedDeliveryDate,
      createdDate: orderDate,
      orderStatus: '已取消',
      documentStatus: '已取消',
      deliveryStatus: undefined,
      transactionType: '直销',
      salesDepartment: '销售一部',
      salesperson: salespeople[Math.floor(Math.random() * salespeople.length)],
      isUrgent: false,
      notes: '客户取消订单',
      status: 'Active',
    });
  }
  
  return orders;
}

