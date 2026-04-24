/**
 * Global Settings Type Definitions
 * 
 * Defines the data model for global application settings.
 */

export interface GlobalSettings {
    /** API 认证 Token */
    apiToken: string;

    /** API 基础 URL（可选，用于切换环境） */
    apiBaseUrl?: string;

    /** 知识网络 ID */
    knowledgeNetworkId?: string;

    /** 环境标识 */
    environment?: 'development' | 'production' | 'staging';

    /** 最后更新时间戳 */
    lastUpdated: number;
}

export interface GlobalSettingsValidationError {
    field: string;
    message: string;
}
