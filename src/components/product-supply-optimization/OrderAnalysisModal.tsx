import React, { useEffect, useState } from 'react';
import { ShoppingCart, X, CheckCircle2, Clock, CalendarRange, Truck, Loader2, AlertTriangle, Package, AlertCircle } from 'lucide-react';
import { ontologyApi } from '../../api';
import { apiConfigService } from '../../services/apiConfigService';
import { fetchInventory } from '../../services/mpsDataService';
import type { QueryCondition } from '../../api/ontologyApi';

// Note: Object Type IDs are now loaded from config service
// - Sales Order: oo_sales_order_huida
// - Inventory: oo_inventory_huida

// 销售订单接口
interface SalesOrder {
  id?: string;
  product_code: string;
  signing_quantity: number;
  shipping_quantity: number;
  promised_delivery_date?: string;
}

// 月份分组数据
interface MonthlyPendingOrder {
  month: string;  // YYYY-MM
  orderCount: number;
  pendingQuantity: number;
}

// 订单分析结果类型
interface OrderAnalysisData {
  productId: string;
  // 总体统计
  totalOrders: number;
  totalSignedQuantity: number;
  deliveredOrdersCount: number;
  deliveredTotalQuantity: number;
  pendingQuantity: number;
  completionRate: number;
  // 库存信息
  currentInventory: number;
  safetyStock: number;
  inventoryUnit: string;
  // 生产计划建议
  productionSuggestion: {
    needsProduction: boolean;
    suggestedQuantity: number;
  } | null;
  // 待交付订单按月分组
  monthlyPendingOrders: MonthlyPendingOrder[];
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  productId: string;
  productName?: string;
}

