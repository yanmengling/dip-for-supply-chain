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
import { loadSupplierList } from '../../services/supplierDataLoader';


const SupplierEvaluationPage = ({ toggleCopilot }: { toggleCopilot?: () => void } = {}) => {


  const [selectedSupplierId, setSelectedSupplierId] = useState<string | null>(null);
  const [comparisonModalOpen, setComparisonModalOpen] = useState(false);
  const [comparisonMaterialCode, setComparisonMaterialCode] = useState<string | null>(null);
  const [comparisonSupplierId, setComparisonSupplierId] = useState<string | null>(null);
  const [_sourcingModalOpen, setSourcingModalOpen] = useState(false);

  // Set default supplier on mount
  useEffect(() => {
    const setDefaultSupplier = async () => {
      const suppliers = await loadSupplierList();
      if (suppliers.length > 0) {
        const currentSelectedInList = suppliers.some(s => s.supplierId === selectedSupplierId);
        if (!selectedSupplierId || !currentSelectedInList) {
          setSelectedSupplierId(suppliers[0].supplierId);
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
              if (selectedSupplierId) {
                setComparisonMaterialCode(selectedSupplierId);
                setComparisonSupplierId(selectedSupplierId);
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

