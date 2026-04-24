/**
 * MPS Gantt View Component
 * 
 * MPS甘特图主视图组件，集成所有子组件
 */

import React, { useState, useEffect, useMemo } from 'react';
import { ProductSelectionPanel } from './ProductSelectionPanel';
import { PlanInfoPanel } from './PlanInfoPanel';
import { GanttGrid } from './GanttGrid';
import { BOMTree } from './BOMTree';
import { fetchBOMData, buildBOMTree } from '../../services/mpsDataService';
import { calculateTaskPosition, calculateTimeRange, calculatePixelsPerDay } from '../../utils/ganttUtils';
import type { BOMNode, GanttTask } from '../../types/ontology';

export const MPSGanttView: React.FC = () => {
    const [selectedProductCode, setSelectedProductCode] = useState<string | null>(null);
    const [selectedProductName, setSelectedProductName] = useState<string>('');
    const [bomTree, setBomTree] = useState<BOMNode[]>([]);
    const [tasks, setTasks] = useState<GanttTask[]>([]);
    const [loading, setLoading] = useState(false);
    const [dataSource, setDataSource] = useState<'api' | 'fallback'>('api');

    // 计算时间范围
    const timeRange = useMemo(() => {
        if (tasks.length === 0) {
            // 默认显示未来3个月
            const start = new Date();
            const end = new Date();
            end.setMonth(end.getMonth() + 3);
            return { start, end };
        }
        return calculateTimeRange(tasks);
    }, [tasks]);

    // 计算像素宽度
    const pixelsPerDay = useMemo(() => {
        const containerWidth = 1200; // 默认容器宽度，实际应该从DOM获取
        return calculatePixelsPerDay(timeRange.start, timeRange.end, containerWidth);
    }, [timeRange]);

    // 加载BOM数据和构建任务
    useEffect(() => {
        if (!selectedProductCode) {
            setBomTree([]);
            setTasks([]);
            return;
        }

        const loadBOMAndBuildTasks = async () => {
            setLoading(true);

            try {
                // 获取BOM数据
                const bomData = await fetchBOMData(selectedProductCode);
                setDataSource('api');

                // 构建BOM树
                const tree = buildBOMTree(bomData, selectedProductCode, true);
                setBomTree(tree);

                // 构建任务列表
                const newTasks: GanttTask[] = [];

                function buildTasksFromNode(node: BOMNode, parentStartDate?: Date): void {
                    // 使用node.level确保与BOMTree中的层级一致
                    const nodeLevel = node.level !== undefined ? node.level : 0;

                    // 计算任务时间（简化版本，实际应该根据生产计划计算）
                    const startDate = parentStartDate || new Date();
                    const duration = nodeLevel === 0 ? 30 : nodeLevel === 1 ? 15 : nodeLevel === 2 ? 10 : 5; // 简化：根据层级设置持续时间
                    const endDate = new Date(startDate);
                    endDate.setDate(endDate.getDate() + duration);

                    // 计算任务位置
                    const position = calculateTaskPosition(
                        startDate,
                        endDate,
                        timeRange.start,
                        pixelsPerDay
                    );

                    const task: GanttTask = {
                        id: node.code,
                        name: node.name,
                        type: node.type,
                        level: nodeLevel, // 使用node.level确保一致性
                        startDate,
                        endDate,
                        duration,
                        status: 'normal', // 简化：默认正常状态
                        children: [],
                        // UI Properties (now defined in ontology.ts)
                        bomNode: node,
                        left: position.left,
                        width: position.width,
                    };

                    newTasks.push(task);

                    // 递归处理子节点
                    for (const child of node.children) {
                        buildTasksFromNode(child, startDate);
                    }
                }

                for (const rootNode of tree) {
                    buildTasksFromNode(rootNode);
                }

                setTasks(newTasks);
            } catch (error) {
                console.error('[MPSGanttView] 加载BOM数据失败:', error);
            } finally {
                setLoading(false);
            }
        };

        loadBOMAndBuildTasks();
    }, [selectedProductCode, timeRange.start, pixelsPerDay]);

    return (
        <div className="p-6 bg-slate-50 min-h-screen">
            <div className="max-w-7xl mx-auto">
                <h1 className="text-2xl font-bold text-slate-800 mb-6">MPS生产计划甘特图</h1>

                {/* 产品选择面板 */}
                <ProductSelectionPanel
                    selectedProductCode={selectedProductCode}
                    onProductSelect={(code) => {
                        setSelectedProductCode(code);
                        // 查找产品名称
                        // TODO: 从产品列表中获取产品名称
                        setSelectedProductName(code);
                    }}
                />

                {/* 计划信息面板 */}
                {selectedProductCode && (
                    <PlanInfoPanel
                        productCode={selectedProductCode}
                        productName={selectedProductName}
                    />
                )}

                {/* 甘特图 */}
                {selectedProductCode && !loading && bomTree.length > 0 && (
                    <GanttGrid
                        startDate={timeRange.start}
                        endDate={timeRange.end}
                        pixelsPerDay={pixelsPerDay}
                        tasks={tasks}
                        bomTree={<BOMTree nodes={bomTree} />}
                    />
                )}

                {loading && (
                    <div className="text-center py-8 text-slate-500">
                        加载中...
                    </div>
                )}

                {selectedProductCode && !loading && bomTree.length === 0 && (
                    <div className="text-center py-8 text-slate-500">
                        暂无BOM数据
                    </div>
                )}
            </div>
        </div>
    );
};
