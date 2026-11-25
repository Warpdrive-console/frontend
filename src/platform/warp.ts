import { fail } from '../state/toasts'

export interface Warp {
  get<T = unknown>(path: string): Promise<T>
  set(path: string, value: unknown): Promise<void>
  call<T = unknown>(path: string, args?: unknown): Promise<T>
  toggle(path: string): Promise<boolean>
  watch(path: string, fn: (value: unknown) => void): () => void
  on(pattern: string, fn: (value: unknown) => void): () => void
  peek<T = unknown>(path: string): T | undefined
  keyboard(on: boolean): void
  readonly native: boolean
  readonly mock: boolean
}

export const warp: Warp = window.warp

export function call<T = unknown>(path: string, args?: unknown): Promise<T | undefined> {
  return warp.call<T>(path, args).catch(error => {
    fail(error)
    return undefined
  })
}

export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))
