# 输入输出契约（产品可售能力）

## 用户输入契约（user_input_contract）

```json
{
  "knowledge_network_id": "supplychain_hd0202_test",
  "product_query": "T01-000080",
  "substitute_enabled": true
}
```

交互约束：

- `product_query` 必填
- `knowledge_network_id` 允许缺省，缺省时使用 `supplychain_hd0202_test`
- `substitute_enabled` 允许缺省
- 若 `substitute_enabled` 缺省，智能体必须先询问用户“是否启用替代料核算（是/否）”，确认后再执行分析

## 系统上下文契约（system_resolved_context）

来源约束：

- `system_resolved_context` 必须由 `$kweaver-core` 从服务端查询生成
- 不接受用户手工拼装的 BOM/库存/PO 明细作为系统上下文
- `context_source` 固定为 `kweaver-core`
- `knowledge_network_id` 必填，且必须在输出中原样回显
- `warehouse_filter` 必须来自库存对象“生产可用库存口径定义”查询结果
- 若无法获取该定义，分析必须失败，不允许按“默认仓库”降级
- `resolved_context` 必须是单次取数快照；分析与报告阶段复用该快照，禁止二次拉数

```json
{
  "context_source": "kweaver-core",
  "knowledge_network_id": "supplychain_hd0202_test",
  "context_snapshot_id": "ctx_20260409_944000001_v20260406",
  "bom_version": "2026-04-06",
  "product_code": "T01-000080",
  "product_name": "北斗车载智能终端系统",
  "finished_goods_stock": 574,
  "warehouse_filter": ["昆山成品仓"],
  "warehouse_filter_source": "inventory.production_available_scope",
  "analysis_timestamp": "2026-04-06T12:00:00.000Z",
  "materials": [
    {
      "material_code": "109-000584",
      "material_name": "4G数传模块",
      "bom_level": 3,
      "material_type": "外购",
      "required_qty_per_unit": 1,
      "available_qty": 0,
      "all_warehouse_available_qty": 40,
      "in_transit_qty": 0,
      "substitute_group": {
        "alt_group_no": "35",
        "members": [
          {"material_code": "109-000584", "material_name": "4G数传模块", "alt_priority": 0, "available_qty": 0},
          {"material_code": "P1 109-000494", "material_name": "4G数传模块", "alt_priority": 1, "available_qty": 30}
        ]
      }
    }
  ]
}
```

## 输出契约（analysis_result）

```json
{
  "knowledge_network_id": "supplychain_hd0202_test",
  "context_snapshot_id": "ctx_20260409_944000001_v20260406",
  "bom_version": "2026-04-06",
  "product_code": "T01-000080",
  "product_name": "北斗车载智能终端系统",
  "finished_goods_stock": 574,
  "theoretical_build_qty": 30,
  "total_sellable_qty": 604,
  "substitute_enabled": true,
  "warehouse_filter": ["昆山成品仓"],
  "analysis_timestamp": "2026-04-06T12:00:00.000Z",
  "execution_metrics": {
    "resolve_context_remote_query_count": 1,
    "analyze_remote_query_count": 0,
    "render_report_remote_query_count": 0
  },
  "materials": [
    {
      "material_code": "109-000584",
      "material_name": "4G数传模块",
      "max_producible_qty": 30,
      "status": "替代料可生产"
    }
  ]
}
```
