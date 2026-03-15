/**
 * 新版动态计划协同V2 - 核心数据类型定义
 *
 * 基于PRD v1.6: /docs/PRD_动态计划协同V2.md
 */

// ============= 通用类型 =============

export type PlanningModuleV2 = 'PP' | 'MPS' | 'MRP' | 'COLLABORATION';

export interface PlanningModuleConfig {
  id: PlanningModuleV2;
  label: string;
  shortLabel: string;
  order: number;
}

// ============= 产品需求计划(PP) =============

/**
 * 产品需求计划 - API 数据结构
 * API 对象: supplychain_hd0202_pp
 * 数据源: product_demand_plan
 * 数据量: 82 条
 */
export interface ProductDemandPlanAPI {
  /** 产品名称 */
  product_name: string;
  /** 产品编码 (主键) */
  product_code: string;
  /** 需求计划时间 - 产品需要完成交付的截止时间 */
  planned_date: string;
  /** 需求数量 */
  planned_demand_quantity: number;
}

// 保留旧类型用于兼容 (Mock数据)
export interface ProductDemand {
  productCode: string;
  productName: string;
  demandQuantity: number;
  demandDate: Date;
  demandSource: 'sales' | 'forecast' | 'contract';
  priority: 'high' | 'medium' | 'low';
  status: 'draft' | 'confirmed' | 'scheduled';
  remarks?: string;
}

// 保留旧类型用于兼容 (Mock数据)
export interface ProductDemandPlan {
  id: string;
  productCode: string;
  productName: string;
  planPeriod: string; // 例如: "2026-Q1"
  monthlyDemand: {
    month: string; // "2026-02"
    quantity: number;
  }[];
  totalQuantity: number;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============= 主生产计划(MPS) =============

export interface MasterProductionSchedule {
  id: string;
  planCode: string; // 例如: SCPlan_001
  productCode: string;
  productName: string;
  plannedQuantity: number;
  startDate: Date;
  endDate: Date;
  productionDays: number;
  productionEfficiency: number; // 单位/天
  status: 'planned' | 'in_progress' | 'completed' | 'delayed';
  bomLevel: number; // BOM层级
  priority: 'high' | 'medium' | 'low';
  remarks?: string;
}

// ============= 物料需求计划(MRP) =============

export type MaterialType = 'product' | 'purchased' | 'outsourced' | 'manufactured';

export interface MaterialRequirementPlan {
  id: string;
  materialCode: string;
  materialName: string;
  materialType: MaterialType;
  requiredQuantity: number;
  requiredDate: Date; // 计划交期

  // 库存信息
  availableInventory: number;
  shortage: number; // 缺口数量

  // 采购信息
  prCode?: string; // PR请购单号
  prDate?: Date;
  poCode?: string; // PO采购单号
  poDate?: Date;
  latestPoDate?: Date; // 最晚下单时间

  // 供应商信息
  supplierCode?: string;
  supplierName?: string;
  deliveryDuration: number; // 交付周期(天)
  supplierCommitDate?: Date; // 供应商承诺交期

  // 状态信息
  status: 'ready' | 'no_po' | 'po_placed' | 'normal' | 'abnormal';
  supplierStatus?: string; // 供应商状态: 审批中/生产中/发货中等

  // 采购员
  buyer?: string;

  // BOM关联
  parentMaterialCode?: string;
  bomLevel: number;
  relatedProductCode: string;
}

// ============= 甘特图任务 =============

export interface MaterialTask {
  materialCode: string; // 对应RiskAlert.itemCode
  materialName: string;
  materialType: MaterialType;
  unit: string; // 单位

  // 状态信息 - 与RiskAlert.ganttStatus对应
  status: 'ready' | 'no_po' | 'po_placed' | 'normal' | 'abnormal';

  // 采购信息 - 与RiskAlert字段对应
  prNumber?: string; // 对应RiskAlert.prCode
  prDate?: Date; // PR创建日期
  poNumber?: string; // 对应RiskAlert.poCode
  poDate?: Date; // PO下达日期
  supplierName?: string; // 对应RiskAlert.supplierName
  buyer?: string; // 对应RiskAlert.assignee
  deliveryCycle?: number; // 交付周期(天数)
  urgencyLevel?: 'high' | 'medium' | 'low'; // 紧急程度

