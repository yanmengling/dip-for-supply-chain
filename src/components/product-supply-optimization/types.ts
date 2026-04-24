/**
 * Shared types for Product Supply Optimization components
 *
 * Note: These types are designed to work with the actual ProductSupplyAnalysis
 * data from ontology.ts which has different field names than expected.
 */

export interface ProductSearchResult {
    productId: string;
    productName: string;
    productModel?: string;
    bomCode?: string;
    stockDays: number;
    stockStatus: 'sufficient' | 'normal' | 'low' | 'critical';
    matchScore: number;
    matchFields: string[];
}

/**
 * Simplified product analysis interface for search components
 * Maps to the actual ProductSupplyAnalysis data structure from ontology.ts
 */
export interface ProductSupplyAnalysisForSearch {
    productId: string;
    productName: string;
    productModel?: string;
    // stockDays is directly on the object, not nested
    stockDays?: number;
    // stockoutRiskLevel uses 'low' | 'medium' | 'high' instead of 'sufficient' | 'normal' | 'low' | 'critical'
    stockoutRiskLevel?: 'low' | 'medium' | 'high';
    // Alternative structure if it exists
    inventoryStatus?: {
        stockDays: number;
        stockStatus: 'sufficient' | 'normal' | 'low' | 'critical';
    };
    boms?: Array<{ bom_material_code?: string }>;
}
