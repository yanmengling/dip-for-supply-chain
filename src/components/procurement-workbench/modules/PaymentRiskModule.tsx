/**
 * 模块 3：付款风险 (M3)
 *
 * Phase 1 留空（数据缺口 D-04 付款条件待补充）。
 */

import ModuleCard, { ModulePlaceholder } from './ModuleCard';

export default function PaymentRiskModule() {
  return (
    <ModuleCard
      title="付款风险"
      subtitle="基于付款条件 + 在途/到货金额计算的现金流压力"
      badge="数据待补充"
      badgeTone="orange"
    >
      <ModulePlaceholder text="付款条件数据（D-04）尚未接入；待 ERP 端补齐 PO 付款条件字段后启用。" />
    </ModuleCard>
  );
}
