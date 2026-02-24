import RNFS from 'react-native-fs'
import { downloadSong } from './api.service'
import { writeFile } from './usb.service'
import { getLocalDatabasePath, insertSong, songExistsByUrl } from './database.service'
import type { SearchResult } from '../types'

const TEMP_DIR = RNFS.CachesDirectoryPath + '/flashtune'

export const downloadAndSave = async (
  result: SearchResult,
  usbRootUri: string,
  onProgress?: (progress: number) => void,
): Promise<void> => {
  const exists = await songExistsByUrl(result.source_url)
  if (exists) throw new Error('Song already exists on drive')

  await RNFS.mkdir(TEMP_DIR)
  const filename = sanitizeFilename(`${result.artist} - ${result.title}.mp3`)
  const tempPath = `${TEMP_DIR}/${filename}`
  const dbPath = getLocalDatabasePath()

  try {
    onProgress?.(0.05)
    const buffer = await downloadSong(result.source_url)

    onProgress?.(0.55)
    await RNFS.writeFile(tempPath, arrayBufferToBase64(buffer), 'base64')

    onProgress?.(0.75)
    await writeFile(`${usbRootUri}/Music/${filename}`, tempPath)

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
    })

    if (!(await RNFS.exists(dbPath))) {
      await RNFS.writeFile(dbPath, '', 'utf8')
    }

    onProgress?.(1)
  } finally {
    await RNFS.unlink(tempPath).catch(() => null)
  }
}

const sanitizeFilename = (name: string): string =>
  name.replace(/[/\\?%*:|"<>]/g, '-').trim()

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
