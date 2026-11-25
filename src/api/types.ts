export interface Game {
  id: string
  name: string
  icon?: string
  installed?: number
  last_played?: number
  play_time?: number
}

export interface AndroidApp {
  package: string
  name: string
  icon?: string
  version?: string
  system?: boolean
}

export interface Network {
  ssid: string
  strength: number
  band: string
  channel: number
  rssi: number
  secure: boolean
  security?: string
  saved?: boolean
  connected?: boolean
}

export interface BluetoothDevice {
  address: string
  name: string
  type?: string
  battery?: number
  connected?: boolean
  paired?: boolean
  busy?: boolean
  profiles?: string[]
}

export interface Volume {
  name: string
  path: string
  removable?: boolean
  total: number
  free: number
  used: number
  fraction: number
}
