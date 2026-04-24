import { describe, expect, it } from 'vitest';

describe('calculateCapacityForProduct', () => {
  it('separates finished stock from theoretical build quantity', async () => {
    const { calculateCapacityForProduct } = await import('../demandFulfillmentService');
    const result = calculateCapacityForProduct({
      productCode: 'P',
      productName: '产品P',
      bomRecords: [
        { parent_material_code: 'P', material_code: 'A', standard_usage: 2 },
        { parent_material_code: 'A', material_code: 'M1', standard_usage: 3 },
        { parent_material_code: 'A', material_code: 'M2', standard_usage: 5 },
      ] as any,
      availableInvMap: new Map([
        ['P', 30],
        ['M1', 1200],
        ['M2', 800],
      ]),
      substituteEnabled: false,
    });

    expect(result.finishedGoodsStock).toBe(30);
    expect(result.theoreticalBuildQty).toBe(80);
    expect(result.totalSellableQty).toBe(110);
    expect(result.bottleneck?.materialCode).toBe('M2');
  });
});
