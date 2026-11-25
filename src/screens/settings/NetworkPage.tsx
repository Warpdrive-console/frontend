import { pct } from '../../platform/format'
import { Icon } from '../../platform/icons'
import { usePoint } from '../../platform/usePoint'
import { ToggleRow } from '../../ui/Row'
import { Grid, KV } from '../../ui/parts'

const barsIcon = (strength: number) => `status/cell-${strength <= 0 ? 0 : Math.max(1, Math.ceil(strength * 4))}`

export function NetworkPage() {
  const cellular = usePoint<{ sim?: boolean; carrier?: string; strength?: number; type?: string } | null>(
    'system.network.cellular',
  )
  const cell = cellular.value

  return (
    <>
      <ToggleRow path="system.network.airplane" label="Airplane mode" />
      <ToggleRow path="system.network.mobile_data" label="Mobile data" />
      {cell ? (
        <div class="card">
          <Icon name={barsIcon(cell.strength ?? 0)} style={{ width: '2rem', height: '2rem' }} />
          <div style={{ flex: 1 }}>
            <b>{cell.sim ? cell.carrier || 'Mobile network' : 'No SIM'}</b>
            <small style={{ display: 'block' }}>
              {cell.sim ? `${cell.type} · signal ${pct(cell.strength)}` : 'Insert a SIM to use mobile data'}
            </small>
          </div>
        </div>
      ) : null}
      <ToggleRow path="system.network.location" label="Location" sub="Lets apps and games use your position" />
      <Grid class="two">
        <KV label="Internet" spec="system.network.online" format="yes" />
        <KV label="Connected via" spec="system.network.type" format="cap" />
      </Grid>
    </>
  )
}
