/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_CSL_STYLES_CDN: string;
  readonly VITE_CSL_LOCALES_CDN: string;
  /** `'false'` for a static deployment with no lookup service behind it. */
  readonly VITE_LOOKUP_ENABLED: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
