import type { Volume } from '../../api/types'
import { gb, pct } from '../../platform/format'
import { usePoint } from '../../platform/usePoint'
import { Empty } from '../../ui/parts'

export function StoragePage() {
  const volumes = usePoint<Volume[]>('system.device.volumes')
  const list = volumes.value || []
  if (!list.length) return <Empty>No storage found.</Empty>

  return (
    <>
      {list.map(volume => (
        <div class="card" key={volume.path} style={{ flexDirection: 'column', alignItems: 'stretch', gap: '.45rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 650 }}>
            <span>{volume.name}</span>
            <span style={{ color: 'var(--dim)' }}>
              {gb(volume.free)} free of {gb(volume.total)}
            </span>
          </div>
          <div class="meter">
            <b style={{ width: pct(volume.fraction) }} />
          </div>
          <small>
            {volume.path}
            {volume.removable ? ' · removable' : ''}
          </small>
        </div>
      ))}
    </>
  )
}
