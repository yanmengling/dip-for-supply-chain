/**
 * 甘特图Tooltip - Gantt Tooltip (Enhanced)
 *
 * 按照PRD要求显示详细的采购、供应商和交期信息
 */

import { createPortal } from 'react-dom';
import { MessageCircle, Bell } from 'lucide-react';
import type { MaterialTask } from '../../../types/planningV2';

interface GanttTooltipProps {
  task: MaterialTask;
  x: number;
  y: number;
  allTasks?: MaterialTask[]; // 用于子物料齐套检查
  onAskAI?: (task: MaterialTask) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

const GanttTooltip = ({ task, x, y, allTasks = [], onAskAI, onMouseEnter, onMouseLeave }: GanttTooltipProps) => {
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ready': return '✓';
      case 'no_po': return '🔴';
      case 'po_placed': return '🟢';
      case 'normal': return '🟢';
      case 'abnormal': return '🟡';
      default: return '○';
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  };

  const calculateDuration = () => {
    const start = task.startDate.getTime();
    const end = task.endDate.getTime();
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    return days;
  };

  // 获取子物料齐套状态
  const getChildMaterialsStatus = () => {
    if (!task.childMaterials || task.childMaterials.length === 0) return null;

    return task.childMaterials.map(childCode => {
      const childTask = allTasks.find(t => t.materialCode === childCode);
      if (!childTask) return null;

      // 检查子物料是否会阻塞父级生产
      const isBlocking = childTask.endDate > task.startDate;
      const willDelay = childTask.status === 'abnormal' || childTask.status === 'no_po';

      return {
        code: childCode,
        name: childTask.materialName,
        status: childTask.status,
        icon: getStatusIcon(childTask.status),
        endDate: childTask.endDate,
        isBlocking,
        willDelay,
        supplierCommitDate: childTask.supplierCommitDate,
      };
    }).filter(Boolean);
  };

  const childMaterials = getChildMaterialsStatus();

