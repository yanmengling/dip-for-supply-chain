import { useState, useEffect } from 'react';
import {
  Settings, UserCheck, Database, Users, Package, Warehouse,
  ShoppingCart, Award, ChevronDown, ChevronRight, Factory, GitBranch,
  Globe, Brain, TrendingUp, Bot, Workflow
} from 'lucide-react';
import GlobalObjectView from './GlobalObjectView';
import UserManagementView from './UserManagementView';
import EntityListPage from './EntityListPage';
import KnowledgeGraphView from './KnowledgeGraphView';
import ApiConfigListView from './ApiConfigListView';
import ApiConfigEditor from './ApiConfigEditor';
import GlobalSettingsView from './GlobalSettingsView';
import type { EntityType } from '../../types/ontology';
import type { ApiConfigType, AnyApiConfig } from '../../types/apiConfig';
import { initializeEntityData } from '../../utils/entityConfigService';
import { useDataMode } from '../../contexts/DataModeContext';

type ConfigView = 'global-object' | 'knowledge-network' | 'knowledge-graph' | 'users' | 'global-settings' | 'api-config';
type KnowledgeNetworkView = 'supplier' | 'material' | 'product' | 'warehouse' | 'order' | 'customer' | 'factory' | null;
type ApiConfigView = 'knowledge-network-config' | 'data-view-config' | 'metric-model-config' | 'agent-config' | 'workflow-config' | null;

interface Props {
  onBack: () => void;
}


/**
 * Map ApiConfigView to ApiConfigType
 */
function getApiConfigType(view: ApiConfigView): ApiConfigType {
  const mapping: Record<NonNullable<ApiConfigView>, ApiConfigType> = {
    'knowledge-network-config': 'knowledge_network' as ApiConfigType,
    'data-view-config': 'data_view' as ApiConfigType,
    'metric-model-config': 'metric_model' as ApiConfigType,
    'agent-config': 'agent' as ApiConfigType,
    'workflow-config': 'workflow' as ApiConfigType
  };
  return mapping[view!];
}

