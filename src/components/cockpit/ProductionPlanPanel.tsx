/**
 * Production Plan Panel
 * 
 * Displays production efficiency analysis via the ProductionPlanAgent.
 */

import ProductionPlanAgent from '../agents/ProductionPlanAgent';

interface Props {
  onNavigate?: (view: string) => void;
}

const ProductionPlanPanel = ({ onNavigate: _onNavigate }: Props) => {
  // Enforce API Mode (Brain Mode) by using the Agent
  return <ProductionPlanAgent />;
};

export default ProductionPlanPanel;

