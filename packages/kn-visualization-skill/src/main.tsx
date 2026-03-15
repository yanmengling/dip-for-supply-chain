/**
 * 业务知识网络可视化 Skill 独立入口
 * 配置优先级：默认值 → localStorage → window.__SKILL_CONFIG__ → URL 参数；首次无配置时展示配置表单
 * OAuth2 回调：若 URL 带 code 与 state，先完成换 token 再渲染主界面
 */

import './index.css';
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { KNVisualizationSkill } from './skills';
import type { KNVisualizationSkillConfig } from './skills';
import {
  buildInitialConfig,
  needFirstRunConfig,
  getStoredConfig,
  saveStoredConfig,
  saveStoredToken,
} from './config';
import { FirstRunConfigForm } from './FirstRunConfigForm';
import {
  consumeOAuth2State,
  exchangeCodeForToken,
  sendCodeToBackend,
  getRedirectUri,
} from './oauth2';
import { createSkillOntologyClient } from './services/skillOntologyClient';
import type { KnowledgeNetworkListItem } from './services/skillOntologyClient';
import { getStoredToken } from './config';

declare global {
  interface Window {
    __SKILL_CONFIG__?: KNVisualizationSkillConfig;
  }
}

/** OAuth2 回调：解析 code/state，换 token 或交给后端，然后跳转干净 URL */
function useOAuthCallback(): { done: boolean; error: string | null } {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const state = params.get('state');
    if (!code || !state) {
      setDone(true);
      return;
    }

    const run = async () => {
      const saved = consumeOAuth2State(state);
      if (!saved) {
        setError('state 无效或已过期，请重新发起登录');
        setDone(true);
        return;
      }

      try {
        if (saved.backendCodeExchangeUrl) {
          await sendCodeToBackend({
            backendCodeExchangeUrl: saved.backendCodeExchangeUrl,
            code,
            state,
            redirectUri: saved.redirectUri,
          });
          saveStoredConfig({
            ontologyManagerBaseUrl: `${saved.serverBase}/api/ontology-manager/v1`,
            ontologyQueryBaseUrl: `${saved.serverBase}/api/ontology-query/v1`,
          });
        } else {
          const tokenResult = await exchangeCodeForToken({
            serverBase: saved.serverBase,
            code,
            codeVerifier: saved.codeVerifier,
            redirectUri: saved.redirectUri,
            clientId: saved.clientId,
            clientSecret: saved.clientSecret ?? undefined,
          });
          saveStoredConfig({
            ontologyManagerBaseUrl: `${saved.serverBase}/api/ontology-manager/v1`,
            ontologyQueryBaseUrl: `${saved.serverBase}/api/ontology-query/v1`,
          });
          saveStoredToken(tokenResult.access_token, { sessionOnly: true });
        }
        // 授权成功后进入「选择知识网络」步骤，加载列表供用户选择后再进入浏览
        window.location.replace(getRedirectUri() + '?step=select_kn');
        return;
      } catch (err) {
        setError(err instanceof Error ? err.message : '登录失败');
        setDone(true);
      }
    };

    run();
  }, []);

  return { done, error };
}

function OAuthCallbackView() {
  const { done, error } = useOAuthCallback();
  if (!done) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <p className="text-sm text-slate-600">正在完成登录…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg border border-slate-200 p-6 max-w-md text-center">
          <p className="text-sm text-red-600 mb-2">{error}</p>
          <a href={getRedirectUri()} className="text-sm text-indigo-600 hover:underline">
            返回配置页
          </a>
        </div>
      </div>
    );
  }
  return null;
}

