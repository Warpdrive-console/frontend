import { useEffect, useState } from 'preact/hooks'
import { displayName, onlineCount, rotur, signedIn } from '../api/rotur'
import { Icon } from '../platform/icons'
import { pct } from '../platform/format'
import { usePoint } from '../platform/usePoint'
import { go } from '../state/nav'
import { Avatar } from './Avatar'

const wifiIcon = (strength: number) => `status/wifi-${strength <= 0 ? 0 : Math.max(1, Math.ceil(strength * 3))}`
const barsIcon = (strength: number) => `status/cell-${strength <= 0 ? 0 : Math.max(1, Math.ceil(strength * 4))}`

function connectionLabel() {
  if (!signedIn()) return 'Sign in'
  if (rotur.value.connected) return `${onlineCount()} friends online`
  return 'Connecting…'
}

function bluetoothIcon(state?: string | null) {
  if (state === 'connected') return 'status/bluetooth-connected'
  if (state === 'on') return 'status/bluetooth'
  return null
}

export function Header() {
  const wifiStatus = usePoint<string>('system.wifi.connection_status')
  const wifiStrength = usePoint<number>('system.wifi.strength')
  const bluetooth = usePoint<string>('system.bluetooth.connection_status')
  const batteryLevel = usePoint<number>('system.battery.level')
  const charging = usePoint<boolean>('system.battery.charging')
  const present = usePoint<boolean>('system.battery.present')
  const networkType = usePoint<string>('system.network.type')
  const cellular = usePoint<{ strength?: number } | null>('system.network.cellular')
  const gamepads = usePoint<{ builtin?: boolean }[]>('input.gamepads')
  const format24 = usePoint<boolean>('system.time.format24')
  const [clock, setClock] = useState(() => new Date())

  useEffect(() => {
    const timer = setInterval(() => setClock(new Date()), 5000)
    return () => clearInterval(timer)
  }, [])

  const time = clock
    .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !format24.value })
    .replace(/\s?[AP]M$/i, '')

  const level = batteryLevel.value ?? 1
  const isPresent = present.value !== false
  const wifiState = wifiStatus.value || 'off'
  let wifi = 'status/wifi-off'
  if (wifiState !== 'off') wifi = wifiIcon(wifiState === 'connected' ? (wifiStrength.value ?? 0) : 0)
  let battery: string | null = null
  if (isPresent) battery = charging.value ? 'status/battery-charging' : `status/battery-${Math.round(level * 5) * 20}`
  const cell = networkType.value === 'cellular' ? barsIcon(cellular.value?.strength ?? 0) : null
  const pad = (gamepads.value || []).some(gamepad => !gamepad.builtin) ? 'status/gamepad' : null

  return (
    <header class="top">
      <button class="me" id="me" data-nav onClick={() => go('friends')}>
        <Avatar username={signedIn() ? rotur.value.username : ''} size={2.6} showStatus={signedIn()} />
        <span>
          <b>{signedIn() ? displayName() : 'Guest'}</b>
          <small>{connectionLabel()}</small>
        </span>
      </button>
      <div class="spacer" />
      <div class="status">
        <Icon name={pad} class="i" />
        <Icon name={bluetoothIcon(bluetooth.value)} class="i" />
        <Icon name={cell} class="i" />
        <Icon name={wifi} style={wifiState === 'connecting' ? { opacity: 0.5 } : undefined} />
        <Icon name={battery} class="i" />
        <span class="pct">{isPresent ? pct(level) : ''}</span>
      </div>
      <time class="clock">{time}</time>
    </header>
  )
}
