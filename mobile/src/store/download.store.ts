import { create } from 'zustand'
import type { DownloadItem } from '../types'

interface DownloadStore {
  queue: DownloadItem[]
  addToQueue: (item: DownloadItem) => void
  updateItem: (id: string, patch: Partial<DownloadItem>) => void
  removeItem: (id: string) => void
  clearCompleted: () => void
}

export const useDownloadStore = create<DownloadStore>((set) => ({
  queue: [],
  addToQueue: (item) => set((s) => ({ queue: [...s.queue, item] })),
  updateItem: (id, patch) =>
    set((s) => ({ queue: s.queue.map((i) => (i.id === id ? { ...i, ...patch } : i)) })),
  removeItem: (id) => set((s) => ({ queue: s.queue.filter((i) => i.id !== id) })),
  clearCompleted: () => set((s) => ({ queue: s.queue.filter((i) => i.status !== 'done') })),
}))
