/**
 * Demand Planning Service
 *
 * Business logic service for demand planning functionality.
 * Handles product selection, forecast generation, and data aggregation.
 */

import { ontologyApi, type ObjectType, type LogicProperty } from '../api/ontologyApi';
import { dataViewApi } from '../api/dataViewApi';
import { metricModelApi, type MetricQueryRequest, type MetricFilter } from '../api/metricModelApi';
import { httpClient } from '../api/httpClient';
import { getEnvironmentConfig } from '../config/apiConfig';
import {
  simpleExponentialSmoothing,
  holtLinearSmoothing,
  holtWintersSmoothing,
  type SmoothingParams,
} from './forecastAlgorithmService';
import { forecastOperatorService, type ProphetForecastInput } from './forecastOperatorService';
import type {
  ForecastAlgorithm,
  ProductOption,
  ProductSalesHistory,
  AlgorithmForecast,
  ProductDemandForecast,
} from '../types/ontology';

// ============================================================================
// Extended Types for Logic Properties
// ============================================================================

/**
 * Extended Object Type with Logic Properties
 */
type ObjectTypeDetail = ObjectType;

// ============================================================================
// Demand Planning Service Class
// ============================================================================

export class DemandPlanningService {
  /**
   * Resolve product object type definition
   * @param productObjectTypeId Optional product object type ID. If not provided, searches by name pattern.
   * @returns Object type definition with logic properties
   */
  async resolveProductObjectType(productObjectTypeId?: string): Promise<ObjectTypeDetail> {
    try {
      if (productObjectTypeId) {
        console.log(`[DemandPlanningService] Resolving product object type by ID: ${productObjectTypeId}`);
        // Explicitly pass includeDetail=true to ensure logic_properties are included
        const objectType = await ontologyApi.getObjectType(productObjectTypeId, true);
        
        // Validate response
        if (!objectType || !objectType.id) {
          throw new Error(`Invalid object type response: ${JSON.stringify(objectType)}`);
        }
        
        console.log(`[DemandPlanningService] Retrieved object type: ${objectType.id} (${objectType.name || 'unnamed'})`);
        console.log(`[DemandPlanningService] Object type has ${objectType.logic_properties?.length || 0} logic properties`);
        
        if (objectType.logic_properties && objectType.logic_properties.length > 0) {
          console.log(`[DemandPlanningService] Logic properties:`, 
            objectType.logic_properties.map(p => p.name));
        } else {
          console.warn(`[DemandPlanningService] WARNING: No logic_properties in response. Object type keys:`, Object.keys(objectType));
        }
        
        return objectType as ObjectTypeDetail;
      }

      console.log('[DemandPlanningService] Searching for product object type...');
      
      // Strategy 1: Get all object types and search for exact match "产品" or "product"
      let response = await ontologyApi.getObjectTypes({
        limit: 1000,
      });

      console.log(`[DemandPlanningService] Found ${response.entries.length} total object types`);
      console.log(`[DemandPlanningService] Available object types:`, response.entries.map(t => ({ id: t.id, name: t.name })));

      // Filter out data_view types and find product type
      let productType: any = null;
      let productTypeWithLogicProps: any = null;
      let productTypeExactMatch: any = null; // Exact match for "产品" or "product"

      for (const candidate of response.entries) {
        const name = candidate.name || '';
        const nameLower = name.toLowerCase();
        const id = candidate.id?.toLowerCase() || '';
        const comment = candidate.comment?.toLowerCase() || '';
        
        // Check if this is a product-related type
        const isProductRelated = 
          nameLower === '产品' || nameLower === 'product' ||
          nameLower.includes('产品') || nameLower.includes('product') ||
          id.includes('product') ||
          comment.includes('product') || comment.includes('产品');

        if (!isProductRelated) {
          continue;
        }

        console.log(`[DemandPlanningService] Found candidate: ${name} (${candidate.id})`);

        // Get full details to check for logic_properties
        try {
          const fullDetails = await ontologyApi.getObjectType(candidate.id, true);
          
          // Check if this is a data_view type
          // Note: data_source may exist in API response but not in type definition
          const dataSource = (fullDetails as any).data_source;
          const isDataView = dataSource?.type === 'data_view';
          
          if (isDataView) {
            console.log(`[DemandPlanningService] Found data_view type: ${fullDetails.name} (${fullDetails.id})`);
            // Don't skip data_view types completely, but prefer non-data_view types
            // Only use data_view as last resort if no other match found
          }

          // Check for exact match first (highest priority)
          if (nameLower === '产品' || nameLower === 'product') {
            console.log(`[DemandPlanningService] Found exact match: ${fullDetails.name} (${fullDetails.id}), isDataView: ${isDataView}`);
            if (!productTypeExactMatch) {
              productTypeExactMatch = fullDetails;
            } else if (!isDataView && (productTypeExactMatch as any).data_source?.type === 'data_view') {
              // Prefer non-data_view exact match
              productTypeExactMatch = fullDetails;
            }
          }

          // Prefer types with logic_properties, especially product_sales_history
          if (fullDetails.logic_properties && fullDetails.logic_properties.length > 0) {
            const hasProductSalesHistory = fullDetails.logic_properties.some(
              (lp: any) => lp.name === 'product_sales_history'
            );
            
            if (hasProductSalesHistory) {
              console.log(`[DemandPlanningService] Found product type with product_sales_history: ${fullDetails.name} (${fullDetails.id})`);
              return fullDetails as ObjectTypeDetail;
            }
            
            // Remember this as a candidate with logic_properties
            if (!productTypeWithLogicProps) {
              productTypeWithLogicProps = fullDetails;
            } else if (!isDataView && (productTypeWithLogicProps as any).data_source?.type === 'data_view') {
              // Prefer non-data_view type with logic_properties
              productTypeWithLogicProps = fullDetails;
            }
          }

          // Remember first matching product type (prefer non-data_view)
          if (!productType) {
            productType = fullDetails;
          } else if (!isDataView && (productType as any).data_source?.type === 'data_view') {
            // Prefer non-data_view type
            productType = fullDetails;
          }
        } catch (err) {
          console.warn(`[DemandPlanningService] Failed to get details for ${candidate.id}:`, err);
          continue;
        }
      }

      // Select the best match: exact match > with logic_properties > any match
      const selectedType = productTypeExactMatch || productTypeWithLogicProps || productType;

      if (!selectedType) {
        const allTypeNames = response.entries.map(t => t.name).join(', ');
        const errorMsg = `Product object type not found. Searched ${response.entries.length} object types. Available types: ${allTypeNames}`;
        console.error('[DemandPlanningService]', errorMsg);
        console.error('[DemandPlanningService] Debug info:', {
          productTypeFound: !!productType,
          productTypeWithLogicPropsFound: !!productTypeWithLogicProps,
          productTypeExactMatchFound: !!productTypeExactMatch,
          totalSearched: response.entries.length,
        });
        throw new Error(errorMsg);
      }

      console.log(`[DemandPlanningService] Found product object type: ${selectedType.id} (${selectedType.name || 'unnamed'})`);

      // Use the already fetched full details
      const fullDetails = selectedType;
      
      // Validate response
      if (!fullDetails || !fullDetails.id) {
        console.error(`[DemandPlanningService] Invalid getObjectType response:`, fullDetails);
        throw new Error(`Failed to get object type details. Response: ${JSON.stringify(fullDetails)}`);
      }
      
      console.log(`[DemandPlanningService] Retrieved full details: ${fullDetails.id} (${fullDetails.name || 'unnamed'})`);
      console.log(`[DemandPlanningService] Retrieved full details with ${fullDetails.logic_properties?.length || 0} logic properties`);
      
      if (fullDetails.logic_properties && fullDetails.logic_properties.length > 0) {
        console.log(`[DemandPlanningService] Logic properties found:`, 
          fullDetails.logic_properties.map((p: LogicProperty) => ({ name: p.name, type: p.type, data_source: p.data_source })));
      } else {
        console.warn(`[DemandPlanningService] WARNING: No logic_properties found in object type ${fullDetails.id}.`);
        console.warn(`[DemandPlanningService] Full details keys:`, Object.keys(fullDetails));
        console.warn(`[DemandPlanningService] Full details (first 1000 chars):`, JSON.stringify(fullDetails, null, 2).substring(0, 1000));
      }
      
      return fullDetails as ObjectTypeDetail;
    } catch (error) {
      console.error('[DemandPlanningService] Error resolving product object type:', error);
      console.error('[DemandPlanningService] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
      if (error instanceof Error) {
        throw error;
      }
      throw new Error(`Failed to resolve product object type: ${String(error)}`);
    }
  }

  /**
   * Resolve logic property from object type definition
   * @param objectType Object type definition
   * @param propertyName Logic property name (e.g., 'product_sales_history')
   * @returns Logic property configuration or null if not found
   */
  resolveLogicProperty(
    objectType: ObjectTypeDetail,
    propertyName: string
  ): LogicProperty | null {
    console.log(`[DemandPlanningService] Resolving logic property: ${propertyName}`);
    console.log(`[DemandPlanningService] Object type: ${objectType.id} (${objectType.name})`);
    
    if (!objectType.logic_properties || objectType.logic_properties.length === 0) {
      console.warn(`[DemandPlanningService] No logic_properties found in object type ${objectType.id}. Available fields:`, Object.keys(objectType));
      console.warn(`[DemandPlanningService] Object type details:`, {
        id: objectType.id,
        name: objectType.name,
        hasLogicProperties: !!objectType.logic_properties,
        logicPropertiesLength: objectType.logic_properties?.length || 0,
      });
      return null;
    }

    console.log(`[DemandPlanningService] Found ${objectType.logic_properties.length} logic properties:`, 
      objectType.logic_properties.map(p => p.name));

    const logicProperty = objectType.logic_properties.find(
      (prop) => prop.name === propertyName
    );

    if (!logicProperty) {
      console.warn(`[DemandPlanningService] Logic property '${propertyName}' not found. Available properties:`, 
        objectType.logic_properties.map(p => p.name));
    } else {
      console.log(`[DemandPlanningService] Found logic property '${propertyName}':`, logicProperty);
    }

    return logicProperty || null;
  }

  /**
   * Fetch product sales history directly (past 12 months)
   * This is a convenience method for components that need raw historical data
   * @param productId Product ID (product_code)
   * @returns Array of ProductSalesHistory sorted by month
   */
  async fetchProductSalesHistory(productId: string): Promise<ProductSalesHistory[]> {
    console.log(`[DemandPlanningService] fetchProductSalesHistory for product: ${productId}`);

    // Resolve product object type
    const productObjectType = await this.resolveProductObjectType();
    if (!productObjectType || !productObjectType.id) {
      console.error('[DemandPlanningService] Failed to resolve product object type');
      return [];
    }

    // Resolve product_sales_history logic property
    const logicProperty = this.resolveLogicProperty(productObjectType, 'product_sales_history');
    if (!logicProperty) {
      console.error('[DemandPlanningService] product_sales_history logic property not found');
      return [];
    }

    // Calculate time range: past 12 months
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth(); // 0-indexed

    // End: last day of last month
    const endDate = new Date(currentYear, currentMonth, 0);
    const end = endDate.getTime();

    // Start: 12 months before current month
    const startDate = new Date(currentYear, currentMonth - 12, 1);
    const start = startDate.getTime();

    console.log(`[DemandPlanningService] Fetching history from ${new Date(start).toISOString()} to ${new Date(end).toISOString()}`);

    // Fetch historical data
    const history = await this.fetchLogicPropertyData(productObjectType, logicProperty, productId, {
      instant: false,
      start: start,
      end: end,
      step: 'month',
    });

    console.log(`[DemandPlanningService] fetchProductSalesHistory returned ${history.length} months`);
    return history;
  }

  /**
   * Fetch logic property data using ADP Ontology Query API with include_logic_params
   * @param productObjectType Product object type (already resolved, should not be resolved again)
   * @param logicProperty Logic property configuration
   * @param productId Product ID (should be product_code)
   * @param additionalParameters Additional parameters for the API call (e.g., time range)
   * @returns Product sales history data
   */
  async fetchLogicPropertyData(
    productObjectType: ObjectTypeDetail,
    logicProperty: LogicProperty,
    productId: string,
    additionalParameters?: Record<string, any>
  ): Promise<ProductSalesHistory[]> {
    try {
      // Use the provided product object type (already resolved in generateDemandPlan)
      const objectTypeId = productObjectType.id;
      
      console.log(`[DemandPlanningService] Fetching logic property data using ADP Ontology Query API`);
      console.log(`[DemandPlanningService] Logic Property: ${logicProperty.name}`);
      console.log(`[DemandPlanningService] Product ID (should be product_code): ${productId}`);
      console.log(`[DemandPlanningService] Will use product_code="${productId}" in unique_identities`);
      
      // Build include_logic_params parameter
      const logicPropertyParams: any = {};
      
      // Map parameters from logic property configuration
      for (const param of logicProperty.parameters) {
        if (param.value_from === 'property') {
          // Map property value - use productId
          logicPropertyParams[param.name] = productId;
        } else if (param.value_from === 'input') {
          // Use value from additionalParameters if provided, otherwise use default from config
          logicPropertyParams[param.name] = additionalParameters?.[param.name] ?? param.value;
        }
      }
      
      // Override with additionalParameters if provided
      if (additionalParameters) {
        Object.assign(logicPropertyParams, additionalParameters);
      }
      
      // Build dynamic_params for the properties query
      // Format: { "propertyName": { "param1": "value1", ... } }
      const dynamicParams: Record<string, any> = {
        [logicProperty.name]: logicPropertyParams
      };
      
      console.log(`[DemandPlanningService] ADP properties dynamic_params:`, JSON.stringify(dynamicParams, null, 2));

      // Query specific property values using the new /properties endpoint
      // This is the recommended way to fetch logic property values for specific instances
      const response = await ontologyApi.queryObjectPropertyValues(objectTypeId, {
        unique_identities: [
          { product_code: productId } // Use product_code as the unique identity as per server requirements
        ],
        properties: [
          logicProperty.name // We only need this specific logic property
        ],
        dynamic_params: dynamicParams
      });

      // API returns { datas: [...] } structure, not { entries: [...] }
      const responseData = (response as any).datas || response.entries || [];

      if (responseData.length === 0) {
        console.warn(`[DemandPlanningService] No property values returned for productId: ${productId}`);
        return [];
      }

      const entry = responseData[0];
      const logicPropertyValue = entry[logicProperty.name];

      console.log(`[DemandPlanningService] Logic property raw value for '${logicProperty.name}':`, JSON.stringify(logicPropertyValue, null, 2));

      if (!logicPropertyValue) {
        console.warn(`[DemandPlanningService] Logic property '${logicProperty.name}' not found in instance data. Entry keys:`, Object.keys(entry));
        return [];
      }

      // Convert logic property value to ProductSalesHistory[]
      const salesHistory: ProductSalesHistory[] = [];

      if (Array.isArray(logicPropertyValue)) {
        console.log(`[DemandPlanningService] Processing logic property as Array, length: ${logicPropertyValue.length}`);
        for (const item of logicPropertyValue) {
          if (item.month && item.quantity !== undefined) {
            salesHistory.push({
              productId,
              month: item.month,
              quantity: typeof item.quantity === 'number' ? item.quantity : 0,
            });
          } else if (item.time && item.value !== undefined) {
            const date = new Date(item.time);
            const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            salesHistory.push({
              productId,
              month,
              quantity: typeof item.value === 'number' ? item.value : 0,
            });
          }
        }
      } else if (logicPropertyValue.datas && Array.isArray(logicPropertyValue.datas) && logicPropertyValue.datas.length > 0) {
        // Handle nested metric model format: { model: {...}, datas: [{ times: [...], values: [...] }], step: "month" }
        console.log(`[DemandPlanningService] Processing logic property as nested Metric Model format (datas[].times/values)`);
        const metricData = logicPropertyValue.datas[0];
        if (metricData.times && metricData.values) {
          for (let i = 0; i < metricData.times.length; i++) {
            const timestamp = metricData.times[i];
            const value = metricData.values[i];
            if (value !== null && value !== undefined) {
              const date = new Date(timestamp);
              const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
              salesHistory.push({
                productId,
                month,
                quantity: typeof value === 'number' ? value : 0,
              });
            }
          }
        }
      } else if (logicPropertyValue.times && logicPropertyValue.values) {
        console.log(`[DemandPlanningService] Processing logic property as Metric Model format (times/values)`);
        for (let i = 0; i < logicPropertyValue.times.length; i++) {
          const timestamp = logicPropertyValue.times[i];
          const value = logicPropertyValue.values[i];
          if (value !== null && value !== undefined) {
            const date = new Date(timestamp);
            const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            salesHistory.push({
              productId,
              month,
              quantity: typeof value === 'number' ? value : 0,
            });
          }
        }
      } else {
        console.warn(`[DemandPlanningService] Unknown logic property value format:`, logicPropertyValue);
      }
      
      const sortedHistory = salesHistory.sort((a, b) => a.month.localeCompare(b.month));
      console.log(`[DemandPlanningService] Final processed sales history (first 3):`, JSON.stringify(sortedHistory.slice(0, 3), null, 2));
      console.log(`[DemandPlanningService] Total history points: ${sortedHistory.length}`);
      
      return sortedHistory;
    } catch (error) {
      console.error(`[DemandPlanningService] Error fetching logic property data:`, error);
      console.log(`[DemandPlanningService] Falling back to legacy method...`);
      return this.fetchLogicPropertyDataLegacy(productObjectType, logicProperty, productId, additionalParameters);
    }
  }

  /**
   * Legacy method: Fetch logic property data based on its configuration (fallback)
   * @param productObjectType Product object type (for reference, may be used in future)
   * @param logicProperty Logic property configuration
   * @param productId Product ID
   * @param additionalParameters Additional parameters for the API call (e.g., time range)
   * @returns Product sales history data
   */
  private async fetchLogicPropertyDataLegacy(
    productObjectType: ObjectTypeDetail,
    logicProperty: LogicProperty,
    productId: string,
    additionalParameters?: Record<string, any>
  ): Promise<ProductSalesHistory[]> {
    // productObjectType is kept for future use, currently not used in legacy method
    void productObjectType;
    const { data_source, parameters } = logicProperty;

    console.log(`[DemandPlanningService] fetchLogicPropertyDataLegacy - Start`, {
      logicProperty: logicProperty.name,
      productId,
      dataSourceType: data_source.type,
      parametersCount: parameters?.length || 0,
    });

    // Handle 'metric' type - map to 'metric-model'
    let dataSourceType = data_source.type;
    if (logicProperty.type === 'metric' && dataSourceType !== 'metric-model') {
      dataSourceType = 'metric-model';
      console.log(`[DemandPlanningService] Mapping logic property type 'metric' to data source type 'metric-model'`);
    }

    // Build parameters map from logic property configuration
    const paramMap: Record<string, any> = {};
    const paramOperations: Record<string, string> = {};

    if (parameters) {
      for (const param of parameters) {
        if (param.value_from === 'property') {
          // Map property value - use productId
          paramMap[param.name] = productId;
          if (param.operation) {
            paramOperations[param.name] = param.operation;
          }
        } else if (param.value_from === 'input') {
          // Use value from additionalParameters if provided, otherwise use default from config
          paramMap[param.name] = additionalParameters?.[param.name] ?? param.value;
          if (param.operation) {
            paramOperations[param.name] = param.operation;
          }
        }
      }
    }

    // Override with additionalParameters if provided
    if (additionalParameters) {
      Object.assign(paramMap, additionalParameters);
    }

    console.log(`[DemandPlanningService] fetchLogicPropertyDataLegacy - Built paramMap:`, paramMap);

    // Call appropriate API based on data_source.type
    switch (dataSourceType) {
      case 'metric-model': {
        const modelId = data_source.id;

        const now = Date.now();
        const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;

        const start = paramMap.start || paramMap.start_time || oneYearAgo;
        const end = paramMap.end || paramMap.end_time || now;
        const instant = paramMap.instant === true || paramMap.instant === 'true';

        // Build filters from parameters
        const filters: MetricFilter[] = [];
        for (const [key, value] of Object.entries(paramMap)) {
          if (['start', 'end', 'start_time', 'end_time', 'instant', 'step'].includes(key)) {
            continue;
          }
          if (value !== null && value !== undefined && value !== '') {
            filters.push({
              name: key,
              value: value,
              operation: (paramOperations[key] as any) || '=',
            });
          }
        }

        const queryRequest: MetricQueryRequest = {
          instant,
          start: typeof start === 'number' ? start : new Date(start).getTime(),
          end: typeof end === 'number' ? end : new Date(end).getTime(),
          step: paramMap.step || 'month',
          filters: filters.length > 0 ? filters : undefined,
        };

        console.log(`[DemandPlanningService] fetchLogicPropertyDataLegacy - Querying metric model ${modelId} with:`, JSON.stringify(queryRequest, null, 2));

        const result = await metricModelApi.queryByModelId(modelId, queryRequest, {
          includeModel: false,
        });

        // Convert MetricData to ProductSalesHistory[]
        const salesHistory: ProductSalesHistory[] = [];
        for (const data of result.datas) {
          if (data.times && data.values) {
            for (let i = 0; i < data.times.length; i++) {
              const timestamp = data.times[i];
              const value = data.values[i];
              if (value !== null && value !== undefined) {
                // Convert timestamp to YYYY-MM format
                const date = new Date(timestamp);
                const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                salesHistory.push({
                  productId,
                  month,
                  quantity: typeof value === 'number' ? value : 0,
                });
              }
            }
          }
        }

        return salesHistory.sort((a, b) => a.month.localeCompare(b.month));
      }

      case 'data-view': {
        // Use data view API
        const dataViewId = data_source.id;

        // Build filters from parameters
        const filters: any[] = [];
        for (const [key, value] of Object.entries(paramMap)) {
          if (value !== null && value !== undefined && value !== '') {
            filters.push({
              field: key,
              operation: '=',
              value: value,
            });
          }
        }

        // Query data view
        const result = await dataViewApi.queryDataView<any>(dataViewId, {
          offset: 0,
          limit: 10000, // Get all records
          filters: filters.length > 0 ? filters : undefined,
        });

        // Convert data view entries to ProductSalesHistory[]
        const salesHistory: ProductSalesHistory[] = [];
        for (const entry of result.entries) {
          // Try to find month and quantity fields
          // Common field names: month, date, time, quantity, amount, value, sales
          const monthField = entry.month || entry.date || entry.time || entry.month_str;
          const quantityField = entry.quantity || entry.amount || entry.value || entry.sales || entry.qty;

          if (monthField && quantityField !== undefined) {
            // Normalize month to YYYY-MM format
            let month: string;
            if (typeof monthField === 'string') {
              // If already in YYYY-MM format
              if (/^\d{4}-\d{2}$/.test(monthField)) {
                month = monthField;
              } else {
                // Try to parse date string
                const date = new Date(monthField);
                if (!isNaN(date.getTime())) {
                  month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                } else {
                  continue; // Skip invalid dates
                }
              }
            } else {
              continue; // Skip if month is not a string
            }

            salesHistory.push({
              productId,
              month,
              quantity: typeof quantityField === 'number' ? quantityField : parseFloat(quantityField) || 0,
            });
          }
        }

        return salesHistory.sort((a, b) => a.month.localeCompare(b.month));
      }

      case 'operator': {
        // Operator API not yet available
        // For now, throw error with helpful message
        throw new Error(
          `Operator API integration not yet implemented. Logic property "${logicProperty.name}" uses operator data source "${data_source.id}"`
        );
      }

      default:
        throw new Error(`Unsupported data source type: ${data_source.type}`);
    }
  }

  /**
   * Get product list with display names
   * @returns Array of product options
   * Uses ADP Ontology Query API (queryObjectInstances) to query product instances
   */
  async getProductList(): Promise<ProductOption[]> {
    try {
      // First, resolve product object type to get the object type ID
      const productObjectType = await this.resolveProductObjectType();
      const objectTypeId = productObjectType.id;
      
      console.log(`[DemandPlanningService] Querying product instances for object type: ${objectTypeId}`);
      
      // Query product instances using ADP Ontology Query API
      const response = await ontologyApi.queryObjectInstances(objectTypeId, {
        limit: 1000,
      });
      
      // Validate response structure
      if (!response) {
        throw new Error('API返回空响应');
      }
      
      if (!response.entries || !Array.isArray(response.entries)) {
        console.error('[DemandPlanningService] Invalid response structure:', response);
        throw new Error(`API返回格式错误: entries字段缺失或不是数组。响应结构: ${JSON.stringify(response)}`);
      }
      
      console.log(`[DemandPlanningService] Found ${response.entries.length} product instances`);
      
      // Map instances to ProductOption[]
      const displayKey = productObjectType.display_key || 'product_name';
      
      return response.entries.map((instance: any) => {
        // IMPORTANT: Use product_code as the id, not instance.id
        // This is required because fetchLogicPropertyData uses this id as product_code
        const productCode = instance.product_code || instance.code || '';
        const productId = productCode || instance.id || instance.product_id || instance[displayKey];
        const productName = instance.product_name || instance.name || instance[displayKey] || '';
        
        let displayName = productName;
        if (productCode && productName && productCode !== productName) {
          displayName = `${productCode} - ${productName}`;
        } else if (productCode) {
          displayName = productCode;
        } else if (!productName) {
          displayName = productId || '未知产品';
        }
        
        console.log(`[DemandPlanningService] Mapping product instance:`, {
          instance_id: instance.id,
          product_code: productCode,
          product_id: productId,
          display_name: displayName,
        });
        
        return {
          id: productCode || productId, // Prioritize product_code as id
          displayName: displayName,
        };
      });
    } catch (error) {
      console.error('[DemandPlanningService] Error getting product list using ADP API:', error);
      throw error;
    }
  }

  /**
   * Get historical actual data for past months
   * @param productIds Array of product IDs
   * @param months Array of month strings in YYYY-MM format
   * @returns Record mapping productId -> month -> quantity
   */
  async getHistoricalActual(
    productIds: string[],
    months: string[]
  ): Promise<Record<string, Record<string, number>>> {
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const pastMonths = months.filter((month) => month < currentMonth);

    if (pastMonths.length === 0) {
      return {};
    }

    // Get orders from data view API
    const ordersResponse = await dataViewApi.getOrders();

    // Filter orders by productIds and past months
    const filteredOrders = ordersResponse.entries.filter((order: any) => {
      const orderMonth = order.orderDate?.slice(0, 7) || order.dueDate?.slice(0, 7);
      return (
        productIds.includes(order.productId || order.product_id) &&
        pastMonths.includes(orderMonth)
      );
    });

    // Aggregate by product and month
    const result: Record<string, Record<string, number>> = {};

    for (const order of filteredOrders) {
      const productId = order.productId || order.product_id;
      const orderMonth = order.orderDate?.slice(0, 7) || order.dueDate?.slice(0, 7);
      const quantity = order.quantity || 0;

      if (!result[productId]) {
        result[productId] = {};
      }

      if (!result[productId][orderMonth]) {
        result[productId][orderMonth] = 0;
      }

      result[productId][orderMonth] += quantity;
    }

    return result;
  }

  /**
   * Get confirmed orders for future months
   * @param productIds Array of product IDs
   * @param months Array of month strings in YYYY-MM format
   * @returns Record mapping productId -> month -> quantity
   */
  async getConfirmedOrders(
    productIds: string[],
    months: string[]
  ): Promise<Record<string, Record<string, number>>> {
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const futureMonths = months.filter((month) => month >= currentMonth);

    if (futureMonths.length === 0) {
      return {};
    }

    // Get orders from data view API
    const ordersResponse = await dataViewApi.getOrders();

    // Filter orders by productIds, future months, and confirmed status
    const filteredOrders = ordersResponse.entries.filter((order: any) => {
      const orderMonth = order.dueDate?.slice(0, 7) || order.orderDate?.slice(0, 7);
      const isConfirmed = order.status === '已确认' || order.status === 'confirmed' || order.status === 'CONFIRMED';
      return (
        productIds.includes(order.productId || order.product_id) &&
        futureMonths.includes(orderMonth) &&
        isConfirmed
      );
    });

    // Aggregate by product and month
    const result: Record<string, Record<string, number>> = {};

    for (const order of filteredOrders) {
      const productId = order.productId || order.product_id;
      const orderMonth = order.dueDate?.slice(0, 7) || order.orderDate?.slice(0, 7);
      const quantity = order.quantity || 0;

      if (!result[productId]) {
        result[productId] = {};
      }

      if (!result[productId][orderMonth]) {
        result[productId][orderMonth] = 0;
      }

      result[productId][orderMonth] += quantity;
    }

    return result;
  }

  /**
   * Generate Prophet forecast using shared forecastOperatorService (FR-010.1)
   * @param productId Product ID
   * @param history Historical sales data
   * @param parameters Optional Prophet parameters
   * @returns Array of 18 forecast values (past 2 years same period 12 months + future 6 months)
   */
  async generateProphetForecast(
    productId: string,
    history: ProductSalesHistory[],
    parameters?: Record<string, any>
  ): Promise<number[]> {
    if (history.length === 0) {
      console.warn(`No historical data for product ${productId}, returning zero forecast`);
      return new Array(18).fill(0);
    }

    try {
      // Use shared forecastOperatorService (FR-010.1)
      const prophetInput: ProphetForecastInput = {
        product_id: productId,
        historical_data: history.map((h) => ({ month: h.month, quantity: h.quantity })),
        forecast_periods: 18, // 18 months: past 2 years same period 12 months + future 6 months
        parameters: parameters as any || {
          seasonalityMode: 'multiplicative',
          yearlySeasonality: true,
          weeklySeasonality: false,
        },
      };

      const result = await forecastOperatorService.forecast('prophet', prophetInput);
      
      // Ensure we return exactly 18 values
      const forecast = result.forecast_values.slice(0, 18);
      while (forecast.length < 18) {
        forecast.push(forecast[forecast.length - 1] || 0);
      }
      
      return forecast;
    } catch (error) {
      console.error(`Prophet forecast failed for product ${productId}:`, error);
      // Fallback: Use simple moving average if API is not available
      if (history.length > 0) {
        const sortedHistory = [...history].sort((a, b) => a.month.localeCompare(b.month));
        const recentValues = sortedHistory.slice(-6).map((h) => h.quantity); // Last 6 months
        const avg = recentValues.reduce((a, b) => a + b, 0) / recentValues.length;
        return new Array(18).fill(avg);
      }
      return new Array(18).fill(0);
    }
  }

  /**
   * Generate exponential smoothing forecast using shared forecastAlgorithmService (FR-010.1)
   * @param productId Product ID
   * @param history Historical sales data
   * @param algorithm Algorithm type (simple_exponential, holt_linear, holt_winters)
   * @param parameters Optional algorithm parameters
   * @returns Array of 18 forecast values (past 2 years same period 12 months + future 6 months)
   */
  async generateExponentialSmoothingForecast(
    productId: string,
    history: ProductSalesHistory[],
    algorithm: 'simple_exponential' | 'holt_linear' | 'holt_winters',
    parameters?: Record<string, any>
  ): Promise<number[]> {
    // Use shared forecastAlgorithmService (FR-010.1)
    console.log(`[DemandPlanningService] Generating ${algorithm} forecast for product ${productId} with ${history.length} history points`);

    // Convert parameters to SmoothingParams format
    const smoothingParams: SmoothingParams = {
      alpha: parameters?.alpha,
      beta: parameters?.beta,
      gamma: parameters?.gamma,
      seasonLength: parameters?.seasonLength || 12,
    };

    switch (algorithm) {
      case 'simple_exponential':
        return simpleExponentialSmoothing(history, 18, smoothingParams);
      case 'holt_linear':
        return holtLinearSmoothing(history, 18, smoothingParams);
      case 'holt_winters':
        return holtWintersSmoothing(history, 18, smoothingParams);
      default:
        throw new Error(`Unknown algorithm: ${algorithm}`);
    }
  }

  /**
   * Generate month range (past 2 years same period 12 months + future 6 months)
   * @returns Array of 18 month strings in YYYY-MM format
   * Example: If current month is 2026-01, returns:
   *   [2024-01, 2024-02, ..., 2024-06, 2025-01, 2025-02, ..., 2025-06, 2026-01, 2026-02, ..., 2026-06]
   */
  generateMonthRange(): string[] {
    const months: string[] = [];
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth(); // 0-based (0 = January)

    // Generate 18 months: past 2 years same period (12 months) + future 6 months
    // Past 2 years: (currentYear - 2) same period + (currentYear - 1) same period
    // Future: currentYear same period (currentMonth to currentMonth + 5)
    
    // Past 2 years same period (12 months)
    for (let yearOffset = -2; yearOffset <= -1; yearOffset++) {
      const year = currentYear + yearOffset;
      for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
        const month = currentMonth + monthOffset;
        const date = new Date(year, month, 1);
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        months.push(`${y}-${m}`);
      }
    }
    
    // Future 6 months (current year same period)
    for (let monthOffset = 0; monthOffset < 6; monthOffset++) {
      const date = new Date(currentYear, currentMonth + monthOffset, 1);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      months.push(`${year}-${month}`);
    }

    return months;
  }

