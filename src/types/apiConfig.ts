/**
 * API Configuration Type Definitions
 * 
 * Defines the data models for managing all API configurations in the admin backend.
 * Supports: Knowledge Network, Data View, Metric Model, Agent, and Workflow APIs.
 */

// ============================================================================
// Enums
// ============================================================================

/**
 * API Configuration Type Enum
 */
export enum ApiConfigType {
    KNOWLEDGE_NETWORK = 'knowledge_network',
    DATA_VIEW = 'data_view',
    METRIC_MODEL = 'metric_model',
    AGENT = 'agent',
    WORKFLOW = 'workflow'
}

/**
 * Workflow Trigger Type
 */
export enum WorkflowTriggerType {
    MANUAL = 'manual',
    SCHEDULED = 'scheduled',
    EVENT = 'event'
}

/**
 * Chat Mode for Agent
 */
export enum AgentChatMode {
    NORMAL = 'normal',
    DEEP_THINKING = 'deep_thinking'
}

/**
 * Metric Type
 */
export enum MetricType {
    ATOMIC = 'atomic',
    COMPLEX = 'complex'
}

// ============================================================================
// Base Configuration Interface
// ============================================================================

/**
 * Base API Configuration Interface
 * All specific configuration types extend this interface
 */
export interface BaseApiConfig {
    /** Unique configuration ID */
    id: string;

    /** Configuration type */
    type: ApiConfigType;

    /** Configuration name */
    name: string;

    /** Description */
    description?: string;

    /** Whether this configuration is enabled */
    enabled: boolean;

    /** Tags for categorization */
    tags?: string[];

    /** Creation timestamp (unix milliseconds) */
    createdAt: number;

    /** Last update timestamp (unix milliseconds) */
    updatedAt: number;
}

// ============================================================================
// Knowledge Network Configuration
// ============================================================================

/**
 * Object Type Mapping
 */
export interface ObjectTypeMapping {
    /** Object type ID */
    id: string;

    /** Display name */
    name: string;

    /** Description */
    description?: string;

    /** Icon name */
    icon?: string;

    /** Color */
    color?: string;
}

/**
 * Relation Type Mapping
 */
export interface RelationTypeMapping {
    /** Relation type ID */
    id: string;

    /** Display name */
    name: string;

    /** Description */
    description?: string;

    /** Source object type ID */
    sourceObjectTypeId?: string;

    /** Target object type ID */
    targetObjectTypeId?: string;
}

/**
 * Knowledge Network Configuration
 */
export interface KnowledgeNetworkConfig extends BaseApiConfig {
    type: ApiConfigType.KNOWLEDGE_NETWORK;

    /** Knowledge Network ID */
    knowledgeNetworkId: string;

    /** Object type mappings */
    objectTypes: Record<string, ObjectTypeMapping>;

    /** Relation type mappings */
    relationTypes?: Record<string, RelationTypeMapping>;
}

// ============================================================================
// Data View Configuration
// ============================================================================

/**
 * Data View Configuration
 */
export interface DataViewConfig extends BaseApiConfig {
    type: ApiConfigType.DATA_VIEW;

    /** Data View ID */
    viewId: string;

    /** Entity type (supplier, material, product, etc.) */
    entityType: string;

    /** Field list to query */
    fields?: string[];

    /** Default filter conditions */
    filters?: any[];

    /** Default sort field */
    sortField?: string;

    /** Default sort direction */
    sortDirection?: 'asc' | 'desc';
}

// ============================================================================
// Metric Model Configuration
// ============================================================================

/**
 * Metric Model Configuration
 */
export interface MetricModelConfig extends BaseApiConfig {
    type: ApiConfigType.METRIC_MODEL;

    /** Metric Model ID */
    modelId: string;

    /** Group name */
    groupName?: string;

    /** Model name */
    modelName?: string;

    /** Unit */
    unit?: string;

    /** Metric type */
    metricType?: MetricType;

    /** Analysis dimensions */
    analysisDimensions?: string[];

    /** Default time range (in days) */
    defaultTimeRange?: number;

    /** Default step (e.g., '1d', '1h', '1M') */
    defaultStep?: string;
}

// ============================================================================
// Agent Configuration
// ============================================================================

/**
 * Agent Configuration
 */
export interface AgentConfig extends BaseApiConfig {
    type: ApiConfigType.AGENT;

    /** Agent Key */
    agentKey: string;

    /** Agent Version */
    agentVersion?: string;

    /** App Key */
    appKey: string;

    /** Chat mode */
    chatMode?: AgentChatMode;

    /** Max tokens */
    maxTokens?: number;

    /** Temperature (0-1) */
    temperature?: number;

    /** Top P (0-1) */
    topP?: number;

    /** Enable streaming */
    enableStreaming?: boolean;

    /** Enable history */
    enableHistory?: boolean;
}

// ============================================================================
// Workflow Configuration
// ============================================================================

/**
 * Workflow Configuration
 */
export interface WorkflowConfig extends BaseApiConfig {
    type: ApiConfigType.WORKFLOW;

    /** DAG ID */
    dagId: string;

    /** Workflow name */
    workflowName?: string;

    /** Trigger type */
    triggerType?: WorkflowTriggerType;

    /** Schedule (cron expression for scheduled workflows) */
    schedule?: string;

    /** Default parameters */
    parameters?: Record<string, any>;

    /** Timeout (in seconds) */
    timeout?: number;

    /** Max retries */
    maxRetries?: number;
}

// ============================================================================
// Configuration Collection
// ============================================================================

/**
 * API Configuration Collection
 * Contains all configurations organized by type
 */
export interface ApiConfigCollection {
    /** Knowledge Network configurations */
    knowledgeNetworks: KnowledgeNetworkConfig[];

    /** Data View configurations */
    dataViews: DataViewConfig[];

    /** Metric Model configurations */
    metricModels: MetricModelConfig[];

    /** Agent configurations */
    agents: AgentConfig[];

    /** Workflow configurations */
    workflows: WorkflowConfig[];

    /** Configuration schema version */
    version: string;

    /** Last update timestamp */
    lastUpdated: number;
}

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Configuration type union
 */
export type AnyApiConfig =
    | KnowledgeNetworkConfig
    | DataViewConfig
    | MetricModelConfig
    | AgentConfig
    | WorkflowConfig;

/**
 * Configuration test result
 */
export interface ConfigTestResult {
    /** Whether the test succeeded */
    success: boolean;

    /** Result message */
    message: string;

    /** Additional details */
    details?: any;

    /** Test timestamp */
    timestamp: number;
}

/**
 * Configuration validation error
 */
export interface ConfigValidationError {
    /** Field name */
    field: string;

    /** Error message */
    message: string;

    /** Error code */
    code?: string;
}

/**
 * Configuration import/export options
 */
export interface ConfigImportExportOptions {
    /** Include disabled configurations */
    includeDisabled?: boolean;

    /** Filter by configuration types */
    types?: ApiConfigType[];

    /** Filter by tags */
    tags?: string[];

    /** Pretty print JSON */
    prettyPrint?: boolean;
}
