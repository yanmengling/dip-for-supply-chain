/**
 * API 连接测试工具
 * 用于诊断前端与API的连接问题
 */

import { getApiConfig, getAuthToken, getAuthHeaders } from '../config/apiConfig';
import { httpClient } from '../api/httpClient';

export interface ConnectionTestResult {
  test: string;
  success: boolean;
  message: string;
  details?: any;
}

/**
 * 测试代理服务器连接
 */
export async function testProxyConnection(): Promise<ConnectionTestResult> {
  try {
    // 尝试连接代理服务器的健康检查端点（如果存在）
    const response = await fetch('http://127.0.0.1:30777', {
      method: 'GET',
      signal: AbortSignal.timeout(3000),
    });
    
    return {
      test: '代理服务器连接',
      success: true,
      message: '代理服务器正在运行',
      details: { status: response.status },
    };
  } catch (error: any) {
    return {
      test: '代理服务器连接',
      success: false,
      message: '代理服务器未运行或无法连接',
      details: {
        error: error.message,
        suggestion: '请先运行: node proxy-server.js 或 start-proxy.bat',
      },
    };
  }
}

/**
 * 测试API配置
 */
export function testApiConfig(): ConnectionTestResult {
  const config = getApiConfig();
  const token = getAuthToken();
  const headers = getAuthHeaders();

  const issues: string[] = [];

  if (!token) {
    issues.push('Token未配置');
  }

  if (!config.services.agent.baseUrl) {
    issues.push('Agent API baseUrl未配置');
  }

  if (!config.services.agent.appKey) {
    issues.push('Agent AppKey未配置');
  }

  return {
    test: 'API配置检查',
    success: issues.length === 0,
    message: issues.length === 0 ? '配置正常' : `发现问题: ${issues.join(', ')}`,
    details: {
      token: token ? `${token.substring(0, 20)}...` : '未设置',
      agentBaseUrl: config.services.agent.baseUrl,
      agentAppKey: config.services.agent.appKey,
      authHeaders: headers,
    },
  };
}

/**
 * 测试API端点连接
 */
export async function testApiEndpoint(): Promise<ConnectionTestResult> {
  try {
    const config = getApiConfig();
    const healthUrl = `${config.services.agent.baseUrl}/health`;
    
    const response = await httpClient.get(healthUrl, {
      timeout: 5000,
    });

    return {
      test: 'API端点连接',
      success: true,
      message: 'API端点可访问',
      details: {
        url: healthUrl,
        status: response.status,
      },
    };
  } catch (error: any) {
    return {
      test: 'API端点连接',
      success: false,
      message: '无法连接到API端点',
      details: {
        error: error.message,
        status: error.status,
        suggestion: '检查代理服务器是否运行，以及API配置是否正确',
      },
    };
  }
}

/**
 * 运行所有连接测试
 */
export async function runAllTests(): Promise<ConnectionTestResult[]> {
  const results: ConnectionTestResult[] = [];

  // 测试1: API配置
  results.push(testApiConfig());

  // 测试2: 代理服务器连接
  results.push(await testProxyConnection());

  // 测试3: API端点连接（仅在代理服务器可用时）
  const proxyTest = results[results.length - 1];
  if (proxyTest.success) {
    results.push(await testApiEndpoint());
  } else {
    results.push({
      test: 'API端点连接',
      success: false,
      message: '跳过测试（代理服务器未运行）',
    });
  }

  return results;
}

/**
 * 在控制台打印测试结果
 */
export function printTestResults(results: ConnectionTestResult[]): void {
  console.group('🔍 API连接诊断结果');
  
  results.forEach((result) => {
    const icon = result.success ? '✅' : '❌';
    console.log(`${icon} ${result.test}: ${result.message}`);
    
    if (result.details) {
      console.log('   详情:', result.details);
    }
  });

  const allPassed = results.every((r) => r.success);
  if (allPassed) {
    console.log('\n✅ 所有测试通过！API连接正常。');
  } else {
    console.log('\n❌ 发现问题，请根据上述提示修复。');
  }

  console.groupEnd();
}

