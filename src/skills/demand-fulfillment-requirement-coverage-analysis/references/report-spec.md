# 报告规范（新需求满足分析）

## 章节顺序

1. 报告标题
2. 报告信息（知识网络、BOM 版本、快照 ID、分析时间、替代料开关）
3. 总体概览（需求数、缺口产品数、缺口物料数）
4. 产品汇总（需求、库存、可售、满足状态）
5. 分产品物料明细（BOM 层级、毛需求、可用库存、在途PO、缺口、状态、共享标记）
6. 替代组明细（存在时）
7. 执行审计信息（仅统计，不含业务数据）

## 输出格式

- Markdown：标准格式，适合审阅和版本管理
- PDF：打印版，适合汇报

## 报告必含字段

- 知识网络 ID（例如 `supplychain_hd0202_test`）
- BOM 版本（`bom_version`）
- 上下文快照 ID（`context_snapshot_id`）

## 仓库口径说明

- 报告中的“仓库过滤”来自库存对象“生产可用库存口径定义”（通过 `$kweaver-core` 查询）
- 用户输入不提供仓库字段

## 状态词典

- 产品级：已满足 / 不满足
- 物料级：主料满足 / 替代料可满足 / 满足 / 不满足

## 执行审计字段（必含）

- `resolve_context_remote_query_count`
- `analyze_remote_query_count`
- `render_report_remote_query_count`

约束：

- `analyze_remote_query_count` 必须为 `0`
- `render_report_remote_query_count` 必须为 `0`
