import { signal } from '@preact/signals'
import { backend } from '../backend'
import { api, bare, ROTUR, rotur } from '../rotur'
import { config } from '../../config'
import {
  b64,
  canonicalB64,
  encryptionKeyId,
  fromB64,
  generateKeyPair,
  isUsablePublicKey,
  keysMatch,
  parseSealed,
  sealMessage,
  type KeyPair,
  type PublicKeyRef,
  type SealedFile,
} from './envelope'

const STORE = 'nova.e2ee.keys'
const CACHE_MS = 60_000

/** Each Rotur account's keys stay apart, so one account can't use another's on a shared browser. */
const storeKey = () => {
  const name = rotur.value.username.toLowerCase()
  return name ? `${STORE}.${name}` : STORE
}

export interface StoredKey {
  privateKey: string
  createdAt: number
  retired?: true
}

type SavedKeys = Record<string, StoredKey>

interface RoturKey {
  key_id?: string
  public_key?: string
}

interface KeyList {
  user_id?: string
  username?: string
  keys?: RoturKey[]
}

export interface PublishedKeys {
  userId: string
  username: string
  keys: PublicKeyRef[]
}

/** Bumped when this device's keys change, so decryption can try again. */
export const keysVersion = signal(0)

/** What the account's Rotur backup holds, as far as this device knows. */
export const keyBackup = signal<'unknown' | 'none' | 'present'>('unknown')

/** The keys are backed up but this device has none of them yet. */
export const keysLocked = signal(false)

export class KeysLocked extends Error {
  constructor() {
    super('Your encryption keys are backed up. Enter your passphrase in Settings → Account to unlock them on this device.')
  }
}

const cache = new Map<string, { at: number; keys: Promise<PublishedKeys> }>()

function load(): SavedKeys {
  try {
    return JSON.parse(localStorage.getItem(storeKey()) || '{}') as SavedKeys
  } catch {
    return {}
  }
}

/** Keys kept before they were kept per account, from a version that had only one account. */
function legacyKeys(): SavedKeys | null {
  try {
    const value = localStorage.getItem(STORE)
    return value === null ? null : (JSON.parse(value) as SavedKeys)
  } catch {
    return null
  }
}

export function hasLegacyKeys(): boolean {
  return rotur.value.username !== '' && legacyKeys() !== null
}

/**
 * Moves keys kept before they were kept per account to this account, but only ones Rotur lists
 * for it, so a shared browser can't hand another account's keys over. Anything unmatched stays
 * for the account it belongs to.
 */
export function migrateLegacyKeys(published: PublicKeyRef[]): number {
  const legacy = legacyKeys()
  if (!legacy || !rotur.value.username || storeKey() === STORE) return 0

  const listed = new Set(published.map(key => b64(key.publicKey)))
  const current = load()
  let moved = 0
  for (const [publicKey, entry] of Object.entries(legacy)) {
    if (!listed.has(publicKey) || !isEntry(entry) || !matchesEntry(publicKey, entry)) continue
    current[publicKey] = entry
    delete legacy[publicKey]
    moved++
  }

  if (moved) save(current)
  if (Object.keys(legacy).length) localStorage.setItem(STORE, JSON.stringify(legacy))
  else localStorage.removeItem(STORE)
  return moved
}

function save(keys: SavedKeys) {
  localStorage.setItem(storeKey(), JSON.stringify(keys))
  keysVersion.value++
}

function isEntry(value: unknown): value is StoredKey {
  if (!value || typeof value !== 'object') return false
  const entry = value as Record<string, unknown>
  if (typeof entry.privateKey !== 'string' || !canonicalB64(entry.privateKey, 32)) return false
  if (typeof entry.createdAt !== 'number' || !Number.isSafeInteger(entry.createdAt)) return false
  return entry.retired === undefined || entry.retired === true
}

function matchesEntry(publicKey: string, entry: StoredKey): boolean {
  const publicBytes = canonicalB64(publicKey, 32)
  const privateBytes = canonicalB64(entry.privateKey, 32)
  return !!publicBytes && !!privateBytes && keysMatch(publicBytes, privateBytes)
}

/** The well-formed keys held here, whose private half matches their public half. */
export function savedKeys(): SavedKeys {
  const out: SavedKeys = {}
  for (const [publicKey, entry] of Object.entries(load())) {
    if (isEntry(entry) && matchesEntry(publicKey, entry)) out[publicKey] = entry
  }
  return out
}

export function hasSavedKeys(): boolean {
  return Object.keys(savedKeys()).length > 0
}

/**
 * Adds well-formed keys that aren't here yet, keeping any already held. Returns how many it took.
 * A key whose private half doesn't match its public half is never added.
 */
export function addSavedKeys(incoming: unknown): number {
  if (!incoming || typeof incoming !== 'object') return 0
  const current = load()
  let added = 0
  for (const [publicKey, entry] of Object.entries(incoming as Record<string, unknown>)) {
    if (!isEntry(entry) || !matchesEntry(publicKey, entry) || current[publicKey]) continue
    current[publicKey] = { ...entry }
    added++
  }
  if (added) save(current)
  return added
}

