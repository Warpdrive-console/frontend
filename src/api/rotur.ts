import { signal } from '@preact/signals'
import { config } from '../config'
import { Socket } from '../platform/socket'
import { note } from '../state/toasts'
import { pollLink, refreshRotur, restore as restoreBackend, signOut as signOutBackend, startLink } from './backend'
import { refreshOverlay, setOverlay } from './avatars'
import { chatsApi } from './chats'

export const ROTUR = {
  api: config.roturApi,
  status: 'wss://api.rotur.dev/status/ws',
  chats: 'wss://dms.originchats.com',
  avatars: 'https://avatars.rotur.dev',
}

export interface RoturUser {
  username?: string
  display_name?: string
  nickname?: string
  bio?: string
  created?: number
  followers?: number | unknown[]
  following?: number | unknown[]
  pronouns?: string
  subscription?: string
  [key: string]: unknown
}

export type Friend = string | { username?: string; name?: string }

export interface RoturState {
  token: string
  username: string
  user: RoturUser | null
  friends: Friend[]
  requests: Friend[]
  online: Set<string>
  presence: Record<string, string>
  linkCode: string
  loginStatus: string
  connected: boolean
}

const TOKEN = 'nova.rotur.token'
const USER = 'nova.rotur.user'
const GRANTS = 'nova.rotur.grants'
const SCOPES = 'nova.rotur.scopes'
const EXPIRES = 'nova.rotur.expires'
const REASON = 'nova.rotur.reason'
const QUERY_AUTH = 'nova.rotur.queryauth'

const PERMISSIONS =
  'account:view,account:profile,friends:view,friends:request,friends:accept,friends:remove,friends:cancel,validators:generate,encryption:keys'
const SECURE = ',signing:private'
const secureOn = () => localStorage.getItem('nova.rotur.secure') !== '0'
const wanted = () => PERMISSIONS + (secureOn() ? SECURE : '')

if (localStorage.getItem(TOKEN) && !(localStorage.getItem(GRANTS) || '').startsWith(PERMISSIONS)) {
  localStorage.removeItem(TOKEN)
  localStorage.setItem(REASON, 'Warpdrive needs a few more permissions now. Please sign in again.')
}

export const rotur = signal<RoturState>({
  token: localStorage.getItem(TOKEN) || '',
  username: localStorage.getItem(USER) || '',
  user: null,
  friends: [],
  requests: [],
  online: new Set(),
  presence: {},
  linkCode: '',
  loginStatus: localStorage.getItem(REASON) || '',
  connected: false,
})

export function bare(name: unknown): string {
  if (name && typeof name === 'object') {
    const value = name as { username?: string; name?: string }
    name = value.username || value.name || ''
  }
  return String(name ?? '')
    .split('§')[0]
    .replace(/^[a-zA-Z]+-/, '')
    .toLowerCase()
}

export const nameOf = (friend: Friend) =>
  typeof friend === 'string' ? friend : friend.username || friend.name || String(friend)

export const avatarUrl = (user: string | null | undefined, size = 96) =>
  user ? `${ROTUR.avatars}/${encodeURIComponent(user)}?radius=128&s=${size}` : 'assets/avatar.svg'

export const signedIn = () => !!rotur.value.token
export const hasSecure = () =>
  !!rotur.value.token &&
  secureOn() &&
  (localStorage.getItem(SCOPES) || localStorage.getItem(GRANTS) || '').includes('signing:private')
export const wantsSecure = secureOn
export const meName = () => rotur.value.username
export const displayName = () =>
  (rotur.value.user?.display_name || rotur.value.user?.nickname || rotur.value.username || 'Guest').trim()
export const presenceOf = (name: string) => rotur.value.presence[bare(name)] || 'offline'
export const isOnline = (name: string) => rotur.value.online.has(bare(name))
export const onlineCount = () =>
  rotur.value.friends.filter(friend => rotur.value.online.has(bare(friend))).length

