/**
 * ChainNeural Type Ontology
 * 
 * This file serves as the single source of truth for all data types used throughout
 * the application. All TypeScript interfaces, types, and data structures MUST be
 * defined here or extend from types defined here.
 * 
 * Principle: All data types MUST conform to src/types/ontology.ts
 */

// ============================================================================
// Core Entity Types
// ============================================================================

/**
 * Supplier entity - represents a supplier in the supply chain
 */
export interface Supplier {
  supplierId: string;        // 供应商ID
  supplierName: string;       // 供应商名称
  materialName: string;       // 供应物料名称
  materialCode: string;       // 物料编码
  // 扩展属性
  contactPhone?: string;      // 联系电话
  contactEmail?: string;      // 联系邮箱
  address?: string;           // 地址
  creditRating?: string;      // 信用评级
  cooperationYears?: number;  // 合作年限
  annualPurchaseAmount?: number; // 年采购金额
  qualityRating?: number;     // 质量评分（0-100）
  riskRating?: number;        // 风险评级（0-100，越低越好）
  onTimeDeliveryRate?: number; // 准时交付率（0-100）
  financialStatus?: string;   // 财务状态
}

/**
 * Material entity - represents a material/component used in production
 */
export interface Material {
  materialCode: string;       // 物料编码
  materialName: string;       // 物料名称
  applicableProductIds: string[]; // 物料适用产品编号（数组）
  // 时间字段（YYYY-MM-DD格式）
  warehouseInDate?: string;   // 入库时间
  warehouseOutDate?: string;  // 出库时间（新增字段，可选）
  // 状态字段
  status?: '呆滞' | '正常' | '异常' | '慢动';
  // 库存量字段（单位：件）
  maxStock?: number;          // 最大库存量（默认：10000）
  minStock?: number;          // 最低库存量（默认：10）
  currentStock?: number;      // 当前库存量（单位：件）
  // 新增字段
  bomId?: string;             // 编目/BOM ID
  inventoryDistribution?: {
    available: number;        // 可用库存
    locked: number;           // 锁定库存
    inTransit: number;        // 在途库存
    scrapped: number;         // 报废库存
  };
}

/**
 * MaterialStock entity - represents inventory levels for materials by supplier
 */
export interface MaterialStock {
  materialCode: string;       // 物料编码
  supplierId: string;         // 供应商ID
  remainingStock: number;      // 剩余库存数量
  purchaseTime: string;       // 采购时间
  purchaseQuantity: number;    // 采购数量
}

/**
 * Product entity - represents a finished product
 */
export interface Product {
  productId: string;          // 产品编号
  productName: string;        // 产品名称
  materialCodes: string[];    // 物料编码（数组，BOM结构）
  // 生命周期时间字段（YYYY-MM-DD格式）
  startSalesDate?: string;    // 开始销售时间
  stopSalesDate?: string;     // 停止销售时间
  stopExpansionDate?: string;  // 停止扩容时间
  stopServiceDate?: string;    // 停止服务时间
  // 状态字段
  status?: '销售中' | '停止销售' | '停止扩容' | '停止服务';
  // 库存字段
  stockQuantity?: number;      // 库存数量（单位：个）
  stockUnit?: string;          // 库存单位（如："套"）
  // 新增字段
  bomId?: string;             // BOM ID
  inventoryStatus?: '正常' | '呆滞' | '慢动' | '缺货'; // 产品库存状态
  inventoryDistribution?: {
    available: number;        // 可用库存
    locked: number;           // 锁定库存
    inTransit: number;        // 在途库存
    scrapped: number;         // 报废库存
  };
}

/**
 * Order entity - represents a customer order
 */
export interface Order {
  orderId: string;
  orderName: string;
  client: string;
  productId: string;
  quantity: number;
  orderDate: string;
  dueDate: string;
  status: string;
  // 新增时间字段（YYYY-MM-DD格式）
  orderInitiateDate?: string; // 订单发起时间
  plannedArrivalDate?: string; // 计划到货时间
}

/**
 * 扩展订单实体 - 用于订单交付视图
 * 包含销售订单、发货、生产等完整信息
 */
export interface DeliveryOrder {
  // 基础订单信息
  orderId: string;                    // 订单ID
  orderNumber: string;                // 订单编号
  orderName: string;                  // 订单名称
  lineNumber?: number;                // 行号

  // 客户信息
  customerId: string;                 // 客户ID
  customerName: string;               // 客户名称

  // 产品信息
  productId: string;                  // 产品ID
  productCode: string;                // 产品编码
  productName: string;                // 产品名称
  quantity: number;                   // 数量
  unit: string;                       // 单位

