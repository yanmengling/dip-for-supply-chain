/**
 * 多产品优化器
 * 
 * 使用贪心算法解决多产品物料竞争问题
 * 目标：最大化呆滞库存消纳价值
 */

import type {
    MaterialData,
    ProductData,
    BOMData,
} from '../types/stagnantInventory';
import { expandBOM, getLeafMaterialRequirements } from './bomExpander';

/**
 * 产品分配结果
 */
export interface ProductAllocation {
    product: ProductData;
    quantity: number;
    consumedValue: number;
    consumedMaterials: Map<string, number>; // 物料编码 -> 消耗数量
}

/**
 * 优化结果
 */
export interface OptimizationResult {
    productMix: ProductAllocation[];
    totalConsumedValue: number;
    unconsumedMaterials: Array<{
        material: MaterialData;
        remainingQuantity: number;
        remainingValue: number;
    }>;
    optimizationScore: number; // 0-100 分数
}

/**
 * 多产品优化器
 */
export class MultiProductOptimizer {

    /**
     * 使用贪心算法优化产品组合
     * 
     * 策略：按消纳价值密度（单件产品消纳价值）排序，
     * 优先生产消纳效益最高的产品
     * 
     * @param products 可选产品列表
     * @param bomData BOM 数据
     * @param inventory 库存数据 (物料编码 -> 库存数量)
     * @param materials 物料信息 Map
     * @returns 优化结果
     */
    optimizeProductMix(
        products: ProductData[],
        bomData: BOMData[],
        inventory: Map<string, number>,
        materials: Map<string, MaterialData>
    ): OptimizationResult {
        console.log('🎯 开始多产品优化分析...');
        console.log(`   - 候选产品: ${products.length} 个`);
        console.log(`   - 库存物料: ${inventory.size} 种`);

        // 复制库存（用于模拟消耗）
        const remainingInventory = new Map(inventory);

        // 计算每个产品的消纳价值密度
        const productScores: Array<{
            product: ProductData;
            bomRequirements: Map<string, number>;
            consumptionValuePerUnit: number;
            maxProducible: number;
        }> = [];

        for (const product of products) {
            try {
                const bomTree = expandBOM(product.code, bomData, 1);
                const requirements = getLeafMaterialRequirements(bomTree);

                // 计算单件产品消纳的库存价值
                let consumptionValuePerUnit = 0;
                let maxProducible = Infinity;

                for (const [materialCode, requiredPerUnit] of requirements) {
                    const available = remainingInventory.get(materialCode) || 0;
                    const material = materials.get(materialCode);

                    if (available > 0 && material) {
                        // 计算这个物料对单件产品的消纳贡献
                        const consumedPerUnit = Math.min(requiredPerUnit, available);
                        consumptionValuePerUnit += consumedPerUnit * material.unitPrice;
                    }

                    if (requiredPerUnit > 0) {
                        const canMake = Math.floor(available / requiredPerUnit);
                        maxProducible = Math.min(maxProducible, canMake);
                    }
                }

                if (maxProducible > 0 && consumptionValuePerUnit > 0) {
                    productScores.push({
                        product,
                        bomRequirements: requirements,
                        consumptionValuePerUnit,
                        maxProducible: maxProducible === Infinity ? 0 : maxProducible,
                    });
                }
            } catch (err) {
                console.warn(`⚠️ 产品 ${product.code} BOM 展开失败:`, err);
            }
        }

        // 按消纳价值密度排序（降序）
        productScores.sort((a, b) => b.consumptionValuePerUnit - a.consumptionValuePerUnit);

        console.log('📊 产品消纳价值密度排序:');
        for (const ps of productScores) {
            console.log(`   ${ps.product.code}: ¥${ps.consumptionValuePerUnit.toFixed(2)}/件, 最多可生产 ${ps.maxProducible} 件`);
        }

        // 贪心分配：按顺序分配库存给产品
        const allocations: ProductAllocation[] = [];
        let totalConsumedValue = 0;

        for (const ps of productScores) {
            // 重新计算当前剩余库存下的最大可生产量
            let maxWithCurrentInventory = Infinity;

            for (const [materialCode, requiredPerUnit] of ps.bomRequirements) {
                if (requiredPerUnit > 0) {
                    const available = remainingInventory.get(materialCode) || 0;
                    const canMake = Math.floor(available / requiredPerUnit);
                    maxWithCurrentInventory = Math.min(maxWithCurrentInventory, canMake);
                }
            }

            if (maxWithCurrentInventory === Infinity || maxWithCurrentInventory <= 0) {
                continue;
            }

            // 分配生产
            const quantity = maxWithCurrentInventory;
            const consumedMaterials = new Map<string, number>();
            let consumedValue = 0;

            for (const [materialCode, requiredPerUnit] of ps.bomRequirements) {
                const toConsume = requiredPerUnit * quantity;
                const available = remainingInventory.get(materialCode) || 0;
                const actualConsumed = Math.min(toConsume, available);

                if (actualConsumed > 0) {
                    consumedMaterials.set(materialCode, actualConsumed);
                    remainingInventory.set(materialCode, available - actualConsumed);

                    const material = materials.get(materialCode);
                    if (material) {
                        consumedValue += actualConsumed * material.unitPrice;
                    }
                }
            }

            allocations.push({
                product: ps.product,
                quantity,
                consumedValue,
                consumedMaterials,
            });

            totalConsumedValue += consumedValue;
            console.log(`✅ 分配 ${ps.product.code}: ${quantity} 件, 消纳 ¥${consumedValue.toFixed(2)}`);
        }

        // 计算未消纳的物料
        const unconsumedMaterials: OptimizationResult['unconsumedMaterials'] = [];
        for (const [materialCode, remainingQty] of remainingInventory) {
            if (remainingQty > 0) {
                const material = materials.get(materialCode);
                if (material) {
                    unconsumedMaterials.push({
                        material,
                        remainingQuantity: remainingQty,
                        remainingValue: remainingQty * material.unitPrice,
                    });
                }
            }
        }

        // 按剩余价值排序
        unconsumedMaterials.sort((a, b) => b.remainingValue - a.remainingValue);

        // 计算优化分数
        const originalValue = Array.from(inventory.entries()).reduce((sum, [code, qty]) => {
            const mat = materials.get(code);
            return sum + (mat ? qty * mat.unitPrice : 0);
        }, 0);
        const optimizationScore = originalValue > 0
            ? Math.round((totalConsumedValue / originalValue) * 100)
            : 0;

        console.log('📈 优化结果:');
        console.log(`   - 消纳总价值: ¥${totalConsumedValue.toLocaleString()}`);
        console.log(`   - 未消纳物料: ${unconsumedMaterials.length} 种`);
        console.log(`   - 优化分数: ${optimizationScore}%`);

        return {
            productMix: allocations,
            totalConsumedValue,
            unconsumedMaterials,
            optimizationScore,
        };
    }
}

// 创建单例实例
export const multiProductOptimizer = new MultiProductOptimizer();
