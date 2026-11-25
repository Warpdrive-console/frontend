import { Bind } from '../../ui/Bind'
import { Graph } from '../../ui/Graph'
import { ToggleRow } from '../../ui/Row'
import { Grid, KV } from '../../ui/parts'
import { usePoint } from '../../platform/usePoint'
import { pct } from '../../platform/format'

export function BatteryPage() {
  const level = usePoint<number>('system.battery.level')
  const value = level.value ?? 0
  return (
    <>
      <div class="bat-head">
        <div>
          <div class="bat-big">
            <Bind spec="system.battery.level" format="pct" />
          </div>
          <small>
            <Bind spec="system.battery.status" format="cap" />
          </small>
        </div>
        <div style={{ flex: 1 }}>
          <div class={`bat-bar${value < 0.15 ? ' low' : ''}`}>
            <b style={{ width: pct(value) }} />
          </div>
          <small style={{ display: 'block', marginTop: '.35rem' }}>
            <Bind spec="system.battery.time_remaining" format="left" />
          </small>
        </div>
      </div>
      <Graph path="system.battery.power" label="Power draw" format="watt" abs min={0} span={2} />
      <Grid>
        <KV label="Temperature" spec="system.battery.temperature" format="temp" />
        <KV label="Voltage" spec="system.battery.voltage" format="volt" />
        <KV label="Current" spec="system.battery.current" format="amp" />
        <KV label="Health" spec="system.battery.health" format="cap" />
        <KV label="Cycles" spec="system.battery.cycles" />
        <KV label="Capacity left" spec="system.battery.capacity:health" format="pct" />
        <KV label="Full charge" spec="system.battery.capacity:full_mah" format="mah" />
        <KV label="Design" spec="system.battery.capacity:design_mah" format="mah" />
        <KV label="Charger" spec="system.battery.plugged" format="cap" />
      </Grid>
      <ToggleRow path="system.battery.saver" label="Battery saver" sub="Less background work, longer play" />
    </>
  )
}
