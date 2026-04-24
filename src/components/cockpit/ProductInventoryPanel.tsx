import { ArrowRight } from 'lucide-react';
import ProductInventoryAgent from '../agents/ProductInventoryAgent';

interface Props {
  onNavigate?: (view: string) => void;
}

const ProductInventoryPanel = ({ onNavigate }: Props) => {
  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-slate-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800">产品库存智能体</h2>
        <button
          onClick={() => onNavigate?.('inventory')}
          className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
        >
          查看详情
          <ArrowRight size={14} />
        </button>
      </div>
      <div className="p-6">
        <ProductInventoryAgent onNavigate={onNavigate} />
      </div>
    </div>
  );
};

export default ProductInventoryPanel;

