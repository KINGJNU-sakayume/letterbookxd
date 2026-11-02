import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // ALADIN_TTB_KEY는 VITE_ 접두사가 없어 번들에 들어가지 않는다. dev 프록시에서만 쓴다.
  const env = loadEnv(mode, process.cwd(), '');
  const ttbKey = env.ALADIN_TTB_KEY ?? '';

  return {
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
        // 개발 중 알라딘 API: 배포본의 Cloudflare Worker와 같은 역할 (src/services/aladin.ts)
        '/aladin-api': {
          target: 'https://www.aladin.co.kr/ttb/api',
          changeOrigin: true,
          rewrite: (path) => {
            const url = new URL(path.replace(/^\/aladin-api/, ''), 'http://local');
            url.searchParams.delete('ttbkey');
            if (ttbKey) url.searchParams.set('ttbkey', ttbKey);
            return url.pathname + url.search;
          },
        },
      },
    },
  };
});
