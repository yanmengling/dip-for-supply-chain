import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DemandFulfillmentSection from '../demandFulfillment/DemandFulfillmentSection';
import {
  analyzeBatchDemandFulfillment,
  analyzeProductCapacity,
  buildCapacityExportRows,
  buildFulfillmentExportRows,
} from '../../../services/demandFulfillmentService';
import { loadProducts } from '../../../services/planningV2DataService';

vi.mock('../../../services/demandFulfillmentService', () => ({
  analyzeBatchDemandFulfillment: vi.fn(),
  analyzeProductCapacity: vi.fn(),
  buildCapacityExportRows: vi.fn(() => []),
  buildFulfillmentExportRows: vi.fn(() => []),
}));

vi.mock('../../../services/planningV2DataService', () => ({
  checkForecastExists: vi.fn(),
  loadProducts: vi.fn(),
}));

const mockedAnalyzeProductCapacity = vi.mocked(analyzeProductCapacity);
const mockedAnalyzeBatchDemandFulfillment = vi.mocked(analyzeBatchDemandFulfillment);
const mockedBuildCapacityExportRows = vi.mocked(buildCapacityExportRows);
const mockedBuildFulfillmentExportRows = vi.mocked(buildFulfillmentExportRows);
const mockedLoadProducts = vi.mocked(loadProducts);

