/**
 * 替代料选择引擎
 * 
 * 根据主料缺口选择最优替代料
 */

import type {
    MaterialData,
    SubstitutionRelation,
    SubstitutionDecision,
} from '../types/stagnantInventory';

/**
 * 替代料候选项
 */
interface SubstitutionCandidate {
    relation: SubstitutionRelation;
    material: MaterialData;
    requiredQuantity: number;
    score: number;
}

/**
 * 替代料选择器
 */
export class SubstituteMaterialSelector {
    /**
     * 选择最优替代料
     * 
     * @param primaryMaterial 主料
     * @param shortage 缺口数量
     * @param availableSubstitutes 可用的替代料关系
     * @param materials 所有物料数据
     * @param inventory 库存数据（物料编码 -> 库存数量）
     * @param preferStagnant 是否优先选择呆滞料
     * @returns 替代料决策，如果没有合适的替代料则返回 null
     */
    selectBestSubstitute(
        primaryMaterial: MaterialData,
        shortage: number,
        availableSubstitutes: SubstitutionRelation[],
        materials: Map<string, MaterialData>,
        inventory: Map<string, number>,
        preferStagnant: boolean = true
    ): SubstitutionDecision | null {
        const candidates: SubstitutionCandidate[] = [];

        // 步骤 1: 评估每个替代料方案
        for (const sub of availableSubstitutes) {
            const substituteMaterial = materials.get(sub.substituteMaterialCode);
            if (!substituteMaterial) continue;

            const requiredQuantity = shortage * sub.ratio;
            const availableQuantity = inventory.get(sub.substituteMaterialCode) || 0;

            // 只考虑库存充足的替代料
            if (availableQuantity >= requiredQuantity) {
                const score = this.calculateSubstitutionScore(
                    sub,
                    substituteMaterial,
                    requiredQuantity,
                    availableQuantity,
                    preferStagnant
                );

                candidates.push({
                    relation: sub,
                    material: substituteMaterial,
                    requiredQuantity,
                    score,
                });
            }
        }

        // 步骤 2: 按评分排序
        candidates.sort((a, b) => b.score - a.score);

        // 步骤 3: 返回最优方案
        if (candidates.length > 0) {
            const best = candidates[0];
            return {
                primaryMaterial,
                substituteMaterial: best.material,
                substitutionRatio: best.relation.ratio,
                primaryUsed: 0,
                substituteUsed: best.requiredQuantity,
                reason: this.generateReason(best, preferStagnant),
                costImpact: best.requiredQuantity * best.relation.costDifference,
                stagnantValueConsumed: best.material.isStagnant
                    ? best.requiredQuantity * best.material.unitPrice
                    : 0,
            };
        }

        return null;
    }

    /**
     * 计算替代料评分
     * 
     * 评分规则:
     * - 呆滞料 +50 分
     * - 替代比例接近 1:1 +30 分
     * - 成本低 +20 分
     * - 库存充足 +10 分
     * - 优先级加成
     * 
     * @param relation 替代料关系
     * @param material 替代料物料信息
     * @param requiredQuantity 需求数量
     * @param availableQuantity 可用数量
     * @param preferStagnant 是否优先呆滞料
     * @returns 评分（0-100+）
     */
    private calculateSubstitutionScore(
        relation: SubstitutionRelation,
        material: MaterialData,
        requiredQuantity: number,
        availableQuantity: number,
        preferStagnant: boolean
    ): number {
        let score = 0;

        // 1. 呆滞料优先（最高权重）
        if (preferStagnant && material.isStagnant) {
            score += 50;
        }

        // 2. 替代比例接近 1:1
        const ratioDiff = Math.abs(relation.ratio - 1.0);
        score += Math.max(0, 30 - ratioDiff * 30);

        // 3. 成本差异
        if (relation.costDifference <= 0) {
            // 替代料更便宜或同价
            score += 20;
        } else {
            // 替代料更贵，根据差异扣分
            score += Math.max(0, 20 - relation.costDifference / 10);
        }

        // 4. 库存充足度
        const stockRatio = availableQuantity / requiredQuantity;
        score += Math.min(10, stockRatio * 5);

        // 5. 优先级加成
        score += relation.priority;

        return score;
    }

    /**
     * 生成替代原因说明
     * 
     * @param candidate 替代料候选项
     * @param preferStagnant 是否优先呆滞料
     * @returns 原因说明
     */
    private generateReason(
        candidate: SubstitutionCandidate,
        preferStagnant: boolean
    ): string {
        const reasons: string[] = [];

        if (candidate.material.isStagnant) {
            reasons.push('消纳呆滞库存');
        }

        if (Math.abs(candidate.relation.ratio - 1.0) < 0.1) {
            reasons.push('替代比例接近1:1');
        }

        if (candidate.relation.costDifference <= 0) {
            reasons.push('成本更低');
        }

        return reasons.join(', ') || '库存充足';
    }
}

// 创建单例实例
export const substitutionSelector = new SubstituteMaterialSelector();
