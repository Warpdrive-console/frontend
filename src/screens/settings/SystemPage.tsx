import { useEffect, useState } from 'preact/hooks'
import { dur } from '../../platform/format'
import { Icon } from '../../platform/icons'
import { call, warp } from '../../platform/warp'
import { usePoint } from '../../platform/usePoint'
import { dialog } from '../../state/dialog'
import { note } from '../../state/toasts'
import { Row, ToggleRow } from '../../ui/Row'
import { H3, KV } from '../../ui/parts'
import { powerAsk } from '../Home'

interface Frontend {
  id: string
  name: string
  version?: string
  author?: string
  active?: boolean
}

export function SystemPage() {
  const [info, setInfo] = useState<Record<string, any> | null>(null)
  const [version, setVersion] = useState('')
  const [uptime, setUptime] = useState<number | null>(null)
  const frontends = usePoint<Frontend[]>('shell.frontend.list')
  const home = usePoint<boolean>('system.home.default')

  useEffect(() => {
    Promise.all([
      warp.get<Record<string, any>>('system.device.info'),
      warp.get<string>('shell.version'),
      warp.get<number>('system.device.uptime'),
    ])
      .then(([device, backendVersion, up]) => {
        setInfo(device)
        setVersion(backendVersion)
        setUptime(up)
      })
      .catch(error => note({ title: 'Could not read system info', text: (error as Error).message, bad: true }))
  }, [])

  const openFrontend = async (frontend: Frontend) => {
    const action = await dialog({
      title: frontend.name,
      text:
        [frontend.version ? 'Version ' + frontend.version : null, frontend.author ? 'by ' + frontend.author : null]
          .filter(Boolean)
          .join(' · ') || 'Installed frontend.',
      actions: frontend.active
        ? [['Remove', false, true], ['Reload'], ['Close', true]]
        : [['Remove', false, true], ['Cancel'], ['Switch to it', true]],
    })
    if (action === 'Switch to it') void call('shell.frontend.activate', { id: frontend.id })
    if (action === 'Reload') void call('shell.frontend.reload')
    if (action !== 'Remove') return
    const remove = await dialog({
      title: `Remove ${frontend.name}?`,
      text: frontend.active ? 'You will go back to the frontend picker.' : '',
      actions: [['Keep it'], ['Remove', true, true]],
    })
    if (remove === 'Remove') void call('shell.frontend.remove', { id: frontend.id })
  }

  const showLog = async () => {
    const text = (await warp.get<string>('shell.log').catch(() => '')) || 'Nothing logged.'
    const pre = (
      <pre
        style={{
          maxHeight: '55vh',
          overflow: 'auto',
          fontSize: '.7rem',
          lineHeight: 1.35,
          whiteSpace: 'pre-wrap',
          background: 'var(--bg)',
          padding: '.6rem',
          borderRadius: '.4rem',
          userSelect: 'text',
        }}
      >
        {text.split('\n').slice(-120).join('\n')}
      </pre>
    )
    const action = await dialog({
      title: 'Error log',
      extra: pre,
      actions: [
        ['Clear', false, true],
        ['Close', true],
      ],
    })
    if (action === 'Clear') void call('shell.log_clear')
  }

  return (
    <>
      <div class="grid">
        {info ? (
          <>
            <div class="kv wide">
              <span>Device</span>
              <b>{info.name}</b>
            </div>
            <div class="kv">
              <span>Root</span>
              <b>{info.rooted ? 'Yes' : 'No'}</b>
            </div>
            <KV label="Model" spec="system.device.info:model" />
            <KV label="Maker" spec="system.device.info:manufacturer" />
            <KV label="Chip" spec="system.device.info:soc" />
            <KV label="Android" spec="system.device.info:android" />
            <KV label="RAM" spec="system.device.info:ram" format="gb" />
            <KV label="Patch" spec="system.device.info:security_patch" />
            <KV label="Kernel" spec="system.device.info:kernel" class="full" />
            <div class="kv">
              <span>Up for</span>
              <b>{dur(uptime)}</b>
            </div>
            <div class="kv">
              <span>Backend</span>
              <b>{version || 'n/a'}</b>
            </div>
            <div class="kv">
              <span>Frontend</span>
              <b>Nova 4</b>
            </div>
          </>
        ) : null}
      </div>
      <ToggleRow path="system.notifications.dnd" label="Do not disturb" />
      <Row
        label="Take a screenshot"
        onClick={() =>
          void warp
            .call<string>('system.display.screenshot')
            .then(path => note({ title: 'Screenshot saved', text: path.split('/').pop(), icon: 'camera' }))
            .catch(() => {})
        }
      />
      <Row label="Use Nova as the home screen" value={home.value ? 'Yes' : 'No'} onClick={() => {
        if (home.value) return note({ title: 'Nova is already the home screen' })
        void call('system.home.request')
      }} />
      <H3>Frontends</H3>
      <div class="list">
        {(frontends.value || []).map(frontend => (
          <button class="row" data-nav key={frontend.id} onClick={() => void openFrontend(frontend)}>
            <span class="label">
              {frontend.name}
              <small>{frontend.version ? 'Version ' + frontend.version : 'Frontend'}</small>
            </span>
            {frontend.active ? <span class="tag on">In use</span> : null}
            <Icon name="chevron" class="chev" />
          </button>
        ))}
      </div>
      <Row label="Install a frontend" sub="Pick a website .zip" onClick={() => void call('shell.frontend.pick')} />
      <Row label="Error log" sub="Crashes and errors, newest last" onClick={() => void showLog()} />
      <H3>Power</H3>
      <div class="chips">
        <button class="chip" data-nav onClick={() => void powerAsk('sleep', 'Sleep')}>Sleep</button>
        <button class="chip" data-nav onClick={() => void powerAsk('reboot', 'Restart')}>Restart</button>
        <button class="chip" data-nav onClick={() => void powerAsk('recovery', 'Recovery')}>Recovery</button>
        <button class="chip" data-nav onClick={() => void powerAsk('bootloader', 'Bootloader')}>Bootloader</button>
        <button class="chip danger" data-nav onClick={() => void powerAsk('shutdown', 'Power off')}>Power off</button>
      </div>
    </>
  )
}
