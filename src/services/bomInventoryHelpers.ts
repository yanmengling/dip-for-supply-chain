/**
 * Helper functions for BOM data loading
 *
 * 通过 Ontology API queryObjectInstances 直接查询 BOM、库存、物料对象实例，
 * 与 planningV2DataService 保持一致，不依赖逻辑算子（/properties 端点）。
 *
 * 数据来源：
 *   - BOM 结构：supplychain_hd0202_bom（按 bom_material_code == productCode 过滤，取最新版本）
 *   - 库存数据：supplychain_hd0202_inventory（按 material_code in [...] 过滤，分批查询）
 *   - 物料单价：supplychain_hd0202_material（按 material_code in [...] 过滤，分批查询）
 */

import { ontologyApi } from '../api/ontologyApi';
import type { ProductBOMTree, BOMNode, StockStatus } from './bomInventoryService';

// Dependencies injected from bomInventoryService to avoid circular imports
let getObjectTypeId: (entityType: string, defaultId: string) => string;
let DEFAULT_IDS: { products: string; bom: string; inventory: string; material: string; };

export function initHelpers(deps: {
    getObjectTypeId: (entityType: string, defaultId: string) => string;
    DEFAULT_IDS: { products: string; bom: string; inventory: string; material: string; };
}) {
    getObjectTypeId = deps.getObjectTypeId;
    DEFAULT_IDS = deps.DEFAULT_IDS;
}

// 批量分片大小
const BATCH_CHUNK_SIZE = 100;
// 分片并发数
const CHUNK_CONCURRENCY = 5;

function chunkArray<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}

/** 受控并发执行分片任务，每个任务返回数组，最终合并为扁平数组 */
async function parallelChunks<TChunk, TResult>(
    chunks: TChunk[][],
    fn: (chunk: TChunk[]) => Promise<TResult[]>,
    concurrency = CHUNK_CONCURRENCY
): Promise<TResult[]> {
    const results: TResult[] = [];
    for (let i = 0; i < chunks.length; i += concurrency) {
        const batch = chunks.slice(i, i + concurrency);
        const batchResults = await Promise.all(batch.map(fn));
        for (const r of batchResults) results.push(...r);
    }
    return results;
}

// ============================================================================
// 产品列表
// ============================================================================

export async function loadProductList() {
    try {
        const productObjectTypeId = getObjectTypeId('product', DEFAULT_IDS.products);
        const productsResponse = await ontologyApi.queryObjectInstances(productObjectTypeId, {
            limit: 200,
            include_type_info: true,
            include_logic_params: false
        });

        const responseData = productsResponse as any;
        const primaryKeys: string[] = responseData.object_type?.primary_keys || [];
        console.log('[BOM服务] 产品对象类主键:', primaryKeys);

        const entries = productsResponse.entries || responseData.datas || [];
        const products = entries.map((item: any) => ({
            product_code: String(item.product_code || item.material_number || '').trim(),
            product_name: String(item.product_name || item.material_name || '').trim(),
            product_model: String(item.product_model || '').trim(),
            _raw: item,
            _primaryKeys: primaryKeys
        })).filter((p: any) => p.product_code);

        console.log(`[BOM服务] 产品列表: ${products.length} 个`);
        return products;
    } catch (e) {
        console.error('[BOM服务] 获取产品列表失败:', e);
        return [];
    }
}

// ============================================================================
// BOM 树构建工具
// ============================================================================

/**
 * 从平面 BOM 记录列表构建 BOM 树
 *
 * 字段映射（与 planningV2DataService 返回的 BOMRecord 一致）：
 *   parent_material_code -> 父件编码
 *   material_code        -> 子件编码
 *   material_name        -> 子件名称
 *   standard_usage       -> 单耗数量
 */