  /**
   * Calculate average forecast from multiple algorithm forecasts for a specific month
   * @param algorithmForecasts Array of algorithm forecasts
   * @param monthIndex Index of the month (0-17 for 18 months)
   * @returns Average forecast value for that month
   */
  calculateAverageForecast(
    algorithmForecasts: AlgorithmForecast[],
    monthIndex: number
  ): number {
    if (algorithmForecasts.length === 0) {
      return 0;
    }

    const sum = algorithmForecasts.reduce((acc, forecast) => {
      return acc + (forecast.forecastValues[monthIndex] || 0);
    }, 0);

    return sum / algorithmForecasts.length;
  }

  /**
   * Calculate consensus suggestion (updated to support multi-algorithm and 18-month structure)
   * @param averageForecast Average of multiple algorithm forecasts (for future months)
   * @param historicalActual Historical actual (null for future months)
   * @param confirmedOrder Confirmed order (null for historical months)
   * @param month Month string in YYYY-MM format (used to determine if historical or future)
   * @param monthIndex Optional month index (0-17) to determine if historical (0-11) or future (12-17)
   * @returns Consensus suggestion value
   */
  calculateConsensusSuggestion(
    averageForecast: number,
    historicalActual: number | null,
    confirmedOrder: number | null,
    month: string,
    monthIndex?: number
  ): number {
    // Determine if this is a historical month (past 2 years same period) or future month
    // Historical months: first 12 months (index 0-11) or months before current month
    // Future months: last 6 months (index 12-17) or months >= current month
    let isHistoricalMonth: boolean;
    
    if (monthIndex !== undefined) {
      // Use monthIndex if provided (more accurate for 18-month structure)
      isHistoricalMonth = monthIndex < 12;
    } else {
      // Fallback to date comparison
      const currentMonthStr = new Date().toISOString().slice(0, 7);
      isHistoricalMonth = month < currentMonthStr;
    }

    // For historical months (past 2 years same period): use historical actual if available
    if (isHistoricalMonth && historicalActual !== null) {
      return historicalActual;
    }

    // For future months: weighted average
    // averageForecast * 0.6 + confirmedOrder * 0.4
    const confirmed = confirmedOrder || 0;
    return averageForecast * 0.6 + confirmed * 0.4;
  }

