# 生产计划甘特图重构设计文档

## 一、需求分析

### 1.1 现状分析

**现有组件结构：**
```
src/components/planning/
├── ProductionPlanningPanel.tsx    # 生产计划面板入口
├── MPSPrototype.tsx               # MPS主组件（704行）
├── GanttChartSection.tsx          # 甘特图区域容器
├── GanttBOMTree.tsx               # 树形BOM甘特图（核心）
├── GanttGridChart.tsx             # 网格甘特图（备用）
├── GanttTaskBar.tsx               # 任务条组件
├── GanttTooltip.tsx               # 工具提示
├── ProductSelector.tsx            # 产品选择器
├── ProductInfoPanel.tsx           # 产品信息面板
└── RiskAlertsPanel.tsx            # 风险提示面板
```

**现有数据流：**
1. 用户选择产品 → 加载BOM数据 → 构建GanttTask树 → 渲染甘特图
2. 当前逻辑：简单地为每个BOM项分配固定时间（物料5天，组件6天）
3. 问题：未考虑库存可用性、物料齐套、交付优先等实际生产场景

**数据模型（来自ontology.ts）：**
- `BOMItem`: BOM项，包含parent_code, child_code, quantity, alternative_part等
- `GanttTask`: 甘特图任务，包含startDate, endDate, duration, type, level, children等
- `Inventory`: 库存信息，包含material_code, inventory_data, safety_stock等
- `ProductionPlan`: 生产计划，包含order_number, code, quantity, start_time, end_time等

### 1.2 需求详解

**核心需求：实现三种生产计划模式**

| 模式 | 描述 | 适用场景 |
|------|------|----------|
| **默认模式** | 当前实现，简单固定时间 | 快速预览 |
| **物料齐套模式** | 等所有物料到齐后连续生产 | 生产效率优先 |
| **交付优先模式** | 只要满足最低开工条件就生产 | 订单交付优先 |

### 1.3 业务规则详解

#### 物料齐套后连续生产模式

**计算流程：**
```
1. BOM展开分析物料短缺
   - 遍历BOM，计算每种物料需求量 = 生产数量 × 单位用量
   - 对比库存，计算缺口 = 需求量 - 当前库存

2. 计算物料到货时间
   - 每种缺料物料有交付周期（deliveryCycle）
   - 最晚到货时间 = MAX(所有缺料物料的交付周期)

3. 计算生产时间
   - 生产能力 = 产品日产能（capacityLimit）
   - 生产周期 = 生产数量 / 日产能

4. 最终完成时间
   - 完成时间 = 物料齐套时间 + 生产周期
```

**示例（产品P 100件）：**
```
物料需求：
- X物料：需要500个（100×5），库存100，缺400，交付周期15天
- Y物料：需要1500个（100×15），库存350，缺1150，交付周期20天

计算：
- 物料齐套时间 = MAX(15, 20) = 20天
- 生产周期 = 100 / 10 = 10天
- 完成时间 = 20 + 10 = 30天
```

#### 订单交付优先模式

**计算流程：**
```
1. BOM展开分析物料短缺（同上）

2. 计算可立即生产数量
   - 对于每种物料，可支持生产数量 = 库存 / 单位用量
   - 可立即生产数量 = MIN(所有物料可支持生产数量)

3. 分段生产计划
   - 第一阶段：立即生产（用现有库存）
   - 等待阶段：等待缺料物料到货
   - 第二阶段：继续生产剩余数量

4. 最终完成时间
   - 第一阶段结束 = 第一阶段数量 / 日产能
   - 等待时间 = 最晚物料到货时间 - 第一阶段结束时间
   - 第二阶段周期 = 剩余数量 / 日产能
   - 总时间 = 第一阶段 + 等待 + 第二阶段
```

**示例（产品P 100件）：**
```
物料库存分析：
- X物料：库存100，单位用量5，可支持 100/5 = 20件
- Y物料：库存350，单位用量15，可支持 350/15 ≈ 23件
- 可立即生产 = MIN(20, 23) = 20件

分段计划：
- 第一阶段：生产20件，用时 20/10 = 2天
- 等待阶段：X物料15天后到，Y物料20天后到
  - 等待开始：第2天
  - 等待结束：第20天（最晚物料到货）
  - 等待时长：18天
- 第二阶段：生产80件，用时 80/10 = 8天
- 总时间 = 2 + 18 + 8 = 28天
```

