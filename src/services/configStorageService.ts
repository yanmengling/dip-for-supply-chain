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
    type DataViewConfig,
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
const CONFIG_VERSION = '1.0.9';

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
                console.log('[ConfigStorage] No stored configuration found, using defaults');
                return this.getDefaultConfig();
            }

            const parsed = JSON.parse(stored) as ApiConfigCollection;

            // Validate version compatibility & Migrate
            if (parsed.version !== this.version) {
                console.warn(`[ConfigStorage] Version mismatch: stored=${parsed.version}, current=${this.version}`);

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
                    }
                }

                // MIGRATION 1.0.2: Add missing workflow configurations
                if (parsed.version === '1.0.1' || !parsed.version) {
                    const defaults = this.getDefaultConfig();
                    const existingWorkflowIds = new Set(parsed.workflows?.map(wf => wf.id) || []);

                    // Add missing workflows from defaults
                    const missingWorkflows = defaults.workflows.filter(wf => !existingWorkflowIds.has(wf.id));
                    if (missingWorkflows.length > 0) {
                        parsed.workflows = [...(parsed.workflows || []), ...missingWorkflows];
                        console.log(`[ConfigStorage] Migration: Added ${missingWorkflows.length} missing workflow(s):`, missingWorkflows.map(wf => wf.name));
                    }
                }

                if (parsed.metricModels) {
                    const beforeCount = parsed.metricModels.length;
                    parsed.metricModels = parsed.metricModels.filter(mm =>
                        !mm.name.includes('(Mock)') && !mm.name.includes('（Mock）')
                    );
                    const afterCount = parsed.metricModels.length;

                    if (beforeCount > afterCount) {
                        console.log(`[ConfigStorage] Migration: Removed ${beforeCount - afterCount} mock metric model(s)`);
                    }
                }


                // MIGRATION 1.0.6: Add new metric models for inventory and graph
                if (!parsed.metricModels) parsed.metricModels = [];
                const defaults = this.getDefaultConfig();
                const newMetricIds = [
                    'mm_product_inventory_optimization_huida',
                    'mm_material_inventory_optimization_huida',
                    'mm_order_demand_huida',
                    'mm_product_count_huida',
                    'mm_material_count_huida',
                    'mm_supplier_count_huida'
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
                }

                // MIGRATION 1.0.9: Remove all Huida references from IDs
                const idMappings: Record<string, string> = {
                    // Knowledge Networks
                    'kn_huida': 'kn_supply_chain_brain',
                    // Ontology Objects
                    'oo_supplier_huida': 'oo_supplier',
                    'oo_supplier_evaluation_huida': 'oo_supplier_evaluation',
                    'oo_material_huida': 'oo_material',
                    'oo_product_huida': 'oo_product',
                    'oo_bom_huida': 'oo_bom',
                    'oo_inventory_huida': 'oo_inventory',
                    'oo_sales_order_huida': 'oo_sales_order',
                    'oo_customer_huida': 'oo_customer',
                    'oo_production_plan_huida': 'oo_production_plan',
                    // Metric Models
                    'mm_order_demand_huida': 'mm_order_demand',
                    'mm_product_count_huida': 'mm_product_count',
                    'mm_material_count_huida': 'mm_material_count',
                    'mm_supplier_count_huida': 'mm_supplier_count',
                    'mm_product_inventory_optimization_huida': 'mm_product_inventory_optimization',
                    'mm_material_inventory_optimization_huida': 'mm_material_inventory_optimization'
                };

                let migratedCount = 0;
                // Migrate all configuration arrays
                (['knowledgeNetworks', 'ontologyObjects', 'metricModels'] as const).forEach(key => {
                    if (parsed[key]) {
                        parsed[key]!.forEach((item: any) => {
                            if (idMappings[item.id]) {
                                item.id = idMappings[item.id];
                                migratedCount++;
                            }
                        });
                    }
                });

                if (migratedCount > 0) {
                    console.log(`[ConfigStorage] Migration 1.0.9: Removed Huida references from ${migratedCount} configuration IDs`);
                }

                // Update version and save immediately
                parsed.version = this.version;
                this.saveConfig(parsed);
            }

            console.log('[ConfigStorage] Loaded configuration:', {
                version: parsed.version,
                knowledgeNetworks: parsed.knowledgeNetworks.length,
                ontologyObjects: parsed.ontologyObjects?.length || 0,
                dataViews: parsed.dataViews?.length || 0,
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
            console.error('[ConfigStorage] Failed to save configuration:', error);
            throw new Error('Failed to save configuration to localStorage');
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
                exportData.dataViews = [];
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
            exportData.dataViews = exportData.dataViews?.filter(c => c.enabled) || [];
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
            exportData.dataViews = exportData.dataViews?.filter(hasMatchingTag) || [];
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
                    dataViews: this.mergeConfigs(existing.dataViews || [], imported.dataViews || []),
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
                    dataViews: imported.dataViews || [],
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

        // Check version
        if (config.version && config.version !== this.version) {
            errors.push({
                field: 'version',
                message: `Version mismatch: expected ${this.version}, got ${config.version}`,
                code: 'VERSION_MISMATCH'
            });
        }

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

        if (config.dataViews) {
            config.dataViews.forEach((dv, index) => {
                if (!dv.id || !dv.name || !dv.objectTypeId || !dv.entityType) {
                    errors.push({
                        field: `dataViews[${index}]`,
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
                    knowledgeNetworkId: 'd56v1l69olk4bpa66uv0',
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
            ontologyObjects: [
                {
                    id: 'oo_supplier',
                    type: ApiConfigType.ONTOLOGY_OBJECT,
                    name: '供应商对象',
                    description: '供应链大脑 - 供应商对象类型',
                    objectTypeId: 'd5700je9olk4bpa66vkg',
                    entityType: 'supplier',
                    enabled: true,
                    tags: ['supplier'],
                    createdAt: now,
                    updatedAt: now
                },
                {
                    id: 'oo_supplier_evaluation',
                    type: ApiConfigType.ONTOLOGY_OBJECT,
                    name: '供应商评估对象',
                    description: '供应链大脑 - 供应商评估对象类型',
                    objectTypeId: 'd5700je9olk4bpa66vkg',
                    entityType: 'supplier_evaluation',
                    enabled: true,
                    tags: ['supplier', 'evaluation'],
                    createdAt: now,
                    updatedAt: now
                },
                {
                    id: 'oo_material',
                    type: ApiConfigType.ONTOLOGY_OBJECT,
                    name: '物料对象',
                    description: '供应链大脑 - 物料对象类型',
                    objectTypeId: 'd56voju9olk4bpa66vcg', // Updated to new ID
                    entityType: 'material',
                    enabled: true,
                    tags: ['material'],
                    createdAt: now,
                    updatedAt: now
                },
                {
                    id: 'oo_product',
                    type: ApiConfigType.ONTOLOGY_OBJECT,
                    name: '产品对象',
                    description: '供应链大脑 - 产品对象类型',
                    objectTypeId: 'd56v4ue9olk4bpa66v00', // Updated to new ID
                    entityType: 'product',
                    enabled: true,
                    tags: ['product'],
                    createdAt: now,
                    updatedAt: now
                },
                {
                    id: 'oo_bom',
                    type: ApiConfigType.ONTOLOGY_OBJECT,
                    name: 'BOM对象',
                    description: '供应链大脑 - BOM对象类型',
                    objectTypeId: 'd56vqtm9olk4bpa66vfg', // Updated to new ID
                    entityType: 'bom',
                    enabled: true,
                    tags: ['bom'],
                    createdAt: now,
                    updatedAt: now
                },
                {
                    id: 'oo_inventory',
                    type: ApiConfigType.ONTOLOGY_OBJECT,
                    name: '库存对象',
                    description: '供应链大脑 - 库存对象类型',
                    objectTypeId: 'd56vcuu9olk4bpa66v3g', // Updated to new ID
                    entityType: 'inventory',
                    enabled: true,
                    tags: ['inventory'],
                    createdAt: now,
                    updatedAt: now
                },
                {
                    id: 'oo_sales_order',
                    type: ApiConfigType.ONTOLOGY_OBJECT,
                    name: '销售订单对象',
                    description: '供应链大脑 - 销售订单对象类型',
                    objectTypeId: 'd56vh169olk4bpa66v80',
                    entityType: 'sales_order',
                    enabled: true,
                    tags: ['order', 'sales', 'cockpit'],
                    createdAt: now,
                    updatedAt: now
                },
                {
                    id: 'oo_customer',
                    type: ApiConfigType.ONTOLOGY_OBJECT,
                    name: '客户对象',
                    description: '供应链大脑 - 客户对象类型',
                    objectTypeId: '2004376134633480194',
                    entityType: 'customer',
                    enabled: true,
                    tags: ['customer'],
                    createdAt: now,
                    updatedAt: now
                },
                {
                    id: 'oo_production_plan',
                    type: ApiConfigType.ONTOLOGY_OBJECT,
                    name: '工厂生产计划',
                    description: '供应链大脑 - 生产计划对象类型',
                    objectTypeId: 'd5704qm9olk4bpa66vp0',
                    entityType: 'production_plan',
                    enabled: true,
                    tags: ['production', 'plan'],
                    createdAt: now,
                    updatedAt: now
                }
            ],
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
                    agentKey: '01KEX8BP0GR6TMXQR7GE3XN16A',
                    appKey: '01KEX8BP0GR6TMXQR7GE3XN16A',
                    agentVersion: 'v2',
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
