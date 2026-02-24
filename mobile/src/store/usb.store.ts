import { create } from 'zustand'
import type { USBState } from '../types'

interface USBStore extends USBState {
  setConnected: (state: Omit<USBState, 'connected' | 'cachedFilenames'>) => void
  setDisconnected: () => void
  setCachedFilenames: (names: Set<string>) => void
}

export const useUSBStore = create<USBStore>((set) => ({
  connected: false,
  uri: null,
  name: null,
  freeBytes: 0,
  usedBytes: 0,
  totalBytes: 0,
  cachedFilenames: new Set<string>(),
  setConnected: (state) => set({ ...state, connected: true }),
  setCachedFilenames: (names) => set({ cachedFilenames: new Set(names) }),
  setDisconnected: () => set({
    connected: false,
    uri: null,
    name: null,
    freeBytes: 0,
    usedBytes: 0,
    totalBytes: 0,
    cachedFilenames: new Set<string>(),
  }),
}))
