import type { Network } from '../../api/types'
import { pct } from '../../platform/format'
import { Icon } from '../../platform/icons'
import { call, warp } from '../../platform/warp'
import { usePoint } from '../../platform/usePoint'
import { Row, ToggleRow } from '../../ui/Row'
import { Bind } from '../../ui/Bind'
import { Empty, Grid, KV, ListHead } from '../../ui/parts'
import { askText, dialog } from '../../state/dialog'
import { pushPage } from '../../state/settings'
import { addHiddenWifi, wifiPick } from './actions'

const wifiIcon = (strength: number) => `status/wifi-${strength <= 0 ? 0 : Math.max(1, Math.ceil(strength * 3))}`

export function WifiPage() {
  const status = usePoint<string>('system.wifi.connection_status')
  const strength = usePoint<number>('system.wifi.strength')
  const ssid = usePoint<string>('system.wifi.ssid')
  const details = usePoint<{ strength?: number; band?: string } | null>('system.wifi.details')
  const networks = usePoint<Network[]>('system.wifi.networks')
  const enabled = usePoint<boolean>('system.wifi.enabled')
  const scanning = usePoint<boolean>('system.wifi.scanning')

  const state = status.value || 'off'
  const name = state === 'off' ? 'status/wifi-off' : wifiIcon(state === 'connected' ? (strength.value ?? 0) : 0)
  const sub =
    { off: 'Wi-Fi is off', disconnected: 'Not connected', connecting: 'Connecting…' }[state] ||
    (details.value ? `Connected · ${pct(details.value.strength)} · ${details.value.band} GHz` : 'Connected')

  return (
    <>
      <ToggleRow path="system.wifi.enabled" label="Wi-Fi" />
      <div class="card">
        <Icon name={name} style={{ width: '2.2rem', height: '2.2rem' }} />
        <div class="label" style={{ flex: 1, minWidth: 0 }}>
          <b>{ssid.value || 'Not connected'}</b>
          <small style={{ display: 'block' }}>{sub}</small>
        </div>
      </div>
      {details.value ? (
        <div>
          <Grid>
            <KV label="Signal" spec="system.wifi.details:rssi" format="dbm" />
            <KV label="Band" spec="system.wifi.details:band" format="ghz" />
            <KV label="Channel" spec="system.wifi.details:channel" />
            <KV label="Link" spec="system.wifi.details:link_mbps" format="mbps" />
            <KV label="Standard" spec="system.wifi.details:standard" />
            <KV label="Security" spec="system.wifi.details:security" format="sec" />
          </Grid>
          <Grid class="two" style={{ marginTop: '.4rem' }}>
            <KV label="IP address" spec="system.wifi.details:ip" />
            <KV label="Gateway" spec="system.wifi.details:gateway" />
            <KV label="MAC" spec="system.wifi.details:mac" />
            <KV label="BSSID" spec="system.wifi.details:bssid" />
            <KV label="DNS" spec="system.wifi.details:dns" format="list" class="full" />
          </Grid>
        </div>
      ) : null}
      <Row label="Saved networks" onClick={() => pushPage('wifi_saved')} chevron />
      <Row label="Join a hidden network" onClick={() => void addHiddenWifi()} />
      <Row
        label="Hotspot"
        value={<Bind spec="system.wifi.hotspot" format="onoff" />}
        onClick={() => pushPage('hotspot')}
        chevron
      />
      <ListHead title="Networks">
        <button class="chip" data-nav aria-busy={!!scanning.value} onClick={() => void call('system.wifi.scan')}>
          Search
        </button>
      </ListHead>
      <div class="list">
        {(networks.value || []).length ? (
          (networks.value || []).map(network => (
            <button class="row" data-nav key={network.ssid} onClick={() => void wifiPick(network)}>
              <Icon name={wifiIcon(network.strength)} />
              <span class="label">
                {network.ssid}
                <small>
                  {network.band} GHz · channel {network.channel} · {network.rssi} dBm
                </small>
              </span>
              {network.connected ? <span class="tag on">Connected</span> : null}
              {!network.connected && network.saved ? <span class="tag">Saved</span> : null}
              {network.secure ? <Icon name="lock" /> : null}
            </button>
          ))
        ) : (
          <Empty>{enabled.value === false ? 'Turn Wi-Fi on to see networks.' : 'No networks found yet.'}</Empty>
        )}
      </div>
    </>
  )
}

export function WifiSavedPage() {
  const saved = usePoint<Network[]>('system.wifi.saved')
  const list = saved.value || []
  if (!list.length) return <Empty>Nothing saved yet.</Empty>
  return (
    <>
      <div class="list">
        {list.map(network => (
          <button
            class="row"
            data-nav
            key={network.ssid}
            onClick={() => {
              void (async () => {
                const action = await dialog({
                  title: network.ssid,
                  text: `Saved ${network.security === 'open' ? 'Open' : String(network.security).toUpperCase()} network.`,
                  actions: [['Forget', false, true], ['Cancel'], ['Connect', true]],
                })
                if (action === 'Connect') void call('system.wifi.connect', { ssid: network.ssid })
                if (action === 'Forget') void call('system.wifi.forget', { ssid: network.ssid })
              })()
            }}
          >
            <Icon name="wifi" />
            <span class="label">
              {network.ssid}
              <small>{network.security === 'open' ? 'Open' : String(network.security).toUpperCase()}</small>
            </span>
            <Icon name="chevron" class="chev" />
          </button>
        ))}
      </div>
    </>
  )
}

export function HotspotPage() {
  const config = usePoint<{ ssid?: string; password?: string; band?: string } | null>('system.wifi.hotspot_config')
  const setConfig = (next: Record<string, unknown>) => {
    void warp
      .set('system.wifi.hotspot_config', { ...config.value, ...next })
      .catch(() => {})
  }
  return (
    <>
      <ToggleRow path="system.wifi.hotspot" label="Hotspot" sub="Share this device’s connection" />
      <Row
        label="Name"
        value={<Bind spec="system.wifi.hotspot_config:ssid" />}
        onClick={() => {
          void (async () => {
            const value = await askText({ title: 'Hotspot name', value: config.value?.ssid })
            if (value) setConfig({ ssid: value })
          })()
        }}
      />
      <Row
        label="Password"
        value={<Bind spec="system.wifi.hotspot_config:password" />}
        onClick={() => {
          void (async () => {
            const value = await askText({
              title: 'Hotspot password',
              text: '8 or more characters',
              value: config.value?.password,
              secret: true,
            })
            if (value) setConfig({ password: value })
          })()
        }}
      />
      <h3>Band</h3>
      <div class="seg">
        {[
          ['2.4', '2.4 GHz'],
          ['5', '5 GHz'],
          ['any', 'Automatic'],
        ].map(([value, label]) => (
          <button
            key={value}
            data-nav
            aria-checked={config.value?.band === value}
            onClick={() => setConfig({ band: value })}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  )
}
