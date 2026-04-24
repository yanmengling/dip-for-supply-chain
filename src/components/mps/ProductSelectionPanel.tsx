/**
 * Product Selection Panel Component
 * 
 * 产品选择面板组件，复用ProductSelectionSection的UI和交互方式
 * 数据从后端API获取（产品对象类型 d56v4ue9olk4bpa66v00）
 */

import React, { useState, useEffect } from 'react';
import type { APIProduct } from '../../types/ontology';
import { fetchProductList } from '../../services/mpsDataService';
import { Search, AlertTriangle } from 'lucide-react';

interface Props {
    selectedProductCode: string | null;
    onProductSelect: (productCode: string) => void;
}

export const ProductSelectionPanel: React.FC<Props> = ({
    selectedProductCode,
    onProductSelect
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [products, setProducts] = useState<APIProduct[]>([]);
    const [loading, setLoading] = useState(true);
    const [dataSource, setDataSource] = useState<'api' | 'fallback'>('api');
    const [error, setError] = useState<string | null>(null);

    // 加载产品列表
    useEffect(() => {
        const loadProducts = async () => {
            setLoading(true);
            setError(null);

            try {
                const productsData = await fetchProductList();
                setProducts(productsData);
                setDataSource('api');
            } catch (err) {
                console.error('[ProductSelectionPanel] 加载产品列表失败:', err);
                setError(err instanceof Error ? err.message : '加载产品列表失败');
            } finally {
                setLoading(false);
            }
        };

        loadProducts();
    }, []);

    // 只显示这三个有订单数据的产品
    const SUPPORTED_PRODUCTS = ['T01-000055', 'T01-000167', 'T01-000173'];
    
    // 只显示支持的产品（有指标模型配置的）
    const supportedProducts = products
        .filter(p => SUPPORTED_PRODUCTS.includes(p.product_code))
        .sort((a, b) => 
            SUPPORTED_PRODUCTS.indexOf(a.product_code) - SUPPORTED_PRODUCTS.indexOf(b.product_code)
        );

    // Filter products by search query (only within supported products)
    const filteredProducts = searchQuery
        ? supportedProducts.filter(p =>
            `${p.product_code}-${p.product_name}`.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : supportedProducts;

    // 格式化产品显示名称
    const formatProductName = (product: APIProduct): string => {
        return `${product.product_code}-${product.product_name}`;
    };

    if (loading) {
        return (
            <div className="mb-6">
                <div className="text-sm text-slate-500">加载产品列表...</div>
            </div>
        );
    }

    if (products.length === 0) {
        return (
            <div className="mb-6">
                <div className="text-sm text-slate-500">暂无产品数据</div>
            </div>
        );
    }

    return (
        <div className="mb-6">
            {/* Fallback警告提示 */}
            {dataSource === 'fallback' && (
                <div className="mb-3 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-center gap-2">
                    <AlertTriangle className="text-yellow-600" size={16} />
                    <span className="text-sm text-yellow-800">
                        ⚠️ 实时API加载失败，已自动回退到Mock数据
                        {error && <span className="ml-2 text-xs">({error})</span>}
                    </span>
                </div>
            )}

            <div className="flex items-center gap-3 mb-3">
                <span className="text-sm font-semibold text-slate-700">选择产品:</span>
                {/* Search Box */}
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" size={16} />
                    <input
                        type="text"
                        placeholder="搜索产品编码或名称..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-indigo-300"
                    />
                </div>
            </div>
            <div className="flex flex-wrap gap-2">
                {filteredProducts.map(product => {
                    const displayName = formatProductName(product);
                    const isSelected = selectedProductCode === product.product_code;

                    return (
                        <button
                            key={product.product_code}
                            onClick={() => onProductSelect(product.product_code)}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${isSelected
                                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                }`}
                        >
                            {displayName}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
