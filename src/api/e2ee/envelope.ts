import { x25519 } from '@noble/curves/ed25519.js'

/**
 * originChats sealed messages, envelope version 5 (`oce5.`).
 * Spec: docs.originchats.com/clients/e2ee/
 *
 * Each message gets a random content key. Every reader's X25519 secret with the sender is run
 * through HKDF-SHA256, salted with the message nonce: 32 bytes mask the content key, 32 bytes tag
 * the message. The body is AES-256-GCM under the content key. The header commits to the content
 * key and a franking key, so a reader can prove what a message said.
 */

export const SEALED_NOTICE = '🔒 Encrypted message'
export const PREFIX = 'oce5.'
export const VERSION = 5
export const KEY_ID_PREFIX = 'rotur_ek_'
export const MAX_WRAPS = 255
export const MAX_FILES = 32
export const DM_MAX_CONTENT = 2000

const REF_BYTES = 12
const NONCE_BYTES = 12
const KEY_BYTES = 32
const COMMIT_BYTES = 32
const TAG_BYTES = 16
const GCM_TAG_BYTES = 16
const MAX_SEALED_LENGTH = 4096
const BODY_PADDING_FLOOR = 128

const FIXED_BYTES = 1 + REF_BYTES + NONCE_BYTES + 2 * COMMIT_BYTES + 1 + GCM_TAG_BYTES + KEY_BYTES
const PER_READER_BYTES = REF_BYTES + KEY_BYTES + TAG_BYTES

const SEALED_PATTERN = new RegExp(`^${SEALED_NOTICE}\\n${PREFIX.replace('.', '\\.')}([A-Za-z0-9_-]+)$`, 'u')

export interface PublicKeyRef {
  keyId: string
  publicKey: Uint8Array
}

export interface KeyPair extends PublicKeyRef {
  privateKey: Uint8Array
}

export interface SealContext {
  sender: string
  server: string
  channel: string
  thread?: string
  replyTo?: string
}

/** A file carried inside a sealed message: its ciphertext address and the key to open it. */
export interface SealedFile {
  url: string
  key: string
  iv: string
  hash: string
  name: string
  type: string
  size: number
  width?: number
  height?: number
}

export interface SealedBody {
  text: string
  sentAt: number
  files: SealedFile[]
  nonce: string
  /** The message opened, but what it was sealed under didn't check out. */
  warning?: string
}

export interface ParsedEnvelope {
  senderKeyId: string
  nonce: string
  readerKeyIds: string[]
  open(reader: KeyPair, senderPublicKey: Uint8Array, context: SealContext): Promise<SealedBody>
}

export function utf8(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}

export function b64(value: Uint8Array | ArrayBuffer): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value)
  let binary = ''
  const chunk = 8192
  for (let index = 0; index < bytes.length; index += chunk)
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromB64(text: string): Uint8Array {
  const padding = '='.repeat((4 - (text.length % 4)) % 4)
  const base64 = (text + padding).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), char => char.charCodeAt(0))
}

export function canonicalB64(text: string, bytes?: number): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null
  try {
    const decoded = fromB64(text)
    if (b64(decoded) !== text) return null
    return bytes === undefined || decoded.length === bytes ? decoded : null
  } catch {
    return null
  }
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export function bytes(value: Uint8Array): Uint8Array<ArrayBuffer> {
  return new Uint8Array(value)
}

export function generateKeyPair(): KeyPair {
  const { secretKey, publicKey } = x25519.keygen()
  return { publicKey, privateKey: secretKey, keyId: '' }
}

/** Whether a private half is the one the public half names. */
export function keysMatch(publicKey: Uint8Array, privateKey: Uint8Array): boolean {
  try {
    return b64(x25519.getPublicKey(privateKey)) === b64(publicKey)
  } catch {
    return false
  }
}

