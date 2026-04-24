---
name: demand-fulfillment-capacity-analysis
description: Use when analyzing product sellable capacity before commitment, including finished-goods stock, theoretical build quantity, substitute-aware producibility, and report export for demand-fulfillment pre-checks.
---

# 需求承接之产品可售能力分析

## 依赖技能（必需）

- 本 skill 强依赖 `$kweaver-core`
- BOM、库存、在途 PO、产品主数据必须通过 `$kweaver-core` 从服务器端查询
- 禁止要求用户手工输入 BOM 明细、库存明细、PO 明细、仓库名单

## 适用场景

- 用户要评估某产品“现在最多可售多少”
- 用户要核算“产成品库存 + 理论可生产数”
- 用户要判断主料可生产/替代料可生产/缺料
- 用户要导出可读报告（Markdown/PDF）

## 输入要求（分层）

### 用户输入（对话层）

- `knowledge_network_id`（知识网络 ID，默认 `supplychain_hd0202_test`）
- `product_query`（产品编码或产品名称）
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

- `product_code` / `product_name`
- `finished_goods_stock`
- `warehouse_filter`（由 `$kweaver-core` 查询库存对象中的“生产可用库存口径定义”得到）
- `materials[]`（BOM 展开后的物料明细）
- `analysis_timestamp`
- `knowledge_network_id`

## 规则

1. 产成品库存 = `finished_goods_stock`
2. 物料最大可生产数 = `FLOOR(available_qty / required_qty_per_unit)`（`required_qty_per_unit=0` 时为 0）
3. 启用替代料时：
   - 替代组最大可生产数 = 组内替代料成员最大值（按 `available_qty` 计算）
   - 物料最大可生产数 = `MAX(主料, 替代组)`
4. 理论可生产数 = 全部物料最大可生产数最小值
5. 合计可售 = `finished_goods_stock + theoretical_build_qty`
6. 物料状态：
   - 主料可生产
   - 替代料可生产
   - 缺料

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
- 禁止“复核”阶段二次全量查询；复核必须基于主计算结果做内存校验

### 方式 B：CLI 脚本（本地调试/离线）

1. 调用 `scripts/run_analysis.py` 生成标准结果 JSON
2. 调用 `scripts/render_report.py` 渲染 Markdown 报告
3. 调用 `scripts/export_pdf.py` 输出 PDF（或打印版 HTML）

## 完成门槛（硬约束）

以下条件必须全部满足，缺一不可：

1. `resolved_context.context_source == kweaver-core`
2. `warehouse_filter` 非空，且来源为库存对象“生产可用库存”定义查询结果
3. BOM 为全层级展开结果，`materials[]` 非空
4. 在途 PO 按“未关闭行 + 未收数量”口径入模
5. 禁止使用本地默认仓库配置作为替代值
6. 禁止使用浏览器 `localStorage` 作为分析口径来源
7. `knowledge_network_id` 必须明确并在结果中回显
8. `resolve_context` 必须只生成一次快照并被后续阶段复用
9. 报告阶段禁止发起新的 `$kweaver-core` 查询

未满足任一条件时，必须返回“数据前提不足，分析终止”，禁止给出可售数量。

## 输出要求（必需）

最终输出必须包含两部分：

1. `analysis_result` 关键字段摘要（结构化）
2. 完整 Markdown 报告正文（按 `assets/templates/report.md.tmpl` 结构）

只输出自然语言结论、不输出报告正文，视为未完成 skill 执行。

## 正确性与性能验收（必需）

1. 正确性验收：
   - `total_sellable_qty = finished_goods_stock + theoretical_build_qty`
   - `theoretical_build_qty = min(material.max_producible_qty)`
   - 瓶颈物料与最小 `max_producible_qty` 一致
2. 性能验收：
   - 全流程只允许一次全量远程取数（`resolve_context` 阶段）
   - 复核与报告阶段远程查询次数必须为 0

## 命令示例

```bash
python3 scripts/run_analysis.py \
  --user-input assets/samples/user_input.json \
  --resolved-context assets/samples/resolved_context.json \
  --output /tmp/capacity_result.json

python3 scripts/render_report.py \
  --input /tmp/capacity_result.json \
  --output /tmp/capacity_report.md

python3 scripts/export_pdf.py \
  --input /tmp/capacity_report.md \
  --output /tmp/capacity_report.pdf
```

## 参考资料

- 规则说明：`references/business-rules.md`
- 输入输出契约：`references/io-contract.md`
- 报告结构规范：`references/report-spec.md`
- 测试场景清单：`references/test-cases.md`
