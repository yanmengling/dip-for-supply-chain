import { describe, expect, it } from 'vitest';
import type { BatchFulfillmentResult } from '../../types/planningV2';

describe('demand fulfillment types', () => {
  it('accepts the frozen batch result structure', () => {
    const result: BatchFulfillmentResult = {
      demands: [
        {
          productCode: 'P-001',
          productName: '产品1',
          demandQty: 100,
          priority: 10,
          finishedGoodsStock: 30,
          theoreticalBuildQty: 80,
          totalSellableQty: 110,
          materialResults: [
            {
              materialCode: 'M-001',
              materialName: '物料1',
              grossRequirement: 120,
              layers: {
                layer1_semiFinished: 20,
                layer2_rawMaterial: 70,
                layer3_inTransitPO: 20,
                layer4_disassemblyHint: 5,
                layer5_shortage: 5,
              },
              substituteGroup: {
                altGroupNo: 'G-001',
                members: [
                  {
                    materialCode: 'M-001',
                    materialName: '物料1',
                    altPriority: 0,
                    availableQty: 70,
                    consumedQty: 60,
                  },
                ],
              },
              unitPrice: 12.5,
            },
          ],
          analysisNote: {
            isStaticSnapshot: true,
            substituteEnabled: true,
            warehouseFilter: ['昆山成品仓'],
            analysisTimestamp: '2026-04-06T00:00:00.000Z',
          },
        },
      ],
      poolSnapshot: {
        totalAvailableInv: new Map([
          ['P-001', 30],
          ['M-001', 90],
        ]),
        totalInTransitPO: new Map([
          ['M-001', 20],
        ]),
      },
    };

    expect(result.demands[0].materialResults[0].substituteGroup?.members[0].consumedQty).toBe(60);
  });
});
