// 数据库表类型定义

// 供应商表
export interface Supplier {
  supplierId: string;        // 供应商ID
  supplierName: string;       // 供应商名称
  materialName: string;       // 供应物料名称
  materialCode: string;       // 物料编码
}

// 物料编码表
export interface Material {
  materialCode: string;       // 物料编码
  materialName: string;       // 物料名称
  applicableProductIds: string[]; // 物料适用产品编号（数组）
}

// 物料库存表
export interface MaterialStock {
  materialCode: string;       // 物料编码
  supplierId: string;         // 供应商ID
  remainingStock: number;      // 剩余库存数量
  purchaseTime: string;       // 采购时间
  purchaseQuantity: number;    // 采购数量
}

// 产品表
export interface Product {
  productId: string;          // 产品编号
  productName: string;        // 产品名称
  materialCodes: string[];    // 物料编码（数组，BOM结构）
}

// 订单表（扩展）
export interface Order {
  orderId: string;
  orderName: string;
  client: string;
  productId: string;
  quantity: number;
  orderDate: string;
  dueDate: string;
  status: string;
}

// 商机表
export interface Opportunity {
  opportunityId: string;
  opportunityName: string;
  client: string;
  productId: string;
  quantity: number;
  estimatedDate: string;
  probability: string;
}