### 1.4 甘特图显示要求

**倒排进度显示：**
- 以产品完成时间为基准，向前倒推各阶段时间
- 每个BOM项（产品、组件、物料）都显示其开始和结束时间
- 时间轴从今天开始，显示到计划完成日期

**节点折叠/展开功能：**
- 产品、一级组件、二级组件节点均可折叠/展开
- 叶子节点（最底层物料）不可折叠
- **默认展开状态：仅展开产品级别**，其他层级默认折叠
- 用户可点击展开/折叠图标查看下级节点
- 折叠状态在模式切换时保持不变

**颜色编码：**
| 类型 | 颜色 | 说明 |
|------|------|------|
| 产品 | 紫色(indigo-600) | 最终产品生产阶段 |
| 一级组件 | 蓝色(blue-500) | 模块组装阶段 |
| 二级组件 | 紫色(purple-500) | 构件加工阶段 |
| 物料 | 绿色(green-500) | 物料采购/到货阶段 |
| 警告 | 黄色(yellow-500) | 有风险但可控 |
| 严重 | 红色(red-500) | 严重风险 |
| 等待 | 灰色(slate-300) | 等待物料阶段（仅交付优先模式） |

---

## 二、技术设计

### 2.1 数据模型扩展

**新增类型定义（添加到ontology.ts）：**

```typescript
/**
 * 生产计划模式
 */
export type ProductionPlanMode = 'default' | 'material-ready' | 'delivery-priority';

/**
 * 物料需求分析结果
 */
export interface MaterialRequirementAnalysis {
  materialCode: string;
  materialName: string;
  requiredQuantity: number;      // 需求量
  currentInventory: number;       // 当前库存
  shortage: number;               // 缺口
  deliveryCycle: number;          // 交付周期（天）
  arrivalDate: Date;              // 预计到货日期
  canSupportQuantity: number;     // 现有库存可支持生产数量
}

/**
 * 生产阶段（用于交付优先模式）
 */
export interface ProductionPhase {
  phaseId: string;
  phaseName: string;
  phaseType: 'production' | 'waiting';  // 生产阶段或等待阶段
  startDate: Date;
  endDate: Date;
  quantity?: number;              // 该阶段生产数量（仅production类型）
  reason?: string;                // 等待原因（仅waiting类型）
}

/**
 * 扩展的甘特图任务（支持多阶段）
 */
export interface GanttTaskExtended extends GanttTask {
  mode?: ProductionPlanMode;      // 当前计划模式
  phases?: ProductionPhase[];     // 生产阶段（交付优先模式使用）
  materialAnalysis?: MaterialRequirementAnalysis[];  // 物料分析结果
  isWaitingPhase?: boolean;       // 是否为等待阶段
}
```

### 2.2 核心算法设计

**新建文件：`src/utils/productionPlanCalculator.ts`**

```typescript
/**
 * 生产计划计算器
 *
 * 根据不同模式计算生产计划时间安排
 */

/**
 * 计算物料需求分析
 */
function analyzeMaterialRequirements(
  bom: BOMItem[],
  plannedQuantity: number,
  inventoryMap: Map<string, number>,
  deliveryCycleMap: Map<string, number>
): MaterialRequirementAnalysis[];

/**
 * 默认模式：简单固定时间计算
 */
function calculateDefaultMode(
  product: Product,
  plannedQuantity: number,
  startDate: Date
): GanttTaskCalculationResult;

/**
 * 物料齐套模式：等所有物料到齐后连续生产
 */
function calculateMaterialReadyMode(
  product: Product,
  plannedQuantity: number,
  startDate: Date,
  materialAnalysis: MaterialRequirementAnalysis[]
): GanttTaskCalculationResult;

/**
 * 交付优先模式：分段生产
 */
function calculateDeliveryPriorityMode(
  product: Product,
  plannedQuantity: number,
  startDate: Date,
  materialAnalysis: MaterialRequirementAnalysis[]
): GanttTaskCalculationResult;

/**
 * 主计算函数
 */
export function calculateProductionPlan(
  product: Product,
  plannedQuantity: number,
  mode: ProductionPlanMode,
  startDate?: Date
): {
  totalCycle: number;
  tasks: GanttTaskExtended[];
  risks: RiskAlert[];
  materialAnalysis: MaterialRequirementAnalysis[];
};
```

