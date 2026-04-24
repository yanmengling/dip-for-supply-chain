import React from 'react';
import type { SupplyRiskAlert } from '../../types/ontology';
import { AlertTriangle, ShieldAlert, AlertCircle, AlertOctagon } from 'lucide-react';

interface Props {
  alerts: SupplyRiskAlert[];
  loading?: boolean;
}

export const RiskAlertsPanel: React.FC<Props> = ({ alerts, loading = false }) => {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-slate-200 rounded w-48 mb-4"></div>
          <div className="space-y-3">
            {[1, 2].map(i => (
              <div key={i} className="h-16 bg-slate-100 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (alerts.length === 0) {
    return (
      <div className="bg-white rounded-xl border shadow-sm p-6 hover:shadow-md transition-shadow">
        <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-100 to-indigo-50 rounded-lg flex items-center justify-center">
            <ShieldAlert className="text-indigo-600" size={20} />
          </div>
          风险预警
        </h2>
        <div className="text-center py-12 text-slate-500">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <AlertCircle className="text-emerald-500" size={32} />
          </div>
          <p className="text-emerald-600 font-medium">当前无风险预警</p>
          <p className="text-sm text-slate-400 mt-1">所有产品供应状态正常</p>
        </div>
      </div>
    );
  }

  const severityColors = {
    low: 'bg-blue-100 text-blue-700 border-blue-200',
    medium: 'bg-amber-100 text-amber-700 border-amber-200',
    high: 'bg-red-100 text-red-700 border-red-200',
    critical: 'bg-red-200 text-red-800 border-red-300',
  };

  const severityLabels = {
    low: '低',
    medium: '中',
    high: '高',
    critical: '严重',
  };

  const typeLabels = {
    inventory: '库存风险',
    supplier: '供应商风险',
    forecast: '预测风险',
    quality: '质量风险',
  };

  // Separate risks by direction (upstream/downstream)
  const upstreamRisks = alerts.filter(alert => alert.riskDirection === 'upstream');
  const downstreamRisks = alerts.filter(alert => alert.riskDirection === 'downstream');
  const otherRisks = alerts.filter(alert => !alert.riskDirection);

  // Group alerts by severity
  const groupedAlerts = alerts.reduce((acc, alert) => {
    if (!acc[alert.severity]) {
      acc[alert.severity] = [];
    }
    acc[alert.severity].push(alert);
    return acc;
  }, {} as Record<SupplyRiskAlert['severity'], SupplyRiskAlert[]>);

  const severityOrder: SupplyRiskAlert['severity'][] = ['critical', 'high', 'medium', 'low'];

  const RiskCard = ({ risk }: { risk: SupplyRiskAlert }) => (
    <div className="bg-white border border-slate-200 rounded-xl p-4 flex gap-4 items-center hover:shadow-sm transition-shadow">
      <div className={`p-3 rounded-lg shrink-0 ${risk.severity === 'high' || risk.severity === 'critical' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-600'}`}>
        <AlertOctagon size={24} />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          {risk.riskDirection && (
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 border border-slate-200 px-1 rounded">
              {risk.riskDirection === 'upstream' ? '上游供应' : '下游市场'}
            </span>
          )}
          <h4 className="font-bold text-slate-800 text-sm">{risk.title}</h4>
        </div>
        {risk.impactProduct && (
          <div className="text-xs text-slate-600 mb-2">
            影响产品: <span className="font-bold">{risk.impactProduct}</span>
          </div>
        )}
        <div className="text-xs text-slate-500 bg-slate-50 p-2 rounded border border-slate-100 mb-2">
          {risk.impactDesc || risk.description}
        </div>
      </div>
      {risk.action && (
        <button className="px-3 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 transition-colors whitespace-nowrap">
          {risk.action}
        </button>
      )}
    </div>
  );

  return (
    <div className="bg-white rounded-xl border shadow-sm p-6 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 bg-amber-100 text-amber-600 rounded-lg">
          <ShieldAlert size={20}/>
        </div>
        <h2 className="text-lg font-bold text-slate-800">产品供应风险智能体</h2>
      </div>

      {upstreamRisks.length > 0 && (
        <div className="mb-6">
          <div className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 bg-red-500 rounded-full"></span>
            上游供应风险 ({upstreamRisks.length}条)
          </div>
          <div className="grid grid-cols-2 gap-6">
            {upstreamRisks.map(risk => (
              <RiskCard key={risk.alertId} risk={risk} />
            ))}
          </div>
        </div>
      )}

      {downstreamRisks.length > 0 && (
        <div className="mb-6">
          <div className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 bg-amber-500 rounded-full"></span>
            下游市场风险 ({downstreamRisks.length}条)
          </div>
          <div className="grid grid-cols-2 gap-6">
            {downstreamRisks.map(risk => (
              <RiskCard key={risk.alertId} risk={risk} />
            ))}
          </div>
        </div>
      )}

      {otherRisks.length > 0 && (
        <div>
          <div className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 bg-slate-400 rounded-full"></span>
            其他风险 ({otherRisks.length}条)
          </div>
          <div className="space-y-3">
            {otherRisks.map(alert => (
              <div
                key={alert.alertId}
                className={`p-4 rounded-xl border-2 transition-all hover:shadow-md ${
                  alert.severity === 'critical'
                    ? 'bg-gradient-to-br from-red-50 to-red-100/30 border-red-300'
                    : alert.severity === 'high'
                    ? 'bg-gradient-to-br from-red-50 to-red-100/20 border-red-200'
                    : alert.severity === 'medium'
                    ? 'bg-gradient-to-br from-amber-50 to-amber-100/20 border-amber-200'
                    : 'bg-gradient-to-br from-blue-50 to-blue-100/20 border-blue-200'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="font-bold text-slate-800 mb-1">{alert.title}</div>
                    <div className="text-sm text-slate-600">{alert.description}</div>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="px-2 py-0.5 bg-slate-100 rounded text-xs text-slate-600">{alert.productName}</span>
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded text-xs border border-indigo-200">
                        {typeLabels[alert.riskType]}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {alerts.length === 0 && (
        <div className="text-center py-12 text-slate-500">
          <AlertCircle className="mx-auto mb-2 text-emerald-400" size={48} />
          <p className="text-emerald-600 font-medium">当前无风险预警</p>
        </div>
      )}
    </div>
  );
};

