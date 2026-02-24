import React, { useCallback, useMemo, useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert, Modal, TextInput } from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import type { Song } from '../types'
import { deleteFile, listDirectory, renameFile } from '../services/usb.service'
import { useUSBStore } from '../store/usb.store'
import { formatBytes } from '../utils/helpers'

type SortKey = 'title' | 'artist' | 'size'

const SORT_LABELS: Record<SortKey, string> = {
  title: 'Title',
  artist: 'Artist',
  size: 'Size',
}

const sanitizeFilename = (name: string): string => name.replace(/[/\\?%*:|"<>]/g, '-').trim()

const parseSongFromEntry = (dirUri: string, entry: { name: string; size: number }): Song => {
  const filename = entry.name
  const base = filename.replace(/\.mp3$/i, '')
  const separatorIndex = base.indexOf(' - ')

  if (separatorIndex > 0) {
    const artist = base.slice(0, separatorIndex).trim() || 'Unknown'
    const title = base.slice(separatorIndex + 3).trim() || base
    return {
      filename,
      title,
      artist,
      size: entry.size,
      uri: `${dirUri}/${filename}`,
    }
  }

  return {
    filename,
    title: base,
    artist: 'Unknown',
    size: entry.size,
    uri: `${dirUri}/${filename}`,
  }
}

const sortSongs = (songs: Song[], key: SortKey): Song[] => {
  if (key === 'size') {
    return [...songs].sort((a, b) => b.size - a.size)
  }
  return [...songs].sort((a, b) => a[key].localeCompare(b[key]))
}

const SongRow = ({ song, onLongPress }: { song: Song; onLongPress: () => void }) => (
  <TouchableOpacity style={styles.row} onLongPress={onLongPress} activeOpacity={0.7}>
    <View style={styles.rowInfo}>
      <Text style={styles.rowTitle} numberOfLines={1}>{song.title}</Text>
      <Text style={styles.rowMeta} numberOfLines={1}>{song.artist} · {song.filename}</Text>
    </View>
    <Text style={styles.rowDate}>{formatBytes(song.size)}</Text>
  </TouchableOpacity>
)

export const LibraryScreen = () => {
  const [songs, setSongs] = useState<Song[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('title')
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const usbConnected = useUSBStore((state) => state.connected)
  const usbUri = useUSBStore((state) => state.uri)
  const setCachedFilenames = useUSBStore((state) => state.setCachedFilenames)

  const [renameModalVisible, setRenameModalVisible] = useState(false)
  const [renameSong, setRenameSong] = useState<Song | null>(null)
  const [renameValue, setRenameValue] = useState('')

  const refreshLibrary = useCallback(async () => {
    if (!usbUri) {
      setSongs([])
      setCachedFilenames(new Set())
      setIsLoading(false)
      return
    }

    setIsLoading(true)

    try {
      const entries = await listDirectory(usbUri)
      const parsed = entries
        .filter((entry) => !entry.isDirectory && entry.name.toLowerCase().endsWith('.mp3'))
        .map((entry) => parseSongFromEntry(usbUri, entry))

      setSongs(parsed)
      setCachedFilenames(new Set(parsed.map((song) => song.filename)))
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to scan selected folder.'
      Alert.alert('Library scan failed', message)
    } finally {
      setIsLoading(false)
    }
  }, [setCachedFilenames, usbUri])

  useFocusEffect(useCallback(() => {
    refreshLibrary().catch(() => null)
  }, [refreshLibrary]))

  const sorted = useMemo(() => sortSongs(songs, sortKey), [songs, sortKey])

  const beginRename = useCallback((song: Song) => {
    setRenameSong(song)
    setRenameValue(song.filename.replace(/\.mp3$/i, ''))
    setRenameModalVisible(true)
  }, [])

  const submitRename = useCallback(async () => {
    if (!renameSong) return

    const trimmed = sanitizeFilename(renameValue)
    if (!trimmed) {
      Alert.alert('Rename', 'Please enter a filename.')
      return
    }

    const nextName = trimmed.toLowerCase().endsWith('.mp3') ? trimmed : `${trimmed}.mp3`

    try {
      await renameFile(renameSong.uri, nextName)
      setRenameModalVisible(false)
      setRenameSong(null)
      await refreshLibrary()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Rename failed'
      Alert.alert('Rename failed', message)
    }
  }, [refreshLibrary, renameSong, renameValue])

  const runDeleteSong = useCallback((song: Song) => {
    Alert.alert('Delete', `Delete "${song.title}" from folder?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteFile(song.uri)
            await refreshLibrary()
          } catch (err: unknown) {
            const message = err instanceof Error ? err.message : 'Delete failed'
            Alert.alert('Delete failed', message)
          }
        },
      },
    ])
  }, [refreshLibrary])

  const showSongActions = useCallback((song: Song) => {
    Alert.alert(song.title, 'Choose an action', [
      { text: 'Rename', onPress: () => beginRename(song) },
      { text: 'Delete', style: 'destructive', onPress: () => runDeleteSong(song) },
      { text: 'Cancel', style: 'cancel' },
    ])
  }, [beginRename, runDeleteSong])

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

      <Text style={styles.count}>{isLoading ? 'Scanning folder...' : `${sorted.length} songs`}</Text>

      {!usbConnected && <Text style={styles.empty}>Select a music folder in the USB tab</Text>}

      {usbConnected && (
        <FlatList
          data={sorted}
          keyExtractor={(s) => s.uri}
          renderItem={({ item }) => <SongRow song={item} onLongPress={() => showSongActions(item)} />}
          ListEmptyComponent={!isLoading ? <Text style={styles.empty}>No MP3 files in this folder</Text> : null}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          contentContainerStyle={styles.list}
        />
      )}

      <Modal visible={renameModalVisible} transparent animationType="fade" onRequestClose={() => setRenameModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Rename File</Text>
            <TextInput
              value={renameValue}
              onChangeText={setRenameValue}
              placeholder="Artist - Title"
              placeholderTextColor="#666"
              style={styles.input}
            />
            <View style={styles.modalActionsRow}>
              <TouchableOpacity style={styles.modalButtonSecondary} onPress={() => setRenameModalVisible(false)}>
                <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalButtonPrimary} onPress={() => submitRename().catch(() => null)}>
                <Text style={styles.modalButtonPrimaryText}>Rename</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
  empty: { color: '#666', fontSize: 13, textAlign: 'center', paddingVertical: 24 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.6)', justifyContent: 'center', padding: 20 },
  modalCard: { backgroundColor: '#171717', borderRadius: 12, borderWidth: 1, borderColor: '#2a2a2a', padding: 16 },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#101010',
    color: '#fff',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
  },
  modalActionsRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  modalButtonSecondary: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#444' },
  modalButtonSecondaryText: { color: '#aaa', fontSize: 13, fontWeight: '600' },
  modalButtonPrimary: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: '#1e3a1e', borderWidth: 1, borderColor: '#4caf50' },
  modalButtonPrimaryText: { color: '#4caf50', fontSize: 13, fontWeight: '700' },
})
