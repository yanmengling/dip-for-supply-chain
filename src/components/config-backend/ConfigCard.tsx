/**
 * Configuration Card Component
 * 
 * Displays a single API configuration with actions and status indicators.
 */

import { useState } from 'react';
import {
    Edit, Trash2, Copy, Power, TestTube, ChevronDown, ChevronUp,
    GitBranch, Database, TrendingUp, Bot, Workflow, Tag, Calendar, Check, X
} from 'lucide-react';
import type { AnyApiConfig, ApiConfigType } from '../../types/apiConfig';

// ============================================================================
// Props Interface
// ============================================================================

interface ConfigCardProps {
    /** Configuration to display */
    config: AnyApiConfig;

    /** Callback when edit is requested */
    onEdit: () => void;

    /** Callback when delete is requested */
    onDelete: () => void;

    /** Callback when duplicate is requested */
    onDuplicate: () => void;

    /** Callback when toggle enabled is requested */
    onToggleEnabled: () => void;

    /** Callback when test is requested */
    onTest: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get icon for configuration type
 */
function getConfigTypeIcon(type: ApiConfigType) {
    const icons = {
        knowledge_network: GitBranch,
        ontology_object: Database,
        metric_model: TrendingUp,
        agent: Bot,
        workflow: Workflow
    };
    return icons[type] || Database;
}

/**
 * Get color for configuration type
 */
function getConfigTypeColor(type: ApiConfigType): string {
    const colors = {
        knowledge_network: 'text-purple-600 bg-purple-50 border-purple-200',
        ontology_object: 'text-blue-600 bg-blue-50 border-blue-200',
        metric_model: 'text-green-600 bg-green-50 border-green-200',
        agent: 'text-orange-600 bg-orange-50 border-orange-200',
        workflow: 'text-pink-600 bg-pink-50 border-pink-200'
    };
    return colors[type] || 'text-gray-600 bg-gray-50 border-gray-200';
}

/**
 * Format timestamp
 */
function formatTimestamp(timestamp: number): string {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// ============================================================================
// Component
// ============================================================================

export function ConfigCard({
    config,
    onEdit,
    onDelete,
    onDuplicate,
    onToggleEnabled,
    onTest
}: ConfigCardProps) {
    const [isExpanded, setIsExpanded] = useState(false);
    const [isTesting, setIsTesting] = useState(false);

    const Icon = getConfigTypeIcon(config.type);
    const typeColor = getConfigTypeColor(config.type);

    /**
     * Handle test with loading state
     */
    const handleTest = async () => {
        setIsTesting(true);
        try {
            await onTest();
        } finally {
            setIsTesting(false);
        }
    };

    /**
     * Render type-specific details
     */
    const renderDetails = () => {
        switch (config.type) {
            case 'knowledge_network':
                return (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium text-slate-600">知识网络 ID:</span>
                            <code className="px-2 py-1 bg-slate-100 rounded text-xs">{config.knowledgeNetworkId}</code>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium text-slate-600">对象类型:</span>
                            <span className="text-slate-700">{Object.keys(config.objectTypes || {}).length} 个</span>
                        </div>
                    </div>
                );

            case 'ontology_object':
                return (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium text-slate-600">对象类型 ID:</span>
                            <code className="px-2 py-1 bg-slate-100 rounded text-xs">{config.objectTypeId}</code>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium text-slate-600">实体类型:</span>
                            <span className="text-slate-700">{config.entityType}</span>
                        </div>
                    </div>
                );

            case 'metric_model':
                return (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium text-slate-600">模型 ID:</span>
                            <code className="px-2 py-1 bg-slate-100 rounded text-xs">{config.modelId}</code>
                        </div>
                        {config.metricType && (
                            <div className="flex items-center gap-2 text-sm">
                                <span className="font-medium text-slate-600">指标类型:</span>
                                <span className="text-slate-700">{config.metricType === 'atomic' ? '原子指标' : '复合指标'}</span>
                            </div>
                        )}
                    </div>
                );

            case 'agent':
                return (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium text-slate-600">Agent Key:</span>
                            <code className="px-2 py-1 bg-slate-100 rounded text-xs">{config.agentKey}</code>
                        </div>
                        {config.chatMode && (
                            <div className="flex items-center gap-2 text-sm">
                                <span className="font-medium text-slate-600">对话模式:</span>
                                <span className="text-slate-700">
                                    {config.chatMode === 'normal' ? '普通模式' : '深度思考模式'}
                                </span>
                            </div>
                        )}
                    </div>
                );

            case 'workflow':
                return (
                    <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm">
                            <span className="font-medium text-slate-600">DAG ID:</span>
                            <code className="px-2 py-1 bg-slate-100 rounded text-xs">{config.dagId}</code>
                        </div>
                        {config.triggerType && (
                            <div className="flex items-center gap-2 text-sm">
                                <span className="font-medium text-slate-600">触发类型:</span>
                                <span className="text-slate-700">
                                    {config.triggerType === 'manual' ? '手动触发' :
                                        config.triggerType === 'scheduled' ? '定时触发' : '事件触发'}
                                </span>
                            </div>
                        )}
                    </div>
                );

            default:
                return null;
        }
    };

    return (
        <div className={`border rounded-lg overflow-hidden transition-all ${config.enabled ? 'bg-white border-slate-200' : 'bg-slate-50 border-slate-300 opacity-75'
            }`}>
            {/* Header */}
            <div className="p-4">
                <div className="flex items-start justify-between gap-4">
                    {/* Left: Icon and Info */}
                    <div className="flex items-start gap-3 flex-1">
                        {/* Type Icon */}
                        <div className={`p-2 rounded-lg border ${typeColor}`}>
                            <Icon size={20} />
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                                <h3 className="text-lg font-semibold text-slate-800 truncate">
                                    {config.name}
                                </h3>
                                {config.enabled ? (
                                    <span className="flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full">
                                        <Check size={12} />
                                        已启用
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1 px-2 py-0.5 bg-slate-200 text-slate-600 text-xs rounded-full">
                                        <X size={12} />
                                        已禁用
                                    </span>
                                )}
                            </div>

                            {config.description && (
                                <p className="text-sm text-slate-600 mb-2 line-clamp-2">
                                    {config.description}
                                </p>
                            )}

                            {/* Tags */}
                            {config.tags && config.tags.length > 0 && (
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Tag size={14} className="text-slate-400" />
                                    {config.tags.map((tag) => (
                                        <span
                                            key={tag}
                                            className="px-2 py-0.5 bg-slate-100 text-slate-600 text-xs rounded"
                                        >
                                            {tag}
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-2">
                        <button
                            onClick={handleTest}
                            disabled={isTesting}
                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                            title="测试连接"
                        >
                            <TestTube size={18} className={isTesting ? 'animate-pulse' : ''} />
                        </button>
                        <button
                            onClick={onToggleEnabled}
                            className={`p-2 rounded-lg transition-colors ${config.enabled
                                ? 'text-green-600 hover:bg-green-50'
                                : 'text-slate-400 hover:bg-slate-100'
                                }`}
                            title={config.enabled ? '禁用' : '启用'}
                        >
                            <Power size={18} />
                        </button>
                        <button
                            onClick={onDuplicate}
                            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            title="复制"
                        >
                            <Copy size={18} />
                        </button>
                        <button
                            onClick={onEdit}
                            className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                            title="编辑"
                        >
                            <Edit size={18} />
                        </button>
                        <button
                            onClick={onDelete}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="删除"
                        >
                            <Trash2 size={18} />
                        </button>
                        <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="p-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                            title={isExpanded ? '收起' : '展开'}
                        >
                            {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Expanded Details */}
            {isExpanded && (
                <div className="px-4 pb-4 pt-2 border-t border-slate-200">
                    <div className="space-y-4">
                        {/* Type-specific details */}
                        {renderDetails()}

                        {/* Metadata */}
                        <div className="pt-3 border-t border-slate-100 space-y-2">
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <Calendar size={14} />
                                <span>创建时间: {formatTimestamp(config.createdAt)}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <Calendar size={14} />
                                <span>更新时间: {formatTimestamp(config.updatedAt)}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                                <span className="font-mono">ID: {config.id}</span>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default ConfigCard;
