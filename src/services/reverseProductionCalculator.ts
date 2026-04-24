/**
 * 逆向生产计算器
 * 
 * 计算两种生产方案：
 * - 方案 A: 最大化消纳（消耗完选中的库存，缺的物料采购）
 * - 方案 B: 最小化余料（只用现有库存，不采购任何物料）
 * 
 * 📝 业务逻辑：
 * - 目标是消耗掉仓库里的库存物料
 * - 无库存的物料需要根据BOM需求采购（方案A）或限制生产（方案B）
 */

import type {
    MaterialData,
    ProductData,
    BOMData,
    SubstitutionRelation,
    ProductionPlan,
    MaterialUsage,
    MaterialSupplement,
    SubstitutionDecision,
} from '../types/stagnantInventory';
import { expandBOM, getLeafMaterialRequirements } from './bomExpander';
import { SubstituteMaterialSelector } from './substitutionSelector';

/**
 * MOQ 分析结果
 */
export interface MOQAnalysisResult {
    materialCode: string;        // 物料编码
    materialName: string;        // 物料名称
    shortage: number;            // 缺口数量
    moq: number;                 // 最小起订量
    orderQuantity: number;       // 实际订货量（>= MOQ 的倍数）
    excess: number;              // 过剩数量（订货量 - 缺口）
    excessValue: number;         // 过剩金额
    unitPrice: number;           // 单价
}

/**
 * 逆向生产计算器
 */
export class ReverseProductionCalculator {
    private substitutionSelector: SubstituteMaterialSelector;

    constructor() {
        this.substitutionSelector = new SubstituteMaterialSelector();
    }

    /**
     * MOQ 感知补料分析
     * 
     * 分析达到目标产量需要补充的物料，考虑 MOQ 约束
     * 
     * @param targetQuantity 目标生产数量
     * @param bomRequirements BOM 物料需求 (物料编码 -> 单位需求量)
     * @param inventory 当前库存 (物料编码 -> 库存数量)
     * @param moqData MOQ 数据 (物料编码 -> MOQ)
     * @param materials 物料信息
     * @returns MOQ 分析结果数组
     */
    calculateWithMOQ(
        targetQuantity: number,
        bomRequirements: Map<string, number>,
        inventory: Map<string, number>,
        moqData: Map<string, number>,
        materials: Map<string, MaterialData>
    ): MOQAnalysisResult[] {
        const results: MOQAnalysisResult[] = [];
        let totalExcessValue = 0;

        for (const [materialCode, requiredPerUnit] of bomRequirements) {
            const totalRequired = requiredPerUnit * targetQuantity;
            const available = inventory.get(materialCode) || 0;
            const shortage = Math.max(0, totalRequired - available);

            if (shortage > 0) {
                const moq = moqData.get(materialCode) || 1;
                const material = materials.get(materialCode);
                const unitPrice = material?.unitPrice || 0;

                // 计算实际订货量（MOQ 的倍数）
                const orderQuantity = Math.ceil(shortage / moq) * moq;
                const excess = orderQuantity - shortage;
                const excessValue = excess * unitPrice;

                totalExcessValue += excessValue;

                results.push({
                    materialCode,
                    materialName: material?.name || materialCode,
                    shortage,
                    moq,
                    orderQuantity,
                    excess,
                    excessValue,
                    unitPrice,
                });
            }
        }

        // 按过剩金额降序排序（高风险物料在前）
        results.sort((a, b) => b.excessValue - a.excessValue);

        console.log(`📊 MOQ 分析完成:`);
        console.log(`   - 需补料物料: ${results.length} 种`);
        console.log(`   - 预计过剩总金额: ¥${totalExcessValue.toLocaleString()}`);

        return results;
    }

