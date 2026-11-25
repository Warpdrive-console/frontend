import { fmt, splitField } from '../platform/format'
import { usePoint } from '../platform/usePoint'

export function Bind({ spec, format }: { spec: string; format?: string }) {
  const [path, pick] = splitField(spec)
  const value = usePoint(path)
  return <>{fmt(format, pick(value.value))}</>
}

export function Meter({ spec, format }: { spec: string; format?: string }) {
  const [path, pick] = splitField(spec)
  const value = usePoint(path)
  const fraction = Number(pick(value.value) ?? 0)
  return (
    <div class="meter">
      <b style={{ width: `${Math.max(0, Math.min(1, fraction)) * 100}%` }} aria-label={fmt(format, fraction)} />
    </div>
  )
}
