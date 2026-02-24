import { readFileSync } from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'

export type TokenAuthMode = 'yaml-only' | 'yaml-with-legacy-fallback'

type TokenListEntry = {
  name: string
  token: string
  enabled: boolean
}

type RawTokenConfig = {
  version?: unknown
  token_list?: unknown
}

const DEFAULT_TOKEN_CONFIG_PATH = path.resolve(process.cwd(), 'config/tokens.yaml')

let authMode: TokenAuthMode = 'yaml-only'
let authConfigLoaded = false
let authConfigError: string | null = null
let enabledTokens = new Set<string>()

const normalizeAuthMode = (value: string | undefined): TokenAuthMode => {
  if (!value || value.trim() === '') return 'yaml-only'
  if (value === 'yaml-only' || value === 'yaml-with-legacy-fallback') return value

  throw new Error(
    `TOKEN_AUTH_MODE must be either "yaml-only" or "yaml-with-legacy-fallback" (received "${value}")`
  )
}

const assertStringField = (entry: Record<string, unknown>, field: 'name' | 'token', index: number): string => {
  const value = entry[field]
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`token_list[${index}].${field} is required and must be a non-empty string`)
  }

  return value.trim()
}

const assertBooleanField = (entry: Record<string, unknown>, field: 'enabled', index: number): boolean => {
  const value = entry[field]
  if (typeof value !== 'boolean') {
    throw new Error(`token_list[${index}].${field} is required and must be a boolean`)
  }

  return value
}

const validateTokenConfig = (raw: unknown): TokenListEntry[] => {
  if (!raw || typeof raw !== 'object') {
    throw new Error('config root must be a YAML object')
  }

  const cfg = raw as RawTokenConfig

  if (cfg.version !== 1) {
    throw new Error('version must be 1')
  }

  if (!Array.isArray(cfg.token_list) || cfg.token_list.length === 0) {
    throw new Error('token_list must be a non-empty array')
  }

  const seen = new Set<string>()
  const entries = cfg.token_list.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new Error(`token_list[${index}] must be an object`)
    }

    const entry = item as Record<string, unknown>
    const name = assertStringField(entry, 'name', index)
    const token = assertStringField(entry, 'token', index)
    const enabled = assertBooleanField(entry, 'enabled', index)

    if (seen.has(token)) {
      throw new Error(`token_list contains duplicate token value at index ${index}`)
    }
    seen.add(token)

    return { name, token, enabled }
  })

  return entries
}

export const loadTokenAuthConfig = () => {
  const configPath = process.env.TOKEN_CONFIG_PATH
    ? path.resolve(process.env.TOKEN_CONFIG_PATH)
    : DEFAULT_TOKEN_CONFIG_PATH

  try {
    authMode = normalizeAuthMode(process.env.TOKEN_AUTH_MODE)

    const rawFile = readFileSync(configPath, 'utf8')
    const parsed = parse(rawFile)
    const entries = validateTokenConfig(parsed)

    enabledTokens = new Set(entries.filter((entry) => entry.enabled).map((entry) => entry.token))
    authConfigLoaded = true
    authConfigError = null
  } catch (error) {
    authConfigLoaded = false
    enabledTokens = new Set()

    const message = error instanceof Error ? error.message : 'unknown error'
    authConfigError = `Auth token config error at ${configPath}: ${message}`
    throw new Error(authConfigError)
  }
}

export const getAuthReadiness = () => ({
  auth_config_loaded: authConfigLoaded,
  auth_mode: authMode
})

export const isAuthConfigLoaded = () => authConfigLoaded

export const getAuthConfigError = () => authConfigError

export const isApiKeyAuthorized = (apiKey: string) => {
  if (enabledTokens.has(apiKey)) {
    return true
  }

  if (authMode === 'yaml-with-legacy-fallback') {
    const legacyToken = process.env.API_KEY
    return typeof legacyToken === 'string' && legacyToken.length > 0 && apiKey === legacyToken
  }

  return false
}
