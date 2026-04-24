/**
 * 关联生产工单追踪组件
 *
 * PRD 6.5 / v4.2: 只读展示关联生产工单状态
 * - 精确关联: sourcebillnumber in [selfMadeMrpBillnos]
 *   （自制件 MRP 计划订单单号 → 生产工单来源单据号）
 * - 工单完成判定: pendingInboundQty <= 0 || taskstatus_title === '完工'
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, Factory, Info } from 'lucide-react';
import { planningV2DataService } from '../../services/planningV2DataService';
import type { MPSWorkOrderAPI } from '../../services/planningV2DataService';

interface WorkOrderTrackerProps {
  /** 外部传入的 MPS 工单数据（由 MultiProductTaskDetailView 统一加载） */
  orders?: MPSWorkOrderAPI[];
  /** v4.2: 自制件 MRP 计划订单单号列表（仅当 orders 未传入时自行加载） */
  selfMadeMrpBillnos?: string[];
  /** v4.2: MRP billno → 投放时间，来自 ganttService，用于展示每条工单对应的 MRP 投放时间 */
  mrpDroptimeMap?: Record<string, string>;
}

/** 工单状态映射 (PRD 4.5.4) */
const taskStatusConfig: Record<string, { label: string; className: string }> = {
  '未开工': { label: '未开工', className: 'bg-gray-100 text-gray-600' },
  '开工': { label: '进行中', className: 'bg-blue-100 text-blue-700' },
  '部分完工': { label: '部分完工', className: 'bg-orange-100 text-orange-700' },
  '完工': { label: '已完工', className: 'bg-green-100 text-green-700' },
};

const pickStatusConfig: Record<string, string> = {
  '未领料': '未领料',
  '部分领料': '部分领料',
  '全部领料': '全部领料',
  '超额领料': '超额领料',
};

