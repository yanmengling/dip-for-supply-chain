/**
 * DecisionAgentCopilot
 *
 * Extends @kweaver-ai/chatkit's CopilotBase (which provides the full Copilot UI:
 * message bubbles, history sidebar, progress display, regenerate button, etc.)
 * but overrides the network layer to call the Decision Agent API:
 *
 *   POST /app/{agentKey}/api/chat/completion
 *
 * Key differences from the default DIPBaseMixin:
 * 1. Endpoint: /api/chat/completion instead of /chat/run
 * 2. Session auto-creation: no dedicated conversation endpoint; the first
 *    message omits conversation_id and the server returns one in the SSE stream.
 * 3. Request body: requires `agent_id` field alongside `query`.
 * 4. SSE frame format: identical {seq_id, key[], content, action} — fully compatible.
 * 5. Response paths: handles both middle_answer.progress[] (same as DIPBase)
 *    and the new final_answer.answer.text path.
 */

import { CopilotBase } from '@kweaver-ai/chatkit';
import type {
    ApplicationContext,
    ChatMessage,
    ConversationHistory,
} from '@kweaver-ai/chatkit';

export interface OnboardingInfo {
    prologue: string;
    predefinedQuestions: Array<string>;
}
import { RoleType } from '@kweaver-ai/chatkit';
import type { ChatKitBaseProps } from '@kweaver-ai/chatkit';

export interface CopilotBaseProps extends ChatKitBaseProps {
    drawerContainer?: HTMLElement | null;
}
import { getAuthToken } from '../../config/apiConfig';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface DecisionAgentCopilotProps extends CopilotBaseProps {
    /** Agent Key — used as both the URL path segment and the agent_id body field. */
    agentKey: string;
    /** Base URL, e.g. "/api/agent-app/v1" or "https://dip.aishu.cn:443/api/agent-app/v1". */
    baseUrl?: string;
    /** Bearer token (without the "Bearer " prefix). */
    token?: string;
    /** Optional token refresh callback. */
    refreshToken?: () => Promise<string>;
    /** Chat mode forwarded to the API (default: "normal"). */
    chatMode?: 'normal' | 'deep_thinking';
    /** businessDomain forwarded for agent-factory onboarding calls. */
    businessDomain?: string;
}

// ─── Internal SSE frame shape (Decision Agent protocol) ──────────────────────

interface SSEFrame {
    seq_id?: number;
    key?: Array<string | number>;
    content?: any;
    action?: 'upsert' | 'append' | 'remove' | 'end';
}

// ─── Internal accumulated state for stream parsing ───────────────────────────

interface AssistantAccumulator {
    message?: {
        id?: string;
        conversation_id?: string;
        content?: {
            middle_answer?: { progress?: any[] };
            final_answer?: {
                answer?: { text?: string };
                thinking?: string;
                skill_process?: any[];
            };
        };
    };
    conversation_id?: string;
    assistant_message_id?: string;
}

// ─── Utility: getNestedProperty / setNestedProperty ──────────────────────────

function getNestedProperty(obj: any, keys: Array<string | number>): any {
    return keys.reduce((cur, key) => (cur != null ? cur[key] : undefined), obj);
}

function setNestedProperty(obj: any, keys: Array<string | number>, value: any): void {
    const last = keys[keys.length - 1];
    const parent = keys.slice(0, -1).reduce((cur, key) => {
        if (cur[key] == null) {
            cur[key] = typeof key === 'number' ? [] : {};
        }
        return cur[key];
    }, obj);
    parent[last] = value;
}

// ─── Class ────────────────────────────────────────────────────────────────────

export class DecisionAgentCopilot extends CopilotBase<DecisionAgentCopilotProps> {
    // Pending conversation_id captured from SSE before we sync it to state
    private _pendingConversationId: string | null = null;

    // ── Helpers ────────────────────────────────────────────────────────────────

    private get _baseUrl(): string {
        return (this.props.baseUrl || '/api/agent-app/v1').replace(/\/$/, '');
    }

    private get _agentKey(): string {
        return this.props.agentKey || '';
    }

    /**
     * Returns the freshest available token at call time.
     * Priority: DIP platform live token > sessionStorage > localStorage > props snapshot.
     * Calling getAuthToken() on every request (instead of reading a stale props snapshot)
     * ensures we always use a non-expired credential.
     */
    private get _token(): string {
        const live = getAuthToken();
        // Fall back to props.token only if getAuthToken() returns nothing
        return live || this.props.token || '';
    }

