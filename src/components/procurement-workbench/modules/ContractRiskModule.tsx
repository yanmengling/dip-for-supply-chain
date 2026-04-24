/**
 * 模块 4：签约风险 (M4)
 *
 * Phase 1 留空（数据缺口 D-05 法大大电子签数据待接入）。
 */

import ModuleCard, { ModulePlaceholder } from './ModuleCard';

export default function ContractRiskModule() {
  return (
    <ModuleCard
      title="签约风险"
      subtitle="法大大电子签合同覆盖度、待签字订单"
      badge="数据待补充"
      badgeTone="orange"
    >
      <ModulePlaceholder text="法大大电子签数据（D-05）尚未接入；待签约系统对接后启用。" />
    </ModuleCard>
  );
}
