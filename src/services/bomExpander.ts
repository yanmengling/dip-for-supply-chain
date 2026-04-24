/**
 * BOM 层级展开器
 * 
 * 递归展开 BOM 到最底层物料
 */

import type { BOMData, BOMTree, MaterialRequirement, EnhancedMaterialRequirement, SubstitutionRelation } from '../types/stagnantInventory';

/**
 * 递归展开 BOM 到最底层物料
 * 
 * @param productCode 产品/物料编码
 * @param bomData BOM 数据数组
 * @param currentQuantity 当前数量
 * @param level 当前层级
 * @param visited 已访问节点集合（防止循环引用）
 * @returns BOM 树
 */
export function expandBOM(
    productCode: string,
    bomData: BOMData[],
    currentQuantity: number = 1,
    level: number = 0,
    visited: Set<string> = new Set()
): BOMTree {
    // 防止循环引用
    if (visited.has(productCode)) {
        throw new Error(`检测到循环引用: ${productCode}`);
    }

    // 添加到已访问集合
    const newVisited = new Set(visited);
    newVisited.add(productCode);

    // 查找当前产品的所有子物料
    const children = bomData.filter(row => row.parentCode === productCode);

    // 构建树节点
    const tree: BOMTree = {
        code: productCode,
        name: children[0]?.parentName || productCode,
        quantity: currentQuantity,
        level: level,
        children: [],
        isLeaf: children.length === 0,
    };

    // 递归展开子物料
    for (const child of children) {
        // 跳过替代料（只展开主料）
        if (child.alternativePart === '替代') {
            continue;
        }

        const childQuantity = currentQuantity * child.childQuantity;

        try {
            const childTree = expandBOM(
                child.childCode,
                bomData,
                childQuantity,
                level + 1,
                newVisited
            );

            tree.children.push(childTree);
        } catch (error) {
            // 如果子节点展开失败，记录错误但继续处理其他子节点
            console.warn(`展开子节点失败: ${child.childCode}`, error);
        }
    }

    return tree;
}

/**
 * 获取所有底层物料需求（扁平化）
 * 
 * @param bomTree BOM 树
 * @returns 物料编码 -> 需求数量的映射
 */
export function getLeafMaterialRequirements(bomTree: BOMTree): Map<string, number> {
    const requirements = new Map<string, number>();

    function traverse(node: BOMTree) {
        if (node.isLeaf) {
            // 底层物料，累加数量
            const current = requirements.get(node.code) || 0;
            requirements.set(node.code, current + node.quantity);
        } else {
            // 非底层，继续递归
            for (const child of node.children) {
                traverse(child);
            }
        }
    }

    traverse(bomTree);
    return requirements;
}

/**
 * 获取详细的物料需求列表
 * 
 * @param bomTree BOM 树
 * @param materials 物料数据 Map
 * @param inventory 库存数据 Map（物料编码 -> 库存数量）
 * @returns 物料需求列表
 */
export function getMaterialRequirements(
    bomTree: BOMTree,
    materials: Map<string, any>,
    inventory: Map<string, number>
): MaterialRequirement[] {
    const leafRequirements = getLeafMaterialRequirements(bomTree);
    const requirements: MaterialRequirement[] = [];

    for (const [materialCode, requiredQuantity] of leafRequirements) {
        const material = materials.get(materialCode);
        const availableQuantity = inventory.get(materialCode) || 0;
        const shortage = Math.max(0, requiredQuantity - availableQuantity);

        requirements.push({
            materialCode,
            materialName: material?.name || materialCode,
            requiredQuantity,
            availableQuantity,
            shortage,
        });
    }

    return requirements;
}

/**
 * 打印 BOM 树（用于调试）
 * 
 * @param tree BOM 树
 * @param indent 缩进字符串
 */
export function printBOMTree(tree: BOMTree, indent: string = ''): void {
    const prefix = tree.isLeaf ? '└─' : '├─';
    console.log(`${indent}${prefix} ${tree.code} (${tree.name}) x${tree.quantity}`);

    for (let i = 0; i < tree.children.length; i++) {
        const child = tree.children[i];
        const isLast = i === tree.children.length - 1;
        const childIndent = indent + (isLast ? '  ' : '│ ');
        printBOMTree(child, childIndent);
    }
}

/**
 * 获取 BOM 树的统计信息
 * 
 * @param tree BOM 树
 * @returns 统计信息
 */
