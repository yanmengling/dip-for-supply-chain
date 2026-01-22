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
import { getCopilotConfig } from './utils/copilotConfig';
import type { CopilotSidebarProps } from './components/shared/CopilotSidebar';
import { useHeaderHeight } from './hooks/useHeaderHeight';
import { useConversation } from './hooks/useConversation';
import ConfigBackendLayout from './components/config-backend/ConfigBackendLayout';
import { populateEntityConfigs } from './utils/entityConfigService';
import { initializeEntityData } from './utils/entityConfigService';

// Navigation configuration
const navigation = [
  { id: 'cockpit' as const, label: '驾驶舱', icon: LayoutDashboard },
  { id: 'planning' as const, label: 'PMC 决策中心', icon: Calendar },
  { id: 'inventory' as const, label: '库存优化', icon: Package },
  { id: 'optimization' as const, label: '产品供应优化', icon: TrendingUp },
  { id: 'delivery' as const, label: '订单交付', icon: Truck },
  { id: 'evaluation' as const, label: '供应商评估', icon: Users },
];

type ViewType = 'cockpit' | 'search' | 'planning' | 'inventory' | 'optimization' | 'delivery' | 'evaluation' | 'config';

const SupplyChainAppContent = () => {
  const [currentView, setCurrentView] = useState<ViewType>('cockpit');
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

  // Initialize entity configurations on app mount
  useEffect(() => {
    // Initialize entity data first, then populate entity configs
    initializeEntityData();
    const init = async () => {
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
    <div className="min-h-screen bg-slate-50">
      {/* Top Navigation - Fixed */}
      <div ref={headerRef} className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-slate-200 shadow-sm">
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
                {navigation.map((nav) => (
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
      <div style={{ paddingTop: headerHeight || 80 }}>
        {currentView === 'config' ? (
          <div className="h-[calc(100vh-80px)]">
            <ConfigBackendLayout onBack={() => setCurrentView('cockpit')} />
          </div>
        ) : (
          <div className="max-w-6xl mx-auto px-6 py-8">
            {currentView === 'cockpit' && <CockpitView onNavigate={handleNavigate} toggleCopilot={() => setCopilotOpen(true)} />}
            {currentView === 'search' && <SearchView toggleCopilot={() => setCopilotOpen(true)} />}
            {currentView === 'planning' && <PlanningView />}
            {currentView === 'inventory' && <InventoryView toggleCopilot={() => setCopilotOpen(true)} />}
            {currentView === 'optimization' && <ProductSupplyOptimizationPage toggleCopilot={() => setCopilotOpen(true)} />}
            {currentView === 'delivery' && <DeliveryViewEnhanced toggleCopilot={() => setCopilotOpen(true)} />}
            {currentView === 'evaluation' && <SupplierEvaluationPage toggleCopilot={() => setCopilotOpen(true)} />}
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
