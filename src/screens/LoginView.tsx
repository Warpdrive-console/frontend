import { useEffect, useState } from 'preact/hooks'
import qrcode from 'qrcode-generator'
import { beginLogin, rotur } from '../api/rotur'
import { Icon } from '../platform/icons'

export function LoginView({ why }: { why: string }) {
  const { linkCode, loginStatus } = rotur.value
  const [svg, setSvg] = useState('')

  useEffect(() => {
    if (!linkCode) {
      setSvg('')
      return
    }
    const code = qrcode(0, 'M')
    code.addData(`https://rotur.dev/link?code=${encodeURIComponent(linkCode)}`)
    code.make()
    setSvg(code.createSvgTag({ cellSize: 4, margin: 0, scalable: true }))
  }, [linkCode])

  return (
    <div class="login">
      <div>
        <h2>Sign in with Rotur</h2>
        <p>{why}</p>
        <ol>
          <li>Scan the code with your phone, or open rotur.dev/link</li>
          <li>Enter the code shown here and approve</li>
          <li>This screen updates by itself</li>
        </ol>
        <div class="state">{loginStatus}</div>
        <div class="chips" style={{ marginTop: '1rem' }}>
          <button class="chip" data-nav onClick={() => void beginLogin()}>
            <Icon name="qr" />
            New code
          </button>
        </div>
      </div>
      <div>
        <div class="qr" dangerouslySetInnerHTML={{ __html: svg }} />
        <div class="code">{linkCode}</div>
      </div>
    </div>
  )
}