function patch(next: Partial<RoturState>) {
  rotur.value = { ...rotur.value, ...next }
}

export function applyToken(token: string, expiresAt?: number) {
  localStorage.setItem(TOKEN, token)
  if (expiresAt) localStorage.setItem(EXPIRES, String(expiresAt * 1000))
  patch({ token })
}

let queryAuth = localStorage.getItem(QUERY_AUTH) === '1'
let refreshing: Promise<{ token: string; expires_at: number } | null> | null = null

export async function ensureFresh(force = false): Promise<string> {
  const expires = Number(localStorage.getItem(EXPIRES) || 0)
  if (!force && (!expires || Date.now() < expires - 120_000)) return rotur.value.token
  if (!refreshing)
    refreshing = refreshRotur().finally(() => {
      refreshing = null
    })
  const fresh = await refreshing
  if (!fresh?.token) return rotur.value.token
  applyToken(fresh.token, fresh.expires_at)
  return fresh.token
}

async function authFetch(
  url: string,
  options: { method?: string; body?: unknown; cache?: RequestCache; headers?: Record<string, string> } = {},
  retried = false,
): Promise<Response> {
  const token = await ensureFresh()
  const withQuery = () =>
    fetch(`${url}${url.includes('?') ? '&' : '?'}auth=${encodeURIComponent(token)}`, {
      method: options.method ?? 'GET',
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      headers: {
        ...(options.body === undefined ? {} : { 'Content-Type': 'text/plain' }),
        ...options.headers,
      },
      cache: options.cache,
    })

  if (queryAuth || !token)
    return token ? withQuery() : fetch(url, { method: options.method ?? 'GET', headers: options.headers, cache: options.cache })

  try {
    const response = await fetch(url, {
      method: options.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...options.headers,
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      cache: options.cache,
    })
    if (!retried && (response.status === 401 || response.status === 403)) {
      const text = await response.clone().text().catch(() => '')
      if (/invalid authentication|invalid key|expired/i.test(text)) {
        const fresh = await ensureFresh(true)
        if (fresh && fresh !== token) return authFetch(url, options, true)
      }
    }
    return response
  } catch (error) {
    if (!(error instanceof TypeError)) throw error
    queryAuth = true
    localStorage.setItem(QUERY_AUTH, '1')
    return withQuery()
  }
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown; cache?: RequestCache; headers?: Record<string, string> } = {},
): Promise<T> {
  const response = await authFetch(ROTUR.api + path, options)
  let data: unknown = null
  try {
    data = await response.json()
  } catch {
    /* no body */
  }
  if (!response.ok || (data && typeof data === 'object' && 'error' in data && (data as { error: unknown }).error)) {
    const message =
      data && typeof data === 'object' && 'error' in data ? String((data as { error: unknown }).error) : `HTTP ${response.status}`
    if (
      response.status === 403 &&
      /lacks permission|invalid authentication|invalid key|banned/i.test(message) &&
      !/encryption:keys/i.test(message)
    ) {
      signedOut(
        /lacks permission/i.test(message)
          ? `This sign-in doesn't allow ${(message.match(/lacks permission:\s*(.+)$/i) || [])[1] || 'what Warpdrive needs'}. Sign in again and approve every permission it shows.`
          : 'Your Rotur sign-in expired. Please sign in again.',
      )
    }
    const error = new Error(message) as Error & { status?: number; code?: string }
    error.status = response.status
    if (data && typeof data === 'object' && 'code' in data) error.code = String((data as { code: unknown }).code)
    throw error
  }
  return data as T
}

let firstRequests = true
function setRequests(list: Friend[]) {
  if (!Array.isArray(list)) return
  const had = rotur.value.requests.map(nameOf)
  const fresh = list.map(nameOf).filter(name => name && !had.includes(name))
  patch({ requests: list })
  if (!firstRequests)
    fresh.forEach(name => note({ title: 'Friend request', text: `${name} wants to be friends`, username: name }))
  firstRequests = false
}

