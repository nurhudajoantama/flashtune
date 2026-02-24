import type { Playlist, Song } from '../types'
import { copyDatabase, syncDatabase } from './usb.service'
import { fs } from './file-system.service'

type SqliteConnection = {
  execute: (sql: string, params?: unknown[]) => unknown
  close?: () => void
}

type SqliteOpen = (options: { name: string }) => SqliteConnection

const DB_LOCAL_PATH = `${fs.CachesDirectoryPath}/flashtune.musicdb`

let currentUsbRootUri: string | null = null
let db: SqliteConnection | null = null
let initPromise: Promise<void> | null = null
let writeQueue: Promise<void> = Promise.resolve()

const getSqliteOpen = (): SqliteOpen => {
  const sqlite = require('react-native-quick-sqlite') as {
    open?: SqliteOpen
    default?: { open?: SqliteOpen }
  }
  const open = sqlite.open ?? sqlite.default?.open

  if (!open) {
    throw new Error('react-native-quick-sqlite open() is unavailable')
  }

  return open
}

const normalizeRows = (result: unknown): Record<string, unknown>[] => {
  if (!result || typeof result !== 'object') return []

  const maybeRows = (result as { rows?: unknown }).rows
  if (Array.isArray(maybeRows)) {
    return maybeRows as Record<string, unknown>[]
  }

  if (!maybeRows || typeof maybeRows !== 'object') {
    return []
  }

  const rowsObject = maybeRows as {
    _array?: Record<string, unknown>[]
    length?: number
    item?: (index: number) => Record<string, unknown>
  }

  if (Array.isArray(rowsObject._array)) {
    return rowsObject._array
  }

  if (typeof rowsObject.length === 'number' && typeof rowsObject.item === 'function') {
    const rows: Record<string, unknown>[] = []
    for (let i = 0; i < rowsObject.length; i += 1) {
      rows.push(rowsObject.item(i))
    }
    return rows
  }

  return []
}

const execute = (sql: string, params: unknown[] = []): unknown => {
  if (!db) {
    throw new Error('Database is not initialized')
  }
  return db.execute(sql, params)
}

const query = <T>(sql: string, params: unknown[] = []): T[] => {
  return normalizeRows(execute(sql, params)) as T[]
}

const closeDatabase = async (): Promise<void> => {
  if (!db) return
  db.close?.()
  db = null
}

const waitForWrites = async (): Promise<void> => {
  await writeQueue
}

const runWrite = async (mutation: () => void): Promise<void> => {
  const task = writeQueue.then(async () => {
    mutation()
    await syncIfAttached()
  })

  writeQueue = task.then(
    () => undefined,
    () => undefined,
  )

  return task
}

const syncIfAttached = async (): Promise<void> => {
  if (currentUsbRootUri) {
    await syncDatabase(DB_LOCAL_PATH, currentUsbRootUri)
  }
}

export const attachUsbDatabase = async (usbRootUri: string): Promise<void> => {
  await waitForWrites()
  currentUsbRootUri = usbRootUri
  await closeDatabase()
  await copyDatabase(usbRootUri, DB_LOCAL_PATH).catch(() => null)
  await initDatabase()
}

export const detachUsbDatabase = async (): Promise<void> => {
  await waitForWrites()
  await syncIfAttached().catch(() => null)
  currentUsbRootUri = null
}

export const initDatabase = async (): Promise<void> => {
  if (initPromise) {
    await initPromise
    return
  }

  initPromise = (async () => {
    await fs.mkdir(fs.CachesDirectoryPath)
    await closeDatabase()

    const open = getSqliteOpen()
    db = open({ name: DB_LOCAL_PATH })

    execute('PRAGMA foreign_keys = ON')
    execute(`
      CREATE TABLE IF NOT EXISTS songs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        album TEXT NOT NULL DEFAULT '',
        cover_path TEXT NOT NULL DEFAULT '',
        source_url TEXT NOT NULL UNIQUE,
        filename TEXT NOT NULL,
        download_date TEXT NOT NULL,
        duration_ms INTEGER NOT NULL DEFAULT 0
      )
    `)
    execute(`
      CREATE TABLE IF NOT EXISTS playlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `)
    execute(`
      CREATE TABLE IF NOT EXISTS playlist_songs (
        playlist_id INTEGER NOT NULL,
        song_id INTEGER NOT NULL,
        position INTEGER NOT NULL,
        PRIMARY KEY (playlist_id, song_id),
        FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
        FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
      )
    `)
    execute('CREATE INDEX IF NOT EXISTS idx_songs_source_url ON songs(source_url)')
    execute('CREATE INDEX IF NOT EXISTS idx_playlist_songs_playlist_position ON playlist_songs(playlist_id, position)')
  })()

  try {
    await initPromise
  } finally {
    initPromise = null
  }
}

