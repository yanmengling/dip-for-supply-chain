/**
 * Material Inventory Panel (Cockpit/Agent Network 视图)
 *
 * 通过指标模型 API 获取物料库存明细数据：
 * 从配置中心配置的"物料库存优化模型"（mm_material_inventory_optimization）查询。
 * 按物料编码合并后分页展示编码、名称、库存量和状态。
 */

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, Box, CheckCircle, Loader2, Search } from 'lucide-react';
import { metricModelApi, createLastDaysRange } from '../../api/metricModelApi';
import { apiConfigService } from '../../services/apiConfigService';

// ============================================================================
// 配置
// ============================================================================

const getMaterialInventoryModelId = () =>
  apiConfigService.getMetricModelId('mm_material_inventory_optimization') || 'd58ihclg5lk40hvh48mg';

// ── 模块级结果缓存（3 分钟 TTL，页面切换时不重复请求）─────────────────────
const _MAT_CACHE_TTL = 3 * 60 * 1000;
let _matCache: MaterialItem[] | null = null;
let _matCacheTime = 0;

/** 分析维度（物料库存模型中 material_name 无歧义，可直接使用） */
const QUERY_DIMS = [
  'material_code',
  'material_name',
  'available_inventory_qty',
  'inventory_qty',
];

// ============================================================================
// 类型
// ============================================================================

interface MaterialItem {
  materialCode: string;
  materialName: string;
  currentStock: number;
  status: '正常' | '缺货';
}

// ============================================================================
// 主组件
// ============================================================================

interface Props {
  onNavigate?: (view: string) => void;
}

