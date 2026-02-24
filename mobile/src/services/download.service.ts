// Download flow:
// 1. GET /search or use provided URL
// 2. POST /download → arraybuffer stream
// 3. Write to temp file (internal, via react-native-fs)
// 4. SAF native write: temp file → USB /Music/<filename>.mp3
// 5. Delete temp file
// 6. Insert song record into .musicdb
// 7. Sync .musicdb back to USB

import RNFS from 'react-native-fs'
import { downloadSong } from './api.service'
import { writeFile, syncDatabase } from './usb.service'
import { insertSong, songExistsByUrl } from './database.service'
import type { SearchResult } from '../types'

const TEMP_DIR = RNFS.CachesDirectoryPath + '/flashtune'
const DB_LOCAL_PATH = RNFS.CachesDirectoryPath + '/flashtune.musicdb'

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

  try {
    onProgress?.(0.1)
    const buffer = await downloadSong(result.source_url)

    onProgress?.(0.5)
    await RNFS.writeFile(tempPath, bufferToBase64(buffer), 'base64')

    onProgress?.(0.7)
    await writeFile(`${usbRootUri}/Music`, tempPath)

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

    await syncDatabase(DB_LOCAL_PATH, usbRootUri)
    onProgress?.(1)
  } finally {
    await RNFS.unlink(tempPath).catch(() => null)
  }
}

const sanitizeFilename = (name: string): string =>
  name.replace(/[/\\?%*:|"<>]/g, '-').trim()

const bufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  bytes.forEach((b) => { binary += String.fromCharCode(b) })
  return btoa(binary)
}
