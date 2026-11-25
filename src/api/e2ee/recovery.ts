import { signal } from '@preact/signals'
import { api, rotur } from '../rotur'
import { b64, bytes, canonicalB64, fromB64 } from './envelope'
import {
  addSavedKeys,
  forgetKeys,
  hasLegacyKeys,
  hasSavedKeys,
  keyBackup,
  keysLocked,
  migrateLegacyKeys,
  newSendingKey,
  publishedKeys,
  savedKeys,
  setup,
  type StoredKey,
} from './keys'

/**
 * The account's encryption keys, backed up to Rotur under a passphrase you choose.
 *
 * The passphrase never leaves this device: it makes a key with Argon2id, and Rotur only holds the
 * keys sealed under that key. This device keeps neither the passphrase nor the key it makes, so
 * the passphrase is asked for again whenever the backup is opened: to unlock a new device, and to
 * add a key made here. What it opens is compatible with originChats' recovery backup, which every
 * app holding the account's keys shares.
 *
 * Without the passphrase a device can still start over with a new key, but messages sent to the
 * old key open only on devices that still hold it.
 */

const BACKUP = '/v2/me/encryption-backup'
const BACKED_UP = 'nova.e2ee.backedUp'

/** Which keys were written to which backup, kept apart for each Rotur account. */
const markersKey = () => {
  const name = rotur.value.username.toLowerCase()
  return name ? `${BACKED_UP}.${name}` : BACKED_UP
}

/** Argon2id's cost, the same work originChats asks for: 64 MiB, three passes, one lane. */
const COST = { memoryKiB: 65_536, passes: 3, lanes: 1 } as const

export interface Vault {
  v: 1
  memoryKiB: number
  passes: number
  lanes: 1
  salt: string
  iv: string
  data: string
}

/** What the backup holds: this account's keys, and (from other apps) what they trust. */
interface Backup {
  keys: unknown
  trust: unknown
}

interface VaultKey {
  key: string
  salt: string
  cost: { memoryKiB: number; passes: number; lanes: 1 }
}

/**
 * "none": nothing is backed up. "locked": keys are backed up, but this device holds none of them.
 * "unsaved": a key here isn't in the backup yet. "on": every key here is backed up.
 */
export type RecoveryStatus = 'unknown' | 'none' | 'locked' | 'unsaved' | 'on'

export const recovery = signal<RecoveryStatus>('unknown')

export class AlreadyBackedUp extends Error {
  constructor() {
    super('Your keys are already backed up. Enter the passphrase you chose for them.')
  }
}

class BackupChanged extends Error {
  constructor() {
    super('Your encryption backup changed on another device. Try again.')
  }
}

export class WrongPassphrase extends Error {
  constructor() {
    super("That passphrase doesn't open your backed-up keys")
  }
}

/** Counted as it is used: without the spaces around it, and in Unicode's composed form. */
export function vaultPassword(typed: string): string {
  return typed.trim().normalize('NFC')
}

/** Why a new passphrase is too weak, or undefined when it's fine. */
export function weakPassphrase(passphrase: string): string | undefined {
  const typed = vaultPassword(passphrase)
  if (typed.length < 8) return 'Use a passphrase of at least 8 characters'
  if (/^\d+$/.test(typed)) return 'Use letters as well as numbers in your passphrase'
  return undefined
}

const emptyTrust = () => ({ keys: {}, members: {} })

function markers(): Record<string, string> {
  try {
    const key = markersKey()
    const raw = localStorage.getItem(key)
    if (raw === null) {
      const legacy = localStorage.getItem(BACKED_UP)
      if (key !== BACKED_UP && legacy) {
        localStorage.setItem(key, legacy)
        localStorage.removeItem(BACKED_UP)
        const moved = JSON.parse(legacy)
        return moved && typeof moved === 'object' ? (moved as Record<string, string>) : {}
      }
    }
    const value = JSON.parse(raw || '{}')
    return value && typeof value === 'object' ? (value as Record<string, string>) : {}
  } catch {
    return {}
  }
}

function markBackedUp(publicKeys: string[], salt: string) {
  const next = { ...markers() }
  for (const publicKey of publicKeys) next[publicKey] = salt
  localStorage.setItem(markersKey(), JSON.stringify(next))
}

export function isVault(value: unknown): value is Vault {
  if (!value || typeof value !== 'object') return false
  const vault = value as Record<string, unknown>
  const memory = vault.memoryKiB
  const passes = vault.passes
  if (vault.v !== 1 || vault.lanes !== 1) return false
  if (typeof memory !== 'number' || !Number.isInteger(memory) || memory < 65_536 || memory > 262_144) return false
  if (typeof passes !== 'number' || !Number.isInteger(passes) || passes < 3 || passes > 10) return false
  if (typeof vault.salt !== 'string' || !canonicalB64(vault.salt, 16)) return false
  if (typeof vault.iv !== 'string' || !canonicalB64(vault.iv, 12)) return false
  if (typeof vault.data !== 'string') return false
  const data = canonicalB64(vault.data)
  return !!data && data.length >= 16
}

