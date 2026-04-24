import { navigationConfigService } from './navigationConfigService';
import {
  loadBOMByProduct,
  loadBOMSubstitutes,
  loadInventoryByMaterials,
  loadMaterialsByCode,
  loadPOByMaterials,
} from './planningV2DataService';
import type {
  BatchFulfillmentResult,
  BOMRecord,
  CapacityMaterialDetail,
  InventoryRecord,
  MaterialPeggingResult,
  MaterialRecord,
  PORecord,
  ProductFulfillmentResult,
} from '../types/planningV2';

export interface SupplyPoolSnapshot {
  availableInvMap: Map<string, number>;
  inTransitMap: Map<string, number>;
  materialAttrMap: Map<string, string>;
  warehouseFilter: string[] | null;
}

export interface CapacityCalculationInput {
  productCode: string;
  productName: string;
  bomRecords: BOMRecord[];
  availableInvMap: Map<string, number>;
  substituteEnabled: boolean;
}

export interface CapacityBottleneck {
  materialCode: string;
  materialName: string;
  requiredQuantity: number;
  availableQuantity: number;
  canMake: number;
}

export interface CapacityCalculationResult {
  productCode: string;
  productName: string;
  finishedGoodsStock: number;
  theoreticalBuildQty: number;
  totalSellableQty: number;
  bottleneck: CapacityBottleneck | null;
}

export interface CapacityAnalysisResult extends CapacityCalculationResult {
  materialDetails: CapacityMaterialDetail[];
  analysisNote: {
    warehouseFilter: string[] | null;
    analysisTimestamp: string;
    substituteEnabled: boolean;
    bomRecordCount?: number;
    mainBomRecordCount?: number;
  };
}

export interface DemandBOMNode {
  materialCode: string;
  materialName: string;
  quantity: number;
  bomLevel: number;
  parentMaterialCode: string | null;
  bomPathKey: string;
  bomPositionKey: string;
  children: DemandBOMNode[];
}

export interface PeggingDemandInput {
  productCode: string;
  productName: string;
  quantity: number;
  priority?: number;
}

export function buildSupplyPool(
  inventoryRecords: InventoryRecord[],
  poRecords: PORecord[],
  materialRecords: MaterialRecord[],
): SupplyPoolSnapshot {
  const warehouseSet = navigationConfigService.getValidWarehouses();
  const warehouseFilter = warehouseSet ? [...warehouseSet] : null;

  const availableInvMap = new Map<string, number>();
  for (const inv of inventoryRecords) {
    if (warehouseSet && !warehouseSet.has(inv.warehouse)) continue;
    const prev = availableInvMap.get(inv.material_code) || 0;
    availableInvMap.set(inv.material_code, prev + (inv.available_inventory_qty || 0));
  }

  const inTransitMap = new Map<string, number>();
  for (const po of poRecords) {
    if (po.rowclosestatus_title === '已关闭') continue;
    const inTransit = Math.max(0, (po.qty || 0) - (po.actqty || 0));
    if (inTransit <= 0) continue;
    const prev = inTransitMap.get(po.material_number) || 0;
    inTransitMap.set(po.material_number, prev + inTransit);
  }

  const materialAttrMap = new Map<string, string>();
  for (const material of materialRecords) {
    if (!material.material_code) continue;
    materialAttrMap.set(material.material_code, material.materialattr || '');
  }

  return {
    availableInvMap,
    inTransitMap,
    materialAttrMap,
    warehouseFilter,
  };
}

function getBomChildrenMap(bomRecords: BOMRecord[]): Map<string, BOMRecord[]> {
  const childrenMap = new Map<string, BOMRecord[]>();
  for (const record of bomRecords) {
    if ((record.alt_priority ?? 0) > 0) continue;
    const parent = record.parent_material_code || record.bom_material_code || '';
    if (!parent || !record.material_code) continue;
    const list = childrenMap.get(parent) || [];
    list.push(record);
    childrenMap.set(parent, list);
  }
  return childrenMap;
}

interface SubstituteGroupMember {
  materialCode: string;
  materialName: string;
  altPriority: number;
}

interface SubstituteGroupInfo {
  altGroupNo: string;
  bomPositionKey: string;
  members: SubstituteGroupMember[];
}

interface LeafRequirementEntry {
  materialCode: string;
  materialName: string;
  requiredQuantity: number;
  bomLevel: number;
  parentMaterialCode: string | null;
  bomPathKey: string;
  bomPositionKey: string;
}

function getSubstituteGroupMap(bomRecords: BOMRecord[]): Map<string, SubstituteGroupInfo> {
  const groupBuckets = new Map<string, {
    parentMaterialCode: string;
    altGroupNo: string;
    memberMap: Map<string, SubstituteGroupMember>;
  }>();

  for (const record of bomRecords) {
    const altMethod = (record.alt_method || '').trim();
    if (altMethod !== '替代') continue;
    const groupNo = record.alt_group_no?.trim();
    if (!groupNo) continue;
    const parentMaterialCode = record.parent_material_code || record.bom_material_code || '';
    const bucketKey = `${parentMaterialCode}::${groupNo}`;

    const member: SubstituteGroupMember = {
      materialCode: record.material_code,
      materialName: record.material_name || record.material_code,
      altPriority: record.alt_priority ?? 0,
    };

    const bucket = groupBuckets.get(bucketKey) || {
      parentMaterialCode,
      altGroupNo: groupNo,
      memberMap: new Map<string, SubstituteGroupMember>(),
    };
    bucket.memberMap.set(member.materialCode, member);
    groupBuckets.set(bucketKey, bucket);
  }

  const groups = new Map<string, SubstituteGroupInfo>();
  for (const entry of groupBuckets.values()) {
    const members = [...entry.memberMap.values()];
    members.sort((a, b) => a.altPriority - b.altPriority || a.materialCode.localeCompare(b.materialCode));
    const mainMember = members.find(member => member.altPriority === 0) || members[0];
    const bomPositionKey = entry.parentMaterialCode
      ? `${entry.parentMaterialCode}>${mainMember.materialCode}`
      : mainMember.materialCode;
    groups.set(bomPositionKey, {
      altGroupNo: entry.altGroupNo,
      bomPositionKey,
      members,
    });
  }

  return groups;
}

