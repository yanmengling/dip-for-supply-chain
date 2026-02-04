/**
 * API Configuration Management Service
 * 
 * Provides CRUD operations and API connection testing for all configuration types.
 * Integrates with existing API clients to validate configurations.
 */

import {
    ApiConfigType,
    type ApiConfigCollection,
    type BaseApiConfig,
    type AnyApiConfig,
    type KnowledgeNetworkConfig,
    type OntologyObjectConfig,
    type MetricModelConfig,
    type AgentConfig,
    type WorkflowConfig,
    type ConfigTestResult
} from '../types/apiConfig';
import { configStorageService } from './configStorageService';
import { ontologyApi } from '../api/ontologyApi';
import { metricModelApi } from '../api/metricModelApi';
import { getKnowledgeNetworkId, setKnowledgeNetworkId, getAuthHeaders, getApiConfig, updateApiConfig } from '../config/apiConfig';
import { dipEnvironmentService } from './dipEnvironmentService';

// ============================================================================
// API Configuration Service
// ============================================================================

class ApiConfigService {
    private storage = configStorageService;

    // ==========================================================================
    // CRUD Operations
    // ==========================================================================

    /**
     * Get all configurations
     */
    getAllConfigs(): ApiConfigCollection {
        return this.storage.loadConfig();
    }

    /**
     * Get configurations by type
     */
    getConfigsByType<T extends BaseApiConfig>(type: ApiConfigType): T[] {
        const all = this.getAllConfigs();

        switch (type) {
            case ApiConfigType.KNOWLEDGE_NETWORK:
                return all.knowledgeNetworks as unknown as T[];
            case ApiConfigType.ONTOLOGY_OBJECT:
                return all.ontologyObjects as unknown as T[];
            case ApiConfigType.METRIC_MODEL:
                return all.metricModels as unknown as T[];
            case ApiConfigType.AGENT:
                return all.agents as unknown as T[];
            case ApiConfigType.WORKFLOW:
                return all.workflows as unknown as T[];
            default:
                return [];
        }
    }

    /**
     * Get enabled configurations by type
     */
    getEnabledConfigsByType<T extends BaseApiConfig>(type: ApiConfigType): T[] {
        return this.getConfigsByType<T>(type).filter(c => c.enabled);
    }

    /**
     * Get configuration by ID
     */
    getConfigById(id: string): AnyApiConfig | null {
        const all = this.getAllConfigs();
        const allConfigs: AnyApiConfig[] = [
            ...all.knowledgeNetworks,
            ...all.ontologyObjects,
            ...all.metricModels,
            ...all.agents,
            ...all.workflows
        ];
        return allConfigs.find(c => c.id === id) || null;
    }

    /**
     * Get configuration by entity type (for Ontology Objects)
     */
    getOntologyObjectByEntityType(entityType: string): OntologyObjectConfig | null {
        const configs = this.getEnabledConfigsByType<OntologyObjectConfig>(ApiConfigType.ONTOLOGY_OBJECT);
        return configs.find(c => c.entityType === entityType) || null;
    }

    /**
     * Get configuration by DAG ID (for Workflows)
     */
    getWorkflowByDagId(dagId: string): WorkflowConfig | null {
        const workflows = this.getEnabledConfigsByType<WorkflowConfig>(ApiConfigType.WORKFLOW);
        return workflows.find(wf => wf.dagId === dagId) || null;
    }

    /**
     * Save configuration (create or update)
     */
    saveConfig(config: AnyApiConfig): void {
        const all = this.getAllConfigs();
        const existing = this.getConfigById(config.id);

        if (!existing) {
            // Create new
            config.createdAt = Date.now();
        }
        config.updatedAt = Date.now();

        // Update configuration in the appropriate array
        switch (config.type) {
            case ApiConfigType.KNOWLEDGE_NETWORK:
                this.updateConfigArray(all.knowledgeNetworks, config as KnowledgeNetworkConfig);
                break;
            case ApiConfigType.ONTOLOGY_OBJECT:
                this.updateConfigArray(all.ontologyObjects, config as OntologyObjectConfig);
                break;
            case ApiConfigType.METRIC_MODEL:
                this.updateConfigArray(all.metricModels, config as MetricModelConfig);
                break;
            case ApiConfigType.AGENT:
                this.updateConfigArray(all.agents, config as AgentConfig);
                break;
            case ApiConfigType.WORKFLOW:
                this.updateConfigArray(all.workflows, config as WorkflowConfig);
                break;
        }

        this.storage.saveConfig(all);

        // Sync runtime state for configs that affect global runtime behavior
        this.syncRuntimeState(config);

        console.log(`[ApiConfigService] Saved configuration: ${config.id} (${config.name})`);
    }

