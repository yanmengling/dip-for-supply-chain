import { useState, useEffect, useMemo } from 'react';
import { Search, Download } from 'lucide-react';
import { getEntitiesByType, getEntityConfig } from '../../utils/entityConfigService';
import { fetchEntitiesByType } from '../../services/entityDataService';
import type { EntityType, EntityConfig } from '../../types/ontology';
import RightPanel from './RightPanel';
import { materialStocksData } from '../../utils/entityConfigService';
import { calculateProductLogicRules, calculateMaterialLogicRules, calculateOrderLogicRules } from '../../utils/logicRuleService';


interface Props {
  entityType: EntityType;
}

const EntityListPage = ({ entityType }: Props) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedConfig, setSelectedConfig] = useState<EntityConfig | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [entities, setEntities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const itemsPerPage = 10;

  // Get global data mode (for display indicator only)
  // const { mode, isApiMode } = useDataMode();

  // Fetch entities - always call API (httpClient will use the correct config based on mode)
  useEffect(() => {
    async function loadEntities() {
      try {
        setLoading(true);
        setError(null);

        // Always fetch from API - httpClient automatically selects the right config
        console.log(`[EntityListPage] Fetching ${entityType}...`);
        const data = await fetchEntitiesByType(entityType);
        setEntities(data);
        console.log(`[EntityListPage] Successfully loaded ${data.length} ${entityType}`);
      } catch (err) {
        console.error(`[EntityListPage] Failed to load ${entityType}:`, err);
        setError(err instanceof Error ? err.message : '数据加载失败');
        setEntities([]);
      } finally {
        setLoading(false);
      }
    }

    loadEntities();
  }, [entityType]);

  // Memoize calculated logic rules for all entities to improve performance
  const entitiesWithCalculatedRules = useMemo(() => {
    return entities.map((entity: any) => {
      let calculatedRules = null;

      switch (entityType) {
        case 'product':
          calculatedRules = calculateProductLogicRules(entity);
          break;
        case 'material':
          const materialStock = materialStocksData.find(ms => ms.materialCode === entity.materialCode);
          calculatedRules = calculateMaterialLogicRules(entity, materialStock);
          break;
        case 'order':
          calculatedRules = calculateOrderLogicRules(entity);
          break;
      }

      return { ...entity, _calculatedRules: calculatedRules };
    });
  }, [entities, entityType]);

  const filteredEntities = useMemo(() => {
    if (!searchQuery) return entitiesWithCalculatedRules;
    const query = searchQuery.toLowerCase();
    // Filter entities based on type-specific name fields to ensure correct filtering
    return entitiesWithCalculatedRules.filter((entity: any) => {
      let name: string;
      switch (entityType) {
        case 'supplier':
          name = entity.supplierName || '';
          break;
        case 'material':
          name = entity.materialName || '';
          break;
        case 'product':
          name = entity.productName || '';
          break;
        case 'order':
          name = entity.orderName || '';
          break;
        case 'warehouse':
          name = entity.warehouseName || '';
          break;
        case 'factory':
          name = entity.factoryName || '';
          break;
        case 'logistics':
          name = entity.logisticsName || '';
          break;
        case 'customer':
          name = entity.customerName || '';
          break;
        default:
          name = entity[`${entityType}Name`] || entity.name || '';
      }
      return String(name).toLowerCase().includes(query);
    });
  }, [entitiesWithCalculatedRules, searchQuery, entityType]);

  // Reset to first page when search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Calculate pagination
  const totalPages = Math.ceil(filteredEntities.length / itemsPerPage);
  const paginatedEntities = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredEntities.slice(startIndex, endIndex);
  }, [filteredEntities, currentPage]);

  useEffect(() => {
    // Reset selection and config when entity type changes
    setSelectedEntityId(null);
    setSelectedConfig(null);
    setSearchQuery(''); // Also reset search query
    setCurrentPage(1); // Reset to first page when switching entity types
  }, [entityType]);

  useEffect(() => {
    if (selectedEntityId) {
      const config = getEntityConfig(entityType, selectedEntityId);
      setSelectedConfig(config);
    } else {
      setSelectedConfig(null);
    }
  }, [selectedEntityId, entityType]);


  // Helper functions for displaying related data


  // 获取所有字段名（用于动态表格头部）
  const getAllFieldNames = (entities: any[]): string[] => {
    if (!entities || entities.length === 0) return [];
    const allFields = new Set<string>();

    entities.forEach(entity => {
      if (entity && typeof entity === 'object') {
        Object.keys(entity).forEach(field => allFields.add(field));
      }
    });

    return Array.from(allFields).sort();
  };

  const renderTableHeaders = () => {
    const fieldNames = getAllFieldNames(entities);
    return (
      <>
        {fieldNames.map(fieldName => (
          <th key={fieldName} className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase whitespace-nowrap">
            {fieldName}
          </th>
        ))}
      </>
    );
  };

  const renderTableRow = (entity: any, index: number) => {
    // 使用index作为key，因为原始数据可能没有唯一ID
    const isSelected = selectedEntityId === `${entityType}-${index}`;

    const baseRowClass = `border-b border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50' : ''
      }`;

    // 动态渲染所有字段
    const fieldNames = getAllFieldNames(entities);

    return (
      <tr key={`${entityType}-${index}`} onClick={() => setSelectedEntityId(isSelected ? null : `${entityType}-${index}`)} className={baseRowClass}>
        {fieldNames.map(fieldName => {
          const value = entity[fieldName];
          const displayValue = value === null || value === undefined ? '' :
            typeof value === 'object' ? JSON.stringify(value) : String(value);

          return (
            <td key={fieldName} className="px-4 py-3 whitespace-nowrap text-sm text-slate-600" title={displayValue}>
              {displayValue}
            </td>
          );
        })}
      </tr>
    );
  };

  return (
    <div className="flex h-screen bg-slate-50">
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-2xl font-bold text-slate-800">
              {entityType === 'supplier' ? '供应商对象' :
                entityType === 'material' ? '物料对象' :
                  entityType === 'product' ? '产品对象' :
                    entityType === 'factory' ? '产品BOM对象' :
                      entityType === 'order' ? '订单对象' :
                        entityType === 'warehouse' ? '库存对象' :
                          entityType === 'customer' ? '生产计划对象' : '对象列表'}
            </h1>
            <div className="flex items-center gap-2">
              {/* Data source indicator */}
              <div
                className="px-3 py-1.5 text-xs rounded-lg font-medium bg-gradient-to-r from-indigo-500 to-purple-600 text-white border border-transparent"
                title="当前使用DIP供应链大脑API数据"
              >
                🌐 DIP供应链大脑
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  placeholder="搜索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2">
                <Download size={16} />
                导出
              </button>
            </div>
          </div>

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
                <p className="text-sm text-slate-600">加载数据中...</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && !loading && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-2">
                <span className="text-red-600">❌</span>
                <div>
                  <p className="text-sm font-medium text-red-800">数据加载失败</p>
                  <p className="text-xs text-red-700 mt-1">错误信息: {error}</p>
                  <p className="text-xs text-red-600 mt-1">请尝试切换到 Mock 数据模式或检查网络连接</p>
                </div>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!loading && filteredEntities.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <p>暂无数据</p>
            </div>
          )}

          {/* Data Table */}
          {!loading && filteredEntities.length > 0 && (
            <div className="bg-white rounded-lg shadow overflow-hidden">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>{renderTableHeaders()}</tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {paginatedEntities.map((entity, index) => renderTableRow(entity, index))}
                  </tbody>
                </table>
              </div>
              {/* Pagination Component */}
              {totalPages > 0 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-white">
                  <div className="text-sm text-slate-600">
                    总计 <span className="font-medium text-slate-800">{filteredEntities.length}</span> 个对象
                  </div>
                  <div className="flex items-center gap-2">
                    {/* 上一页按钮 */}
                    <button
                      onClick={() => setCurrentPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      上一页
                    </button>

                    {/* 页码按钮 */}
                    {(() => {
                      const pages: (number | string)[] = [];
                      if (totalPages <= 7) {
                        // 如果总页数少于7页，显示所有页码
                        for (let i = 1; i <= totalPages; i++) {
                          pages.push(i);
                        }
                      } else {
                        // 显示带省略号的页码
                        pages.push(1);
                        if (currentPage > 3) pages.push('...');
                        for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
                          pages.push(i);
                        }
                        if (currentPage < totalPages - 2) pages.push('...');
                        pages.push(totalPages);
                      }
                      return pages.map((page, index) => (
                        page === '...' ? (
                          <span key={`ellipsis-${index}`} className="px-2 text-slate-400">...</span>
                        ) : (
                          <button
                            key={page}
                            onClick={() => setCurrentPage(page as number)}
                            className={`px-3 py-1 text-sm border rounded ${currentPage === page
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'border-slate-300 hover:bg-slate-50'
                              }`}
                          >
                            {page}
                          </button>
                        )
                      ));
                    })()}

                    {/* 下一页按钮 */}
                    <button
                      onClick={() => setCurrentPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      下一页
                    </button>

                    {/* 跳转输入框 */}
                    <div className="flex items-center gap-1 ml-4">
                      <span className="text-sm text-slate-600">跳转到</span>
                      <input
                        type="number"
                        min={1}
                        max={totalPages}
                        className="w-16 px-2 py-1 text-sm border border-slate-300 rounded"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const page = parseInt((e.target as HTMLInputElement).value);
                            if (page >= 1 && page <= totalPages) {
                              setCurrentPage(page);
                              (e.target as HTMLInputElement).value = '';
                            }
                          }
                        }}
                      />
                      <span className="text-sm text-slate-600">页</span>
                    </div>

                    {/* 分页信息 */}
                    <div className="ml-4 text-sm text-slate-600">
                      第 <span className="font-medium">{currentPage}</span> 页，共 <span className="font-medium">{totalPages}</span> 页
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {selectedConfig && (
        <div className="w-96 border-l border-slate-200 bg-white transition-all">
          <RightPanel
            config={selectedConfig}
            onClose={() => setSelectedEntityId(null)}
          />
        </div>
      )}
    </div>
  );
};

export default EntityListPage;