function buildDemandBOMNode(
  materialCode: string,
  materialName: string,
  quantity: number,
  childrenMap: Map<string, BOMRecord[]>,
  path: Set<string>,
  parentMaterialCode: string | null,
  level: number,
  pathKey: string,
): DemandBOMNode {
  const bomPositionKey = parentMaterialCode ? `${parentMaterialCode}>${materialCode}` : materialCode;
  if (path.has(materialCode)) {
    return {
      materialCode,
      materialName,
      quantity,
      bomLevel: level,
      parentMaterialCode,
      bomPathKey: pathKey,
      bomPositionKey,
      children: [],
    };
  }

  const children = childrenMap.get(materialCode) || [];
  if (children.length === 0) {
    return {
      materialCode,
      materialName,
      quantity,
      bomLevel: level,
      parentMaterialCode,
      bomPathKey: pathKey,
      bomPositionKey,
      children: [],
    };
  }

  const nextPath = new Set(path);
  nextPath.add(materialCode);

  return {
    materialCode,
    materialName,
    quantity,
    bomLevel: level,
    parentMaterialCode,
    bomPathKey: pathKey,
    bomPositionKey,
    children: children.flatMap(child => {
      const usage = Number(child.standard_usage) || 0;
      if (usage <= 0) return [];
      return [
        buildDemandBOMNode(
          child.material_code,
          child.material_name || child.material_code,
          quantity * usage,
          childrenMap,
          nextPath,
          materialCode,
          level + 1,
          `${pathKey}>${child.material_code}`,
        ),
      ];
    }),
  };
}

export function expandDemandBOM(
  productCode: string,
  productName: string,
  quantity: number,
  bomRecords: BOMRecord[],
): DemandBOMNode {
  const childrenMap = getBomChildrenMap(bomRecords);
  return buildDemandBOMNode(productCode, productName, quantity, childrenMap, new Set<string>(), null, 0, productCode);
}

function collectLeafRequirements(
  node: DemandBOMNode,
  leafRequirements: Map<string, LeafRequirementEntry>,
): void {
  if (node.children.length === 0) {
    const prev = leafRequirements.get(node.bomPositionKey);
    leafRequirements.set(node.bomPositionKey, {
      materialCode: node.materialCode,
      materialName: prev?.materialName || node.materialName || node.materialCode,
      requiredQuantity: (prev?.requiredQuantity || 0) + node.quantity,
      bomLevel: node.bomLevel,
      parentMaterialCode: node.parentMaterialCode,
      bomPathKey: node.bomPathKey,
      bomPositionKey: node.bomPositionKey,
    });
    return;
  }

  for (const child of node.children) {
    collectLeafRequirements(child, leafRequirements);
  }
}

function collectRemainingLeafRequirements(
  node: DemandBOMNode,
  rootProductCode: string,
  materialAttrMap: Map<string, string>,
  availableInvMap: Map<string, number>,
  remainingLeafRequirements: Map<string, LeafRequirementEntry>,
): void {
  const isSelfMadeIntermediate = node.children.length > 0
    && node.materialCode !== rootProductCode
    && (materialAttrMap.get(node.materialCode) || '') === '自制';

  const consumedByLayer1 = isSelfMadeIntermediate
    ? Math.min(availableInvMap.get(node.materialCode) ?? 0, node.quantity)
    : 0;

  if (consumedByLayer1 > 0) {
    const prevAvailable = availableInvMap.get(node.materialCode) ?? 0;
    availableInvMap.set(node.materialCode, Math.max(0, prevAvailable - consumedByLayer1));
  }

  const remainingQuantity = Math.max(0, node.quantity - consumedByLayer1);

  if (node.children.length === 0) {
    const prev = remainingLeafRequirements.get(node.bomPositionKey);
    remainingLeafRequirements.set(node.bomPositionKey, {
      materialCode: node.materialCode,
      materialName: prev?.materialName || node.materialName || node.materialCode,
      requiredQuantity: (prev?.requiredQuantity || 0) + remainingQuantity,
      bomLevel: node.bomLevel,
      parentMaterialCode: node.parentMaterialCode,
      bomPathKey: node.bomPathKey,
      bomPositionKey: node.bomPositionKey,
    });
    return;
  }

  for (const child of node.children) {
    const childNode: DemandBOMNode = {
      ...child,
      quantity: remainingQuantity === 0 ? 0 : child.quantity * (remainingQuantity / node.quantity),
    };
    collectRemainingLeafRequirements(
      childNode,
      rootProductCode,
      materialAttrMap,
      availableInvMap,
      remainingLeafRequirements,
    );
  }
}

export function calculateCapacityForProduct(
  input: CapacityCalculationInput,
): CapacityCalculationResult {
  const finishedGoodsStock = input.availableInvMap.get(input.productCode) ?? 0;
  const demandTree = expandDemandBOM(input.productCode, input.productName, 1, input.bomRecords);
  const substituteGroupMap = input.substituteEnabled ? getSubstituteGroupMap(input.bomRecords) : new Map<string, SubstituteGroupInfo>();
  const leafRequirements = new Map<string, LeafRequirementEntry>();

  collectLeafRequirements(demandTree, leafRequirements);

  let theoreticalBuildQty = 0;
  let bottleneck: CapacityBottleneck | null = null;

  const regularRequirements = new Map<string, LeafRequirementEntry>();
  for (const requirement of leafRequirements.values()) {
    const substituteGroup = substituteGroupMap.get(requirement.bomPositionKey);
    if (substituteGroup) {
      const availableQuantity = substituteGroup.members.reduce((sum, member) => sum + (input.availableInvMap.get(member.materialCode) ?? 0), 0);
      const requiredQuantity = requirement.requiredQuantity;
      const canMake = requiredQuantity > 0 ? Math.floor(availableQuantity / requiredQuantity) : 0;

      if (bottleneck === null || canMake < bottleneck.canMake) {
        bottleneck = {
          materialCode: requirement.materialCode,
          materialName: requirement.materialName,
          requiredQuantity,
          availableQuantity,
          canMake,
        };
        theoreticalBuildQty = canMake;
      }
      continue;
    }

    const prev = regularRequirements.get(requirement.materialCode);
    regularRequirements.set(requirement.materialCode, {
      ...requirement,
      materialName: prev?.materialName || requirement.materialName,
      requiredQuantity: (prev?.requiredQuantity || 0) + requirement.requiredQuantity,
    });
  }

  for (const requirement of regularRequirements.values()) {
    const availableQuantity = input.availableInvMap.get(requirement.materialCode) ?? 0;
    const requiredQuantity = requirement.requiredQuantity;
    const canMake = requiredQuantity > 0 ? Math.floor(availableQuantity / requiredQuantity) : 0;

    if (bottleneck === null || canMake < bottleneck.canMake) {
      bottleneck = {
        materialCode: requirement.materialCode,
        materialName: requirement.materialName,
        requiredQuantity,
        availableQuantity,
        canMake,
      };
      theoreticalBuildQty = canMake;
    }
  }

  if (bottleneck === null) {
    theoreticalBuildQty = 0;
  } else {
    theoreticalBuildQty = bottleneck.canMake;
  }

  return {
    productCode: input.productCode,
    productName: input.productName,
    finishedGoodsStock,
    theoreticalBuildQty,
    totalSellableQty: finishedGoodsStock + theoreticalBuildQty,
    bottleneck,
  };
}

