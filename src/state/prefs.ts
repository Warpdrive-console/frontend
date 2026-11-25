import { signal } from '@preact/signals'

export type Theme = 'dark' | 'light'

export interface Prefs {
  theme: Theme
  accent: string
  sounds: boolean
  motion: boolean
  signMessages: boolean
}

export const ACCENTS: [string, string][] = [
  ['#1e90ff', 'Blue'],
  ['#e8473a', 'Red'],
  ['#2fb365', 'Green'],
  ['#f28c28', 'Orange'],
  ['#8e5cf0', 'Purple'],
  ['#e0559b', 'Pink'],
  ['#16a8a8', 'Teal'],
  ['#7c8594', 'Grey'],
]

function stored(): Partial<Prefs> {
  try {
    return JSON.parse(localStorage.getItem('nova.prefs') || '{}') as Partial<Prefs>
  } catch {
    return {}
  }
}

export const prefs = signal<Prefs>({
  theme: 'dark',
  accent: '#1e90ff',
  sounds: true,
  motion: true,
  signMessages: true,
  ...stored(),
})

export function applyPrefs() {
  const value = prefs.value
  const root = document.documentElement
  root.dataset.theme = value.theme
  root.style.setProperty('--accent', value.accent)
  document.body.classList.toggle('reduce', !value.motion)
  try {
    localStorage.setItem('nova.prefs', JSON.stringify(value))
  } catch {
    /* storage can be unavailable */
  }
}

export function setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
  prefs.value = { ...prefs.value, [key]: value }
  applyPrefs()
}

export function togglePref(key: 'sounds' | 'motion' | 'signMessages') {
  setPref(key, !prefs.value[key])
}
