import { useState, useMemo } from 'react';
import { Search as SearchIcon, Package, ShoppingCart, Users, MessageSquare } from 'lucide-react';
import { suppliersData, materialsData, productsData, ordersData } from '../../utils/entityConfigService';

interface Props {
  toggleCopilot?: () => void;
}

const SearchView = ({ toggleCopilot }: Props) => {
  const [searchQuery, setSearchQuery] = useState('');

  const results = useMemo(() => {
    if (!searchQuery.trim()) return [];

    const query = searchQuery.toLowerCase();
    const results: Array<{
      type: 'supplier' | 'material' | 'product' | 'order';
      id: string;
      name: string;
      description: string;
      icon: typeof SearchIcon;
    }> = [];

    // Search suppliers
    suppliersData.forEach(supplier => {
      if (supplier.supplierName.toLowerCase().includes(query) ||
        supplier.supplierId.toLowerCase().includes(query) ||
        supplier.materialName.toLowerCase().includes(query)) {
        results.push({
          type: 'supplier',
          id: supplier.supplierId,
          name: supplier.supplierName,
          description: `供应物料: ${supplier.materialName}`,
          icon: Users,
        });
      }
    });

    // Search materials
    materialsData.forEach(material => {
      if (material.materialName.toLowerCase().includes(query) ||
        material.materialCode.toLowerCase().includes(query)) {
        results.push({
          type: 'material',
          id: material.materialCode,
          name: material.materialName,
          description: `适用产品: ${material.applicableProductIds.length}个`,
          icon: Package,
        });
      }
    });

    // Search products
    productsData.forEach(product => {
      if (product.productName.toLowerCase().includes(query) ||
        product.productId.toLowerCase().includes(query)) {
        results.push({
          type: 'product',
          id: product.productId,
          name: product.productName,
          description: `物料数量: ${product.materialCodes.length}种`,
          icon: Package,
        });
      }
    });

    // Search orders
    ordersData.forEach(order => {
      if (order.orderName.toLowerCase().includes(query) ||
        order.orderId.toLowerCase().includes(query) ||
        order.client.toLowerCase().includes(query)) {
        results.push({
          type: 'order',
          id: order.orderId,
          name: order.orderName,
          description: `客户: ${order.client} | 状态: ${order.status}`,
          icon: ShoppingCart,
        });
      }
    });

    return results;
  }, [searchQuery]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-800">搜索</h1>
      </div>

      {/* Search Input */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="relative">
          <SearchIcon className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" size={20} />
          <input
            type="text"
            placeholder="搜索供应商、物料、产品、订单..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Search Results */}
      {searchQuery && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b border-slate-200">
            <h2 className="text-lg font-semibold text-slate-800">
              搜索结果 ({results.length})
            </h2>
          </div>
          <div className="p-6">
            {results.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <p>未找到匹配的结果</p>
              </div>
            ) : (
              <div className="space-y-3">
                {results.map((result, index) => {
                  const Icon = result.icon;
                  return (
                    <div
                      key={index}
                      className="flex items-center gap-4 p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <div className="p-2 bg-indigo-50 rounded-lg">
                        <Icon className="text-indigo-600" size={20} />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-slate-800">{result.name}</p>
                        <p className="text-sm text-slate-600 mt-1">{result.description}</p>
                        <p className="text-xs text-slate-500 mt-1">
                          {result.type === 'supplier' ? '供应商' :
                            result.type === 'material' ? '物料' :
                              result.type === 'product' ? '产品' : '订单'} | ID: {result.id}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!searchQuery && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <SearchIcon className="mx-auto text-slate-400 mb-4" size={48} />
          <p className="text-slate-600">输入关键词开始搜索</p>
          <p className="text-sm text-slate-500 mt-2">可以搜索供应商、物料、产品、订单等信息</p>
        </div>
      )}

      {/* Floating Chat Bubble Button */}
      {toggleCopilot && (
        <button
          onClick={toggleCopilot}
          className="fixed bottom-8 right-8 w-14 h-14 bg-gradient-to-br from-indigo-600 to-purple-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all flex items-center justify-center z-40"
          aria-label="打开AI助手"
        >
          <MessageSquare size={24} />
        </button>
      )}
    </div>
  );
};

export default SearchView;
