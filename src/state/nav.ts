import { computed, signal } from '@preact/signals'
import { play } from '../platform/sound'
import { warp } from '../platform/warp'

export type ScreenId = 'home' | 'apps' | 'settings' | 'friends' | 'messages'
export type LayerId = 'quick' | 'dialog'
export type Prompt = [keys: string, label: string]

export const SCREEN_META: Record<ScreenId, { name: string; icon: string }> = {
  home: { name: 'Home', icon: 'home' },
  apps: { name: 'Apps', icon: 'apps' },
  settings: { name: 'System Settings', icon: 'settings' },
  friends: { name: 'Friends', icon: 'friends' },
  messages: { name: 'Messages', icon: 'messages' },
}

export const screen = signal<ScreenId>('home')
export const layers = signal<LayerId[]>([])
export const topLayer = computed(() => layers.value.at(-1) ?? null)
export const prompts = signal<Prompt[]>([])

let promptProvider: () => Prompt[] = () => [
  ['b', 'Back'],
  ['a', 'OK'],
]

export function setPromptProvider(provider: () => Prompt[]) {
  promptProvider = provider
}

export function updatePrompts() {
  prompts.value = promptProvider()
}

const screenPrompts: Partial<Record<ScreenId, (el: HTMLElement | null) => Prompt[]>> = {}
const backHandlers: Partial<Record<ScreenId, () => boolean>> = {}
const shoulderHandlers: Partial<Record<ScreenId, (direction: -1 | 1) => void>> = {}
const scrollers: Partial<Record<ScreenId, () => HTMLElement | null>> = {}

export function setScreenPrompts(id: ScreenId, fn: (el: HTMLElement | null) => Prompt[]) {
  screenPrompts[id] = fn
}

export function setBackHandler(id: ScreenId, fn: () => boolean) {
  backHandlers[id] = fn
}

export function setShoulderHandler(id: ScreenId, fn: (direction: -1 | 1) => void) {
  shoulderHandlers[id] = fn
}

export function setScroller(id: ScreenId, fn: () => HTMLElement | null) {
  scrollers[id] = fn
}

export function screenPromptsFor(id: ScreenId, el: HTMLElement | null): Prompt[] {
  return screenPrompts[id]?.(el) ?? [
    ['b', 'Back'],
    ['a', 'OK'],
  ]
}

export function backFor(id: ScreenId): boolean {
  return backHandlers[id]?.() ?? false
}

export function shoulderFor(id: ScreenId, direction: -1 | 1) {
  shoulderHandlers[id]?.(direction)
}

function byId(id: string) {
  return document.getElementById(id)
}

function scopeElements(): HTMLElement[] {
  const top = topLayer.value
  if (top === 'dialog') {
    const el = byId('dialog')
    return el ? [el] : []
  }
  if (top === 'quick') {
    const el = byId('quick')
    return el ? [el] : []
  }
  const el = byId(`screen-${screen.value}`)
  if (!el) return []
  return screen.value === 'home' ? [document.querySelector('header.top') as HTMLElement, el].filter(Boolean) : [el]
}

export function navItems(): HTMLElement[] {
  return scopeElements()
    .flatMap(scope => [...scope.querySelectorAll<HTMLElement>('[data-nav]')])
    .filter(el => el.offsetParent !== null && !el.closest('[hidden]') && !el.hasAttribute('disabled'))
}

export function current(): HTMLElement | null {
  const el = document.activeElement as HTMLElement | null
  if (!el || !navItems().includes(el)) return null
  return el
}

function zoneOf(el: HTMLElement): HTMLElement {
  return (el.closest('[data-zone]') as HTMLElement | null) ?? (el.closest('.layer, .screen, .top') as HTMLElement)
}

function scopeOf(el: HTMLElement): HTMLElement {
  return (el.closest('.layer') as HTMLElement | null) ?? (el.closest('.screen') as HTMLElement) ?? byId('screen-home')!
}

const memory = new WeakMap<HTMLElement, HTMLElement>()
let lastSpot: { scope: HTMLElement; zone: HTMLElement; x: number; y: number } | null = null

const center = (rect: DOMRect) => ({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })

function scrollerOf(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement; node && node !== document.body; node = node.parentElement) {
    const overflow = getComputedStyle(node).overflowY
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight + 1) return node
  }
  return null
}

function reveal(el: HTMLElement) {
  const row = el.closest('.row-games')
  if (row) {
    row.scrollTo({
      left: Math.max(0, el.offsetLeft - row.clientWidth * 0.08),
      behavior: document.body.classList.contains('reduce') ? 'auto' : 'smooth',
    })
    return
  }
  const box = scrollerOf(el)
  if (!box) return
  const items = [...box.querySelectorAll<HTMLElement>('[data-nav]')].filter(
    item => item.offsetParent !== null && !item.closest('[hidden]'),
  )
  if (el === items[0]) box.scrollTop = 0
  else if (el === items.at(-1)) box.scrollTop = box.scrollHeight
  else el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
}

