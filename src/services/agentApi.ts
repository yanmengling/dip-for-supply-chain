/**
 * Agent API Client
 *
 * Handles communication with the Agent backend API for chat completion,
 * conversation management, and streaming responses.
 */

import type { StreamMessage, Conversation } from '../types/ontology';
import { getServiceConfig, getAuthToken } from '../config/apiConfig';
import { dipEnvironmentService } from './dipEnvironmentService';

// Configuration constants
const RETRY_DELAY = 1000; // 1 second base delay for exponential backoff

/**
 * Chat Completion Request interface based on OFFICIAL API documentation
 * API Endpoint: POST https://dip.aishu.cn:443/api/agent-app/v1/app/{app_key}/api/chat/completion
 * IMPORTANT: Official API uses agent_key in request body (app_key is in URL path)
 * Official example: { agent_key: "01KBCGGGD7RT20RW7J7ABRA7YW", agent_version: "v2", query, stream }
 */
export interface ChatCompletionRequest {
  // Agent identification (Official API uses agent_key in request body)
  agent_key?: string;         // Agent key (from official schema)
  agent_id?: string;          // Alternative field name
  agent_version?: string;     // Agent version, optional (defaults to latest published version)

  // Streaming configuration
  stream?: boolean;       // Required by API - whether to use streaming
  inc_stream?: boolean;   // Incremental streaming (only valid when stream=true)

  // Conversation context
  conversation_id?: string;
  temporary_area_id?: string;
  temp_files?: Array<{
    id: string;
    type: string;
    name: string;
  }>;

  // User query
  query: string;          // Required - user's question

  // Custom variables
  custom_querys?: Record<string, any>;

  // Tool calling
  tool?: {
    session_id: string;
    tool_name: string;
    tool_args: Array<{
      key: string;
      value: string;
      type: string;
    }>;
  };

  // Message handling
  interrupted_assistant_message_id?: string;
  regenerate_user_message_id?: string;
  regenerate_assistant_message_id?: string;

  // Chat configuration
  chat_mode?: 'normal' | 'deep_thinking';
  confirm_plan?: boolean;  // Default: true

  // History (can be provided or auto-loaded from conversation_id)
  // Official schema shows history as an array (not detailed in provided schema)
  history?: any[];

  // Chat options
  chat_option?: {
    is_need_history?: boolean;
    is_need_doc_retrival_post_process?: boolean;
    is_need_progress?: boolean;
    enable_dependency_cache?: boolean;
  };

  // Extended configurations (not in base API docs, but may be supported)
  llm_config?: {
    id: string;
    name: string;
    model_type: string;
    temperature?: number;
    top_p?: number;
    top_k?: number;
    frequency_penalty?: number;
    presence_penalty?: number;
    max_tokens?: number;
  };
  data_source?: {
    kg?: Array<{
      kg_id: string;
      fields: string[];
      field_properties?: Record<string, any>;
      output_fields?: string[];
    }>;
    doc?: Array<{
      ds_id: string;
      fields: Array<{
        name: string;
        path: string;
        source: string;
      }>;
      datasets?: string[];
    }>;
    advanced_config?: {
      kg?: {
        text_match_entity_nums?: number;
        vector_match_entity_nums?: number;
        graph_rag_topk?: number;
        long_text_length?: number;
        reranker_sim_threshold?: number;
        retrieval_max_length?: number;
      };
      doc?: {
        retrieval_slices_num?: number;
        max_slice_per_cite?: number;
        rerank_topk?: number;
        slice_head_num?: number;
        slice_tail_num?: number;
        documents_num?: number;
        document_threshold?: number;
        retrieval_max_length?: number;
      };
    };
  };
}

export interface ChatCompletionResponse {
  conversation_id: string;
  user_message_id: string;
  assistant_message_id: string;
  message: {
    id: string;
    conversation_id: string;
    role: 'assistant';
    content: {
      text: string;
      temp_files?: Array<{
        id: string;
        name: string;
        type: string;
      }>;
      final_answer?: {
        query: string;
        answer: {
          text: string;
          cites?: Record<string, any>;
          ask?: Record<string, any>;
        };
        temp_files?: any[];
        thinking?: string;
        skill_process?: Array<{
          agent_name: string;
          text: string;
          cites?: Record<string, any>;
          status: string;
          type: string;
          thinking?: string;
          input_message?: Record<string, any>;
          interrupted?: boolean;
          related_queries?: Array<{
            query: string;
          }>;
        }>;
      };
      middle_answer?: Array<{
        doc_retrieval?: string;
        graph_retrieval?: string;
        middle_output_vars?: any[];
      }>;
    };
    content_type: string;
    status: string;
    reply_id: string;
    agent_info: {
      agent_id: string;
      agent_name: string;
      agent_status: string;
      agent_version: string;
    };
    index: number;
  };
  status: string;
}