  /**
   * Calculate consensus suggestion (legacy method for backward compatibility)
   * @param forecast Forecasted demand
   * @param historicalActual Historical actual (null for future months)
   * @param confirmedOrder Confirmed order (null for past months)
   * @returns Consensus suggestion value
   * @deprecated Use calculateConsensusSuggestion(averageForecast, historicalActual, confirmedOrder, month) instead
   */
  calculateConsensusSuggestionLegacy(
    forecast: number,
    historicalActual: number | null,
    confirmedOrder: number | null
  ): number {
    // For past months: use historical actual if available
    if (historicalActual !== null) {
      return historicalActual;
    }

    // For future months: weighted average
    // forecast * 0.6 + confirmedOrder * 0.4
    const confirmed = confirmedOrder || 0;
    return forecast * 0.6 + confirmed * 0.4;
  }

  /**
   * Get algorithm display name
   * @param algorithm Algorithm type
   * @returns Display name in Chinese
   */
  getAlgorithmDisplayName(algorithm: ForecastAlgorithm): string {
    const displayNames: Record<ForecastAlgorithm, string> = {
      prophet: 'Prophet预测需求',
      simple_exponential: '简单指数平滑预测需求',
      holt_linear: 'Holt线性平滑预测需求',
      holt_winters: 'Holt-Winters三重指数平滑预测需求',
      arima: 'ARIMA时间序列预测需求',
      ensemble: '集成预测需求',
    };
    return displayNames[algorithm] || `${algorithm}预测需求`;
  }

