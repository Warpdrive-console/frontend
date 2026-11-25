import { normalizeMediaUrl } from '../media'
import { ROTUR } from '../rotur'
import { b64, bytes, fromB64, type SealedFile } from './envelope'

/** The types a readable copy may have: anything else is shown and saved as plain bytes. */
const SAFE_TYPES = /^(image\/(png|jpeg|gif|webp|avif)|video\/(mp4|webm)|audio\/[a-z0-9.+-]+|text\/plain)$/

const MAX_OPENED = 40

/** The most an encrypted download may take in, whatever a server says its length is. */
const MAX_DOWNLOAD = 256 * 1024 * 1024

const opened = new Map<string, Promise<string>>()

function safeType(type: string): string {
  const clean = type.split(';')[0].trim().toLowerCase()
  return SAFE_TYPES.test(clean) ? clean : 'application/octet-stream'
}

function source(url: string): string {
  const base = ROTUR.chats.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:')
  try {
    return new URL(normalizeMediaUrl(url), base).toString()
  } catch {
    return normalizeMediaUrl(url)
  }
}

async function open(file: SealedFile): Promise<string> {
  const response = await fetch(source(file.url), { cache: 'force-cache' })
  if (!response.ok) throw new Error(`The file could not be downloaded (${response.status})`)
  if (Number(response.headers.get('content-length') || 0) > MAX_DOWNLOAD)
    throw new Error('That file is too big to open here')
  const data = new Uint8Array(await response.arrayBuffer())
  if (data.length > MAX_DOWNLOAD) throw new Error('That file is too big to open here')

  const digest = b64(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes(data))))
  if (digest !== file.hash) throw new Error('The file changed on the server')

  const key = await crypto.subtle.importKey('raw', bytes(fromB64(file.key)), 'AES-GCM', false, ['decrypt'])
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(fromB64(file.iv)) }, key, bytes(data)),
  )
  return URL.createObjectURL(new Blob([bytes(plain.slice(0, file.size))], { type: safeType(file.type) }))
}

/** Decrypts an encrypted direct-message file here; the key came inside the sealed message. */
export function openSealedFile(file: SealedFile): Promise<string> {
  const id = `${file.url}|${file.hash}`
  const known = opened.get(id)
  if (known) return known

  const work = open(file).catch(error => {
    opened.delete(id)
    throw error
  })
  opened.set(id, work)
  if (opened.size > MAX_OPENED) opened.delete(opened.keys().next().value!)
  return work
}

export async function saveSealedFile(file: SealedFile): Promise<void> {
  const url = await openSealedFile(file)
  const link = document.createElement('a')
  link.href = url
  link.download = file.name || 'file'
  link.click()
}
