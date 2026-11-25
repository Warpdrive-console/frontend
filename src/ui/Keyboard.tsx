import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { play } from '../platform/sound'
import { warp } from '../platform/warp'
import { finishText, type TextOptions } from '../state/dialog'

const LETTERS = [
  '1234567890',
  'qwertyuiop',
  "asdfghjkl'",
  ['shift', ...'zxcvbnm', 'del'],
  ['sym', ',', 'space', '.', 'left', 'right', 'done'],
]

const SYMBOLS = [
  '1234567890',
  '!@#$%^&*()',
  '-_=+[]{};:',
  ['/', '?', '\\', '|', '"', '<', '>', '`', '~', 'del'],
  ['sym', ',', 'space', '.', 'left', 'right', 'done'],
]

const LABELS: Record<string, string> = { shift: '⇧', del: '⌫', space: 'space', left: '←', right: '→' }
const SIZES: Record<string, number> = { shift: 1.5, del: 1.5, sym: 1.5, space: 3, done: 1.5 }

export function Keyboard({ options }: { options: TextOptions }) {
  const max = options.max ?? 500
  const done = options.done ?? 'Done'
  const [value, setValue] = useState(() => String(options.value || '').slice(0, max))
  const [caret, setCaret] = useState(value.length)
  const [shift, setShift] = useState(0)
  const [symbols, setSymbols] = useState(false)
  const [show, setShow] = useState(!options.secret)
  const lastShift = useRef(0)
  const field = useRef<HTMLDivElement>(null)
  const grid = useRef<HTMLDivElement>(null)
  const valueRef = useRef(value)
  const caretRef = useRef(caret)

  const rows = symbols ? SYMBOLS : LETTERS
  const shown = show ? value : '•'.repeat(value.length)
  const canFinish = !!value || !!options.allowEmpty

  const setText = (text: string, position: number) => {
    valueRef.current = text
    caretRef.current = position
    setValue(text)
    setCaret(position)
  }

  const insert = (text: string) => {
    const current = valueRef.current
    const position = caretRef.current
    const room = max - current.length
    if (!text || room <= 0) return
    const piece = text.slice(0, room)
    setText(current.slice(0, position) + piece + current.slice(position), position + piece.length)
    if (shift === 1) setShift(0)
  }

  const erase = () => {
    const current = valueRef.current
    const position = caretRef.current
    if (!position) return
    setText(current.slice(0, position - 1) + current.slice(position), position - 1)
  }

  const moveCaret = (delta: number) => {
    const current = valueRef.current
    setText(current, Math.max(0, Math.min(current.length, caretRef.current + delta)))
  }

  const finish = () => {
    if (valueRef.current || options.allowEmpty) finishText(valueRef.current)
  }

  const press = (key: string) => {
    play('move')
    if (key === 'shift') {
      const now = performance.now()
      const recent = now - lastShift.current < 400
      if (shift === 0) setShift(recent ? 2 : 1)
      else if (shift === 1) setShift(recent ? 2 : 0)
      else setShift(0)
      lastShift.current = now
    } else if (key === 'sym') setSymbols(!symbols)
    else if (key === 'del') erase()
    else if (key === 'space') insert(' ')
    else if (key === 'left') moveCaret(-1)
    else if (key === 'right') moveCaret(1)
    else if (key === 'done') finish()
    else insert(shift ? key.toUpperCase() : key)
  }

  useEffect(() => {
    field.current?.scrollTo({ top: field.current.scrollHeight })
  }, [value, caret])

  useEffect(() => {
    const key = grid.current?.querySelector<HTMLElement>('.key')
    key?.focus({ preventScroll: true })
  }, [symbols])

  useEffect(() => {
    const offPad = warp.on('input.button', (event: any) => {
      if (!event.pressed) return
      if (event.button === 'y') erase()
      else if (event.button === 'x') insert(' ')
      else if (event.button === 'l1') moveCaret(-1)
      else if (event.button === 'r1') moveCaret(1)
      else if (event.button === 'select' && !event.repeat) press('shift')
      else if (event.button === 'start' && !event.repeat) finish()
    })

    const onKey = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return
      let used = true
      if (event.type === 'keydown') {
        if (event.key.length === 1) insert(event.key)
        else if (event.key === 'Backspace') erase()
        else if (event.key === 'Delete') {
          const current = valueRef.current
          const position = caretRef.current
          setText(current.slice(0, position) + current.slice(position + 1), position)
        } else if (event.key === 'Home') moveCaret(-caretRef.current)
        else if (event.key === 'End') moveCaret(valueRef.current.length)
        else if (event.key === 'Enter') finish()
        else used = false
      } else used = event.key.length === 1 || event.key === 'Backspace' || event.key === 'Enter'
      if (used) event.preventDefault()
    }

    const onPaste = (event: ClipboardEvent) => {
      insert((event.clipboardData?.getData('text') || '').replace(/\s*\n\s*/g, ' '))
      event.preventDefault()
    }

    addEventListener('keydown', onKey, true)
    addEventListener('keyup', onKey, true)
    addEventListener('paste', onPaste, true)
    return () => {
      offPad()
      removeEventListener('keydown', onKey, true)
      removeEventListener('keyup', onKey, true)
      removeEventListener('paste', onPaste, true)
    }
  }, [value, caret, shift, symbols, canFinish])

  const keyLabel = (key: string) => {
    if (key === 'sym') return symbols ? 'abc' : '#+='
    if (key === 'done') return done
    return LABELS[key] || (shift ? key.toUpperCase() : key)
  }

  const keyRows = useMemo(
    () =>
      rows.map((row, rowIndex) => {
        const keys = [...row] as string[]
        return (
          <div class="osk-row" key={rowIndex}>
            {keys.map((key, column) => (
              <button
                key={`${rowIndex}-${column}`}
                class={`key${key.length > 1 ? ' fn' : ''}${key === 'done' ? ' go' : ''}`}
                id={`kb-${rowIndex}-${column}`}
                data-nav
                data-k={key}
                data-repeat={key === 'shift' || key === 'sym' || key === 'done' ? undefined : ''}
                data-nav-left={column === 0 ? `#kb-${rowIndex}-${keys.length - 1}` : undefined}
                data-nav-right={column === keys.length - 1 ? `#kb-${rowIndex}-0` : undefined}
                style={{ flexGrow: SIZES[key] || 1 }}
                onClick={() => press(key)}
              >
                {keyLabel(key)}
              </button>
            ))}
          </div>
        )
      }),
    [symbols, shift, done],
  )

  return (
    <>
      <div class="kb-head">
        <div class="kb-title">
          <b>{options.title}</b>
          {options.text && value ? <small>{options.text}</small> : null}
        </div>
        {options.secret ? (
          <button class="chip" data-nav onClick={() => setShow(!show)}>
            {show ? 'Hide' : 'Show'}
          </button>
        ) : null}
        <button class="chip" data-nav onClick={() => finishText(null)}>
          Cancel
        </button>
      </div>
      <div class="kb-body">
        <div class="kb-box">
          <div class="kb-field" ref={field} onPointerDown={() => setText(valueRef.current, valueRef.current.length)}>
            {value ? (
              <>
                <span>{shown.slice(0, caret)}</span>
                <i class="kb-caret" />
                <span>{shown.slice(caret)}</span>
              </>
            ) : (
              <>
                <i class="kb-caret" />
                <span class="kb-hint">{options.text || 'Type here'}</span>
              </>
            )}
          </div>
          <small class="kb-count">{value.length > max * 0.8 ? `${value.length} / ${max}` : ''}</small>
        </div>
        <div class="osk" ref={grid}>
          {keyRows}
        </div>
      </div>
    </>
  )
}