function buildCapacityMaterialDetails(
  productCode: string,
  productName: string,
  bomRecords: BOMRecord[],
  availableInvMap: Map<string, number>,
  inTransitMap: Map<string, number>,
  substituteEnabled: boolean,
  materialAttrMap: Map<string, string>,
): CapacityMaterialDetail[] {
  const demandTree = expandDemandBOM(productCode, productName, 1, bomRecords);
  const substituteGroupMap = substituteEnabled ? getSubstituteGroupMap(bomRecords) : new Map<string, SubstituteGroupInfo>();
  const rows: CapacityMaterialDetail[] = [];
  const calcMaxProducible = (availableQty: number, requiredQtyPerUnit: number): number => {
    if (requiredQtyPerUnit <= 0) return 0;
    return Math.floor(availableQty / requiredQtyPerUnit);
  };

  const traverse = (node: DemandBOMNode): void => {
    const requiredQtyPerUnit = node.quantity;
    const availableQty = availableInvMap.get(node.materialCode) ?? 0;
    const inTransitQty = inTransitMap.get(node.materialCode) ?? 0;
    const substituteGroup = substituteGroupMap.get(node.bomPositionKey);
    const substituteMembers = substituteGroup
      ? substituteGroup.members.map(member => ({
        materialCode: member.materialCode,
        materialName: member.materialName,
        altPriority: member.altPriority,
        materialType: materialAttrMap.get(member.materialCode) || '',
        availableQty: availableInvMap.get(member.materialCode) ?? 0,
        inTransitQty: inTransitMap.get(member.materialCode) ?? 0,
        consumedQty: 0,
      }))
      : undefined;
    const ownMaxProducible = calcMaxProducible(availableQty, requiredQtyPerUnit);
    const substituteMaxProducible = substituteMembers
      ? Math.max(...substituteMembers.map(member => calcMaxProducible(member.availableQty, requiredQtyPerUnit)))
      : ownMaxProducible;

    rows.push({
      materialCode: node.materialCode,
      materialName: node.materialName,
      materialType: materialAttrMap.get(node.materialCode) || '',
      bomLevel: node.bomLevel,
      parentMaterialCode: node.parentMaterialCode,
      bomPathKey: node.bomPathKey,
      requiredQtyPerUnit,
      availableQty,
      inTransitQty,
      shortageQtyPerUnit: Math.max(0, requiredQtyPerUnit - availableQty),
      maxProducibleQty: substituteEnabled ? substituteMaxProducible : ownMaxProducible,
      substituteGroup: substituteGroup
        ? {
          altGroupNo: substituteGroup.altGroupNo,
          members: substituteMembers!,
        }
        : undefined,
    });
    for (const child of node.children) traverse(child);
  };

  traverse(demandTree);
  return rows.sort((a, b) => a.bomLevel - b.bomLevel || a.bomPathKey.localeCompare(b.bomPathKey));
}

