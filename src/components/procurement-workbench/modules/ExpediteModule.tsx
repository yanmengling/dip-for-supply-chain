/**
 * 模块 5：催货管理 (M5)
 *
 * Phase 1 仅提供入口占位（D-06 催货邮件链路延后）。
 */

import ModuleCard, { ModulePlaceholder, PlaceholderActionButton } from './ModuleCard';

export default function ExpediteModule() {
  return (
    <ModuleCard
      title="催货管理"
      subtitle="逾期未到 PO 的催货历史、邮件模板、回复跟踪"
      actions={
        <div className="flex gap-1.5">
          <PlaceholderActionButton label="新建催货" />
          <PlaceholderActionButton label="模板管理" />
        </div>
      }
    >
      <ModulePlaceholder text="催货邮件链路（D-06）后续阶段接入；当前仅占位展示。" />
    </ModuleCard>
  );
}
