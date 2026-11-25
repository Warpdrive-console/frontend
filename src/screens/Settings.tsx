import { useEffect } from 'preact/hooks'
import type { ComponentType } from 'preact'
import { Icon } from '../platform/icons'
import { focus, setScreenPrompts, screen, topLayer } from '../state/nav'
import { installSettingsNav, popPage, settingsStack, showPage } from '../state/settings'
import { AccountPage } from './settings/AccountPage'
import { BatteryPage } from './settings/BatteryPage'
import { BluetoothPage } from './settings/BluetoothPage'
import { ControllersPage } from './settings/ControllersPage'
import { DisplayPage } from './settings/DisplayPage'
import { MotionPage } from './settings/MotionPage'
import { NetworkPage } from './settings/NetworkPage'
import { PerformancePage } from './settings/PerformancePage'
import { SoundPage } from './settings/SoundPage'
import { StoragePage } from './settings/StoragePage'
import { SystemPage } from './settings/SystemPage'
import { ThemePage } from './settings/ThemePage'
import { WifiPage, WifiSavedPage, HotspotPage } from './settings/WifiPage'

interface Page {
  title: string
  icon: string
  component: ComponentType
  category: boolean
}

const PAGES: Record<string, Page> = {
  account: { title: 'Account', icon: 'account', component: AccountPage, category: true },
  wifi: { title: 'Wi-Fi', icon: 'wifi', component: WifiPage, category: true },
  wifi_saved: { title: 'Saved networks', icon: 'wifi', component: WifiSavedPage, category: false },
  hotspot: { title: 'Hotspot', icon: 'wifi', component: HotspotPage, category: false },
  bt: { title: 'Bluetooth', icon: 'bluetooth', component: BluetoothPage, category: true },
  network: { title: 'Network', icon: 'network', component: NetworkPage, category: true },
  battery: { title: 'Battery', icon: 'battery', component: BatteryPage, category: true },
  display: { title: 'Display', icon: 'display', component: DisplayPage, category: true },
  sound: { title: 'Sound', icon: 'sound', component: SoundPage, category: true },
  performance: { title: 'Performance', icon: 'performance', component: PerformancePage, category: true },
  motion: { title: 'Motion sensors', icon: 'motion', component: MotionPage, category: true },
  controllers: { title: 'Controllers', icon: 'controller', component: ControllersPage, category: true },
  storage: { title: 'Storage', icon: 'storage', component: StoragePage, category: true },
  theme: { title: 'Theme', icon: 'theme', component: ThemePage, category: true },
  system: { title: 'System', icon: 'system', component: SystemPage, category: true },
}

const CATEGORIES = Object.entries(PAGES)
  .filter(([, page]) => page.category)
  .map(([id]) => id)

export function Settings() {
  const stack = settingsStack.value
  const activeCategory = stack[0]

  useEffect(() => installSettingsNav(), [])
  useEffect(
    () =>
      setScreenPrompts('settings', el =>
        el?.closest('#set-side')
          ? [
              ['b', 'Home'],
              ['a', 'Open'],
            ]
          : [
              ['b', 'Back'],
              ['a', 'Select'],
            ],
      ),
    [],
  )

  const select = (id: string) => showPage(id, true)

  useEffect(() => {
    if (screen.value !== 'settings' || topLayer.value || !document.activeElement?.closest('#set-side')) return
    const button = document.querySelector<HTMLElement>(`#set-side [data-cat="${activeCategory}"]`)
    if (button) focus(button, true)
  }, [screen.value])

  return (
    <div class="split">
      <nav class="side fades" id="set-side" data-zone="side">
        {CATEGORIES.map(id => (
          <button
            key={id}
            data-nav
            data-cat={id}
            class={activeCategory === id ? 'on' : ''}
            onClick={() => select(id)}
          >
            <Icon name={PAGES[id].icon} />
            {PAGES[id].title}
          </button>
        ))}
      </nav>
      <div class="pane" id="set-pane">
        {stack.map((id, index) => {
          const page = PAGES[id]
          if (!page) return null
          const Component = page.component
          return (
            <div class="page fades" data-zone="pane" data-page={id} hidden={index !== stack.length - 1} key={`${index}-${id}`}>
              <div class="page-head">
                {index > 0 ? (
                  <button class="back" data-nav onClick={() => popPage()}>
                    <Icon name="back" />
                  </button>
                ) : null}
                <h2>{page.title}</h2>
              </div>
              <Component />
            </div>
          )
        })}
      </div>
    </div>
  )
}

