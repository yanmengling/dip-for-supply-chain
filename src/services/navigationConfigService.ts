/**
 * Navigation Config Service
 *
 * Manages navigation section visibility configuration using localStorage.
 */

import type { NavigationConfig, NavigationSectionConfig, NavViewId } from '../types/navigationConfig';
import { DEFAULT_NAVIGATION_SECTIONS } from '../types/navigationConfig';

const STORAGE_KEY = 'supply_chain_navigation_config';

class NavigationConfigService {
  /**
   * Load configuration from localStorage
   */
  loadConfig(): NavigationConfig {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);

      if (!stored) {
        return this.getDefaultConfig();
      }

      const parsed = JSON.parse(stored) as NavigationConfig;

      // Merge with defaults to handle new sections added in future
      const defaultIds = new Set(DEFAULT_NAVIGATION_SECTIONS.map((s) => s.id));
      const mergedSections: NavigationSectionConfig[] = DEFAULT_NAVIGATION_SECTIONS.map((def) => {
        const saved = parsed.sections?.find((s) => s.id === def.id);
        return saved
          ? { ...def, enabled: saved.enabled, label: saved.label?.trim() || def.label }
          : { ...def };
      });

      // Add any saved sections not in defaults (for backward compat)
      parsed.sections?.forEach((s) => {
        if (!defaultIds.has(s.id as NavViewId)) {
          mergedSections.push(s as NavigationSectionConfig);
        }
      });

      return {
        sections: mergedSections,
        lastUpdated: parsed.lastUpdated ?? Date.now(),
      };
    } catch (error) {
      console.error('[NavigationConfig] Failed to load config:', error);
      return this.getDefaultConfig();
    }
  }

  /**
   * Save configuration to localStorage
   */
  saveConfig(config: NavigationConfig): void {
    try {
      const toSave: NavigationConfig = {
        ...config,
        lastUpdated: Date.now(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
    } catch (error) {
      console.error('[NavigationConfig] Failed to save config:', error);
      throw new Error('Failed to save navigation config to localStorage');
    }
  }

  /**
   * Get IDs of enabled sections
   */
  getEnabledSectionIds(): NavViewId[] {
    const config = this.loadConfig();
    return config.sections.filter((s) => s.enabled).map((s) => s.id);
  }

  /**
   * Get default configuration (all enabled)
   */
  private getDefaultConfig(): NavigationConfig {
    return {
      sections: DEFAULT_NAVIGATION_SECTIONS.map((s) => ({ ...s })),
      lastUpdated: Date.now(),
    };
  }
}

export const navigationConfigService = new NavigationConfigService();
export default navigationConfigService;
