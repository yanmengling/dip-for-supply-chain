import { describe, expect, it } from 'vitest';

describe('pegging with substitutes', () => {
  it('combines main and substitute inventories inside one group', async () => {
    const { pegging } = await import('../demandFulfillmentService');

    const results = pegging(
      {
        productCode: 'P',
        productName: '产品P',
        quantity: 1,
      },
      [
        { bom_material_code: 'P', parent_material_code: 'P', material_code: 'M1', material_name: '主料M1', standard_usage: 10, bom_level: 1, bom_version: 'v1', alt_priority: 0, alt_group_no: 'G1', alt_method: '替代' },
        { bom_material_code: 'P', parent_material_code: 'P', material_code: 'M1-A', material_name: '替代料A', standard_usage: 10, bom_level: 1, bom_version: 'v1', alt_priority: 1, alt_group_no: 'G1', alt_method: '替代' },
        { bom_material_code: 'P', parent_material_code: 'P', material_code: 'M1-B', material_name: '替代料B', standard_usage: 10, bom_level: 1, bom_version: 'v1', alt_priority: 2, alt_group_no: 'G1', alt_method: '替代' },
      ] as any,
      new Map([
        ['P', 0],
        ['M1', 5],
        ['M1-A', 4],
        ['M1-B', 3],
      ]),
      new Map(),
      new Map([
        ['M1', '外购'],
        ['M1-A', '外购'],
        ['M1-B', '外购'],
      ]),
      true,
    );

    expect(results).toHaveLength(1);
    expect(results[0].materialCode).toBe('M1');
    expect(results[0].grossRequirement).toBe(10);
    expect(results[0].layers.layer2_rawMaterial).toBe(10);
    expect(results[0].layers.layer5_shortage).toBe(0);
    expect(results[0].substituteGroup?.altGroupNo).toBe('G1');
    expect(results[0].substituteGroup?.members.map(m => m.consumedQty)).toEqual([5, 4, 1]);
  });

  it('keeps substitute groups separate for different BOM parent contexts', async () => {
    const { pegging } = await import('../demandFulfillmentService');

    const results = pegging(
      {
        productCode: 'P',
        productName: '产品P',
        quantity: 1,
      },
      [
        { bom_material_code: 'P', parent_material_code: 'P', material_code: 'A', material_name: '父件A', standard_usage: 1, bom_level: 1, bom_version: 'v1' },
        { bom_material_code: 'P', parent_material_code: 'P', material_code: 'B', material_name: '父件B', standard_usage: 1, bom_level: 1, bom_version: 'v1' },
        { bom_material_code: 'P', parent_material_code: 'A', material_code: 'M1', material_name: '主料M1-A', standard_usage: 2, bom_level: 2, bom_version: 'v1', alt_priority: 0, alt_group_no: 'G1', alt_method: '替代' },
        { bom_material_code: 'P', parent_material_code: 'A', material_code: 'M1-A', material_name: '替代料A', standard_usage: 2, bom_level: 2, bom_version: 'v1', alt_priority: 1, alt_group_no: 'G1', alt_method: '替代' },
        { bom_material_code: 'P', parent_material_code: 'B', material_code: 'M1', material_name: '主料M1-B', standard_usage: 3, bom_level: 2, bom_version: 'v1', alt_priority: 0, alt_group_no: 'G2', alt_method: '替代' },
        { bom_material_code: 'P', parent_material_code: 'B', material_code: 'M1-B', material_name: '替代料B', standard_usage: 3, bom_level: 2, bom_version: 'v1', alt_priority: 1, alt_group_no: 'G2', alt_method: '替代' },
      ] as any,
      new Map([
        ['P', 0],
        ['M1', 0],
        ['M1-A', 2],
        ['M1-B', 3],
      ]),
      new Map(),
      new Map([
        ['M1', '外购'],
        ['M1-A', '外购'],
        ['M1-B', '外购'],
      ]),
      true,
    );

    expect(results).toHaveLength(2);
    expect(results.map(item => item.bomPositionKey)).toEqual(['A>M1', 'B>M1']);
    expect(results.map(item => item.substituteGroup?.altGroupNo)).toEqual(['G1', 'G2']);
    expect(results[0].substituteGroup?.members.map(m => m.consumedQty)).toEqual([0, 2]);
    expect(results[1].substituteGroup?.members.map(m => m.consumedQty)).toEqual([0, 3]);
  });

  it('only builds substitute group when alt_method is 替代 under same parent and group', async () => {
    const { pegging } = await import('../demandFulfillmentService');

    const results = pegging(
      {
        productCode: 'P',
        productName: '产品P',
        quantity: 1,
      },
      [
        { bom_material_code: 'P', parent_material_code: 'P', material_code: 'M1', material_name: '主料M1', standard_usage: 5, bom_level: 1, bom_version: 'v1', alt_priority: 0, alt_group_no: 'G1', alt_method: '替代' },
        { bom_material_code: 'P', parent_material_code: 'P', material_code: 'M1-A', material_name: '替代料A', standard_usage: 5, bom_level: 1, bom_version: 'v1', alt_priority: 1, alt_group_no: 'G1', alt_method: '替代' },
        { bom_material_code: 'P', parent_material_code: 'P', material_code: 'M1-B', material_name: '不应入组', standard_usage: 5, bom_level: 1, bom_version: 'v1', alt_priority: 2, alt_group_no: 'G1', alt_method: '并行' },
      ] as any,
      new Map([
        ['P', 0],
        ['M1', 0],
        ['M1-A', 5],
        ['M1-B', 100],
      ]),
      new Map(),
      new Map([
        ['M1', '外购'],
        ['M1-A', '外购'],
        ['M1-B', '外购'],
      ]),
      true,
    );

    expect(results).toHaveLength(1);
    expect(results[0].substituteGroup?.members.map(m => m.materialCode)).toEqual(['M1', 'M1-A']);
    expect(results[0].layers.layer2_rawMaterial).toBe(5);
    expect(results[0].layers.layer5_shortage).toBe(0);
  });
});