export async function encryptionKeyId(publicKey: Uint8Array): Promise<string> {
  return KEY_ID_PREFIX + b64((await sha256(publicKey)).subarray(0, REF_BYTES))
}

export function isCanonicalX25519(publicKey: Uint8Array): boolean {
  if (publicKey.length !== 32 || publicKey[31]! & 0x80) return false
  const belowTop = publicKey.subarray(1, 31).every(byte => byte === 0xff)
  return !(publicKey[31] === 0x7f && belowTop && publicKey[0]! >= 0xed)
}

function agree(privateKey: Uint8Array, publicKey: Uint8Array): Uint8Array | null {
  try {
    const shared = x25519.getSharedSecret(privateKey, publicKey)
    return shared.some(byte => byte !== 0) ? shared : null
  } catch {
    return null
  }
}

export function isUsablePublicKey(publicKey: Uint8Array): boolean {
  return isCanonicalX25519(publicKey) && !!agree(x25519.utils.randomSecretKey(), publicKey)
}

const sharedSecrets = new Map<string, Uint8Array>()

async function sharedSecret(keyId: string, privateKey: Uint8Array, publicKey: Uint8Array) {
  const key = `${keyId} ${b64(publicKey)}`
  const known = sharedSecrets.get(key)
  if (known) return known
  const shared = isCanonicalX25519(publicKey) ? agree(privateKey, publicKey) : null
  if (!shared) throw new Error('Unusable encryption key')
  sharedSecrets.set(key, shared)
  if (sharedSecrets.size > 500) sharedSecrets.delete(sharedSecrets.keys().next().value!)
  return shared
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', bytes(data)))
}

async function hmac(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const imported = await crypto.subtle.importKey('raw', bytes(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', imported, bytes(data)))
}

function xor(a: Uint8Array, b: Uint8Array): Uint8Array {
  return a.map((byte, index) => byte ^ b[index]!)
}

function prefixed(field: Uint8Array): Uint8Array {
  const length = new Uint8Array(4)
  new DataView(length.buffer).setUint32(0, field.length)
  return concat(length, field)
}

function contextBytes(context: SealContext): Uint8Array {
  const fields = ['oce5', context.sender, context.server, context.channel, context.thread ?? '', context.replyTo ?? '']
  return concat(...fields.map(field => prefixed(utf8(field))))
}

function keyRef(keyId: string): Uint8Array {
  const ref = keyId.startsWith(KEY_ID_PREFIX) ? canonicalB64(keyId.slice(KEY_ID_PREFIX.length), REF_BYTES) : null
  if (!ref) throw new Error(`Not an encryption key id: ${keyId}`)
  return ref
}

function refKeyId(ref: Uint8Array): string {
  return KEY_ID_PREFIX + b64(ref)
}

async function readerKeys(
  own: KeyPair,
  publicKey: Uint8Array,
  nonce: Uint8Array,
  senderRef: Uint8Array,
  readerRef: Uint8Array,
) {
  const shared = await sharedSecret(own.keyId, own.privateKey, publicKey)
  const material = await crypto.subtle.importKey('raw', bytes(shared), 'HKDF', false, ['deriveBits'])
  const derived = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: 'HKDF', hash: 'SHA-256', salt: bytes(nonce), info: bytes(concat(utf8('oce5 reader'), senderRef, readerRef)) },
      material,
      512,
    ),
  )
  return { mask: derived.subarray(0, KEY_BYTES), tagKey: derived.subarray(KEY_BYTES) }
}

const commitment = (contentKey: Uint8Array) => sha256(concat(utf8('oce5 commit'), contentKey))

function frankingTag(key: Uint8Array, context: SealContext, body: Uint8Array) {
  return hmac(key, concat(utf8('oce5 frank'), contextBytes(context), body))
}

async function messageTag(tagKey: Uint8Array, context: SealContext, core: Uint8Array, ciphertext: Uint8Array) {
  const digest = await sha256(concat(contextBytes(context), core, ciphertext))
  return (await hmac(tagKey, concat(utf8('oce5 tag'), digest))).subarray(0, TAG_BYTES)
}