    /** Builds the standard headers expected by the Decision Agent API. */
    private _buildHeaders(extra?: Record<string, string>): Record<string, string> {
        const t = this._token;
        // Strip any 'Bearer ' prefix to get the raw token
        const rawToken = t.startsWith('Bearer ') ? t.slice(7) : t;
        return {
            // agent-app middleware checks 'Token' header (confirmed from DIP Studio traffic)
            'Token': rawToken,
            // Also send standard Authorization header for other proxy middleware layers
            'Authorization': `Bearer ${rawToken}`,
            'Content-Type': 'application/json',
            'X-Business-Domain': this.props.businessDomain || 'bd_public',
            'X-Language': 'zh-CN',
            ...(extra || {}),
        };
    }

    /** Centralised fetch with optional token refresh on 401. */
    private async _fetch(url: string, init: RequestInit): Promise<Response> {
        let resp = await fetch(url, {
            ...init,
            headers: this._buildHeaders(init.headers as Record<string, string>),
        });

        if (resp.status === 401 && this.props.refreshToken) {
            try {
                const newToken = await this.props.refreshToken();
                const refreshed = newToken.startsWith('Bearer ') ? newToken.slice(7) : newToken;
                // Update internal token reference for the retry
                resp = await fetch(url, {
                    ...init,
                    headers: {
                        ...this._buildHeaders(init.headers as Record<string, string>),
                        'Token': refreshed,
                    },
                });
            } catch {
                // ignore refresh error, return original 401 response
            }
        }

        return resp;
    }

    // ── Abstract method implementations ────────────────────────────────────────

    /**
     * Decision Agent uses auto-session-creation: the first send omits
     * `conversation_id` and the server returns one in the SSE stream.
     * So we return '' here; sendMessage handles the rest.
     */
    async generateConversation(_title?: string): Promise<string> {
        return '';
    }

    /**
     * Opens SSE stream to /app/{agentKey}/api/chat/completion.
     *
     * In auto-creation mode (no conversationID), the server returns
     * `conversation_id` via an SSE frame with key ["conversation_id"].
     * We capture it and sync it into component state so subsequent
     * messages use the same session.
     */
    async sendMessage(
        text: string,
        ctx: ApplicationContext,
        conversationID?: string,
        _regenerateMessageId?: string,
    ): Promise<ChatMessage> {
        const url = `${this._baseUrl}/app/${this._agentKey}/api/chat/completion`;

        // Build request body — only include fields confirmed in Agent开发指南.md
        const body: Record<string, any> = {
            agent_key: this._agentKey,
            query: text,
            stream: true,
            chat_mode: this.props.chatMode || 'normal',
        };
        if (conversationID) {
            body.conversation_id = conversationID;
        }
        // Inject application context as additional user data if present
        if (ctx?.data) {
            body.context = ctx.data;
        }

        // Build user-side ChatMessage displayed immediately in the UI
        const userMessage: ChatMessage = {
            messageId: `user_${Date.now()}`,
            role: { name: '我', type: RoleType.USER, avatar: '' },
            content: [],
            applicationContext: ctx,
        };

        // Inject empty assistant message into CopilotBase state before streaming
        const assistantMessageId = _regenerateMessageId || `assistant_${Date.now()}`;
        const assistantMessage: ChatMessage = {
            messageId: assistantMessageId,
            role: { name: 'AI助手', type: RoleType.ASSISTANT, avatar: '' },
            content: [],
        };
        
        if (_regenerateMessageId) {
            this.setState((prev) => ({
                messages: prev.messages.map((m) => (m.messageId === _regenerateMessageId ? assistantMessage : m)),
                streamingMessageId: assistantMessageId,
            }));
        } else {
            this.setState((prev) => ({
                messages: [...prev.messages, assistantMessage],
                streamingMessageId: assistantMessageId,
            }));
        }

        const resp = await this._fetch(url, {
            method: 'POST',
            body: JSON.stringify(body),
            headers: {
                Accept: 'text/event-stream',
            },
        });

        if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            throw new Error(`Decision Agent API error ${resp.status}: ${errText}`);
        }

        if (!resp.body) {
            throw new Error('Decision Agent API returned no response body');
        }

        // Reset pending conversation tracker for this send cycle
        this._pendingConversationId = null;

        // ── Custom SSE streaming ──────────────────────────────────────────────────
        // Decision Agent sends FULL JSON snapshots per frame, not DIPBase key/action
        // incremental deltas.  Each frame looks like:
        //   { conversation_id, message: { content: { final_answer: { answer: { text } } } } }
        // We read cumulative `answer.text` from each frame and emit only the NEW
        // characters since the last frame so the UI renders smoothly.
        const reader = resp.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let lastText = '';
        let conversationIdCaptured = '';

        outer: while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';   // keep partial last line for next chunk

            let didUpdate = false;