let lastTick = 0

export function focus(el: HTMLElement | null, quiet = false, scroll = true) {
  if (!el) return
  const moved = document.activeElement !== el
  el.focus({ preventScroll: true })
  memory.set(zoneOf(el), el)
  memory.set(scopeOf(el), el)
  if (scroll) reveal(el)
  lastSpot = { scope: scopeOf(el), zone: zoneOf(el), ...center(el.getBoundingClientRect()) }
  el.dispatchEvent(new CustomEvent('navfocus', { bubbles: true }))
  if (moved && !quiet) {
    play('move')
    const now = performance.now()
    if (now - lastTick > 70) {
      lastTick = now
      void warp.call('system.haptics.tick').catch(() => {})
    }
  }
  updatePrompts()
}

function closestTo(items: HTMLElement[], spot: { zone: HTMLElement; x: number; y: number }): HTMLElement | null {
  const inZone = items.filter(item => zoneOf(item) === spot.zone)
  let best: HTMLElement | null = null
  let bestDistance = Infinity
  for (const el of inZone.length ? inZone : items) {
    const point = center(el.getBoundingClientRect())
    const distance = Math.hypot(point.x - spot.x, point.y - spot.y)
    if (distance < bestDistance) {
      bestDistance = distance
      best = el
    }
  }
  return best
}

export function enter() {
  const items = navItems()
  const scope = scopeElements().at(-1)
  if (!scope) return
  const remembered = memory.get(scope)
  if (remembered && items.includes(remembered)) return focus(remembered, true)
  if (lastSpot?.scope === scope && items.length) return focus(closestTo(items, lastSpot), true)
  focus(items.find(item => item.hasAttribute('data-autofocus')) ?? items[0], true)
}

function pick(currentEl: HTMLElement, direction: 'left' | 'right' | 'up' | 'down', list: HTMLElement[]) {
  const a = currentEl.getBoundingClientRect()
  const ac = center(a)
  const horizontal = direction === 'left' || direction === 'right'
  let best: HTMLElement | null = null
  let bestScore = Infinity

  for (const el of list) {
    if (el === currentEl) continue
    const b = el.getBoundingClientRect()
    const bc = center(b)
    let gap: number
    let ahead: boolean
    if (direction === 'right') {
      gap = b.left - a.right
      ahead = bc.x > ac.x + 1 && gap > -0.3 * Math.min(a.width, b.width)
    } else if (direction === 'left') {
      gap = a.left - b.right
      ahead = bc.x < ac.x - 1 && gap > -0.3 * Math.min(a.width, b.width)
    } else if (direction === 'down') {
      gap = b.top - a.bottom
      ahead = bc.y > ac.y + 1 && gap > -0.3 * Math.min(a.height, b.height)
    } else {
      gap = a.top - b.bottom
      ahead = bc.y < ac.y - 1 && gap > -0.3 * Math.min(a.height, b.height)
    }
    if (!ahead) continue
    const overlap = horizontal
      ? Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
      : Math.min(a.right, b.right) - Math.max(a.left, b.left)
    const offset = horizontal ? Math.abs(bc.y - ac.y) : Math.abs(bc.x - ac.x)
    const score = Math.max(gap, 0) + (overlap > 0 ? 0 : 60 - overlap * 4) + offset * 0.25
    if (score < bestScore) {
      bestScore = score
      best = el
    }
  }
  return best
}

function firstVisible(zone: HTMLElement, pool: HTMLElement[]) {
  const box = scrollerOf(zone) ?? zone
  const rect = box.getBoundingClientRect()
  const items = pool.filter(item => zoneOf(item) === zone)
  return (
    items.find(item => {
      const b = item.getBoundingClientRect()
      return b.top >= rect.top - 1 && b.bottom <= rect.bottom + 1
    }) ?? items[0]
  )
}

export function move(direction: 'left' | 'right' | 'up' | 'down') {
  const active = current()
  if (!active) return enter()
  active.dispatchEvent(new CustomEvent('navleave', { bubbles: true, detail: direction }))
  const pool = navItems()
  const myZone = zoneOf(active)

  const named = active.dataset[`nav${direction[0].toUpperCase()}${direction.slice(1)}` as keyof DOMStringMap]
  if (named) {
    const target = named
      .split(',')
      .map(selector => document.querySelector<HTMLElement>(selector.trim()))
      .find(el => el && pool.includes(el))
    if (target) return focus(target)
  }

  let best: HTMLElement | null = null
  if (direction === 'up' || direction === 'down') {
    best = pick(active, direction, pool.filter(el => zoneOf(el) === myZone))
    if (!best) {
      const mine = myZone.getBoundingClientRect()
      best = pick(
        active,
        direction,
        pool.filter(el => {
          const rect = zoneOf(el).getBoundingClientRect()
          return Math.min(rect.right, mine.right) - Math.max(rect.left, mine.left) > 0
        }),
      )
    }
  } else {
    best = pick(active, direction, pool)
  }
  if (!best) return

  const zone = zoneOf(best)
  if (zone !== myZone) {
    const remembered = memory.get(zone)
    if (remembered && remembered.isConnected && pool.includes(remembered)) best = remembered
    else if (zone.dataset.enter === 'first') best = firstVisible(zone, pool) ?? best
  }
  focus(best)
}

