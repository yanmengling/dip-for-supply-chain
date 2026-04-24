/**
 * Preset Answer Service
 * 
 * Provides mock data-based preset answers for all preset questions to support demonstration.
 */

import type { CopilotRichContent } from '../types/ontology';

export interface QueryContext {
  products?: any[];
  materials?: any[];
  suppliers?: any[];
  orders?: any[];
  userInput?: Record<string, string>; // For placeholder-filled queries
}

/**
 * Get preset answer for a specific question ID
 * 
 * @param questionId - Unique identifier for the preset question
 * @param context - Optional context data (products, materials, suppliers, orders, userInput)
 * @returns Answer string or rich content object
 */
export const getPresetAnswer = (
  questionId: string,
  context?: QueryContext
): string | { text: string; richContent?: CopilotRichContent } => {
  // Import entity data dynamically to avoid circular dependencies
  // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
  // @ts-ignore - require is available at runtime
  const { productsData, materialsData, suppliersData, ordersData } = require('./entityConfigService') as {
    productsData: any[];
    materialsData: any[];
    suppliersData: any[];
    ordersData: any[];
  };

  switch (questionId) {
    case 'delivery-order-status-heilongjiang': {
      // "黑龙江农垦的订单到哪了？"
      const deliveryOrders = context?.orders || ordersData;
      const deliveryOrder = deliveryOrders.find((o: any) => o.client && o.client.includes('黑龙江'));
      if (deliveryOrder) {
        const today = new Date();
        const dueDate = new Date(deliveryOrder.dueDate);
        const delayDays = Math.max(0, Math.ceil((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)));
        const stage = deliveryOrder.status;
        const blockReason = delayDays > 0 ? '物料缺货或生产延迟' : '无';

        return `查询到订单 ${deliveryOrder.orderId} (${deliveryOrder.client})。\n当前状态：${stage}\n${delayDays > 0 ? `预计延期 ${delayDays} 天，` : ''}原定交付日期：${dueDate.toLocaleDateString('zh-CN')}\n${delayDays > 0 ? `原因：${blockReason}\n建议：联系采购部催货或切换供应商。` : '订单按计划进行中。'}`;
      }
      return '未找到相关订单信息。';
    }

    case 't22-bom-configuration': {
      // T22 BOM configuration - simplified query without user input requirements
      const t22Products = context?.products || productsData;
      const t22Materials = context?.materials || materialsData;
      const t22Product = t22Products.find((p: any) => p.productName?.includes('T22') || p.productId === 'PROD-010');

      if (!t22Product) {
        return '未找到 T22 产品信息。请确认产品数据已正确加载。';
      }

      // Get BOM materials for T22 based on materialCodes
      const bomMaterialCodes = t22Product.materialCodes || [];
      const bomMaterials = t22Materials.filter((m: any) => bomMaterialCodes.includes(m.materialCode));

      // Generate detailed BOM data with supplier and supply information
      const bomData = bomMaterials.map((m: any) => {
        let status: 'In Stock' | 'Procure' | 'NPI' = 'Procure';
        if (m.currentStock && m.currentStock > 100) {
          status = 'In Stock';
        } else if (m.currentStock && m.currentStock > 0) {
          status = 'Procure';
        } else {
          status = 'NPI';
        }

        // Find suppliers for this material
        const materialSuppliers = suppliersData.filter((s: any) => s.materialCode === m.materialCode);
        const primarySupplier = materialSuppliers[0];
        const supplierInfo = primarySupplier
          ? `${primarySupplier.supplierName} (${primarySupplier.creditRating}, 准时率${primarySupplier.onTimeDeliveryRate}%)`
          : '暂无供应商';

        // Calculate unit cost based on material type and stock status
        let unitCost = 0;
        if (m.materialCode === 'MAT-001') unitCost = 1200; // 飞控芯片
        else if (m.materialCode === 'MAT-002') unitCost = 800; // GPS定位器
        else if (m.materialCode === 'MAT-003') unitCost = 2500; // 多光谱相机
        else if (m.materialCode === 'MAT-004') unitCost = 1500; // 避障雷达
        else if (m.materialCode === 'MAT-HDD-001') unitCost = 680; // 硬盘
        else unitCost = Math.floor(Math.random() * 2000) + 200;

        const statusValue: 'In Stock' | 'Procure' | 'NPI' = status;
        return {
          component: m.materialName || '未知组件',
          part: `${m.materialCode} (${status === 'In Stock' ? '库存' : status === 'Procure' ? '采购' : '新料'})`,
          cost: `¥ ${unitCost.toLocaleString()}`,
          status: statusValue,
          supplier: supplierInfo,
          stock: m.currentStock || 0,
          minStock: m.minStock || 10,
        };
      });

      // If no materials found, use default BOM
      const finalBomData = bomData.length > 0 ? bomData : [
        { component: '飞控芯片', part: 'MAT-001 (库存)', cost: '¥ 1,200', status: 'In Stock' as const, supplier: '北斗科技电子元件有限公司 (AAA, 准时率98%)', stock: 500, minStock: 50 },
        { component: 'GPS定位器', part: 'MAT-002 (库存)', cost: '¥ 800', status: 'In Stock' as const, supplier: '北斗科技电子元件有限公司 (AAA, 准时率98%)', stock: 300, minStock: 30 },
        { component: '多光谱相机', part: 'MAT-003 (采购)', cost: '¥ 2,500', status: 'Procure' as const, supplier: '智能装备机械加工厂 (AA, 准时率92%)', stock: 50, minStock: 20 },
        { component: '避障雷达', part: 'MAT-004 (采购)', cost: '¥ 1,500', status: 'Procure' as const, supplier: '智能装备机械加工厂 (AA, 准时率92%)', stock: 80, minStock: 25 },
        { component: '硬盘', part: 'MAT-HDD-001 (采购)', cost: '¥ 680', status: 'Procure' as const, supplier: '待确认供应商', stock: 0, minStock: 10 },
      ];

      const totalCost = finalBomData.reduce((sum: number, item: any) => {
        const cost = parseInt(item.cost.replace(/[¥,\s]/g, ''));
        return sum + (isNaN(cost) ? 0 : cost);
      }, 0);

      // Generate supply analysis
      const inStockCount = finalBomData.filter((item: any) => item.status === 'In Stock').length;
      const procureCount = finalBomData.filter((item: any) => item.status === 'Procure').length;
      const npiCount = finalBomData.filter((item: any) => item.status === 'NPI').length;

      // Generate cost optimization suggestions
      const optimizationSuggestions = [
        inStockCount > 0 ? `✓ ${inStockCount} 个物料已有库存，可立即使用，节省采购时间` : '',
        procureCount > 0 ? `⚠ ${procureCount} 个物料需要采购，建议提前 2-3 周下单以确保供应` : '',
        npiCount > 0 ? `⚠ ${npiCount} 个物料为新料，需要评估供应商和认证周期` : '',
        `💰 总BOM成本：¥ ${totalCost.toLocaleString()}，建议批量采购可享受 5-10% 折扣`,
        `🔄 建议复用现有 T20 产品的物料配置（${inStockCount}/${finalBomData.length} 物料可复用），降低研发成本`,
        `📊 物料供应风险评估：${inStockCount >= finalBomData.length * 0.6 ? '低风险' : inStockCount >= finalBomData.length * 0.3 ? '中风险' : '高风险'}`,
      ].filter(Boolean);

      return {
        text: `基于 T22 植保无人机的产品配置，为您生成详细的 BOM 配置、物料供应及成本优化分析：`,
        richContent: {
          type: 'bom_recommendation' as const,
          data: finalBomData,
          totalCost: `¥ ${totalCost.toLocaleString()} (预估)`,
          optimization: optimizationSuggestions.join('\n'),
        },
      };
    }

    case 'hard-drive-price-impact': {
      // "硬盘供应涨价50%，对现有产品有哪些影响，如何应对？"
      const hddMaterials = context?.materials || materialsData;
      const hddProducts = context?.products || productsData;
      const hardDriveMaterial = hddMaterials.find((m: any) => m.materialName === '硬盘' || m.materialCode === 'MAT-HDD-001');

      if (!hardDriveMaterial) {
        return '未找到硬盘物料信息。';
      }

      const affectedProducts = hddProducts.filter((p: any) =>
        p.materialCodes && p.materialCodes.includes(hardDriveMaterial.materialCode)
      );

      if (affectedProducts.length === 0) {
        return '当前没有产品使用硬盘物料。';
      }

      // Calculate impact details for each product
      const currentHardDriveCost = 680; // Base cost from mockData
      const priceIncrease = currentHardDriveCost * 0.5; // 50% increase
      const newHardDriveCost = currentHardDriveCost + priceIncrease;

      // Find SSD alternative
      const ssdMaterial = hddMaterials.find((m: any) => m.materialName === 'SSD固态硬盘' || m.materialCode === 'MAT-SSD-001');
      const ssdSuppliers = suppliersData.filter((s: any) => s.materialCode === 'MAT-SSD-001');
      const ssdSupplier = ssdSuppliers[0];
      const ssdCost = ssdMaterial ? 850 : 900; // SSD typically costs more but offers better performance

      // Calculate BOM cost impact for each product
      const productImpactDetails = affectedProducts.map((p: any) => {
        const bomCostIncrease = priceIncrease; // Assuming one hard drive per product
        const bomCostIncreasePercent = ((bomCostIncrease / 10000) * 100).toFixed(1); // Assuming average BOM cost ~10,000
        return {
          productName: p.productName || p.productId,
          productId: p.productId,
          bomCostIncrease: bomCostIncrease,
          bomCostIncreasePercent: bomCostIncreasePercent,
          currentStock: p.stockQuantity || 0,
        };
      });

      const totalImpact = productImpactDetails.reduce((sum: number, p: any) => sum + p.bomCostIncrease, 0);
      const avgImpactPercent = (productImpactDetails.reduce((sum: number, p: any) => sum + parseFloat(p.bomCostIncreasePercent), 0) / productImpactDetails.length).toFixed(1);

      return `📊 硬盘涨价 50% 影响分析报告

🔴 受影响产品（共 ${affectedProducts.length} 个）：
${productImpactDetails.map((p: any, idx: number) =>
        `${idx + 1}. ${p.productName} (${p.productId})
   - BOM成本增加：¥ ${p.bomCostIncrease.toLocaleString()} (约 ${p.bomCostIncreasePercent}%)
   - 当前库存：${p.currentStock} ${p.stockUnit || '套'}
   - 影响等级：${parseFloat(p.bomCostIncreasePercent) > 7 ? '高' : parseFloat(p.bomCostIncreasePercent) > 5 ? '中' : '低'}`
      ).join('\n\n')}

💰 总体影响评估：
- 总成本增加：¥ ${totalImpact.toLocaleString()}
- 平均BOM成本上升：约 ${avgImpactPercent}%
- 受影响产品数量：${affectedProducts.length} 个
- 当前库存产品受影响：${productImpactDetails.filter((p: any) => p.currentStock > 0).length} 个

📈 成本影响详情：
- 硬盘原价：¥ ${currentHardDriveCost.toLocaleString()}
- 涨价后价格：¥ ${newHardDriveCost.toLocaleString()} (+¥ ${priceIncrease.toLocaleString()})
- 单产品BOM成本增加：¥ ${priceIncrease.toLocaleString()}

🔄 替代方案分析：
${ssdMaterial ? `✓ SSD 固态硬盘替代方案：
  - 物料编码：${ssdMaterial.materialCode}
  - 预估成本：¥ ${ssdCost.toLocaleString()} (比涨价后硬盘高 ¥ ${(ssdCost - newHardDriveCost).toLocaleString()})
  - 优势：性能更好、可靠性更高、功耗更低
  - 供应商：${ssdSupplier ? `${ssdSupplier.supplierName} (${ssdSupplier.creditRating}, 准时率${ssdSupplier.onTimeDeliveryRate}%)` : '待确认'}
  - 建议：评估长期成本效益，SSD虽然单价高但可提升产品竞争力` : '⚠ 未找到SSD替代物料，建议尽快寻找替代供应商'}

💡 应对建议：

【短期措施（1-2周）】
1. 价格锁定：与现有供应商协商，锁定当前价格或批量采购折扣（目标：降低 10-15% 涨幅）
2. 库存管理：评估现有库存，优先使用库存产品，延迟新订单
3. 成本转嫁：评估产品定价策略，考虑适度调整售价

【中期措施（1-3个月）】
1. 替代料评估：${ssdMaterial ? `评估 SSD 固态硬盘替代方案，完成技术验证和供应商认证` : '寻找并评估替代物料供应商'}
2. 多供应商策略：开发 2-3 个硬盘供应商，降低单一供应商风险
3. 批量采购：与供应商协商年度框架协议，锁定价格和供应量

【长期措施（3-6个月）】
1. 供应链优化：建立物料价格监控机制，提前预警价格波动
2. 产品设计优化：评估产品架构，考虑模块化设计，便于物料替换
3. 战略储备：对关键物料建立安全库存，应对价格波动

⏰ 行动时间表：
- 立即（本周）：与供应商协商价格锁定
- 1周内：完成替代料技术评估
- 2周内：确定应对策略并执行
- 30天内：完成替代料供应商认证（如适用）`;
    }

    case 'delivery-feasibility': {
      // Delivery feasibility query: "黑龙江农垦的订单到哪个环节了？是否可以如期交付"
      const feasibilityOrders = context?.orders || ordersData;
      const feasibilityOrder = feasibilityOrders.find((o: any) => o.client && o.client.includes('黑龙江'));
      if (feasibilityOrder) {
        const today = new Date();
        const dueDate = new Date(feasibilityOrder.dueDate);
        const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
        const stage = feasibilityOrder.status;
        const isFeasible = daysUntilDue >= 0 && (feasibilityOrder.status === '运输中' || feasibilityOrder.status === '生产中');
        const feasibility = isFeasible ? '可以如期交付' : daysUntilDue < 0 ? '已延期' : '存在延期风险';

        return `订单 ${feasibilityOrder.orderId} (${feasibilityOrder.client}) 分析：\n\n当前环节：${stage}\n交付可行性：${feasibility}\n${daysUntilDue >= 0 ? `距离交付日期还有 ${daysUntilDue} 天` : `已延期 ${Math.abs(daysUntilDue)} 天`}\n原定交付日期：${dueDate.toLocaleDateString('zh-CN')}\n\n${!isFeasible ? '建议：\n1. 联系采购部加快物料供应\n2. 评估切换供应商的可能性\n3. 与客户沟通延期事宜' : '订单进展正常，预计可以如期交付。'}`;
      }
      return '未找到相关订单信息。';
    }

    case 'inventory-product-status': {
      // "植保无人机T20库存如何，订单量如何？"
      try {
        const products = context?.products || productsData || [];
        const orders = context?.orders || ordersData || [];

        if (!Array.isArray(products) || products.length === 0) {
          return '抱歉，产品数据暂时不可用。';
        }

        if (!Array.isArray(orders)) {
          return '抱歉，订单数据暂时不可用。';
        }

        // Find product by name (T20, T22, or 植保无人机)
        const product = products.find((p: any) => {
          if (!p || !p.productName) return false;
          const name = p.productName.toLowerCase();
          return name.includes('t20') || name.includes('t22') || name.includes('植保无人机');
        });

        if (!product) {
          return '未找到相关产品信息。请确认产品名称是否正确。';
        }

        // Filter orders for this product
        const productOrders = Array.isArray(orders)
          ? orders.filter((o: any) => o && o.productId === product.productId)
          : [];

        // Calculate pending order quantity
        const pendingOrderQuantity = productOrders
          .filter((o: any) => o && o.status && o.status !== '已完成')
          .reduce((sum: number, o: any) => {
            const qty = typeof o.quantity === 'number' ? o.quantity : 0;
            return sum + qty;
          }, 0);

        const stockQuantity = typeof product.stockQuantity === 'number' ? product.stockQuantity : 0;
        const stockUnit = product.stockUnit || '套';
        const isStockSufficient = stockQuantity >= pendingOrderQuantity;

        return `${product.productName || product.productId} 库存分析：\n\n当前库存：${stockQuantity} ${stockUnit}\n待交付订单数量：${pendingOrderQuantity} ${stockUnit}\n订单总数：${productOrders.length} 个\n\n${isStockSufficient ? '库存充足，可继续接单。' : '库存不足，建议暂停接单或加快生产。'}`;
      } catch (error) {
        console.error('Error in inventory-product-status:', error);
        return '抱歉，处理产品库存查询时出现错误。请稍后重试。';
      }
    }

    case 'inventory-material-status': {
      // Material inventory query (handled by fuzzy matching in copilotConfig)
      return '物料库存查询功能已启用，请提供具体物料名称。';
    }

    case 'supplier-status': {
      // Supplier status query: "北斗科技电子元件有限公司最近供应情况如何？"
      // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
      // @ts-ignore - require is available at runtime
      const { supplier360ScorecardsData } = require('./entityConfigService') as { supplier360ScorecardsData: any[] };
      const suppliers = context?.suppliers || [];
      const scorecard = supplier360ScorecardsData.find((sc: any) =>
        suppliers.some((s: any) => sc.supplierId === s.supplierId || sc.supplierName === s.supplierName)
      ) || supplier360ScorecardsData[0];

      if (scorecard) {
        const riskLevel = scorecard.riskAssessment.overallRiskLevel === 'low' ? '低风险' :
          scorecard.riskAssessment.overallRiskLevel === 'medium' ? '中风险' : '高风险';

        return `根据最新评估数据，${scorecard.supplierName}的供应情况如下：\n\n交货准时率：${scorecard.dimensions.onTimeDeliveryRate}%\n质量评级：${scorecard.dimensions.qualityRating}分\n风险评级：${scorecard.dimensions.riskRating}分\n综合风险等级：${riskLevel}\n\n建议：${scorecard.dimensions.riskRating <= 20 ? '继续保持合作关系。' : '需要加强质量监控。'}`;
      }
      return '供应商状态查询功能已启用，请提供具体供应商名称。';
    }

    case 'supplier-similar-recommendation': {
      // Similar supplier recommendation: "市面上与农业装备零部件供应商公司相似的SSD供应商有哪些？"
      const allSuppliers = context?.suppliers || suppliersData;
      const ssdSuppliers = allSuppliers.filter((s: any) =>
        s.materialName === 'SSD固态硬盘' || s.materialCode === 'MAT-SSD-001'
      );

      if (ssdSuppliers.length > 0) {
        const uniqueSuppliers = Array.from(new Set(ssdSuppliers.map((s: any) => s.supplierId)))
          .map((id: string) => ssdSuppliers.find((s: any) => s.supplierId === id))
          .filter((s): s is any => Boolean(s))
          .slice(0, 3);

        return `基于产品类型和业务特征分析，以下供应商与SSD相关：\n\n${uniqueSuppliers.map((s: any, idx: number) =>
          `${idx + 1}. ${s.supplierName} (${s.supplierId})\n   - 供应物料：${s.materialName}`
        ).join('\n\n')}`;
      }
      return '相似供应商推荐功能已启用，请提供具体物料类型或供应商名称。';
    }

    default:
      return '抱歉，未找到对应的预设答案。';
  }
};

