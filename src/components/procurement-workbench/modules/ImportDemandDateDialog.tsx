/**
 * 需求日期 CSV 导入对话框
 *
 * 文件格式：
 * - 必含两列表头：prBillno, demandDate（中文兼容："PR单号" / "需求日期"）
 * - 日期支持 YYYY-MM-DD / YYYY/MM/DD（自动归一）
 * - 解析后展示预览表，用户确认后写入；source 标 'import'
 *
 * 解析策略：纯 JS RFC4180 简化版（支持双引号包裹与转义、引号内逗号、CRLF/LF）
 */

import { useRef, useState } from 'react';
import { X, Upload, FileText, AlertCircle, CheckCircle2 } from 'lucide-react';
import { procurementTaskService } from '../../../services/procurementTaskService';
import type { PrDemandDateEntry } from '../../../types/procurementWorkbench';

interface ImportDemandDateDialogProps {
  open: boolean;
  taskId: string;
  onClose: () => void;
  onApplied: (count: number) => void;
}

interface ParsedRow {
  rowNum: number; // 原始文件行号（含表头，从 1 开始）
  prBillno: string;
  demandDate: string;
  /** null 表示有效；string 为错误原因 */
  error: string | null;
}

const HEADER_ALIASES_PR = ['prbillno', 'pr单号', 'pr_billno', '采购申请单号', '单号'];
const HEADER_ALIASES_DATE = ['demanddate', '需求日期', 'demand_date', 'date'];