            for (const rawLine of lines) {
                const line = rawLine.trim();
                if (!line.startsWith('data:')) continue;

                const jsonStr = line.slice(5).trim();
                if (!jsonStr || jsonStr === '[DONE]') {
                    if (jsonStr === '[DONE]') break outer;
                    continue;
                }

                let frame: any;
                try {
                    frame = JSON.parse(jsonStr);
                } catch {
                    continue; // skip malformed frames
                }

                // Capture conversation_id from first frame that has it
                if (frame.conversation_id && !conversationIdCaptured) {
                    conversationIdCaptured = frame.conversation_id;
                    this._pendingConversationId = conversationIdCaptured;
                }

                // Extract cumulative answer text
                const answerText: string =
                    frame?.message?.content?.final_answer?.answer?.text ?? '';

                if (answerText && answerText.length > lastText.length) {
                    // Only pass the NEW characters as an append delta
                    const delta = answerText.slice(lastText.length);
                    lastText = answerText;
                    this.appendMarkdownBlock(assistantMessageId, answerText);
                    didUpdate = true;
                }
            }

            // ChatKit batches UI state updates internally. Since we bypassed
            // handleStreamResponse, we must manually flush updates per chunk
            // so React will render the new text characters incrementally.
            if (didUpdate) {
                this.flushStreamingUpdates();
            }
        }

        // If the server returned a new conversation_id and we didn't have one,
        // sync it into component state so the next message continues the session.
        if (this._pendingConversationId && !conversationID) {
            this.setState({ conversationID: this._pendingConversationId });
        }

        return userMessage;
    }

    /**
     * Parses each SSE frame from the Decision Agent stream.
     *
     * SSE frame format (same as DIPBase):
     *   { seq_id, key: string[], content: any, action: 'upsert'|'append'|'remove'|'end' }
     *
     * Handled paths:
     *   ["conversation_id"]                          → store for state sync
     *   ["assistant_message_id"]                     → informational
     *   ["message", "content", "final_answer", "answer", "text"]  → appendMarkdownBlock
     *   ["message", "content", "middle_answer", "progress", n]    → tool/progress blocks
     */
    reduceAssistantMessage<T = any, K = any>(
        eventMessage: T,
        prev: K,
        messageId: string,
    ): K {
        const frame = eventMessage as SSEFrame;
        const acc = (prev || {}) as AssistantAccumulator;

        if (!frame || !frame.key || frame.action === 'end') {
            return acc as unknown as K;
        }

        const { key, content, action } = frame;
        const jsonPath = key.join('.');

        // ── 1. Top-level conversation_id → capture for state sync ────────────────
        if (jsonPath === 'conversation_id' && action === 'upsert' && content) {
            acc.conversation_id = content;
            this._pendingConversationId = content;
            return acc as unknown as K;
        }

        // ── 2. assistant_message_id → informational, store if needed ─────────────
        if (jsonPath === 'assistant_message_id' && action === 'upsert') {
            acc.assistant_message_id = content;
            return acc as unknown as K;
        }

        // ── 3. final_answer.answer.text → stream main answer text ─────────────────
        //   key: ["message","content","final_answer","answer","text"]
        if (jsonPath === 'message.content.final_answer.answer.text') {
            const existing = getNestedProperty(acc, key as string[]) ?? '';
            const updated = action === 'append' ? existing + content : content;
            setNestedProperty(acc, key as string[], updated);
            this.appendMarkdownBlock(messageId, updated);
            return acc as unknown as K;
        }

        // ── 4. final_answer.thinking → optional thinking block ─────────────────────
        //   key: ["message","content","final_answer","thinking"]
        if (jsonPath === 'message.content.final_answer.thinking' && content) {
            const existing = getNestedProperty(acc, key as string[]) ?? '';
            const updated = action === 'append' ? existing + content : content;
            setNestedProperty(acc, key as string[], updated);
            // Surface as italicized markdown in the UI
            this.appendMarkdownBlock(messageId, `*思考中：${updated}*\n\n`);
            return acc as unknown as K;
        }

        // ── 5. middle_answer.progress (tool/skill steps) ──────────────────────────
        //   key: ["message","content","middle_answer","progress", N, ...]
        if (jsonPath.startsWith('message.content.middle_answer.progress')) {
            // Apply the incremental update to the accumulator
            if (action === 'upsert') {
                setNestedProperty(acc, key as string[], content);
            } else if (action === 'append') {
                const existing = getNestedProperty(acc, key as string[]) ?? '';
                const updated = typeof existing === 'string' ? existing + content : content;
                setNestedProperty(acc, key as string[], updated);
            }
            return acc as unknown as K;
        }

        // ── 6. Generic upsert/append for any other paths ──────────────────────────
        if (action === 'upsert') {
            setNestedProperty(acc, key as string[], content);
        } else if (action === 'append') {
            const existing = getNestedProperty(acc, key as string[]) ?? '';
            const updated = typeof existing === 'string' ? existing + content : content;
            setNestedProperty(acc, key as string[], updated);
        } else if (action === 'remove') {
            setNestedProperty(acc, key as string[], undefined);
        }

        return acc as unknown as K;
    }

    /**
     * Retrieves onboarding info using the agent-market endpoint.
     */
    async getOnboardingInfo(): Promise<OnboardingInfo> {
        // Replace the agent-app base path with the agent-factory base path
        const host = this._baseUrl.replace(/\/api\/agent-app\/v1\/?$/, '');
        const url = `${host || ''}/api/agent-factory/v3/agent-market/agent/${this._agentKey}/version/v0`;
        
        try {
            const resp = await this._fetch(url, { method: 'GET' });
            if (!resp.ok) {
                console.warn(`[DecisionAgentCopilot] getOnboardingInfo returned ${resp.status}`);
                return { prologue: '', predefinedQuestions: [] };
            }
            
            const data = await resp.json();
            const agentData = data?.data || data || {};
            
            const prologue = agentData.prologue ?? agentData.description ?? '';
            const rawQuestions = agentData.predefined_questions || agentData.predefinedQuestions || [];
            
            const predefinedQuestions = rawQuestions.map((q: any) => {
                if (typeof q === 'string') return { title: q, query: q };
                return { 
                    title: q.title || q.query || q.name || String(q), 
                    query: q.query || q.title || q.name || String(q) 
                };
            });

            return { prologue, predefinedQuestions };
        } catch (e) {
            console.warn('[DecisionAgentCopilot] getOnboardingInfo failed:', e);
            return { prologue: '', predefinedQuestions: [] };
        }
    }

    /** Return 401 → needs token refresh. */
    shouldRefreshToken(status: number, _error: any): boolean {
        return status === 401;
    }

    /**
     * Terminates a streaming session.
     * Reuses the same termination endpoint as DIPBase (path is unchanged).
     */
    async terminateConversation(conversationId: string): Promise<void> {
        const url = `${this._baseUrl}/app/${this._agentKey}/chat/termination`;
        try {
            await this._fetch(url, {
                method: 'POST',
                body: JSON.stringify({ conversation_id: conversationId }),
            });
        } catch (e) {
            console.warn('[DecisionAgentCopilot] terminateConversation failed:', e);
        }
    }

    // ── History conversation endpoints ─────────────────────────────────────────
    // Decision Agent uses /conversations (plural) vs DIPBase's /conversation.

    async getConversations(page = 1, size = 10): Promise<ConversationHistory[]> {
        const url = `${this._baseUrl}/app/${this._agentKey}/conversations?page=${page}&size=${size}`;
        try {
            const resp = await this._fetch(url, { method: 'GET' });
            if (!resp.ok) return [];
            const data = await resp.json();
            const items: any[] = data?.data?.conversations || data?.conversations || data?.data || [];
            return items.map((item: any) => ({
                conversationID: item.conversation_id || item.id || '',
                title: item.title || item.name || '会话',
                created_at: item.created_at ?? Date.now(),
                updated_at: item.updated_at ?? Date.now(),
            }));
        } catch (e) {
            console.warn('[DecisionAgentCopilot] getConversations failed:', e);
            return [];
        }
    }

    async getConversationMessages(conversationId: string): Promise<ChatMessage[]> {
        const url = `${this._baseUrl}/app/${this._agentKey}/conversations/${conversationId}`;
        try {
            const resp = await this._fetch(url, { method: 'GET' });
            if (!resp.ok) return [];
            const data = await resp.json();
            const messages: any[] = data?.data?.messages || data?.messages || [];
            // Map raw messages back to ChatMessage structure
            return messages.map((m: any): ChatMessage => {
                const isUser = m.role === 'user';
                const textContent = m.content?.text || m.text || '';
                return {
                    messageId: m.id || m.message_id || `hist_${Date.now()}_${Math.random()}`,
                    role: isUser
                        ? { name: '我', type: RoleType.USER, avatar: '' }
                        : { name: 'AI助手', type: RoleType.ASSISTANT, avatar: '' },
                    content: textContent
                        ? [{ type: 'Markdown' as any, content: textContent }]
                        : [],
                };
            });
        } catch (e) {
            console.warn('[DecisionAgentCopilot] getConversationMessages failed:', e);
            return [];
        }
    }

    async deleteConversation(conversationID: string): Promise<void> {
        const url = `${this._baseUrl}/app/${this._agentKey}/conversations/${conversationID}`;
        try {
            await this._fetch(url, { method: 'DELETE' });
        } catch (e) {
            console.warn('[DecisionAgentCopilot] deleteConversation failed:', e);
        }
    }
}

export default DecisionAgentCopilot;
