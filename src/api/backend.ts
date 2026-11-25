import { signal } from '@preact/signals'
import { config } from '../config'

export interface BackendUser {
  id: string
  username: string
  minor?: boolean
  sessions?: number
  expires?: number
  rotur_expires?: number
}

export interface RoturGrant {
  token: string
  expires_at: number
  scope?: string
}

export interface BackendState {
  session: string
  user: BackendUser | null
  status: string
  error: string
}

const KEY = 'nova.warpdrive.session'

function initialStatus() {
  if (!config.api) return 'Not configured'
  return localStorage.getItem(KEY) ? 'Restoring…' : 'Not signed in'
}

export const backend = signal<BackendState>({
  session: localStorage.getItem(KEY) || '',
  user: null,
  status: initialStatus(),
  error: '',
})

async function request<T>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean } = {},
): Promise<T> {
  if (!config.api) throw new Error('No Warpdrive API is configured')
  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (options.auth !== false && backend.value.session) headers.Authorization = `Bearer ${backend.value.session}`

  const response = await fetch(`${config.api}/v1${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })

  let data: unknown = null
  try {
    data = await response.json()
  } catch {
    /* no body */
  }
  if (!response.ok) {
    const error = new Error(
      data && typeof data === 'object' && 'error' in data ? String(data.error) : `HTTP ${response.status}`,
    ) as Error & { status?: number }
    error.status = response.status
    throw error
  }
  return data as T
}

export function startLink(secure: boolean) {
  return request<{
    code: string
    expires_in: number
    verification_uri: string
    verification_uri_complete: string
  }>('/auth/start', { method: 'POST', auth: false, body: { secure } })
}

export async function pollLink(code: string) {
  const result = await request<{
    status: 'pending' | 'linked' | 'denied' | 'expired'
    error?: string
    sessionId?: string
    user?: BackendUser
    rotur?: RoturGrant
  }>(`/auth/poll?code=${encodeURIComponent(code)}`, { auth: false })

  if (result.status === 'linked' && result.sessionId) {
    localStorage.setItem(KEY, result.sessionId)
    backend.value = {
      session: result.sessionId,
      user: result.user ?? null,
      status: 'Connected',
      error: '',
    }
  } else if (result.status === 'denied') {
    backend.value = { ...backend.value, status: 'Not signed in', error: result.error ?? '' }
  }
  return result
}

export async function refreshRotur(): Promise<RoturGrant | null> {
  if (!config.api || !backend.value.session) return null
  try {
    const grant = await request<RoturGrant>('/auth/refresh', { method: 'POST' })
    return grant?.token ? grant : null
  } catch (error) {
    if ((error as { status?: number }).status === 401) {
      localStorage.removeItem(KEY)
      backend.value = { session: '', user: null, status: 'Not signed in', error: (error as Error).message }
    }
    return null
  }
}

export async function restore(): Promise<{ me: BackendUser; rotur?: RoturGrant | null } | null> {
  if (!config.api || !backend.value.session) return null
  try {
    const me = await request<BackendUser>('/me')
    backend.value = { ...backend.value, user: me, status: 'Connected', error: '' }
    if (me.rotur_expires && Date.now() > me.rotur_expires * 1000 - 120_000) {
      return { me, rotur: await refreshRotur() }
    }
    return { me }
  } catch (error) {
    if ((error as { status?: number }).status === 401) {
      localStorage.removeItem(KEY)
      backend.value = { session: '', user: null, status: 'Not signed in', error: '' }
      return null
    }
    backend.value = { ...backend.value, status: 'Offline', error: (error as Error).message }
    return null
  }
}

export async function signOut() {
  if (config.api && backend.value.session) {
    try {
      await request('/logout', { method: 'POST' })
    } catch {
      /* the session is gone either way */
    }
  }
  localStorage.removeItem(KEY)
  backend.value = { session: '', user: null, status: 'Not signed in', error: '' }
}

export const me = () => request<BackendUser>('/me')
export const ready = () => !!backend.value.session
export const enabled = () => !!config.api
export const label = () => {
  if (!config.api) return 'Not configured'
  return backend.value.status
}
