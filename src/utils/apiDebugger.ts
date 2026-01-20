/**
 * Ontology API 调试工具
 * 用于测试和调试本体对象 API 调用
 */

import { ontologyApi } from '../api/ontologyApi';
import { apiConfigService } from '../services/apiConfigService';

export interface ApiTestResult {
  method: string;
  url: string;
  success: boolean;
  data?: any;
  error?: string;
  responseTime?: number;
}

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

/**
 * 测试本体对象 API
 */
export async function testOntologyApi(type: string): Promise<ApiTestResult[]> {
  const results: ApiTestResult[] = [];
  const objectTypeId = getObjectTypeId(type);

  // 方式1: 基础查询
  try {
    const startTime = Date.now();
    const response = await ontologyApi.queryObjectInstances(objectTypeId, { limit: 5 });
    results.push({
      method: `Query ${type} (limit 5)`,
      url: `ontology-query/v1/.../object-types/${objectTypeId}`,
      success: true,
      data: response,
      responseTime: Date.now() - startTime,
    });
  } catch (err: any) {
    results.push({
      method: `Query ${type} (limit 5)`,
      url: `ontology-query/v1/.../object-types/${objectTypeId}`,
      success: false,
      error: err.message || String(err),
    });
  }

  // 方式2: 包含类型信息
  try {
    const startTime = Date.now();
    const response = await ontologyApi.queryObjectInstances(objectTypeId, {
      limit: 1,
      include_type_info: true
    });
    results.push({
      method: `Query ${type} (with type info)`,
      url: `ontology-query/v1/.../object-types/${objectTypeId}?include_type_info=true`,
      success: true,
      data: response,
      responseTime: Date.now() - startTime,
    });
  } catch (err: any) {
    results.push({
      method: `Query ${type} (with type info)`,
      url: `ontology-query/v1/.../object-types/${objectTypeId}?include_type_info=true`,
      success: false,
      error: err.message || String(err),
    });
  }

  return results;
}

/**
 * 测试所有核心本体对象
 */
export async function testAllOntologyObjects(): Promise<Record<string, ApiTestResult[]>> {
  const results: Record<string, ApiTestResult[]> = {};
  const types = ['supplier', 'customer', 'material', 'product', 'factory', 'order'];

  for (const type of types) {
    console.log(`Testing Ontology Object: ${type}...`);
    results[type] = await testOntologyApi(type);
  }

  return results;
}

/**
 * 打印测试结果
 */
export function printTestResults(results: ApiTestResult[]): void {
  console.group('Ontology API Test Results');
  results.forEach((result, index) => {
    console.group(`${index + 1}. ${result.method}`);
    console.log('URL Fragment:', result.url);
    console.log('Success:', result.success);
    if (result.success) {
      console.log('Response Time:', result.responseTime, 'ms');
      console.log('Data:', result.data);
    } else {
      console.error('Error:', result.error);
    }
    console.groupEnd();
  });
  console.groupEnd();
}

/**
 * 在浏览器控制台中运行测试
 * window.testOntologyApi('supplier')
 */
export function setupGlobalDebugger(): void {
  if (typeof window !== 'undefined') {
    (window as any).testOntologyApi = async (type: string) => {
      const results = await testOntologyApi(type || 'supplier');
      printTestResults(results);
      return results;
    };

    (window as any).testAllOntologyObjects = async () => {
      console.log('Testing all core ontology objects...');
      const results = await testAllOntologyObjects();
      console.log('All Results:', results);
      return results;
    };

    console.log('Ontology Debugger loaded. Available commands:');
    console.log('  - window.testOntologyApi(type) - e.g., "supplier", "product"');
    console.log('  - window.testAllOntologyObjects()');
  }
}

