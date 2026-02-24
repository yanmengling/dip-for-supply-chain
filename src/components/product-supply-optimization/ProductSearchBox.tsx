import React, { useState, useMemo, useCallback } from 'react';
import { debounce } from 'lodash';
import { Input, List, Tag } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import type { ProductSearchResult } from './types';

// Re-export types for convenience
export type { ProductSearchResult } from './types';

/**
 * Helper function to extract stockDays from product data
 * Handles both nested (inventoryStatus.stockDays) and flat (stockDays) structures
 */
function getStockDays(product: any): number {
    if (product.inventoryStatus?.stockDays !== undefined) {
        return product.inventoryStatus.stockDays;
    }
    if (product.stockDays !== undefined) {
        return product.stockDays;
    }
    return 0;
}

/**
 * Helper function to extract stock status from product data
 * Maps different status naming conventions to a unified format
 */
function getStockStatus(product: any): 'sufficient' | 'normal' | 'low' | 'critical' {
    // Check nested structure first
    if (product.inventoryStatus?.stockStatus) {
        return product.inventoryStatus.stockStatus;
    }

    // Map stockoutRiskLevel to our status format
    if (product.stockoutRiskLevel) {
        const riskToStatus: Record<string, 'sufficient' | 'normal' | 'low' | 'critical'> = {
            'low': 'sufficient',
            'medium': 'normal',
            'high': 'critical'
        };
        return riskToStatus[product.stockoutRiskLevel] || 'normal';
    }

    // Fallback based on stockDays
    const stockDays = getStockDays(product);
    if (stockDays >= 60) return 'sufficient';
    if (stockDays >= 30) return 'normal';
    if (stockDays >= 15) return 'low';
    return 'critical';
}

interface ProductSearchBoxProps {
    allProducts: any[];
    onProductSelect: (productId: string) => void;
    selectedProductId?: string;
}

/**
 * 从BOM列表中查找匹配的BOM编码
 */
function findBOMMatch(product: any, query: string): string | null {
    if (!product.boms || product.boms.length === 0) return null;

    for (const bom of product.boms) {
        const bomCode = bom.bom_material_code || '';
        if (bomCode.toLowerCase().includes(query)) {
            return bomCode;
        }
    }
    return null;
}

/**
 * 多字段模糊搜索
 * 支持：产品编码(material_number)、产品名称(material_name)、产品型号、BOM编码
 */
function searchProducts(
    query: string,
    allProducts: any[]
): ProductSearchResult[] {
    const normalizedQuery = query.toLowerCase().trim();

    if (!normalizedQuery) {
        return [];
    }

    const results: ProductSearchResult[] = [];

    for (const product of allProducts) {
        // Skip products without valid productId
        if (!product.productId || product.productId.trim() === '') {
            continue;
        }

        let matchScore = 0;
        const matchFields: string[] = [];

        // 产品编码匹配（权重最高）- material_number
        if (product.productId?.toLowerCase().includes(normalizedQuery)) {
            matchScore += 100;
            matchFields.push('productId');
        }

        // 产品名称匹配 - material_name
        if (product.productName?.toLowerCase().includes(normalizedQuery)) {
            matchScore += 80;
            matchFields.push('productName');
        }

        // 产品型号匹配
        if (product.productModel?.toLowerCase().includes(normalizedQuery)) {
            matchScore += 60;
            matchFields.push('productModel');
        }

        // BOM编码匹配
        const bomMatch = findBOMMatch(product, normalizedQuery);
        if (bomMatch) {
            matchScore += 70;
            matchFields.push('bomCode');
        }

        if (matchScore > 0) {
            results.push({
                productId: product.productId,
                productName: product.productName,
                productModel: product.productModel,
                bomCode: bomMatch || undefined,
                stockDays: getStockDays(product),
                stockStatus: getStockStatus(product),
                matchScore,
                matchFields
            });
        }
    }

    // 按匹配得分降序排序
    return results.sort((a, b) => b.matchScore - a.matchScore);
}

/**
 * 获取默认展示的3个产品
 * 优先级：库存紧急 > 库存偏低 > 库存正常 > 库存充足
 */
