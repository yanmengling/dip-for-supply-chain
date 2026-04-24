# 业务规则（产品可售能力）

## 1. 指标定义

- 产成品库存：`finished_goods_stock`
- 理论可生产数：全部物料“最大可生产数”的最小值
- 合计可售：`finished_goods_stock + theoretical_build_qty`

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

## 2. 物料最大可生产数

单物料主料可生产数：

`main_max = floor(available_qty / required_qty_per_unit)`

约束：

- `required_qty_per_unit <= 0` 时，`main_max = 0`

## 3. 替代料规则

替代组识别条件：

1. `alt_method = '替代'`
2. `parent_material_code` 相同（为空时用 `bom_material_code`）
3. `alt_group_no` 相同且非空

启用替代料时：

- `substitute_max = max(floor(member.available_qty / required_qty_per_unit))`
- `max_producible = max(main_max, substitute_max)`

未启用替代料时：

- `max_producible = main_max`

## 4. 物料状态

按顺序判定：

1. 主料可生产：`main_max > 0`
2. 替代料可生产：`main_max <= 0 and substitute_max > 0`
3. 缺料：其余情况

## 5. 一致性校验规则（必需）

1. 合计可售一致性：
   - `total_sellable_qty = finished_goods_stock + theoretical_build_qty`
2. 瓶颈一致性：
   - `theoretical_build_qty` 必须等于全部物料 `max_producible_qty` 的最小值
3. 状态一致性：
   - `main_max > 0` 时状态必须是“主料可生产”
   - `main_max <= 0 and substitute_max > 0` 时状态必须是“替代料可生产”
   - 其他必须是“缺料”
4. 复核执行约束：
   - 复核只允许内存校验，不允许重新查询 BOM/库存/PO