  /**
   * Generate single algorithm forecast and return AlgorithmForecast
   * @param productId Product ID
   * @param algorithm Forecast algorithm to use
   * @param history Historical sales data
   * @returns AlgorithmForecast object
   */
  /**
   * Generate algorithm forecast using shared algorithm services
   * Refactored to use forecastAlgorithmService and forecastOperatorService (FR-010.1)
   * @param productId Product ID
   * @param algorithm Forecast algorithm (prophet, simple_exponential, holt_linear, holt_winters)
   * @param history Historical sales data
   * @param parameters Optional algorithm parameters
   * @returns AlgorithmForecast with forecast values
   */
  async generateAlgorithmForecast(
    productId: string,
    algorithm: ForecastAlgorithm,
    history: ProductSalesHistory[],
    parameters?: Record<string, any>
  ): Promise<AlgorithmForecast> {
    // Only support 4 algorithms (FR-010.2, FR-010.3)
    if (algorithm !== 'prophet' && algorithm !== 'simple_exponential' && 
        algorithm !== 'holt_linear' && algorithm !== 'holt_winters') {
      throw new Error(`Unsupported algorithm: ${algorithm}. Only prophet, simple_exponential, holt_linear, and holt_winters are supported.`);
    }

    let forecastValues: number[];

    if (algorithm === 'prophet') {
      forecastValues = await this.generateProphetForecast(productId, history, parameters);
    } else {
      // Use shared forecastAlgorithmService for exponential smoothing algorithms
      forecastValues = await this.generateExponentialSmoothingForecast(
        productId,
        history,
        algorithm,
        parameters
      );
    }

    return {
      algorithm,
      algorithmDisplayName: this.getAlgorithmDisplayName(algorithm),
      forecastValues,
    };
  }

