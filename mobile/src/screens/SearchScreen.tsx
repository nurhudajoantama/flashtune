import React, { useMemo, useState } from 'react'
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native'
import { formatDuration } from '../utils/helpers'
import type { DownloadItem, SearchResult } from '../types'
import { searchSongs } from '../services/api.service'
import { downloadAndSave } from '../services/download.service'
import { useUSBStore } from '../store/usb.store'
import { useDownloadStore } from '../store/download.store'
import { DownloadsScreen } from './DownloadsScreen'

type SearchRow = SearchResult & {
  id: string
  alreadyOnDrive: boolean
}

const sanitizeFilename = (name: string): string => name.replace(/[/\\?%*:|"<>]/g, '-').trim()

const findLatestItemForSource = (queue: DownloadItem[], sourceUrl: string): DownloadItem | undefined => {
  for (let i = queue.length - 1; i >= 0; i -= 1) {
    if (queue[i].song.source_url === sourceUrl) {
      return queue[i]
    }
  }
  return undefined
}

const DownloadControl = ({
  item,
  queueItem,
  onDownload,
  onOpenDownloads,
}: {
  item: SearchRow
  queueItem?: DownloadItem
  onDownload: (item: SearchRow) => void
  onOpenDownloads: () => void
}) => {
  const status = queueItem?.status

  if (item.alreadyOnDrive || status === 'done') {
    return (
      <View style={styles.badge}>
        <Text style={styles.badgeText}>On drive</Text>
      </View>
    )
  }

  if (status === 'queued' || status === 'downloading' || status === 'writing') {
    return (
      <View style={styles.spinnerBtn}>
        <ActivityIndicator size="small" color="#4caf50" />
      </View>
    )
  }

  if (status === 'error') {
    return (
      <TouchableOpacity style={styles.errorBtn} onPress={onOpenDownloads}>
        <Text style={styles.errorBtnText}>!</Text>
      </TouchableOpacity>
    )
  }

  return (
    <TouchableOpacity style={styles.dlBtn} onPress={() => onDownload(item)}>
      <Text style={styles.dlBtnText}>↓</Text>
    </TouchableOpacity>
  )
}

const SongRow = ({
  item,
  queueItem,
  onDownload,
  onOpenDownloads,
}: {
  item: SearchRow
  queueItem?: DownloadItem
  onDownload: (item: SearchRow) => void
  onOpenDownloads: () => void
}) => (
  <View style={styles.row}>
    <View style={styles.rowInfo}>
      <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
      <Text style={styles.rowMeta}>{item.artist} · {formatDuration(item.duration_ms)}</Text>
    </View>
    <DownloadControl item={item} queueItem={queueItem} onDownload={onDownload} onOpenDownloads={onOpenDownloads} />
  </View>
)

export const SearchScreen = () => {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<SearchRow[]>([])
  const [searched, setSearched] = useState(false)
  const [downloadsVisible, setDownloadsVisible] = useState(false)

  const usbUri = useUSBStore((state) => state.uri)
  const cachedFilenames = useUSBStore((state) => state.cachedFilenames)
  const setCachedFilenames = useUSBStore((state) => state.setCachedFilenames)
  const queue = useDownloadStore((state) => state.queue)
  const addToQueue = useDownloadStore((state) => state.addToQueue)
  const updateItem = useDownloadStore((state) => state.updateItem)

  const activeCount = useMemo(
    () => queue.filter((item) => item.status === 'queued' || item.status === 'downloading' || item.status === 'writing').length,
    [queue],
  )

  const handleSearch = async () => {
    const normalized = query.trim()
    if (!normalized) return

    setSearching(true)
    setSearched(false)

    try {
      const remoteResults = await searchSongs(normalized)
      const hydrated = remoteResults.map((item, index) => {
        const filename = sanitizeFilename(`${item.artist} - ${item.title}.mp3`)
        return {
          ...item,
          id: `${item.source_url}-${index}`,
          alreadyOnDrive: cachedFilenames.has(filename),
        }
      })
      setResults(hydrated)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Search failed'
      Alert.alert('Search failed', message)
      setResults([])
    } finally {
      setSearching(false)
      setSearched(true)
    }
  }

  const handleDownload = async (item: SearchRow) => {
    if (!usbUri) {
      Alert.alert('Folder required', 'Select a music folder first in the USB tab.')
      return
    }

    const queueId = `${item.source_url}-${Date.now()}`
    addToQueue({
      id: queueId,
      song: item,
      status: 'queued',
      progress: 0,
    })

    try {
      updateItem(queueId, { status: 'downloading', progress: 0.05 })
      await downloadAndSave(item, usbUri, (progress) => {
        const status = progress >= 0.75 ? 'writing' : 'downloading'
        updateItem(queueId, { progress, status })
      })
      updateItem(queueId, { status: 'done', progress: 1 })

      const filename = sanitizeFilename(`${item.artist} - ${item.title}.mp3`)
      const next = new Set(cachedFilenames)
      next.add(filename)
      setCachedFilenames(next)

      setResults((prev) => prev.map((row) => (row.id === item.id ? { ...row, alreadyOnDrive: true } : row)))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Download failed'
      updateItem(queueId, { status: 'error', error: message })
      Alert.alert('Download failed', message)
    }
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Text style={styles.header}>Search</Text>
        <TouchableOpacity style={styles.downloadsButton} onPress={() => setDownloadsVisible(true)}>
          <Text style={styles.downloadsButtonText}>⬇ Downloads</Text>
          {activeCount > 0 && (
            <View style={styles.downloadsBadge}>
              <Text style={styles.downloadsBadgeText}>{activeCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Song name or YouTube URL..."
          placeholderTextColor="#555"
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={handleSearch}
          returnKeyType="search"
          autoCorrect={false}
          autoCapitalize="none"
        />
        <TouchableOpacity style={styles.searchBtn} onPress={handleSearch}>
          <Text style={styles.searchBtnText}>Search</Text>
        </TouchableOpacity>
      </View>

      {searching && (
        <View style={styles.centered}>
          <ActivityIndicator color="#4caf50" />
          <Text style={styles.hintText}>Searching YouTube...</Text>
        </View>
      )}

      {!searching && !searched && (
        <View style={styles.centered}>
          <Text style={styles.hintText}>Search a song or paste a YouTube URL</Text>
        </View>
      )}

      {!searching && searched && results.length === 0 && (
        <View style={styles.centered}>
          <Text style={styles.hintText}>No results found</Text>
        </View>
      )}

      {!searching && results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <SongRow
              item={item}
              queueItem={findLatestItemForSource(queue, item.source_url)}
              onDownload={handleDownload}
              onOpenDownloads={() => setDownloadsVisible(true)}
            />
          )}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      <DownloadsScreen visible={downloadsVisible} onClose={() => setDownloadsVisible(false)} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  headerRow: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  header: { fontSize: 22, fontWeight: '700', color: '#fff' },
  downloadsButton: {
    borderWidth: 1,
    borderColor: '#3a3a3a',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    position: 'relative',
  },
  downloadsButtonText: { color: '#ddd', fontSize: 12, fontWeight: '600' },
  downloadsBadge: {
    position: 'absolute',
    right: -6,
    top: -6,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#4caf50',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  downloadsBadgeText: { color: '#111', fontSize: 11, fontWeight: '700' },
  inputRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 },
  input: {
    flex: 1,
    backgroundColor: '#1e1e1e',
    color: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#333',
  },
  searchBtn: { backgroundColor: '#4caf50', borderRadius: 8, paddingHorizontal: 16, justifyContent: 'center' },
  searchBtnText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  hintText: { color: '#555', fontSize: 14 },
  list: { paddingHorizontal: 16 },
  separator: { height: 1, backgroundColor: '#222' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  rowInfo: { flex: 1 },
  rowTitle: { color: '#fff', fontSize: 14, fontWeight: '500', marginBottom: 2 },
  rowMeta: { color: '#777', fontSize: 12 },
  badge: { backgroundColor: '#1e3a1e', borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: '#4caf50' },
  badgeText: { color: '#4caf50', fontSize: 11, fontWeight: '600' },
  dlBtn: { backgroundColor: '#4caf50', borderRadius: 6, width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },
  dlBtnText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  spinnerBtn: {
    borderRadius: 6,
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#2f4a2f',
    backgroundColor: '#172217',
  },
  errorBtn: { backgroundColor: '#3a1515', borderRadius: 6, width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#8a2f2f' },
  errorBtnText: { color: '#ff6b6b', fontSize: 18, fontWeight: '700' },
})
