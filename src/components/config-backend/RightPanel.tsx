/**
 * Right Panel Component
 * 
 * Displays entity configuration details with tab-based navigation:
 * - Attributes (editable)
 * - Relations (editable)
 * - Logic (editable via AI assistant chat and manual editing)
 * - Actions (editable)
 * 
 * Tabs are displayed side by side and switch between different sections.
 */

import { useState, useEffect } from 'react';
import { Edit2, Save, X, Plus, Trash2, MessageSquare, Database, Zap, Settings } from 'lucide-react';
import type { EntityConfig, BusinessLogicRule, EntityAction, EntityRelation, EntityType } from '../../types/ontology';
import ConfigAIAssistant from './ConfigAIAssistant';
import { productsData, materialsData, warehousesData } from '../../utils/entityConfigService';
import { executeAction, getActionHistory } from '../../utils/entityConfigService';

interface Props {
  config: EntityConfig;
  onClose?: () => void;
}

type TabType = 'attributes' | 'relations' | 'logic' | 'actions';

/**
 * Get Chinese display name for entity type
 */
const getEntityTypeDisplayName = (type: EntityType | 'user'): string => {
  const typeNames: Record<EntityType | 'user', string> = {
    supplier: '供应商',
    material: '物料',
    factory: '工厂',
    product: '产品',
    warehouse: '仓库',
    order: '订单',
    logistics: '物流',
    customer: '客户',
    user: '用户',
  };
  return typeNames[type] || type;
};

/**
 * Convert ID array to name array for display
 */
const convertIdArrayToNames = (ids: string[], key: string, entityType: EntityType): string[] => {
  if (!Array.isArray(ids) || ids.length === 0) return [];

  // For factory entity, convert specific ID arrays to names
  if (entityType === 'factory') {
    if (key === 'productList') {
      return ids.map(id => {
        const product = productsData.find(p => p.productId === id);
        return product?.productName || id;
      });
    }
    if (key === 'materialList') {
      return ids.map(code => {
        const material = materialsData.find(m => m.materialCode === code);
        return material?.materialName || code;
      });
    }
    if (key === 'warehouseList') {
      return ids.map(code => {
        const warehouse = warehousesData.find(w => w.warehouseCode === code);
        return warehouse?.warehouseName || code;
      });
    }
  }

  // For other cases, return as is
  return ids;
};

/**
 * Get Chinese display name for attribute key
 */
