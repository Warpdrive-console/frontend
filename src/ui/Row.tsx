import type { ComponentChildren } from 'preact'
import { play } from '../platform/sound'
import { warp } from '../platform/warp'
import { usePoint } from '../platform/usePoint'
import { Icon } from '../platform/icons'
import { prefs, togglePref } from '../state/prefs'

export function Row({
  label,
  sub,
  value,
  icon,
  chevron,
  onClick,
  danger,
  class: cls,
  children,
}: {
  label: string
  sub?: string
  value?: ComponentChildren
  icon?: string
  chevron?: boolean
  onClick?: () => void
  danger?: boolean
  class?: string
  children?: ComponentChildren
}) {
  return (
    <button class={`row${cls ? ` ${cls}` : ''}${danger ? ' danger' : ''}`} data-nav onClick={onClick}>
      {icon ? <Icon name={icon} /> : null}
      <span class="label">
        {label}
        {sub ? <small>{sub}</small> : null}
      </span>
      {value != null ? <em>{value}</em> : null}
      {children}
      {chevron ? <Icon name="chevron" class="chev" /> : null}
    </button>
  )
}

export function ToggleRow({
  path,
  label,
  sub,
  icon,
  quiet,
}: {
  path: string
  label: string
  sub?: string
  icon?: string
  quiet?: boolean
}) {
  const value = usePoint<boolean | null>(path)
  return (
    <button
      class={quiet ? 'qt' : 'row'}
      data-nav
      role="switch"
      aria-checked={!!value.value}
      hidden={value.value === null}
      onClick={() => {
        play('toggle')
        void warp.toggle(path).catch(() => {})
      }}
    >
      {icon ? <Icon name={icon} /> : null}
      <span class="label">
        {label}
        {sub ? <small>{sub}</small> : null}
      </span>
      <i class="switch" />
    </button>
  )
}

export function PrefToggleRow({
  pref,
  label,
  sub,
}: {
  pref: 'sounds' | 'motion' | 'signMessages'
  label: string
  sub?: string
}) {
  return (
    <button
      class="row"
      data-nav
      role="switch"
      aria-checked={prefs.value[pref]}
      onClick={() => {
        play('toggle')
        togglePref(pref)
      }}
    >
      <span class="label">
        {label}
        {sub ? <small>{sub}</small> : null}
      </span>
      <i class="switch" />
    </button>
  )
}
