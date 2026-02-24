/**
 * 计划协同AI助手 - Planning Collaboration Assistant
 *
 * 参考供应链驾驶舱Copilot样式的右侧滑出式助手面板
 */

import { useState, useRef, useEffect } from 'react';
import { Bot, User, X, Send, Sparkles, AlertCircle, Package, TrendingUp, PlusCircle } from 'lucide-react';
import type { MaterialTask, RiskAlert } from '../../types/planningV2';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  suggestions?: string[];
}

interface PlanningAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  currentPlan?: string;
  selectedMaterial?: MaterialTask;
  allTasks?: MaterialTask[];
  riskAlerts?: RiskAlert[];
  topOffset?: number;
}

const PlanningAssistant = ({
  isOpen,
  onClose,
  currentPlan,
  selectedMaterial,
  allTasks = [],
  riskAlerts = [],
  topOffset = 0
}: PlanningAssistantProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // 自动滚动到底部
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  // 初始欢迎消息
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      const welcomeMessage: Message = {
        id: 'welcome',
        role: 'assistant',
        content: `👋 您好！我是计划协同AI助手。

我可以帮助您：
• 📊 分析物料交付风险
• 💡 提供采购协同建议
• 📈 解读甘特图信息
• ❓ 回答计划相关问题

${currentPlan ? `**当前计划**: ${currentPlan}` : '请先选择一个生产计划。'}

有什么我可以帮助您的吗？`,
        timestamp: new Date(),
        suggestions: [
          '分析当前计划的风险',
          '哪些物料需要紧急处理？',
          '查看延期物料影响',
        ]
      };
      setMessages([welcomeMessage]);
    }
  }, [isOpen]);

  // 当选中物料时，自动发送物料信息
  useEffect(() => {
    if (selectedMaterial && isOpen) {
      handleMaterialQuery(selectedMaterial);
    }
  }, [selectedMaterial]);

  const handleMaterialQuery = (material: MaterialTask) => {
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: `查询物料: ${material.materialCode} ${material.materialName}`,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    // 模拟AI响应
    setTimeout(() => {
      const response = generateMaterialAnalysis(material);
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response,
        timestamp: new Date(),
        suggestions: generateMaterialSuggestions(material)
      };
      setMessages(prev => [...prev, assistantMessage]);
      setIsLoading(false);
    }, 1000);
  };

  const generateMaterialAnalysis = (material: MaterialTask): string => {
    let analysis = `## 📦 物料分析报告\n\n`;
    analysis += `**物料编码**: ${material.materialCode}\n`;
    analysis += `**物料名称**: ${material.materialName}\n`;
    analysis += `**物料类型**: ${getMaterialTypeLabel(material.materialType)}\n`;
    analysis += `**需求数量**: ${material.requiredQuantity.toLocaleString()} ${material.unit}\n`;
    analysis += `**当前库存**: ${material.availableInventory.toLocaleString()} ${material.unit}\n\n`;

    // 状态分析
    if (material.status === 'ready') {
      analysis += `### ✅ 状态良好\n\n物料已就绪，库存充足。\n\n`;
    } else if (material.status === 'no_po') {
      analysis += `### ⚠️ 风险提示\n\n该物料尚未下达采购订单(PO)。\n\n`;
      analysis += `**建议操作**:\n`;
      if (material.buyer) {
        analysis += `1. 立即通知采购员 **${material.buyer}** 下达PO\n`;
      }
      if (material.deliveryCycle) {
        analysis += `2. 交付周期${material.deliveryCycle}天，请尽快安排\n`;
      }
      analysis += `3. 确认供应商 **${material.supplierName || '(待定)'}** 的供货能力\n\n`;
    } else if (material.status === 'abnormal') {
      analysis += `### 🔴 严重风险\n\n物料交期异常！\n\n`;
      if (material.tooltipData.delayDays) {
        analysis += `**延迟情况**: 逾期 **${material.tooltipData.delayDays} 天**\n\n`;
      }
      if (material.tooltipData.impact) {
        analysis += `**影响**: ${material.tooltipData.impact}\n\n`;
      }
      analysis += `**协同建议**:\n`;
      analysis += `1. 🚨 紧急联系供应商加急发货\n`;
      analysis += `2. 🔄 评估是否需要备选供应商\n`;
      analysis += `3. 📅 与生产部门沟通调整计划\n`;
      analysis += `4. 📢 通知客户潜在延期风险\n\n`;
    }

    // 子物料影响分析
    if (material.childMaterials && material.childMaterials.length > 0) {
      analysis += `### 🔗 子物料齐套情况\n\n`;
      material.childMaterials.forEach(childCode => {
        const child = allTasks.find(t => t.materialCode === childCode);
        if (child) {
          analysis += `- ${getStatusEmoji(child.status)} **${child.materialCode}**: ${child.materialName}\n`;
        }
      });
      analysis += '\n';
    }

    // 时间信息
    analysis += `### 📅 时间信息\n\n`;
    analysis += `- **开始时间**: ${formatDate(material.startDate)}\n`;
    analysis += `- **结束时间**: ${formatDate(material.endDate)}\n`;
    if (material.supplierCommitDate) {
      analysis += `- **供应商承诺**: ${formatDate(material.supplierCommitDate)}\n`;
    }

    return analysis;
  };

  const generateMaterialSuggestions = (material: MaterialTask): string[] => {
    const suggestions: string[] = [];

    if (material.status === 'no_po') {
      suggestions.push('如何加快采购流程？');
      suggestions.push('有备选供应商吗？');
    } else if (material.status === 'abnormal') {
      suggestions.push('如何缓解延期影响？');
      suggestions.push('生产计划如何调整？');
    }

    if (material.parentCode) {
      suggestions.push('查看上级组件状态');
    }

    return suggestions;
  };

  const handleSend = () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: inputValue,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    // 模拟AI响应
    setTimeout(() => {
      const response = generateResponse(inputValue);
      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: 'assistant',
        content: response,
        timestamp: new Date()
      };
      setMessages(prev => [...prev, assistantMessage]);
      setIsLoading(false);
    }, 1200);
  };

  const generateResponse = (query: string): string => {
    const lowerQuery = query.toLowerCase();

    // 风险分析
    if (lowerQuery.includes('风险') || lowerQuery.includes('问题')) {
      const severeRisks = riskAlerts.filter(r => r.level === 'severe');
      const abnormalRisks = riskAlerts.filter(r => r.level === 'abnormal');

      return `## 📊 风险分析报告

### 当前风险概览

- 🔴 **严重风险**: ${severeRisks.length} 项
- 🟠 **异常告警**: ${abnormalRisks.length} 项
- 🟡 **提前告示**: ${riskAlerts.length - severeRisks.length - abnormalRisks.length} 项

${severeRisks.length > 0 ? `### 严重风险物料\n\n${severeRisks.slice(0, 3).map(r =>
  `**${r.itemCode}** ${r.itemName}\n\n${r.description}`
).join('\n\n---\n\n')}` : ''}

### 💡 建议

优先处理严重风险物料，确保供应链稳定。`;
    }

    // 延期查询
    if (lowerQuery.includes('延期') || lowerQuery.includes('逾期')) {
      const delayedTasks = allTasks.filter(t => t.status === 'abnormal');
      return `## ⏰ 延期物料分析

共发现 **${delayedTasks.length}** 个延期物料:

${delayedTasks.slice(0, 5).map(t =>
  `### ${t.materialCode} ${t.materialName}\n\n延迟: **${t.tooltipData.delayDays || 'N/A'} 天**`
).join('\n\n---\n\n')}

