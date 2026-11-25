import { useEffect, useState } from 'preact/hooks'
import type { Game } from '../api/types'
import { Icon } from '../platform/icons'
import { play } from '../platform/sound'
import { call, warp } from '../platform/warp'
import { usePoint } from '../platform/usePoint'
import { quickOpen, setQuick, toggleQuick } from '../state/quick'
import { Bind } from './Bind'
import { ToggleRow } from './Row'
import { Slider } from './Slider'
import { Segmented } from './Segmented'
import { H3 } from './parts'

export function QuickMenu() {
  const games = usePoint<Game[]>('library.games')
  const running = usePoint<string | null>('library.running')
  const [clock, setClock] = useState(() => new Date())
  const format24 = usePoint<boolean>('system.time.format24')

  useEffect(() => {
    if (!quickOpen.value) return
    const timer = setInterval(() => setClock(new Date()), 5000)
    return () => clearInterval(timer)
  }, [quickOpen.value])

  const game = (games.value || []).find(item => item.id === running.value)
  const time = clock
    .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: !format24.value })
    .replace(/\s?[AP]M$/i, '')

  return (
    <div
      class="layer"
      id="quick"
      hidden={!quickOpen.value}
      onClick={event => event.target === event.currentTarget && toggleQuick()}
    >
      <aside class="panel fades" id="quick-panel" onClick={event => event.stopPropagation()}>
        {running.value ? (
          <div class="game-strip">
            <div class="gs-art" style={game?.icon ? { backgroundImage: `url("${game.icon}")` } : undefined} />
            <div class="gs-text">
              <small>Paused</small>
              <b>{game?.name || 'Game'}</b>
              <small>{game?.play_time ? `${Math.round(game.play_time / 60)}m played` : 'Just started'}</small>
            </div>
            <div class="gs-actions">
              <button class="chip primary" data-nav data-autofocus onClick={() => void call('library.resume')}>
                Resume
              </button>
              <button
                class="chip"
                data-nav
                onClick={() => {
                  void warp.call('library.close').then(() => setQuick(false)).catch(() => {})
                }}
              >
                Quit game
              </button>
            </div>
          </div>
        ) : null}
        <div class="q-head">
          <time class="clock">{time}</time>
          <small>
            <Bind spec="system.battery.level" format="pct" />
            {' · '}
            <Bind spec="system.battery.time_remaining" format="left" />
          </small>
        </div>
        <div class="q-grid">
          <ToggleRow quiet path="system.wifi.enabled" label="Wi-Fi" icon="wifi" />
          <ToggleRow quiet path="system.bluetooth.enabled" label="Bluetooth" icon="bluetooth" />
          <ToggleRow quiet path="system.network.airplane" label="Airplane" icon="plane" />
          <ToggleRow quiet path="system.network.mobile_data" label="Data" icon="cellular" />
          <ToggleRow quiet path="system.notifications.dnd" label="Quiet" icon="moon" />
          <ToggleRow quiet path="system.flashlight.enabled" label="Torch" icon="flashlight" />
          <ToggleRow quiet path="system.display.rotation_lock" label="Lock rotation" icon="rotation" />
          <ToggleRow quiet path="system.display.night_light" label="Night Light" icon="night" />
        </div>
        <Slider path="system.display.brightness" label="Brightness" />
        <Slider path="system.audio.volume" label="Volume" />
        <H3>Performance</H3>
        <div class="q-seg">
          <Icon name="chip" />
          <Segmented path="system.performance.profile" optionsPath="system.performance.profiles" />
        </div>
        <div class="q-seg">
          <Icon name="fan" />
          <Segmented path="system.fan.mode" optionsPath="system.fan.modes" />
        </div>
        <div class="grid two" style={{ marginTop: '0.2rem' }}>
          <div class="kv">
            <span>CPU</span>
            <b>
              <Bind spec="system.performance.cpu_temp" format="temp" />
            </b>
          </div>
          <div class="kv">
            <span>Draw</span>
            <b>
              <Bind spec="system.battery.power" format="watt" />
            </b>
          </div>
        </div>
        <div class="chips" style={{ marginTop: '0.3rem' }}>
          <button
            class="chip"
            data-nav
            onClick={() => {
              setQuick(false)
              void warp.call('system.display.screenshot').catch(() => {})
            }}
          >
            <Icon name="camera" />
            Screenshot
          </button>
          <button
            class="chip"
            data-nav
            onClick={() => {
              play('select')
              void call('system.power.sleep')
            }}
          >
            <Icon name="moon" />
            Sleep
          </button>
        </div>
      </aside>
    </div>
  )
}

