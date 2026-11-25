import { Slider } from '../../ui/Slider'
import { Row, ToggleRow } from '../../ui/Row'
import { Segmented } from '../../ui/Segmented'
import { Bind } from '../../ui/Bind'
import { Grid, H3, KV } from '../../ui/parts'
import { warp } from '../../platform/warp'

const STEPS = [30, 60, 120, 300, 600, 1800]

export function DisplayPage() {
  return (
    <>
      <Slider path="system.display.brightness" label="Brightness" />
      <ToggleRow path="system.display.auto_brightness" label="Adaptive brightness" />
      <H3>Refresh rate</H3>
      <Segmented path="system.display.refresh_rate" optionsPath="system.display.refresh_rates" suffix=" Hz" />
      <ToggleRow path="system.display.night_light" label="Night Light" sub="Warmer colours in the evening" />
      <ToggleRow path="system.display.rotation_lock" label="Lock rotation" />
      <Row
        label="Screen off after"
        value={<Bind spec="system.display.sleep_after" format="dur" />}
        onClick={() => {
          const now = warp.peek<number>('system.display.sleep_after') || 60
          void warp.set('system.display.sleep_after', STEPS.find(step => step > now) || STEPS[0]).catch(() => {})
        }}
      />
      <Grid>
        <KV label="Resolution" spec="system.display.info" format="res" />
        <KV label="Density" spec="system.display.info:density" />
        <KV label="HDR" spec="system.display.info:hdr" format="yes" />
      </Grid>
    </>
  )
}
