/**
 * 知识网络图谱画布：纯展示 + 数据拉取，接收 knId 与客户端，供管理配置页与 Skill 复用
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
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
import type { ObjectType, EdgeType } from '../../api';
import type { SkillOntologyClient } from '../../services/skillOntologyClient';
import { Home, Factory, Warehouse, Users, Package, Box, GitBranch, ShoppingCart, Truck, MapPin, Loader2, Database } from 'lucide-react';
import { InstanceDataTable } from './InstanceDataTable';

const ICON_MAP: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
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

function objectTypeToNode(objectType: ObjectType, index: number, total: number): Node {
  const Icon = ICON_MAP[objectType.name] || Package;
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

function edgeTypeToEdge(edgeType: EdgeType): Edge {
  const sourceId = edgeType.source_type || edgeType.source_object_type_id;
  const targetId = edgeType.target_type || edgeType.target_object_type_id;
  const edgeColor =
    edgeType.color ||
    edgeType.source_object_type?.color ||
    edgeType.target_object_type?.color ||
    '#94a3b8';

  return {
    id: edgeType.id,
    source: sourceId,
    target: targetId,
    type: 'smoothstep',
    animated: true,
    style: { stroke: edgeColor, strokeWidth: 2 },
    markerEnd: { type: MarkerType.ArrowClosed, color: edgeColor },
    label: edgeType.name,
    labelStyle: { fontSize: 11, fontWeight: 600, fill: '#475569' },
    labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9 },
  };
}

const nodeTypes = {};
const edgeTypes = {};

export interface KnowledgeGraphCanvasProps {
  knId: string;
  client: SkillOntologyClient;
  title?: string;
  onRefresh?: () => void;
}

export function KnowledgeGraphCanvas({
  knId,
  client,
  title = '业务知识网络',
  onRefresh,
}: KnowledgeGraphCanvasProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [loading, setLoading] = useState(true);
  const [objectTypes, setObjectTypes] = useState<ObjectType[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string>('graph');
  const [viewMode, setViewMode] = useState<'graph' | 'data'>('graph');

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  const loadKnowledgeNetwork = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [objectTypesList, relationTypesList] = await Promise.all([
        client.getObjectTypes(knId, { limit: -1 }),
        client.getRelationTypes(knId, { limit: -1 }),
      ]);
      setObjectTypes(objectTypesList);
      const newNodes = objectTypesList.map((t, i) =>
        objectTypeToNode(t, i, objectTypesList.length)
      );
      const newEdges = (relationTypesList || []).map(edgeTypeToEdge);
      setNodes(newNodes);
      setEdges(newEdges);
    } catch (err) {
      console.error('Failed to load knowledge graph:', err);
      setError(err instanceof Error ? err.message : '获取数据失败');
    } finally {
      setLoading(false);
    }
  }, [knId, client, setNodes, setEdges]);

  useEffect(() => {
    loadKnowledgeNetwork();
  }, [loadKnowledgeNetwork]);

  useEffect(() => {
    if (objectTypes.length > 0 && activeTab === 'graph') {
      setActiveTab(objectTypes[0].id);
    }
  }, [objectTypes]);

  const queryInstances = useCallback(
    (objectTypeId: string, options?: Parameters<SkillOntologyClient['queryObjectInstances']>[2]) =>
      client.queryObjectInstances(knId, objectTypeId, options),
    [client, knId]
  );

  const activeObjectType = useMemo(
    () => objectTypes.find((t) => t.id === activeTab),
    [objectTypes, activeTab]
  );

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" />
          <p className="text-sm font-medium text-slate-600">加载知识网络...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <div className="text-center max-w-md p-6 bg-red-50 border border-red-200 rounded-lg">
          <div className="text-red-600 font-bold mb-2">加载失败</div>
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
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
      <div className="flex-shrink-0 bg-white border-b shadow-sm z-10">
        <div className="p-4 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              {title}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              {nodes.length} 类对象 · {edges.length} 类关系
            </p>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button
              onClick={() => setViewMode('graph')}
              className={`px-4 py-1.5 text-xs font-medium rounded-md flex items-center gap-2 transition-all ${
                viewMode === 'graph'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <GitBranch size={14} />
              图谱
            </button>
            <button
              onClick={() => {
                setViewMode('data');
                if (activeTab === 'graph' && objectTypes.length > 0) setActiveTab(objectTypes[0].id);
              }}
              className={`px-4 py-1.5 text-xs font-medium rounded-md flex items-center gap-2 transition-all ${
                viewMode === 'data'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Database size={14} />
              业务数据
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { loadKnowledgeNetwork(); onRefresh?.(); }}
              className="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-medium hover:bg-slate-200"
            >
              刷新
            </button>
          </div>
        </div>
        {viewMode === 'data' && (
          <div className="px-4 border-t border-slate-100 flex gap-1 overflow-x-auto custom-scrollbar bg-slate-50/50">
            {objectTypes.map((ot) => (
              <button
                key={ot.id}
                onClick={() => setActiveTab(ot.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
                  activeTab === ot.id
                    ? 'border-indigo-600 text-indigo-600 bg-indigo-50/50'
                    : 'border-transparent text-slate-600 hover:text-indigo-600 hover:bg-slate-50'
                }`}
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
                  <div className="w-3 h-3 rounded-full bg-indigo-500" />
                  <span className="text-slate-600">对象类型: {nodes.length}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-0.5 bg-slate-400" />
                  <span className="text-slate-600">关系: {edges.length} 条</span>
                </div>
              </div>
            </div>
          </div>
        )}
        {viewMode === 'data' && activeObjectType && (
          <div className="absolute inset-0 bg-slate-50 p-6 overflow-y-auto animate-in fade-in duration-300">
            <div className="max-w-7xl mx-auto">
              <InstanceDataTable
                key={activeObjectType.id}
                objectType={activeObjectType}
                queryInstances={queryInstances}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
