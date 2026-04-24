/**
 * Knowledge Graph View - Interactive Visualization
 *
 * 使用全局配置（globalSettingsService + ontologyApi）渲染业务知识网络图谱，
 * 内部委托给 KnowledgeGraphCanvas，与 Skill 共用同一画布组件。
 */

import { useMemo } from 'react';
import { ontologyApi } from '../../api';
import { globalSettingsService } from '../../services/globalSettingsService';
import type { SkillOntologyClient } from '../../services/skillOntologyClient';
import { KnowledgeGraphCanvas } from './KnowledgeGraphCanvas';

function createOntologyApiAdapter(): SkillOntologyClient {
  return {
    listKnowledgeNetworks: () => Promise.resolve([]),
    getObjectTypes: (_knId, opts) =>
      ontologyApi.getObjectTypes({ limit: opts?.limit ?? -1 }).then((r) => r.entries || []),
    getRelationTypes: (_knId, opts) =>
      ontologyApi.getRelationTypes({ limit: opts?.limit ?? -1 }).then((r) => r.entries || []),
    queryObjectInstances: (_knId, objectTypeId, opts) =>
      ontologyApi.queryObjectInstances(objectTypeId, opts),
  };
}

const KnowledgeGraphView = () => {
  const knId = globalSettingsService.getKnowledgeNetworkId();
  const client = useMemo(createOntologyApiAdapter, []);

  return (
    <KnowledgeGraphCanvas
      knId={knId}
      client={client}
      title="业务知识网络"
    />
  );
};

export default KnowledgeGraphView;
