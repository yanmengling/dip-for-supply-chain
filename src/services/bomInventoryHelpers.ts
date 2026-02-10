/**
 * Helper functions for hybrid BOM data loading
 * These functions provide optimized BOM data loading via logical properties
 */

import { ontologyApi } from '../api/ontologyApi';
import type { ProductBOMTree, BOMNode, StockStatus } from './bomInventoryService';

// Re-export these from bomInventoryService to avoid circular dependency issues
// These will be imported from bomInventoryService when this module is used
let getObjectTypeId: (entityType: string, defaultId: string) => string;
let DEFAULT_IDS: { products: string; };

// Initialize function to set dependencies from bomInventoryService
export function initHelpers(deps: {
    getObjectTypeId: (entityType: string, defaultId: string) => string;
    DEFAULT_IDS: { products: string; };
}) {
    getObjectTypeId = deps.getObjectTypeId;
    DEFAULT_IDS = deps.DEFAULT_IDS;
}

/**
 * 递归映射后端节点到前端 BOMNode 结构
 */
// 用于为空 code 的节点生成唯一 ID
let unknownNodeCounter = 0;

function mapBackendNodeToFrontend(backendNode: any, parentCode: string | null): BOMNode {
    const id = crypto.randomUUID(); // Generate unique ID for every node

    // 兼容 material_number (从日志看是产品编码的实际字段)
    let code = String(backendNode.code || backendNode.product_code || backendNode.material_code || backendNode.material_number || '').trim();

    // 🔑 修复：为空 code 的节点生成唯一标识符
    if (!code) {
        // keep the original logic for code generation if needed for display, but strictly rely on id for keys
        code = `UNKNOWN_${++unknownNodeCounter}`;
        console.warn('[BOM服务] ⚠️ 发现空 code 的节点，已生成唯一ID:', code, '节点名称:', backendNode.name || backendNode.material_name);
    }

    const children = Array.isArray(backendNode.children)
        ? backendNode.children.map((child: any) => mapBackendNodeToFrontend(child, code))
        : [];

    const substitutes = Array.isArray(backendNode.substitutes)
        ? backendNode.substitutes.map((sub: any) => {
            // 替代料也是节点，但有一些特殊标志
            const subNode = mapBackendNodeToFrontend(sub, code);
            subNode.isSubstitute = true;
            subNode.primaryMaterialCode = code;
            return subNode;
        })
        : [];

    // 映射库存状态
    let stockStatus: StockStatus = 'unknown';
    const backendStatus = backendNode.stock_status;
    if (backendStatus === 'sufficient' || backendStatus === 'insufficient' || backendStatus === 'stagnant') {
        stockStatus = backendStatus;
    }

    return {
        id: id,
        code: code,
        name: String(backendNode.name || backendNode.material_name || 'Unknown Material'),
        level: Number(backendNode.level || 0),
        quantity: Number(backendNode.quantity || 0),
        unit: String(backendNode.unit || '个'),
        isLeaf: children.length === 0,
        parentCode: parentCode,
        children: children,

        // 库存信息
        currentStock: Number(backendNode.current_stock || 0),
        availableStock: Number(backendNode.available_stock || 0),
        stockStatus: stockStatus,
        storageDays: Number(backendNode.storage_days || 0),
        unitPrice: Number(backendNode.unit_price || 0),

        // 替代料信息
        isSubstitute: false,
        alternativeGroup: null,
        primaryMaterialCode: null,
        substitutes: substitutes
    };
}

/**
 * 通过 product_bom 逻辑属性加载BOM数据（优化方式）
 * @returns 包含产品和BOM树的对象，如果失败返回 null
 */
