/**
 * BOM Tree Component
 * 
 * BOM树形结构组件，显示BOM层级关系
 * 支持展开/折叠交互，默认隐藏替代件
 */

import React, { useState } from 'react';
import type { BOMNode } from '../../types/ontology';
import { ChevronRight, ChevronDown, Package } from 'lucide-react';

interface Props {
    nodes: BOMNode[];
    onNodeToggle?: (node: BOMNode) => void;
}

export const BOMTree: React.FC<Props> = ({ nodes, onNodeToggle }) => {
    const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set());

    const handleToggle = (node: BOMNode) => {
        const newExpanded = new Set(expandedNodes);
        if (newExpanded.has(node.code)) {
            newExpanded.delete(node.code);
        } else {
            newExpanded.add(node.code);
        }
        setExpandedNodes(newExpanded);

        if (onNodeToggle) {
            onNodeToggle(node);
        }
    };

    // 根据层级获取行背景色（FR-026）
    const getRowBackgroundColor = (level: number): string => {
        // level 0: 产品 -> bg-white
        // level 1: 一级组件 -> bg-white
        // level 2: 二级组件 -> bg-slate-50
        // level 3: 三级组件 -> bg-blue-50
        // level 4+: 物料 -> bg-purple-50
        if (level === 0 || level === 1) {
            return 'bg-white';
        } else if (level === 2) {
            return 'bg-slate-50';
        } else if (level === 3) {
            return 'bg-blue-50';
        } else {
            return 'bg-purple-50';
        }
    };

    const renderNode = (node: BOMNode, level: number = 0): React.ReactNode => {
        const isExpanded = expandedNodes.has(node.code);
        const hasChildren = node.children.length > 0;
        const hasAlternatives = node.alternatives && node.alternatives.length > 0;
        // 使用node.level而不是传入的level参数，确保与buildBOMTree设置的level一致
        const nodeLevel = node.level !== undefined ? node.level : level;
        const bgColor = getRowBackgroundColor(nodeLevel);

        return (
            <div key={node.code} className={`border-b border-slate-100 ${bgColor}`}>
                <div
                    className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors ${nodeLevel === 0 || nodeLevel === 1
                            ? 'hover:bg-slate-50'
                            : nodeLevel === 2
                                ? 'hover:bg-slate-100'
                                : nodeLevel === 3
                                    ? 'hover:bg-blue-100'
                                    : 'hover:bg-purple-100'
                        }`}
                    style={{ paddingLeft: `${nodeLevel * 1.5 + 0.75}rem` }}
                    onClick={() => hasChildren && handleToggle(node)}
                >
                    {/* 展开/折叠图标 */}
                    {hasChildren ? (
                        isExpanded ? (
                            <ChevronDown className="text-slate-400" size={16} />
                        ) : (
                            <ChevronRight className="text-slate-400" size={16} />
                        )
                    ) : (
                        <div className="w-4" />
                    )}

                    {/* 节点图标 */}
                    <Package className="text-slate-500" size={16} />

                    {/* 节点名称 */}
                    <div className="flex-1 min-w-0">
                        <div
                            className="text-sm font-medium text-slate-700 truncate"
                            style={{
                                display: '-webkit-box',
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: 'vertical',
                                overflow: 'hidden',
                            }}
                            title={`${node.code}-${node.name}`}
                        >
                            {node.name || node.code}
                        </div>
                        {node.quantity && (
                            <div className="text-xs text-slate-500">
                                {node.quantity} {node.unit || ''}
                            </div>
                        )}
                    </div>

                    {/* 替代组标识 */}
                    {hasAlternatives && (
                        <span className="text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded">
                            替代组
                        </span>
                    )}
                </div>

                {/* 子节点 */}
                {hasChildren && isExpanded && (
                    <div>
                        {node.children.map((child) => {
                            // 子节点的level已经在buildBOMTree中设置，但为了padding计算，传入level+1
                            // renderNode内部会使用child.level来确定背景色
                            return renderNode(child, nodeLevel + 1);
                        })}
                    </div>
                )}

                {/* 替代件列表 */}
                {hasAlternatives && isExpanded && (
                    <div className={getRowBackgroundColor(nodeLevel + 1)}>
                        {node.alternatives!.map((alt) => {
                            // 替代件使用物料层级（level 4+），即purple-50
                            const altLevel = alt.level !== undefined ? alt.level : nodeLevel + 1;
                            return (
                                <div
                                    key={alt.code}
                                    className={`flex items-center gap-2 px-3 py-2 border-b border-slate-100 ${getRowBackgroundColor(altLevel)}`}
                                    style={{ paddingLeft: `${(nodeLevel + 1) * 1.5 + 0.75}rem` }}
                                >
                                    <div className="w-4" />
                                    <Package className="text-purple-500" size={16} />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm text-purple-700 truncate">
                                            {alt.name || alt.code} (替代)
                                        </div>
                                        {alt.quantity && (
                                            <div className="text-xs text-purple-500">
                                                {alt.quantity} {alt.unit || ''}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="w-full">
            {nodes.map((node) => renderNode(node, 0))}
        </div>
    );
};
