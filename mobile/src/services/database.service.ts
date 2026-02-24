// Opens local copy of .musicdb (copied from USB root on connect).
// Every write is immediately synced back to USB via usb.service.syncDatabase().

import type { Song, Playlist } from '../types'

export const initDatabase = async (): Promise<void> => {
  // TODO: open SQLite DB at cache/flashtune.musicdb
  // Create tables if not exists (songs, playlists, playlist_songs)
}

export const getAllSongs = async (): Promise<Song[]> => {
  // TODO: SELECT * FROM songs ORDER BY download_date DESC
  return []
}

export const insertSong = async (song: Omit<Song, 'id'>): Promise<void> => {
  // TODO: INSERT INTO songs
}

export const updateSong = async (id: number, patch: Partial<Omit<Song, 'id'>>): Promise<void> => {
  // TODO: UPDATE songs SET ... WHERE id = ?
}

export const deleteSong = async (id: number): Promise<void> => {
  // TODO: DELETE FROM songs WHERE id = ?
}

export const songExistsByUrl = async (source_url: string): Promise<boolean> => {
  // TODO: SELECT COUNT(*) FROM songs WHERE source_url = ?
  return false
}

export const getAllPlaylists = async (): Promise<Playlist[]> => {
  // TODO: SELECT * FROM playlists
  return []
}

export const createPlaylist = async (name: string): Promise<void> => {
  // TODO: INSERT INTO playlists
}

export const deletePlaylist = async (id: number): Promise<void> => {
  // TODO: DELETE FROM playlists WHERE id = ?
}

export const addSongToPlaylist = async (playlistId: number, songId: number): Promise<void> => {
  // TODO: INSERT INTO playlist_songs
}

export const removeSongFromPlaylist = async (playlistId: number, songId: number): Promise<void> => {
  // TODO: DELETE FROM playlist_songs WHERE playlist_id = ? AND song_id = ?
}

export const getPlaylistSongs = async (playlistId: number): Promise<Song[]> => {
  // TODO: JOIN songs ON playlist_songs WHERE playlist_id = ?
  return []
}
