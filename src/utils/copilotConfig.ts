/**
 * Copilot Configuration helpers for @kweaver-ai/chatkit SDK integration.
 *
 * Provides view-to-agent mapping and optional business context injection.
 * All API/streaming logic is now handled by the SDK's Copilot component.
 */

import { ApiConfigType } from '../types/apiConfig';
import { apiConfigService } from '../services/apiConfigService';
import type { ApplicationContext } from '@kweaver-ai/chatkit';

const FALLBACK_AGENT_NAMES: Record<string, string> = {
  evaluation: '供应商评估助手',
  cockpit: '供应链驾驶舱助手',
  inventory: '库存优化助手',
  optimization: '产品供应优化助手',
  delivery: '订单交付助手',
  search: '搜索助手',
};

/**
 * Returns the agentKey (from config center) and display title for the given view.
 * Picks the most recently updated enabled agent, so user edits in the config center
 * always take effect without needing to know the exact agent ID.
 */
export function getAgentConfigForView(viewId: string): { agentKey: string; agentId: string; title: string } {
  const enabledAgents = apiConfigService.getEnabledConfigsByType(ApiConfigType.AGENT) as import('../types/apiConfig').AgentConfig[];
  // Sort by updatedAt descending — the agent most recently saved in the config center wins
  const sorted = [...enabledAgents].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  const agentKey = sorted[0]?.agentKey || '';
  return {
    agentKey,
    // Decision Agent API requires agent_id in the request body; its value equals agentKey
    agentId: agentKey,
    title: FALLBACK_AGENT_NAMES[viewId] ?? '供应链智能助手',
  };
}

/**
 * Returns a business context object to inject into the copilot when it opens,
 * based on session storage values set by each view. Returns null if no context.
 */
export function getContextForView(viewId: string): ApplicationContext | null {
  const safe = (k: string): string => {
    try { return window.sessionStorage.getItem(k) || ''; } catch { return ''; }
  };

  switch (viewId) {
    case 'optimization': {
      const id = safe('copilot.optimization.selectedProductId');
      return id ? { title: `当前产品 ${id}`, data: { productId: id } } : null;
    }
    case 'delivery': {
      const no = safe('copilot.delivery.firstDelayedOrderNumber');
      return no ? { title: `延期订单 ${no}`, data: { orderNumber: no } } : null;
    }
    default:
      return null;
  }
}
