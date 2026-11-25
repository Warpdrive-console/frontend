import { signal } from '@preact/signals'
import type { ComponentChildren } from 'preact'
import { popLayer, pushLayer } from './nav'

export type DialogAction = [label: string, primary?: boolean, danger?: boolean]

export interface TextOptions {
  title: string
  text?: string
  value?: string
  secret?: boolean
  done?: string
  allowEmpty?: boolean
  max?: number
}

export interface DialogState {
  kind: 'dialog' | 'text'
  title: string
  text?: string
  extra?: ComponentChildren
  actions: DialogAction[]
  textOptions?: TextOptions
  resolve: (value: string | null) => void
}

export const dialogState = signal<DialogState | null>(null)

function open(state: DialogState) {
  if (dialogState.peek()) closeDialog(null)
  dialogState.value = state
  pushLayer('dialog')
}

export function dialog(options: {
  title: string
  text?: string
  extra?: ComponentChildren
  actions?: DialogAction[]
}): Promise<string | null> {
  return new Promise(resolve => {
    open({
      kind: 'dialog',
      title: options.title,
      text: options.text,
      extra: options.extra,
      actions: options.actions ?? [['OK', true]],
      resolve,
    })
  })
}

export function askText(options: TextOptions): Promise<string | null> {
  return new Promise(resolve => {
    open({
      kind: 'text',
      title: options.title,
      text: options.text,
      actions: [],
      textOptions: options,
      resolve,
    })
  })
}

export function closeDialog(value: string | null) {
  const state = dialogState.peek()
  if (!state) return
  dialogState.value = null
  popLayer('dialog')
  state.resolve(value)
}

export function finishText(value: string | null) {
  const state = dialogState.peek()
  if (!state || state.kind !== 'text') return
  dialogState.value = null
  popLayer('dialog')
  state.resolve(value)
}
