import React from 'react';
import type { ProductLifecycleAssessment } from '../../types/ontology';
import { Archive, GitPullRequest, TrendingUp, Zap, BarChart3 } from 'lucide-react';

interface Props {
  assessments: ProductLifecycleAssessment[];
  loading?: boolean;
}

const LifecycleBadge = ({ stage }: { stage: ProductLifecycleAssessment['stage'] }) => {
  const colors = {
    'Intro': 'bg-blue-100 text-blue-700 border-blue-200',
    'Growth': 'bg-emerald-100 text-emerald-700 border-emerald-200',
    'Maturity': 'bg-indigo-100 text-indigo-700 border-indigo-200',
    'Decline': 'bg-slate-100 text-slate-600 border-slate-200',
  };
  const labels = {
    'Intro': '导入期',
    'Growth': '成长期',
    'Maturity': '成熟期',
    'Decline': '衰退期',
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-bold border ${colors[stage]}`}>
      {labels[stage]}
    </span>
  );
};

const AssessmentCard = ({ product }: { product: ProductLifecycleAssessment }) => (
  <div className="bg-white border border-slate-200 rounded-xl p-5 hover:shadow-md transition-all">
    <div className="flex justify-between items-start mb-4">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="font-bold text-lg text-slate-800">{product.productName}</span>
          <LifecycleBadge stage={product.stage} />
        </div>
        <div className="text-xs text-slate-400">{product.productId}</div>
      </div>
      <div className="text-right">
        <div className="text-xs text-slate-400">投资回报率 (ROI)</div>
        <div className={`text-xl font-extrabold ${parseFloat(product.roi) < 5 ? 'text-red-500' : 'text-emerald-600'}`}>
          {product.roi}
        </div>
      </div>
    </div>

    <div className="grid grid-cols-2 gap-4 mb-4 text-sm">
      <div className="bg-slate-50 p-2 rounded">
        <div className="text-xs text-slate-400">年营收</div>
        <div className="font-bold text-slate-700">{product.revenue}</div>
      </div>
      <div className="bg-slate-50 p-2 rounded">
        <div className="text-xs text-slate-400">库存水位</div>
        <div className={`font-bold ${product.stock.includes('High') ? 'text-amber-600' : 'text-slate-700'}`}>
          {product.stock}
        </div>
      </div>
    </div>

    <div className="bg-indigo-50/50 border border-indigo-100 rounded-lg p-3 mb-4">
      <div className="flex gap-2 items-start">
        <Zap size={14} className="text-indigo-600 mt-0.5 shrink-0"/>
        <div className="text-xs text-indigo-800 leading-relaxed">{product.suggestion}</div>
      </div>
    </div>

    <div className="flex gap-2">
      {product.actionType === 'discontinue' && (
        <button className="flex-1 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm font-bold hover:bg-red-100 flex items-center justify-center gap-2">
          <Archive size={16}/> 下线 (EOL)
        </button>
      )}
      {product.actionType === 'upgrade' && (
        <button className="flex-1 py-2 bg-indigo-50 text-indigo-600 border border-indigo-200 rounded-lg text-sm font-bold hover:bg-indigo-100 flex items-center justify-center gap-2">
          <GitPullRequest size={16}/> 版本升级
        </button>
      )}
      {product.actionType === 'promote' && (
        <button className="flex-1 py-2 bg-emerald-50 text-emerald-600 border border-emerald-200 rounded-lg text-sm font-bold hover:bg-emerald-100 flex items-center justify-center gap-2">
          <TrendingUp size={16}/> 促销推广
        </button>
      )}
    </div>
  </div>
);

export const ProductLifecycleAssessmentPanel: React.FC<Props> = ({ assessments, loading = false }) => {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-slate-200 rounded w-48 mb-4"></div>
          <div className="grid grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-64 bg-slate-100 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (assessments.length === 0) {
    return (
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center gap-2">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-100 to-indigo-50 rounded-lg flex items-center justify-center">
            <BarChart3 className="text-indigo-600" size={20} />
          </div>
          产品评估智能体 (Lifecycle & ROI)
        </h2>
        <div className="text-center py-8 text-slate-500">
          <BarChart3 className="mx-auto mb-2 text-slate-400" size={48} />
          <p>暂无产品评估数据</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm p-6">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 bg-indigo-100 text-indigo-600 rounded-lg">
          <BarChart3 size={20}/>
        </div>
        <h2 className="text-lg font-bold text-slate-800">产品评估智能体 (Lifecycle & ROI)</h2>
      </div>
      <div className="grid grid-cols-3 gap-6">
        {assessments.map(product => (
          <AssessmentCard key={product.productId} product={product} />
        ))}
      </div>
    </div>
  );
};