/** 授权后选择知识网络：用已存配置拉取列表，用户选择后保存 defaultKnId 并进入浏览 */
function SelectKnAfterAuthView() {
  const [list, setList] = useState<KnowledgeNetworkListItem[]>([]);
  const [selectedKnId, setSelectedKnId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [manualKnId, setManualKnId] = useState('');
  const fetchedRef = useRef(false);
  /** 用 ref 判断是否允许更新 UI，避免 Strict Mode 下 cleanup 把 cancelled 置 true 导致永不 setState */
  const allowUpdateRef = useRef(true);

  useEffect(() => {
    allowUpdateRef.current = true;
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    const token = getStoredToken();
    if (!token?.trim()) {
      setError('未检测到登录信息，请返回配置页重新登录后再选择知识网络。');
      setLoading(false);
      return;
    }
    const config = buildInitialConfig(undefined);
    const client = createSkillOntologyClient({
      ontologyManagerBaseUrl: config.ontologyManagerBaseUrl,
      ontologyQueryBaseUrl: config.ontologyQueryBaseUrl,
      getToken: () => Promise.resolve(getStoredToken()),
      businessDomain: 'bd_public',
    });
    client
      .listKnowledgeNetworks()
      .then((items) => {
        if (allowUpdateRef.current) {
          setList(items);
          if (items.length > 0) setSelectedKnId(items[0].id);
        }
      })
      .catch((err) => {
        if (allowUpdateRef.current) {
          const statusCode = (err as Error & { statusCode?: number }).statusCode;
          if (statusCode === 401 || statusCode === 403) {
            setError('认证失败（401）：当前 Token 无法访问知识网络列表。可能原因：Token 已过期、权限不足、或该 Token 仅用于 OAuth 授权而非 API 访问。请返回配置页重新登录。');
          } else if (statusCode === 502) {
            setError('服务端返回 502（网关异常）。若已知知识网络 ID，可在下方输入后进入；或返回配置页重试。');
          } else {
            setError(err instanceof Error ? err.message : '加载知识网络列表失败');
          }
        }
      })
      .finally(() => {
        if (allowUpdateRef.current) setLoading(false);
      });
    return () => {
      allowUpdateRef.current = false;
    };
  }, []);

  const handleEnter = (knId?: string) => {
    const stored = getStoredConfig();
    const id = knId ?? selectedKnId;
    if (stored && id?.trim()) {
      saveStoredConfig({
        ...stored,
        defaultKnId: id.trim(),
        knowledgeNetworks: list.length > 0 ? undefined : [{ id: id.trim() }],
      });
    }
    window.location.replace(getRedirectUri());
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <p className="text-sm text-slate-600">正在加载知识网络列表…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg border border-slate-200 p-6 max-w-md">
          <p className="text-sm text-red-600 mb-4">{error}</p>
          <div className="space-y-3">
            <p className="text-xs text-slate-500">若已知知识网络 ID，可输入后直接进入浏览：</p>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualKnId}
                onChange={(e) => setManualKnId(e.target.value)}
                placeholder="如 supplychain_hd0202"
                className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
              />
              <button
                type="button"
                onClick={() => handleEnter(manualKnId.trim())}
                disabled={!manualKnId.trim()}
                className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none"
              >
                使用该 ID 进入
              </button>
            </div>
            <a href={getRedirectUri()} className="inline-block text-sm text-indigo-600 hover:underline">
              返回配置页
            </a>
          </div>
        </div>
      </div>
    );
  }
  if (list.length === 0) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg border border-slate-200 p-6 max-w-md text-center">
          <p className="text-sm text-slate-500 mb-4">暂无知识网络，请检查服务端或联系管理员。</p>
          <a href={getRedirectUri()} className="text-sm text-indigo-600 hover:underline">
            返回配置页
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-slate-800 mb-1">选择业务知识网络</h2>
        <p className="text-sm text-slate-500 mb-4">请选择要使用的知识网络，然后进入浏览。</p>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">知识网络</label>
            <select
              value={selectedKnId}
              onChange={(e) => setSelectedKnId(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 bg-white"
            >
              {list.map((kn) => (
                <option key={kn.id} value={kn.id}>
                  {kn.name ?? kn.id}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => handleEnter()}
            className="w-full py-2 px-4 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
          >
            进入知识网络浏览
          </button>
        </div>
      </div>
    </div>
  );
}

const hostConfig = typeof window !== 'undefined' ? window.__SKILL_CONFIG__ : undefined;
const hasHostConfig = Boolean(
  hostConfig?.ontologyManagerBaseUrl || hostConfig?.getToken
);
const hasStoredConfig = Boolean(getStoredConfig());

const params = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
const hasOAuthCallback = Boolean(params.get('code') && params.get('state'));
const stepSelectKn = params.get('step') === 'select_kn';

const config: KNVisualizationSkillConfig = buildInitialConfig(hostConfig);
const showFirstRunForm = needFirstRunConfig(config, hasHostConfig, hasStoredConfig);

const rootEl = document.getElementById('skill-root');
if (rootEl) {
  if (hasOAuthCallback) {
    createRoot(rootEl).render(
      <React.StrictMode>
        <OAuthCallbackView />
      </React.StrictMode>
    );
  } else if (stepSelectKn) {
    createRoot(rootEl).render(
      <React.StrictMode>
        <SelectKnAfterAuthView />
      </React.StrictMode>
    );
  } else {
    createRoot(rootEl).render(
      <React.StrictMode>
        {showFirstRunForm ? (
          <FirstRunConfigForm onSaved={() => window.location.reload()} />
        ) : (
          <div className="h-screen w-screen flex flex-col bg-slate-50">
            <KNVisualizationSkill config={config} />
          </div>
        )}
      </React.StrictMode>
    );
  }
}
