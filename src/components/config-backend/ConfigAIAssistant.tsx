/**
 * Config AI Assistant
 * 
 * AI assistant sidebar for generating business rules with improved chat UI.
 */

import { useState } from 'react';
import { X, Send, User, Bot, Sparkles } from 'lucide-react';
import { generateBusinessRule } from '../../utils/entityConfigService';
import type { BusinessLogicRule, EntityType } from '../../types/ontology';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  objectName: string;
  onApplyLogic: (logic: BusinessLogicRule) => void;
}

interface Message {
  type: 'user' | 'bot';
  text: string;
  logic?: BusinessLogicRule;
  suggestions?: string[];
}

const ConfigAIAssistant = ({ isOpen, onClose, objectName, onApplyLogic }: Props) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      type: 'bot',
      text: `你好！我是 ${objectName} 的智能助手。\n\n我可以帮你：\n• 添加业务规则\n• 配置计算逻辑\n• 设置触发条件`,
      suggestions: ['验证规则', '计算公式', '预警条件']
    }
  ]);
  const [input, setInput] = useState('');
  
  const handleSend = () => {
    if (!input.trim()) return;
    
    const userMessage: Message = { type: 'user', text: input };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setInput('');
    
    // Simulate AI response
    setTimeout(() => {
      const rule = generateBusinessRule(input, 'product' as EntityType);
      let botResponse: Message = { type: 'bot', text: '', logic: undefined };
      
      if (rule) {
        botResponse.text = `✅ 已生成${rule.ruleType === 'validation' ? '验证规则' : rule.ruleType === 'calculation' ? '计算逻辑' : '触发规则'}\n\n规则：${rule.name}\n${rule.condition ? `条件：${rule.condition}` : ''}\n${rule.formula ? `公式：${rule.formula}` : ''}\n${rule.action ? `动作：${rule.action}` : ''}`;
        botResponse.logic = rule;
      } else {
        botResponse.text = '请提供更多细节，例如：\n• "库存低于100时预警"\n• "计算ROI"\n• "生命周期衰退期预警"';
        botResponse.suggestions = ['库存预警', 'ROI计算', '生命周期预警'];
      }
      
      setMessages([...newMessages, botResponse]);
    }, 500);
  };
  
  if (!isOpen) return null;
  
  // AI Assistant header should align with the main content area (below sidebar header)
  // Sidebar header height is approximately 64px (p-4 with border-b)
  return (
    <div className="fixed top-[64px] right-0 bottom-0 w-96 bg-white border-l border-slate-200 shadow-lg z-50 flex flex-col">
      <div className="p-3 border-b bg-gradient-to-r from-purple-50 to-indigo-50">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-600 to-indigo-600 rounded-lg flex items-center justify-center">
              <Bot size={16} className="text-white"/>
            </div>
            <div>
              <h3 className="font-bold text-sm text-slate-800">AI 助手</h3>
              <p className="text-xs text-slate-500">{objectName}</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 hover:bg-white/70 rounded transition-colors"
          >
            <X size={16}/>
          </button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-2 ${msg.type === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 ${
              msg.type === 'user' ? 'bg-indigo-500 text-white' : 'bg-purple-100 text-purple-600'
            }`}>
              {msg.type === 'user' ? <User size={12}/> : <Bot size={12}/>}
            </div>
            <div className="max-w-[75%] flex flex-col gap-1.5">
              <div className={`p-2 rounded-lg text-xs whitespace-pre-line ${
                msg.type === 'user'
                  ? 'bg-indigo-600 text-white rounded-tr-sm'
                  : 'bg-white border text-slate-700 rounded-tl-sm'
              }`}>
                {msg.text}
              </div>
              {msg.logic && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2">
                  <div className="flex items-center gap-1 mb-1.5">
                    <Sparkles size={12} className="text-emerald-600"/>
                    <span className="text-xs font-bold text-emerald-800">生成的配置</span>
                  </div>
                  <button
                    onClick={() => { onApplyLogic(msg.logic!); onClose(); }}
                    className="w-full py-1.5 bg-emerald-600 text-white rounded text-xs font-bold hover:bg-emerald-700 transition-colors"
                  >
                    应用配置
                  </button>
                </div>
              )}
              {msg.suggestions && (
                <div className="flex flex-wrap gap-1">
                  {msg.suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => setInput(s)}
                      className="px-2 py-1 bg-white border rounded text-xs hover:bg-indigo-50 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
      
      <div className="p-3 border-t">
        <div className="relative">
          <input
            type="text"
            placeholder="描述需求..."
            className="w-full pl-2 pr-9 py-2 bg-slate-50 border rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-500"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          />
          <button
            onClick={handleSend}
            className="absolute right-1 top-1/2 -translate-y-1/2 p-1.5 bg-gradient-to-br from-purple-600 to-indigo-600 text-white rounded transition-colors"
          >
            <Send size={12}/>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfigAIAssistant;
