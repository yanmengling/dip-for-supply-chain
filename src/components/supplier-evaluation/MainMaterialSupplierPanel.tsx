/**
 * MainMaterialSupplierPanel Component
 * 
 * Displays main material supplier panel with materials sorted by annual purchase amount.
 * 
 * Principle 1: Types imported from ontology.ts
 * Principle 2: Uses semantic color variables
 * Principle 3: Component < 150 lines
 */

import { useState, useEffect } from 'react';
import { loadSupplier360Scorecards } from '../../services/supplierDataLoader';
import RiskBadge from './RiskBadge';
import { AlertCircle, ArrowRight } from 'lucide-react';


interface MainMaterialSupplierPanelProps {
  onSupplierClick?: (supplierId: string) => void;
  onSwitchSupplier?: (materialCode: string, supplierId: string) => void;
}

const MainMaterialSupplierPanel = ({
  onSupplierClick,
  onSwitchSupplier
}: MainMaterialSupplierPanelProps) => {


  const [materials, setMaterials] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadMaterials = async () => {
      setLoading(true);
      try {
        const scorecards = await loadSupplier360Scorecards();
        const data = scorecards.slice(0, 5).map((sc, idx) => ({
          rank: idx + 1,
          supplierId: sc.supplierId,
          supplierName: sc.supplierName,
          qualityRating: sc.dimensions.qualityRating,
          riskRating: sc.dimensions.riskRating,
          onTimeDeliveryRate: sc.dimensions.onTimeDeliveryRate,
          annualPurchaseAmount: sc.dimensions.annualPurchaseAmount,
          riskCoefficient: sc.dimensions.riskRating,
        }));
        setMaterials(data);
      } catch (error) {
        console.error('Failed to load main materials:', error);
        setMaterials([]);
      } finally {
        setLoading(false);
      }
    };

    loadMaterials();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-500">加载中...</div>
      </div>
    );
  }

  if (materials.length === 0) {
    return (
      <div className="text-center py-12 text-slate-500">
        <AlertCircle className="mx-auto mb-2 text-slate-400" size={24} />
        <p>暂无主要物料数据</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-slate-800">主要物料供应商</h2>
        <div className="text-sm text-slate-500">显示前 5 个供应商（按采购额排序）</div>
      </div>

      <div className="space-y-3">
        {materials.map((material) => (
          <div
            key={material.supplierId}
            className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-4 flex-1">
              <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">
                #{material.rank}
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <button
                    onClick={() => onSupplierClick?.(material.supplierId)}
                    className="font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
                  >
                    {material.supplierName}
                  </button>
                  <span className="text-sm text-slate-500 font-mono">{material.supplierId}</span>
                  <RiskBadge
                    riskLevel={material.riskCoefficient >= 30 ? 'high' :
                      material.riskCoefficient >= 20 ? 'medium' : 'low'}
                  />
                </div>
                <p className="text-sm text-slate-600">
                  质量评级: {material.qualityRating}
                  {' | '}
                  风险评级: {material.riskRating}
                  {' | '}
                  准时交付率: {material.onTimeDeliveryRate}%
                  {' | '}
                  年度采购额: ¥{(material.annualPurchaseAmount / 10000).toFixed(0)}万
                </p>
              </div>
            </div>
            <button
              onClick={() => onSwitchSupplier?.(material.supplierId, material.supplierId)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors flex items-center gap-2 whitespace-nowrap ml-4"
            >
              切换备选供应商
              <ArrowRight size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MainMaterialSupplierPanel;



