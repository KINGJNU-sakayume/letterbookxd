/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 알라딘 API 프록시 주소 (선택). 비우면 기존 Supabase Edge Function을 쓴다. */
  readonly VITE_ALADIN_PROXY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
