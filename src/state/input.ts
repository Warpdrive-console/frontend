import { useEffect } from 'preact/hooks'
import { play } from '../platform/sound'
import { warp } from '../platform/warp'
import { adjustSlider } from '../ui/Slider'
import { closeDialog, dialogState } from './dialog'
import { backFor, current, go, move, pageScroll, screen, shoulderFor } from './nav'
import { quickOpen, setQuick, toggleQuick } from './quick'

export interface InputButton {
  button: string
  pressed: boolean
  repeat?: boolean
}

let gameOptions: ((id: string) => void) | null = null

export function setGameOptionsHandler(fn: (id: string) => void) {
  gameOptions = fn
}

function back() {
  const dialog = dialogState.peek()
  if (dialog) {
    play('back')
    closeDialog(null)
    return
  }
  if (quickOpen.value) {
    toggleQuick()
    return
  }
  if (backFor(screen.value)) {
    play('back')
    return
  }
  if (screen.value !== 'home') {
    play('back')
    go('home')
  }
}

function onButton(event: InputButton) {
  if (!event.pressed) return
  const el = current()
  const typing = dialogState.peek()?.kind === 'text'

  if (typing && !['up', 'down', 'left', 'right', 'a', 'b'].includes(event.button)) return

  switch (event.button) {
    case 'up':
    case 'down':
    case 'left':
    case 'right':
      if (el?.dataset.slider && (event.button === 'left' || event.button === 'right')) {
        adjustSlider(el, event.button === 'right' ? 0.05 : -0.05)
        return
      }
      move(event.button)
      return
    case 'a':
      if (!event.repeat || el?.hasAttribute('data-repeat')) (el ?? (document.activeElement as HTMLElement | null))?.click()
      return
    case 'b':
      if (!event.repeat) back()
      return
    case 'x':
      if (el?.dataset.game && gameOptions) gameOptions(el.dataset.game)
      return
    case 'select':
    case 'guide':
      return toggleQuick()
    case 'l1':
    case 'r1':
      if (!quickOpen.value && !dialogState.peek()) shoulderFor(screen.value, event.button === 'l1' ? -1 : 1)
      return
    case 'l2':
    case 'r2':
      return pageScroll(event.button === 'l2' ? -1 : 1)
    case 'start':
      if (!quickOpen.value && !dialogState.peek()) go(screen.value === 'settings' ? 'home' : 'settings')
      return
  }
}

export function useGamepad() {
  useEffect(() => warp.on('input.button', value => onButton(value as InputButton)), [])
}

export { setQuick }
