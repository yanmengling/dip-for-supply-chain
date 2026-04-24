import { describe, expect, it } from 'vitest';

describe('pegging', () => {
  it('accumulates repeated leaf demand and consumes layer 1 before layer 2 and 3', async () => {
    const { pegging } = await import('../demandFulfillmentService');

    const results = pegging(
      {
        productCode: 'P',
        productName: '产品P',
        quantity: 2,
      },
      [
        { bom_material_code: 'P', parent_material_code: 'P', material_code: 'A', material_name: '半成品A', standard_usage: 2, bom_level: 1, bom_version: 'v1' },
        { bom_material_code: 'P', parent_material_code: 'P', material_code: 'B', material_name: '半成品B', standard_usage: 1, bom_level: 1, bom_version: 'v1' },
        { bom_material_code: 'P', parent_material_code: 'A', material_code: 'C', material_name: '原材料C', standard_usage: 3, bom_level: 2, bom_version: 'v1' },
        { bom_material_code: 'P', parent_material_code: 'B', material_code: 'C', material_name: '原材料C', standard_usage: 4, bom_level: 2, bom_version: 'v1' },
        { bom_material_code: 'P', parent_material_code: 'B', material_code: 'D', material_name: '原材料D', standard_usage: 2, bom_level: 2, bom_version: 'v1' },
      ] as any,
      new Map([
        ['P', 0],
        ['A', 1],
        ['C', 12],
        ['D', 1],
      ]),
      new Map([
        ['C', 0],
        ['D', 5],
      ]),
      new Map([
        ['A', '自制'],
        ['C', '外购'],
        ['D', '外购'],
      ]),
      false,
    );

    const summary = new Map<string, {
      grossRequirement: number;
      layer1: number;
      layer2: number;
      layer3: number;
      shortage: number;
    }>();

    for (const row of results) {
      const prev = summary.get(row.materialCode) || {
        grossRequirement: 0,
        layer1: 0,
        layer2: 0,
        layer3: 0,
        shortage: 0,
      };
      summary.set(row.materialCode, {
        grossRequirement: prev.grossRequirement + row.grossRequirement,
        layer1: prev.layer1 + row.layers.layer1_semiFinished,
        layer2: prev.layer2 + row.layers.layer2_rawMaterial,
        layer3: prev.layer3 + row.layers.layer3_inTransitPO,
        shortage: prev.shortage + row.layers.layer5_shortage,
      });
    }

    expect(summary.get('C')?.grossRequirement).toBe(20);
    expect(summary.get('C')?.layer1).toBe(3);
    expect(summary.get('C')?.layer2).toBe(12);
    expect(summary.get('C')?.layer3).toBe(0);
    expect(summary.get('C')?.shortage).toBe(5);

    expect(summary.get('D')?.grossRequirement).toBe(4);
    expect(summary.get('D')?.layer1).toBe(0);
    expect(summary.get('D')?.layer2).toBe(1);
    expect(summary.get('D')?.layer3).toBe(3);
    expect(summary.get('D')?.shortage).toBe(0);
  });

  it('mutates the shared supply pools in place', async () => {
    const { pegging } = await import('../demandFulfillmentService');

    const availableInvMap = new Map([
      ['P', 0],
      ['A', 1],
      ['C', 12],
      ['D', 1],
    ]);
    const inTransitMap = new Map([
      ['C', 0],
      ['D', 5],
    ]);

    pegging(
      {
        productCode: 'P',
        productName: '产品P',
        quantity: 2,
      },
      [
        { bom_material_code: 'P', parent_material_code: 'P', material_code: 'A', material_name: '半成品A', standard_usage: 2, bom_level: 1, bom_version: 'v1' },
        { bom_material_code: 'P', parent_material_code: 'P', material_code: 'B', material_name: '半成品B', standard_usage: 1, bom_level: 1, bom_version: 'v1' },
        { bom_material_code: 'P', parent_material_code: 'A', material_code: 'C', material_name: '原材料C', standard_usage: 3, bom_level: 2, bom_version: 'v1' },
        { bom_material_code: 'P', parent_material_code: 'B', material_code: 'C', material_name: '原材料C', standard_usage: 4, bom_level: 2, bom_version: 'v1' },
        { bom_material_code: 'P', parent_material_code: 'B', material_code: 'D', material_name: '原材料D', standard_usage: 2, bom_level: 2, bom_version: 'v1' },
      ] as any,
      availableInvMap,
      inTransitMap,
      new Map([
        ['A', '自制'],
        ['C', '外购'],
        ['D', '外购'],
      ]),
      false,
    );

    expect(availableInvMap.get('C')).toBe(0);
    expect(availableInvMap.get('D')).toBe(0);
    expect(inTransitMap.get('D')).toBe(2);
  });

  it('consumes finished goods first and should not produce shortage when FG already covers demand', async () => {
    const { pegging } = await import('../demandFulfillmentService');

    const results = pegging(
      {
        productCode: 'P',
        productName: '产品P',
        quantity: 100,
      },
      [
        { bom_material_code: 'P', parent_material_code: 'P', material_code: 'C', material_name: '原材料C', standard_usage: 2, bom_level: 1, bom_version: 'v1' },
      ] as any,
      new Map([
        ['P', 574],
        ['C', 0],
      ]),
      new Map([
        ['C', 0],
      ]),
      new Map([
        ['C', '外购'],
      ]),
      false,
    );

    expect(results.every(row => row.layers.layer5_shortage === 0)).toBe(true);
    expect(results.every(row => row.grossRequirement === 0)).toBe(true);
  });
});
