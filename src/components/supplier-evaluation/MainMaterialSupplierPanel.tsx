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
import { getMainMaterialsFromSupplierData } from '../../services/materialService';
import type { MainMaterialSupplier } from '../../types/ontology';
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


  const [materials, setMaterials] = useState<MainMaterialSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [limit] = useState(5);

  // 根据模式加载数据
  useEffect(() => {
    const loadMaterials = async () => {
      setLoading(true);
      try {
        const materialsData = await getMainMaterialsFromSupplierData();
        const data = materialsData.slice(0, limit);
        setMaterials(data);
      } catch (error) {
        console.error('Failed to load main materials:', error);
        setMaterials([]);
      } finally {
        setLoading(false);
      }
    };

    loadMaterials();
  }, [limit]);

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
        <div className="text-sm text-slate-500">显示前 {limit} 个物料（按年度采购额排序）</div>
      </div>

      <div className="space-y-3">
        {materials.map((material) => (
          <div
            key={`${material.materialCode}-${material.supplierId}`}
            className="flex items-center justify-between p-4 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-4 flex-1">
              <span className="text-xs font-bold text-slate-400 bg-slate-100 px-2 py-1 rounded">
                #{material.rank}
              </span>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-medium text-slate-800">{material.materialName}</p>
                  <span className="text-sm text-slate-500 font-mono">{material.materialCode}</span>
                  <RiskBadge
                    riskLevel={material.riskCoefficient >= 30 ? 'high' :
                      material.riskCoefficient >= 20 ? 'medium' : 'low'}
                  />
                </div>
                <p className="text-sm text-slate-600">
                  供应商: <button
                    onClick={() => onSupplierClick?.(material.supplierId)}
                    className="text-indigo-600 hover:text-indigo-700 hover:underline font-medium"
                  >
                    {material.supplierName}
                  </button>
                  {' | '}
                  库存量: {material.currentStock.toLocaleString()}
                  {' | '}
                  质量评级: {material.qualityRating}
                  {' | '}
                  风险评级: {material.riskRating}
                  {' | '}
                  准时交付率: {material.onTimeDeliveryRate}%
                  {' | '}
                  年度采购额: ¥{(material.annualPurchaseAmount / 10000).toFixed(0)}万
                </p>
                {material.qualityEvents.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {material.qualityEvents.slice(0, 3).map((event) => (
                      <span
                        key={event.eventId}
                        className={`text-xs px-2 py-0.5 rounded ${event.severity === 'critical' ? 'bg-red-100 text-red-700' :
                          event.severity === 'high' ? 'bg-orange-100 text-orange-700' :
                            event.severity === 'medium' ? 'bg-amber-100 text-amber-700' :
                              'bg-slate-100 text-slate-700'
                          }`}
                      >
                        {event.eventType === 'defect' ? '缺陷' :
                          event.eventType === 'delay' ? '延迟' :
                            event.eventType === 'rejection' ? '拒收' : '投诉'}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => onSwitchSupplier?.(material.materialCode, material.supplierId)}
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