function setFriends(list: Friend[]) {
  if (!Array.isArray(list)) return
  patch({ friends: list })
  watchFriends()
  void pollPresence()
}

export async function refresh() {
  if (!rotur.value.token) return
  try {
    const [user, friends, requests] = await Promise.all([
      api<RoturUser>('/me'),
      api<{ friends: Friend[] }>('/friends'),
      api<{ requests: Friend[] }>('/friends/requests'),
    ])
    patch({ user, username: user.username || rotur.value.username })
    localStorage.setItem(USER, rotur.value.username)
    setFriends(friends.friends)
    setRequests(requests.requests)
  } catch (error) {
    console.error(error)
  }
}

const ONLINE = new Set(['online', 'idle', 'dnd'])
const ids = new Map<string, string>()

function setPresence(name: string, presence: string, id?: string) {
  const normalized = bare(name)
  if (!normalized) return
  if (id) ids.set(id, normalized)
  const nextPresence = { ...rotur.value.presence, [normalized]: presence }
  const nextOnline = new Set(rotur.value.online)
  if (ONLINE.has(presence)) nextOnline.add(normalized)
  else nextOnline.delete(normalized)
  patch({ presence: nextPresence, online: nextOnline })
}

let presenceBusy = false
export async function pollPresence() {
  if (presenceBusy || !rotur.value.token) return
  presenceBusy = true
  try {
    // A safety net behind the socket's watch, and the only source for friends beyond its limit.
    const names = rotur.value.friends.map(nameOf)
    for (let index = 0; index < names.length; index += 6) {
      await Promise.all(
        names.slice(index, index + 6).map(async name => {
          try {
            const response = await authFetch(`${ROTUR.api}/v2/status/live?name=${encodeURIComponent(name)}`)
            setPresence(name, response.ok ? ((await response.json()).presence ?? 'offline') : 'offline')
          } catch {
            /* presence is best effort */
          }
        }),
      )
    }
  } finally {
    presenceBusy = false
  }
}

setInterval(() => {
  if (rotur.value.token && !document.hidden) void pollPresence()
}, 60_000)

/** Friends the status socket follows directly, which keeps their presence live. */
const watched = new Set<string>()
let statusReady = false

/** Watches up to the server's limit of 100 accounts; the HTTP poll covers any beyond it. */
function watchFriends() {
  if (!statusReady) return
  const names = [...new Set(rotur.value.friends.map(nameOf).map(bare).filter(Boolean))].slice(0, 100)
  const next = new Set(names)
  const add = names.filter(name => !watched.has(name))
  const remove = [...watched].filter(name => !next.has(name))
  if (add.length) statusSocket.send({ cmd: 'watch', users: add })
  if (remove.length) statusSocket.send({ cmd: 'unwatch', users: remove })
  for (const name of add) watched.add(name)
  for (const name of remove) watched.delete(name)
}