function localPairs(): { pair: KeyPair; createdAt: number }[] {
  const out: { pair: KeyPair; createdAt: number }[] = []
  for (const [publicKey, stored] of Object.entries(savedKeys())) {
    const privateKey = canonicalB64(stored.privateKey, 32)
    const publicBytes = fromB64(publicKey)
    if (!privateKey) continue
    const pair: KeyPair = { privateKey, publicKey: publicBytes, keyId: '' }
    out.push({ pair, createdAt: stored.createdAt })
  }
  return out.sort((a, b) => a.createdAt - b.createdAt)
}

async function usable(key: RoturKey): Promise<PublicKeyRef | null> {
  try {
    const publicKey = fromB64(String(key.public_key ?? ''))
    if (publicKey.length !== 32 || !key.key_id || !isUsablePublicKey(publicKey)) return null
    if ((await encryptionKeyId(publicKey)) !== key.key_id) return null
    return { keyId: key.key_id, publicKey }
  } catch {
    return null
  }
}

async function listKeys(username: string): Promise<KeyList> {
  const user = encodeURIComponent(username)
  try {
    return await api<KeyList>(`/v2/users/${user}/encryption-keys`, { cache: 'no-cache' })
  } catch (error) {
    if ((error as { status?: number }).status !== 400) throw error
    return api<KeyList>(`/v2/users/${user}/encryption-keys?app=${encodeURIComponent(config.roturAppId)}`, { cache: 'no-cache' })
  }
}

export function forgetKeys(username?: string) {
  if (username) cache.delete(username.toLowerCase())
  else cache.clear()
}

export function publishedKeys(username: string): Promise<PublishedKeys> {
  const name = username.toLowerCase()
  const known = cache.get(name)
  if (known && Date.now() - known.at < CACHE_MS) return known.keys

  const keys = listKeys(name).then(async answer => {
    const listed = Array.isArray(answer?.keys) ? answer.keys : []
    const checked = (await Promise.all(listed.map(usable))).filter((key): key is PublicKeyRef => !!key)
    return {
      userId: typeof answer?.user_id === 'string' ? answer.user_id : '',
      username: typeof answer?.username === 'string' ? answer.username : name,
      keys: checked,
    }
  })
  cache.set(name, { at: Date.now(), keys })
  keys.catch(() => cache.delete(name))
  return keys
}

async function publish(key: KeyPair) {
  try {
    await api('/v2/me/encryption-keys', {
      method: 'POST',
      body: { public_key: b64(key.publicKey), name: 'Nova' },
    })
  } catch (error) {
    const message = (error as Error).message
    if (/lacks permission.*encryption:keys/i.test(message))
      throw new Error('Sign in again and allow "Publish encryption keys" to send encrypted messages.')
    if (/too_many_keys/i.test(message))
      throw new Error('Rotur already has too many encryption keys for this account. Revoke an old one on rotur.dev.')
    throw error
  }
}

async function publishLocal(pair: KeyPair) {
  pair.keyId = await encryptionKeyId(pair.publicKey)
  await publish(pair)
  forgetKeys(rotur.value.username)
  const refreshed = await publishedKeys(rotur.value.username)
  if (!refreshed.keys.some(key => key.keyId === pair.keyId))
    refreshed.keys.push({ keyId: pair.keyId, publicKey: pair.publicKey })
  return { pair, published: refreshed }
}

async function createSendingKey(me: string) {
  const pair = generateKeyPair()
  pair.keyId = await encryptionKeyId(pair.publicKey)
  await publish(pair)

  const keys = savedKeys()
  keys[b64(pair.publicKey)] = { privateKey: b64(pair.privateKey), createdAt: Date.now() }
  save(keys)
  const refreshed = await publishedKeys(me)
  if (!refreshed.keys.some(key => key.keyId === pair.keyId))
    refreshed.keys.push({ keyId: pair.keyId, publicKey: pair.publicKey })
  return { pair, published: refreshed }
}

async function ensureSendingKey(): Promise<{ pair: KeyPair; published: PublishedKeys }> {
  const me = rotur.value.username
  if (!me) throw new Error('Sign in to Rotur first')

  const mine = await publishedKeys(me)
  migrateLegacyKeys(mine.keys)
  const locals = localPairs()
  for (const { pair } of locals) {
    const keyId = await encryptionKeyId(pair.publicKey)
    if (mine.keys.some(key => key.keyId === keyId)) return { pair: { ...pair, keyId }, published: mine }
  }

  if (keysLocked.value) throw new KeysLocked()

  if (locals.length) {
    // The key here is newer than the account's list, or its publish failed. Publish it rather
    // than replacing a key that a backup may already carry.
    return publishLocal(locals[locals.length - 1].pair)
  }

  if (!mine.keys.length) return createSendingKey(me)

  // Other devices have keys for this account. Without a backup that can bring one here, a key
  // made now could never read their messages, so only make one when the backup is known not to
  // exist.
  if (keyBackup.value === 'none') return createSendingKey(me)
  throw new KeysLocked()
}