export function getBOMTreeStats(tree: BOMTree): {
    totalNodes: number;
    leafNodes: number;
    maxDepth: number;
    uniqueMaterials: number;
} {
    let totalNodes = 0;
    let leafNodes = 0;
    let maxDepth = 0;
    const uniqueMaterials = new Set<string>();

    function traverse(node: BOMTree) {
        totalNodes++;
        uniqueMaterials.add(node.code);

        if (node.isLeaf) {
            leafNodes++;
        }

        maxDepth = Math.max(maxDepth, node.level);

        for (const child of node.children) {
            traverse(child);
        }
    }

    traverse(tree);

    return {
        totalNodes,
        leafNodes,
        maxDepth: maxDepth + 1,
        uniqueMaterials: uniqueMaterials.size,
    };
}

/**
 * 获取底层物料需求（含替代料合并计算）
 * 
 * 关键逻辑：
 * 1. 对于普通物料：计算主料库存
 * 2. 对于有替代料的物料：合并主料 + 所有替代料的库存
 * 
 * @param bomTree BOM 树
 * @param inventory 库存数据 Map（物料编码 -> 库存数量）
 * @param substitutionRelations 替代料关系数组
 * @returns 物料编码 -> 增强需求信息的映射
 */
export function getLeafMaterialRequirementsWithSubstitutes(
    bomTree: BOMTree,
    inventory: Map<string, number>,
    substitutionRelations: SubstitutionRelation[]
): Map<string, EnhancedMaterialRequirement> {
    // Step 1: 获取基础物料需求
    const baseRequirements = getLeafMaterialRequirements(bomTree);

    // Step 2: 构建替代料组映射 (主料 -> 替代料列表)
    const substitutionMap = new Map<string, SubstitutionRelation[]>();
    for (const relation of substitutionRelations) {
        if (!substitutionMap.has(relation.primaryMaterialCode)) {
            substitutionMap.set(relation.primaryMaterialCode, []);
        }
        substitutionMap.get(relation.primaryMaterialCode)!.push(relation);
    }

    // Step 3: 构建增强需求
    const enhancedRequirements = new Map<string, EnhancedMaterialRequirement>();

    for (const [materialCode, requiredPerUnit] of baseRequirements) {
        const primaryAvailable = inventory.get(materialCode) || 0;
        const substitutes = substitutionMap.get(materialCode) || [];

        // 计算替代料可用库存
        const substituteAvailability = new Map<string, number>();
        let totalFromSubstitutes = 0;

        for (const sub of substitutes) {
            const subAvailable = inventory.get(sub.substituteMaterialCode) || 0;
            if (subAvailable > 0) {
                // 考虑替代比例：如果比例是 1:1，则直接使用数量
                // 如果比例是 2:1，则替代料数量需要除以比例
                const effectiveAvailable = subAvailable / sub.ratio;
                substituteAvailability.set(sub.substituteMaterialCode, effectiveAvailable);
                totalFromSubstitutes += effectiveAvailable;
            }
        }

        const totalAvailable = primaryAvailable + totalFromSubstitutes;
        const canProduce = requiredPerUnit > 0
            ? Math.floor(totalAvailable / requiredPerUnit)
            : Infinity;

        enhancedRequirements.set(materialCode, {
            materialCode,
            materialName: materialCode, // 名称需要从外部物料数据获取
            requiredPerUnit,
            availableFromPrimary: primaryAvailable,
            availableFromSubstitutes: substituteAvailability,
            totalAvailable,
            canProduce,
            hasSubstitutes: substitutes.length > 0,
        });
    }

    console.log(`✅ 替代料合并计算完成: ${enhancedRequirements.size} 种物料`);

    return enhancedRequirements;
}

/**
 * 计算考虑替代料后的最大可生产数量
 * 
 * @param enhancedRequirements 增强物料需求
 * @returns 最大可生产数量和瓶颈物料
 */
export function calculateMaxProducibleWithSubstitutes(
    enhancedRequirements: Map<string, EnhancedMaterialRequirement>
): { maxQuantity: number; bottleneckMaterial: string | null } {
    let minCanProduce = Infinity;
    let bottleneckMaterial: string | null = null;

    for (const [materialCode, req] of enhancedRequirements) {
        if (req.canProduce < minCanProduce) {
            minCanProduce = req.canProduce;
            bottleneckMaterial = materialCode;
        }
    }

    return {
        maxQuantity: minCanProduce === Infinity ? 0 : minCanProduce,
        bottleneckMaterial,
    };
}