  /**
   * Get or create product forecast record
   * @param productId Product ID
   * @param productName Product name
   * @param existingForecast Existing ProductDemandForecast (if any)
   * @returns ProductDemandForecast object
   */
  getOrCreateProductForecast(
    productId: string,
    productName: string,
    existingForecast?: ProductDemandForecast
  ): ProductDemandForecast {
    if (existingForecast) {
      return existingForecast;
    }

    return {
      productId,
      productName,
      algorithmForecasts: [],
      historicalActual: new Array(18).fill(null),
      confirmedOrder: new Array(18).fill(null),
      consensusSuggestion: new Array(18).fill(0),
    };
  }

  /**
   * Update or replace algorithm forecast in ProductDemandForecast
   * @param productForecast Existing ProductDemandForecast
   * @param algorithmForecast New AlgorithmForecast to add or replace
   * @returns Updated ProductDemandForecast
   */
  updateAlgorithmForecast(
    productForecast: ProductDemandForecast,
    algorithmForecast: AlgorithmForecast
  ): ProductDemandForecast {
    // Check if algorithm forecast already exists
    const existingIndex = productForecast.algorithmForecasts.findIndex(
      (af) => af.algorithm === algorithmForecast.algorithm
    );

    const updatedForecasts = [...productForecast.algorithmForecasts];
    if (existingIndex >= 0) {
      // Replace existing algorithm forecast
      updatedForecasts[existingIndex] = algorithmForecast;
    } else {
      // Add new algorithm forecast
      updatedForecasts.push(algorithmForecast);
    }

    return {
      ...productForecast,
      algorithmForecasts: updatedForecasts,
    };
  }

