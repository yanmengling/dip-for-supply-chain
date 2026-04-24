/**
 * 库存优化自动分析器
 * 
 * 自动分析所有库存物料，匹配产品 BOM，生成优化方案推荐
 */

import type {
    MaterialData,
    ProductData,
    BOMData,
    ProductionPlan,
} from '../types/stagnantInventory';
import { expandBOM, getLeafMaterialRequirements } from './bomExpander';

/**
 * 产品优化分析结果
 */
export interface ProductOptimizationResult {
    product: ProductData;

    // 库存消纳指标
    consumableValue: number;        // 可消纳的库存价值
    consumptionRate: number;        // 消纳率 (%)
    matchedMaterialCount: number;   // 匹配的库存物料数量
    totalBOMMaterialCount: number;  // BOM 总物料数量

    // 生产指标
    maxProducibleQuantity: number;  // 最大可生产数量（消耗完所有库存）
    minProducibleQuantity: number;  // 最小可生产数量（不补料）

    // 成本指标
    supplementCost: number;         // 补料成本（按最大可生产数量）
    outputValue: number;            // 产出价值
    roi: number;                    // ROI

    // 涉及的物料
    involvedMaterials: MaterialData[];

    // 是否推荐
    isRecommended: boolean;
    recommendReason: string;
}

/**
 * 库存优化分析器
 */
export class InventoryOptimizationAnalyzer {

    /**
     * 分析所有产品，生成优化方案
     */
    analyzeAllProducts(
        allMaterials: Map<string, MaterialData>,
        products: ProductData[],
        bomData: BOMData[]
    ): ProductOptimizationResult[] {
        console.log('🔍 开始自动分析库存优化方案...');
        console.log(`- 库存物料: ${allMaterials.size} 种`);
        console.log(`- 产品: ${products.length} 个`);
        console.log(`- BOM 记录: ${bomData.length} 条`);

        // 获取所有有库存的物料
        const inventoryMaterials = new Map<string, MaterialData>();
        let totalInventoryValue = 0;

        for (const [code, material] of allMaterials) {
            if ((material.currentStock || 0) > 0) {
                inventoryMaterials.set(code, material);
                totalInventoryValue += (material.currentStock || 0) * material.unitPrice;
            }
        }

        console.log(`📦 有库存的物料: ${inventoryMaterials.size} 种`);
        console.log(`💰 库存总价值: ¥${totalInventoryValue.toLocaleString()}`);

        const results: ProductOptimizationResult[] = [];

        // 遍历每个产品进行分析
        for (const product of products) {
            console.log(`\n📋 分析产品: ${product.code} (${product.name})`);

            try {
                const result = this.analyzeProduct(
                    product,
                    bomData,
                    allMaterials,
                    inventoryMaterials,
                    totalInventoryValue
                );
                results.push(result);
            } catch (error) {
                console.error(`  ❌ 分析失败:`, error);
            }
        }

        // 按可消纳价值排序
        results.sort((a, b) => b.consumableValue - a.consumableValue);

        // 标记推荐方案
        if (results.length > 0) {
            results[0].isRecommended = true;
            results[0].recommendReason = '可消纳库存价值最高';
        }

        console.log('\n✅ 分析完成，共生成', results.length, '个优化方案');

        return results;
    }

    /**
     * 分析单个产品
     */
    private analyzeProduct(
        product: ProductData,
        bomData: BOMData[],
        allMaterials: Map<string, MaterialData>,
        inventoryMaterials: Map<string, MaterialData>,
        totalInventoryValue: number
    ): ProductOptimizationResult {
        // 展开 BOM
        const bomTree = expandBOM(product.code, bomData, 1);
        const leafRequirements = getLeafMaterialRequirements(bomTree);

        console.log(`  BOM 底层物料: ${leafRequirements.size} 种`);

        // 分析每个 BOM 物料
        let consumableValue = 0;
        let matchedCount = 0;
        const involvedMaterials: MaterialData[] = [];

        // 计算可生产数量
        let maxQuantity = 0;  // 消耗完某个库存物料需要的最大数量
        let minQuantity = Infinity;  // 受限于库存最少的物料
        let hasAnyInventory = false;

        for (const [materialCode, requiredPerUnit] of leafRequirements) {
            const material = allMaterials.get(materialCode);
            if (!material) continue;

            const availableStock = material.currentStock || 0;

            if (availableStock > 0) {
                hasAnyInventory = true;
                matchedCount++;
                involvedMaterials.push(material);
                consumableValue += availableStock * material.unitPrice;

                if (requiredPerUnit > 0) {
                    // 消耗完这个物料需要生产多少件
                    const neededToConsumeAll = Math.ceil(availableStock / requiredPerUnit);
                    maxQuantity = Math.max(maxQuantity, neededToConsumeAll);

                    // 受限于这个物料能生产多少件
                    const canProduceWithThis = Math.floor(availableStock / requiredPerUnit);
                    minQuantity = Math.min(minQuantity, canProduceWithThis);
                }
            } else {
                // 无库存物料，不补料的话限制生产
                minQuantity = 0;
            }
        }

        if (!hasAnyInventory) {
            maxQuantity = 0;
        }
        if (minQuantity === Infinity) {
            minQuantity = 0;
        }

        console.log(`  匹配物料: ${matchedCount}/${leafRequirements.size}`);
        console.log(`  可消纳价值: ¥${consumableValue.toLocaleString()}`);
        console.log(`  最大可生产: ${maxQuantity} 件, 最小可生产: ${minQuantity} 件`);

        // 计算补料成本（按最大可生产数量）
        let supplementCost = 0;
        for (const [materialCode, requiredPerUnit] of leafRequirements) {
            const material = allMaterials.get(materialCode);
            if (!material) continue;

            const totalRequired = requiredPerUnit * maxQuantity;
            const availableStock = material.currentStock || 0;
            const shortage = Math.max(0, totalRequired - availableStock);

            supplementCost += shortage * material.unitPrice;
        }

        // 计算产出价值和 ROI
        const outputValue = maxQuantity * product.amount;
        const roi = supplementCost > 0 ? (outputValue - supplementCost) / supplementCost : Infinity;

        // 计算消纳率
        const consumptionRate = totalInventoryValue > 0
            ? (consumableValue / totalInventoryValue) * 100
            : 0;

        return {
            product,
            consumableValue,
            consumptionRate,
            matchedMaterialCount: matchedCount,
            totalBOMMaterialCount: leafRequirements.size,
            maxProducibleQuantity: maxQuantity,
            minProducibleQuantity: minQuantity,
            supplementCost,
            outputValue,
            roi,
            involvedMaterials,
            isRecommended: false,
            recommendReason: '',
        };
    }
}

// 创建单例实例
export const inventoryOptimizationAnalyzer = new InventoryOptimizationAnalyzer();
