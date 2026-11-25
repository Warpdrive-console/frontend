import { useEffect, useRef, useState } from 'preact/hooks'
import { call, warp } from '../../platform/warp'
import { Row } from '../../ui/Row'
import { Segmented } from '../../ui/Segmented'
import { Grid, H3, KV } from '../../ui/parts'

export function MotionPage() {
  const cube = useRef<HTMLDivElement>(null)
  const pitch = useRef<HTMLElement>(null)
  const roll = useRef<HTMLElement>(null)
  const yaw = useRef<HTMLElement>(null)
  const pitchValue = useRef<HTMLElement>(null)
  const rollValue = useRef<HTMLElement>(null)
  const yawValue = useRef<HTMLElement>(null)
  const gyro = useRef<HTMLDivElement>(null)
  const accel = useRef<HTMLDivElement>(null)
  const [shakes, setShakes] = useState(0)

  useEffect(() => {
    let last: any = null
    let frame = 0
    const draw = () => {
      frame = 0
      if (!last) return
      const orientation = last.orientation
      if (cube.current)
        cube.current.style.transform = `rotateX(${-orientation.pitch}deg) rotateY(${orientation.yaw}deg) rotateZ(${orientation.roll}deg)`
      bar(pitch.current, orientation.pitch, 90)
      bar(roll.current, orientation.roll, 180)
      bar(yaw.current, orientation.yaw, 180)
      if (pitchValue.current) pitchValue.current.textContent = Math.round(orientation.pitch) + '°'
      if (rollValue.current) rollValue.current.textContent = Math.round(orientation.roll) + '°'
      if (yawValue.current) yawValue.current.textContent = Math.round(orientation.yaw) + '°'
      ;(last.gyro || []).forEach((value: number, index: number) => {
        const row = gyro.current?.children[index] as HTMLElement | undefined
        if (!row) return
        bar(row.querySelector('b'), value, 5)
        const label = row.querySelector('em')
        if (label) label.textContent = value.toFixed(2)
      })
      ;(last.accel || []).forEach((value: number, index: number) => {
        const row = accel.current?.children[index] as HTMLElement | undefined
        if (!row) return
        bar(row.querySelector('b'), value, 12)
        const label = row.querySelector('em')
        if (label) label.textContent = value.toFixed(1)
      })
    }
    const offMotion = warp.on('sensors.motion', (value: any) => {
      last = value
      if (!frame) frame = requestAnimationFrame(draw)
    })
    const offShake = warp.on('sensors.shake', () => setShakes(count => count + 1))
    return () => {
      offMotion()
      offShake()
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])

  return (
    <>
      <div class="motion-stage">
        <div class="cube-box">
          <div class="cube" ref={cube}>
            <i>FRONT</i>
            <i>BACK</i>
            <i />
            <i />
            <i>TOP</i>
            <i />
          </div>
        </div>
        <div class="axes">
          <Axis label="P" barRef={pitch} valueRef={pitchValue} />
          <Axis label="R" barRef={roll} valueRef={rollValue} />
          <Axis label="Y" barRef={yaw} valueRef={yawValue} />
        </div>
      </div>
      <H3>Gyroscope (rad/s)</H3>
      <div class="axes" ref={gyro}>
        {['X', 'Y', 'Z'].map(label => (
          <Axis key={label} label={label} />
        ))}
      </div>
      <H3>Accelerometer (m/s²)</H3>
      <div class="axes" ref={accel}>
        {['X', 'Y', 'Z'].map(label => (
          <Axis key={label} label={label} />
        ))}
      </div>
      <Grid>
        <KV label="Light" spec="sensors.light" format="lux" />
        <div class="kv">
          <span>Shakes</span>
          <b>{shakes}</b>
        </div>
        <KV label="Rate" spec="sensors.rate" format="hz" />
      </Grid>
      <H3>Sample rate</H3>
      <Segmented path="sensors.rate" options={[15, 30, 60]} suffix=" Hz" />
      <Row label="Recenter" sub="Make the current heading straight ahead" onClick={() => void call('sensors.recenter')} />
    </>
  )
}

function Axis({ label, barRef, valueRef }: { label: string; barRef?: any; valueRef?: any }) {
  return (
    <div class="axis">
      <span>{label}</span>
      <div class="bipolar">
        <b ref={barRef} />
      </div>
      <em ref={valueRef} />
    </div>
  )
}

function bar(element: HTMLElement | null, value: number, range: number) {
  if (!element) return
  const fraction = Math.max(-1, Math.min(1, value / range))
  element.style.left = fraction < 0 ? 50 + fraction * 50 + '%' : '50%'
  element.style.width = Math.abs(fraction) * 50 + '%'
}

