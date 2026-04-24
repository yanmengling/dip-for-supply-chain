import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import qiankun from 'vite-plugin-qiankun'

const isDev = process.env.NODE_ENV !== 'production';

// Rewrite Set-Cookie headers from dip-poc.aishu.cn so the browser stores CLB
// session-affinity cookies (CLBSERVERID / CLBSERVERCORSID) against localhost.
// Without this, every request may land on a different backend node that doesn't
// recognise the token, causing spurious 401s.
function rewriteCookies(proxyRes: any) {
  const setCookie = proxyRes.headers['set-cookie'];
  if (!setCookie) return;
  proxyRes.headers['set-cookie'] = (Array.isArray(setCookie) ? setCookie : [setCookie]).map(
    (c: string) => c
      .replace(/;\s*Domain=[^;]*/gi, '')   // strip original domain
      .replace(/;\s*Secure/gi, '')          // strip Secure so http://127.0.0.1 can store it
      .replace(/;\s*SameSite=[^;]*/gi, '') // strip SameSite restriction
  );
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    qiankun('dip-for-supply-chain-v142', {
      useDevMode: false
    }),
  ],
  base: isDev ? '/' : '/dip-for-supply-chain-v142/', // Base path for the micro-app (dev: /, prod: sub-path)
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      // DIP API 代理 - ontology-manager
      '/api/ontology-manager': {
        target: 'https://dip-poc.aishu.cn',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.error('[Vite Proxy] Ontology Manager 代理错误:', err.message);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('[Vite Proxy] Ontology Manager 请求:', req.url);
            proxyReq.setHeader('Connection', 'keep-alive');
          });
          proxy.on('proxyRes', (proxyRes, _req, _res) => {
            rewriteCookies(proxyRes);
            console.log('[Vite Proxy] Ontology Manager 响应:', proxyRes.statusCode);
          });
        },
      },
      // DIP API 代理 - ontology-query
      '/api/ontology-query': {
        target: 'https://dip-poc.aishu.cn',
        changeOrigin: true,
        secure: false,
        timeout: 300000,
        proxyTimeout: 300000,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.error('[Vite Proxy] Ontology Query 代理错误:', err.message);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            const override = proxyReq.getHeader('x-http-method-override') || proxyReq.getHeader('X-HTTP-Method-Override');
            const cl = proxyReq.getHeader('content-length');
            const ct = proxyReq.getHeader('content-type');
            console.log('[Vite Proxy] Ontology Query 请求:', req.method, req.url,
              '| X-HTTP-Method-Override:', override || '(无)',
              '| Content-Type:', ct || '(无)',
              '| Content-Length:', cl !== undefined ? cl : '(无)');
            proxyReq.setHeader('Connection', 'keep-alive');
          });
          proxy.on('proxyRes', (proxyRes, _req, _res) => {
            rewriteCookies(proxyRes);
            console.log('[Vite Proxy] Ontology Query 响应:', proxyRes.statusCode);
          });
        },
      },
      // DIP API 代理 - agent-app
      '/api/agent-app': {
        target: 'https://dip-poc.aishu.cn',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.error('[Vite Proxy] Agent App 代理错误:', err.message);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('[Vite Proxy] Agent App 请求:', req.url);
            proxyReq.setHeader('Connection', 'keep-alive');
          });
          proxy.on('proxyRes', (proxyRes, _req, _res) => {
            rewriteCookies(proxyRes);
            console.log('[Vite Proxy] Agent App 响应:', proxyRes.statusCode);
          });
        },
      },
      // DIP API 代理 - dip-studio (ChatKit StudioCopilot)
      '/api/dip-studio': {
        target: 'https://dip-poc.aishu.cn',
        changeOrigin: true,
        secure: false,
        timeout: 300000,
        proxyTimeout: 300000,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.error('[Vite Proxy] DIP Studio 代理错误:', err.message);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('[Vite Proxy] DIP Studio 请求:', req.url);
            proxyReq.setHeader('Connection', 'keep-alive');
          });
          proxy.on('proxyRes', (proxyRes, _req, _res) => {
            rewriteCookies(proxyRes);
            console.log('[Vite Proxy] DIP Studio 响应:', proxyRes.statusCode);
          });
        },
      },
      // DIP API 代理 - automation (workflow)
      '/api/automation': {
        target: 'https://dip-poc.aishu.cn',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => rewriteCookies(proxyRes));
        },
      },
      // DIP API 代理 - mdl-uniquery (metric model)
      '/api/mdl-uniquery': {
        target: 'https://dip-poc.aishu.cn',
        changeOrigin: true,
        secure: false,
        timeout: 300000,
        proxyTimeout: 300000,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => rewriteCookies(proxyRes));
        },
      },
      // DIP API 代理 - mdl-data-model
      '/api/mdl-data-model': {
        target: 'https://dip-poc.aishu.cn',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => rewriteCookies(proxyRes));
        },
      },
      // 转发 forecast 到本地 Prophet 预测服务
      '/proxy-forecast': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/proxy-forecast/, ''),
      },
      // DIP API 代理 - agent-factory (SDK 用于加载开场白和预置问题)
      '/api/agent-factory': {
        target: 'https://dip-poc.aishu.cn',
        changeOrigin: true,
        secure: false,
        configure: (proxy) => {
          proxy.on('proxyRes', (proxyRes) => rewriteCookies(proxyRes));
        },
      },
      // 本地服务代理 (catch-all, must be last)
      '/api': {
        target: 'http://127.0.0.1:30777',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path,
      },
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
  build: {
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
})
