import { transformOutsideCode } from '@rotur/ui/richtext'

const ASSET = /<(emoji|sticker):([^<>\s/]+)\/([^<>\s]+)>/g

/** The canonical `<emoji:server/id>` form, in the form the shared parser reads. */
export function canonicalAssets(text: string): string {
  return transformOutsideCode(text, part =>
    part.replace(ASSET, (_source, kind: string, host: string, id: string) => `originChats:<${kind}>//${host}/${id}`),
  )
}
