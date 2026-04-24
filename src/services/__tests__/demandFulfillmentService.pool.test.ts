import { describe, expect, it, vi } from 'vitest';

vi.mock('../navigationConfigService', () => ({
  navigationConfigService: {
    getValidWarehouses: () => new Set(['昆山成品仓']),
  },
}));

describe('buildSupplyPool', () => {
  it('filters warehouses and closed PO records', async () => {
    const { buildSupplyPool } = await import('../demandFulfillmentService');

    const result = buildSupplyPool(
      [
        { material_code: 'MAT-1', available_inventory_qty: 10, warehouse: '昆山成品仓' },
        { material_code: 'MAT-1', available_inventory_qty: 99, warehouse: '无效仓' },
      ] as any,
      [
        { material_number: 'MAT-1', qty: 10, actqty: 4, rowclosestatus_title: '正常' },
        { material_number: 'MAT-1', qty: 8, actqty: 0, rowclosestatus_title: '已关闭' },
      ] as any,
      [
        { material_code: 'MAT-1', materialattr: '外购' },
      ] as any,
    );

    expect(result.availableInvMap.get('MAT-1')).toBe(10);
    expect(result.inTransitMap.get('MAT-1')).toBe(6);
    expect(result.materialAttrMap.get('MAT-1')).toBe('外购');
  });
});
