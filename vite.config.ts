import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import qiankun from 'vite-plugin-qiankun'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    qiankun('supply-chain-brain', {
      useDevMode: false
    })
  ],
  base: '/supply-chain-brain/', // Base path for the micro-app
  server: {
    port: 5173,
    host: '127.0.0.1',
    proxy: {
      // DIP API 代理 - ontology-manager
      '/api/ontology-manager': {
        target: 'https://dip.aishu.cn',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.error('[Vite Proxy] Ontology Manager 代理错误:', err.message);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('[Vite Proxy] Ontology Manager 请求:', req.url);
            // Bypass SSL certificate validation
            proxyReq.setHeader('Connection', 'keep-alive');
          });
          proxy.on('proxyRes', (proxyRes, _req, _res) => {
            console.log('[Vite Proxy] Ontology Manager 响应:', proxyRes.statusCode);
          });
        },
      },
      // DIP API 代理 - ontology-query
      '/api/ontology-query': {
        target: 'https://dip.aishu.cn',
        changeOrigin: true,
        secure: false,
        timeout: 180000, // 3分钟超时
        proxyTimeout: 180000, // 代理超时3分钟
        configure: (proxy, _options) => {
          proxy.on('error', (err, _req, _res) => {
            console.error('[Vite Proxy] Ontology Query 代理错误:', err.message);
          });
          proxy.on('proxyReq', (proxyReq, req, _res) => {
            console.log('[Vite Proxy] Ontology Query 请求:', req.url);
            proxyReq.setHeader('Connection', 'keep-alive');
          });
          proxy.on('proxyRes', (proxyRes, _req, _res) => {
            console.log('[Vite Proxy] Ontology Query 响应:', proxyRes.statusCode);
          });
        },
      },
      // DIP API 代理 - agent-app
      '/api/agent-app': {
        target: 'https://dip.aishu.cn',
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
            console.log('[Vite Proxy] Agent App 响应:', proxyRes.statusCode);
          });
        },
      },
      // DIP API 代理 - automation (workflow)
      '/api/automation': {
        target: 'https://dip.aishu.cn',
        changeOrigin: true,
        secure: false,
      },
      // DIP API 代理 - mdl-uniquery (metric model)
      '/api/mdl-uniquery': {
        target: 'https://dip.aishu.cn',
        changeOrigin: true,
        secure: false,
      },
      // DIP API 代理 - mdl-data-model
      '/api/mdl-data-model': {
        target: 'https://dip.aishu.cn',
        changeOrigin: true,
        secure: false,
      },
      // 转发 forecast 到本地 Prophet 预测服务
      '/proxy-forecast': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/proxy-forecast/, ''),
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
  build: {
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
})
