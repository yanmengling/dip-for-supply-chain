/**
 * 模拟演示服务 - Planning V2 Simulation Demo Service
 *
 * 提供正常变化和异常变化的模拟场景
 */

import type { MaterialTask, RiskAlert } from '../types/planningV2';

export interface SimulationStep {
  stepNumber: number;
  title: string;
  description: string;
  type: 'normal' | 'abnormal';
  changes?: {
    taskId?: string;
    field: string;
    oldValue: any;
    newValue: any;
    reason: string;
  }[];
  newRisks?: Partial<RiskAlert>[];
  duration: number; // 步骤持续时间(ms)
}

// 正常变化模拟场景 (7步)
export const normalSimulationSteps: SimulationStep[] = [
  {
    stepNumber: 1,
    title: '初始计划生成',
    description: '系统根据主生产计划生成物料需求计划，采用齐套倒排模式计算所有物料的需求时间',
    type: 'normal',
    duration: 2000,
  },
  {
    stepNumber: 2,
    title: '采购下单',
    description: '采购员根据物料需求计划，对缺料物料下达采购订单(PO)，状态从"未下PO"变为"已下PO"',
    type: 'normal',
    changes: [
      {
        taskId: 'task_mat_001',
        field: 'ganttStatus',
        oldValue: 'no_po',
        newValue: 'po_placed',
        reason: '采购员已下达PO: PO-2026-0125'
      }
    ],
    duration: 3000,
  },
  {
    stepNumber: 3,
    title: '供应商确认交期',
    description: '供应商确认采购订单并承诺交期，系统更新预计到货时间',
    type: 'normal',
    changes: [
      {
        taskId: 'task_mat_001',
        field: 'expectedDeliveryDate',
        oldValue: null,
        newValue: '2026-02-15',
        reason: '供应商确认交期: 2026-02-15'
      }
    ],
    duration: 2500,
  },
  {
    stepNumber: 4,
    title: '物料在途跟踪',
    description: '物料开始发货，系统显示物料在途状态，实时跟踪物流进度',
    type: 'normal',
    changes: [
      {
        taskId: 'task_mat_001',
        field: 'ganttStatus',
        oldValue: 'po_placed',
        newValue: 'normal',
        reason: '物料已发货，在途中'
      }
    ],
    duration: 2000,
  },
  {
    stepNumber: 5,
    title: '物料到货入库',
    description: '物料按时到货并完成质检入库，库存数量更新，状态变为"已就绪"',
    type: 'normal',
    changes: [
      {
        taskId: 'task_mat_001',
        field: 'currentInventory',
        oldValue: 0,
        newValue: 5000,
        reason: '物料到货入库: 5000 KG'
      },
      {
        taskId: 'task_mat_001',
        field: 'ganttStatus',
        oldValue: 'normal',
        newValue: 'ready',
        reason: '库存充足，已齐套'
      }
    ],
    duration: 3000,
  },
  {
    stepNumber: 6,
    title: '下级物料齐套检查',
    description: '系统自动检查该物料的父级任务，确认所有子级物料是否齐套完成',
    type: 'normal',
    duration: 2000,
  },
  {
    stepNumber: 7,
    title: '生产可启动',
    description: '所有下级物料齐套完成，父级生产任务可以按计划启动，实现准时生产',
    type: 'normal',
    duration: 2500,
  },
];