  const tooltip = (
    <div
      className="fixed z-50"
      style={{
        left: `${x}px`,
        top: `${y}px`,
        transform: 'translateY(-50%)',
        pointerEvents: 'auto',
      }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="bg-white border-2 border-slate-300 rounded-lg shadow-2xl w-96 max-w-[400px]">
        {/* 标题 */}
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm font-mono text-slate-700 font-semibold">
              {task.materialCode}
            </span>
            <span className={`px-2 py-0.5 text-xs rounded font-medium
              ${task.materialType === 'product' ? 'bg-indigo-100 text-indigo-700' : ''}
              ${task.materialType === 'purchased' ? 'bg-green-100 text-green-700' : ''}
              ${task.materialType === 'outsourced' ? 'bg-orange-100 text-orange-700' : ''}
              ${task.materialType === 'manufactured' ? 'bg-purple-100 text-purple-700' : ''}
            `}>
              {task.materialType === 'product' && '产品'}
              {task.materialType === 'purchased' && '物料(外购)'}
              {task.materialType === 'outsourced' && '组件(委外)'}
              {task.materialType === 'manufactured' && '组件(自制)'}
            </span>
          </div>
          <div className="font-semibold text-slate-900 text-base">{task.materialName}</div>
        </div>

        <div className="px-4 py-3 space-y-3 text-sm max-h-[500px] overflow-y-auto">
          {/* 类型和需求数量 */}
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-slate-600">需求数量:</span>
              <span className="font-semibold text-slate-900">{task.requiredQuantity.toLocaleString()} {task.unit}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600">库存数量:</span>
              <span className={`font-semibold ${
                task.availableInventory >= task.requiredQuantity
                  ? 'text-green-600'
                  : task.availableInventory > 0
                    ? 'text-orange-600'
                    : 'text-red-600'
              }`}>
                {task.availableInventory.toLocaleString()} {task.unit}
                {task.availableInventory >= task.requiredQuantity && ' ✓ 充足'}
                {task.availableInventory < task.requiredQuantity && task.availableInventory > 0 &&
                  ` ⚠ 不足(缺口${task.shortage.toLocaleString()})`}
                {task.availableInventory === 0 && ' ⚠ 严重不足'}
              </span>
            </div>
          </div>

          {/* 采购状态部分 - 外购/委外物料 */}
          {(task.materialType === 'purchased' || task.materialType === 'outsourced') && (
            <>
              <div className="border-t border-slate-200 pt-3 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">采购状态:</span>
                  <span className="font-semibold">
                    {task.status === 'ready' && <span className="text-green-600">✓ 已就绪(库存满足)</span>}
                    {task.status === 'no_po' && <span className="text-red-600">🔴 未下PO</span>}
                    {task.status === 'po_placed' && <span className="text-blue-600">🟢 已下PO</span>}
                    {task.status === 'normal' && <span className="text-blue-600">🟢 已下PO</span>}
                    {task.status === 'abnormal' && <span className="text-orange-600">🟡 已下PO</span>}
                  </span>
                </div>
                {task.prNumber && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">PR请购单:</span>
                    <span className="font-medium text-slate-900">
                      {task.prNumber}
                      {task.prDate && ` (${formatDate(task.prDate)})`}
                      {' ✓'}
                    </span>
                  </div>
                )}
                {task.poNumber ? (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">PO采购单:</span>
                    <span className="font-medium text-slate-900">
                      {task.poNumber}
                      {task.poDate && ` (${formatDate(task.poDate)})`}
                      {' ✓'}
                    </span>
                  </div>
                ) : task.status === 'no_po' && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">PO采购单:</span>
                    <span className="text-red-600 font-medium">- (待下单)</span>
                  </div>
                )}
              </div>

              {/* 供应商信息 */}
              <div className="border-t border-slate-200 pt-3 space-y-1">
                {task.supplierName && (
                  <div className="flex justify-between items-start">
                    <span className="text-slate-600">供应商:</span>
                    <span className="font-medium text-slate-900 text-right max-w-[220px]">
                      {task.supplierName}
                    </span>
                  </div>
                )}
                {task.deliveryCycle && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">交付周期:</span>
                    <span className="font-medium text-slate-900">{task.deliveryCycle}天/次</span>
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">计划到货时间:</span>
                  <span className="font-medium text-slate-900">{formatDate(task.planArrivalDate)}</span>
                </div>
                {task.supplierCommitDate ? (
                  <div className="flex justify-between items-start">
                    <span className="text-slate-600">供应商承诺时间:</span>
                    <span className={`font-medium ${
                      task.supplierCommitDate <= task.planArrivalDate
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}>
                      {formatDate(task.supplierCommitDate)}
                      {task.supplierCommitDate <= task.planArrivalDate && ' ✓ 正常'}
                      {task.supplierCommitDate > task.planArrivalDate && task.tooltipData.delayDays &&
                        ` 🔴 逾期${task.tooltipData.delayDays}天`}
                    </span>
                  </div>
                ) : task.status !== 'ready' && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">供应商承诺时间:</span>
                    <span className="text-slate-500 font-medium">- (待确认)</span>
                  </div>
                )}
                {task.buyer && (
                  <div className="flex justify-between items-center">
                    <span className="text-slate-600">采购员:</span>
                    <span className="font-medium text-slate-900">{task.buyer}</span>
                  </div>
                )}
              </div>
            </>
          )}

          {/* 生产信息部分 - 自制组件 */}
          {task.materialType === 'manufactured' && (
            <div className="border-t border-slate-200 pt-3 space-y-1">
              {task.productionRate && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">生产效率:</span>
                  <span className="font-medium text-slate-900">{task.productionRate}/天</span>
                </div>
              )}
              {task.productionDays && (
                <div className="flex justify-between items-center">
                  <span className="text-slate-600">生产时长:</span>
                  <span className="font-medium text-slate-900">{task.productionDays}天(补足缺口)</span>
                </div>
              )}
            </div>
          )}

          {/* 子物料齐套检查 */}
          {childMaterials && childMaterials.length > 0 && (
            <div className="border-t border-slate-200 pt-3">
              <div className="text-slate-700 font-medium mb-2">
                子物料齐套检查:
                {childMaterials.some((c: any) => c.willDelay) && (
                  <span className="ml-2 text-xs text-orange-600">⚠ 存在风险</span>
                )}
              </div>
              <div className="space-y-1.5 pl-2">
                {childMaterials.map((child: any, idx) => (
                  <div key={idx} className="text-xs">
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5">{idx === childMaterials.length - 1 ? '└─' : '├─'}</span>
                      <span>{child.icon}</span>
                      <span className="text-slate-700 flex-1">
                        <span className="font-medium">{child.code}</span> {child.name}
                        {child.status === 'ready' && <span className="text-green-600"> - 已就绪</span>}
                        {child.status === 'no_po' && <span className="text-red-600"> - 未下PO ⚠</span>}
                        {child.status === 'po_placed' && <span className="text-blue-600"> - 已下PO</span>}
                        {child.status === 'normal' && <span className="text-blue-600"> - 在途</span>}
                        {child.status === 'abnormal' && <span className="text-orange-600"> - 延迟 ⚠</span>}
                      </span>
                    </div>
                    {child.endDate && (
                      <div className="ml-8 text-slate-500">
                        到货时间: {formatDate(child.endDate)}
                        {child.isBlocking && (
                          <span className="ml-1 text-red-600">⚠ 可能阻塞生产</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {childMaterials.every((c: any) => c.status === 'ready') && (
                <div className="mt-2 text-xs text-green-600 bg-green-50 rounded px-2 py-1 border border-green-200">
                  ✓ 所有子物料已齐套，可按计划生产
                </div>
              )}
            </div>
          )}

          {/* 影响说明 */}
          {task.tooltipData.impact && (
            <div className="border-t border-slate-200 pt-3">
              <div className="bg-yellow-50 border border-yellow-300 rounded p-2 text-xs">
                <span className="font-medium text-yellow-900">⚠ 影响: </span>
                <span className="text-yellow-800">{task.tooltipData.impact}</span>
              </div>
            </div>
          )}

          {/* 状态与时间 */}
          <div className="border-t border-slate-200 pt-3 space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-slate-600">状态:</span>
              <span className={`font-medium text-sm ${
                task.status === 'ready' ? 'text-green-600' :
                task.status === 'no_po' ? 'text-red-600' :
                task.status === 'abnormal' ? 'text-orange-600' :
                'text-blue-600'
              }`}>
                {task.tooltipData.status}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-slate-600">时间:</span>
              <span className="font-medium text-slate-900">
                {formatDate(task.startDate)} ~ {formatDate(task.endDate)}
                <span className="text-slate-500 ml-1">({calculateDuration()}天)</span>
              </span>
            </div>
          </div>

          {/* 倒排模式提示 */}
          {task.bomLevel > 0 && (
            <div className="text-xs text-indigo-700 bg-indigo-50 rounded px-3 py-2 border border-indigo-200">
              ⏪ 倒排模式: 此物料需在父级生产前1天完成齐套
            </div>
          )}

          {/* 操作按钮 */}
          <div className="border-t border-slate-200 pt-3 flex gap-2">
            {task.status === 'no_po' && task.buyer && (
              <button className="flex-1 px-3 py-2 text-xs border border-red-300 rounded hover:bg-red-50 transition-colors text-red-700 font-medium flex items-center justify-center gap-1.5">
                <Bell className="w-3.5 h-3.5" />
                通知采购员下PO
              </button>
            )}
            <button
              onClick={() => onAskAI?.(task)}
              className="flex-1 px-3 py-2 text-xs border border-indigo-300 rounded hover:bg-indigo-50 transition-colors text-indigo-700 font-medium flex items-center justify-center gap-1.5"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              与AI助手对话
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(tooltip, document.body);
};

export default GanttTooltip;
