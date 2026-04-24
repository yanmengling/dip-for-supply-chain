# 业务规则（新需求满足分析）

## 1. 产品级满足状态

`total_sellable_qty >= demand_qty` -> `已满足`  
否则 -> `不满足`

仓库过滤口径：

- 从库存对象“生产可用库存口径定义”读取有效仓库集合（通过 `$kweaver-core` 查询）
- 用户不输入仓库名称
- 若无法读取有效仓库定义，本次分析直接失败，不允许使用默认仓库降级
- 禁止使用本地默认仓库或浏览器 `localStorage` 作为分析兜底

## 1.1 数据获取与展开口径（固定）

- 数据来源固定：`$kweaver-core`
- 先确定最新 `bom_version`，再执行一次 BOM 全量展开；禁止旧版本试跑
- 库存字段口径：
  - `available_qty` 使用“生产可用库存”字段
  - `all_warehouse_available_qty` 使用“全仓可用库存”字段（仅用于对照，不参与主计算）
- BOM 展开口径：按产品做全层级递归展开，直到叶子物料；不允许只取首层
- 在途 PO 口径：`in_transit_qty = max(0, po_qty - received_qty)`，且仅统计“未关闭”的采购行（`rowclosestatus_title != 已关闭`）
- 运行阶段口径：远程查询仅允许在 `resolve_context` 阶段发生一次，后续阶段只能消费快照数据

## 2. 物料级状态判定

先计算：

- `required_qty = gross_requirement - layer1_semi_finished`
- `main_coverage = main.available_qty + main.in_transit_qty`
- `group_coverage = sum(member.available_qty + member.in_transit_qty)`

按优先顺序：

1. 有替代料且 `main_coverage >= required_qty` -> 主料满足
2. 有替代料且 `group_coverage >= required_qty` -> 替代料可满足
3. `layer5_shortage > 0` -> 不满足
4. 其他 -> 满足

字段说明：

- `layer5_shortage`：净缺口数量，定义为毛需求扣减 Layer-1（半成品覆盖）、Layer-2（可用库存覆盖）、Layer-3（在途PO覆盖）后的剩余值

## 3. 替代组识别

需同时满足：

1. `alt_method = '替代'`
2. `parent_material_code` 相同（为空时用 `bom_material_code`）
3. `alt_group_no` 相同且非空

## 4. 共享物料

同一 `material_code` 若被两条及以上需求消耗：

- `is_shared_material = true`
- `shared_consumers` 记录各需求消耗量

## 5. 一致性校验规则（必需）

1. 产品状态一致性：
   - `product_status = 已满足` 当且仅当 `total_sellable_qty >= demand_qty`
2. 缺口计数一致性：
   - `shortage_material_count = count(layer5_shortage > 0)`
3. 明细汇总一致性：
   - 报告中的缺口产品数、缺口物料数必须与计算结果完全一致
4. 复核执行约束：
   - 复核只允许内存校验，不允许重新查询 BOM/库存/PO