function paddedSize(size: number, floor = 256): number {
  if (size < floor) return floor
  const exponent = Math.floor(Math.log2(size))
  const kept = Math.floor(Math.log2(exponent)) + 1
  const step = 2 ** (exponent - kept)
  return Math.ceil(size / step) * step
}

function sealedLength(readers: number, bodyBytes: number) {
  const total = FIXED_BYTES + readers * PER_READER_BYTES + bodyBytes
  return [...`${SEALED_NOTICE}\n${PREFIX}`].length + Math.ceil((total * 4) / 3)
}

function paddedBody(readers: number, bodyBytes: number, maxLength: number) {
  let target = paddedSize(bodyBytes, BODY_PADDING_FLOOR)
  while (target > bodyBytes && sealedLength(readers, target) > maxLength) target--
  return target
}

function unsigned(value: number, size: 1 | 4 | 8) {
  const out = new Uint8Array(size)
  const view = new DataView(out.buffer)
  if (size === 1) view.setUint8(0, value)
  else if (size === 4) view.setUint32(0, value)
  else view.setBigUint64(0, BigInt(value))
  return out
}

export function encodeBody(text: string, sentAt: number, files: SealedFile[] = []): Uint8Array {
  if (files.length > MAX_FILES) throw new Error('Too many files to encrypt in one message')
  if (new Set(files.map(file => file.url)).size < files.length)
    throw new Error('The same file cannot be encrypted into a message twice')

  const records = files.map(file => {
    const key = canonicalB64(file.key, KEY_BYTES)
    const iv = canonicalB64(file.iv, NONCE_BYTES)
    const hash = canonicalB64(file.hash, COMMIT_BYTES)
    const width = file.width ?? 0
    const height = file.height ?? 0
    if (!key || !iv || !hash || !Number.isSafeInteger(file.size) || file.size < 0)
      throw new Error('Not a file that can be encrypted')
    if (![width, height].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff))
      throw new Error('Not a file that can be encrypted')
    return concat(
      prefixed(utf8(file.url)),
      key,
      iv,
      hash,
      prefixed(utf8(file.name)),
      prefixed(utf8(file.type)),
      unsigned(file.size, 8),
      unsigned(width, 4),
      unsigned(height, 4),
    )
  })

  return concat(prefixed(utf8(text)), unsigned(sentAt, 8), unsigned(files.length, 1), ...records)
}

const DAMAGED = 'Damaged encrypted message'

function readBody(data: Uint8Array): { text: string; sentAt: number; files: SealedFile[]; length: number } {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })
  let offset = 0
  const take = (length: number) => {
    if (length > data.length - offset) throw new Error(DAMAGED)
    const part = data.subarray(offset, offset + length)
    offset += length
    return part
  }
  const u32 = () => {
    const at = offset
    take(4)
    return view.getUint32(at)
  }
  const u64 = () => {
    const at = offset
    take(8)
    const value = view.getBigUint64(at)
    if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(DAMAGED)
    return Number(value)
  }
  const string = () => {
    try {
      return decoder.decode(take(u32()))
    } catch {
      throw new Error(DAMAGED)
    }
  }
  const text = string()
  const sentAt = u64()
  const count = take(1)[0]!
  if (count > MAX_FILES) throw new Error(DAMAGED)

  const files: SealedFile[] = []
  for (let index = 0; index < count; index++) {
    const url = string()
    const key = b64(take(KEY_BYTES))
    const iv = b64(take(NONCE_BYTES))
    const hash = b64(take(COMMIT_BYTES))
    const name = string()
    const type = string()
    const size = u64()
    const width = u32()
    const height = u32()
    if (files.some(file => file.url === url)) throw new Error(DAMAGED)
    files.push({
      url,
      key,
      iv,
      hash,
      name,
      type,
      size,
      ...(width > 0 ? { width } : {}),
      ...(height > 0 ? { height } : {}),
    })
  }
  return { text, sentAt, files, length: offset }
}