  // 金额信息
  standardPrice?: number;             // 标准价格
  discountRate?: number;              // 折扣率
  actualPrice?: number;               // 实际价格
  subtotalAmount?: number;            // 小计金额
  taxAmount?: number;                 // 税额
  totalAmount?: number;               // 总金额

  // 日期信息
  documentDate: string;               // 单据日期
  orderDate: string;                  // 订单日期
  plannedDeliveryDate: string;        // 计划交付日期
  createdDate: string;                // 创建日期

  // 状态信息
  orderStatus: string;                // 订单状态：已发货、已取消、生产中等
  documentStatus: string;             // 单据状态：已确认、已取消等
  deliveryStatus?: string;            // 交付状态：运输中、已签收、已发货等

  // 业务信息
  transactionType?: string;           // 交易类型：项目销售、直销等
  salesDepartment?: string;           // 销售部门
  salesperson?: string;               // 销售人员
  isUrgent: boolean;                  // 是否加急
  contractNumber?: string;            // 合同编号
  projectName?: string;               // 项目名称
  endCustomer?: string;               // 最终客户

  // 物流信息
  shipmentId?: string;                // 发货单ID
  shipmentNumber?: string;            // 发货单号
  shipmentDate?: string;              // 发货日期
  warehouseId?: string;               // 仓库ID
  warehouseName?: string;             // 仓库名称
  consignee?: string;                 // 收货人
  consigneePhone?: string;            // 收货人电话
  deliveryAddress?: string;           // 交货地址
  logisticsProvider?: string;         // 物流商
  trackingNumber?: string;            // 物流单号
  estimatedDeliveryDate?: string;     // 预计送达日期
  actualDeliveryDate?: string;        // 实际送达日期

  // 生产信息
  productionOrderId?: string;         // 生产订单ID
  productionOrderNumber?: string;     // 生产订单号
  factoryId?: string;                 // 工厂ID
  factoryName?: string;               // 工厂名称
  productionLine?: string;            // 生产线
  plannedStartDate?: string;          // 计划开始日期
  plannedFinishDate?: string;         // 计划完成日期
  workOrderStatus?: string;           // 工单状态
  priority?: string;                  // 优先级

  // 备注
  notes?: string;                     // 备注

  // 状态标识
  status: 'Active' | 'Inactive';      // 记录状态
}

/**
 * ActionHistory entity - represents action execution history
 */
export interface ActionHistory {
  actionId: string;           // 行动ID（主键）
  entityType: EntityType;     // 实体类型
  entityId: string;            // 实体ID
  actionName: string;         // 行动名称
  executedAt: string;          // 执行时间（YYYY-MM-DD）
  executedBy?: string;         // 执行人
  result?: string;             // 执行结果
}


// ============================================================================
// Graph Visualization Types
// ============================================================================

/**
 * Node type enumeration for supply chain graph visualization
 */
export type NodeType = 'SUPPLIER' | 'MATERIAL' | 'PRODUCT' | 'ORDER';

/**
 * GraphNode - represents a node in the supply chain visualization graph
 */
export interface GraphNode {
  id: string;
  name: string;
  type: NodeType;
  [key: string]: any; // Additional properties (status, stock, etc.)
}

/**
 * GraphLink - represents a relationship/edge in the supply chain graph
 */
export interface GraphLink {
  from: string;  // Source node ID
  to: string;    // Target node ID
}

/**
 * GraphData - complete graph structure containing all nodes and links
 */
export interface GraphData {
  suppliers: GraphNode[];
  materials: GraphNode[];
  products: GraphNode[];
  orders: GraphNode[];
  links: GraphLink[];
}

// ============================================================================
// Status and State Types
// ============================================================================

/**
 * Supplier health status
 */
export type SupplierStatus = 'normal' | 'risk';

/**
 * Order status
 */
export type OrderStatus = 'inTransit' | 'inProduction';

/**
 * Locale type for internationalization
 */
export type Locale = 'zh' | 'en';

// ============================================================================
// Supplier Evaluation Types (Legacy - 7 dimensions)
// ============================================================================

/**
 * Evaluation dimension names - 7 core dimensions for supplier evaluation
 * @deprecated Replaced by Supplier360Scorecard with 4 dimensions
 */
export type DimensionName =
  | 'quality'           // 质量
  | 'delivery'          // 交付
  | 'price'             // 价格
  | 'service'           // 服务
  | 'compliance'        // 合规性
  | 'technical'        // 技术能力
  | 'financial';        // 财务健康

/**
 * Risk level classification based on total evaluation score
 */
export type RiskLevel =
  | 'low'        // 低风险: score >= 80
  | 'medium'     // 中风险: score >= 60 and < 80
  | 'high'       // 高风险: score >= 40 and < 60
  | 'critical';  // 严重风险: score < 40

/**
 * Evaluation dimension - represents a single dimension score within an evaluation
 * @deprecated Replaced by Supplier360Scorecard dimensions
 */
