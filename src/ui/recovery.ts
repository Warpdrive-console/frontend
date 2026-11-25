import {
  AlreadyBackedUp,
  recovery,
  refreshRecovery,
  restoreRecovery,
  setUpRecovery,
  startOverRecovery,
  weakPassphrase,
  WrongPassphrase,
  type RecoveryStatus,
} from '../api/e2ee'
import { askText, dialog } from '../state/dialog'
import { note } from '../state/toasts'

export const RECOVERY_ROW: Record<RecoveryStatus, { value: string; sub: string }> = {
  unknown: {
    value: 'Checking…',
    sub: 'Looking for a backup of your keys on Rotur.',
  },
  none: {
    value: 'Not backed up',
    sub: 'Choose a passphrase so a new device can read your messages.',
  },
  locked: {
    value: 'Locked',
    sub: 'Your keys are backed up. Enter your passphrase to read messages here.',
  },
  unsaved: {
    value: 'Not backed up',
    sub: 'This device has a key that is not in your backup yet.',
  },
  on: {
    value: 'Backed up',
    sub: 'Your keys are backed up and unlocked on this device.',
  },
}

function failed(error: unknown) {
  note({
    title: 'Encryption passphrase',
    text: (error as Error).message || 'Something went wrong. Try again.',
    bad: true,
  })
}

/** Asks for a new passphrase twice, then makes the first backup or replaces a forgotten one. */
async function choosePassphrase(startOver: boolean): Promise<void> {
  const passphrase = await askText({
    title: startOver ? 'Choose a new encryption passphrase' : 'Choose an encryption passphrase',
    text: 'At least 8 characters. A few words work well.',
    secret: true,
    done: 'Next',
    max: 128,
  })
  if (passphrase === null) return

  const weak = weakPassphrase(passphrase)
  if (weak) {
    note({ title: 'Choose another passphrase', text: weak, bad: true })
    return
  }

  const repeated = await askText({
    title: 'Type your passphrase again',
    text: 'Nobody can reset it, so keep it somewhere safe.',
    secret: true,
    done: 'Save',
    max: 128,
  })
  if (repeated === null) return
  if (repeated !== passphrase) {
    note({ title: "Those passphrases don't match", bad: true })
    return
  }

  await (startOver ? startOverRecovery(passphrase) : setUpRecovery(passphrase))
  note({
    title: startOver ? 'You started over with a new key' : 'Encryption keys backed up',
    text: startOver
      ? 'Older messages only open on devices that still have your old key.'
      : 'Your other devices can unlock them with that passphrase.',
  })
}

/**
 * Chooses a first passphrase, asks for the one that opens the backup, or starts over when it is
 * forgotten. The passphrase is used here and not kept: what it opens is written to Rotur sealed,
 * never the passphrase itself.
 */
export async function manageEncryptionPassphrase(): Promise<void> {
  let status: RecoveryStatus = 'unknown'
  try {
    status = await refreshRecovery()

    if (status === 'on') {
      note({ title: 'Your keys are backed up', text: 'They are unlocked on this device.' })
      return
    }

    if (status === 'unknown') {
      note({
        title: "Couldn't check your encryption backup",
        text: 'Check your connection and try again.',
        bad: true,
      })
      return
    }

    if (status === 'none') {
      await choosePassphrase(false)
      return
    }

    const locked = status === 'locked'
    const typed = await askText({
      title: locked ? 'Enter your encryption passphrase' : 'Back up this device',
      text: locked
        ? 'The one you chose on another device. Only enter a passphrase you chose yourself.'
        : "Enter your passphrase to add this device's key to your backup.",
      secret: true,
      done: locked ? 'Unlock' : 'Back up',
      max: 128,
    })
    if (typed === null) return

    await restoreRecovery(typed)
    note({
      title: locked ? 'Encrypted messages unlocked' : 'This device is backed up',
      text: locked ? 'Your keys are here now.' : 'Your other devices can read what is sent to this one.',
    })
  } catch (error) {
    if (error instanceof AlreadyBackedUp) {
      recovery.value = 'locked'
      note({ title: 'Your keys are already backed up', text: 'Enter the passphrase you chose for them.', bad: true })
      return
    }

    if (status === 'locked' && error instanceof WrongPassphrase) {
      const action = await dialog({
        title: "That passphrase doesn't open your backup",
        text: 'You can start over with a new key. Messages sent to the old key will only open on devices that still have it.',
        actions: [['Cancel'], ['Start over', true, true]],
      })
      if (action !== 'Start over') return
      try {
        await choosePassphrase(true)
      } catch (again) {
        failed(again)
      }
      return
    }

    failed(error)
  }
}
