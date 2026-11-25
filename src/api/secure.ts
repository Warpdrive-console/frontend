import { signal } from '@preact/signals'
import { Rotur } from 'rotur-sdk'
import { bare, hasSecure, rotur } from './rotur'

export type SignatureState = 'unsigned' | 'unavailable' | 'pending' | 'verified' | 'invalid'

const supported: Promise<boolean> = (async () => {
  try {
    await crypto.subtle.generateKey({ name: 'Ed25519' }, false, ['sign', 'verify'])
    await crypto.subtle.generateKey({ name: 'X25519' }, false, ['deriveBits'])
    return true
  } catch {
    return false
  }
})()

const states = new Map<string, SignatureState>()
let client: Rotur | null = null
let clientToken = ''

function sdk(): Rotur | null {
  const token = rotur.value.token
  if (!token) return null
  if (!client || clientToken !== token) {
    client = new Rotur({ token })
    clientToken = token
  }
  return client
}

const keyState = signal<'unknown' | 'ok' | 'denied' | 'unsupported'>('unknown')
let keyToken = ''

async function probeKey() {
  const token = rotur.value.token
  if (!hasSecure() || keyToken === token) return
  keyToken = token
  if (!(await supported)) {
    keyState.value = 'unsupported'
    return
  }
  try {
    await sdk()!.signing.privateKey()
    keyState.value = 'ok'
  } catch (error) {
    const status = (error as { status?: number }).status
    keyState.value = status === 403 || /permission|forbidden|403/i.test(String((error as Error).message)) ? 'denied' : 'unknown'
    keyToken = keyState.value === 'denied' ? token : ''
  }
}

const keyOf = (message: any) =>
  message.id != null ? `i${message.id}` : `${message.user}|${message.timestamp}|${message.content}`

const toMs = (value: number) => (value < 1e12 ? value * 1000 : value)

export function check(message: any, signingUrl: string, changed: () => void): SignatureState {
  const key = keyOf(message)
  const known = states.get(key)
  if (known) return known
  if (!message.author_id || !message.key_id || !message.signature || message.signed_at == null) {
    states.set(key, 'unsigned')
    return 'unsigned'
  }

  const serverAt = toMs(message.edited_at ?? message.timestamp)
  const signedAt = toMs(message.signed_at)
  if (!signingUrl || Math.abs(serverAt - signedAt) > 5 * 60 * 1000) {
    const state = signingUrl ? 'invalid' : 'unavailable'
    states.set(key, state)
    return state
  }

  states.set(key, 'pending')
  void (async () => {
    let result: SignatureState
    try {
      if (!(await supported)) result = 'unavailable'
      else {
        const verifier = sdk() ?? new Rotur({})
        const ok = await verifier.signing.verify(
          {
            author_id: message.author_id,
            key_id: message.key_id,
            signature: message.signature,
            username: bare(message.user),
          },
          ['originchats.message.v1', message.author_id, message.content ?? '', message.attachments || [], message.signed_at, signingUrl],
          { signedAt: serverAt },
        )
        result = ok ? 'verified' : 'invalid'
      }
    } catch (error) {
      result = /mismatch/i.test(String((error as Error).message)) ? 'invalid' : 'unavailable'
    }
    states.set(key, result)
    changed()
  })()
  return 'pending'
}

export async function sign(content: string, attachments: unknown[], timestamp: number, signingUrl: string) {
  const instance = sdk()
  if (!instance) throw new Error('Not signed in')
  return instance.signing.sign(authorId => [
    'originchats.message.v1',
    authorId,
    content,
    attachments,
    timestamp,
    signingUrl,
  ])
}

export const secure = {
  supported,
  check,
  sign,
  keyState,
  probeKey,
}
