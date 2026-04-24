// 数据服务：从数据库表构建供应链图谱数据
import type { Supplier, Material, MaterialStock, Product, Order } from '../types/database';
import {
  suppliersData,
  materialsData,
  materialStocksData,
  productsData,
  ordersData
} from '../utils/entityConfigService';

// 图谱节点类型
export interface GraphNode {
  id: string;
  name: string;
  type: 'SUPPLIER' | 'MATERIAL' | 'PRODUCT' | 'ORDER';
  [key: string]: any; // 其他属性
}

// 图谱连线
export interface GraphLink {
  from: string;
  to: string;
}

// 构建图谱数据
export const buildGraphData = () => {
  // 1. 处理供应商（去重，按供应商ID分组）
  const supplierMap = new Map<string, GraphNode>();
  suppliersData.forEach(supplier => {
    if (!supplierMap.has(supplier.supplierId)) {
      supplierMap.set(supplier.supplierId, {
        id: supplier.supplierId,
        name: supplier.supplierName,
        type: 'SUPPLIER',
        statusKey: supplier.supplierId === 'SUP-002' ? 'risk' : 'normal', // 示例：供应商B有风险
        delay: supplier.supplierId === 'SUP-002' ? 3 : 0,
      });
    }
  });
  const suppliers = Array.from(supplierMap.values());

  // 2. 处理物料（从物料编码表）
  const materials: GraphNode[] = materialsData.map(material => {
    // 计算总库存（从物料库存表汇总）
    const totalStock = materialStocksData
      .filter(stock => stock.materialCode === material.materialCode)
      .reduce((sum, stock) => sum + stock.remainingStock, 0);

    return {
      id: material.materialCode,
      name: material.materialName,
      type: 'MATERIAL',
      stock: totalStock,
      unit: '件', // 统一为"件"
      applicableProductIds: material.applicableProductIds,
    };
  });

  // 3. 处理产品（从产品表）
  const products: GraphNode[] = productsData.map(product => ({
    id: product.productId,
    name: product.productName,
    type: 'PRODUCT',
    bom: product.materialCodes, // BOM结构
    stock: product.stockQuantity,
    stockUnit: product.stockUnit || '套',
    status: product.status,
  }));

  // 4. 处理订单
  const orders: GraphNode[] = ordersData.map(order => ({
    id: order.orderId,
    name: order.orderName,
    type: 'ORDER',
    client: order.client,
    product: order.productId,
    qty: order.quantity,
    date: order.orderDate,
    due: order.dueDate,
    statusKey: order.status === '运输中' ? 'inTransit' : 'inProduction',
    status: order.status,
  }));


  // 6. 构建连线关系
  const links: GraphLink[] = [];

  // 供应商 -> 物料（通过供应商表）
  suppliersData.forEach(supplier => {
    links.push({ from: supplier.supplierId, to: supplier.materialCode });
  });

  // 物料 -> 产品（通过产品表的BOM）
  productsData.forEach(product => {
    product.materialCodes.forEach(materialCode => {
      links.push({ from: materialCode, to: product.productId });
    });
  });

  // 产品 -> 订单
  ordersData.forEach(order => {
    links.push({ from: order.productId, to: order.orderId });
  });


  return {
    suppliers,
    materials,
    products,
    orders,
    links,
  };
};

// 获取物料库存详情（按供应商分组）
export const getMaterialStockBySupplier = (materialCode: string) => {
  return materialStocksData.filter(stock => stock.materialCode === materialCode);
};

// 获取供应商供应的所有物料
export const getMaterialsBySupplier = (supplierId: string) => {
  return suppliersData
    .filter(s => s.supplierId === supplierId)
    .map(s => s.materialCode);
};

// 获取产品的BOM物料
export const getProductBOM = (productId: string) => {
  const product = productsData.find(p => p.productId === productId);
  return product?.materialCodes || [];
};

// ========== 数据操作方法 ==========

// 更新产品
export const updateProduct = (productId: string, updates: Partial<Product>) => {
  const index = productsData.findIndex(p => p.productId === productId);
  if (index !== -1) {
    productsData[index] = { ...productsData[index], ...updates };
    return true;
  }
  return false;
};

// 删除产品
export const deleteProduct = (productId: string) => {
  const index = productsData.findIndex(p => p.productId === productId);
  if (index !== -1) {
    productsData.splice(index, 1);
    // 同时删除相关的订单
    for (let i = ordersData.length - 1; i >= 0; i--) {
      if (ordersData[i].productId === productId) {
        ordersData.splice(i, 1);
      }
    }
    return true;
  }
  return false;
};

// 新增产品
export const addProduct = (product: Product) => {
  productsData.push(product);
};

// 更新物料
export const updateMaterial = (materialCode: string, updates: Partial<Material>) => {
  const index = materialsData.findIndex(m => m.materialCode === materialCode);
  if (index !== -1) {
    materialsData[index] = { ...materialsData[index], ...updates };
    return true;
  }
  return false;
};

// 删除物料
export const deleteMaterial = (materialCode: string) => {
  const index = materialsData.findIndex(m => m.materialCode === materialCode);
  if (index !== -1) {
    materialsData.splice(index, 1);
    // 删除相关的库存记录
    for (let i = materialStocksData.length - 1; i >= 0; i--) {
      if (materialStocksData[i].materialCode === materialCode) {
        materialStocksData.splice(i, 1);
      }
    }
    // 删除供应商表中相关的记录
    for (let i = suppliersData.length - 1; i >= 0; i--) {
      if (suppliersData[i].materialCode === materialCode) {
        suppliersData.splice(i, 1);
      }
    }
    return true;
  }
  return false;
};

// 新增物料
export const addMaterial = (material: Material) => {
  materialsData.push(material);
};

// 更新供应商
export const updateSupplier = (supplierId: string, supplierName: string) => {
  suppliersData.forEach((supplier, i) => {
    if (supplier.supplierId === supplierId) {
      suppliersData[i] = { ...supplier, supplierName };
    }
  });
};

// 删除供应商
export const deleteSupplier = (supplierId: string) => {
  for (let i = suppliersData.length - 1; i >= 0; i--) {
    if (suppliersData[i].supplierId === supplierId) {
      suppliersData.splice(i, 1);
    }
  }
  // 删除相关的库存记录
  for (let i = materialStocksData.length - 1; i >= 0; i--) {
    if (materialStocksData[i].supplierId === supplierId) {
      materialStocksData.splice(i, 1);
    }
  }
};

// 新增供应商
export const addSupplier = (supplier: Supplier) => {
  suppliersData.push(supplier);
};

