import { configureRoturUI } from '@rotur/ui'
import { createParser } from '@rotur/ui/richtext'
import { isGifUrl } from '../api/media'

// GIFs on originChats' service have no file extension, so the shared parser needs to be told
// that their links are images rather than ordinary links.
configureRoturUI({
  parser: createParser({ isImageUrl: isGifUrl }),
})