export function pegging(
  demand: PeggingDemandInput,
  bomRecords: BOMRecord[],
  availableInvMap: Map<string, number>,
  inTransitMap: Map<string, number>,
  materialAttrMap: Map<string, string>,
  substituteEnabled: boolean = false,
): MaterialPeggingResult[] {
  // Contract: this function mutates the shared supply pools in place.
  // Batch allocation depends on the deduction side effects to keep later demands consistent.
  const finishedGoodsStock = availableInvMap.get(demand.productCode) ?? 0;
  const coveredByFinishedGoods = Math.min(finishedGoodsStock, demand.quantity);
  if (coveredByFinishedGoods > 0) {
    availableInvMap.set(demand.productCode, Math.max(0, finishedGoodsStock - coveredByFinishedGoods));
  }
  const effectiveDemandQty = Math.max(0, demand.quantity - coveredByFinishedGoods);

  const demandTree = expandDemandBOM(
    demand.productCode,
    demand.productName,
    effectiveDemandQty,
    bomRecords,
  );
  const substituteGroupMap = substituteEnabled ? getSubstituteGroupMap(bomRecords) : new Map<string, SubstituteGroupInfo>();

  const grossLeafRequirements = new Map<string, LeafRequirementEntry>();
  collectLeafRequirements(demandTree, grossLeafRequirements);

  const remainingLeafRequirements = new Map<string, LeafRequirementEntry>();
  collectRemainingLeafRequirements(
    demandTree,
    demand.productCode,
    materialAttrMap,
    availableInvMap,
    remainingLeafRequirements,
  );

  const result: MaterialPeggingResult[] = [];
  const positionKeys = new Set([
    ...grossLeafRequirements.keys(),
    ...remainingLeafRequirements.keys(),
  ]);

  for (const bomPositionKey of [...positionKeys].sort()) {
    const grossRequirementEntry = grossLeafRequirements.get(bomPositionKey);
    const remainingRequirementEntry = remainingLeafRequirements.get(bomPositionKey);
    const grossRequirement = grossRequirementEntry?.requiredQuantity ?? 0;
    const remainingAfterLayer1 = remainingRequirementEntry?.requiredQuantity ?? 0;
    const layer1SemiFinished = Math.max(0, grossRequirement - remainingAfterLayer1);
    const substituteGroup = substituteGroupMap.get(bomPositionKey);

    if (substituteGroup) {
      const members = substituteGroup.members.map(member => {
        const availableQty = availableInvMap.get(member.materialCode) ?? 0;
        return {
          materialCode: member.materialCode,
          materialName: member.materialName,
          altPriority: member.altPriority,
          materialType: materialAttrMap.get(member.materialCode) || '',
          availableQty,
          inTransitQty: inTransitMap.get(member.materialCode) ?? 0,
          consumedQty: 0,
        };
      });
      let remainingNeed = remainingAfterLayer1;
      let layer2RawMaterial = 0;
      for (const member of members) {
        if (remainingNeed <= 0) break;
        const consume = Math.min(member.availableQty, remainingNeed);
        if (consume > 0) {
          availableInvMap.set(member.materialCode, Math.max(0, member.availableQty - consume));
          member.consumedQty = consume;
          remainingNeed -= consume;
          layer2RawMaterial += consume;
        }
      }

      const afterLayer2 = Math.max(0, remainingAfterLayer1 - layer2RawMaterial);
      const layer3InTransitPO = Math.min(inTransitMap.get(grossRequirementEntry?.materialCode || '') ?? 0, afterLayer2);
      if (layer3InTransitPO > 0) {
        const prevInTransit = inTransitMap.get(grossRequirementEntry?.materialCode || '') ?? 0;
        inTransitMap.set(grossRequirementEntry?.materialCode || '', Math.max(0, prevInTransit - layer3InTransitPO));
      }
      const afterLayer3 = Math.max(0, afterLayer2 - layer3InTransitPO);
      const layer4DisassemblyHint = (availableInvMap.get(demand.productCode) ?? 0) > 0
        ? (availableInvMap.get(demand.productCode) ?? 0)
        : null;

      result.push({
        materialCode: grossRequirementEntry?.materialCode || substituteGroup.members[0]?.materialCode || bomPositionKey,
        materialName: grossRequirementEntry?.materialName || substituteGroup.members[0]?.materialName || bomPositionKey,
        materialType: materialAttrMap.get(grossRequirementEntry?.materialCode || '') || '',
        grossRequirement,
        bomLevel: grossRequirementEntry?.bomLevel,
        parentMaterialCode: grossRequirementEntry?.parentMaterialCode,
        bomPathKey: grossRequirementEntry?.bomPathKey || bomPositionKey,
        bomPositionKey,
        layers: {
          layer1_semiFinished: layer1SemiFinished,
          layer2_rawMaterial: layer2RawMaterial,
          layer3_inTransitPO: layer3InTransitPO,
          layer4_disassemblyHint: layer4DisassemblyHint,
          layer5_shortage: afterLayer3,
        },
        substituteGroup: {
          altGroupNo: substituteGroup.altGroupNo,
          members,
        },
      });
      continue;
    }

    const materialCode = grossRequirementEntry?.materialCode || remainingRequirementEntry?.materialCode || bomPositionKey;
    const materialName = grossRequirementEntry?.materialName || remainingRequirementEntry?.materialName || bomPositionKey;
    const layer2RawMaterial = Math.min(availableInvMap.get(materialCode) ?? 0, remainingAfterLayer1);
    if (layer2RawMaterial > 0) {
      const prevAvailable = availableInvMap.get(materialCode) ?? 0;
      availableInvMap.set(materialCode, Math.max(0, prevAvailable - layer2RawMaterial));
    }
    const afterLayer2 = Math.max(0, remainingAfterLayer1 - layer2RawMaterial);
    const layer3InTransitPO = Math.min(inTransitMap.get(materialCode) ?? 0, afterLayer2);
    if (layer3InTransitPO > 0) {
      const prevInTransit = inTransitMap.get(materialCode) ?? 0;
      inTransitMap.set(materialCode, Math.max(0, prevInTransit - layer3InTransitPO));
    }
    const afterLayer3 = Math.max(0, afterLayer2 - layer3InTransitPO);
    const layer4DisassemblyHint = (availableInvMap.get(demand.productCode) ?? 0) > 0
      ? (availableInvMap.get(demand.productCode) ?? 0)
      : null;

    result.push({
      materialCode,
      materialName,
      materialType: materialAttrMap.get(materialCode) || '',
      grossRequirement,
      bomLevel: grossRequirementEntry?.bomLevel,
      parentMaterialCode: grossRequirementEntry?.parentMaterialCode,
      bomPathKey: grossRequirementEntry?.bomPathKey || bomPositionKey,
      bomPositionKey,
      layers: {
        layer1_semiFinished: layer1SemiFinished,
        layer2_rawMaterial: layer2RawMaterial,
        layer3_inTransitPO: layer3InTransitPO,
        layer4_disassemblyHint: layer4DisassemblyHint,
        layer5_shortage: afterLayer3,
      },
    });
  }

  result.sort((a, b) => (a.bomPathKey || a.bomPositionKey || a.materialCode).localeCompare(b.bomPathKey || b.bomPositionKey || b.materialCode));
  return result;
}

function buildHierarchyResults(
  demandTree: DemandBOMNode,
  leafResults: MaterialPeggingResult[],
  materialAttrMap: Map<string, string>,
  availableSnapshot: Map<string, number>,
  inTransitSnapshot: Map<string, number>,
): MaterialPeggingResult[] {
  const leafMap = new Map<string, MaterialPeggingResult>();
  for (const leaf of leafResults) {
    if (leaf.bomPathKey) leafMap.set(leaf.bomPathKey, leaf);
  }

  const rows: MaterialPeggingResult[] = [];
  const visit = (node: DemandBOMNode): MaterialPeggingResult => {
    const leaf = leafMap.get(node.bomPathKey);
    if (leaf) {
      rows.push(leaf);
      return leaf;
    }

    const childRows = node.children.map(child => visit(child));
    const selfAvailable = availableSnapshot.get(node.materialCode) ?? 0;
    const selfInTransit = inTransitSnapshot.get(node.materialCode) ?? 0;
    const selfShortage = Math.max(0, node.quantity - selfAvailable - selfInTransit);
    const aggregate: MaterialPeggingResult = {
      materialCode: node.materialCode,
      materialName: node.materialName,
      materialType: materialAttrMap.get(node.materialCode) || '',
      isAggregateNode: true,
      grossRequirement: node.quantity,
      bomLevel: node.bomLevel,
      parentMaterialCode: node.parentMaterialCode,
      bomPathKey: node.bomPathKey,
      bomPositionKey: node.bomPositionKey,
      layers: {
        layer1_semiFinished: childRows.reduce((sum, row) => sum + row.layers.layer1_semiFinished, 0),
        layer2_rawMaterial: childRows.reduce((sum, row) => sum + row.layers.layer2_rawMaterial, 0),
        layer3_inTransitPO: childRows.reduce((sum, row) => sum + row.layers.layer3_inTransitPO, 0),
        layer4_disassemblyHint: null,
        layer5_shortage: selfShortage,
      },
    };
    rows.push(aggregate);
    return aggregate;
  };

  visit(demandTree);
  return rows.sort((a, b) => (a.bomLevel ?? 0) - (b.bomLevel ?? 0) || (a.bomPathKey || '').localeCompare(b.bomPathKey || ''));
}

