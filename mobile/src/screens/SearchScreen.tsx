import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native'
import { formatDuration } from '../utils/helpers'

interface MockResult {
  id: string
  title: string
  artist: string
  duration_ms: number
  source_url: string
  alreadyOnDrive: boolean
}

const MOCK_RESULTS: MockResult[] = [
  { id: '1', title: 'Bohemian Rhapsody', artist: 'Queen', duration_ms: 354000, source_url: 'https://youtube.com/watch?v=fJ9rUzIMcZQ', alreadyOnDrive: true },
  { id: '2', title: 'Hotel California', artist: 'Eagles', duration_ms: 391000, source_url: 'https://youtube.com/watch?v=lp-EO5I60KA', alreadyOnDrive: false },
  { id: '3', title: 'Stairway to Heaven', artist: 'Led Zeppelin', duration_ms: 482000, source_url: 'https://youtube.com/watch?v=QkF3oxziUI4', alreadyOnDrive: false },
  { id: '4', title: 'Smells Like Teen Spirit', artist: 'Nirvana', duration_ms: 301000, source_url: 'https://youtube.com/watch?v=hTWKbfoikeg', alreadyOnDrive: true },
  { id: '5', title: 'Sweet Child O Mine', artist: "Guns N' Roses", duration_ms: 356000, source_url: 'https://youtube.com/watch?v=1w7OgIMMRc4', alreadyOnDrive: false },
]

const SongRow = ({ item, onDownload }: { item: MockResult; onDownload: (id: string) => void }) => (
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
      <TouchableOpacity style={styles.dlBtn} onPress={() => onDownload(item.id)}>
        <Text style={styles.dlBtnText}>↓</Text>
      </TouchableOpacity>
    )}
  </View>
)

export const SearchScreen = () => {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [results, setResults] = useState<MockResult[]>([])
  const [searched, setSearched] = useState(false)

  const handleSearch = () => {
    if (!query.trim()) return
    setSearching(true)
    setSearched(false)
    // Mock: simulate network delay then show results
    setTimeout(() => {
      setResults(MOCK_RESULTS)
      setSearching(false)
      setSearched(true)
    }, 800)
  }

  const handleDownload = (id: string) => {
    // TODO: trigger download via download.service
    console.log('Download triggered for id:', id)
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
