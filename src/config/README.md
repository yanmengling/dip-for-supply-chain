# Agent API 配置说明

## 概述

本项目提供了灵活的 Agent API 配置系统，支持多种方式设置认证令牌和配置参数。

## 配置方式

### 1. 环境变量配置（推荐用于开发环境）

复制 `.env.example` 到 `.env.local`，然后设置环境变量：

```bash
# .env.local
VITE_AGENT_API_BASE_URL=http://localhost:30777/api/agent-app/v1
VITE_AGENT_APP_KEY=chain-neural
VITE_AGENT_API_TOKEN=your_token_here
```

### 2. 运行时配置（推荐用于生产环境）

在用户登录后动态设置 token：

```typescript
import { setAuthToken } from '@/config/agentConfig';

// 用户登录成功后
function onLoginSuccess(token: string) {
  // 第二个参数 persistent=true 会将 token 存储到 localStorage（持久化）
  // persistent=false 会存储到 sessionStorage（关闭浏览器后清除）
  setAuthToken(token, true);
}
```

### 3. 清除认证

```typescript
import { clearAuthToken } from '@/config/agentConfig';

// 用户登出时
function onLogout() {
  clearAuthToken();
}
```

### 4. 更新配置

```typescript
import { updateAgentConfig } from '@/config/agentConfig';

// 动态更新配置
updateAgentConfig({
  baseUrl: 'https://api.example.com/v1',
  timeout: 180000, // 3 minutes
});
```

## Token 查找优先级

系统会按以下顺序查找认证 token：

1. `agentConfig.token` - 通过 `setAuthToken()` 或 `updateAgentConfig()` 设置的值
2. `sessionStorage.getItem('agent_api_token')` - 会话存储
3. `localStorage.getItem('agent_api_token')` - 本地存储
4. `import.meta.env.VITE_AGENT_API_TOKEN` - 环境变量

## 使用示例

### 示例 1: 登录流程

```typescript
// src/services/auth.ts
import { setAuthToken, clearAuthToken } from '@/config/agentConfig';

export async function login(username: string, password: string) {
  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();

    if (data.token) {
      // 设置 token，persistent=true 表示持久化存储
      setAuthToken(data.token, true);
      return { success: true };
    }

    return { success: false, error: 'Invalid credentials' };
  } catch (error) {
    console.error('Login failed:', error);
    return { success: false, error: 'Network error' };
  }
}

export function logout() {
  clearAuthToken();
  // 跳转到登录页面
  window.location.href = '/login';
}
```

### 示例 2: 在 App 初始化时检查 token

```typescript
// src/App.tsx
import { useEffect } from 'react';
import { getAuthToken } from '@/config/agentConfig';

function App() {
  useEffect(() => {
    const token = getAuthToken();
    if (!token) {
      console.warn('No auth token found. Some features may not work.');
      // 可以选择跳转到登录页或显示提示
    }
  }, []);

  return <YourApp />;
}
```

### 示例 3: 使用 API 客户端

```typescript
// API 客户端会自动使用配置的 token
import { agentApiClient } from '@/services/agentApi';

async function sendMessage(query: string) {
  try {
    const response = await agentApiClient.chatCompletion({
      agent_id: 'your_agent_id',
      query: query,
    });

    return response;
  } catch (error) {
    if (error.status === 401) {
      console.error('Authentication failed. Please login again.');
      // 清除过期的 token
      clearAuthToken();
      // 跳转到登录页
      window.location.href = '/login';
    }
    throw error;
  }
}
```

## 配置参数说明

| 参数 | 类型 | 默认值 | 说明 |
|-----|------|-------|------|
| `baseUrl` | string | `http://localhost:30777/api/agent-app/v1` | Agent API 基础 URL |
| `appKey` | string | `chain-neural` | Agent 应用密钥 |
| `token` | string | undefined | Bearer 认证令牌 |
| `timeout` | number | 120000 | 非流式请求超时时间（毫秒） |
| `streamTimeout` | number | 300000 | 流式请求超时时间（毫秒） |
| `maxRetries` | number | 3 | 请求失败最大重试次数 |

## 错误处理

API 客户端会自动处理以下错误：

- **网络错误**: 自动重试最多 3 次（可配置）
- **超时错误**: 非流式请求 2 分钟，流式请求 5 分钟（可配置）
- **认证错误 (401)**: 需要应用层处理，建议清除 token 并跳转到登录页
- **服务器错误 (5xx)**: 自动重试
- **限流错误 (429)**: 自动重试并指数退避

## 安全建议

1. **不要在前端代码中硬编码 token**
2. **不要将 `.env.local` 提交到版本控制**
3. **生产环境使用 HTTPS**
4. **定期刷新 token**
5. **Token 过期时及时清除并重新登录**

## 调试

如果遇到认证问题，可以检查：

```typescript
import { getAuthToken, agentConfig } from '@/config/agentConfig';

console.log('Current config:', agentConfig);
console.log('Current token:', getAuthToken());
```

## 常见问题

### Q: 为什么我的请求返回 401 Unauthorized?

A: 检查以下几点：
1. 是否正确设置了 token
2. Token 是否过期
3. Token 格式是否正确（应该是 Bearer token）

### Q: 如何在开发环境中禁用认证?

A: 后端 API 需要支持开发模式。前端不建议禁用认证，但可以使用测试 token。

### Q: 如何在多个环境（开发、测试、生产）使用不同配置?

A: 使用不同的 `.env` 文件：
- `.env.development` - 开发环境
- `.env.staging` - 测试环境
- `.env.production` - 生产环境

Vite 会根据当前模式自动加载对应的文件。
