/**
 * Simulation Service
 *
 * Service layer for interacting with the Supply Chain Forecast API
 * Provides demand forecasting, inventory optimization, and scenario simulation
 */

import { getServiceConfig } from '../config/apiConfig';

// ============================================================================
// Types
// ============================================================================

export interface ForecastDataPoint {
  date: string;
  predicted_demand: number;
  lower_bound?: number;
  upper_bound?: number;
}

export interface ForecastResult {
  product_id: string;
  forecast_data: ForecastDataPoint[];
  model_type: string;
  created_at: string;
}

export interface InventoryOptimizationResult {
  product_id: string;
  safety_stock: number;
  reorder_point: number;
  economic_order_quantity: number;
  abc_category: string;
  recommendations: string[];
}

export interface SimulationRecommendation {
  solution: string;
  service_level_improvement: number;
  cost_increase: number;
  lead_time_reduction: number;
  risk: string;
}

export interface SimulationResult {
  scenario: string;
  baseline_metrics: {
    service_level: number;
    inventory_value: number;
    total_cost: number;
    stockout_risk: string;
    delivery_delay_days: number;
  };
  simulated_metrics: {
    service_level: number;
    inventory_value: number;
    total_cost: number;
    stockout_risk: string;
    delivery_delay_days: number;
  };
  recommendations: SimulationRecommendation[];
  risk_level: string;
}

// ============================================================================
// API Client
// ============================================================================

class SimulationServiceClient {
  private baseUrl: string;
  private enabled: boolean;

  constructor() {
    const config = getServiceConfig('forecast');
    this.baseUrl = config.baseUrl;
    this.enabled = config.enabled ?? true;
  }

  /**
   * Check if the service is available
   */
  async checkHealth(): Promise<boolean> {
    if (!this.enabled) return false;

    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Forecast demand using Prophet algorithm
   */
  async forecastDemand(
    productId: string,
    forecastPeriods: number = 6,
    includeUncertainty: boolean = true
  ): Promise<ForecastResult> {
    const response = await fetch(`${this.baseUrl}/forecast/demand`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: productId,
        forecast_periods: forecastPeriods,
        include_uncertainty: includeUncertainty,
      }),
    });

    if (!response.ok) {
      throw new Error(`Forecast failed: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Optimize inventory parameters
   */
  async optimizeInventory(
    productId: string,
    currentStock: number,
    annualDemand?: number,
    leadTimeDays?: number
  ): Promise<InventoryOptimizationResult> {
    const response = await fetch(`${this.baseUrl}/inventory/optimize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        product_id: productId,
        current_stock: currentStock,
        annual_demand: annualDemand,
        lead_time_days: leadTimeDays,
      }),
    });

    if (!response.ok) {
      throw new Error(`Optimization failed: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Run supply chain simulation
   */
  async runSimulation(
    scenarioType: 'demand_increase' | 'supply_delay' | 'production_halt',
    impactPercentage?: number,
    durationWeeks: number = 4,
    affectedProducts: string[] = []
  ): Promise<SimulationResult> {
    const response = await fetch(`${this.baseUrl}/simulation/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        scenario_type: scenarioType,
        impact_percentage: impactPercentage,
        duration_weeks: durationWeeks,
        affected_products: affectedProducts,
      }),
    });

    if (!response.ok) {
      throw new Error(`Simulation failed: ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Check for alerts
   */
  async checkAlerts(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/alerts/check`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Alert check failed: ${response.statusText}`);
    }

    return await response.json();
  }
}

// ============================================================================
// Service Instance & Helper Functions
// ============================================================================

const simulationService = new SimulationServiceClient();

/**
 * Map scenario name to API type
 */
function mapScenarioToType(scenarioId: string): 'demand_increase' | 'supply_delay' | 'production_halt' {
  const mapping: Record<string, 'demand_increase' | 'supply_delay' | 'production_halt'> = {
    scenario1: 'demand_increase',
    scenario2: 'supply_delay',
    scenario3: 'production_halt',
  };
  return mapping[scenarioId] || 'demand_increase';
}

/**
 * Run simulation with fallback to mock data
 */
export async function runSimulationWithFallback(
  scenarioId: string,
  impactPercentage: number = 20,
  durationWeeks: number = 4
): Promise<SimulationResult> {
  try {
    // Check if service is available
    const isHealthy = await simulationService.checkHealth();

    if (!isHealthy) {
      console.warn('[SimulationService] API unavailable, using mock data');
      return getMockSimulationResult(scenarioId);
    }

    // Call real API
    const scenarioType = mapScenarioToType(scenarioId);
    return await simulationService.runSimulation(
      scenarioType,
      impactPercentage,
      durationWeeks
    );
  } catch (error) {
    console.error('[SimulationService] API call failed:', error);
    console.warn('[SimulationService] Falling back to mock data');
    return getMockSimulationResult(scenarioId);
  }
}

/**
 * Mock simulation result for fallback
 */
function getMockSimulationResult(scenarioId: string): SimulationResult {
  return {
    scenario: scenarioId,
    baseline_metrics: {
      service_level: 82.4,
      inventory_value: 5200000,
      total_cost: 12500000,
      stockout_risk: 'High',
      delivery_delay_days: 14,
    },
    simulated_metrics: {
      service_level: 72.4,
      inventory_value: 3640000,
      total_cost: 14375000,
      stockout_risk: 'Very High',
      delivery_delay_days: 20,
    },
    recommendations: [
      {
        solution: 'Expedite Procurement',
        service_level_improvement: 12.7,
        cost_increase: 30,
        lead_time_reduction: 7,
        risk: 'Low',
      },
      {
        solution: 'Adjust Production Priority',
        service_level_improvement: 6.2,
        cost_increase: 5,
        lead_time_reduction: 3,
        risk: 'Medium',
      },
      {
        solution: 'Customer Delivery Extension',
        service_level_improvement: 2.6,
        cost_increase: 0,
        lead_time_reduction: -14,
        risk: 'High',
      },
    ],
    risk_level: 'High',
  };
}

export default simulationService;