### 2.3 组件架构设计

**新增/修改组件：**

```
src/components/planning/
├── MPSPrototype.tsx              # 修改：集成模式切换
├── GanttChartSection.tsx         # 修改：支持模式参数
├── GanttBOMTree.tsx              # 修改：支持多阶段显示
├── GanttTaskBar.tsx              # 修改：支持等待阶段样式
├── PlanModeSelector.tsx          # 新增：模式选择器组件
└── MaterialAnalysisPanel.tsx     # 新增：物料分析面板（可选）
```

**PlanModeSelector 组件设计：**
```tsx
interface PlanModeSelectorProps {
  currentMode: ProductionPlanMode;
  onModeChange: (mode: ProductionPlanMode) => void;
  disabled?: boolean;
}

// 三个选项：
// - 默认模式（快速预览）
// - 物料齐套模式（连续生产）
// - 交付优先模式（分段生产）
```

### 2.4 状态管理设计

**MPSPrototype 状态扩展：**
```typescript
// 新增状态
const [planMode, setPlanMode] = useState<ProductionPlanMode>('default');
const [materialAnalysis, setMaterialAnalysis] = useState<MaterialRequirementAnalysis[]>([]);

// 计算逻辑调整
const { totalCycle, tasks, risks, materialAnalysis: analysis } = useMemo(() => {
  if (!selectedProduct) return defaultResult;

  return calculateProductionPlan(
    selectedProduct,
    selectedProduct.plannedQuantity,
    planMode,
    new Date()
  );
}, [selectedProduct, planMode]);
```

### 2.5 API数据需求

**需要从API获取的额外数据：**

| 数据 | API对象类型 | 字段 | 用途 |
|------|-------------|------|------|
| 物料库存 | Inventory | inventory_data | 计算可支持生产量 |
| 物料交付周期 | 待定（可能需要新增） | delivery_cycle | 计算到货时间 |
| 产品日产能 | 待定（可能需要新增） | capacity_per_day | 计算生产周期 |

**数据获取策略：**
1. 优先从API获取真实数据
2. 缺失数据使用默认值（如交付周期默认15天，日产能默认10件）
3. 在UI上提示数据来源（API/默认值）

---

## 三、实现计划

### 3.1 开发任务分解

| 阶段 | 任务 | 文件 | 优先级 |
|------|------|------|--------|
| **阶段1：类型定义** | 扩展数据类型 | `ontology.ts` | P0 |
| **阶段2：核心算法** | 实现生产计划计算器 | `productionPlanCalculator.ts` | P0 |
| **阶段3：数据服务** | 扩展数据获取服务 | `mpsDataService.ts` | P0 |
| **阶段4：UI组件** | 模式选择器 | `PlanModeSelector.tsx` | P1 |
| **阶段5：甘特图** | 修改GanttBOMTree支持多阶段 | `GanttBOMTree.tsx` | P1 |
| **阶段6：任务条** | 修改GanttTaskBar支持等待样式 | `GanttTaskBar.tsx` | P1 |
| **阶段7：集成** | 修改MPSPrototype集成所有功能 | `MPSPrototype.tsx` | P1 |
| **阶段8：测试** | 深度测试和调试 | - | P0 |

### 3.2 文件修改清单

**需要修改的文件：**
1. `src/types/ontology.ts` - 添加新类型定义
2. `src/services/mpsDataService.ts` - 扩展数据获取
3. `src/components/planning/MPSPrototype.tsx` - 主组件集成
4. `src/components/planning/GanttChartSection.tsx` - 支持模式
5. `src/components/planning/GanttBOMTree.tsx` - 多阶段显示
6. `src/components/planning/GanttTaskBar.tsx` - 等待阶段样式
7. `src/components/planning/GanttTooltip.tsx` - 显示阶段信息