const WorkOrderTracker = ({ orders: externalOrders, selfMadeMrpBillnos = [], mrpDroptimeMap = {} }: WorkOrderTrackerProps) => {
  const [internalOrders, setInternalOrders] = useState<MPSWorkOrderAPI[]>([]);
  const [loading, setLoading] = useState(false);

  // 外部传入时直接使用；未传入时自行加载（向后兼容）
  const orders = externalOrders ?? internalOrders;

  const fetchOrders = useCallback(async () => {
    if (externalOrders) return; // 外部已提供，无需加载
    setLoading(true);
    try {
      const data = await planningV2DataService.loadMPSBySelfMadeMrpBillnos(selfMadeMrpBillnos);
      setInternalOrders(data);
    } catch (err) {
      console.error('[WorkOrderTracker] 加载失败:', err);
      setInternalOrders([]);
    } finally {
      setLoading(false);
    }
  }, [externalOrders, selfMadeMrpBillnos]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // 工单统计 (PRD 6.5.2)
  const stats = useMemo(() => {
    const total = orders.length;
    const completed = orders.filter(o => o.taskstatus_title === '完工').length;
    const inProgress = orders.filter(o =>
      o.taskstatus_title === '开工' || o.taskstatus_title === '部分完工'
    ).length;
    const notStarted = orders.filter(o => o.taskstatus_title === '未开工').length;
    const totalQty = orders.reduce((s, o) => s + o.qty, 0);
    const totalInbound = orders.reduce((s, o) => s + o.stockinqty, 0);
    const inboundRate = totalQty > 0 ? Math.round((totalInbound / totalQty) * 1000) / 10 : 0;

    return { total, completed, inProgress, notStarted, totalQty, totalInbound, inboundRate };
  }, [orders]);

  if (loading) {
    return (
      <div className="border border-slate-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          正在加载关联生产工单...
        </div>
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-slate-50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Factory className="w-4 h-4 text-slate-500" />
          <h4 className="text-sm font-semibold text-slate-800">关联生产工单</h4>
        </div>
      </div>

      {orders.length === 0 ? (
        /* No orders */
        <div className="px-4 py-6 text-center">
          <Info className="w-6 h-6 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-slate-500">
            当前尚无匹配相应需求预测单的生产工单
          </p>
        </div>
      ) : (
        <>
          {/* Summary stats */}
          <div className="px-4 py-3 border-b border-slate-100 flex flex-wrap items-center gap-4 text-sm">
            <div>
              <span className="text-slate-500">工单: </span>
              <span className="font-medium">{stats.total}</span>
              <span className="text-slate-400 ml-1 text-xs">
                (完工 {stats.completed} / 进行中 {stats.inProgress} / 未开工 {stats.notStarted})
              </span>
            </div>
            <div>
              <span className="text-slate-500">计划生产: </span>
              <span className="font-medium">{stats.totalQty.toLocaleString()}</span>
            </div>
            <div>
              <span className="text-slate-500">已入库: </span>
              <span className="font-medium">{stats.totalInbound.toLocaleString()}</span>
              <span className="text-slate-400 ml-1 text-xs">
                ({stats.inboundRate}%)
              </span>
            </div>
          </div>

          {/* Order table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 border-b border-slate-200">
                  <th className="text-left px-3 py-2 font-medium">工单号</th>
                  <th className="text-left px-3 py-2 font-medium whitespace-nowrap">MRP需求号</th>
                  <th className="text-left px-3 py-2 font-medium">物料</th>
                  <th className="text-center px-3 py-2 font-medium whitespace-nowrap">MRP投放时间</th>
                  <th className="text-center px-3 py-2 font-medium whitespace-nowrap">计划开工</th>
                  <th className="text-center px-3 py-2 font-medium whitespace-nowrap">计划完工</th>
                  <th className="text-right px-3 py-2 font-medium">数量</th>
                  <th className="text-right px-3 py-2 font-medium">已入库</th>
                  <th className="text-right px-3 py-2 font-medium">待入库</th>
                  <th className="text-center px-3 py-2 font-medium">状态</th>
                  <th className="text-center px-3 py-2 font-medium">领料状态</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const pending = Math.max(0, order.qty - order.stockinqty);
                  const statusCfg = taskStatusConfig[order.taskstatus_title] || {
                    label: order.taskstatus_title || '-',
                    className: 'bg-gray-100 text-gray-600',
                  };
                  const pickLabel = pickStatusConfig[order.pickstatus_title] || order.pickstatus_title || '-';

                  const droptime = order.sourcebillnumber ? (mrpDroptimeMap[order.sourcebillnumber] || '') : '';

                  return (
                    <tr key={order.billno} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-3 py-2 font-mono text-slate-700">{order.billno}</td>
                      <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">
                        {order.sourcebillnumber || <span className="text-slate-300">-</span>}
                      </td>
                      <td className="px-3 py-2 text-slate-700 max-w-[200px]" title={`${order.material_number} ${order.material_name}`}>
                        <div className="truncate">
                          <span className="font-mono text-slate-500">{order.material_number}</span>
                          <span className="ml-1">{order.material_name}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center text-slate-600 whitespace-nowrap">
                        {droptime ? droptime.slice(0, 10) : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="px-3 py-2 text-center text-slate-600 whitespace-nowrap">
                        {order.planstartdate ? order.planstartdate.slice(0, 10) : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="px-3 py-2 text-center text-slate-600 whitespace-nowrap">
                        {order.planfinishdate ? order.planfinishdate.slice(0, 10) : <span className="text-slate-300">-</span>}
                      </td>
                      <td className="px-3 py-2 text-right text-slate-700">{order.qty.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-slate-700">{order.stockinqty.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right text-slate-700">
                        {pending > 0 ? (
                          <span className="text-orange-600">{pending.toLocaleString()}</span>
                        ) : (
                          <span className="text-green-600">0</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-xs ${statusCfg.className}`}>
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center text-slate-600">{pickLabel}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer note */}
          <div className="px-4 py-2 text-xs text-slate-400 bg-slate-50 border-t border-slate-100">
            物料齐套后，业务方在 ERP 中安排生产工单，系统自动关联展示。
          </div>
        </>
      )}
    </div>
  );
};

export default WorkOrderTracker;
