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
 * 测试 BOM bom_version 过滤是否在 API 侧生效
 *
 * 用法（浏览器控制台）：
 *   window.testBomVersionFilter('943-000003')
 *
 * 测试逻辑：
 *   1. 无版本过滤，查 limit=5 拿到可用的 bom_version 值
 *   2. 用 == 过滤 bom_version
 *   3. 用 == 过滤 bom_version + alt_priority=0
 *   4. 对比结果
 */
async function testBomVersionFilter(productCode: string = '943-000003') {
  const bomTypeId = getObjectTypeId('bom') || 'supplychain_hd0202_bom';
  console.log(`[BOM版本过滤测试] 产品=${productCode}, 对象类型=${bomTypeId}`);

  // Step 1: 不带版本过滤，拿一批数据，获取版本列表
  console.log('\n── Step 1: 查询所有版本（limit=100）──');
  const t1 = Date.now();
  const resp1 = await ontologyApi.queryObjectInstances(bomTypeId, {
    condition: {
      operation: 'and',
      sub_conditions: [
        { field: 'bom_material_code', operation: '==', value: productCode },
      ]
    },
    limit: 100,
    need_total: true,
    timeout: 120000,
  });
  const entries1 = resp1.entries || [];
  const total1 = (resp1 as any).total_count ?? entries1.length;
  const versions = [...new Set(entries1.map((e: any) => e.bom_version || ''))].sort();
  const latestVersion = versions[versions.length - 1] || '';
  console.log(`  返回 ${entries1.length} 条 (total=${total1}), 耗时 ${Date.now() - t1}ms`);
  console.log(`  版本列表: ${versions.join(', ')}`);
  console.log(`  最新版本: ${latestVersion}`);

  if (!latestVersion) {
    console.error('  ❌ 无法获取版本号，终止测试');
    return;
  }

  // Step 2: 用 == 过滤 bom_version
  console.log(`\n── Step 2: bom_version == "${latestVersion}" ──`);
  const t2 = Date.now();
  const resp2 = await ontologyApi.queryObjectInstances(bomTypeId, {
    condition: {
      operation: 'and',
      sub_conditions: [
        { field: 'bom_material_code', operation: '==', value: productCode },
        { field: 'bom_version', operation: '==', value: latestVersion },
      ]
    },
    limit: 1000,
    need_total: true,
    timeout: 120000,
  });
  const entries2 = resp2.entries || [];
  const total2 = (resp2 as any).total_count ?? entries2.length;
  console.log(`  返回 ${entries2.length} 条 (total=${total2}), 耗时 ${Date.now() - t2}ms`);

  // Step 3: 加 alt_priority=0
  console.log(`\n── Step 3: bom_version == "${latestVersion}" AND alt_priority == 0 ──`);
  const t3 = Date.now();
  const resp3 = await ontologyApi.queryObjectInstances(bomTypeId, {
    condition: {
      operation: 'and',
      sub_conditions: [
        { field: 'bom_material_code', operation: '==', value: productCode },
        { field: 'bom_version', operation: '==', value: latestVersion },
        { field: 'alt_priority', operation: '==', value: 0 },
      ]
    },
    limit: 1000,
    need_total: true,
    timeout: 120000,
  });
  const entries3 = resp3.entries || [];
  const total3 = (resp3 as any).total_count ?? entries3.length;
  console.log(`  返回 ${entries3.length} 条 (total=${total3}), 耗时 ${Date.now() - t3}ms`);

  // Step 4: 仅 alt_priority=0（不带版本），然后客户端过滤
  console.log(`\n── Step 4: 仅 alt_priority == 0（无版本过滤）──`);
  const t4 = Date.now();
  const resp4 = await ontologyApi.queryObjectInstances(bomTypeId, {
    condition: {
      operation: 'and',
      sub_conditions: [
        { field: 'bom_material_code', operation: '==', value: productCode },
        { field: 'alt_priority', operation: '==', value: 0 },
      ]
    },
    limit: 10000,
    need_total: true,
    timeout: 120000,
  });
  const entries4 = resp4.entries || [];
  const total4 = (resp4 as any).total_count ?? entries4.length;
  const clientFiltered = entries4.filter((e: any) => e.bom_version === latestVersion);
  console.log(`  返回 ${entries4.length} 条 (total=${total4}), 耗时 ${Date.now() - t4}ms`);
  console.log(`  客户端过滤最新版本后: ${clientFiltered.length} 条`);

  // 总结
  console.log('\n══════════════════════════════════════');
  console.log('测试结论:');
  if (total2 > 0) {
    console.log(`  ✅ bom_version == 过滤生效！返回 ${total2} 条`);
    console.log(`  ✅ bom_version + alt_priority 联合过滤: ${total3} 条`);
    console.log(`  📊 与客户端过滤对比: API=${total3} vs 客户端=${clientFiltered.length}`);
  } else {
    console.log(`  ❌ bom_version == 过滤不生效（返回 0 条）`);
    console.log(`  📊 客户端过滤方案: alt_priority=0 返回 ${total4} 条，过滤版本后 ${clientFiltered.length} 条`);
  }
  console.log('══════════════════════════════════════');

  return { step1: { total: total1, versions }, step2: total2, step3: total3, step4: { total: total4, clientFiltered: clientFiltered.length } };
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

    (window as any).testBomVersionFilter = testBomVersionFilter;

    console.log('Ontology Debugger loaded. Available commands:');
    console.log('  - window.testOntologyApi(type) - e.g., "supplier", "product"');
    console.log('  - window.testAllOntologyObjects()');
    console.log('  - window.testBomVersionFilter(productCode) - 测试 bom_version 过滤');
  }
}

