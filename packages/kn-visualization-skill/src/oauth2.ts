/**
 * OAuth2 授权码 + PKCE 流程（方案二），参考 kweaver-caller 的 OAuth2 端点约定。
 * 用于「使用 DIP 账号登录」：跳转 DIP 授权 → 回调带 code → 用 code + code_verifier 换 token。
 */

const OAUTH2_STATE_KEY = 'kn_skill_oauth2_state';
const OAUTH2_VERIFIER_KEY = 'kn_skill_oauth2_code_verifier';
const OAUTH2_SERVER_BASE_KEY = 'kn_skill_oauth2_server_base';
const OAUTH2_REDIRECT_URI_KEY = 'kn_skill_oauth2_redirect_uri';
const OAUTH2_CLIENT_ID_KEY = 'kn_skill_oauth2_client_id';
const OAUTH2_CLIENT_SECRET_KEY = 'kn_skill_oauth2_client_secret';
const OAUTH2_BACKEND_EXCHANGE_KEY = 'kn_skill_oauth2_backend_exchange';

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  const random = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(random);
    for (let i = 0; i < length; i++) result += chars[random[i] % chars.length];
  } else {
    for (let i = 0; i < length; i++) result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/** 生成 PKCE code_verifier（43–128 字符）与 code_challenge（base64url(SHA256(verifier))） */
export async function generatePKCE(): Promise<{ codeVerifier: string; codeChallenge: string }> {
  const codeVerifier = randomString(64);
  let codeChallenge: string;
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const encoder = new TextEncoder();
    const data = encoder.encode(codeVerifier);
    const hash = await crypto.subtle.digest('SHA-256', data);
    codeChallenge = base64UrlEncode(hash);
  } else {
    codeChallenge = codeVerifier;
  }
  return { codeVerifier, codeChallenge };
}

