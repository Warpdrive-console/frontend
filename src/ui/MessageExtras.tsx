import { FileText } from 'lucide-preact'
import { useEffect, useState } from 'preact/hooks'
import type { Attachment, Embed } from '../api/chats'
import { isGifUrl, normalizeMediaUrl } from '../api/media'
import { ROTUR } from '../api/rotur'
import { openSealedFile, saveSealedFile, type SealedFile } from '../api/e2ee'
import { MessageText } from './MessageText'

function absolute(url?: string): string | null {
  if (!url) return null
  try {
    const base = ROTUR.chats.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:')
    return new URL(normalizeMediaUrl(url), base).toString()
  } catch {
    return null
  }
}

function attachmentName(att: Attachment): string {
  return att.name || att.filename || 'Attachment'
}

function fileSize(bytes?: number): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|avif|svg)(?:[?#]|$)/i
const VIDEO_EXTENSIONS = /\.(mp4|webm|mov|mkv|gifv)(?:[?#]|$)/i
const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|m4a|flac|aac)(?:[?#]|$)/i

function isImageLike(url?: string): boolean {
  return !!url && (isGifUrl(url) || IMAGE_EXTENSIONS.test(url))
}

function attachmentKind(att: Attachment): 'image' | 'video' | 'audio' | 'file' {
  const type = (att.mime_type || att.content_type || '').toLowerCase()
  const url = normalizeMediaUrl(att.url || '')
  if (type.startsWith('image/') || isImageLike(url)) return 'image'
  if (type.startsWith('video/') || VIDEO_EXTENSIONS.test(url)) return 'video'
  if (type.startsWith('audio/') || AUDIO_EXTENSIONS.test(url)) return 'audio'
  return 'file'
}

function embedColor(color?: number | string): string | undefined {
  if (typeof color === 'number' && Number.isFinite(color)) return `#${Math.max(0, color).toString(16).padStart(6, '0').slice(-6)}`
  if (typeof color === 'string' && /^#[0-9a-f]{3,8}$/i.test(color)) return color
  return undefined
}

function safeUrl(url?: string, local = false): string | null {
  const resolved = absolute(url)
  if (!resolved) return null
  if (/^https?:/i.test(resolved)) return resolved
  if (local && /^blob:/i.test(resolved)) return resolved
  return null
}

function AttachmentView({ attachment }: { attachment: Attachment }) {
  const url = safeUrl(attachment.url, true)
  if (!url) return null
  const name = attachmentName(attachment)
  const kind = attachmentKind(attachment)

  if (kind === 'image')
    return (
      <a class="msg-image" href={url} target="_blank" rel="noopener noreferrer" title={name}>
        <img src={url} alt={name} loading="lazy" width={attachment.width} height={attachment.height} />
      </a>
    )

  if (kind === 'video')
    return <video class="msg-video" src={url} controls preload="metadata" aria-label={name} />

  if (kind === 'audio') return <audio class="msg-audio" src={url} controls preload="metadata" aria-label={name} />

  return (
    <a class="msg-file" href={url} target="_blank" rel="noopener noreferrer">
      <FileText size={18} />
      <span class="msg-file-name">{name}</span>
      {attachment.size ? <small>{fileSize(attachment.size)}</small> : null}
    </a>
  )
}

const AUTO_OPEN_BYTES = 8 * 1024 * 1024

function previewable(file: SealedFile): boolean {
  const type = file.type.toLowerCase()
  return (
    file.size <= AUTO_OPEN_BYTES &&
    (type.startsWith('image/') || type.startsWith('video/') || type.startsWith('audio/'))
  )
}

/** A file from inside an encrypted message, decrypted here only once it is shown. */
function SealedView({ file }: { file: SealedFile }) {
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState('')
  const preview = previewable(file)

  useEffect(() => {
    if (!preview) return
    let live = true
    void openSealedFile(file)
      .then(value => live && setUrl(value))
      .catch(problem => live && setError((problem as Error).message))
    return () => {
      live = false
    }
  }, [file.url, file.hash, preview])

  if (url)
    return (
      <AttachmentView
        attachment={{
          name: file.name,
          url,
          mime_type: file.type,
          size: file.size,
          width: file.width,
          height: file.height,
        }}
      />
    )

  return (
    <button
      class="msg-file"
      type="button"
      onClick={() => {
        void saveSealedFile(file).catch(problem => setError((problem as Error).message))
      }}
    >
      <FileText size={18} />
      <span class="msg-file-name">{file.name || 'Attachment'}</span>
      <small>{error || (preview ? 'Opening…' : fileSize(file.size))}</small>
    </button>
  )
}

function PollView({ poll }: { poll: NonNullable<Embed['poll']> }) {
  const options = poll.options || []
  const total = poll.total_votes || options.reduce((sum, option) => sum + (option.votes || 0), 0)
  if (!poll.question && !options.length) return null

  return (
    <div class="msg-poll">
      {poll.question ? (
        <b>
          <MessageText text={poll.question} inline />
        </b>
      ) : null}
      {options.map((option, index) => {
        const share = total ? Math.round(((option.votes || 0) / total) * 100) : 0
        return (
          <div class="msg-poll-option" key={`${option.text}-${index}`}>
            <span>{option.text || `Option ${index + 1}`}</span>
            {total ? (
              <>
                <i style={{ width: `${share}%` }} />
                <small>{share}%</small>
              </>
            ) : null}
          </div>
        )
      })}
      {total ? <small class="msg-poll-total">{total} votes</small> : null}
    </div>
  )
}

function EmbedView({ embed }: { embed: Embed }) {
  const url = safeUrl(embed.url)
  const image = safeUrl(embed.image?.url)
  const thumbnail = safeUrl(embed.thumbnail?.url)
  const video = safeUrl(embed.video?.url)
  const bareImage = !image && !thumbnail && !video && isImageLike(embed.url) ? safeUrl(embed.url) : null
  const color = embedColor(embed.color)
  const fields = (embed.fields || []).filter(field => field.name || field.value)
  const authorIcon = safeUrl(embed.author?.icon_url)
  const authorUrl = safeUrl(embed.author?.url)
  const footerIcon = safeUrl(embed.footer?.icon_url)
  const title = embed.title?.trim()
  const description = embed.description?.trim()
  const poll = embed.poll
  const footer = embed.footer?.text?.trim()

  if (!title && !description && !fields.length && !image && !thumbnail && !video && !bareImage && !poll && !footer)
    return null

  return (
    <div class="msg-embed" style={color ? { borderLeftColor: color } : undefined}>
      {embed.author?.name ? (
        <div class="msg-embed-author">
          {authorIcon ? <img src={authorIcon} alt="" loading="lazy" /> : null}
          {authorUrl ? (
            <a href={authorUrl} target="_blank" rel="noopener noreferrer">
              {embed.author.name}
            </a>
          ) : (
            <span>{embed.author.name}</span>
          )}
        </div>
      ) : null}
      {title ? (
        <div class="msg-embed-title">
          {url ? (
            <a href={url} target="_blank" rel="noopener noreferrer">
              <MessageText text={title} inline />
            </a>
          ) : (
            <MessageText text={title} inline />
          )}
        </div>
      ) : null}
      {description ? <MessageText text={description} /> : null}
      {poll ? <PollView poll={poll} /> : null}
      {fields.length ? (
        <div class="msg-embed-fields">
          {fields.map((field, index) => (
            <div class={`msg-embed-field${field.inline ? ' inline' : ''}`} key={`${field.name}-${index}`}>
              {field.name ? (
                <b>
                  <MessageText text={field.name} inline />
                </b>
              ) : null}
              {field.value ? <MessageText text={field.value} /> : null}
            </div>
          ))}
        </div>
      ) : null}
      {video ? <video class="msg-video" src={video} controls preload="metadata" /> : null}
      {image ? <img class="msg-embed-image" src={image} alt="" loading="lazy" /> : null}
      {!image && thumbnail ? <img class="msg-embed-thumb" src={thumbnail} alt="" loading="lazy" /> : null}
      {bareImage ? <img class="msg-embed-image" src={bareImage} alt="" loading="lazy" /> : null}
      {footer || embed.timestamp ? (
        <div class="msg-embed-footer">
          {footerIcon ? <img src={footerIcon} alt="" loading="lazy" /> : null}
          {footer ? <span>{footer}</span> : null}
          {embed.timestamp && !Number.isNaN(new Date(embed.timestamp).getTime()) ? (
            <span>{new Date(embed.timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** Attachments and embeds carried by a message, shown under its text. */
export function MessageExtras({
  attachments,
  embeds,
  sealedFiles,
}: {
  attachments?: Array<Attachment | string>
  embeds?: Embed[]
  sealedFiles?: SealedFile[]
}) {
  const files = (attachments || []).map(attachment =>
    typeof attachment === 'string' ? { url: attachment } : attachment,
  )
  const cards = (embeds || []).filter(embed => embed && typeof embed === 'object')
  const sealed = sealedFiles || []

  if (!files.length && !cards.length && !sealed.length) return null

  return (
    <div class="msg-extras">
      {files.map((attachment, index) => (
        <AttachmentView attachment={attachment} key={attachment.id || `${attachment.url}-${index}`} />
      ))}
      {sealed.map((file, index) => (
        <SealedView file={file} key={`${file.url}-${index}`} />
      ))}
      {cards.map((embed, index) => (
        <EmbedView embed={embed} key={`${embed.title}-${index}`} />
      ))}
    </div>
  )
}
