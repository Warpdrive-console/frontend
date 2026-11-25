import { signal } from '@preact/signals'
import { config } from '../config'

export const overlays = signal<Record<string, string | null>>({})

const pending = new Set<string>()
const inFlight = new Set<string>()
let timer: ReturnType<typeof setTimeout> | undefined

const norm = (username: string) => String(username || '').toLowerCase()

interface OverlayAnswer {
  active_cosmetics?: { overlay?: { image_url?: unknown } | null }
}

async function flush() {
  timer = undefined
  const names = [...pending]
  pending.clear()
  if (!names.length) return
  for (const name of names) inFlight.add(name)

  try {
    const response = await fetch(`${config.roturApi}/v2/profiles/cosmetics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: names }),
    })
    const data = response.ok ? ((await response.json()) as Record<string, OverlayAnswer>) : {}
    const next = { ...overlays.value }
    for (const name of names) {
      const image = data?.[name]?.active_cosmetics?.overlay?.image_url
      next[name] = typeof image === 'string' && image ? image : null
    }
    overlays.value = next
  } catch {
    const next = { ...overlays.value }
    for (const name of names) next[name] = next[name] ?? null
    overlays.value = next
  } finally {
    for (const name of names) inFlight.delete(name)
  }
}

export function loadOverlay(username: string) {
  const name = norm(username)
  if (!name || overlays.value[name] !== undefined || pending.has(name) || inFlight.has(name)) return
  pending.add(name)
  timer ??= setTimeout(flush, 40)
}

export function setOverlay(username: string, image: string | null) {
  const name = norm(username)
  if (!name) return
  overlays.value = { ...overlays.value, [name]: image }
}

export async function refreshOverlay(username: string) {
  const name = norm(username)
  if (!name || inFlight.has(name)) return
  pending.delete(name)
  if (!pending.size && timer) {
    clearTimeout(timer)
    timer = undefined
  }
  inFlight.add(name)
  try {
    const response = await fetch(`${config.roturApi}/v2/profiles/cosmetics`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [name] }),
    })
    const data = response.ok ? ((await response.json()) as Record<string, OverlayAnswer>) : {}
    const image = data?.[name]?.active_cosmetics?.overlay?.image_url
    setOverlay(name, typeof image === 'string' && image ? image : null)
  } finally {
    inFlight.delete(name)
  }
}