const getAttributeDisplayName = (key: string, entityType: EntityType | 'user'): string => {
  // Common attribute mappings
  const commonMappings: Record<string, string> = {
    // IDs
    supplierId: '供应商ID',
    materialCode: '物料编码',
    productId: '产品ID',
    orderId: '订单ID',
    warehouseCode: '仓库ID',
    factoryCode: '工厂ID',
    logisticsId: '物流ID',
    customerId: '客户ID',

    // Names
    supplierName: '供应商名称',
    materialName: '物料名称',
    productName: '产品名称',
    orderName: '订单名称',
    warehouseName: '仓库名称',
    factoryName: '工厂名称',
    logisticsName: '物流名称',
    customerName: '客户名称',

    // Common fields
    contact: '联系人',
    phone: '电话',
    email: '邮箱',
    address: '地址',
    city: '城市',
    location: '位置',
    status: '状态',
    quantity: '数量',
    price: '价格',
    cost: '成本',
    qualityRating: '质量评级',
    riskLevel: '风险等级',

    // User fields
    userId: '用户ID',
    name: '姓名',
    avatar: '头像',
    department: '部门',
    role: '角色ID',
    roleName: '角色名称',
    scope: '权限范围',
  };

  // Entity-specific mappings
  const entityMappings: Record<EntityType | 'user', Record<string, string>> = {
    user: {
      userId: '用户ID',
      name: '姓名',
      email: '邮箱',
      phone: '电话',
      avatar: '头像',
      department: '部门',
      role: '角色ID',
      roleName: '角色名称',
      scope: '权限范围',
      status: '状态',
      ...commonMappings,
    },
    supplier: {
      supplyMaterials: '供应物料',
      supplyMaterialCount: '供应物料数量',
      establishedYear: '成立年份',
      registeredCapital: '注册资本',
      certifications: '认证资质',
      onTimeDeliveryRate: '准时交付率',
      ...commonMappings,
    },
    material: {
      applicableProducts: '适用产品',
      applicableProductCount: '适用产品数量',
      warehouseInDate: '入库时间',
      warehouseOutDate: '出库时间',
      currentStock: '当前库存',
      currentStockWithUnit: '当前库存（含单位）',
      safetyStock: '安全库存',
      safetyStockWithUnit: '安全库存（含单位）',
      totalPurchaseQuantity: '总采购数量',
      totalPurchaseQuantityWithUnit: '总采购数量（含单位）',
      unit: '单位',
      unitPrice: '单价',
      minOrderQuantity: '最小订购量',
      minOrderQuantityWithUnit: '最小订购量（含单位）',
      shelfLife: '保质期',
      specifications: '规格',
      mainSupplier: '主要供应商',
      mainSupplierId: '主要供应商ID',
      supplierCount: '供应商数量',
      riskCoefficient: '风险系数',
      ...commonMappings,
    },
    product: {
      BOM: 'BOM结构',
      BOMCount: 'BOM数量',
      series: '产品系列',
      lifecycle: '生命周期',
      warranty: '保修期',
      weight: '重量',
      totalOrderCount: '订单总数',
      totalOrderQuantity: '订单总数量',
      stockQuantity: '库存数量',
      stockUnit: '库存单位',
      startSalesDate: '开始销售时间',
      stopSalesDate: '停止销售时间',
      stopExpansionDate: '停止扩容时间',
      stopServiceDate: '停止服务时间',
      status: '生命周期状态',
      ...commonMappings,
    },
    order: {
      client: '客户名称',
      projectName: '项目名称',
      salesperson: '销售人员',
      orderDate: '订单日期',
      dueDate: '交付日期',
      delay: '延迟天数',
      orderAmount: '订单金额',
      stage: '订单阶段',
      customerLevel: '客户等级',
      ...commonMappings,
    },
    warehouse: {
      capacity: '容量',
      currentStock: '当前库存',
      associatedFactory: '关联工厂',
      storageType: '存储类型',
      temperatureControl: '温控',
      utilizationRate: '利用率',
      ...commonMappings,
    },
    factory: {
      targetCapacity: '目标产能',
      actualCapacity: '实际产能',
      productList: '关联产品',
      materialList: '关联物料',
      warehouseList: '关联仓库',
      productionLines: '生产线数量',
      totalCapacity: '总产能',
      ...commonMappings,
    },
    logistics: {
      transportType: '运输类型',
      route: '路线',
      estimatedTime: '预计时间',
      ...commonMappings,
    },
    customer: {
      creditRating: '信用评级',
      orderHistory: '订单历史',
      totalOrderCount: '订单总数',
      totalOrderAmount: '订单总金额',
      ...commonMappings,
    },
  };

  // Try entity-specific mapping first, then common mapping, then return original key
  return entityMappings[entityType as EntityType | 'user']?.[key] || commonMappings[key] || key;
};

