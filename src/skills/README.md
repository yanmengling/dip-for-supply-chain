# 业务知识网络可视化 Skill

供 OpenClaw 或其它宿主嵌入使用，通过配置注入 API 与鉴权，展示知识网络图谱与业务数据。

## 使用方式

```tsx
import { KNVisualizationSkill } from '@/skills';
import type { KNVisualizationSkillConfig } from '@/skills';

const config: KNVisualizationSkillConfig = {
  ontologyManagerBaseUrl: '/api/ontology-manager/v1',
  ontologyQueryBaseUrl: '/api/ontology-query/v1',
  getToken: () => localStorage.getItem('api_auth_token') ?? '',
  knowledgeNetworks: [{ id: 'supplychain_hd0202', name: 'DIP供应链业务知识网络' }], // 可选，不传则请求列表接口
  defaultKnId: 'supplychain_hd0202', // 可选
};

<KNVisualizationSkill config={config} />
```

## 配置说明

- **ontologyManagerBaseUrl** / **ontologyQueryBaseUrl**：由宿主注入，与当前环境一致。
- **getToken**：返回当前鉴权 token（或 `Promise<string>`）。
- **knowledgeNetworks**：宿主注入的知识网络列表；不传则调用 `GET {ontologyManagerBaseUrl}/knowledge-networks` 拉取（若后端支持）。
- **defaultKnId**：默认选中的知识网络 ID。

## 与当前项目的关系

- 管理配置页的「业务知识网络」仍使用 `KnowledgeGraphView`（全局配置 + ontologyApi）。
- 本 Skill 使用 `KnowledgeGraphCanvas` + `skillOntologyClient`，与页面解耦，便于独立打包给 OpenClaw。
