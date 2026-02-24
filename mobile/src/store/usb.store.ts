import { create } from 'zustand'
import type { USBState } from '../types'

interface USBStore extends USBState {
  setConnected: (state: Omit<USBState, 'connected'>) => void
  setDisconnected: () => void
}

export const useUSBStore = create<USBStore>((set) => ({
  connected: false,
  uri: null,
  name: null,
  freeBytes: 0,
  usedBytes: 0,
  totalBytes: 0,
  setConnected: (state) => set({ ...state, connected: true }),
  setDisconnected: () => set({
    connected: false,
    uri: null,
    name: null,
    freeBytes: 0,
    usedBytes: 0,
    totalBytes: 0,
  }),
}))
