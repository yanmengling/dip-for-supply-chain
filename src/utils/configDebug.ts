/**
 * Configuration Debug Utility
 * Use this to check if environment variables are loaded correctly
 */

export function debugConfig() {
  console.log('=== Agent Config Debug Info ===');
  console.log('Environment Variables:');
  console.log('  VITE_AGENT_API_BASE_URL:', import.meta.env.VITE_AGENT_API_BASE_URL);
  console.log('  VITE_AGENT_APP_KEY:', import.meta.env.VITE_AGENT_APP_KEY);
  console.log('  VITE_AGENT_API_TOKEN:', import.meta.env.VITE_AGENT_API_TOKEN ? '***' + import.meta.env.VITE_AGENT_API_TOKEN.slice(-10) : 'NOT SET');
  console.log('  VITE_AGENT_API_TIMEOUT:', import.meta.env.VITE_AGENT_API_TIMEOUT);
  console.log('  VITE_AGENT_STREAM_TIMEOUT:', import.meta.env.VITE_AGENT_STREAM_TIMEOUT);
  console.log('  VITE_AGENT_MAX_RETRIES:', import.meta.env.VITE_AGENT_MAX_RETRIES);

  // Import agentConfig to see the merged config
  import('../config/agentConfig').then(({ agentConfig }) => {
    console.log('\nMerged Agent Config:');
    console.log('  baseUrl:', agentConfig.baseUrl);
    console.log('  appKey:', agentConfig.appKey);
    console.log('  token:', agentConfig.token ? '***' + agentConfig.token.slice(-10) : 'NOT SET');
    console.log('  timeout:', agentConfig.timeout);
    console.log('  streamTimeout:', agentConfig.streamTimeout);
    console.log('  maxRetries:', agentConfig.maxRetries);
    console.log('===============================');
  });
}

// Call this function in development to debug
if (import.meta.env.DEV) {
  debugConfig();
}