export interface EvaluationDimension {
  dimensionName: DimensionName;      // One of 7 dimension names
  score: number;                     // Score for this dimension (0-100)
  weight: number;                    // Weight for weighted average (default: 1/7)
  source: 'manual' | 'auto' | 'hybrid'; // How score was determined
  calculatedAt?: string;             // ISO timestamp if auto-calculated
  notes?: string;                    // Optional dimension-specific notes
}

/**
 * Supplier evaluation - represents a complete evaluation record for a supplier at a specific point in time
 * @deprecated Replaced by Supplier360Scorecard
 */
export interface SupplierEvaluation {
  evaluationId: string;              // Unique evaluation ID
  supplierId: string;                // Reference to Supplier.supplierId
  evaluationDate: string;            // ISO date string (YYYY-MM-DD)
  evaluator: string;                 // User ID or name who performed evaluation
  totalScore: number;                // Weighted average score (0-100)
  riskLevel: RiskLevel;              // Calculated risk level
  dimensions: EvaluationDimension[]; // Array of 7 dimension scores
  notes?: string;                    // Optional evaluation notes
  createdAt: string;                 // ISO timestamp
  updatedAt: string;                 // ISO timestamp
}

/**
 * Evaluation history - collection of historical evaluations for trend analysis
 */
export interface EvaluationHistory {
  supplierId: string;
  evaluations: SupplierEvaluation[];  // Sorted by evaluationDate (newest first)
  trend: {
    score: number;                    // Trend direction: -1 (down), 0 (stable), 1 (up)
    change: number;                   // Score change from previous evaluation
    period: string;                    // Time period for trend calculation
  };
}

// ============================================================================
// Supplier Evaluation Types (Updated - 360° Scorecard)
// ============================================================================

/**
 * Quality event type for material-supplier relationships
 */
export type QualityEventType = 'defect' | 'delay' | 'rejection' | 'complaint';

/**
 * Quality event severity level
 */
export type QualityEventSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Quality event - represents a quality-related event for a material-supplier relationship
 */
export interface QualityEvent {
  eventId: string;                    // Unique event ID
  materialCode: string;                // Material code
  supplierId: string;                 // Supplier ID
  eventType: QualityEventType;        // Event type
  severity: QualityEventSeverity;     // Severity level
  description: string;                 // Event description
  eventDate: string;                   // ISO date string
  resolved: boolean;                   // Whether event is resolved
  resolutionDate?: string;            // ISO date string if resolved
}

/**
 * Main material supplier - represents a main material and its current supplier relationship
 */
export interface MainMaterialSupplier {
  materialCode: string;              // Material code
  materialName: string;               // Material name
  supplierId: string;                 // Current supplier ID
  supplierName: string;               // Current supplier name
  currentStock: number;                // Current stock quantity (Material.currentStock)
  qualityRating: number;               // Quality rating (0-100, generated if 0 or null)
  riskRating: number;                  // Risk rating (0-100, lower is better, generated if 0 or null)
  onTimeDeliveryRate: number;          // On-time delivery rate (0-100, percentage, generated if 0 or null)
  annualPurchaseAmount: number;       // Total annual purchase amount (calculated, generated if 0 or null)
  riskCoefficient: number;            // Risk coefficient (0-100)
  qualityEvents: QualityEvent[];     // Array of quality events
  rank: number;                       // Rank by current stock (1-5)
}

/**
 * Legal risk type
 */
export type LegalRiskType = 'major_pledge' | 'legal_restriction' | 'lawsuit' | 'other';

/**
 * Legal risk - represents a legal risk item for a supplier
 */
export interface LegalRisk {
  type: LegalRiskType;               // Risk type
  description: string;                 // Risk description
  severity: 'low' | 'medium' | 'high' | 'critical'; // Severity level
  date: string;                        // ISO date string
  source: string;                      // Data source identifier
}

/**
 * Risk assessment - represents comprehensive risk assessment for a supplier
 */
export interface RiskAssessment {
  supplierId: string;                 // Supplier ID
  assessmentDate: string;              // ISO date string
  financialStatus: {
    score: number;                     // 0-100
    creditRating?: string;            // Optional credit rating
    lastUpdated: string;               // ISO timestamp
  };
  publicSentiment: {
    score: number;                     // 0-100 (higher = more positive)
    source: 'manual';                  // Always manual per FR-004.1
    lastUpdated: string;               // ISO timestamp
    notes?: string;                    // Optional notes
  };
  productionAnomalies: {
    count: number;                     // Number of anomalies
    severity: 'low' | 'medium' | 'high' | 'critical';
    source: 'manual';                  // Always manual per FR-004.1
    lastUpdated: string;               // ISO timestamp
    details?: string;                  // Optional details
  };
  legalRisks: {
    score: number;                     // 0-100 (higher = more risk)
    source: 'auto';                    // Always auto per FR-004.1
    lastUpdated: string;               // ISO timestamp
    risks: LegalRisk[];                // Array of legal risk items
  };
  overallRiskLevel: RiskLevel;        // Overall risk level
}

