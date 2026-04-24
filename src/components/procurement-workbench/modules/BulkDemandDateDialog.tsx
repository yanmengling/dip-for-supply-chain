/**
 * 批量赋值需求日期对话框
 *
 * 选中行的 PR 单号去重后，统一写入同一个需求日期。
 */

import { useState } from 'react';
import { X, Calendar } from 'lucide-react';
import { procurementTaskService } from '../../../services/procurementTaskService';
import type { PrDemandDateEntry } from '../../../types/procurementWorkbench';

interface BulkDemandDateDialogProps {
  open: boolean;
  taskId: string;
  prBillnos: string[]; // 已去重
  onClose: () => void;
  onApplied: (count: number) => void;
}

export default function BulkDemandDateDialog({
  open,
  taskId,
  prBillnos,
  onClose,
  onApplied,
}: BulkDemandDateDialogProps) {
  const [date, setDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = () => {
    setError(null);
    if (!date) {
      setError('请选择需求日期');
      return;
    }
    const now = new Date().toISOString();
    const entries: PrDemandDateEntry[] = prBillnos.map((billno) => ({
      prBillno: billno,
      demandDate: date,
      source: 'user',
      updatedAt: now,
    }));
    procurementTaskService.setDemandDatesBulk(taskId, entries);
    onApplied(entries.length);
    setDate('');
  };

  const handleClose = () => {
    setDate('');
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={handleClose} />
      <div className="relative z-10 w-full max-w-md mx-4 bg-white rounded-xl shadow-xl ring-1 ring-black/5 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900">统一赋值需求日期</h3>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <p className="text-xs text-slate-500">
            将为 <strong className="text-slate-800">{prBillnos.length}</strong> 个 PR 单号
            （行内同 PR 已去重）写入同一需求日期；来源标记为「已修订」。
          </p>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">需求日期</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">{error}</div>
          )}

          {prBillnos.length > 0 && prBillnos.length <= 30 && (
            <details className="text-xs text-slate-500">
              <summary className="cursor-pointer select-none hover:text-slate-700">查看 PR 单号清单</summary>
              <div className="mt-2 max-h-32 overflow-y-auto p-2 bg-slate-50 rounded font-mono leading-relaxed">
                {prBillnos.join('，')}
              </div>
            </details>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3 bg-gray-50 border-t border-gray-100">
          <button
            onClick={handleClose}
            className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!date}
            className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            确定写入
          </button>
        </div>
      </div>
    </div>
  );
}
