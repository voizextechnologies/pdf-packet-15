/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_WORKER_URL: string
  readonly VITE_ANALYTICS_ID?: string
  readonly VITE_CLOUDFLARE_ACCOUNT_ID?: string
  readonly VITE_ENABLE_PREVIEW?: string
  readonly VITE_ENABLE_ANALYTICS?: string
  readonly VITE_DEBUG_MODE?: string
  readonly VITE_PDF_STORAGE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
