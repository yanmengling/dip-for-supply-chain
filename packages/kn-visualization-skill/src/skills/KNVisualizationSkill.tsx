/**
 * 业务知识网络可视化 Skill
 *
 * 供 OpenClaw 或其它宿主嵌入使用。通过 Context_loader 加载知识网络列表，
 * 选择后展示图谱与业务数据。所有 API 与鉴权由宿主通过 config 注入。
 */

import { useState, useEffect, useMemo } from 'react';
import {
  createSkillOntologyClient,
  type SkillOntologyConfig,
  type KnowledgeNetworkListItem,
} from '../services/skillOntologyClient';
import { KnowledgeGraphCanvas } from '../components/config-backend/KnowledgeGraphCanvas';

export interface KNVisualizationSkillConfig extends SkillOntologyConfig {
  /** 宿主注入的知识网络列表；若不提供则尝试请求 listKnowledgeNetworks */
  knowledgeNetworks?: KnowledgeNetworkListItem[];
  /** 默认选中的知识网络 ID（可选） */
  defaultKnId?: string;
}

export interface KNVisualizationSkillProps {
  config: KNVisualizationSkillConfig;
}

export function KNVisualizationSkill({ config }: KNVisualizationSkillProps) {
  const [injectedList] = useState(() => config.knowledgeNetworks ?? []);
  const [fetchedList, setFetchedList] = useState<KnowledgeNetworkListItem[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [selectedKnId, setSelectedKnId] = useState<string>(() => {
    const list = config.knowledgeNetworks ?? [];
    if (list.length === 0) return config.defaultKnId ?? '';
    if (config.defaultKnId && list.some((kn) => kn.id === config.defaultKnId)) return config.defaultKnId;
    return list[0].id;
  });
  const [listError, setListError] = useState<string | null>(null);

  const client = useMemo(
    () =>
      createSkillOntologyClient({
        ontologyManagerBaseUrl: config.ontologyManagerBaseUrl,
        ontologyQueryBaseUrl: config.ontologyQueryBaseUrl,
        getToken: config.getToken,
      }),
    [
      config.ontologyManagerBaseUrl,
      config.ontologyQueryBaseUrl,
      config.getToken,
    ]
  );

  const knowledgeNetworks = useMemo(() => {
    if (injectedList.length > 0) return injectedList;
    return fetchedList;
  }, [injectedList, fetchedList]);

  useEffect(() => {
    if (injectedList.length > 0) {
      if (config.defaultKnId && injectedList.some((kn) => kn.id === config.defaultKnId)) {
        setSelectedKnId(config.defaultKnId);
      } else if (injectedList.length > 0 && !selectedKnId) {
        setSelectedKnId(injectedList[0].id);
      }
      return;
    }
    let cancelled = false;
    setListLoading(true);
    setListError(null);
    client
      .listKnowledgeNetworks()
      .then((list) => {
        if (!cancelled) {
          setFetchedList(list);
          if (config.defaultKnId && list.some((kn) => kn.id === config.defaultKnId)) {
            setSelectedKnId(config.defaultKnId);
          } else if (list.length > 0 && !selectedKnId) {
            setSelectedKnId(list[0].id);
          }
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const statusCode = (err as Error & { statusCode?: number }).statusCode;
          const msg = err instanceof Error ? err.message : '加载知识网络列表失败';
          const isProxyMissing = statusCode === 404 || statusCode === 501;
          setListError(
            isProxyMissing
              ? 'PROXY_MISSING'
              : msg
          );
        }
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [injectedList.length, config.defaultKnId, client]);

  const handleClearConfig = () => {
    try {
      localStorage.removeItem('kn_visualization_skill_config');
      localStorage.removeItem('api_auth_token');
      sessionStorage.removeItem('api_auth_token');
    } catch {
      // ignore
    }
    window.location.reload();
  };

  if (listLoading && knowledgeNetworks.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50">
        <p className="text-sm text-slate-500">正在加载知识网络列表...</p>
      </div>
    );
  }

  if (listError && knowledgeNetworks.length === 0) {
    const isProxyHint = listError === 'PROXY_MISSING';
    return (
      <div className="h-full flex items-center justify-center bg-slate-50 p-6">
        <div className="text-center max-w-md">
          <p className="text-sm font-medium text-red-600 mb-2">
            {isProxyHint ? '检测到未配置 API 代理' : '加载失败'}
          </p>
          {isProxyHint ? (
            <>
              <p className="text-xs text-slate-600 mb-2">
                请参考 DEPLOY-OPENCLAW.md 第二节「配置 API 代理」。
              </p>
              <p className="text-xs text-slate-500 mb-2">需在宿主/网关中配置以下三条路径并指向 DIP（可复制）：</p>
              <pre className="text-left text-xs bg-slate-100 border border-slate-200 rounded p-3 mb-4 overflow-x-auto select-all">
{`/api/ontology-manager
/api/ontology-query
/api/bkn-backend`}
              </pre>
            </>
          ) : (
            <p className="text-xs text-slate-600 mb-4 whitespace-pre-line">{listError}</p>
          )}
          <button
            type="button"
            onClick={handleClearConfig}
            className="text-sm text-indigo-600 hover:text-indigo-800 underline"
          >
            重新配置
          </button>
          <p className="text-xs text-slate-400 mt-1">清除本地配置并返回初始化页面</p>
        </div>
      </div>
    );
  }

  if (knowledgeNetworks.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-50 p-6">
        <div className="text-center max-w-md">
          <p className="text-sm text-slate-500 mb-4">暂无知识网络，请通过配置注入列表或检查服务端。</p>
          <button
            type="button"
            onClick={handleClearConfig}
            className="text-sm text-indigo-600 hover:text-indigo-800 underline"
          >
            重新配置
          </button>
          <p className="text-xs text-slate-400 mt-1">清除本地配置并返回初始化页面</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-200">
        <label className="text-sm font-medium text-slate-700 whitespace-nowrap">知识网络</label>
        <select
          value={selectedKnId}
          onChange={(e) => setSelectedKnId(e.target.value)}
          className="flex-1 min-w-0 max-w-xs px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
        >
          {knowledgeNetworks.map((kn) => (
            <option key={kn.id} value={kn.id}>
              {kn.name ?? kn.id}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={handleClearConfig}
          className="flex-shrink-0 px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
        >
          重新配置
        </button>
      </div>
      <div className="flex-1 min-h-0">
        {selectedKnId ? (
          <KnowledgeGraphCanvas
            knId={selectedKnId}
            client={client}
            title="业务知识网络"
          />
        ) : (
          <div className="h-full flex items-center justify-center bg-slate-50">
            <p className="text-sm text-slate-500">请选择知识网络</p>
          </div>
        )}
      </div>
    </div>
  );
}