function isNoBackup(error: unknown) {
  const known = error as { status?: number; code?: string; message?: string }
  if (known.status !== 404) return false
  return known.code === 'no_backup' || /no encryption backup/i.test(known.message || '')
}

async function readVault(): Promise<{ vault: Vault | null; etag: string | null }> {
  const answer = await api<{ backup?: unknown; etag?: unknown }>(BACKUP, { cache: 'no-store' })
  return {
    vault: isVault(answer?.backup) ? answer.backup : null,
    etag: typeof answer?.etag === 'string' ? answer.etag : null,
  }
}

async function findVault(): Promise<{ vault: Vault | null; etag: string | null }> {
  try {
    return await readVault()
  } catch (error) {
    if (isNoBackup(error)) return { vault: null, etag: null }
    throw error
  }
}

async function writeVault(vault: Vault, etag: string | null): Promise<void> {
  try {
    await api(BACKUP, {
      method: 'PUT',
      body: vault,
      headers: etag ? { 'If-Match': etag } : { 'If-None-Match': '*' },
    })
  } catch (error) {
    if ((error as { status?: number }).status === 412) throw new BackupChanged()
    throw error
  }
}

/** Runs work that reads the backup and writes it back again when another device wrote in between. */
async function againIfChanged(work: () => Promise<void>): Promise<void> {
  try {
    await work()
  } catch (error) {
    if (!(error instanceof BackupChanged)) throw error
    await work()
  }
}

async function keyFromPassphrase(passphrase: string, salt: string, cost: Omit<VaultKey['cost'], 'lanes'>) {
  const { argon2id } = await import('hash-wasm')
  const derived = await argon2id({
    password: vaultPassword(passphrase),
    salt: fromB64(salt),
    parallelism: 1,
    iterations: cost.passes,
    memorySize: cost.memoryKiB,
    hashLength: 32,
    outputType: 'binary',
  })
  return b64(derived)
}

async function aesKey(key: string, usage: 'encrypt' | 'decrypt') {
  return crypto.subtle.importKey('raw', bytes(fromB64(key)), 'AES-GCM', false, [usage])
}

async function sealBackup(backup: Backup, vaultKey: VaultKey): Promise<Vault> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await aesKey(vaultKey.key, 'encrypt'),
    new TextEncoder().encode(JSON.stringify(backup)),
  )
  return {
    v: 1,
    ...vaultKey.cost,
    salt: vaultKey.salt,
    iv: b64(iv),
    data: b64(data),
  }
}

async function openBackup(vault: Vault, key: string): Promise<Backup> {
  let plain: ArrayBuffer
  try {
    plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: bytes(fromB64(vault.iv)) },
      await aesKey(key, 'decrypt'),
      bytes(fromB64(vault.data)),
    )
  } catch {
    throw new WrongPassphrase()
  }

  try {
    const opened: unknown = JSON.parse(new TextDecoder().decode(plain))
    if (!opened || typeof opened !== 'object') return { keys: {}, trust: emptyTrust() }
    const record = opened as Record<string, unknown>
    return { keys: record.keys, trust: record.trust ?? emptyTrust() }
  } catch {
    throw new WrongPassphrase()
  }
}

async function newVaultKey(passphrase: string): Promise<VaultKey> {
  const salt = b64(crypto.getRandomValues(new Uint8Array(16)))
  return {
    key: await keyFromPassphrase(passphrase, salt, COST),
    salt,
    cost: COST,
  }
}

function vaultKeyFor(vault: Vault, typed: string): Promise<VaultKey> {
  const cost = { memoryKiB: vault.memoryKiB, passes: vault.passes, lanes: 1 as const }
  return keyFromPassphrase(typed, vault.salt, cost).then(key => ({ key, salt: vault.salt, cost }))
}

/**
 * The keys this device and the backup together hold, keeping a retired key retired. Ours win
 * their fields, since the backup may predate a key made here.
 */
function mergeKeys(backupKeys: unknown, local: Record<string, StoredKey>): Record<string, StoredKey> {
  const merged: Record<string, StoredKey> = {}
  if (backupKeys && typeof backupKeys === 'object') {
    for (const [publicKey, entry] of Object.entries(backupKeys as Record<string, unknown>)) {
      if (!entry || typeof entry !== 'object') continue
      const saved = entry as Record<string, unknown>
      if (typeof saved.privateKey !== 'string' || typeof saved.createdAt !== 'number') continue
      merged[publicKey] = {
        privateKey: saved.privateKey,
        createdAt: saved.createdAt,
        ...(saved.retired === true ? { retired: true as const } : {}),
      }
    }
  }
  for (const [publicKey, entry] of Object.entries(local)) {
    merged[publicKey] = merged[publicKey]?.retired ? { ...entry, retired: true } : entry
  }
  return merged
}

