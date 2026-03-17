/**
 * 首次加载时无配置则展示：用户输入服务器地址（如 https://dip.aishu.cn）与 Token → 自动加载知识网络列表 → 用户选择后保存并进入
 * API 路径（/api/ontology-manager/v1、/api/ontology-query/v1）由程序自动拼接，无需用户输入。
 */

import React, { useState } from 'react';
import { createSkillOntologyClient } from './services/skillOntologyClient';
import type { KnowledgeNetworkListItem } from './services/skillOntologyClient';
import { saveStoredConfig, saveStoredToken } from './config';
import { buildAuthUrlAndSaveState, getRedirectUri, tryRegisterOAuth2Client } from './oauth2';

export interface FirstRunConfigFormProps {
  onSaved: () => void;
}

const DEFAULT_SERVER_BASE = 'https://dip.aishu.cn';

/** 由服务器根地址推导出 ontology-manager / ontology-query 的完整 API 地址 */
function toApiUrls(serverBase: string): { manager: string; query: string } {
  const base = serverBase.trim().replace(/\/+$/, '');
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  if (base.includes('://')) {
    return {
      manager: `${base}/api/ontology-manager/v1`,
      query: `${base}/api/ontology-query/v1`,
    };
  }
  const pathPrefix = base ? (base.startsWith('/') ? base : `/${base}`) : '/api';
  const sep = pathPrefix.endsWith('/') ? '' : '/';
  return {
    manager: `${origin}${pathPrefix}${sep}ontology-manager/v1`,
    query: `${origin}${pathPrefix}${sep}ontology-query/v1`,
  };
}

/** 若 URL 与当前页面不同源，改为同源路径，以便由宿主代理并避免 CORS */
function toSameOriginIfCrossOrigin(url: string): string {
  if (typeof window === 'undefined') return url;
  try {
    const u = new URL(url);
    if (u.origin !== window.location.origin) {
      return window.location.origin + u.pathname + u.search;
    }
  } catch {
    // ignore
  }
  return url;
}

