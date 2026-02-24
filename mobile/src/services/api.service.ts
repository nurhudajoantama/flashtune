import axios from 'axios'
import type { SearchResult, PlaylistInfo } from '../types'

const runtimeConfig = {
  baseURL: process.env.BACKEND_URL ?? 'http://127.0.0.1:3000',
  apiKey: process.env.API_KEY ?? '',
}

const api = axios.create()

const syncClientConfig = (): void => {
  api.defaults.baseURL = runtimeConfig.baseURL
  api.defaults.headers.common['X-API-Key'] = runtimeConfig.apiKey
}

syncClientConfig()

export const configureApi = (config: { baseURL?: string; apiKey?: string }): void => {
  if (config.baseURL !== undefined) {
    runtimeConfig.baseURL = config.baseURL
  }
  if (config.apiKey !== undefined) {
    runtimeConfig.apiKey = config.apiKey
  }
  syncClientConfig()
}

export const getApiConfig = (): { baseURL: string; apiKey: string } => ({
  baseURL: runtimeConfig.baseURL,
  apiKey: runtimeConfig.apiKey,
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