export interface ConversationDetail extends Conversation {
  messages: Array<{
    id: string;
    conversation_id: string;
    agent_app_key: string;
    agent_id: string;
    agent_version: string;
    reply_id: string;
    index: number;
    role: 'user' | 'assistant';
    content: string;
    content_type: string;
    status: string;
    ext: string;
    create_time: number;
    update_time: number;
    create_by: string;
    update_by: string;
  }>;
}

class AgentApiClient {
  private abortController: AbortController | null = null;

  /**
   * Get base URL from config - fetches fresh value each time
   */
  private get baseUrl(): string {
    return getServiceConfig('agent').baseUrl;
  }

  /**
   * Get app key from config - uses DIP-specific key in DIP mode
   */
  private get appKey(): string {
    const dipKey = dipEnvironmentService.getAgentAppKey();
    return dipKey || getServiceConfig('agent').appKey;
  }

  /**
   * Get timeout from config - fetches fresh value each time
   */
  private get timeout(): number {
    return getServiceConfig('agent').timeout || 120000;
  }

  /**
   * Get stream timeout from config - fetches fresh value each time
   */
  private get streamTimeout(): number {
    return getServiceConfig('agent').streamTimeout || 300000;
  }

  /**
   * Get max retries from config - fetches fresh value each time
   */
  private get maxRetries(): number {
    return getServiceConfig('agent').maxRetries || 3;
  }

  /**
   * Set authentication token (updates global config)
   * @deprecated Use setAuthToken from apiConfig instead
   */
  setToken(token: string) {
    // Note: Token is managed by apiConfig, this is a no-op for backwards compatibility
    console.warn('[AgentApiClient] setToken is deprecated, use setAuthToken from apiConfig');
  }

