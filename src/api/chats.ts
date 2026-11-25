import { signal } from '@preact/signals'
import { Socket } from '../platform/socket'
import { note } from '../state/toasts'
import { prefs } from '../state/prefs'
import {
  ROTUR,
  bare,
  ensureFresh,
  hasSecure,
  meName,
  signedIn,
  validator,
} from './rotur'
import { isSealed, seal } from './e2ee'
import { secure, sign } from './secure'

export interface Channel {
  name: string
  type?: string
  display_name?: string
  last_message?: number
}

export interface Attachment {
  id?: string
  name?: string
  filename?: string
  mime_type?: string
  content_type?: string
  size?: number
  url?: string
  width?: number
  height?: number
}

export interface Embed {
  type?: string
  title?: string
  description?: string
  url?: string
  color?: number | string
  timestamp?: string
  author?: { name?: string; url?: string; icon_url?: string }
  footer?: { text?: string; icon_url?: string }
  fields?: Array<{ name?: string; value?: string; inline?: boolean }>
  image?: { url?: string; width?: number; height?: number }
  thumbnail?: { url?: string; width?: number; height?: number }
  video?: { url?: string }
  poll?: {
    question?: string
    options?: Array<{ text?: string; votes?: number; voted?: boolean }>
    total_votes?: number
  }
}

export interface Message {
  id?: string | number
  user?: string
  content?: string
  timestamp?: number
  edited_at?: number
  signed_at?: number
  author_id?: string
  key_id?: string
  signature?: string
  attachments?: Array<Attachment | string>
  embeds?: Embed[]
  reply_to?: { id?: string; user?: string } | string
  thread_id?: string
  thread?: string
  [key: string]: unknown
}

export interface ChatsState {
  channels: Channel[]
  threads: Map<string, Message[]>
  active: string | null
  connected: boolean
  status: string
  version: number
}

export const chats = signal<ChatsState>({
  channels: [],
  threads: new Map(),
  active: null,
  connected: false,
  status: 'Offline',
  version: 0,
})

const SYSTEM = new Set([
  'cmds',
  'separator',
  'system',
  'home',
  'relationships',
  'shop',
  'discovery',
  'new_message',
])

const READ = 'nova.chats.read'
let read: Record<string, number> = (() => {
  try {
    return JSON.parse(localStorage.getItem(READ) || '{}')
  } catch {
    return {}
  }
})()

function patch(next: Partial<ChatsState>) {
  chats.value = { ...chats.value, ...next }
}

export function bump() {
  patch({ version: chats.value.version + 1 })
}

let socket: Socket | null = null
let ready = false
const queue: unknown[] = []
let activeValidatorKey = ''
let signingUrl = ''
let canSign = false
let cracked = false
let pendingDm: (() => void) | null = null
let pendingTimer: ReturnType<typeof setTimeout> | undefined
let lastAsked: string | null = null
let clockBase: number | null = null
let clockAt = 0
let offset = 0
let bestRtt = Infinity

const toMs = (value: number) => (value < 1e12 ? value * 1000 : value)

const serverNow = () =>
  clockBase != null ? clockBase + (performance.now() - clockAt) / 1000 : Date.now() / 1000 + offset

function send(message: unknown) {
  if (ready && socket?.open) socket.send(message)
  else queue.push(message)
}

function flush() {
  while (ready && socket?.open && queue.length) socket.send(queue.shift())
}

const PAGE = 100
const more = new Map<string, boolean>()

function setThread(channel: string, messages: Message[], append = false) {
  const threads = new Map(chats.value.threads)
  const seen = new Set<string>()
  const out: Message[] = []
  for (const message of append ? messages : [...(threads.get(channel) || []), ...messages]) {
    const key =
      message?.id != null ? `i${message.id}` : `${message?.user}|${message?.timestamp}|${message?.content}`
    if (message && !seen.has(key)) {
      seen.add(key)
      out.push(message)
    }
  }
  out.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
  threads.set(channel, out.slice(-3000))
  patch({ threads })
}

function markRead(channel: string) {
  const last = (chats.value.threads.get(channel) || []).at(-1)
  read[channel] = last?.timestamp ? toMs(last.timestamp) : Date.now()
  try {
    localStorage.setItem(READ, JSON.stringify(read))
  } catch {
    /* storage can be unavailable */
  }
  bump()
}

function timestampOf(value: unknown) {
  const timestamp = Number(value || 0)
  return timestamp < 1e12 ? timestamp * 1000 : timestamp
}

