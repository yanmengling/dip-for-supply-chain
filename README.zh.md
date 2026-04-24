# DIP for Supply Chain - 供应链大脑AI应用

[中文](README.zh.md) | [English](README.md)

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)

**DIP for Supply Chain** 是基于DIP的供应链决策智能系统。应用基于 React + TypeScript + Vite 构建，其核心的供应链知识网络运行在 **KWeaver AI Data Platform (ADP)** 之上，智能体（Agent）运行在 **KWeaver Decision Agent** 之上。在运行本应用前，请确保您已经部署了 [KWeaver](https://github.com/kweaver-ai/kweaver/) 的相关模块。

## 快速链接

- [快速开始](#快速开始)
- [系统架构](#系统架构)
- [功能模块](#功能模块)
- [开发指南](#开发指南)
- [许可证](LICENSE) - Apache 2.0 许可证
- [报告问题](https://github.com/kweaver-ai/dip-for-supply-chain/issues)
- [功能建议](https://github.com/kweaver-ai/dip-for-supply-chain/issues)

## 快速开始

### 前置要求

- Node.js 18+
- npm 或 yarn
- DIP 平台运行中（参考 [KWeaver](https://github.com/kweaver-ai/kweaver/)）

### 启动步骤

**1. 配置环境变量**

复制 `.env.example` 到 `.env.local` 并填入您的 ADP 配置：

```bash
cp .env.example .env.local
```

在 `.env.local` 中配置：

```ini
VITE_AGENT_API_BASE_URL=your_adp_base_url
VITE_AGENT_APP_KEY=your_app_key
VITE_AGENT_API_TOKEN=your_api_token
```

**2. 安装依赖并启动**

```bash
npm install
npm run dev
```

前端服务将在 `http://127.0.0.1:5173` 运行。

## 目录结构

```
dip-for-supply-chain/
├── src/                        # 前端源代码
│   ├── components/             # React 组件（功能模块）
│   │   ├── planningV2/         # 动态计划协同（核心模块）
│   │   │   ├── gantt/          # 甘特图组件
│   │   │   └── multiProduct/   # 多产品监测任务
│   │   ├── cockpit/            # 驾驶舱仪表板
│   │   ├── product-supply-optimization/  # 产品供应优化
│   │   ├── mps/                # 主生产计划
│   │   ├── supplier-evaluation/ # 供应商评估
│   │   ├── agents/             # AI 决策代理组件
│   │   ├── config-backend/     # 配置管理后台
│   │   ├── shared/             # 共用组件（AI 助手等）
│   │   └── views/              # 页面视图（路由）
│   ├── services/               # 业务逻辑层
│   ├── api/                    # HTTP 客户端与 API 封装
│   ├── types/                  # TypeScript 类型定义
│   ├── hooks/                  # React 自定义 Hooks
│   ├── utils/                  # 工具函数
│   ├── config/                 # 配置文件
│   └── i18n/                   # 国际化
├── backend/                    # 后端服务（Python）
├── buildkit/                   # DIP 应用打包工具
└── public/                     # 静态资源
```

## 系统架构

**DIP for Supply Chain** 作为运行在 KWeaver 平台之上的**上层决策智能应用**。整体架构包含以下核心组件：

1. **DIP (Decision Intelligence Platform)**
   - 负责决策智能应用的生命周期管理、安装部署与运行时环境支持

2. **DIP Studio**
   - 提供中心化的账号管理与用户认证服务

3. **AI Data Platform (ADP)**
   - 统一纳管数据资产，包括多源数据接入、业务知识网络（Ontology）和指标模型

4. **Decision Agent**
   - 负责智能 Agent 的配置、编排与全生命周期管理

5. **DIP for Supply Chain（本应用）**
   - 基于上述底座构建的供应链业务应用，提供可视化分析与决策支持

## 功能模块

### 驾驶舱

供应链整体概览：
- 关键指标实时监控（库存、订单、采购）
- 风险预警与异常提示
- AI 分析助手对话

### 动态计划协同（核心模块）

以预测单为驱动的端到端计划协同：

- **三步建任务流程**：选择产品 → 确认 MRP 数据 → 生成倒排甘特图
- **BOM 倒排甘特图**：基于交期逐层倒推物料到货节点，可视化缺料风险
- **物料监测清单**：实时展示每条物料的备货状态、PO 交期与风险预警
- **大预测单（多产品）监测任务**：以大预测单（billno）为单位，在同一视图下展示多个产品的 BOM 倒排时间线与共用物料合并监测
- **每日监测报告**：自动生成任务状态快照，支持导出 Word 文档
- **AI 计划协同助手**：对话式获取物料状态、缺料建议

### 产品供应优化

产品级别的供应链分析：
- 需求预测（支持多种算法）
- BOM 展开与物料齐套分析
- 产品供应状态总览

### 库存优化

- 库存水平监控与安全库存计算
- **呆滞库存逆向计算器**：基于现有呆滞料逆向推算可生产成品组合
- AI 库存优化助手

### 主生产计划（MPS）

- 生产计划甘特图，展示工单与产能占用时序关系
- 多级计划联动（销售计划 → MPS → MRP）

### 订单交付

- 订单状态跟踪与交付时效分析
- AI 交付优化助手

### 供应商评估

- 多维度评估体系与风险预警
- AI 供应商分析助手

### 配置管理

- API 连接配置
- 知识网络与 Agent 配置
- 导航模块启用/禁用

## Agent API 集成

### 支持的 Agent

| Agent | 用途 |
|-------|------|
| `supplier_evaluation_agent` | 供应商评估助手 |
| `inventory_optimization_agent` | 库存优化助手 |
| `product_supply_optimization_agent` | 产品供应优化助手 |
| `order_delivery_agent` | 订单交付助手 |
| `supply_chain_cockpit_agent` | 驾驶舱助手 |

### API 端点

- 对话接口：`POST /api/agent-app/v1/app/{app_key}/chat/completion`
- 会话管理：`GET|POST|PUT|DELETE /api/agent-app/v1/app/{app_key}/conversations`

## 技术栈

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | 18.3.1 | UI 框架 |
| TypeScript | 5.9.3 | 类型安全 |
| Vite | 7.2.4 | 构建工具 |
| Tailwind CSS | 4.1.17 | 样式 |
| Ant Design | 6.3.1 | UI 组件库 |
| Recharts | 3.5.0 | 数据图表 |
| ReactFlow | 11.11.4 | 流程/甘特可视化 |
| TanStack React Query | 5.90.19 | 数据请求与状态管理 |
| vite-plugin-qiankun | 1.0.15 | 乾坤微应用框架 |
| @kweaver-ai/chatkit | 0.1.15 | KWeaver AI 对话集成 |
| docx | 9.5.1 | Word 文档导出 |
| lucide-react | 0.554.0 | 图标库 |

### 构建与质量

- ESLint 9.39.1（TypeScript + React 插件）
- Vitest 4.1.1（单元测试）

## 开发指南

### 环境要求

- Node.js 18+
- npm 或 yarn

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建生产版本
npm run build

# 预览生产构建
npm run preview
```

### 代码规范

- 使用 TypeScript 严格模式
- 函数式组件 + Hooks，事件处理函数使用 `handleXxx` 命名
- API 调用统一使用 `httpClient`
- 错误处理使用 try-catch，提供用户友好的错误提示

## 用户模式（DIP 打包）

应用可被打包为 `.dip` 文件，通过 DIP 应用商店安装：

```bash
cd buildkit
uv venv && source .venv/bin/activate  # Linux/Mac
# 或 .\.venv\Scripts\activate         # Windows

uv run scripts/build_package.py --arch=amd64   # AMD64
uv run scripts/build_package.py --arch=arm64   # ARM64
```

打包产物位于 `buildkit/.cache/<timestamp>/package/`，包含：
- `application.key` — 应用标识符
- `manifest.yaml` — 应用清单
- `assets/` — 图标和资源
- `packages/` — Docker 镜像和 Helm charts
- `ontologies/` — 本体定义
- `agents/` — Agent 配置

## 常见问题

**Q: API 请求失败**
- 检查 `.env.local` 中的 `VITE_AGENT_API_BASE_URL` 和 `VITE_AGENT_API_TOKEN` 是否正确
- 确认 DIP 平台正在运行且网络可达

**Q: 返回 401 Unauthorized**
- 检查 token 是否过期，重新获取后更新 `.env.local`
- 确认 `VITE_AGENT_APP_KEY` 正确

**Q: 返回 404 Not Found**
- 检查 `VITE_AGENT_API_BASE_URL` 路径是否正确

## 贡献指南

1. Fork 仓库
2. 创建功能分支（`git checkout -b feature/amazing-feature`）
3. 提交更改（`git commit -m 'Add some amazing feature'`）
4. 推送到分支（`git push origin feature/amazing-feature`）
5. 创建 Pull Request

## 许可证

本项目采用 Apache License 2.0 许可证。详情请参阅 [LICENSE](LICENSE) 文件。

## 支持与联系

- **问题反馈**：[GitHub Issues](https://github.com/kweaver-ai/dip-for-supply-chain/issues)
- **许可证**：[Apache 2.0 许可证](LICENSE)

---

基于 [KWeaver 平台](https://github.com/kweaver-ai/kweaver/) 构建 - 一个用于构建决策智能 AI 应用的开源生态系统。
