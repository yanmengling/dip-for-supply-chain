# 业务知识网络可视化 Skill

独立子项目，从主项目拷贝源码后单独构建与部署，供 OpenClaw 或其它宿主通过 iframe/script 加载。

- **OpenClaw 用户**：安装、代理配置与使用请优先阅读 **[DEPLOY-OPENCLAW.md](./DEPLOY-OPENCLAW.md)**（OpenClaw 安装与使用指南）。
- **Agent 动态加载**：能力说明、配置项与加载方式见 **[SKILL.md](./SKILL.md)**，供 Agent 解析与展示。
- **如何测试验证**：本地 dev/preview、首次配置流程、宿主注入与 URL 参数见 **[TEST.md](./TEST.md)**。
- **知识网络列表接口**：列表接口与后端约定见 **[docs/知识网络列表接口说明.md](./docs/知识网络列表接口说明.md)**。

## 与主项目的关系

- **源码**：从主项目 `src/` 拷贝，不直接引用主项目代码，双方构建互不影响。
- **同步**：主项目变更后，须在本目录执行 `npm run sync` 更新拷贝并刷新 `.skill-source-manifest.json`。
- **变更提醒**：构建前会自动执行 `check-sync`；若主项目已改且未执行 sync，构建将失败并提示先执行 `npm run sync`。
- **仅在子项目内开发时**：若未从主项目 sync、直接在本包改代码，构建请用 `npm run build:only`（跳过 check-sync），避免因「主项目与上次 sync 不一致」而失败；发布前建议把本包改动同步回主项目再执行一次 `npm run sync`，以保持主项目为源一致。

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run sync` | 从主项目拷贝源码到本包并生成/更新清单 |
| `npm run check-sync` | 检查主项目是否相对上次同步有变更（构建前自动执行） |
| `npm run dev` | 启动开发服务（默认 http://localhost:5174），带 /api 代理，便于本地验证 |
| `npm run build` | 先 check-sync，通过后执行 Vite 构建，产物在 `dist/` |
| `npm run build:only` | 不执行 check-sync，直接 Vite 构建（适用于仅在子项目内开发、未与主项目 sync 时） |
| `npm run preview` | 预览构建产物（访问路径需带 base：…/kn-visualization-skill/） |

## 宿主集成与使用

构建产物部署到静态服务，base 路径为 `/kn-visualization-skill/`。宿主在加载 Skill 页面前设置：

```js
window.__SKILL_CONFIG__ = {
  ontologyManagerBaseUrl: '/api/ontology-manager/v1',
  ontologyQueryBaseUrl: '/api/ontology-query/v1',
  getToken: () => localStorage.getItem('api_auth_token') ?? '',
  businessDomain: 'bd_public',  // 可选，缺省为 bd_public，请求会带 X-Business-Domain 头
  knowledgeNetworks: [{ id: 'xxx', name: '示例网络' }], // 可选，不传则从服务端拉取列表
  defaultKnId: 'xxx', // 可选
};
```

然后通过 iframe 加载部署后的 `.../kn-visualization-skill/index.html`。

- **知识网络列表**：不注入 `knowledgeNetworks` 时，会请求同主机的 `GET /api/bkn-backend/v1/knowledge-networks`（ADP 规范），请求头会带 `X-Business-Domain`（默认 `bd_public`），否则服务端可能返回「业务域不合法」。详见 [docs/知识网络列表接口说明.md](./docs/知识网络列表接口说明.md)。

## 拷贝清单

由 `scripts/sync-from-main.js` 按清单从主项目拷贝：

- `src/skills/*`
- `src/services/skillOntologyClient.ts`
- `src/components/config-backend/KnowledgeGraphCanvas.tsx`
- `src/components/config-backend/InstanceDataTable.tsx`
- `src/api/ontologyApiTypes.ts`

本包内另有手写的 `src/api/ontologyApi.ts`（仅 re-export 类型）和 `src/api/index.ts`，不参与同步。