function unread(channel: string) {
  const since = read[channel] || 0
  const thread = chats.value.threads.get(channel) || []
  const count = thread.filter(message => timestampOf(message.timestamp) > since && bare(message.user) !== bare(meName())).length
  if (count) return count
  const channelInfo = chats.value.channels.find(item => item.name === channel)
  return timestampOf(channelInfo?.last_message) > since && !chats.value.threads.has(channel) ? 1 : 0
}

export const totalUnread = () =>
  chats.value.channels.reduce(
    (total, channel) =>
      total + (channel.name === chats.value.active && document.visibilityState === 'visible' ? 0 : unread(channel.name)),
    0,
  )

export const channelTitle = (channel?: Channel) => channel?.display_name || 'Direct message'

function dmFailed() {
  note({
    title: "Couldn't start that chat",
    text: 'They need to open Messages in Warpdrive or sign in to originchats.com once first.',
    bad: true,
  })
}

function ensureSocket() {
  if (socket) return socket
  socket = new Socket({
    url: ROTUR.chats,
    onDown: () => {
      ready = false
      patch({ connected: false, status: 'Offline' })
    },
    async onFrame(message: any, connection) {
      switch (message.cmd) {
        case 'handshake': {
          const value = message.val || {}
          activeValidatorKey = value.validator_key || ''
          signingUrl = value.signing_url || ''
          const capabilities: string[] = Array.isArray(value.capabilities) ? value.capabilities : []
          canSign = !!signingUrl && (capabilities.includes('message_signatures_v1') || !capabilities.some(cap => /signature/.test(cap)))
          if (typeof value.server_time === 'number') {
            clockBase = value.server_time < 1e12 ? value.server_time : value.server_time / 1000
            clockAt = performance.now()
          }
          void auth(connection)
          return
        }
        case 'auth_error':
          patch({ status: 'Sign-in to messages failed: ' + (message.val || '') })
          if (/invalid|expired/i.test(String(message.val || '')))
            void ensureFresh(true).then(fresh => {
              if (!fresh) return
              socket?.close()
              chatsApi.connect()
            })
          return
        case 'ready':
          cracked = !!message.user?.cracked
          ready = true
          patch({ connected: true, status: 'Connected' })
          connection.send({ cmd: 'channels_get' })
          if (chats.value.active) send({ cmd: 'messages_get', channel: chats.value.active, limit: PAGE })
          flush()
          for (let index = 0; index < 3; index++)
            setTimeout(() => connection.send({ cmd: 'ping', sent_at: Date.now() / 1000 }), 300 + index * 1500)
          return
        case 'ping': {
          const now = Date.now() / 1000
          const rtt = now - message.sent_at - ((message.server_sent_at ?? 0) - (message.server_received_at ?? 0))
          if (message.sent_at && message.server_received_at && rtt >= 0 && rtt < 5 && rtt < bestRtt) {
            bestRtt = rtt
            offset = (message.server_received_at - message.sent_at + (message.server_sent_at - now)) / 2
            clockBase = null
          }
          return
        }
        case 'channels_get': {
          const channels = (message.val || []).filter(
            (channel: Channel) =>
              channel?.name && !SYSTEM.has(channel.name) && channel.type !== 'separator' && channel.type !== 'system',
          )
          patch({ channels })
          if (pendingDm) {
            const callback = pendingDm
            pendingDm = null
            callback()
          }
          return
        }
        case 'messages_get': {
          let got: Message[] = []
          if (Array.isArray(message.messages)) got = message.messages
          else if (Array.isArray(message.val)) got = message.val
          const channel = chats.value.channels.some(item => item.name === message.channel)
            ? message.channel
            : lastAsked || message.channel
          more.set(channel, got.length >= PAGE)
          setThread(channel, got)
          bump()
          return
        }
        case 'message_new': {
          const incoming: Message = { ...message.message }
          if (typeof message.thread_id === 'string' && !incoming.thread_id) incoming.thread_id = message.thread_id
          const list = [...(chats.value.threads.get(message.channel) || []), incoming]
          setThread(message.channel, list, true)
          const channels = chats.value.channels.map(channel =>
            channel.name === message.channel ? { ...channel, last_message: incoming?.timestamp } : channel,
          )
          patch({ channels })
          const from = incoming?.user
          if (from && bare(from) !== bare(meName()) && message.channel !== chats.value.active) {
            const channel = channels.find(item => item.name === message.channel)
            note({
              title: channel?.display_name || from,
              text: isSealed(incoming.content) ? 'Encrypted message' : incoming.content || 'New message',
              username: channel?.display_name || from,
            })
          }
          if (message.channel === chats.value.active) markRead(message.channel)
          bump()
          return
        }
        case 'success':
          connection.send({ cmd: 'channels_get' })
          return
        case 'error': {
          if (/authentication required|not authenticated/i.test(String(message.val))) {
            ready = false
            return
          }
          if (pendingDm) {
            pendingDm = null
            clearTimeout(pendingTimer)
            dmFailed()
          } else if (!/unknown comm?and/i.test(String(message.val))) {
            note({ title: 'Message not sent', text: String(message.val || 'Error'), bad: true })
          }
          return
        }
      }
    },
  })
  return socket
}

