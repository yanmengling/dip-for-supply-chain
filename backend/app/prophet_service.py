"""
Prophet Forecast Service - Core Prediction Logic

Implements time series forecasting with Prophet-compatible API.
Falls back to Holt-Winters when Prophet/cmdstan unavailable.
"""

import logging
import warnings
from typing import List, Tuple, Optional
from datetime import datetime
import pandas as pd
import numpy as np

from .models import (
    HistoricalDataPoint,
    ProphetParameters,
    ConfidenceInterval,
    ForecastMetrics,
)

logger = logging.getLogger(__name__)

# Check if Prophet with cmdstan is available
PROPHET_AVAILABLE = False
try:
    from prophet import Prophet
    import cmdstanpy
    import os
    # Test if cmdstan is installed and set path explicitly
    cmdstan_path = cmdstanpy.cmdstan_path()
    if cmdstan_path and os.path.exists(cmdstan_path):
        cmdstanpy.set_cmdstan_path(cmdstan_path)
        # 设置环境变量以确保 Prophet 能找到 CmdStan
        os.environ['CMDSTAN'] = cmdstan_path
        os.environ['CMDSTAN_HOME'] = os.path.dirname(cmdstan_path)
        # 强制使用 CMDSTANPY 后端
        os.environ['PROPHET_STAN_BACKEND'] = 'CMDSTANPY'
        PROPHET_AVAILABLE = True
        logger.info(f"Prophet with CmdStan is available at {cmdstan_path}")
    else:
        logger.warning(f"CmdStan path not found: {cmdstan_path}")
except Exception as e:
    logger.warning(f"Prophet/CmdStan not available: {e}. Using Holt-Winters fallback.")