const ConfigBackendLayout = ({ onBack }: Props) => {
  const [currentView, setCurrentView] = useState<ConfigView>('knowledge-graph');
  const [knowledgeNetworkView, setKnowledgeNetworkView] = useState<KnowledgeNetworkView>(null);
  const [isKnowledgeNetworkExpanded, setIsKnowledgeNetworkExpanded] = useState(false);
  const [apiConfigView, setApiConfigView] = useState<ApiConfigView>(null);
  const [isApiConfigExpanded, setIsApiConfigExpanded] = useState(false);
  const [editingConfig, setEditingConfig] = useState<AnyApiConfig | null>(null);
  const [isCreatingConfig, setIsCreatingConfig] = useState(false);

  // Ensure data is initialized when config backend is opened
  useEffect(() => {
    initializeEntityData();
  }, []);

  const sidebarMenu = [
    { id: 'global-settings' as const, label: '全局设置', icon: Globe },
    { id: 'knowledge-graph' as const, label: '业务知识网络预览', icon: GitBranch },
    {
      id: 'api-config' as const,
      label: 'API 配置管理',
      icon: Settings,
      children: [
        { id: 'knowledge-network-config' as const, label: '知识网络配置', icon: GitBranch },
        { id: 'data-view-config' as const, label: '数据视图配置', icon: Database },
        { id: 'metric-model-config' as const, label: '指标模型配置', icon: TrendingUp },
        { id: 'agent-config' as const, label: 'Agent 配置', icon: Bot },
        { id: 'workflow-config' as const, label: '工作流配置', icon: Workflow },
      ]
    },
    {
      id: 'knowledge-network' as const,
      label: '供应链知识网络',
      icon: Database,
      children: [
        { id: 'supplier' as const, label: '供应商对象', icon: Users },
        { id: 'material' as const, label: '物料对象', icon: Package },
        { id: 'product' as const, label: '产品对象', icon: Package },
        { id: 'factory' as const, label: '工厂对象', icon: Factory },
        { id: 'warehouse' as const, label: '库存对象', icon: Warehouse },
        { id: 'order' as const, label: '订单对象', icon: ShoppingCart },
        { id: 'customer' as const, label: '客户对象', icon: Award },
      ]
    },
    { id: 'users' as const, label: '用户管理', icon: UserCheck },
  ];

  return (
    <div className="flex h-full bg-slate-50">
      <div className="w-64 bg-white border-r border-slate-200">
        <div className="p-4 border-b border-slate-200">
          <button
            onClick={onBack}
            className="flex items-center gap-2 text-slate-600 hover:text-slate-800 transition-colors"
          >
            <Settings size={20} />
            <span className="font-semibold">配置后台</span>
          </button>
        </div>
        <nav className="p-2 space-y-1">
          {sidebarMenu.map(item => {
            if ('children' in item) {
              // Handle expandable menus
              const isKnowledgeNetwork = item.id === 'knowledge-network';
              const isApiConfig = item.id === 'api-config';
              const isExpanded = isKnowledgeNetwork ? isKnowledgeNetworkExpanded : isApiConfigExpanded;
              const isActive = currentView === item.id;

              return (
                <div key={item.id}>
                  <button
                    onClick={() => {
                      if (isKnowledgeNetwork) {
                        setIsKnowledgeNetworkExpanded(!isKnowledgeNetworkExpanded);
                        if (!isKnowledgeNetworkExpanded) {
                          setCurrentView('knowledge-network');
                          setKnowledgeNetworkView('supplier');
                        }
                      } else if (isApiConfig) {
                        setIsApiConfigExpanded(!isApiConfigExpanded);
                        if (!isApiConfigExpanded) {
                          setCurrentView('api-config');
                          setApiConfigView('knowledge-network-config');
                        }
                      }
                    }}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-sm transition-colors ${isActive
                      ? 'bg-indigo-50 text-indigo-600'
                      : 'text-slate-600 hover:bg-slate-50'
                      }`}
                  >
                    <div className="flex items-center gap-2">
                      <item.icon size={16} />
                      {item.label}
                    </div>
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                  {isExpanded && item.children && (
                    <div className="ml-6 mt-1 space-y-1">
                      {item.children.map(child => {
                        const isChildActive = isKnowledgeNetwork
                          ? knowledgeNetworkView === child.id
                          : apiConfigView === child.id;

                        return (
                          <button
                            key={child.id}
                            onClick={() => {
                              if (isKnowledgeNetwork) {
                                setKnowledgeNetworkView(child.id as KnowledgeNetworkView);
                                setCurrentView('knowledge-network');
                              } else if (isApiConfig) {
                                setApiConfigView(child.id as ApiConfigView);
                                setCurrentView('api-config');
                              }
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${isChildActive
                              ? 'bg-indigo-50 text-indigo-600'
                              : 'text-slate-600 hover:bg-slate-50'
                              }`}
                          >
                            <child.icon size={14} />
                            {child.label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }
            return (
              <button
                key={item.id}
                onClick={() => {
                  setCurrentView(item.id);
                  setKnowledgeNetworkView(null);
                  setApiConfigView(null);
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors ${currentView === item.id
                  ? 'bg-indigo-50 text-indigo-600'
                  : 'text-slate-600 hover:bg-slate-50'
                  }`}
              >
                <item.icon size={16} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex-1 overflow-auto">
        {currentView === 'global-settings' && <GlobalSettingsView />}
        {currentView === 'global-object' && <GlobalObjectView />}
        {currentView === 'knowledge-graph' && <KnowledgeGraphView />}
        {currentView === 'knowledge-network' && knowledgeNetworkView && (
          <EntityListPage entityType={knowledgeNetworkView as EntityType} />
        )}
        {currentView === 'knowledge-network' && !knowledgeNetworkView && (
          <div className="flex items-center justify-center h-full text-slate-400">
            请从左侧选择一个对象类型
          </div>
        )}
        {currentView === 'api-config' && apiConfigView && (
          <ApiConfigListView
            configType={getApiConfigType(apiConfigView)}
            onEdit={(config) => setEditingConfig(config)}
            onCreate={() => setIsCreatingConfig(true)}
          />
        )}
        {currentView === 'api-config' && !apiConfigView && (
          <div className="flex items-center justify-center h-full text-slate-400">
            请从左侧选择一个配置类型
          </div>
        )}
        {currentView === 'users' && <UserManagementView />}
      </div>

      {/* API Config Editor Modal */}
      {(editingConfig || isCreatingConfig) && apiConfigView && (
        <ApiConfigEditor
          configType={getApiConfigType(apiConfigView)}
          config={editingConfig}
          onSave={(config) => {
            setEditingConfig(null);
            setIsCreatingConfig(false);
            // Trigger refresh by re-rendering the list view
          }}
          onCancel={() => {
            setEditingConfig(null);
            setIsCreatingConfig(false);
          }}
        />
      )}
    </div>
  );
};

export default ConfigBackendLayout;