function buildTreeFromFlatRecords(productCode: string, records: any[]): BOMNode {
    if (records.length > 0) {
        console.log('[BOM服务] BOM 记录字段:', Object.keys(records[0]));
        console.log('[BOM服务] 前2条记录示例:', JSON.stringify(records.slice(0, 2), null, 2));
    }

    // 构建 childMap: parent_code -> 子件记录列表
    const childMap: Record<string, any[]> = {};
    for (const r of records) {
        const parentCode = String(r.parent_material_code || r.parent_code || '').trim();
        if (!parentCode) continue;
        if (!childMap[parentCode]) childMap[parentCode] = [];
        childMap[parentCode].push(r);
    }

    // 按 material_code 建索引，用于读取库存/单价等附加字段
    const recordByCode = new Map<string, any>();
    for (const r of records) {
        const code = String(r.material_code || r.child_code || '').trim();
        if (code && !recordByCode.has(code)) recordByCode.set(code, r);
    }

    function buildNode(
        code: string,
        name: string,
        level: number,
        parentCode: string | null,
        quantity: number,
        visited: Set<string>
    ): BOMNode {
        if (visited.has(code)) {
            console.warn(`[BOM服务] 循环引用，跳过: ${code}`);
            return makeEmptyNode(code, name, level, parentCode, quantity);
        }
        visited.add(code);

        const childRecords = childMap[code] || [];
        const children = childRecords
            .map((child: any) => {
                const childCode = String(child.material_code || child.child_code || '').trim();
                const childName = String(child.material_name || child.child_name || '').trim();
                const childQty = parseFloat(String(child.standard_usage || child.child_quantity || '1')) || 1;
                return buildNode(childCode, childName, level + 1, code, childQty, new Set(visited));
            })
            .filter((c: BOMNode) => c.code);

        visited.delete(code);

        // 库存和单价在 enrichNodes 阶段填充，这里初始化为 0
        let stockStatus: StockStatus = 'unknown';

        return {
            id: crypto.randomUUID(),
            code, name: name || code,
            level, quantity, unit: '个',
            isLeaf: children.length === 0,
            parentCode, children,
            currentStock: 0, availableStock: 0,
            stockStatus, storageDays: 0, unitPrice: 0,
            isSubstitute: false, alternativeGroup: null, primaryMaterialCode: null, substitutes: []
        };
    }

    return buildNode(productCode, productCode, 0, null, 1, new Set());
}

function makeEmptyNode(code: string, name: string, level: number, parentCode: string | null, quantity: number): BOMNode {
    return {
        id: crypto.randomUUID(), code, name: name || code,
        level, quantity, unit: '个', isLeaf: true, parentCode,
        children: [], currentStock: 0, availableStock: 0,
        stockStatus: 'unknown' as StockStatus, storageDays: 0, unitPrice: 0,
        isSubstitute: false, alternativeGroup: null, primaryMaterialCode: null, substitutes: []
    };
}

/** 统计树的汇总数据 */
function calcTreeStats(node: BOMNode, stats: { totalValue: number; stagnantCount: number; insufficientCount: number }) {
    if (node.level > 0) {
        if (node.stockStatus === 'stagnant') stats.stagnantCount++;
        if (node.stockStatus === 'insufficient') stats.insufficientCount++;
        stats.totalValue += node.currentStock * node.unitPrice;
    }
    for (const child of node.children) calcTreeStats(child, stats);
}

function countNodes(node: BOMNode): number {
    return 1 + node.children.reduce((sum, c) => sum + countNodes(c), 0);
}

/** 收集 BOM 树中所有子件物料编码（跳过根节点） */
function collectMaterialCodes(node: BOMNode): string[] {
    const codes = new Set<string>();
    function traverse(n: BOMNode) {
        if (n.level > 0 && n.code) codes.add(n.code);
        n.children.forEach(traverse);
    }
    traverse(node);
    return Array.from(codes);
}

// ============================================================================
// 库存查询（分批，与 planningV2DataService 保持一致）
// ============================================================================

interface InventoryEntry {
    currentStock: number;
    availableStock: number;
    storageDays: number;
    unitPrice: number;   // 库存对象中的单价（ERP 系统通常在库存记录里携带标准成本）
}

