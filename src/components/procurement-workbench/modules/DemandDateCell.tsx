/**
 * 行内"需求日期"编辑单元格
 *
 * - 未设置：显示「未设置」按钮，点击进入编辑态
 * - 已设置：显示日期 + 来源徽标 + 悬浮显示「编辑/清除」
 * - 编辑态：原生 <input type="date">，回车 / 失焦提交，Esc 取消
 */

import { useEffect, useRef, useState } from 'react';
import { Pencil, X, Check } from 'lucide-react';
import { procurementTaskService } from '../../../services/procurementTaskService';
import type { PrDemandDateEntry } from '../../../types/procurementWorkbench';

interface DemandDateCellProps {
  taskId: string;
  prBillno: string;
  current?: PrDemandDateEntry;
  onChange: () => void;
}

const SOURCE_LABEL: Record<PrDemandDateEntry['source'], string> = {
  erp: 'ERP',
  user: '已修订',
  import: '导入',
};

const SOURCE_TONE: Record<PrDemandDateEntry['source'], string> = {
  erp: 'bg-slate-100 text-slate-500',
  user: 'bg-blue-100 text-blue-600',
  import: 'bg-emerald-100 text-emerald-600',
};

export default function DemandDateCell({ taskId, prBillno, current, onChange }: DemandDateCellProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<string>(current?.demandDate ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(current?.demandDate ?? '');
      // 下一帧 focus，确保 input 已挂载
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [editing, current?.demandDate]);

  const commit = () => {
    const value = draft.trim();
    if (!value) {
      procurementTaskService.clearDemandDate(taskId, prBillno);
    } else {
      procurementTaskService.setDemandDate(taskId, {
        prBillno,
        demandDate: value,
        source: 'user',
        erpOriginalValue: current?.source === 'erp' ? current.demandDate : current?.erpOriginalValue,
        updatedAt: new Date().toISOString(),
      });
    }
    setEditing(false);
    onChange();
  };

  const cancel = () => {
    setEditing(false);
    setDraft(current?.demandDate ?? '');
  };

  const clear = () => {
    procurementTaskService.clearDemandDate(taskId, prBillno);
    onChange();
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="date"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            if (e.key === 'Escape') cancel();
          }}
          className="px-1.5 py-0.5 text-xs border border-blue-400 rounded outline-none focus:ring-1 focus:ring-blue-400 w-32"
        />
        <button
          onClick={commit}
          className="p-0.5 rounded text-blue-600 hover:bg-blue-50"
          title="保存"
        >
          <Check className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={cancel}
          className="p-0.5 rounded text-slate-400 hover:bg-slate-100"
          title="取消"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  if (current && current.demandDate) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="group inline-flex items-center gap-1.5 text-left hover:text-blue-600 transition-colors"
        title="点击编辑需求日期"
      >
        <span className="font-mono">{current.demandDate}</span>
        <span className={`text-[9px] px-1 py-0.5 rounded ${SOURCE_TONE[current.source]}`}>
          {SOURCE_LABEL[current.source]}
        </span>
        <Pencil className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity" />
        <span
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            clear();
          }}
          className="opacity-0 group-hover:opacity-60 hover:opacity-100 hover:text-red-500 transition-opacity"
          title="清除"
        >
          <X className="w-3 h-3" />
        </span>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="text-slate-300 hover:text-blue-600 transition-colors text-xs"
      title="点击设置需求日期"
    >
      未设置
    </button>
  );
}
