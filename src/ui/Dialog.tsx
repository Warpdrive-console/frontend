import { useEffect, useRef } from 'preact/hooks'
import { Glyph } from '../platform/icons'
import { play } from '../platform/sound'
import { closeDialog, dialogState } from '../state/dialog'
import { Keyboard } from './Keyboard'

export function Dialog() {
  const state = dialogState.value
  const card = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!state) return
    requestAnimationFrame(() => {
      const first = card.current?.querySelector<HTMLElement>('[data-autofocus]') ?? card.current?.querySelector<HTMLElement>('[data-nav]')
      first?.focus({ preventScroll: true })
    })
  }, [state])

  if (!state) return null

  return (
    <div
      class={`layer dialog${state.kind === 'text' ? ' kb' : ''}`}
      id="dialog"
      onClick={event => event.target === event.currentTarget && closeDialog(null)}
    >
      <div class="dialog-card fades" ref={card}>
        {state.kind === 'text' ? (
          <Keyboard options={state.textOptions!} />
        ) : (
          <>
            <h2>{state.title}</h2>
            {state.text ? <p>{state.text}</p> : null}
            {state.extra ? <div id="dialog-extra">{state.extra}</div> : null}
            <div class="dialog-actions">
              {state.actions.map(([label, primary, danger]) => (
                <button
                  key={label}
                  class={`chip${primary ? ' primary' : ''}${danger ? ' danger' : ''}`}
                  data-nav
                  data-autofocus={primary ? true : undefined}
                  onClick={() => {
                    play('select')
                    closeDialog(label)
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

export const KEYBOARD_PROMPTS: [string, string][] = [
  ['l+r', 'Cursor'],
  ['y', 'Delete'],
  ['x', 'Space'],
  ['start', 'Done'],
  ['b', 'Cancel'],
]

export function PromptGlyphs({ keys }: { keys: string }) {
  return (
    <>
      {keys.split('+').map(key => (
        <Glyph key={key} k={key} />
      ))}
    </>
  )
}
