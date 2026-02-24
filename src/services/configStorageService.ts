/**
 * Configuration Storage Service
 * 
 * Handles persistence of API configurations using localStorage.
 * Provides load, save, import, export, and validation functionality.
 */

import {
    ApiConfigType,
    type ApiConfigCollection,
    type KnowledgeNetworkConfig,
    type OntologyObjectConfig,
    type MetricModelConfig,
    type AgentConfig,
    type WorkflowConfig,
    type ConfigImportExportOptions,
    type ConfigValidationError
} from '../types/apiConfig';

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = 'supply_chain_api_config_collection';
const CONFIG_VERSION = '1.0.10';

// ============================================================================
// Configuration Storage Service
// ============================================================================

class ConfigStorageService {
    private readonly storageKey = STORAGE_KEY;
    private readonly version = CONFIG_VERSION;

    /**
     * Load configuration from localStorage
     */
    loadConfig(): ApiConfigCollection {
        try {
            const stored = localStorage.getItem(this.storageKey);

            if (!stored) {
                console.log('[ConfigStorage] No stored configuration found, initializing with defaults');
                const defaultConfig = this.getDefaultConfig();
                this.saveConfig(defaultConfig);
                return defaultConfig;
            }

            const parsed = JSON.parse(stored) as ApiConfigCollection;
            let needsSave = false;

            // Validate version compatibility & Migrate
            if (parsed.version !== this.version) {
                console.warn(`[ConfigStorage] Version mismatch: stored=${parsed.version}, current=${this.version}`);

                // Cache default config to avoid multiple calls
                const defaults = this.getDefaultConfig();

                // MIGRATION 1.0.1: Remove legacy 'Default Supply Chain Network'
                if (parsed.knowledgeNetworks) {
                    const beforeCount = parsed.knowledgeNetworks.length;
                    parsed.knowledgeNetworks = parsed.knowledgeNetworks.filter(kn =>
                        kn.name !== '默认供应链网络' &&
                        kn.id !== 'kn_default'
                    );
                    const afterCount = parsed.knowledgeNetworks.length;

                    if (beforeCount > afterCount) {
                        console.log('[ConfigStorage] Migration: Removed legacy knowledge networks');
                        needsSave = true;
                    }
                }

                // MIGRATION 1.0.2: Add missing workflow configurations
                if (parsed.version === '1.0.1' || !parsed.version) {
                    const existingWorkflowIds = new Set(parsed.workflows?.map(wf => wf.id) || []);

                    // Add missing workflows from defaults
                    const missingWorkflows = defaults.workflows.filter(wf => !existingWorkflowIds.has(wf.id));
                    if (missingWorkflows.length > 0) {
                        parsed.workflows = [...(parsed.workflows || []), ...missingWorkflows];
                        console.log(`[ConfigStorage] Migration: Added ${missingWorkflows.length} missing workflow(s):`, missingWorkflows.map(wf => wf.name));
                        needsSave = true;
                    }
                }

                // MIGRATION: Remove mock metric models
                if (parsed.metricModels) {
                    const beforeCount = parsed.metricModels.length;
                    parsed.metricModels = parsed.metricModels.filter(mm =>
                        !mm.name.includes('(Mock)') && !mm.name.includes('（Mock）')
                    );
                    const afterCount = parsed.metricModels.length;

                    if (beforeCount > afterCount) {
                        console.log(`[ConfigStorage] Migration: Removed ${beforeCount - afterCount} mock metric model(s)`);
                        needsSave = true;
                    }
                }

                // MIGRATION: Add new metric models if missing
                if (!parsed.metricModels) {
                    parsed.metricModels = [];
                }

                const newMetricIds = [
                    'mm_product_inventory_optimization',
                    'mm_material_inventory_optimization',
                    'mm_order_demand',
                    'mm_product_count',
                    'mm_material_count',
                    'mm_supplier_count'
                ];

                let addedMetrics = 0;
                newMetricIds.forEach(id => {
                    const exists = parsed.metricModels?.some(m => m.id === id);
                    if (!exists) {
                        const config = defaults.metricModels?.find(m => m.id === id);
                        if (config) {
                            parsed.metricModels!.push(config);
                            addedMetrics++;
                        }
                    }
                });

                if (addedMetrics > 0) {
                    console.log(`[ConfigStorage] Migration: Added ${addedMetrics} new metric models`);
                    needsSave = true;
                }

                // Ensure ontologyObjects exists and contains all default objects
                if (!parsed.ontologyObjects) {
                    parsed.ontologyObjects = defaults.ontologyObjects;
                    needsSave = true;
                } else {
                    // MIGRATION: Add missing ontology object configurations
                    const existingOntologyIds = new Set(parsed.ontologyObjects.map(oo => oo.id));
                    const missingOntologyObjects = defaults.ontologyObjects.filter(oo => !existingOntologyIds.has(oo.id));
                    if (missingOntologyObjects.length > 0) {
                        parsed.ontologyObjects = [...parsed.ontologyObjects, ...missingOntologyObjects];
                        console.log(`[ConfigStorage] Migration: Added ${missingOntologyObjects.length} missing ontology object(s):`, missingOntologyObjects.map(oo => oo.name));
                        needsSave = true;
                    }
                }

                // MIGRATION 1.0.9: Add purchase order and purchase request configs if missing
                const newOntologyObjectIds = ['oo_purchase_order', 'oo_purchase_request'];
                let addedOntologyObjects = 0;

                newOntologyObjectIds.forEach(id => {
                    const exists = parsed.ontologyObjects?.some(o => o.id === id);
                    if (!exists) {
                        const config = defaults.ontologyObjects?.find(o => o.id === id);
                        if (config) {
                            parsed.ontologyObjects!.push(config);
                            addedOntologyObjects++;
                        }
                    }
                });

                if (addedOntologyObjects > 0) {
                    console.log(`[ConfigStorage] Migration: Added ${addedOntologyObjects} new ontology object configs (purchase order/request)`);
                    needsSave = true;
                }

                // Update version
                parsed.version = this.version;
                needsSave = true;
            }

            // Save migrated configuration if needed
            if (needsSave) {
                this.saveConfig(parsed);
                console.log('[ConfigStorage] Migrated configuration saved');
            }

            console.log('[ConfigStorage] Loaded configuration:', {
                version: parsed.version,
                knowledgeNetworks: parsed.knowledgeNetworks.length,
                ontologyObjects: parsed.ontologyObjects?.length || 0,
                metricModels: parsed.metricModels.length,
                agents: parsed.agents.length,
                workflows: parsed.workflows.length
            });

            return parsed;
        } catch (error) {
            console.error('[ConfigStorage] Failed to load configuration:', error);
            return this.getDefaultConfig();
        }
    }

