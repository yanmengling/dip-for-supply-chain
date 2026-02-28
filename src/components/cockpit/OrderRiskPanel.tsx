/**
 * Order Risk Panel
 * 
 * Displays order status summary including:
 * - 生产中 (In Production)
 * - 运输中 (In Transit)  
 * - 已完成 (Completed)
 * - 交付绩效 (Delivery Performance Rate)
 * - 逾期订单前5 (Top 5 Overdue Orders)
 */

import { useMemo, useState, useEffect } from 'react';
import {
  AlertTriangle, ArrowRight, Truck, Package, CheckCircle,
  TrendingUp, Loader2, Clock
} from 'lucide-react';
import { loadDeliveryOrders, calculateDeliveryStats } from '../../services/deliveryDataService';
import type { DeliveryOrder } from '../../types/ontology';

// ── 模块级结果缓存（3 分钟 TTL，页面切换时不重复请求）─────────────────────
const _ORDER_CACHE_TTL = 3 * 60 * 1000;
let _orderCache: DeliveryOrder[] | null = null;
let _orderCacheTime = 0;


interface Props {
  onNavigate?: (view: string) => void;
}

const OrderRiskPanel = ({ onNavigate }: Props) => {
  const _initValid =
    !!(_orderCache && Date.now() - _orderCacheTime < _ORDER_CACHE_TTL);
  const [orders, setOrders] = useState<DeliveryOrder[]>(_initValid ? _orderCache! : []);
  const [loading, setLoading] = useState(!_initValid);

  // 加载订单数据
  useEffect(() => {
    async function fetchOrders() {
      // 命中模块级缓存则直接渲染，跳过所有 API 请求
      const now = Date.now();
      if (_orderCache && now - _orderCacheTime < _ORDER_CACHE_TTL) {
        setOrders(_orderCache);
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const data = await loadDeliveryOrders();
        _orderCache = data;
        _orderCacheTime = Date.now();
        setOrders(data);
      } catch (error) {
        console.error('Failed to load orders:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchOrders();
  }, []);

  // 计算统计数据
  const stats = useMemo(() => calculateDeliveryStats(orders), [orders]);

  // 计算交付绩效（延期交付数量/总完成交付订单数量）
  const deliveryPerformance = useMemo(() => {
    if (stats.completed === 0) return { rate: 100, delayed: 0 };

    // 统计延期交付的已完成订单
    const delayedCompleted = orders.filter(o => {
      if (o.orderStatus !== '已完成') return false;
      const plannedDate = new Date(o.plannedDeliveryDate);
      const actualDate = o.actualDeliveryDate ? new Date(o.actualDeliveryDate) : new Date();
      return actualDate > plannedDate;
    }).length;

    const rate = stats.completed > 0
      ? Math.round(((stats.completed - delayedCompleted) / stats.completed) * 100)
      : 100;

    return { rate, delayed: delayedCompleted };
  }, [orders, stats.completed]);

  // 获取逾期订单前5
  const top5OverdueOrders = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return orders
      .filter(o => {
        if (o.orderStatus === '已完成' || o.orderStatus === '已取消') return false;
        const dueDate = new Date(o.plannedDeliveryDate);
        return dueDate < today;
      })
      .map(o => {
        const dueDate = new Date(o.plannedDeliveryDate);
        const overdueDays = Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24));
        return { ...o, overdueDays };
      })
      .sort((a, b) => b.overdueDays - a.overdueDays)
      .slice(0, 5);
  }, [orders]);

  const handleViewDetails = () => {
    if (onNavigate) {
      onNavigate('delivery');
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-800">订单面板</h2>
        </div>
        <div className="p-6 flex items-center justify-center h-48">
          <Loader2 className="animate-spin text-indigo-600 mr-2" size={24} />
          <span className="text-slate-500">加载订单数据中...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-slate-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">订单面板</h2>
        <button
          onClick={handleViewDetails}
          className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
        >
          查看详情
          <ArrowRight size={14} />
        </button>
      </div>
      <div className="p-6 space-y-6">
        {/* Status Stats Grid */}
        <div className="grid grid-cols-4 gap-4">
          {/* 生产中 */}
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Package className="text-blue-600" size={18} />
              <span className="text-sm text-blue-600 font-medium">生产中</span>
            </div>
            <p className="text-2xl font-bold text-blue-700">{stats.inProduction}</p>
          </div>

          {/* 运输中 */}
          <div className="p-4 bg-amber-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Truck className="text-amber-600" size={18} />
              <span className="text-sm text-amber-600 font-medium">运输中</span>
            </div>
            <p className="text-2xl font-bold text-amber-700">{stats.inTransit}</p>
          </div>

          {/* 已完成 */}
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="text-green-600" size={18} />
              <span className="text-sm text-green-600 font-medium">已完成</span>
            </div>
            <p className="text-2xl font-bold text-green-700">{stats.completed}</p>
          </div>

          {/* 交付绩效 */}
          <div className={`p-4 rounded-lg ${deliveryPerformance.rate >= 90 ? 'bg-green-50' : deliveryPerformance.rate >= 70 ? 'bg-amber-50' : 'bg-red-50'}`}>
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className={`${deliveryPerformance.rate >= 90 ? 'text-green-600' : deliveryPerformance.rate >= 70 ? 'text-amber-600' : 'text-red-600'}`} size={18} />
              <span className={`text-sm font-medium ${deliveryPerformance.rate >= 90 ? 'text-green-600' : deliveryPerformance.rate >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                交付绩效
              </span>
            </div>
            <p className={`text-2xl font-bold ${deliveryPerformance.rate >= 90 ? 'text-green-700' : deliveryPerformance.rate >= 70 ? 'text-amber-700' : 'text-red-700'}`}>
              {deliveryPerformance.rate}%
            </p>
            <p className="text-xs text-slate-500 mt-1">
              延期 {deliveryPerformance.delayed} / 完成 {stats.completed}
            </p>
          </div>
        </div>

        {/* Top 5 Overdue Orders */}
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Clock className="text-red-500" size={16} />
            逾期订单前5
          </h3>
          <div className="space-y-2">
            {top5OverdueOrders.length === 0 ? (
              <div className="text-center py-6 bg-green-50 rounded-lg">
                <CheckCircle className="mx-auto text-green-500 mb-2" size={24} />
                <p className="text-green-600 font-medium">暂无逾期订单</p>
              </div>
            ) : (
              top5OverdueOrders.map((order, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between p-3 border border-red-200 rounded-lg bg-red-50 hover:bg-red-100"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-slate-800">{order.orderNumber}</span>
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 border border-red-300">
                        逾期 {order.overdueDays} 天
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 space-y-0.5">
                      <div>客户: {order.customerName}</div>
                      <div>产品: {order.productName}</div>
                      <div>计划交付: {order.plannedDeliveryDate}</div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default OrderRiskPanel;
