/**
 * DIP Environment Service
 *
 * Manages DIP (Digital Intelligence Platform) environment integration.
 * Handles token acquisition, refresh, and logout through DIP-injected methods.
 *
 * Usage:
 * - Initialize in qiankun mount lifecycle with MicroAppProps
 * - Cleanup in qiankun unmount lifecycle
 * - Use isDipMode() to check if running in DIP container
 * - Use getToken()/refreshToken() for token management
 */

import type { MicroAppProps, GetAccessToken, RefreshToken, TokenExpiredHandler, Logout } from '../micro-app';

/** App version - bump this when releasing new .dip packages to clear stale caches */
const DIP_APP_VERSION = '0.1.3';
const DIP_VERSION_KEY = 'supply_chain_brain_dip_version';

/** localStorage keys managed by this app */
const APP_STORAGE_KEYS = [
  'supply_chain_api_config_collection',
  'supply_chain_global_settings',
  'api_auth_token',
  'api-environment',
];

interface DipTokenMethods {
  accessToken: GetAccessToken;
  refreshToken: RefreshToken;
  onTokenExpired: TokenExpiredHandler;
}

class DipEnvironmentService {
  private tokenMethods: DipTokenMethods | null = null;
  private logoutMethod: Logout | null = null;
  private initialized: boolean = false;

  /**
   * Initialize the DIP environment service with MicroAppProps
   * Should be called in qiankun mount lifecycle
   */
  initialize(props?: Partial<MicroAppProps>): void {
    if (!props) {
      console.log('[DIP Environment] No props provided, running in standalone mode');
      return;
    }

    // Clear stale caches when app version changes
    this.invalidateStaleCache();

    if (props.token) {
      this.tokenMethods = {
        accessToken: props.token.accessToken,
        refreshToken: props.token.refreshToken,
        onTokenExpired: props.token.onTokenExpired,
      };
      this.initialized = true;
      console.log('[DIP Environment] Initialized with DIP token methods');
    }

    if (props.logout) {
      this.logoutMethod = props.logout;
      console.log('[DIP Environment] Logout method available');
    }
  }

  /**
   * Clear stale localStorage caches when app version changes.
   * This ensures a fresh state when a new .dip package is installed.
   */
  private invalidateStaleCache(): void {
    try {
      const storedVersion = localStorage.getItem(DIP_VERSION_KEY);
      if (storedVersion === DIP_APP_VERSION) {
        return; // Same version, no cache clearing needed
      }

      console.log(`[DIP Environment] Version changed: ${storedVersion || 'none'} → ${DIP_APP_VERSION}, clearing stale caches`);

      APP_STORAGE_KEYS.forEach(key => {
        localStorage.removeItem(key);
      });

      localStorage.setItem(DIP_VERSION_KEY, DIP_APP_VERSION);
      console.log('[DIP Environment] Stale caches cleared, version updated');
    } catch (error) {
      console.error('[DIP Environment] Error invalidating cache:', error);
    }
  }

  /**
   * Cleanup the DIP environment service
   * Should be called in qiankun unmount lifecycle
   */
  cleanup(): void {
    this.tokenMethods = null;
    this.logoutMethod = null;
    this.initialized = false;
    console.log('[DIP Environment] Cleaned up');
  }

  /**
   * Check if running in DIP container mode
   */
  isDipMode(): boolean {
    return this.initialized && this.tokenMethods !== null;
  }

  /**
   * Get the current access token from DIP
   * Returns null if not in DIP mode or token unavailable
   */
  getToken(): string | null {
    if (!this.tokenMethods) {
      return null;
    }

    try {
      const token = this.tokenMethods.accessToken();
      if (!token) {
        console.warn('[DIP Environment] DIP accessToken returned empty');
        return null;
      }
      return token;
    } catch (error) {
      console.error('[DIP Environment] Error calling accessToken:', error);
      return null;
    }
  }

  /**
   * Refresh the access token through DIP
   * Returns new token on success, null on failure
   */
  async refreshToken(): Promise<string | null> {
    if (!this.tokenMethods) {
      console.warn('[DIP Environment] Cannot refresh token - not in DIP mode');
      return null;
    }

    try {
      console.log('[DIP Environment] Refreshing token...');
      const result = await this.tokenMethods.refreshToken();

      if (!result || !result.accessToken) {
        console.error('[DIP Environment] Invalid refresh response');
        return null;
      }

      console.log('[DIP Environment] Token refreshed successfully');
      return result.accessToken;
    } catch (error) {
      console.error('[DIP Environment] Token refresh failed:', error);
      return null;
    }
  }

  /**
   * Notify DIP that token has expired
   * @param code Optional error code
   */
  notifyTokenExpired(code?: number): void {
    if (!this.tokenMethods) {
      console.warn('[DIP Environment] Cannot notify token expired - not in DIP mode');
      return;
    }

    try {
      this.tokenMethods.onTokenExpired(code);
      console.log('[DIP Environment] Token expired notification sent, code:', code);
    } catch (error) {
      console.error('[DIP Environment] Error notifying token expired:', error);
    }
  }

  /**
   * Trigger logout through DIP
   * Should be called when token refresh fails
   */
  logout(): void {
    if (this.logoutMethod) {
      console.log('[DIP Environment] Triggering logout...');
      try {
        this.logoutMethod();
      } catch (error) {
        console.error('[DIP Environment] Error during logout:', error);
      }
    } else {
      console.warn('[DIP Environment] Logout method not available');
      // Fallback: notify token expired with error code
      this.notifyTokenExpired(401);
    }
  }

  /**
   * Check if logout method is available
   */
  hasLogout(): boolean {
    return this.logoutMethod !== null;
  }

  // ============================================================================
  // DIP-specific API Configuration
  // ============================================================================

  /** DIP-specific agent app key */
  private readonly DIP_AGENT_APP_KEY = '01KFN4FM9P5MB9G693TESZRC5Z';

  /**
   * Get the agent app key for DIP mode.
   * Returns DIP-specific key when in DIP mode, null otherwise.
   */
  getAgentAppKey(): string | null {
    return this.isDipMode() ? this.DIP_AGENT_APP_KEY : null;
  }

  /**
   * Get the automation API base path.
   * DIP uses v1, standalone dev uses v2.
   */
  getAutomationApiBase(): string {
    return this.isDipMode() ? '/api/automation/v1' : '/api/automation/v2';
  }
}

// Export singleton instance
export const dipEnvironmentService = new DipEnvironmentService();

// Export class for testing purposes
export { DipEnvironmentService };
