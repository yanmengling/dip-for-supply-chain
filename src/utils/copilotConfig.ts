/**
 * Copilot Sidebar Configuration
 *
 * Centralized configuration for CopilotSidebar component based on current view.
 */

import type { CopilotSidebarProps } from '../components/shared/CopilotSidebar';
import type { CopilotRichContent, StreamMessage } from '../types/ontology';
import { agentApiClient } from '../services/agentApi';
import { apiConfigService } from '../services/apiConfigService';

// Agent configuration mapping for different views
// Maps view names to agent config IDs in the configuration center
const VIEW_AGENT_MAP: Record<string, string> = {
  evaluation: 'agent_supplier_evaluation',
  cockpit: 'agent_supply_chain_cockpit',
  inventory: 'agent_inventory_optimization',
  optimization: 'agent_product_supply_optimization',
  delivery: 'agent_order_delivery',
  planning: 'agent_pmc_planning',
  search: 'agent_search'
};

// Fallback agent names for display
const FALLBACK_AGENT_NAMES: Record<string, { name: string; description: string }> = {
  evaluation: { name: '供应商评估助手', description: '专业的供应商评估和分析助手' },
  cockpit: { name: '供应链驾驶舱助手', description: '供应链整体监控和分析助手' },
  inventory: { name: '库存优化助手', description: '库存管理和优化分析助手' },
  optimization: { name: '产品供应优化助手', description: '产品供应优化和预测助手' },
  delivery: { name: '订单交付助手', description: '订单交付管理和跟踪助手' },
  planning: { name: 'PMC决策助手', description: 'PMC决策中心助手' },
  search: { name: '搜索助手', description: '智能搜索助手' }
};

/**
 * Get agent configuration from configuration center
 */
async function getAgentConfig(viewId: string): Promise<{ agent_key: string; agent_version: string; name: string; description: string } | null> {
  try {
    const agentConfigId = VIEW_AGENT_MAP[viewId];
    if (!agentConfigId) {
      console.warn(`[CopilotConfig] No agent mapping found for view: ${viewId}`);
      return null;
    }

    const agentKey = await apiConfigService.getAgentKey(agentConfigId);
    if (!agentKey) {
      console.warn(`[CopilotConfig] No agent key found for config ID: ${agentConfigId}`);
      return null;
    }

    // Get agent version from config (default to 'v1')
    const agentVersion = await apiConfigService.getAgentVersion(agentConfigId) || 'v1';

    // Get agent name and description from config
    const agentName = await apiConfigService.getAgentName(agentConfigId) || FALLBACK_AGENT_NAMES[viewId]?.name || '智能助手';
    const agentDescription = await apiConfigService.getAgentDescription(agentConfigId) || FALLBACK_AGENT_NAMES[viewId]?.description || '智能分析助手';

    return {
      agent_key: agentKey,
      agent_version: agentVersion,
      name: agentName,
      description: agentDescription
    };
  } catch (error) {
    console.error('[CopilotConfig] Failed to load agent config:', error);
    return null;
  }
}

