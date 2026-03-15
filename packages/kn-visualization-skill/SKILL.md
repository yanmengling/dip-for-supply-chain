---
name: kn-visualization-skill
description: 业务知识网络可视化，选网络、看图谱、查对象实例数据。供 Agent 在用户询问知识网络或对象数据时加载。
user-invocable: true
---

# 业务知识网络可视化 Skill

> 供 Agent / OpenClaw 动态加载的 Skill 说明文档。宿主或 Agent 可解析本 Markdown 以展示能力说明、配置项与加载方式。

## 名称与标识

- **名称**：业务知识网络可视化
- **标识**：`kn-visualization-skill`
- **版本**：见 `package.json` 的 `version` 字段

## 能力简述

本 Skill 提供**业务知识网络的可视化与数据查看**能力：

- 加载并展示一个或多个业务知识网络列表（由宿主注入或从后端接口拉取）。
- 用户选择某个知识网络后，展示该网络的**图谱视图**（对象类型与关系类型的节点与边）。
- 支持切换到**业务数据视图**，按对象类型 Tab 展示实例列表（表格、分页、属性搜索）。

适用于需要在前端或对话场景中「选网络 → 看图谱 → 查实例」的 Agent 或应用。

## 何时使用

- 用户询问「有哪些知识网络」「打开某业务知识网络」「查看某对象类型的数据」时，可加载本 Skill。
- 宿主已配置 Ontology 相关 API（ontology-manager、ontology-query）及鉴权信息时使用。

## 配置项（宿主 / Agent 注入）

通过 **`window.__SKILL_CONFIG__`** 在加载 Skill 页面前注入，类型与含义如下：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `ontologyManagerBaseUrl` | string | 是 | 知识网络元数据 API 根路径，如 `/api/ontology-manager/v1` |
| `ontologyQueryBaseUrl` | string | 是 | 实例查询 API 根路径，如 `/api/ontology-query/v1` |
| `getToken` | () => string \| Promise\<string\> | 是 | 返回当前鉴权 token，用于请求头 `Authorization: Bearer <token>` |
| `businessDomain` | string | 否 | 业务域，请求会带 `X-Business-Domain` 头；缺省为 `bd_public`，否则服务端可能返回「业务域不合法」 |
| `knowledgeNetworks` | Array\<{ id: string, name?: string }\> | 否 | 宿主注入的知识网络列表；不传则从同主机 `GET /api/bkn-backend/v1/knowledge-networks` 拉取（ADP 规范） |
| `defaultKnId` | string | 否 | 默认选中的知识网络 ID |
| `oauth2ClientId` | string | 否 | OAuth2 客户端 ID；填写后首次配置页显示「使用 DIP 账号登录（OAuth2）」 |
| `oauth2BackendCodeExchangeUrl` | string | 否 | 同源后端「接收 code 换 token」的 URL；若配置则 OAuth2 回调时由后端持 Token，前端不落盘 |

## 首次加载时如何初始化（服务器地址、Token、知识网络 ID）

配置按**优先级**合并，满足任一种即可，无需全部配置：

1. **宿主注入**（推荐）：在加载 Skill 页面前设置 `window.__SKILL_CONFIG__`，见下「加载方式」。
2. **URL 参数**：首次打开时在地址后加查询参数，例如：  
   `index.html?ontologyManagerBaseUrl=https://dip.example.com/api/ontology-manager/v1&ontologyQueryBaseUrl=https://dip.example.com/api/ontology-query/v1&defaultKnId=supplychain_hd0202&token=YOUR_TOKEN`  
   参数名支持：`ontologyManagerBaseUrl`、`ontologyQueryBaseUrl`、`defaultKnId`、`token` 或 `api_auth_token`。
3. **首次配置表单**：若既无宿主注入也无 URL 参数且本地从未保存过配置，页面会展示两步流程：
   - **第一步**：用户输入**服务器地址**（如 `https://dip.aishu.cn`）、可选 **OAuth2 客户端 ID**，以及 **Token**（或使用「使用 DIP 账号登录（OAuth2）」跳转 DIP 授权后回调换 token）；点击「加载知识网络列表」拉取列表。
   - **第二步**：选择默认知识网络后点击「保存并进入」。若采用 OAuth2 登录，回调后会自动保存服务器地址与 token（或由同源后端持 token），无需再次填 Token。
4. **本地已存配置**：曾通过表单或 URL 保存过的配置会写入 `localStorage`（`kn_visualization_skill_config` + `api_auth_token`），下次同源打开会自动使用。

## 加载方式

1. **部署**：将本包构建产物（`dist/`）部署到静态服务，base 路径为 **`/kn-visualization-skill/`**。
2. **注入配置**（可选）：在宿主页面或 Agent 控制的页面中执行：
   ```js
   window.__SKILL_CONFIG__ = {
     ontologyManagerBaseUrl: '/api/ontology-manager/v1',
     ontologyQueryBaseUrl: '/api/ontology-query/v1',
     getToken: () => localStorage.getItem('api_auth_token') ?? '',
     businessDomain: 'bd_public',  // 可选，缺省即为此值
     knowledgeNetworks: [{ id: 'supplychain_hd0202', name: 'DIP供应链业务知识网络' }],
     defaultKnId: 'supplychain_hd0202',
   };
   ```
3. **打开 Skill**：通过 iframe 或新窗口加载部署后的入口页，例如：  
   `https://your-domain.com/kn-visualization-skill/index.html`

## 构建与发布

- 在包目录执行：`npm run sync`（从主项目同步源码）→ `npm run build`（构建）。
- 构建产物为 `dist/` 下的 `index.html` 与 `assets/*`，整体部署到上述 base 路径即可。
- **在 OpenClaw 中安装与使用**（含 API 代理配置、首次配置与重新配置）：见 [DEPLOY-OPENCLAW.md](./DEPLOY-OPENCLAW.md)。

## 依赖说明

- 依赖宿主环境提供 **ontology-manager**、**ontology-query** 及（用于列表的）**bkn-backend** API 与鉴权；本 Skill 不内置后端。
- 所有请求会带 **`X-Business-Domain`** 头（默认 `bd_public`），以满足 DIP/网关对业务域的要求；宿主可通过 `businessDomain` 覆盖。
- 若后端不可用，Skill 内会展示错误或空状态，可由宿主根据 `window.__SKILL_CONFIG__` 重试或降级。