const statusSocket = new Socket({
  url: ROTUR.status,
  heartbeat: () => ({ cmd: 'ping' }),
  onDown: () => {
    statusReady = false
    watched.clear()
    patch({ connected: false })
  },
  onOpen: socket => socket.send({ cmd: 'auth', key: rotur.value.token }),
  onFrame(message: any) {
    switch (message.cmd) {
      case 'ready':
        statusReady = true
        patch({ connected: true, username: message.username || rotur.value.username })
        watchFriends()
        return
      case 'room_state':
        for (const member of message.members ?? [])
          setPresence(member.username, member.presence || 'offline', member.user_id)
        return
      case 'watch_ok':
        for (const member of message.users ?? [])
          setPresence(member.username, member.presence || 'offline', member.user_id)
        return
      case 'member_join':
        setPresence(message.username, message.presence || 'online', message.user_id)
        return
      case 'member_leave': {
        const name = message.username || ids.get(message.user_id)
        if (name) setPresence(name, 'offline')
        return
      }
      case 'status_update':
      case 'presence_update':
      case 'activity_update': {
        const name = message.username || ids.get(message.user_id)
        if (name) setPresence(name, message.presence || 'online', message.user_id)
        return
      }
      case 'key_update':
        if (message.key === 'sys.friends') setFriends(message.value)
        if (message.key === 'sys.requests') setRequests(message.value)
        if (message.key === 'sys.overlay') {
          const name = message.username || ids.get(message.user_id)
          if (name) {
            if (typeof message.value === 'string' && message.value) setOverlay(name, message.value)
            else void refreshOverlay(name)
          }
        }
        return
      case 'profile_update':
        if (message.key === 'sys.overlay') {
          const name = message.username || ids.get(message.user_id)
          if (name) {
            if (typeof message.value === 'string' && message.value) setOverlay(name, message.value)
            else void refreshOverlay(name)
          }
        }
        return
      case 'error':
        if (/invalid key/i.test(message.message || ''))
          void ensureFresh(true).then(fresh => {
            if (!fresh) return
            statusSocket.close()
            statusSocket.connect()
          })
        return
    }
  },
})

let poll: ReturnType<typeof setInterval> | undefined
let starting = false
let refreshTimer: ReturnType<typeof setInterval> | undefined

export async function beginLogin() {
  if (starting) return
  starting = true
  patch({
    loginStatus:
      rotur.value.loginStatus.startsWith('Sign in again') || rotur.value.loginStatus.includes('permission')
        ? rotur.value.loginStatus
        : 'Getting a code…',
    linkCode: '',
  })
  try {
    const asked = wanted()
    const start = await startLink(secureOn())
    if (!start?.code) throw new Error((start as { error?: string })?.error || 'The server did not return a code')
    patch({
      linkCode: start.code,
      loginStatus:
        'Enter the code at rotur.dev/link and approve. "Read private signing key" lets Warpdrive sign your messages.',
    })
    const expires = Date.now() + (start.expires_in || 600) * 1000 - 5000
    clearInterval(poll)
    poll = setInterval(async () => {
      if (Date.now() > expires) {
        endLogin()
        patch({ linkCode: '' })
        void beginLogin()
        return
      }
      try {
        const result = await pollLink(start.code)
        if (result.status === 'pending') return
        if (result.status === 'denied') {
          endLogin()
          patch({ linkCode: '', loginStatus: result.error || 'The sign-in was turned down.' })
          return
        }
        if (result.status !== 'linked' || !result.rotur?.token) {
          endLogin()
          patch({ linkCode: '' })
          void beginLogin()
          return
        }
        endLogin()
        applyToken(result.rotur.token, result.rotur.expires_at)
        localStorage.setItem(GRANTS, asked)
        localStorage.setItem(SCOPES, result.rotur.scope || asked.replace(/,/g, ' '))
        localStorage.removeItem(REASON)
        patch({ username: result.user?.username || '', loginStatus: 'Signed in', linkCode: '' })
        void connect()
      } catch {
        /* keep polling */
      }
    }, 3000)
  } catch (error) {
    patch({ loginStatus: 'Could not reach the server. ' + (error as Error).message })
  } finally {
    starting = false
  }
}

export function endLogin() {
  clearInterval(poll)
  poll = undefined
}

export async function connect() {
  if (!rotur.value.token) return
  const restored = await restoreBackend()
  if (restored?.rotur?.token) applyToken(restored.rotur.token, restored.rotur.expires_at)
  void import('./e2ee')
    .then(async module => {
      await module.refreshRecovery()
      await module.setup()
    })
    .catch(error => console.warn('[e2ee] could not set up this console\'s key:', error))
  void refresh()
  statusSocket.connect()
  chatsApi.connect()
  clearInterval(refreshTimer)
  refreshTimer = setInterval(() => {
    if (rotur.value.token) void ensureFresh()
  }, 5 * 60 * 1000)
}

