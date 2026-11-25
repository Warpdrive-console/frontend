import type { JSX } from 'preact'
import { useEffect, useState } from 'preact/hooks'
import {
  avatarUrl,
  bare,
  presenceOf,
  rotur,
} from '../api/rotur'
import { loadOverlay, overlays } from '../api/avatars'
import { prefs } from '../state/prefs'

export type Presence = 'online' | 'idle' | 'dnd' | 'offline' | 'invisible'

export function PresenceDot({ username, size = 'sm' }: { username: string; size?: 'sm' | 'lg' }) {
  if (!username) return null
  const self = bare(username) === bare(rotur.value.username)
  let presence: Presence = presenceOf(username) as Presence
  if (self) presence = rotur.value.connected ? 'online' : 'offline'
  return (
    <span
      class={`presence-dot ${presence} ${size}`}
      data-presence={presence}
      role="status"
      aria-label={`${presence.charAt(0).toUpperCase()}${presence.slice(1)}`}
    />
  )
}

function overlayUrl(image: string) {
  if (prefs.value.motion || image.startsWith('data:')) return image
  try {
    const url = new URL(image)
    url.searchParams.set('static', 'true')
    return url.toString()
  } catch {
    return image
  }
}

function avatarRequestSize(size: number) {
  const root = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
  const pixels = size * root
  if (pixels <= 40) return 64
  if (pixels <= 80) return 128
  return 256
}

export function Avatar({
  username,
  size = 2.5,
  alt,
  class: cls,
  showStatus = true,
  statusSize = 'sm',
}: {
  username?: string
  /** Size in rem, so avatars scale with the console UI. */
  size?: number
  alt?: string
  class?: string
  showStatus?: boolean
  statusSize?: 'sm' | 'lg'
}) {
  const name = bare(username)
  const [failed, setFailed] = useState(false)
  const [failedOverlay, setFailedOverlay] = useState<string | null>(null)
  const [src, setSrc] = useState(() => (name ? avatarUrl(name, avatarRequestSize(size)) : 'assets/avatar.svg'))

  useEffect(() => {
    setFailed(false)
    setSrc(name ? avatarUrl(name, avatarRequestSize(size)) : 'assets/avatar.svg')
  }, [name, size])

  useEffect(() => {
    if (name) loadOverlay(name)
  }, [name])

  const overlay = name ? overlays.value[name] : null
  const overlaySrc = overlay ? overlayUrl(overlay) : null

  return (
    <span class={`avatar${cls ? ` ${cls}` : ''}`} style={{ '--avatar-size': `${size}rem` } as JSX.CSSProperties}>
      <img
        class="pfp"
        src={failed ? 'assets/avatar.svg' : src}
        alt={alt || username || ''}
        loading="lazy"
        onError={() => setFailed(true)}
      />
      {overlaySrc && overlaySrc !== failedOverlay ? (
        <img
          class="avatar-overlay"
          src={overlaySrc}
          alt=""
          loading="lazy"
          onError={() => setFailedOverlay(overlaySrc)}
        />
      ) : null}
      {showStatus && name ? <PresenceDot username={name} size={statusSize} /> : null}
    </span>
  )
}
