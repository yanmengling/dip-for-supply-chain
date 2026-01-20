/**
 * SupplierEvaluationPage Component
 * 
 * Main page component combining MainMaterialSupplierPanel and Supplier360Scorecard.
 * Displays both panels side by side (parallel layout).
 * 
 * Principle 1: Types imported from ontology.ts
 * Principle 2: Uses semantic color variables
 * Principle 3: Component < 150 lines
 */

import { useState, useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
import MainMaterialSupplierPanel from './MainMaterialSupplierPanel';
import SupplierComparisonModal from './SupplierComparisonModal';
import Supplier360Scorecard from './Supplier360Scorecard';
import { getMainMaterialsFromSupplierData } from '../../services/materialService';
import { supplier360ScorecardsData } from '../../utils/entityConfigService';


const SupplierEvaluationPage = ({ toggleCopilot }: { toggleCopilot?: () => void } = {}) => {


  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [comparisonModalOpen, setComparisonModalOpen] = useState(false);
  const [comparisonMaterialCode, setComparisonMaterialCode] = useState<string | null>(null);
  const [comparisonSupplierId, setComparisonSupplierId] = useState<string | null>(null);
  const [_sourcingModalOpen, setSourcingModalOpen] = useState(false);

  // Set default supplier on mount or mode change
  useEffect(() => {
    const setDefaultSupplier = async () => {
      // Load supplier data from API
      const materialsData = await getMainMaterialsFromSupplierData();
      const materials = materialsData.slice(0, 5);

      if (materials.length > 0) {
        // 如果已选供应商不在当前列表中（例如切换模式后），则重置为第一个
        const currentSelectedInList = materials.some(m => m.supplierId === selectedSupplierId);

        if (!selectedSupplierId || !currentSelectedInList) {
          const firstSupplierId = materials[0].supplierId;

          if (materials.length > 0) {
            setSelectedSupplierId(materials[0].supplierId);
          }
        }
      }
    };

    setDefaultSupplier();
  }, []);

  const handleSupplierClick = (supplierId: string) => {
    setSelectedSupplierId(supplierId);
  };

  const handleSwitchSupplier = (materialCode: string, supplierId: string) => {
    setComparisonMaterialCode(materialCode);
    setComparisonSupplierId(supplierId);
    setComparisonModalOpen(true);
  };

  const handleConfirmSwitch = (newSupplierId: string) => {
    // Placeholder: In real implementation, would call API to switch supplier
    console.log('Switching supplier:', {
      materialCode: comparisonMaterialCode,
      from: comparisonSupplierId,
      to: newSupplierId,
    });
    // Refresh data after switch
    setComparisonModalOpen(false);
  };

  const handleSourcing = () => {
    setSourcingModalOpen(true);
    // Placeholder: In real implementation, would open sourcing interface
  };

  return (
    <div className="space-y-6">
      {/* Parallel Layout: Main Material Panel and 360° Scorecard */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left: Main Material Supplier Panel */}
        <div>
          <MainMaterialSupplierPanel
            onSupplierClick={handleSupplierClick}
            onSwitchSupplier={handleSwitchSupplier}
          />
        </div>

        {/* Right: Supplier 360° Scorecard */}
        <div>
          <Supplier360Scorecard
            supplierId={selectedSupplierId}
            onSupplierChange={handleSupplierClick}
            onSwitchSupplier={async () => {
              // Find material code for this supplier
              // Load supplier data
              const materialsData = await getMainMaterialsFromSupplierData();
              const materials = materialsData.slice(0, 5);
              const material = materials.find(m => m.supplierId === selectedSupplierId);
              if (material) {
                setComparisonMaterialCode(material.materialCode);
                setComparisonSupplierId(selectedSupplierId || '');
                setComparisonModalOpen(true);
              }
            }}
            onSourcing={handleSourcing}
          />
        </div>
      </div>

      {/* Supplier Comparison Modal */}
      {comparisonModalOpen && comparisonMaterialCode && comparisonSupplierId && (
        <SupplierComparisonModal
          isOpen={comparisonModalOpen}
          onClose={() => setComparisonModalOpen(false)}
          materialCode={comparisonMaterialCode}
          currentSupplierId={comparisonSupplierId}
          onConfirm={handleConfirmSwitch}
        />
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

export default SupplierEvaluationPage;

