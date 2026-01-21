/**
 * BOM库存树组件
 * 
 * 展示产品BOM结构和库存数据，支持展开/折叠，显示替代料关系
 * 设计参考: GanttBOMTree.tsx
 */

import { useState, useEffect, useMemo } from 'react';
import {
    ChevronRight,
    ChevronDown,
    Package,
    Layers,
    AlertTriangle,
    CheckCircle,
    XCircle,
    RefreshCw,
    ArrowLeftRight,
    Loader2,
    BarChart3,
    Calculator
} from 'lucide-react';
import type { BOMNode, ProductBOMTree, ProductionAnalysisResult } from '../../../services/bomInventoryService';
import { loadAllBOMTrees, TARGET_PRODUCTS, calculateProductionAnalysis } from '../../../services/bomInventoryService';
import { ProductionAnalysisPanel } from './ProductionAnalysisPanel';
import { GlobalOptimizationPanel } from './GlobalOptimizationPanel';
import { Globe } from 'lucide-react';

// ============================================================================
// 类型定义
// ============================================================================

interface BOMInventoryTreeProps {
    onClose: () => void;
}

interface TreeNodeProps {
    node: BOMNode;
    level: number;
    expandedNodes: Set<string>;
    onToggleExpand: (nodeCode: string) => void;
}

// ============================================================================
// 辅助函数
// ============================================================================

/**
 * 获取库存状态显示配置
 */
function getStockStatusConfig(status: BOMNode['stockStatus']) {
    switch (status) {
        case 'sufficient':
            return {
                icon: CheckCircle,
                color: 'text-green-600',
                bgColor: 'bg-green-50',
                label: '充足'
            };
        case 'insufficient':
            return {
                icon: AlertTriangle,
                color: 'text-amber-600',
                bgColor: 'bg-amber-50',
                label: '不足'
            };
        case 'stagnant':
            return {
                icon: XCircle,
                color: 'text-red-600',
                bgColor: 'bg-red-50',
                label: '呆滞'
            };
        default:
            return {
                icon: Package,
                color: 'text-slate-400',
                bgColor: 'bg-slate-50',
                label: '-'
            };
    }
}

/**
 * 格式化数字
 */
function formatNumber(num: number): string {
    if (num >= 10000) {
        return (num / 10000).toFixed(1) + '万';
    }
    return num.toLocaleString('zh-CN');
}

/**
 * 格式化金额
 */
