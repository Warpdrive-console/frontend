import { signal, type Signal } from '@preact/signals'
import { useEffect, useMemo } from 'preact/hooks'
import { warp } from './warp'

/** Watch one warp point, starting with its last value. */
export function usePoint<T = unknown>(path: string): Signal<T | null> {
  const value = useMemo(() => signal<T | null>((warp.peek<T>(path) as T) ?? null), [path])
  useEffect(() => {
    value.value = (warp.peek<T>(path) as T) ?? null
    return warp.watch(path, next => {
      value.value = (next as T) ?? null
    })
  }, [path, value])
  return value
}