export default function ImportDemandDateDialog({
  open,
  taskId,
  onClose,
  onApplied,
}: ImportDemandDateDialogProps) {
  const [fileName, setFileName] = useState<string>('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const validRows = rows.filter((r) => !r.error);
  const invalidRows = rows.filter((r) => r.error);

  const reset = () => {
    setFileName('');
    setRows([]);
    setParseError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleFile = async (file: File) => {
    setParseError(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = parseCsv(text);
      setRows(parsed);
    } catch (err) {
      console.error('[ImportDemandDateDialog] parse failed', err);
      setParseError(err instanceof Error ? err.message : '解析失败');
      setRows([]);
    }
  };

  const handleSubmit = () => {
    if (validRows.length === 0) return;
    const now = new Date().toISOString();
    // 同 PR 单号取后者覆盖前者
    const map = new Map<string, ParsedRow>();
    for (const r of validRows) map.set(r.prBillno, r);
    const entries: PrDemandDateEntry[] = Array.from(map.values()).map((r) => ({
      prBillno: r.prBillno,
      demandDate: r.demandDate,
      source: 'import',
      updatedAt: now,
    }));
    procurementTaskService.setDemandDatesBulk(taskId, entries);
    onApplied(entries.length);
    reset();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" onClick={handleClose} />
      <div className="relative z-10 w-full max-w-2xl mx-4 bg-white rounded-xl shadow-xl ring-1 ring-black/5 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Upload className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-semibold text-gray-900">导入需求日期 (CSV)</h3>
          </div>
          <button
            onClick={handleClose}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            aria-label="关闭"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3 max-h-[70vh] overflow-y-auto">
          {/* 格式说明 */}
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600 leading-relaxed">
            <div className="font-medium text-slate-700 mb-1">文件格式</div>
            <ul className="list-disc list-inside space-y-0.5">
              <li>UTF-8 编码 CSV，首行为表头，必须包含 <code className="px-1 bg-white rounded">prBillno</code>(或"PR单号") 与 <code className="px-1 bg-white rounded">demandDate</code>(或"需求日期")</li>
              <li>日期格式：<code className="px-1 bg-white rounded">YYYY-MM-DD</code> 或 <code className="px-1 bg-white rounded">YYYY/MM/DD</code></li>
              <li>同一 PR 单号出现多次时取最后一行；空 PR 单号 / 非法日期会跳过并在下方标红</li>
              <li>Excel 文件请先「另存为 CSV UTF-8」再导入</li>
            </ul>
          </div>

          {/* 文件选择 */}
          <div>
            <label className="block">
              <input
                ref={inputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                }}
                className="hidden"
              />
              <div className="flex items-center justify-center gap-2 px-4 py-6 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition-colors">
                <FileText className="w-5 h-5 text-slate-400" />
                <span className="text-sm text-slate-600">
                  {fileName ? <>已选择：<strong className="text-slate-800">{fileName}</strong>（点击重选）</> : '点击选择 CSV 文件'}
                </span>
              </div>
            </label>
          </div>

          {parseError && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{parseError}</span>
            </div>
          )}

          {/* 解析结果统计 */}
          {rows.length > 0 && (
            <div className="flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="w-3.5 h-3.5" />
                有效 {validRows.length} 行
              </span>
              {invalidRows.length > 0 && (
                <span className="inline-flex items-center gap-1 text-red-600">
                  <AlertCircle className="w-3.5 h-3.5" />
                  无效 {invalidRows.length} 行
                </span>
              )}
              <span className="text-slate-400">合计 {rows.length} 行</span>
            </div>
          )}

          {/* 预览表 */}
          {rows.length > 0 && (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <div className="max-h-64 overflow-y-auto">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 sticky top-0">
                    <tr>
                      <th className="px-2 py-1.5 text-left w-12">行</th>
                      <th className="px-2 py-1.5 text-left">PR 单号</th>
                      <th className="px-2 py-1.5 text-left w-32">需求日期</th>
                      <th className="px-2 py-1.5 text-left">状态</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.slice(0, 200).map((r) => (
                      <tr key={r.rowNum} className={r.error ? 'bg-red-50/40' : ''}>
                        <td className="px-2 py-1 text-slate-400 tabular-nums">{r.rowNum}</td>
                        <td className="px-2 py-1 font-mono text-slate-700">{r.prBillno || '—'}</td>
                        <td className="px-2 py-1 font-mono text-slate-700">{r.demandDate || '—'}</td>
                        <td className="px-2 py-1">
                          {r.error ? (
                            <span className="text-red-600">{r.error}</span>
                          ) : (
                            <span className="text-emerald-600">OK</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 200 && (
                  <div className="px-2 py-1.5 text-center text-[11px] text-slate-400 bg-slate-50 border-t border-slate-100">
                    仅展示前 200 行，全部 {rows.length} 行将在确认后写入
                  </div>
                )}
              </div>
            </div>
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
            disabled={validRows.length === 0}
            className="px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
          >
            写入 {validRows.length > 0 ? `(${validRows.length})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// CSV 解析（RFC4180 简化版）
// =====================================================================

/**
 * 解析 CSV 文本为字段二维数组。
 * 支持：双引号包裹、引号内逗号、双引号转义("")、CRLF/LF 行尾、UTF-8 BOM。
 */
function parseCsvText(text: string): string[][] {
  // 去 BOM
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const result: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i++;
        }
      } else {
        field += ch;
        i++;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
        i++;
      } else if (ch === ',') {
        row.push(field);
        field = '';
        i++;
      } else if (ch === '\r') {
        // CRLF / CR
        row.push(field);
        result.push(row);
        row = [];
        field = '';
        i++;
        if (text[i] === '\n') i++;
      } else if (ch === '\n') {
        row.push(field);
        result.push(row);
        row = [];
        field = '';
        i++;
      } else {
        field += ch;
        i++;
      }
    }
  }

  // 末行（无尾换行）
  if (field !== '' || row.length > 0) {
    row.push(field);
    result.push(row);
  }

  return result;
}

function parseCsv(text: string): ParsedRow[] {
  const grid = parseCsvText(text);
  if (grid.length === 0) throw new Error('文件为空');
  if (grid.length === 1) throw new Error('文件仅有表头，无数据行');

  const header = grid[0].map((h) => normalizeHeader(h));
  const prIdx = findHeaderIdx(header, HEADER_ALIASES_PR);
  const dateIdx = findHeaderIdx(header, HEADER_ALIASES_DATE);

  if (prIdx < 0) throw new Error(`未找到 PR 单号列（应为 prBillno 或 PR单号）`);
  if (dateIdx < 0) throw new Error(`未找到需求日期列（应为 demandDate 或 需求日期）`);

  const out: ParsedRow[] = [];
  for (let i = 1; i < grid.length; i++) {
    const cols = grid[i];
    // 跳过完全空行
    if (cols.length === 1 && cols[0].trim() === '') continue;

    const rawPr = (cols[prIdx] ?? '').trim();
    const rawDate = (cols[dateIdx] ?? '').trim();
    const rowNum = i + 1; // 1-based 含表头

    if (!rawPr && !rawDate) continue; // 整行空，跳过

    let error: string | null = null;
    let normalizedDate = '';

    if (!rawPr) error = 'PR 单号为空';
    else if (!rawDate) error = '需求日期为空';
    else {
      const norm = normalizeDate(rawDate);
      if (!norm) error = `日期格式非法: ${rawDate}`;
      else normalizedDate = norm;
    }

    out.push({
      rowNum,
      prBillno: rawPr,
      demandDate: normalizedDate,
      error,
    });
  }
  return out;
}

function normalizeHeader(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function findHeaderIdx(headers: string[], aliases: string[]): number {
  const set = new Set(aliases.map((a) => a.toLowerCase().replace(/[\s_-]+/g, '')));
  return headers.findIndex((h) => set.has(h));
}

/** 归一日期为 YYYY-MM-DD；非法返回空串 */
function normalizeDate(raw: string): string {
  // 兼容 YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD
  const m = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!m) return '';
  const y = m[1];
  const mm = m[2].padStart(2, '0');
  const dd = m[3].padStart(2, '0');
  // 简单合法性校验
  const date = new Date(`${y}-${mm}-${dd}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return '';
  if (date.getUTCMonth() + 1 !== Number(mm) || date.getUTCDate() !== Number(dd)) return '';
  return `${y}-${mm}-${dd}`;
}
