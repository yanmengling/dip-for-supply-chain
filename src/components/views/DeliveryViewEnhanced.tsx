import { useState, useMemo, useEffect } from 'react';
import {
  Truck, Clock, CheckCircle, AlertCircle, AlertTriangle, MessageSquare,
  Search, X, Package, TrendingUp, Calendar, BarChart3
} from 'lucide-react';
import type { DeliveryOrder } from '../../types/ontology';
import { loadDeliveryOrders, calculateDeliveryStats, filterDeliveryOrders } from '../../services/deliveryDataService';
import type { LucideIcon } from 'lucide-react';

// Enriched order type with computed properties
interface EnrichedDeliveryOrder extends DeliveryOrder {
  daysUntilDue: number;
  isOverdue: boolean;
  isUrgent: boolean;
  statusIcon: LucideIcon;
}
import OrderDetailModal from './OrderDetailModal';



interface Props {
  toggleCopilot?: () => void;
}

const DeliveryViewEnhanced = (_props: Props) => {
  // 数据状态
  const [allOrders, setAllOrders] = useState<DeliveryOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 筛选和搜索状态
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [urgentOnly, setUrgentOnly] = useState(false);
  const [showOverdueOnly, setShowOverdueOnly] = useState(false);

  // 分页状态
  const [urgentOrdersPage, setUrgentOrdersPage] = useState(1);
  const urgentOrdersPerPage = 10;
  const [allOrdersPage, setAllOrdersPage] = useState(1);
  const allOrdersPerPage = 10;

  // 详情弹窗状态
  const [selectedOrder, setSelectedOrder] = useState<DeliveryOrder | null>(null);

  // 图表显示状态


  // 加载数据 - 根据模式切换数据源
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // 根据模式加载对应数据
        const orders = await loadDeliveryOrders();
        setAllOrders(orders);
        setError(null);
        // 模式切换时重置分页
        setAllOrdersPage(1);
        setUrgentOrdersPage(1);
      } catch (err) {
        console.error('Failed to load orders:', err);
        setError('加载订单数据失败，请稍后重试');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    fetchData();
  }, []);

  // 1. 先处理所有订单数据 (Enrichment)
  const enrichedOrders = useMemo(() => {
    return allOrders.map(order => {
      const dueDate = new Date(order.plannedDeliveryDate);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

      // 逾期订单：当前日期 > 交付日期且订单状态不是"已完成"或"已取消"
      let isOverdue = false;
      if (order.orderStatus !== '已完成' && order.orderStatus !== '已取消') {
        if (order.plannedDeliveryDate) {
          isOverdue = daysUntilDue < 0;
        }
      }

      // 紧急订单：5天内到期，或者标记为紧急的订单
      const isUrgent = (
        (daysUntilDue >= 0 && daysUntilDue <= 5 && !isOverdue) ||
        order.isUrgent === true
      ) &&
        order.orderStatus !== '已完成' &&
        order.orderStatus !== '已取消';

      return {
        ...order,
        daysUntilDue,
        isOverdue,
        isUrgent,
        statusIcon: order.orderStatus === '运输中' ? Truck :
          order.orderStatus === '生产中' ? Clock :
            order.orderStatus === '已完成' ? CheckCircle : AlertCircle,
      } as EnrichedDeliveryOrder;
    });
  }, [allOrders]);

  useEffect(() => {
    try {
      if (typeof window === 'undefined') return;
      const firstDelayed = enrichedOrders
        .filter(o => o.isOverdue)
        .sort((a, b) => a.daysUntilDue - b.daysUntilDue)[0];

      if (firstDelayed?.orderNumber) {
        window.sessionStorage.setItem('copilot.delivery.firstDelayedOrderNumber', firstDelayed.orderNumber);
      } else {
        window.sessionStorage.removeItem('copilot.delivery.firstDelayedOrderNumber');
      }
    } catch (e) {
      console.warn('[Copilot] Failed to persist first delayed order:', e);
    }
  }, [enrichedOrders]);

  // 2. 应用筛选 (Filtering)
  const filteredOrders = useMemo(() => {
    // 使用本地筛选逻辑替代 service 中的 filterDeliveryOrders，因为我们需要基于 enriched 字段筛选
    return enrichedOrders.filter(order => {
      // Status Filter
      if (statusFilter && order.orderStatus !== statusFilter) return false;

      // Overdue Filter
      if (showOverdueOnly && !order.isOverdue) return false;

      // Urgent Filter
      if (urgentOnly && !order.isUrgent) return false;

      // Date Range
      if (dateFrom || dateTo) {
        if (!order.plannedDeliveryDate) return false;
        const orderDate = new Date(order.plannedDeliveryDate);
        if (dateFrom && orderDate < new Date(dateFrom)) return false;
        if (dateTo) {
          const toDate = new Date(dateTo);
          toDate.setHours(23, 59, 59, 999);
          if (orderDate > toDate) return false;
        }
      }

      // Search Text
      if (searchText) {
        const searchLower = searchText.toLowerCase();
        const orderNo = order.orderNumber || '';
        const prodName = order.productName || '';
        const custName = order.customerName || '';
        return (
          orderNo.toLowerCase().includes(searchLower) ||
          prodName.toLowerCase().includes(searchLower) ||
          custName.toLowerCase().includes(searchLower)
        );
      }

      return true;
    });
  }, [enrichedOrders, statusFilter, showOverdueOnly, urgentOnly, dateFrom, dateTo, searchText]);

  // 为了保持兼容性，将 processedOrders 命名为 orders
  const orders = filteredOrders;

  // 统计信息基于全部 enriched 数据，不受当前筛选影响
  const stats = useMemo(() => calculateDeliveryStats(enrichedOrders), [enrichedOrders]);

  const statusGroups = useMemo(() => {
    return {
      inTransit: enrichedOrders.filter(o => o.orderStatus === '运输中'),
      inProduction: enrichedOrders.filter(o => o.orderStatus === '生产中'),
      completed: enrichedOrders.filter(o => o.orderStatus === '已完成'),
      overdue: enrichedOrders.filter(o => o.isOverdue),
      urgent: enrichedOrders.filter(o => o.isUrgent && !o.isOverdue),
    };
  }, [enrichedOrders]);

  // 紧急订单列表（逾期优先，然后按剩余天数升序）
  const urgentOrdersList = useMemo(() => {
    let allUrgent: EnrichedDeliveryOrder[];

    if (showOverdueOnly) {
      // 只显示逾期订单
      allUrgent = [...statusGroups.overdue];
    } else {
      // 显示所有紧急订单（包括逾期和非逾期的紧急订单）
      allUrgent = [...statusGroups.overdue, ...statusGroups.urgent];
    }

    return allUrgent.sort((a, b) => {
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      return a.daysUntilDue - b.daysUntilDue;
    });
  }, [statusGroups.overdue, statusGroups.urgent, showOverdueOnly]);

  // 紧急订单分页
  const urgentOrdersTotalPages = Math.ceil(urgentOrdersList.length / urgentOrdersPerPage);
  const paginatedUrgentOrders = useMemo(() => {
    const startIndex = (urgentOrdersPage - 1) * urgentOrdersPerPage;
    const endIndex = startIndex + urgentOrdersPerPage;
    return urgentOrdersList.slice(startIndex, endIndex);
  }, [urgentOrdersList, urgentOrdersPage]);

  // 所有订单分页
  const allOrdersTotalPages = Math.ceil(orders.length / allOrdersPerPage);
  const paginatedAllOrders = useMemo(() => {
    const startIndex = (allOrdersPage - 1) * allOrdersPerPage;
    const endIndex = startIndex + allOrdersPerPage;
    return orders.slice(startIndex, endIndex);
  }, [orders, allOrdersPage]);

  // 清除筛选
  const clearFilters = () => {
    setSearchText('');
    setStatusFilter('');
    setDateFrom('');
    setDateTo('');
    setUrgentOnly(false);
    setShowOverdueOnly(false);
  };

  const hasActiveFilters = searchText || statusFilter || dateFrom || dateTo || urgentOnly || showOverdueOnly;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-slate-600">加载订单数据中...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <AlertCircle className="text-red-500 mx-auto mb-4" size={48} />
          <p className="text-red-600 font-medium">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">订单交付</h1>
          <p className="text-sm text-slate-600 mt-1">共 {allOrders.length} 条订单记录</p>
        </div>

        {/* 搜索和筛选 */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
            <input
              type="text"
              placeholder="搜索订单号、客户、产品..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-64"
            />
          </div>

        </div>
      </div>



      {/* Status Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* In Transit Card */}
        <div
          className={`bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-200 cursor-pointer p-6 border-2 ${statusFilter === '运输中'
            ? 'border-blue-500 ring-4 ring-blue-100 scale-[1.02]'
            : 'border-slate-100 hover:border-blue-200'
            }`}
          onClick={() => {
            if (statusFilter === '运输中') {
              setStatusFilter('');
            } else {
              clearFilters();
              setStatusFilter('运输中');
            }
          }}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-500 mb-2">运输中</p>
              <p className="text-2xl font-bold text-slate-800 tracking-tight">{stats.inTransit}</p>
            </div>
            <div className="bg-blue-50 p-3 rounded-lg">
              <Truck className="text-blue-600" size={28} />
            </div>
          </div>
        </div>

        {/* In Production Card */}
        <div
          className={`bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-200 cursor-pointer p-6 border-2 ${statusFilter === '生产中'
            ? 'border-yellow-500 ring-4 ring-yellow-100 scale-[1.02]'
            : 'border-slate-100 hover:border-yellow-200'
            }`}
          onClick={() => {
            if (statusFilter === '生产中') {
              setStatusFilter('');
            } else {
              clearFilters();
              setStatusFilter('生产中');
            }
          }}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-500 mb-2">生产中</p>
              <p className="text-2xl font-bold text-slate-800 tracking-tight">{stats.inProduction}</p>
            </div>
            <div className="bg-yellow-50 p-3 rounded-lg">
              <Clock className="text-yellow-600" size={28} />
            </div>
          </div>
        </div>

        {/* Completed Card */}
        <div
          className={`bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-200 cursor-pointer p-6 border-2 ${statusFilter === '已完成'
            ? 'border-green-500 ring-4 ring-green-100 scale-[1.02]'
            : 'border-slate-100 hover:border-green-200'
            }`}
          onClick={() => {
            if (statusFilter === '已完成') {
              setStatusFilter('');
            } else {
              clearFilters();
              setStatusFilter('已完成');
            }
          }}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-500 mb-2">已完成</p>
              <p className="text-2xl font-bold text-slate-800 tracking-tight">{stats.completed}</p>
            </div>
            <div className="bg-green-50 p-3 rounded-lg">
              <CheckCircle className="text-green-600" size={28} />
            </div>
          </div>
        </div>

        {/* Overdue Card */}
        <div
          className={`bg-white rounded-xl shadow-md hover:shadow-xl transition-all duration-200 cursor-pointer p-6 border-2 ${showOverdueOnly
            ? 'border-red-500 ring-4 ring-red-100 scale-[1.02]'
            : 'border-red-100 hover:border-red-300'
            }`}
          onClick={() => {
            if (showOverdueOnly) {
              setShowOverdueOnly(false);
            } else {
              clearFilters();
              setShowOverdueOnly(true);
            }
          }}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <p className="text-sm font-medium text-slate-500 mb-2">逾期订单</p>
              <p className="text-2xl font-bold text-red-600 tracking-tight">{stats.overdue}</p>
            </div>
            <div className="bg-red-50 p-3 rounded-lg">
              <AlertTriangle className="text-red-600" size={28} />
            </div>
          </div>
        </div>
      </div>



      {/* Urgent Orders and All Orders - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Urgent Orders Panel */}
        {urgentOrdersList.length > 0 && (
          <div className="bg-white rounded-lg shadow" data-urgent-panel>
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <AlertCircle className="text-red-500" size={20} />
                {showOverdueOnly ? '逾期订单' : '需关注订单'}
                {urgentOrdersList.length > urgentOrdersPerPage && (
                  <span className="text-sm text-slate-500 font-normal ml-auto">
                    ({urgentOrdersList.length} 条)
                  </span>
                )}
              </h2>
            </div>
            <div className="p-6">
              <div className="space-y-3">
                {paginatedUrgentOrders.map((order, index) => {
                  const StatusIcon = order.statusIcon;
                  return (
                    <div
                      key={index}
                      className="flex items-center justify-between p-4 border border-red-200 bg-red-50 rounded-lg hover:bg-red-100 transition-colors cursor-pointer"
                      onClick={() => setSelectedOrder(order)}
                    >
                      <div className="flex items-center gap-4 flex-1">
                        <StatusIcon className={order.isOverdue ? 'text-red-500' : 'text-yellow-500'} size={24} />
                        <div className="flex-1">
                          <p className="font-medium text-slate-800">{order.orderName}</p>
                          <p className="text-sm text-slate-600 mt-1">
                            客户: {order.customerName} | 产品: {order.productName} | 数量: {order.quantity} {order.unit}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            交付日期: {order.plannedDeliveryDate}
                          </p>
                          <p className="text-xs text-red-600 mt-1">
                            {order.isOverdue ? `已逾期 ${Math.abs(order.daysUntilDue)} 天` : `剩余 ${order.daysUntilDue} 天`}
                          </p>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${order.isOverdue ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                        {order.isOverdue ? '已逾期' : '加急'}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Pagination for Urgent Orders */}
              {urgentOrdersTotalPages > 1 && (
                <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
                  <div className="text-sm text-slate-600">
                    显示 {((urgentOrdersPage - 1) * urgentOrdersPerPage) + 1} - {Math.min(urgentOrdersPage * urgentOrdersPerPage, urgentOrdersList.length)} / 共 {urgentOrdersList.length} 条
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setUrgentOrdersPage(prev => Math.max(1, prev - 1))}
                      disabled={urgentOrdersPage === 1}
                      className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      上一页
                    </button>
                    <span className="text-sm text-slate-600">
                      第 {urgentOrdersPage} / {urgentOrdersTotalPages} 页
                    </span>
                    <button
                      onClick={() => setUrgentOrdersPage(prev => Math.min(urgentOrdersTotalPages, prev + 1))}
                      disabled={urgentOrdersPage === urgentOrdersTotalPages}
                      className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* All Orders Panel */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-800">
              所有订单
              {orders.length > allOrdersPerPage && (
                <span className="text-sm text-slate-500 font-normal ml-2">
                  ({orders.length} 条)
                </span>
              )}
            </h2>
          </div>
          <div className="p-6">
            <div className="space-y-3">
              {paginatedAllOrders.map((order, index) => {
                const StatusIcon = order.statusIcon;
                return (
                  <div
                    key={index}
                    className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                    onClick={() => setSelectedOrder(order)}
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <StatusIcon className={
                        order.orderStatus === '运输中' ? 'text-blue-500' :
                          order.orderStatus === '生产中' ? 'text-yellow-500' :
                            order.orderStatus === '已完成' ? 'text-green-500' : 'text-slate-500'
                      } size={24} />
                      <div className="flex-1">
                        <p className="font-medium text-slate-800">{order.orderName}</p>
                        <p className="text-sm text-slate-600 mt-1">
                          客户: {order.customerName} | 产品: {order.productName}
                        </p>
                        <p className="text-xs text-slate-500 mt-1">
                          订单日期: {order.orderDate} | 交付日期: {order.plannedDeliveryDate}
                        </p>
                        {order.daysUntilDue >= 0 && order.orderStatus !== '已完成' && order.orderStatus !== '已取消' && (
                          <p className="text-xs text-slate-500 mt-1">剩余 {order.daysUntilDue} 天</p>
                        )}
                        {order.isOverdue && (
                          <p className="text-xs text-red-600 mt-1">已逾期 {Math.abs(order.daysUntilDue)} 天</p>
                        )}
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${order.orderStatus === '运输中' ? 'bg-blue-100 text-blue-700' :
                      order.orderStatus === '生产中' ? 'bg-yellow-100 text-yellow-700' :
                        order.orderStatus === '已完成' ? 'bg-green-100 text-green-700' :
                          order.orderStatus === '已取消' ? 'bg-red-100 text-red-700' :
                            'bg-slate-100 text-slate-700'
                      }`}>
                      {order.orderStatus}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Pagination for All Orders */}
            {allOrdersTotalPages > 1 && (
              <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-4">
                <div className="text-sm text-slate-600">
                  显示 {((allOrdersPage - 1) * allOrdersPerPage) + 1} - {Math.min(allOrdersPage * allOrdersPerPage, orders.length)} / 共 {orders.length} 条
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setAllOrdersPage(prev => Math.max(1, prev - 1))}
                    disabled={allOrdersPage === 1}
                    className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    上一页
                  </button>
                  <span className="text-sm text-slate-600">
                    第 {allOrdersPage} / {allOrdersTotalPages} 页
                  </span>
                  <button
                    onClick={() => setAllOrdersPage(prev => Math.min(allOrdersTotalPages, prev + 1))}
                    disabled={allOrdersPage === allOrdersTotalPages}
                    className="px-3 py-1 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    下一页
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Order Detail Modal */}
      <OrderDetailModal
        order={selectedOrder}
        onClose={() => setSelectedOrder(null)}
      />

      {/* Floating Chat Bubble Button */}
      {_props.toggleCopilot && (
        <button
          onClick={_props.toggleCopilot}
          className="fixed bottom-8 right-8 w-14 h-14 bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center z-40"
          aria-label="打开AI助手"
        >
          <MessageSquare size={24} />
        </button>
      )}
    </div>
  );
};

export default DeliveryViewEnhanced;
