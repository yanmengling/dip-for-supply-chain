/**
 * 采购工作台 - 6 大模块统一外壳（v0.4.0 简化版）
 *
 * 在 TaskDetailView 的全宽 Tab 内展示，header 无 icon，轻量工具栏风格。
 * 风格对齐：#f4f7fb 背景，白色面板，#2f6bff 主色。
 */

import type { ReactNode } from 'react';

interface ModuleCardProps {
  title: string;
  subtitle?: string;
  badge?: string;
  badgeTone?: 'gray' | 'blue' | 'orange' | 'red' | 'green';
  actions?: ReactNode;
  children: ReactNode;
  /** 去掉内边距，用于表格铺满 */
  noPadding?: boolean;
}

const TONE_CLS: Record<NonNullable<ModuleCardProps['badgeTone']>, string> = {
  gray:   'bg-slate-100 text-[#6c7a90]',
  blue:   'bg-[#eef4ff] text-[#2f6bff]',
  orange: 'bg-[#fff6eb] text-[#ff9f43]',
  red:    'bg-[#fff2f1] text-[#f25f5c]',
  green:  'bg-[#ebfff2] text-[#2fb36d]',
};

export default function ModuleCard({
  title,
  subtitle,
  badge,
  badgeTone = 'gray',
  actions,
  children,
  noPadding = false,
}: ModuleCardProps) {
  return (
    <section className="bg-white rounded-2xl border border-[#e5ebf3] shadow-[0_8px_24px_rgba(26,48,92,0.07)] flex flex-col overflow-hidden">
      {/* 轻量工具栏 */}
      <header className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-[#e5ebf3] flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-bold text-[#1f2d3d] truncate">{title}</span>
          {badge && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold leading-none ${TONE_CLS[badgeTone]}`}>
              {badge}
            </span>
          )}
          {subtitle && (
            <span className="text-xs text-[#6c7a90] truncate">{subtitle}</span>
          )}
        </div>
        {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
      </header>

      <div className={noPadding ? 'flex-1' : 'px-5 py-4 flex-1'}>
        {children}
      </div>
    </section>
  );
}

/** 占位提示行（用于"数据待补充"或未启用功能） */
export function ModulePlaceholder({ text }: { text: string }) {
  return (
    <div className="flex items-center justify-center min-h-[120px] text-xs text-[#6c7a90] bg-[#f4f7fb] rounded-xl border border-dashed border-[#e5ebf3] px-4 py-6 text-center leading-relaxed">
      {text}
    </div>
  );
}

/** 操作按钮占位（点击后弹 alert，符合 PRD "全部以占位提示呈现"） */
export function PlaceholderActionButton({ label }: { label: string }) {
  return (
    <button
      onClick={() => alert(`「${label}」功能待开发`)}
      className="px-2.5 py-1 text-xs font-medium text-[#6c7a90] bg-white border border-[#e5ebf3] rounded-lg hover:bg-[#f4f7fb] hover:text-[#2f6bff] transition-colors"
    >
      {label}
    </button>
  );
}
