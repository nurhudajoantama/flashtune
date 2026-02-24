export interface Song {
  id: number
  title: string
  artist: string
  album: string
  cover_path: string
  source_url: string
  filename: string
  download_date: string
  duration_ms: number
}

export interface Playlist {
  id: number
  name: string
  created_at: string
}

export interface SearchResult {
  title: string
  artist: string
  duration_ms: number
  thumbnail_url: string
  source_url: string
}

export interface PlaylistInfo {
  title: string
  track_count: number
  tracks: SearchResult[]
}

export interface USBState {
  connected: boolean
  uri: string | null
  name: string | null
  freeBytes: number
  usedBytes: number
  totalBytes: number
}

export type DownloadStatus = 'queued' | 'downloading' | 'writing' | 'done' | 'error'

export interface DownloadItem {
  id: string
  song: SearchResult
  status: DownloadStatus
  progress: number
  error?: string
}