/**
 * Supplier 360° scorecard - represents a supplier's 360° evaluation scorecard
 * Replaces the previous 7-dimension evaluation system (FR-003.1)
 */
export interface Supplier360Scorecard {
  supplierId: string;                 // Supplier ID
  supplierName: string;                // Supplier name
  evaluationDate: string;              // ISO date string
  dimensions: {
    onTimeDeliveryRate: number;        // 0-100 score (dimension 1)
    qualityRating: number;             // 0-100 score (dimension 2)
    riskRating: number;                  // 0-100 score (dimension 3, lower is better)
    onTimeDeliveryRate2: number;        // 0-100 score (dimension 4, duplicate for display)
    annualPurchaseAmount: number;       // Display metric only, not scored (dimension 5)
    responseSpeed: number;             // 0-100 score (dimension 6)
  };
  riskAssessment: RiskAssessment;      // Risk assessment details
  overallScore: number;                // Weighted average (0-100, excludes annualPurchaseAmount)
}

/**
 * Alternative supplier - represents an alternative supplier recommendation for switching
 */
export interface AlternativeSupplier {
  supplierId: string;                 // Alternative supplier ID
  supplierName: string;                // Supplier name
  materialCode: string;                // Material code this alternative applies to
  similarityScore: number;             // Similarity score (0-100)
  recommendationReason: string;       // Why this supplier is recommended
  comparison: {
    onTimeDeliveryRate: number;        // Comparison score
    quality: number;                   // Comparison score
    price: number;                     // Comparison score
    responseSpeed: number;             // Comparison score
    riskLevel: RiskLevel;
  };
  availability: boolean;               // Whether supplier is available
}

/**
 * Supplier comparison - represents comparison data for two-step confirmation workflow
 */
export interface SupplierComparison {
  currentSupplier: {
    supplierId: string;
    supplierName: string;
    materialCode: string;
    materialName: string;
    scorecard: Supplier360Scorecard;
  };
  alternativeSuppliers: AlternativeSupplier[];
  affectedOrders: {
    orderId: string;
    orderName: string;
    impact: 'none' | 'minor' | 'moderate' | 'major';
  }[];
}

// ============================================================================
// Product Supply Optimization Types
// ============================================================================

/**
 * Stockout risk level classification
 */
export type StockoutRiskLevel = 'low' | 'medium' | 'high' | 'critical';

/**
 * Forecast confidence level
 */
export type ForecastConfidenceLevel = 'low' | 'medium' | 'high';

/**
 * Optimization suggestion type
 */
export type SuggestionType = 'replenish' | 'clearance' | 'safety_stock_adjustment';

/**
 * Optimization suggestion priority level
 */
export type SuggestionPriority = 'high' | 'medium' | 'low';

/**
 * Risk severity level
 */
export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Risk type classification
 */
export type RiskType = 'inventory' | 'supplier' | 'forecast' | 'quality';

/**
 * Product supply analysis - represents comprehensive supply analysis metrics for a product
 */
export interface ProductSupplyAnalysis {
  productId: string;                    // Product ID (references Product.productId)
  productName: string;                  // Product name
  supplierCount: number;                // Number of suppliers for this product
  averageDeliveryCycle: number;         // Average delivery cycle in days
  supplyStabilityScore: number;         // Supply stability score (0-100)
  currentInventoryLevel: number;        // Current inventory level (units)
  stockoutRiskLevel: StockoutRiskLevel; // Stockout risk level
  lastUpdated: string;                  // ISO timestamp
}

/**
 * Demand forecast - represents demand forecast for a product over a future period
 */
export interface DemandForecast {
  productId: string;                    // Product ID (references Product.productId)
  productName: string;                  // Product name
  forecastPeriod: number;               // Forecast period in days (30, 60, 90)
  predictedDemand: number;              // Predicted demand quantity
  confidenceLevel: ForecastConfidenceLevel; // Confidence level
  calculationMethod: 'moving_average' | 'exponential_smoothing' | 'linear_regression';  // Calculation method used
  forecastModel: string;                // Forecast model name (e.g., "移动平均", "指数平滑", "线性回归")
  historicalDataPoints: number;         // Number of historical data points used
  lastUpdated: string;                 // ISO timestamp
}

/**
 * Optimization suggestion - represents an optimization suggestion for inventory management
 */
