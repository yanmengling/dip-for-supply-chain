/**
 * 甘特图图例 - Gantt Legend
 *
 * 显示颜色编码和齐套倒排原则说明
 */

const GanttLegend = () => {
  return (
    <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 mt-4">
      <div className="flex items-start justify-between gap-8">
        {/* 状态颜色图例 */}
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-slate-800 mb-3">状态颜色说明</h4>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-green-500 rounded"></div>
              <span className="text-xs text-slate-700">已就绪 (库存充足)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-slate-400 rounded"></div>
              <span className="text-xs text-slate-700">未下PO (待采购)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-500 rounded"></div>
              <span className="text-xs text-slate-700">已下PO/正常</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-orange-500 rounded"></div>
              <span className="text-xs text-slate-700">异常 (交期延误)</span>
            </div>
          </div>
        </div>

        {/* 风险标记图例 */}
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-slate-800 mb-3">风险标记</h4>
          <div className="grid grid-cols-2 gap-x-6 gap-y-2">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-600 rounded-full"></div>
              <span className="text-xs text-slate-700">严重风险 (已延迟)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
              <span className="text-xs text-slate-700">异常告警 (交期变化)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
              <span className="text-xs text-slate-700">提前告示 (PO待下)</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-0.5 h-4 bg-indigo-600"></div>
              <span className="text-xs text-slate-700">今日标记线</span>
            </div>
          </div>
        </div>

        {/* 齐套倒排原则 */}
        <div className="flex-1">
          <h4 className="text-sm font-semibold text-slate-800 mb-3">齐套倒排原则</h4>
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-indigo-600 font-bold">1.</span>
              <span className="text-xs text-slate-700">从产品结束时间向前倒推</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-indigo-600 font-bold">2.</span>
              <span className="text-xs text-slate-700">子级结束 = 父级开始 - 1天</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-indigo-600 font-bold">3.</span>
              <span className="text-xs text-slate-700">确保物料在生产前齐套完成</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GanttLegend;