  /**
   * Recalculate consensus suggestion for all 18 months
   * @param productForecast ProductDemandForecast to recalculate
   * @returns Updated ProductDemandForecast with recalculated consensus suggestions
   */
  recalculateConsensusSuggestion(
    productForecast: ProductDemandForecast
  ): ProductDemandForecast {
    const months = this.generateMonthRange();
    const consensusSuggestion: number[] = [];
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth();
    const currentMonthStr = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;

    for (let i = 0; i < 18; i++) {
      const month = months[i];
      const historicalActual = productForecast.historicalActual[i];
      const confirmedOrder = productForecast.confirmedOrder[i];

      // Determine if this is a historical month (past 2 years same period) or future month
      // Historical months: first 12 months (past 2 years same period)
      // Future months: last 6 months (current year same period)
      const isHistoricalMonth = i < 12;

      if (isHistoricalMonth) {
        // Historical months: use historicalActual directly
        consensusSuggestion.push(historicalActual ?? 0);
      } else {
        // Future months: calculate weighted average
        const averageForecast = this.calculateAverageForecast(
          productForecast.algorithmForecasts,
          i
        );

        // Calculate consensus suggestion: averageForecast * 0.6 + confirmedOrder * 0.4
        const consensus = this.calculateConsensusSuggestion(
          averageForecast,
          historicalActual,
          confirmedOrder,
          month,
          i // Pass monthIndex for accurate historical/future determination
        );

        consensusSuggestion.push(consensus);
      }
    }

    return {
      ...productForecast,
      consensusSuggestion,
    };
  }

