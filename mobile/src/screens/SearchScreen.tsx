import React, { useState } from 'react'
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
import type { SearchResult } from '../types'
import { searchSongs } from '../services/api.service'
import { songExistsByUrl } from '../services/database.service'
import { downloadAndSave } from '../services/download.service'
import { useUSBStore } from '../store/usb.store'
import { useDownloadStore } from '../store/download.store'

type SearchRow = SearchResult & {
  id: string
  alreadyOnDrive: boolean
}

const SongRow = ({ item, onDownload }: { item: SearchRow; onDownload: (item: SearchRow) => void }) => (
  <View style={styles.row}>
    <View style={styles.rowInfo}>
      <Text style={styles.rowTitle} numberOfLines={1}>{item.title}</Text>
      <Text style={styles.rowMeta}>{item.artist} · {formatDuration(item.duration_ms)}</Text>
    </View>
    {item.alreadyOnDrive ? (
      <View style={styles.badge}>
        <Text style={styles.badgeText}>On drive</Text>
      </View>
    ) : (
      <TouchableOpacity style={styles.dlBtn} onPress={() => onDownload(item)}>
        <Text style={styles.dlBtnText}>↓</Text>
      </TouchableOpacity>
    )}
  </View>
)

export const SearchScreen = () => {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<SearchRow[]>([])
  const [searched, setSearched] = useState(false)
  const usbUri = useUSBStore((state) => state.uri)
  const addToQueue = useDownloadStore((state) => state.addToQueue)
  const updateItem = useDownloadStore((state) => state.updateItem)

  const handleSearch = async () => {
    const normalized = query.trim()
    if (!normalized) return

    setSearching(true)
    setSearched(false)

    try {
      const remoteResults = await searchSongs(normalized)
      const hydrated = await Promise.all(
        remoteResults.map(async (item, index) => ({
          ...item,
          id: `${item.source_url}-${index}`,
          alreadyOnDrive: await songExistsByUrl(item.source_url),
        })),
      )
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
      Alert.alert('USB not connected', 'Connect your USB drive before downloading.')
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
      setResults((prev) => prev.map((row) => (row.id === item.id ? { ...row, alreadyOnDrive: true } : row)))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Download failed'
      updateItem(queueId, { status: 'error', error: message })
      Alert.alert('Download failed', message)
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Search</Text>

      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Song name or YouTube URL…"
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
          <Text style={styles.hintText}>Searching YouTube…</Text>
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
          renderItem={({ item }) => <SongRow item={item} onDownload={handleDownload} />}
          contentContainerStyle={styles.list}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: { fontSize: 22, fontWeight: '700', color: '#fff', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12 },
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
})