async function fetchInventoryMap(
    materialCodes: string[]
): Promise<Map<string, InventoryEntry>> {
    const map = new Map<string, InventoryEntry>();
    if (materialCodes.length === 0) return map;

    try {
        const typeId = getObjectTypeId('inventory', DEFAULT_IDS.inventory);
        const chunks = chunkArray(materialCodes, BATCH_CHUNK_SIZE);
        console.log(`[BOM服务] 查询库存: ${typeId}，物料数: ${materialCodes.length}，分 ${chunks.length} 批(并发${CHUNK_CONCURRENCY})`);

        const allRecords = await parallelChunks(chunks, async (chunk) => {
            const response = await ontologyApi.queryObjectInstances(typeId, {
                condition: {
                    operation: 'and',
                    sub_conditions: [{ operation: 'in', field: 'material_code', value: chunk }]
                },
                limit: 5000,
                need_total: false,
            });
            return response.entries || (response as any).datas || [];
        });

        for (const r of allRecords) {
            const code = String(r.material_code || '').trim();
            if (!code) continue;

            const currentStock   = Number(r.inventory_qty          ?? r.inventory_data    ?? r.current_stock ?? 0);
            const availableStock = Number(r.available_inventory_qty ?? r.available_quantity ?? currentStock);
            const storageDays    = r.inbound_date
                ? Math.floor((Date.now() - new Date(r.inbound_date).getTime()) / 86_400_000)
                : Number(r.inventory_age ?? r.storage_days ?? 0);
            const unitPrice = Number(
                r.unit_price ?? r.unit_cost ?? r.standard_cost ??
                r.standard_price ?? r.move_price ?? r.price ?? 0
            );

            if (map.has(code)) {
                const e = map.get(code)!;
                e.currentStock   += currentStock;
                e.availableStock += availableStock;
                e.storageDays = Math.max(e.storageDays, storageDays);
                if (e.unitPrice === 0 && unitPrice > 0) e.unitPrice = unitPrice;
            } else {
                map.set(code, { currentStock, availableStock, storageDays, unitPrice });
            }
        }

        const withPrice = Array.from(map.values()).filter(e => e.unitPrice > 0).length;
        console.log(`[BOM服务] 有效库存物料: ${map.size} 个，其中有单价: ${withPrice} 个`);
    } catch (e) {
        console.error('[BOM服务] 查询库存失败:', e);
    }
    return map;
}

// ============================================================================
// 物料单价查询（分批）
// ============================================================================

async function fetchUnitPriceMap(materialCodes: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (materialCodes.length === 0) return map;

    try {
        const typeId = getObjectTypeId('material', DEFAULT_IDS.material);
        const chunks = chunkArray(materialCodes, BATCH_CHUNK_SIZE);
        console.log(`[BOM服务] 查询物料单价: ${typeId}，物料数: ${materialCodes.length}，分 ${chunks.length} 批(并发${CHUNK_CONCURRENCY})`);

        const allRecords = await parallelChunks(chunks, async (chunk) => {
            const response = await ontologyApi.queryObjectInstances(typeId, {
                condition: {
                    operation: 'and',
                    sub_conditions: [{ operation: 'in', field: 'material_code', value: chunk }]
                },
                limit: 5000,
                need_total: false,
            });
            return response.entries || (response as any).datas || [];
        });

        for (const r of allRecords) {
            const code = String(r.material_code || '').trim();
            const price = Number(r.material_standard_price ?? r.unit_price ?? r.unit_cost ?? r.standard_price ?? 0);
            if (code) map.set(code, price);
        }

        console.log(`[BOM服务] 有单价物料: ${map.size} 个`);
    } catch (e) {
        console.error('[BOM服务] 查询物料单价失败:', e);
    }
    return map;
}

// ============================================================================
// 节点数据填充
// ============================================================================

