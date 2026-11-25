import { prefs } from '../state/prefs'

const names = ['move', 'select', 'back', 'toggle', 'notify', 'error', 'startup'] as const
export type SoundName = (typeof names)[number]

let ctx: AudioContext | null = null
const buffers: Partial<Record<SoundName, AudioBuffer>> = {}
let last = 0

export async function loadSounds() {
  try {
    ctx = new AudioContext()
    await Promise.all(
      names.map(async name => {
        const response = await fetch(`assets/sounds/${name}.wav`)
        buffers[name] = await ctx!.decodeAudioData(await response.arrayBuffer())
      }),
    )
  } catch {
    ctx = null
  }
}

export function play(name: SoundName) {
  if (!prefs.value.sounds || !ctx) return
  const buffer = buffers[name]
  if (!buffer) return
  if (name === 'move' && performance.now() - last < 40) return
  last = performance.now()
  if (ctx.state === 'suspended') void ctx.resume()
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)
  source.start()
}
