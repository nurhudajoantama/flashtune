import { spawn } from 'child_process'

const YTDLP = process.env.YTDLP_PATH ?? 'yt-dlp'

export interface YtSearchResult {
  title: string
  artist: string
  duration_ms: number
  thumbnail_url: string
  source_url: string
}

export const search = (query: string): Promise<YtSearchResult[]> => {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP, [
      `ytsearch5:${query}`,
      '--dump-json',
      '--flat-playlist',
      '--no-download',
      '--no-playlist',
    ])

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (d) => { stdout += d })
    proc.stderr.on('data', (d) => { stderr += d })

    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr || 'yt-dlp search failed'))
      try {
        const results = stdout
          .trim()
          .split('\n')
          .filter(Boolean)
          .map((line) => {
            const entry = JSON.parse(line)
            return {
              title: entry.title ?? '',
              artist: entry.uploader ?? entry.channel ?? '',
              duration_ms: (entry.duration ?? 0) * 1000,
              thumbnail_url: entry.thumbnail ?? '',
              source_url: entry.webpage_url ?? entry.url ?? '',
            }
          })
        resolve(results)
      } catch {
        reject(new Error('Failed to parse yt-dlp output'))
      }
    })
  })
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
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP, [
      url,
      '--flat-playlist',
      '--dump-json',
      '--no-download',
    ])

    let stdout = ''
    let stderr = ''

    proc.stdout.on('data', (d) => { stdout += d })
    proc.stderr.on('data', (d) => { stderr += d })

    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr || 'yt-dlp playlist failed'))
      try {
        const lines = stdout.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))
        const entries = lines.map((entry) => ({
          title: entry.title ?? '',
          artist: entry.uploader ?? entry.channel ?? '',
          duration_ms: (entry.duration ?? 0) * 1000,
          thumbnail_url: entry.thumbnail ?? '',
          source_url: entry.webpage_url ?? entry.url ?? '',
        }))
        resolve({ title: lines[0]?.playlist_title ?? '', entries })
      } catch {
        reject(new Error('Failed to parse playlist output'))
      }
    })
  })
}
