import { useEffect, useRef } from 'preact/hooks'
import { chatsApi } from '../api/chats'
import { rotur } from '../api/rotur'
import type { Game } from '../api/types'
import { ago, dur } from '../platform/format'
import { Icon } from '../platform/icons'
import { play } from '../platform/sound'
import { call, warp } from '../platform/warp'
import { usePoint } from '../platform/usePoint'
import { askText, dialog } from '../state/dialog'
import { setGameOptionsHandler } from '../state/input'
import { focus, go, setScreenPrompts, topLayer } from '../state/nav'
import { note } from '../state/toasts'

function setTitle(title: string, sub: string) {
  const titleEl = document.getElementById('now-title')
  const subEl = document.getElementById('now-sub')
  if (titleEl) titleEl.textContent = title
  if (subEl) subEl.textContent = sub
}

function title(game: Game) {
  const running = warp.peek('library.running') === game.id
  setTitle(
    game.name,
    running
      ? 'Running · press A to return'
      : [game.last_played ? `Played ${ago(game.last_played)}` : 'Not played yet', game.play_time ? `${dur(game.play_time)} total` : null]
          .filter(Boolean)
          .join(' · '),
  )
}

async function addGame() {
  const game = await warp.call<Game>('library.install').catch(error => {
    note({ title: 'Could not install that game', text: (error as Error).message, bad: true })
    return null
  })
  if (game) note({ title: 'Game installed', text: game.name, icon: 'game' })
}

export async function gameOptions(id: string) {
  const game = (warp.peek<Game[]>('library.games') || []).find(item => item.id === id)
  if (!game) return
  const action = await dialog({
    title: game.name,
    text: `Installed ${ago(game.installed)}${game.play_time ? ` · ${dur(game.play_time)} played` : ''}`,
    actions: [['Delete', false, true], ['Rename'], ['Close', true]],
  })
  if (action === 'Rename') {
    const name = await askText({ title: 'Rename', value: game.name })
    if (name) void call('library.rename', { id, name })
  }
  if (
    action === 'Delete' &&
    (await dialog({
      title: `Delete ${game.name}?`,
      text: 'Its files and save data are removed.',
      actions: [['Keep it'], ['Delete', true, true]],
    })) === 'Delete'
  )
    void call('library.remove', { id })
}

export async function powerAsk(what: string, label: string) {
  if ((await dialog({ title: `${label}?`, actions: [['Cancel'], [label, true, what === 'shutdown']] })) === label)
    void call(`system.power.${what}`)
}

export async function powerMenu() {
  const action = await dialog({
    title: 'Power options',
    actions: [['Restart'], ['Power off', false, true], ['Sleep', true]],
  })
  if (action === 'Sleep') void call('system.power.sleep')
  if (action === 'Restart') void powerAsk('reboot', 'Restart')
  if (action === 'Power off') void powerAsk('shutdown', 'Power off')
}

export function Home() {
  const games = usePoint<Game[]>('library.games')
  const running = usePoint<string | null>('library.running')
  const first = useRef(true)

  const list = games.value || []

  useEffect(() => {
    setGameOptionsHandler(gameOptions)
  }, [])

  useEffect(
    () =>
      setScreenPrompts('home', el => {
        if (el?.dataset.game)
          return [
            ['x', 'Options'],
            ['select', 'Quick menu'],
            ['a', running.value === el.dataset.game ? 'Resume' : 'Start'],
          ]
        if (el?.id === 'me')
          return [
            ['select', 'Quick menu'],
            ['a', 'Profile'],
          ]
        return [
          ['select', 'Quick menu'],
          ['a', 'OK'],
        ]
      }),
    [running.value],
  )

  useEffect(() => {
    if (!first.current || !list.length || topLayer.value) return
    const tile = document.querySelector<HTMLElement>('#games [data-game]')
    if (tile) {
      first.current = false
      focus(tile, true)
    }
  }, [list.length])

  const requests = rotur.value.requests.length
  const unread = chatsApi.totalUnread()

  return (
    <>
      <div class="now-title">
        <b id="now-title" />
        <small id="now-sub" />
      </div>
      <div class="row-games" id="games" data-zone="games">
        {list.map(game => (
          <button
            key={game.id}
            class="tile"
            data-nav
            data-game={game.id}
            style={{ backgroundImage: `url("${game.icon || 'assets/cover.svg'}")` }}
            onFocus={() => title(game)}
            onClick={() => {
              play('select')
              if (running.value === game.id) void warp.call('library.resume').catch(() => {})
              else void warp.call('library.launch', { id: game.id }).catch(() => {})
            }}
          >
            {!game.icon ? <span class="initials">{initials(game.name)}</span> : null}
            {running.value === game.id ? <span class="badge">Running</span> : null}
          </button>
        ))}
        <button
          class="tile add"
          data-nav
          onClick={() => void addGame()}
          onFocus={() => setTitle('Add a game', 'Install a web game from a .zip')}
        >
          <Icon name="add" />
        </button>
      </div>
      <div class="round-label" id="dock-label" />
      <nav class="dock" id="dock" data-zone="dock">
        <button class="round" data-nav onClick={() => go('friends')} onFocus={() => setDockLabel('Friends')} onBlur={clearDockLabel}>
          <Icon name="friends" />
          {requests ? <span class="count">{requests}</span> : null}
        </button>
        <button class="round" data-nav onClick={() => go('messages')} onFocus={() => setDockLabel('Messages')} onBlur={clearDockLabel}>
          <Icon name="messages" />
          {unread ? <span class="count">{unread}</span> : null}
        </button>
        <button class="round" data-nav onClick={() => go('apps')} onFocus={() => setDockLabel('Apps')} onBlur={clearDockLabel}>
          <Icon name="apps" />
        </button>
        <button class="round" data-nav onClick={() => go('settings')} onFocus={() => setDockLabel('System Settings')} onBlur={clearDockLabel}>
          <Icon name="settings" />
        </button>
        <button class="round" data-nav onClick={() => void powerMenu()} onFocus={() => setDockLabel('Power')} onBlur={clearDockLabel}>
          <Icon name="power" />
        </button>
      </nav>
    </>
  )
}

function setDockLabel(label: string) {
  const el = document.getElementById('dock-label')
  if (el) el.textContent = label
}

function clearDockLabel() {
  setDockLabel('')
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map(word => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