export interface OptimizationSuggestion {
  suggestionId: string;                 // Unique suggestion ID
  productId: string;                    // Product ID (references Product.productId)
  productName: string;                  // Product name
  suggestionType: SuggestionType;        // Type of suggestion
  priority: SuggestionPriority;         // Priority level
  reason: string;                       // Reason for suggestion
  currentValue: number;                  // Current value (inventory, safety stock, etc.)
  suggestedValue: number;                // Suggested value
  unit: string;                          // Unit of measurement
  estimatedImpact: string;               // Estimated impact description
  createdAt: string;                     // ISO timestamp
}

/**
 * Supply risk alert - represents a risk alert for potential supply chain disruptions
 */
export interface SupplyRiskAlert {
  alertId: string;                      // Unique alert ID
  productId: string;                    // Product ID (references Product.productId)
  productName: string;                   // Product name
  riskType: RiskType;                    // Type of risk
  severity: RiskSeverity;                // Severity level
  title: string;                         // Alert title
  description: string;                   // Alert description
  affectedSuppliers?: string[];          // Affected supplier IDs (optional)
  affectedMaterials?: string[];           // Affected material codes (optional)
  detectedAt: string;                   // ISO timestamp when risk was detected
  acknowledged: boolean;                 // Whether alert has been acknowledged
  acknowledgedAt?: string;               // ISO timestamp when acknowledged (optional)
  riskDirection?: 'upstream' | 'downstream'; // Risk direction: upstream (supply) or downstream (market)
  impactProduct?: string;                // Impacted product name
  impactDesc?: string;                   // Impact description
  action?: string;                       // Recommended action
}

/**
 * Product lifecycle stage
 */
export type ProductLifecycleStage = 'Intro' | 'Growth' | 'Maturity' | 'Decline';

/**
 * Product action type based on lifecycle and ROI
 */
export type ProductActionType = 'discontinue' | 'upgrade' | 'promote';

/**
 * Product lifecycle assessment - represents product lifecycle and ROI analysis
 */
export interface ProductLifecycleAssessment {
  productId: string;                    // Product ID (references Product.productId)
  productName: string;                  // Product name
  stage: ProductLifecycleStage;         // Lifecycle stage
  roi: string;                          // ROI percentage (e.g., "18.5%")
  revenue: string;                       // Annual revenue (e.g., "¥ 1,200w")
  stock: string;                        // Stock level description (e.g., "High (120台)")
  actionType: ProductActionType;         // Recommended action type
  suggestion: string;                   // Action suggestion description
}

/**
 * BOM component status
 */
export type BOMComponentStatus = 'In Stock' | 'Procure' | 'NPI';

/**
 * BOM recommendation component
 */
export interface BOMRecommendationComponent {
  component: string;                    // Component name (e.g., "动力电机")
  part: string;                          // Part/model name (e.g., "M-202 Pro (复用)")
  cost: string;                          // Component cost (e.g., "¥ 450")
  status: BOMComponentStatus;            // Component status
}

/**
 * BOM recommendation - represents a BOM configuration recommendation
 */
export interface BOMRecommendation {
  type: 'bom_recommendation';
  data: BOMRecommendationComponent[];  // Array of BOM components
  totalCost: string;                     // Total BOM cost (e.g., "¥ 18,500 (预估)")
  optimization: string;                   // Optimization note
}


// ============================================================================
// Configuration Backend Types
// ============================================================================

/**
 * Entity type enumeration for configuration backend
 */
export type EntityType =
  | 'supplier'    // 供应商
  | 'material'    // 物料
  | 'factory'     // 工厂
  | 'product'     // 产品
  | 'warehouse'   // 仓库
  | 'order'       // 订单
  | 'logistics'   // 物流
  | 'customer';   // 客户

/**
 * Entity relation - represents a relationship between entities
 */
export interface EntityRelation {
  targetType: EntityType;                    // Target entity type
  relationType: '多对多' | '多对一' | '一对多'; // Type of relationship
  count: number;                              // Number of related entities
  sampleItems: string[];                      // Sample item names/IDs (max 3 items)
}

/**
 * Business logic rule - represents a business logic rule (validation, calculation, or trigger)
 */
export interface BusinessLogicRule {
  ruleId: string;                              // Unique rule identifier
  ruleType: 'validation' | 'calculation' | 'trigger'; // Type of rule
  name: string;                                // Rule name (e.g., "库存预警", "ROI计算")
  condition?: string;                         // Condition expression (for validation and trigger rules)
  formula?: string;                           // Calculation formula (for calculation rules)
  level?: 'warning' | 'critical';            // Severity level (for validation rules)
  unit?: string;                              // Unit of measurement (for calculation rules)
  action?: string;                            // Action to take (for trigger rules)
}

/**
 * Entity action - represents a predefined action available for an entity
 */
