import { cap } from '../platform/format'
import { play } from '../platform/sound'
import { warp } from '../platform/warp'
import { usePoint } from '../platform/usePoint'

export function Segmented({
  path,
  options,
  optionsPath,
  suffix = '',
}: {
  path: string
  options?: (string | number)[]
  optionsPath?: string
  suffix?: string
}) {
  const current = usePoint<string | number>(path)
  const dynamic = usePoint<(string | number)[] | null>(optionsPath ?? '')
  const list = optionsPath ? (dynamic.value ?? []) : (options ?? [])
  if (!list.length) return null

  return (
    <div class="seg">
      {list.map(option => {
        const value = typeof option === 'number' ? option : String(option)
        return (
          <button
            key={String(option)}
            data-nav
            aria-checked={String(current.value) === String(value)}
            onClick={() => {
              play('toggle')
              void warp.set(path, value).catch(() => {})
            }}
          >
            {typeof option === 'number' ? option + suffix : cap(option)}
          </button>
        )
      })}
    </div>
  )
}