class ProphetForecastService:
    """Service class for Prophet-based demand forecasting."""

    def __init__(self):
        """Initialize the Prophet forecast service."""
        self.default_params = ProphetParameters()
        self.use_prophet = PROPHET_AVAILABLE

    def prepare_data(self, historical_data: List[HistoricalDataPoint]) -> pd.DataFrame:
        """
        Convert historical data to Prophet-compatible DataFrame.

        Prophet requires columns named 'ds' (datestamp) and 'y' (value).
        """
        data = []
        for point in historical_data:
            # Parse month string (YYYY-MM format) to datetime
            try:
                # Add day 01 to make it a valid date
                date = datetime.strptime(f"{point.month}-01", "%Y-%m-%d")
            except ValueError:
                # Try alternative format
                date = datetime.strptime(point.month, "%Y-%m")

            data.append({
                'ds': date,
                'y': float(point.quantity)
            })

        df = pd.DataFrame(data)
        df = df.sort_values('ds').reset_index(drop=True)

        return df

    def forecast(
        self,
        historical_data: List[HistoricalDataPoint],
        forecast_periods: int,
        parameters: Optional[ProphetParameters] = None
    ) -> Tuple[List[float], List[ConfidenceInterval], Optional[ForecastMetrics]]:
        """
        Generate Prophet forecast.

        Args:
            historical_data: List of historical data points
            forecast_periods: Number of periods to forecast
            parameters: Optional Prophet parameters

        Returns:
            Tuple of (forecast_values, confidence_intervals, metrics)
        """
        params = parameters or self.default_params

        logger.info(f"Starting forecast with {len(historical_data)} historical points")
        logger.info(f"Parameters: seasonality_mode={params.seasonality_mode}, "
                   f"yearly={params.yearly_seasonality}, growth={params.growth}")

        # Prepare data
        df = self.prepare_data(historical_data)

        if len(df) < 2:
            raise ValueError("At least 2 historical data points are required")

        if self.use_prophet:
            return self._forecast_prophet(df, forecast_periods, params)
        else:
            return self._forecast_holt_winters(df, forecast_periods, params)

    def _forecast_prophet(
        self,
        df: pd.DataFrame,
        forecast_periods: int,
        params: ProphetParameters
    ) -> Tuple[List[float], List[ConfidenceInterval], Optional[ForecastMetrics]]:
        """Use actual Prophet for forecasting."""
        from prophet import Prophet
        import cmdstanpy
        import os
        
        # 显式设置 CmdStan 路径（如果已安装）
        cmdstan_path = cmdstanpy.cmdstan_path()
        if cmdstan_path and os.path.exists(cmdstan_path):
            cmdstanpy.set_cmdstan_path(cmdstan_path)
            # 设置环境变量以确保 Prophet 能找到 CmdStan
            # 注意：必须设置为 cmdstan 的实际安装路径，而不是包含版本号的子目录
            os.environ['CMDSTAN'] = cmdstan_path
            os.environ['CMDSTAN_HOME'] = os.path.dirname(cmdstan_path)
            # 强制 Prophet 使用 CMDSTANPY 后端，而不是查找内部路径
            os.environ['PROPHET_STAN_BACKEND'] = 'CMDSTANPY'
        
        cmdstanpy.utils.get_logger().setLevel(logging.WARNING)

        # 创建 Prophet 实例
        # 显式指定 stan_backend='CMDSTANPY'，并确保在设置之前 cmdstanpy 已正确配置
        # 必须在设置环境变量和 cmdstan 路径之后才能创建 Prophet 实例
        try:
            # 再次确认 cmdstan 路径（在运行时可能不同）
            current_cmdstan_path = cmdstanpy.cmdstan_path()
            if current_cmdstan_path and os.path.exists(current_cmdstan_path):
                cmdstanpy.set_cmdstan_path(current_cmdstan_path)
                os.environ['CMDSTAN'] = current_cmdstan_path
                os.environ['CMDSTAN_HOME'] = os.path.dirname(current_cmdstan_path)
            
            model = Prophet(
                stan_backend='CMDSTANPY',
                growth=params.growth,
                seasonality_mode=params.seasonality_mode,
                yearly_seasonality=params.yearly_seasonality,
                weekly_seasonality=params.weekly_seasonality,
                changepoint_prior_scale=params.changepoint_prior_scale,
                seasonality_prior_scale=params.seasonality_prior_scale,
                interval_width=params.interval_width,
            )
        except (ValueError, AttributeError) as e:
            # 如果遇到 cmdstan 路径验证错误，记录警告并重新抛出
            # 让上层调用者处理（可能会降级到 Holt-Winters）
            logger.error(f"Prophet initialization failed: {e}")
            logger.error("This may be due to CmdStan version mismatch. Please ensure CmdStan is properly installed.")
            raise

        model.fit(df)
        future = model.make_future_dataframe(periods=forecast_periods, freq='MS')
        forecast = model.predict(future)

        future_forecast = forecast.tail(forecast_periods)
        forecast_values = [max(0, round(v)) for v in future_forecast['yhat'].tolist()]

        confidence_intervals = [
            ConfidenceInterval(
                lower=max(0, round(row['yhat_lower'])),
                upper=max(0, round(row['yhat_upper']))
            )
            for _, row in future_forecast.iterrows()
        ]

        metrics = self._calculate_metrics(df['y'].values, forecast.head(len(df))['yhat'].values)
        logger.info(f"Prophet forecast generated: {forecast_values}")

        return forecast_values, confidence_intervals, metrics

    def _forecast_holt_winters(
        self,
        df: pd.DataFrame,
        forecast_periods: int,
        params: ProphetParameters
    ) -> Tuple[List[float], List[ConfidenceInterval], Optional[ForecastMetrics]]:
        """
        Holt-Winters fallback when Prophet is unavailable.
        Uses parameters in a compatible way.
        """
        logger.info("Using Holt-Winters fallback (Prophet/CmdStan not available)")

        values = df['y'].values
        n = len(values)

        # Determine seasonality settings based on Prophet params
        seasonal = 'add' if params.seasonality_mode == 'additive' else 'mul'

        # Season length: use 12 for yearly seasonality with monthly data
        season_length = 12 if params.yearly_seasonality else 1

        # Map Prophet parameters to Holt-Winters coefficients
        # changepoint_prior_scale maps to trend sensitivity
        alpha = min(0.8, 0.2 + params.changepoint_prior_scale)
        beta = 0.1
        gamma = 0.2

        # If not enough data for seasonality, use simpler model
        if n < season_length:
            return self._forecast_simple_exponential(values, forecast_periods, alpha, params.interval_width)

        # Initialize Holt-Winters
        # Level
        level = np.mean(values[:season_length])

        # Trend (linear)
        if params.growth == 'flat':
            trend = 0
        else:
            # Need more than one season to calculate trend from seasonal means
            if n > season_length:
                trend = (np.mean(values[season_length:min(2*season_length, n)]) -
                        np.mean(values[:season_length])) / season_length
            else:
                # Use simple linear regression for trend
                trend = (values[-1] - values[0]) / max(1, n - 1)

        # Seasonal components
        seasonal_factors = []
        for i in range(season_length):
            seasonal_indices = list(range(i, n, season_length))
            if seasonal_indices:
                seasonal_factors.append(np.mean([values[j] for j in seasonal_indices]) / level if level > 0 else 1)
            else:
                seasonal_factors.append(1.0)

        # Normalize seasonal factors
        avg_seasonal = np.mean(seasonal_factors)
        if avg_seasonal > 0:
            seasonal_factors = [s / avg_seasonal for s in seasonal_factors]

        # Apply Holt-Winters to historical data
        fitted_values = []
        for i in range(n):
            season_idx = i % season_length
            if seasonal == 'mul':
                fitted = (level + trend) * seasonal_factors[season_idx]
            else:
                fitted = level + trend + seasonal_factors[season_idx]
            fitted_values.append(fitted)

            # Update components
            prev_level = level
            if seasonal == 'mul' and seasonal_factors[season_idx] > 0:
                level = alpha * (values[i] / seasonal_factors[season_idx]) + (1 - alpha) * (level + trend)
            else:
                level = alpha * (values[i] - seasonal_factors[season_idx]) + (1 - alpha) * (level + trend)

            trend = beta * (level - prev_level) + (1 - beta) * trend

            if seasonal == 'mul' and level > 0:
                seasonal_factors[season_idx] = gamma * (values[i] / level) + (1 - gamma) * seasonal_factors[season_idx]
            else:
                seasonal_factors[season_idx] = gamma * (values[i] - level) + (1 - gamma) * seasonal_factors[season_idx]

        # Generate forecasts
        forecast_values = []
        for i in range(forecast_periods):
            season_idx = (n + i) % season_length
            if seasonal == 'mul':
                fc = (level + trend * (i + 1)) * seasonal_factors[season_idx]
            else:
                fc = level + trend * (i + 1) + seasonal_factors[season_idx]
            # Handle NaN/Inf values
            if np.isnan(fc) or np.isinf(fc):
                fc = level  # fallback to current level
            forecast_values.append(max(0, int(round(fc))))

        # Calculate confidence intervals
        # Use interval_width parameter
        residuals = np.array(values) - np.array(fitted_values)
        std_error = np.std(residuals) if len(residuals) > 1 else 0

        # Z-score for confidence interval using normal distribution approximation
        # interval_width 0.95 -> z = 1.96
        z_map = {0.50: 0.674, 0.68: 1.0, 0.80: 1.28, 0.90: 1.645, 0.95: 1.96, 0.99: 2.576}
        z_score = z_map.get(params.interval_width, 1.96)

        confidence_intervals = []
        for i, fc in enumerate(forecast_values):
            # Increase uncertainty with forecast horizon
            horizon_factor = np.sqrt(i + 1)
            margin = z_score * std_error * horizon_factor
            lower_val = fc - margin
            upper_val = fc + margin
            # Handle NaN values
            if np.isnan(lower_val):
                lower_val = fc * 0.8
            if np.isnan(upper_val):
                upper_val = fc * 1.2
            confidence_intervals.append(ConfidenceInterval(
                lower=max(0, int(round(lower_val))),
                upper=max(0, int(round(upper_val)))
            ))

        # Calculate metrics
        metrics = self._calculate_metrics(values, np.array(fitted_values))
        logger.info(f"Holt-Winters forecast generated: {forecast_values}")

        return forecast_values, confidence_intervals, metrics

    def _forecast_simple_exponential(
        self,
        values: np.ndarray,
        forecast_periods: int,
        alpha: float,
        interval_width: float
    ) -> Tuple[List[float], List[ConfidenceInterval], Optional[ForecastMetrics]]:
        """Simple exponential smoothing for short series."""
        n = len(values)

        # Initialize
        level = values[0]
        fitted_values = [level]

        # Fit
        for i in range(1, n):
            level = alpha * values[i] + (1 - alpha) * level
            fitted_values.append(level)

        # Forecast (constant for simple exponential)
        final_level = level if not np.isnan(level) else np.mean(values)
        forecast_values = [max(0, int(round(final_level))) for _ in range(forecast_periods)]

        # Confidence intervals
        residuals = values - np.array(fitted_values)
        std_error = np.std(residuals) if len(residuals) > 1 else 0

        z_map = {0.50: 0.674, 0.68: 1.0, 0.80: 1.28, 0.90: 1.645, 0.95: 1.96, 0.99: 2.576}
        z_score = z_map.get(interval_width, 1.96)

        confidence_intervals = []
        for i, fc in enumerate(forecast_values):
            horizon_factor = np.sqrt(i + 1)
            margin = z_score * std_error * horizon_factor
            lower_val = fc - margin if not np.isnan(margin) else fc * 0.8
            upper_val = fc + margin if not np.isnan(margin) else fc * 1.2
            confidence_intervals.append(ConfidenceInterval(
                lower=max(0, int(round(lower_val))),
                upper=max(0, int(round(upper_val)))
            ))

        metrics = self._calculate_metrics(values, np.array(fitted_values))
        return forecast_values, confidence_intervals, metrics

    def _calculate_metrics(
        self,
        y_true: np.ndarray,
        y_pred: np.ndarray
    ) -> ForecastMetrics:
        """Calculate forecast accuracy metrics."""
        y_true = np.array(y_true)
        y_pred = np.array(y_pred)[:len(y_true)]

        # Mean Absolute Error
        mae = float(np.mean(np.abs(y_true - y_pred)))

        # Root Mean Square Error
        rmse = float(np.sqrt(np.mean((y_true - y_pred) ** 2)))

        # Mean Absolute Percentage Error (avoid division by zero)
        non_zero_mask = y_true != 0
        if np.any(non_zero_mask):
            mape = float(np.mean(np.abs((y_true[non_zero_mask] - y_pred[non_zero_mask]) / y_true[non_zero_mask])) * 100)
        else:
            mape = None

        return ForecastMetrics(mape=mape, rmse=rmse, mae=mae)


# Global service instance
prophet_service = ProphetForecastService()
