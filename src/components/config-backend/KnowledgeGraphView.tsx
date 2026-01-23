/**
 * Knowledge Graph View - Interactive Visualization
 *
 * Fetches knowledge network data from real API and renders as draggable graph
 */

import { useState, useEffect, useCallback } from 'react';
import ReactFlow, {
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  MarkerType,
  BackgroundVariant,
} from 'reactflow';
import type { Connection, Node, Edge } from 'reactflow';
import 'reactflow/dist/style.css';
import { ontologyApi } from '../../api';
import type { ObjectType, EdgeType } from '../../api';
import { Home, Factory, Warehouse, Users, Package, Box, GitBranch, ShoppingCart, Truck, MapPin, Loader2, Database } from 'lucide-react';


// Icon mapping for common entity types
const ICON_MAP: Record<string, any> = {
  '住宅': Home,
  '工厂': Factory,
  '仓库': Warehouse,
  '仓位置': MapPin,
  '客户': Users,
  '产品': Package,
  '物料': Box,
  '产品BOM': GitBranch,
  '采购订单': ShoppingCart,
  '物料发放订单': ShoppingCart,
  '运营渠道': Truck,
  '采购订单事件': ShoppingCart,
  '产品类别预测点': GitBranch,
};

// Convert API ObjectType to ReactFlow Node
function objectTypeToNode(objectType: ObjectType, index: number, total: number): Node {
  const Icon = ICON_MAP[objectType.name] || Package;

  // Auto-layout: circular arrangement
  const radius = 300;
  const angle = (index / total) * 2 * Math.PI;
  const x = 500 + radius * Math.cos(angle);
  const y = 400 + radius * Math.sin(angle);

  const propertyCount = objectType.data_properties?.length || 0;

  return {
    id: objectType.id,
    type: 'default',
    position: { x, y },
    data: {
      label: (
        <div className="flex flex-col items-center gap-1 p-2">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: objectType.color || '#6366f1' }}
          >
            <Icon size={20} className="text-white" />
          </div>
          <div className="text-xs font-semibold text-slate-700">{objectType.name}</div>
          {propertyCount > 0 && (
            <div className="text-xs text-slate-400">{propertyCount} 属性</div>
          )}
        </div>
      ),
    },
    style: {
      background: 'white',
      border: `2px solid ${objectType.color || '#6366f1'}`,
      borderRadius: 12,
      padding: 4,
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
    },
  };
}

// Convert API EdgeType to ReactFlow Edge
function edgeTypeToEdge(edgeType: EdgeType): Edge {
  // Use source_type/target_type if available, otherwise use source_object_type_id/target_object_type_id
  const sourceId = edgeType.source_type || edgeType.source_object_type_id;
  const targetId = edgeType.target_type || edgeType.target_object_type_id;

  // Use color from edge or from source/target object types
  const edgeColor = edgeType.color ||
    edgeType.source_object_type?.color ||
    edgeType.target_object_type?.color ||
    '#94a3b8';

  return {
    id: edgeType.id,
    source: sourceId,
    target: targetId,
    type: 'smoothstep',
    animated: true,
    style: {
      stroke: edgeColor,
      strokeWidth: 2,
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: edgeColor,
    },
    label: edgeType.name,
    labelStyle: {
      fontSize: 11,
      fontWeight: 600,
      fill: '#475569',
    },
    labelBgStyle: {
      fill: '#ffffff',
      fillOpacity: 0.9,
    },
  };
}

const nodeTypes = {};
const edgeTypes = {};