export const getCopilotConfig = async (
  currentView: string,
  conversationId?: string
): Promise<Omit<CopilotSidebarProps, 'isOpen' | 'onClose'>> => {
  // Load agent config from configuration center
  const agentConfig = await getAgentConfig(currentView);

  // Fallback to default if config not found
  const fallback = FALLBACK_AGENT_NAMES[currentView] || FALLBACK_AGENT_NAMES.cockpit;
  const finalConfig = agentConfig || {
    agent_key: '01KEX8BP0GR6TMXQR7GE3XN16A', // Fallback agent key
    agent_version: 'v1',
    name: fallback.name,
    description: fallback.description
  };

  const handleQuery = async (
    query: string,
    currentConversationId?: string,
    onStream?: (message: StreamMessage) => void
  ): Promise<string | { text: string; richContent?: CopilotRichContent }> => {
    try {
      // Authentication token is automatically handled by agentConfig
      // You can set it via:
      // 1. Environment variable: VITE_AGENT_API_TOKEN
      // 2. Call setAuthToken() from agentConfig after user login
      // 3. Token stored in sessionStorage/localStorage

      // Build request matching OFFICIAL API schema and Agent 开发指南
      // 首次对话: 不提供 conversation_id,系统会自动创建会话
      // 继续对话: 使用返回的 conversation_id 维护多轮对话上下文
      const requestData: any = {
        agent_key: finalConfig.agent_key,
        agent_version: finalConfig.agent_version,
        query: query,
        stream: !!onStream,
        history: []  // Required field as per official example
      };

      // Add inc_stream only when streaming
      if (onStream) {
        requestData.inc_stream = true;
      }

      // Add conversation_id only if it exists (继续对话时使用)
      // 首次对话不提供 conversation_id,让服务器自动创建
      if (currentConversationId) {
        requestData.conversation_id = currentConversationId;
        console.log('→ Using existing conversation:', currentConversationId);
      } else {
        console.log('→ Starting new conversation (no conversation_id)');
      }

      if (onStream) {
        // Use streaming API with processIncrementalUpdate pattern
        // 参考 Agent开发指南.md - 流式响应使用 {seq_id, key, content, action} 格式
        let accumulatedData: any = {}; // To store conversation_id and assistant_message_id
        let finalText = '';

        await agentApiClient.chatCompletionStream(requestData, (streamMessage) => {
          if (streamMessage.type === 'message' && streamMessage.data) {
            const data: any = streamMessage.data;

            // 🔍 调试：打印完整的累积数据结构
            console.log('[CopilotConfig] 收到累积数据:', data);

            // agentApi.ts 已经使用 processIncrementalUpdate 累积数据
            // 这里接收的是累积后的完整对象，需要从中提取文本

            // 保存 conversation_id
            if (data.conversation_id) {
              accumulatedData.conversation_id = data.conversation_id;
            }
            if (data.assistant_message_id) {
              accumulatedData.assistant_message_id = data.assistant_message_id;
            }

            // 从累积数据中提取文本 - 根据实际数据结构
            // 正确的路径:
            // - content.final_answer.answer (数组或对象，包含多个步骤的答案)
            // - message.content.final_answer.answer.text (旧格式)
            let extractedText = '';
            try {
              // 方式1: content.final_answer.answer (标准格式 - 如截图所示)
              if (data.content?.final_answer?.answer) {
                const answer = data.content.final_answer.answer;
                if (Array.isArray(answer)) {
                  // 如果answer是数组，提取每项的文本
                  extractedText = answer.map((item: any) => item.text || item).filter(Boolean).join('\n');
                } else if (typeof answer === 'object') {
                  extractedText = answer.text || JSON.stringify(answer);
                } else if (typeof answer === 'string') {
                  extractedText = answer;
                }
                console.log('[CopilotConfig] ✓ 路径: content.final_answer.answer');
              }
              // 方式2: message.content.final_answer.answer.text (旧格式)
              else if (data.message?.content?.final_answer?.answer?.text) {
                extractedText = data.message.content.final_answer.answer.text;
                console.log('[CopilotConfig] ✓ 路径: message.content.final_answer.answer.text');
              }
              // 方式3: message.text
              else if (data.message?.text) {
                extractedText = data.message.text;
                console.log('[CopilotConfig] ✓ 路径: message.text');
              }
              // 方式4: 从 progress 数组中提取所有答案
              else if (data.content?.progress && Array.isArray(data.content.progress)) {
                const progressTexts = data.content.progress
                  .filter((p: any) => p.answer)
                  .map((p: any) => {
                    if (typeof p.answer === 'string') return p.answer;
                    if (p.answer.text) return p.answer.text;
                    return null;
                  })
                  .filter(Boolean);
                if (progressTexts.length > 0) {
                  extractedText = progressTexts[progressTexts.length - 1]; // 取最后一个
                  console.log('[CopilotConfig] ✓ 路径: content.progress[last].answer');
                }
              }
            } catch (e) {
              console.error('[CopilotConfig] 提取文本失败:', e);
            }

            if (extractedText && extractedText !== finalText) {
              finalText = extractedText;
              console.log('[CopilotConfig] ✓ 提取文本成功，长度:', finalText.length, '内容:', finalText.substring(0, 80));
            }

            // Create StreamMessage with extracted text for CopilotSidebar
            const currentConvId = data.conversation_id || accumulatedData.conversation_id || '';
            const currentMsgId = data.assistant_message_id || accumulatedData.assistant_message_id || '';

            const processedMessage: StreamMessage = {
              type: 'message',
              data: {
                conversation_id: currentConvId,
                user_message_id: '', // Not available in this context
                assistant_message_id: currentMsgId,
                status: 'streaming',
                message: {
                  id: currentMsgId,
                  conversation_id: currentConvId,
                  role: 'assistant',
                  content: { text: finalText },
                  content_type: 'text',
                  status: 'streaming',
                  reply_id: '',
                  index: 0
                }
              }
            };
            onStream(processedMessage);
          } else if (streamMessage.type === 'end') {
            console.log('[CopilotConfig] ✓ 流式传输结束，最终文本长度:', finalText.length);
            console.log('[CopilotConfig] ✓ 最终文本内容:', finalText.substring(0, 200));
            onStream(streamMessage);
          } else {
            onStream(streamMessage);
          }
        });
        return { text: finalText };
      } else {
        // Use non-streaming API
        const response = await agentApiClient.chatCompletion(requestData);
        const content = response.message.content;
        const finalAnswer = content.final_answer;

        if (finalAnswer) {
          return {
            text: finalAnswer.answer.text,
            richContent: parseRichContent(finalAnswer, currentView)
          };
        }

        return content.text || '收到您的查询，我正在处理中...';
      }

      return '收到您的查询，我正在处理中...';
    } catch (error) {
      console.error('Agent API error:', error);

      // Fallback to mock responses for development
      return getFallbackResponse(query, currentView);
    }
  };

  // Get suggestions based on current view
  const getSuggestions = (view: string): string[] => {
    const safeGetSession = (key: string): string => {
      try {
        if (typeof window === 'undefined') return '';
        return window.sessionStorage.getItem(key) || '';
      } catch {
        return '';
      }
    };

    switch (view) {
      case 'evaluation':
        return [
          '北斗科技电子元件有限公司最近供应情况如何？',
          '市面上与农业装备零部件供应商公司相似的SSD供应商有哪些？',
          '帮我分析一下供应商的风险等级'
        ];
      case 'inventory':
        return [
          '当前库存水平如何？',
          '哪些物料需要补货？',
          '库存优化建议'
        ];
      case 'cockpit':
        return [
          '供应链整体情况如何？',
          '生产计划情况如何？',
          '物料库存情况怎么样？'
        ];
      case 'optimization':
        {
          const selectedProductId = safeGetSession('copilot.optimization.selectedProductId');
          const productLabel = selectedProductId ? `产品编码 ${selectedProductId}` : '当前选择的产品';
          return [
            `${productLabel} 的生产、物料供应情况如何？`,
            `${productLabel} 的物料供应商情况如何？`
          ];
        }
      case 'delivery':
        {
          const delayedOrderNumber = safeGetSession('copilot.delivery.firstDelayedOrderNumber');
          const orderLabel = delayedOrderNumber ? `订单号 ${delayedOrderNumber}` : '当前交付延期订单';
          return [
            `${orderLabel} 的交付进度情况如何？`,
            '当前的销售订单总体交付情况。'
          ];
        }
      default:
        return ['请问您需要什么帮助？'];
    }
  };

  return {
    title: finalConfig.name,
    initialMessages: [
      {
        type: 'bot',
        text: `您好！我是${finalConfig.description}。请告诉我您需要什么帮助，我会尽力为您提供专业的分析和建议。`
      }
    ],
    suggestions: getSuggestions(currentView),
    onQuery: handleQuery,
    conversationId,
    onCancel: () => agentApiClient.abortRequest()
  };
};