export const getAllSongs = async (): Promise<Song[]> => {
  await initDatabase()
  return query<Song>(
    `
      SELECT id, title, artist, album, cover_path, source_url, filename, download_date, duration_ms
      FROM songs
      ORDER BY download_date DESC
    `,
  )
}

export const insertSong = async (song: Omit<Song, 'id'>): Promise<void> => {
  await initDatabase()
  await runWrite(() => {
    execute(
      `
        INSERT OR IGNORE INTO songs
          (title, artist, album, cover_path, source_url, filename, download_date, duration_ms)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        song.title,
        song.artist,
        song.album,
        song.cover_path,
        song.source_url,
        song.filename,
        song.download_date,
        song.duration_ms,
      ],
    )
  })
}

export const updateSong = async (id: number, patch: Partial<Omit<Song, 'id'>>): Promise<void> => {
  await initDatabase()

  const entries = Object.entries(patch)
  if (entries.length === 0) return

  await runWrite(() => {
    const columns = entries.map(([key]) => `${key} = ?`).join(', ')
    const params = [...entries.map(([, value]) => value), id]
    execute(`UPDATE songs SET ${columns} WHERE id = ?`, params)
  })
}

export const deleteSong = async (id: number): Promise<void> => {
  await initDatabase()
  await runWrite(() => {
    execute('DELETE FROM songs WHERE id = ?', [id])
  })
}

export const songExistsByUrl = async (source_url: string): Promise<boolean> => {
  await initDatabase()
  const rows = query<{ found: number }>('SELECT 1 as found FROM songs WHERE source_url = ? LIMIT 1', [source_url])
  return rows.length > 0
}

export const getAllPlaylists = async (): Promise<Playlist[]> => {
  await initDatabase()
  return query<Playlist>('SELECT id, name, created_at FROM playlists ORDER BY created_at DESC')
}

export const createPlaylist = async (name: string): Promise<void> => {
  await initDatabase()
  await runWrite(() => {
    execute('INSERT INTO playlists (name, created_at) VALUES (?, ?)', [name, new Date().toISOString()])
  })
}

export const deletePlaylist = async (id: number): Promise<void> => {
  await initDatabase()
  await runWrite(() => {
    execute('DELETE FROM playlists WHERE id = ?', [id])
  })
}

export const addSongToPlaylist = async (playlistId: number, songId: number): Promise<void> => {
  await initDatabase()
  await runWrite(() => {
    const exists = query<{ found: number }>(
      'SELECT 1 as found FROM playlist_songs WHERE playlist_id = ? AND song_id = ? LIMIT 1',
      [playlistId, songId],
    )
    if (exists.length > 0) {
      return
    }

    const positionRow = query<{ next_position: number }>(
      'SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM playlist_songs WHERE playlist_id = ?',
      [playlistId],
    )

    execute('INSERT INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)', [
      playlistId,
      songId,
      Number(positionRow[0]?.next_position ?? 1),
    ])
  })
}

export const removeSongFromPlaylist = async (playlistId: number, songId: number): Promise<void> => {
  await initDatabase()
  await runWrite(() => {
    execute('DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?', [playlistId, songId])
  })
}

export const getPlaylistSongs = async (playlistId: number): Promise<Song[]> => {
  await initDatabase()
  return query<Song>(
    `
      SELECT s.id, s.title, s.artist, s.album, s.cover_path, s.source_url, s.filename, s.download_date, s.duration_ms
      FROM songs s
      INNER JOIN playlist_songs ps ON ps.song_id = s.id
      WHERE ps.playlist_id = ?
      ORDER BY ps.position ASC
    `,
    [playlistId],
  )
}

export const getPlaylistIdsForSong = async (songId: number): Promise<number[]> => {
  await initDatabase()
  const rows = query<{ playlist_id: number }>(
    'SELECT playlist_id FROM playlist_songs WHERE song_id = ?',
    [songId],
  )
  return rows.map((row) => Number(row.playlist_id))
}

export const getLocalDatabasePath = (): string => DB_LOCAL_PATH
