/**
 * SupplierComparisonModal Component
 * 
 * Two-step confirmation modal for supplier switching.
 * Step 1: Display comparison table
 * Step 2: Confirmation dialog
 * 
 * Principle 1: Types imported from ontology.ts
 * Principle 2: Uses semantic color variables
 * Principle 3: Component < 150 lines
 */

import { useState, useEffect } from 'react';
import { getSupplierComparison } from '../../services/supplierService';
import type { SupplierComparison } from '../../types/ontology';
import RiskBadge from './RiskBadge';
import { X, Check, AlertTriangle } from 'lucide-react';

interface SupplierComparisonModalProps {
  isOpen: boolean;
  onClose: () => void;
  materialCode: string;
  currentSupplierId: string;
  onConfirm: (newSupplierId: string) => void;
}

const SupplierComparisonModal = ({
  isOpen,
  onClose,
  materialCode,
  currentSupplierId,
  onConfirm,
}: SupplierComparisonModalProps) => {
  const [comparison, setComparison] = useState<SupplierComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && materialCode && currentSupplierId) {
      console.log('SupplierComparisonModal: Loading comparison for', materialCode, currentSupplierId);
      setLoading(true);
      // Use getSupplierComparison directly
      getSupplierComparison(currentSupplierId).then(data => {
        console.log('SupplierComparisonModal: Received comparison data:', data);
        setComparison(data);
        setLoading(false);
        setStep(1);
        setSelectedSupplierId(null);
      }).catch(error => {
        console.error('SupplierComparisonModal: Failed to load supplier comparison:', error);
        setComparison(null);
        setLoading(false);
      });
    }
  }, [isOpen, materialCode, currentSupplierId]);

  if (!isOpen) return null;

  const handleSelectSupplier = (supplierId: string) => {
    setSelectedSupplierId(supplierId);
    setStep(2);
  };

  const handleConfirm = () => {
    if (selectedSupplierId) {
      onConfirm(selectedSupplierId);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
          <h3 className="text-xl font-bold text-slate-800">
            {step === 1 ? '选择备选供应商' : '确认切换供应商'}
          </h3>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-center py-12 text-slate-500">加载中...</div>
          ) : !comparison ? (
            <div className="text-center py-12 text-slate-500">未找到对比数据</div>
          ) : step === 1 ? (
            <>
              <div className="mb-6">
                <div className="text-sm text-slate-500 mb-2">当前供应商</div>
                <div className="bg-slate-50 p-4 rounded-lg">
                  <div className="font-semibold text-slate-800">{comparison.currentSupplier.supplierName}</div>
                  <div className="text-sm text-slate-500 mt-1">
                    {comparison.currentSupplier.materialName} ({comparison.currentSupplier.materialCode})
                  </div>
                  <div className="mt-2">
                    <RiskBadge riskLevel={comparison.currentSupplier.scorecard.riskAssessment.overallRiskLevel} />
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <div className="text-sm text-slate-500 mb-3">备选供应商</div>
                {comparison.alternativeSuppliers.length === 0 ? (
                  <div className="text-center py-8 text-slate-400">
                    <AlertTriangle className="mx-auto mb-2" size={24} />
                    <p>暂无备选供应商</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {comparison.alternativeSuppliers.map((alt) => (
                      <div
                        key={alt.supplierId}
                        className="border border-slate-200 rounded-lg p-4 hover:border-indigo-300 hover:bg-indigo-50 transition-colors cursor-pointer"
                        onClick={() => handleSelectSupplier(alt.supplierId)}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="font-semibold text-slate-800">{alt.supplierName}</div>
                            <div className="text-sm text-slate-500 mt-1">{alt.recommendationReason}</div>
                            <div className="mt-2 flex items-center gap-4 text-xs text-slate-600">
                              <span>相似度: {alt.similarityScore}%</span>
                              <RiskBadge riskLevel={alt.comparison.riskLevel} size="sm" />
                            </div>
                          </div>
                          <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700">
                            选择
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {comparison.affectedOrders.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="text-sm font-semibold text-amber-800 mb-2">受影响订单</div>
                  <div className="text-xs text-amber-700">
                    {comparison.affectedOrders.length} 个订单可能受到影响
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="text-blue-600 mt-0.5" size={20} />
                  <div>
                    <div className="font-semibold text-blue-800 mb-1">确认切换供应商</div>
                    <div className="text-sm text-blue-700">
                      您即将将 {comparison.currentSupplier.materialName} 的供应商从{' '}
                      <strong>{comparison.currentSupplier.supplierName}</strong> 切换为{' '}
                      <strong>
                        {comparison.alternativeSuppliers.find(a => a.supplierId === selectedSupplierId)?.supplierName}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setStep(1)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50"
                >
                  返回
                </button>
                <button
                  onClick={handleConfirm}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
                >
                  <Check size={16} />
                  确认切换
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SupplierComparisonModal;

