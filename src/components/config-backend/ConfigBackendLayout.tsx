/**
 * Config Backend Layout
 * 
 * Main layout for the configuration backend interface.
 * Provides sidebar navigation to switch between different configuration views.
 */

import { useState } from 'react';
import {
  GitBranch, Database, BarChart2, Bot, Workflow,
  Settings, ArrowLeft, Layout, Menu, Key
} from 'lucide-react';
import { ApiConfigType, type AnyApiConfig } from '../../types/apiConfig';
import { ApiConfigListView } from './ApiConfigListView';
import { ApiConfigEditor } from './ApiConfigEditor';
import KnowledgeGraphView from './KnowledgeGraphView';
import GlobalSettingsView from './GlobalSettingsView';

interface ConfigBackendLayoutProps {
  onBack: () => void;
}

type ConfigViewType =
  | 'visual_graph'
  | 'global_settings'
  | ApiConfigType;

const MENU_ITEMS = [
  {
    id: 'visual_graph',
    label: '业务知识网络可视化',
    icon: GitBranch,
    group: '可视化'
  },
  {
    id: 'global_settings',
    label: '全局设置',
    icon: Key,
    group: '系统配置'
  },
  {
    id: ApiConfigType.KNOWLEDGE_NETWORK,
    label: '业务知识网络配置',
    icon: Settings,
    group: '系统配置'
  },
  {
    id: ApiConfigType.ONTOLOGY_OBJECT,
    label: '业务知识网络对象类',
    icon: Database,
    group: '系统配置'
  },
  {
    id: ApiConfigType.METRIC_MODEL,
    label: '业务知识网络指标模型',
    icon: BarChart2,
    group: '系统配置'
  },
  {
    id: ApiConfigType.AGENT,
    label: 'Decision Agent 配置',
    icon: Bot,
    group: '系统配置'
  },
  {
    id: ApiConfigType.WORKFLOW,
    label: 'Workflow 配置',
    icon: Workflow,
    group: '系统配置'
  }
];

export default function ConfigBackendLayout({ onBack }: ConfigBackendLayoutProps) {
  const [activeView, setActiveView] = useState<ConfigViewType>('visual_graph');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Editor State
  const [editingConfig, setEditingConfig] = useState<AnyApiConfig | null>(null);
  const [isCreatingConfig, setIsCreatingConfig] = useState(false);
  const [editorConfigType, setEditorConfigType] = useState<ApiConfigType>(ApiConfigType.KNOWLEDGE_NETWORK);

  const handleCreate = (type: ApiConfigType) => {
    setEditorConfigType(type);
    setEditingConfig(null);
    setIsCreatingConfig(true);
  };

  const handleEdit = (config: AnyApiConfig) => {
    setEditorConfigType(config.type);
    setEditingConfig(config);
    setIsCreatingConfig(true);
  };

  const handleSave = (config: AnyApiConfig) => {
    // Note: The actual saving to backend/service logic would be handled by the Editor 
    // calling the service directly or passing the object back here.
    // ApiConfigEditor's onSave prop expects a callback that receives the config.
    // Since ApiConfigEditor handles validation, here we just need to close the modal 
    // and trigger a list refresh. 
    // However, ApiConfigListView loads data on mount/update. 
    // We can force a refresh by key or by passing a refresh trigger using context/state,
    // but ApiConfigEditor usually calls the service itself? 
    // Checking ApiConfigEditor logic: It calls `onSave` passing the form data. 
    // It does NOT seem to call `apiConfigService.saveConfig` internally inside `handleSave`.
    // Wait, let me re-read ApiConfigEditor.tsx.

    // Checked ApiConfigEditor.tsx: 
    // const handleSave = () => { ... onSave(formData); }
    // It does NOT call apiConfigService.saveConfig. 
    // So distinct layer of responsibility: Editor validates and prepares object, Parent (Layout) saves it.

    import('../../services/apiConfigService').then(({ apiConfigService }) => {
      apiConfigService.saveConfig(config);
      setIsCreatingConfig(false);
      setEditingConfig(null);
      // We rely on ApiConfigListView re-rendering or fetching data. 
      // Ideally ApiConfigListView should subscribe to changes or we pass a refresh key.
      // For now, simple state update will trigger re-render of this component, 
      // but ApiConfigListView uses internal state seeded from service.
      // We might need to force ApiConfigListView to reload.
      // We'll increment a version key for the active view to force remount/reload.
      setViewVersion(v => v + 1);
    });
  };

  const [viewVersion, setViewVersion] = useState(0);

  return (
    <div className="flex h-full bg-slate-100">
      {/* Sidebar */}
      <div
        className={`${isSidebarOpen ? 'w-64' : 'w-16'
          } bg-slate-900 text-white transition-all duration-300 flex flex-col shadow-lg z-20`}
      >
        {/* Sidebar Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-700">
          {isSidebarOpen && (
            <div className="flex items-center gap-2 font-bold text-lg">
              <Layout className="text-indigo-400" size={24} />
              <span>配置中心</span>
            </div>
          )}
          <button
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <Menu size={20} />
          </button>
        </div>

        {/* Navigation */}
        <div className="flex-1 overflow-y-auto py-4">
          <div className="space-y-1 px-2">
            {MENU_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveView(item.id as ConfigViewType)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${isActive
                    ? 'bg-indigo-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                    }`}
                  title={!isSidebarOpen ? item.label : undefined}
                >
                  <Icon size={20} />
                  {isSidebarOpen && <span className="text-sm font-medium">{item.label}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer actions */}
        <div className="p-4 border-t border-slate-700">
          <button
            onClick={onBack}
            className={`w-full flex items-center gap-2 px-4 py-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors ${!isSidebarOpen ? 'justify-center' : ''
              }`}
          >
            <ArrowLeft size={20} />
            {isSidebarOpen && <span className="text-sm font-medium">返回应用</span>}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {activeView === 'visual_graph' ? (
          <KnowledgeGraphView />
        ) : activeView === 'global_settings' ? (
          <GlobalSettingsView />
        ) : (
          <ApiConfigListView
            key={`${activeView}-${viewVersion}`} // Force reload on save/switch
            configType={activeView as ApiConfigType}
            onCreate={() => handleCreate(activeView as ApiConfigType)}
            onEdit={handleEdit}
          />
        )}
      </div>

      {/* Editor Modal */}
      {(isCreatingConfig || editingConfig) && (
        <ApiConfigEditor
          configType={editorConfigType}
          config={editingConfig}
          onSave={handleSave}
          onCancel={() => {
            setIsCreatingConfig(false);
            setEditingConfig(null);
          }}
        />
      )}
    </div>
  );
}
