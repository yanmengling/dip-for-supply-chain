import { useMemo } from 'react';
import { TrendingUp, PieChart as PieChartIcon, BarChart3 } from 'lucide-react';
import type { DeliveryOrder } from '../../types/ontology';

interface Props {
  orders: DeliveryOrder[];
}

const DeliveryCharts = ({ orders }: Props) => {
  // 状态分布统计
  const statusDistribution = useMemo(() => {
    const distribution: Record<string, number> = {};
    orders.forEach(order => {
      const status = order.orderStatus;
      distribution[status] = (distribution[status] || 0) + 1;
    });

    const total = orders.length;
    return Object.entries(distribution).map(([status, count]) => ({
      status,
      count,
      percentage: ((count / total) * 100).toFixed(1),
      color:
        status === '已完成' ? 'bg-green-500' :
          status === '运输中' ? 'bg-blue-500' :
            status === '生产中' ? 'bg-yellow-500' :
              status === '已取消' ? 'bg-red-500' :
                'bg-slate-500'
    }));
  }, [orders]);

  // 每月交付趋势
  const monthlyTrend = useMemo(() => {
    const monthlyData: Record<string, { total: number; completed: number; cancelled: number }> = {};

    orders.forEach(order => {
      const month = order.orderDate.substring(0, 7); // YYYY-MM
      if (!monthlyData[month]) {
        monthlyData[month] = { total: 0, completed: 0, cancelled: 0 };
      }
      monthlyData[month].total++;
      if (order.orderStatus === '已完成') {
        monthlyData[month].completed++;
      } else if (order.orderStatus === '已取消') {
        monthlyData[month].cancelled++;
      }
    });

    // 转换为数组并排序
    const sortedData = Object.entries(monthlyData)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6); // 最近6个月

    // 找出最大值用于缩放
    const maxValue = Math.max(...sortedData.map(([, data]) => data.total));

    return sortedData.map(([month, data]) => ({
      month: month.substring(5), // MM
      year: month.substring(0, 4), // YYYY
      ...data,
      totalHeight: (data.total / maxValue) * 100,
      completedHeight: (data.completed / maxValue) * 100,
    }));
  }, [orders]);

  // 产品分布Top 5
  const productDistribution = useMemo(() => {
    const productCount: Record<string, number> = {};
    orders.forEach(order => {
      const product = order.productName;
      productCount[product] = (productCount[product] || 0) + 1;
    });

    const sorted = Object.entries(productCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    const maxCount = sorted[0]?.[1] || 1;

    return sorted.map(([product, count]) => ({
      product: product.length > 20 ? product.substring(0, 20) + '...' : product,
      fullProduct: product,
      count,
      width: (count / maxCount) * 100,
    }));
  }, [orders]);

  // 客户分布Top 5
  const customerDistribution = useMemo(() => {
    const customerCount: Record<string, number> = {};
    orders.forEach(order => {
      const customer = order.customerName;
      customerCount[customer] = (customerCount[customer] || 0) + 1;
    });

    const sorted = Object.entries(customerCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    const maxCount = sorted[0]?.[1] || 1;

    return sorted.map(([customer, count]) => ({
      customer: customer.length > 15 ? customer.substring(0, 15) + '...' : customer,
      fullCustomer: customer,
      count,
      width: (count / maxCount) * 100,
    }));
  }, [orders]);

  // 交付及时率
  const deliveryPerformance = useMemo(() => {
    const completed = orders.filter(o => o.orderStatus === '已完成');
    const onTime = completed.filter(o => {
      if (!o.actualDeliveryDate) return false;
      return o.actualDeliveryDate <= o.plannedDeliveryDate;
    });

    const total = completed.length;
    const onTimeCount = onTime.length;
    const lateCount = total - onTimeCount;

    return {
      total,
      onTimeCount,
      lateCount,
      onTimeRate: total > 0 ? ((onTimeCount / total) * 100).toFixed(1) : '0',
    };
  }, [orders]);

  return (
    <div className="space-y-6">
      {/* 状态分布饼图 */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2 mb-4">
          <PieChartIcon size={20} className="text-indigo-600" />
          <h3 className="font-semibold text-slate-800">订单状态分布</h3>
        </div>
        <div className="space-y-3">
          {statusDistribution.map((item, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-slate-700">{item.status}</span>
                  <span className="text-sm text-slate-600">{item.count} ({item.percentage}%)</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className={`${item.color} h-2 rounded-full transition-all duration-500`}
                    style={{ width: `${item.percentage}%` }}
                  ></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 每月交付趋势 */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={20} className="text-indigo-600" />
          <h3 className="font-semibold text-slate-800">月度交付趋势</h3>
        </div>
        <div className="flex items-stretch justify-between gap-2 h-48">
          {monthlyTrend.map((item, index) => (
            <div key={index} className="flex-1 flex flex-col items-center gap-2">
              <div className="flex-1 w-full flex flex-row items-end justify-center gap-1">
                {/* Total Bar */}
                <div
                  className="relative group w-3 bg-blue-500 rounded-t transition-all duration-500 hover:bg-blue-600"
                  style={{ height: `${item.totalHeight}%` }}
                >
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                    <div className="bg-slate-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                      总计: {item.total}
                    </div>
                  </div>
                </div>
                {/* Completed Bar */}
                <div
                  className="relative group w-3 bg-green-500 rounded-t transition-all duration-500 hover:bg-green-600"
                  style={{ height: `${item.completedHeight}%` }}
                >
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                    <div className="bg-slate-800 text-white text-xs rounded px-2 py-1 whitespace-nowrap">
                      完成: {item.completed}
                    </div>
                  </div>
                </div>
              </div>
              <div className="text-xs text-slate-600 text-center">
                <div>{item.month}月</div>
                <div className="text-[10px] text-slate-400">{item.year}</div>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center gap-4 mt-4 text-xs">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-blue-500 rounded"></div>
            <span className="text-slate-600">总订单</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 bg-green-500 rounded"></div>
            <span className="text-slate-600">已完成</span>
          </div>
        </div>
      </div>

      {/* 产品分布Top 5 */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 size={20} className="text-indigo-600" />
          <h3 className="font-semibold text-slate-800">热门产品 Top 5</h3>
        </div>
        <div className="space-y-3">
          {productDistribution.map((item, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs font-bold">
                {index + 1}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-slate-700" title={item.fullProduct}>
                    {item.product}
                  </span>
                  <span className="text-sm text-slate-600">{item.count} 单</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className="bg-indigo-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${item.width}%` }}
                  ></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 客户分布Top 5 */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2 mb-4">
          <BarChart3 size={20} className="text-indigo-600" />
          <h3 className="font-semibold text-slate-800">主要客户 Top 5</h3>
        </div>
        <div className="space-y-3">
          {customerDistribution.map((item, index) => (
            <div key={index} className="flex items-center gap-3">
              <div className="w-6 h-6 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-xs font-bold">
                {index + 1}
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-slate-700" title={item.fullCustomer}>
                    {item.customer}
                  </span>
                  <span className="text-sm text-slate-600">{item.count} 单</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className="bg-purple-500 h-2 rounded-full transition-all duration-500"
                    style={{ width: `${item.width}%` }}
                  ></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 交付绩效 */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={20} className="text-indigo-600" />
          <h3 className="font-semibold text-slate-800">交付绩效</h3>
        </div>
        <div className="space-y-4">
          <div className="text-center">
            <div className="text-4xl font-bold text-indigo-600 mb-1">
              {deliveryPerformance.onTimeRate}%
            </div>
            <div className="text-sm text-slate-600">准时交付率</div>
          </div>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-slate-800">{deliveryPerformance.total}</div>
              <div className="text-xs text-slate-600 mt-1">总完成订单</div>
            </div>
            <div className="bg-green-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-green-600">{deliveryPerformance.onTimeCount}</div>
              <div className="text-xs text-slate-600 mt-1">准时交付</div>
            </div>
            <div className="bg-red-50 rounded-lg p-3">
              <div className="text-2xl font-bold text-red-600">{deliveryPerformance.lateCount}</div>
              <div className="text-xs text-slate-600 mt-1">延迟交付</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeliveryCharts;

