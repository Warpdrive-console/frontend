import { useEffect, useRef, useState } from 'preact/hooks'
import { fmt } from '../platform/format'
import { usePoint } from '../platform/usePoint'

let accentCache = ''
function accentRGB() {
  if (!accentCache) {
    const probe = document.createElement('i')
    probe.style.cssText = 'display:none;color:var(--accent)'
    document.body.append(probe)
    accentCache = getComputedStyle(probe).color
    probe.remove()
  }
  return accentCache
}

const rgba = (rgb: string, alpha: number) => rgb.replace('rgb(', 'rgba(').replace(')', `, ${alpha})`)

export function Graph({
  path,
  label,
  format = 'text',
  abs = false,
  min,
  max,
  span = 0,
}: {
  path: string
  label: string
  format?: string
  abs?: boolean
  min?: number
  max?: number
  span?: number
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const data = useRef<number[]>([])
  const drawRef = useRef<() => void>(() => {})
  const value = usePoint<number>(path)
  const [stats, setStats] = useState<{ low: number; avg: number; high: number } | null>(null)

  const range = () => {
    let low = Math.min(...data.current)
    let high = Math.max(...data.current)
    if (min != null) low = Math.min(low, min)
    if (max != null) high = Math.max(high, max)
    const need = Math.max(span, (high - low) * 1.2, 1e-6)
    const middle = (low + high) / 2
    let a = middle - need / 2
    let b = middle + need / 2
    if (min != null && a < min) {
      b += min - a
      a = min
    }
    if (max != null && b > max) {
      a -= b - max
      b = max
    }
    return [a, b] as const
  }

  const draw = () => {
    const element = canvas.current
    if (!element) return
    const dpr = devicePixelRatio || 1
    const width = Math.round(element.clientWidth * dpr)
    const height = Math.round(element.clientHeight * dpr)
    if (!width || !height) return
    if (element.width !== width || element.height !== height) {
      element.width = width
      element.height = height
    }
    const context = element.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, width, height)
    const styles = getComputedStyle(document.documentElement)
    const line = styles.getPropertyValue('--line').trim()
    const faint = styles.getPropertyValue('--faint').trim()
    const accent = accentRGB()
    const count = data.current.length
    const [low, high] = count ? range() : [0, 1]
    const top = 14 * dpr
    const bottom = 4 * dpr
    const y = (value: number) => top + (1 - (value - low) / (high - low)) * (height - top - bottom)

    context.font = `600 ${10 * dpr}px system-ui, sans-serif`
    context.textBaseline = 'bottom'
    for (let i = 0; i <= 2; i++) {
      const value = low + (high - low) * (i / 2)
      const lineY = Math.round(y(value)) + 0.5
      context.strokeStyle = line
      context.lineWidth = dpr
      context.beginPath()
      context.moveTo(0, lineY)
      context.lineTo(width, lineY)
      context.stroke()
      if (count && i) {
        context.fillStyle = faint
        context.fillText(fmt(format, value), 0, lineY - 2 * dpr)
      }
    }

    if (count < 2) {
      context.fillStyle = faint
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      context.fillText('Collecting…', width / 2, height / 2)
      context.textAlign = 'start'
      return
    }

    const step = (width - 6 * dpr) / (count - 1)
    const points = data.current.map((value, index) => [index * step, y(value)] as const)
    context.beginPath()
    points.forEach(([x, pointY], index) => (index ? context.lineTo(x, pointY) : context.moveTo(x, pointY)))
    context.strokeStyle = accent
    context.lineWidth = 2 * dpr
    context.lineJoin = 'round'
    context.stroke()
    context.lineTo(points.at(-1)![0], height)
    context.lineTo(0, height)
    context.closePath()
    context.fillStyle = rgba(accent, 0.12)
    context.fill()

    const [lastX, lastY] = points.at(-1)!
    context.fillStyle = accent
    context.beginPath()
    context.arc(lastX, lastY, 3 * dpr, 0, 7)
    context.fill()
  }
  drawRef.current = draw

  useEffect(() => {
    const next = value.value
    if (next == null || Number.isNaN(next)) return
    data.current.push(abs ? Math.abs(next) : next)
    if (data.current.length > 40) data.current.shift()
    const low = Math.min(...data.current)
    const high = Math.max(...data.current)
    const avg = data.current.reduce((sum, item) => sum + item, 0) / data.current.length
    setStats({ low, avg, high })
    draw()
  }, [value.value, abs])

  useEffect(() => {
    const element = canvas.current
    if (!element) return
    const observer = new ResizeObserver(() => drawRef.current())
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div class="graph-card">
      <div class="gh">
        <span>{label}</span>
        <b>{fmt(format, value.value)}</b>
      </div>
      <canvas class="graph" ref={canvas} />
      <div class="gf">
        {stats ? (
          <>
            <span>
              Low<b>{fmt(format, stats.low)}</b>
            </span>
            <span>
              Avg<b>{fmt(format, stats.avg)}</b>
            </span>
            <span>
              High<b>{fmt(format, stats.high)}</b>
            </span>
          </>
        ) : null}
      </div>
    </div>
  )
}
