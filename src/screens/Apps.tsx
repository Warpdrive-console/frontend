import { useEffect } from 'preact/hooks'
import type { AndroidApp } from '../api/types'
import { Icon } from '../platform/icons'
import { play } from '../platform/sound'
import { call } from '../platform/warp'
import { usePoint } from '../platform/usePoint'
import { setScreenPrompts } from '../state/nav'

export function Apps() {
  const apps = usePoint<AndroidApp[]>('apps.list')

  useEffect(
    () =>
      setScreenPrompts('apps', () => [
        ['b', 'Home'],
        ['a', 'Open'],
      ]),
    [],
  )

  return (
    <>
      <div class="screen-head">
        <Icon name="apps" />
        <h1>Apps</h1>
      </div>
      <div class="app-grid scroll fades" id="app-grid" data-zone="apps">
        {(apps.value || []).map(app => (
          <button
            class="app"
            data-nav
            title={app.name}
            key={app.package}
            onClick={() => {
              play('select')
              void call('apps.launch', { package: app.package })
            }}
          >
            <img src={app.icon} alt="" loading="lazy" />
            <span>{app.name}</span>
          </button>
        ))}
      </div>
    </>
  )
}
