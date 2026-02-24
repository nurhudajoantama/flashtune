import { create } from 'zustand'
import type { Song } from '../types'

interface PlayerStore {
  visible: boolean
  currentSong: Song | null
  show: (song: Song) => void
  hide: () => void
}

export const usePlayerStore = create<PlayerStore>((set) => ({
  visible: false,
  currentSong: null,
  show: (song) => set({ visible: true, currentSong: song }),
  hide: () => set({ visible: false, currentSong: null }),
}))