**需要新建的文件：**
1. `src/utils/productionPlanCalculator.ts` - 核心计算逻辑
2. `src/components/planning/PlanModeSelector.tsx` - 模式选择器

### 3.3 备份策略

在开始修改前，备份所有相关文件到 `.backup/` 目录：
```
.backup/gantt_refactor_YYYYMMDD/
├── src/types/ontology.ts.bak
├── src/services/mpsDataService.ts.bak
├── src/components/planning/MPSPrototype.tsx.bak
├── src/components/planning/GanttChartSection.tsx.bak
├── src/components/planning/GanttBOMTree.tsx.bak
├── src/components/planning/GanttTaskBar.tsx.bak
└── src/components/planning/GanttTooltip.tsx.bak
```

### 3.4 变更日志

创建 `gant_changelog.md` 记录所有变更：
```markdown
# 甘特图重构变更日志

## 版本 x.x.x - YYYY-MM-DD

### 新增
- ...

### 修改
- ...

### 删除
- ...

### 回滚说明
- 如需回滚，恢复 .backup/gantt_refactor_YYYYMMDD/ 中的文件
```

---

## 四、测试计划

### 4.1 功能测试

| 测试项 | 测试内容 | 预期结果 |
|--------|----------|----------|
| 默认模式 | 选择产品后默认加载 | 显示简单固定时间甘特图 |
| 模式切换 | 切换到物料齐套模式 | 甘特图更新为齐套后连续生产 |
| 模式切换 | 切换到交付优先模式 | 甘特图显示分段生产+等待阶段 |
| 物料分析 | 展开BOM查看物料 | 正确显示库存、缺口、到货时间 |
| 风险提示 | 物料不足时 | 显示警告/严重风险提示 |

### 4.2 边界测试

| 场景 | 测试内容 |
|------|----------|
| 库存充足 | 所有物料库存满足需求 |
| 部分短缺 | 部分物料短缺，需要采购 |
| 全部短缺 | 所有物料都需要采购 |
| 无BOM | 产品没有BOM数据 |
| 深层BOM | BOM层级超过3层 |

### 4.3 性能测试

- 50+任务渲染流畅度 < 16ms/帧
- 模式切换响应时间 < 200ms
- BOM展开/折叠响应时间 < 100ms

---

## 五、风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| API数据缺失 | 无法获取交付周期/产能 | 使用默认值，UI提示 |
| 计算复杂度高 | 大量BOM项导致卡顿 | 懒加载、分页、Web Worker |
| 回滚困难 | 修改文件过多 | 完整备份、变更日志 |

---

## 六、待确认问题

1. **产能数据来源**：日产能数据从哪个API获取？或使用固定默认值？
2. ~~**交付周期数据来源**：物料交付周期从哪个字段读取？supplier表还是material表？~~ ✅ 已确认
3. **等待阶段显示**：交付优先模式的等待阶段是否需要在甘特图中可视化显示？
4. **物料分析面板**：是否需要单独的物料分析面板显示详细的缺料情况？

---

## 七、已确认数据模型字段

**来源**: HD供应链业务知识网络.json

| 数据 | 对象类型 | 对象ID | 字段名 | 说明 |
|------|----------|--------|--------|------|
| 物料交付周期 | 物料(Material) | d56voju9olk4bpa66vcg | `delivery_duration` | 物料的交付时长/周期 |
| 产品组装时长 | 产品(Product) | d56v4ue9olk4bpa66v00 | `assembly_time` | 生产组装时长 |
| 库存可用数量 | 库存(Inventory) | d56vcuu9olk4bpa66v3g | `available_quantity` | 可用库存数量 |
| 安全库存 | 库存(Inventory) | d56vcuu9olk4bpa66v3g | `safety_stock` | 安全库存量 |
| BOM用量 | 产品BOM | d56vqtm9olk4bpa66vfg | `child_quantity` | 子件用量 |
| BOM损耗率 | 产品BOM | d56vqtm9olk4bpa66vfg | `loss_rate` | 物料损耗率 |

---

**文档版本**: v1.1
**创建日期**: 2026-01-14
**最后更新**: 2026-01-14
**作者**: Claude Code Assistant
