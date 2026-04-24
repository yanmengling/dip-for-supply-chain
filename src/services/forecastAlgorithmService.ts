/**
 * Forecast Algorithm Service
 * 
 * Frontend implementation of exponential smoothing algorithms for demand forecasting.
 * These algorithms can also be implemented on the backend via API calls.
 */

import type { ProductSalesHistory } from '../types/ontology';

/**
 * Algorithm parameters interface
 */
export interface SmoothingParams {
  alpha?: number;      // Level smoothing coefficient (0.01-1.0)
  beta?: number;       // Trend smoothing coefficient (0.01-1.0)
  gamma?: number;      // Seasonal smoothing coefficient (0.01-1.0)
  seasonLength?: number; // Season length in periods (default 12)
}

/**
 * Prophet-specific parameters interface
 * Separate from SmoothingParams as Prophet uses a different parameter model
 */
export interface ProphetParams {
  // Seasonality configuration
  seasonalityMode: 'additive' | 'multiplicative';  // How seasonality combines with trend
  yearlySeasonality: boolean;                       // Enable yearly seasonal component
  weeklySeasonality?: boolean;                      // Enable weekly seasonal component (for daily data)

  // Changepoint detection - controls trend flexibility
  changepointPriorScale: number;                    // Range: 0.001-0.5, higher = more flexible trend

  // Seasonality prior - controls seasonality flexibility
  seasonalityPriorScale?: number;                   // Range: 0.01-10, higher = more flexible seasonality

  // Confidence intervals
  intervalWidth: number;                            // Range: 0.5-0.99, probability coverage of intervals

  // Growth model
  growth?: 'linear' | 'logistic' | 'flat';         // Trend growth model
}

/**
 * Simple Exponential Smoothing
 *
 * Formula: F(t+1) = α * Y(t) + (1 - α) * F(t)
 * where α is the smoothing parameter (typically 0.1 to 0.3)
 *
 * @param history Historical sales data
 * @param periods Number of periods to forecast
 * @param params Optional parameters { alpha }
 * @returns Array of forecasted values
 */
export function simpleExponentialSmoothing(
  history: ProductSalesHistory[],
  periods: number = 13,
  params?: SmoothingParams
): number[] {
  if (history.length === 0) {
    return new Array(periods).fill(0);
  }

  // Sort history by month
  const sortedHistory = [...history].sort((a, b) => a.month.localeCompare(b.month));
  const values = sortedHistory.map((h) => h.quantity);

  // Smoothing parameter (alpha) - use provided or default to 0.2
  const alpha = params?.alpha ?? 0.2;

  // Initialize forecast array
  const forecasts: number[] = [];

  // Calculate initial forecast (use average of first few values)
  let lastForecast = values.length > 0 ? values[0] : 0;
  if (values.length > 1) {
    lastForecast = values.slice(0, Math.min(3, values.length)).reduce((a, b) => a + b, 0) / Math.min(3, values.length);
  }

  // Apply exponential smoothing to historical data
  for (let i = 0; i < values.length; i++) {
    lastForecast = alpha * values[i] + (1 - alpha) * lastForecast;
  }

  // Generate forecasts for future periods
  for (let i = 0; i < periods; i++) {
    forecasts.push(lastForecast);
    // For future periods, forecast remains constant (simple exponential smoothing)
  }

  return forecasts;
}

/**
 * Holt Linear Exponential Smoothing
 *
 * Handles data with trend but no seasonality.
 * Uses two smoothing parameters: α (level) and β (trend)
 *
 * @param history Historical sales data
 * @param periods Number of periods to forecast
 * @param params Optional parameters { alpha, beta }
 * @returns Array of forecasted values
 */
