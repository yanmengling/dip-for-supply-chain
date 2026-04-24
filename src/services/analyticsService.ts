/**
 * Analytics Service
 * Handles API calls for advanced analytics using new data files
 */

// Forecast service base URL
const FORECAST_BASE_URL = 'http://localhost:8000/api';

interface InventoryAnalysis {
  summary: {
    total_items: number;
    abc_distribution: Record<string, number>;
    avg_holding_cost_rate: number;
    total_inventory_months: number;
  };
  abc_analysis: {
    a_class: { count: number; service_level: number; strategy: string };
    b_class: { count: number; service_level: number; strategy: string };
    c_class: { count: number; service_level: number; strategy: string };
  };
  top_value_items: Array<{
    item_code: string;
    item_name: string;
    abc_classification: string;
    avg_unit_price: number;
    min_order_quantity: number;
  }>;
  monthly_trend: Array<{
    snapshot_month: string;
    total_price: number;
    quantity: number;
  }>;
  recommendations: string[];
}

interface SupplierRanking {
  summary: {
    total_suppliers: number;
    avg_overall_score: number;
    avg_otif_rate: number;
    rating_distribution: Record<string, number>;
  };
  top_suppliers: Array<{
    supplier_id: string;
    supplier_name: string;
    supplier_tier: string;
    overall_score: number;
    supplier_rating: string;
    otif_rate: number;
    quality_score: number;
    delivery_score: number;
    total_orders: number;
    risk_level: string;
  }>;
  recommendations: string[];
}

interface CapacityAnalysis {
  summary: {
    total_lines: number;
    total_theoretical_capacity: number;
    total_actual_capacity: number;
    overall_utilization: number;
    capacity_gap: number;
  };
  production_lines: Array<{
    line_id: string;
    line_name: string;
    line_type: string;
    product_family: string;
    theoretical_capacity: number;
    actual_capacity: number;
    utilization_rate: number;
    equipment_count: number;
    shifts_per_day: number;
    takt_time_minutes: number;
  }>;
  bottlenecks: Array<{
    line_name: string;
    product_family: string;
    actual_daily_capacity: number;
    utilization_rate: number;
  }>;
  underutilized_lines: Array<{
    line_name: string;
    product_family: string;
    actual_daily_capacity: number;
    utilization_rate: number;
  }>;
  recommendations: string[];
}

interface OTIFAnalysis {
  summary: {
    total_orders: number;
    otif_rate: number;
    ontime_orders: number;
    early_orders: number;
    late_orders: number;
    avg_delay_days: number;
  };
  delay_distribution: {
    early: number;
    on_time: number;
    '1-5_days_late': number;
    '6-10_days_late': number;
    over_10_days_late: number;
  };
  top_suppliers: Array<{
    supplier_name: string;
    total_orders: number;
    otif_rate: number;
  }>;
  recommendations: string[];
}

/**
 * Get comprehensive inventory analysis
 */
export async function getInventoryAnalysis(): Promise<InventoryAnalysis> {
  try {
    const response = await fetch(`${FORECAST_BASE_URL}/inventory/analysis`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[AnalyticsService] Inventory analysis failed:', error);
    throw error;
  }
}

/**
 * Get supplier performance ranking
 */
export async function getSupplierRanking(topN: number = 10, minRating?: string): Promise<SupplierRanking> {
  try {
    const params = new URLSearchParams();
    params.append('top_n', topN.toString());
    if (minRating) {
      params.append('min_rating', minRating);
    }

    const response = await fetch(`${FORECAST_BASE_URL}/suppliers/ranking?${params.toString()}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[AnalyticsService] Supplier ranking failed:', error);
    throw error;
  }
}

/**
 * Get production capacity analysis
 */
export async function getCapacityAnalysis(): Promise<CapacityAnalysis> {
  try {
    const response = await fetch(`${FORECAST_BASE_URL}/capacity/analysis`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[AnalyticsService] Capacity analysis failed:', error);
    throw error;
  }
}

/**
 * Get OTIF (On-Time In-Full) analysis
 */
export async function getOTIFAnalysis(): Promise<OTIFAnalysis> {
  try {
    const response = await fetch(`${FORECAST_BASE_URL}/procurement/otif`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('[AnalyticsService] OTIF analysis failed:', error);
    throw error;
  }
}

/**
 * Check API health
 */
export async function checkHealth(): Promise<{ status: string; version: string; timestamp: string }> {
  try {
    const response = await fetch(`${FORECAST_BASE_URL}/health`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return { status: 'unhealthy', version: 'unknown', timestamp: new Date().toISOString() };
    }

    return await response.json();
  } catch (error) {
    console.error('[AnalyticsService] Health check failed:', error);
    return { status: 'unreachable', version: 'unknown', timestamp: new Date().toISOString() };
  }
}

const analyticsService = {
  getInventoryAnalysis,
  getSupplierRanking,
  getCapacityAnalysis,
  getOTIFAnalysis,
  checkHealth,
};

export default analyticsService;