  // 时间信息 - 与RiskAlert时间字段对应
  planArrivalDate: Date; // 对应RiskAlert.plannedDate
  supplierCommitDate?: Date; // 对应RiskAlert.actualDate
  startDate: Date;
  endDate: Date;

  // 库存信息 - 与RiskAlert.stockInfo对应
  requiredQuantity: number;
  availableInventory: number;
  shortage: number; // 缺口数量

  // 生产信息(自制组件)
  productionRate?: number; // 生产效率(个/天)
  productionDays?: number; // 生产时长(天)

  // BOM层级
  bomLevel: number;
  parentCode?: string;
  relatedProductCode: string;
  childMaterials?: string[]; // 子物料编码列表(用于齐套检查)

  // Tooltip展示字段
  tooltipData: {
    status: string; // 显示在Tooltip中的状态文本
    delayDays?: number; // 对应RiskAlert.delayDays
    supplierStatus?: string; // 对应RiskAlert.supplierStatus
    riskLevel?: 'severe' | 'abnormal' | 'advance_notice'; // 对应RiskAlert.level
    impact?: string; // 影响说明
  };
}

// ============= 风险告警 =============

export type RiskLevel = 'severe' | 'abnormal' | 'advance_notice';
export type RiskCategory = 'product' | 'component' | 'material' | 'outsource';
export type RiskType = 'already_delayed' | 'delivery_change' | 'po_due_soon' | 'delivery_due_soon';

export interface RiskAlert {
  id: string;
  level: RiskLevel;
  category: RiskCategory;
  itemCode: string; // 必须与甘特图中的materialCode匹配
  itemName: string;
  riskType: RiskType;

  // 风险描述
  description: string;
  impact?: string; // 级联影响描述
  suggestions: string[]; // AI协同建议

  // 时间信息 - 与甘特图Tooltip中的时间字段匹配
  plannedDate?: Date; // 计划交期 (对应Tooltip中的"计划到货时间")
  actualDate?: Date; // 实际/承诺交期 (对应Tooltip中的"供应商承诺时间")
  delayDays?: number; // 延迟天数 (对应Tooltip中的"逾期X天")
  daysRemaining?: number; // 剩余天数(用于提前告示)

  // 关联信息 - 与甘特图Tooltip字段匹配
  relatedItems?: string[]; // 影响的上级物料/产品
  prCode?: string; // PR单号 (对应Tooltip中的"PR请购单")
  poCode?: string; // PO单号 (对应Tooltip中的"PO采购单")
  supplierName?: string; // 供应商/委外厂商 (对应Tooltip中的"供应商")
  assignee?: string; // 采购员

  // 状态信息 - 与甘特图状态匹配
  ganttStatus?: 'ready' | 'no_po' | 'po_placed' | 'normal' | 'abnormal'; // 对应甘特图状态
  supplierStatus?: string; // 供应商状态(审批中/生产中/发货中等)
  stockInfo?: {
    current: number;
    shortage: number;
  };

