import React, { useState, useEffect, useRef } from 'react';
import { Bot, User, X, Send, Zap, Loader2, Square, PlusCircle } from 'lucide-react';
import type { CopilotRichContent, StreamMessage } from '../../types/ontology';
import { Streamdown } from 'streamdown';

export interface CopilotMessage {
  type: 'user' | 'bot';
  text: string;
  richContent?: CopilotRichContent;
  isStreaming?: boolean; // Whether the message is still being streamed
  conversationId?: string;
  messageId?: string;
}

export interface CopilotSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  initialMessages: CopilotMessage[];
  suggestions: string[];
  onQuery?: (query: string, currentConversationId?: string, onStream?: (message: StreamMessage) => void) => Promise<{ text: string; richContent?: CopilotRichContent } | string>;
  topOffset?: number;
  conversationId?: string;
  onCancel?: () => void;
  // New props for state sync
  onConversationCreated?: (id: string) => void;
  onMessagesSaved?: (messages: CopilotMessage[]) => void;
  savedMessages?: CopilotMessage[];
  onNewConversation?: () => void;
}

export const CopilotSidebar = ({
  isOpen,
  onClose,
  title,
  initialMessages,
  suggestions,
  onQuery,
  topOffset = 0,
  conversationId: initialConversationId,
  onCancel,
  onConversationCreated,
  onMessagesSaved,
  savedMessages,
  onNewConversation
}: CopilotSidebarProps) => {
  // Initialize with savedMessages if available (and valid), otherwise use initialMessages
  // We use a function to initialize state lazily, but here we need to be careful about prop updates
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<CopilotMessage[]>(
    (savedMessages && savedMessages.length > 0) ? savedMessages : initialMessages
  );
  const [isLoading, setIsLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | undefined>(initialConversationId);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Sync messages UP to parent whenever they change locally
  useEffect(() => {
    if (onMessagesSaved) {
      onMessagesSaved(messages);
    }
  }, [messages, onMessagesSaved]);

  // Handle View Changes (Context Switch):
  // When initialMessages changes (signaling a view change), we reset/reload state.
  // We prioritize savedMessages (if the parent has preserved them for this view) over initialMessages.
  useEffect(() => {
    if (savedMessages && savedMessages.length > 0) {
      setMessages(savedMessages);
    } else {
      setMessages(initialMessages);
    }
    // We intentionally DO NOT depend on savedMessages here to avoid infinite loops.
    // We only want to "pull" from savedMessages when the View (initialMessages) changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMessages]);

  // Sync conversation ID changes
  useEffect(() => {
    if (initialConversationId !== undefined) {
      setConversationId(initialConversationId);
    }
  }, [initialConversationId]);

  // Auto scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen]); // Also scroll when opened

  const handleNewChat = () => {
    if (onNewConversation) {
      onNewConversation();
    }
    setConversationId(undefined);
    setMessages(initialMessages); // Reset to initial greeting
    setInput('');
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userQuery = input.trim();
    const newMsgs: CopilotMessage[] = [...messages, { type: 'user', text: userQuery }];
    setMessages(newMsgs);
    setInput('');
    setIsLoading(true);

    // Add streaming bot message placeholder
    const streamingMsg: CopilotMessage = {
      type: 'bot',
      text: '',
      isStreaming: true
    };
    setMessages([...newMsgs, streamingMsg]);

    // Process query
    if (onQuery) {
      try {
        let accumulatedText = '';
        let richContent: CopilotRichContent | undefined;

        // 传入当前的 conversationId (首次为 undefined,后续会有值)
        const response = await onQuery(userQuery, conversationId, (streamMessage: StreamMessage) => {
          if (streamMessage.type === 'message' && streamMessage.data) {
            const data = streamMessage.data;

            // copilotConfig.ts now converts API response to legacy format: {message: {content: {text}}}
            const messageData = data.message;
            if (messageData && messageData.content) {
              const newText = messageData.content.text || '';

              if (newText) {
                accumulatedText = newText;

                // Update the streaming message
                setMessages(currentMsgs => {
                  const updatedMsgs = [...currentMsgs];
                  const lastMsg = updatedMsgs[updatedMsgs.length - 1];
                  if (lastMsg && lastMsg.isStreaming) {
                    lastMsg.text = accumulatedText;
                    lastMsg.conversationId = data.conversation_id;
                    lastMsg.messageId = data.assistant_message_id;
                  }
                  return updatedMsgs;
                });
              }
            }

            // Save conversation_id from server (for subsequent messages)
            if (data.conversation_id) {
              // Update local state if needed
              if (conversationId !== data.conversation_id) {
                setConversationId(data.conversation_id);
                console.log('✓ Conversation ID saved locally:', data.conversation_id);

                // Notify parent
                if (onConversationCreated) {
                  onConversationCreated(data.conversation_id);
                }
              }
            }
          } else if (streamMessage.type === 'end') {
            // Mark streaming as complete
            setMessages(currentMsgs => {
              const updatedMsgs = [...currentMsgs];
              const lastMsg = updatedMsgs[updatedMsgs.length - 1];
              if (lastMsg && lastMsg.isStreaming) {
                lastMsg.isStreaming = false;
              }
              return updatedMsgs;
            });
          } else if (streamMessage.type === 'error') {
            // Handle streaming error
            setMessages(currentMsgs => {
              const updatedMsgs = [...currentMsgs];
              const lastMsg = updatedMsgs[updatedMsgs.length - 1];
              if (lastMsg && lastMsg.isStreaming) {
                lastMsg.text = `抱歉，处理查询时出现错误：${streamMessage.error || '未知错误'}`;
                lastMsg.isStreaming = false;
              }
              return updatedMsgs;
            });
          }
        });

        // Fallback for non-streaming responses
        if (typeof response === 'string') {
          setMessages(currentMsgs => {
            const updatedMsgs = [...currentMsgs];
            const lastMsg = updatedMsgs[updatedMsgs.length - 1];
            if (lastMsg && lastMsg.isStreaming) {
              lastMsg.text = response;
              lastMsg.isStreaming = false;
            }
            return updatedMsgs;
          });
        } else if (response) {
          setMessages(currentMsgs => {
            const updatedMsgs = [...currentMsgs];
            const lastMsg = updatedMsgs[updatedMsgs.length - 1];
            if (lastMsg && lastMsg.isStreaming) {
              lastMsg.text = response.text;
              lastMsg.richContent = response.richContent;
              lastMsg.isStreaming = false;
            }
            return updatedMsgs;
          });
        }
      } catch (error) {
        console.error('Query processing error:', error);
        setMessages(currentMsgs => {
          const updatedMsgs = [...currentMsgs];
          const lastMsg = updatedMsgs[updatedMsgs.length - 1];
          if (lastMsg && lastMsg.isStreaming) {
            lastMsg.text = '抱歉，处理查询时出现错误。请稍后重试。';
            lastMsg.isStreaming = false;
          }
          return updatedMsgs;
        });
      }
    } else {
      // Default behavior
      setTimeout(() => {
        setMessages(currentMsgs => {
          const updatedMsgs = [...currentMsgs];
          const lastMsg = updatedMsgs[updatedMsgs.length - 1];
          if (lastMsg && lastMsg.isStreaming) {
            lastMsg.text = '正在分析数据... 建议已生成，请查看详情。';
            lastMsg.isStreaming = false;
          }
          return updatedMsgs;
        });
      }, 800);
    }

    setIsLoading(false);
  };

  return (
    <div
      className={`fixed right-0 w-[33rem] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80 border-l border-slate-100 shadow-xl rounded-l-2xl transform transition-transform duration-300 z-50 flex flex-col ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
      style={{ top: topOffset, height: `calc(100vh - ${topOffset}px)` }}
    >
      <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-indigo-50/80 to-purple-50/80">
        <div className="flex items-center gap-2 font-bold text-slate-800">
          <div className="w-8 h-8 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-xl flex items-center justify-center shadow-sm">
            <Bot size={18} className="text-white" />
          </div>
          {title}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleNewChat}
            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            title="开启新对话"
          >
            <PlusCircle size={18} />
          </button>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"><X size={18} /></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-slate-50/40">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex gap-2 ${msg.type === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${msg.type === 'user' ? 'bg-indigo-100 text-indigo-700' : 'bg-white border border-slate-100 text-slate-600 shadow-sm'}`}>
              {msg.type === 'user' ? <User size={12} /> : <Bot size={12} />}
            </div>
            <div
              className={`flex-1 text-[13px] leading-5 px-3 py-2 rounded-xl ${msg.type === 'user'
                ? 'bg-gradient-to-br from-indigo-600 to-purple-600 text-white'
                : 'bg-white/70 text-slate-800'
                }`}
            >
              {msg.type === 'bot' ? (
                <div className="prose prose-slate max-w-none text-[13px] break-words prose-headings:text-slate-800 prose-headings:font-semibold prose-headings:leading-5 prose-h1:text-[15px] prose-h2:text-[14px] prose-h3:text-[12px] prose-h4:text-[12px] prose-h5:text-[12px] prose-a:text-indigo-600 prose-hr:border-slate-200 prose-p:leading-5 prose-pre:overflow-x-auto prose-pre:whitespace-pre-wrap prose-code:break-words prose-table:block prose-table:overflow-x-auto [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  <Streamdown>{msg.text}</Streamdown>
                </div>
              ) : (
                <div className="whitespace-pre-wrap break-words">
                  {msg.text}
                </div>
              )}
              {msg.isStreaming && (
                <span className="inline-block w-[2px] h-4 bg-indigo-400/70 ml-1 rounded-full animate-pulse"></span>
              )}
              {/* Rich Content: BOM Recommendation */}
              {msg.richContent && msg.richContent.type === 'bom_recommendation' && (
                <div className="mt-3 bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                  <div className="px-3 py-2 bg-indigo-50 border-b border-indigo-100 text-xs font-bold text-indigo-700 flex justify-between">
                    <span>推荐 BOM 配置</span>
                    <span>{msg.richContent.totalCost}</span>
                  </div>
                  <table className="w-full text-xs text-left">
                    <thead className="text-slate-400 border-b border-slate-100">
                      <tr><th className="p-2">组件</th><th className="p-2">选型</th><th className="p-2">状态</th></tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {msg.richContent.data?.map((item, i) => (
                        <tr key={i}>
                          <td className="p-2 text-slate-600">{item.component}</td>
                          <td className="p-2 font-medium text-slate-800">{item.part}</td>
                          <td className="p-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${item.status === 'In Stock' ? 'bg-emerald-100 text-emerald-700' : item.status === 'Procure' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'}`}>
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="p-2 text-[10px] text-emerald-600 bg-emerald-50/50 border-t border-emerald-100 flex gap-1">
                    <Zap size={12} /> {msg.richContent.optimization}
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-3 bg-white">
        <div className="relative">
          <textarea
            rows={3}
            placeholder={isLoading ? '正在处理中...' : '输入问题...'}
            className="w-full pl-4 pr-12 py-2 bg-slate-50 border border-slate-100 rounded-2xl text-sm leading-5 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed resize-none"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !isLoading && !e.nativeEvent.isComposing) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={isLoading}
          />
          <button
            onClick={isLoading ? () => { onCancel?.(); setIsLoading(false); } : handleSend}
            disabled={(!isLoading && !input.trim())}
            className={`absolute right-2 bottom-1.5 p-1.5 
              ${isLoading ? 'bg-red-500 hover:bg-red-600' : 'bg-gradient-to-br from-indigo-600 to-purple-600'} 
              text-white rounded-lg hover:shadow-md transition-shadow disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none`}
            title={isLoading ? "取消生成" : "发送消息"}
          >
            {isLoading ? <Square size={14} fill="currentColor" /> : <Send size={14} />}
          </button>
        </div>
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => !isLoading && setInput(s)}
              disabled={isLoading}
              className="whitespace-nowrap px-3 py-1 bg-white text-slate-600 text-xs rounded-full hover:bg-slate-100 border border-slate-200 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
