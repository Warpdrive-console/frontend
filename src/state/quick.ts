import { signal } from '@preact/signals'
import { play } from '../platform/sound'
import { warp } from '../platform/warp'
import { dialogState } from './dialog'
import { popLayer, pushLayer } from './nav'

export const quickOpen = signal(false)

export function setQuick(open: boolean) {
  if (quickOpen.value === open) return
  quickOpen.value = open
  if (open) pushLayer('quick')
  else popLayer('quick')
}

export function toggleQuick() {
  if (dialogState.value) return
  if (!quickOpen.value) {
    play('select')
    setQuick(true)
  } else if (warp.peek('library.running') && !warp.peek('library.in_front')) {
    void warp.call('library.resume').catch(() => {})
  } else {
    play('back')
    setQuick(false)
  }
}
