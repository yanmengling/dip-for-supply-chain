/**
 * Navigation Configuration Type Definitions
 *
 * Defines the data model for configurable navigation sections.
 */

export type NavViewId =
  | 'cockpit'
  | 'planningV2'
  | 'procurementWorkbench'
  | 'inventory'
  | 'optimization'
  | 'delivery'
  | 'evaluation';

export interface NavigationSectionConfig {
  id: NavViewId;
  label: string;
  description: string;
  enabled: boolean;
}

export interface NavigationConfig {
  sections: NavigationSectionConfig[];
  lastUpdated: number;
  /** 计划协同可用库存有效仓库列表（为空时不过滤） */
  planningWarehouseFilter: string[];
}

/** 默认参与计划协同库存计算的仓库 */
export const DEFAULT_PLANNING_WAREHOUSES: string[] = [
  '昆山半成品仓',
  '昆山成品仓',
  '昆山电子原料仓',
  '昆山无人机原料仓',
  '昆山装配原料仓',
  '新疆成品仓',
  '哈尔滨成品仓',
];

/** Default section definitions with descriptions */
export const DEFAULT_NAVIGATION_SECTIONS: NavigationSectionConfig[] = [
  { id: 'cockpit', label: '驾驶舱', description: '供应链总览与关键指标看板', enabled: true },
  { id: 'planningV2', label: '动态计划协同', description: '产品需求、主生产计划、物料需求一体化协同', enabled: true },
  { id: 'procurementWorkbench', label: '采购工作台', description: '采购员日常跟单工作台（任务清单驱动，6 模块可视化）', enabled: true },
  { id: 'inventory', label: '库存优化', description: 'BOM 库存分析与优化建议', enabled: true },
  { id: 'optimization', label: '产品供应优化', description: 'NPI 选型、EOL 决策与供应风险评估', enabled: true },
  { id: 'delivery', label: '订单交付', description: '订单交付进度与异常跟踪', enabled: true },
  { id: 'evaluation', label: '供应商评估', description: '供应商绩效评估与选型', enabled: false },
];
