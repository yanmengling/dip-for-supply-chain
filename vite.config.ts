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
      // 转发 ontology 到云端环境 (Mock模式)
      '/proxy-ontology': {
        target: 'https://dip.aishu.cn',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/proxy-ontology/, '/api/ontology'),
      },
      // 转发 ontology-manager 到云端环境 (Brain模式)
      '/proxy-manager': {
        target: 'https://dip.aishu.cn',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/proxy-manager/, '/api/ontology-manager'),
      },
      // 转发 metricModel 到云端环境
      '/proxy-metric': {
        target: 'https://dip.aishu.cn',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/proxy-metric/, '/api/mdl-uniquery'),
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, _req, _res) => {
            proxyReq.setHeader('Origin', 'https://dip.aishu.cn');
          });
        },
      },
      // 转发 Agent 服务
      '/proxy-agent-service': {
        target: 'https://dip.aishu.cn',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/proxy-agent-service/, '/api'),
      },
      // 转发 ontology-query 到云端环境 (用于DemandPlanningService)
      '/api/ontology-query': {
        target: 'https://dip.aishu.cn',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, _req, _res) => {
            proxyReq.setHeader('Origin', 'https://dip.aishu.cn');
          });
        },
      },
      // 转发 forecast 到本地 Prophet 预测服务
      '/proxy-forecast': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/proxy-forecast/, ''),
      },
      // 转发 metricModel 到云端环境
      '/proxy-metric-data-model': {
        target: 'https://dip.aishu.cn',
        changeOrigin: true,
        secure: false,
        rewrite: (path) => path.replace(/^\/proxy-metric/, '/api/mdl-uniquery'),
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, _req, _res) => {
            proxyReq.setHeader('Origin', 'https://dip.aishu.cn');
          });
        },
      },

      '/api/mdl-data-model': {
        target: 'https://dip.aishu.cn',
        changeOrigin: true,
        secure: false,
        configure: (proxy, _options) => {
          proxy.on('proxyReq', (proxyReq, _req, _res) => {
            proxyReq.setHeader('Origin', 'https://dip.aishu.cn');
          });
        },
      },
      // 本地服务代理
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
