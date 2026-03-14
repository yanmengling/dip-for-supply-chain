# 真实 API 适配说明

## 发现的差异

根据你提供的真实 API 信息，发现以下字段名差异：

### 1. Agent Key 字段名
- **文档中**: `agent_id`
- **真实 API**: `agent_key`

### 2. 请求体字段对比

**文档中的字段**:
```json
{
  "agent_id": "string",
  "agent_version": "string",
  "query": "string",
  "stream": true,
  "inc_stream": true,
  "conversation_id": "string",
  "history": []
}
```

**真实 API 字段**:
```json
{
  "agent_key": "01KBCGGGD7RT20RW7J7ABRA7YW",
  "agent_version": "v2",
  "custom_querys": {
    "header": {},
    "self_config": {},
    "tool": {}
  },
  "history": [],
  "query": "在这里输入的问题",
  "stream": false
}
```

## 需要修改的地方

### ✅ 已完成的配置
1. Base URL: `https://dip-poc.aishu.cn:443/api/agent-app/v1`
2. App Key: `01KBCGGGD7RT20RW7J7DXJ5K96`
3. Token: `ory_at_iXcCg575R9gcCIsPADfexfERLzvTPlLALzoef-oPTp4.EVBtfGYlBEEZpMiRJEbWamiTR9djvvQRODQXI6vr53U`

### ⚠️ 需要修改的代码

#### 1. ChatCompletionRequest 接口 (agentApi.ts)
需要添加 `agent_key` 字段并保留 `agent_id` 做兼容：

```typescript
export interface ChatCompletionRequest {
  agent_id?: string;      // 兼容旧版本
  agent_key?: string;     // 真实 API 使用
  agent_version?: string;
  // ... 其他字段
}
```

#### 2. 请求发送时的字段映射
在发送请求时，需要将 `agent_id` 映射为 `agent_key`。

#### 3. Agent 配置 (copilotConfig.ts)
更新真实的 agent_key：

```typescript
const AGENT_CONFIGS = {
  evaluation: {
    agent_key: '01KBCGGGD7RT20RW7J7ABRA7YW',  // 使用真实的 agent key
    agent_version: 'v2',
    name: '供应商评估助手',
    description: '专业的供应商评估和分析助手'
  },
  // ... 其他配置
}
```

## 快速修复方案

为了快速对接真实 API，建议：

### 方案 1: 修改接口定义（推荐）
在 `agentApi.ts` 中添加字段映射逻辑，同时支持两种字段名。

### 方案 2: 全局替换
将所有 `agent_id` 替换为 `agent_key`（需要测试）。

### 方案 3: 适配器模式
创建一个适配器函数，在发送请求前转换字段格式。

## 下一步操作

1. 更新 `agentApi.ts` 添加字段映射
2. 更新 `copilotConfig.ts` 使用真实的 agent_key
3. 创建 `.env.local` 并设置真实配置
4. 测试连接
