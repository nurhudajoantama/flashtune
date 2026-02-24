import { create } from 'zustand'
import type { Song } from '../types'

interface PlayerStore {
  visible: boolean
  currentSong: Song | null
  previewTempPath: string | null
  isPreviewLoading: boolean
  show: (song: Song) => void
  setPreviewTempPath: (path: string | null) => void
  setPreviewLoading: (loading: boolean) => void
  hide: () => void
}

export const usePlayerStore = create<PlayerStore>((set) => ({
  visible: false,
  currentSong: null,
  previewTempPath: null,
  isPreviewLoading: false,
  show: (song) => set({ visible: true, currentSong: song }),
  setPreviewTempPath: (path) => set({ previewTempPath: path }),
  setPreviewLoading: (loading) => set({ isPreviewLoading: loading }),
  hide: () => set({ visible: false, currentSong: null, previewTempPath: null, isPreviewLoading: false }),
}))