/** 构建授权页 URL（带 state、PKCE），并将会话数据写入 sessionStorage；若提供 clientSecret 会一并保存供回调换 token 时做 Basic 认证 */
export function buildAuthUrlAndSaveState(params: {
  serverBase: string;
  clientId: string;
  redirectUri: string;
  scope?: string;
  clientSecret?: string;
  backendCodeExchangeUrl?: string;
}): Promise<string> {
  const base = params.serverBase.replace(/\/+$/, '');
  const authUrl = `${base}/oauth2/auth`;
  const state = randomString(24);
  return generatePKCE().then(({ codeVerifier, codeChallenge }) => {
    try {
      sessionStorage.setItem(OAUTH2_STATE_KEY, state);
      sessionStorage.setItem(OAUTH2_VERIFIER_KEY, codeVerifier);
      sessionStorage.setItem(OAUTH2_SERVER_BASE_KEY, base);
      sessionStorage.setItem(OAUTH2_REDIRECT_URI_KEY, params.redirectUri);
      sessionStorage.setItem(OAUTH2_CLIENT_ID_KEY, params.clientId);
      if (params.clientSecret) {
        sessionStorage.setItem(OAUTH2_CLIENT_SECRET_KEY, params.clientSecret);
      } else {
        sessionStorage.removeItem(OAUTH2_CLIENT_SECRET_KEY);
      }
      if (params.backendCodeExchangeUrl) {
        sessionStorage.setItem(OAUTH2_BACKEND_EXCHANGE_KEY, params.backendCodeExchangeUrl);
      } else {
        sessionStorage.removeItem(OAUTH2_BACKEND_EXCHANGE_KEY);
      }
    } catch {
      // ignore
    }
    const q = new URLSearchParams({
      client_id: params.clientId,
      redirect_uri: params.redirectUri,
      response_type: 'code',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    if (params.scope) q.set('scope', params.scope);
    return `${authUrl}?${q.toString()}`;
  });
}

/** 从 sessionStorage 读取并清除 OAuth2 状态，校验 state；若有保存的 clientSecret 会一并返回供换 token 时 Basic 认证 */
export function consumeOAuth2State(stateFromCallback: string): {
  codeVerifier: string;
  serverBase: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string | null;
  backendCodeExchangeUrl: string | null;
} | null {
  try {
    const state = sessionStorage.getItem(OAUTH2_STATE_KEY);
    const codeVerifier = sessionStorage.getItem(OAUTH2_VERIFIER_KEY);
    const serverBase = sessionStorage.getItem(OAUTH2_SERVER_BASE_KEY);
    const redirectUri = sessionStorage.getItem(OAUTH2_REDIRECT_URI_KEY);
    const clientId = sessionStorage.getItem(OAUTH2_CLIENT_ID_KEY);
    const clientSecret = sessionStorage.getItem(OAUTH2_CLIENT_SECRET_KEY);
    const backendCodeExchangeUrl = sessionStorage.getItem(OAUTH2_BACKEND_EXCHANGE_KEY);
    sessionStorage.removeItem(OAUTH2_STATE_KEY);
    sessionStorage.removeItem(OAUTH2_VERIFIER_KEY);
    sessionStorage.removeItem(OAUTH2_SERVER_BASE_KEY);
    sessionStorage.removeItem(OAUTH2_REDIRECT_URI_KEY);
    sessionStorage.removeItem(OAUTH2_CLIENT_ID_KEY);
    sessionStorage.removeItem(OAUTH2_CLIENT_SECRET_KEY);
    sessionStorage.removeItem(OAUTH2_BACKEND_EXCHANGE_KEY);
    if (!state || state !== stateFromCallback || !codeVerifier || !serverBase || !redirectUri || !clientId) return null;
    return {
      codeVerifier,
      serverBase,
      redirectUri,
      clientId,
      clientSecret: clientSecret || null,
      backendCodeExchangeUrl: backendCodeExchangeUrl || null,
    };
  } catch {
    return null;
  }
}

/** 使用 code + code_verifier 向 DIP /oauth2/token 换取 access_token（PKCE）；若提供 clientSecret 则用 Basic 认证（与 kweaver-caller 一致） */
export async function exchangeCodeForToken(params: {
  serverBase: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  clientSecret?: string;
}): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const base = params.serverBase.replace(/\/+$/, '');
  const isDev = typeof import.meta !== 'undefined' && (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;
  const tokenUrl =
    isDev && typeof window !== 'undefined' && base.includes('dip.aishu.cn')
      ? `${window.location.origin}/oauth2/token`
      : `${base}/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: params.code,
    code_verifier: params.codeVerifier,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
  });
  const headers: Record<string, string> = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (params.clientSecret) {
    headers['Authorization'] = 'Basic ' + btoa(params.clientId + ':' + params.clientSecret);
  }
  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers,
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token 交换失败: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token?: string; refresh_token?: string; expires_in?: number };
  if (!data.access_token) throw new Error('响应中无 access_token');
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_in: data.expires_in,
  };
}

/** 当前页作为 OAuth2 redirect_uri 的完整 URL（无 query/hash） */
export function getRedirectUri(): string {
  if (typeof window === 'undefined') return '';
  const origin = window.location.origin;
  const path = window.location.pathname || '/';
  return `${origin}${path}`.replace(/#.*$/, '').replace(/\?.*$/, '');
}

const isOAuth2Dev = typeof import.meta !== 'undefined' && (import.meta as { env?: { DEV?: boolean } }).env?.DEV === true;

/** 与 kweaver-caller 一致：由 redirectUri 推导 logout 回调（同源同路径 + /logout） */
function getLogoutRedirectUri(redirectUri: string): string {
  try {
    const u = new URL(redirectUri);
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    u.pathname = u.pathname + (u.pathname.endsWith('/') ? '' : '/') + 'logout';
    u.search = '';
    u.hash = '';
    return u.toString();
  } catch {
    return redirectUri;
  }
}

/**
 * 尝试通过 DIP /oauth2/clients 动态注册客户端，请求体与 [kweaver-caller](https://github.com/sh00tg0a1/kweaver-caller/blob/main/src/auth/oauth.ts) registerClient 一致。
 * 成功返回 { client_id, client_secret }，失败返回 null（此时会展示手动填写 OAuth2 客户端 ID）。client_secret 用于换 token 时 Basic 认证。
 */
export async function tryRegisterOAuth2Client(
  serverBase: string,
  redirectUri: string
): Promise<{ client_id: string; client_secret: string } | null> {
  const base = serverBase.replace(/\/+$/, '');
  const url = `${base}/oauth2/clients`;
  const finalUrl =
    isOAuth2Dev && typeof window !== 'undefined' && base.includes('dip.aishu.cn')
      ? `${window.location.origin}/oauth2/clients`
      : url;

  const payload = {
    client_name: 'kn-visualization-skill',
    grant_types: ['authorization_code', 'implicit', 'refresh_token'],
    response_types: ['token id_token', 'code', 'token'],
    scope: 'openid offline all',
    redirect_uris: [redirectUri],
    post_logout_redirect_uris: [getLogoutRedirectUri(redirectUri)],
    metadata: {
      device: {
        name: 'kn-visualization-skill',
        client_type: 'web',
        description: 'kn-visualization-skill (OpenClaw)',
      },
    },
  };

  try {
    const res = await fetch(finalUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = (await res.json()) as { client_id?: string; client_secret?: string };
      const cid = data.client_id ?? null;
      const secret = data.client_secret ?? null;
      if (cid && secret) return { client_id: cid, client_secret: secret };
      if (cid) return { client_id: cid, client_secret: '' };
      return null;
    }
    const text = await res.text();
    if (isOAuth2Dev && typeof console !== 'undefined') {
      console.warn('[OAuth2] POST /oauth2/clients 失败:', res.status, text.slice(0, 400));
    }
    return null;
  } catch (e) {
    if (isOAuth2Dev && typeof console !== 'undefined') {
      console.warn('[OAuth2] tryRegisterOAuth2Client 请求异常', e);
    }
    return null;
  }
}

/** 将 code 提交给同源后端（方案二 A），由后端换 token 并持 Token */
export async function sendCodeToBackend(params: {
  backendCodeExchangeUrl: string;
  code: string;
  state: string;
  redirectUri: string;
}): Promise<void> {
  const res = await fetch(params.backendCodeExchangeUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: params.code,
      state: params.state,
      redirect_uri: params.redirectUri,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`后端交换失败: ${res.status} ${text.slice(0, 200)}`);
  }
}