    /**
     * Save configuration to localStorage
     */
    saveConfig(config: ApiConfigCollection): void {
        try {
            config.version = this.version;
            config.lastUpdated = Date.now();

            const serialized = JSON.stringify(config);
            localStorage.setItem(this.storageKey, serialized);

            console.log('[ConfigStorage] Configuration saved successfully');
        } catch (error) {
            if (error instanceof DOMException && error.name === 'QuotaExceededError') {
                console.error('[ConfigStorage] Storage quota exceeded');
                throw new Error('Storage quota exceeded. Please free up space or reduce configuration size.');
            }
            console.error('[ConfigStorage] Failed to save configuration:', error);
            throw new Error('Failed to save configuration to localStorage');
        }
    }

    /**
     * Sync ontology object configurations from backend API
     * This method fetches the latest object types from the backend and updates localStorage
     */
    async syncFromBackend(): Promise<void> {
        try {
            console.log('[ConfigStorage] Syncing configuration from backend...');

            // Dynamically import to avoid circular dependency
            const { dynamicConfigService } = await import('./dynamicConfigService');

            // Get current configuration
            const config = this.loadConfig();

            // Fetch object types from backend
            const backendConfigs = await dynamicConfigService.getObjectTypeConfigs();

            console.log(`[ConfigStorage] Fetched ${backendConfigs.length} object type configs from backend`);

            // Update ontologyObjects with backend data
            config.ontologyObjects = backendConfigs;

            // Save updated configuration
            this.saveConfig(config);

            console.log('[ConfigStorage] Configuration synced successfully');
        } catch (error) {
            console.error('[ConfigStorage] Failed to sync from backend:', error);
            throw error;
        }
    }


