/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 알라딘 API 프록시(Cloudflare Worker) 주소. 배포 빌드에 필요하다. */
  readonly VITE_ALADIN_PROXY_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