function formatCurrency(amount: number): string {
    if (amount >= 10000) {
        return '¥' + (amount / 10000).toFixed(1) + '万';
    }
    return '¥' + amount.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

/**
 * 获取层级背景色
 */
function getLevelBackgroundColor(level: number): string {
    if (level === 0) return 'bg-indigo-50';
    if (level === 1) return 'bg-white';
    if (level === 2) return 'bg-slate-50';
    if (level === 3) return 'bg-blue-50';
    return 'bg-purple-50';
}

// ============================================================================
// TreeNode 组件
// ============================================================================

const TreeNode: React.FC<TreeNodeProps> = ({
    node,
    level,
    expandedNodes,
    onToggleExpand,
}) => {
    const isExpanded = expandedNodes.has(node.code);
    const hasChildren = node.children.length > 0 || node.substitutes.length > 0;
    const statusConfig = getStockStatusConfig(node.stockStatus);
    const StatusIcon = statusConfig.icon;
    const bgColor = getLevelBackgroundColor(level);

    return (
        <>
            {/* 当前节点行 */}
            <div className={`grid grid-cols-[1fr_60px_80px_90px_60px_70px_50px] border-b border-slate-100 ${bgColor} hover:bg-slate-100/50 transition-colors`}>
                {/* 物料名称列 */}
                <div
                    className="flex items-center gap-2 py-2 pr-2 min-h-[44px]"
                    style={{ paddingLeft: `${12 + level * 20}px` }}
                >
                    {/* 展开/折叠按钮 */}
                    <button
                        onClick={() => hasChildren && onToggleExpand(node.code)}
                        className={`flex-shrink-0 w-5 h-5 flex items-center justify-center rounded ${hasChildren ? 'hover:bg-slate-200 cursor-pointer' : ''
                            }`}
                    >
                        {hasChildren ? (
                            isExpanded ? (
                                <ChevronDown size={14} className="text-slate-500" />
                            ) : (
                                <ChevronRight size={14} className="text-slate-500" />
                            )
                        ) : (
                            <div className="w-3" />
                        )}
                    </button>

                    {/* 图标 */}
                    {node.isSubstitute ? (
                        <ArrowLeftRight size={14} className="text-purple-500 flex-shrink-0" />
                    ) : level === 0 ? (
                        <Package size={14} className="text-indigo-600 flex-shrink-0" />
                    ) : (
                        <Layers size={14} className="text-slate-400 flex-shrink-0" />
                    )}

                    {/* 名称 */}
                    <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                            {node.isSubstitute && (
                                <span className="px-1.5 py-0.5 text-[10px] font-medium bg-purple-100 text-purple-700 rounded">
                                    替代
                                </span>
                            )}
                            <span
                                className={`text-sm font-medium truncate ${node.isSubstitute ? 'text-purple-700' : 'text-slate-800'
                                    }`}
                                title={node.name}
                            >
                                {node.name}
                            </span>
                        </div>
                        <span className="text-xs text-slate-400 truncate" title={node.code}>
                            {node.code}
                        </span>
                    </div>

                    {/* 替代料指示器 */}
                    {node.substitutes.length > 0 && (
                        <span className="ml-auto px-1.5 py-0.5 text-[10px] font-medium bg-purple-100 text-purple-600 rounded flex-shrink-0">
                            ⮂ {node.substitutes.length}
                        </span>
                    )}
                </div>

                {/* 单耗列 */}
                <div className="flex items-center justify-center text-sm text-slate-600">
                    {node.quantity.toFixed(node.quantity % 1 === 0 ? 0 : 2)}
                </div>

                {/* 库存数量列 */}
                <div className="flex items-center justify-center text-sm font-medium text-slate-700">
                    {formatNumber(node.currentStock)}
                </div>

                {/* 库存金额列 */}
                <div className="flex items-center justify-center text-sm text-indigo-600">
                    {node.unitPrice > 0 ? formatCurrency(node.currentStock * node.unitPrice) : '-'}
                </div>

                {/* 库龄列 */}
                <div className="flex items-center justify-center text-sm text-slate-600">
                    {node.storageDays > 0 ? `${node.storageDays}d` : '-'}
                </div>

                {/* 状态列 */}
                <div className="flex items-center justify-center">
                    <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${statusConfig.bgColor} ${statusConfig.color}`}>
                        <StatusIcon size={12} />
                        {statusConfig.label}
                    </span>
                </div>

                {/* 替代列 */}
                <div className="flex items-center justify-center">
                    {node.substitutes.length > 0 && (
                        <span className="text-purple-500" title="有替代料">
                            <ArrowLeftRight size={14} />
                        </span>
                    )}
                </div>
            </div>

            {/* 子节点 */}
            {isExpanded && node.children.map((child) => (
                <TreeNode
                    key={child.code}
                    node={child}
                    level={level + 1}
                    expandedNodes={expandedNodes}
                    onToggleExpand={onToggleExpand}
                />
            ))}

            {/* 替代料节点 */}
            {isExpanded && node.substitutes.map((sub) => (
                <TreeNode
                    key={`sub-${sub.code}`}
                    node={sub}
                    level={level + 1}
                    expandedNodes={expandedNodes}
                    onToggleExpand={onToggleExpand}
                />
            ))}
        </>
    );
};

// ============================================================================
// 主组件
// ============================================================================

export const BOMInventoryTree: React.FC<BOMInventoryTreeProps> = ({ onClose }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [bomTrees, setBomTrees] = useState<ProductBOMTree[]>([]);
    const [selectedProduct, setSelectedProduct] = useState<string>(TARGET_PRODUCTS[0]);
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

    // 阶段二：Tab切换和生产分析状态
    const [activeTab, setActiveTab] = useState<'bom' | 'analysis' | 'global'>('bom');
    const [analysisResult, setAnalysisResult] = useState<ProductionAnalysisResult | null>(null);

    // 加载数据
    useEffect(() => {
        const loadData = async () => {
            try {
                setLoading(true);
                setError(null);
                const trees = await loadAllBOMTrees();
                setBomTrees(trees);

                // 默认展开根节点
                if (trees.length > 0) {
                    setExpandedNodes(new Set([trees[0].rootNode.code]));
                }
            } catch (err) {
                console.error('[BOMInventoryTree] 加载失败:', err);
                setError('加载数据失败，请稍后重试');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, []);

    // 当前选中的产品BOM树
    const currentTree = useMemo(() => {
        return bomTrees.find(t => t.productCode === selectedProduct);
    }, [bomTrees, selectedProduct]);

    // 切换产品时展开根节点，并退出全局模式
    const handleSelectProduct = (productCode: string) => {
        setSelectedProduct(productCode);
        const tree = bomTrees.find(t => t.productCode === productCode);
        if (tree) {
            setExpandedNodes(new Set([tree.rootNode.code]));
        }

        // 如果当前在全局模式，切换回BOM分析模式
        if (activeTab === 'global') {
            setActiveTab('bom');
        }
    };

    // 展开/折叠节点
    const handleToggleExpand = (nodeCode: string) => {
        setExpandedNodes(prev => {
            const newSet = new Set(prev);
            if (newSet.has(nodeCode)) {
                newSet.delete(nodeCode);
            } else {
                newSet.add(nodeCode);
            }
            return newSet;
        });
    };

    // 展开全部
    const handleExpandAll = () => {
        if (!currentTree) return;

        const allCodes = new Set<string>();
        const collectCodes = (node: BOMNode) => {
            allCodes.add(node.code);
            node.children.forEach(collectCodes);
        };
        collectCodes(currentTree.rootNode);
        setExpandedNodes(allCodes);
    };

    // 折叠全部
    const handleCollapseAll = () => {
        if (!currentTree) return;
        setExpandedNodes(new Set([currentTree.rootNode.code]));
    };

    // 切换Tab
    const handleTabChange = (tab: 'bom' | 'analysis' | 'global') => {
        setActiveTab(tab);

        // 切换到分析Tab时，自动计算分析结果
        if (tab === 'analysis' && currentTree) {
            const result = calculateProductionAnalysis(currentTree);
            setAnalysisResult(result);
        }
    };

    // 当产品切换时，如果在分析Tab，重新计算
    useEffect(() => {
        if (activeTab === 'analysis' && currentTree) {
            const result = calculateProductionAnalysis(currentTree);
            setAnalysisResult(result);
        }
    }, [selectedProduct, currentTree, activeTab]);

    return (
        <div className="flex flex-col h-full">
            {/* 标题栏 */}
            <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-white">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                        <Calculator className="text-blue-600" size={20} />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">逆向生产计算器</h2>
                        <p className="text-sm text-slate-500 font-medium">BOM库存分析</p>
                    </div>
                </div>
                <button
                    onClick={onClose}
                    className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                    <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>


            {/* 产品选择 Tab - 只在非全局模式显示 */}
            {activeTab !== 'global' && (
                <div className="flex-shrink-0 flex items-center gap-2 px-6 py-3 border-b border-slate-200 bg-white">
                    {TARGET_PRODUCTS.map(code => {
                        const tree = bomTrees.find(t => t.productCode === code);
                        const isSelected = selectedProduct === code;

                        return (
                            <button
                                key={code}
                                onClick={() => handleSelectProduct(code)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${isSelected
                                    ? 'bg-indigo-600 text-white shadow-md'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                    }`}
                            >
                                <div className="flex flex-col items-start">
                                    <span>{code}</span>
                                    {tree && (
                                        <span className={`text-xs ${isSelected ? 'text-indigo-200' : 'text-slate-400'}`}>
                                            {tree.totalMaterials} 物料
                                        </span>
                                    )}
                                </div>
                            </button>
                        );
                    })}

                    {/* 全局组合优化按钮 - 放在最右边 */}
                    <button
                        onClick={() => handleTabChange('global')}
                        className={`ml-auto px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200`}
                    >
                        <Globe size={16} />
                        全局组合优化
                    </button>
                </div>
            )}

            {/* 全局模式标题栏 */}
            {activeTab === 'global' && (
                <div className="flex-shrink-0 flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-amber-50">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                            <Globe className="text-white" size={20} />
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-slate-800">全局组合优化</h3>
                            <p className="text-sm text-amber-700">跨产品库存优化分析</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setActiveTab('bom')}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 bg-white border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                        </svg>
                        返回单品分析
                    </button>
                </div>
            )}

            {/* 功能切换 Tabs - 只在非全局模式下显示 */}
            {activeTab !== 'global' && (
                <div className="flex-shrink-0 flex items-center justify-between border-b border-slate-200 bg-white px-6">
                    <div className="flex">
                        <button
                            onClick={() => handleTabChange('bom')}
                            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'bom'
                                ? 'border-indigo-600 text-indigo-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            <Layers size={16} />
                            BOM库存分析
                        </button>
                        <button
                            onClick={() => handleTabChange('analysis')}
                            className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${activeTab === 'analysis'
                                ? 'border-indigo-600 text-indigo-600'
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                                }`}
                        >
                            <BarChart3 size={16} />
                            生产数量分析
                        </button>
                    </div>

                    {/* 展开/折叠按钮 - 只在BOM模式显示 */}
                    {activeTab === 'bom' && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleExpandAll}
                                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded hover:bg-slate-200 transition-colors"
                            >
                                展开全部
                            </button>
                            <button
                                onClick={handleCollapseAll}
                                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded hover:bg-slate-200 transition-colors"
                            >
                                折叠全部
                            </button>
                        </div>
                    )}
                </div>
            )}

            {activeTab === 'global' ? (
                <div className="flex-1 overflow-auto bg-slate-50">
                    <GlobalOptimizationPanel
                        bomTrees={bomTrees}
                        loading={loading}
                    />
                </div>
            ) : activeTab === 'analysis' ? (
                <div className="flex-1 overflow-auto bg-slate-50">
                    <ProductionAnalysisPanel
                        analysisResult={analysisResult}
                        loading={loading}
                    />
                </div>
            ) : (
                <>
                    {/* 库存概况 */}
                    {currentTree && (
                        <div className="flex items-center gap-6 px-6 py-3 border-b border-slate-200 bg-slate-50">
                            <div className="flex items-center gap-2">
                                <Package size={16} className="text-slate-400" />
                                <span className="text-sm text-slate-600">涉及物料</span>
                                <span className="text-sm font-semibold text-slate-800">{currentTree.totalMaterials} 种</span>
                            </div>
                            <div className="h-4 w-px bg-slate-300" />
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-slate-600">库存总额</span>
                                <span className="text-sm font-semibold text-indigo-600">{formatCurrency(currentTree.totalInventoryValue)}</span>
                            </div>
                            <div className="h-4 w-px bg-slate-300" />
                            <div className="flex items-center gap-2">
                                <AlertTriangle size={14} className="text-red-500" />
                                <span className="text-sm text-slate-600">呆滞物料</span>
                                <span className="text-sm font-semibold text-red-600">{currentTree.stagnantCount} 种</span>
                            </div>
                            <div className="h-4 w-px bg-slate-300" />
                            <div className="flex items-center gap-2">
                                <AlertTriangle size={14} className="text-amber-500" />
                                <span className="text-sm text-slate-600">库存不足</span>
                                <span className="text-sm font-semibold text-amber-600">{currentTree.insufficientCount} 种</span>
                            </div>
                        </div>
                    )}

                    {/* 表头 */}
                    <div className="grid grid-cols-[1fr_60px_80px_90px_60px_70px_50px] bg-slate-100 border-b border-slate-200 text-xs font-medium text-slate-600 sticky top-0 z-10">
                        <div className="px-4 py-2">物料/组件</div>
                        <div className="flex items-center justify-center py-2">单耗</div>
                        <div className="flex items-center justify-center py-2">库存数量</div>
                        <div className="flex items-center justify-center py-2">库存金额</div>
                        <div className="flex items-center justify-center py-2">库龄</div>
                        <div className="flex items-center justify-center py-2">状态</div>
                        <div className="flex items-center justify-center py-2">替代</div>
                    </div>

                    {/* 内容区域 */}
                    <div className="flex-1 overflow-auto">
                        {loading ? (
                            <div className="flex flex-col items-center justify-center h-64 gap-4">
                                <Loader2 size={32} className="text-indigo-500 animate-spin" />
                                <p className="text-slate-500">正在加载BOM数据...</p>
                            </div>
                        ) : error ? (
                            <div className="flex flex-col items-center justify-center h-64 gap-4">
                                <AlertTriangle size={32} className="text-red-500" />
                                <p className="text-slate-600">{error}</p>
                                <button
                                    onClick={() => window.location.reload()}
                                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100"
                                >
                                    <RefreshCw size={14} />
                                    重试
                                </button>
                            </div>
                        ) : currentTree ? (
                            <TreeNode
                                node={currentTree.rootNode}
                                level={0}
                                expandedNodes={expandedNodes}
                                onToggleExpand={handleToggleExpand}
                            />
                        ) : (
                            <div className="flex items-center justify-center h-64 text-slate-500">
                                暂无数据
                            </div>
                        )}
                    </div>

                    {/* 图例 */}
                    <div className="flex items-center gap-6 px-6 py-3 border-t border-slate-200 bg-slate-50 text-xs">
                        <span className="text-slate-500">图例:</span>
                        <div className="flex items-center gap-1">
                            <CheckCircle size={12} className="text-green-600" />
                            <span className="text-slate-600">充足</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <AlertTriangle size={12} className="text-amber-600" />
                            <span className="text-slate-600">不足</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <XCircle size={12} className="text-red-600" />
                            <span className="text-slate-600">呆滞</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <ArrowLeftRight size={12} className="text-purple-600" />
                            <span className="text-slate-600">替代料</span>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default BOMInventoryTree;
