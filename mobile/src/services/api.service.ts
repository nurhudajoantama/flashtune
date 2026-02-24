import axios from 'axios'
import type { SearchResult, PlaylistInfo } from '../types'

const api = axios.create({
  baseURL: process.env.BACKEND_URL,
  headers: { 'X-API-Key': process.env.API_KEY },
})

export const searchSongs = async (query: string): Promise<SearchResult[]> => {
  const { data } = await api.get('/search', { params: { query } })
  return data
}

export const downloadSong = async (url: string): Promise<ArrayBuffer> => {
  const { data } = await api.post('/download', { url }, { responseType: 'arraybuffer' })
  return data
}

export const getPlaylistInfo = async (url: string): Promise<PlaylistInfo> => {
  const { data } = await api.get('/playlist-info', { params: { url } })
  return data
}