export function getDefaultProducts(
    allProducts: any[]
): ProductSearchResult[] {
    if (!allProducts || allProducts.length === 0) {
        return [];
    }

    // Filter out products without valid productId
    const validProducts = allProducts.filter(p => p.productId && p.productId.trim() !== '');

    if (validProducts.length === 0) {
        return [];
    }

    const sorted = [...validProducts].sort((a, b) => {
        // 获取stock status
        const statusA = getStockStatus(a);
        const statusB = getStockStatus(b);

        // 优先显示库存偏低的产品（需要关注）
        const statusPriority: Record<string, number> = {
            'critical': 1,
            'low': 2,
            'normal': 3,
            'sufficient': 4
        };
        const priorityDiff =
            (statusPriority[statusA] || 999) -
            (statusPriority[statusB] || 999);

        if (priorityDiff !== 0) return priorityDiff;

        // 同级别按库存天数升序
        return getStockDays(a) - getStockDays(b);
    });

    return sorted.slice(0, 3).map(p => ({
        productId: p.productId,
        productName: p.productName,
        productModel: p.productModel,
        bomCode: p.boms?.[0]?.bom_material_code,
        stockDays: getStockDays(p),
        stockStatus: getStockStatus(p),
        matchScore: 0,
        matchFields: []
    }));
}

const ProductSearchBox: React.FC<ProductSearchBoxProps> = ({
    allProducts,
    onProductSelect,
    selectedProductId
}) => {
    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);

    // 防抖搜索（300ms延迟）
    const debouncedSearch = useMemo(
        () => debounce((q: string) => {
            const results = searchProducts(q, allProducts);
            setSearchResults(results);
        }, 300),
        [allProducts]
    );

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const value = e.target.value;
        setQuery(value);
        debouncedSearch(value);
    }, [debouncedSearch]);

    const handleSelectProduct = useCallback((productId: string) => {
        onProductSelect(productId);
        setQuery('');
        setSearchResults([]);
    }, [onProductSelect]);

    const getStatusColor = (status: string): string => {
        const colors: Record<string, string> = {
            sufficient: 'green',
            normal: 'blue',
            low: 'orange',
            critical: 'red'
        };
        return colors[status] || 'default';
    };

    const getStatusLabel = (status: string): string => {
        const labels: Record<string, string> = {
            sufficient: '库存充足',
            normal: '库存正常',
            low: '库存偏低',
            critical: '库存紧急'
        };
        return labels[status] || status;
    };

    return (
        <div className="product-search-box" style={{ position: 'relative' }}>
            <Input
                size="large"
                prefix={<SearchOutlined />}
                placeholder="搜索产品（产品编码、名称或BOM编码）"
                value={query}
                onChange={handleInputChange}
                style={{ marginBottom: 16 }}
            />

            {query && (
                <div style={{
                    position: 'absolute',
                    top: '100%',
                    left: 0,
                    right: 0,
                    zIndex: 1000,
                    background: 'white',
                    border: '1px solid #d9d9d9',
                    borderRadius: '4px',
                    maxHeight: '400px',
                    overflowY: 'auto',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                }}>
                    {searchResults.length === 0 ? (
                        <div style={{ padding: '16px', textAlign: 'center', color: '#999' }}>
                            未找到匹配的产品
                        </div>
                    ) : (
                        <List
                            dataSource={searchResults}
                            renderItem={(result, index) => (
                                <List.Item
                                    key={result.productId || `search-result-${index}`}
                                    onClick={() => handleSelectProduct(result.productId)}
                                    style={{
                                        cursor: 'pointer',
                                        padding: '12px 16px',
                                        background: result.productId === selectedProductId ? '#f0f5ff' : 'white'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = '#fafafa';
                                    }}
                                    onMouseLeave={(e) => {
                                        e.currentTarget.style.background = result.productId === selectedProductId ? '#f0f5ff' : 'white';
                                    }}
                                >
                                    <List.Item.Meta
                                        title={
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <strong>{result.productId}</strong>
                                                <span>-</span>
                                                <span>{result.productName}</span>
                                                <Tag color={getStatusColor(result.stockStatus)}>
                                                    {getStatusLabel(result.stockStatus)}
                                                </Tag>
                                            </div>
                                        }
                                        description={
                                            <div style={{ fontSize: '12px', color: '#666' }}>
                                                {result.bomCode && (
                                                    <div>BOM: {result.bomCode}</div>
                                                )}
                                                <div>库存天数: {result.stockDays}天</div>
                                            </div>
                                        }
                                    />
                                </List.Item>
                            )}
                        />
                    )}
                </div>
            )}
        </div>
    );
};

export default ProductSearchBox;
