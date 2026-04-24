import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DemandFulfillmentSection from '../demandFulfillment/DemandFulfillmentSection';
import type { PlanningTask } from '../../../types/planningV2';
import { checkForecastExists, loadProducts } from '../../../services/planningV2DataService';

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

const mockedCheckForecastExists = vi.mocked(checkForecastExists);
const mockedLoadProducts = vi.mocked(loadProducts);

const renderSection = (overrides?: Partial<React.ComponentProps<typeof DemandFulfillmentSection>>) => {
  const props = {
    onNavigateToMonitoringTask: vi.fn(),
    onOpenNewMonitoringTask: vi.fn(),
    onOpenTaskList: vi.fn(),
    findMonitoringTaskByProduct: vi.fn(),
    ...overrides,
  };

  render(<DemandFulfillmentSection {...props} />);

  return props;
};

describe('DemandFulfillmentSection monitoring jump', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedCheckForecastExists.mockReset();
    mockedLoadProducts.mockResolvedValue([]);
  });

  it('navigates to task detail when an existing monitoring task is found', async () => {
    const user = userEvent.setup();
    const existingTask = {
      id: 'task-001',
      productCode: 'SKU-001',
      productName: '测试产品',
    } as PlanningTask;
    const { onNavigateToMonitoringTask, onOpenNewMonitoringTask, findMonitoringTaskByProduct } = renderSection({
      findMonitoringTaskByProduct: vi.fn(() => existingTask),
    });

    mockedCheckForecastExists.mockResolvedValue(false);

    await user.click(screen.getByRole('button', { name: '新需求满足分析' }));
    await user.type(screen.getByLabelText('产品编码'), 'SKU-001');
    await user.click(screen.getByRole('button', { name: '跳转监测' }));

    await waitFor(() => {
      expect(findMonitoringTaskByProduct).toHaveBeenCalledWith('SKU-001');
      expect(onNavigateToMonitoringTask).toHaveBeenCalledWith('task-001');
    });
    expect(onOpenNewMonitoringTask).not.toHaveBeenCalled();
    expect(mockedCheckForecastExists).not.toHaveBeenCalled();
  });

  it('opens a new monitoring task when no task exists but forecast exists', async () => {
    const user = userEvent.setup();
    const { onNavigateToMonitoringTask, onOpenNewMonitoringTask, findMonitoringTaskByProduct } = renderSection({
      findMonitoringTaskByProduct: vi.fn(() => undefined),
    });

    mockedCheckForecastExists.mockResolvedValue(true);

    await user.click(screen.getByRole('button', { name: '新需求满足分析' }));
    await user.type(screen.getByLabelText('产品编码'), 'SKU-002');
    await user.click(screen.getByRole('button', { name: '跳转监测' }));

    await waitFor(() => {
      expect(findMonitoringTaskByProduct).toHaveBeenCalledWith('SKU-002');
      expect(mockedCheckForecastExists).toHaveBeenCalledWith('SKU-002');
      expect(onOpenNewMonitoringTask).toHaveBeenCalledWith('SKU-002');
    });
    expect(onNavigateToMonitoringTask).not.toHaveBeenCalled();
  });

  it('shows a blocking warning when no task exists and no forecast exists', async () => {
    const user = userEvent.setup();
    const { onNavigateToMonitoringTask, onOpenNewMonitoringTask, findMonitoringTaskByProduct } = renderSection({
      findMonitoringTaskByProduct: vi.fn(() => undefined),
    });

    mockedCheckForecastExists.mockResolvedValue(false);

    await user.click(screen.getByRole('button', { name: '新需求满足分析' }));
    await user.type(screen.getByLabelText('产品编码'), 'SKU-003');
    await user.click(screen.getByRole('button', { name: '跳转监测' }));

    await waitFor(() => {
      expect(findMonitoringTaskByProduct).toHaveBeenCalledWith('SKU-003');
      expect(mockedCheckForecastExists).toHaveBeenCalledWith('SKU-003');
    });

    expect(onNavigateToMonitoringTask).not.toHaveBeenCalled();
    expect(onOpenNewMonitoringTask).not.toHaveBeenCalled();
    expect(
      screen.getByText('产品 SKU-003 尚未下发需求预测单（Forecast）。请先在 ERP/PMC 流程中下发预测单，再回来创建监测任务。'),
    ).toBeInTheDocument();
  });
});
