/**
 * Conversation Management Hook
 *
 * Manages conversation sessions with the Agent API
 */

import { useState, useEffect, useCallback } from 'react';
import type { Conversation, AgentMessage } from '../types/ontology';
import { agentApiClient } from '../services/agentApi';

export interface UseConversationOptions {
  agentId: string;
  autoLoad?: boolean;
  pageSize?: number;
}

export interface UseConversationReturn {
  conversations: Conversation[];
  currentConversation: Conversation | null;
  messages: AgentMessage[];
  isLoading: boolean;
  error: string | null;

  // Actions
  loadConversations: () => Promise<void>;
  createConversation: (title?: string) => Promise<Conversation | null>;
  setCurrentConversation: (conversationId: string | null) => void;
  addMessage: (message: AgentMessage) => void;
  clearError: () => void;
}

export const useConversation = (options: UseConversationOptions): UseConversationReturn => {
  const { agentId, autoLoad = false, pageSize = 20 } = options;

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversationState] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load conversations list
  const loadConversations = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const result = await agentApiClient.getConversations(1, pageSize);
      setConversations(result.conversations);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载会话列表失败';
      setError(errorMessage);
      console.error('Failed to load conversations:', err);
    } finally {
      setIsLoading(false);
    }
  }, [pageSize]);

  // Create new conversation
  const createConversation = useCallback(async (title?: string): Promise<Conversation | null> => {
    try {
      setIsLoading(true);
      setError(null);

      // Note: The API doesn't have a direct create conversation endpoint
      // We'll create one when the first message is sent
      const newConversation: Conversation = {
        id: `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: title || '新对话',
        agent_app_key: 'chain-neural',
        message_index: 0,
        create_time: Date.now(),
        update_time: Date.now(),
        create_by: 'user',
        update_by: 'user',
        ext: JSON.stringify({ agent_id: agentId })
      };

      setConversations(prev => [newConversation, ...prev]);
      setCurrentConversationState(newConversation);
      setMessages([]);

      return newConversation;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '创建会话失败';
      setError(errorMessage);
      console.error('Failed to create conversation:', err);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [agentId]);

  // Set current conversation
  const setCurrentConversation = useCallback(async (conversationId: string | null) => {
    if (!conversationId) {
      setCurrentConversationState(null);
      setMessages([]);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const conversation = await agentApiClient.getConversation(conversationId);
      setCurrentConversationState(conversation);

      // Convert API messages to AgentMessage format
      const convertedMessages: AgentMessage[] = (conversation.messages || []).map(msg => ({
        id: msg.id,
        conversation_id: msg.conversation_id,
        role: msg.role,
        content: typeof msg.content === 'string' ? JSON.parse(msg.content) : msg.content,
        content_type: msg.content_type,
        status: msg.status,
        reply_id: msg.reply_id,
        index: msg.index
      }));

      setMessages(convertedMessages);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载会话详情失败';
      setError(errorMessage);
      console.error('Failed to load conversation:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Add message to current conversation
  const addMessage = useCallback((message: AgentMessage) => {
    setMessages(prev => [...prev, message]);

    // Update conversation message count
    if (currentConversation) {
      setCurrentConversationState(prev => prev ? {
        ...prev,
        message_index: prev.message_index + 1,
        update_time: Date.now()
      } : null);
    }
  }, [currentConversation]);

  // Clear error
  const clearError = useCallback(() => {
    setError(null);
  }, []);

  // Auto load conversations on mount
  useEffect(() => {
    if (autoLoad) {
      loadConversations();
    }
  }, [autoLoad, loadConversations]);

  return {
    conversations,
    currentConversation,
    messages,
    isLoading,
    error,
    loadConversations,
    createConversation,
    setCurrentConversation,
    addMessage,
    clearError
  };
};