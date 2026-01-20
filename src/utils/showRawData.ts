/**
 * 显示原始 Ontology API 数据的调试工具
 * 直接展示 API 返回的原始数据，不做任何处理
 */

import { ontologyApi } from '../api/ontologyApi';
import { apiConfigService } from '../services/apiConfigService';

/**
 * 默认ID后备
 */
const DEFAULT_IDS: Record<string, string> = {
  supplier: 'd5700je9olk4bpa66vkg',
  material: 'd56voju9olk4bpa66vcg',
  product: 'd56v4ue9olk4bpa66v00',
  order: 'd56vh169olk4bpa66v80'
};

/**
 * 获取对象类型ID
 */
const getObjectTypeId = (type: string): string => {
  const entityType = type === 'order' ? 'sales_order' : type;
  const config = apiConfigService.getOntologyObjectByEntityType(entityType);
  if (config?.objectTypeId) {
    return config.objectTypeId;
  }
  return DEFAULT_IDS[type] || '';
};

async function showRawData(name: string, type: string) {
  console.log(`🔍 显示 ${name} 原始 Ontology 数据...`);
  try {
    const objectTypeId = getObjectTypeId(type);
    const response = await ontologyApi.queryObjectInstances(objectTypeId, { limit: 3 });
    console.log(`📦 ${name} 响应:`, response);
    console.log(`📋 前3条原始数据:`, response.entries);
    if (response.entries?.[0]) {
      console.log(`🔑 字段列表:`, Object.keys(response.entries[0]));
    }
  } catch (error) {
    console.error(`❌ ${name} 查询失败:`, error);
  }
}

export const showRawSupplierData = () => showRawData('供应商', 'supplier');
export const showRawMaterialData = () => showRawData('物料', 'material');
export const showRawCustomerData = () => showRawData('客户', 'customer');
export const showRawProductData = () => showRawData('产品', 'product');
export const showRawFactoryData = () => showRawData('工厂', 'factory');
export const showRawSalesOrderData = () => showRawData('销售订单', 'order');

// 在开发环境中自动暴露到window
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as any).showRawSupplierData = showRawSupplierData;
  (window as any).showRawMaterialData = showRawMaterialData;
  (window as any).showRawCustomerData = showRawCustomerData;
  (window as any).showRawProductData = showRawProductData;
  (window as any).showRawFactoryData = showRawFactoryData;
  (window as any).showRawSalesOrderData = showRawSalesOrderData;

  console.log('💡 原始数据显示工具已加载 (Ontology):');
  console.log('  - window.showRawSupplierData()');
  console.log('  - window.showRawMaterialData()');
  console.log('  - window.showRawCustomerData()');
  console.log('  - window.showRawProductData()');
  console.log('  - window.showRawFactoryData()');
  console.log('  - window.showRawSalesOrderData()');
}

