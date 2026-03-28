import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/letterbookxd/',
  plugins: [react()],
  build: {
    outDir: 'docs',
  },
  optimizeDeps: {
    exclude: ['lucide-react'],
  },
  server: {
    proxy: {
      // 기존: SearchPage에서 사용하던 검색 API
      // [H-2] AdminPage handleSearch, db.ts getAladinDetail도 이 경로로 통일
      '/aladin-api': {
        target: 'http://www.aladin.co.kr/ttb/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/aladin-api/, ''),
      },
    },
  },
});
