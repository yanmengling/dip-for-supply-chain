import { useState, useEffect, useCallback } from 'react';
import { Sparkles, Loader2, Download, RefreshCw } from 'lucide-react';

import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { saveAs } from 'file-saver';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { apiConfigService } from '../../../services/apiConfigService';
import { ApiConfigType, type WorkflowConfig } from '../../../types/apiConfig';

/**
 * Get DAG ID from configuration service with fallback
 */
function getInventoryWorkflowDagId(): string {
    try {
        // Get all enabled workflows
        const workflows = apiConfigService.getEnabledConfigsByType<WorkflowConfig>(ApiConfigType.WORKFLOW);

        // Find workflow with 'inventory' tag
        const inventoryWorkflow = workflows.find(wf =>
            wf.tags?.includes('inventory')
        );

        if (inventoryWorkflow) {
            console.log('[InventoryAIAnalysisPanel] Using configured inventory workflow:', inventoryWorkflow.dagId, `(${inventoryWorkflow.name})`);
            return inventoryWorkflow.dagId;
        }
    } catch (error) {
        console.warn('[InventoryAIAnalysisPanel] Failed to get DAG ID from config:', error);
    }

    // Fallback to hardcoded value
    console.log('[InventoryAIAnalysisPanel] Using hardcoded DAG ID: 602192728104683735');
    return '602192728104683735';
}

// Inventory AI Analysis Panel - 库存优化专用AI分析面板

