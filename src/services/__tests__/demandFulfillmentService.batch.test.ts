import { describe, expect, it } from 'vitest';

describe('allocateMultipleDemands', () => {
  it('processes demands by priority and consumes shared substitute pool once', async () => {
    const { allocateMultipleDemands } = await import('../demandFulfillmentService');

    const result = allocateMultipleDemands({
      demands: [
        { productCode: 'P1', productName: '产品1', quantity: 1, priority: 10 },
        { productCode: 'P2', productName: '产品2', quantity: 1, priority: 5 },
      ],
      bomRecords: [
        { bom_material_code: 'P1', parent_material_code: 'P1', material_code: 'M1', material_name: '主料M1', standard_usage: 10, bom_level: 1, bom_version: 'v1', alt_priority: 0, alt_group_no: 'G1', alt_method: '替代' },
        { bom_material_code: 'P1', parent_material_code: 'P1', material_code: 'M1-A', material_name: '替代料A', standard_usage: 10, bom_level: 1, bom_version: 'v1', alt_priority: 1, alt_group_no: 'G1', alt_method: '替代' },
        { bom_material_code: 'P1', parent_material_code: 'P1', material_code: 'M1-B', material_name: '替代料B', standard_usage: 10, bom_level: 1, bom_version: 'v1', alt_priority: 2, alt_group_no: 'G1', alt_method: '替代' },
        { bom_material_code: 'P2', parent_material_code: 'P2', material_code: 'M1', material_name: '主料M1', standard_usage: 10, bom_level: 1, bom_version: 'v1', alt_priority: 0, alt_group_no: 'G1', alt_method: '替代' },
      ] as any,
      availableInvMap: new Map([
        ['P1', 0],
        ['P2', 0],
        ['M1', 5],
        ['M1-A', 4],
        ['M1-B', 3],
      ]),
      inTransitMap: new Map(),
      materialAttrMap: new Map([
        ['M1', '外购'],
        ['M1-A', '外购'],
        ['M1-B', '外购'],
      ]),
      substituteEnabled: true,
    });

    expect(result.demands.map(d => d.productCode)).toEqual(['P1', 'P2']);
    expect(result.demands[0].materialResults[0].layers.layer2_rawMaterial).toBe(10);
    expect(result.demands[0].materialResults[0].layers.layer5_shortage).toBe(0);
    expect(result.demands[0].materialResults[0].substituteGroup?.members.map(m => m.consumedQty)).toEqual([5, 4, 1]);

    expect(result.demands[1].materialResults[0].layers.layer2_rawMaterial).toBe(0);
    expect(result.demands[1].materialResults[0].layers.layer5_shortage).toBe(10);
    expect(result.poolSnapshot.totalAvailableInv.get('M1')).toBe(5);
    expect(result.poolSnapshot.totalAvailableInv.get('M1-A')).toBe(4);
    expect(result.poolSnapshot.totalAvailableInv.get('M1-B')).toBe(3);
  });

  it('uses self shortage for hierarchy node instead of summing child shortages', async () => {
    const { allocateMultipleDemands } = await import('../demandFulfillmentService');

    const result = allocateMultipleDemands({
      demands: [
        { productCode: 'P', productName: '产品P', quantity: 10, priority: 0 },
      ],
      bomRecords: [
        { bom_material_code: 'P', parent_material_code: 'P', material_code: 'A', material_name: '自制A', standard_usage: 1, bom_level: 1, bom_version: 'v1' },
        { bom_material_code: 'P', parent_material_code: 'A', material_code: 'M1', material_name: '物料M1', standard_usage: 5, bom_level: 2, bom_version: 'v1' },
      ] as any,
      availableInvMap: new Map([
        ['P', 0],
        ['A', 3],
        ['M1', 0],
      ]),
      inTransitMap: new Map([
        ['A', 2],
        ['M1', 0],
      ]),
      materialAttrMap: new Map([
        ['A', '自制'],
        ['M1', '外购'],
      ]),
      substituteEnabled: false,
    });

    const hierarchy = result.demands[0].hierarchyResults || [];
    const aNode = hierarchy.find(row => row.materialCode === 'A');
    expect(aNode).toBeTruthy();
    expect(aNode?.isAggregateNode).toBe(true);
    expect(aNode?.grossRequirement).toBe(10);
    expect(aNode?.layers.layer5_shortage).toBe(5);
  });
});