const MaterialInventoryPanel = ({ onNavigate }: Props) => {
  const _initValid =
    !!(_matCache && Date.now() - _matCacheTime < _MAT_CACHE_TTL);
  const [materials, setMaterials] = useState<MaterialItem[]>(_initValid ? _matCache! : []);
  const [loading, setLoading] = useState(!_initValid);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let isMounted = true;

    async function fetchData() {
      // 命中模块级缓存则直接渲染，跳过所有 API 请求
      const now = Date.now();
      if (_matCache && now - _matCacheTime < _MAT_CACHE_TTL) {
        if (isMounted) { setMaterials(_matCache); setLoading(false); }
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const modelId = getMaterialInventoryModelId();
        const timeRange = createLastDaysRange(1);

        // ── 第一步：获取模型维度列表 ──────────────────────────────────
        const firstResult = await metricModelApi.queryByModelId(
          modelId,
          { instant: true, start: timeRange.start, end: timeRange.end },
          { includeModel: true }
        );
        if (!isMounted) return;

        const rawDims = firstResult.model?.analysis_dimensions ?? [];
        const allDims: string[] = rawDims.map((d) =>
          typeof d === 'string' ? d : (d as { name: string }).name
        ).filter(Boolean);

        const validDims = QUERY_DIMS.filter(d => allDims.includes(d));

        // ── 第二步：按维度下钻，获取物料明细 ─────────────────────────
        let result = firstResult;
        if (validDims.length > 0) {
          result = await metricModelApi.queryByModelId(
            modelId,
            {
              instant: true,
              start: timeRange.start,
              end: timeRange.end,
              analysis_dimensions: validDims,
            },
            { includeModel: false, ignoringHcts: true }
          );
          if (!isMounted) return;
        }

        // ── 合并：按 material_code 去重并累加库存 ──────────────────
        const NIL_LIKE = /^(<nil>|nil|null|undefined|none)$/i;
        const mergedMap = new Map<string, MaterialItem>();

        for (const series of result.datas ?? []) {
          const labels = series.labels || {};

          const code = (
            labels.material_code ||
            labels.product_code ||
            labels.material_number ||
            ''
          ).trim();

          const name = (
            labels.material_name ||
            labels.product_name ||
            ''
          ).trim();

          if (!code || NIL_LIKE.test(code)) continue;

          // 读取库存量
          let qty = 0;
          const qtyFromLabel =
            labels.available_inventory_qty ??
            labels.inventory_qty ??
            null;
          if (qtyFromLabel !== null && qtyFromLabel !== undefined) {
            qty = parseFloat(String(qtyFromLabel)) || 0;
          } else if (series.values && series.values.length > 0) {
            for (let i = series.values.length - 1; i >= 0; i--) {
              if (series.values[i] !== null) {
                qty = series.values[i]!;
                break;
              }
            }
          }

          const stock = Math.floor(qty);

          if (mergedMap.has(code)) {
            const existing = mergedMap.get(code)!;
            existing.currentStock += stock;
            if (!existing.materialName || existing.materialName === code) {
              existing.materialName = name || code;
            }
          } else {
            mergedMap.set(code, {
              materialCode: code,
              materialName: name || code,
              currentStock: stock,
              status: stock > 0 ? '正常' : '缺货',
            });
          }
        }

        const list: MaterialItem[] = Array.from(mergedMap.values()).map(m => ({
          ...m,
          status: m.currentStock > 0 ? '正常' : '缺货',
        }));

        list.sort((a, b) => b.currentStock - a.currentStock);

        // 写入模块级缓存
        _matCache = list;
        _matCacheTime = Date.now();

        if (isMounted) setMaterials(list);
      } catch (err) {
        if (!isMounted) return;
        console.error('[物料库存组件] 查询失败:', err);
        setError(err instanceof Error ? err.message : '获取数据失败');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchData();
    return () => { isMounted = false; };
  }, []);

  // 搜索过滤
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return materials;
    return materials.filter(m =>
      m.materialCode.toLowerCase().includes(q) ||
      m.materialName.toLowerCase().includes(q)
    );
  }, [materials, search]);

  // 取排名前 10 的物料（因为 materials 之前已经按库存降序排序过了）
  const top10 = filtered.slice(0, 10);
  const totalStock = materials.reduce((s, m) => s + m.currentStock, 0);

  const handleViewDetails = () => {
    if (onNavigate) {
      onNavigate('inventory');
    }
  };

  return (
    <div className="bg-white rounded-lg shadow flex flex-col h-full overflow-hidden">
      {/* 顶栏 */}
      <div className="p-4 sm:p-6 border-b border-slate-200 flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
          <Box className="text-amber-600" size={20} />
          物料库存智能体
        </h2>
        <button
          onClick={handleViewDetails}
          className="flex items-center gap-1 text-sm text-indigo-600 hover:text-indigo-700"
        >
          查看详情
          <ArrowRight size={14} />
        </button>
      </div>

      <div className="p-4 sm:p-6 space-y-4 flex-1 flex flex-col">
        {/* 统计横幅 */}
        {loading ? (
          <div className="flex justify-center p-4">
            <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
          </div>
        ) : error ? (
          <div className="p-3 bg-red-50 text-red-600 rounded flex items-center gap-2 text-sm">
            <AlertTriangle size={16} /> {error}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-xs text-slate-500 mb-1">总库存量</div>
              <div className="text-2xl font-bold text-slate-800">{totalStock.toLocaleString()}</div>
            </div>
            <div className="bg-slate-50 rounded-lg p-3">
              <div className="text-xs text-slate-500 mb-1">总物料种数</div>
              <div className="text-2xl font-bold text-slate-800">{materials.length.toLocaleString()}</div>
            </div>
          </div>
        )}

        {/* 搜索 */}
        <div className="relative mt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
          <input
            type="text"
            placeholder="搜索物料编码或名称..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-400 bg-gray-50"
          />
        </div>

        <div className="flex items-center justify-between mt-4 mb-2">
          <div className="text-sm font-medium text-slate-700">库存量排名前十</div>
          <div className="text-xs text-slate-400">共 {filtered.length} 种物料</div>
        </div>

        {/* 列表区域 */}
        <div className="flex-1 overflow-y-auto min-h-[220px]">
          {top10.length > 0 ? (
            <div className="space-y-2">
              {top10.map(m => (
                <div key={m.materialCode} className="p-3 bg-white border border-slate-100 rounded-lg shadow-sm hover:border-amber-200 transition-colors">
                  <div className="flex justify-between items-start">
                    <div className="flex-1 pr-2">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-slate-800 text-sm">{m.materialName}</h4>
                        {m.status === '正常' ? (
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                        )}
                      </div>
                      <div className="text-xs font-mono text-slate-500">
                        {m.materialCode}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-slate-700">{m.currentStock}</div>
                      <div className="text-[10px] text-slate-400">可用库存</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            !loading && <div className="text-sm text-center text-slate-400 py-8">无物料记录</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default MaterialInventoryPanel;
