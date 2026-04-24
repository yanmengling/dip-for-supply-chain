import { X, Package, User, Calendar, DollarSign, Truck, Factory, FileText } from 'lucide-react';
import type { DeliveryOrder } from '../../types/ontology';

interface Props {
  order: DeliveryOrder | null;
  onClose: () => void;
}

const OrderDetailModal = ({ order, onClose }: Props) => {
  if (!order) return null;

  const formatCurrency = (amount?: number) => {
    if (!amount) return '-';
    return `¥${amount.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (date?: string) => {
    if (!date) return '-';
    return date;
  };

  return (
    <div className="fixed inset-0 bg-slate-500 bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200 bg-gradient-to-r from-indigo-50 to-purple-50">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">{order.orderName}</h2>
            <p className="text-sm text-slate-600 mt-1">订单编号: {order.orderNumber}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white rounded-lg transition-colors"
            aria-label="关闭"
          >
            <X size={24} className="text-slate-600" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* 状态信息 */}
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={20} className="text-indigo-600" />
                <h3 className="font-semibold text-slate-800">订单状态</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-slate-600 mb-1">订单状态</p>
                  <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                    order.orderStatus === '已完成' ? 'bg-green-100 text-green-700' :
                    order.orderStatus === '运输中' ? 'bg-blue-100 text-blue-700' :
                    order.orderStatus === '生产中' ? 'bg-yellow-100 text-yellow-700' :
                    order.orderStatus === '已取消' ? 'bg-red-100 text-red-700' :
                    'bg-slate-100 text-slate-700'
                  }`}>
                    {order.orderStatus}
                  </span>
                </div>
                <div>
                  <p className="text-xs text-slate-600 mb-1">单据状态</p>
                  <p className="text-sm font-medium text-slate-800">{order.documentStatus}</p>
                </div>
                {order.deliveryStatus && (
                  <div>
                    <p className="text-xs text-slate-600 mb-1">交付状态</p>
                    <p className="text-sm font-medium text-slate-800">{order.deliveryStatus}</p>
                  </div>
                )}
                {order.isUrgent && (
                  <div>
                    <p className="text-xs text-slate-600 mb-1">紧急程度</p>
                    <span className="inline-block px-3 py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                      加急订单
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* 客户信息 */}
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <User size={20} className="text-indigo-600" />
                <h3 className="font-semibold text-slate-800">客户信息</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-600 mb-1">客户名称</p>
                  <p className="text-sm font-medium text-slate-800">{order.customerName}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600 mb-1">客户ID</p>
                  <p className="text-sm font-medium text-slate-800">{order.customerId}</p>
                </div>
                {order.endCustomer && (
                  <div>
                    <p className="text-xs text-slate-600 mb-1">最终客户</p>
                    <p className="text-sm font-medium text-slate-800">{order.endCustomer}</p>
                  </div>
                )}
                {order.consignee && (
                  <div>
                    <p className="text-xs text-slate-600 mb-1">收货人</p>
                    <p className="text-sm font-medium text-slate-800">{order.consignee}</p>
                  </div>
                )}
                {order.consigneePhone && (
                  <div>
                    <p className="text-xs text-slate-600 mb-1">联系电话</p>
                    <p className="text-sm font-medium text-slate-800">{order.consigneePhone}</p>
                  </div>
                )}
                {order.deliveryAddress && (
                  <div className="md:col-span-2">
                    <p className="text-xs text-slate-600 mb-1">收货地址</p>
                    <p className="text-sm font-medium text-slate-800">{order.deliveryAddress}</p>
                  </div>
                )}
              </div>
            </div>

            {/* 产品信息 */}
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Package size={20} className="text-indigo-600" />
                <h3 className="font-semibold text-slate-800">产品信息</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-600 mb-1">产品名称</p>
                  <p className="text-sm font-medium text-slate-800">{order.productName}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600 mb-1">产品编码</p>
                  <p className="text-sm font-medium text-slate-800">{order.productCode}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600 mb-1">数量</p>
                  <p className="text-sm font-medium text-slate-800">{order.quantity} {order.unit}</p>
                </div>
                {order.lineNumber && (
                  <div>
                    <p className="text-xs text-slate-600 mb-1">行号</p>
                    <p className="text-sm font-medium text-slate-800">{order.lineNumber}</p>
                  </div>
                )}
              </div>
            </div>

            {/* 金额信息 */}
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <DollarSign size={20} className="text-indigo-600" />
                <h3 className="font-semibold text-slate-800">金额信息</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {order.standardPrice && (
                  <div>
                    <p className="text-xs text-slate-600 mb-1">标准价格</p>
                    <p className="text-sm font-medium text-slate-800">{formatCurrency(order.standardPrice)}</p>
                  </div>
                )}
                {order.discountRate !== undefined && (
                  <div>
                    <p className="text-xs text-slate-600 mb-1">折扣率</p>
                    <p className="text-sm font-medium text-slate-800">{order.discountRate}%</p>
                  </div>
                )}
                {order.actualPrice && (
                  <div>
                    <p className="text-xs text-slate-600 mb-1">实际价格</p>
                    <p className="text-sm font-medium text-slate-800">{formatCurrency(order.actualPrice)}</p>
                  </div>
                )}
                {order.subtotalAmount && (
                  <div>
                    <p className="text-xs text-slate-600 mb-1">小计金额</p>
                    <p className="text-sm font-medium text-slate-800">{formatCurrency(order.subtotalAmount)}</p>
                  </div>
                )}
                {order.taxAmount && (
                  <div>
                    <p className="text-xs text-slate-600 mb-1">税额</p>
                    <p className="text-sm font-medium text-slate-800">{formatCurrency(order.taxAmount)}</p>
                  </div>
                )}
                {order.totalAmount && (
                  <div>
                    <p className="text-xs text-slate-600 mb-1">总金额</p>
                    <p className="text-sm font-bold text-indigo-600">{formatCurrency(order.totalAmount)}</p>
                  </div>
                )}
              </div>
            </div>

            {/* 日期信息 */}
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <Calendar size={20} className="text-indigo-600" />
                <h3 className="font-semibold text-slate-800">日期信息</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-slate-600 mb-1">单据日期</p>
                  <p className="text-sm font-medium text-slate-800">{formatDate(order.documentDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600 mb-1">创建日期</p>
                  <p className="text-sm font-medium text-slate-800">{formatDate(order.createdDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-600 mb-1">计划交付日期</p>
                  <p className="text-sm font-medium text-slate-800">{formatDate(order.plannedDeliveryDate)}</p>
                </div>
                {order.shipmentDate && (
                  <div>
                    <p className="text-xs text-slate-600 mb-1">发货日期</p>
                    <p className="text-sm font-medium text-slate-800">{formatDate(order.shipmentDate)}</p>
                  </div>
                )}
                {order.estimatedDeliveryDate && (
                  <div>
                    <p className="text-xs text-slate-600 mb-1">预计送达日期</p>
                    <p className="text-sm font-medium text-slate-800">{formatDate(order.estimatedDeliveryDate)}</p>
                  </div>
                )}
                {order.actualDeliveryDate && (
                  <div>
                    <p className="text-xs text-slate-600 mb-1">实际送达日期</p>
                    <p className="text-sm font-medium text-slate-800">{formatDate(order.actualDeliveryDate)}</p>
                  </div>
                )}
              </div>
            </div>

            {/* 物流信息 */}
            {order.shipmentNumber && (
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Truck size={20} className="text-indigo-600" />
                  <h3 className="font-semibold text-slate-800">物流信息</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-slate-600 mb-1">发货单号</p>
                    <p className="text-sm font-medium text-slate-800">{order.shipmentNumber}</p>
                  </div>
                  {order.logisticsProvider && (
                    <div>
                      <p className="text-xs text-slate-600 mb-1">物流商</p>
                      <p className="text-sm font-medium text-slate-800">{order.logisticsProvider}</p>
                    </div>
                  )}
                  {order.trackingNumber && (
                    <div>
                      <p className="text-xs text-slate-600 mb-1">物流单号</p>
                      <p className="text-sm font-medium text-slate-800">{order.trackingNumber}</p>
                    </div>
                  )}
                  {order.warehouseName && (
                    <div>
                      <p className="text-xs text-slate-600 mb-1">发货仓库</p>
                      <p className="text-sm font-medium text-slate-800">{order.warehouseName}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 生产信息 */}
            {order.productionOrderNumber && (
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Factory size={20} className="text-indigo-600" />
                  <h3 className="font-semibold text-slate-800">生产信息</h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div>
                    <p className="text-xs text-slate-600 mb-1">生产订单号</p>
                    <p className="text-sm font-medium text-slate-800">{order.productionOrderNumber}</p>
                  </div>
                  {order.factoryName && (
                    <div>
                      <p className="text-xs text-slate-600 mb-1">生产工厂</p>
                      <p className="text-sm font-medium text-slate-800">{order.factoryName}</p>
                    </div>
                  )}
                  {order.productionLine && (
                    <div>
                      <p className="text-xs text-slate-600 mb-1">生产线</p>
                      <p className="text-sm font-medium text-slate-800">{order.productionLine}</p>
                    </div>
                  )}
                  {order.workOrderStatus && (
                    <div>
                      <p className="text-xs text-slate-600 mb-1">工单状态</p>
                      <p className="text-sm font-medium text-slate-800">{order.workOrderStatus}</p>
                    </div>
                  )}
                  {order.priority && (
                    <div>
                      <p className="text-xs text-slate-600 mb-1">优先级</p>
                      <p className="text-sm font-medium text-slate-800">{order.priority}</p>
                    </div>
                  )}
                  {order.plannedStartDate && (
                    <div>
                      <p className="text-xs text-slate-600 mb-1">计划开始日期</p>
                      <p className="text-sm font-medium text-slate-800">{formatDate(order.plannedStartDate)}</p>
                    </div>
                  )}
                  {order.plannedFinishDate && (
                    <div>
                      <p className="text-xs text-slate-600 mb-1">计划完成日期</p>
                      <p className="text-sm font-medium text-slate-800">{formatDate(order.plannedFinishDate)}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 业务信息 */}
            <div className="bg-slate-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={20} className="text-indigo-600" />
                <h3 className="font-semibold text-slate-800">业务信息</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {order.transactionType && (
                  <div>
                    <p className="text-xs text-slate-600 mb-1">交易类型</p>
                    <p className="text-sm font-medium text-slate-800">{order.transactionType}</p>
                  </div>
                )}
                {order.salesDepartment && (
                  <div>
                    <p className="text-xs text-slate-600 mb-1">销售部门</p>
                    <p className="text-sm font-medium text-slate-800">{order.salesDepartment}</p>
                  </div>
                )}
                {order.salesperson && (
                  <div>
                    <p className="text-xs text-slate-600 mb-1">销售人员</p>
                    <p className="text-sm font-medium text-slate-800">{order.salesperson}</p>
                  </div>
                )}
                {order.contractNumber && (
                  <div>
                    <p className="text-xs text-slate-600 mb-1">合同编号</p>
                    <p className="text-sm font-medium text-slate-800">{order.contractNumber}</p>
                  </div>
                )}
                {order.projectName && (
                  <div className="md:col-span-2">
                    <p className="text-xs text-slate-600 mb-1">项目名称</p>
                    <p className="text-sm font-medium text-slate-800">{order.projectName}</p>
                  </div>
                )}
              </div>
            </div>

            {/* 备注 */}
            {order.notes && (
              <div className="bg-slate-50 rounded-lg p-4">
                <h3 className="font-semibold text-slate-800 mb-2">备注</h3>
                <p className="text-sm text-slate-600">{order.notes}</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200 bg-slate-50">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors font-medium"
          >
            关闭
          </button>
        </div>
      </div>
    </div>
  );
};

export default OrderDetailModal;