  /**
   * Abort ongoing request
   */
  abort() {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if error is retryable
   */
  private isRetryableError(error: any): boolean {
    // Retry on network errors, timeouts, and 5xx server errors
    if (error.isNetworkError) return true;
    if (error.code === 'REQUEST_ABORTED') return false; // Don't retry aborted requests
    if (error.status >= 500 && error.status < 600) return true;
    if (error.status === 429) return true; // Rate limit
    return false;
  }

  /**
   * Normalize request based on OFFICIAL API documentation
   * IMPORTANT: Official API uses agent_key in request body (app_key is in URL path)
   * Official example: { agent_key: "01KBCGGGD7RT20RW7J7ABRA7YW", agent_version: "v2", query, stream, history: [] }
   * The official schema shows these core fields: agent_key, agent_version, query, stream, conversation_id, history
   */
  private normalizeRequest(request: ChatCompletionRequest): any {
    const normalized: any = { ...request };

    // Handle agent_id vs agent_key (prefer agent_key for official API)
    // If agent_id is provided instead, convert it to agent_key
    if (request.agent_id && !request.agent_key) {
      normalized.agent_key = request.agent_id;
      delete normalized.agent_id;
    }

    // Remove agent_id if both are present (agent_key takes precedence for official API)
    if (normalized.agent_key && normalized.agent_id) {
      delete normalized.agent_id;
    }

    // Remove executor_version as it's not in official schema
    if (normalized.executor_version) {
      delete normalized.executor_version;
    }

    // Set default history to empty array if not provided (as shown in official example)
    if (!normalized.history) {
      normalized.history = [];
    }

    // Remove empty or unnecessary fields
    if (!normalized.custom_querys || Object.keys(normalized.custom_querys).length === 0) {
      delete normalized.custom_querys;
    }

    if (!normalized.chat_mode) {
      delete normalized.chat_mode;
    }

    if (!normalized.conversation_id) {
      delete normalized.conversation_id;
    }

    // Remove optional fields that are empty
    if (!normalized.temp_files || normalized.temp_files.length === 0) {
      delete normalized.temp_files;
    }

    if (!normalized.tool) {
      delete normalized.tool;
    }

    return normalized;
  }

  /**
   * Abort the current request
   */
  public abortRequest(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  /**
   * Get authentication headers
   */
  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Try to get token from config
    const token = getAuthToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers;
  }

  /**
   * Handle 401 by refreshing token and retrying (DIP mode only)
   * Returns the retry response or null if refresh failed
   */
  private async handle401AndRetry(
    url: string,
    options: RequestInit
  ): Promise<Response | null> {
    if (!dipEnvironmentService.isDipMode()) return null;

    console.log('[AgentApiClient] 401 detected, refreshing token...');
    const newToken = await dipEnvironmentService.refreshToken();
    if (!newToken) return null;

    console.log('[AgentApiClient] Token refreshed, retrying request');
    const retryHeaders = {
      ...(options.headers as Record<string, string>),
      Authorization: `Bearer ${newToken}`,
    };
    return fetch(url, { ...options, headers: retryHeaders });
  }

  /**
   * Handle API errors
   */
  private async handleApiError(response: Response): Promise<never> {
    let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
    let errorCode = 'UNKNOWN_ERROR';

    try {
      const errorData = await response.json();
      if (errorData.message) {
        errorMessage = errorData.message;
      }
      if (errorData.code) {
        errorCode = errorData.code;
      }
    } catch {
      // Ignore JSON parse errors
    }

    // Create custom error with additional context
    const error = new Error(errorMessage) as any;
    error.code = errorCode;
    error.status = response.status;
    error.isNetworkError = false;

    throw error;
  }

  /**
   * Handle network errors
   */
  private handleNetworkError(error: any): never {
    let errorMessage = '网络连接失败，请检查网络连接';
    let errorCode = 'NETWORK_ERROR';

    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      errorMessage = '无法连接到服务器，请检查服务器状态';
      errorCode = 'CONNECTION_ERROR';
    } else if (error.name === 'AbortError') {
      errorMessage = '请求已取消';
      errorCode = 'REQUEST_ABORTED';
    } else if (error.message) {
      errorMessage = error.message;
    }

    const networkError = new Error(errorMessage) as any;
    networkError.code = errorCode;
    networkError.isNetworkError = true;
    networkError.originalError = error;

    throw networkError;
  }

  /**
   * Send chat completion request (non-streaming) with retry and timeout
   * Official endpoint: POST /api/agent-app/v1/app/{app_key}/api/chat/completion
   */
  async chatCompletion(request: ChatCompletionRequest, retryCount: number = 0): Promise<ChatCompletionResponse> {
    const url = `${this.baseUrl}/app/${this.appKey}/api/chat/completion`;
    console.log('[AgentApiClient] chatCompletion URL:', url, 'appKey:', this.appKey);

    try {
      // Create new AbortController for timeout
      this.abortController = new AbortController();
      const timeoutId = setTimeout(() => this.abortController?.abort(), this.timeout);

      try {
        // Normalize request to handle agent_id vs agent_key
        const normalizedRequest = this.normalizeRequest({
          ...request,
          stream: false,
          inc_stream: false,
          chat_option: {
            enable_dependency_cache: true,
            is_need_history: true,
            is_need_doc_retrival_post_process: true,
            is_need_progress: true
          },
        });

        const fetchOptions: RequestInit = {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(normalizedRequest),
          signal: this.abortController.signal,
        };

        let response = await fetch(url, fetchOptions);

        // Retry on 401 with refreshed token
        if (response.status === 401) {
          const retryResponse = await this.handle401AndRetry(url, fetchOptions);
          if (retryResponse) {
            response = retryResponse;
          }
        }

        clearTimeout(timeoutId);

        if (!response.ok) {
          await this.handleApiError(response);
        }

        return await response.json();
      } finally {
        clearTimeout(timeoutId);
        this.abortController = null;
      }
    } catch (error) {
      // Check if we should retry
      if (this.isRetryableError(error) && retryCount < this.maxRetries) {
        console.warn(`Request failed, retrying (${retryCount + 1}/${this.maxRetries})...`, error);
        await this.sleep(RETRY_DELAY * Math.pow(2, retryCount)); // Exponential backoff
        return this.chatCompletion(request, retryCount + 1);
      }

      if (error instanceof Error && (error as any).status) {
        throw error; // Re-throw API errors
      }
      this.handleNetworkError(error);
    }
  }

