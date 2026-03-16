/**
 * 关键监测物料清单（KeyMaterialList）
 *
 * 原名: 缺料清单（ShortageList）
 * PRD v4.2 第 6.6 节
 *
 * 功能: 分页(20条/页) + 搜索(编码/名称) + 过滤(BOM层级/MRP/投放状态/采购状态/仅异常)
 * v4.2: MRP 主从展开行 + 投放状态过滤 + 采购状态过滤
 * 行状态: 委外/外购异常(红) + 提醒(橙) + 自制可推送生产(绿按钮)
 * 操作: PR/PO 下单按钮(预留) + 推送生产按钮(预留)
 */

import React, { useState, useMemo, useEffect } from 'react';
import { Download, Search, Filter, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, FileText, Package, Hammer, ChevronDown, ChevronRight as ChevronRightIcon } from 'lucide-react';
import type { KeyMonitorMaterial } from '../../types/planningV2';

export type MaterialAction = 'create_pr' | 'create_po' | 'push_production';

interface KeyMaterialListProps {
  keyMaterials: KeyMonitorMaterial[];
  productCode: string;
  loading?: boolean;
  /** 预留操作回调，后续对接ERP */
  onAction?: (type: MaterialAction, materialCode: string, materialName: string) => void;
}

type BomLevelFilter = 'all' | 0 | 1 | 2 | 3;
type DropStatusFilter = 'all' | '未投放' | '已投放';
type ProcurementFilter = 'all' | 'none' | 'has_pr' | 'has_po';

const PAGE_SIZE = 20;
const COL_SPAN = 12; // 总列数（含展开列）

const typeColorMap: Record<string, string> = {
  '外购': 'bg-green-100 text-green-700',
  '委外': 'bg-orange-100 text-orange-700',
  '自制': 'bg-purple-100 text-purple-700',
};

