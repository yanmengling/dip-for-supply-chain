// src/types/multiProductTask.ts

import type { GanttBar } from './planningV2';

/** 大预测单多产品监测任务（taskType: 'multi-product'）
 * 与 PlanningTask / LargeForecastTask 并列，存储在独立 localStorage key。
 */
export interface MultiProductTask {
  id: string;
  taskType: 'multi-product';
  name: string;
  status: 'active' | 'completed' | 'incomplete' | 'expired' | 'ended';
  /** 来源大预测单单号 */
  forecastBillno: string;
  /** 创建时的元数据快照 */
  forecastMeta: {
    bizdate: string;
    auditorName: string;
    creatorName: string;
    /** 产品明细行总数（创建时快照，不含已关闭行）*/
    totalProducts: number;
  };
  /** 包含的产品列表（创建时快照，按交货截止日升序）*/
  products: MultiProductItem[];
  createdAt: string;
  updatedAt: string;
}

/** 大预测单下的单个产品信息 */
export interface MultiProductItem {
  /** 产品编码（material_number）*/
  productCode: string;
  productName: string;
  /** 计划数量 */
  qty: number;
  /** 预测开始日 */
  startDate: string;
  /** 交货截止日（甘特图倒排锚点）*/
  endDate: string;
  /** 预测单明细行所属大预测单单号（对应 ForecastRecordAPI.billno，用于 MRP 精确查询）*/
  billno: string;
}

/** 共用物料（同一大预测单下 2+ 产品 BOM 中均包含的物料）*/
export interface SharedMaterial {
  materialCode: string;
  materialName: string;
  materialType: string;
  /** 关联产品列表（按 endDate 升序排列，第一个为倒排基准产品）*/
  relatedProducts: SharedMaterialProduct[];
  /** 各产品折算需求量之和（BOM展开毛需求，不扣库存）*/
  totalRequiredQty: number;
  /** MRP 修正数量（bizorderqty 之和，来自 MRP 记录）*/
  mrpQty: number | null;
  /** 差异（totalRequiredQty - mrpQty），null 表示无法计算 */
  qtyDiff: number | null;
  /** 倒排基准产品（交货截止日最早的产品）*/
  anchorProductCode: string;
  /** 库存是否充足（库存 + 在途 >= totalRequiredQty）*/
  canFulfillAll: boolean;
  /** 分配建议（库存不足时）*/
  allocationSuggestion?: AllocationSuggestion;
}

/** 共用物料与某产品的关联信息 */
export interface SharedMaterialProduct {
  productCode: string;
  productName: string;
  /** 该产品在预测单中的计划数量 */
  qty: number;
  /** 交货截止日 */
  endDate: string;
  /** 该物料在该产品 BOM 中的折算需求量（预测数量 × BOM路径连乘积，不扣库存）*/
  requiredQty: number;
  /** BOM 展开路径描述（如 "P1 → A002(×2) → M001(×3)"）*/
  bomPath: string;
  /** BOM 层级 */
  bomLevel: number;
}

/** 分配建议（库存不足时，按交期优先级建议分配）*/
export interface AllocationSuggestion {
  /** 可用总量（库存 + 在途）*/
  availableQty: number;
  /** 按交期优先级的建议分配方案 */
  allocations: {
    productCode: string;
    productName: string;
    requiredQty: number;
    /** 建议分配数量 */
    suggestedQty: number;
    /** 是否能满足 */
    canFulfill: boolean;
  }[];
}

/** multiProductGanttService.buildMultiProductGanttData 的返回结果 */
export interface MultiProductGanttResult {
  /** 各产品的甘特图结果（key = productCode）*/
  productGantts: Map<string, MultiProductGanttEntry>;
  /** 共用物料分析结果（key = materialCode）*/
  sharedMaterials: Map<string, SharedMaterial>;
  /** 独占物料（仅被一个产品 BOM 包含）的 materialCode 集合 */
  exclusiveMaterialCodes: Set<string>;
}

/** 单个产品的甘特图结果 */
export interface MultiProductGanttEntry {
  productCode: string;
  productName: string;
  qty: number;
  endDate: string;
  bars: GanttBar[];
  /** 是否加载成功 */
  loaded: boolean;
  /** 加载错误信息（BOM 缺失等）*/
  errorMsg?: string;
  /** 自制件 MRP 计划订单单号列表（用于关联生产工单，来自 GanttBuildResult）*/
  selfMadeMrpBillnos: string[];
  /** MRP billno → 投放时间映射（来自 GanttBuildResult）*/
  selfMadeMrpDroptimeMap: Record<string, string>;
}