export const OrderAnalysisModal: React.FC<Props> = ({ isOpen, onClose, productId, productName }) => {
  const [analysis, setAnalysis] = useState<OrderAnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !productId) return;

    async function fetchData() {
      try {
        setLoading(true);
        setError(null);

        // 1. 查询销售订单
        const orderCondition: QueryCondition = {
          operation: '==',
          field: 'product_code',
          value: productId,
          value_from: 'const',
        };

        // Load object type ID from config
        // Load object type ID from config
        const salesOrderOtId = apiConfigService.getOntologyObjectId('oo_sales_order') || '';

        if (!salesOrderOtId) {
          throw new Error('Sales Order Object Type ID not configured');
        }

        const orderResponse = await ontologyApi.queryObjectInstances(salesOrderOtId, {
          condition: orderCondition,
          limit: 1000,
        });

        console.log('[OrderAnalysisModal] Sales orders:', orderResponse.entries.length);

        // 2. 解析销售订单数据
        const salesOrders: SalesOrder[] = orderResponse.entries.map((item: any) => ({
          id: item.id,
          product_code: item.product_code || '',
          signing_quantity: item.signing_quantity ? parseFloat(item.signing_quantity) : 0,
          shipping_quantity: item.shipping_quantity ? parseFloat(item.shipping_quantity) : 0,
          promised_delivery_date: item.promised_delivery_date,
        }));

        // 3. 计算订单统计
        const totalOrders = salesOrders.length;
        let totalSignedQuantity = 0;
        let deliveredTotalQuantity = 0;
        let deliveredOrdersCount = 0;

        salesOrders.forEach(order => {
          totalSignedQuantity += order.signing_quantity;
          deliveredTotalQuantity += order.shipping_quantity;
          if (order.shipping_quantity > 0) {
            deliveredOrdersCount++;
          }
        });

        const pendingQuantity = Math.max(0, totalSignedQuantity - deliveredTotalQuantity);
        const completionRate = totalSignedQuantity > 0
          ? (deliveredTotalQuantity / totalSignedQuantity) * 100
          : 0;

        // 4. 按月份分组待交付订单（shipping_quantity < signing_quantity）
        const pendingOrders = salesOrders.filter(
          order => order.shipping_quantity < order.signing_quantity && order.promised_delivery_date
        );

        const monthlyMap = new Map<string, { orderCount: number; pendingQuantity: number }>();

        pendingOrders.forEach(order => {
          if (!order.promised_delivery_date) return;

          // 提取月份 YYYY-MM
          const date = new Date(order.promised_delivery_date);
          const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

          const existing = monthlyMap.get(month) || { orderCount: 0, pendingQuantity: 0 };
          monthlyMap.set(month, {
            orderCount: existing.orderCount + 1,
            pendingQuantity: existing.pendingQuantity + (order.signing_quantity - order.shipping_quantity),
          });
        });

        // 转换为数组并按月份排序
        const monthlyPendingOrders: MonthlyPendingOrder[] = Array.from(monthlyMap.entries())
          .map(([month, data]) => ({
            month,
            orderCount: data.orderCount,
            pendingQuantity: Math.floor(data.pendingQuantity),
          }))
          .sort((a, b) => a.month.localeCompare(b.month));

        // 5. 获取库存信息
        const inventory = await fetchInventory(productId);
        const currentInventory = inventory?.inventory_data || 0;
        const safetyStock = inventory?.safety_stock || 0;
        const inventoryUnit = '单位'; // 默认单位，可以从产品对象获取

        // 6. 计算生产计划建议
        let productionSuggestion: { needsProduction: boolean; suggestedQuantity: number } | null = null;
        if (safetyStock > currentInventory) {
          const suggestedQuantity = safetyStock - currentInventory + pendingQuantity;
          productionSuggestion = {
            needsProduction: true,
            suggestedQuantity: Math.ceil(suggestedQuantity),
          };
        }

        setAnalysis({
          productId,
          totalOrders,
          totalSignedQuantity: Math.floor(totalSignedQuantity),
          deliveredOrdersCount,
          deliveredTotalQuantity: Math.floor(deliveredTotalQuantity),
          pendingQuantity: Math.floor(pendingQuantity),
          completionRate,
          currentInventory,
          safetyStock,
          inventoryUnit,
          productionSuggestion,
          monthlyPendingOrders,
        });
      } catch (err) {
        console.error('[OrderAnalysisModal] API call failed:', err);
        setError(err instanceof Error ? err.message : '获取订单数据失败');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [isOpen, productId]);

  if (!isOpen) return null;

  // 加载中状态
  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl p-8 text-center">
          <Loader2 className="animate-spin text-indigo-600 mx-auto mb-4" size={40} />
          <p className="text-slate-600">加载订单数据中...</p>
        </div>
      </div>
    );
  }

  // 错误状态
  if (error) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl p-8">
          <div className="text-center">
            <AlertTriangle className="text-red-500 mx-auto mb-4" size={40} />
            <p className="text-red-600 mb-4">{error}</p>
            <button onClick={onClose} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg">
              关闭
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!analysis) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-indigo-50/30 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-lg flex items-center justify-center">
              <ShoppingCart className="text-indigo-600" size={20} />
            </div>
            <div>
              <h3 className="font-bold text-slate-800">订单交付分析</h3>
              <p className="text-xs text-slate-500">
                {productName || analysis.productId} 交付进度详情
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content - Scrollable */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* 一、总体呈现 */}
          <div className="space-y-4">
            <h4 className="text-lg font-semibold text-slate-800 border-b border-slate-200 pb-2">
              总体呈现
            </h4>

            {/* 订单统计卡片 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                <div className="text-sm text-slate-500 mb-1">总订单数</div>
                <div className="text-2xl font-bold text-slate-800">{analysis.totalOrders}</div>
                <div className="text-xs text-slate-400 mt-1">笔</div>
              </div>
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-100">
                <div className="text-sm text-slate-500 mb-1">总签约数量</div>
                <div className="text-2xl font-bold text-slate-800">{analysis.totalSignedQuantity.toLocaleString()}</div>
                <div className="text-xs text-slate-400 mt-1">单位</div>
              </div>
            </div>

            {/* 已交付统计 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-100">
                <div className="flex items-center gap-2 text-emerald-700 mb-2">
                  <CheckCircle2 size={18} />
                  <span className="font-semibold">已交付订单数量</span>
                </div>
                <div className="text-2xl font-bold text-slate-800">{analysis.deliveredOrdersCount}</div>
                <div className="text-xs text-emerald-600 mt-1">笔</div>
              </div>
              <div className="bg-emerald-50 rounded-lg p-4 border border-emerald-100">
                <div className="flex items-center gap-2 text-emerald-700 mb-2">
                  <Truck size={18} />
                  <span className="font-semibold">已交付总数量</span>
                </div>
                <div className="text-2xl font-bold text-slate-800">{analysis.deliveredTotalQuantity.toLocaleString()}</div>
                <div className="text-xs text-emerald-600 mt-1">单位</div>
              </div>
            </div>

            {/* 库存和待交付 */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-amber-50 rounded-lg p-4 border border-amber-100">
                <div className="flex items-center gap-2 text-amber-700 mb-2">
                  <Package size={18} />
                  <span className="font-semibold">当前库存</span>
                </div>
                <div className="text-2xl font-bold text-slate-800">{analysis.currentInventory.toLocaleString()}</div>
                <div className="text-xs text-amber-600 mt-1">{analysis.inventoryUnit}</div>
              </div>
              <div className="bg-blue-50 rounded-lg p-4 border border-blue-100">
                <div className="flex items-center gap-2 text-blue-700 mb-2">
                  <AlertCircle size={18} />
                  <span className="font-semibold">安全库存</span>
                </div>
                <div className="text-2xl font-bold text-slate-800">{analysis.safetyStock.toLocaleString()}</div>
                <div className="text-xs text-blue-600 mt-1">{analysis.inventoryUnit}</div>
              </div>
              <div className="bg-orange-50 rounded-lg p-4 border border-orange-100">
                <div className="flex items-center gap-2 text-orange-700 mb-2">
                  <Clock size={18} />
                  <span className="font-semibold">待交付数量</span>
                </div>
                <div className="text-2xl font-bold text-slate-800">{analysis.pendingQuantity.toLocaleString()}</div>
                <div className="text-xs text-orange-600 mt-1">单位</div>
              </div>
            </div>

            {/* 完成率 */}
            <div className="bg-indigo-50 rounded-lg p-4 border border-indigo-100">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm text-slate-500 mb-1">完成率</div>
                  <div className="text-3xl font-bold text-indigo-700">{analysis.completionRate.toFixed(1)}%</div>
                </div>
                <div className="relative w-20 h-20 flex items-center justify-center">
                  <svg className="w-full h-full transform -rotate-90">
                    <circle cx="40" cy="40" r="32" stroke="currentColor" strokeWidth="6" fill="transparent" className="text-indigo-200" />
                    <circle
                      cx="40"
                      cy="40"
                      r="32"
                      stroke="currentColor"
                      strokeWidth="6"
                      fill="transparent"
                      strokeDasharray={201}
                      strokeDashoffset={201 - (201 * analysis.completionRate) / 100}
                      className="text-indigo-600 transition-all duration-1000 ease-out"
                    />
                  </svg>
                  <span className="absolute text-sm font-bold text-indigo-700">{Math.round(analysis.completionRate)}%</span>
                </div>
              </div>
            </div>

            {/* 生产计划建议 */}
            {analysis.productionSuggestion && analysis.productionSuggestion.needsProduction && (
              <div className="bg-red-50 rounded-lg p-4 border border-red-200">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="text-red-600 mt-0.5 flex-shrink-0" size={20} />
                  <div className="flex-1">
                    <div className="font-semibold text-red-800 mb-1">生产计划建议</div>
                    <div className="text-sm text-red-700">
                      当前库存低于安全库存，建议补充生产 {analysis.productionSuggestion.suggestedQuantity.toLocaleString()} {analysis.inventoryUnit}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 二、待交付订单分析 */}
          {analysis.monthlyPendingOrders.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-lg font-semibold text-slate-800 border-b border-slate-200 pb-2">
                待交付订单分析（按月份）
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">月份</th>
                      <th className="border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">订单数</th>
                      <th className="border border-slate-200 px-4 py-3 text-left text-sm font-semibold text-slate-700">待交付产品数量</th>
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.monthlyPendingOrders.map((item, index) => (
                      <tr key={item.month} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                        <td className="border border-slate-200 px-4 py-3 text-sm text-slate-800">{item.month}</td>
                        <td className="border border-slate-200 px-4 py-3 text-sm text-slate-800">{item.orderCount}</td>
                        <td className="border border-slate-200 px-4 py-3 text-sm text-slate-800 font-semibold">
                          {item.pendingQuantity.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 如果没有待交付订单 */}
          {analysis.monthlyPendingOrders.length === 0 && (
            <div className="text-center py-8 text-slate-400">
              <CheckCircle2 className="mx-auto mb-2 text-slate-300" size={32} />
              <p className="text-sm">暂无待交付订单</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
