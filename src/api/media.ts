const GIFS_HOST = 'gifs.originchats.com'

/** Google Cloud Storage addresses some servers send as `gs://` or `gcs://`, made loadable. */
export function normalizeMediaUrl(url: string): string {
  return url.replace(/^(?:gcs|gs):\/\//i, 'https://storage.googleapis.com/')
}

/** The same normalization for addresses inside a message's text. */
export function normalizeMediaText(text: string): string {
  return text.replace(/(^|[\s(])(?:gcs|gs):\/\//gi, '$1https://storage.googleapis.com/')
}

/** An originChats GIF link, which serves a GIF without an extension. */
export function isGifUrl(url: string): boolean {
  try {
    const parsed = new URL(url, `https://${GIFS_HOST}`)
    if (parsed.hostname !== GIFS_HOST) return false
    return /^\/(?:api\/)?gif\/[^/]+$/.test(parsed.pathname)
  } catch {
    return false
  }
}
