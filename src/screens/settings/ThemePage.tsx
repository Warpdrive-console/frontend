import { ACCENTS, prefs, setPref } from '../../state/prefs'
import { PrefToggleRow } from '../../ui/Row'
import { H3 } from '../../ui/parts'
import { play } from '../../platform/sound'

export function ThemePage() {
  return (
    <>
      <H3>Appearance</H3>
      <div class="seg">
        {(['dark', 'light'] as const).map(theme => (
          <button
            key={theme}
            data-nav
            aria-checked={prefs.value.theme === theme}
            onClick={() => {
              play('toggle')
              setPref('theme', theme)
            }}
          >
            {theme === 'dark' ? 'Basic Black' : 'Basic White'}
          </button>
        ))}
      </div>
      <H3>Accent colour</H3>
      <div class="swatches">
        {ACCENTS.map(([colour, name]) => (
          <button
            key={colour}
            class="sw"
            data-nav
            title={name}
            aria-checked={prefs.value.accent === colour}
            style={{ background: colour }}
            onClick={() => {
              play('toggle')
              setPref('accent', colour)
            }}
          />
        ))}
      </div>
      <PrefToggleRow pref="motion" label="Animations" sub="Turn off for a snappier, still interface" />
    </>
  )
}
