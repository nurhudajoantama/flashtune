import { NativeModules } from 'react-native'

const { UsbSafModule } = NativeModules

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

export const requestUsbPermission = (): Promise<string> =>
  UsbSafModule.requestPermission()

export const listDirectory = (uri: string): Promise<FileEntry[]> =>
  UsbSafModule.listDirectory(uri)

export const writeFile = (destUri: string, sourcePath: string): Promise<void> =>
  UsbSafModule.writeFile(destUri, sourcePath)

export const readFile = (sourceUri: string, destPath: string): Promise<void> =>
  UsbSafModule.readFile(sourceUri, destPath)

export const deleteFile = (uri: string): Promise<void> =>
  UsbSafModule.deleteFile(uri)

export const getStorageInfo = (uri: string): Promise<StorageInfo> =>
  UsbSafModule.getStorageInfo(uri)

export const copyDatabase = (usbRootUri: string, destPath: string): Promise<void> =>
  UsbSafModule.copyDatabase(usbRootUri, destPath)

export const syncDatabase = (sourcePath: string, usbRootUri: string): Promise<void> =>
  UsbSafModule.syncDatabase(sourcePath, usbRootUri)