    /**
     * Sync saved configuration to runtime state.
     * Ensures that changes in config center take effect immediately
     * without requiring a page refresh.
     */
    private syncRuntimeState(config: AnyApiConfig): void {
        switch (config.type) {
            case ApiConfigType.KNOWLEDGE_NETWORK: {
                const knConfig = config as KnowledgeNetworkConfig;
                if (knConfig.enabled && knConfig.knowledgeNetworkId) {
                    setKnowledgeNetworkId(knConfig.knowledgeNetworkId);
                    console.log(`[ApiConfigService] Synced runtime KN ID: ${knConfig.knowledgeNetworkId}`);
                }
                break;
            }
            case ApiConfigType.AGENT: {
                const agentConfig = config as AgentConfig;
                if (agentConfig.enabled && agentConfig.appKey) {
                    // Sync appKey to runtime config so agentApi.ts picks up the change
                    this.syncAgentAppKey(agentConfig.appKey);
                    console.log(`[ApiConfigService] Synced runtime Agent appKey: ${agentConfig.appKey}`);
                }
                break;
            }
        }
    }

    /**
     * Sync Agent appKey to global runtime configuration.
     * This updates the runtime config that agentApi.ts uses for API calls.
     */
    private syncAgentAppKey(appKey: string): void {
        try {
            // updateApiConfig 现在支持深度合并，只需传入要更新的服务属性
            updateApiConfig({
                services: {
                    agent: {
                        appKey: appKey
                    }
                } as any
            });
            console.log(`[ApiConfigService] Successfully synced agent appKey to runtime: ${appKey}`);
        } catch (err) {
            console.error('[ApiConfigService] Failed to sync agent appKey:', err);
        }
    }



    /**
     * Get all Metric Model configurations
     */
    getMetricModelConfigs(): MetricModelConfig[] {
        return this.getConfigsByType(ApiConfigType.METRIC_MODEL) as MetricModelConfig[];
    }

    /**
     * Get all Ontology Object configurations
     */
    getOntologyObjectConfigs(): OntologyObjectConfig[] {
        return this.getConfigsByType(ApiConfigType.ONTOLOGY_OBJECT) as OntologyObjectConfig[];
    }

    /**
     * Get all Knowledge Network configurations
     */
    getKnowledgeNetworkConfigs(): KnowledgeNetworkConfig[] {
        return this.getConfigsByType(ApiConfigType.KNOWLEDGE_NETWORK) as KnowledgeNetworkConfig[];
    }

    /**
     * Delete configuration by ID
     */
    deleteConfig(id: string): boolean {
        const all = this.getAllConfigs();
        const initialCount = this.getTotalConfigCount(all);

        all.knowledgeNetworks = all.knowledgeNetworks.filter(c => c.id !== id);
        all.ontologyObjects = all.ontologyObjects.filter(c => c.id !== id);
        all.metricModels = all.metricModels.filter(c => c.id !== id);
        all.agents = all.agents.filter(c => c.id !== id);
        all.workflows = all.workflows.filter(c => c.id !== id);

        const finalCount = this.getTotalConfigCount(all);
        const deleted = initialCount > finalCount;

        if (deleted) {
            this.storage.saveConfig(all);
            console.log(`[ApiConfigService] Deleted configuration: ${id}`);
        }

        return deleted;
    }

    /**
     * Toggle configuration enabled status
     */
    toggleEnabled(id: string): boolean {
        const config = this.getConfigById(id);
        if (!config) {
            return false;
        }

        config.enabled = !config.enabled;
        this.saveConfig(config);
        console.log(`[ApiConfigService] Toggled enabled status for ${id}: ${config.enabled}`);
        return true;
    }

