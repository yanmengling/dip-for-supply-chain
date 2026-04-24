import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import LargeForecastMaterialList from '../LargeForecastMaterialList';
import type { MRPPlanOrderAPI } from '../../../services/planningV2DataService';
import type { PRRecord, PORecord } from '../../../types/planningV2';

// Base mock MRP record
const mockMrp: MRPPlanOrderAPI = {
  billno: 'MRP-001',
  materialplanid_number: 'MAT-A',
  materialplanid_name: '物料A',
  materialattr_title: '外购',
  bizorderqty: 100,
  adviseorderqty: 100,
  bizdropqty: 0,
  dropstatus_title: '未投放',
  advisedroptime: '',
  advisestartdate: '',
  adviseenddate: '',
  startdate: '2026-04-01',
  enddate: '2026-04-10',
  orderdate: '',
  availabledate: '',
  closestatus_title: '正常',
  dropbilltype_name: '',
  droptime: '',
  rootdemandbillno: 'FC-001',
  planoperatenum: '',
  createtime: '',
  creator_name: '',
};

const emptyLeadtimeMap = new Map<string, { purchaseLeadtime: number; productLeadtime: number }>();

describe('LargeForecastMaterialList', () => {
  beforeAll(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-25T12:00:00Z'));
  });

  afterAll(() => {
    vi.useRealTimers();
  });

  it('renders table with MRP rows', () => {
    render(
      <LargeForecastMaterialList
        mrpRecords={[mockMrp]}
        prRecords={[]}
        poRecords={[]}
        materialLeadtimeMap={emptyLeadtimeMap}
        forecastDeadline="2026-06-01"
        isLoading={false}
      />
    );
    expect(screen.getByText('MAT-A')).toBeInTheDocument();
    expect(screen.getByText('MRP-001')).toBeInTheDocument();
  });

  it('renders skeleton when loading', () => {
    const { container } = render(
      <LargeForecastMaterialList
        mrpRecords={[]}
        prRecords={[]}
        poRecords={[]}
        materialLeadtimeMap={emptyLeadtimeMap}
        forecastDeadline="2026-06-01"
        isLoading={true}
      />
    );
    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('marks red when po deliver date > forecastDeadline', () => {
    const pr: PRRecord = {
      billno: 'PR-001',
      material_number: 'MAT-A',
      material_name: '物料A',
      qty: 100,
      biztime: '2026-03-01',
      joinqty: 100,
      auditdate: '2026-03-01',
      org_name: 'ORG',
      billtype_name: '请购单',
      srcbillnumber: 'MRP-001',
    };
    const po: PORecord = {
      billno: 'PO-001',
      material_number: 'MAT-A',
      material_name: '物料A',
      qty: 100,
      biztime: '2026-03-01',
      deliverdate: '2026-05-01',
      supplier_name: 'Supplier',
      operatorname: 'buyer',
      srcbillnumber: 'PR-001',
      actqty: 0,
      rowclosestatus_title: '',
    };
    render(
      <LargeForecastMaterialList
        mrpRecords={[mockMrp]}
        prRecords={[pr]}
        poRecords={[po]}
        materialLeadtimeMap={emptyLeadtimeMap}
        forecastDeadline="2026-04-15"
        isLoading={false}
      />
    );
    expect(screen.getByText(/红色预警/)).toBeInTheDocument();
  });

  it('marks red when no po and today+leadtime > deadline', () => {
    // No PO, purchaseLeadtime=60, deadline='2026-04-15'
    // today is 2026-03-25, today + 60 days = 2026-05-24 > 2026-04-15 => red
    const leadtimeMap = new Map([
      ['MAT-A', { purchaseLeadtime: 60, productLeadtime: 0 }],
    ]);
    render(
      <LargeForecastMaterialList
        mrpRecords={[mockMrp]}
        prRecords={[]}
        poRecords={[]}
        materialLeadtimeMap={leadtimeMap}
        forecastDeadline="2026-04-15"
        isLoading={false}
      />
    );
    expect(screen.getByText(/红色预警/)).toBeInTheDocument();
  });

  it('marks yellow for self-made when daysToLatestStart < 3', () => {
    // 自制, productLeadtime=2, deadline = today + 3 days
    // daysToStart = round((deadlineMs - 2*DAY - todayMs) / DAY) = round((3*DAY - 2*DAY) / DAY) = 1 => red
    // Let's use deadline = today + 4 days:
    // daysToStart = round((4*DAY - 2*DAY) / DAY) = 2 => yellow (< 3)
    const today = new Date('2026-03-25');
    const deadline = new Date(today.getTime() + 4 * 24 * 60 * 60 * 1000);
    const deadlineStr = deadline.toISOString().slice(0, 10);

    const selfMadeMrp: MRPPlanOrderAPI = {
      ...mockMrp,
      materialattr_title: '自制',
      materialplanid_number: 'MAT-B',
      materialplanid_name: '物料B',
      billno: 'MRP-002',
    };
    const leadtimeMap = new Map([
      ['MAT-B', { purchaseLeadtime: 0, productLeadtime: 2 }],
    ]);
    render(
      <LargeForecastMaterialList
        mrpRecords={[selfMadeMrp]}
        prRecords={[]}
        poRecords={[]}
        materialLeadtimeMap={leadtimeMap}
        forecastDeadline={deadlineStr}
        isLoading={false}
      />
    );
    expect(screen.getByText(/黄色提醒/)).toBeInTheDocument();
  });

  it('shows no risk badge when conditions are fine', () => {
    // 外购, leadtime=1, deadline='2026-04-15', no PO
    // today=2026-03-25, today + 1 day = 2026-03-26 <= 2026-04-15 => no red
    const leadtimeMap = new Map([
      ['MAT-A', { purchaseLeadtime: 1, productLeadtime: 0 }],
    ]);
    render(
      <LargeForecastMaterialList
        mrpRecords={[mockMrp]}
        prRecords={[]}
        poRecords={[]}
        materialLeadtimeMap={leadtimeMap}
        forecastDeadline="2026-04-15"
        isLoading={false}
      />
    );
    expect(screen.queryByText(/红色预警/)).not.toBeInTheDocument();
    expect(screen.queryByText(/黄色提醒/)).not.toBeInTheDocument();
  });

  it('shows standard lead time column', () => {
    const leadtimeMap = new Map([
      ['MAT-A', { purchaseLeadtime: 30, productLeadtime: 0 }],
    ]);
    render(
      <LargeForecastMaterialList
        mrpRecords={[mockMrp]}
        prRecords={[]}
        poRecords={[]}
        materialLeadtimeMap={leadtimeMap}
        forecastDeadline="2026-06-01"
        isLoading={false}
      />
    );
    expect(screen.getByText('30天')).toBeInTheDocument();
  });

  it('shows PO order date and promised delivery date columns', () => {
    const pr: PRRecord = {
      billno: 'PR-001',
      material_number: 'MAT-A',
      material_name: '物料A',
      qty: 100,
      biztime: '2026-03-10',
      joinqty: 100,
      auditdate: '2026-03-10',
      org_name: 'ORG',
      billtype_name: '请购单',
      srcbillnumber: 'MRP-001',
    };
    const po: PORecord = {
      billno: 'PO-001',
      material_number: 'MAT-A',
      material_name: '物料A',
      qty: 100,
      biztime: '2026-03-15',
      deliverdate: '2026-05-01',
      supplier_name: 'Supplier',
      operatorname: 'buyer',
      srcbillnumber: 'PR-001',
      actqty: 0,
      rowclosestatus_title: '',
    };
    render(
      <LargeForecastMaterialList
        mrpRecords={[mockMrp]}
        prRecords={[pr]}
        poRecords={[po]}
        materialLeadtimeMap={emptyLeadtimeMap}
        forecastDeadline="2026-06-01"
        isLoading={false}
      />
    );
    // PO交期 = poDeliverDate = max po.deliverdate
    expect(screen.getByText('2026-05-01')).toBeInTheDocument();
  });

  it('shows risk reason text visibly', () => {
    const leadtimeMap = new Map([
      ['MAT-A', { purchaseLeadtime: 60, productLeadtime: 0 }],
    ]);
    render(
      <LargeForecastMaterialList
        mrpRecords={[mockMrp]}
        prRecords={[]}
        poRecords={[]}
        materialLeadtimeMap={leadtimeMap}
        forecastDeadline="2026-04-15"
        isLoading={false}
      />
    );
    expect(screen.getByText(/红色预警/)).toBeInTheDocument();
    // risk reason should be visible in the DOM, not just a tooltip
    expect(screen.getByText(/今日起需/)).toBeInTheDocument();
  });

  it('re-marks first row after page change', () => {
    // 21 records with different material codes, page 1 shows 20
    const mrpRecords: MRPPlanOrderAPI[] = Array.from({ length: 21 }, (_, i) => ({
      ...mockMrp,
      billno: `MRP-${String(i + 1).padStart(3, '0')}`,
      materialplanid_number: `MAT-${String(i + 1).padStart(3, '0')}`,
      materialplanid_name: `物料${i + 1}`,
    }));

    render(
      <LargeForecastMaterialList
        mrpRecords={mrpRecords}
        prRecords={[]}
        poRecords={[]}
        materialLeadtimeMap={emptyLeadtimeMap}
        forecastDeadline="2026-06-01"
        isLoading={false}
      />
    );

    // Page 1 should show 20 different material codes
    for (let i = 1; i <= 20; i++) {
      expect(screen.getByText(`MAT-${String(i).padStart(3, '0')}`)).toBeInTheDocument();
    }
    // Material 21 should not be visible on page 1
    expect(screen.queryByText('MAT-021')).not.toBeInTheDocument();
  });
});