    /**
     * 方案 A: 最大化消纳
     * 
     * 目标：尽可能消耗完所有选中的库存物料
     * 方法：找到需要生产最多件才能消耗完的那个物料
     * 缺的物料（包括不在库存中的）全部采购
     */
    calculateMaxConsumption(
        stagnantMaterials: MaterialData[],
        product: ProductData,
        bomData: BOMData[],
        allMaterials: Map<string, MaterialData>,
        substitutionRelations: SubstitutionRelation[],
        budget: number = Infinity
    ): ProductionPlan {
        console.log('🔵 开始计算方案 A (最大化消纳 - 消耗完所有选中库存)');
        console.log('- 选中的库存物料数量:', stagnantMaterials.length);
        console.log('- 目标产品:', product.code, product.name);

        // 构建选中物料的库存 Map
        const selectedInventory = new Map<string, number>();
        for (const material of stagnantMaterials) {
            if ((material.currentStock || 0) > 0) {
                selectedInventory.set(material.code, material.currentStock || 0);
            }
        }
        console.log(`📦 选中的库存物料: ${selectedInventory.size} 种`);

        // 展开 BOM
        let bomTree;
        try {
            bomTree = expandBOM(product.code, bomData, 1);
            console.log('✅ BOM 展开成功');
        } catch (err) {
            console.error('❌ BOM 展开失败:', err);
            return this.createEmptyPlan(product, stagnantMaterials);
        }

        const leafRequirements = getLeafMaterialRequirements(bomTree);
        console.log('- BOM 需要的底层物料数量:', leafRequirements.size);

        // 📌 方案 A 核心逻辑：计算消耗完所有选中库存需要生产多少件
        let maxQuantity = 0;
        let limitingMaterial = '';

        for (const [materialCode, requiredPerUnit] of leafRequirements) {
            if (selectedInventory.has(materialCode) && requiredPerUnit > 0) {
                const availableQuantity = selectedInventory.get(materialCode) || 0;
                const neededToConsumeAll = Math.ceil(availableQuantity / requiredPerUnit);
                if (neededToConsumeAll > maxQuantity) {
                    maxQuantity = neededToConsumeAll;
                    limitingMaterial = materialCode;
                    const material = allMaterials.get(materialCode);
                    console.log(`  消耗 ${materialCode} (${material?.name || ''}) 需要生产 ${neededToConsumeAll} 件`);
                }
            }
        }

        if (maxQuantity === 0) {
            maxQuantity = 100;
            console.log('⚠️ 选中的物料不在当前产品BOM中，设置默认生产数量 100');
        }

        console.log(`🎯 方案A目标生产数量: ${maxQuantity} 件 (消耗完 ${limitingMaterial})`);

        // 计算实际物料使用和补料需求
        const materialUsages: MaterialUsage[] = [];
        const supplementMaterials: MaterialSupplement[] = [];
        let totalCost = 0;
        let inventoryValueConsumed = 0;

        for (const [materialCode, requiredPerUnit] of leafRequirements) {
            const material = allMaterials.get(materialCode);
            if (!material) continue;

            const totalRequired = requiredPerUnit * maxQuantity;
            const availableQuantity = selectedInventory.get(materialCode) || 0;

            if (availableQuantity > 0) {
                const usedQuantity = Math.min(totalRequired, availableQuantity);
                const remainingQuantity = availableQuantity - usedQuantity;

                materialUsages.push({
                    material,
                    requiredQuantity: totalRequired,
                    usedQuantity,
                    remainingQuantity,
                    value: usedQuantity * material.unitPrice,
                    isStagnant: true,
                });

                inventoryValueConsumed += usedQuantity * material.unitPrice;

                const shortage = totalRequired - usedQuantity;
                if (shortage > 0) {
                    supplementMaterials.push({
                        material,
                        shortage,
                        supplementQuantity: shortage,
                        cost: shortage * material.unitPrice,
                    });
                    totalCost += shortage * material.unitPrice;
                }
            } else {
                // 无库存物料：需要根据BOM需求全部采购
                supplementMaterials.push({
                    material,
                    shortage: totalRequired,
                    supplementQuantity: totalRequired,
                    cost: totalRequired * material.unitPrice,
                });
                totalCost += totalRequired * material.unitPrice;
            }
        }

        console.log(`💰 库存消纳价值: ¥${inventoryValueConsumed.toFixed(2)}`);
        console.log(`💸 补料成本: ¥${totalCost.toFixed(2)}`);

        const outputValue = maxQuantity * product.amount;
        const roi = totalCost > 0 ? (outputValue - totalCost) / totalCost : Infinity;

        const totalInventoryValue = stagnantMaterials.reduce(
            (sum, m) => sum + (m.currentStock || 0) * m.unitPrice,
            0
        );
        const consumptionRate = totalInventoryValue > 0
            ? (inventoryValueConsumed / totalInventoryValue) * 100
            : 0;

        return {
            product,
            quantity: maxQuantity,
            stagnantMaterialsUsed: materialUsages,
            substitutionDecisions: [],
            supplementMaterials,
            totalCost,
            outputValue,
            roi,
            wasteValue: 0,
            stagnantConsumptionRate: consumptionRate,
        };
    }