export interface MultipleDemandAllocationInput {
  demands: PeggingDemandInput[];
  bomRecords: BOMRecord[];
  availableInvMap: Map<string, number>;
  inTransitMap: Map<string, number>;
  materialAttrMap: Map<string, string>;
  substituteEnabled?: boolean;
}

export function allocateMultipleDemands(
  input: MultipleDemandAllocationInput,
): BatchFulfillmentResult {
  const sortedDemands = [...input.demands].map((demand, index) => ({
    ...demand,
    priority: demand.priority ?? 0,
    __order: index,
  })).sort((a, b) => (b.priority - a.priority) || (a.__order - b.__order));

  const initialAvailablePool = new Map(input.availableInvMap);
  const initialInTransitPool = new Map(input.inTransitMap);
  const availablePool = new Map(initialAvailablePool);
  const inTransitPool = new Map(initialInTransitPool);
  const fulfilledDemands = sortedDemands.map(demand => {
    const demandAvailableSnapshot = new Map(availablePool);
    const demandInTransitSnapshot = new Map(inTransitPool);
    const demandTree = expandDemandBOM(demand.productCode, demand.productName, demand.quantity, input.bomRecords);
    const capacity = calculateCapacityForProduct({
      productCode: demand.productCode,
      productName: demand.productName,
      bomRecords: input.bomRecords,
      availableInvMap: availablePool,
      substituteEnabled: input.substituteEnabled ?? false,
    });
    const materialResults = pegging(
      { productCode: demand.productCode, productName: demand.productName, quantity: demand.quantity, priority: demand.priority },
      input.bomRecords,
      availablePool,
      inTransitPool,
      input.materialAttrMap,
      input.substituteEnabled ?? false,
    );
    const hierarchyResults = buildHierarchyResults(
      demandTree,
      materialResults,
      input.materialAttrMap,
      demandAvailableSnapshot,
      demandInTransitSnapshot,
    );

    return {
      productCode: demand.productCode,
      productName: demand.productName,
      demandQty: demand.quantity,
      priority: demand.priority,
      finishedGoodsStock: capacity.finishedGoodsStock,
      theoreticalBuildQty: capacity.theoreticalBuildQty,
      totalSellableQty: capacity.totalSellableQty,
      materialResults,
      hierarchyResults,
      analysisNote: {
        isStaticSnapshot: true as const,
        substituteEnabled: input.substituteEnabled ?? false,
        warehouseFilter: navigationConfigService.getValidWarehouses()
          ? [...navigationConfigService.getValidWarehouses()!]
          : null,
        analysisTimestamp: new Date().toISOString(),
      },
    };
  });

  const consumerMap = new Map<string, Array<{ productCode: string; productName: string; consumedQty: number }>>();
  for (const demand of fulfilledDemands) {
    for (const material of demand.materialResults) {
      const consumedQty = material.layers.layer1_semiFinished + material.layers.layer2_rawMaterial + material.layers.layer3_inTransitPO;
      if (consumedQty <= 0) continue;
      const list = consumerMap.get(material.materialCode) || [];
      list.push({
        productCode: demand.productCode,
        productName: demand.productName,
        consumedQty,
      });
      consumerMap.set(material.materialCode, list);
    }
  }
  for (const demand of fulfilledDemands) {
    for (const material of demand.materialResults) {
      const consumers = consumerMap.get(material.materialCode) || [];
      const uniqueProducts = new Set(consumers.map(item => item.productCode));
      material.isSharedMaterial = uniqueProducts.size > 1;
      if (material.isSharedMaterial) material.sharedConsumers = consumers;
    }
    if (demand.hierarchyResults) {
      for (const material of demand.hierarchyResults) {
        const consumers = consumerMap.get(material.materialCode) || [];
        const uniqueProducts = new Set(consumers.map(item => item.productCode));
        material.isSharedMaterial = uniqueProducts.size > 1;
        if (material.isSharedMaterial) material.sharedConsumers = consumers;
      }
    }
  }

  return {
    demands: fulfilledDemands,
    poolSnapshot: {
      totalAvailableInv: initialAvailablePool,
      totalInTransitPO: initialInTransitPool,
    },
  };
}

function mergeBOMRecords(mainRecords: BOMRecord[], substituteRecords: BOMRecord[]): BOMRecord[] {
  const merged = new Map<string, BOMRecord>();
  for (const record of [...mainRecords, ...substituteRecords]) {
    const key = [
      record.bom_material_code,
      record.parent_material_code,
      record.material_code,
      record.alt_method || '',
      record.alt_group_no || '',
      record.alt_priority ?? 0,
      record.standard_usage,
      record.bom_version,
    ].join('|');
    merged.set(key, record);
  }
  return [...merged.values()];
}

async function loadDemandFulfillmentContext(
  productCode: string,
  substituteEnabled: boolean,
  includePO: boolean,
): Promise<{
  bomRecords: BOMRecord[];
  inventoryRecords: InventoryRecord[];
  materialRecords: MaterialRecord[];
  poRecords: PORecord[];
}> {
  const mainBOMRecords = await loadBOMByProduct(productCode);
  const substituteRecords = substituteEnabled ? await loadBOMSubstitutes(productCode) : [];
  const bomRecords = substituteEnabled
    ? mergeBOMRecords(mainBOMRecords, substituteRecords)
    : mainBOMRecords;

  const materialCodes = [...new Set([
    productCode,
    ...bomRecords.map(record => record.material_code).filter(Boolean),
  ])];

  const [inventoryRecords, materialRecords, poRecords] = await Promise.all([
    loadInventoryByMaterials(materialCodes),
    loadMaterialsByCode(materialCodes),
    includePO ? loadPOByMaterials(materialCodes) : Promise.resolve([] as PORecord[]),
  ]);

  return {
    bomRecords,
    inventoryRecords,
    materialRecords,
    poRecords,
  };
}

