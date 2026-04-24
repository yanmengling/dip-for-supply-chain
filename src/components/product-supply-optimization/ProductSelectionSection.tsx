import React from 'react';
import type { ProductSupplyAnalysis } from '../../types/ontology';
import { ChevronDown } from 'lucide-react';

interface Props {
  allProducts: ProductSupplyAnalysis[];
  selectedProductId: string | null;
  onProductSelect?: (productId: string) => void;
}

export const ProductSelectionSection: React.FC<Props> = ({
  allProducts,
  selectedProductId,
  onProductSelect
}) => {
  // 按产品ID排序显示所有产品
  const sortedProducts = [...allProducts].sort((a, b) =>
    a.productId.localeCompare(b.productId)
  );

  if (allProducts.length === 0 || !onProductSelect) return null;

  const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const productId = e.target.value;
    if (productId) {
      onProductSelect(productId);
    }
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-slate-700">选择产品:</span>
        <div className="relative flex-1 max-w-md">
          <select
            value={selectedProductId || ''}
            onChange={handleSelectChange}
            className="w-full appearance-none px-4 py-2.5 pr-10 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 cursor-pointer transition-all"
          >
            <option value="" disabled>请选择产品...</option>
            {sortedProducts.map(product => (
              <option key={product.productId} value={product.productId}>
                {product.productId} {product.productName}
              </option>
            ))}
          </select>
          <ChevronDown
            className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 pointer-events-none"
            size={18}
          />
        </div>
      </div>
    </div>
  );
};