const InventoryAIAnalysisPanel = () => {

    // ============ AI 分析报告状态 ============
    const [brainModeAnalysis, setBrainModeAnalysis] = useState<string[]>([]);
    const [brainModeMarkdown, setBrainModeMarkdown] = useState<string>(''); // Raw markdown for rendering
    const [brainModeLoading, setBrainModeLoading] = useState(false);
    const [isTriggering, setIsTriggering] = useState(false);
    const [fetchTrigger, setFetchTrigger] = useState(0); // Used to trigger refetch

    // 库存优化专用的 DAG ID
    const DAG_ID = getInventoryWorkflowDagId();

    useEffect(() => {
        // 创建 AbortController 用于取消请求
        const abortController = new AbortController();
        let isActive = true;

        const fetchAnalysis = async () => {
            try {
                setBrainModeLoading(true);

                // 1. Get Authentication Headers
                const headers = await import('../../../config/apiConfig').then(m => m.getAuthHeaders());

                // 2. Fetch latest successful execution
                const listUrl = `/proxy-agent-service/automation/v2/dag/${DAG_ID}/results?sortBy=started_at&order=desc&limit=20`;
                console.log('[InventoryAIAnalysisPanel] Fetching DAG results from:', listUrl);

                const listResponse = await fetch(listUrl, {
                    headers,
                    signal: abortController.signal  // 添加取消信号
                });

                // 检查组件是否仍然挂载
                if (!isActive) return;

                if (!listResponse.ok) {
                    // Try to get error details from response body
                    let errorDetail = '';
                    try {
                        const errorBody = await listResponse.text();
                        errorDetail = errorBody;
                        console.error('[InventoryAIAnalysisPanel] Error response body:', errorBody);
                    } catch (e) {
                        console.error('[InventoryAIAnalysisPanel] Could not read error response body');
                    }

                    console.error('[InventoryAIAnalysisPanel] List response not OK:', {
                        status: listResponse.status,
                        statusText: listResponse.statusText,
                        url: listUrl,
                        headers: Object.fromEntries(listResponse.headers.entries()),
                        errorDetail: errorDetail.substring(0, 500)
                    });
                    throw new Error(`Failed to fetch DAG results: ${listResponse.status} - ${errorDetail.substring(0, 100)}`);
                }
                const listData = await listResponse.json();

                if (!isActive) return;  // 再次检查

                console.log('[InventoryAIAnalysisPanel] DAG results list:', listData);

                // Find first successful run
                let successfulRun = null;
                const runs = Array.isArray(listData) ? listData : (listData.data || listData.results || []);
                console.log('[InventoryAIAnalysisPanel] Parsed runs array:', runs.length, 'items');

                for (const run of runs) {
                    // Check for success status (could be 'success', 'completed', etc.)
                    const status = run.status || run.state || '';
                    if (status.toLowerCase() === 'success' || status.toLowerCase() === 'completed') {
                        successfulRun = run;
                        break;
                    }
                }

                if (!successfulRun && runs.length > 0) {
                    // Fallback: use first run if no explicit success status found
                    console.log('[InventoryAIAnalysisPanel] No explicit success status found, using first run');
                    successfulRun = runs[0];
                }

                if (successfulRun) {
                    const resultId = successfulRun.id || successfulRun.result_id;
                    console.log('[InventoryAIAnalysisPanel] Using result ID:', resultId);

                    // 3. Fetch execution details
                    const detailUrl = `/proxy-agent-service/automation/v2/dag/${DAG_ID}/result/${resultId}`;
                    console.log('[InventoryAIAnalysisPanel] Fetching execution details from:', detailUrl);

                    const detailResponse = await fetch(detailUrl, {
                        headers,
                        signal: abortController.signal  // 添加取消信号
                    });

                    if (!isActive) return;  // 检查组件状态

                    if (!detailResponse.ok) {
                        console.error('[InventoryAIAnalysisPanel] Detail response not OK:', detailResponse.status);
                        throw new Error(`Failed to fetch DAG detail: ${detailResponse.status}`);
                    }
                    const detailData = await detailResponse.json();

                    if (!isActive) return;  // 再次检查

                    console.log('[InventoryAIAnalysisPanel] Execution detail:', detailData);

                    // 4. Get last node output
                    // Try multiple possible structures
                    let nodes = [];
                    if (Array.isArray(detailData)) {
                        nodes = detailData;
                    } else if (detailData.data && Array.isArray(detailData.data)) {
                        nodes = detailData.data;
                    } else if (detailData.nodes && Array.isArray(detailData.nodes)) {
                        nodes = detailData.nodes;
                    } else if (detailData.tasks && Array.isArray(detailData.tasks)) {
                        nodes = detailData.tasks;
                    } else if (detailData.results && Array.isArray(detailData.results)) {
                        nodes = detailData.results;
                    }

                    console.log('[InventoryAIAnalysisPanel] Parsed nodes:', nodes.length, 'nodes');

                    if (nodes.length > 0) {
                        const lastNode = nodes[nodes.length - 1];
                        console.log('[InventoryAIAnalysisPanel] Last node:', lastNode);

                        const output = lastNode.outputs || lastNode.output || lastNode.result || {};
                        console.log('[InventoryAIAnalysisPanel] Last node output:', output);

                        // Try to find a text message in output
                        let analysisText = '';
                        if (typeof output === 'string') {
                            analysisText = output;
                        } else if (output.text) {
                            analysisText = output.text;
                        } else if (output.result) {
                            analysisText = typeof output.result === 'string' ? output.result : JSON.stringify(output.result);
                        } else if (output.answer) {
                            analysisText = output.answer;
                        } else if (output.content) {
                            analysisText = output.content;
                        } else if (output.message) {
                            analysisText = output.message;
                        } else {
                            analysisText = JSON.stringify(output, null, 2);
                        }

                        console.log('[InventoryAIAnalysisPanel] Extracted analysis text:', analysisText.substring(0, 200) + '...');

                        // Store raw markdown for rendering
                        setBrainModeMarkdown(analysisText);
                        // Split by newline for Word export
                        setBrainModeAnalysis(analysisText.split('\n').filter(line => line.trim().length > 0));
                    } else {
                        console.warn('[InventoryAIAnalysisPanel] No nodes found in execution detail');
                        setBrainModeMarkdown('未找到工作流节点数据');
                        setBrainModeAnalysis(['未找到工作流节点数据']);
                    }
                } else {
                    console.warn('[InventoryAIAnalysisPanel] No successful runs found');
                    setBrainModeMarkdown('暂无成功的工作流运行记录');
                    setBrainModeAnalysis(['暂无成功的工作流运行记录']);
                }
            } catch (err) {
                // 忽略 AbortError (请求被取消)
                if (err instanceof Error && err.name === 'AbortError') {
                    console.log('[InventoryAIAnalysisPanel] Request aborted');
                    return;
                }

                if (!isActive) return;

                console.error('[InventoryAIAnalysisPanel] Failed to fetch AI analysis:', err);
                const errorMsg = `AI 分析服务暂时不可用: ${err instanceof Error ? err.message : '未知错误'}`;
                setBrainModeMarkdown(errorMsg);
                setBrainModeAnalysis([errorMsg]);
            } finally {
                if (isActive) {
                    setBrainModeLoading(false);
                }
            }
        };

        fetchAnalysis();

        // 清理函数: 取消未完成的请求
        return () => {
            isActive = false;
            abortController.abort();
            console.log('[InventoryAIAnalysisPanel] Cleanup: aborted pending requests');
        };
    }, [fetchTrigger, DAG_ID]);

    // Trigger workflow and refresh
    const regenerateAnalysis = useCallback(async () => {
        try {
            setIsTriggering(true);
            setBrainModeMarkdown('');
            setBrainModeAnalysis([]);
            const headers = await import('../../../config/apiConfig').then(m => m.getAuthHeaders());

            // 1. Trigger workflow
            console.log('[InventoryAIAnalysisPanel] Triggering workflow...');
            const triggerResponse = await fetch(
                `/proxy-agent-service/automation/v1/run-instance/${DAG_ID}`,
                {
                    method: 'POST',
                    headers: {
                        ...headers,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({})
                }
            );

            if (!triggerResponse.ok) {
                throw new Error(`触发失败: ${triggerResponse.status}`);
            }

            console.log('[InventoryAIAnalysisPanel] Workflow triggered, waiting for completion...');
            setBrainModeMarkdown('⏳ 正在生成库存优化 AI 分析报告,请稍候...');

            // 2. Poll for completion (check every 3 seconds, max 60 seconds)
            const maxAttempts = 20;
            let attempts = 0;
            let completed = false;

            while (attempts < maxAttempts && !completed) {
                await new Promise(resolve => setTimeout(resolve, 3000));
                attempts++;

                console.log(`[InventoryAIAnalysisPanel] Checking status (attempt ${attempts}/${maxAttempts})...`);

                const statusResponse = await fetch(
                    `/proxy-agent-service/automation/v2/dag/${DAG_ID}/results?sortBy=started_at&order=desc&limit=1`,
                    { headers }
                );

                if (statusResponse.ok) {
                    const statusData = await statusResponse.json();
                    const runs = Array.isArray(statusData) ? statusData : (statusData.data || statusData.results || []);

                    if (runs.length > 0) {
                        const latestRun = runs[0];
                        const status = latestRun.status || latestRun.state || '';
                        console.log(`[InventoryAIAnalysisPanel] Latest run status: ${status}`);

                        if (status.toLowerCase() === 'success' || status.toLowerCase() === 'completed') {
                            completed = true;
                        } else if (status.toLowerCase() === 'failed' || status.toLowerCase() === 'error') {
                            throw new Error('工作流执行失败');
                        }
                    }
                }
            }

            if (!completed) {
                console.log('[InventoryAIAnalysisPanel] Timeout waiting for completion, fetching latest results anyway');
            }

            // 3. Fetch latest results
            setFetchTrigger(prev => prev + 1);

        } catch (err) {
            console.error('[InventoryAIAnalysisPanel] Failed to regenerate analysis:', err);
            setBrainModeMarkdown(`❌ 生成失败: ${err instanceof Error ? err.message : '未知错误'}`);
            setBrainModeAnalysis([`生成失败: ${err instanceof Error ? err.message : '未知错误'}`]);
        } finally {
            setIsTriggering(false);
        }
    }, [DAG_ID]);


    const isLoading = brainModeLoading;


    // Export to Word function
    const exportToWord = useCallback(async () => {
        try {
            const children: Paragraph[] = [];

            // Title
            children.push(
                new Paragraph({
                    text: '库存优化 AI 分析报告',
                    heading: HeadingLevel.HEADING_1,
                    spacing: { after: 300 },
                })
            );

            // Date
            children.push(
                new Paragraph({
                    children: [
                        new TextRun({ text: `生成时间: ${new Date().toLocaleString('zh-CN')}`, italics: true, color: '666666' }),
                    ],
                    spacing: { after: 400 },
                })
            );

            // AI Analysis Report
            if (brainModeAnalysis.length > 0) {
                children.push(
                    new Paragraph({
                        text: 'AI 智能分析报告',
                        heading: HeadingLevel.HEADING_2,
                        spacing: { before: 200, after: 200 },
                    })
                );

                brainModeAnalysis.forEach(line => {
                    // Check if it's a heading (starts with # or **)
                    const isHeading = line.startsWith('#') || (line.startsWith('**') && line.endsWith('**'));
                    const cleanLine = line.replace(/^#+\s*/, '').replace(/\*\*/g, '');

                    children.push(
                        new Paragraph({
                            children: [
                                new TextRun({
                                    text: cleanLine,
                                    bold: isHeading,
                                    size: isHeading ? 28 : 24,
                                }),
                            ],
                            spacing: { after: 120 },
                        })
                    );
                });
            }

            const doc = new Document({
                sections: [{
                    properties: {},
                    children: children,
                }],
            });

            const blob = await Packer.toBlob(doc);
            const filename = `库存优化AI分析报告_${new Date().toISOString().slice(0, 10)}.docx`;
            saveAs(blob, filename);
        } catch (err) {
            console.error('Failed to export Word document:', err);
            alert('导出失败,请稍后再试');
        }
    }, [brainModeAnalysis]);

    const hasContent = brainModeMarkdown && brainModeMarkdown.length > 0;

    return (
        <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 text-lg">
                    <Sparkles className="text-indigo-500" /> 库存优化 AI 分析
                </h3>
                <div className="flex items-center gap-2">
                    <button
                        onClick={regenerateAnalysis}
                        disabled={isTriggering}
                        className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        title="重新生成库存优化 AI 分析报告"
                    >
                        {isTriggering ? (
                            <Loader2 size={14} className="animate-spin" />
                        ) : (
                            <RefreshCw size={14} />
                        )}
                        {isTriggering ? '生成中...' : '重新生成'}
                    </button>

                    {hasContent && (
                        <button
                            onClick={exportToWord}
                            className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors"
                            title="导出为 Word 文档"
                        >
                            <Download size={14} />
                            导出报告
                        </button>
                    )}
                    {isLoading && <Loader2 className="animate-spin text-slate-400" size={16} />}
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {brainModeMarkdown ? (
                    <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                        <h3 className="text-sm font-semibold text-indigo-700 mb-3">AI 智能分析报告</h3>
                        <div className="prose prose-sm prose-indigo max-w-none text-indigo-700 [&>h1]:text-lg [&>h1]:font-bold [&>h1]:mt-4 [&>h1]:mb-2 [&>h2]:text-base [&>h2]:font-semibold [&>h2]:mt-3 [&>h2]:mb-2 [&>h3]:text-sm [&>h3]:font-semibold [&>h3]:mt-2 [&>h3]:mb-1 [&>p]:my-1.5 [&>ul]:my-2 [&>ul]:pl-5 [&>ol]:my-2 [&>ol]:pl-5 [&>li]:my-0.5 [&>table]:my-2 [&>table]:text-xs [&>blockquote]:border-l-4 [&>blockquote]:border-indigo-300 [&>blockquote]:pl-3 [&>blockquote]:italic">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {brainModeMarkdown}
                            </ReactMarkdown>
                        </div>
                    </div>
                ) : null}

                {!brainModeMarkdown ? (
                    <div className="text-center text-sm text-slate-500 py-4 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                        {isLoading ? (
                            <span className="flex items-center justify-center gap-2">
                                <Loader2 className="animate-spin" size={14} />
                                正在生成库存优化智能分析报告...
                            </span>
                        ) : (
                            <span>暂无AI分析报告,请点击"重新生成"按钮生成报告</span>
                        )}
                    </div>
                ) : null}
            </div>
        </div>
    );
};

export default InventoryAIAnalysisPanel;
