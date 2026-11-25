export interface Config {
  api: string
  roturApi: string
  roturAppId: string
}

export const config: Config = {
  api: __WD_CONFIG__.api.replace(/\/+$/, ''),
  roturApi: __WD_CONFIG__.roturApi.replace(/\/+$/, ''),
  roturAppId: __WD_CONFIG__.roturAppId,
}
