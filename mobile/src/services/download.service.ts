import { downloadSong } from './api.service'
import { writeFile } from './usb.service'
import { getLocalDatabasePath, insertSong, songExistsByUrl } from './database.service'
import type { SearchResult } from '../types'
import { fs } from './file-system.service'

const TEMP_DIR = fs.CachesDirectoryPath + '/flashtune'

export const downloadAndSave = async (
  result: SearchResult,
  usbRootUri: string,
  onProgress?: (progress: number) => void,
): Promise<void> => {
  const exists = await songExistsByUrl(result.source_url)
  if (exists) throw new Error('Song already exists on drive')

  await fs.mkdir(TEMP_DIR)
  const filename = sanitizeFilename(`${result.artist} - ${result.title}.mp3`)
  const tempPath = `${TEMP_DIR}/${filename}`
  const dbPath = getLocalDatabasePath()

  try {
    onProgress?.(0.05)
    const buffer = await downloadSong(result.source_url)

    onProgress?.(0.55)
    await fs.writeFile(tempPath, arrayBufferToBase64(buffer), 'base64')

    onProgress?.(0.75)
    await writeFile(`${usbRootUri}/Music/${filename}`, tempPath).catch((err: unknown) => {
      throw new Error(formatUsbWriteError(err))
    })

    onProgress?.(0.9)
    await insertSong({
      title: result.title,
      artist: result.artist,
      album: '',
      cover_path: '',
      source_url: result.source_url,
      filename,
      download_date: new Date().toISOString(),
      duration_ms: result.duration_ms,
    }).catch((err: unknown) => {
      throw new Error(formatDatabaseSyncError(err))
    })

    if (!(await fs.exists(dbPath))) {
      await fs.writeFile(dbPath, '', 'utf8')
    }

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

const formatDatabaseSyncError = (err: unknown): string => {
  const detail = toMessage(err)
  const normalized = detail.toLowerCase()
  const looksSyncFailure = normalized.includes('sync')
    || normalized.includes('permission')
    || normalized.includes('saf')
    || normalized.includes('disconnected')

  if (looksSyncFailure) {
    return 'Track file was copied, but database sync to USB failed. Keep USB connected and reconnect it in USB Manager to resync before next download.'
  }

  return `Database update failed after file copy: ${detail}`
}

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

const arrayBufferToBase64 = (input: ArrayBuffer): string => {
  const bytes = new Uint8Array(input)
  let output = ''

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0
    const chunk = (a << 16) | (b << 8) | c

    output += BASE64_ALPHABET[(chunk >> 18) & 63]
    output += BASE64_ALPHABET[(chunk >> 12) & 63]
    output += i + 1 < bytes.length ? BASE64_ALPHABET[(chunk >> 6) & 63] : '='
    output += i + 2 < bytes.length ? BASE64_ALPHABET[chunk & 63] : '='
  }

  return output
}
