import RNFS from 'react-native-fs'
import { buildDownloadUrl, getApiConfig } from './api.service'
import { writeFile } from './usb.service'
import type { SearchResult } from '../types'
import { fs } from './file-system.service'

const TEMP_DIR = fs.CachesDirectoryPath + '/flashtune'

export const downloadAndSave = async (
  result: SearchResult,
  dirUri: string,
  onProgress?: (progress: number) => void,
): Promise<void> => {
  await fs.mkdir(TEMP_DIR)
  const filename = sanitizeFilename(`${result.artist} - ${result.title}.mp3`)
  const tempPath = `${TEMP_DIR}/${filename}`

  try {
    onProgress?.(0.05)

    const { apiKey } = getApiConfig()
    const { promise } = RNFS.downloadFile({
      fromUrl: buildDownloadUrl(result.source_url),
      toFile: tempPath,
      headers: { 'X-API-Key': apiKey },
      progress: (res) => {
        if (res.contentLength > 0) {
          onProgress?.(0.05 + 0.7 * (res.bytesWritten / res.contentLength))
        }
      },
    })

    const { statusCode } = await promise
    if (statusCode !== 200) {
      throw new Error(`Download failed (HTTP ${statusCode})`)
    }

    onProgress?.(0.75)
    await writeFile(dirUri, filename, tempPath).catch((err: unknown) => {
      throw new Error(formatUsbWriteError(err))
    })

    onProgress?.(1)
  } finally {
    await fs.unlink(tempPath).catch(() => null)
  }
}

const sanitizeFilename = (name: string): string =>
  name.replace(/[/\\?%*:|"<>]/g, '-').trim()

const toMessage = (err: unknown): string => {
  if (err instanceof Error) {
    return err.message
  }

  if (typeof err === 'string') {
    return err
  }

  return 'Unknown error'
}

const formatUsbWriteError = (err: unknown): string => {
  const detail = toMessage(err)
  const normalized = detail.toLowerCase()
  const looksDisconnected = normalized.includes('not found')
    || normalized.includes('no such file')
    || normalized.includes('disconnected')
    || normalized.includes('saf')
    || normalized.includes('permission')

  if (looksDisconnected) {
    return 'USB write failed. The drive may be disconnected or permission expired. Reconnect USB in USB Manager, then retry download.'
  }

  return `USB write failed while saving the file: ${detail}`
}
