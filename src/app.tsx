import { useEffect } from 'preact/hooks'
import { connect } from './api/rotur'
import { current, enter, installNav, screen, SCREEN_META, screenPromptsFor, setPromptProvider, syncStick, topLayer, updatePrompts } from './state/nav'
import { applyPrefs } from './state/prefs'
import { warp } from './platform/warp'
import { loadSounds, play } from './platform/sound'
import { useGamepad } from './state/input'
import { dialogState } from './state/dialog'
import { Header } from './ui/Header'
import { Footer } from './ui/Footer'
import { Dialog, KEYBOARD_PROMPTS } from './ui/Dialog'
import { QuickMenu } from './ui/QuickMenu'
import { Toasts } from './ui/Toasts'
import { Home } from './screens/Home'
import { Apps } from './screens/Apps'
import { Settings } from './screens/Settings'
import { Friends } from './screens/Friends'
import { Messages } from './screens/Messages'

const SCREENS = {
  home: Home,
  apps: Apps,
  settings: Settings,
  friends: Friends,
  messages: Messages,
}

const SCREEN_IDS = ['home', 'apps', 'settings', 'friends', 'messages'] as const

export function App() {
  useGamepad()

  useEffect(() => {
    warp.keyboard(true)
    applyPrefs()
    const stopNav = installNav()
    setPromptProvider(() => {
      const dialog = dialogState.value
      if (dialog) {
        if (dialog.kind === 'text') return KEYBOARD_PROMPTS
        return [
          ['b', 'Back'],
          ['a', 'OK'],
        ]
      }
      if (topLayer.value === 'quick')
        return [
          ['b', 'Close'],
          ['a', 'Select'],
        ]
      const focused = current()
      const list = screenPromptsFor(screen.value, focused)
      if (!focused?.dataset.slider) return list
      return list.map(prompt => (prompt[0] === 'a' ? ['dpad', 'Adjust'] : prompt))
    })
    void loadSounds().then(() => play('startup'))
    void connect()
    return stopNav
  }, [])

  useEffect(() => {
    syncStick()
    requestAnimationFrame(() => {
      updatePrompts()
      if (!topLayer.value) enter()
    })
  }, [screen.value, topLayer.value])

  return (
    <>
      <Header />
      {SCREEN_IDS.map(id => {
        const Component = SCREENS[id]
        const meta = SCREEN_META[id]
        return (
          <section
            key={id}
            class={`screen${screen.value === id ? ' on' : ''}`}
            id={`screen-${id}`}
            data-name={meta.name}
            data-icon={meta.icon}
          >
            <Component />
          </section>
        )
      })}
      <Footer />
      <QuickMenu />
      <Dialog />
      <Toasts />
    </>
  )
}
