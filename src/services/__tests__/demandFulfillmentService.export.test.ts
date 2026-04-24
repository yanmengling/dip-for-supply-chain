import { describe, expect, it } from 'vitest';
import {
  buildCapacityExportRows,
  buildCapacityMarkdownReport,
  buildFulfillmentExportRows,
  buildFulfillmentMarkdownReport,
} from '../demandFulfillmentService';
import type { BatchFulfillmentResult } from '../../types/planningV2';

describe('demand fulfillment export rows', () => {
  it('builds capacity export rows', () => {
    const rows = buildCapacityExportRows({
      productCode: 'SKU-001',
      productName: '测试产品',
      finishedGoodsStock: 10,
      theoreticalBuildQty: 20,
      totalSellableQty: 30,
      materialDetails: [],
      bottleneck: {
        materialCode: 'MAT-001',
        materialName: '瓶颈料',
        requiredQuantity: 2,
        availableQuantity: 40,
        canMake: 20,
      },
      analysisNote: {
        warehouseFilter: ['W1', 'W2'],
        substituteEnabled: true,
        analysisTimestamp: '2026-04-06T12:00:00.000Z',
      },
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].产品编码).toBe('SKU-001');
    expect(rows[0].合计可售).toBe(30);
    expect(rows[0].仓库过滤).toBe('W1|W2');
  });

  it('builds fulfillment export rows', () => {
    const input: BatchFulfillmentResult = {
      demands: [{
        productCode: 'SKU-002',
        productName: '承接产品',
        demandQty: 10,
        priority: 5,
        finishedGoodsStock: 3,
        theoreticalBuildQty: 4,
        totalSellableQty: 7,
        materialResults: [{
          materialCode: 'MAT-002',
          materialName: '主料',
          grossRequirement: 10,
          layers: {
            layer1_semiFinished: 2,
            layer2_rawMaterial: 3,
            layer3_inTransitPO: 1,
            layer4_disassemblyHint: null,
            layer5_shortage: 4,
          },
          substituteGroup: {
            altGroupNo: 'ALT-1',
            members: [{
              materialCode: 'MAT-ALT-A',
              materialName: '替代A',
              altPriority: 1,
              availableQty: 9,
              consumedQty: 5,
            }],
          },
        }],
        analysisNote: {
          isStaticSnapshot: true,
          substituteEnabled: true,
          warehouseFilter: ['WH-A'],
          analysisTimestamp: '2026-04-06T12:05:00.000Z',
        },
      }],
      poolSnapshot: {
        totalAvailableInv: new Map(),
        totalInTransitPO: new Map(),
      },
    };

    const rows = buildFulfillmentExportRows(input);
    expect(rows).toHaveLength(8);
    expect(rows[0].报告类型).toBe('新需求满足分析-总体概览');
    expect(rows[0].概览项).toBe('需求条数');
    expect(rows[0].概览值).toBe(1);
    expect(rows[6].报告类型).toBe('新需求满足分析-产品汇总');
    expect(rows[6].产品编码).toBe('SKU-002');
    expect(rows[7].报告类型).toBe('新需求满足分析-物料明细');
    expect(rows[7].物料编码).toBe('MAT-002');
    expect(rows[7].缺口).toBe(4);
    expect(rows[7].满足状态).toBe('替代料可满足');
    expect(rows[7].替代料明细).toContain('MAT-ALT-A');
  });

  it('builds readable markdown report for fulfillment', () => {
    const input: BatchFulfillmentResult = {
      demands: [{
        productCode: 'SKU-003',
        productName: '报告产品',
        demandQty: 12,
        priority: 1,
        finishedGoodsStock: 2,
        theoreticalBuildQty: 3,
        totalSellableQty: 5,
        materialResults: [{
          materialCode: 'MAT-003',
          materialName: '主料B',
          grossRequirement: 12,
          layers: {
            layer1_semiFinished: 0,
            layer2_rawMaterial: 0,
            layer3_inTransitPO: 0,
            layer4_disassemblyHint: null,
            layer5_shortage: 7,
          },
        }],
        analysisNote: {
          isStaticSnapshot: true,
          substituteEnabled: false,
          warehouseFilter: ['WH-B'],
          analysisTimestamp: '2026-04-06T13:00:00.000Z',
        },
      }],
      poolSnapshot: {
        totalAvailableInv: new Map([['MAT-003', 5]]),
        totalInTransitPO: new Map([['MAT-003', 0]]),
      },
    };

    const markdown = buildFulfillmentMarkdownReport(input);
    expect(markdown).toContain('# 需求承接分析报告（新需求满足分析）');
    expect(markdown).toContain('## 总体概览');
    expect(markdown).toContain('## 产品汇总');
    expect(markdown).toContain('## 物料明细：SKU-003 / 报告产品 / 需求 12 / 优先级 1');
    expect(markdown).toContain('不满足');
    expect(markdown).toContain('| BOM层级 | 物料编码 | 物料名称 | 类型 | 毛需求 | 可用库存 | 在途PO | 缺口 | 满足状态 | 共享标记 | 替代料 |');
  });

  it('builds readable markdown report for capacity', () => {
    const markdown = buildCapacityMarkdownReport({
      productCode: 'SKU-010',
      productName: '可售测试',
      finishedGoodsStock: 20,
      theoreticalBuildQty: 15,
      totalSellableQty: 35,
      materialDetails: [{
        materialCode: 'MAT-010',
        materialName: '零件A',
        materialType: '外购',
        bomLevel: 1,
        parentMaterialCode: 'SKU-010',
        bomPathKey: 'SKU-010>MAT-010',
        requiredQtyPerUnit: 2,
        availableQty: 10,
        inTransitQty: 0,
        shortageQtyPerUnit: 0,
        maxProducibleQty: 5,
      }],
      bottleneck: null,
      analysisNote: {
        warehouseFilter: ['W1'],
        substituteEnabled: false,
        analysisTimestamp: '2026-04-06T13:10:00.000Z',
      },
    });

    expect(markdown).toContain('# SKU-010 / 可售测试 可售能力分析报告');
    expect(markdown).toContain('## 产品汇总');
    expect(markdown).toContain('## 物料明细');
    expect(markdown).toContain('| BOM层级 | 物料编码 | 物料名称 | 类型 | 单位需求 | 可用库存 | 在途 | 最大可生产数 | 库存状态 | 替代料 |');
  });

  it('uses product sellable coverage as product-level status', () => {
    const input: BatchFulfillmentResult = {
      demands: [{
        productCode: 'SKU-200',
        productName: '库存覆盖产品',
        demandQty: 200,
        priority: 0,
        finishedGoodsStock: 574,
        theoreticalBuildQty: 0,
        totalSellableQty: 574,
        materialResults: [{
          materialCode: 'MAT-SHORT',
          materialName: '缺料物料',
          grossRequirement: 500,
          layers: {
            layer1_semiFinished: 0,
            layer2_rawMaterial: 0,
            layer3_inTransitPO: 0,
            layer4_disassemblyHint: null,
            layer5_shortage: 500,
          },
        }],
        analysisNote: {
          isStaticSnapshot: true,
          substituteEnabled: false,
          warehouseFilter: ['WH-C'],
          analysisTimestamp: '2026-04-06T14:00:00.000Z',
        },
      }],
      poolSnapshot: {
        totalAvailableInv: new Map([['MAT-SHORT', 0]]),
        totalInTransitPO: new Map([['MAT-SHORT', 0]]),
      },
    };

    const rows = buildFulfillmentExportRows(input);
    expect(rows.find(row => row.报告类型 === '新需求满足分析-产品汇总')?.满足状态).toBe('已满足');

    const markdown = buildFulfillmentMarkdownReport(input);
    expect(markdown).toContain('| SKU-200 | 库存覆盖产品 | 0 | 200 | 574 | 0 | 574 | 已满足 |');
    expect(markdown).toContain('| 存在缺口产品数 | 0 |');
  });
});
