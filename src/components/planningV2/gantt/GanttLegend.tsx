/**
 * 甘特图图例 - 倒排模式颜色说明
 */

const GanttLegend = () => {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mt-3">
      <div className="flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-4 h-3 rounded" style={{ backgroundColor: '#4F46E5' }} />
          <span className="text-xs text-slate-700">按时（有MRP·距开始&gt;3天）</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-3 rounded" style={{ backgroundColor: '#EAB308' }} />
          <span className="text-xs text-slate-700">提醒（有MRP·距开始1-3天）</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-3 rounded" style={{ backgroundColor: '#DC2626' }} />
          <span className="text-xs text-slate-700">异常（有MRP·已过倒排开始时间）</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-3 rounded" style={{ backgroundColor: '#16A34A' }} />
          <span className="text-xs text-slate-700">就绪（无MRP·库存满足）</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-0 h-3 border-l border-dashed border-red-500" />
          <span className="text-xs text-slate-700">今日</span>
        </div>
      </div>
    </div>
  );
};

export default GanttLegend;