    /**
     * Export configuration as JSON string
     */
    exportConfig(options?: ConfigImportExportOptions): string {
        const config = this.loadConfig();
        let exportData: Partial<ApiConfigCollection> = { ...config };

        // Apply filters
        if (options?.types && options.types.length > 0) {
            const types = new Set(options.types);

            if (!types.has(ApiConfigType.KNOWLEDGE_NETWORK)) {
                exportData.knowledgeNetworks = [];
            }
            if (!types.has(ApiConfigType.ONTOLOGY_OBJECT)) {
                exportData.ontologyObjects = [];
            }
            if (!types.has(ApiConfigType.METRIC_MODEL)) {
                exportData.metricModels = [];
            }
            if (!types.has(ApiConfigType.AGENT)) {
                exportData.agents = [];
            }
            if (!types.has(ApiConfigType.WORKFLOW)) {
                exportData.workflows = [];
            }
        }

        // Filter by enabled status
        if (!options?.includeDisabled) {
            exportData.knowledgeNetworks = exportData.knowledgeNetworks?.filter(c => c.enabled) || [];
            exportData.ontologyObjects = exportData.ontologyObjects?.filter(c => c.enabled) || [];
            exportData.metricModels = exportData.metricModels?.filter(c => c.enabled) || [];
            exportData.agents = exportData.agents?.filter(c => c.enabled) || [];
            exportData.workflows = exportData.workflows?.filter(c => c.enabled) || [];
        }

        // Filter by tags
        if (options?.tags && options.tags.length > 0) {
            const tagSet = new Set(options.tags);
            const hasMatchingTag = (config: { tags?: string[] }) =>
                config.tags?.some(tag => tagSet.has(tag)) || false;

            exportData.knowledgeNetworks = exportData.knowledgeNetworks?.filter(hasMatchingTag) || [];
            exportData.ontologyObjects = exportData.ontologyObjects?.filter(hasMatchingTag) || [];
            exportData.metricModels = exportData.metricModels?.filter(hasMatchingTag) || [];
            exportData.agents = exportData.agents?.filter(hasMatchingTag) || [];
            exportData.workflows = exportData.workflows?.filter(hasMatchingTag) || [];
        }

        const indent = options?.prettyPrint ? 2 : 0;
        return JSON.stringify(exportData, null, indent);
    }

    /**
     * Import configuration from JSON string
     */
    importConfig(jsonString: string, merge: boolean = false): void {
        try {
            const imported = JSON.parse(jsonString) as Partial<ApiConfigCollection>;

            // Validate imported data
            const errors = this.validateConfig(imported);
            if (errors.length > 0) {
                throw new Error(`Configuration validation failed: ${errors.map(e => e.message).join(', ')}`);
            }

            if (merge) {
                // Merge with existing configuration
                const existing = this.loadConfig();
                const merged: ApiConfigCollection = {
                    knowledgeNetworks: this.mergeConfigs(existing.knowledgeNetworks, imported.knowledgeNetworks || []),
                    ontologyObjects: this.mergeConfigs(existing.ontologyObjects, imported.ontologyObjects || []),
                    metricModels: this.mergeConfigs(existing.metricModels, imported.metricModels || []),
                    agents: this.mergeConfigs(existing.agents, imported.agents || []),
                    workflows: this.mergeConfigs(existing.workflows, imported.workflows || []),
                    version: this.version,
                    lastUpdated: Date.now()
                };
                this.saveConfig(merged);
            } else {
                // Replace entire configuration
                const newConfig: ApiConfigCollection = {
                    knowledgeNetworks: imported.knowledgeNetworks || [],
                    ontologyObjects: imported.ontologyObjects || [],
                    metricModels: imported.metricModels || [],
                    agents: imported.agents || [],
                    workflows: imported.workflows || [],
                    version: this.version,
                    lastUpdated: Date.now()
                };
                this.saveConfig(newConfig);
            }

            console.log('[ConfigStorage] Configuration imported successfully');
        } catch (error) {
            console.error('[ConfigStorage] Failed to import configuration:', error);
            throw error;
        }
    }

