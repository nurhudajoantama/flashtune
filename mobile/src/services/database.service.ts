import * as SQLite from 'expo-sqlite'
import type { Playlist, Song } from '../types'
import { copyDatabase, syncDatabase } from './usb.service'
import { fs } from './file-system.service'

const DB_NAME = 'flashtune.musicdb'
const DB_LOCAL_PATH = `${fs.CachesDirectoryPath}/${DB_NAME}`

let currentUsbRootUri: string | null = null
let db: SQLite.SQLiteDatabase | null = null
let initPromise: Promise<void> | null = null
let writeQueue: Promise<void> = Promise.resolve()

type BindParams = SQLite.SQLiteBindParams

const run = (sql: string, params: BindParams = []): void => {
  if (!db) throw new Error('Database is not initialized')
  db.runSync(sql, params)
}

const query = <T>(sql: string, params: BindParams = []): T[] => {
  if (!db) throw new Error('Database is not initialized')
  return db.getAllSync<T>(sql, params)
}

const closeDatabase = (): void => {
  if (!db) return
  db.closeSync()
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
  closeDatabase()
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
    closeDatabase()

    db = SQLite.openDatabaseSync(DB_NAME, {}, fs.CachesDirectoryPath)

    db.execSync('PRAGMA foreign_keys = ON')
    db.execSync(`
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
    db.execSync(`
      CREATE TABLE IF NOT EXISTS playlists (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL
      )
    `)
    db.execSync(`
      CREATE TABLE IF NOT EXISTS playlist_songs (
        playlist_id INTEGER NOT NULL,
        song_id INTEGER NOT NULL,
        position INTEGER NOT NULL,
        PRIMARY KEY (playlist_id, song_id),
        FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
        FOREIGN KEY (song_id) REFERENCES songs(id) ON DELETE CASCADE
      )
    `)
    db.execSync('CREATE INDEX IF NOT EXISTS idx_songs_source_url ON songs(source_url)')
    db.execSync('CREATE INDEX IF NOT EXISTS idx_playlist_songs_playlist_position ON playlist_songs(playlist_id, position)')
  })()

  try {
    await initPromise
  } finally {
    initPromise = null
  }
}

export const getAllSongs = async (): Promise<Song[]> => {
  await initDatabase()
  return query<Song>(`
    SELECT id, title, artist, album, cover_path, source_url, filename, download_date, duration_ms
    FROM songs
    ORDER BY download_date DESC
  `)
}

export const insertSong = async (song: Omit<Song, 'id'>): Promise<void> => {
  await initDatabase()
  await runWrite(() => {
    run(
      `INSERT OR IGNORE INTO songs
        (title, artist, album, cover_path, source_url, filename, download_date, duration_ms)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [song.title, song.artist, song.album, song.cover_path, song.source_url, song.filename, song.download_date, song.duration_ms],
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
    run(`UPDATE songs SET ${columns} WHERE id = ?`, params as BindParams)
  })
}

export const deleteSong = async (id: number): Promise<void> => {
  await initDatabase()
  await runWrite(() => {
    run('DELETE FROM songs WHERE id = ?', [id])
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
    run('INSERT INTO playlists (name, created_at) VALUES (?, ?)', [name, new Date().toISOString()])
  })
}

export const deletePlaylist = async (id: number): Promise<void> => {
  await initDatabase()
  await runWrite(() => {
    run('DELETE FROM playlists WHERE id = ?', [id])
  })
}

export const addSongToPlaylist = async (playlistId: number, songId: number): Promise<void> => {
  await initDatabase()
  await runWrite(() => {
    const exists = query<{ found: number }>(
      'SELECT 1 as found FROM playlist_songs WHERE playlist_id = ? AND song_id = ? LIMIT 1',
      [playlistId, songId],
    )
    if (exists.length > 0) return

    const positionRow = query<{ next_position: number }>(
      'SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM playlist_songs WHERE playlist_id = ?',
      [playlistId],
    )

    run('INSERT INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)', [
      playlistId,
      songId,
      Number(positionRow[0]?.next_position ?? 1),
    ])
  })
}

export const removeSongFromPlaylist = async (playlistId: number, songId: number): Promise<void> => {
  await initDatabase()
  await runWrite(() => {
    run('DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?', [playlistId, songId])
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