export interface EntityAction {
  actionId: string;                           // Unique action identifier
  name: string;                               // Action name (e.g., "生命周期管理", "BOM变更")
  icon: string;                                // Icon name (Lucide React icon name)
  color: string;                              // Color theme (e.g., "blue", "emerald", "amber")
  description: string;                        // Action description
}

/**
 * Permission configuration - permission configuration for an entity
 */
export interface PermissionConfig {
  roles: string[];                             // List of role IDs that have access
  users: number[];                            // List of user IDs that have access
}

/**
 * Entity configuration - configuration metadata for an entity
 */
export interface EntityConfig {
  entityId: string;                           // Unique entity identifier
  entityType: EntityType;                     // Type of entity
  attributes: Record<string, any>;            // Entity attributes (code, name, type, etc.)
  relations: EntityRelation[];                // List of entity relations
  logicRules: BusinessLogicRule[];            // List of business logic rules
  actions: EntityAction[];                    // List of available actions
  permissions: PermissionConfig;               // Permission configuration
}

/**
 * User - system user with role, department, and status information
 */
export interface User {
  userId: number;                              // Unique user identifier
  name: string;                                // User name (e.g., "张伟")
  role: string;                                // Role ID (e.g., "admin", "procurement", "production", "product", "sales")
  email: string;                              // User email address
  phone: string;                              // User phone number
  avatar: string;                             // Avatar emoji or URL
  department: string;                         // Department name (e.g., "供应链中心", "采购部")
  status: 'active' | 'inactive';              // User status
}

/**
 * Role - predefined role with color coding and permission scope
 */
export interface Role {
  roleId: string;                             // Unique role identifier
  name: string;                               // Role display name (e.g., "供应链管理员", "采购总监")
  color: string;                              // Color theme for UI (e.g., "purple", "blue", "emerald")
}

// ============================================================================
// Agent API Types
// ============================================================================

/**
 * Copilot Rich Content - rich content structure for copilot responses
 */
export interface CopilotRichContent {
  type: 'bom_recommendation' | 'supplier_analysis' | 'inventory_alert' | 'text';
  title?: string;
  data?: any[];
  totalCost?: string;
  optimization?: string;
}

/**
 * Agent API Message Content
 */
export interface AgentMessageContent {
  text: string;
  temp_files?: Array<{
    id: string;
    name: string;
    type: string;
  }>;
  final_answer?: {
    query: string;
    answer: {
      text: string;
      cites?: Record<string, any>;
      ask?: Record<string, any>;
    };
    temp_files?: any[];
    thinking?: string;
    skill_process?: Array<{
      agent_name: string;
      text: string;
      cites?: Record<string, any>;
      status: string;
      type: string;
      thinking?: string;
      input_message?: Record<string, any>;
      interrupted?: boolean;
      related_queries?: Array<{
        query: string;
      }>;
    }>;
  };
  middle_answer?: Array<{
    doc_retrieval?: string;
    graph_retrieval?: string;
    middle_output_vars?: any[];
  }>;
}

// ============================================================================
// BOM项类型定义（用于MPS甘特图）
// ============================================================================

/**
 * BOM项类型（用于MPS数据服务）
 */
export interface BOMItem {
  bom_id: string;
  parent_code: string;
  child_code: string;
  child_name: string;
  quantity?: number;
  unit?: string;
  alternative_part?: string | null;
  alternative_group?: number | null;
  relationship_type?: string;
  sequence?: number;
  effective_date?: string;
  expiry_date?: string;
  loss_rate?: number;
  type?: 'product' | 'module' | 'component' | 'material';
  inventory?: number;
  producible?: number;
  capacityLimit?: number;
  deliveryCycle?: number;
  processingTime?: number;
  quantityPerSet?: number;
  children?: BOMItem[];
}

/**
 * BOM树节点类型（用于buildBOMTree函数）
 */
export interface BOMNode {
  code: string;
  name: string;
  type: 'product' | 'component' | 'material';
  level: number;
  quantity?: number;
  unit?: string;
  children: BOMNode[];
  isExpanded: boolean;
  alternativeGroup?: number | null;
  alternatives?: BOMNode[];
  isAlternative: boolean;
}

/**
 * 产品API类型（用于mpsDataService）
 */
export interface APIProduct {
  product_code: string;
  product_name: string;
  product_model?: string;
  product_series?: string;
  product_type?: string;
  amount?: number;
}

/**
 * 计划信息（用于MPS面板）
 */
export interface PlanInfo {
  productCode: string;
  productName: string;
  productionPlanQuantity: number;
  inventoryQuantity: number;
  safetyStock: number;
  pendingOrderQuantity: number;
}

// ============================================================================
// 甘特图任务类型（用于MPS甘特图）
// ============================================================================

/**
 * 生产计划模式类型
 */