export function holtLinearSmoothing(
  history: ProductSalesHistory[],
  periods: number = 13,
  params?: SmoothingParams
): number[] {
  if (history.length === 0) {
    return new Array(periods).fill(0);
  }

  // Sort history by month
  const sortedHistory = [...history].sort((a, b) => a.month.localeCompare(b.month));
  const values = sortedHistory.map((h) => h.quantity);

  // Smoothing parameters - use provided or defaults
  const alpha = params?.alpha ?? 0.3; // Level smoothing
  const beta = params?.beta ?? 0.1;   // Trend smoothing

  // Initialize level and trend
  let level = values.length > 0 ? values[0] : 0;
  let trend = values.length > 1 ? values[1] - values[0] : 0;

  // Apply Holt's method to historical data
  for (let i = 1; i < values.length; i++) {
    const prevLevel = level;
    level = alpha * values[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }

  // Generate forecasts for future periods
  const forecasts: number[] = [];
  for (let i = 0; i < periods; i++) {
    forecasts.push(level + trend * (i + 1));
  }

  return forecasts;
}

/**
 * Holt-Winters Triple Exponential Smoothing
 *
 * Handles data with both trend and seasonality.
 * Uses three smoothing parameters: α (level), β (trend), γ (seasonal)
 *
 * @param history Historical sales data
 * @param periods Number of periods to forecast
 * @param params Optional parameters { alpha, beta, gamma, seasonLength }
 * @returns Array of forecasted values
 */
export function holtWintersSmoothing(
  history: ProductSalesHistory[],
  periods: number = 13,
  params?: SmoothingParams
): number[] {
  if (history.length === 0) {
    return new Array(periods).fill(0);
  }

  // Sort history by month
  const sortedHistory = [...history].sort((a, b) => a.month.localeCompare(b.month));
  const values = sortedHistory.map((h) => h.quantity);

  // Season length - use provided or default to 12
  const seasonLength = params?.seasonLength ?? 12;

  // Need at least 1 season of data for proper initialization
  // (Ideally 2 seasons for better accuracy, but 1 season is acceptable)
  if (values.length < seasonLength) {
    // Fallback to Holt Linear if insufficient data
    return holtLinearSmoothing(history, periods, params);
  }

  // Smoothing parameters - use provided or defaults
  const alpha = params?.alpha ?? 0.3; // Level smoothing
  const beta = params?.beta ?? 0.1;   // Trend smoothing
  const gamma = params?.gamma ?? 0.2; // Seasonal smoothing

  // Initialize seasonal components
  const seasonal: number[] = [];
  for (let i = 0; i < seasonLength; i++) {
    // Use average of corresponding seasonal periods
    let sum = 0;
    let count = 0;
    for (let j = i; j < values.length; j += seasonLength) {
      sum += values[j];
      count++;
    }
    // Ensure seasonal value is never 0 to avoid division by zero
    seasonal[i] = count > 0 && sum > 0 ? sum / count : 1;
  }

  // Normalize seasonal components
  const avgSeasonal = seasonal.reduce((a, b) => a + b, 0) / seasonLength;
  // Protect against division by zero
  if (avgSeasonal > 0) {
    for (let i = 0; i < seasonLength; i++) {
      seasonal[i] /= avgSeasonal;
      // Ensure seasonal factor is never 0
      if (seasonal[i] === 0) seasonal[i] = 1;
    }
  }

  // Initialize level and trend
  let level = values[0] / seasonal[0];
  let trend = 0;

  // Calculate initial trend: use difference between last and first values
  // divided by the number of periods between them
  if (values.length > 1) {
    const lastIdx = values.length - 1;
    const firstSeasonalAdjusted = values[0] / seasonal[0];
    const lastSeasonalAdjusted = values[lastIdx] / seasonal[lastIdx % seasonLength];
    trend = (lastSeasonalAdjusted - firstSeasonalAdjusted) / lastIdx;
  }

  // Apply Holt-Winters method to historical data
  for (let i = 1; i < values.length; i++) {
    const prevLevel = level;
    const seasonalIndex = i % seasonLength;
    const seasonalFactor = seasonal[seasonalIndex] || 1; // Protect against 0
    const levelFactor = level || 1; // Protect against 0

    level = alpha * (values[i] / seasonalFactor) + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
    seasonal[seasonalIndex] = gamma * (values[i] / levelFactor) + (1 - gamma) * seasonalFactor;

    // Ensure values stay valid
    if (!isFinite(level) || isNaN(level)) level = prevLevel;
    if (!isFinite(trend) || isNaN(trend)) trend = 0;
    if (!isFinite(seasonal[seasonalIndex]) || isNaN(seasonal[seasonalIndex])) {
      seasonal[seasonalIndex] = 1;
    }
  }

  // Generate forecasts for future periods
  const forecasts: number[] = [];
  for (let i = 0; i < periods; i++) {
    const seasonalIndex = (values.length + i) % seasonLength;
    const forecastValue = (level + trend * (i + 1)) * seasonal[seasonalIndex];
    // Ensure forecast is valid
    forecasts.push(isFinite(forecastValue) && !isNaN(forecastValue) ? forecastValue : 0);
  }

  return forecasts;
}

