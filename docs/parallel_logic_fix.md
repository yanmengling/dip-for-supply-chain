# 生产计划并行逻辑修复说明

## 问题描述

### 原有逻辑的错误

产品 T01-000055，生产计划时间是 2026-01-01 ~ 2026-03-30（共89天），但系统计算出物料齐套和交付优先模式都需要 **430天**。

#### 根本原因分析

1. **物料采购时间累加错误**
   - ❌ 错误逻辑：递归时每个子级都从父级时间倒推，导致每一层的物料交付周期都被累加
   - ✅ 正确逻辑：所有缺货物料应该**同时发起采购请求**，等待时间 = max(所有物料交付周期)

2. **组件组装时间累加错误**
   - ❌ 错误逻辑：每层级递归倒推时间，导致每一层的组装时间都被累加
   - ✅ 正确逻辑：各级组件应该**并行组装**，从BOM底层往上累加各层级的**最大**组装时间

### 举例说明

假设产品BOM结构如下：
```
产品A (组装5天)
├── 一级组件B1 (组装7天)
│   ├── 物料M1 (交付周期15天，缺货)
│   └── 物料M2 (交付周期10天，缺货)
├── 一级组件B2 (组装5天)
│   ├── 物料M3 (交付周期12天，缺货)
│   └── 物料M4 (交付周期8天，库存充足)
```

#### 错误计算（原逻辑）
```
物料齐套模式总时间 = 15 + 10 + 12 + 8 + 7 + 5 + 5 = 62天 ❌
```
- 问题：所有物料交付周期累加，所有组装时间累加

#### 正确计算（修复后）
```
1. 物料并行采购等待时间 = max(15, 10, 12) = 15天
   （M1、M2、M3 同时发起采购，等最长的M1）

2. 一级组件并行组装时间 = max(7, 5) = 7天
   （B1、B2 物料到齐后同时组装，取最长的B1）

3. 产品组装时间 = 5天
   （B1、B2 都完成后，才能组装产品A）

总时间 = 15 + 7 + 5 = 27天 ✅
```

## 修复方案

### 1. 物料齐套模式（Material Ready Mode）

#### 修复前的逻辑
```typescript
// ❌ 错误：递归时每层都倒推，导致时间累加
for (const item of bomItems) {
  if (item.type === 'material') {
    // 每个物料都从父级时间倒推
    taskStartDate = parentEndDate - deliveryCycle
  } else {
    // 每个组件都从父级时间倒推
    taskStartDate = parentEndDate - processingTime
  }
  // 递归处理子级（继续倒推）
  buildChildren(item.children, taskStartDate)
}
```

#### 修复后的逻辑
```typescript
// ✅ 正确：物料并行采购 + 组件按层级并行组装
// Step 1: 所有缺货物料并行采购
const shortageMaterials = materialAnalysis.filter(m => m.shortage > 0);
const maxDeliveryCycle = Math.max(...shortageMaterials.map(m => m.deliveryCycle));
materialReadyDate.setDate(startDate + maxDeliveryCycle); // 并行等待

// Step 2: 计算各层级的并行组装时间
const bomDepth = calculateBOMDepth(bomItems);
let totalAssemblyTime = 0;

for (let level = bomDepth - 1; level >= 0; level--) {
  // 每层取最大组装时间（同层并行）
  const maxTime = calculateMaxAssemblyTimeByLevel(bomItems, level);
  totalAssemblyTime += maxTime; // 层与层之间串行
}

// Step 3: 总时间 = 物料等待 + 各层组装累加
completionDate = materialReadyDate + totalAssemblyTime;
```

#### 关键修复函数

##### `calculateMaxAssemblyTimeByLevel()`
```typescript
/**
 * 计算BOM树中每一层级的最大组装时间（用于并行组装）
 * @param targetLevel - 目标层级（0=产品, 1=一级组件, 2=二级组件...）
 * @returns 该层级所有组件中的最大组装时间
 */
function calculateMaxAssemblyTimeByLevel(
  bomItems: BOMItem[],
  targetLevel: number,
  currentLevel: number = 0
): number {
  if (currentLevel === targetLevel) {
    // 到达目标层级，找最大组装时间
    return Math.max(...bomItems.map(item => item.processingTime || DEFAULT_TIME));
  }

  // 递归查找目标层级
  let maxTime = 0;
  for (const item of bomItems) {
    if (item.children) {
      maxTime = Math.max(
        maxTime,
        calculateMaxAssemblyTimeByLevel(item.children, targetLevel, currentLevel + 1)
      );
    }
  }
  return maxTime;
}
```

##### `calculateBOMDepth()`
```typescript
/**
 * 计算BOM树的最大深度
 * 用于确定有多少层级需要并行组装
 */
function calculateBOMDepth(bomItems: BOMItem[], currentDepth: number = 0): number {
  if (bomItems.length === 0) return currentDepth;

  let maxDepth = currentDepth;
  for (const item of bomItems) {
    if (item.children) {
      maxDepth = Math.max(maxDepth, calculateBOMDepth(item.children, currentDepth + 1));
    }
  }
  return maxDepth;
}
```