export function isSealed(content: string | undefined): content is string {
  return !!content && content.length <= MAX_SEALED_LENGTH && SEALED_PATTERN.test(content)
}

export interface SealOptions {
  sentAt?: number
  maxLength?: number
  files?: SealedFile[]
  randoms?: { nonce: Uint8Array; contentKey: Uint8Array; frankingKey: Uint8Array }
}

export async function sealMessage(
  text: string,
  sender: KeyPair,
  readers: PublicKeyRef[],
  context: SealContext,
  options: SealOptions = {},
): Promise<string> {
  const unique = [...new Map(readers.map(reader => [reader.keyId, reader])).values()]
  if (!unique.length) throw new Error('Nobody to encrypt for')
  if (unique.length > MAX_WRAPS) throw new Error('Too many keys to encrypt for')

  const senderRef = keyRef(sender.keyId)
  const nonce = options.randoms?.nonce ?? crypto.getRandomValues(new Uint8Array(NONCE_BYTES))
  const contentKey = options.randoms?.contentKey ?? crypto.getRandomValues(new Uint8Array(KEY_BYTES))
  const frankingKey = options.randoms?.frankingKey ?? crypto.getRandomValues(new Uint8Array(KEY_BYTES))
  const sentAt = options.sentAt ?? Date.now()
  const body = encodeBody(text, sentAt, options.files)

  const wrapped = await Promise.all(
    unique.map(async reader => {
      const readerRef = keyRef(reader.keyId)
      const keys = await readerKeys(sender, reader.publicKey, nonce, senderRef, readerRef)
      return { tagKey: keys.tagKey, entry: concat(readerRef, xor(contentKey, keys.mask)) }
    }),
  )

  const core = concat(
    Uint8Array.of(VERSION),
    senderRef,
    nonce,
    await commitment(contentKey),
    await frankingTag(frankingKey, context, body),
    Uint8Array.of(wrapped.length),
    ...wrapped.map(({ entry }) => entry),
  )

  const size = paddedBody(unique.length, body.length, options.maxLength ?? Infinity)
  const plaintext = new Uint8Array(KEY_BYTES + size)
  plaintext.set(frankingKey)
  plaintext.set(body, KEY_BYTES)

  const aes = await crypto.subtle.importKey('raw', bytes(contentKey), 'AES-GCM', false, ['encrypt'])
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: bytes(nonce), additionalData: bytes(concat(contextBytes(context), core)) },
      aes,
      plaintext,
    ),
  )

  const tags = await Promise.all(wrapped.map(({ tagKey }) => messageTag(tagKey, context, core, ciphertext)))
  const content = `${SEALED_NOTICE}\n${PREFIX}${b64(concat(core, ...tags, ciphertext))}`
  if ([...content].length > (options.maxLength ?? Infinity))
    throw new Error('That message is too long to encrypt')
  return content
}

const TAMPERED =
  "This message was changed, isn't from its sender, or doesn't match where the server shows it"

/** The text still opens, so it is shown with this warning rather than hidden. */
const UNMATCHED = "This message doesn't match where the server shows it, so it may have been changed"

