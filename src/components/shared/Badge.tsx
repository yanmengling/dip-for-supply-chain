import React from 'react';

export const Badge = ({ type, children, size = 'md' }: { type: string; children: React.ReactNode; size?: 'sm' | 'md' }) => {
  const styles: Record<string, string> = {
    critical: 'bg-red-100 text-red-700 border-red-200',
    warning: 'bg-amber-100 text-amber-700 border-amber-200',
    success: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    neutral: 'bg-slate-100 text-slate-600 border-slate-200',
    info: 'bg-blue-100 text-blue-700 border-blue-200',
    purple: 'bg-purple-100 text-purple-700 border-purple-200'
  };
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';
  return <span className={`${sizeClass} rounded-full font-bold border ${styles[type] || styles.neutral}`}>{children}</span>;
};





