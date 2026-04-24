import { useState, useMemo } from 'react';
import { Truck, Clock, CheckCircle, AlertCircle, AlertTriangle, MessageSquare } from 'lucide-react';
import { ordersData, productsData } from '../../utils/entityConfigService';

interface Props {
  toggleCopilot?: () => void;
}

const DeliveryView = (_props: Props) => {
  const [urgentOrdersPage, setUrgentOrdersPage] = useState(1);
  const urgentOrdersPerPage = 10;
  const [allOrdersPage, setAllOrdersPage] = useState(1);
  const allOrdersPerPage = 10;

  // Process orders for delivery view
  const orders = useMemo(() => {
    return ordersData.map(order => {
      const product = productsData.find(p => p.productId === order.productId);
      const dueDate = new Date(order.dueDate);
      const today = new Date();
      const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      // 逾期订单：基于 dueDate，当前日期 > 交付日期且订单状态不是"已完成"
      const isOverdue = daysUntilDue < 0 && order.status !== '已完成';
      const isUrgent = daysUntilDue >= 0 && daysUntilDue <= 5 && !isOverdue;

      return {
        ...order,
        productName: product?.productName || order.productId,
        daysUntilDue,
        isOverdue,
        isUrgent,
        statusIcon: order.status === '运输中' ? Truck :
          order.status === '生产中' ? Clock :
            order.status === '已完成' ? CheckCircle : AlertCircle,
      };
    });
  }, []);

  const statusGroups = useMemo(() => {
    return {
      inTransit: orders.filter(o => o.status === '运输中'),
      inProduction: orders.filter(o => o.status === '生产中'),
      completed: orders.filter(o => o.status === '已完成'),
      overdue: orders.filter(o => o.isOverdue),
      urgent: orders.filter(o => o.isUrgent && !o.isOverdue),
    };
  }, [orders]);

  // 紧急订单列表（逾期优先，然后按剩余天数升序）
  const urgentOrdersList = useMemo(() => {
    const allUrgent = [...statusGroups.overdue, ...statusGroups.urgent];
    return allUrgent.sort((a, b) => {
      // 逾期订单优先
      if (a.isOverdue && !b.isOverdue) return -1;
      if (!a.isOverdue && b.isOverdue) return 1;
      // 然后按剩余天数升序（负数越小越紧急）
      return a.daysUntilDue - b.daysUntilDue;
    });
  }, [statusGroups.overdue, statusGroups.urgent]);

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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">订单交付</h1>
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">运输中</p>
              <p className="text-2xl font-bold text-slate-800">{statusGroups.inTransit.length}</p>
            </div>
            <Truck className="text-blue-500" size={32} />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">生产中</p>
              <p className="text-2xl font-bold text-slate-800">{statusGroups.inProduction.length}</p>
            </div>
            <Clock className="text-yellow-500" size={32} />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">已完成</p>
              <p className="text-2xl font-bold text-slate-800">{statusGroups.completed.length}</p>
            </div>
            <CheckCircle className="text-green-500" size={32} />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 mb-1">逾期订单</p>
              <p className="text-2xl font-bold text-red-600">{statusGroups.overdue.length}</p>
            </div>
            <AlertTriangle className="text-red-500" size={32} />
          </div>
        </div>
      </div>

      {/* Urgent Orders and All Orders - Side by Side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Urgent Orders Panel */}
        {urgentOrdersList.length > 0 && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b border-slate-200">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
                <AlertCircle className="text-red-500" size={20} />
                紧急订单
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
                    <div key={index} className="flex items-center justify-between p-4 border border-red-200 bg-red-50 rounded-lg">
                      <div className="flex items-center gap-4 flex-1">
                        <StatusIcon className={order.isOverdue ? 'text-red-500' : 'text-yellow-500'} size={24} />
                        <div className="flex-1">
                          <p className="font-medium text-slate-800">{order.orderName} - {order.client}</p>
                          <p className="text-sm text-slate-600 mt-1">
                            产品: {order.productName} | 数量: {order.quantity} | 交付日期: {order.dueDate}
                          </p>
                          <p className="text-xs text-red-600 mt-1">
                            {order.isOverdue ? `已逾期 ${Math.abs(order.daysUntilDue)} 天` : `剩余 ${order.daysUntilDue} 天`}
                          </p>
                        </div>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${order.isOverdue ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                        {order.isOverdue ? '已逾期' : '紧急'}
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
                  <div key={index} className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
                    <div className="flex items-center gap-4 flex-1">
                      <StatusIcon className={
                        order.status === '运输中' ? 'text-blue-500' :
                          order.status === '生产中' ? 'text-yellow-500' :
                            order.status === '已完成' ? 'text-green-500' : 'text-slate-500'
                      } size={24} />
                      <div className="flex-1">
                        <p className="font-medium text-slate-800">{order.orderName} - {order.client}</p>
                        <p className="text-sm text-slate-600 mt-1">
                          产品: {order.productName} | 数量: {order.quantity} | 订单日期: {order.orderDate} | 交付日期: {order.dueDate}
                        </p>
                        {order.daysUntilDue >= 0 && (
                          <p className="text-xs text-slate-500 mt-1">剩余 {order.daysUntilDue} 天</p>
                        )}
                        {order.isOverdue && (
                          <p className="text-xs text-red-600 mt-1">已逾期 {Math.abs(order.daysUntilDue)} 天</p>
                        )}
                      </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${order.status === '运输中' ? 'bg-blue-100 text-blue-700' :
                        order.status === '生产中' ? 'bg-yellow-100 text-yellow-700' :
                          order.status === '已完成' ? 'bg-green-100 text-green-700' :
                            'bg-slate-100 text-slate-700'
                      }`}>
                      {order.status}
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

export default DeliveryView;