/** 将库存和单价填充到 BOM 树节点，并更新 stockStatus */
function enrichNodes(
    node: BOMNode,
    inventoryMap: Map<string, InventoryEntry>,
    priceMap: Map<string, number>
): void {
    const inv = inventoryMap.get(node.code);

    if (inv) {
        node.currentStock   = inv.currentStock;
        node.availableStock = inv.availableStock;
        node.storageDays    = inv.storageDays;
    }

    // 单价优先级：material对象 > inventory对象 > 节点原有值
    // material 对象的 unit_price 更权威（采购价/成本价），inventory 作为兜底
    const priceFromMaterial  = priceMap.get(node.code) ?? 0;
    const priceFromInventory = inv?.unitPrice ?? 0;
    const resolvedPrice = priceFromMaterial > 0
        ? priceFromMaterial
        : priceFromInventory > 0
            ? priceFromInventory
            : node.unitPrice;
    if (resolvedPrice > 0) node.unitPrice = resolvedPrice;

    if (node.level > 0) {
        if (node.storageDays > 90)       node.stockStatus = 'stagnant';
        else if (node.currentStock > 0)  node.stockStatus = 'sufficient';
        else                             node.stockStatus = 'insufficient';
    }

    for (const child of node.children) enrichNodes(child, inventoryMap, priceMap);
}

// ============================================================================
// 主入口：直接查询 BOM 对象实例（与 planningV2DataService 保持一致）
// ============================================================================

/**
 * 通过 queryObjectInstances 直接查询 BOM 对象实例，构建单一产品的完整 BOM 树。
 *
 * 流程：
 *   1. 从产品对象的 identity 中取出真实主键字段值，作为 bom_material_code 的过滤条件
 *   2. 查询 BOM 对象（bom_material_code == primaryKeyValue），取最新 bom_version
 *   3. 精确查询最新版本的 BOM 主料（alt_priority=0）
 *   4. 并发查询库存 + 物料单价（分批，每批 100 个物料，5 路并发）
 *   5. 将库存/单价填充到树节点（enrichNodes）
 */
