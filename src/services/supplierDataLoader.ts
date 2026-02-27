/**
 * Supplier Data Loader
 *
 * Loads supplier list and scorecard data from the metric model API
 * (mm_supplier_count), using the same two-step dimension discovery
 * pattern as ProductInventoryPanel / MaterialInventoryPanel.
 */

import { metricModelApi, createLastDaysRange } from '../api';
import { apiConfigService } from './apiConfigService';
import type { Supplier360Scorecard } from '../types/ontology';

// 供应商数量指标模型 ID（配置中心 mm_supplier_count，fallback 硬编码）
const getSupplierModelId = () =>
    apiConfigService.getMetricModelId('mm_supplier_count') || 'd58g53lg5lk40hvh48m0';

// 候选维度列表（先 discover 实际可用维度再使用）
const SUPPLIER_CANDIDATE_DIMS = [
    'supplier_code',
    'supplier_id',
    'supplier_name',
    'supplier',
    'available_inventory_qty',
    'inventory_qty',
    'total_amount',
    'order_count',
    'annual_purchase_amount',
    'quality_score',
    'otif_rate',
    'delivery_score',
    'risk_level',
    'response_time_hours',
    'overall_score',
];

// NIL 值正则
const NIL_LIKE = /^(<nil>|nil|null|undefined|none)$/i;

/** 从 label 中提取供应商编码（兼容多个字段名） */
function extractSupplierCode(labels: Record<string, any>): string {
    return (
        labels.supplier_code ||
        labels.supplier_id ||
        labels.supplierId ||
        ''
    ).trim();
}

/** 从 label 中提取供应商名称 */
function extractSupplierName(labels: Record<string, any>, code: string): string {
    return (
        labels.supplier_name ||
        labels.supplier ||
        labels.supplierName ||
        code
    ).trim();
}

/** 从 series 中读取最新数值 */
function getLatestValue(series: any): number {
    if (series.values && series.values.length > 0) {
        for (let i = series.values.length - 1; i >= 0; i--) {
            if (series.values[i] !== null && series.values[i] !== undefined) {
                return parseFloat(series.values[i]) || 0;
            }
        }
    }
    return 0;
}

/**
 * 两步查询：先 discover 维度，再逐步降级重试
 * 如果 supplier_code+supplier_name 报错，只用 supplier_code，再失败则返回第一步结果
 */
async function querySupplierMetricWithDimensions(): Promise<any[]> {
    const modelId = getSupplierModelId();
    const timeRange = createLastDaysRange(1);
    const wideRange = createLastDaysRange(365);

    // ── 第一步：无维度查询，获取 model.analysis_dimensions ──
    let firstResult: any;
    try {
        firstResult = await metricModelApi.queryByModelId(
            modelId,
            { instant: true, start: timeRange.start, end: timeRange.end },
            { includeModel: true }
        );
    } catch (e) {
        console.error('[SupplierDataLoader] First query failed:', e);
        return [];
    }

    const rawDims: any[] = firstResult.model?.analysis_dimensions ?? [];
    const allDims: string[] = rawDims
        .map((d: any) => (typeof d === 'string' ? d : d.name))
        .filter(Boolean);
    console.log('[SupplierDataLoader] Available dims in model:', allDims);

    const codeDim = allDims.includes('supplier_code') ? 'supplier_code'
        : allDims.includes('supplier_id') ? 'supplier_id'
            : null;

    if (!codeDim) {
        console.warn('[SupplierDataLoader] No supplier code dim, using first query result');
        return firstResult.datas || [];
    }

    /** 带时间范围重试的查询 */
    const tryQuery = async (dims: string[]): Promise<any[] | null> => {
        try {
            console.log('[SupplierDataLoader] Query dims:', dims);
            let result = await metricModelApi.queryByModelId(
                modelId,
                { instant: true, start: timeRange.start, end: timeRange.end, analysis_dimensions: dims },
                { includeModel: false, ignoringHcts: true }
            );
            if ((result.datas || []).length > 0) return result.datas!;

            // 1 天无数据 → 365 天重试
            console.warn('[SupplierDataLoader] 1-day empty, retrying 365 days...');
            result = await metricModelApi.queryByModelId(
                modelId,
                { instant: true, start: wideRange.start, end: wideRange.end, analysis_dimensions: dims },
                { includeModel: false, ignoringHcts: true }
            );
            return (result.datas || []).length > 0 ? result.datas! : null;
        } catch (e) {
            console.warn('[SupplierDataLoader] Query failed with dims', dims, ':', (e as any)?.message);
            return null;
        }
    };

    // 只用 supplier_code 查询
    const r = await tryQuery([codeDim]);
    if (r) return r;

    // 兜底: 返回第一步聚合结果（可能只有1条 total 数据）
    console.warn('[SupplierDataLoader] Dimension query failed, using first query result');
    return firstResult.datas || [];
}

/**
 * 加载供应商列表（用于 SupplierSelector 下拉）
 */