export function logout() {
  endLogin()
  clearInterval(refreshTimer)
  refreshTimer = undefined
  statusSocket.close()
  chatsApi.disconnect()
  void signOutBackend()
  localStorage.removeItem(TOKEN)
  localStorage.removeItem(USER)
  localStorage.removeItem(EXPIRES)
  localStorage.removeItem(SCOPES)
  localStorage.removeItem(REASON)
  firstRequests = true
  rotur.value = {
    token: '',
    username: '',
    user: null,
    friends: [],
    requests: [],
    online: new Set(),
    presence: {},
    linkCode: '',
    loginStatus: '',
    connected: false,
  }
}

export function signedOut(reason: string) {
  if (!rotur.value.token) return
  logout()
  localStorage.setItem(REASON, reason)
  patch({ loginStatus: reason })
  note({ title: 'Signed out of Rotur', text: reason, bad: true })
}

export function setSecure(on: boolean) {
  localStorage.setItem('nova.rotur.secure', on ? '1' : '0')
  if (on && !hasSecure()) {
    logout()
    localStorage.setItem('nova.rotur.secure', '1')
    patch({ loginStatus: 'Sign in again and keep "Read private signing key" ticked to turn on message security.' })
  }
}

export async function validator(key: string) {
  const result = await api<{ validator: string }>(`/v2/validators?key=${encodeURIComponent(key)}`, { method: 'POST' })
  return result.validator
}

const profiles = new Map<string, { at: number; value: RoturUser | null }>()
export async function profile(name: string): Promise<RoturUser | null> {
  const key = bare(name)
  const cached = profiles.get(key)
  if (cached && Date.now() - cached.at < 60_000) return cached.value
  let value: RoturUser | null = null
  try {
    const response = await authFetch(`${ROTUR.api}/profile?username=${encodeURIComponent(key)}&include_posts=0`)
    if (response.ok) {
      const data = await response.json()
      if (data && !data.error)
        value = {
          username: data.username || key,
          bio: (data.bio || '').trim(),
          pronouns: data.pronouns || '',
          created: data.created || 0,
          followers: Array.isArray(data.followers) ? data.followers.length : data.followers || 0,
          following: Array.isArray(data.following) ? data.following.length : data.following || 0,
          subscription: data.subscription || 'Free',
        }
    }
  } catch {
    /* profile is optional */
  }
  profiles.set(key, { at: Date.now(), value })
  return value
}

async function act(path: string, optimistic: (state: RoturState) => Partial<RoturState>) {
  const before = { friends: rotur.value.friends, requests: rotur.value.requests }
  patch(optimistic(rotur.value))
  try {
    await api(path, { method: 'POST' })
    setTimeout(() => void refresh(), 800)
    return null
  } catch (error) {
    patch(before)
    return (error as Error).message
  }
}

const without = (list: Friend[], name: string) => list.filter(friend => bare(nameOf(friend)) !== bare(name))

export const accept = (name: string) =>
  act(`/friends/accept/${encodeURIComponent(name)}`, state => ({
    requests: without(state.requests, name),
    friends: [...without(state.friends, name), name],
  }))

export const decline = (name: string) =>
  act(`/friends/reject/${encodeURIComponent(name)}`, state => ({ requests: without(state.requests, name) }))

export const remove = (name: string) =>
  act(`/friends/remove/${encodeURIComponent(name)}`, state => ({ friends: without(state.friends, name) }))

export async function request(name: string): Promise<string | null> {
  const clean = (name || '').trim()
  if (!clean) return 'Enter a username first.'
  if (bare(clean) === bare(rotur.value.username)) return "You can't add yourself."
  try {
    await api(`/friends/request/${encodeURIComponent(clean)}`, { method: 'POST' })
    setTimeout(() => void refresh(), 800)
    return null
  } catch (error) {
    return (error as Error).message
  }
}

