import type { ComponentChildren, JSX } from 'preact'
import { Bind } from './Bind'

export function H3({ children }: { children: ComponentChildren }) {
  return <h3>{children}</h3>
}

export function KV({
  label,
  spec,
  format,
  class: cls,
  wide,
}: {
  label: string
  spec: string
  format?: string
  class?: string
  wide?: boolean
}) {
  return (
    <div class={`kv${wide ? ' wide' : ''}${cls ? ` ${cls}` : ''}`}>
      <span>{label}</span>
      <b>
        <Bind spec={spec} format={format} />
      </b>
    </div>
  )
}

export function Grid({ children, class: cls, style }: { children: ComponentChildren; class?: string; style?: JSX.CSSProperties }) {
  return <div class={`grid${cls ? ` ${cls}` : ''}`} style={style}>{children}</div>
}

export function Card({ children, class: cls }: { children: ComponentChildren; class?: string }) {
  return <div class={`card${cls ? ` ${cls}` : ''}`}>{children}</div>
}

export function Empty({ children }: { children: ComponentChildren }) {
  return <div class="empty">{children}</div>
}

export function ListHead({ title, children }: { title: string; children?: ComponentChildren }) {
  return (
    <div class="list-head">
      <h3>{title}</h3>
      {children}
    </div>
  )
}
