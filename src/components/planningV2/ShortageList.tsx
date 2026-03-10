/**
 * 关键监测物料清单（KeyMaterialList）
 *
 * 原名: 缺料清单（ShortageList）
 * PRD v2.8 第 6.4 节
 *
 * 筛选范围:
 *   - 产品（L0）: 始终包含
 *   - 自制件: 始终包含（无论是否缺料）
 *   - 外购/委外: 仅缺料时包含
 *
 * 数据溯源:
 *   - 甘特图数据: bars prop（由 ganttService.buildGanttData 构建）
 *   - 库存数据: 由父组件通过 keyMaterials prop 传入（含 inventory API 汇总结果）
 *
 * 功能: 分页(20条/页) + 搜索(编码/名称) + 过滤(BOM层级/仅缺口/仅异常)
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Download, Search, Filter, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import type { KeyMonitorMaterial } from '../../types/planningV2';

interface KeyMaterialListProps {
  keyMaterials: KeyMonitorMaterial[];
  productCode: string;
  loading?: boolean;
}

type BomLevelFilter = 'all' | 0 | 1 | 2 | 3;

const PAGE_SIZE = 20;

const typeColorMap: Record<string, string> = {
  '外购': 'bg-green-100 text-green-700',
  '委外': 'bg-orange-100 text-orange-700',
  '自制': 'bg-purple-100 text-purple-700',
};

function exportCSV(rows: KeyMonitorMaterial[], productCode: string): void {
  const headers = '物料编码,物料名称,物料类型,BOM层级,缺口数量,当前库存,可用库存,新入库,PR状态,PO状态,PO交货日,倒排开始,倒排到货,提前期\n';
  const lines = rows.map(r =>
    [
      r.materialCode,
      `"${r.materialName}"`,
      r.materialType,
      `L${r.bomLevel}`,
      r.hasShortage ? r.shortageQuantity : '-',
      r.inventoryQty ?? '-',
      r.availableInventoryQty ?? '-',
      r.newInboundQty ?? '-',
      r.prStatus === 'has_pr' ? '已PR' : r.prStatus === 'no_pr' ? '未PR' : '-',
      r.poStatus === 'has_po' ? '已PO' : r.poStatus === 'no_po' ? '未PO' : '-',
      r.poDeliverDate || '-',
      r.startDate,
      r.endDate,
      r.leadtime,
    ].join(',')
  ).join('\n');
  const blob = new Blob(['\ufeff' + headers + lines], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `关键监测物料清单_${productCode}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ShortageList({ keyMaterials, productCode, loading }: KeyMaterialListProps) {
  const [searchText, setSearchText] = useState('');
  const [bomLevelFilter, setBomLevelFilter] = useState<BomLevelFilter>('all');
  const [shortageOnly, setShortageOnly] = useState(false);
  const [anomalyOnly, setAnomalyOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  // ---------- Filter + Search ----------
  const filteredItems = useMemo(() => {
    let items = keyMaterials;
    // Search: code or name
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      items = items.filter(m =>
        m.materialCode.toLowerCase().includes(q) ||
        m.materialName.toLowerCase().includes(q)
      );
    }
    // BOM level filter
    if (bomLevelFilter !== 'all') {
      items = items.filter(m => m.bomLevel === bomLevelFilter);
    }
    // Shortage only
    if (shortageOnly) {
      items = items.filter(m => m.hasShortage);
    }
    // Anomaly only: no inventory and bomLevel > 0
    if (anomalyOnly) {
      items = items.filter(m => (m.availableInventoryQty === 0 || m.availableInventoryQty === null) && m.bomLevel > 0);
    }
    return items;
  }, [keyMaterials, searchText, bomLevelFilter, shortageOnly, anomalyOnly]);

  // Reset page on filter/search change
  useEffect(() => { setCurrentPage(1); }, [searchText, bomLevelFilter, shortageOnly, anomalyOnly]);

  // ---------- Pagination ----------
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedItems = filteredItems.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // ---------- Stats ----------
  const stats = useMemo(() => {
    const shortage = keyMaterials.filter(m => m.hasShortage).length;
    const anomaly = keyMaterials.filter(m => (m.availableInventoryQty === 0 || m.availableInventoryQty === null) && m.bomLevel > 0).length;
    return { total: keyMaterials.length, shortage, anomaly };
  }, [keyMaterials]);

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">关键监测物料清单</h3>
        <div className="text-center py-6 text-slate-400 text-sm">
          正在加载库存数据...
        </div>
      </div>
    );
  }

  if (keyMaterials.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">关键监测物料清单</h3>
        <div className="text-center py-6 text-slate-400 text-sm">
          无关键监测物料
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <h3 className="text-sm font-semibold text-slate-800">
          关键监测物料清单
          <span className="ml-2 text-xs font-normal text-slate-500">({keyMaterials.length} 项)</span>
        </h3>
        <button
          onClick={() => exportCSV(keyMaterials, productCode)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
        >
          <Download size={14} />
          导出CSV
        </button>
      </div>

      {/* 搜索 + 过滤栏 */}
      <div className="px-4 py-2.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          {/* 搜索框 */}
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="编码/名称搜索..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="pl-7 pr-2 py-1 text-xs border border-slate-200 rounded-md w-44 focus:outline-none focus:ring-1 focus:ring-indigo-300"
            />
          </div>
          {/* BOM层级 */}
          <div className="flex items-center gap-2 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <span className="text-slate-500">层级:</span>
            <select
              value={bomLevelFilter}
              onChange={e => setBomLevelFilter(e.target.value === 'all' ? 'all' : Number(e.target.value) as 0 | 1 | 2 | 3)}
              className="border border-slate-200 rounded px-1.5 py-0.5 text-xs bg-white"
            >
              <option value="all">全部</option>
              <option value={0}>L0 产品</option>
              <option value={1}>L1</option>
              <option value={2}>L2</option>
              <option value={3}>L3</option>
            </select>
          </div>
          {/* 仅缺口 */}
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={shortageOnly} onChange={e => setShortageOnly(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500" />
            仅缺口
          </label>
          {/* 仅异常 */}
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={anomalyOnly} onChange={e => setAnomalyOnly(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500" />
            仅异常
          </label>
        </div>
        {/* 统计 */}
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-500" />缺口 {stats.shortage}</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-amber-500" />异常 {stats.anomaly}</span>
          <span className="text-slate-400">筛选 {filteredItems.length} / {stats.total}</span>
        </div>
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-600">
              <th className="text-left px-3 py-2 font-medium whitespace-nowrap">物料编码</th>
              <th className="text-left px-3 py-2 font-medium whitespace-nowrap">物料名称</th>
              <th className="text-center px-2 py-2 font-medium whitespace-nowrap">类型</th>
              <th className="text-center px-2 py-2 font-medium whitespace-nowrap">层级</th>
              <th className="text-right px-2 py-2 font-medium whitespace-nowrap">缺口</th>
              <th className="text-right px-2 py-2 font-medium whitespace-nowrap">当前库存</th>
              <th className="text-right px-2 py-2 font-medium whitespace-nowrap">可用库存</th>
              <th className="text-right px-2 py-2 font-medium whitespace-nowrap">新入库</th>
              <th className="text-center px-2 py-2 font-medium whitespace-nowrap">PR</th>
              <th className="text-center px-2 py-2 font-medium whitespace-nowrap">PO</th>
              <th className="text-right px-2 py-2 font-medium whitespace-nowrap">PO交货日</th>
              <th className="text-right px-2 py-2 font-medium whitespace-nowrap">倒排开始</th>
              <th className="text-right px-2 py-2 font-medium whitespace-nowrap">倒排到货</th>
              <th className="text-right px-2 py-2 font-medium whitespace-nowrap">提前期</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={14} className="py-8 text-center text-slate-400 text-xs">
                  {searchText ? `未找到匹配 "${searchText}" 的物料` : '暂无符合条件的物料'}
                </td>
              </tr>
            ) : pagedItems.map(item => (
              <tr
                key={item.materialCode}
                className={`border-t border-slate-100 hover:bg-slate-50/50 ${
                  item.hasShortage ? 'bg-red-50/30' :
                  (item.availableInventoryQty === 0 || item.availableInventoryQty === null) && item.bomLevel > 0 ? 'bg-amber-50/30' : ''
                }`}
              >
                <td className="px-3 py-2 font-mono text-slate-700 whitespace-nowrap">{item.materialCode}</td>
                <td className="px-3 py-2 text-slate-800 max-w-[160px] truncate">{item.materialName}</td>
                <td className="px-2 py-2 text-center">
                  <span className={`px-1 py-0.5 rounded text-[10px] font-medium ${
                    item.bomLevel === 0 ? 'bg-blue-100 text-blue-700' :
                    typeColorMap[item.materialType] || 'bg-gray-100 text-gray-600'
                  }`}>
                    {item.bomLevel === 0 ? '产品' : item.materialType}
                  </span>
                </td>
                <td className="px-2 py-2 text-center text-slate-500">L{item.bomLevel}</td>
                <td className="px-2 py-2 text-right">
                  {item.hasShortage ? (
                    <span className="text-red-600 font-semibold">{item.shortageQuantity.toLocaleString()}</span>
                  ) : (
                    <span className="text-slate-300">-</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right text-slate-600">
                  {item.inventoryQty != null ? item.inventoryQty.toLocaleString() : <span className="text-slate-300">-</span>}
                </td>
                <td className="px-2 py-2 text-right">
                  {item.availableInventoryQty == null
                    ? <span className="text-amber-500 font-medium">无记录</span>
                    : item.availableInventoryQty <= 0
                    ? <span className="text-amber-600 font-semibold">{item.availableInventoryQty.toLocaleString()}</span>
                    : <span className="text-slate-600">{item.availableInventoryQty.toLocaleString()}</span>
                  }
                </td>
                <td className="px-2 py-2 text-right">
                  {item.newInboundQty != null ? (
                    <span className="text-green-600 font-medium">{item.newInboundQty.toLocaleString()}</span>
                  ) : (
                    <span className="text-slate-300">-</span>
                  )}
                </td>
                <td className="px-2 py-2 text-center">
                  {item.prStatus === 'has_pr' ? (
                    <span className="text-green-600">✅</span>
                  ) : item.prStatus === 'no_pr' ? (
                    <span className="text-red-500">❌</span>
                  ) : (
                    <span className="text-slate-300">-</span>
                  )}
                </td>
                <td className="px-2 py-2 text-center">
                  {item.poStatus === 'has_po' ? (
                    <span className="text-green-600">✅</span>
                  ) : item.poStatus === 'no_po' ? (
                    <span className="text-red-500">❌</span>
                  ) : (
                    <span className="text-slate-300">-</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right text-slate-600 whitespace-nowrap">
                  {item.poDeliverDate ? item.poDeliverDate.slice(0, 10) : <span className="text-slate-300">-</span>}
                </td>
                <td className="px-2 py-2 text-right text-slate-600 whitespace-nowrap">{item.startDate}</td>
                <td className="px-2 py-2 text-right text-slate-700 whitespace-nowrap">{item.endDate}</td>
                <td className="px-2 py-2 text-right text-slate-500">{item.leadtime}天</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 分页栏 */}
      {filteredItems.length > PAGE_SIZE && (
        <div className="flex items-center justify-center gap-1 px-4 py-2.5 border-t border-slate-100">
          <button onClick={() => setCurrentPage(1)} disabled={safePage === 1}
            className="w-7 h-7 flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <ChevronsLeft className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safePage === 1}
            className="w-7 h-7 flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <span className="px-3 text-xs text-slate-600 select-none">
            第 <span className="font-medium text-slate-800">{safePage}</span> / <span className="font-medium text-slate-800">{totalPages}</span> 页
            <span className="text-slate-400 ml-2">({filteredItems.length} 条)</span>
          </span>
          <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}
            className="w-7 h-7 flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => setCurrentPage(totalPages)} disabled={safePage === totalPages}
            className="w-7 h-7 flex items-center justify-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
            <ChevronsRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