const RightPanel = ({ config, onClose }: Props) => {
  const [activeTab, setActiveTab] = useState<TabType>('attributes');
  const [isEditingAttributes, setIsEditingAttributes] = useState(false);
  const [isEditingRelations, setIsEditingRelations] = useState(false);
  const [isEditingLogic, setIsEditingLogic] = useState(false);
  const [isEditingActions, setIsEditingActions] = useState(false);
  const [aiAssistantOpen, setAiAssistantOpen] = useState(false);
  const [editedAttributes, setEditedAttributes] = useState<Record<string, any>>(config.attributes);
  const [editedRelations, setEditedRelations] = useState<EntityRelation[]>(config.relations || []);
  const [editedLogicRules, setEditedLogicRules] = useState<BusinessLogicRule[]>(config.logicRules || []);
  const [editedActions, setEditedActions] = useState<EntityAction[]>(config.actions || []);
  const [actionHistories, setActionHistories] = useState(getActionHistory(config.entityType, config.entityId));

  // Sync edited data when config changes (when different entity is selected)
  useEffect(() => {
    setEditedAttributes(config.attributes);
    setEditedRelations(config.relations || []);
    setEditedLogicRules(config.logicRules || []);
    setEditedActions(config.actions || []);
    setIsEditingAttributes(false);
    setIsEditingRelations(false);
    setIsEditingLogic(false);
    setIsEditingActions(false);
    setActiveTab('attributes'); // Reset to first tab when switching entities
  }, [config.entityId]);

  const handleSaveAttributes = () => {
    // TODO: Save attributes to entityConfigService
    setIsEditingAttributes(false);
    console.log('Saving attributes:', editedAttributes);
  };

  const handleSaveRelations = () => {
    // TODO: Save relations to entityConfigService
    setIsEditingRelations(false);
    console.log('Saving relations:', editedRelations);
  };

  const handleSaveActions = () => {
    // TODO: Save actions to entityConfigService
    setIsEditingActions(false);
    console.log('Saving actions:', editedActions);
  };

  const handleSaveLogic = () => {
    // TODO: Save logic rules to entityConfigService
    setIsEditingLogic(false);
    console.log('Saving logic rules:', editedLogicRules);
  };

  const handleApplyLogic = (logic: BusinessLogicRule) => {
    // Add logic rule from AI assistant
    setEditedLogicRules([...editedLogicRules, logic]);
    setAiAssistantOpen(false);
  };

  const handleAddRelation = () => {
    const newRelation: EntityRelation = {
      targetType: 'supplier' as any,
      relationType: '一对多',
      count: 0,
      sampleItems: [],
    };
    setEditedRelations([...editedRelations, newRelation]);
  };

  const handleDeleteRelation = (index: number) => {
    setEditedRelations(editedRelations.filter((_, i) => i !== index));
  };

  const handleAddAction = () => {
    const newAction: EntityAction = {
      actionId: `action-${Date.now()}`,
      name: '新操作',
      description: '',
      icon: 'Settings',
      color: 'blue',
    };
    setEditedActions([...editedActions, newAction]);
  };

  const handleDeleteAction = (actionId: string) => {
    setEditedActions(editedActions.filter(a => a.actionId !== actionId));
  };

  const handleAddLogicRule = () => {
    const newRule: BusinessLogicRule = {
      ruleId: `rule-${Date.now()}`,
      ruleType: 'validation',
      name: '新规则',
      condition: '',
      level: 'warning',
    };
    setEditedLogicRules([...editedLogicRules, newRule]);
  };

  const handleDeleteLogicRule = (ruleId: string) => {
    setEditedLogicRules(editedLogicRules.filter(r => r.ruleId !== ruleId));
  };

  const tabs = [
    { id: 'attributes' as TabType, label: '属性', icon: Database },
    { id: 'relations' as TabType, label: '关系', icon: Database },
    { id: 'logic' as TabType, label: '逻辑', icon: Zap },
    { id: 'actions' as TabType, label: '行动', icon: Settings },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-slate-200">
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h2 className="text-lg font-bold text-slate-800 mb-1">
              {config.attributes[`${config.entityType}Name`] || config.entityId}
            </h2>
            <p className="text-xs text-slate-500">ID: {config.entityId}</p>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="ml-4 p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded transition-colors"
              title="关闭"
            >
              <X size={18} />
            </button>
          )}
        </div>
        <button
          onClick={() => setAiAssistantOpen(true)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
        >
          <MessageSquare size={16} />
          AI助手
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1 px-3 py-2 text-sm font-medium transition-colors ${isActive
                  ? 'text-indigo-600 border-b-2 border-indigo-600 bg-indigo-50'
                  : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                }`}
            >
              <Icon size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Attributes Tab */}
        {activeTab === 'attributes' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-800">属性</h3>
              {!isEditingAttributes ? (
                <button
                  onClick={() => setIsEditingAttributes(true)}
                  className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
                >
                  <Edit2 size={16} />
                  编辑
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveAttributes}
                    className="flex items-center gap-1 text-sm text-green-600 hover:text-green-800"
                  >
                    <Save size={16} />
                    保存
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingAttributes(false);
                      setEditedAttributes(config.attributes);
                    }}
                    className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-800"
                  >
                    <X size={16} />
                    取消
                  </button>
                </div>
              )}
            </div>
            <div className="bg-slate-50 rounded-lg p-4 space-y-3">
              {Object.entries(editedAttributes).map(([key, value]) => {
                const displayName = getAttributeDisplayName(key, config.entityType);
                return (
                  <div key={key} className="flex justify-between items-start">
                    <span className="text-slate-600 text-sm min-w-[120px]">{displayName}:</span>
                    {isEditingAttributes ? (
                      <input
                        type="text"
                        value={Array.isArray(value) ? value.join(', ') : String(value)}
                        onChange={(e) => {
                          const newValue = e.target.value;
                          setEditedAttributes({
                            ...editedAttributes,
                            [key]: Array.isArray(value) ? newValue.split(',').map(s => s.trim()) : newValue,
                          });
                        }}
                        className="flex-1 ml-4 px-3 py-1.5 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                      />
                    ) : (
                      <span className="text-slate-800 font-medium text-sm flex-1 ml-4">
                        {Array.isArray(value)
                          ? convertIdArrayToNames(value as string[], key, config.entityType).join(', ')
                          : String(value)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Relations Tab */}
        {activeTab === 'relations' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-800">关系</h3>
              {!isEditingRelations ? (
                <button
                  onClick={() => setIsEditingRelations(true)}
                  className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
                >
                  <Edit2 size={16} />
                  编辑
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAddRelation}
                    className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
                  >
                    <Plus size={16} />
                    添加
                  </button>
                  <button
                    onClick={handleSaveRelations}
                    className="flex items-center gap-1 text-sm text-green-600 hover:text-green-800"
                  >
                    <Save size={16} />
                    保存
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingRelations(false);
                      setEditedRelations(config.relations || []);
                    }}
                    className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-800"
                  >
                    <X size={16} />
                    取消
                  </button>
                </div>
              )}
            </div>
            {editedRelations.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <p className="text-sm">暂无关系数据</p>
              </div>
            ) : (
              <div className="space-y-3">
                {editedRelations.map((relation, index) => {
                  const targetTypeName = getEntityTypeDisplayName(relation.targetType);
                  return (
                    <div key={index} className="bg-slate-50 rounded-lg p-4">
                      {isEditingRelations ? (
                        <div className="space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-600 text-sm">
                              {targetTypeName} ({relation.relationType})
                            </span>
                            <button
                              onClick={() => handleDeleteRelation(index)}
                              className="text-red-600 hover:text-red-800"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                          <div className="text-xs text-slate-500">
                            数量: {relation.count} 个
                          </div>
                          {relation.sampleItems && relation.sampleItems.length > 0 && (
                            <div className="text-xs text-slate-500">
                              示例: {relation.sampleItems.join(', ')}
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-600 text-sm">
                              {targetTypeName} ({relation.relationType})
                            </span>
                            <span className="text-slate-800 font-medium text-sm">{relation.count} 个</span>
                          </div>
                          {relation.sampleItems && relation.sampleItems.length > 0 && (
                            <div className="mt-2 text-xs text-slate-500">
                              示例: {relation.sampleItems.join(', ')}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Logic Tab */}
        {activeTab === 'logic' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-800">业务逻辑规则</h3>
              {!isEditingLogic ? (
                <button
                  onClick={() => setIsEditingLogic(true)}
                  className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
                >
                  <Edit2 size={16} />
                  编辑
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAddLogicRule}
                    className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
                  >
                    <Plus size={16} />
                    添加
                  </button>
                  <button
                    onClick={handleSaveLogic}
                    className="flex items-center gap-1 text-sm text-green-600 hover:text-green-800"
                  >
                    <Save size={16} />
                    保存
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingLogic(false);
                      setEditedLogicRules(config.logicRules || []);
                    }}
                    className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-800"
                  >
                    <X size={16} />
                    取消
                  </button>
                </div>
              )}
            </div>
            {editedLogicRules.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <p className="text-sm mb-2">暂无逻辑规则</p>
                {!isEditingLogic && (
                  <button
                    onClick={() => setIsEditingLogic(true)}
                    className="text-sm text-indigo-600 hover:text-indigo-800"
                  >
                    点击添加规则
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {editedLogicRules.map((rule) => {
                  // Add error handling for rule display
                  try {
                    return (
                      <div key={rule.ruleId} className="bg-slate-50 rounded-lg p-4">
                        {isEditingLogic ? (
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <input
                                type="text"
                                value={rule.name}
                                onChange={(e) => {
                                  setEditedLogicRules(editedLogicRules.map(r =>
                                    r.ruleId === rule.ruleId ? { ...r, name: e.target.value } : r
                                  ));
                                }}
                                className="flex-1 font-medium text-slate-800 bg-white px-2 py-1 border border-slate-300 rounded text-sm"
                                placeholder="规则名称"
                              />
                              <button
                                onClick={() => handleDeleteLogicRule(rule.ruleId)}
                                className="text-red-600 hover:text-red-800 ml-2"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                            <select
                              value={rule.ruleType}
                              onChange={(e) => {
                                setEditedLogicRules(editedLogicRules.map(r =>
                                  r.ruleId === rule.ruleId ? { ...r, ruleType: e.target.value as 'validation' | 'calculation' | 'trigger' } : r
                                ));
                              }}
                              className="w-full text-xs bg-white px-2 py-1 border border-slate-300 rounded"
                            >
                              <option value="validation">验证规则</option>
                              <option value="calculation">计算规则</option>
                              <option value="trigger">触发规则</option>
                            </select>
                            <input
                              type="text"
                              value={rule.condition || ''}
                              onChange={(e) => {
                                setEditedLogicRules(editedLogicRules.map(r =>
                                  r.ruleId === rule.ruleId ? { ...r, condition: e.target.value } : r
                                ));
                              }}
                              className="w-full text-xs bg-white px-2 py-1 border border-slate-300 rounded"
                              placeholder="条件表达式"
                            />
                            {rule.ruleType === 'calculation' && (
                              <input
                                type="text"
                                value={rule.formula || ''}
                                onChange={(e) => {
                                  setEditedLogicRules(editedLogicRules.map(r =>
                                    r.ruleId === rule.ruleId ? { ...r, formula: e.target.value } : r
                                  ));
                                }}
                                className="w-full text-xs bg-white px-2 py-1 border border-slate-300 rounded"
                                placeholder="计算公式"
                              />
                            )}
                            {rule.ruleType === 'trigger' && (
                              <input
                                type="text"
                                value={rule.action || ''}
                                onChange={(e) => {
                                  setEditedLogicRules(editedLogicRules.map(r =>
                                    r.ruleId === rule.ruleId ? { ...r, action: e.target.value } : r
                                  ));
                                }}
                                className="w-full text-xs bg-white px-2 py-1 border border-slate-300 rounded"
                                placeholder="触发动作"
                              />
                            )}
                            {rule.ruleType === 'validation' && (
                              <select
                                value={rule.level || 'warning'}
                                onChange={(e) => {
                                  setEditedLogicRules(editedLogicRules.map(r =>
                                    r.ruleId === rule.ruleId ? { ...r, level: e.target.value as 'warning' | 'critical' } : r
                                  ));
                                }}
                                className="w-full text-xs bg-white px-2 py-1 border border-slate-300 rounded"
                              >
                                <option value="warning">警告</option>
                                <option value="critical">严重</option>
                              </select>
                            )}
                          </div>
                        ) : (
                          <>
                            <div className="font-medium text-slate-800 text-sm">{rule.name}</div>
                            <div className="text-xs text-slate-600 mt-1">类型: {rule.ruleType === 'validation' ? '验证规则' : rule.ruleType === 'calculation' ? '计算规则' : '触发规则'}</div>
                            {rule.condition && (
                              <div className="text-xs text-slate-600 mt-1">条件: {rule.condition}</div>
                            )}
                            {rule.formula && (
                              <div className="text-xs text-slate-600 mt-1">公式: {rule.formula}</div>
                            )}
                            {rule.action && (
                              <div className="text-xs text-slate-600 mt-1">动作: {rule.action}</div>
                            )}
                            {rule.level && (
                              <div className="text-xs text-slate-600 mt-1">级别: {rule.level === 'warning' ? '警告' : '严重'}</div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  } catch (error) {
                    console.error('Error rendering logic rule:', rule.ruleId, error);
                    return (
                      <div key={rule.ruleId} className="bg-red-50 rounded-lg p-4 border border-red-200">
                        <div className="text-sm text-red-600">规则渲染错误：{rule.name || rule.ruleId}</div>
                        <div className="text-xs text-red-500 mt-1">请检查规则配置</div>
                      </div>
                    );
                  }
                })}
              </div>
            )}
          </div>
        )}

        {/* Actions Tab */}
        {activeTab === 'actions' && (
          <div className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-slate-800">可用操作</h3>
              {!isEditingActions ? (
                <button
                  onClick={() => setIsEditingActions(true)}
                  className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
                >
                  <Edit2 size={16} />
                  编辑
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAddAction}
                    className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-800"
                  >
                    <Plus size={16} />
                    添加
                  </button>
                  <button
                    onClick={handleSaveActions}
                    className="flex items-center gap-1 text-sm text-green-600 hover:text-green-800"
                  >
                    <Save size={16} />
                    保存
                  </button>
                  <button
                    onClick={() => {
                      setIsEditingActions(false);
                      setEditedActions(config.actions || []);
                    }}
                    className="flex items-center gap-1 text-sm text-slate-600 hover:text-slate-800"
                  >
                    <X size={16} />
                    取消
                  </button>
                </div>
              )}
            </div>
            {editedActions.length === 0 ? (
              <div className="text-center py-8 text-slate-400">
                <p className="text-sm">暂无可用操作</p>
              </div>
            ) : (
              <div className="space-y-3">
                {editedActions.map((action) => (
                  <div key={action.actionId} className="bg-indigo-50 hover:bg-indigo-100 rounded-lg p-4 transition-colors">
                    {isEditingActions ? (
                      <div className="space-y-2">
                        <div className="flex justify-between items-center">
                          <input
                            type="text"
                            value={action.name}
                            onChange={(e) => {
                              setEditedActions(editedActions.map(a =>
                                a.actionId === action.actionId ? { ...a, name: e.target.value } : a
                              ));
                            }}
                            className="flex-1 font-medium text-indigo-800 bg-white px-2 py-1 border border-slate-300 rounded text-sm"
                          />
                          <button
                            onClick={() => handleDeleteAction(action.actionId)}
                            className="text-red-600 hover:text-red-800 ml-2"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        <input
                          type="text"
                          value={action.description}
                          onChange={(e) => {
                            setEditedActions(editedActions.map(a =>
                              a.actionId === action.actionId ? { ...a, description: e.target.value } : a
                            ));
                          }}
                          className="w-full text-xs text-indigo-600 bg-white px-2 py-1 border border-slate-300 rounded"
                          placeholder="描述"
                        />
                      </div>
                    ) : (
                      <>
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="font-medium text-indigo-800 text-sm">{action.name}</div>
                            <div className="text-xs text-indigo-600 mt-1">{action.description}</div>
                          </div>
                          {(action.actionId.startsWith('action-product-calculated-') ||
                            action.actionId.startsWith('action-material-calculated-') ||
                            action.actionId.startsWith('action-order-calculated-')) && (
                              <button
                                onClick={() => {
                                  try {
                                    // Execute action and record history
                                    executeAction(config.entityType, config.entityId, action.name);
                                    // Refresh action histories
                                    setActionHistories(getActionHistory(config.entityType, config.entityId));
                                    alert(`行动"${action.name}"已执行`);
                                  } catch (error) {
                                    console.error('Error executing action:', error);
                                    alert(`执行行动失败：${error instanceof Error ? error.message : '未知错误'}`);
                                  }
                                }}
                                className="ml-2 px-3 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 transition-colors"
                              >
                                执行
                              </button>
                            )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Action History Section */}
            {actionHistories.length > 0 && (
              <div className="mt-6 pt-6 border-t border-slate-200">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">执行历史</h3>
                <div className="space-y-2 max-h-40 overflow-y-auto">
                  {actionHistories.map((history) => (
                    <div key={history.actionId} className="bg-slate-50 rounded p-2 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="font-medium text-slate-800">{history.actionName}</span>
                        <span className="text-slate-500">{history.executedAt}</span>
                      </div>
                      {history.executedBy && (
                        <div className="text-slate-500 mt-1">执行人：{history.executedBy}</div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* AI Assistant Modal */}
      {aiAssistantOpen && (
        <ConfigAIAssistant
          isOpen={aiAssistantOpen}
          onClose={() => setAiAssistantOpen(false)}
          objectName={config.attributes[`${config.entityType}Name`] || config.entityId}
          onApplyLogic={handleApplyLogic}
        />
      )}
    </div>
  );
};

export default RightPanel;

