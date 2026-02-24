import React from 'react';
import { Row, Col, Divider } from 'antd';
import ProductSearchBox, { getDefaultProducts } from './ProductSearchBox';
import ProductCard from './ProductCard';

interface ProductSearchSectionProps {
    allProducts: any[];
    selectedProductId?: string;
    onProductSelect: (productId: string) => void;
}

const ProductSearchSection: React.FC<ProductSearchSectionProps> = ({
    allProducts,
    selectedProductId,
    onProductSelect
}) => {
    // 获取默认展示的3个产品
    const defaultProducts = getDefaultProducts(allProducts);

    return (
        <div style={{ marginBottom: 24 }}>
            <h2 style={{ marginBottom: 16 }}>产品供应优化 - 产品需求预测辅助分析</h2>

            {/* 搜索框 */}
            <ProductSearchBox
                allProducts={allProducts}
                selectedProductId={selectedProductId}
                onProductSelect={onProductSelect}
            />

            {/* 默认展示产品 */}
            {!selectedProductId && defaultProducts.length > 0 && (
                <>
                    <Divider titlePlacement="left" style={{ marginTop: 24, marginBottom: 16 }}>
                        默认展示产品（共{defaultProducts.length}个）
                    </Divider>
                    <Row gutter={[16, 16]}>
                        {defaultProducts.map((product, index) => (
                            <Col key={product.productId || `default-product-${index}`} xs={24} sm={12} md={8}>
                                <ProductCard
                                    product={product}
                                    isSelected={selectedProductId === product.productId}
                                    onSelect={onProductSelect}
                                />
                            </Col>
                        ))}
                    </Row>
                </>
            )}
        </div>
    );
};

export default ProductSearchSection;