    /**
     * Get Ontology Object Type ID by Config ID
     * Returns the configured objectTypeId
     */
    getOntologyObjectId(configId: string): string | undefined {
        const config = this.getConfigById(configId) as OntologyObjectConfig;
        return config?.objectTypeId;
    }

    getMetricModelId(configId: string): string | undefined {
        const config = this.getConfigById(configId) as MetricModelConfig;
        return config?.modelId;
    }

    /**
     * Get Agent Key by Config ID
     */
    getAgentKey(configId: string): string | undefined {
        const config = this.getConfigById(configId) as AgentConfig;
        return config?.agentKey;
    }

    /**
     * Get Agent Version by Config ID
     */
    getAgentVersion(configId: string): string | undefined {
        const config = this.getConfigById(configId) as AgentConfig;
        return config?.agentVersion;
    }

    /**
     * Get Agent Name by Config ID
     */
    getAgentName(configId: string): string | undefined {
        const config = this.getConfigById(configId);
        return config?.name;
    }

    /**
     * Get Agent Description by Config ID
     */
    getAgentDescription(configId: string): string | undefined {
        const config = this.getConfigById(configId);
        return config?.description;
    }

    /**
     * Duplicate configuration
     */
    duplicateConfig(id: string, newName?: string): AnyApiConfig | null {
        const original = this.getConfigById(id);
        if (!original) {
            return null;
        }

        const duplicate: AnyApiConfig = {
            ...original,
            id: `${original.id}_copy_${Date.now()}`,
            name: newName || `${original.name} (副本)`,
            enabled: false,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        this.saveConfig(duplicate);
        console.log(`[ApiConfigService] Duplicated configuration: ${id} -> ${duplicate.id}`);
        return duplicate;
    }

    // ==========================================================================
    // API Connection Testing
    // ==========================================================================

    /**
     * Test API connection for a configuration
     */
    async testConnection(config: AnyApiConfig): Promise<ConfigTestResult> {
        const timestamp = Date.now();

        try {
            console.log(`[ApiConfigService] Testing connection for ${config.type}: ${config.name}`);

            switch (config.type) {
                case ApiConfigType.KNOWLEDGE_NETWORK:
                    return await this.testKnowledgeNetworkConnection(config as KnowledgeNetworkConfig, timestamp);
                case ApiConfigType.ONTOLOGY_OBJECT:
                    return await this.testOntologyObjectConnection(config as OntologyObjectConfig, timestamp);
                case ApiConfigType.METRIC_MODEL:
                    return await this.testMetricModelConnection(config as MetricModelConfig, timestamp);
                case ApiConfigType.AGENT:
                    return await this.testAgentConnection(config as AgentConfig, timestamp);
                case ApiConfigType.WORKFLOW:
                    return await this.testWorkflowConnection(config as WorkflowConfig, timestamp);
                default:
                    return {
                        success: false,
                        message: '未知配置类型',
                        timestamp
                    };
            }
        } catch (error) {
            console.error(`[ApiConfigService] Connection test failed:`, error);
            return {
                success: false,
                message: error instanceof Error ? error.message : '连接测试失败',
                details: error,
                timestamp
            };
        }
    }

    /**
     * Test Knowledge Network API connection
     */
    private async testKnowledgeNetworkConnection(
        config: KnowledgeNetworkConfig,
        timestamp: number
    ): Promise<ConfigTestResult> {
        // Temporarily switch to this knowledge network
        const originalId = getKnowledgeNetworkId();
        setKnowledgeNetworkId(config.knowledgeNetworkId);

        try {
            const response = await ontologyApi.getObjectTypes({ limit: 1 });
            setKnowledgeNetworkId(originalId);

            return {
                success: true,
                message: `成功连接知识网络，找到 ${response.total || 0} 个对象类型`,
                details: {
                    knowledgeNetworkId: config.knowledgeNetworkId,
                    objectTypeCount: response.total || 0
                },
                timestamp
            };
        } catch (error) {
            setKnowledgeNetworkId(originalId);
            throw error;
        }
    }

    /**
     * Test Ontology Object API connection
     */
    private async testOntologyObjectConnection(
        config: OntologyObjectConfig,
        timestamp: number
    ): Promise<ConfigTestResult> {
        const response = await ontologyApi.queryObjectInstances(config.objectTypeId, { limit: 1 });

        return {
            success: true,
            message: `成功查询业务对象，返回 ${response.entries.length} 条记录`,
            details: {
                objectTypeId: config.objectTypeId,
                entityType: config.entityType,
                recordCount: response.entries.length
            },
            timestamp
        };
    }

    /**
     * Test Metric Model API connection
     */
    private async testMetricModelConnection(
        config: MetricModelConfig,
        timestamp: number
    ): Promise<ConfigTestResult> {
        const fields = await metricModelApi.getModelFields(config.modelId);

        return {
            success: true,
            message: `成功连接指标模型，包含 ${fields.length} 个字段`,
            details: {
                modelId: config.modelId,
                fieldCount: fields.length,
                fields: fields.slice(0, 10) // Show first 10 fields
            },
            timestamp
        };
    }

    /**
     * Test Agent API connection
     * 实际调用 Agent API 验证配置是否有效
     */
    private async testAgentConnection(
        config: AgentConfig,
        timestamp: number
    ): Promise<ConfigTestResult> {
        // 验证必填字段
        if (!config.agentKey || !config.appKey) {
            throw new Error('Agent Key 和 App Key 不能为空');
        }

        // 获取 API 配置
        const apiConfig = getApiConfig();
        const baseUrl = apiConfig.services.agent.baseUrl;
        const token = getAuthHeaders()['Authorization'];

        // 构建测试请求 URL - 使用配置的 appKey
        const testUrl = `${baseUrl}/app/${config.appKey}/api/chat/completion`;

        console.log(`[ApiConfigService] Testing Agent connection:`, {
            url: testUrl,
            agentKey: config.agentKey,
            appKey: config.appKey
        });

        try {
            // 发送一个简单的测试请求
            // 不发送 agent_version，让服务器使用默认版本
            const testRequest: any = {
                agent_key: config.agentKey,
                query: '测试连接',  // 简单测试消息
                stream: false,
                history: []
            };

            // 只有当明确指定了版本且不是 'v2' 时才添加
            if (config.agentVersion && config.agentVersion !== 'v2') {
                testRequest.agent_version = config.agentVersion;
            }

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时

            const response = await fetch(testUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { 'Authorization': token } : {})
                },
                body: JSON.stringify(testRequest),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (response.ok) {
                // 尝试解析响应获取更多信息
                let responseInfo = '';
                try {
                    const data = await response.json();
                    if (data.conversation_id) {
                        responseInfo = `，会话ID: ${data.conversation_id.substring(0, 8)}...`;
                    }
                } catch {
                    // 忽略解析错误
                }

                return {
                    success: true,
                    message: `Agent API 连接成功${responseInfo}`,
                    details: {
                        agentKey: config.agentKey,
                        appKey: config.appKey,
                        agentVersion: config.agentVersion || 'latest',
                        endpoint: testUrl,
                        httpStatus: response.status
                    },
                    timestamp
                };
            } else {
                // 尝试获取错误信息
                let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
                try {
                    const errorData = await response.json();
                    if (errorData.message) {
                        errorMessage = errorData.message;
                    } else if (errorData.error) {
                        errorMessage = errorData.error;
                    }
                } catch {
                    // 忽略解析错误
                }

                return {
                    success: false,
                    message: `Agent API 连接失败: ${errorMessage}`,
                    details: {
                        agentKey: config.agentKey,
                        appKey: config.appKey,
                        endpoint: testUrl,
                        httpStatus: response.status
                    },
                    timestamp
                };
            }
        } catch (error) {
            const errorMessage = error instanceof Error
                ? (error.name === 'AbortError' ? '请求超时' : error.message)
                : '未知错误';

            return {
                success: false,
                message: `Agent API 连接失败: ${errorMessage}`,
                details: {
                    agentKey: config.agentKey,
                    appKey: config.appKey,
                    endpoint: testUrl,
                    error: errorMessage
                },
                timestamp
            };
        }
    }

