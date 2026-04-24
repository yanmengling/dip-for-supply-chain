import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { LargeForecastTaskDetailView } from '../LargeForecastTaskDetailView';

vi.mock('../../../services/planningV2DataService', () => ({
  loadForecastByBillno: vi.fn().mockResolvedValue([
    {
      billno: 'FC-001', material_number: 'PROD-A', material_name: '产品A',
      startdate: '2026-04-15', enddate: '2026-04-15', qty: 100,
      bizdate: '', creator_name: '', auditdate: '', auditor_name: '',
    },
  ]),
  loadMRPByBillnos: vi.fn().mockResolvedValue({
    data: [{
      billno: 'MRP-001', materialplanid_number: 'MAT-A', materialplanid_name: '物料A',
      materialattr_title: '外购', bizorderqty: 50, adviseorderqty: 50, bizdropqty: 0,
      dropstatus_title: '未投放', advisedroptime: '', advisestartdate: '',
      adviseenddate: '', startdate: '2026-04-01', enddate: '2026-04-10',
      orderdate: '', availabledate: '', closestatus_title: '正常',
      dropbilltype_name: '', droptime: '', rootdemandbillno: 'FC-001',
      planoperatenum: '', createtime: '', creator_name: '',
    }],
    isDegraded: false,
  }),
  loadInventoryByMaterials: vi.fn().mockResolvedValue([]),
  loadPRByMRPBillnos: vi.fn().mockResolvedValue({ data: [] }),
  loadPOByPRBillnos: vi.fn().mockResolvedValue({ data: [] }),
  loadMaterialsByCode: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../../services/monitoringTaskApiService', () => ({
  pushFormDataToDIP: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../services/taskService', () => ({
  taskService: {
    createTask: vi.fn(),
  },
}));

describe('LargeForecastTaskDetailView - monitor section', () => {
  it('renders 整体物料监控清单 section after data loads', async () => {
    render(
      <LargeForecastTaskDetailView
        task={{
          id: 't1', taskType: 'large-forecast', name: '测试大预测单', status: 'active',
          forecastBillno: 'FC-001',
          forecastMeta: { bizdate: '', auditorName: '', creatorName: '', totalProducts: 1 },
          createdAt: '2026-03-01', updatedAt: '2026-03-01',
        }}
        allTasks={[]}
        onBack={vi.fn()}
        onViewSmallTask={vi.fn()}
        onStartNewTaskFromForecast={vi.fn()}
        onBatchCreated={vi.fn()}
      />
    );
    await waitFor(() => {
      expect(screen.getByText('整体物料监控清单')).toBeInTheDocument();
    });
  });
});
