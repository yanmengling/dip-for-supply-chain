import React from 'react';
import type { OptimizationSuggestion } from '../../types/ontology';
import { ArrowUpCircle, ArrowDownCircle, Settings, AlertCircle } from 'lucide-react';

interface Props {
  suggestions: OptimizationSuggestion[];
  loading?: boolean;
  onSuggestionClick?: (suggestion: OptimizationSuggestion) => void;
}

export const OptimizationSuggestionsPanel: React.FC<Props> = ({ suggestions, loading = false, onSuggestionClick }) => {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-slate-200 rounded w-48 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-slate-100 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Handle edge cases: missing historical data (show low confidence), conflicting suggestions (show all with priority)
  // Sort suggestions by priority: high first, then medium, then low
  const sortedSuggestions = [...suggestions].sort((a, b) => {
    const priorityOrder = { high: 3, medium: 2, low: 1 };
    return priorityOrder[b.priority] - priorityOrder[a.priority];
  });

  if (sortedSuggestions.length === 0) {
    return (
      <div className="bg-white rounded-xl border shadow-sm p-6 hover:shadow-md transition-shadow">
        <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-100 to-indigo-50 rounded-lg flex items-center justify-center">
            <Settings className="text-indigo-600" size={20} />
          </div>
          优化建议
        </h2>
        <div className="text-center py-12 text-slate-500">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="text-emerald-500" size={32} />
          </div>
          <p className="text-emerald-600 font-medium">当前无优化建议</p>
          <p className="text-sm text-slate-400 mt-1">所有产品库存状态良好</p>
        </div>
      </div>
    );
  }

  const typeIcons = {
    replenish: ArrowUpCircle,
    clearance: ArrowDownCircle,
    safety_stock_adjustment: Settings,
  };

  const typeLabels = {
    replenish: '补货建议',
    clearance: '清库存建议',
    safety_stock_adjustment: '安全库存调整',
  };

  const priorityColors = {
    high: 'bg-red-100 text-red-700 border-red-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    low: 'bg-blue-100 text-blue-700 border-blue-200',
  };

  const priorityLabels = {
    high: '高',
    medium: '中',
    low: '低',
  };

  // Group suggestions by type (using sorted suggestions)
  const groupedSuggestions = sortedSuggestions.reduce((acc, suggestion) => {
    if (!acc[suggestion.suggestionType]) {
      acc[suggestion.suggestionType] = [];
    }
    acc[suggestion.suggestionType].push(suggestion);
    return acc;
  }, {} as Record<OptimizationSuggestion['suggestionType'], OptimizationSuggestion[]>);

  return (
    <div className="bg-white rounded-xl border shadow-sm p-6 hover:shadow-md transition-shadow">
      <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2">
        <div className="w-10 h-10 bg-gradient-to-br from-indigo-100 to-indigo-50 rounded-lg flex items-center justify-center">
          <Settings className="text-indigo-600" size={20} />
        </div>
        优化建议
        <span className="ml-auto text-sm font-normal text-slate-500">({sortedSuggestions.length}条建议)</span>
      </h2>

      <div className="space-y-3">
        {Object.entries(groupedSuggestions).map(([type, typeSuggestions]) => {
          const Icon = typeIcons[type as keyof typeof typeIcons];
          return (
            <div key={type} className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <div className="w-6 h-6 bg-indigo-100 rounded flex items-center justify-center">
                  <Icon className="text-indigo-600" size={14} />
                </div>
                {typeLabels[type as keyof typeof typeLabels]}
                <span className="text-slate-500 font-normal">({typeSuggestions.length})</span>
              </div>
              {typeSuggestions.map(suggestion => (
                <div
                  key={suggestion.suggestionId}
                  className="p-3 bg-gradient-to-br from-slate-50 to-white rounded-lg border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="font-semibold text-slate-800 text-sm">{suggestion.productName}</div>
                        <div className={`text-xs font-medium px-2 py-0.5 rounded border ${priorityColors[suggestion.priority]}`}>
                          {priorityLabels[suggestion.priority]}
                        </div>
                      </div>
                      <div className="text-xs text-slate-600 mb-2">{suggestion.reason}</div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500">当前:</span>
                        <span className="font-semibold text-slate-800">{suggestion.currentValue.toLocaleString()}{suggestion.unit}</span>
                        <span className="text-slate-300">→</span>
                        <span className="text-indigo-600">建议:</span>
                        <span className="font-semibold text-indigo-700">{suggestion.suggestedValue.toLocaleString()}{suggestion.unit}</span>
                        <span className="text-slate-400 ml-2">•</span>
                        <span className="text-slate-500">{suggestion.estimatedImpact}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
};