// Instance Data Table Component
const InstanceDataTable = ({ objectType }: { objectType: ObjectType }) => {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Using the configured objectType.id which comes from the API
        const response = await ontologyApi.queryObjectInstances(objectType.id, {
          limit: 1000,
          need_total: true
        });
        setData(response.entries || []);
        if (response.total_count) {
          setTotalCount(response.total_count);
        } else {
          setTotalCount((response.entries || []).length);
        }
      } catch (err) {
        console.error(`Failed to fetch data for ${objectType.name}:`, err);
        setError('加载数据失败');
      } finally {
        setLoading(false);
      }
    };

    if (objectType.id) {
      fetchData();
    }
  }, [objectType.id]);

  if (loading) return (
    <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm h-40 flex items-center justify-center">
      <div className="flex items-center gap-2 text-slate-500">
        <Loader2 className="animate-spin" size={16} />
        <span className="text-sm">正在加载 {objectType.name} 数据...</span>
      </div>
    </div>
  );

  if (error) return null; // Skip if error

  // Identify columns from the first record or objectType properties
  const columns = objectType.data_properties?.map(p => ({ key: p.name, label: p.alias || p.name }))
    || (data.length > 0 ? Object.keys(data[0]).slice(0, 5).map(k => ({ key: k, label: k })) : []);

  // Filter out internal fields if using auto-discovery
  const displayColumns = columns.filter(c => !c.key.startsWith('_') && c.key !== 'id');

  if (displayColumns.length === 0) return (
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

  // Pagination Logic
  const totalPages = Math.ceil(data.length / pageSize);
  const paginatedData = data.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(p => p - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(p => p + 1);
  };

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden flex flex-col">
      <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <div
            className="w-3 h-3 rounded-full"
            style={{ backgroundColor: objectType.color || '#6366f1' }}
          />
          {objectType.name}
          <span className="text-xs font-normal text-slate-500">({totalCount} 条记录)</span>
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-500 uppercase bg-slate-50 border-b border-slate-100">
            <tr>
              {displayColumns.map(col => (
                <th key={col.key} className="px-4 py-2 font-medium whitespace-nowrap">{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {paginatedData.length > 0 ? (
              paginatedData.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                  {displayColumns.map(col => (
                    <td key={col.key} className="px-4 py-2 text-slate-600 whitespace-nowrap max-w-[200px] truncate">
                      {String(row[col.key] || '-')}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={displayColumns.length} className="px-4 py-8 text-center text-slate-400 italic">
                  暂无数据
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {data.length > 0 && (
        <div className="px-4 py-2 border-t border-slate-100 flex justify-between items-center bg-slate-50/30">
          <div className="text-xs text-slate-500">
            显示 {(currentPage - 1) * pageSize + 1} - {Math.min(currentPage * pageSize, data.length)} 条，共 {data.length} 条
            {totalCount > data.length && <span className="ml-1 text-slate-400">(总数 {totalCount})</span>}
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
              {currentPage} / {totalPages || 1}
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
};

const KnowledgeGraphView = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [objectTypes, setObjectTypes] = useState<ObjectType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('graph'); // 'graph' or objectType.id
  // View Mode State - Moved to top to avoid Hook Rule violation
  const [viewMode, setViewMode] = useState<'graph' | 'data'>('graph');

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  // Set default active tab when object types are loaded
  useEffect(() => {
    if (objectTypes.length > 0 && activeTab === 'graph') {
      setActiveTab(objectTypes[0].id);
    }
  }, [objectTypes]);

  const loadKnowledgeNetwork = async () => {
    try {
      setLoading(true);
      setError(null);

      // Use httpClient to avoid CORS and handle authentication
      const { httpClient } = await import('../../api/httpClient');
      const { globalSettingsService } = await import('../../services/globalSettingsService');
      const knowledgeNetworkId = globalSettingsService.getKnowledgeNetworkId();

      const [objectTypesData, relationTypesData] = await Promise.all([
        httpClient.get(`/proxy-ontology-manager/v1/knowledge-networks/${knowledgeNetworkId}/object-types?limit=-1`),
        httpClient.get(`/proxy-ontology-manager/v1/knowledge-networks/${knowledgeNetworkId}/relation-types?limit=-1`)
      ]);

      // Extract arrays from response
      const objParams: any = objectTypesData;
      const relParams: any = relationTypesData;

      const fetchedObjectTypes = (objParams?.data?.entries ||
        (Array.isArray(objParams?.data) ? objParams.data : [])) as ObjectType[];

      const relationTypes = (relParams?.data?.entries ||
        (Array.isArray(relParams?.data) ? relParams.data : [])) as EdgeType[];

      if (!Array.isArray(fetchedObjectTypes)) {
        console.error('Object types response:', objectTypesData);
      }

      console.log(`[KnowledgeGraphView] Loaded ${fetchedObjectTypes.length} object types and ${relationTypes.length} relation types`);

      setObjectTypes(fetchedObjectTypes);

      const newNodes = fetchedObjectTypes.map((t, i) => objectTypeToNode(t, i, fetchedObjectTypes.length));
      const newEdges = (relationTypes || []).map(edgeTypeToEdge);

      setNodes(newNodes);
      setEdges(newEdges);
    } catch (err) {
      console.error('Failed to load knowledge graph:', err);
      setError(err instanceof Error ? err.message : '获取数据失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadKnowledgeNetwork();
  }, []);

  // Loading state
  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-sm font-medium text-slate-600">加载知识网络...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center max-w-md p-6 bg-red-50 border border-red-200 rounded-lg">
          <div className="text-red-600 font-bold mb-2">❌ 加载失败</div>
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={() => loadKnowledgeNetwork()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700"
          >
            重新加载
          </button>
        </div>
      </div>
    );
  }



  // Get current active object type
  const activeObjectType = objectTypes.find(t => t.id === activeTab);

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b shadow-sm z-10">
        <div className="p-4 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <GitBranch size={22} className="text-indigo-600" />
              业务知识网络
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              供应链业务知识网络 · {nodes.length} 类对象 · {edges.length} 类关系
            </p>
          </div>

          {/* View Switcher (Level 1 Hierarchy) */}
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setViewMode('graph')}
              className={`px-4 py-1.5 text-xs font-medium rounded-md flex items-center gap-2 transition-all
                 ${viewMode === 'graph'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'}`}
            >
              <GitBranch size={14} />
              供应链业务知识网络
            </button>
            <button
              onClick={() => {
                setViewMode('data');
                if (activeTab === 'graph' && objectTypes.length > 0) {
                  setActiveTab(objectTypes[0].id);
                }
              }}
              className={`px-4 py-1.5 text-xs font-medium rounded-md flex items-center gap-2 transition-all
                 ${viewMode === 'data'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Database size={14} />
              业务数据
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => loadKnowledgeNetwork()}
              className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200"
            >
              🔄 刷新
            </button>
          </div>
        </div>

        {/* Tabs Navigation (Level 2 Hierarchy - Only visible in Data Mode) */}
        {viewMode === 'data' && (
          <div className="px-4 border-t border-slate-100 flex gap-1 overflow-x-auto custom-scrollbar bg-slate-50/50">
            {objectTypes.map(ot => (
              <button
                key={ot.id}
                onClick={() => setActiveTab(ot.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2
                  ${activeTab === ot.id
                    ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                    : 'border-transparent text-slate-600 hover:text-indigo-600 hover:bg-slate-50'}`}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: ot.color || '#6366f1' }}
                />
                {ot.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-hidden relative">
        {/* Graph View Content */}
        {viewMode === 'graph' && (
          <div className="absolute inset-0 flex flex-col animate-in fade-in duration-300">
            <div className="flex-1">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                edgeTypes={edgeTypes}
                fitView
                minZoom={0.5}
                maxZoom={2}
              >
                <Controls />
                <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
              </ReactFlow>
            </div>
            <div className="px-4 py-2 bg-white border-t flex-shrink-0 z-10">
              <div className="flex gap-6 text-xs justify-center">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-indigo-500"></div>
                  <span className="text-slate-600">对象类型: {nodes.length}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-0.5 bg-slate-400"></div>
                  <span className="text-slate-600">关系: {edges.length} 条</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Data View Content */}
        {viewMode === 'data' && activeObjectType && (
          <div className="absolute inset-0 bg-slate-50 p-6 overflow-y-auto animate-in fade-in duration-300">
            <div className="max-w-7xl mx-auto">
              <InstanceDataTable key={activeObjectType.id} objectType={activeObjectType} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default KnowledgeGraphView;
