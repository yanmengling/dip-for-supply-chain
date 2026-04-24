/**
 * Global Object View
 * 
 * Displays a two-tier visualization matching the screenshot:
 * - Top tier: 8 entity type cards in a horizontal flow with dashed connectors
 * - Bottom tier: 3 core objects (Material, Product, Order) highlighted
 */

import { Network, Download, Users, Package, Factory, Target, Warehouse, ShoppingCart, Truck, Award, Activity } from 'lucide-react';
import { getKnowledgeGraphData } from '../../utils/entityConfigService';
import type { EntityType } from '../../types/ontology';

const GlobalObjectView = () => {
  const graphData = getKnowledgeGraphData();
  
  const entityIcons: Record<EntityType, typeof Users> = {
    supplier: Users,
    material: Package,
    factory: Factory,
    product: Target,
    warehouse: Warehouse,
    order: ShoppingCart,
    logistics: Truck,
    customer: Award,
  };
  
  const entityColorClasses: Record<EntityType, {
    border: string;
    borderHover: string;
    bgFrom: string;
    bgTo: string;
    text: string;
    gradientFrom: string;
    gradientTo: string;
  }> = {
    supplier: {
      border: 'border-emerald-200',
      borderHover: 'hover:border-emerald-400',
      bgFrom: 'from-emerald-100',
      bgTo: 'to-emerald-50',
      text: 'text-emerald-600',
      gradientFrom: 'from-emerald-500',
      gradientTo: 'to-emerald-600',
    },
    material: {
      border: 'border-indigo-200',
      borderHover: 'hover:border-indigo-400',
      bgFrom: 'from-indigo-100',
      bgTo: 'to-indigo-50',
      text: 'text-indigo-600',
      gradientFrom: 'from-indigo-500',
      gradientTo: 'to-indigo-600',
    },
    factory: {
      border: 'border-purple-200',
      borderHover: 'hover:border-purple-400',
      bgFrom: 'from-purple-100',
      bgTo: 'to-purple-50',
      text: 'text-purple-600',
      gradientFrom: 'from-purple-500',
      gradientTo: 'to-purple-600',
    },
    product: {
      border: 'border-amber-200',
      borderHover: 'hover:border-amber-400',
      bgFrom: 'from-amber-100',
      bgTo: 'to-amber-50',
      text: 'text-amber-600',
      gradientFrom: 'from-amber-500',
      gradientTo: 'to-amber-600',
    },
    warehouse: {
      border: 'border-cyan-200',
      borderHover: 'hover:border-cyan-400',
      bgFrom: 'from-cyan-100',
      bgTo: 'to-cyan-50',
      text: 'text-cyan-600',
      gradientFrom: 'from-cyan-500',
      gradientTo: 'to-cyan-600',
    },
    order: {
      border: 'border-blue-200',
      borderHover: 'hover:border-blue-400',
      bgFrom: 'from-blue-100',
      bgTo: 'to-blue-50',
      text: 'text-blue-600',
      gradientFrom: 'from-blue-500',
      gradientTo: 'to-blue-600',
    },
    logistics: {
      border: 'border-teal-200',
      borderHover: 'hover:border-teal-400',
      bgFrom: 'from-teal-100',
      bgTo: 'to-teal-50',
      text: 'text-teal-600',
      gradientFrom: 'from-teal-500',
      gradientTo: 'to-teal-600',
    },
    customer: {
      border: 'border-pink-200',
      borderHover: 'hover:border-pink-400',
      bgFrom: 'from-pink-100',
      bgTo: 'to-pink-50',
      text: 'text-pink-600',
      gradientFrom: 'from-pink-500',
      gradientTo: 'to-pink-600',
    },
  };
  
  const coreObjects: EntityType[] = ['material', 'product', 'order'];
  
  const totalObjects = graphData.nodes.reduce((sum, node) => sum + node.count, 0);
  
  // Flow order matching the screenshot: supplier -> material -> factory -> product -> warehouse -> order -> logistics -> customer
  const flowOrder: EntityType[] = ['supplier', 'material', 'factory', 'product', 'warehouse', 'order', 'logistics', 'customer'];
  
  const handleExport = () => {
    const exportData = {
      nodes: graphData.nodes,
      edges: graphData.edges,
      exportedAt: new Date().toISOString(),
    };
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'global-object-graph.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="h-full flex flex-col bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="p-4 bg-white border-b shadow-sm">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              <Network size={22} className="text-indigo-600"/>
              供应链知识网络
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">全局视图 · 共 {totalObjects} 个业务对象</p>
          </div>
          <button 
            onClick={handleExport}
            className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:shadow-md flex items-center gap-1 transition-all"
          >
            <Download size={12}/> 导出
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-6xl mx-auto">
          <div className="relative">
            {/* Top Tier: 8 Entity Type Cards in Flow */}
            <div className="flex items-center justify-center gap-2 mb-8">
              {flowOrder.map((type, index) => {
                const node = graphData.nodes.find(n => n.type === type);
                if (!node) return null;
                const Icon = entityIcons[node.type];
                const colors = entityColorClasses[node.type];
                return (
                  <div key={node.type} className="flex items-center">
                    <div 
                      className={`bg-white border-2 ${colors.border} rounded-lg p-2.5 hover:shadow-lg ${colors.borderHover} transition-all cursor-pointer group relative`}
                    >
                      <div className={`w-9 h-9 mx-auto mb-1.5 bg-gradient-to-br ${colors.bgFrom} ${colors.bgTo} rounded-lg flex items-center justify-center group-hover:scale-110 transition-transform`}>
                        <Icon size={18} className={colors.text}/>
                      </div>
                      <div className="text-center">
                        <div className="text-xs font-bold text-slate-600 mb-0.5">{node.name}</div>
                        <div className="text-xl font-extrabold text-slate-800">{node.count}</div>
                        <div className="text-xs text-slate-400">个对象</div>
                      </div>
                    </div>
                    {/* Dashed line connector (except last) */}
                    {index < flowOrder.length - 1 && (
                      <div className="w-4 h-0.5 border-t-2 border-dashed border-slate-400 mx-1"></div>
                    )}
                  </div>
                );
              })}
            </div>
            
            {/* Bottom Tier: Core Objects Section */}
            <div className="grid grid-cols-3 gap-4 max-w-3xl mx-auto">
              {graphData.nodes
                .filter(n => coreObjects.includes(n.type))
                .map(core => {
                  const Icon = entityIcons[core.type];
                  const colors = entityColorClasses[core.type];
                  return (
                    <div 
                      key={core.type} 
                      className={`bg-gradient-to-br ${colors.gradientFrom} ${colors.gradientTo} rounded-lg p-4 text-white shadow-lg hover:shadow-xl hover:scale-105 transition-all cursor-pointer`}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-9 h-9 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
                          <Icon size={18}/>
                        </div>
                        <div>
                          <div className="font-bold">{core.name}</div>
                          <div className="text-xs opacity-90">核心对象</div>
                        </div>
                      </div>
                      <div className="text-2xl font-extrabold">{core.count}</div>
                      <div className="text-xs bg-white/10 px-2 py-1 rounded mt-2 backdrop-blur-sm">驱动业务流程</div>
                    </div>
                  );
                })}
            </div>
          </div>
          
          {/* Legend */}
          <div className="mt-8 flex justify-center gap-6 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-6 h-0.5 bg-slate-400 border-t-2 border-dashed"></div>
              <span className="text-slate-600">主流程</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-5 h-5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded"></div>
              <span className="text-slate-600">核心对象</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Activity size={14} className="text-emerald-600"/>
              <span className="text-slate-600">实时数据映射</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GlobalObjectView;
