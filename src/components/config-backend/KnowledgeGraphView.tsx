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
import { Home, Factory, Warehouse, Users, Package, Box, GitBranch, ShoppingCart, Truck, MapPin } from 'lucide-react';


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

const KnowledgeGraphView = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

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
      // API returns response object { data: { entries: [...] }, status: ... }
      // Use type assertion to avoid "Property does not exist on type unknown" errors
      const objParams: any = objectTypesData;
      const relParams: any = relationTypesData;

      const objectTypes = (objParams?.data?.entries ||
        (Array.isArray(objParams?.data) ? objParams.data : [])) as ObjectType[];

      const relationTypes = (relParams?.data?.entries ||
        (Array.isArray(relParams?.data) ? relParams.data : [])) as EdgeType[];

      if (!Array.isArray(objectTypes)) {
        console.error('Object types response:', objectTypesData);
        // Fallback to empty
        // throw new Error('Object types is not an array');
      }

      console.log(`[KnowledgeGraphView] Loaded ${objectTypes.length} object types and ${relationTypes.length} relation types`);

      const newNodes = objectTypes.map((t, i) => objectTypeToNode(t, i, objectTypes.length));
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

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="p-4 bg-white border-b shadow-sm">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <GitBranch size={22} className="text-indigo-600" />
              业务知识网络预览
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              从 API 实时加载 · {nodes.length} 个对象类型 · {edges.length} 条关系
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => loadKnowledgeNetwork()}
              className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200"
            >
              🔄 刷新数据
            </button>
          </div>
        </div>
      </div>

      {/* React Flow Canvas */}
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

      {/* Footer Stats */}
      <div className="px-4 py-2 bg-white border-t">
        <div className="flex gap-6 text-xs">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-indigo-500"></div>
            <span className="text-slate-600">对象类型: {nodes.length}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-0.5 bg-slate-400"></div>
            <span className="text-slate-600">关系: {edges.length} 条</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">💡 提示：拖动节点移动，滚轮缩放，拖动空白区域平移</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default KnowledgeGraphView;