export async function analyzeProductCapacity(
  productCode: string,
  productName: string,
  substituteEnabled: boolean,
): Promise<CapacityAnalysisResult> {
  const context = await loadDemandFulfillmentContext(productCode, substituteEnabled, false);
  const bomAllRecords = await loadBOMSubstitutes(productCode).catch(() => context.bomRecords);
  const pool = buildSupplyPool(context.inventoryRecords, [], context.materialRecords);
  const result = calculateCapacityForProduct({
    productCode,
    productName,
    bomRecords: context.bomRecords,
    availableInvMap: pool.availableInvMap,
    substituteEnabled,
  });

  return {
    ...result,
    materialDetails: buildCapacityMaterialDetails(
      productCode,
      productName,
      context.bomRecords,
      pool.availableInvMap,
      pool.inTransitMap,
      substituteEnabled,
      pool.materialAttrMap,
    ),
    analysisNote: {
      warehouseFilter: pool.warehouseFilter,
      analysisTimestamp: new Date().toISOString(),
      substituteEnabled,
      bomRecordCount: bomAllRecords.length,
      mainBomRecordCount: bomAllRecords.filter(record => (record.alt_priority ?? 0) === 0).length,
    },
  };
}

export async function analyzeSingleDemandFulfillment(
  demand: PeggingDemandInput,
  substituteEnabled: boolean,
): Promise<ProductFulfillmentResult> {
  const batchResult = await analyzeBatchDemandFulfillment([demand], substituteEnabled);
  return batchResult.demands[0];
}

export async function analyzeBatchDemandFulfillment(
  demands: PeggingDemandInput[],
  substituteEnabled: boolean,
): Promise<BatchFulfillmentResult> {
  if (demands.length === 0) {
    return {
      demands: [],
      poolSnapshot: {
        totalAvailableInv: new Map(),
        totalInTransitPO: new Map(),
      },
    };
  }

  const uniqueProductCodes = [...new Set(demands.map(demand => demand.productCode).filter(Boolean))];
  const contexts = await Promise.all(
    uniqueProductCodes.map(productCode => loadDemandFulfillmentContext(productCode, substituteEnabled, true)),
  );

  const mergedBOMRecords = mergeBOMRecords(
    contexts.flatMap(context => context.bomRecords),
    [],
  );
  const inventoryRecords = contexts.flatMap(context => context.inventoryRecords);
  const materialRecords = contexts.flatMap(context => context.materialRecords);
  const poRecords = contexts.flatMap(context => context.poRecords);
  const pool = buildSupplyPool(inventoryRecords, poRecords, materialRecords);

  const batchResult = allocateMultipleDemands({
    demands,
    bomRecords: mergedBOMRecords,
    availableInvMap: pool.availableInvMap,
    inTransitMap: pool.inTransitMap,
    materialAttrMap: pool.materialAttrMap,
    substituteEnabled,
  });

  return batchResult;
}

export function buildCapacityExportRows(result: CapacityAnalysisResult): Array<Record<string, string | number>> {
  const rows: Array<Record<string, string | number>> = [];
  rows.push({
    报告类型: '可售能力分析-汇总',
    产品编码: result.productCode,
    产品名称: result.productName,
    产成品库存: result.finishedGoodsStock,
    理论可生产数: result.theoreticalBuildQty,
    合计可售: result.totalSellableQty,
    瓶颈物料编码: result.bottleneck?.materialCode || '',
    瓶颈物料名称: result.bottleneck?.materialName || '',
    瓶颈单位需求: result.bottleneck?.requiredQuantity ?? 0,
    瓶颈可用库存: result.bottleneck?.availableQuantity ?? 0,
    瓶颈可生产数: result.bottleneck?.canMake ?? 0,
    仓库过滤: result.analysisNote.warehouseFilter?.join('|') || '全部',
    替代料核算: result.analysisNote.substituteEnabled ? '开启' : '关闭',
    分析时间: result.analysisNote.analysisTimestamp,
  });
  for (const row of (result.materialDetails || [])) {
    const hasSubstitute = !!row.substituteGroup && row.substituteGroup.members.some(member => member.altPriority > 0);
    const requiredQty = row.requiredQtyPerUnit;
    const mainMax = requiredQty > 0 ? Math.floor(row.availableQty / requiredQty) : 0;
    const substituteMembers = row.substituteGroup?.members.filter(member => member.altPriority > 0) || [];
    const substituteMax = substituteMembers.length > 0
      ? Math.max(...substituteMembers.map(member => (requiredQty > 0 ? Math.floor(member.availableQty / requiredQty) : 0)))
      : 0;
    const status = mainMax > 0 ? '主料可生产' : substituteMax > 0 ? '替代料可生产' : '缺料';
    rows.push({
      报告类型: '可售能力分析-物料明细',
      产品编码: result.productCode,
      产品名称: result.productName,
      BOM层级: row.bomLevel,
      物料编码: row.materialCode,
      物料名称: row.materialName,
      类型: row.materialType || '',
      单位需求: row.requiredQtyPerUnit,
      可用库存: row.availableQty,
      在途: row.inTransitQty,
      最大可生产数: row.maxProducibleQty ?? 0,
      替代料状态: hasSubstitute ? '有替代料' : '无替代料',
      库存状态: status,
      替代组: row.substituteGroup?.altGroupNo || '',
      替代料明细: row.substituteGroup
        ? row.substituteGroup.members.map(member => `P${member.altPriority}:${member.materialCode}/${member.materialName}/库存${member.availableQty}`).join(' | ')
        : '',
      仓库过滤: result.analysisNote.warehouseFilter?.join('|') || '全部',
      替代料核算: result.analysisNote.substituteEnabled ? '开启' : '关闭',
      分析时间: result.analysisNote.analysisTimestamp,
    });
  }
  return rows;
}

