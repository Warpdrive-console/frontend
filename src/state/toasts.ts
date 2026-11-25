import { signal } from '@preact/signals'
import { play } from '../platform/sound'

export interface Toast {
  id: number
  title: string
  text?: string
  image?: string
  username?: string
  icon?: string
  bad?: boolean
  sound?: boolean
}

export const toasts = signal<Toast[]>([])
let next = 0

export function note(toast: Omit<Toast, 'id'>) {
  const id = ++next
  toasts.value = [...toasts.value, { ...toast, id }]
  if (toast.sound !== false) play(toast.bad ? 'error' : 'notify')
  setTimeout(() => dismiss(id), 3800)
}

export function dismiss(id: number) {
  toasts.value = toasts.value.filter(toast => toast.id !== id)
}

export function fail(error: unknown) {
  note({
    title: 'Something went wrong',
    text: error instanceof Error ? error.message : String(error),
    bad: true,
  })
}
