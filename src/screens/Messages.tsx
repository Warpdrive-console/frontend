import { Fragment } from 'preact'
import { useEffect, useRef, useState } from 'preact/hooks'
import { chats, chatsApi, type Message } from '../api/chats'
import {
  bare,
  beginLogin,
  meName,
  nameOf,
  rotur,
  signedIn,
} from '../api/rotur'
import { isSealed, KeysLocked, keysVersion, open as openSealed, recovery, type SealedFile } from '../api/e2ee'
import { secure } from '../api/secure'
import { Icon } from '../platform/icons'
import { play } from '../platform/sound'
import { askText, dialog } from '../state/dialog'
import { focus, go, setScreenPrompts, screen } from '../state/nav'
import { settingsStack } from '../state/settings'
import { note } from '../state/toasts'
import { Avatar } from '../ui/Avatar'
import { MessageExtras } from '../ui/MessageExtras'
import { MessageText } from '../ui/MessageText'
import { manageEncryptionPassphrase } from '../ui/recovery'
import { LoginView } from './LoginView'

const timeOf = (value?: number) => {
  const timestamp = value || 0
  const date = new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp)
  if (date.toDateString() === new Date().toDateString())
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

const dayOf = (value?: number) => {
  const timestamp = value || 0
  const date = new Date(timestamp < 1e12 ? timestamp * 1000 : timestamp)
  if (date.toDateString() === new Date().toDateString()) return 'Today'
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

export function Messages() {
  const token = rotur.value.token
  const state = chats.value
  const thread = state.active ? state.threads.get(state.active) || [] : []
  const list = useRef<HTMLDivElement>(null)
  const inner = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (screen.value !== 'messages' || token) return
    if (!rotur.value.linkCode) void beginLogin()
  }, [screen.value, token])

  useEffect(() => {
    void secure.probeKey()
  }, [token])

  useEffect(
    () =>
      setScreenPrompts('messages', el => {
        if (el?.id === 'composer')
          return [
            ['l', 'Scroll'],
            ['b', 'Home'],
            ['a', 'Write'],
          ]
        if (el?.id === 'older')
          return [
            ['l', 'Scroll'],
            ['b', 'Home'],
            ['a', 'Load'],
          ]
        return [
          ['b', 'Home'],
          ['a', 'Open'],
        ]
      }),
    [],
  )

  useEffect(() => {
    if (state.active) chatsApi.markRead(state.active)
  }, [state.active, thread.length])

  useEffect(() => {
    if (!state.active && state.channels.length) chatsApi.open(state.channels[0].name)
  }, [state.channels.length, state.active])

  useEffect(() => {
    if (list.current) list.current.scrollTop = list.current.scrollHeight
  }, [state.active, thread.length])

  // Pictures, embeds and media load after the first scroll; stay at the newest message while
  // the reader hasn't scrolled back.
  useEffect(() => {
    const box = list.current
    const content = inner.current
    if (!box || !content) return
    let stick = true
    const onScroll = () => {
      stick = box.scrollHeight - box.scrollTop - box.clientHeight < 56
    }
    const observer = new ResizeObserver(() => {
      if (stick) box.scrollTop = box.scrollHeight
    })
    box.addEventListener('scroll', onScroll, { passive: true })
    observer.observe(content)
    onScroll()
    return () => {
      observer.disconnect()
      box.removeEventListener('scroll', onScroll)
    }
  }, [state.active])

  if (!signedIn())
    return <LoginView why="Messages use your Rotur account. Sign in to chat with friends." />

  const channels = [...state.channels].sort((a, b) => (b.last_message || 0) - (a.last_message || 0))
  const activeChannel = channels.find(channel => channel.name === state.active)

  return (
    <div class="split">
      <nav class="side" data-zone="side">
        <button data-nav data-nav-right="#composer" onClick={() => void newMessage()}>
          <Icon name="add" />
          New message
        </button>
        {channels.map(channel => {
          const unread = chatsApi.unread(channel.name)
          return (
            <button
              key={channel.name}
              data-nav
              data-ch={channel.name}
              data-nav-right="#composer"
              class={channel.name === state.active ? 'on' : ''}
              onClick={() => {
                chatsApi.open(channel.name)
                play('select')
              }}
            >
              <Avatar
                username={chatsApi.title(channel)}
                size={1.9}
                showStatus={channel.type !== 'group'}
              />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                {chatsApi.title(channel)}
                <small style={{ display: 'block' }}>{channel.last_message ? timeOf(channel.last_message) : ''}</small>
              </span>
              {unread ? <span class="count">{unread}</span> : null}
            </button>
          )
        })}
        {state.connected ? null : <small style={{ padding: '.6rem .8rem' }}>{state.status}</small>}
      </nav>
      <div class="pane">
        <div class="page chat" data-zone="pane">
          {activeChannel ? (
            <>
              <div class="chat-head">
                <Avatar username={chatsApi.title(activeChannel)} size={2.2} statusSize="sm" showStatus={activeChannel.type !== 'group'} />
                <b>{chatsApi.title(activeChannel)}</b>
              </div>
              <div class="msgs" ref={list}>
                <div class="msgs-inner" ref={inner}>
                  {chatsApi.hasOlder(activeChannel.name) ? (
                    <button
                      class="chip"
                      data-nav
                      id="older"
                      style={{ alignSelf: 'center', margin: '.2rem 0 .4rem' }}
                      onClick={() => {
                        chatsApi.loadOlder(activeChannel.name)
                        play('select')
                      }}
                    >
                      Load older messages
                    </button>
                  ) : (
                    <div class="msg-day">Start of conversation</div>
                  )}
                  {thread.map((message, index) => {
                    const day = new Date((message.timestamp || 0) < 1e12 ? (message.timestamp || 0) * 1000 : message.timestamp || 0).toDateString()
                    const previous = thread[index - 1]
                    const previousDay = previous
                      ? new Date((previous.timestamp || 0) < 1e12 ? (previous.timestamp || 0) * 1000 : previous.timestamp || 0).toDateString()
                      : ''
                    return (
                      <Fragment key={message.id ?? `${message.user}-${message.timestamp}-${index}`}>
                        {day !== previousDay ? <div class="msg-day">{dayOf(message.timestamp)}</div> : null}
                        <Bubble
                          message={message}
                          channel={activeChannel.name}
                          dm={activeChannel.type !== 'group'}
                        />
                      </Fragment>
                    )
                  })}
                </div>
              </div>
              {recovery.value === 'locked' ? lockedHint() : null}
              {chatsApi.signing().on ? null : signingHint()}
              <div class="composer">
                <button
                  class="row"
                  data-nav
                  id="composer"
                  data-nav-up="#older"
                  onClick={() => void write()}
                >
                  <Icon name="messages" />
                  Write a message…
                </button>
              </div>
            </>
          ) : (
            <div class="list">
              <div class="empty">{state.connected ? 'No conversations yet. Start one with New message.' : state.status}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Bubble({ message, channel, dm }: { message: Message; channel: string; dm: boolean }) {
  const me = bare(meName())
  const mine = !!me && bare(message.user) === me
  const sealed = isSealed(message.content)
  const [decoded, setDecoded] = useState<{ text: string; files: SealedFile[]; warning?: string } | null>(null)
  const [openError, setOpenError] = useState('')
  const replyTo = typeof message.reply_to === 'string' ? message.reply_to : message.reply_to?.id
  const thread = message.thread_id || message.thread

  useEffect(() => {
    if (!sealed) return
    let live = true
    setDecoded(null)
    setOpenError('')
    openSealed(message.content!, message.user || '', channel, chatsApi.signingUrl(), {
      replyTo,
      thread,
      senderId: typeof message.author_id === 'string' ? message.author_id : undefined,
    })
      .then(body => {
        if (!live) return
        if (body.warning) console.warn('[e2ee]', body.warning)
        setDecoded(body)
      })
      .catch(error => {
        if (!live) return
        setOpenError((error as Error).message)
        console.warn('[e2ee] could not open a message:', error)
      })
    return () => {
      live = false
    }
  }, [sealed, message.content, message.user, channel, replyTo, thread, keysVersion.value])

  let text = message.content
  if (sealed) text = decoded?.text ?? (openError ? 'This message could not be opened' : 'Waiting for this message')
  const extras = sealed
    ? { sealedFiles: decoded?.files }
    : { attachments: message.attachments, embeds: message.embeds }

  const verification = secure.check(message, chatsApi.signingUrl(), chatsApi.changed)
  let signatureWarning = ''
  if (chatsApi.signs() && verification === 'unsigned')
    signatureWarning = 'Unsigned message — this server signs messages, but this one was not signed.'
  else if (chatsApi.signs() && verification === 'invalid')
    signatureWarning = 'Invalid signature — this message may have been changed.'
  const warning = [
    signatureWarning,
    decoded?.warning,
    openError ? `Could not open this message: ${openError}` : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div class={`msg${mine ? ' mine' : ''}`}>
      {sealed && !decoded ? <span class="msg-waiting">{text}</span> : <MessageText text={text || ''} />}
      <MessageExtras {...extras} />
      <time>
        {!sealed && dm ? (
          <span class="msg-flag" role="img" aria-label="Not encrypted" title="Not encrypted — the server can read this message">
            <Icon name="lock-open" />
          </span>
        ) : null}
        {warning ? (
          <span class="msg-flag bad" role="img" aria-label={warning} title={warning}>
            <Icon name="warning" />
          </span>
        ) : null}
        {timeOf(message.timestamp)}
      </time>
    </div>
  )
}

function lockedHint() {
  return (
    <div class="sign-hint">
      <Icon name="lock" />
      <span>Your encrypted messages are locked on this device.</span>
      <button class="chip" data-nav onClick={() => void manageEncryptionPassphrase()}>
        Unlock
      </button>
    </div>
  )
}

function openAccount() {
  settingsStack.value = ['account']
  go('settings')
  setTimeout(() => {
    const first = document.querySelector<HTMLElement>('.page:not([hidden]) [data-nav]')
    if (first) focus(first, true)
  }, 50)
}

function signingHint() {
  const status = chatsApi.signing()
  if (status.reason === 'Connecting…') return null
  return (
    <div class="sign-hint">
      <Icon name="lock" />
      <span>Your messages aren't signed: {status.reason}</span>
      <button class="chip" data-nav onClick={openAccount}>
        Fix
      </button>
    </div>
  )
}

async function write() {
  const channel = chats.value.active
  if (!channel) return
  const text = await askText({
    title: `Message ${chatsApi.title(chats.value.channels.find(item => item.name === channel))}`,
    done: 'Send',
    max: 2000,
  })
  if (!text) return
  try {
    await chatsApi.send(text)
    play('select')
  } catch (error) {
    if (error instanceof KeysLocked) {
      const action = await dialog({
        title: 'Your encryption keys are locked',
        text: error.message,
        actions: [['Cancel'], ['Open Account', true]],
      })
      if (action === 'Open Account') openAccount()
      return
    }
    const message = (error as Error).message
    const action = await dialog({
      title: 'Could not encrypt that message',
      text: `${message}. Send it unencrypted?`,
      actions: [['Cancel'], ['Send unencrypted', true]],
    })
    if (action !== 'Send unencrypted') return
    try {
      await chatsApi.send(text, true)
      play('select')
    } catch (again) {
      note({ title: 'Message not sent', text: (again as Error).message, bad: true })
    }
  }
}

async function newMessage() {
  const friends = rotur.value.friends.map(nameOf)
  const pick = await dialog({
    title: 'New message',
    text: friends.length ? 'Pick a friend, or type a username.' : 'Type a Rotur username.',
    actions: [...friends.slice(0, 6).map(name => [name] as [string]), ['Type a name…'], ['Cancel']],
  })
  let who: string | null = null
  if (pick === 'Type a name…') who = await askText({ title: 'Message who?', text: 'Rotur username', done: 'Open chat', max: 40 })
  else if (pick !== 'Cancel') who = pick
  if (!who) return
  chatsApi.startDM(who.trim())
  go('messages')
}