    /**
     * Clear all stored configuration
     */
    clearConfig(): void {
        localStorage.removeItem(this.storageKey);
        console.log('[ConfigStorage] Configuration cleared');
    }

    /**
     * Reset to default configuration
     */
    resetToDefaults(): void {
        const defaults = this.getDefaultConfig();
        this.saveConfig(defaults);
        console.log('[ConfigStorage] Configuration reset to defaults');
    }

    /**
     * Validate configuration data
     */
    validateConfig(config: Partial<ApiConfigCollection>): ConfigValidationError[] {
        const errors: ConfigValidationError[] = [];

        // Note: Version checking removed as loadConfig handles migration automatically

        // Validate each configuration array
        if (config.knowledgeNetworks) {
            config.knowledgeNetworks.forEach((kn, index) => {
                if (!kn.id || !kn.name || !kn.knowledgeNetworkId) {
                    errors.push({
                        field: `knowledgeNetworks[${index}]`,
                        message: 'Missing required fields: id, name, or knowledgeNetworkId',
                        code: 'MISSING_REQUIRED_FIELD'
                    });
                }
            });
        }

        if (config.ontologyObjects) {
            config.ontologyObjects.forEach((oo, index) => {
                if (!oo.id || !oo.name || !oo.objectTypeId || !oo.entityType) {
                    errors.push({
                        field: `ontologyObjects[${index}]`,
                        message: 'Missing required fields: id, name, objectTypeId, or entityType',
                        code: 'MISSING_REQUIRED_FIELD'
                    });
                }
            });
        }

        if (config.metricModels) {
            config.metricModels.forEach((mm, index) => {
                if (!mm.id || !mm.name || !mm.modelId) {
                    errors.push({
                        field: `metricModels[${index}]`,
                        message: 'Missing required fields: id, name, or modelId',
                        code: 'MISSING_REQUIRED_FIELD'
                    });
                }
            });
        }

        if (config.agents) {
            config.agents.forEach((agent, index) => {
                if (!agent.id || !agent.name || !agent.agentKey || !agent.appKey) {
                    errors.push({
                        field: `agents[${index}]`,
                        message: 'Missing required fields: id, name, agentKey, or appKey',
                        code: 'MISSING_REQUIRED_FIELD'
                    });
                }
            });
        }

        if (config.workflows) {
            config.workflows.forEach((wf, index) => {
                if (!wf.id || !wf.name || !wf.dagId) {
                    errors.push({
                        field: `workflows[${index}]`,
                        message: 'Missing required fields: id, name, or dagId',
                        code: 'MISSING_REQUIRED_FIELD'
                    });
                }
            });
        }

        return errors;
    }