async function auth(connection: Socket) {
  if (!signedIn() || !activeValidatorKey) {
    patch({ status: 'Not signed in' })
    return
  }
  try {
    connection.send({ cmd: 'auth', validator: await validator(activeValidatorKey) })
  } catch (error) {
    patch({
      status: /permission/i.test((error as Error).message)
        ? 'Messages need the validators permission. Sign in again.'
        : 'Sign-in to messages failed: ' + (error as Error).message,
    })
    note({ title: 'Messages could not sign in', text: (error as Error).message, bad: true })
  }
}

export const chatsApi = {
  state: chats,

  connect() {
    if (!signedIn()) return
    patch({ status: 'Connecting…' })
    ensureSocket().connect()
  },

  disconnect() {
    ready = false
    queue.length = 0
    socket?.close()
    patch({ channels: [], threads: new Map(), active: null, connected: false, status: 'Offline' })
  },

  open(channel: string) {
    markRead(channel)
    patch({ active: channel })
    if (chats.value.threads.has(channel)) return
    send({ cmd: 'messages_get', channel, limit: PAGE })
    lastAsked = channel
  },

  loadOlder(channel = chats.value.active) {
    const oldest = (chats.value.threads.get(channel || '') || [])[0]
    if (!channel || !oldest?.id || more.get(channel) === false) return false
    lastAsked = channel
    send({ cmd: 'messages_get', channel, start: String(oldest.id), limit: PAGE })
    return true
  },

  hasOlder: (channel: string | null) => !!channel && more.get(channel) !== false,

  async send(text: string, plain = false) {
    const content = (text || '').trim()
    const channel = chats.value.active
    if (!content || !channel) return
    const info = chats.value.channels.find(item => item.name === channel)
    let body = content
    if (!plain && info?.type !== 'group') {
      const other = channelTitle(info)
      body = await seal(content, other, channel, signingUrl)
    }
    const message: Record<string, unknown> = { cmd: 'message_new', channel, content: body }
    if (chatsApi.signing().on) {
      try {
        const timestamp = serverNow()
        Object.assign(message, { timestamp }, await sign(body, [], timestamp, signingUrl))
      } catch (error) {
        note({ title: 'Sent without a signature', text: (error as Error).message, bad: true })
      }
    }
    send(message)
  },

  signing() {
    if (!hasSecure()) return { on: false, reason: 'Message security is off', fix: true }
    if (prefs.value.signMessages === false) return { on: false, reason: 'Signing is turned off in Account settings' }
    if (secure.keyState.value === 'denied')
      return { on: false, reason: "Rotur didn't give Warpdrive your signing key. Sign in again and allow it.", fix: true }
    if (secure.keyState.value === 'unsupported')
      return { on: false, reason: 'This WebView is too old to sign. Update Android System WebView.' }
    if (cracked) return { on: false, reason: 'This chat account is not a Rotur account' }
    if (!ready) return { on: false, reason: 'Connecting…' }
    if (!canSign) return { on: false, reason: "This chat server doesn't accept signatures" }
    return { on: true, reason: '' }
  },

  signingUrl: () => signingUrl,
  signs: () => canSign,
  changed: bump,
  unread,
  markRead,
  totalUnread,
  title: channelTitle,

  startDM(user: string) {
    const existing = chats.value.channels.find(
      channel => channel.type !== 'group' && bare(channel.display_name) === bare(user),
    )
    if (existing) {
      chatsApi.open(existing.name)
      return existing.name
    }
    if (!chats.value.connected) {
      note({ title: 'Messages are still connecting', text: 'Try again in a moment.', bad: true })
      return null
    }
    send({ cmd: 'message_new', channel: 'cmds', content: `dm add ${user}` })
    pendingDm = () => {
      clearTimeout(pendingTimer)
      const channel = chats.value.channels.find(
        item => item.type !== 'group' && bare(item.display_name) === bare(user),
      )
      if (channel) chatsApi.open(channel.name)
    }
    pendingTimer = setTimeout(() => {
      if (pendingDm) {
        pendingDm = null
        dmFailed()
      }
    }, 6000)
    return null
  },
}
