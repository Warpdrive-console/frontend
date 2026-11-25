import type { BluetoothDevice } from '../../api/types'
import { pct } from '../../platform/format'
import { Icon } from '../../platform/icons'
import { call, warp } from '../../platform/warp'
import { usePoint } from '../../platform/usePoint'
import { Row, ToggleRow } from '../../ui/Row'
import { Bind } from '../../ui/Bind'
import { Empty, Grid, KV, ListHead } from '../../ui/parts'
import { askText } from '../../state/dialog'
import { btPick } from './actions'

const typeIcon = (type?: string) =>
  ({ gamepad: 'controller', audio: 'sound', input: 'controller', computer: 'display' })[type ?? ''] || 'bluetooth'

function deviceState(device: BluetoothDevice) {
  if (device.busy) return 'Working…'
  if (device.connected)
    return 'Connected' + (device.profiles?.length ? ` (${device.profiles.join(', ')})` : '')
  if (device.paired) return 'Paired'
  return 'Available'
}

export function BluetoothPage() {
  const enabled = usePoint<boolean>('system.bluetooth.enabled')
  const scanning = usePoint<boolean>('system.bluetooth.scanning')
  const devices = usePoint<BluetoothDevice[]>('system.bluetooth.devices')

  return (
    <>
      <ToggleRow path="system.bluetooth.enabled" label="Bluetooth" />
      <ToggleRow path="system.bluetooth.discoverable" label="Visible to other devices" sub="For two minutes" />
      <Row
        label="Device name"
        value={<Bind spec="system.bluetooth.name" />}
        onClick={() => {
          void (async () => {
            const value = await askText({ title: 'Bluetooth name', value: warp.peek<string>('system.bluetooth.name') })
            if (value) void warp.set('system.bluetooth.name', value).catch(() => {})
          })()
        }}
      />
      <Grid class="two">
        <KV label="Address" spec="system.bluetooth.address" />
        <KV label="Sound output" spec="system.audio.output" format="cap" />
      </Grid>
      <ListHead title="Devices">
        <button class="chip" data-nav aria-busy={!!scanning.value} onClick={() => void call('system.bluetooth.scan')}>
          Search
        </button>
      </ListHead>
      <div class="list">
        {(devices.value || []).length ? (
          (devices.value || []).map(device => {
            const state = deviceState(device)
            return (
              <button class="row" data-nav key={device.address} onClick={() => void btPick(device)}>
                <Icon name={typeIcon(device.type)} />
                <span class="label">
                  {device.name}
                  <small>{state}</small>
                </span>
                {device.battery != null ? <em>{pct(device.battery)}</em> : null}
                {device.busy ? <span class="spin" /> : null}
              </button>
            )
          })
        ) : (
          <Empty>{enabled.value === false ? 'Turn Bluetooth on to see devices.' : 'Put a device in pairing mode, then Search.'}</Empty>
        )}
      </div>
    </>
  )
}
