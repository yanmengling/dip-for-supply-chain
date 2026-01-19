/**
 * API Configuration List View Component
 * 
 * Displays a list of API configurations with search, filtering, and management capabilities.
 * Supports all five API configuration types.
 */

import { useState, useEffect } from 'react';
import { Plus, Search, Filter, Download, Upload, RefreshCw, Trash2, Copy, Power } from 'lucide-react';
import type { ApiConfigType, AnyApiConfig, BaseApiConfig } from '../../types/apiConfig';
import { apiConfigService } from '../../services/apiConfigService';
import { ConfigCard } from './ConfigCard';

// ============================================================================
// Props Interface
// ============================================================================

interface ApiConfigListViewProps {
    /** Configuration type to display */
    configType: ApiConfigType;

    /** Callback when edit is requested */
    onEdit: (config: AnyApiConfig) => void;

    /** Callback when create is requested */
    onCreate: () => void;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get display label for configuration type
 */
function getConfigTypeLabel(type: ApiConfigType): string {
    const labels: Record<ApiConfigType, string> = {
        knowledge_network: '业务知识网络配置',
        data_view: '数据视图配置',
        metric_model: '指标模型配置',
        agent: 'Agent 配置',
        workflow: '工作流配置'
    };
    return labels[type] || type;
}

/**
 * Get description for configuration type
 */
function getConfigTypeDescription(type: ApiConfigType): string {
    const descriptions: Record<ApiConfigType, string> = {
        knowledge_network: '管理业务知识网络、对象类型和关系类型配置',
        data_view: '管理数据查询视图配置，用于查询各类业务数据',
        metric_model: '管理指标模型配置，用于查询和计算业务指标',
        agent: '管理智能助手配置，包括对话模式和参数设置',
        workflow: '管理工作流配置，包括 DAG 工作流和自动化任务'
    };
    return descriptions[type] || '';
}

// ============================================================================
// Component
// ============================================================================

export function ApiConfigListView({ configType, onEdit, onCreate }: ApiConfigListViewProps) {
    const [configs, setConfigs] = useState<BaseApiConfig[]>([]);
    const [filteredConfigs, setFilteredConfigs] = useState<BaseApiConfig[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
    const [isLoading, setIsLoading] = useState(false);

    // Load configurations
    useEffect(() => {
        loadConfigs();
    }, [configType]);

    // Apply filters
    useEffect(() => {
        applyFilters();
    }, [configs, searchTerm, statusFilter]);

    /**
     * Load configurations from service
     */
    const loadConfigs = () => {
        setIsLoading(true);
        try {
            const loaded = apiConfigService.getConfigsByType(configType);
            setConfigs(loaded);
        } catch (error) {
            console.error('Failed to load configurations:', error);
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Apply search and status filters
     */
    const applyFilters = () => {
        let filtered = [...configs];

        // Apply search filter
        if (searchTerm) {
            const lowerSearch = searchTerm.toLowerCase();
            filtered = filtered.filter(config =>
                config.name.toLowerCase().includes(lowerSearch) ||
                config.description?.toLowerCase().includes(lowerSearch) ||
                config.tags?.some(tag => tag.toLowerCase().includes(lowerSearch))
            );
        }

        // Apply status filter
        if (statusFilter !== 'all') {
            filtered = filtered.filter(config =>
                statusFilter === 'enabled' ? config.enabled : !config.enabled
            );
        }

        setFilteredConfigs(filtered);
    };

    /**
     * Handle configuration deletion
     */
    const handleDelete = async (id: string) => {
        if (!confirm('确定要删除此配置吗？此操作不可撤销。')) {
            return;
        }

        try {
            const success = apiConfigService.deleteConfig(id);
            if (success) {
                loadConfigs();
            }
        } catch (error) {
            console.error('Failed to delete configuration:', error);
            alert('删除配置失败，请重试');
        }
    };

    /**
     * Handle configuration duplication
     */
    const handleDuplicate = async (id: string) => {
        try {
            const duplicated = apiConfigService.duplicateConfig(id);
            if (duplicated) {
                loadConfigs();
            }
        } catch (error) {
            console.error('Failed to duplicate configuration:', error);
            alert('复制配置失败，请重试');
        }
    };

    /**
     * Handle toggle enabled status
     */
    const handleToggleEnabled = async (id: string) => {
        try {
            apiConfigService.toggleEnabled(id);
            loadConfigs();
        } catch (error) {
            console.error('Failed to toggle enabled status:', error);
            alert('切换状态失败，请重试');
        }
    };

    /**
     * Handle configuration test
     */
    const handleTest = async (config: AnyApiConfig) => {
        try {
            const result = await apiConfigService.testConnection(config);
            if (result.success) {
                alert(`✅ 连接测试成功\n\n${result.message}`);
            } else {
                alert(`❌ 连接测试失败\n\n${result.message}`);
            }
        } catch (error) {
            console.error('Failed to test configuration:', error);
            alert('连接测试失败，请检查配置');
        }
    };

    /**
     * Handle export
     */
    const handleExport = () => {
        try {
            const json = apiConfigService.exportConfig({
                types: [configType],
                includeDisabled: true,
                prettyPrint: true
            });

            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${configType}_configs_${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Failed to export configurations:', error);
            alert('导出配置失败，请重试');
        }
    };

    /**
     * Handle import
     */
    const handleImport = () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = async (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (!file) return;

            try {
                const text = await file.text();
                apiConfigService.importConfig(text, true); // merge=true
                loadConfigs();
                alert('配置导入成功');
            } catch (error) {
                console.error('Failed to import configurations:', error);
                alert('导入配置失败，请检查文件格式');
            }
        };
        input.click();
    };

    return (
        <div className="p-6 h-full overflow-auto">
            {/* Header */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-2">
                    <h2 className="text-2xl font-semibold text-slate-800">
                        {getConfigTypeLabel(configType)}
                    </h2>
                    <button
                        onClick={onCreate}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                        <Plus size={18} />
                        新建配置
                    </button>
                </div>
                <p className="text-slate-600 text-sm">
                    {getConfigTypeDescription(configType)}
                </p>
            </div>

            {/* Toolbar */}
            <div className="mb-6 flex flex-wrap gap-4">
                {/* Search */}
                <div className="flex-1 min-w-[300px]">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                        <input
                            type="text"
                            placeholder="搜索配置名称、描述或标签..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-2">
                    <Filter size={18} className="text-slate-600" />
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as any)}
                        className="px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="all">全部状态</option>
                        <option value="enabled">已启用</option>
                        <option value="disabled">已禁用</option>
                    </select>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                    <button
                        onClick={handleExport}
                        className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                        title="导出配置"
                    >
                        <Download size={18} />
                        导出
                    </button>
                    <button
                        onClick={handleImport}
                        className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                        title="导入配置"
                    >
                        <Upload size={18} />
                        导入
                    </button>
                    <button
                        onClick={loadConfigs}
                        className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
                        title="刷新"
                    >
                        <RefreshCw size={18} />
                    </button>
                </div>
            </div>

            {/* Statistics */}
            <div className="mb-4 flex gap-4 text-sm text-slate-600">
                <span>总计: {configs.length} 个配置</span>
                <span>已启用: {configs.filter(c => c.enabled).length}</span>
                <span>已禁用: {configs.filter(c => !c.enabled).length}</span>
                {searchTerm && <span>搜索结果: {filteredConfigs.length}</span>}
            </div>

            {/* Configuration List */}
            {isLoading ? (
                <div className="flex items-center justify-center h-64">
                    <div className="text-slate-500">加载中...</div>
                </div>
            ) : filteredConfigs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-500">
                    <p className="text-lg mb-2">
                        {searchTerm ? '未找到匹配的配置' : '暂无配置'}
                    </p>
                    <p className="text-sm">
                        {searchTerm ? '尝试修改搜索条件' : '点击"新建配置"开始创建'}
                    </p>
                </div>
            ) : (
                <div className="grid gap-4">
                    {filteredConfigs.map((config) => (
                        <ConfigCard
                            key={config.id}
                            config={config as AnyApiConfig}
                            onEdit={() => onEdit(config as AnyApiConfig)}
                            onDelete={() => handleDelete(config.id)}
                            onDuplicate={() => handleDuplicate(config.id)}
                            onToggleEnabled={() => handleToggleEnabled(config.id)}
                            onTest={() => handleTest(config as AnyApiConfig)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

export default ApiConfigListView;
