import { useEffect, useState } from 'preact/hooks'
import { chatsApi } from '../api/chats'
import {
  accept,
  bare,
  beginLogin,
  decline,
  displayName,
  isOnline,
  nameOf,
  logout,
  onlineCount,
  profile as fetchProfile,
  remove,
  request,
  rotur,
  signedIn,
} from '../api/rotur'
import { Icon } from '../platform/icons'
import { Avatar } from '../ui/Avatar'
import { askText, dialog } from '../state/dialog'
import { go, setScreenPrompts, screen } from '../state/nav'
import { note } from '../state/toasts'
import { LoginView } from './LoginView'

export function Friends() {
  const [tab, setTab] = useState<'friends' | 'requests'>('friends')
  const token = rotur.value.token

  useEffect(() => {
    if (screen.value !== 'friends' || token) return
    if (!rotur.value.linkCode) void beginLogin()
  }, [screen.value, token])

  useEffect(
    () =>
      setScreenPrompts('friends', el => {
        if (el?.dataset.side === 'out') return [['b', 'Home'], ['a', 'Sign out']]
        return [
          ['b', 'Home'],
          ['a', el?.dataset.side === 'add' ? 'Add' : 'Open'],
        ]
      }),
    [],
  )

  if (!signedIn()) return <LoginView why="Sign in to see your friends, who is online, and to send messages." />

  const friends = [...rotur.value.friends]
    .map(nameOf)
    .sort((a, b) => Number(isOnline(b)) - Number(isOnline(a)) || a.localeCompare(b))

  return (
    <div class="split">
      <nav class="side" data-zone="side">
        <div class="profile-card" style={{ marginBottom: '.5rem' }}>
          <Avatar username={rotur.value.username} size={6} statusSize="lg" />
          <b>{displayName()}</b>
          <small>@{rotur.value.username}</small>
          <small>
            {onlineCount()} of {rotur.value.friends.length} friends online
          </small>
        </div>
        <button data-nav data-side="friends" class={tab === 'friends' ? 'on' : ''} onClick={() => setTab('friends')}>
          <Icon name="friends" />
          Friends
        </button>
        <button data-nav data-side="requests" class={tab === 'requests' ? 'on' : ''} onClick={() => setTab('requests')}>
          <Icon name="inbox" />
          Requests
          {rotur.value.requests.length ? <span class="count">{rotur.value.requests.length}</span> : null}
        </button>
        <button data-nav data-side="add" onClick={() => void addFriend()}>
          <Icon name="person-add" />
          Add friend
        </button>
        <button
          data-nav
          data-side="out"
          onClick={() => {
            void dialog({ title: 'Sign out of Rotur?', actions: [['Cancel'], ['Sign out', true]] }).then(action => {
              if (action === 'Sign out') logout()
            })
          }}
        >
          <Icon name="signout" />
          Sign out
        </button>
      </nav>
      <div class="pane">
        <div class="page" data-zone="pane">
          <div class="page-head">
            <h2>{tab === 'friends' ? 'Friends' : 'Friend requests'}</h2>
          </div>
          <div class="list">{tab === 'friends' ? friendRows(friends) : requestRows(rotur.value.requests)}</div>
        </div>
      </div>
    </div>
  )
}

function friendRows(friends: string[]) {
  if (!friends.length) return <div class="empty">No friends yet. Add someone by their Rotur username.</div>
  return friends.map(name => (
    <button class="row" data-nav key={name} onClick={() => void showProfile(name)}>
      <Avatar username={name} size={2.4} />
      <span class="label">{name}</span>
    </button>
  ))
}

function requestRows(requests: (string | { username?: string; name?: string })[]) {
  if (!requests.length) return <div class="empty">No pending requests.</div>
  return requests.map(item => {
    const name = nameOf(item)
    return (
      <button
        class="row"
        data-nav
        key={name}
        onClick={() => {
          void (async () => {
            const action = await dialog({
              title: `${name} wants to be friends`,
              actions: [['Decline', false, true], ['Later'], ['Accept', true]],
            })
            if (action === 'Accept') {
              const error = await accept(name)
              if (error) note({ title: 'Could not accept', text: error, bad: true })
              else note({ title: `You and ${name} are now friends`, username: name })
            }
            if (action === 'Decline') {
              const error = await decline(name)
              if (error) note({ title: 'Could not decline', text: error, bad: true })
            }
          })()
        }}
      >
        <Avatar username={name} size={2.4} />
        <span class="label">
          {name}
          <small>Friend request</small>
        </span>
        <Icon name="chevron" class="chev" />
      </button>
    )
  })
}

async function addFriend() {
  const name = await askText({ title: 'Add a friend', text: 'Their Rotur username', done: 'Send request', max: 40 })
  if (!name) return
  const error = await request(name)
  if (error) note({ title: 'Request not sent', text: error, bad: true })
  else note({ title: 'Request sent', text: `Waiting for ${name} to accept`, username: name })
}

async function showProfile(name: string) {
  const profile = await fetchProfile(name)
  const card = (
    <div class="profile-card">
      <Avatar username={name} size={6} statusSize="lg" />
      <b>{name}</b>
      {profile?.pronouns ? <small>{profile.pronouns}</small> : null}
      {profile?.bio ? <p>{profile.bio}</p> : null}
      {profile ? (
        <small>
          {String(profile.followers ?? 0)} followers · {String(profile.following ?? 0)} following
          {profile.created ? ` · joined ${new Date(profile.created).getFullYear()}` : ''}
        </small>
      ) : null}
    </div>
  )
  const action = await dialog({
    title: 'Profile',
    extra: card,
    actions: [['Remove friend', false, true], ['Close'], ['Message', true]],
  })
  if (action === 'Message') {
    const channel = chatsApi.startDM(name)
    if (channel) go('messages')
  }
  if (action === 'Remove friend') {
    const confirm = await dialog({
      title: `Remove ${name}?`,
      text: 'You can send a new request later.',
      actions: [['Cancel'], ['Remove', true, true]],
    })
    if (confirm !== 'Remove') return
    const error = await remove(name)
    if (error) note({ title: 'Could not remove', text: error, bad: true })
  }
}

export { bare }
