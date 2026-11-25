import { signal } from '@preact/signals'
import { useEffect, useRef } from 'preact/hooks'
import { pct } from '../platform/format'
import { play } from '../platform/sound'
import { warp } from '../platform/warp'
import { usePoint } from '../platform/usePoint'

const overrides = signal<Record<string, number>>({})
const inflight = new Map<string, number>()

function put(path: string, value: number) {
  overrides.value = { ...overrides.value, [path]: value }
}

function clear(path: string) {
  if (!(path in overrides.value)) return
  const next = { ...overrides.value }
  delete next[path]
  overrides.value = next
}

export function setSlider(path: string, raw: number) {
  const value = Math.max(0, Math.min(1, Math.round(raw * 100) / 100))
  put(path, value)
  play('move')
  const busy = inflight.has(path)
  inflight.set(path, value)
  if (busy) return
  const flush = () => {
    const next = inflight.get(path)!
    warp
      .set(path, next)
      .catch(() => {})
      .finally(() => (inflight.get(path) !== next ? flush() : inflight.delete(path)))
  }
  flush()
}

export function adjustSlider(el: HTMLElement, delta: number) {
  const path = el.dataset.slider
  if (!path) return
  const current = overrides.value[path] ?? warp.peek<number>(path) ?? 0
  setSlider(path, current + delta)
}

export function Slider({ path, label }: { path: string; label: string }) {
  const value = usePoint<number>(path)
  const track = useRef<HTMLDivElement>(null)
  const shown = overrides.value[path] ?? value.value ?? 0

  useEffect(() => {
    const external = value.value
    const local = overrides.value[path]
    if (local != null && external != null && Math.abs(local - external) < 0.011) clear(path)
  }, [value.value, path])

  const seek = (clientX: number) => {
    const rect = track.current?.getBoundingClientRect()
    if (!rect || clientX < rect.left - 12 || clientX > rect.right + 12) return
    setSlider(path, (clientX - rect.left) / rect.width)
  }

  return (
    <div
      class="row slider"
      data-nav
      data-slider={path}
      role="slider"
      aria-valuenow={shown}
      onClick={event => seek(event.clientX)}
    >
      <span class="label">{label}</span>
      <div class="track" ref={track}>
        <b style={{ width: pct(shown) }} />
      </div>
      <em>{pct(shown)}</em>
    </div>
  )
}
