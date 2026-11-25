/// <reference types="vite/client" />

interface WdConfig {
  api: string
  roturApi: string
  roturAppId: string
}

declare const __WD_CONFIG__: WdConfig

interface Window {
  warp: import('./platform/warp').Warp
}
