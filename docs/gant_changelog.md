# 甘特图重构变更日志

## 版本 2.1.0 - 2026-01-15

### 修复问题
1. **生产计划量显示优化**
   - 添加计划开始时间和结束时间显示
   - 来源：工厂生产计划对象
   - 文件：`ProductInfoPanel.tsx`, `mpsDataService.ts`, `ontology.ts`

2. **在手订单量计算修正**
   - 修正公式：在手订单量 = 签约数量 - 发货数量
   - 字段：`signing_quantity` - `shipping_quantity`
   - 文件：`mpsDataService.ts`

3. **去除月度产能组件**
   - 从产品信息面板移除月度产能显示
   - 文件：`ProductInfoPanel.tsx`

4. **生产计划模式计算修正**
   - 物料齐套模式：基于计划结束时间(`planEndTime`)倒推
   - 交付优先模式：基于计划开始时间(`planStartTime`)正推
   - 文件：`MPSPrototype.tsx`

5. **物料齐套模式并行采购逻辑修复** ⚠️ 重要修复
   - **问题**：原逻辑递归累加每个物料的交付周期，导致时间计算错误（430天）
   - **修复**：所有缺货物料并行采购，等待时间 = max(所有物料交付周期)
   - **修复**：各级组件并行组装，从BOM底层往上累加（不是递归累加）
   - **公式**：总时间 = 最长物料交付周期 + Σ(各层级最大组装时间)
   - 文件：`productionPlanCalculator.ts`
   - 新增辅助函数：
     - `calculateMaxAssemblyTimeByLevel()` - 计算每层级并行组装时间
     - `calculateBOMDepth()` - 计算BOM深度
     - `buildTasksWithMaterialReadyParallel()` - 并行逻辑任务构建

6. **交付优先模式并行采购逻辑修复** ⚠️ 重要修复
   - **问题**：原逻辑累加物料交付周期，导致时间计算错误
   - **修复**：缺货物料并行采购，等待时间 = max(所有缺货物料交付周期)
   - **阶段**：
     - Phase 1: 使用现有库存立即生产
     - Phase 2: 等待缺货物料（并行采购）
     - Phase 3: 物料到齐后继续生产
   - 文件：`productionPlanCalculator.ts`

### 数据字段映射
| 业务概念 | 数据字段 | 来源对象 |
|---------|---------|---------|
| 签约数量 | `signing_quantity` | 销售订单(SalesOrder) |
| 发货数量 | `shipping_quantity` | 销售订单(SalesOrder) |
| 计划开始时间 | `start_time` | 工厂生产计划(ProductionPlan) |
| 计划结束时间 | `end_time` | 工厂生产计划(ProductionPlan) |

## 版本 2.0.0 - 2026-01-14

### 新增功能
- **三种生产计划模式**
  - 默认模式：简单固定时间计算
  - 物料齐套模式：等所有物料到齐后连续生产
  - 交付优先模式：立即开始生产，分段执行

- **模式选择器组件** (`PlanModeSelector.tsx`)
  - 三个模式按钮，支持切换
  - 显示当前选中模式

- **生产计划计算器** (`productionPlanCalculator.ts`)
  - 物料需求分析算法
  - 物料齐套模式计算
  - 交付优先模式分段计算
  - 倒排进度计算

- **节点折叠/展开功能**
  - 产品、一级组件、二级组件可折叠
  - 叶子物料不可折叠
  - 默认仅展开产品级别

- **新增类型定义** (`ontology.ts`)
  - `ProductionPlanMode`: 生产计划模式枚举
  - `MaterialRequirementAnalysis`: 物料需求分析结果
  - `ProductionPhase`: 生产阶段定义
  - `GanttTaskExtended`: 扩展的甘特图任务

### 修改
- `GanttBOMTree.tsx`: 支持多阶段显示和节点折叠
- `GanttTaskBar.tsx`: 支持等待阶段灰色样式
- `GanttTooltip.tsx`: 显示阶段详细信息
- `mpsDataService.ts`: 获取物料交付周期数据
- `MPSPrototype.tsx`: 集成模式切换功能

### 数据字段映射
| 业务概念 | 数据字段 | 来源对象 |
|---------|---------|---------|
| 物料交付周期 | `delivery_duration` | 物料(Material) |
| 产品组装时长 | `assembly_time` | 产品(Product) |
| 库存可用数量 | `available_quantity` | 库存(Inventory) |
| BOM子件用量 | `child_quantity` | 产品BOM |

### 回滚说明
如需回滚到之前版本，请恢复 `.backup/gantt_refactor_20260114/` 目录中的备份文件：
```bash
cp .backup/gantt_refactor_20260114/*.bak src/  # 按需恢复
```

备份文件列表：
- `ontology.ts.bak`
- `mpsDataService.ts.bak`
- `MPSPrototype.tsx.bak`
- `GanttChartSection.tsx.bak`
- `GanttBOMTree.tsx.bak`
- `GanttTaskBar.tsx.bak`
- `GanttTooltip.tsx.bak`
