import React, { useMemo, useState } from 'react';
import type { BOMDetailPanelModel, BOMTreeNode } from '../../services/productSupplyCalculator';
import { X, Filter, ChevronRight, ChevronDown, Layers, Box, RefreshCw } from 'lucide-react';

interface Props {
  open: boolean;
  onClose: () => void;
  model?: BOMDetailPanelModel;
}

const Badge: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => (
  <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs ${className}`}>{children}</span>
);

const MaterialTypeBadge: React.FC<{ type: string }> = ({ type }) => {
  const styles = {
    '自制': 'bg-slate-50 text-slate-700 border-slate-200',
    '外购': 'bg-blue-50 text-blue-700 border-blue-200',
    '委外': 'bg-purple-50 text-purple-700 border-purple-200',
    '未知': 'bg-amber-50 text-amber-700 border-amber-200',
  };
  return <Badge className={styles[type as keyof typeof styles] || styles['未知']}>{type}</Badge>;
};

interface BOMTreeItemProps {
  node: BOMTreeNode;
  depth: number;
  showAlternatives: boolean;
}

const BOMTreeItem: React.FC<BOMTreeItemProps> = ({ node, depth, showAlternatives }) => {
  const [expanded, setExpanded] = useState(depth < 2); // 默认展开前2层
  const [altExpanded, setAltExpanded] = useState(false);

  const hasChildren = node.children.length > 0;
  const hasAlternatives = node.alternatives.length > 0;
  const paddingLeft = depth * 24;

  return (
    <div className="border-b border-slate-100 last:border-b-0">
      {/* 主料行 */}
      <div
        className="flex items-center gap-2 py-2 px-3 hover:bg-slate-50/70 transition-colors"
        style={{ paddingLeft: `${paddingLeft + 12}px` }}
      >
        {/* 展开/折叠按钮 */}
        <button
          onClick={() => setExpanded(!expanded)}
          className={`w-5 h-5 flex items-center justify-center rounded hover:bg-slate-200/70 transition-colors ${
            hasChildren ? 'text-slate-500' : 'text-transparent cursor-default'
          }`}
          disabled={!hasChildren}
        >
          {hasChildren && (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
        </button>

        {/* 物料图标 */}
        <div className="w-6 h-6 flex items-center justify-center rounded bg-slate-100">
          <Box size={12} className="text-slate-500" />
        </div>

        {/* 物料信息 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-slate-800 truncate">{node.material_code}</span>
            <MaterialTypeBadge type={node.material_type} />
            {hasAlternatives && showAlternatives && (
              <button
                onClick={() => setAltExpanded(!altExpanded)}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
              >
                <RefreshCw size={10} />
                替代 ({node.alternatives.length})
                {altExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
              </button>
            )}
          </div>
          <div className="text-sm text-slate-500 truncate">{node.material_name || '-'}</div>
        </div>

        {/* 用量 */}
        <div className="text-right shrink-0">
          <div className="text-sm font-medium text-slate-700">{node.standard_usage}</div>
          <div className="text-xs text-slate-400">用量</div>
        </div>

        {/* 层级 */}
        <div className="text-right shrink-0 w-12">
          <div className="text-sm font-medium text-slate-600">L{node.bom_level}</div>
        </div>
      </div>

      {/* 替代料折叠区域 */}
      {hasAlternatives && showAlternatives && altExpanded && (
        <div className="bg-emerald-50/30 border-t border-emerald-100">
          {node.alternatives.map((alt, idx) => (
            <div
              key={alt.material_code}
              className="flex items-center gap-2 py-2 px-3 border-b border-emerald-100/50 last:border-b-0"
              style={{ paddingLeft: `${paddingLeft + 48}px` }}
            >
              {/* 替代料图标 */}
              <div className="w-5 h-5 flex items-center justify-center rounded bg-emerald-100">
                <RefreshCw size={10} className="text-emerald-600" />
              </div>

              {/* 物料信息 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-slate-700 truncate">{alt.material_code}</span>
                  <MaterialTypeBadge type={alt.material_type} />
                  <Badge className="bg-emerald-50 text-emerald-600 border-emerald-200">
                    优先级 {alt.alt_priority}
                  </Badge>
                </div>
                <div className="text-sm text-slate-500 truncate">{alt.material_name || '-'}</div>
              </div>

              {/* 用量 */}
              <div className="text-right shrink-0">
                <div className="text-sm font-medium text-slate-600">{alt.standard_usage}</div>
              </div>

              {/* 占位 */}
              <div className="w-12" />
            </div>
          ))}
        </div>
      )}

      {/* 子物料递归渲染 */}
      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <BOMTreeItem
              key={child.material_code}
              node={child}
              depth={depth + 1}
              showAlternatives={showAlternatives}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const BOMDetailDrawer: React.FC<Props> = ({ open, onClose, model }) => {
  const [showAlternatives, setShowAlternatives] = useState(true);
  const [filterLevel, setFilterLevel] = useState<number | null>(null);

  const filteredMaterials = useMemo(() => {
    if (!model?.materials) return [];
    if (filterLevel === null) return model.materials;

    // 过滤指定层级的物料（递归过滤子节点）
    function filterByLevel(nodes: BOMTreeNode[]): BOMTreeNode[] {
      return nodes
        .filter(n => n.bom_level <= filterLevel!)
        .map(n => ({
          ...n,
          children: filterByLevel(n.children),
        }));
    }
    return filterByLevel(model.materials);
  }, [model, filterLevel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px]" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 w-full max-w-4xl bg-white shadow-2xl flex flex-col rounded-l-2xl overflow-hidden border-l border-slate-200/70">
        {/* Header */}
        <div className="p-4 border-b border-indigo-100/80 bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-between gap-3">
          <div className="min-w-0 flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-lg flex items-center justify-center">
              <Layers size={20} className="text-white" />
            </div>
            <div>
              <div className="text-lg font-bold text-slate-800">产品BOM结构</div>
              <div className="text-sm text-slate-600 truncate">
                {model ? `${model.product_name || ''} (${model.product_code})` : '暂无数据'}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-white/60 text-slate-600"
            aria-label="关闭"
          >
            <X size={18} />
          </button>
        </div>

        {/* Statistics */}
        <div className="p-4 border-b border-slate-200/70 bg-gradient-to-b from-slate-50 to-white">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <div className="bg-white/70 border border-slate-200/70 rounded-lg p-3 shadow-sm">
              <div className="text-slate-500 text-xs">总物料数</div>
              <div className="text-xl font-bold text-slate-800">{model?.total_materials ?? 0}</div>
            </div>
            <div className="bg-white/70 border border-slate-200/70 rounded-lg p-3 shadow-sm">
              <div className="text-slate-500 text-xs">主料数</div>
              <div className="text-xl font-bold text-slate-800">{model?.main_materials ?? 0}</div>
            </div>
            <div className="bg-white/70 border border-slate-200/70 rounded-lg p-3 shadow-sm">
              <div className="text-slate-500 text-xs">替代料数</div>
              <div className="text-xl font-bold text-emerald-600">{model?.alternative_materials ?? 0}</div>
            </div>
            <div className="bg-white/70 border border-slate-200/70 rounded-lg p-3 shadow-sm">
              <div className="text-slate-500 text-xs">最大层级</div>
              <div className="text-xl font-bold text-slate-800">L{model?.max_bom_level ?? 0}</div>
            </div>
            <div className="bg-white/70 border border-slate-200/70 rounded-lg p-3 shadow-sm">
              <div className="text-slate-500 text-xs">替代组数</div>
              <div className="text-xl font-bold text-slate-800">{model?.alternative_group_count ?? 0}</div>
            </div>
          </div>

          {/* Filters */}
          <div className="mt-3 flex items-center gap-4 text-sm text-slate-700">
            <div className="flex items-center gap-2 text-slate-600">
              <Filter size={14} />
              筛选
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={showAlternatives}
                onChange={(e) => setShowAlternatives(e.target.checked)}
                className="rounded"
              />
              显示替代料
            </label>
            <div className="flex items-center gap-2">
              <span className="text-slate-500">层级:</span>
              <select
                value={filterLevel ?? ''}
                onChange={(e) => setFilterLevel(e.target.value ? parseInt(e.target.value) : null)}
                className="px-2 py-1 border border-slate-200 rounded text-sm"
              >
                <option value="">全部</option>
                {Array.from({ length: model?.max_bom_level || 8 }, (_, i) => i + 1).map(level => (
                  <option key={level} value={level}>L1-L{level}</option>
                ))}
              </select>
            </div>
            {model?.bom_version && (
              <div className="text-slate-500">
                版本: <span className="text-slate-700">{model.bom_version}</span>
              </div>
            )}
          </div>
        </div>

        {/* BOM Tree */}
        <div className="flex-1 overflow-auto bg-gradient-to-b from-white to-indigo-50/30">
          {filteredMaterials.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              <Layers size={48} className="mx-auto mb-3 text-slate-300" />
              <div className="text-lg font-medium">暂无BOM数据</div>
              <div className="text-sm">该产品未配置BOM结构</div>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {filteredMaterials.map((node) => (
                <BOMTreeItem
                  key={node.material_code}
                  node={node}
                  depth={0}
                  showAlternatives={showAlternatives}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
