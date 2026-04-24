# API 服务层

本目录包含前端与后端服务对接的所有 API 调用逻辑。

## 目录结构

```
src/api/
├── index.ts              # 入口文件，统一导出所有 API
├── httpClient.ts         # HTTP 客户端封装
├── metricModelApi.ts     # 指标模型查询 API
└── README.md             # 本文件
```

## 统一配置

所有 API 的认证和配置统一在 `src/config/apiConfig.ts` 中管理：

```typescript
import { setAuthToken, getApiConfig } from '@/config/apiConfig';

// 设置 Token
setAuthToken('ory_at_xxxxx.xxxxx');

// 获取配置
const config = getApiConfig();
console.log(config.services.metricModel.baseUrl);
```

## 使用示例

### 1. 查询指标模型数据

```typescript
import { metricModelApi, createYearRange } from '@/api';

// 查询 2025 年的月度数据
const { start, end } = createYearRange(2025);

const result = await metricModelApi.queryByModelId(
  'd50hck5g5lk40hvh4880', // 指标模型 ID
  {
    instant: false,        // 范围查询
    start,
    end,
    step: '1M',            // 按月
    filters: [],
  },
  { includeModel: true }   // 返回模型信息
);

console.log(result.datas);  // 指标数据
console.log(result.model);  // 模型信息
```

### 2. 批量查询多个指标

```typescript
import { metricModelApi, createYearRange } from '@/api';

const { start, end } = createYearRange(2025);
const baseRequest = { instant: false, start, end, step: '1M' };

const results = await metricModelApi.queryByModelIds(
  ['d50hck5g5lk40hvh4880', 'd50heldg5lk40hvh488g', 'd50hf5tg5lk40hvh4890'],
  [baseRequest, baseRequest, baseRequest],
  { includeModel: true }
);

// results[0] -> 万元人力成本销售收入
// results[1] -> 人均销售额
// results[2] -> 人均人力成本
```

### 3. 使用过滤条件

```typescript
const result = await metricModelApi.queryByModelId(
  'model-id',
  {
    instant: false,
    start: Date.now() - 30 * 24 * 60 * 60 * 1000,
    end: Date.now(),
    step: '1d',
    filters: [
      { name: 'labels.department', value: ['销售部', '市场部'], operation: 'in' },
      { name: 'metrics.value', value: [0, 100], operation: 'range' },
    ],
  }
);
```

### 4. 错误处理

```typescript
import { metricModelApi, ApiError } from '@/api';

try {
  const result = await metricModelApi.queryByModelId('invalid-id', { ... });
} catch (error) {
  if (error instanceof ApiError) {
    console.error(`API 错误: ${error.message}`);
    console.error(`状态码: ${error.status}`);
    console.error(`错误码: ${error.code}`);
  }
}
```

## 环境变量配置

在项目根目录创建 `.env.local` 文件：

```bash
# 统一 Token
VITE_API_TOKEN=ory_at_xxxxx.xxxxx

# 指标模型 API
VITE_METRIC_MODEL_BASE_URL=https://dip-poc.aishu.cn/api/mdl-uniquery/v1

# 调试模式
VITE_API_DEBUG=true
```

## 添加新的 API 服务

1. 在 `src/api/` 目录下创建新的服务文件，如 `ontologyApi.ts`
2. 在 `src/config/apiConfig.ts` 中添加服务配置
3. 在 `src/api/index.ts` 中导出新服务

示例模板：

```typescript
// src/api/myNewApi.ts
import { httpClient } from './httpClient';
import { getServiceConfig } from '../config/apiConfig';

class MyNewApiService {
  private get baseUrl(): string {
    return getServiceConfig('myService').baseUrl;
  }

  async getSomething(id: string) {
    const response = await httpClient.get(`${this.baseUrl}/resource/${id}`);
    return response.data;
  }
}

export const myNewApi = new MyNewApiService();
```

## API 接口文档

- **指标模型 API**: 参见 `api/metricmodel_api_doc/uniquery-for-metricmodel.yaml`
- **本体 API**: 参见 `api/ontology/` 目录

