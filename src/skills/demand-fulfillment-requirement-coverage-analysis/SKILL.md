---
name: demand-fulfillment-requirement-coverage-analysis
description: Use when analyzing whether newly added product demands are fulfillable in a static snapshot, including product-level satisfaction, material-level shortage, substitute coverage, shared-material signals, and report export.
---

# 需求承接之新需求满足分析

## 依赖技能（必需）

- 本 skill 强依赖 `$kweaver-core`
- BOM、库存、在途 PO、产品主数据必须通过 `$kweaver-core` 从服务器端查询
- 禁止要求用户手工输入 BOM 明细、库存明细、PO 明细、仓库名单

## 适用场景

- 用户录入多条新需求后，需要判断每条需求是否满足
- 用户要看 BOM 全层级物料缺口与共享物料
- 用户要看主料满足/替代料可满足/不满足
- 用户要导出结构化分析报告（Markdown/PDF）

## 输入要求（分层）

### 用户输入（对话层）

- `knowledge_network_id`（知识网络 ID，默认 `supplychain_hd0202_test`）
- `demands[]`：产品编码或名称、需求数量、优先级
- `substitute_enabled`

### 交互确认步骤（必须执行）

当用户未明确给出 `substitute_enabled` 时，智能体必须先询问并确认：

- 询问话术：`是否启用替代料核算进行本次分析？（是/否）`
- 用户回答“是” -> `substitute_enabled = true`
- 用户回答“否” -> `substitute_enabled = false`
- 不允许沿用历史对话中的旧值，必须以本次请求内的明确确认为准
- 未确认前，不执行分析脚本

当用户未明确给出 `knowledge_network_id` 时，按以下规则处理：

- 默认使用 `supplychain_hd0202_test`
- 在分析结果“报告信息”中必须回显实际使用的知识网络 ID
- 若用户明确指定其他网络，必须使用用户指定值并回显

### 系统自动解析上下文（数据层）

由系统自动查询并注入，不要求用户输入。数据来源固定为 `$kweaver-core` 服务端查询：

- `warehouse_filter`（由 `$kweaver-core` 查询库存对象中的“生产可用库存口径定义”得到）
- `analysis_timestamp`
- `demands[].finished_goods_stock`
- `demands[].theoretical_build_qty`
- `demands[].materials[]`（BOM 全层级与分层匹配明细）
- `knowledge_network_id`

## 规则

1. 产品级满足状态：
   - `total_sellable_qty >= demand_qty` -> 已满足
   - 其他 -> 不满足
2. 物料级满足状态按“先命中先返回”规则判断：
   - 主料满足：有替代料且 `main_coverage >= required_qty`
   - 替代料可满足：有替代料且 `group_coverage >= required_qty`
   - 不满足：`layer5_shortage > 0`
   - 满足：其余场景（含无替代料时的正常满足）
3. 共享物料：同一 `material_code` 被多个需求消耗时标记共享

## 执行方式

### 方式 A：AI Agent 驱动（默认）

- 按本 skill 的输入分层收集 `user_input`，系统自动解析 `resolved_context`
- 使用 `$kweaver-core` 完成产品检索、BOM 展开、库存查询、在途 PO 查询
- 由 Agent 编排执行分析并输出报告
- 必须先通过“完成门槛”校验，未通过不得输出业务结论
- 最终回复必须包含完整 Markdown 报告正文（不可只给结论摘要）

## 执行编排（强制）

执行顺序固定为 3 个阶段：

1. `resolve_context`
2. `analyze`
3. `render_report`

阶段约束：

- `resolve_context` 只允许执行一次，产出唯一 `resolved_context` 快照
- `analyze` 与 `render_report` 只允许读取该快照，禁止再次查询远端数据
- 禁止“预跑/探测式全量脚本”；禁止先用旧 `bom_version` 试跑再重跑
- 禁止“缺口复核”脚本二次全量查询；复核必须基于主计算结果做内存校验

### 方式 B：CLI 脚本（本地调试/离线）

1. 调用 `scripts/run_analysis.py` 生成标准结果 JSON
2. 调用 `scripts/render_report.py` 渲染 Markdown 报告
3. 调用 `scripts/export_pdf.py` 输出 PDF（或打印版 HTML）

## 完成门槛（硬约束）

以下条件必须全部满足，缺一不可：

1. `resolved_context.context_source == kweaver-core`
2. `warehouse_filter` 非空，且来源为库存对象“生产可用库存”定义查询结果
3. 每条需求均为 BOM 全层级展开结果，`demands[].materials[]` 非空
4. 在途 PO 按“未关闭行 + 未收数量”口径入模
5. 禁止使用本地默认仓库配置作为替代值
6. 禁止使用浏览器 `localStorage` 作为分析口径来源
7. `knowledge_network_id` 必须明确并在结果中回显
8. `resolve_context` 必须只生成一次快照并被后续阶段复用
9. 报告阶段禁止发起新的 `$kweaver-core` 查询

未满足任一条件时，必须返回“数据前提不足，分析终止”，禁止给出满足/不满足结论。

## 输出要求（必需）

最终输出必须包含两部分：

1. `analysis_result` 关键字段摘要（结构化）
2. 完整 Markdown 报告正文（按 `assets/templates/report.md.tmpl` 结构）

只输出自然语言结论、不输出报告正文，视为未完成 skill 执行。

## 正确性与性能验收（必需）

1. 正确性验收：
   - 同一输入重复执行，`analysis_result` 的关键指标一致
   - 产品状态严格等价于 `total_sellable_qty >= demand_qty`
   - 缺口数量严格等于明细中 `layer5_shortage > 0` 的计数
2. 性能验收：
   - 全流程只允许一次全量远程取数（`resolve_context` 阶段）
   - 复核与报告阶段远程查询次数必须为 0

## 命令示例

```bash
python3 scripts/run_analysis.py \
  --user-input assets/samples/user_input.json \
  --resolved-context assets/samples/resolved_context.json \
  --output /tmp/fulfillment_result.json

python3 scripts/render_report.py \
  --input /tmp/fulfillment_result.json \
  --output /tmp/fulfillment_report.md

python3 scripts/export_pdf.py \
  --input /tmp/fulfillment_report.md \
  --output /tmp/fulfillment_report.pdf
```

## 参考资料

- 规则说明：`references/business-rules.md`
- 输入输出契约：`references/io-contract.md`
- 报告结构规范：`references/report-spec.md`
- 测试场景清单：`references/test-cases.md`