    /**
     * Get default configuration
     * Migrates from existing hardcoded values
     */
    private getDefaultConfig(): ApiConfigCollection {
        const now = Date.now();

        return {
            knowledgeNetworks: [
                {
                    id: 'kn_supply_chain_brain',
                    type: ApiConfigType.KNOWLEDGE_NETWORK,
                    name: '供应链大脑网络',
                    description: '供应链大脑标准业务环境',
                    knowledgeNetworkId: 'supplychain_hd0202',
                    enabled: true,
                    objectTypes: {
                        supplier: { id: 'supplier', name: '供应商', icon: 'Users' },
                        material: { id: 'material', name: '物料', icon: 'Package' },
                        product: { id: 'product', name: '产品', icon: 'Box' },
                        factory: { id: 'factory', name: '工厂', icon: 'Factory' },
                        warehouse: { id: 'warehouse', name: '仓库', icon: 'Warehouse' },
                        order: { id: 'order', name: '订单', icon: 'ShoppingCart' },
                        customer: { id: 'customer', name: '客户', icon: 'Award' }
                    },
                    tags: ['brain', 'default'],
                    createdAt: now,
                    updatedAt: now
                }
            ],
            // ============================================================
            // Ontology Objects - 完全动态加载
            // ============================================================
            // 注意: 对象类型配置现在完全从后端 API 动态获取
            // 使用 dynamicConfigService.getObjectTypeConfigs() 获取最新配置
            // 不再使用硬编码配置,确保数据源唯一性
            ontologyObjects: [],

            // ============================================================
            // Metric Models - 保留最小化配置
            // ============================================================
            metricModels: [

                // 供应链图谱指标 - API 模式
                {
                    id: 'mm_order_demand_count_api',
                    type: ApiConfigType.METRIC_MODEL,
                    name: '订单需求数量',
                    description: '供应链图谱 - 订单需求总数统计',
                    modelId: 'd58fu5lg5lk40hvh48kg',
                    groupName: '供应链图谱',
                    modelName: '订单需求数',
                    unit: '个',
                    enabled: true,
                    tags: ['graph', 'order'],
                    createdAt: now,
                    updatedAt: now
                },
                {
                    id: 'mm_product_count_api',
                    type: ApiConfigType.METRIC_MODEL,
                    name: '产品数量',
                    description: '供应链图谱 - 产品总数统计',
                    modelId: 'd58fv0lg5lk40hvh48l0',
                    groupName: '供应链图谱',
                    modelName: '产品数',
                    unit: '个',
                    enabled: true,
                    tags: ['graph', 'product'],
                    createdAt: now,
                    updatedAt: now
                },
                {
                    id: 'mm_material_count_api',
                    type: ApiConfigType.METRIC_MODEL,
                    name: '物料数量',
                    description: '供应链图谱 - 物料总数统计',
                    modelId: 'd58g085g5lk40hvh48lg',
                    groupName: '供应链图谱',
                    modelName: '物料数',
                    unit: '个',
                    enabled: true,
                    tags: ['graph', 'material'],
                    createdAt: now,
                    updatedAt: now
                },
                {
                    id: 'mm_supplier_count_api',
                    type: ApiConfigType.METRIC_MODEL,
                    name: '供应商数量',
                    description: '供应链图谱 - 供应商总数统计',
                    modelId: 'd58g53lg5lk40hvh48m0',
                    groupName: '供应链图谱',
                    modelName: '供应商数',
                    unit: '个',
                    enabled: true,
                    tags: ['graph', 'supplier'],
                    createdAt: now,
                    updatedAt: now
                },
                {
                    id: 'mm_product_inventory_detail',
                    type: ApiConfigType.METRIC_MODEL,
                    name: '产品库存分析明细',
                    description: '供应链图谱 - 产品库存分析明细（带维度）',
                    modelId: 'd58keb5g5lk40hvh48og',
                    groupName: '供应链图谱',
                    modelName: '产品库存明细',
                    unit: '个',
                    enabled: true,
                    tags: ['graph', 'inventory', 'product'],
                    createdAt: now,
                    updatedAt: now
                },

                // 库存优化指标
                {
                    id: 'mm_product_inventory_optimization',
                    type: ApiConfigType.METRIC_MODEL,
                    name: '产品库存优化模型',
                    description: '库存优化 - 产品库存分析核心模型',
                    modelId: 'd58keb5g5lk40hvh48og',
                    groupName: '库存优化',
                    modelName: '产品库存优化',
                    unit: '个',
                    enabled: true,
                    tags: ['inventory', 'product', 'optimization'],
                    createdAt: now,
                    updatedAt: now
                },
                {
                    id: 'mm_material_inventory_optimization',
                    type: ApiConfigType.METRIC_MODEL,
                    name: '物料库存优化模型',
                    description: '库存优化 - 物料库存分析核心模型',
                    modelId: 'd58ihclg5lk40hvh48mg',
                    groupName: '库存优化',
                    modelName: '物料库存优化',
                    unit: '个',
                    enabled: true,
                    tags: ['inventory', 'material', 'optimization'],
                    createdAt: now,
                    updatedAt: now
                },

                // 供应链图谱指标 (新命名规范)
                {
                    id: 'mm_order_demand',
                    type: ApiConfigType.METRIC_MODEL,
                    name: '订单需求指标',
                    description: '供应链图谱 - 订单需求统计',
                    modelId: 'd58fu5lg5lk40hvh48kg',
                    groupName: '供应链图谱',
                    modelName: '订单需求',
                    unit: '个',
                    enabled: true,
                    tags: ['graph', 'order'],
                    createdAt: now,
                    updatedAt: now
                },
                {
                    id: 'mm_product_count',
                    type: ApiConfigType.METRIC_MODEL,
                    name: '产品数量指标',
                    description: '供应链图谱 - 产品数量统计',
                    modelId: 'd58fv0lg5lk40hvh48l0',
                    groupName: '供应链图谱',
                    modelName: '产品数量',
                    unit: '个',
                    enabled: true,
                    tags: ['graph', 'product'],
                    createdAt: now,
                    updatedAt: now
                },
                {
                    id: 'mm_material_count',
                    type: ApiConfigType.METRIC_MODEL,
                    name: '物料数量指标',
                    description: '供应链图谱 - 物料数量统计',
                    modelId: 'd58g085g5lk40hvh48lg',
                    groupName: '供应链图谱',
                    modelName: '物料数量',
                    unit: '个',
                    enabled: true,
                    tags: ['graph', 'material'],
                    createdAt: now,
                    updatedAt: now
                },
                {
                    id: 'mm_supplier_count',
                    type: ApiConfigType.METRIC_MODEL,
                    name: '供应商数量指标',
                    description: '供应链图谱 - 供应商数量统计',
                    modelId: 'd58g53lg5lk40hvh48m0',
                    groupName: '供应链图谱',
                    modelName: '供应商数量',
                    unit: '个',
                    enabled: true,
                    tags: ['graph', 'supplier'],
                    createdAt: now,
                    updatedAt: now
                }
            ],
            agents: [
                {
                    id: 'agent_supply_chain',
                    type: ApiConfigType.AGENT,
                    name: '供应链智能助手',
                    description: '供应链大脑 AI 助手',
                    agentKey: '01KFT0E68A1RES94ZV6DA131X4',
                    appKey: '01KFT0E68A1RES94ZV6DA131X4',
                    agentVersion: '',  // 留空让服务器使用默认版本
                    enabled: true,
                    enableStreaming: true,
                    enableHistory: true,
                    tags: ['default', 'assistant'],
                    createdAt: now,
                    updatedAt: now
                }
            ],
            workflows: [
                {
                    id: 'wf_ai_analysis',
                    type: ApiConfigType.WORKFLOW,
                    name: 'AI 分析工作流',
                    description: '供应链 AI 智能分析工作流',
                    dagId: '600565437910010238',
                    triggerType: 'manual' as const,
                    enabled: true,
                    tags: ['ai', 'analysis', 'cockpit'],
                    createdAt: now,
                    updatedAt: now
                },
                {
                    id: 'wf_inventory_ai_analysis',
                    type: ApiConfigType.WORKFLOW,
                    name: '库存优化 AI 分析工作流',
                    description: '库存优化专用 AI 智能分析工作流',
                    dagId: '602192728104683735',
                    triggerType: 'manual' as const,
                    enabled: true,
                    tags: ['ai', 'analysis', 'inventory'],
                    createdAt: now,
                    updatedAt: now
                }
            ],
            version: this.version,
            lastUpdated: now
        };
    }

    /**
     * Merge configuration arrays (by ID)
     */
    private mergeConfigs<T extends { id: string }>(existing: T[], imported: T[]): T[] {
        const merged = [...existing];
        const existingIds = new Set(existing.map(c => c.id));

        for (const config of imported) {
            if (existingIds.has(config.id)) {
                // Update existing
                const index = merged.findIndex(c => c.id === config.id);
                merged[index] = config;
            } else {
                // Add new
                merged.push(config);
            }
        }

        return merged;
    }
}

// ============================================================================
// Export Singleton
// ============================================================================

export const configStorageService = new ConfigStorageService();
export default configStorageService;
