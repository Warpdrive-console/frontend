import { useEffect } from 'preact/hooks'
import { backend } from '../../api/backend'
import { recovery, refreshRecovery } from '../../api/e2ee'
import {
  displayName,
  hasSecure,
  logout,
  onlineCount,
  rotur,
  setSecure,
  signedIn,
} from '../../api/rotur'
import { secure } from '../../api/secure'
import { play } from '../../platform/sound'
import { setPref } from '../../state/prefs'
import { dialog } from '../../state/dialog'
import { go } from '../../state/nav'
import { PrefToggleRow, Row } from '../../ui/Row'
import { Avatar } from '../../ui/Avatar'
import { Card, Grid, H3 } from '../../ui/parts'
import { manageEncryptionPassphrase, RECOVERY_ROW } from '../../ui/recovery'
import { note } from '../../state/toasts'

export function AccountPage() {
  const state = rotur.value

  useEffect(() => {
    if (state.token) void refreshRecovery()
  }, [state.token])

  if (!signedIn()) {
    return (
      <>
        <div class="profile-card">
          <Avatar username="" size={6} showStatus={false} />
          <b>Not signed in</b>
          <small>Sign in with Rotur for friends, presence and messages.</small>
        </div>
        <Row label="Sign in with Rotur" onClick={() => go('friends')} chevron />
      </>
    )
  }

  return (
    <>
      <div class="profile-card">
        <Avatar username={state.username} size={6} statusSize="lg" />
        <b>{displayName()}</b>
        <small>@{state.username}</small>
        <p>{state.user?.bio || ''}</p>
      </div>
      <Grid class="two">
        <div class="kv">
          <span>Friends</span>
          <b>{state.friends.length}</b>
        </div>
        <div class="kv">
          <span>Online now</span>
          <b>{onlineCount()}</b>
        </div>
      </Grid>
      <Row label="Warpdrive account" value={backend.value.status} onClick={() => {
        if (backend.value.session) return
        void dialog({
          title: 'Sign in to Warpdrive again?',
          text: 'This signs you out of Rotur so you can approve a new link code.',
          actions: [['Cancel'], ['Continue', true]],
        }).then(action => {
          if (action !== 'Continue') return
          logout()
          go('friends')
        })
      }} />
      <Row label="Friends" onClick={() => go('friends')} chevron />
      <Row label="Messages" onClick={() => go('messages')} chevron />
      <H3>Message security</H3>
      <Security />
      <H3>Encrypted direct messages</H3>
      <Card>
        <small>
          Direct messages are encrypted end to end by default. Your passphrase backs up the keys
          that read them, so a new device can unlock your old messages instead of making a new key.
        </small>
      </Card>
      <Row
        label="Encryption passphrase"
        value={RECOVERY_ROW[recovery.value].value}
        sub={RECOVERY_ROW[recovery.value].sub}
        onClick={() => void manageEncryptionPassphrase()}
      />
      <Row
        label="Sign out"
        danger
        onClick={() => {
          void dialog({ title: 'Sign out of Rotur?', actions: [['Cancel'], ['Sign out', true]] }).then(action => {
            if (action === 'Sign out') logout()
          })
        }}
      />
    </>
  )
}

function Security() {
  useEffect(() => {
    void secure.probeKey()
  }, [rotur.value.token])

  if (secure.keyState.value === 'unsupported')
    return <Card><small>This WebView can't do Ed25519, so messages can't be signed, checked or encrypted. Update Android System WebView.</small></Card>

  if (!hasSecure())
    return (
      <>
        <Card>
          <small>Incoming signatures are already checked. To sign what you send and to use encrypted chats, Warpdrive needs to read your Rotur signing key.</small>
        </Card>
        <Row
          label="Turn on message security"
          sub="You will sign in again"
          onClick={() => {
            void dialog({
              title: 'Turn on message security?',
              text: 'You will sign in again and allow "Read private signing key". Rotur may ask for your password.',
              actions: [['Cancel'], ['Continue', true]],
            }).then(action => {
              if (action === 'Continue') setSecure(true)
            })
          }}
        />
      </>
    )

  return (
    <>
      <PrefToggleRow pref="signMessages" label="Sign my messages" sub="Others can check a message really came from you" />
      <Card><small>Direct messages are encrypted by default. If one can't be encrypted, you are asked before it is sent in the clear.</small></Card>
      <Row
        label="Turn off message security"
        sub="Stops signing and decrypting on this device"
        onClick={() => {
          void dialog({
            title: 'Turn off message security?',
            text: 'Encrypted chats will stay unreadable here until you turn it on again. To fully revoke the key permission, remove this device under Tokens on rotur.dev.',
            actions: [['Cancel'], ['Turn off', true, true]],
          }).then(action => {
            if (action !== 'Turn off') return
            setSecure(false)
            setPref('signMessages', false)
            play('toggle')
            note({ title: 'Message security off' })
          })
        }}
      />
    </>
  )
}
