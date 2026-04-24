import React from 'react';
import { Card, Tag, Button } from 'antd';
import type { ProductSearchResult } from './types';

interface ProductCardProps {
    product: ProductSearchResult;
    isSelected: boolean;
    onSelect: (productId: string) => void;
}

const ProductCard: React.FC<ProductCardProps> = ({ product, isSelected, onSelect }) => {
    const statusColors: Record<string, string> = {
        sufficient: 'green',
        normal: 'blue',
        low: 'orange',
        critical: 'red'
    };

    const statusLabels: Record<string, string> = {
        sufficient: '库存充足',
        normal: '库存正常',
        low: '库存偏低',
        critical: '库存紧急'
    };

    return (
        <Card
            hoverable
            style={{
                border: isSelected ? '2px solid #1890ff' : '1px solid #d9d9d9',
                boxShadow: isSelected ? '0 2px 8px rgba(24,144,255,0.2)' : undefined,
                cursor: 'pointer',
                height: '100%'
            }}
            onClick={() => onSelect(product.productId)}
        >
            <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600 }}>
                        {product.productId}
                    </h3>
                    <Tag color={statusColors[product.stockStatus]}>
                        {statusLabels[product.stockStatus]}
                    </Tag>
                </div>

                <div style={{ color: '#666', marginBottom: 12 }}>
                    <div style={{ marginBottom: 4 }}>{product.productName}</div>
                    {product.productModel && (
                        <div style={{ fontSize: '12px', color: '#999' }}>
                            型号: {product.productModel}
                        </div>
                    )}
                    {product.bomCode && (
                        <div style={{ fontSize: '12px', color: '#999' }}>
                            BOM: {product.bomCode}
                        </div>
                    )}
                </div>

                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingTop: 12,
                    borderTop: '1px solid #f0f0f0'
                }}>
                    <div>
                        <div style={{ fontSize: '12px', color: '#999' }}>库存天数</div>
                        <div style={{ fontSize: '20px', fontWeight: 600, color: '#1890ff' }}>
                            {product.stockDays}天
                        </div>
                    </div>
                    <Button type={isSelected ? 'primary' : 'default'} size="small">
                        {isSelected ? '已选中' : '查看详情'}
                    </Button>
                </div>
            </div>
        </Card>
    );
};

export default ProductCard;
