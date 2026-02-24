import axios from 'axios'
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { SearchResult, PlaylistInfo } from '../types'

const BACKEND_URL_STORAGE_KEY = 'flashtune.backend_url'
const API_KEY_STORAGE_KEY = 'flashtune.api_key'

type ApiConfigPersistenceError = 'STORAGE_READ_FAILED' | 'STORAGE_WRITE_FAILED'

type ApiConfigPersistenceResult = {
  ok: boolean
  error?: ApiConfigPersistenceError
}

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

export const hydrateApiConfig = async (): Promise<ApiConfigPersistenceResult> => {
  try {
    const entries = await AsyncStorage.multiGet([BACKEND_URL_STORAGE_KEY, API_KEY_STORAGE_KEY])
    const persistedBaseURL = entries.find(([key]) => key === BACKEND_URL_STORAGE_KEY)?.[1]
    const persistedApiKey = entries.find(([key]) => key === API_KEY_STORAGE_KEY)?.[1]

    configureApi({
      baseURL: persistedBaseURL ?? runtimeConfig.baseURL,
      apiKey: persistedApiKey ?? runtimeConfig.apiKey,
    })

    return { ok: true }
  } catch {
    syncClientConfig()
    return { ok: false, error: 'STORAGE_READ_FAILED' }
  }
}

export const persistApiConfig = async (config: {
  baseURL: string
  apiKey: string
}): Promise<ApiConfigPersistenceResult> => {
  try {
    await AsyncStorage.multiSet([
      [BACKEND_URL_STORAGE_KEY, config.baseURL],
      [API_KEY_STORAGE_KEY, config.apiKey],
    ])
    configureApi(config)
    return { ok: true }
  } catch {
    return { ok: false, error: 'STORAGE_WRITE_FAILED' }
  }
}

export const searchSongs = async (query: string): Promise<SearchResult[]> => {
  const { data } = await api.get('/search', { params: { query } })
  return data
}

export const buildDownloadUrl = (url: string): string =>
  `${runtimeConfig.baseURL}/download?url=${encodeURIComponent(url)}`

export const getPlaylistInfo = async (url: string): Promise<PlaylistInfo> => {
  const { data } = await api.get('/playlist-info', { params: { url } })
  return data
}