describe('DemandFulfillmentSection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedBuildCapacityExportRows.mockReturnValue([]);
    mockedBuildFulfillmentExportRows.mockReturnValue([]);
    mockedLoadProducts.mockResolvedValue([
      { material_number: 'SKU-002', material_name: '承接产品A' } as any,
      { material_number: 'SKU-003', material_name: '承接产品B' } as any,
    ]);
  });

  it('renders capacity analysis result after submission', async () => {
    const user = userEvent.setup();
    mockedAnalyzeProductCapacity.mockResolvedValue({
      productCode: 'SKU-001',
      productName: '测试产品',
      finishedGoodsStock: 12,
      theoreticalBuildQty: 8,
      totalSellableQty: 20,
      bottleneck: {
        materialCode: 'MAT-001',
        materialName: '瓶颈料',
        requiredQuantity: 2,
        availableQuantity: 16,
        canMake: 8,
      },
      materialDetails: [{
        materialCode: 'MAT-001',
        materialName: '瓶颈料',
        bomLevel: 1,
        parentMaterialCode: 'SKU-001',
        bomPathKey: 'SKU-001>MAT-001',
        requiredQtyPerUnit: 2,
        availableQty: 16,
        inTransitQty: 0,
        shortageQtyPerUnit: 0,
      }],
      analysisNote: {
        warehouseFilter: ['W1'],
        analysisTimestamp: '2026-04-06T12:00:00.000Z',
        substituteEnabled: false,
      },
    });

    render(<DemandFulfillmentSection onOpenNewMonitoringTask={vi.fn()} onOpenTaskList={vi.fn()} />);

    await user.type(screen.getByLabelText('产品（编码/名称）'), 'SKU-001');
    await user.click(screen.getByRole('button', { name: '执行可售能力分析' }));

    await waitFor(() => {
      expect(mockedAnalyzeProductCapacity).toHaveBeenCalledWith('SKU-001', 'SKU-001', false);
    });

    expect(screen.getByText('合计可售')).toBeInTheDocument();
    expect(screen.getByText('MAT-001')).toBeInTheDocument();
    expect(screen.getByText(/有效仓库：W1/)).toBeInTheDocument();
  });

  it('renders batch fulfillment result after submission', async () => {
    const user = userEvent.setup();
    mockedAnalyzeBatchDemandFulfillment.mockResolvedValue({
      demands: [
        {
          productCode: 'SKU-002',
          productName: '承接产品A',
          demandQty: 10,
          priority: 5,
          finishedGoodsStock: 3,
          theoreticalBuildQty: 4,
          totalSellableQty: 7,
          materialResults: [
            {
              materialCode: 'MAT-002',
              materialName: '主料A',
              grossRequirement: 10,
              substituteGroup: {
                altGroupNo: 'ALT-G-01',
                members: [
                  {
                    materialCode: 'MAT-002A',
                    materialName: '替代料A',
                    altPriority: 0,
                    availableQty: 30,
                    consumedQty: 6,
                  },
                  {
                    materialCode: 'MAT-002B',
                    materialName: '替代料B',
                    altPriority: 1,
                    availableQty: 20,
                    consumedQty: 0,
                  },
                ],
              },
              layers: {
                layer1_semiFinished: 2,
                layer2_rawMaterial: 3,
                layer3_inTransitPO: 1,
                layer4_disassemblyHint: null,
                layer5_shortage: 4,
              },
            },
          ],
          analysisNote: {
            isStaticSnapshot: true,
            substituteEnabled: true,
            warehouseFilter: ['WH-A'],
            analysisTimestamp: '2026-04-06T12:05:00.000Z',
          },
        },
        {
          productCode: 'SKU-003',
          productName: '承接产品B',
          demandQty: 6,
          priority: 1,
          finishedGoodsStock: 1,
          theoreticalBuildQty: 2,
          totalSellableQty: 3,
          materialResults: [
            {
              materialCode: 'MAT-003',
              materialName: '主料B',
              grossRequirement: 6,
              layers: {
                layer1_semiFinished: 1,
                layer2_rawMaterial: 1,
                layer3_inTransitPO: 0,
                layer4_disassemblyHint: null,
                layer5_shortage: 4,
              },
            },
          ],
          analysisNote: {
            isStaticSnapshot: true,
            substituteEnabled: true,
            warehouseFilter: ['WH-A'],
            analysisTimestamp: '2026-04-06T12:05:00.000Z',
          },
        },
      ],
      poolSnapshot: {
        totalAvailableInv: new Map(),
        totalInTransitPO: new Map(),
      },
    });

    render(<DemandFulfillmentSection onOpenNewMonitoringTask={vi.fn()} onOpenTaskList={vi.fn()} />);

    await user.click(screen.getByRole('button', { name: '新需求满足分析' }));
    await user.type(screen.getByLabelText('需求产品（编码/名称）'), 'SKU-002');
    await user.click(screen.getByRole('button', { name: /SKU-002/ }));
    await user.clear(screen.getByLabelText('需求数量'));
    await user.type(screen.getByLabelText('需求数量'), '10');
    await user.clear(screen.getByLabelText('优先级'));
    await user.type(screen.getByLabelText('优先级'), '5');
    await user.click(screen.getByRole('button', { name: '添加需求' }));

    await user.type(screen.getByLabelText('需求产品（编码/名称）'), 'SKU-003');
    await user.click(screen.getByRole('button', { name: /SKU-003/ }));
    await user.clear(screen.getByLabelText('需求数量'));
    await user.type(screen.getByLabelText('需求数量'), '6');
    await user.clear(screen.getByLabelText('优先级'));
    await user.type(screen.getByLabelText('优先级'), '1');
    await user.click(screen.getByRole('button', { name: '添加需求' }));
    await user.click(screen.getByLabelText('启用替代料核算'));
    await user.click(screen.getByRole('button', { name: '执行需求承接分析' }));

    await waitFor(() => {
      expect(mockedAnalyzeBatchDemandFulfillment).toHaveBeenCalledWith([
        {
          productCode: 'SKU-002',
          productName: '承接产品A',
          quantity: 10,
          priority: 5,
        },
        {
          productCode: 'SKU-003',
          productName: '承接产品B',
          quantity: 6,
          priority: 1,
        },
      ], true);
    });

    expect(screen.getByText('2 条需求')).toBeInTheDocument();
    expect(screen.getByText('SKU-002 / 需求 10 / 可售 7 / 优先级 5')).toBeInTheDocument();
    expect(screen.getByText('SKU-003 / 需求 6 / 可售 3 / 优先级 1')).toBeInTheDocument();
    expect(screen.getByText('MAT-002')).toBeInTheDocument();
    expect(screen.getByText('MAT-003')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /替代组 ALT-G-01/ }));
    expect(screen.getByText(/P1 MAT-002B/)).toBeInTheDocument();
    expect(screen.getByLabelText('产品编码')).toHaveValue('SKU-002');
  });
});
