import RNFS from 'react-native-fs'
import type { Playlist, Song } from '../types'
import { copyDatabase, syncDatabase } from './usb.service'

type MusicDbState = {
  songs: Song[]
  playlists: Playlist[]
  playlistSongs: Array<{ playlist_id: number; song_id: number; position: number }>
}

const DB_LOCAL_PATH = `${RNFS.CachesDirectoryPath}/flashtune.musicdb`
const DB_MIRROR_JSON_PATH = `${RNFS.CachesDirectoryPath}/flashtune.musicdb.json`

let currentUsbRootUri: string | null = null
let state: MusicDbState = {
  songs: [],
  playlists: [],
  playlistSongs: [],
}

const loadState = async (): Promise<void> => {
  const exists = await RNFS.exists(DB_MIRROR_JSON_PATH)
  if (!exists) {
    state = { songs: [], playlists: [], playlistSongs: [] }
    return
  }

  try {
    const raw = await RNFS.readFile(DB_MIRROR_JSON_PATH, 'utf8')
    const parsed = JSON.parse(raw) as Partial<MusicDbState>
    state = {
      songs: Array.isArray(parsed.songs) ? parsed.songs as Song[] : [],
      playlists: Array.isArray(parsed.playlists) ? parsed.playlists as Playlist[] : [],
      playlistSongs: Array.isArray(parsed.playlistSongs)
        ? parsed.playlistSongs as Array<{ playlist_id: number; song_id: number; position: number }>
        : [],
    }
  } catch {
    state = { songs: [], playlists: [], playlistSongs: [] }
  }
}

const persistState = async (): Promise<void> => {
  await RNFS.writeFile(DB_MIRROR_JSON_PATH, JSON.stringify(state), 'utf8')
}

const syncIfAttached = async (): Promise<void> => {
  if (currentUsbRootUri) {
    await syncDatabase(DB_LOCAL_PATH, currentUsbRootUri)
  }
}

const nextId = (items: Array<{ id: number }>): number => {
  return items.reduce((max, item) => Math.max(max, item.id), 0) + 1
}

export const attachUsbDatabase = async (usbRootUri: string): Promise<void> => {
  currentUsbRootUri = usbRootUri
  await copyDatabase(usbRootUri, DB_LOCAL_PATH).catch(() => null)
  await initDatabase()
}

export const detachUsbDatabase = async (): Promise<void> => {
  await syncIfAttached().catch(() => null)
  currentUsbRootUri = null
}

export const initDatabase = async (): Promise<void> => {
  await RNFS.mkdir(RNFS.CachesDirectoryPath)
  const exists = await RNFS.exists(DB_LOCAL_PATH)
  if (!exists) {
    await RNFS.writeFile(DB_LOCAL_PATH, '', 'utf8')
  }
  await loadState()
}

export const getAllSongs = async (): Promise<Song[]> => {
  return [...state.songs].sort((a, b) => b.download_date.localeCompare(a.download_date))
}

export const insertSong = async (song: Omit<Song, 'id'>): Promise<void> => {
  state.songs.push({ ...song, id: nextId(state.songs) })
  await persistState()
  await syncIfAttached()
}

export const updateSong = async (id: number, patch: Partial<Omit<Song, 'id'>>): Promise<void> => {
  state.songs = state.songs.map((song) => (song.id === id ? { ...song, ...patch } : song))
  await persistState()
  await syncIfAttached()
}

export const deleteSong = async (id: number): Promise<void> => {
  state.songs = state.songs.filter((song) => song.id !== id)
  state.playlistSongs = state.playlistSongs.filter((item) => item.song_id !== id)
  await persistState()
  await syncIfAttached()
}

export const songExistsByUrl = async (source_url: string): Promise<boolean> => {
  return state.songs.some((song) => song.source_url === source_url)
}

export const getAllPlaylists = async (): Promise<Playlist[]> => {
  return [...state.playlists]
}

export const createPlaylist = async (name: string): Promise<void> => {
  state.playlists.push({ id: nextId(state.playlists), name, created_at: new Date().toISOString() })
  await persistState()
  await syncIfAttached()
}

export const deletePlaylist = async (id: number): Promise<void> => {
  state.playlists = state.playlists.filter((playlist) => playlist.id !== id)
  state.playlistSongs = state.playlistSongs.filter((item) => item.playlist_id !== id)
  await persistState()
  await syncIfAttached()
}

export const addSongToPlaylist = async (playlistId: number, songId: number): Promise<void> => {
  const alreadyLinked = state.playlistSongs.some(
    (item) => item.playlist_id === playlistId && item.song_id === songId,
  )
  if (alreadyLinked) return

  const position =
    state.playlistSongs
      .filter((item) => item.playlist_id === playlistId)
      .reduce((max, item) => Math.max(max, item.position), 0) + 1

  state.playlistSongs.push({ playlist_id: playlistId, song_id: songId, position })
  await persistState()
  await syncIfAttached()
}

export const removeSongFromPlaylist = async (playlistId: number, songId: number): Promise<void> => {
  state.playlistSongs = state.playlistSongs.filter(
    (item) => !(item.playlist_id === playlistId && item.song_id === songId),
  )
  await persistState()
  await syncIfAttached()
}

export const getPlaylistSongs = async (playlistId: number): Promise<Song[]> => {
  const links = state.playlistSongs
    .filter((item) => item.playlist_id === playlistId)
    .sort((a, b) => a.position - b.position)

  return links
    .map((link) => state.songs.find((song) => song.id === link.song_id))
    .filter((song): song is Song => Boolean(song))
}

export const getLocalDatabasePath = (): string => DB_LOCAL_PATH
