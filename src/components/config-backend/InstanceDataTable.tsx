/**
 * 业务对象实例数据表（可注入查询函数，供 KnowledgeGraphView / Skill 复用）
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Loader2, Search, AlertCircle } from 'lucide-react';
import type { ObjectType } from '../../api';
import type { ObjectInstancesResponse, QueryObjectInstancesOptions } from '../../api/ontologyApi';

function getPropertyDisplayName(p: { name: string; alias?: string; display_name?: string }): string {
  return p.display_name || p.alias || p.name;
}

export interface InstanceDataTableProps {
  objectType: ObjectType;
  queryInstances: (
    objectTypeId: string,
    options?: QueryObjectInstancesOptions
  ) => Promise<ObjectInstancesResponse>;
}

export function InstanceDataTable({ objectType, queryInstances }: InstanceDataTableProps) {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchText, setSearchText] = useState('');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const pageSize = 10;

  const fetchData = useCallback(async () => {
    if (!objectType.id) return;
    try {
      setLoading(true);
      setError(null);
      const response = await queryInstances(objectType.id, {
        limit: 10000,
        need_total: true,
        timeout: 90000, // 物料等大数据量对象类型需更长超时（90s）
      });
      setData(response.entries || []);
      setTotalCount(response.total_count ?? (response.entries || []).length);
    } catch (err) {
      console.error(`Failed to fetch data for ${objectType.name}:`, err);
      setError(err instanceof Error ? err.message : '加载数据失败');
    } finally {
      setLoading(false);
    }
  }, [objectType.id, queryInstances]);

  useEffect(() => {
    if (objectType.id) fetchData();
  }, [objectType.id, refreshTrigger, fetchData]);

  const columns =
    objectType.data_properties?.map((p) => ({ key: p.name, label: getPropertyDisplayName(p) })) ||
    (data.length > 0
      ? Object.keys(data[0])
          .slice(0, 5)
          .map((k) => ({ key: k, label: k }))
      : []);

  const displayColumns = columns.filter((c) => !c.key.startsWith('_') && c.key !== 'id');

  const filteredData = useMemo(() => {
    if (!searchText.trim()) return data;
    const q = searchText.trim().toLowerCase();
    return data.filter((row) =>
      displayColumns.some((col) => String(row[col.key] ?? '').toLowerCase().includes(q))
    );
  }, [data, searchText, displayColumns]);

  const filteredCount = filteredData.length;
  const totalPages = Math.ceil(filteredCount / pageSize) || 1;
  const paginatedData = filteredData.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchText]);

  if (loading)
    return (
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm h-40 flex items-center justify-center">
        <div className="flex gap-2 text-slate-500">
          <Loader2 className="animate-spin" size={16} />
          <span className="text-sm">正在加载 {objectType.name} 数据...</span>
        </div>
      </div>
    );

  if (error) {
    return (
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm min-h-[120px] flex flex-col items-center justify-center gap-3">
        <div className="flex items-center gap-2 text-amber-600">
          <AlertCircle size={18} />
          <span className="text-sm font-medium">加载失败</span>
        </div>
        <p className="text-xs text-slate-500 text-center max-w-xs">{error}</p>
        <button
          type="button"
          onClick={() => setRefreshTrigger((t) => t + 1)}
          className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
        >
          重试
        </button>
      </div>
    );
  }

  if (displayColumns.length === 0)
    return (
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
        <h3 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: objectType.color || '#6366f1' }}
          />
          {objectType.name}
          <span className="text-xs font-normal text-slate-500">({totalCount} 条记录)</span>
        </h3>
        <div className="text-sm text-slate-400 italic text-center py-4">暂无数据或字段定义</div>
      </div>
    );

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage((p) => p - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage((p) => p + 1);
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex flex-col gap-3">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: objectType.color || '#6366f1' }}
            />
            {objectType.name}
            <span className="text-xs font-normal text-slate-500">({totalCount} 条记录)</span>
          </h3>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="按属性值搜索过滤..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 bg-white"
          />
        </div>
        {searchText.trim() && (
          <p className="text-xs text-slate-500">
            筛选结果：共 {filteredCount} 条（总 {data.length} 条）
          </p>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
            <tr>
              {displayColumns.map((col) => (
                <th key={col.key} className="px-4 py-2 font-medium whitespace-nowrap">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedData.length > 0 ? (
              paginatedData.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                  {displayColumns.map((col) => (
                    <td
                      key={col.key}
                      className="px-4 py-2 text-slate-600 whitespace-nowrap max-w-[200px] truncate"
                    >
                      {String(row[col.key] || '-')}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td
                  colSpan={displayColumns.length}
                  className="px-4 py-8 text-center text-slate-400 italic"
                >
                  暂无数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {data.length > 0 && (
        <div className="px-4 py-2 border-t border-slate-100 flex justify-between items-center bg-slate-50/30 flex-wrap gap-2">
          <div className="text-xs text-slate-500">
            {searchText.trim()
              ? `显示 ${(currentPage - 1) * pageSize + 1} - ${Math.min(currentPage * pageSize, filteredCount)} 条，筛选后共 ${filteredCount} 条（总 ${data.length} 条）`
              : `显示 ${(currentPage - 1) * pageSize + 1} - ${Math.min(currentPage * pageSize, data.length)} 条，共 ${data.length} 条`}
            {totalCount > data.length && (
              <span className="ml-1 text-slate-400">(后端总数 {totalCount})</span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 1}
              className="px-2 py-1 text-xs border border-slate-200 rounded bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              上一页
            </button>
            <span className="text-xs text-slate-600 self-center">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-2 py-1 text-xs border border-slate-200 rounded bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