  /**
   * Generate complete demand plan (updated to support multi-algorithm and parameters)
   * @param productId Product ID
   * @param productName Product name (for display)
   * @param algorithm Forecast algorithm to use
   * @param existingForecast Existing ProductDemandForecast (if any, for multi-algorithm support)
   * @param parameters Optional algorithm parameters (FR-010.4)
   * @returns ProductDemandForecast object
   */
  async generateDemandPlan(
    productId: string,
    productName: string,
    algorithm: ForecastAlgorithm,
    existingForecast?: ProductDemandForecast,
    parameters?: Record<string, any>
  ): Promise<ProductDemandForecast> {
    if (!productId) {
      throw new Error('A product must be selected');
    }

    // Generate month range
    const months = this.generateMonthRange();
    const currentMonthStr = new Date().toISOString().slice(0, 7);

    // Get product object type
    console.log('[DemandPlanningService] Starting generateDemandPlan, resolving product object type...');
    const productObjectType = await this.resolveProductObjectType();

    // Validate product object type
    if (!productObjectType) {
      console.error('[DemandPlanningService] productObjectType is null or undefined');
      throw new Error('Failed to resolve product object type: object type is null or undefined');
    }

    if (!productObjectType.id) {
      console.error('[DemandPlanningService] productObjectType.id is missing:', productObjectType);
      console.error('[DemandPlanningService] productObjectType keys:', Object.keys(productObjectType));
      throw new Error(`Failed to resolve product object type: object type missing id. Response: ${JSON.stringify(productObjectType).substring(0, 500)}`);
    }

    console.log(`[DemandPlanningService] Successfully resolved product object type: ${productObjectType.id} (${productObjectType.name || 'unnamed'})`);

    // Resolve product_sales_history logic property
    const logicProperty = this.resolveLogicProperty(productObjectType, 'product_sales_history');

    if (!logicProperty) {
      const availableProps = productObjectType.logic_properties?.map(p => p.name).join(', ') || 'none';
      const objectTypeInfo = productObjectType.id ? `'${productObjectType.id}' (${productObjectType.name || 'unnamed'})` : 'unknown';
      const errorMsg = `product_sales_history logic property not found in product object type ${objectTypeInfo}. Available logic properties: ${availableProps}`;
      console.error(`[DemandPlanningService] ${errorMsg}`);
      console.error(`[DemandPlanningService] Product object type details:`, {
        id: productObjectType.id,
        name: productObjectType.name,
        hasLogicProperties: !!productObjectType.logic_properties,
        logicPropertiesCount: productObjectType.logic_properties?.length || 0,
        allKeys: Object.keys(productObjectType),
      });
      throw new Error(errorMsg);
    }

    // Calculate time range: start = current month - 24 months, end = last month
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonthIndex = now.getMonth(); // 0-indexed
    
    // End: last month (current month - 1)
    const endDate = new Date(currentYear, currentMonthIndex, 0); // Last day of last month
    const end = endDate.getTime();
    
    // Start: 24 months before current month
    const startDate = new Date(currentYear, currentMonthIndex - 24, 1); // First day of 24 months ago
    const start = startDate.getTime();
    
    // Fetch historical sales data for the product with specified parameters
    // This data comes from the 'product_sales_history' logic property
    // Pass the already resolved productObjectType to avoid re-resolving
    const history = await this.fetchLogicPropertyData(productObjectType, logicProperty, productId, {
      instant: false,
      start: start,
      end: end,
      step: 'month',
    });

    // Create a lookup map for historical data by month
    const historyMap: Record<string, number> = {};
    history.forEach(item => {
      historyMap[item.month] = item.quantity;
    });

    console.log(`[DemandPlanningService] Created history lookup map for ${Object.keys(historyMap).length} months`);

    // Get confirmed orders for future months
    const confirmedOrders = await this.getConfirmedOrders([productId], months);

    // Get or create product forecast
    const productForecast = this.getOrCreateProductForecast(
      productId,
      productName,
      existingForecast
    );

    // Generate algorithm forecast with parameters (FR-010.4)
    const algorithmForecast = await this.generateAlgorithmForecast(
      productId,
      algorithm,
      history,
      parameters
    );

    // Update product forecast with new algorithm forecast
    let updatedForecast = this.updateAlgorithmForecast(productForecast, algorithmForecast);

    // Update historical actual and confirmed orders arrays
    // Structure: 18 months = past 2 years same period (12 months) + future 6 months
    // Historical months: first 12 months (past 2 years same period)
    // Future months: last 6 months (current year same period)
    const historicalActual: (number | null)[] = [];
    const confirmedOrder: (number | null)[] = [];

    for (let i = 0; i < months.length; i++) {
      const month = months[i];
      const isHistoricalMonth = i < 12; // First 12 months are historical (past 2 years same period)

      if (isHistoricalMonth) {
        // Historical months: show historical actual, no confirmed orders
        historicalActual.push(historyMap[month] ?? null);
        confirmedOrder.push(null);
      } else {
        // Future months: show confirmed orders, no historical actual
        historicalActual.push(null);
        confirmedOrder.push(confirmedOrders[productId]?.[month] || null);
      }
    }

    updatedForecast = {
      ...updatedForecast,
      historicalActual,
      confirmedOrder,
    };

    // Recalculate consensus suggestion
    updatedForecast = this.recalculateConsensusSuggestion(updatedForecast);

    return updatedForecast;
  }
}

// ============================================================================
// Export Singleton
// ============================================================================

export const demandPlanningService = new DemandPlanningService();
export default demandPlanningService;

