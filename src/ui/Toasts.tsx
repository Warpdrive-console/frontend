import { Icon } from '../platform/icons'
import { Avatar } from './Avatar'
import { dismiss, toasts } from '../state/toasts'

export function Toasts() {
  return (
    <div class="notes" id="notes">
      {toasts.value.map(toast => (
        <div class={`note${toast.bad ? ' bad' : ''}`} key={toast.id} onClick={() => dismiss(toast.id)}>
          <ToastPicture toast={toast} />
          <div style={{ minWidth: 0 }}>
            <b>{toast.title}</b>
            {toast.text ? <small>{toast.text}</small> : null}
          </div>
        </div>
      ))}
    </div>
  )
}

function ToastPicture({ toast }: { toast: import('../state/toasts').Toast }) {
  if (toast.username) return <Avatar username={toast.username} size={2.2} />
  if (toast.image) return <img src={toast.image} alt="" />
  return <Icon name={toast.icon || (toast.bad ? 'close' : 'check')} />
}
