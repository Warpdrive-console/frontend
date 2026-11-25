import { RichText } from '@rotur/ui/richtext'
import { normalizeMediaText } from '../api/media'
import { canonicalAssets } from '../platform/text'

/** Message Markdown through @rotur/ui, so emoji, links and formatting match originChats. */
export function MessageText({ text, inline = false }: { text: string; inline?: boolean }) {
  const Root = inline ? 'span' : 'div'
  return (
    <Root class={`rotur-ui message-text${inline ? ' message-text-inline' : ''}`}>
      <RichText text={canonicalAssets(normalizeMediaText(text))} inlineOnly={inline} />
    </Root>
  )
}