### 💡 建议

采取应急措施，协调供应商加急供货。`;
    }

    // 采购查询
    if (lowerQuery.includes('采购') || lowerQuery.includes('po')) {
      const noPOTasks = allTasks.filter(t => t.status === 'no_po');
      return `## 📋 采购订单状态

### 未下PO物料: ${noPOTasks.length} 项

${noPOTasks.slice(0, 5).map(t =>
  `**${t.materialCode}** ${t.materialName}\n- 采购员: ${t.buyer || '未指定'}\n- 供应商: ${t.supplierName || '待定'}`
).join('\n\n')}

### 💡 建议

尽快下达采购订单，避免影响生产计划。`;
    }

    // 默认响应
    return `我理解您的问题："**${query}**"

我可以帮您：
- 🔍 查询特定物料的详细信息
- 📊 分析风险物料和延期影响
- 💡 提供采购协同建议
- 📈 解读甘特图数据

请告诉我您具体想了解什么？`;
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInputValue(suggestion);
  };

  const handleNewChat = () => {
    setMessages([]);
    setInputValue('');
  };

  const getMaterialTypeLabel = (type: string): string => {
    const labels: Record<string, string> = {
      product: '产品(成品)',
      purchased: '物料(外购)',
      outsourced: '组件(委外)',
      manufactured: '组件(自制)'
    };
    return labels[type] || type;
  };

  const getStatusEmoji = (status: string): string => {
    const emojis: Record<string, string> = {
      ready: '✅',
      no_po: '🔴',
      po_placed: '🟢',
      normal: '🟢',
      abnormal: '🟠'
    };
    return emojis[status] || '⚪';
  };

  const formatDate = (date: Date): string => {
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed right-0 w-[33rem] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-l border-slate-100 shadow-xl rounded-l-2xl z-50 flex flex-col"
      style={{ top: topOffset, height: `calc(100vh - ${topOffset}px)` }}
    >
      {/* Header */}
      <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-indigo-50/80 to-purple-50/80">
        <div className="flex items-center gap-2 font-bold text-slate-800">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center shadow-sm">
            <Sparkles size={18} className="text-white" />
          </div>
          计划协同助手
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleNewChat}
            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="开启新对话"
          >
            <PlusCircle size={18} />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Quick Stats */}
      {currentPlan && (
        <div className="px-4 py-2.5 bg-slate-50/40 border-b border-slate-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <Package className="w-3.5 h-3.5 text-slate-600" />
              <span className="text-slate-700">{allTasks.length} 物料</span>
            </div>
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 text-orange-600" />
              <span className="text-slate-700">{riskAlerts.length} 风险</span>
            </div>
            <div className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-indigo-600" />
              <span className="text-slate-700">{currentPlan}</span>
            </div>
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-slate-50/40">
        {messages.map(message => (
          <div key={message.id} className={`flex gap-2 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
              message.role === 'user'
                ? 'bg-indigo-100 text-indigo-700'
                : 'bg-white border border-slate-100 text-slate-600 shadow-sm'
            }`}>
              {message.role === 'user' ? <User size={12} /> : <Bot size={12} />}
            </div>
            <div className={`flex-1 text-[13px] leading-5 px-3 py-2 rounded-xl ${
              message.role === 'user'
                ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white'
                : 'bg-white/70 text-slate-800'
            }`}>
              <div className="whitespace-pre-wrap break-words prose prose-slate max-w-none text-[13px] prose-headings:text-slate-800 prose-headings:font-semibold prose-headings:leading-5 prose-h1:text-[15px] prose-h2:text-[14px] prose-h3:text-[13px] prose-h4:text-[12px] prose-a:text-indigo-600 prose-strong:text-slate-900 prose-strong:font-semibold [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 prose-ul:my-2 prose-li:my-0.5">
                {message.content}
              </div>
              {message.suggestions && message.suggestions.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {message.suggestions.map((suggestion, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSuggestionClick(suggestion)}
                      className="block w-full text-left text-xs px-2.5 py-1.5 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 rounded-lg transition-colors text-slate-700"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex gap-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-white border border-slate-100 text-slate-600 shadow-sm">
              <Bot size={12} />
            </div>
            <div className="flex-1 text-[13px] leading-5 px-3 py-2 rounded-xl bg-white/70 text-slate-800">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-slate-100 bg-white">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="输入您的问题..."
            className="flex-1 px-3 py-2 text-[13px] border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            className="w-9 h-9 bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-lg hover:shadow-md transition-all flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default PlanningAssistant;
