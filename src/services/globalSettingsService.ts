/**
 * Global Settings Service
 *
 * Manages global application settings using localStorage.
 * In DIP mode, token is managed by the platform.
 */

import type { GlobalSettings, GlobalSettingsValidationError } from '../types/globalSettings';
import { dipEnvironmentService } from './dipEnvironmentService';

const STORAGE_KEY = 'supply_chain_global_settings';
const DEFAULT_TOKEN = 'ory_at_eUV5LdKEBbhNINlTSLTlnVlApKMQo3zpYF4zzoK5vWk.hU03-W389ctdeEPcUC-DcbnwoTp6fZkni-vE7V88-Es';
const DEFAULT_KN_ID = 'd56v1l69olk4bpa66uv0'; // Default for huida-new environment

class GlobalSettingsService {
    /**
     * Load settings from localStorage
     */
    loadSettings(): GlobalSettings {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);

            if (!stored) {
                console.log('[GlobalSettings] No stored settings found, using defaults');
                return this.getDefaultSettings();
            }

            const parsed = JSON.parse(stored) as GlobalSettings;
            console.log('[GlobalSettings] Loaded settings from localStorage');
            return parsed;
        } catch (error) {
            console.error('[GlobalSettings] Failed to load settings:', error);
            return this.getDefaultSettings();
        }
    }

    /**
     * Save settings to localStorage
     */
    saveSettings(settings: GlobalSettings): void {
        try {
            settings.lastUpdated = Date.now();
            const serialized = JSON.stringify(settings);
            localStorage.setItem(STORAGE_KEY, serialized);
            console.log('[GlobalSettings] Settings saved successfully');
        } catch (error) {
            console.error('[GlobalSettings] Failed to save settings:', error);
            throw new Error('Failed to save settings to localStorage');
        }
    }

    /**
     * Get API Token
     * Priority: DIP injected token > localStorage > settings
     */
    getApiToken(): string {
        // Priority 1: DIP injected token (when running in DIP container)
        if (dipEnvironmentService.isDipMode()) {
            const dipToken = dipEnvironmentService.getToken();
            if (dipToken) {
                console.log('[GlobalSettings] Using DIP injected token');
                return dipToken;
            }
            // DIP mode but token unavailable, log warning and continue to fallback
            console.warn('[GlobalSettings] DIP mode active but token unavailable, using fallback');
        }

        // Priority 2: Read from api_auth_token (same key as apiConfig.getAuthToken())
        const apiToken = localStorage.getItem('api_auth_token');
        if (apiToken) {
            return apiToken;
        }

        // Priority 3: Fallback to settings
        const settings = this.loadSettings();
        return settings.apiToken;
    }

    /**
     * Update API Token
     * Syncs to both settings and api_auth_token key
     */
    updateApiToken(token: string): void {
        const settings = this.loadSettings();
        settings.apiToken = token;
        this.saveSettings(settings);

        // Sync to api_auth_token (the key that apiConfig.getAuthToken() reads)
        localStorage.setItem('api_auth_token', token);
    }



    /**
     * Get Knowledge Network ID
     */
    getKnowledgeNetworkId(): string {
        const settings = this.loadSettings();
        return settings.knowledgeNetworkId || DEFAULT_KN_ID;
    }

    /**
     * Update Knowledge Network ID
     */
    updateKnowledgeNetworkId(knId: string): void {
        const settings = this.loadSettings();
        settings.knowledgeNetworkId = knId;
        this.saveSettings(settings);
    }

    /**
     * Validate settings
     */
    validateSettings(settings: Partial<GlobalSettings>): GlobalSettingsValidationError[] {
        const errors: GlobalSettingsValidationError[] = [];

        if (settings.apiToken !== undefined) {
            if (!settings.apiToken || settings.apiToken.trim().length === 0) {
                errors.push({
                    field: 'apiToken',
                    message: 'API Token 不能为空'
                });
            } else if (settings.apiToken.length < 10) {
                errors.push({
                    field: 'apiToken',
                    message: 'API Token 格式无效（长度过短）'
                });
            }
        }



        if (settings.knowledgeNetworkId !== undefined) {
            if (!settings.knowledgeNetworkId || settings.knowledgeNetworkId.trim().length === 0) {
                errors.push({
                    field: 'knowledgeNetworkId',
                    message: '知识网络 ID 不能为空'
                });
            }
        }

        return errors;
    }

    /**
     * Reset to default settings
     */
    resetToDefaults(): void {
        const defaults = this.getDefaultSettings();
        this.saveSettings(defaults);
        console.log('[GlobalSettings] Settings reset to defaults');
    }

    /**
     * Clear all settings
     */
    clearSettings(): void {
        localStorage.removeItem(STORAGE_KEY);
        console.log('[GlobalSettings] Settings cleared');
    }

    /**
     * Get default settings
     */
    private getDefaultSettings(): GlobalSettings {
        return {
            apiToken: DEFAULT_TOKEN,
            knowledgeNetworkId: DEFAULT_KN_ID,
            environment: 'production',
            lastUpdated: Date.now()
        };
    }

    /**
     * Test API connection with current token
     */
    async testConnection(): Promise<{ success: boolean; message: string }> {
        try {
            const token = this.getApiToken();

            const knId = this.getKnowledgeNetworkId() || 'd56v1l69olk4bpa66uv0';

            // Test with ontology endpoint (more reliable than metric health check)
            // Use proxy-manager which maps to /api/ontology-manager
            const response = await fetch(`/proxy-manager/knowledge-networks/${knId}/object-types?limit=1`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                return {
                    success: true,
                    message: 'API 连接成功'
                };
            } else {
                return {
                    success: false,
                    message: `连接失败: HTTP ${response.status}`
                };
            }
        } catch (error) {
            return {
                success: false,
                message: error instanceof Error ? error.message : '连接测试失败'
            };
        }
    }
}

export const globalSettingsService = new GlobalSettingsService();
export default globalSettingsService;