### 2. 交付优先模式（Delivery Priority Mode）

#### 修复前的逻辑
```typescript
// ❌ 错误：Phase 2 等待时间使用物料到货日期（累加计算的）
const maxArrivalDate = Math.max(...shortageMaterials.map(m => m.arrivalDate));
// arrivalDate = startDate + deliveryCycle（每个物料单独计算）
```

#### 修复后的逻辑
```typescript
// ✅ 正确：Phase 2 等待时间使用最长交付周期（并行采购）
const maxDeliveryCycle = Math.max(...shortageMaterials.map(m => m.deliveryCycle));
waitEndDate.setDate(currentDate + maxDeliveryCycle); // 并行等待
```

#### 三阶段计算
```
Phase 1: 立即生产
- 可生产数量 = min(计划数量, 所有物料的最小支持数量)
- 持续时间 = 可生产数量 / 日产能

Phase 2: 等待物料（并行采购）
- 等待时间 = max(所有缺货物料的交付周期)
- 不是累加，是取最大值！

Phase 3: 继续生产
- 剩余数量 = 计划数量 - 已生产数量
- 持续时间 = 剩余数量 / 日产能
```

## 修复效果

### 修复前
- 产品 T01-000055（计划89天）
- 物料齐套模式：**430天** ❌
- 交付优先模式：**430天** ❌

### 修复后（预期）
- 产品 T01-000055（计划89天）
- 物料齐套模式：**~30-50天** ✅（取决于最长物料交付周期 + 组装时间）
- 交付优先模式：**~35-55天** ✅（取决于立即生产量、等待时间、继续生产时间）

## 实施细节

### 修改文件
1. **`src/utils/productionPlanCalculator.ts`**
   - 新增：`calculateMaxAssemblyTimeByLevel()` 辅助函数
   - 新增：`calculateBOMDepth()` 辅助函数
   - 新增：`buildTasksWithMaterialReadyParallel()` 并行任务构建函数
   - 修改：`calculateMaterialReadyMode()` 主计算逻辑
   - 修改：`calculateDeliveryPriorityMode()` 主计算逻辑
   - 保留：旧版 `buildTasksWithMaterialReady()` 标记为 @deprecated，以便回滚

### 日志输出
修复后的代码添加了详细的日志输出：

```typescript
console.log(`[物料齐套模式] ========== 开始计算 ==========`);
console.log(`[物料齐套模式] ${shortageMaterials.length}个物料缺货，并行采购，最长交付周期：${maxDeliveryCycle}天`);
console.log(`[物料齐套模式] BOM深度：${bomDepth}层`);
console.log(`[物料齐套模式] Level ${level} 并行组装时间：${maxTime}天`);
console.log(`[物料齐套模式] 总组装时间：${totalAssemblyTime}天`);
console.log(`[物料齐套模式] 总周期：${totalCycle}天`);
console.log(`[物料齐套模式] ========== 计算完成 ==========`);
```

可以在浏览器控制台查看计算过程，验证逻辑正确性。

## 验证方法

### 1. 浏览器控制台验证
1. 打开浏览器开发者工具（F12）
2. 选择产品 T01-000055
3. 切换到"物料齐套"或"交付优先"模式
4. 查看控制台输出，验证：
   - ✅ 物料采购是并行的（显示"并行采购"）
   - ✅ 每层级组装时间是该层的最大值
   - ✅ 总周期合理（不再是430天）

### 2. 数据验证
对比修复前后的计算结果：
- 修复前：总周期 = 430天（累加错误）
- 修复后：总周期 = max(物料交付周期) + Σ(各层最大组装时间)

### 3. 边界情况测试
- 所有物料库存充足：总周期 = 组装时间
- 单层BOM：总周期 = 物料等待 + 组装时间
- 多层BOM：总周期 = 物料等待 + 各层并行组装累加

## 回滚方案

如果修复后出现问题，可以回滚到原逻辑：

```bash
# 恢复备份
cp src/utils/productionPlanCalculator.ts.backup src/utils/productionPlanCalculator.ts
```

或者手动修改：
1. 在 `calculateMaterialReadyMode()` 中调用旧函数：
   ```typescript
   // 使用旧版本
   const tasks = buildTasksWithMaterialReady(...)
   ```

2. 移除新增的辅助函数（如果需要）

## 总结

### 核心修复
1. **物料并行采购**：所有缺货物料同时采购，取最长交付周期
2. **组件并行组装**：每层级内的组件同时组装，取最大组装时间
3. **层级串行累加**：各层级之间串行，从底层往上累加

### 关键公式
```
物料齐套模式总时间 = max(所有物料交付周期) + Σ(各层级max组装时间)
交付优先模式总时间 = 立即生产时间 + max(缺货物料交付周期) + 继续生产时间
```

### 技术要点
- 使用 `calculateBOMDepth()` 确定BOM层数
- 使用 `calculateMaxAssemblyTimeByLevel()` 计算每层并行时间
- 使用 `buildTasksWithMaterialReadyParallel()` 构建正确的甘特图任务
- 保留旧函数标记 `@deprecated`，便于回滚