export async function loadBOMDataViaLogicProperty() {
    try {
        console.log('[BOM服务] 🚀 尝试通过 product_bom 逻辑属性加载数据...');
        const startTime = Date.now();

        // 重置空节点计数器
        unknownNodeCounter = 0;

        const productObjectTypeId = getObjectTypeId('product', DEFAULT_IDS.products);
        console.log('[BOM服务] 📌 使用的产品对象类型ID:', productObjectTypeId);

        // Debug: Inspect logic property definition and get primary keys
        let identityKey = 'product_code'; // 默认使用 product_code
        try {
            console.log(`[BOM服务] 🔍 正在检查 ${productObjectTypeId} 的逻辑属性定义...`);
            const objectTypeRaw = await ontologyApi.getObjectType(productObjectTypeId, true);
            // 类型断言，因为 getObjectType 返回的是 any 或者 ObjectType
            const objectType = objectTypeRaw as any;

            if (objectType && objectType.logic_properties) {
                const bomProp = objectType.logic_properties.find((p: any) => p.name === 'product_bom');
                if (bomProp) {
                    console.log('[BOM服务] 📋 product_bom 定义:', JSON.stringify(bomProp, null, 2));
                } else {
                    console.warn('[BOM服务] ⚠️ 未找到 product_bom 逻辑属性定义');
                }
            }

            // 🔑 关键修复：获取 primary_keys 以正确构建 unique_identities
            if (objectType && objectType.primary_keys && objectType.primary_keys.length > 0) {
                identityKey = objectType.primary_keys[0];
                console.log(`[BOM服务] 🔑 使用对象类型的主键: ${identityKey}`);
            } else {
                console.log(`[BOM服务] ⚠️ 未找到 primary_keys，使用默认值: ${identityKey}`);
            }
        } catch (e) {
            console.warn('[BOM服务] ⚠️ 无法获取对象类型定义:', e);
        }

        // 首先加载所有产品实例以获取产品列表
        const productsResponse = await ontologyApi.queryObjectInstances(productObjectTypeId, {
            limit: 50, // Reduce to avoid 500 Error
            include_type_info: false, // Simplify response to reduce backend load
            include_logic_params: false
        });

        const products = (productsResponse.entries || []).map((item: any) => ({
            // 兼容不同的字段名: material_number 是产品编码的实际字段名
            product_code: String(item.product_code || item.material_number || '').trim(),
            material_number: String(item.material_number || item.product_code || '').trim(),
            // material_name 是产品名称的实际映射字段
            product_name: String(item.product_name || item.material_name || '').trim(),
            product_model: String(item.product_model || '').trim(),
            // 保留原始数据以便使用正确的主键字段
            _raw: item
        }));

        if (products.length === 0) {
            console.warn('[BOM服务] ⚠️ 未找到产品数据');
            return null;
        }

        console.log(`[BOM服务] 📦 加载了 ${products.length} 个产品`);

        // 构建 unique_identities 用于查询逻辑属性
        // 🔑 关键修复：使用动态的 identityKey（从 primary_keys 获取）并使用对应的字段值
        const uniqueIdentities = products
            .filter(p => {
                // 根据 identityKey 检查对应的字段是否存在
                const fieldValue = p._raw[identityKey] || (p as any)[identityKey];
                return !!fieldValue;
            })
            .map(p => {
                // 使用原始数据中的字段值，确保字段名和值都匹配
                const fieldValue = String(p._raw[identityKey] || (p as any)[identityKey] || '').trim();
                return {
                    [identityKey]: fieldValue
                };
            });

        if (uniqueIdentities.length === 0) {
            console.warn('[BOM服务] ⚠️ 所有产品的编码都为空，无法查询BOM');
            return { products, preBuiltTrees: [] };
        }

        // 查询 product_bom 逻辑属性值
        console.log('[BOM服务] 📊 查询 product_bom 逻辑属性值...', uniqueIdentities.length, '个');
        console.log('[BOM服务] 🔍 使用的 identityKey:', identityKey);
        console.log('[BOM服务] 📝 示例 unique_identity:', uniqueIdentities[0]);

        // 获取当前的知识网络ID，确保没有前导空格
        const knId = ontologyApi.getKnowledgeNetworkId().trim();
        console.log('[BOM服务] 🌐 使用的知识网络ID:', knId);

        // 🔑 关键修复：算子逻辑属性需要 dynamic_params
        // 根据错误信息，至少需要提供 cache 参数
        // Batching requests to avoid "Sandbox pool full"
        const BATCH_SIZE = 5; // 每批只处理5个产品,避免后端过载
        const totalItems = uniqueIdentities.length;
        const allPropertyValues: Record<string, any> = {};

        console.log(`[BOM服务] 开始分批加载数据,总数: ${totalItems}, 每批: ${BATCH_SIZE}`);

        for (let i = 0; i < totalItems; i += BATCH_SIZE) {
            const batchIdentities = uniqueIdentities.slice(i, i + BATCH_SIZE);
            const batchNumber = Math.floor(i / BATCH_SIZE) + 1;
            const totalBatches = Math.ceil(totalItems / BATCH_SIZE);

            console.log(`[BOM服务] 正在加载第 ${batchNumber}/${totalBatches} 批 (${batchIdentities.length} 个)...`);

            try {
                // Prepare product codes for this batch to tell the backend script to only fetch these
                const batchProductCodes = batchIdentities
                    .map(id => id[identityKey])
                    .filter(code => code); // Ensure no empty codes

                const batchResponse = await ontologyApi.queryObjectPropertyValues(
                    productObjectTypeId,
                    {
                        unique_identities: batchIdentities,
                        properties: ['product_bom'],
                        dynamic_params: {
                            product_bom: {
                                cache: true,
                                knowledge_network_id: knId,
                                // Pass product_codes to the backend script to avoid fetching ALL products
                                // logic property usually receives these parameters in the event object
                                product_codes: batchProductCodes
                            }
                        }
                    }
                );

                // Merge batch results
                if (batchResponse) {
                    Object.assign(allPropertyValues, batchResponse);
                }

                // 添加延迟以避免后端过载
                // 除了最后一批,每批之间等待500ms
                if (i + BATCH_SIZE < totalItems) {
                    console.log(`[BOM服务] 等待500ms后继续下一批...`);
                    await new Promise(resolve => setTimeout(resolve, 500));
                }

            } catch (batchError) {
                console.error(`[BOM服务] ⚠️ 第 ${batchNumber} 批加载失败:`, batchError);
                // Continue to next batch instead of failing completely? 
                // For now, let's log and continue, maybe some partial data is better than none.
            }
        }

        const propertyValuesResponse = allPropertyValues;

        // 解析响应数据
        // 🔑 关键修复：API可能返回 datas 或 entries 字段
        const responseData = (propertyValuesResponse as any).datas || propertyValuesResponse.entries || [];
        console.log(`[BOM服务] 📊 收到 ${responseData.length} 个产品的BOM数据`);

        // 检查返回的数据结构
        const preBuiltTrees: ProductBOMTree[] = [];
        // Track processed product codes to avoid duplicates
        const processedProductCodes = new Set<string>();

        for (const entry of responseData) {
            const productBomData = entry.product_bom;

            if (!productBomData) {
                console.warn('[BOM服务] ⚠️ Entry中没有 product_bom 数据:', JSON.stringify(entry).substring(0, 200));
                continue;
            }

            // 🔍 检查算子执行状态
            if (productBomData.result) {
                const resultCode = productBomData.result.code;
                const resultMessage = productBomData.result.message;
                const stdout = productBomData.stdout || '';

                if (resultCode !== 0 || stdout.includes('失败') || stdout.includes('Error')) {
                    console.error('[BOM服务] ❌ 算子执行失败:', {
                        code: resultCode,
                        message: resultMessage,
                        stdout: stdout.substring(0, 500)
                    });
                }
            }

            // 情况A: 后端直接返回构建好的树结构
            // 🔑 关键修复：实际路径是 productBomData.result.data.trees（算子返回格式）
            const trees = productBomData.result?.data?.trees || productBomData.data?.trees;

            if (trees && Array.isArray(trees)) {
                // 处理每个返回的树
                for (const treeData of trees) {
                    if (treeData.root_node) {
                        try {
                            // Determine product code
                            const productCode = String(treeData.product_code || treeData.material_number || '').trim();

                            // 🛑 De-duplication check
                            if (productCode && processedProductCodes.has(productCode)) {
                                continue;
                            }

                            // If code is empty, we can't reliably deduplicate by code, but we should try to process it
                            // However, empty code products are problematic anyway.

                            const rootNode = mapBackendNodeToFrontend(treeData.root_node, null);

                            // 读取统计信息
                            const stats = treeData.statistics || {};

                            const tree: ProductBOMTree = {
                                // 🔑 关键修复：优先使用 product_code（用户提示的字段）
                                productCode: productCode,
                                productName: String(treeData.product_name || treeData.material_name || ''),
                                productModel: '', // 后端可能没返回模型，使用空字符串
                                rootNode: rootNode,
                                totalMaterials: Number(stats.total_materials || 0),
                                totalInventoryValue: Number(stats.total_inventory_value || 0),
                                stagnantCount: Number(stats.stagnant_count || 0),
                                insufficientCount: Number(stats.insufficient_count || 0)
                            };

                            preBuiltTrees.push(tree);

                            if (productCode) {
                                processedProductCodes.add(productCode);
                            }

                        } catch (e) {
                            console.error('[BOM服务] 解析树结构失败:', e);
                        }
                    }
                }
            } else {
                // 尝试打印实际的数据结构以便调试
                console.warn('[BOM服务] ⚠️ product_bom 数据结构不符合预期:', JSON.stringify(productBomData).substring(0, 500));
            }
        }

        const elapsed = Date.now() - startTime;
        console.log(`[BOM服务] ✅ 通过逻辑属性加载完成 (耗时 ${(elapsed / 1000).toFixed(2)}s)`);

        if (preBuiltTrees.length > 0) {
            console.log(`[BOM服务] 🌳 解析到 ${preBuiltTrees.length} 个预构建BOM树`);
            return {
                products,
                preBuiltTrees
            };
        } else {
            // 如果上面两种都没有，可能是解析路径不对，打印一下第一个entry结构方便调试
            if (responseData.length > 0) {
                console.warn('[BOM服务] ⚠️ 未识别的数据结构，首个Entry示例:', JSON.stringify(responseData[0]).substring(0, 500));
            }
            // 返回空树而不是null，表明请求成功但无数据，或者保持null表明"未找到有效数据"
            return null;
        }

    } catch (error) {
        console.error('[BOM服务] ❌ 通过逻辑属性加载失败:', error);
        return null;
    }
}