export type ProductionPlanMode = 'default' | 'material-ready-v2';

/**
 * 甘特图任务实体
 */
export interface GanttTask {
  id: string;
  name: string;
  type: 'product' | 'module' | 'component' | 'material';
  level: number;
  startDate: Date;
  endDate: Date;
  duration: number;
  status: 'normal' | 'warning' | 'critical';
  children?: GanttTask[];
  // UI Properties
  bomNode?: BOMNode;
  left?: number;
  width?: number;
}

/**
 * 齐套模式V2甘特任务（扩展GanttTask）
 * 支持倒排排程和库存就绪状态显示
 */
export interface MaterialReadyGanttTask extends Omit<GanttTask, 'status'> {
  code: string;                     // 编码（产品编码/物料编码）

  // 状态属性
  status: 'ready' | 'not-ready' | 'overdue' | 'normal';
  isReady: boolean;                 // 库存是否就绪

  // 数量属性
  requiredQuantity: number;         // 需求数量
  availableInventory: number;       // 可用库存

  // 生产/交付属性（根据类型不同，使用不同字段）
  productionRate?: number;          // 生产效率（产品/组件），如1000表示每天1000件
  deliveryDuration?: number;        // 交付周期（物料），天数
  assemblyTime?: number;            // 组装时长（天数）

  // 物料类型（用于区分组件和物料）
  materialType?: '自制' | '外购' | '委外';

  // 损耗率
  lossRate?: number;                // 损耗率（0-1之间的小数）

  // 子件用量
  childQuantity?: number;           // BOM中的子件用量

  // 树形结构
  children?: MaterialReadyGanttTask[];
  isExpanded: boolean;
  canExpand: boolean;
  parentId?: string;
}

/**
 * 齐套模式V2计算结果
 */
export interface MaterialReadyCalculationResult {
  tasks: MaterialReadyGanttTask[];
  totalCycle: number;               // 总周期（天）
  planStartDate: Date;              // 计划开始时间
  planEndDate: Date;                // 计划结束时间
  actualStartDate: Date;            // 实际开始时间
  actualEndDate: Date;              // 实际结束时间
  isOverdue: boolean;               // 是否超期
  overdueDays: number;              // 超期天数（负数表示提前完成）
  readyMaterials: string[];         // 就绪物料编码列表
  notReadyMaterials: string[];      // 未就绪物料编码列表
  risks: RiskAlert[];               // 风险提示列表
}

/**
 * 物料需求分析结果
 */
export interface MaterialRequirementAnalysis {
  materialCode: string;
  materialName: string;
  requiredQuantity: number;         // 需求数量
  currentInventory: number;         // 当前库存
  shortage: number;                 // 短缺数量
  deliveryCycle: number;            // 交付周期（天）
  arrivalDate: Date;                // 预计到货日期
  canSupportQuantity: number;       // 库存可支持的生产数量
  quantityPerUnit: number;          // 每单位产品所需数量
}

/**
 * 生产阶段（用于交付优先模式）
 */
export interface ProductionPhase {
  phaseId: string;
  phaseName: string;
  phaseType: 'production' | 'waiting';
  startDate: Date;
  endDate: Date;
  quantity?: number;                // 生产数量（生产阶段）
  reason?: string;                  // 等待原因（等待阶段）
  waitingMaterials?: string[];      // 等待的物料列表
}

/**
 * 扩展的甘特任务（用于旧版计算器）
 */
export interface GanttTaskExtended extends GanttTask {
  mode?: ProductionPlanMode;
  isExpanded?: boolean;
  canExpand?: boolean;
  parentId?: string;
  bomItem?: BOMItem;
  materialAnalysis?: MaterialRequirementAnalysis[];
  phases?: ProductionPhase[];
}

/**
 * 甘特图计算结果（通用）
 */
export interface GanttCalculationResult {
  totalCycle: number;
  tasks: GanttTaskExtended[];
  risks: RiskAlert[];
  materialAnalysis: MaterialRequirementAnalysis[];
  completionDate: Date;
}

/**
 * 风险提示实体
 */
export interface RiskAlert {
  type: string;
  level: 'warning' | 'critical';
  message: string;
  itemId: string;
  itemName: string;
  aiSuggestion: string;
}

/**
 * 时间范围类型（用于甘特图）
 */
export interface TimeRange {
  start: Date;
  end: Date;
}

export interface AgentMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: AgentMessageContent;
  content_type: string;
  status: string;
  reply_id: string;
  agent_info?: {
    agent_id: string;
    agent_name: string;
    agent_status: string;
    agent_version: string;
  };
  index: number;
}

/**
 * Conversation Session
 */
