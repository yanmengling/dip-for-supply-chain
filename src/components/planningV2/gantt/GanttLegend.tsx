/**
 * 甘特图图例 - 倒排模式颜色说明
 */

const GanttLegend = () => {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 mt-3">
      <div className="flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="w-4 h-3 rounded" style={{ backgroundColor: '#4F46E5' }} />
          <span className="text-xs text-slate-700">按时（无风险）</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-3 rounded" style={{ backgroundColor: '#DC2626' }} />
          <span className="text-xs text-slate-700">风险（需行动）</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-3 rounded" style={{ backgroundColor: '#059669' }} />
          <span className="text-xs text-slate-700">已下单</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-3 rounded" style={{ backgroundColor: '#16A34A' }} />
          <span className="text-xs text-slate-700">就绪（无MRP·有库存）</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-3 rounded" style={{ backgroundColor: '#EAB308' }} />
          <span className="text-xs text-slate-700">异常（无MRP·无库存）</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-red-500 font-bold">⚠缺</span>
          <span className="text-xs text-slate-700">缺口物料</span>
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
