import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: '/kn-visualization-skill/',
  server: {
    port: 5174,
    open: '/kn-visualization-skill/',
    proxy: {
      '/api/ontology-manager': { target: 'https://dip.aishu.cn', changeOrigin: true, secure: false },
      '/api/ontology-query': { target: 'https://dip.aishu.cn', changeOrigin: true, secure: false },
      '/api/bkn-backend': { target: 'https://dip.aishu.cn', changeOrigin: true, secure: false },
      '/oauth2': { target: 'https://dip.aishu.cn', changeOrigin: true, secure: false },
    },
  },
  build: {
    outDir: 'dist',
    target: 'esnext',
    minify: true,
    rollupOptions: {
      input: resolve(__dirname, 'index.html'),
    },
  },
  resolve: {
    dedupe: ['react', 'react-dom'],
  },
});
