/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_CSL_STYLES_CDN: string;
  readonly VITE_CSL_LOCALES_CDN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