    /**
     * 方案 B: 最小化余料（不补料）
     * 
     * 目标：只用现有库存生产，不额外采购任何物料
     * 方法：遍历 BOM 所有物料，找到限制因素
     *       - 如果某个 BOM 物料没有库存，生产数量受限
     *       - 取所有物料中可生产数量的最小值
     */
    calculateMinWaste(
        stagnantMaterials: MaterialData[],
        product: ProductData,
        bomData: BOMData[],
        allMaterials: Map<string, MaterialData>,
        substitutionRelations: SubstitutionRelation[]
    ): ProductionPlan {
        console.log('🟣 开始计算方案 B (最小化余料 - 不采购任何物料)');

        // 构建选中物料的库存 Map
        const selectedInventory = new Map<string, number>();
        for (const material of stagnantMaterials) {
            if ((material.currentStock || 0) > 0) {
                selectedInventory.set(material.code, material.currentStock || 0);
            }
        }

        // 📌 也需要考虑所有有库存的物料（不仅仅是选中的）
        const allInventory = new Map<string, number>();
        for (const [code, material] of allMaterials) {
            if ((material.currentStock || 0) > 0) {
                allInventory.set(code, material.currentStock || 0);
            }
        }

        // 展开 BOM
        let bomTree;
        try {
            bomTree = expandBOM(product.code, bomData, 1);
        } catch (err) {
            console.error('❌ BOM 展开失败:', err);
            return this.createEmptyPlan(product, stagnantMaterials);
        }

        const leafRequirements = getLeafMaterialRequirements(bomTree);

        // 📌 方案 B 核心逻辑：遍历 BOM 所有物料，找限制因素
        // 不补料意味着：如果某个物料没有库存，就无法生产
        let minQuantity = Infinity;
        let limitingMaterial = '';
        let hasAnyBOMMatch = false;

        for (const [materialCode, requiredPerUnit] of leafRequirements) {
            if (requiredPerUnit <= 0) continue;

            // 检查这个物料是否有库存（从所有库存中检查，不仅仅是选中的）
            const availableQuantity = allInventory.get(materialCode) || 0;

            if (availableQuantity > 0) {
                hasAnyBOMMatch = true;
                const canProduceWithThis = Math.floor(availableQuantity / requiredPerUnit);
                if (canProduceWithThis < minQuantity) {
                    minQuantity = canProduceWithThis;
                    limitingMaterial = materialCode;
                    const material = allMaterials.get(materialCode);
                    console.log(`  ${materialCode} (${material?.name || ''}): 可生产 ${canProduceWithThis} 件`);
                }
            } else {
                // 📌 关键：如果有任何 BOM 物料没有库存，方案 B 就无法生产！
                console.log(`  ❌ ${materialCode} 无库存，限制生产为 0`);
                minQuantity = 0;
                limitingMaterial = materialCode;
                break;
            }
        }

        if (!hasAnyBOMMatch || minQuantity === Infinity) {
            minQuantity = 0;
            console.log('⚠️ BOM 物料都没有库存，无法生产');
        }

        console.log(`🎯 方案B可生产数量: ${minQuantity} 件 (受限于 ${limitingMaterial})`);

        // 计算实际物料使用
        const materialUsages: MaterialUsage[] = [];
        let inventoryValueConsumed = 0;
        let wasteValue = 0;

        for (const [materialCode, requiredPerUnit] of leafRequirements) {
            const material = allMaterials.get(materialCode);
            if (!material) continue;

            const totalRequired = requiredPerUnit * minQuantity;
            const availableQuantity = allInventory.get(materialCode) || 0;

            if (availableQuantity > 0) {
                const usedQuantity = Math.min(totalRequired, availableQuantity);
                const remainingQuantity = availableQuantity - usedQuantity;

                // 只记录选中的物料（用于显示呆滞料消纳）
                if (selectedInventory.has(materialCode)) {
                    materialUsages.push({
                        material,
                        requiredQuantity: totalRequired,
                        usedQuantity,
                        remainingQuantity,
                        value: usedQuantity * material.unitPrice,
                        isStagnant: true,
                    });

                    inventoryValueConsumed += usedQuantity * material.unitPrice;
                    wasteValue += remainingQuantity * material.unitPrice;
                }
            }
        }

        const outputValue = minQuantity * product.amount;

        const totalInventoryValue = stagnantMaterials.reduce(
            (sum, m) => sum + (m.currentStock || 0) * m.unitPrice,
            0
        );
        const consumptionRate = totalInventoryValue > 0
            ? (inventoryValueConsumed / totalInventoryValue) * 100
            : 0;

        console.log(`📊 库存消纳率: ${consumptionRate.toFixed(1)}%`);
        console.log(`♻️ 余料价值: ¥${wasteValue.toFixed(2)}`);

        return {
            product,
            quantity: minQuantity,
            stagnantMaterialsUsed: materialUsages,
            substitutionDecisions: [],
            supplementMaterials: [],
            totalCost: 0,
            outputValue,
            roi: Infinity,
            wasteValue,
            stagnantConsumptionRate: consumptionRate,
        };
    }

    /**
     * 创建空方案
     */
    private createEmptyPlan(product: ProductData, stagnantMaterials: MaterialData[]): ProductionPlan {
        return {
            product,
            quantity: 0,
            stagnantMaterialsUsed: [],
            substitutionDecisions: [],
            supplementMaterials: [],
            totalCost: 0,
            outputValue: 0,
            roi: 0,
            wasteValue: 0,
            stagnantConsumptionRate: 0,
        };
    }
}

// 创建单例实例
export const productionCalculator = new ReverseProductionCalculator();
