import { Glyph, Icon } from '../platform/icons'
import { prompts, SCREEN_META, screen } from '../state/nav'

export function Footer() {
  const meta = SCREEN_META[screen.value]
  return (
    <footer class="prompts">
      <div class="where">
        <Icon name={meta.icon} />
        <span>{meta.name}</span>
      </div>
      <div style={{ display: 'contents' }}>
        {prompts.value.map(([keys, label]) => (
          <span class="p" key={keys + label}>
            {keys.split('+').map(key => (
              <Glyph key={key} k={key} />
            ))}
            {label}
          </span>
        ))}
      </div>
    </footer>
  )
}