export interface Conversation {
  id: string;
  title: string;
  agent_app_key: string;
  message_index: number;
  create_time: number;
  update_time: number;
  create_by: string;
  update_by: string;
  ext: string;
  messages?: Array<{
    id: string;
    conversation_id: string;
    agent_app_key: string;
    agent_id: string;
    agent_version: string;
    reply_id: string;
    index: number;
    role: 'user' | 'assistant';
    content: string;
    content_type: string;
    status: string;
    ext: string;
    create_time: number;
    update_time: number;
    create_by: string;
    update_by: string;
  }>;
}

/**
 * Agent Configuration
 */
export interface AgentConfig {
  agent_id: string;
  agent_name: string;
  agent_version?: string;
  chat_mode?: 'normal' | 'deep_thinking';
}

/**
 * Stream Response Types
 */
export type StreamMessageType = 'message' | 'end' | 'error';

export interface StreamMessage {
  type: StreamMessageType;
  data?: {
    conversation_id: string;
    user_message_id: string;
    assistant_message_id: string;
    message: AgentMessage;
    status: string;
  };
  error?: string;
}

// ============================================================================
// Knowledge Network Configuration Types
// ============================================================================

/**
 * Knowledge Network Configuration - represents a knowledge network configuration
 */
export interface KnowledgeNetworkConfig {
  id: string;                    // Knowledge network ID
  name: string;                  // Display name
  description?: string;          // Description
  isDefault?: boolean;           // Whether this is the default network
}

/**
 * Knowledge Network Preset - represents a predefined knowledge network configuration
 */
export interface KnowledgeNetworkPreset extends KnowledgeNetworkConfig {
  category?: string;             // Category (e.g., "production", "testing")
  tags?: string[];               // Tags for filtering
}

/**
 * Knowledge Network History - represents a recently accessed knowledge network
 */
export interface KnowledgeNetworkHistory {
  id: string;                    // Knowledge network ID
  name?: string;                 // Display name (if available)
  accessedAt: number;            // Timestamp when accessed (unix milliseconds)
}

// ============================================================================
// Re-export database types for backward compatibility
// ============================================================================

/**
 * @deprecated Use types from ontology.ts directly
 * These exports maintain backward compatibility during migration
 */
export type {
  Supplier as SupplierDB,
  Material as MaterialDB,
  MaterialStock as MaterialStockDB,
  Product as ProductDB,
  Order as OrderDB,
};

// ============================================================================
// Planning Types (供应链计划 - 阶段定义)
// ============================================================================

export type PlanningStage = 'DP' | 'MPS' | 'MRP' | 'SCH';

export interface PlanningStageConfig {
  id: PlanningStage;
  label: string;
  shortLabel: string;
  order: number;
}

export interface PlanningPanelProps {
  active: boolean;
}

// ============================================================================
// Demand Planning Types (供应链计划 - 需求计划)
// ============================================================================

/**
 * 需求预测算法类型
 */
export type ForecastAlgorithm = 'prophet' | 'simple_exponential' | 'holt_linear' | 'holt_winters';

/**
 * 产品选项（用于产品选择器）
 */
export interface ProductOption {
  /** 产品ID */
  id: string;
  /** 显示名称（从API返回的display_key字段） */
  displayName: string;
}

/**
 * 产品历史销售数据
 */
export interface ProductSalesHistory {
  /** 产品ID */
  productId: string;
  /** 月份（YYYY-MM格式） */
  month: string;
  /** 销售数量 */
  quantity: number;
}

/**
 * 单个算法的预测数据
 */
export interface AlgorithmForecast {
  /** 算法类型 */
  algorithm: ForecastAlgorithm;
  /** 算法显示名称 */
  algorithmDisplayName: string;
  /** 预测值数组（18列：过去2年同期12个月 + 未来6个月） */
  forecastValues: (number | null)[];
}

/**
 * 产品需求预测（包含多个算法的预测结果）
 */
export interface ProductDemandForecast {
  /** 产品ID */
  productId: string;
  /** 产品名称 */
  productName: string;
  /** 多个算法的预测结果 */
  algorithmForecasts: AlgorithmForecast[];
  /** 历史实际销量（18列） */
  historicalActual: (number | null)[];
  /** 已确认订单（18列，历史月份为null） */
  confirmedOrder: (number | null)[];
  /** 共识需求建议（18列，计算得出） */
  consensusSuggestion: (number | null)[];
}

/**
 * 需求计划状态
 */
export interface DemandPlanningState {
  /** 选中的产品ID（单选模式） */
  selectedProduct: string | null;
  /** 选中的预测算法 */
  selectedAlgorithm: ForecastAlgorithm;
  /** 产品预测结果Map（产品ID -> 预测结果） */
  productForecasts: Map<string, ProductDemandForecast>;
  /** 加载状态 */
  loading: boolean;
  /** 错误信息 */
  error: string | null;
}