/** 计算日期距今天数（正数=未来，负数=已过期） */
function daysFromToday(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

/** 判断物料行状态 */
function getRowStatus(item: KeyMonitorMaterial): 'danger' | 'warning' | 'production_ready' | 'normal' {
  const isExternal = item.materialType === '外购' || item.materialType === '委外';
  const isSelfMade = item.materialType === '自制';
  const daysUntilStart = daysFromToday(item.startDate);
  const noPO = item.poStatus === 'no_po';

  // 委外/外购：有MRP记录时才判断异常
  if (isExternal && item.hasMRP) {
    if (daysUntilStart < 0 && noPO) return 'danger';     // 已过期未下PO
    if (daysUntilStart < 2 && noPO) return 'warning';     // 即将到期未下PO
  }

  // 自制件（含产品L0）：即将开工 + 物料齐套OK
  if (isSelfMade && daysUntilStart <= 2 && !item.hasShortage) {
    return 'production_ready';
  }

  return 'normal';
}

function exportCSV(rows: KeyMonitorMaterial[], productCode: string): void {
  const headers = '物料编码,物料名称,物料类型,BOM层级,MRP记录数,投放状态,需求量,可用库存,PR状态,PO状态,倒排开始,倒排到货,提前期\n';
  const lines = rows.map(r =>
    [
      r.materialCode,
      `"${r.materialName}"`,
      r.materialType,
      `L${r.bomLevel}`,
      r.mrpDetails.length,
      r.dropStatusTitle ?? 'N/A',
      r.shortageQuantity || 'N/A',
      r.availableInventoryQty ?? '-',
      r.prStatus === 'has_pr' ? '已PR' : r.prStatus === 'no_pr' ? '未PR' : '-',
      r.poStatus === 'has_po' ? '已PO' : r.poStatus === 'no_po' ? '未PO' : '-',
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

export default function ShortageList({ keyMaterials, productCode, loading, onAction }: KeyMaterialListProps) {
  const [searchText, setSearchText] = useState('');
  const [bomLevelFilter, setBomLevelFilter] = useState<BomLevelFilter>('all');
  const [mrpFilter, setMrpFilter] = useState<'all' | 'has_mrp' | 'no_mrp'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | '自制' | '委外' | '外购'>('all');
  const [dropStatusFilter, setDropStatusFilter] = useState<DropStatusFilter>('all');
  const [procurementFilter, setProcurementFilter] = useState<ProcurementFilter>('all');
  const [anomalyOnly, setAnomalyOnly] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const handleAction = (type: MaterialAction, code: string, name: string) => {
    if (onAction) {
      onAction(type, code, name);
    } else {
      const labels = { create_pr: '下PR', create_po: '下PO', push_production: '推送生产' };
      console.log(`[ShortageList] 操作: ${labels[type]} - ${code} ${name} (待对接ERP)`);
    }
  };

  const toggleExpand = (key: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  // ---------- Filter + Search ----------
  const filteredItems = useMemo(() => {
    let items = keyMaterials;
    if (searchText.trim()) {
      const q = searchText.toLowerCase();
      items = items.filter(m =>
        m.materialCode.toLowerCase().includes(q) ||
        m.materialName.toLowerCase().includes(q)
      );
    }
    if (bomLevelFilter !== 'all') {
      items = items.filter(m => m.bomLevel === bomLevelFilter);
    }
    if (mrpFilter === 'has_mrp') {
      items = items.filter(m => m.hasMRP);
    } else if (mrpFilter === 'no_mrp') {
      items = items.filter(m => !m.hasMRP);
    }
    if (typeFilter !== 'all') {
      items = items.filter(m => m.materialType === typeFilter);
    }
    // v4.2: 投放状态过滤
    if (dropStatusFilter !== 'all') {
      items = items.filter(m =>
        m.mrpDetails.some(d => d.dropStatusTitle === dropStatusFilter)
      );
    }
    // v4.2: 采购状态过滤
    if (procurementFilter === 'none') {
      items = items.filter(m => m.prStatus !== 'has_pr' && m.poStatus !== 'has_po');
    } else if (procurementFilter === 'has_pr') {
      items = items.filter(m => m.prStatus === 'has_pr');
    } else if (procurementFilter === 'has_po') {
      items = items.filter(m => m.poStatus === 'has_po');
    }
    if (anomalyOnly) {
      items = items.filter(m => {
        const status = getRowStatus(m);
        return status === 'danger' || status === 'warning';
      });
    }
    return items;
  }, [keyMaterials, searchText, bomLevelFilter, mrpFilter, typeFilter, dropStatusFilter, procurementFilter, anomalyOnly]);

  useEffect(() => { setCurrentPage(1); }, [searchText, bomLevelFilter, mrpFilter, typeFilter, dropStatusFilter, procurementFilter, anomalyOnly]);

  // ---------- Pagination ----------
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedItems = filteredItems.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // ---------- Stats ----------
  const stats = useMemo(() => {
    const withMrp = keyMaterials.filter(m => m.hasMRP);
    const hasMrp = withMrp.length;
    const noMrp = keyMaterials.length - hasMrp;
    const dangerCount = keyMaterials.filter(m => getRowStatus(m) === 'danger').length;
    const warningCount = keyMaterials.filter(m => getRowStatus(m) === 'warning').length;
    return { total: keyMaterials.length, hasMrp, noMrp, danger: dangerCount, warning: warningCount };
  }, [keyMaterials]);

  if (loading) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">关键监测物料清单</h3>
        <div className="text-center py-6 text-slate-400 text-sm">正在加载库存数据...</div>
      </div>
    );
  }

  if (keyMaterials.length === 0) {
    return (
      <div className="bg-white border border-slate-200 rounded-lg p-6">
        <h3 className="text-sm font-semibold text-slate-800 mb-3">关键监测物料清单</h3>
        <div className="text-center py-6 text-slate-400 text-sm">无关键监测物料</div>
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
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="编码/名称搜索..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="pl-7 pr-2 py-1 text-xs border border-slate-200 rounded-md w-40 focus:outline-none focus:ring-1 focus:ring-indigo-300"
            />
          </div>
          <div className="flex items-center gap-1.5 text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={bomLevelFilter}
              onChange={e => setBomLevelFilter(e.target.value === 'all' ? 'all' : Number(e.target.value) as 0 | 1 | 2 | 3)}
              className="border border-slate-200 rounded px-1.5 py-0.5 text-xs bg-white"
            >
              <option value="all">层级</option>
              <option value={0}>L0</option>
              <option value={1}>L1</option>
              <option value={2}>L2</option>
              <option value={3}>L3</option>
            </select>
          </div>
          <select
            value={mrpFilter}
            onChange={e => setMrpFilter(e.target.value as 'all' | 'has_mrp' | 'no_mrp')}
            className="border border-slate-200 rounded px-1.5 py-0.5 text-xs bg-white"
          >
            <option value="all">MRP</option>
            <option value="has_mrp">有MRP</option>
            <option value="no_mrp">无MRP</option>
          </select>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as 'all' | '自制' | '委外' | '外购')}
            className="border border-slate-200 rounded px-1.5 py-0.5 text-xs bg-white"
          >
            <option value="all">类型</option>
            <option value="自制">自制</option>
            <option value="委外">委外</option>
            <option value="外购">外购</option>
          </select>
          <select
            value={dropStatusFilter}
            onChange={e => setDropStatusFilter(e.target.value as DropStatusFilter)}
            className="border border-slate-200 rounded px-1.5 py-0.5 text-xs bg-white"
          >
            <option value="all">投放状态</option>
            <option value="未投放">未投放</option>
            <option value="已投放">已投放</option>
          </select>
          <select
            value={procurementFilter}
            onChange={e => setProcurementFilter(e.target.value as ProcurementFilter)}
            className="border border-slate-200 rounded px-1.5 py-0.5 text-xs bg-white"
          >
            <option value="all">采购状态</option>
            <option value="none">无PR无PO</option>
            <option value="has_pr">已有PR</option>
            <option value="has_po">已有PO</option>
          </select>
          <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
            <input type="checkbox" checked={anomalyOnly} onChange={e => setAnomalyOnly(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-slate-300 text-red-600 focus:ring-red-500" />
            仅异常
          </label>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-blue-500" />有MRP {stats.hasMrp}</span>
          <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-slate-400" />无MRP {stats.noMrp}</span>
          {stats.danger > 0 && <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-500" />异常 {stats.danger}</span>}
          {stats.warning > 0 && <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-amber-500" />提醒 {stats.warning}</span>}
          <span className="text-slate-400">筛选 {filteredItems.length} / {stats.total}</span>
        </div>
      </div>

      {/* 表格 */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 text-slate-600">
              <th className="w-6 px-1 py-2"></th>
              <th className="text-left px-3 py-2 font-medium whitespace-nowrap">物料</th>
              <th className="text-center px-2 py-2 font-medium whitespace-nowrap">类型</th>
              <th className="text-center px-2 py-2 font-medium whitespace-nowrap">层级</th>
              <th className="text-center px-2 py-2 font-medium whitespace-nowrap">MRP</th>
              <th className="text-right px-2 py-2 font-medium whitespace-nowrap">需求量</th>
              <th className="text-right px-2 py-2 font-medium whitespace-nowrap">可用库存</th>
              <th className="text-center px-2 py-2 font-medium whitespace-nowrap">PR</th>
              <th className="text-center px-2 py-2 font-medium whitespace-nowrap">PO</th>
              <th className="text-right px-2 py-2 font-medium whitespace-nowrap">倒排开始</th>
              <th className="text-right px-2 py-2 font-medium whitespace-nowrap">倒排到货</th>
              <th className="text-center px-2 py-2 font-medium whitespace-nowrap">生产推送</th>
            </tr>
          </thead>
          <tbody>
            {filteredItems.length === 0 ? (
              <tr>
                <td colSpan={COL_SPAN} className="py-8 text-center text-slate-400 text-xs">
                  {searchText ? `未找到匹配 "${searchText}" 的物料` : '暂无符合条件的物料'}
                </td>
              </tr>
            ) : pagedItems.map(item => {
              const rowKey = `${item.materialCode}-${item.bomLevel}`;
              const rowStatus = getRowStatus(item);
              const isExternal = item.materialType === '外购' || item.materialType === '委外';
              const isExpanded = expandedRows.has(rowKey);
              const hasDetails = item.mrpDetails.length > 0;
              const rowBg =
                rowStatus === 'danger' ? 'bg-red-50' :
                rowStatus === 'warning' ? 'bg-amber-50/60' :
                '';

              // 过滤展开行中的 MRP 明细（投放状态过滤联动）
              const visibleDetails = dropStatusFilter === 'all'
                ? item.mrpDetails
                : item.mrpDetails.filter(d => d.dropStatusTitle === dropStatusFilter);

              return (
                <React.Fragment key={rowKey}>
                  <tr className={`border-t border-slate-100 hover:bg-slate-50/50 ${rowBg}`}>
                    {/* 展开按钮 */}
                    <td className="px-1 py-2 text-center">
                      {hasDetails ? (
                        <button
                          onClick={() => toggleExpand(rowKey)}
                          className="w-4 h-4 flex items-center justify-center text-slate-400 hover:text-slate-600 transition-colors"
                        >
                          {isExpanded ? <ChevronDown size={12} /> : <ChevronRightIcon size={12} />}
                        </button>
                      ) : null}
                    </td>
                    {/* 物料（编码+名称合并） */}
                    <td className={`px-3 py-2 ${rowStatus === 'danger' ? 'border-l-2 border-l-red-500' : ''}`}>
                      <div className="font-mono text-slate-700 text-xs whitespace-nowrap">{item.materialCode}</div>
                      <div className="text-slate-500 text-[11px] max-w-[180px] truncate" title={item.materialName}>{item.materialName}</div>
                    </td>
                    <td className="px-2 py-2 text-center">
                      <span className={`px-1 py-0.5 rounded text-[10px] font-medium ${
                        item.bomLevel === 0 ? 'bg-blue-100 text-blue-700' :
                        typeColorMap[item.materialType] || 'bg-gray-100 text-gray-600'
                      }`}>
                        {item.bomLevel === 0 ? '产品' : item.materialType}
                      </span>
                    </td>
                    <td className="px-2 py-2 text-center text-slate-500">L{item.bomLevel}</td>
                    {/* MRP 状态 */}
                    <td className="px-2 py-2 text-center">
                      {item.hasMRP ? (
                        <button
                          onClick={() => hasDetails && toggleExpand(rowKey)}
                          className="inline-flex items-center gap-1 cursor-pointer hover:opacity-80"
                          title={`${item.mrpDetails.length} 条MRP记录，点击展开`}
                        >
                          <span className={`px-1 py-0.5 rounded text-[10px] font-medium ${
                            item.dropStatusTitle === '已投放' ? 'bg-blue-100 text-blue-700'
                            : 'bg-slate-100 text-slate-600'
                          }`}>
                            {item.dropStatusTitle || '有记录'}
                          </span>
                          <span className="text-[10px] text-slate-400">×{item.mrpDetails.length}</span>
                        </button>
                      ) : (
                        <span className="text-slate-300 text-[10px]">-</span>
                      )}
                    </td>
                    {/* 需求量 */}
                    <td className="px-2 py-2 text-right">
                      {item.shortageQuantity > 0 ? (
                        <span className="text-blue-600 font-medium">{item.shortageQuantity.toLocaleString()}</span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    {/* 可用库存 */}
                    <td className="px-2 py-2 text-right">
                      {item.availableInventoryQty == null
                        ? <span className="text-amber-500 font-medium">无记录</span>
                        : item.availableInventoryQty <= 0
                        ? <span className="text-amber-600 font-semibold">{item.availableInventoryQty.toLocaleString()}</span>
                        : <span className="text-slate-600">{item.availableInventoryQty.toLocaleString()}</span>
                      }
                    </td>
                    {/* PR 列 */}
                    <td className="px-2 py-2 text-center">
                      {item.prStatus === 'has_pr' ? (
                        <span className="text-green-600 text-sm">✓</span>
                      ) : item.prStatus === 'no_pr' && item.hasMRP && isExternal ? (
                        <button
                          onClick={() => handleAction('create_pr', item.materialCode, item.materialName)}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded hover:bg-blue-100 transition-colors"
                          title={`为 ${item.materialCode} 创建采购申请`}
                        >
                          <FileText size={10} />
                          下PR
                        </button>
                      ) : item.prStatus === 'no_pr' ? (
                        <span className="text-slate-400 text-[10px]">未PR</span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    {/* PO 列 */}
                    <td className="px-2 py-2 text-center">
                      {item.poStatus === 'has_po' ? (
                        <span className="text-green-600 text-sm">✓</span>
                      ) : item.poStatus === 'no_po' && item.hasMRP && isExternal && item.prStatus === 'has_pr' ? (
                        <button
                          onClick={() => handleAction('create_po', item.materialCode, item.materialName)}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded hover:bg-indigo-100 transition-colors"
                          title={`为 ${item.materialCode} 创建采购订单`}
                        >
                          <Package size={10} />
                          下PO
                        </button>
                      ) : item.poStatus === 'no_po' ? (
                        <span className="text-slate-400 text-[10px]">未PO</span>
                      ) : (
                        <span className="text-slate-300">-</span>
                      )}
                    </td>
                    <td className={`px-2 py-2 text-right whitespace-nowrap ${rowStatus === 'danger' ? 'text-red-600 font-medium' : rowStatus === 'warning' ? 'text-amber-600 font-medium' : 'text-slate-600'}`}>
                      {item.startDate}
                    </td>
                    <td className="px-2 py-2 text-right text-slate-700 whitespace-nowrap">{item.endDate}</td>
                    {/* 操作列：生产推送 */}
                    <td className="px-2 py-2 text-center">
                      {isExternal ? (
                        <span className="text-slate-300 text-[10px]">N/A</span>
                      ) : rowStatus === 'production_ready' ? (
                        <button
                          onClick={() => handleAction('push_production', item.materialCode, item.materialName)}
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-green-700 bg-green-50 border border-green-200 rounded hover:bg-green-100 transition-colors"
                          title={`推送 ${item.materialCode} 到生产`}
                        >
                          <Hammer size={10} />
                          推送生产
                        </button>
                      ) : (
                        <button
                          disabled
                          className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 bg-slate-50 border border-slate-200 rounded cursor-not-allowed opacity-50"
                          title="条件未满足：需自制件 + 距开工≤2天 + 无缺料"
                        >
                          <Hammer size={10} />
                          推送生产
                        </button>
                      )}
                    </td>
                  </tr>

                  {/* v4.2: MRP 明细展开行 */}
                  {isExpanded && visibleDetails.length > 0 && (
                    <tr className="bg-slate-50/50">
                      <td colSpan={COL_SPAN} className="px-6 py-2">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="text-slate-500">
                              <th className="text-left px-2 py-1 font-medium">MRP单号</th>
                              <th className="text-right px-2 py-1 font-medium">需求量</th>
                              <th className="text-center px-2 py-1 font-medium">投放状态</th>
                              <th className="text-right px-2 py-1 font-medium">投放数量</th>
                              <th className="text-center px-2 py-1 font-medium">关闭状态</th>
                              <th className="text-center px-2 py-1 font-medium">PR</th>
                              <th className="text-center px-2 py-1 font-medium">PO</th>
                              <th className="text-right px-2 py-1 font-medium">PO交货日</th>
                            </tr>
                          </thead>
                          <tbody>
                            {visibleDetails.map(d => (
                              <tr key={d.mrpBillno} className="border-t border-slate-100">
                                <td className="px-2 py-1 font-mono text-slate-600">{d.mrpBillno}</td>
                                <td className="px-2 py-1 text-right text-blue-600 font-medium">{d.demandQty.toLocaleString()}</td>
                                <td className="px-2 py-1 text-center">
                                  <span className={`px-1 py-0.5 rounded text-[10px] ${
                                    d.dropStatusTitle === '已投放' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                                  }`}>
                                    {d.dropStatusTitle || '-'}
                                  </span>
                                </td>
                                <td className="px-2 py-1 text-right text-slate-600">{d.bizdropqty > 0 ? d.bizdropqty.toLocaleString() : '-'}</td>
                                <td className="px-2 py-1 text-center">
                                  <span className={`px-1 py-0.5 rounded text-[10px] ${
                                    d.closestatus === '正常' || d.closestatus === 'A' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                                  }`}>
                                    {d.closestatus || '-'}
                                  </span>
                                </td>
                                <td className="px-2 py-1 text-center">{d.hasPR ? <span className="text-green-600">✓</span> : <span className="text-slate-300">-</span>}</td>
                                <td className="px-2 py-1 text-center">{d.hasPO ? <span className="text-green-600">✓</span> : <span className="text-slate-300">-</span>}</td>
                                <td className="px-2 py-1 text-right text-slate-500">{d.poDeliverDate || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
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