export async function loadSupplierList(): Promise<any[]> {
    console.log('[SupplierDataLoader] Loading supplier list from metric model...');
    try {
        const datas = await querySupplierMetricWithDimensions();

        const supplierMap = new Map<string, {
            supplier_id: string;
            supplier_code: string;
            supplier_name: string;
            supplierId: string;
            supplierName: string;
            totalPurchaseAmount: number;
            orderCount: number;
            labels: Record<string, any>;
        }>();

        for (const series of datas) {
            const labels = series.labels || {};
            const code = extractSupplierCode(labels);
            if (!code || NIL_LIKE.test(code)) continue;

            const name = extractSupplierName(labels, code);
            const amount = parseFloat(
                labels.total_amount || labels.annual_purchase_amount || '0'
            ) || getLatestValue(series);

            if (!supplierMap.has(code)) {
                supplierMap.set(code, {
                    supplier_id: code,
                    supplier_code: code,
                    supplier_name: name,
                    supplierId: code,
                    supplierName: name,
                    totalPurchaseAmount: 0,
                    orderCount: 0,
                    labels,
                });
            }
            const s = supplierMap.get(code)!;
            s.totalPurchaseAmount += amount;
            s.orderCount += 1;
            // 如果名称从编码回退过来，尝试更新
            if (s.supplierName === code && name !== code) {
                s.supplierName = name;
                s.supplier_name = name;
            }
        }

        const suppliers = Array.from(supplierMap.values())
            .sort((a, b) => b.totalPurchaseAmount - a.totalPurchaseAmount);

        console.log(`[SupplierDataLoader] Loaded ${suppliers.length} suppliers from metric model`);
        return suppliers;
    } catch (error) {
        console.error('[SupplierDataLoader] Failed to load supplier list:', error);
        return [];
    }
}

/**
 * 加载供应商 360 评分卡列表
 */
export async function loadSupplier360Scorecards(): Promise<Supplier360Scorecard[]> {
    console.log('[SupplierDataLoader] Loading supplier 360 scorecards from metric model...');
    try {
        const datas = await querySupplierMetricWithDimensions();

        const scorecardMap = new Map<string, Supplier360Scorecard>();

        for (const series of datas) {
            const labels = series.labels || {};
            const code = extractSupplierCode(labels);
            if (!code || NIL_LIKE.test(code)) continue;

            const name = extractSupplierName(labels, code);

            // 评估维度字段（可能不存在，则用默认值）
            const overallScore = parseFloat(labels.overall_score || '0') || getLatestValue(series);
            const qualityScore = parseFloat(labels.quality_score || '0') || 75;
            const otifRate = parseFloat(labels.otif_rate || '0') || 80;
            const deliveryScore = parseFloat(labels.delivery_score || '0') || 80;
            const riskLevelStr: string = labels.risk_level || 'low';
            const responseTime = parseFloat(labels.response_time_hours || '24') || 24;

            const riskRating = mapRiskLevelToScore(riskLevelStr);
            const riskLevel = normalizeRiskLevel(riskLevelStr);

            if (!scorecardMap.has(code)) {
                scorecardMap.set(code, {
                    supplierId: code,
                    supplierName: name,
                    evaluationDate: new Date().toISOString().split('T')[0],
                    overallScore: overallScore || Math.round((qualityScore + otifRate + deliveryScore) / 3),
                    dimensions: {
                        qualityRating: qualityScore,
                        onTimeDeliveryRate: otifRate,
                        riskRating,
                        onTimeDeliveryRate2: deliveryScore,
                        annualPurchaseAmount: parseFloat(labels.total_amount || labels.annual_purchase_amount || '0') || 0,
                        responseSpeed: responseTime,
                    },
                    riskAssessment: {
                        supplierId: code,
                        assessmentDate: new Date().toISOString().split('T')[0],
                        overallRiskLevel: riskLevel,
                        financialStatus: { score: 85, lastUpdated: new Date().toISOString() },
                        publicSentiment: { score: 80, source: 'manual', lastUpdated: new Date().toISOString() },
                        productionAnomalies: { count: 0, severity: 'low', source: 'manual', lastUpdated: new Date().toISOString() },
                        legalRisks: { score: 15, source: 'auto', lastUpdated: new Date().toISOString(), risks: [] },
                    },
                });
            }
        }

        const scorecards = Array.from(scorecardMap.values());
        console.log(`[SupplierDataLoader] Generated ${scorecards.length} supplier scorecards`);
        return scorecards;
    } catch (error) {
        console.error('[SupplierDataLoader] Failed to load supplier scorecards:', error);
        return [];
    }
}

/**
 * 加载单个供应商评分卡
 */
export async function loadSupplierScorecard(supplierId: string): Promise<Supplier360Scorecard | null> {
    const scorecards = await loadSupplier360Scorecards();
    return scorecards.find(s => s.supplierId === supplierId) || null;
}

// ── 工具函数 ──────────────────────────────────────────────────────────────

function normalizeRiskLevel(riskLevel: string | undefined): 'low' | 'medium' | 'high' | 'critical' {
    if (!riskLevel) return 'low';
    const n = riskLevel.toLowerCase().trim();
    if (n === '低' || n === 'low') return 'low';
    if (n === '中' || n === 'medium') return 'medium';
    if (n === '高' || n === 'high') return 'high';
    if (n === '严重' || n === 'critical') return 'critical';
    return 'low';
}

function mapRiskLevelToScore(riskLevel: string | undefined): number {
    switch (normalizeRiskLevel(riskLevel)) {
        case 'low': return 20;
        case 'medium': return 50;
        case 'high': return 80;
        case 'critical': return 95;
        default: return 50;
    }
}