// 异常变化模拟场景 (5步)
export const abnormalSimulationSteps: SimulationStep[] = [
  {
    stepNumber: 1,
    title: '供应商交期延误通知',
    description: '供应商通知原材料交期延误3天，系统自动检测到交期变化',
    type: 'abnormal',
    changes: [
      {
        taskId: 'task_mat_002',
        field: 'expectedDeliveryDate',
        oldValue: '2026-02-10',
        newValue: '2026-02-13',
        reason: '供应商通知交期延误: 原因-生产线故障'
      }
    ],
    newRisks: [
      {
        level: 'abnormal',
        category: 'material',
        itemCode: 'RM-SH-T700',
        itemName: '碳纤维T700-12K',
        description: '供应商交期延误3天，可能影响上级生产计划',
        impact: '将导致组件 CP-CB-001 延期1天，进而影响产品交付',
      }
    ],
    duration: 3000,
  },
  {
    stepNumber: 2,
    title: '风险影响分析',
    description: '系统基于齐套倒排逻辑，自动分析延误对整个BOM树的影响范围和程度',
    type: 'abnormal',
    duration: 2500,
  },
  {
    stepNumber: 3,
    title: '协同建议生成',
    description: '系统生成多个协同建议方案，包括：寻找替代供应商、调整生产顺序、申请加急配送等',
    type: 'abnormal',
    newRisks: [
      {
        level: 'abnormal',
        suggestions: [
          '联系备选供应商 ABC公司 加急采购',
          '与客户沟通延期1天交付',
          '考虑使用现有库存的T800替代(需工程变更)',
        ]
      }
    ],
    duration: 3000,
  },
  {
    stepNumber: 4,
    title: '协同响应执行',
    description: '采购员采纳建议，联系备选供应商加急供货，并更新采购订单',
    type: 'abnormal',
    changes: [
      {
        taskId: 'task_mat_002',
        field: 'supplierName',
        oldValue: '上海某供应商',
        newValue: 'ABC公司(加急)',
        reason: '切换至备选供应商加急供货'
      },
      {
        taskId: 'task_mat_002',
        field: 'expectedDeliveryDate',
        oldValue: '2026-02-13',
        newValue: '2026-02-11',
        reason: '加急供货，交期提前2天'
      }
    ],
    duration: 3500,
  },
  {
    stepNumber: 5,
    title: '风险解除与计划恢复',
    description: '物料按新交期到货，风险告警解除，生产计划恢复正常，实现敏捷响应',
    type: 'abnormal',
    changes: [
      {
        taskId: 'task_mat_002',
        field: 'ganttStatus',
        oldValue: 'abnormal',
        newValue: 'ready',
        reason: '物料按加急交期到货，风险解除'
      }
    ],
    duration: 3000,
  },
];

export class PlanningSimulationService {
  private currentStepIndex: number = 0;
  private isPlaying: boolean = false;
  private simulationType: 'normal' | 'abnormal' | null = null;
  private timer: NodeJS.Timeout | null = null;

  getCurrentStep(): SimulationStep | null {
    if (!this.simulationType) return null;
    const steps = this.simulationType === 'normal' ? normalSimulationSteps : abnormalSimulationSteps;
    return steps[this.currentStepIndex] || null;
  }

  getSteps(): SimulationStep[] {
    if (!this.simulationType) return [];
    return this.simulationType === 'normal' ? normalSimulationSteps : abnormalSimulationSteps;
  }

  start(type: 'normal' | 'abnormal') {
    this.simulationType = type;
    this.currentStepIndex = 0;
    this.isPlaying = true;
  }

  pause() {
    this.isPlaying = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  resume() {
    this.isPlaying = true;
  }

  reset() {
    this.pause();
    this.currentStepIndex = 0;
    this.simulationType = null;
  }

  next() {
    const steps = this.getSteps();
    if (this.currentStepIndex < steps.length - 1) {
      this.currentStepIndex++;
      return true;
    }
    return false;
  }

  previous() {
    if (this.currentStepIndex > 0) {
      this.currentStepIndex--;
      return true;
    }
    return false;
  }

  isLastStep(): boolean {
    const steps = this.getSteps();
    return this.currentStepIndex === steps.length - 1;
  }

  isFirstStep(): boolean {
    return this.currentStepIndex === 0;
  }

  getProgress(): number {
    const steps = this.getSteps();
    if (steps.length === 0) return 0;
    return ((this.currentStepIndex + 1) / steps.length) * 100;
  }

  getIsPlaying(): boolean {
    return this.isPlaying;
  }

  getSimulationType(): 'normal' | 'abnormal' | null {
    return this.simulationType;
  }

  getCurrentStepIndex(): number {
    return this.currentStepIndex;
  }

  getTotalSteps(): number {
    return this.getSteps().length;
  }
}

export const planningSimulationService = new PlanningSimulationService();
