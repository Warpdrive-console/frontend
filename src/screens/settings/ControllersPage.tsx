import { useEffect, useRef } from 'preact/hooks'
import { pct } from '../../platform/format'
import { Icon } from '../../platform/icons'
import { call, warp } from '../../platform/warp'
import { usePoint } from '../../platform/usePoint'
import { Row } from '../../ui/Row'
import { Empty, H3 } from '../../ui/parts'

interface Pad {
  id: string
  name: string
  builtin?: boolean
  rumble?: boolean
}

export function ControllersPage() {
  const pads = usePoint<Pad[]>('input.gamepads')
  const leftStick = useRef<HTMLDivElement>(null)
  const rightStick = useRef<HTMLDivElement>(null)
  const leftTrigger = useRef<HTMLDivElement>(null)
  const rightTrigger = useRef<HTMLDivElement>(null)
  const last = useRef<HTMLElement>(null)
  const held = useRef<HTMLElement>(null)

  useEffect(() => {
    const heldButtons = new Set<string>()
    const offStick = warp.on('input.stick', (value: any) => {
      put(leftStick.current, value.lx, value.ly)
      put(rightStick.current, value.rx, value.ry)
      if (leftTrigger.current) leftTrigger.current.style.width = pct(value.lt)
      if (rightTrigger.current) rightTrigger.current.style.width = pct(value.rt)
    })
    const offButton = warp.on('input.button', (value: any) => {
      if (value.pressed) {
        heldButtons.add(value.button)
        if (last.current) last.current.textContent = value.button.toUpperCase()
      } else heldButtons.delete(value.button)
      if (held.current) held.current.textContent = heldButtons.size ? [...heldButtons].join(' + ').toUpperCase() : 'None'
    })
    return () => {
      offStick()
      offButton()
    }
  }, [])

  return (
    <>
      <div class="list">
        {(pads.value || []).length ? (
          (pads.value || []).map(pad => (
            <div class="row" key={pad.id}>
              <Icon name="controller" />
              <span class="label">
                {pad.name}
                <small>
                  {pad.builtin ? 'Built in' : 'Wireless'} · {pad.rumble ? 'rumble' : 'no rumble'}
                </small>
              </span>
              <span class={`tag${pad.builtin ? '' : ' on'}`}>{pad.builtin ? 'Built in' : 'Connected'}</span>
            </div>
          ))
        ) : (
          <Empty>No controllers found.</Empty>
        )}
      </div>
      <H3>Input test</H3>
      <div class="sticks">
        <div class="stick" ref={leftStick}>
          <b />
        </div>
        <div class="stick" ref={rightStick}>
          <b />
        </div>
      </div>
      <div class="grid two">
        <div class="kv">
          <div class="trig">
            <span>LT</span>
            <div class="meter">
              <b ref={leftTrigger} />
            </div>
          </div>
        </div>
        <div class="kv">
          <div class="trig">
            <span>RT</span>
            <div class="meter">
              <b ref={rightTrigger} />
            </div>
          </div>
        </div>
      </div>
      <div class="grid two">
        <div class="kv">
          <span>Last button</span>
          <b ref={last}>Press something</b>
        </div>
        <div class="kv">
          <span>Held</span>
          <b ref={held}>None</b>
        </div>
      </div>
      <Row label="Test rumble" onClick={() => void call('input.rumble', { ms: 400, strength: 1 })} />
    </>
  )
}

function put(element: HTMLElement | null, x: number, y: number) {
  const dot = element?.querySelector('b')
  if (!dot) return
  dot.style.left = 50 + x * 50 + '%'
  dot.style.top = 50 + y * 50 + '%'
}