  /**
   * Send chat completion request with streaming response and timeout
   * Official endpoint: POST /api/agent-app/v1/app/{app_key}/api/chat/completion
   */
  async chatCompletionStream(
    request: ChatCompletionRequest,
    onMessage: (message: StreamMessage) => void
  ): Promise<void> {
    const url = `${this.baseUrl}/app/${this.appKey}/api/chat/completion`;

    let response: Response;

    try {
      // Create new AbortController for timeout
      this.abortController = new AbortController();
      const timeoutId = setTimeout(() => {
        this.abortController?.abort();
        onMessage({
          type: 'error',
          error: '请求超时，请稍后重试'
        });
      }, this.streamTimeout);

      try {
        // Normalize request to handle agent_id vs agent_key
        const normalizedRequest = this.normalizeRequest({
          ...request,
          stream: true,
          inc_stream: true,
          chat_option: {
            enable_dependency_cache: true,
            is_need_history: true,
            is_need_doc_retrival_post_process: true,
            is_need_progress: true
          },
        });

        const fetchOptions: RequestInit = {
          method: 'POST',
          headers: this.getHeaders(),
          body: JSON.stringify(normalizedRequest),
          signal: this.abortController.signal,
        };

        response = await fetch(url, fetchOptions);

        // Retry on 401 with refreshed token
        if (response.status === 401) {
          const retryResponse = await this.handle401AndRetry(url, fetchOptions);
          if (retryResponse) {
            response = retryResponse;
          }
        }

        clearTimeout(timeoutId);

        if (!response.ok) {
          await this.handleApiError(response);
        }
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    } catch (error) {
      if ((error as any).name === 'AbortError') {
        onMessage({ type: 'error', error: '请求已取消或超时' });
        return;
      }
      this.handleNetworkError(error);
    }

    const reader = response!.body?.getReader();
    const decoder = new TextDecoder();

    if (!reader) {
      throw new Error('Response body is not readable');
    }

    try {
      let buffer = '';
      let currentEvent = '';
      let chunkCount = 0;

      // 累积数据对象 - 用于 processIncrementalUpdate 模式
      let accumulatedData: any = {};

      // 深度合并函数 - 不覆盖已有值为空值
      const deepMerge = (target: any, source: any): any => {
        if (source === null || source === undefined) return target;
        if (!target || typeof target !== 'object') return source;
        if (typeof source !== 'object') return source;
        if (Array.isArray(source)) return source;

        const result = { ...target };
        for (const key of Object.keys(source)) {
          const srcVal = source[key];
          const tgtVal = result[key];

          // 如果源值为空字符串且目标有非空值，保留目标值
          if (srcVal === '' && tgtVal && tgtVal !== '') {
            continue; // 保留目标值
          }

          // 如果源值为 null/undefined 且目标有值，保留目标值
          if ((srcVal === null || srcVal === undefined) && tgtVal !== undefined) {
            continue; // 保留目标值
          }

          if (srcVal && typeof srcVal === 'object' && !Array.isArray(srcVal)) {
            result[key] = deepMerge(tgtVal || {}, srcVal);
          } else {
            result[key] = srcVal;
          }
        }
        return result;
      };

      // processIncrementalUpdate 函数 - 按照 Agent开发指南.md 实现 (增强健壮性)
      const processIncrementalUpdate = (
        data: { key?: string[]; content?: any; action?: string; seq_id?: number },
        originalData: any
      ): any => {
        const { key: pathKeys, content: newContent, action: operation, seq_id } = data;

        if (!pathKeys || !Array.isArray(pathKeys) || pathKeys.length === 0) {
          // 根路径操作
          if (operation === 'upsert') return newContent;
          if (operation === 'append') {
            return (typeof originalData === 'string' ? originalData : '') + (newContent || '');
          }
          return originalData;
        }

        // 调试：打印增量更新
        if (pathKeys.includes('text') || pathKeys.includes('answer')) {
          console.log(`[processIncrementalUpdate] seq_id=${seq_id} key=${pathKeys.join('.')} action=${operation}`);
        }

        // Helper: 安全设置嵌套值 (自动创建对象/数组，覆盖非容器类型)
        const setNested = (obj: any, keys: string[], value: any) => {
          let current = obj;
          for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            const nextKey = keys[i + 1];
            // 简单判断: 如果nextKey是数字则创建数组(或者当前已是数组)，否则对象
            const isNextNumeric = !isNaN(Number(nextKey));

            // 如果当前key不存在，或者是一个基本类型(无法添加属性)，则覆盖为一个新容器
            if (current[key] === undefined || current[key] === null || typeof current[key] !== 'object') {
              current[key] = isNextNumeric ? [] : {};
            }

            current = current[key];
          }
          current[keys[keys.length - 1]] = value;
        };

        // Helper: 获取嵌套值
        const getNested = (obj: any, keys: string[]) => {
          let current = obj;
          for (const key of keys) {
            if (current === undefined || current === null) return undefined;
            current = current[key];
          }
          return current;
        };

        // Helper: 删除嵌套值
        const unsetNested = (obj: any, keys: string[]) => {
          let current = obj;
          for (let i = 0; i < keys.length - 1; i++) {
            if (current[keys[i]] === undefined) return;
            current = current[keys[i]];
          }
          const lastKey = keys[keys.length - 1];
          if (Array.isArray(current)) {
            delete current[Number(lastKey)];
          } else {
            delete current[lastKey];
          }
        };

        switch (operation) {
          case 'upsert': {
            // 特殊处理：对于 text 字段，将 upsert 转换为追加操作
            // 这样可以保留多阶段回答的完整内容 (恢复之前的逻辑以修复覆盖问题)
            const lastKey = pathKeys[pathKeys.length - 1];
            if (lastKey === 'text') {
              const existing = getNested(originalData, pathKeys);
              // 如果已有值是字符串，且新值也是字符串，则追加
              if (typeof existing === 'string' && typeof newContent === 'string') {
                setNested(originalData, pathKeys, existing + newContent);
                break;
              }
            }

            // 顶层键特殊处理：如果为了保持兼容性，可以保留 deepMerge，但标准实现是覆盖
            if (pathKeys.length === 1 && typeof newContent === 'object' && !Array.isArray(newContent)) {
              // 尝试合并以防止覆盖之前的根属性
              originalData[pathKeys[0]] = deepMerge(originalData[pathKeys[0]] || {}, newContent);
            } else {
              setNested(originalData, pathKeys, newContent);
            }
            break;
          }
          case 'append': {
            const existing = getNested(originalData, pathKeys);
            // 参考 streaming-http.ts 逻辑：如果是字符串则追加，否则覆盖
            if (typeof existing === 'string') {
              setNested(originalData, pathKeys, existing + (newContent || ''));
            } else {
              // 这里的 newContent 可能是对象，也可能是字符串。
              // 如果 existing 不是字符串 (可能是 undefined 或 对象)，直接设置为 newContent
              setNested(originalData, pathKeys, newContent);
            }
            break;
          }
          case 'remove': {
            unsetNested(originalData, pathKeys);
            break;
          }
        }
        return originalData;
      };

      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          console.log('[AgentApiClient] Stream completed, total chunks:', chunkCount);
          // 发送最终累积的数据
          if (Object.keys(accumulatedData).length > 0) {
            console.log('[AgentApiClient] Final accumulated data:', JSON.stringify(accumulatedData).substring(0, 200));
            onMessage({ type: 'message', data: accumulatedData });
          }
          // 如果 buffer 中有残留的 JSON，尝试解析
          if (buffer.trim().startsWith('{')) {
            try {
              const parsedData = JSON.parse(buffer.trim());
              console.log('[AgentApiClient] Final buffer parsed as JSON');
              // 处理增量更新
              if (parsedData.key && Array.isArray(parsedData.key)) {
                accumulatedData = processIncrementalUpdate(parsedData, accumulatedData);
                onMessage({ type: 'message', data: accumulatedData });
              } else {
                onMessage({ type: 'message', data: parsedData });
              }
            } catch (e) {
              console.log('[AgentApiClient] Final buffer not valid JSON');
            }
          }
          onMessage({ type: 'end' });
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        chunkCount++;
        if (chunkCount <= 5 || chunkCount % 10 === 0) {
          console.log(`[AgentApiClient] Chunk ${chunkCount}:`, chunk.substring(0, 100));
        }

        buffer += chunk;
        const lines = buffer.split('\n');

        // Keep the last incomplete line in buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;

          if (trimmedLine.startsWith('event: ')) {
            currentEvent = trimmedLine.substring(7).trim();
          } else if (trimmedLine.startsWith('data: ')) {
            const data = trimmedLine.substring(6).trim();

            if (currentEvent === 'message' || !currentEvent) {
              try {
                const parsedData = JSON.parse(data);

                // 检查是否是增量更新格式 {key, content, action}
                if (parsedData.key && Array.isArray(parsedData.key)) {
                  // 使用 processIncrementalUpdate 处理
                  accumulatedData = processIncrementalUpdate(parsedData, accumulatedData);
                  // 发送累积后的数据
                  onMessage({ type: 'message', data: accumulatedData });
                } else {
                  // 旧格式，直接发送
                  onMessage({ type: 'message', data: parsedData });
                }
              } catch (error) {
                console.error('[AgentApiClient] Failed to parse message data:', (error as Error).message);
              }
            } else if (currentEvent === 'end') {
              onMessage({ type: 'end' });
              return;
            } else if (currentEvent === 'error') {
              onMessage({ type: 'error', error: data || 'Stream error occurred' });
            }

            currentEvent = '';
          } else if (trimmedLine.startsWith('{')) {
            // Handle raw JSON response (non-SSE format)
            try {
              const parsedData = JSON.parse(trimmedLine);

              // 检查是否是增量更新格式
              if (parsedData.key && Array.isArray(parsedData.key)) {
                accumulatedData = processIncrementalUpdate(parsedData, accumulatedData);
                onMessage({ type: 'message', data: accumulatedData });
              } else {
                onMessage({ type: 'message', data: parsedData });
              }
            } catch (error) {
              // 可能是不完整的 JSON，忽略
            }
          }
        }
      }
    } catch (error) {
      console.error('Stream processing error:', error);
      onMessage({ type: 'error', error: 'Stream processing failed' });
    } finally {
      reader.releaseLock();
    }
  }

  /**
   * Get conversations list
   */
  async getConversations(page: number = 1, pageSize: number = 20): Promise<{
    conversations: Conversation[];
    total: number;
    page: number;
    page_size: number;
  }> {
    const url = `${this.baseUrl}/app/${this.appKey}/conversations?page=${page}&page_size=${pageSize}`;

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        await this.handleApiError(response);
      }

      return await response.json();
    } catch (error) {
      if (error instanceof Error && (error as any).status) {
        throw error; // Re-throw API errors
      }
      this.handleNetworkError(error);
    }
  }

  /**
   * Get conversation detail
   */
  async getConversation(conversationId: string): Promise<ConversationDetail> {
    const url = `${this.baseUrl}/app/${this.appKey}/conversations/${conversationId}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      await this.handleApiError(response);
    }

    return await response.json();
  }

  /**
   * Update conversation
   */
  async updateConversation(
    conversationId: string,
    updates: { title?: string; ext?: string }
  ): Promise<void> {
    const url = `${this.baseUrl}/app/${this.appKey}/conversations/${conversationId}`;

    const response = await fetch(url, {
      method: 'PUT',
      headers: this.getHeaders(),
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      await this.handleApiError(response);
    }
  }

  /**
   * Delete conversation
   */
  async deleteConversation(conversationId: string): Promise<void> {
    const url = `${this.baseUrl}/app/${this.appKey}/conversations/${conversationId}`;

    const response = await fetch(url, {
      method: 'DELETE',
      headers: this.getHeaders(),
    });

    if (!response.ok) {
      await this.handleApiError(response);
    }
  }

  /**
   * Debug agent
   */
  async debugAgent(request: {
    agent_id: string;
    input: {
      query: string;
      temp_files?: any[];
      history?: any[];
      tool?: any;
      custom_querys?: Record<string, any>;
    };
    chat_mode?: 'normal' | 'deep_thinking';
  }): Promise<ChatCompletionResponse> {
    const url = `${this.baseUrl}/app/${this.appKey}/api/debug`;

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      await this.handleApiError(response);
    }

    return await response.json();
  }
}

// Export singleton instance
export const agentApiClient = new AgentApiClient();
export default agentApiClient;