export function buildFulfillmentExportRows(result: BatchFulfillmentResult): Array<Record<string, string | number>> {
  const rows: Array<Record<string, string | number>> = [];
  const allMaterials = result.demands.flatMap(demand => (demand.hierarchyResults || demand.materialResults));
  const shortageDemandCount = result.demands.filter(demand => demand.totalSellableQty < demand.demandQty).length;
  const shortageMaterialCount = allMaterials.filter(item => item.layers.layer5_shortage > 0).length;
  const firstDemand = result.demands[0];

  if (firstDemand) {
    rows.push(
      { 报告类型: '新需求满足分析-总体概览', 概览项: '需求条数', 概览值: result.demands.length },
      { 报告类型: '新需求满足分析-总体概览', 概览项: '物料节点数', 概览值: allMaterials.length },
      { 报告类型: '新需求满足分析-总体概览', 概览项: '存在缺口产品数', 概览值: shortageDemandCount },
      { 报告类型: '新需求满足分析-总体概览', 概览项: '存在缺口物料数', 概览值: shortageMaterialCount },
      { 报告类型: '新需求满足分析-总体概览', 概览项: '替代料核算', 概览值: firstDemand.analysisNote.substituteEnabled ? '开启' : '关闭' },
      { 报告类型: '新需求满足分析-总体概览', 概览项: '分析时间', 概览值: firstDemand.analysisNote.analysisTimestamp },
    );
  }

  for (const demand of result.demands) {
    rows.push({
      报告类型: '新需求满足分析-产品汇总',
      产品编码: demand.productCode,
      产品名称: demand.productName,
      优先级: demand.priority,
      需求数量: demand.demandQty,
      产成品库存: demand.finishedGoodsStock,
      理论可生产数: demand.theoreticalBuildQty,
      合计可售: demand.totalSellableQty,
      满足状态: demand.totalSellableQty >= demand.demandQty ? '已满足' : '不满足',
      仓库过滤: demand.analysisNote.warehouseFilter?.join('|') || '全部',
      替代料核算: demand.analysisNote.substituteEnabled ? '开启' : '关闭',
      分析时间: demand.analysisNote.analysisTimestamp,
    });
    for (const material of (demand.hierarchyResults || demand.materialResults)) {
      const hasSubstitute = !!material.substituteGroup && material.substituteGroup.members.some(member => member.altPriority > 0);
      const requiredQty = Math.max(0, material.grossRequirement - material.layers.layer1_semiFinished);
      const members = material.substituteGroup?.members || [];
      const substituteMembers = members.filter(member => member.altPriority > 0);
      const main = members.find(member => member.altPriority === 0);
      const mainCoverage = (main?.availableQty || 0) + (main?.inTransitQty || 0);
      const groupCoverage = members.reduce((sum, member) => sum + member.availableQty + (member.inTransitQty || 0), 0);
      const mainSatisfied = requiredQty <= 0 || mainCoverage >= requiredQty;
      const groupSatisfied = requiredQty <= 0 || groupCoverage >= requiredQty;
      const status = substituteMembers.length > 0 && mainSatisfied
        ? '主料满足'
        : substituteMembers.length > 0 && groupSatisfied
          ? '替代料可满足'
          : material.layers.layer5_shortage > 0
            ? '不满足'
            : '满足';
      const baseAvailableQty = result.poolSnapshot.totalAvailableInv.get(material.materialCode) ?? 0;
      const baseInTransitQty = result.poolSnapshot.totalInTransitPO.get(material.materialCode) ?? 0;
      rows.push({
        报告类型: '新需求满足分析-物料明细',
        产品编码: demand.productCode,
        产品名称: demand.productName,
        优先级: demand.priority,
        需求数量: demand.demandQty,
        BOM层级: material.bomLevel ?? '',
        物料编码: material.materialCode,
        物料名称: material.materialName,
        类型: material.materialType || '',
        毛需求: material.grossRequirement,
        可用库存: baseAvailableQty,
        在途PO: baseInTransitQty,
        缺口: material.layers.layer5_shortage,
        满足状态: status,
        替代料状态: hasSubstitute ? '有替代料' : '无替代料',
        替代组: material.substituteGroup?.altGroupNo || '',
        替代料明细: material.substituteGroup
          ? material.substituteGroup.members.map(member => `P${member.altPriority}:${member.materialCode}/${member.materialName}/库存${member.availableQty}/消耗${member.consumedQty}`).join(' | ')
          : '',
        共享标记: material.isSharedMaterial ? '共享' : '非共享',
        共享明细: material.sharedConsumers ? material.sharedConsumers.map(item => `${item.productCode}:${item.consumedQty}`).join(' | ') : '',
        仓库过滤: demand.analysisNote.warehouseFilter?.join('|') || '全部',
        替代料核算: demand.analysisNote.substituteEnabled ? '开启' : '关闭',
        分析时间: demand.analysisNote.analysisTimestamp,
      });
    }
  }

  return rows;
}

function escapeMarkdownCell(value: string | number): string {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\n/g, '<br/>');
}

function formatReportNumber(value: number): string {
  return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value);
}

export function buildCapacityMarkdownReport(result: CapacityAnalysisResult): string {
  const lines: string[] = [];
  const reportProductName = (result.productName || '').trim() || result.productCode;
  lines.push(`# ${result.productCode} / ${reportProductName} 可售能力分析报告`);
  lines.push('');
  lines.push('## 报告信息');
  lines.push(`- 产品：${result.productCode} / ${result.productName}`);
  lines.push(`- 分析时间：${result.analysisNote.analysisTimestamp}`);
  lines.push(`- 仓库过滤：${result.analysisNote.warehouseFilter?.join('、') || '全部'}`);
  lines.push(`- 替代料核算：${result.analysisNote.substituteEnabled ? '开启' : '关闭'}`);
  lines.push('');
  lines.push('## 产品汇总');
  lines.push('| 产成品库存 | 理论可生产数 | 合计可售 |');
  lines.push('| --- | --- | --- |');
  lines.push(`| ${formatReportNumber(result.finishedGoodsStock)} | ${formatReportNumber(result.theoreticalBuildQty)} | ${formatReportNumber(result.totalSellableQty)} |`);
  lines.push('');
  lines.push('## 物料明细');
  lines.push('| BOM层级 | 物料编码 | 物料名称 | 类型 | 单位需求 | 可用库存 | 在途 | 最大可生产数 | 库存状态 | 替代料 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const row of result.materialDetails) {
    const members = row.substituteGroup?.members || [];
    const substituteMembers = members.filter(member => member.altPriority > 0);
    const requiredQty = row.requiredQtyPerUnit;
    const mainMax = requiredQty > 0 ? Math.floor(row.availableQty / requiredQty) : 0;
    const substituteMax = substituteMembers.length > 0
      ? Math.max(...substituteMembers.map(member => (requiredQty > 0 ? Math.floor(member.availableQty / requiredQty) : 0)))
      : 0;
    const status = mainMax > 0 ? '主料可生产' : substituteMax > 0 ? '替代料可生产' : '缺料';
    const substituteText = row.substituteGroup
      ? `组${row.substituteGroup.altGroupNo}（${substituteMembers.length}）`
      : '无';
    lines.push(
      `| ${escapeMarkdownCell(row.bomLevel)} | ${escapeMarkdownCell(row.materialCode)} | ${escapeMarkdownCell(row.materialName)} | ${escapeMarkdownCell(row.materialType || '-')} | ${escapeMarkdownCell(formatReportNumber(row.requiredQtyPerUnit))} | ${escapeMarkdownCell(formatReportNumber(row.availableQty))} | ${escapeMarkdownCell(formatReportNumber(row.inTransitQty))} | ${escapeMarkdownCell(formatReportNumber(row.maxProducibleQty ?? 0))} | ${escapeMarkdownCell(status)} | ${escapeMarkdownCell(substituteText)} |`,
    );
  }

  const withSubstitute = result.materialDetails.filter(row => row.substituteGroup && row.substituteGroup.members.some(member => member.altPriority > 0));
  if (withSubstitute.length > 0) {
    lines.push('');
    lines.push('## 替代料组明细');
    for (const row of withSubstitute) {
      const group = row.substituteGroup!;
      const substituteMembers = group.members.filter(member => member.altPriority > 0);
      lines.push(`### ${row.materialCode} ${row.materialName} / 组${group.altGroupNo}`);
      lines.push('| 优先级 | 物料编码 | 物料名称 | 类型 | 可用库存 | 在途 |');
      lines.push('| --- | --- | --- | --- | --- | --- |');
      for (const member of substituteMembers) {
        lines.push(
          `| P${escapeMarkdownCell(member.altPriority)} | ${escapeMarkdownCell(member.materialCode)} | ${escapeMarkdownCell(member.materialName)} | ${escapeMarkdownCell(member.materialType || '-')} | ${escapeMarkdownCell(formatReportNumber(member.availableQty))} | ${escapeMarkdownCell(formatReportNumber(member.inTransitQty || 0))} |`,
        );
      }
      lines.push('');
    }
  }
  return lines.join('\n');
}

