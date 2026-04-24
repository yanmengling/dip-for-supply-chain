/**
 * 替代料关系解析器
 * 
 * 从 BOM 数据中提取和解析替代料关系
 */

import type { BOMData, MaterialData, SubstitutionRelation } from '../types/stagnantInventory';

/**
 * 解析替代料关系
 * 
 * @param bomData BOM 数据数组
 * @param materials 物料数据 Map
 * @returns 替代料关系数组
 */
export function parseSubstitutionRelations(
    bomData: BOMData[],
    materials: Map<string, MaterialData>
): SubstitutionRelation[] {
    const relations: SubstitutionRelation[] = [];

    // 步骤 1: 按 alternative_group 分组
    const groupedByAltGroup = new Map<string, BOMData[]>();

    for (const row of bomData) {
        // 只处理有 alternative_group 的行
        if (row.alternativeGroup && row.alternativeGroup.trim() !== '') {
            // 使用 parent_code + alternative_group 作为唯一键
            const groupKey = `${row.parentCode}_${row.alternativeGroup}`;

            if (!groupedByAltGroup.has(groupKey)) {
                groupedByAltGroup.set(groupKey, []);
            }

            groupedByAltGroup.get(groupKey)!.push(row);
        }
    }

    // 步骤 2: 识别主料和替代料
    for (const [groupKey, rows] of groupedByAltGroup) {
        // 找到主料（alternative_part 为空）
        const primary = rows.find(r => !r.alternativePart || r.alternativePart.trim() === '');

        // 找到所有替代料（alternative_part = "替代"）
        const substitutes = rows.filter(r => r.alternativePart === '替代');

        if (primary && substitutes.length > 0) {
            for (const sub of substitutes) {
                // 计算替代比例
                const ratio = sub.childQuantity / primary.childQuantity;

                // 获取物料信息以计算成本差异
                const primaryMaterial = materials.get(primary.childCode);
                const substituteMaterial = materials.get(sub.childCode);

                const costDifference = substituteMaterial && primaryMaterial
                    ? substituteMaterial.unitPrice - primaryMaterial.unitPrice
                    : 0;

                relations.push({
                    primaryMaterialCode: primary.childCode,
                    substituteMaterialCode: sub.childCode,
                    ratio: ratio,
                    priority: 5,  // 默认优先级
                    costDifference: costDifference,
                    applicableScenarios: [primary.parentCode],
                });
            }
        }
    }

    console.log(`✅ 解析替代料关系: ${relations.length} 条`);
    return relations;
}

/**
 * 获取物料的所有替代料
 * 
 * @param materialCode 主料编码
 * @param relations 替代料关系数组
 * @returns 该物料的所有替代料关系
 */
export function getSubstitutes(
    materialCode: string,
    relations: SubstitutionRelation[]
): SubstitutionRelation[] {
    return relations.filter(r => r.primaryMaterialCode === materialCode);
}

/**
 * 检查物料是否可以被替代
 * 
 * @param materialCode 物料编码
 * @param relations 替代料关系数组
 * @returns 是否有替代料
 */
export function hasSubstitutes(
    materialCode: string,
    relations: SubstitutionRelation[]
): boolean {
    return relations.some(r => r.primaryMaterialCode === materialCode);
}

/**
 * 检查物料是否是替代料
 * 
 * @param materialCode 物料编码
 * @param relations 替代料关系数组
 * @returns 是否是替代料
 */
export function isSubstitute(
    materialCode: string,
    relations: SubstitutionRelation[]
): boolean {
    return relations.some(r => r.substituteMaterialCode === materialCode);
}

/**
 * 获取物料可以替代的主料列表
 * 
 * @param materialCode 替代料编码
 * @param relations 替代料关系数组
 * @returns 可以替代的主料关系
 */
export function getCanSubstituteFor(
    materialCode: string,
    relations: SubstitutionRelation[]
): SubstitutionRelation[] {
    return relations.filter(r => r.substituteMaterialCode === materialCode);
}
