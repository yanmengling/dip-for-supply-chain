# 报告规范（产品可售能力）

## 章节顺序

1. 报告标题
2. 报告信息（知识网络、BOM 版本、快照 ID、产品、时间、仓库、替代料开关）
3. 产品汇总（产成品库存、理论可生产数、合计可售）
4. 物料明细（层级、库存、在途、最大可生产数、状态）
5. 替代组明细（仅有替代组时出现）
6. 执行审计信息（仅统计，不含业务数据）

## 状态词典

- 主料可生产
- 替代料可生产
- 缺料

## 输出格式

- Markdown：主格式，便于评审与留档
- PDF：面向管理报告，打印版样式

## 报告必含字段

- 知识网络 ID（例如 `supplychain_hd0202_test`）
- BOM 版本（`bom_version`）
- 上下文快照 ID（`context_snapshot_id`）

## 仓库口径说明

- 报告中的“仓库过滤”来自库存对象“生产可用库存口径定义”（通过 `$kweaver-core` 查询）
- 用户输入不提供仓库字段

## 执行审计字段（必含）

- `resolve_context_remote_query_count`
- `analyze_remote_query_count`
- `render_report_remote_query_count`

约束：

- `analyze_remote_query_count` 必须为 `0`
- `render_report_remote_query_count` 必须为 `0`
