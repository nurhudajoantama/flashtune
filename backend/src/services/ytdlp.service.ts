import { spawn } from 'child_process'

const YTDLP = process.env.YTDLP_PATH ?? 'yt-dlp'

export class YtDlpError extends Error {
  readonly statusCode: number

  constructor(message: string, statusCode = 422) {
    super(message)
    this.name = 'YtDlpError'
    this.statusCode = statusCode
  }
}

export interface YtSearchResult {
  title: string
  artist: string
  duration_ms: number
  thumbnail_url: string
  source_url: string
}

const parseEntry = (entry: Record<string, unknown>): YtSearchResult => {
  const duration = Number(entry.duration ?? 0)
  const source = String(entry.webpage_url ?? entry.url ?? '').trim()

  return {
    title: String(entry.title ?? '').trim(),
    artist: String(entry.uploader ?? entry.channel ?? '').trim(),
    duration_ms: Number.isFinite(duration) ? Math.max(duration, 0) * 1000 : 0,
    thumbnail_url: String(entry.thumbnail ?? '').trim(),
    source_url: source,
  }
}

const collectJsonLines = async (args: string[], fallbackMessage: string): Promise<Record<string, unknown>[]> => {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP, args)
    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (d) => { stdout += d.toString() })
    proc.stderr.on('data', (d) => { stderr += d.toString() })

    proc.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        reject(new YtDlpError('yt-dlp executable not found on server PATH', 500))
        return
      }

      reject(new YtDlpError(err.message, 500))
    })

    proc.once('close', (code) => {
      if (code !== 0) {
        reject(new YtDlpError(stderr.trim() || fallbackMessage, 422))
        return
      }

      try {
        const lines = stdout
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => JSON.parse(line) as Record<string, unknown>)
        resolve(lines)
      } catch {
        reject(new YtDlpError('Failed to parse yt-dlp output', 422))
      }
    })
  })
}

export const search = (query: string): Promise<YtSearchResult[]> => {
  return collectJsonLines(
    [
      `ytsearch5:${query}`,
      '--dump-json',
      '--flat-playlist',
      '--no-download',
      '--no-playlist',
    ],
    'yt-dlp search failed',
  ).then((lines) => lines.map(parseEntry).filter((item) => item.source_url.length > 0))
}

export const streamDownload = (url: string) => {
  return spawn(YTDLP, [
    url,
    '-x',
    '--audio-format', 'mp3',
    '--audio-quality', '0',
    '-o', '-',
    '--no-playlist',
  ])
}

export const getPlaylistInfo = (url: string): Promise<{ title: string; entries: YtSearchResult[] }> => {
  return collectJsonLines(
    [
      url,
      '--flat-playlist',
      '--dump-json',
      '--no-download',
    ],
    'yt-dlp playlist failed',
  ).then((lines) => ({
    title: String(lines[0]?.playlist_title ?? '').trim(),
    entries: lines.map(parseEntry).filter((item) => item.source_url.length > 0),
  }))
}