export function buildFulfillmentMarkdownReport(result: BatchFulfillmentResult): string {
  const lines: string[] = [];
  const allMaterials = result.demands.flatMap(demand => (demand.hierarchyResults || demand.materialResults));
  const shortageDemandCount = result.demands.filter(demand => demand.totalSellableQty < demand.demandQty).length;
  const shortageMaterialCount = allMaterials.filter(item => item.layers.layer5_shortage > 0).length;
  const firstDemand = result.demands[0];

  lines.push('# 需求承接分析报告（新需求满足分析）');
  lines.push('');
  lines.push('## 总体概览');
  lines.push('| 指标 | 数值 |');
  lines.push('| --- | --- |');
  lines.push(`| 需求条数 | ${result.demands.length} |`);
  lines.push(`| 物料节点数 | ${allMaterials.length} |`);
  lines.push(`| 存在缺口产品数 | ${shortageDemandCount} |`);
  lines.push(`| 存在缺口物料数 | ${shortageMaterialCount} |`);
  lines.push(`| 替代料核算 | ${firstDemand?.analysisNote.substituteEnabled ? '开启' : '关闭'} |`);
  lines.push(`| 分析时间 | ${firstDemand?.analysisNote.analysisTimestamp || '-'} |`);
  lines.push('');

  lines.push('## 产品汇总');
  lines.push('| 产品编码 | 产品名称 | 优先级 | 需求数量 | 产成品库存 | 理论可生产数 | 合计可售 | 满足状态 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const demand of result.demands) {
    const status = demand.totalSellableQty >= demand.demandQty ? '已满足' : '不满足';
    lines.push(
      `| ${escapeMarkdownCell(demand.productCode)} | ${escapeMarkdownCell(demand.productName)} | ${escapeMarkdownCell(demand.priority)} | ${escapeMarkdownCell(formatReportNumber(demand.demandQty))} | ${escapeMarkdownCell(formatReportNumber(demand.finishedGoodsStock))} | ${escapeMarkdownCell(formatReportNumber(demand.theoreticalBuildQty))} | ${escapeMarkdownCell(formatReportNumber(demand.totalSellableQty))} | ${escapeMarkdownCell(status)} |`,
    );
  }
  lines.push('');

  for (const demand of result.demands) {
    lines.push(`## 物料明细：${demand.productCode} / ${demand.productName} / 需求 ${formatReportNumber(demand.demandQty)} / 优先级 ${demand.priority}`);
    lines.push('| BOM层级 | 物料编码 | 物料名称 | 类型 | 毛需求 | 可用库存 | 在途PO | 缺口 | 满足状态 | 共享标记 | 替代料 |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const material of (demand.hierarchyResults || demand.materialResults)) {
      const members = material.substituteGroup?.members || [];
      const substituteMembers = members.filter(member => member.altPriority > 0);
      const requiredQty = Math.max(0, material.grossRequirement - material.layers.layer1_semiFinished);
      const main = members.find(member => member.altPriority === 0);
      const mainCoverage = (main?.availableQty || 0) + (main?.inTransitQty || 0);
      const groupCoverage = members.reduce((sum, member) => sum + member.availableQty + (member.inTransitQty || 0), 0);
      const mainSatisfied = requiredQty <= 0 || mainCoverage >= requiredQty;
      const groupSatisfied = requiredQty <= 0 || groupCoverage >= requiredQty;
      const status = substituteMembers.length > 0 && mainSatisfied
        ? '主料满足'
        : substituteMembers.length > 0 && groupSatisfied
          ? '替代料可满足'
          : material.layers.layer5_shortage > 0
            ? '不满足'
            : '满足';
      const baseAvailableQty = result.poolSnapshot.totalAvailableInv.get(material.materialCode) ?? 0;
      const baseInTransitQty = result.poolSnapshot.totalInTransitPO.get(material.materialCode) ?? 0;
      const substituteText = material.substituteGroup
        ? `组${material.substituteGroup.altGroupNo}（${substituteMembers.length}）`
        : '无';
      lines.push(
        `| ${escapeMarkdownCell(material.bomLevel ?? '')} | ${escapeMarkdownCell(material.materialCode)} | ${escapeMarkdownCell(material.materialName)} | ${escapeMarkdownCell(material.materialType || '-')} | ${escapeMarkdownCell(formatReportNumber(material.grossRequirement))} | ${escapeMarkdownCell(formatReportNumber(baseAvailableQty))} | ${escapeMarkdownCell(formatReportNumber(baseInTransitQty))} | ${escapeMarkdownCell(formatReportNumber(material.layers.layer5_shortage))} | ${escapeMarkdownCell(status)} | ${escapeMarkdownCell(material.isSharedMaterial ? '共享' : '非共享')} | ${escapeMarkdownCell(substituteText)} |`,
      );
    }
    lines.push('');
  }
  return lines.join('\n');
}
