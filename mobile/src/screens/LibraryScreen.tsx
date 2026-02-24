import React, { useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActionSheetIOS,
  Platform,
  Alert,
} from 'react-native'
import { formatDuration } from '../utils/helpers'

type SortKey = 'title' | 'artist' | 'album' | 'date'

interface MockSong {
  id: string
  title: string
  artist: string
  album: string
  duration_ms: number
  download_date: string
}

const MOCK_SONGS: MockSong[] = [
  { id: '1', title: 'Bohemian Rhapsody', artist: 'Queen', album: 'A Night at the Opera', duration_ms: 354000, download_date: '2024-01-15' },
  { id: '2', title: 'Hotel California', artist: 'Eagles', album: 'Hotel California', duration_ms: 391000, download_date: '2024-01-14' },
  { id: '3', title: 'Stairway to Heaven', artist: 'Led Zeppelin', album: 'Led Zeppelin IV', duration_ms: 482000, download_date: '2024-01-13' },
  { id: '4', title: 'Smells Like Teen Spirit', artist: 'Nirvana', album: 'Nevermind', duration_ms: 301000, download_date: '2024-01-12' },
  { id: '5', title: 'Sweet Child O Mine', artist: "Guns N' Roses", album: 'Appetite for Destruction', duration_ms: 356000, download_date: '2024-01-11' },
  { id: '6', title: 'Purple Rain', artist: 'Prince', album: 'Purple Rain', duration_ms: 520000, download_date: '2024-01-10' },
  { id: '7', title: 'Comfortably Numb', artist: 'Pink Floyd', album: 'The Wall', duration_ms: 382000, download_date: '2024-01-09' },
  { id: '8', title: 'Back in Black', artist: 'AC/DC', album: 'Back in Black', duration_ms: 255000, download_date: '2024-01-08' },
]

const SORT_LABELS: Record<SortKey, string> = {
  title: 'Title',
  artist: 'Artist',
  album: 'Album',
  date: 'Date',
}

const sortSongs = (songs: MockSong[], key: SortKey): MockSong[] => {
  return [...songs].sort((a, b) => {
    if (key === 'date') return b.download_date.localeCompare(a.download_date)
    return a[key].localeCompare(b[key])
  })
}

const showActionSheet = (song: MockSong) => {
  const options = ['Edit Metadata', 'Add to Playlist', 'Delete from Drive', 'Cancel']
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { options, destructiveButtonIndex: 2, cancelButtonIndex: 3 },
      (idx) => {
        if (idx === 0) console.log('Edit metadata for', song.id)
        if (idx === 1) console.log('Add to playlist', song.id)
        if (idx === 2) Alert.alert('Delete', `Delete "${song.title}"?`, [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Delete', style: 'destructive', onPress: () => console.log('Delete', song.id) },
        ])
      },
    )
  } else {
    Alert.alert(song.title, 'Choose an action', [
      { text: 'Edit Metadata', onPress: () => console.log('Edit', song.id) },
      { text: 'Add to Playlist', onPress: () => console.log('Playlist', song.id) },
      { text: 'Delete', style: 'destructive', onPress: () => console.log('Delete', song.id) },
      { text: 'Cancel', style: 'cancel' },
    ])
  }
}

const SongRow = ({
  song,
  onPress,
  onLongPress,
}: {
  song: MockSong
  onPress: () => void
  onLongPress: () => void
}) => (
  <TouchableOpacity style={styles.row} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.7}>
    <View style={styles.rowInfo}>
      <Text style={styles.rowTitle} numberOfLines={1}>{song.title}</Text>
      <Text style={styles.rowMeta} numberOfLines={1}>{song.artist} · {song.album} · {formatDuration(song.duration_ms)}</Text>
    </View>
    <Text style={styles.rowDate}>{song.download_date.slice(5)}</Text>
  </TouchableOpacity>
)

export const LibraryScreen = () => {
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const sorted = sortSongs(MOCK_SONGS, sortKey)

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Library</Text>

      <View style={styles.sortRow}>
        <Text style={styles.sortLabel}>Sort:</Text>
        {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
          <TouchableOpacity
            key={key}
            style={[styles.sortChip, sortKey === key && styles.sortChipActive]}
            onPress={() => setSortKey(key)}
          >
            <Text style={[styles.sortChipText, sortKey === key && styles.sortChipTextActive]}>
              {SORT_LABELS[key]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.count}>{sorted.length} songs</Text>

      <FlatList
        data={sorted}
        keyExtractor={(s) => s.id}
        renderItem={({ item }) => (
          <SongRow
            song={item}
            onPress={() => console.log('Preview', item.id)}
            onLongPress={() => showActionSheet(item)}
          />
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={styles.list}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: { fontSize: 22, fontWeight: '700', color: '#fff', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  sortRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 8, gap: 8 },
  sortLabel: { color: '#555', fontSize: 13, marginRight: 4 },
  sortChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#333' },
  sortChipActive: { backgroundColor: '#1e3a1e', borderColor: '#4caf50' },
  sortChipText: { color: '#777', fontSize: 12 },
  sortChipTextActive: { color: '#4caf50', fontWeight: '600' },
  count: { color: '#555', fontSize: 12, paddingHorizontal: 16, paddingBottom: 8 },
  list: { paddingHorizontal: 16 },
  separator: { height: 1, backgroundColor: '#222' },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  rowInfo: { flex: 1 },
  rowTitle: { color: '#fff', fontSize: 14, fontWeight: '500', marginBottom: 2 },
  rowMeta: { color: '#777', fontSize: 12 },
  rowDate: { color: '#555', fontSize: 11 },
})