function statusOf(vault: Vault | null): RecoveryStatus {
  if (!hasSavedKeys()) return 'locked'
  if (!vault) return 'unknown'
  const keys = Object.keys(savedKeys())
  const marks = markers()
  return keys.every(publicKey => marks[publicKey] === vault.salt) ? 'on' : 'unsaved'
}

async function readStatus(): Promise<RecoveryStatus> {
  if (!hasSavedKeys() && hasLegacyKeys()) {
    try {
      migrateLegacyKeys((await publishedKeys(rotur.value.username)).keys)
    } catch {
      /* the backup's state can still be read */
    }
  }

  let found: { vault: Vault | null }
  try {
    found = await readVault()
  } catch (error) {
    if (isNoBackup(error)) {
      keyBackup.value = 'none'
      keysLocked.value = false
      recovery.value = 'none'
      return 'none'
    }
    // Not knowing must not let a new key stand in for the backed-up one.
    keyBackup.value = 'unknown'
    keysLocked.value = false
    recovery.value = 'unknown'
    return 'unknown'
  }

  keyBackup.value = 'present'
  const status = statusOf(found.vault)
  keysLocked.value = status === 'locked'
  recovery.value = status
  return status
}

let reading: Promise<RecoveryStatus> | null = null

/** Reads whether keys are backed up, and whether this device holds them. */
export function refreshRecovery(): Promise<RecoveryStatus> {
  if (reading) return reading
  const run = readStatus()
  reading = run
  void run.finally(() => {
    if (reading === run) reading = null
  })
  return run
}

/**
 * Backs this account's keys up for the first time, under a passphrase you chose. The key made
 * from the passphrase stays here; Rotur only ever holds the sealed keys.
 */
export async function setUpRecovery(passphrase: string): Promise<void> {
  const weak = weakPassphrase(passphrase)
  if (weak) throw new Error(weak)

  const found = await findVault()
  if (found.vault) throw new AlreadyBackedUp()

  await setup()
  const local = savedKeys()
  if (!Object.keys(local).length) throw new Error('This device has no encryption key to back up yet. Try again in a moment.')

  const vaultKey = await newVaultKey(passphrase)
  await writeVault(await sealBackup({ keys: local, trust: emptyTrust() }, vaultKey), found.etag)

  markBackedUp(Object.keys(local), vaultKey.salt)
  keyBackup.value = 'present'
  keysLocked.value = false
  recovery.value = 'on'
}

/**
 * Opens the backup with the passphrase and keeps its keys here, then adds any key this device
 * made since the backup was last written. The passphrase is not kept for next time.
 */
export async function restoreRecovery(typed: string): Promise<void> {
  if (!vaultPassword(typed)) throw new Error('Enter your encryption passphrase')

  await againIfChanged(async () => {
    const found = await findVault()
    if (!found.vault) throw new Error('No encryption keys are backed up to Rotur yet')

    const vaultKey = await vaultKeyFor(found.vault, typed)
    const opened = await openBackup(found.vault, vaultKey.key)
    addSavedKeys(opened.keys)

    const merged = mergeKeys(opened.keys, savedKeys())
    await writeVault(await sealBackup({ keys: merged, trust: opened.trust }, vaultKey), found.etag)

    markBackedUp(Object.keys(merged), vaultKey.salt)
    keyBackup.value = 'present'
    keysLocked.value = false
    recovery.value = 'on'
  })

  forgetKeys()
  try {
    await setup()
  } catch (error) {
    // The keys are here and the backup holds them; publishing one can be retried on reconnect.
    console.warn('[e2ee] restored the keys but could not publish one:', error)
  }
}

/**
 * For a forgotten passphrase: makes a key here and replaces the backup with it under a new
 * passphrase. What was sent to the old key opens only on devices that still hold it.
 */
export async function startOverRecovery(passphrase: string): Promise<void> {
  const weak = weakPassphrase(passphrase)
  if (weak) throw new Error(weak)

  const pair = await newSendingKey()
  const publicKey = b64(pair.publicKey)
  const saved = savedKeys()[publicKey]
  if (!saved) throw new Error('The new key could not be saved')

  const vaultKey = await newVaultKey(passphrase)
  const sealed = await sealBackup({ keys: { [publicKey]: saved }, trust: emptyTrust() }, vaultKey)
  await againIfChanged(async () => {
    const found = await findVault()
    await writeVault(sealed, found.etag)
  })

  markBackedUp([publicKey], vaultKey.salt)
  keyBackup.value = 'present'
  keysLocked.value = false
  recovery.value = 'on'
  forgetKeys()
}