export function pushLayer(id: LayerId) {
  layers.value = [...layers.value, id]
  updatePrompts()
  requestAnimationFrame(enter)
}

export function popLayer(id: LayerId) {
  layers.value = layers.value.filter(value => value !== id)
  updatePrompts()
  requestAnimationFrame(enter)
}

export function go(id: ScreenId) {
  if (screen.value === id) return
  screen.value = id
  updatePrompts()
  requestAnimationFrame(enter)
}

function activeScroller() {
  if (!topLayer.value) {
    const scroller = scrollers[screen.value]?.()
    if (scroller) return scroller
  }
  const el = current()
  return el ? scrollerOf(el) : null
}

function scrollIn(box: HTMLElement | null, delta: number) {
  if (!box || !delta) return
  const before = box.scrollTop
  box.scrollTop += delta
  if (box.scrollTop === before) return
  const el = current()
  if (!el || !box.contains(el)) return
  const rect = box.getBoundingClientRect()
  const b = el.getBoundingClientRect()
  if (b.top >= rect.top && b.bottom <= rect.bottom) return
  const inView = [...box.querySelectorAll<HTMLElement>('[data-nav]')].filter(item => {
    if (item.offsetParent === null || item.closest('[hidden]')) return false
    const q = item.getBoundingClientRect()
    return q.top >= rect.top && q.bottom <= rect.bottom
  })
  if (inView.length) focus(delta > 0 ? inView[0] : inView.at(-1)!, true, false)
}

export function pageScroll(direction: -1 | 1) {
  const box = activeScroller()
  if (box) scrollIn(box, direction * box.clientHeight * 0.8)
}

let stickY = 0
let stickFrame = 0

function onStick(st: { ry: number }) {
  stickY = Math.abs(st.ry) > 0.2 ? st.ry : 0
  if (!stickY || stickFrame) return
  let last = performance.now()
  const step = (now: number) => {
    if (!stickY) {
      stickFrame = 0
      return
    }
    const elapsed = Math.min(50, now - last)
    last = now
    const value = (Math.abs(stickY) - 0.2) / 0.8
    scrollIn(activeScroller(), Math.sign(stickY) * value * value * 1.6 * elapsed)
    stickFrame = requestAnimationFrame(step)
  }
  stickFrame = requestAnimationFrame(step)
}

let stopStick: (() => void) | null = null

function listenStick(on: boolean) {
  if (on && !stopStick) stopStick = warp.on('input.stick', value => onStick(value as { ry: number }))
  if (!on && stopStick) {
    stopStick()
    stopStick = null
    stickY = 0
  }
}

export function syncStick() {
  listenStick(screen.value !== 'home')
}

function updateFade(box: HTMLElement | null) {
  if (!box?.classList?.contains('fades')) return
  const up = box.scrollTop > 2
  const down = box.scrollTop + box.clientHeight < box.scrollHeight - 2
  box.dataset.fade = `${up ? 'up ' : ''}${down ? 'down' : ''}`
}

function updateFades() {
  document.querySelectorAll<HTMLElement>('.fades').forEach(updateFade)
}

let focusCheck = 0

function ensureFocus() {
  if (focusCheck) return
  focusCheck = requestAnimationFrame(() => {
    focusCheck = 0
    if (!current()) enter()
  })
}

/** DOM listeners that keep keyboard focus and scroll fades healthy. */
export function installNav() {
  const onScroll = (event: Event) => updateFade(event.target as HTMLElement)
  const onFocusOut = (event: FocusEvent) => {
    if (!event.relatedTarget) ensureFocus()
  }
  const observer = new MutationObserver(() => {
    ensureFocus()
    requestAnimationFrame(updateFades)
  })
  const resize = new ResizeObserver(updateFades)
  const onVisibility = () => {
    if (!document.hidden) ensureFocus()
  }

  document.addEventListener('scroll', onScroll, true)
  document.addEventListener('focusout', onFocusOut)
  observer.observe(document.body, { childList: true, subtree: true })
  resize.observe(document.body)
  document.addEventListener('visibilitychange', onVisibility)
  addEventListener('focus', ensureFocus)
  updateFades()

  return () => {
    document.removeEventListener('scroll', onScroll, true)
    document.removeEventListener('focusout', onFocusOut)
    observer.disconnect()
    resize.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
    removeEventListener('focus', ensureFocus)
    stopStick?.()
    stopStick = null
    if (stickFrame) cancelAnimationFrame(stickFrame)
  }
}