  // 操作按钮
  actions: {
    label: string;
    type: 'urgent_action' | 'contact_supplier' | 'remind_buyer' | 'view_detail' | 'locate_gantt';
  }[];
}

// ============= 模拟功能 =============

export type SimulationMode = 'normal' | 'abnormal';
export type SimulationEventType = 'po_placed' | 'supplier_confirm' | 'shipped' | 'arrived' |
  'delivery_delay' | 'cascade_impact';

export interface SimulationEvent {
  step: number;
  eventType: SimulationEventType;
  materialCode: string;
  materialName: string;
  changes: Partial<MaterialRequirementPlan>;
  message: string;
  ganttChange?: {
    status?: MaterialTask['status'];
    color?: string;
    label?: string;
  };
  riskChange?: {
    action: 'add' | 'update' | 'remove';
    risk?: RiskAlert;
  };
}

export interface SimulationLog {
  timestamp: Date;
  step: number;
  eventType: SimulationEventType;
  message: string;
  details?: string;
}

export interface SimulationState {
  mode: SimulationMode;
  currentStep: number;
  totalSteps: number;
  isPlaying: boolean;
  speed: 'slow' | 'medium' | 'fast';
  logs: SimulationLog[];
  events: SimulationEvent[];
}

// ============= AI助手 =============

export interface PlanningAIMessage {
  id: string;
  type: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  context?: {
    module: PlanningModuleV2;
    productCode?: string;
    materialCode?: string;
    riskId?: string;
  };
}

export interface PlanningAIAssistant {
  conversationId: string;
  messages: PlanningAIMessage[];
  isTyping: boolean;
  suggestions: string[];
}

// ============= 优化新增类型（2026-02-25） =============

/** 视图路由状态 */
export type PlanningViewMode = 'task-list' | 'new-task' | 'task-detail';

/** 新建任务流程步骤（v3.1: 四步→三步，移除生产计划步骤） */
export type NewTaskStep = 1 | 2 | 3;

/** 任务状态 */
export type TaskStatus = 'active' | 'completed' | 'incomplete' | 'expired';

/** 监测任务对象（localStorage 持久化）
 * PRD v3.1: 移除 production* 字段，新增 relatedForecastBillnos
 * demandEnd 作为甘特图倒排锚点（替代原 productionStart）
 */
export interface PlanningTask {
  id: string;
  name: string;
  status: TaskStatus;
  createdAt: string;
  updatedAt: string;
  // 步骤1 产品需求预测（PRD 7.1）
  productCode: string;
  productName: string;
  demandStart: string;       // YYYY-MM-DD（预测单最早 startdate）
  demandEnd: string;         // YYYY-MM-DD（需求截止时间，甘特图倒排锚点）
  demandQuantity: number;
  relatedForecastBillnos: string[];  // 关联的预测单号列表（v3.1 新增）
  // 任务结束相关（可选，向后兼容）
  endedAt?: string;          // 任务结束时间（ISO 格式）
  summaryReport?: TaskSummaryReport;
  // ⚠️ 已废弃字段（向后兼容读取旧任务时可能存在）
  /** @deprecated v3.1 移除，使用 demandEnd 作为甘特图锚点 */
  productionStart?: string;
  /** @deprecated v3.1 移除，使用 demandEnd */
  productionEnd?: string;
  /** @deprecated v3.1 移除，使用 demandQuantity */
  productionQuantity?: number;
}

// ============= 总结报告 =============

export interface TaskSummaryReport {
  generatedAt: string;
  planVsActual: {
    demandPeriod: { start: string; end: string };
    /** @deprecated v3.1 移除，保留用于旧报告兼容读取 */
    productionPeriod?: { start: string; end: string };
    actualInboundDate: string | null;
    inboundQuantity: number | null;
    timeDiffDays: number | null;
    hasSignificantDelay: boolean;
  };
  productCompletion: {
    plannedQuantity: number;
    inboundQuantity: number | null;
    completionRate: number | null;
  };
  materialCompletion: {
    totalMaterials: number;
    withPO: number;
    withoutPO: number;
    shortageCount: number;
    riskCount: number;
  };
  keyMaterialsSnapshot: KeyMonitorMaterial[];
}

// ============= 关键监测物料 =============

export interface KeyMonitorMaterial {
  materialCode: string;
  materialName: string;
  materialType: string;
  bomLevel: number;
  shortageQuantity: number;
  hasShortage: boolean;
  // 库存信息（从 inventory API 查询）
  inventoryQty: number | null;
  availableInventoryQty: number | null;
  newInboundQty: number | null;
  latestInboundDate: string | null;
  // 采购状态
  prStatus: string;
  poStatus: string;
  poDeliverDate?: string;
  // MRP 信息
  /** 是否有MRP记录（基于预测单号精确查询匹配） */
  hasMRP: boolean;
  dropStatusTitle: string | null;
  bizdropqty: number | null;
  // 倒排时间
  startDate: string;
  endDate: string;
  leadtime: number;
}

// ============= 库存记录 =============

export interface InventoryRecord {
  seq_no: number;
  material_code: string;
  material_name: string;
  inventory_qty: number;
  available_inventory_qty: number;
  reserved_inventory_qty: number;
  inbound_date: string;
  warehouse: string;
  stock_status: string;
  stock_type: string;
  batch_no: string;
  purchase_qty: number;
}

// ============= 任务导入导出 =============

export interface TaskExportPackage {
  version: '1.0';
  exportedAt: string;
  exportedBy: '供应链大脑';
  task: PlanningTask;
  ganttSnapshot: GanttBar[];
  keyMaterials: KeyMonitorMaterial[];
}

/** 步骤1确认数据（PRD 4.3.5） */
export interface Step1Data {
  productCode: string;
  productName: string;
  demandStart: string;
  demandEnd: string;
  demandQuantity: number;
  relatedForecastBillnos: string[];  // v3.1: 关联的预测单号列表
}

/** @deprecated v3.1 移除步骤2（生产计划），保留类型定义用于旧代码过渡 */
export interface Step2Data {
  productionStart: string;
  productionEnd: string;
  productionQuantity: number;
}

/** 物料供需状态（PRD 4.4.6 v3.7 三分类） */
export type SupplyStatus = 'shortage' | 'sufficient' | 'sufficient_no_mrp' | 'anomaly';

/** 甘特图条目（运行时，不持久化） */
export interface GanttBar {
  materialCode: string;
  materialName: string;
  bomLevel: number;          // 0=产品, 1=一级子件, 2=二级...
  parentCode: string | null;
  startDate: Date;
  endDate: Date;
  leadtime: number;
  materialType: string;      // 外购/自制/委外
  status: 'on_time' | 'risk' | 'ordered' | 'ready' | 'anomaly';
  hasShortage: boolean;
  shortageQuantity: number;
  supplyStatus: SupplyStatus;  // v3.7: 物料供需三分类
  poStatus: 'has_po' | 'no_po' | 'not_applicable';
  prStatus: 'has_pr' | 'no_pr' | 'not_applicable';
  poDeliverDate?: string;    // 最新PO交货日
  availableInventoryQty?: number;  // 可用库存数量
  /** 是否有 MRP 记录（基于预测单号精确查询的MRP物料编码集合匹配） */
  hasMRP: boolean;
  /** MRP 投放状态 */
  dropStatusTitle?: string;
  /** MRP 投放数量 */
  bizdropqty?: number;
  children: GanttBar[];
}

/** 备料（替代料）信息 */
export interface AltPartInfo {
  /** 备料物料编码 */
  materialCode: string;
  /** 备料物料名称 */
  materialName: string;
  /** 备料库存数量 */
  inventoryQty: number;
}

/** 步骤② MRP 展示行（以 MRP 记录为主表维度） */
export interface MRPDisplayRow {
  /** MRP 单号 */
  mrpBillno: string;
  /** 物料编码 */
  materialCode: string;
  /** 物料名称 */
  materialName: string;
  /** 物料属性（外购/自制/委外） */
  materialType: string;
  /** 订单数量（bizorderqty 优先，fallback adviseorderqty） */
  orderQty: number;
  /** 投放数量 */
  dropQty: number;
  /** MRP 投放状态（dropstatus_title） */
  dropStatus: string;
  /** 投放时间 */
  dropTime: string;
  /** 投放单据类型 */
  dropBillType: string;
  /** BOM 层级 */
  bomLevel: number | null;
  /** BOM 用量（standard_usage） */
  bomUsage: number | null;
  /** 备料（替代料）信息 */
  altParts: AltPartInfo[];
  /** 标准交期时长（天） */
  leadtime: number | null;
  /** 创建时间 */
  createTime: string;
  /** 可用日期 */
  availableDate: string;
  /** 是否有关联 PR */
  hasPR: boolean;
  /** 是否有关联 PO */
  hasPO: boolean;
  /** 关联的 PR 记录 */
  prRecords: PRRecord[];
  /** 关联的 PO 记录 */
  poRecords: PORecord[];
}

/** PR 记录 */
export interface PRRecord {
  billno: string;
  material_number: string;
  material_name: string;
  qty: number;
  biztime: string;
  joinqty: number;
  auditdate: string;
  org_name: string;
  billtype_name: string;
  /** 来源单据编号（对应 MRP.billno） */
  srcbillnumber: string;
}

/** PO 记录 */
export interface PORecord {
  billno: string;
  material_number: string;
  material_name: string;
  qty: number;
  biztime: string;
  deliverdate: string;
  supplier_name: string;
  operatorname: string;
  srcbillnumber: string;
  actqty: number;
}

/** BOM 原始记录 */
export interface BOMRecord {
  bom_material_code: string;
  material_code: string;
  material_name: string;
  parent_material_code: string;
  bom_level: number;
  standard_usage: number;
  bom_version: string;
  alt_part?: string;
  alt_priority?: number;
  /** 替代方式（"替代" 表示该物料有替代料） */
  alt_method?: string;
  /** 替代组号（同组号的物料互为替代关系） */
  alt_group_no?: string;
}

/** 物料主数据 */
export interface MaterialRecord {
  material_code: string;
  material_name: string;
  materialattr: string;      // 外购/自制/委外
  purchase_fixedleadtime: string;  // 字符串，需 parseFloat
  product_fixedleadtime: string;
}
