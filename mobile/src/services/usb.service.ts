import { NativeModules } from 'react-native'

const { UsbSafModule } = NativeModules

type UsbModule = {
  requestPermission: () => Promise<string>
  clearPermission: () => Promise<void>
  listDirectory: (uri: string) => Promise<FileEntry[]>
  writeFile: (dirUri: string, filename: string, sourcePath: string) => Promise<void>
  renameFile: (fileUri: string, newName: string) => Promise<string>
  deleteFile: (uri: string) => Promise<void>
  getStorageInfo: (uri: string) => Promise<StorageInfo>
}

export class UsbServiceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UsbServiceError'
  }
}

export interface FileEntry {
  name: string
  isDirectory: boolean
  size: number
}

export interface StorageInfo {
  used: number
  free: number
  total: number
}

const getUsbModule = (): UsbModule => {
  if (!UsbSafModule) {
    throw new UsbServiceError('UsbSafModule is not available. Build native module before using USB features.')
  }

  return UsbSafModule as UsbModule
}

const assertNonEmpty = (value: string, field: string): void => {
  if (!value || !value.trim()) {
    throw new UsbServiceError(`${field} is required`)
  }
}

const assertSafUri = (value: string, field: string): void => {
  assertNonEmpty(value, field)
  if (!value.startsWith('content://')) {
    throw new UsbServiceError(`${field} must be a SAF content:// URI`)
  }
}

export const requestUsbPermission = async (): Promise<string> => {
  const uri = await getUsbModule().requestPermission()
  assertSafUri(uri, 'USB root URI')
  return uri
}

export const clearUsbPermission = (): Promise<void> => {
  return getUsbModule().clearPermission()
}

export const listDirectory = (uri: string): Promise<FileEntry[]> => {
  assertSafUri(uri, 'Directory URI')
  return getUsbModule().listDirectory(uri)
}

export const writeFile = (dirUri: string, filename: string, sourcePath: string): Promise<void> => {
  assertSafUri(dirUri, 'Directory URI')
  assertNonEmpty(filename, 'Filename')
  assertNonEmpty(sourcePath, 'Source path')
  return getUsbModule().writeFile(dirUri, filename, sourcePath)
}

export const renameFile = (fileUri: string, newName: string): Promise<string> => {
  assertSafUri(fileUri, 'File URI')
  assertNonEmpty(newName, 'New filename')
  return getUsbModule().renameFile(fileUri, newName)
}

export const deleteFile = (uri: string): Promise<void> => {
  assertSafUri(uri, 'File URI')
  return getUsbModule().deleteFile(uri)
}

export const getStorageInfo = (uri: string): Promise<StorageInfo> => {
  assertSafUri(uri, 'Storage URI')
  return getUsbModule().getStorageInfo(uri)
}
