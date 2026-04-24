import { describe, expect, it, vi } from 'vitest';

vi.mock('../../api', () => ({
  ontologyApi: {
    queryObjectInstances: vi.fn((_, params) => {
      const field = params?.condition?.sub_conditions?.[0]?.field;
      if (field === 'srcbillnumber') {
        return Promise.resolve({
          entries: [
            {
              billno: 'PO-002',
              material_number: 'MAT-002',
              material_name: '物料2',
              qty: '12',
              actqty: '3',
              deliverdate: '2026-04-21',
              rowclosestatus_title: '正常',
              srcbillnumber: 'PR-001',
            },
          ],
        });
      }

      return Promise.resolve({
        entries: [
          {
            billno: 'PO-001',
            material_number: 'MAT-001',
            material_name: '物料1',
            qty: '10',
            actqty: '2',
            deliverdate: '2026-04-20',
            rowclosestatus_title: '正常',
          },
        ],
      });
    }),
  },
}));

describe('loadPOByMaterials', () => {
  it('maps rowclosestatus_title onto PORecord', async () => {
    const { loadPOByMaterials } = await import('../planningV2DataService');
    const rows = await loadPOByMaterials(['MAT-001']);

    expect(rows).toHaveLength(1);
    expect(rows[0].rowclosestatus_title).toBe('正常');
  });
});

describe('loadPOByPRBillnos', () => {
  it('maps rowclosestatus_title onto precise PO records', async () => {
    const { loadPOByPRBillnos } = await import('../planningV2DataService');
    const rows = await loadPOByPRBillnos(['PR-001'], '');

    expect(rows.data).toHaveLength(1);
    expect(rows.data[0].rowclosestatus_title).toBe('正常');
  });
});
