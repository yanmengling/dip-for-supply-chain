/**
 * API测试页面
 * 用于测试和调试数据视图API
 */

import { useState } from 'react';
import { ontologyApi } from '../api/ontologyApi';
import { apiConfigService } from '../services/apiConfigService';

/**
 * 默认ID后备 (与各服务保持一致)
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

export default function ApiTestPage() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const testApi = async (name: string, type: string) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const objectTypeId = getObjectTypeId(type);
      console.log(`Testing ${name} (${objectTypeId})...`);

      const data = await ontologyApi.queryObjectInstances(objectTypeId, {
        limit: 10,
        include_type_info: true
      });

      console.log(`${name} result:`, data);
      setResult(data);
    } catch (err: any) {
      console.error(`${name} error:`, err);
      setError(err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">Ontology 业务对象测试</h1>

      <div className="grid grid-cols-2 gap-4 mb-8">
        <button
          onClick={() => testApi('供应商', 'supplier')}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          disabled={loading}
        >
          测试供应商 (Ontology)
        </button>

        <button
          onClick={() => testApi('客户', 'customer')}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
          disabled={loading}
        >
          测试客户 (Ontology)
        </button>

        <button
          onClick={() => testApi('物料', 'material')}
          className="px-4 py-2 bg-purple-500 text-white rounded hover:bg-purple-600"
          disabled={loading}
        >
          测试物料 (Ontology)
        </button>

        <button
          onClick={() => testApi('产品', 'product')}
          className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600"
          disabled={loading}
        >
          测试产品 (Ontology)
        </button>

        <button
          onClick={() => testApi('工厂', 'factory')}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
          disabled={loading}
        >
          测试工厂 (Ontology)
        </button>

        <button
          onClick={() => testApi('销售订单', 'order')}
          className="px-4 py-2 bg-indigo-500 text-white rounded hover:bg-indigo-600"
          disabled={loading}
        >
          测试销售订单 (Ontology)
        </button>
      </div>

      {loading && (
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <h3 className="text-red-800 font-semibold mb-2">错误</h3>
          <pre className="text-sm text-red-700 whitespace-pre-wrap">{error}</pre>
        </div>
      )}

      {result && (
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h3 className="text-lg font-semibold mb-4">API响应结果</h3>

          <div className="mb-4">
            <p className="text-sm text-gray-600">
              返回记录数: <span className="font-bold">{result.entries?.length || 0}</span>
            </p>
            <p className="text-sm text-gray-600">
              查询耗时: <span className="font-bold">{result.overall_ms}ms</span>
            </p>
          </div>

          {result.entries && result.entries.length > 0 && (
            <div>
              <h4 className="font-semibold mb-2">第一条记录示例：</h4>
              <pre className="bg-gray-50 p-4 rounded text-xs overflow-auto max-h-96">
                {JSON.stringify(result.entries[0], null, 2)}
              </pre>

              <h4 className="font-semibold mt-4 mb-2">字段列表：</h4>
              <div className="flex flex-wrap gap-2">
                {Object.keys(result.entries[0]).map(key => (
                  <span
                    key={key}
                    className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded"
                  >
                    {key}
                  </span>
                ))}
              </div>
            </div>
          )}

          <details className="mt-4">
            <summary className="cursor-pointer font-semibold text-gray-700 hover:text-gray-900">
              查看完整响应 (点击展开)
            </summary>
            <pre className="bg-gray-50 p-4 rounded text-xs overflow-auto max-h-96 mt-2">
              {JSON.stringify(result, null, 2)}
            </pre>
          </details>
        </div>
      )}
    </div>
  );
}