export function parseSealed(content: string): ParsedEnvelope {
  const token = isSealed(content) ? SEALED_PATTERN.exec(content)?.[1] : null
  const data = token ? canonicalB64(token) : null
  if (!data) throw new Error(isSealed(content) ? DAMAGED : 'Not an encrypted message')

  let offset = 0
  const take = (length: number) => {
    if (offset + length > data.length) throw new Error(DAMAGED)
    const part = data.subarray(offset, offset + length)
    offset += length
    return part
  }

  if (take(1)[0] !== VERSION) throw new Error('Encrypted with another version of originChats')
  const senderRef = take(REF_BYTES)
  const nonce = take(NONCE_BYTES)
  const commit = take(COMMIT_BYTES)
  const franked = take(COMMIT_BYTES)
  const count = take(1)[0]!
  if (count === 0) throw new Error(DAMAGED)
  const wraps = new Map<string, { wrap: Uint8Array; index: number }>()
  for (let index = 0; index < count; index++) {
    const keyId = refKeyId(take(REF_BYTES))
    if (wraps.has(keyId)) throw new Error(DAMAGED)
    wraps.set(keyId, { wrap: take(KEY_BYTES), index })
  }

  const core = data.subarray(0, offset)
  const tags = take(count * TAG_BYTES)
  const ciphertext = data.subarray(offset)

  return {
    senderKeyId: refKeyId(senderRef),
    nonce: b64(nonce),
    readerKeyIds: [...wraps.keys()],
    async open(reader, senderPublicKey, context) {
      const mine = wraps.get(reader.keyId)
      if (!mine) throw new Error("Not encrypted for this device's key")
      const keys = await readerKeys(reader, senderPublicKey, nonce, senderRef, keyRef(reader.keyId))
      const tag = tags.subarray(mine.index * TAG_BYTES, (mine.index + 1) * TAG_BYTES)
      const contentKey = xor(mine.wrap, keys.mask)
      const committed = sameBytes(await commitment(contentKey), commit)

      /** The same message read under one guess at where it was shown. */
      const tryContext = async (candidate: SealContext): Promise<SealedBody> => {
        let warning = !committed
        const expected = await messageTag(keys.tagKey, candidate, core, ciphertext)
        if (!sameBytes(expected, tag)) warning = true

        let plaintext: Uint8Array
        try {
          const aes = await crypto.subtle.importKey('raw', bytes(contentKey), 'AES-GCM', false, ['decrypt'])
          plaintext = new Uint8Array(
            await crypto.subtle.decrypt(
              { name: 'AES-GCM', iv: bytes(nonce), additionalData: bytes(concat(contextBytes(candidate), core)) },
              aes,
              bytes(ciphertext),
            ),
          )
        } catch {
          // Without a body that decrypts there is nothing safe to show.
          throw new Error(TAMPERED)
        }

        try {
          const frankingKey = plaintext.subarray(0, KEY_BYTES)
          const { text, sentAt, files, length } = readBody(plaintext.subarray(KEY_BYTES))
          const bodyBytes = plaintext.subarray(KEY_BYTES, KEY_BYTES + length)
          if (plaintext.subarray(KEY_BYTES + length).some(byte => byte !== 0)) warning = true
          if (!sameBytes(await frankingTag(frankingKey, candidate, bodyBytes), franked)) warning = true
          return {
            text,
            sentAt,
            files,
            nonce: b64(nonce),
            ...(warning ? { warning: UNMATCHED } : {}),
          }
        } catch {
          throw new Error(TAMPERED)
        }
      }

      // The DM server drops a reply's link when it can't find the message replied to, so a
      // message sealed for a reply may arrive without one, and the other way round. Try the
      // place it is shown under, then with each part left out, and show the first that opens.
      const candidates: SealContext[] = [context]
      if (context.replyTo) candidates.push({ ...context, replyTo: undefined })
      if (context.thread) candidates.push({ ...context, thread: undefined })
      if (context.replyTo && context.thread) candidates.push({ ...context, replyTo: undefined, thread: undefined })

      let partial: SealedBody | null = null
      let failure: unknown
      for (const candidate of candidates) {
        try {
          const body = await tryContext(candidate)
          if (!body.warning) return body
          partial ??= body
        } catch (error) {
          failure = error
        }
      }
      if (partial) return partial
      throw failure instanceof Error ? failure : new Error(TAMPERED)
    },
  }
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let difference = 0
  for (let index = 0; index < a.length; index++) difference |= a[index]! ^ b[index]!
  return difference === 0
}
