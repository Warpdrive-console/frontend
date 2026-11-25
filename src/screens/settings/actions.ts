import type { BluetoothDevice, Network } from '../../api/types'
import { cap, pct } from '../../platform/format'
import { call, warp } from '../../platform/warp'
import { askText, dialog } from '../../state/dialog'
import { note } from '../../state/toasts'
import { fail } from '../../state/toasts'

export async function wifiPick(network: Network) {
  if (network.connected) {
    const action = await dialog({
      title: network.ssid,
      text: `Connected · ${network.rssi} dBm · ${network.band} GHz, channel ${network.channel}`,
      actions: [['Forget', false, true], ['Disconnect'], ['Close', true]],
    })
    if (action === 'Disconnect') void call('system.wifi.disconnect')
    if (action === 'Forget') void call('system.wifi.forget', { ssid: network.ssid })
    return
  }
  if (network.saved) {
    const action = await dialog({
      title: network.ssid,
      text: 'Saved network.',
      actions: [['Forget', false, true], ['Cancel'], ['Connect', true]],
    })
    if (action === 'Connect') void call('system.wifi.connect', { ssid: network.ssid })
    if (action === 'Forget') void call('system.wifi.forget', { ssid: network.ssid })
    return
  }
  let password = ''
  if (network.secure) {
    password = (await askText({ title: network.ssid, text: 'Password', secret: true, done: 'Connect' })) ?? ''
    if (!password) return
  }
  void call('system.wifi.connect', { ssid: network.ssid, password })
}

export async function btPick(device: BluetoothDevice) {
  if (device.busy) return
  if (!device.paired) {
    await warp.call('system.bluetooth.pair', { address: device.address }).catch(fail)
    note({ title: 'Pairing', text: device.name, icon: 'bluetooth', sound: false })
    return
  }
  const info = [cap(device.type), device.battery != null ? `battery ${pct(device.battery)}` : null, device.address]
    .filter(Boolean)
    .join(' · ')
  const action = await dialog({
    title: device.name,
    text: info,
    actions: [['Forget', false, true], ['Rename'], [device.connected ? 'Disconnect' : 'Connect', true]],
  })
  if (action === 'Connect') void call('system.bluetooth.connect', { address: device.address })
  if (action === 'Disconnect') void call('system.bluetooth.disconnect', { address: device.address })
  if (action === 'Forget') void call('system.bluetooth.unpair', { address: device.address })
  if (action === 'Rename') {
    const name = await askText({ title: 'Rename', value: device.name })
    if (name) void call('system.bluetooth.rename', { address: device.address, name })
  }
}

export async function addHiddenWifi() {
  const ssid = await askText({ title: 'Hidden network', text: 'Network name' })
  if (!ssid) return
  const password = await askText({
    title: ssid,
    text: 'Password (leave empty for an open network)',
    secret: true,
    allowEmpty: true,
  })
  if (password == null) return
  void call('system.wifi.connect', { ssid, password, hidden: true })
}
