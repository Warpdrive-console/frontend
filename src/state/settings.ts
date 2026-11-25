import { signal } from '@preact/signals'
import { focus, setBackHandler, setScroller } from './nav'

export const settingsStack = signal<string[]>(['wifi'])

export const pageElement = () => document.querySelector<HTMLElement>('.page:not([hidden])')

export function showPage(id: string, replace = false) {
  if (replace) settingsStack.value = [id]
  else if (settingsStack.value.at(-1) !== id) settingsStack.value = [...settingsStack.value, id]
  requestAnimationFrame(() => {
    const page = pageElement()
    const first = page?.querySelector<HTMLElement>('[data-nav]')
    if (first) focus(first, true)
  })
}

export const pushPage = (id: string) => showPage(id)

export function popPage() {
  if (settingsStack.value.length < 2) return false
  settingsStack.value = settingsStack.value.slice(0, -1)
  return true
}

export function openCategory(id: string) {
  if (settingsStack.value[0] !== id) settingsStack.value = [id]
}

export function installSettingsNav() {
  setScroller('settings', pageElement)
  setBackHandler('settings', () => {
    if (popPage()) return true
    const active = document.activeElement
    if (active?.closest('#set-pane')) {
      const category = settingsStack.value[0]
      const button = document.querySelector<HTMLElement>(`#set-side [data-cat="${category}"]`)
      if (button) focus(button)
      return true
    }
    return false
  })
}
