import { warp } from './warp'

export const pct = (value: number | null | undefined) => Math.round((value ?? 0) * 100) + '%'

export function gb(bytes: number): string {
  if (bytes >= 1e12) return (bytes / 1e12).toFixed(1) + ' TB'
  return (bytes / 1e9).toFixed(bytes < 1e10 ? 1 : 0) + ' GB'
}

export function dur(seconds: number | null | undefined): string {
  if (seconds == null) return 'n/a'
  const total = Math.max(0, Math.round(seconds))
  const days = Math.floor(total / 86400)
  const hours = Math.floor((total % 86400) / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  if (days) return `${days}d ${hours}h`
  if (hours) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function ago(ms: number | null | undefined): string {
  if (!ms) return 'never'
  const seconds = (Date.now() - ms) / 1000
  if (seconds < 90) return 'just now'
  if (seconds < 3600) return `${Math.round(seconds / 60)} min ago`
  if (seconds < 86400 * 1.5) return `${Math.round(seconds / 3600)} h ago`
  return `${Math.round(seconds / 86400)} days ago`
}

export const cap = (value: unknown) =>
  value ? String(value).charAt(0).toUpperCase() + String(value).slice(1).replace(/_/g, ' ') : 'n/a'

type Formatter = (value: any) => string

export const FORMATS: Record<string, Formatter> = {
  text: value => String(value),
  pct,
  cap,
  dur,
  gb,
  temp: value => value.toFixed(1) + ' °C',
  volt: value => value.toFixed(2) + ' V',
  amp: value => (value > 0 ? '+' : '') + value.toFixed(2) + ' A',
  watt: value => Math.abs(value).toFixed(1) + ' W',
  dbm: value => value + ' dBm',
  mbps: value => value + ' Mbps',
  mhz: value => (value >= 1000 ? (value / 1000).toFixed(2) + ' GHz' : value + ' MHz'),
  hz: value => value + ' Hz',
  rpm: value => value + ' RPM',
  lux: value => Math.round(value) + ' lx',
  mah: value => value + ' mAh',
  ghz: value => value + ' GHz',
  list: value => (value.length ? value.join(', ') : 'n/a'),
  yes: value => (value ? 'Yes' : 'No'),
  onoff: value => (value ? 'On' : 'Off'),
  ssid: value => value || 'Not connected',
  sec: value => (value === 'open' ? 'Open' : String(value).toUpperCase()),
  left: value => {
    if (value == null) return ''
    return warp.peek('system.battery.charging') ? `${dur(value)} to full` : `${dur(value)} left`
  },
  ram: value => `${gb(value.used)} of ${gb(value.total)}`,
  res: value => `${value.width} × ${value.height}`,
}

export function fmt(name: string | undefined, value: unknown): string {
  if (value == null || (typeof value === 'number' && Number.isNaN(value))) return 'n/a'
  return (FORMATS[name ?? 'text'] ?? FORMATS.text)(value)
}

export function splitField(spec: string): [path: string, pick: (value: any) => unknown] {
  const [path, field] = spec.split(':')
  return [path, value => (field && value ? value[field] : value)]
}
