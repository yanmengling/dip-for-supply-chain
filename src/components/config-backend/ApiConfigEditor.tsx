/**
 * API Configuration Editor Component
 * 
 * Form-based editor for creating and modifying API configurations.
 * Supports all five configuration types with type-specific fields and validation.
 */

import { useState, useEffect } from 'react';
import { Save, X, TestTube, AlertCircle, CheckCircle } from 'lucide-react';
import type {
    AnyApiConfig,
    ApiConfigType,
    KnowledgeNetworkConfig,
    OntologyObjectConfig,
    DataViewConfig,
    MetricModelConfig,
    AgentConfig,
    WorkflowConfig,
    ConfigValidationError
} from '../../types/apiConfig';
import { apiConfigService } from '../../services/apiConfigService';

// ============================================================================
// Props Interface
// ============================================================================

interface ApiConfigEditorProps {
    /** Configuration type */
    configType: ApiConfigType;

    /** Existing configuration to edit (null for new) */
    config?: AnyApiConfig | null;

    /** Callback when save is successful */
    onSave: (config: AnyApiConfig) => void;

    /** Callback when cancel is requested */
    onCancel: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Generate unique ID
 */
function generateId(type: ApiConfigType): string {
    const prefix = type.substring(0, 3);
    const timestamp = Date.now();
    return `${prefix}_${timestamp}`;
}

/**
 * Get default form data for type
 */
function getDefaultFormData(type: ApiConfigType): Partial<AnyApiConfig> {
    const base = {
        id: generateId(type),
        type,
        name: '',
        description: '',
        enabled: true,
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
    };

    switch (type) {
        case 'knowledge_network':
            return {
                ...base,
                knowledgeNetworkId: '',
                objectTypes: {}
            } as Partial<KnowledgeNetworkConfig>;

        case 'ontology_object':
            return {
                ...base,
                objectTypeId: '',
                entityType: ''
            } as Partial<OntologyObjectConfig>;

        case 'metric_model':
            return {
                ...base,
                modelId: ''
            } as Partial<MetricModelConfig>;

        case 'agent':
            return {
                ...base,
                agentKey: '',
                appKey: '',
                enableStreaming: true,
                enableHistory: true
            } as Partial<AgentConfig>;

        case 'workflow':
            return {
                ...base,
                dagId: '',
                triggerType: 'manual'
            } as Partial<WorkflowConfig>;

        default:
            return base;
    }
}

/**
 * Validate configuration
 */
function validateConfig(config: Partial<AnyApiConfig>): ConfigValidationError[] {
    const errors: ConfigValidationError[] = [];

    // Base validation
    if (!config.name?.trim()) {
        errors.push({ field: 'name', message: '配置名称不能为空' });
    }

    // Type-specific validation
    switch (config.type) {
        case 'knowledge_network':
            const kn = config as Partial<KnowledgeNetworkConfig>;
            if (!kn.knowledgeNetworkId?.trim()) {
                errors.push({ field: 'knowledgeNetworkId', message: '知识网络 ID 不能为空' });
            }
            break;

        case 'ontology_object':
            const ov = config as Partial<OntologyObjectConfig>;
            if (!ov.objectTypeId?.trim()) {
                errors.push({ field: 'objectTypeId', message: '对象类型 ID 不能为空' });
            }
            if (!ov.entityType?.trim()) {
                errors.push({ field: 'entityType', message: '实体类型不能为空' });
            }
            break;

        case 'metric_model':
            const mm = config as Partial<MetricModelConfig>;
            if (!mm.modelId?.trim()) {
                errors.push({ field: 'modelId', message: '指标模型 ID 不能为空' });
            }
            break;

        case 'agent':
            const agent = config as Partial<AgentConfig>;
            if (!agent.agentKey?.trim()) {
                errors.push({ field: 'agentKey', message: 'Agent Key 不能为空' });
            }
            if (!agent.appKey?.trim()) {
                errors.push({ field: 'appKey', message: 'App Key 不能为空' });
            }
            break;

        case 'workflow':
            const wf = config as Partial<WorkflowConfig>;
            if (!wf.dagId?.trim()) {
                errors.push({ field: 'dagId', message: 'DAG ID 不能为空' });
            }
            break;
    }

    return errors;
}

// ============================================================================
// Component
// ============================================================================

export function ApiConfigEditor({ configType, config, onSave, onCancel }: ApiConfigEditorProps) {
    const [formData, setFormData] = useState<Partial<AnyApiConfig>>(
        config || getDefaultFormData(configType)
    );
    const [validationErrors, setValidationErrors] = useState<ConfigValidationError[]>([]);
    const [isTesting, setIsTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
    const [tagInput, setTagInput] = useState('');

    const isEditMode = !!config;

    /**
     * Handle form field change
     */
    const handleChange = (field: string, value: any) => {
        setFormData(prev => ({ ...prev, [field]: value }));
        // Clear validation error for this field
        setValidationErrors(prev => prev.filter(e => e.field !== field));
    };

    /**
     * Handle tag addition
     */
    const handleAddTag = () => {
        if (!tagInput.trim()) return;
        const tags = formData.tags || [];
        if (!tags.includes(tagInput.trim())) {
            handleChange('tags', [...tags, tagInput.trim()]);
        }
        setTagInput('');
    };

    /**
     * Handle tag removal
     */
    const handleRemoveTag = (tag: string) => {
        const tags = formData.tags || [];
        handleChange('tags', tags.filter(t => t !== tag));
    };

    /**
     * Handle save
     */
    const handleSave = () => {
        const errors = validateConfig(formData);
        if (errors.length > 0) {
            setValidationErrors(errors);
            return;
        }

        formData.updatedAt = Date.now();
        onSave(formData as AnyApiConfig);
    };

    /**
     * Handle test connection
     */
    const handleTest = async () => {
        const errors = validateConfig(formData);
        if (errors.length > 0) {
            setValidationErrors(errors);
            alert('请先填写必填字段');
            return;
        }

        setIsTesting(true);
        setTestResult(null);

        try {
            const result = await apiConfigService.testConnection(formData as AnyApiConfig);
            setTestResult(result);
        } catch (error) {
            setTestResult({
                success: false,
                message: error instanceof Error ? error.message : '测试失败'
            });
        } finally {
            setIsTesting(false);
        }
    };

    /**
     * Render type-specific fields
     */
    const renderTypeSpecificFields = () => {
        switch (configType) {
            case 'knowledge_network':
                const kn = formData as Partial<KnowledgeNetworkConfig>;
                return (
                    <>
                        <FormField label="知识网络 ID" required error={getFieldError('knowledgeNetworkId')}>
                            <input
                                type="text"
                                value={kn.knowledgeNetworkId || ''}
                                onChange={(e) => handleChange('knowledgeNetworkId', e.target.value)}
                                className="form-input"
                                placeholder="例如: d56v1l69olk4bpa66uv0"
                            />
                        </FormField>
                    </>
                );

            case 'ontology_object':
                const ov = formData as Partial<OntologyObjectConfig>;
                return (
                    <>
                        <FormField label="对象类型 ID" required error={getFieldError('objectTypeId')}>
                            <input
                                type="text"
                                value={ov.objectTypeId || ''}
                                onChange={(e) => handleChange('objectTypeId', e.target.value)}
                                className="form-input"
                                placeholder="例如: 2004376134633480193"
                            />
                        </FormField>
                        <FormField label="实体类型" required error={getFieldError('entityType')}>
                            <select
                                value={ov.entityType || ''}
                                onChange={(e) => handleChange('entityType', e.target.value)}
                                className="form-input"
                            >
                                <option value="">请选择</option>
                                <option value="supplier">供应商</option>
                                <option value="material">物料</option>
                                <option value="product">产品</option>
                                <option value="bom">BOM</option>
                                <option value="inventory">库存</option>
                                <option value="order">订单</option>
                                <option value="customer">客户</option>
                                <option value="warehouse">仓库</option>
                            </select>
                        </FormField>
                    </>
                );

            case 'metric_model':
                const mm = formData as Partial<MetricModelConfig>;
                return (
                    <>
                        <FormField label="指标模型 ID" required error={getFieldError('modelId')}>
                            <input
                                type="text"
                                value={mm.modelId || ''}
                                onChange={(e) => handleChange('modelId', e.target.value)}
                                className="form-input"
                                placeholder="例如: metric_001"
                            />
                        </FormField>
                        <FormField label="指标类型">
                            <select
                                value={mm.metricType || ''}
                                onChange={(e) => handleChange('metricType', e.target.value)}
                                className="form-input"
                            >
                                <option value="">请选择</option>
                                <option value="atomic">原子指标</option>
                                <option value="complex">复合指标</option>
                            </select>
                        </FormField>
                        <FormField label="单位">
                            <input
                                type="text"
                                value={mm.unit || ''}
                                onChange={(e) => handleChange('unit', e.target.value)}
                                className="form-input"
                                placeholder="例如: 元, 件, %"
                            />
                        </FormField>
                    </>
                );

            case 'agent':
                const agent = formData as Partial<AgentConfig>;
                return (
                    <>
                        <FormField label="Agent Key" required error={getFieldError('agentKey')}>
                            <input
                                type="text"
                                value={agent.agentKey || ''}
                                onChange={(e) => handleChange('agentKey', e.target.value)}
                                className="form-input"
                                placeholder="例如: 01KEX8BP0GR6TMXQR7GE3XN16A"
                            />
                        </FormField>
                        <FormField label="App Key" required error={getFieldError('appKey')}>
                            <input
                                type="text"
                                value={agent.appKey || ''}
                                onChange={(e) => handleChange('appKey', e.target.value)}
                                className="form-input"
                                placeholder="例如: 01KEX8BP0GR6TMXQR7GE3XN16A"
                            />
                        </FormField>
                        <FormField label="Agent 版本">
                            <input
                                type="text"
                                value={agent.agentVersion || ''}
                                onChange={(e) => handleChange('agentVersion', e.target.value)}
                                className="form-input"
                                placeholder="例如: v2"
                            />
                        </FormField>
                        <FormField label="对话模式">
                            <select
                                value={agent.chatMode || 'normal'}
                                onChange={(e) => handleChange('chatMode', e.target.value)}
                                className="form-input"
                            >
                                <option value="normal">普通模式</option>
                                <option value="deep_thinking">深度思考模式</option>
                            </select>
                        </FormField>
                    </>
                );

            case 'workflow':
                const wf = formData as Partial<WorkflowConfig>;
                return (
                    <>
                        <FormField label="DAG ID" required error={getFieldError('dagId')}>
                            <input
                                type="text"
                                value={wf.dagId || ''}
                                onChange={(e) => handleChange('dagId', e.target.value)}
                                className="form-input"
                                placeholder="例如: 600565437910010238"
                            />
                        </FormField>
                        <FormField label="工作流名称">
                            <input
                                type="text"
                                value={wf.workflowName || ''}
                                onChange={(e) => handleChange('workflowName', e.target.value)}
                                className="form-input"
                                placeholder="工作流显示名称"
                            />
                        </FormField>
                        <FormField label="触发类型">
                            <select
                                value={wf.triggerType || 'manual'}
                                onChange={(e) => handleChange('triggerType', e.target.value)}
                                className="form-input"
                            >
                                <option value="manual">手动触发</option>
                                <option value="scheduled">定时触发</option>
                                <option value="event">事件触发</option>
                            </select>
                        </FormField>
                    </>
                );

            default:
                return null;
        }
    };

    /**
     * Get field error message
     */
    const getFieldError = (field: string): string => {
        return validationErrors.find(e => e.field === field)?.message || '';
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto">
                {/* Header */}
                <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-slate-800">
                        {isEditMode ? '编辑配置' : '新建配置'}
                    </h2>
                    <button
                        onClick={onCancel}
                        className="p-2 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Form */}
                <div className="p-6 space-y-6">
                    {/* Base Fields */}
                    <div className="space-y-4">
                        <FormField label="配置名称" required error={getFieldError('name')}>
                            <input
                                type="text"
                                value={formData.name || ''}
                                onChange={(e) => handleChange('name', e.target.value)}
                                className="form-input"
                                placeholder="输入配置名称"
                            />
                        </FormField>

                        <FormField label="描述">
                            <textarea
                                value={formData.description || ''}
                                onChange={(e) => handleChange('description', e.target.value)}
                                className="form-input"
                                rows={3}
                                placeholder="输入配置描述（可选）"
                            />
                        </FormField>

                        <FormField label="标签">
                            <div className="space-y-2">
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={tagInput}
                                        onChange={(e) => setTagInput(e.target.value)}
                                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddTag())}
                                        className="form-input flex-1"
                                        placeholder="输入标签后按回车添加"
                                    />
                                    <button
                                        onClick={handleAddTag}
                                        className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                                    >
                                        添加
                                    </button>
                                </div>
                                {formData.tags && formData.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-2">
                                        {formData.tags.map((tag) => (
                                            <span
                                                key={tag}
                                                className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-100 text-indigo-700 text-sm rounded"
                                            >
                                                {tag}
                                                <button
                                                    onClick={() => handleRemoveTag(tag)}
                                                    className="hover:text-indigo-900"
                                                >
                                                    <X size={14} />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </FormField>

                        <FormField label="启用状态">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={formData.enabled}
                                    onChange={(e) => handleChange('enabled', e.target.checked)}
                                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                />
                                <span className="text-sm text-slate-700">启用此配置</span>
                            </label>
                        </FormField>
                    </div>

                    {/* Type-Specific Fields */}
                    <div className="pt-4 border-t border-slate-200 space-y-4">
                        <h3 className="text-lg font-medium text-slate-800">配置详情</h3>
                        {renderTypeSpecificFields()}
                    </div>

                    {/* Test Result */}
                    {testResult && (
                        <div className={`p-4 rounded-lg border ${testResult.success
                            ? 'bg-green-50 border-green-200'
                            : 'bg-red-50 border-red-200'
                            }`}>
                            <div className="flex items-start gap-2">
                                {testResult.success ? (
                                    <CheckCircle className="text-green-600 flex-shrink-0 mt-0.5" size={18} />
                                ) : (
                                    <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={18} />
                                )}
                                <div className="flex-1">
                                    <p className={`text-sm font-medium ${testResult.success ? 'text-green-800' : 'text-red-800'
                                        }`}>
                                        {testResult.success ? '连接测试成功' : '连接测试失败'}
                                    </p>
                                    <p className={`text-sm mt-1 ${testResult.success ? 'text-green-700' : 'text-red-700'
                                        }`}>
                                        {testResult.message}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Validation Errors */}
                    {validationErrors.length > 0 && (
                        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                            <div className="flex items-start gap-2">
                                <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={18} />
                                <div className="flex-1">
                                    <p className="text-sm font-medium text-red-800 mb-2">请修正以下错误：</p>
                                    <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                                        {validationErrors.map((error, i) => (
                                            <li key={i}>{error.message}</li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-slate-50 border-t border-slate-200 px-6 py-4 flex gap-3">
                    <button
                        onClick={handleSave}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                        <Save size={18} />
                        保存配置
                    </button>
                    <button
                        onClick={handleTest}
                        disabled={isTesting}
                        className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg hover:bg-white transition-colors disabled:opacity-50"
                    >
                        <TestTube size={18} className={isTesting ? 'animate-pulse' : ''} />
                        {isTesting ? '测试中...' : '测试连接'}
                    </button>
                    <button
                        onClick={onCancel}
                        className="px-4 py-2 border border-slate-300 rounded-lg hover:bg-white transition-colors"
                    >
                        取消
                    </button>
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// Form Field Component
// ============================================================================

interface FormFieldProps {
    label: string;
    required?: boolean;
    error?: string;
    children: React.ReactNode;
}

function FormField({ label, required, error, children }: FormFieldProps) {
    return (
        <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
                {label}
                {required && <span className="text-red-500 ml-1">*</span>}
            </label>
            {children}
            {error && (
                <p className="mt-1 text-sm text-red-600">{error}</p>
            )}
        </div>
    );
}

// ============================================================================
// Styles
// ============================================================================

const styles = `
  .form-input {
    @apply w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent;
  }
`;

export default ApiConfigEditor;
