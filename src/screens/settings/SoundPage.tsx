import { usePoint } from '../../platform/usePoint'
import { call } from '../../platform/warp'
import { PrefToggleRow, Row, ToggleRow } from '../../ui/Row'
import { Slider } from '../../ui/Slider'
import { Grid, H3, KV } from '../../ui/parts'

export function SoundPage() {
  const available = usePoint<boolean>('system.haptics.available')
  return (
    <>
      <Slider path="system.audio.volume" label="Volume" />
      <ToggleRow path="system.audio.muted" label="Mute" />
      <ToggleRow path="system.audio.mic_muted" label="Microphone off" />
      <Grid class="two">
        <KV label="Output" spec="system.audio.output" format="cap" />
        <KV label="Vibration motor" spec="system.haptics.available" format="yes" />
      </Grid>
      <H3>Interface</H3>
      <PrefToggleRow pref="sounds" label="Menu sounds" sub="Clicks and chimes while you navigate" />
      {available.value !== false ? <Slider path="system.haptics.strength" label="Vibration feedback" /> : null}
      {available.value !== false ? (
        <Row label="Test vibration" onClick={() => void call('system.haptics.vibrate', { pattern: [40, 60, 40, 60, 120] })} />
      ) : null}
    </>
  )
}
