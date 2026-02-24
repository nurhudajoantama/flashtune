type FsLike = {
  CachesDirectoryPath: string
  mkdir: (path: string) => Promise<void>
  exists: (path: string) => Promise<boolean>
  writeFile: (path: string, data: string, encoding: 'utf8' | 'base64') => Promise<void>
  unlink: (path: string) => Promise<void>
}

const normalizeCachePath = (value: string): string => value.replace(/\/$/, '')

const toPath = (value: string): string =>
  normalizeCachePath(decodeURIComponent(value.replace(/^file:\/\//, '')))

const toUri = (value: string): string =>
  value.startsWith('file://') ? value : `file://${value}`

const createExpoFsFallback = (): FsLike => {
  const expoFs = require('expo-file-system/legacy') as {
    cacheDirectory?: string
    makeDirectoryAsync: (path: string, options?: { intermediates?: boolean }) => Promise<void>
    getInfoAsync: (path: string) => Promise<{ exists: boolean }>
    writeAsStringAsync: (
      path: string,
      data: string,
      options?: { encoding?: string },
    ) => Promise<void>
    deleteAsync: (path: string, options?: { idempotent?: boolean }) => Promise<void>
    EncodingType?: { UTF8?: string; Base64?: string }
  }

  const cacheDirectory = expoFs.cacheDirectory ?? ''
  const utf8 = expoFs.EncodingType?.UTF8 ?? 'utf8'
  const base64 = expoFs.EncodingType?.Base64 ?? 'base64'
  const cachePath = toPath(cacheDirectory)

  return {
    CachesDirectoryPath: cachePath,
    mkdir: async (path) => {
      await expoFs.makeDirectoryAsync(toUri(path), { intermediates: true })
    },
    exists: async (path) => {
      const info = await expoFs.getInfoAsync(toUri(path))
      return info.exists
    },
    writeFile: async (path, data, encoding) => {
      await expoFs.writeAsStringAsync(toUri(path), data, {
        encoding: encoding === 'base64' ? base64 : utf8,
      })
    },
    unlink: async (path) => {
      await expoFs.deleteAsync(toUri(path), { idempotent: true })
    },
  }
}

const createFs = (): FsLike => {
  try {
    const rnfs = require('react-native-fs') as FsLike | undefined
    if (rnfs?.CachesDirectoryPath) {
      return rnfs
    }
  } catch {}

  return createExpoFsFallback()
}

export const fs = createFs()
