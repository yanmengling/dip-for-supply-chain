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
  evaluation:   '供应商评估助手',
  cockpit:      '供应链驾驶舱助手',
  inventory:    '库存优化助手',
  optimization: '产品供应优化助手',
  delivery:     '订单交付助手',
  planning:     'PMC决策助手',
  search:       '搜索助手',
};

/**
 * Returns the agentKey (from config center) and display title for the given view.
 */
export function getAgentConfigForView(viewId: string): { agentKey: string; title: string } {
  const allAgents = apiConfigService.getEnabledConfigsByType(ApiConfigType.AGENT);
  const agentKey = (allAgents[0] as any)?.agentKey || '';
  return {
    agentKey,
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
