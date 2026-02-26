/**
 * DIP for Supply Chain - Supply Chain Brain
 * 
 * Main application component integrating all supply chain management views.
 * 
 * Constitution Compliance:
 * - Principle 1: Types should reference src/types/ontology.ts (TODO: migrate types)
 * - Principle 2: Uses semantic color variables from Tailwind v4
 * - Principle 3: ✅ Refactored - main component now focuses on navigation and routing
 * - Principle 4: No simulation mode in V2 - data isolation not applicable
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  LayoutDashboard, Package, Truck, Users, TrendingUp, Settings,
  Brain, Database, Calendar
} from 'lucide-react';
import logoIcon from './assets/logo.svg';
import SupplierEvaluationPage from './components/supplier-evaluation/SupplierEvaluationPage';
import { ProductSupplyOptimizationPage } from './components/product-supply-optimization/ProductSupplyOptimizationPage';
import { CopilotSidebar } from './components/shared/CopilotSidebar';
import type { CopilotMessage } from './components/shared/CopilotSidebar';
import CockpitView from './components/views/CockpitView';
import SearchView from './components/views/SearchView';
import InventoryView from './components/views/InventoryView';
import DeliveryViewEnhanced from './components/views/DeliveryViewEnhanced';
import PlanningView from './components/views/PlanningView';
import PlanningViewV2 from './components/views/PlanningViewV2';
import { getCopilotConfig } from './utils/copilotConfig';
import type { CopilotSidebarProps } from './components/shared/CopilotSidebar';
import { useHeaderHeight } from './hooks/useHeaderHeight';
import { useConversation } from './hooks/useConversation';
import ConfigBackendLayout from './components/config-backend/ConfigBackendLayout';
import { populateEntityConfigs } from './utils/entityConfigService';
import { initializeEntityData } from './utils/entityConfigService';
import { navigationConfigService } from './services/navigationConfigService';

// Full navigation items (icons and labels)
const ALL_NAV_ITEMS = [
  { id: 'cockpit' as const, label: '驾驶舱', icon: LayoutDashboard },
  { id: 'planning' as const, label: '老版计划协同', icon: Calendar },
  { id: 'planningV2' as const, label: '动态计划协同', icon: Calendar },
  { id: 'inventory' as const, label: '库存优化', icon: Package },
  { id: 'optimization' as const, label: '产品供应优化', icon: TrendingUp },
  { id: 'delivery' as const, label: '订单交付', icon: Truck },
  { id: 'evaluation' as const, label: '供应商评估', icon: Users },
];

type ViewType = 'cockpit' | 'search' | 'planning' | 'planningV2' | 'inventory' | 'optimization' | 'delivery' | 'evaluation' | 'config';

const SupplyChainAppContent = () => {
  const [currentView, setCurrentView] = useState<ViewType>('cockpit');
  const [visibleNavigation, setVisibleNavigation] = useState<typeof ALL_NAV_ITEMS>(ALL_NAV_ITEMS);
  const [copilotOpen, setCopilotOpen] = useState(false);
  const [copilotProps, setCopilotProps] = useState<Omit<CopilotSidebarProps, 'isOpen' | 'onClose'>>({
    title: '供应链智能助手',
    initialMessages: [{ type: 'bot', text: '欢迎使用供应链智能助手！' }],
    suggestions: [],
  });

  const headerRef = useRef<HTMLDivElement>(null);
  const headerHeight = useHeaderHeight(headerRef);

  // Global conversation tracking (unified across all pages)
  const [globalConversationId, setGlobalConversationId] = useState<string | undefined>(undefined);
  const [globalMessages, setGlobalMessages] = useState<CopilotMessage[]>([]);

  // Initialize conversation management (kept for compatibility, but not actively used)
  const conversation = useConversation({
    agentId: 'supply_chain_agent',
    autoLoad: false // We'll load conversations when copilot opens
  });

  // Load navigation config and filter visible sections (reload when view changes, e.g. returning from config)
  useEffect(() => {
    const config = navigationConfigService.loadConfig();
    const enabledIds = new Set(config.sections.filter((s) => s.enabled).map((s) => s.id));
    const idToSection = new Map(config.sections.map((s) => [s.id, s]));
    const filtered = ALL_NAV_ITEMS.filter((n) => enabledIds.has(n.id)).map((n) => ({
      ...n,
      label: idToSection.get(n.id)?.label?.trim() || n.label,
    }));
    setVisibleNavigation(filtered.length > 0 ? filtered : ALL_NAV_ITEMS);

    // If current view was disabled, switch to first enabled
    if (currentView !== 'config' && currentView !== 'search' && !enabledIds.has(currentView)) {
      setCurrentView((filtered[0]?.id ?? 'cockpit') as ViewType);
    }
  }, [currentView]);

  // Initialize entity configurations on app mount
  useEffect(() => {
    // Initialize entity data first, then populate entity configs
    initializeEntityData();
    const init = async () => {
      // Sync configuration from backend API
      try {
        const { configStorageService } = await import('./services/configStorageService');
        await configStorageService.syncFromBackend();
        console.log('[SupplyChainApp] Configuration synced from backend');
      } catch (error) {
        console.error('[SupplyChainApp] Failed to sync configuration from backend:', error);
        // Continue with default configuration if sync fails
      }

      // Populate entity configs
      await populateEntityConfigs();
    };
    init();
  }, []);

  // Close copilot and reset conversation when switching views
  useEffect(() => {
    setCopilotOpen(false);
    // Reset conversation state to ensure isolation between views
    setGlobalConversationId(undefined);
    setGlobalMessages([]);
    console.log('✓ Reset Copilot conversation state for new view:', currentView);
  }, [currentView]);

  useEffect(() => {
    // Use global conversation ID for all pages
    getCopilotConfig(currentView, globalConversationId).then(setCopilotProps);
  }, [currentView, globalConversationId]);

  // Refresh suggestions when opening (so dynamic context from pages can be picked up)
  useEffect(() => {
    if (!copilotOpen) return;
    getCopilotConfig(currentView, globalConversationId).then(setCopilotProps);
  }, [copilotOpen, currentView, globalConversationId]);

  // Callback to save global conversation ID
  const handleConversationCreated = useCallback((conversationId: string) => {
    setGlobalConversationId(conversationId);
    console.log('✓ Saved global conversation ID:', conversationId);
  }, []);

  // Callback to save global messages
  const handleMessagesSaved = useCallback((messages: CopilotMessage[]) => {
    setGlobalMessages(messages);
  }, []);

  // Callback to start a new conversation
  const handleNewConversation = useCallback(() => {
    setGlobalConversationId(undefined);
    setGlobalMessages([]);
    console.log('✓ Started new conversation');
  }, []);

  const handleNavigate = (view: string) => {
    const viewMap: Record<string, ViewType> = {
      'cockpit': 'cockpit',
      'search': 'search',
      'planning': 'planning',
      'inventory': 'inventory',
      'optimization': 'optimization',
      'delivery': 'delivery',
      'evaluation': 'evaluation',
      'supplier': 'search',
    };
    setCurrentView(viewMap[view] || 'cockpit');
  };

  return (
    <div className="h-full bg-slate-50 flex flex-col">
      {/* Top Navigation */}
      <div ref={headerRef} id="app-header" className="z-50 bg-white border-b border-slate-200 shadow-sm flex-shrink-0">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <img
                  src={logoIcon}
                  alt="供应链大脑"
                  className="w-10 h-10 object-contain flex-shrink-0"
                  style={{ display: 'block' }}
                />
                <div>
                  <h1 className="text-xl font-bold text-slate-800">供应链大脑</h1>
                  <p className="text-xs text-slate-500">DIP for Supply Chain</p>
                </div>
              </div>
              <div className="flex gap-1 bg-slate-100 p-1 rounded-lg">
                {visibleNavigation.map((nav) => (
                  <button
                    key={nav.id}
                    onClick={() => setCurrentView(nav.id)}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${currentView === nav.id
                      ? 'bg-white text-indigo-600 shadow-sm'
                      : 'text-slate-600 hover:text-slate-800'
                      }`}
                  >
                    <nav.icon size={16} />
                    {nav.label}
                    {'badge' in nav && (
                      <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-medium rounded">
                        {String((nav as { badge?: unknown }).badge ?? '')}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentView('config')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${currentView === 'config'
                  ? 'bg-indigo-50 text-indigo-600 border border-indigo-200'
                  : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                  }`}
              >
                <Settings size={18} />
                <span>管理配置</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {currentView === 'config' ? (
          <div className="h-full">
            <ConfigBackendLayout onBack={() => setCurrentView('cockpit')} />
          </div>
        ) : currentView === 'planningV2' ? (
          <div className="flex-1 overflow-y-auto">
            <PlanningViewV2 />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-6xl mx-auto px-6 py-8">
              {currentView === 'cockpit' && <CockpitView onNavigate={handleNavigate} toggleCopilot={() => setCopilotOpen(true)} />}
              {currentView === 'search' && <SearchView toggleCopilot={() => setCopilotOpen(true)} />}
              {currentView === 'planning' && <PlanningView />}
              {currentView === 'inventory' && <InventoryView toggleCopilot={() => setCopilotOpen(true)} />}
              {currentView === 'optimization' && <ProductSupplyOptimizationPage toggleCopilot={() => setCopilotOpen(true)} />}
              {currentView === 'delivery' && <DeliveryViewEnhanced toggleCopilot={() => setCopilotOpen(true)} />}
              {currentView === 'evaluation' && <SupplierEvaluationPage toggleCopilot={() => setCopilotOpen(true)} />}
            </div>
          </div>
        )}
      </div>

      {/* Copilot Sidebar */}
      <CopilotSidebar
        isOpen={copilotOpen}
        onClose={() => setCopilotOpen(false)}
        topOffset={headerHeight}
        onConversationCreated={handleConversationCreated}
        onMessagesSaved={handleMessagesSaved}
        onNewConversation={handleNewConversation}
        savedMessages={globalMessages}
        {...copilotProps}
      />
    </div>
  );
};

// Data Mode Switcher removed - moved to Config Backend

// Main App
import type { MicroAppProps } from './micro-app';

const SupplyChainApp = (props: Partial<MicroAppProps>) => {
  useEffect(() => {
    if (props.User) {
      console.log('Integrated User Info:', props.User);
    }
    if (props.token) {
      console.log('Integrated Token:', props.token);
    }
  }, [props.User, props.token]);

  return (
    <SupplyChainAppContent />
  );
};

export default SupplyChainApp;