export async function loadSingleBOMTreeViaQueryInstances(
    productCode: string,
    identity?: any
): Promise<ProductBOMTree | null> {
    const t0 = performance.now();
    const perf: Record<string, number | string> = {};
    try {
        const bomTypeId = getObjectTypeId('bom', DEFAULT_IDS.bom);

        // ── Step 1: 从产品对象的真实主键字段取值 ────────────────────────────
        const primaryKeyFields: string[] = identity?.__primaryKeys || [];
        const primaryKeyField = primaryKeyFields[0] || '';
        const bomFilterValue = (primaryKeyField && identity?.[primaryKeyField])
            ? String(identity[primaryKeyField]).trim()
            : productCode;

        console.log(
            `[BOM服务] 加载 BOM 数据: productCode=${productCode}，` +
            `主键字段=${primaryKeyField || '(无，使用productCode)'}，` +
            `bom过滤值=${bomFilterValue}，对象类型=${bomTypeId}`
        );

        // ── Step 2: 获取最新 bom_version（小查询，仅取版本号）────
        const tVersion = performance.now();
        const versionResp = await ontologyApi.queryObjectInstances(bomTypeId, {
            condition: {
                operation: 'and',
                sub_conditions: [
                    { operation: '==', field: 'bom_material_code', value: bomFilterValue },
                ]
            },
            limit: 100,
            need_total: false,
            timeout: 120000,
        });
        const versionEntries = versionResp.entries || (versionResp as any).datas || [];
        const latestVersion = versionEntries.reduce(
            (max: string, r: any) => ((r.bom_version || '') > max ? (r.bom_version || '') : max),
            ''
        );
        perf['1_BOM版本查询'] = Math.round(performance.now() - tVersion);

        if (versionEntries.length === 0) {
            console.warn(`[BOM服务] 未找到产品 ${bomFilterValue} 的 BOM 数据`);
            return null;
        }
        if (latestVersion) {
            console.log(`[BOM服务] 最新版本: "${latestVersion}"`);
        } else {
            console.warn(`[BOM服务] API 未返回 bom_version，跳过版本过滤`);
        }

        // ── Step 3: 精确查询 BOM 主料 ──
        const tBom = performance.now();
        const step3SubConditions: any[] = [
            { operation: '==', field: 'bom_material_code', value: bomFilterValue },
            { operation: '==', field: 'alt_priority', value: 0 },
        ];
        if (latestVersion) {
            step3SubConditions.splice(1, 0, { operation: '==', field: 'bom_version', value: latestVersion });
        }
        const response = await ontologyApi.queryObjectInstances(bomTypeId, {
            condition: {
                operation: 'and',
                sub_conditions: step3SubConditions,
            },
            limit: 10000,
            need_total: false,
            timeout: 120000,
        });

        const records = response.entries || (response as any).datas || [];
        perf['2_BOM主料查询'] = Math.round(performance.now() - tBom);
        console.log(`[BOM服务] 版本 "${latestVersion}" 主料记录: ${records.length} 条`);

        // ── Step 4: 构建 BOM 树 ──────────────────────────────────────────────
        const tTree = performance.now();
        const rootNode = buildTreeFromFlatRecords(bomFilterValue, records);
        perf['3_BOM树构建(CPU)'] = Math.round(performance.now() - tTree);

        // ── Step 5: 并行查询库存 + 单价 ─────────────────────────────────────
        const materialCodes = collectMaterialCodes(rootNode);
        console.log(`[BOM服务] 并发查询库存 + 单价，物料数: ${materialCodes.length}，分片: ${Math.ceil(materialCodes.length / BATCH_CHUNK_SIZE)} 批(${CHUNK_CONCURRENCY}路并发)×2`);

        const tInvPrice = performance.now();
        const [inventoryMap, priceMap] = await Promise.all([
            fetchInventoryMap(materialCodes),
            fetchUnitPriceMap(materialCodes),
        ]);
        perf['4_库存+单价(并发)'] = Math.round(performance.now() - tInvPrice);

        // ── Step 6: 填充库存/单价到节点 ─────────────────────────────────────
        enrichNodes(rootNode, inventoryMap, priceMap);

        // ── Step 7: 汇总统计 ─────────────────────────────────────────────────
        const stats = { totalValue: 0, stagnantCount: 0, insufficientCount: 0 };
        calcTreeStats(rootNode, stats);
        const totalMaterials = countNodes(rootNode) - 1;

        perf['总耗时_ms'] = Math.round(performance.now() - t0);
        perf['BOM记录数'] = records.length;
        perf['物料编码数'] = materialCodes.length;
        perf['分片数'] = Math.ceil(materialCodes.length / BATCH_CHUNK_SIZE);
        perf['库存覆盖'] = `${inventoryMap.size}/${materialCodes.length}`;
        perf['有单价'] = `${priceMap.size}/${materialCodes.length}`;
        perf['子件数'] = totalMaterials;

        console.log(`[BOM服务] ⏱ 性能报告`);
        console.table(perf);
        console.log(
            `[BOM服务] ✅ 完成 (${(perf['总耗时_ms'] as number / 1000).toFixed(2)}s)，子件数: ${totalMaterials}，` +
            `库存覆盖: ${inventoryMap.size}/${materialCodes.length}，` +
            `有单价: ${priceMap.size}/${materialCodes.length}`
        );

        return {
            productCode,
            productName: productCode,
            productModel: '',
            rootNode,
            totalMaterials,
            totalInventoryValue: stats.totalValue,
            stagnantCount: stats.stagnantCount,
            insufficientCount: stats.insufficientCount,
        };

    } catch (error) {
        perf['总耗时_ms'] = Math.round(performance.now() - t0);
        perf['错误'] = String(error);
        console.log(`[BOM服务] ⏱ 性能报告（失败）`);
        console.table(perf);
        console.error('[BOM服务] ❌ BOM 查询失败:', error);
        return null;
    }
}
