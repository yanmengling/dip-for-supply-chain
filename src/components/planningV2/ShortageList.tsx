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
 */

import React, { useState, useMemo } from 'react';
import { Download, Search } from 'lucide-react';
import type { KeyMonitorMaterial } from '../../types/planningV2';

interface KeyMaterialListProps {
  keyMaterials: KeyMonitorMaterial[];
  productCode: string;
  loading?: boolean;
}

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

  const displayItems = useMemo(() => {
    if (!searchText.trim()) return keyMaterials;
    const q = searchText.toLowerCase();
    return keyMaterials.filter(m => m.materialCode.toLowerCase().includes(q));
  }, [keyMaterials, searchText]);

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
        <div className="flex items-center gap-2">
          {/* 搜索框 */}
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="物料编码搜索..."
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
              className="pl-7 pr-2 py-1 text-xs border border-slate-200 rounded-md w-40 focus:outline-none focus:ring-1 focus:ring-indigo-300"
            />
          </div>
          <button
            onClick={() => exportCSV(keyMaterials, productCode)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Download size={14} />
            导出CSV
          </button>
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
            {displayItems.map(item => (
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

      {/* 搜索无结果提示 */}
      {searchText && displayItems.length === 0 && (
        <div className="text-center py-4 text-slate-400 text-xs">
          未找到匹配 "{searchText}" 的物料
        </div>
      )}
    </div>
  );
}