export async function setup(): Promise<void> {
  if (keysLocked.value) return
  await ensureSendingKey()
}

/** Makes and publishes a new key even when a backup is locked: only when starting over on purpose. */
export async function newSendingKey(): Promise<KeyPair> {
  const me = rotur.value.username
  if (!me) throw new Error('Sign in to Rotur first')
  const { pair } = await createSendingKey(me)
  keysLocked.value = false
  return pair
}

function myUserId(published: PublishedKeys) {
  return published.userId || backend.value.user?.id || String(rotur.value.user?.id ?? '')
}

export async function seal(
  text: string,
  recipient: string,
  channel: string,
  server: string,
): Promise<string> {
  if (!server) throw new Error('Messages are still connecting')

  const own = await ensureSendingKey()
  const theirs = await publishedKeys(recipient)
  if (!theirs.keys.length) throw new Error(`${recipient} hasn't turned on encrypted messages`)

  const readers = new Map<string, PublicKeyRef>()
  for (const key of [...own.published.keys, ...theirs.keys]) readers.set(key.keyId, key)
  readers.set(own.pair.keyId, { keyId: own.pair.keyId, publicKey: own.pair.publicKey })

  const sender = myUserId(own.published)
  if (!sender) throw new Error('Could not work out which Rotur account is sending')

  return sealMessage(text, own.pair, [...readers.values()], { sender, server, channel }, { maxLength: 2000 })
}

async function keyById(
  username: string,
  keyId: string,
): Promise<{ key: PublicKeyRef; userId: string; username: string } | null> {
  try {
    const answer = await api<RoturKey & { user_id?: string; username?: string }>(
      `/v2/users/${encodeURIComponent(bare(username))}/encryption-keys/${encodeURIComponent(keyId)}`,
      { cache: 'no-cache' },
    )
    const key = await usable(answer)
    if (!key) return null
    return {
      key,
      userId: typeof answer.user_id === 'string' ? answer.user_id : '',
      username: typeof answer.username === 'string' ? answer.username : '',
    }
  } catch (error) {
    const status = (error as { status?: number }).status
    if (status === 404 || status === 410) return null
    throw error
  }
}

/** The names a sealing client may have used for the DM server. */
function serverNames(server: string): string[] {
  const names = new Set<string>()
  const add = (value: string) => {
    if (!value) return
    const trimmed = value.replace(/\/+$/, '')
    const host = trimmed.replace(/^wss?:\/\//, '').replace(/^https?:\/\//, '')
    for (const name of [trimmed, host, `wss://${host}`, `https://${host}`, `http://${host}`]) names.add(name)
  }
  add(server)
  add(ROTUR.chats)
  return [...names]
}

export async function open(
  content: string,
  senderUsername: string,
  channel: string,
  server: string,
  where: { replyTo?: string; thread?: string; senderId?: string } = {},
): Promise<{ text: string; files: SealedFile[]; warning?: string }> {
  if (!server) throw new Error('Messages are still connecting')

  const name = bare(senderUsername)
  const parsed = parseSealed(content)
  const theirs = await publishedKeys(name)
  if (theirs.username && bare(theirs.username) !== name)
    throw new Error('Rotur answered for a different account')

  let senderKey = theirs.keys.find(key => key.keyId === parsed.senderKeyId)
  let senderId = theirs.userId
  if (!senderKey) {
    const single = await keyById(name, parsed.senderKeyId)
    if (single) {
      senderKey = single.key
      senderId = single.userId || senderId
    }
  }
  if (!senderKey) throw new Error('Their encryption key is no longer listed')

  const senders = [senderId, where.senderId, name].filter(
    (value, index, all): value is string => !!value && all.indexOf(value) === index,
  )
  const servers = serverNames(server)
  const place = {
    channel,
    ...(where.replyTo ? { replyTo: where.replyTo } : {}),
    ...(where.thread ? { thread: where.thread } : {}),
  }

  let partial: { text: string; files: SealedFile[]; warning?: string } | null = null
  let failure: unknown

  for (const { pair } of localPairs()) {
    const keyId = await encryptionKeyId(pair.publicKey)
    if (!parsed.readerKeyIds.includes(keyId)) continue

    for (const sender of senders) {
      for (const serverName of servers) {
        try {
          const body = await parsed.open({ ...pair, keyId }, senderKey.publicKey, {
            sender,
            server: serverName,
            ...place,
          })
          const opened = {
            text: body.text,
            files: body.files,
            ...(body.warning ? { warning: body.warning } : {}),
          }
          if (!body.warning) return opened
          partial ??= opened
        } catch (error) {
          failure = error
        }
      }
    }
  }

  if (partial) return partial
  throw failure instanceof Error ? failure : new Error("This message wasn't encrypted for this console's key")
}
