/**
 * Demand Planning Panel Component
 * 
 * Full implementation of demand planning panel with product selection,
 * algorithm selection, forecast generation, and result display.
 * Supports multi-product multi-algorithm forecasts.
 */

import { useState, useEffect } from 'react';
import type { PlanningPanelProps } from '../../types/ontology';
import type { DemandPlanningState, ForecastAlgorithm, ProductOption, ProductDemandForecast } from '../../types/ontology';
import { demandPlanningService } from '../../services/demandPlanningService';
import AlgorithmSelector from './AlgorithmSelector';
import ProductForecastSection from './ProductForecastSection';
import { AlgorithmParameterPanel, DEFAULT_PARAMETERS, type AlgorithmParameters } from '../product-supply-optimization/AlgorithmParameterPanel';

const DemandPlanningPanel = ({ active }: PlanningPanelProps) => {
  const [state, setState] = useState<DemandPlanningState>({
    selectedProduct: null,
    selectedAlgorithm: 'prophet',
    productForecasts: new Map<string, ProductDemandForecast>(),
    loading: false,
    error: null,
  });

  const [products, setProducts] = useState<ProductOption[]>([]);
  const [productsLoading, setProductsLoading] = useState<boolean>(true);
  const [productsError, setProductsError] = useState<string | null>(null);
  
  // Algorithm parameters state management (FR-010.4, FR-010.5)
  const [algorithmParameters, setAlgorithmParameters] = useState<AlgorithmParameters>(
    DEFAULT_PARAMETERS[state.selectedAlgorithm as 'prophet' | 'simple_exponential' | 'holt_linear' | 'holt_winters']
  );

  // Fetch product list on mount to get product names
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setProductsLoading(true);
        setProductsError(null);
        const productList = await demandPlanningService.getProductList();
        setProducts(productList);
        
        // 如果产品列表加载成功且当前没有选中产品，自动选择第一个产品
        if (productList.length > 0 && !state.selectedProduct) {
          handleProductSelectionChange(productList[0].id);
        }
      } catch (err) {
        console.error('Error fetching products:', err);
        setProductsError(err instanceof Error ? err.message : '加载产品列表失败');
      } finally {
        setProductsLoading(false);
      }
    };

    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 只在组件挂载时执行一次

  // Get product name by ID
  const getProductName = (productId: string): string => {
    const product = products.find(p => p.id === productId);
    return product?.displayName || productId;
  };

  // Handle product selection change
  const handleProductSelectionChange = (productId: string | null) => {
    setState((prev) => ({
      ...prev,
      selectedProduct: productId,
      error: null,
    }));
  };

  // Handle algorithm selection change
  const handleAlgorithmChange = (algorithm: ForecastAlgorithm) => {
    setState((prev) => ({
      ...prev,
      selectedAlgorithm: algorithm,
      error: null,
    }));
    // Reset algorithm parameters to defaults when algorithm changes (FR-010.4)
    const supportedAlgorithms: Array<'prophet' | 'simple_exponential' | 'holt_linear' | 'holt_winters'> = 
      ['prophet', 'simple_exponential', 'holt_linear', 'holt_winters'];
    if (supportedAlgorithms.includes(algorithm as any)) {
      setAlgorithmParameters(DEFAULT_PARAMETERS[algorithm as 'prophet' | 'simple_exponential' | 'holt_linear' | 'holt_winters']);
    }
  };

  // Handle forecast generation
  const handleGenerateForecast = async () => {
    if (!state.selectedProduct) {
      setState((prev) => ({
        ...prev,
        error: '请选择一个产品',
      }));
      return;
    }

    setState((prev) => ({
      ...prev,
      loading: true,
      error: null,
    }));

    try {
      const productName = getProductName(state.selectedProduct);
      
      // Get existing forecast for this product (if any)
      const existingForecast = state.productForecasts.get(state.selectedProduct);

      // Generate demand plan with algorithm parameters (FR-010.4)
      const updatedForecast = await demandPlanningService.generateDemandPlan(
        state.selectedProduct,
        productName,
        state.selectedAlgorithm,
        existingForecast,
        algorithmParameters
      );

      // Update productForecasts Map
      const newProductForecasts = new Map(state.productForecasts);
      newProductForecasts.set(state.selectedProduct, updatedForecast);

      setState((prev) => ({
        ...prev,
        productForecasts: newProductForecasts,
        loading: false,
        error: null,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : '生成需求计划失败',
      }));
      console.error('Error generating demand plan:', error);
    }
  };

  if (!active) {
    return null;
  }

  return (
    <div className="w-full px-6 py-6 space-y-6">
      {/* Product Selection and Algorithm Selection - Combined Panel */}
      <div className="bg-white rounded-lg shadow-sm p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="w-full space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              选择产品
            </label>
            <select
              value={state.selectedProduct || ''}
              onChange={(e) => handleProductSelectionChange(e.target.value || null)}
              disabled={state.loading || productsLoading}
              className={`w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white text-slate-700 ${
                state.loading || productsLoading ? 'bg-slate-100 cursor-not-allowed' : ''
              }`}
            >
              <option value="">请选择产品</option>
              {products.map(product => (
                <option key={product.id} value={product.id}>
                  {product.displayName || product.id}
                </option>
              ))}
            </select>
            {productsLoading && (
              <p className="text-xs text-slate-500 mt-1">正在加载产品列表...</p>
            )}
            {productsError && (
              <p className="text-xs text-red-600 mt-1">{productsError}</p>
            )}
          </div>

        <AlgorithmSelector
          selectedAlgorithm={state.selectedAlgorithm}
          onAlgorithmChange={handleAlgorithmChange}
        />
        </div>
        
        {/* Algorithm Parameter Panel (FR-010.4) */}
        <div className="mt-4">
          <AlgorithmParameterPanel
            algorithm={state.selectedAlgorithm as 'prophet' | 'simple_exponential' | 'holt_linear' | 'holt_winters'}
            parameters={algorithmParameters}
            onParametersChange={setAlgorithmParameters}
          />
        </div>
      </div>

      {/* Generate Button */}
      <div className="flex items-center gap-4">
        <button
          onClick={handleGenerateForecast}
          disabled={state.loading || !state.selectedProduct}
          className={`px-6 py-2 rounded-md font-medium transition-colors ${
            state.loading || !state.selectedProduct
              ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
              : 'bg-indigo-600 text-white hover:bg-indigo-700'
          }`}
        >
          {state.loading ? '生成中...' : '生成需求计划'}
        </button>

        {state.error && (
          <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">
            {state.error}
          </div>
        )}
      </div>

      {/* Loading State */}
      {state.loading && (
        <div className="flex items-center justify-center py-8">
          <div className="text-slate-500">正在生成需求计划...</div>
        </div>
      )}

      {/* Multi-Product Forecast Results */}
      {state.productForecasts.size > 0 && (
        <div className="mt-6">
          {Array.from(state.productForecasts.values()).map((productForecast) => (
            <ProductForecastSection
              key={productForecast.productId}
              productForecast={productForecast}
              loading={state.loading}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default DemandPlanningPanel;

