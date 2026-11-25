export interface SocketOptions {
  url: string
  onOpen?: (socket: Socket) => void
  onFrame?: (message: any, socket: Socket) => void
  onDown?: () => void
  heartbeat?: () => unknown
}

export class Socket {
  private ws: WebSocket | null = null
  private timer: ReturnType<typeof setTimeout> | undefined
  private beat: ReturnType<typeof setInterval> | undefined
  private wait = 1000
  private want = false

  constructor(private options: SocketOptions) {}

  connect() {
    this.want = true
    if (this.ws && this.ws.readyState <= 1) return
    let socket: WebSocket
    try {
      socket = new WebSocket(this.options.url)
    } catch {
      return this.retry()
    }
    this.ws = socket
    socket.onopen = () => {
      this.wait = 1000
      this.options.onOpen?.(this)
      if (this.options.heartbeat) this.beat = setInterval(() => this.send(this.options.heartbeat!()), 20_000)
    }
    socket.onmessage = event => {
      let message: unknown
      try {
        message = JSON.parse(event.data)
      } catch {
        return
      }
      this.options.onFrame?.(message, this)
    }
    socket.onclose = () => {
      clearInterval(this.beat)
      this.options.onDown?.()
      if (this.ws === socket) {
        this.ws = null
        this.retry()
      }
    }
    socket.onerror = () => {}
  }

  private retry() {
    if (!this.want) return
    clearTimeout(this.timer)
    this.timer = setTimeout(() => this.connect(), this.wait)
    this.wait = Math.min(this.wait * 2, 30_000)
  }

  send(message: unknown) {
    if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(message))
  }

  close() {
    this.want = false
    clearTimeout(this.timer)
    clearInterval(this.beat)
    const socket = this.ws
    this.ws = null
    try {
      socket?.close()
    } catch {
      /* already closed */
    }
  }

  get open() {
    return this.ws?.readyState === 1
  }
}