export function FirstRunConfigForm({ onSaved }: FirstRunConfigFormProps) {
  const [step, setStep] = useState<'input' | 'select'>('input');
  const [serverBase, setServerBase] = useState(DEFAULT_SERVER_BASE);
  const [token, setToken] = useState('');
  const [list, setList] = useState<KnowledgeNetworkListItem[]>([]);
  const [selectedKnId, setSelectedKnId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  /** 默认 true：仅本次会话有效，不写入 localStorage，关闭页即失效 */
  const [sessionOnlyToken, setSessionOnlyToken] = useState(true);
  /** OAuth2 客户端 ID（宿主可注入 window.__SKILL_CONFIG__.oauth2ClientId） */
  const [oauth2ClientId, setOauth2ClientId] = useState(() => {
    const c = (typeof window !== 'undefined' && (window as unknown as { __SKILL_CONFIG__?: { oauth2ClientId?: string } }).__SKILL_CONFIG__)?.oauth2ClientId;
    return c ?? '';
  });
  const [oauth2Loading, setOauth2Loading] = useState(false);
  /** 自动获取 client_id 失败时显示手动填写框 */
  const [showOauth2ClientIdInput, setShowOauth2ClientIdInput] = useState(false);

  const loadList = async () => {
    setError('');
    if (!serverBase.trim()) {
      setError('请填写服务器地址');
      return;
    }
    if (!token.trim()) {
      setError('请填写 Token');
      return;
    }
    const { manager, query } = toApiUrls(serverBase);
    const managerUrl = toSameOriginIfCrossOrigin(manager);
    const queryUrl = toSameOriginIfCrossOrigin(query);
    setLoading(true);
    try {
      const client = createSkillOntologyClient({
        ontologyManagerBaseUrl: managerUrl,
        ontologyQueryBaseUrl: queryUrl,
        getToken: () => token.trim(),
        businessDomain: 'bd_public',
      });
      const networks = await client.listKnowledgeNetworks();
      setList(networks || []);
      if (networks?.length > 0) {
        setSelectedKnId(networks[0].id);
        setStep('select');
        setError('');
      } else {
        setStep('select');
        setError('');
      }
    } catch (err) {
      const statusCode = (err as Error & { statusCode?: number }).statusCode;
      const msg = err instanceof Error ? err.message : '加载知识网络列表失败';
      setList([]);
      setStep('select');
      if (statusCode === 404 || statusCode === 501) {
        setError('PROXY_MISSING');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFetchList = (e: React.FormEvent) => {
    e.preventDefault();
    loadList();
  };

  const handleOAuth2Login = async () => {
    if (!serverBase.trim()) {
      setError('请先填写服务器地址');
      return;
    }
    setError('');
    let clientId = oauth2ClientId.trim();
    const hostClientId = (typeof window !== 'undefined' && (window as unknown as { __SKILL_CONFIG__?: { oauth2ClientId?: string } }).__SKILL_CONFIG__)?.oauth2ClientId?.trim();
    if (hostClientId) clientId = clientId || hostClientId;
    let clientSecret: string | undefined;
    if (!clientId) {
      setOauth2Loading(true);
      try {
        const registered = await tryRegisterOAuth2Client(serverBase.trim(), getRedirectUri());
        if (registered) {
          clientId = registered.client_id;
          clientSecret = registered.client_secret || undefined;
        }
      } catch {
        // ignore
      }
      setOauth2Loading(false);
    }
    if (!clientId) {
      setShowOauth2ClientIdInput(true);
      setError('');
      return;
    }
    const backendUrl = (typeof window !== 'undefined' && (window as unknown as { __SKILL_CONFIG__?: { oauth2BackendCodeExchangeUrl?: string } }).__SKILL_CONFIG__)?.oauth2BackendCodeExchangeUrl;
    setOauth2Loading(true);
    setError('');
    try {
      const authUrl = await buildAuthUrlAndSaveState({
        serverBase: serverBase.trim(),
        clientId,
        redirectUri: getRedirectUri(),
        scope: 'openid offline all',
        clientSecret,
        backendCodeExchangeUrl: backendUrl,
      });
      window.location.href = authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : '发起登录失败');
      setOauth2Loading(false);
    }
  };

  const handleSaveAndEnter = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!serverBase.trim() || !token.trim()) {
      setError('请先填写服务器地址与 Token');
      return;
    }
    const { manager, query } = toApiUrls(serverBase);
    const knId = selectedKnId.trim();
    // 当从「选择」步骤保存且列表为空时，用户填写的是手动知识网络 ID，需作为注入列表保存以便 502 时仍可使用
    const knowledgeNetworks =
      step === 'select' && list.length === 0 && knId
        ? [{ id: knId } as KnowledgeNetworkListItem]
        : undefined;
    saveStoredConfig({
      ontologyManagerBaseUrl: manager,
      ontologyQueryBaseUrl: query,
      defaultKnId: knId || undefined,
      knowledgeNetworks,
    });
    saveStoredToken(token.trim(), { sessionOnly: sessionOnlyToken });
    onSaved();
  };

  const backToInput = () => {
    setStep('input');
    setError('');
  };

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold text-slate-800 mb-1">
          {step === 'input' ? '首次使用：配置连接' : '选择业务知识网络'}
        </h2>
        <p className="text-sm text-slate-500 mb-4">
          {step === 'input'
            ? '请填写服务器地址与 Token，点击「加载知识网络列表」后选择要使用的网络。'
            : '请选择默认使用的业务知识网络，保存后进入。'}
        </p>

        {step === 'input' && (
          <form onSubmit={handleFetchList} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">服务器地址</label>
              <input
                type="text"
                value={serverBase}
                onChange={(e) => setServerBase(e.target.value)}
                placeholder="https://dip.aishu.cn"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
              />
              <p className="mt-1 text-xs text-slate-400">仅填域名或根地址，如 https://dip.aishu.cn，无需带 /api/… 路径</p>
            </div>
            {showOauth2ClientIdInput && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs text-amber-800 mb-2">自动获取客户端失败（DIP 可能未开放动态注册或接口格式不同）。请向 DIP 管理员索要 OAuth2 客户端 ID 后填写下方，再点击「使用 DIP 账号登录」。</p>
                <label className="block text-sm font-medium text-slate-700 mb-1">OAuth2 客户端 ID</label>
                <input
                  type="text"
                  value={oauth2ClientId}
                  onChange={(e) => setOauth2ClientId(e.target.value)}
                  placeholder="向 DIP 或部署方获取后填写"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 bg-white"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Token（鉴权）</label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Bearer token 或 api_auth_token"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
              />
              <label className="mt-2 flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sessionOnlyToken}
                  onChange={(e) => setSessionOnlyToken(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs text-slate-600">
                  仅本次会话有效，不记住 Token（关闭页面后需重新填写；公用设备请勾选）。取消勾选则写入本地存储，仅建议在受信设备使用。
                </span>
              </label>
            </div>
            {error && (
              error === 'PROXY_MISSING' ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-left">
                  <p className="text-sm font-medium text-amber-800 mb-1">检测到未配置 API 代理</p>
                  <p className="text-xs text-amber-700 mb-2">请参考 DEPLOY-OPENCLAW.md 第二节「配置 API 代理」。</p>
                  <p className="text-xs text-slate-600 mb-1">需在宿主/网关中配置以下三条路径并指向 DIP（可复制）：</p>
                  <pre className="text-xs bg-white border border-slate-200 rounded p-2 overflow-x-auto select-all">
{`/api/ontology-manager
/api/ontology-query
/api/bkn-backend`}
                  </pre>
                </div>
              ) : (
                <p className="text-sm text-red-600">{error}</p>
              )
            )}
            <div className="flex flex-col gap-2">
              <button
                type="submit"
                disabled={loading}
                className="w-full py-2 px-4 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {loading ? '正在加载列表…' : '加载知识网络列表'}
              </button>
              <button
                type="button"
                disabled={oauth2Loading}
                onClick={handleOAuth2Login}
                className="w-full py-2 px-4 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50"
              >
                {oauth2Loading ? '正在跳转…' : '使用 DIP 账号登录'}
              </button>
              <p className="text-xs text-slate-500">与 kweaver-caller 一致：填写服务器地址后点击，将自动尝试获取客户端并跳转 DIP；在打开的网页输入用户名和密码授权即可，授权后会自动跳回本页</p>
              {!showOauth2ClientIdInput && (
                <button
                  type="button"
                  onClick={() => setShowOauth2ClientIdInput(true)}
                  className="text-xs text-slate-500 underline hover:text-slate-700"
                >
                  已有 OAuth2 客户端 ID？点击填写
                </button>
              )}
            </div>
          </form>
        )}

        {step === 'select' && (
          <form onSubmit={handleSaveAndEnter} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">选择知识网络</label>
              {list.length > 0 ? (
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
              ) : (
                <>
                  <p className="text-sm text-slate-600 mb-2">
                    未能从服务端获取知识网络列表。请检查服务器地址、Token 及网络；若后端要求业务域，请确认服务端已配置。您也可以直接输入知识网络 ID 后保存进入。
                  </p>
                  <input
                    type="text"
                    value={selectedKnId}
                    onChange={(e) => setSelectedKnId(e.target.value)}
                    placeholder="请输入知识网络 ID，如 supplychain_hd0202"
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
                  />
                  <button
                    type="button"
                    onClick={() => loadList()}
                    disabled={loading}
                    className="mt-2 w-full py-2 px-4 border border-slate-300 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50 disabled:opacity-50"
                  >
                    {loading ? '正在加载列表…' : '重新加载列表'}
                  </button>
                </>
              )}
            </div>
            {error && <p className="text-sm text-amber-600">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={backToInput}
                className="flex-1 py-2 px-4 border border-slate-200 text-slate-700 text-sm font-medium rounded-lg hover:bg-slate-50"
              >
                上一步
              </button>
              <button
                type="submit"
                className="flex-1 py-2 px-4 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700"
              >
                保存并进入
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
