# DIP for Supply Chain - 供应链大脑AI应用

[中文](README.zh.md) | [English](README.md)

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

**DIP for Supply Chain** 是基于供应链知识网络和本体建模方法的人工智能辅助分析决策系统。应用基于 React + TypeScript + Vite 构建，其底层的供应链知识网络（Ontology）运行在 **KWeaver AI Data Platform (ADP)** 之上，智能体（Agent）运行在 **KWeaver Decision Agent** 之上。在运行本应用前，请确保您已经部署了 [KWeaver](https://github.com/kweaver-ai/kweaver/) 的相关模块。

## 📚 快速链接

- 🚀 [快速开始](#快速开始)
- 📖 [系统架构](#系统架构)
- 🎯 [功能模块](#功能模块)
- 🔧 [开发指南](#开发指南)
- 📄 [许可证](LICENSE) - Apache 2.0 许可证
- 🐛 [报告问题](https://github.com/kweaver-ai/dip-for-supply-chain/issues) - 报告错误或问题
- 💡 [功能建议](https://github.com/kweaver-ai/dip-for-supply-chain/issues) - 建议新功能

## 快速开始

### 前置要求

- Node.js 16+
- npm 或 yarn
- Python 3.11+（可选，用于 Prophet 预测算法）
- DIP 平台运行中（参考 [KWeaver](https://github.com/kweaver-ai/kweaver/)）

### 前端应用启动

#### 启动步骤

```bash
npm install  # 如果还没安装依赖
npm run dev
```

前端服务器将在 `http://127.0.0.1:5173` 上运行。

### 算法服务启动（可选）

如果需要使用 Prophet 需求预测算法，需要启动后端 Python 服务。

**步骤1：安装 Python 依赖**

```bash
cd backend
python3 -m venv venv
source venv/bin/activate  # Linux/Mac
# 或 venv\Scripts\activate  # Windows

pip install -r requirements.txt
```

**步骤2：启动算法服务**

```bash
python run.py
```

服务将在 `http://localhost:8000` 启动。

**验证服务**

```bash
curl http://localhost:8000/health
# 应返回: {"status":"healthy","service":"prophet-forecast","version":"1.0.0"}
```

> **注意**: 如果 Prophet 服务未启动，系统会自动使用前端内置的 Holt-Winters 算法作为降级方案，不影响基本功能。

### 验证连接

1. 打开浏览器访问 `http://127.0.0.1:5173`
2. 打开浏览器控制台（F12）
3. 在控制台运行以下代码进行连接诊断：

```javascript
// 导入诊断工具
import { runAllTests, printTestResults } from './src/utils/apiConnectionTest';

// 运行测试
const results = await runAllTests();

## 系统架构

**DIP for Supply Chain** 作为运行在 KWeaver 平台之上的**上层决策智能应用**。整体架构包含以下核心组件：

1.  **DIP (Decision Intelligence Platform)**
    *   **定位**: 基础平台容器
    *   **作用**: 负责决策智能应用的生命周期管理、安装部署与运行时环境支持。

2.  **DIP Studio**
    *   **定位**: 统一身份与访问管理
    *   **作用**: 提供中心化的账号管理与用户认证服务，确保企业级安全性。

3.  **AI Data Platform (ADP)**
    *   **定位**: 核心数据底座
    *   **作用**: 统一纳管数据资产，包括：
        *   **数据接入**: 多源异构数据的采集与集成。
        *   **业务知识网络 (Ontology)**: 构建供应链领域的本体模型与知识图谱。
        *   **指标模型**: 定义与计算关键业务指标 (Metrics)。

4.  **Decision Agent**
    *   **定位**: 智能代理引擎
    *   **作用**: 负责智能 Agent 的配置、编排与全生命周期管理，为应用提供推理与执行能力。

5.  **DIP for Supply Chain (本应用)**
    *   **定位**: 垂类决策智能应用
    *   **作用**: 基于上述底座构建的供应链业务应用，提供可视化分析、预测与决策支持。

### 代码结构


```
SupplyChainBrain/
├── src/                        # 前端源代码
│   ├── components/            # React 组件
│   │   ├── product-supply-optimization/  # 产品供应优化模块
│   │   ├── inventory/         # 库存管理模块
│   │   ├── cockpit/          # 驾驶舱模块
│   │   └── ...
│   ├── services/             # API 服务层
│   │   ├── demandPlanningService.ts       # 需求计划服务
│   │   ├── forecastAlgorithmService.ts    # 前端预测算法
│   │   └── forecastOperatorService.ts     # 预测算子服务（API集成）
│   ├── api/                  # HTTP 客户端
│   ├── config/               # 配置文件
│   └── types/                # TypeScript 类型定义
├── backend/                   # 后端算法服务（Python）
│   ├── app/
│   │   ├── main.py           # FastAPI 应用
│   │   ├── models.py         # Pydantic 模型
│   │   └── prophet_service.py # Prophet 预测服务
│   ├── requirements.txt      # Python 依赖
│   └── run.py               # 启动脚本
└── public/                   # 静态资源
```

## 功能模块

### 🏠 驾驶舱
供应链整体概览，包括：
- 关键指标监控
- 实时预警
- AI 分析助手

### 📈 产品供应优化
智能需求预测和供应优化，包括：
- **需求预测**：支持多种预测算法
  - 简单指数平滑（Simple Exponential Smoothing）
  - Holt 线性指数平滑（Holt Linear）
  - Holt-Winters 三重指数平滑（季节性预测）
  - Prophet 算法（Meta开发，适合复杂季节性）
- **订单分析**：订单量趋势和周期性分析
- **产品齐套分析**：甘特图展示产品完整生产模式
- **AI 优化建议**：基于预测结果的智能优化建议

### 📅 动态计划协同
基于有限产能的智能排程与协同管理：
- **可视化排程**：生产计划甘特图，直观展示订单、工单与产能占用的时序关系。
- **智能调度算法**：基于交期优先、产能均衡等多目标的自动排程计算。
- **多级计划联动**：实现销售计划、主生产计划与物料需求计划的实时数据协同。

### 📦 库存优化
库存管理和优化分析：
- 库存水平监控
- 安全库存计算
- AI 库存优化助手
- **呆滞库存逆向计算器**：基于现有呆滞料逆向推算可生产成品组合，提供最大化消纳与最小化余料两种优化策略，通过"变呆为宝"盘活积压资产。

### 🚚 订单交付
交付管理：
- 订单状态跟踪
- 交付时效分析
- AI 交付优化助手

### 👥 供应商评估
供应商风险评估：
- 多维度评估体系
- 风险预警
- AI 供应商分析助手

### ⚙️ 管理配置
系统配置管理：
- 数据模式切换
- 知识网络配置
- API 配置管理

## 算法服务

### 需求预测算法

系统支持4种预测算法，根据数据特征选择：

| 算法 | 适用场景 | 参数 | 实现位置 |
|------|---------|------|---------|
| **简单指数平滑** | 无趋势、无季节性的稳定数据 | α (平滑系数) | 前端 |
| **Holt 线性** | 有趋势、无季节性 | α (水平), β (趋势) | 前端 |
| **Holt-Winters** | 有趋势、有季节性 | α, β, γ (季节), 季节周期 | 前端 |
| **Prophet** | 复杂季节性、长期趋势 | 季节性模式、变化点灵敏度等 | 后端 (优先) / 前端 (降级) |

### Prophet 算法服务

#### 架构设计

```
前端 → forecastOperatorService → Prophet 后端 API
                                     ↓ (失败)
                                 Holt-Winters 降级
```

#### API 规范

**端点**: `POST /api/v1/forecast/prophet`

**请求示例**:
```json
{
  "product_id": "PROD-001",
  "historical_data": [
    {"month": "2024-01", "quantity": 100},
    {"month": "2024-02", "quantity": 120}
  ],
  "forecast_periods": 12,
  "parameters": {
    "seasonality_mode": "multiplicative",
    "yearly_seasonality": true,
    "changepoint_prior_scale": 0.05,
    "interval_width": 0.95,
    "growth": "linear"
  }
}
```

**响应示例**:
```json
{
  "product_id": "PROD-001",
  "algorithm": "prophet",
  "forecast_values": [125, 130, 135, ...],
  "confidence_intervals": [
    {"lower": 110, "upper": 140},
    ...
  ],
  "metrics": {
    "mape": 5.2,
    "rmse": 12.5,
    "mae": 10.3
  },
  "generated_at": "2024-01-15T10:30:00.000Z"
}
```

#### 参数说明

| 参数 | 类型 | 范围 | 默认值 | 说明 |
|------|------|------|--------|------|
| `seasonality_mode` | string | additive/multiplicative | multiplicative | 季节性模式 |
| `yearly_seasonality` | boolean | - | true | 年度季节性 |
| `changepoint_prior_scale` | float | 0.001-0.5 | 0.05 | 变化点灵敏度，值越大对趋势变化越敏感 |
| `interval_width` | float | 0.5-0.99 | 0.95 | 置信区间宽度 |
| `growth` | string | linear/logistic/flat | linear | 趋势增长模式 |

#### 优雅降级

当 Prophet 后端服务不可用时：
1. 前端自动检测 API 健康状态
2. 降级使用内置 Holt-Winters 算法
3. 显示用户提示："Prophet 预测服务暂时不可用，已自动切换到 Holt-Winters 算法"
4. 保证预测功能持续可用

## 数据模式说明

系统支持两种数据处理模式，可通过右上角的切换开关（或管理配置页面）进行切换：

### 1. 通用模式 (`huida-legacy`)
- **用途**: 展示完整的、经过验证的业务场景数据
- **数据源**: `src/data/mockData.ts` 结合基础 API 服务
- **场景**: 演示、开发和稳定性测试

### 2. 惠达供应链大脑模式 (`huida-new`)
- **用途**: 对接最新、真实的惠达供应链 API 数据
- **数据源**: 真实的指标查询 API (`/proxy-metric/v1`)
- **场景**: 实际业务分析、指标下钻和实时预警

## 样例数据

本项目提供了遵循本体定义的样例数据，位于 `sample_data/` 目录下，可用于开发测试及数据导入演示：

*   **[suppliers.json](sample_data/suppliers.json)**: 典型供应商档案（含风险评级、交付表现等）。
*   **[products.json](sample_data/products.json)**: 核心产品数据（含BOM结构、库存状态）。
*   **[materials.json](sample_data/materials.json)**: 关键原材料库存数据（含状态分布）。
*   **[orders.json](sample_data/orders.json)**: 跨越生产与交付周期的订单数据。

## Agent API 集成

前端已完成与后端 Agent API 的完整对接：

### 核心特性
- **流式对话**: 支持实时流式响应，提升用户体验
- **会话管理**: 自动维护对话上下文和历史记录
- **多 Agent 支持**: 根据不同页面使用对应的专业 Agent
- **错误处理**: 完善的错误处理和重试机制

### 支持的 Agent
- **供应商评估助手** (`supplier_evaluation_agent`)
- **库存优化助手** (`inventory_optimization_agent`)
- **产品供应优化助手** (`product_supply_optimization_agent`)
- **订单交付助手** (`order_delivery_agent`)
- **供应链驾驶舱助手** (`supply_chain_cockpit_agent`)

### API 端点
- 对话接口: `POST /api/agent-app/v1/app/{app_key}/chat/completion`
- 会话管理: `GET|POST|PUT|DELETE /api/agent-app/v1/app/{app_key}/conversations`
- 调试接口: `POST /api/agent-app/v1/app/{app_key}/api/debug`

## 供应链知识网络配置

系统集成了 **供应链知识网络** 配置功能，支持根据不同场景切换本体模型：
- **动态 ID 绑定**: 可在管理页面实时选择当前激活的 `knowledgeNetworkId`
- **模式联动**: 切换数据模式时，系统会自动推荐最适合该模式的知识网络
- **本体路由**: 所有的本体查询均通过 `ontologyApi` 动态构建路由，支持跨网络、跨环境调用

## 技术栈

### 前端
- React 19.2.0
- TypeScript
- Vite
- Tailwind CSS v4
- Lucide React (图标)
- Recharts (图表)
- Agent API 客户端 (自定义)

### 后端算法服务
- Python 3.11+
- FastAPI 0.109.0
- Prophet 1.1.5 (Meta 时间序列预测库)
- Pandas 2.1.4
- NumPy 1.26.3
- Uvicorn (ASGI 服务器)

## 开发指南

### 环境要求

**前端**:
- Node.js 16+
- npm 或 yarn

**后端算法服务** (可选):
- Python 3.11+
- pip

### 项目结构

```
src/
├── components/          # React 组件
│   ├── product-supply-optimization/
│   │   ├── ProductDemandForecastPanelNew.tsx  # 需求预测主面板
│   │   ├── AlgorithmParameterPanel.tsx        # 算法参数配置
│   │   └── ProductSupplyOptimizationPage.tsx  # 页面入口
├── services/
│   ├── forecastAlgorithmService.ts   # 前端预测算法实现
│   ├── forecastOperatorService.ts    # 预测算子服务（API集成）
│   └── demandPlanningService.ts      # 需求计划服务
├── api/
│   └── httpClient.ts                 # HTTP 客户端
└── config/
    └── apiConfig.ts                  # API 配置

backend/
├── app/
│   ├── main.py              # FastAPI 应用入口
│   ├── models.py            # Pydantic 数据模型
│   └── prophet_service.py   # Prophet 预测核心逻辑
├── requirements.txt         # Python 依赖
└── run.py                  # 启动脚本
```

### 添加新的预测算法

1. **前端算法**（JavaScript/TypeScript）:
   - 在 `forecastAlgorithmService.ts` 添加算法实现
   - 在 `AlgorithmParameterPanel.tsx` 添加参数配置 UI
   - 在 `ProductDemandForecastPanelNew.tsx` 添加调用逻辑

2. **后端算法**（Python）:
   - 在 `backend/app/models.py` 定义请求/响应模型
   - 在 `backend/app/prophet_service.py` 实现算法逻辑
   - 在 `backend/app/main.py` 添加 API 端点
   - 在 `forecastOperatorService.ts` 添加前端调用接口

### 代码规范

- 使用 TypeScript 严格模式
- 遵循 React Hooks 最佳实践
- 组件使用函数式组件 + Hooks
- API 调用统一使用 `httpClient`
- 错误处理使用 try-catch 和用户友好的错误提示

### 构建部署

```bash
# 前端构建
npm run build

# 前端预览
npm run preview

# 后端部署
cd backend
gunicorn app.main:app -w 4 -k uvicorn.workers.UvicornWorker
```

## 常见问题

**Q: API请求失败，提示连接错误**


**Q: 返回401 Unauthorized**
- ✅ 检查token是否正确配置在 `src/config/apiConfig.ts`
- ✅ 确认token未过期

**Q: 返回404 Not Found**
- ✅ 检查API baseUrl配置是否正确


**Q: Prophet 预测不可用**
- ✅ 确认后端算法服务已启动（`http://localhost:8000`）
- ✅ 系统会自动使用 Holt-Winters 作为降级方案，不影响基本功能
- ✅ 查看前端控制台，会显示降级提示信息

## 相关文档

- [Prophet 算法服务 README](backend/README.md)
- [API 配置指南](src/config/README.md)

## 贡献指南

我们欢迎贡献！请遵循以下步骤：

1. Fork 仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add some amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 创建 Pull Request

## 许可证

本项目采用 Apache License 2.0 许可证。详情请参阅 [LICENSE](LICENSE) 文件。

## 支持与联系

- **问题反馈**: [GitHub Issues](https://github.com/your-org/supply-chain-brain/issues)
- **许可证**: [Apache 2.0 许可证](LICENSE)

---

基于 [DIP 平台](https://github.com/kweaver-ai/kweaver/) 构建 - 一个用于构建决策智能AI应用的开源生态系统。