    /**
     * Test Workflow API connection
     */
    private async testWorkflowConnection(
        config: WorkflowConfig,
        timestamp: number
    ): Promise<ConfigTestResult> {
        const automationBase = dipEnvironmentService.getAutomationApiBase();
        const url = `${automationBase}/dag/${config.dagId}/results?limit=1`;

        const response = await fetch(url, {
            method: 'GET',
            headers: getAuthHeaders()
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        return {
            success: true,
            message: '成功连接工作流 API',
            details: {
                dagId: config.dagId,
                workflowName: config.workflowName,
                resultsAvailable: data.results?.length || 0
            },
            timestamp
        };
    }

    // ==========================================================================
    // Utility Methods
    // ==========================================================================

    /**
     * Update configuration array (add or update)
     */
    private updateConfigArray<T extends BaseApiConfig>(array: T[], config: T): void {
        const index = array.findIndex(c => c.id === config.id);
        if (index >= 0) {
            array[index] = config;
        } else {
            array.push(config);
        }
    }

    /**
     * Get total configuration count
     */
    private getTotalConfigCount(collection: ApiConfigCollection): number {
        return (
            collection.knowledgeNetworks.length +
            collection.ontologyObjects.length +
            collection.metricModels.length +
            collection.agents.length +
            collection.workflows.length
        );
    }

    /**
     * Search configurations
     */
    searchConfigs(query: string, type?: ApiConfigType): AnyApiConfig[] {
        const all = this.getAllConfigs();
        let configs: AnyApiConfig[] = [];

        if (type) {
            configs = this.getConfigsByType(type);
        } else {
            configs = [
                ...all.knowledgeNetworks,
                ...all.ontologyObjects,
                ...all.metricModels,
                ...all.agents,
                ...all.workflows
            ];
        }

        if (!query) {
            return configs;
        }

        const lowerQuery = query.toLowerCase();
        return configs.filter(config =>
            config.name.toLowerCase().includes(lowerQuery) ||
            config.description?.toLowerCase().includes(lowerQuery) ||
            config.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
        );
    }

    /**
     * Get configurations by tag
     */
    getConfigsByTag(tag: string): AnyApiConfig[] {
        const all = this.getAllConfigs();
        const allConfigs: AnyApiConfig[] = [
            ...all.knowledgeNetworks,
            ...all.ontologyObjects,
            ...all.metricModels,
            ...all.agents,
            ...all.workflows
        ];

        return allConfigs.filter(config => config.tags?.includes(tag));
    }

    /**
     * Export configuration
     */
    exportConfig(options?: any): string {
        return this.storage.exportConfig(options);
    }

    /**
     * Import configuration
     */
    importConfig(jsonString: string, merge: boolean = false): void {
        this.storage.importConfig(jsonString, merge);
    }

    /**
     * Reset to defaults
     */
    resetToDefaults(): void {
        this.storage.resetToDefaults();
    }

    /**
     * Initialize runtime state from stored configurations.
     * This should be called on app startup to sync saved configs to runtime.
     * Particularly important for Agent appKey which is used by agentApi.ts.
     */
    initializeRuntimeState(): void {
        try {
            const configs = this.getAllConfigs();

            // Sync enabled agent config's appKey to runtime
            const enabledAgents = configs.agents.filter(a => a.enabled);
            if (enabledAgents.length > 0) {
                // Use the first enabled agent's appKey
                const primaryAgent = enabledAgents[0];
                if (primaryAgent.appKey) {
                    this.syncAgentAppKey(primaryAgent.appKey);
                    console.log(`[ApiConfigService] Initialized agent appKey from stored config: ${primaryAgent.appKey}`);
                }
            }

            // Sync enabled knowledge network config
            const enabledKnConfigs = configs.knowledgeNetworks.filter(kn => kn.enabled);
            if (enabledKnConfigs.length > 0) {
                const primaryKn = enabledKnConfigs[0];
                if (primaryKn.knowledgeNetworkId) {
                    setKnowledgeNetworkId(primaryKn.knowledgeNetworkId);
                    console.log(`[ApiConfigService] Initialized KN ID from stored config: ${primaryKn.knowledgeNetworkId}`);
                }
            }
        } catch (error) {
            console.error('[ApiConfigService] Failed to initialize runtime state:', error);
        }
    }
}

// ============================================================================
// Export Singleton
// ============================================================================

export const apiConfigService = new ApiConfigService();

// Initialize runtime state on module load
// This ensures stored configs are synced to runtime when app starts
apiConfigService.initializeRuntimeState();

export default apiConfigService;
