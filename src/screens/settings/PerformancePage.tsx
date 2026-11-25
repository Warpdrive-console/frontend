import { usePoint } from '../../platform/usePoint'
import { Graph } from '../../ui/Graph'
import { Meter } from '../../ui/Bind'
import { Segmented } from '../../ui/Segmented'
import { Grid, H3, KV } from '../../ui/parts'

export function PerformancePage() {
  const fan = usePoint<boolean>('system.fan.available')
  return (
    <>
      <H3>Profile</H3>
      <Segmented path="system.performance.profile" optionsPath="system.performance.profiles" />
      {fan.value !== false ? (
        <>
          <H3>Fan</H3>
          <Segmented path="system.fan.mode" optionsPath="system.fan.modes" />
          <Grid class="two">
            <KV label="Fan speed" spec="system.fan.rpm" format="rpm" />
            <KV label="Mode" spec="system.fan.mode" format="cap" />
          </Grid>
        </>
      ) : null}
      <Graph path="system.performance.cpu_usage" label="CPU load" format="pct" min={0} max={1} span={0.4} />
      <Graph path="system.performance.cpu_temp" label="CPU temperature" format="temp" span={10} />
      <Graph path="system.performance.gpu_usage" label="GPU load" format="pct" min={0} max={1} span={0.4} />
      <Grid>
        <KV label="Avg clock" spec="system.performance.cpu_freq:avg_mhz" format="mhz" />
        <KV label="Max clock" spec="system.performance.cpu_freq:max_mhz" format="mhz" />
        <KV label="Heat" spec="system.performance.thermal" format="cap" />
        <KV label="Memory" spec="system.performance.memory" format="ram" wide />
        <KV label="In use" spec="system.performance.memory:fraction" format="pct" />
      </Grid>
      <Meter spec="system.performance.memory:fraction" format="pct" />
    </>
  )
}