/**
 * Parse rich content from agent response
 */
function parseRichContent(finalAnswer: any, currentView: string): CopilotRichContent | undefined {
  try {
    // For supplier evaluation, try to extract structured data
    if (currentView === 'evaluation' && finalAnswer.skill_process) {
      const skillProcess = finalAnswer.skill_process[0];
      if (skillProcess && skillProcess.text) {
        // Try to parse structured supplier data from the response
        const text = skillProcess.text;

        // Look for patterns that indicate supplier evaluation data
        if (text.includes('供应商') && (text.includes('评级') || text.includes('评分') || text.includes('风险'))) {
          // This is a simplified parsing - in real implementation, you'd have more sophisticated parsing
          return {
            type: 'supplier_analysis',
            title: '供应商分析结果',
            data: [] // Would be populated with parsed data
          };
        }
      }
    }

    // For inventory optimization, check for BOM recommendations
    if (currentView === 'inventory' && finalAnswer.answer?.text?.includes('BOM')) {
      // Parse BOM recommendation data
      // This is a placeholder - actual parsing would depend on the specific response format
      return {
        type: 'bom_recommendation',
        title: 'BOM 优化建议',
        totalCost: '¥125,000',
        data: [
          { component: '主板', part: 'MB-001-A', cost: '¥45,000', status: 'In Stock' },
          { component: 'CPU', part: 'CPU-002-B', cost: '¥50,000', status: 'Procure' },
          { component: '内存', part: 'RAM-003-C', cost: '¥30,000', status: 'In Stock' }
        ],
        optimization: '预计可节省成本15%'
      };
    }

    return undefined;
  } catch (error) {
    console.error('Error parsing rich content:', error);
    return undefined;
  }
}

/**
 * Fallback response when API is not available
 */
function getFallbackResponse(query: string, currentView: string): string {
  // Simple keyword-based responses for development fallback
  if (query.includes('供应商') && query.includes('情况')) {
    return '供应商评估功能正在开发中。目前我可以帮您分析供应商的基本信息，如交货准时率、质量评级和风险等级等。';
  }

  if (query.includes('库存')) {
    return '库存优化功能正在开发中。我可以帮您分析库存水平、补货需求和库存周转率等指标。';
  }

  if (query.includes('订单') || query.includes('交付')) {
    return '订单交付功能正在开发中。我可以帮您跟踪订单进度、分析延误原因并提供优化建议。';
  }

  // Default response
  return `我是${currentView === 'evaluation' ? '供应商评估' : currentView === 'inventory' ? '库存优化' : currentView === 'cockpit' ? '供应链驾驶舱' : '供应链'}助手。Agent API 目前不可用，但我可以为您提供基本的指导和建议。请稍后重试或联系技术支持。`;
}
