import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActionSheetIOS,
  Platform,
  Alert,
  Modal,
  TextInput,
} from 'react-native'
import type { Playlist, Song } from '../types'
import {
  addSongToPlaylist,
  createPlaylist,
  deleteSong,
  getAllPlaylists,
  getAllSongs,
  getPlaylistIdsForSong,
  removeSongFromPlaylist,
  updateSong,
} from '../services/database.service'
import { deleteFile, readFile } from '../services/usb.service'
import { usePlayerStore } from '../store/player.store'
import { useUSBStore } from '../store/usb.store'
import { formatDuration } from '../utils/helpers'
import { fs } from '../services/file-system.service'
import {
  addTrack,
  isTrackPlayerAvailable,
  playTrack,
  resetTrackPlayer,
  setupTrackPlayer,
  stopTrackPlayer,
} from '../services/track-player.service'

type SortKey = 'title' | 'artist' | 'album' | 'date'

const PREVIEW_TEMP_DIR = `${fs.CachesDirectoryPath}/flashtune-previews`

let trackPlayerSetupPromise: Promise<void> | null = null

const ensureTrackPlayerSetup = async (): Promise<void> => {
  if (trackPlayerSetupPromise) {
    return trackPlayerSetupPromise
  }

  trackPlayerSetupPromise = setupTrackPlayer().catch((err) => {
    trackPlayerSetupPromise = null
    throw err
  })

  return trackPlayerSetupPromise
}

const SORT_LABELS: Record<SortKey, string> = {
  title: 'Title',
  artist: 'Artist',
  album: 'Album',
  date: 'Date',
}

const sortSongs = (songs: Song[], key: SortKey): Song[] => {
  return [...songs].sort((a, b) => {
    if (key === 'date') return b.download_date.localeCompare(a.download_date)
    return a[key].localeCompare(b[key])
  })
}

const SongRow = ({
  song,
  onPress,
  onLongPress,
}: {
  song: Song
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
  const [songs, setSongs] = useState<Song[]>([])
  const [playlists, setPlaylists] = useState<Playlist[]>([])
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [selectedSong, setSelectedSong] = useState<Song | null>(null)
  const [songPlaylistIds, setSongPlaylistIds] = useState<number[]>([])
  const [playlistModalVisible, setPlaylistModalVisible] = useState<boolean>(false)
  const [createPlaylistModalVisible, setCreatePlaylistModalVisible] = useState<boolean>(false)
  const [newPlaylistName, setNewPlaylistName] = useState<string>('')
  const usbConnected = useUSBStore((state) => state.connected)
  const usbUri = useUSBStore((state) => state.uri)
  const previewVisible = usePlayerStore((state) => state.visible)
  const previewSong = usePlayerStore((state) => state.currentSong)
  const isPreviewLoading = usePlayerStore((state) => state.isPreviewLoading)
  const showPreview = usePlayerStore((state) => state.show)
  const hidePreview = usePlayerStore((state) => state.hide)
  const setPreviewTempPath = usePlayerStore((state) => state.setPreviewTempPath)
  const setPreviewLoading = usePlayerStore((state) => state.setPreviewLoading)
  const previewRequestRef = useRef(0)

  const cleanupPreviewTempFile = useCallback(async (path?: string) => {
    const target = path ?? usePlayerStore.getState().previewTempPath
    if (!target) {
      return
    }
    await fs.unlink(target).catch(() => null)
  }, [])

  const stopPreview = useCallback(async () => {
    previewRequestRef.current += 1
    const tempPath = usePlayerStore.getState().previewTempPath
    await stopTrackPlayer().catch(() => null)
    await resetTrackPlayer().catch(() => null)
    await cleanupPreviewTempFile(tempPath)
    hidePreview()
  }, [cleanupPreviewTempFile, hidePreview])

  const startPreview = useCallback(async (song: Song) => {
    if (!usbConnected || !usbUri) {
      Alert.alert('Preview unavailable', 'Connect your USB drive to preview songs.')
      return
    }

    if (!isTrackPlayerAvailable()) {
      Alert.alert('Preview unavailable', 'Track player native module is not available in this build.')
      return
    }

    await stopPreview()
    setPreviewLoading(true)
    const requestId = previewRequestRef.current + 1
    previewRequestRef.current = requestId

    const tempPath = `${PREVIEW_TEMP_DIR}/preview-${song.id}-${Date.now()}.mp3`
    const sourceUri = `${usbUri}/Music/${song.filename}`

    try {
      await ensureTrackPlayerSetup()
      await fs.mkdir(PREVIEW_TEMP_DIR)
      showPreview(song)
      setPreviewTempPath(tempPath)

      await readFile(sourceUri, tempPath)
      if (previewRequestRef.current !== requestId) {
        await cleanupPreviewTempFile(tempPath)
        return
      }

      await resetTrackPlayer()
      await addTrack({
        url: `file://${tempPath}`,
        title: song.title,
        artist: song.artist,
      })

      if (previewRequestRef.current !== requestId) {
        await cleanupPreviewTempFile(tempPath)
        await resetTrackPlayer().catch(() => null)
        return
      }

      await playTrack()
    } catch (err: unknown) {
      await cleanupPreviewTempFile(tempPath)
      hidePreview()
      const message = err instanceof Error
        ? err.message
        : 'Could not start preview. Reconnect USB and try again.'
      Alert.alert('Preview failed', message)
    } finally {
      if (previewRequestRef.current === requestId) {
        setPreviewLoading(false)
      }
    }
  }, [cleanupPreviewTempFile, hidePreview, setPreviewLoading, setPreviewTempPath, showPreview, stopPreview, usbConnected, usbUri])

  useEffect(() => {
    return () => {
      stopPreview().catch(() => null)
    }
  }, [stopPreview])

  const refreshLibrary = useCallback(async () => {
    const [dbSongs, dbPlaylists] = await Promise.all([getAllSongs(), getAllPlaylists()])
    setSongs(dbSongs)
    setPlaylists(dbPlaylists)
  }, [])

  useEffect(() => {
    const run = async (): Promise<void> => {
      try {
        setIsLoading(true)
        await refreshLibrary()
      } catch {
        Alert.alert('Library', 'Failed to load songs from database.')
      } finally {
        setIsLoading(false)
      }
    }
    run().catch(() => null)
  }, [refreshLibrary])

  const sorted = useMemo(() => sortSongs(songs, sortKey), [songs, sortKey])

  const runEditMetadata = useCallback(
    (song: Song) => {
      if (Platform.OS === 'ios' && typeof Alert.prompt === 'function') {
        Alert.prompt(
          'Edit Title',
          `Update title for "${song.title}"`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Save',
              onPress: async (value) => {
                const nextTitle = (value ?? '').trim()
                if (!nextTitle) {
                  return
                }
                await updateSong(song.id, { title: nextTitle })
                await refreshLibrary()
              },
            },
          ],
          'plain-text',
          song.title,
        )
        return
      }

      Alert.alert('Edit Metadata', `Rename "${song.title}" using quick action?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Quick Rename',
          onPress: async () => {
            await updateSong(song.id, { title: `${song.title} (Edited)` })
            await refreshLibrary()
          },
        },
      ])
    },
    [refreshLibrary],
  )

  const runDeleteSong = useCallback(
    (song: Song) => {
      const deleteMessage = usbConnected && usbUri
        ? `Delete "${song.title}" from USB drive and database?`
        : `Delete "${song.title}" from database? USB is disconnected, so the file on drive cannot be removed right now.`

      Alert.alert('Delete', deleteMessage, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (usbConnected && usbUri) {
                await deleteFile(`${usbUri}/Music/${song.filename}`).catch((err: unknown) => {
                  const detail = err instanceof Error ? err.message : 'USB file delete failed'
                  throw new Error(`Could not delete the USB file. Reconnect the drive and try again. (${detail})`)
                })
              }

              if (usePlayerStore.getState().currentSong?.id === song.id) {
                await stopPreview()
              }

              await deleteSong(song.id)
              await refreshLibrary()
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : 'Delete failed'
              Alert.alert('Delete failed', message)
            }
          },
        },
      ])
    },
    [refreshLibrary, stopPreview, usbConnected, usbUri],
  )

  const openPlaylistModal = useCallback(async (song: Song) => {
    const ids = await getPlaylistIdsForSong(song.id)
    setSelectedSong(song)
    setSongPlaylistIds(ids)
    setPlaylistModalVisible(true)
  }, [])

  const showSongActions = useCallback(
    (song: Song) => {
      const options = ['Edit Metadata', 'Add to Playlist', 'Delete from Drive', 'Cancel']

      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          { options, destructiveButtonIndex: 2, cancelButtonIndex: 3 },
          (idx) => {
            if (idx === 0) {
              runEditMetadata(song)
            }
            if (idx === 1) {
              openPlaylistModal(song).catch(() => null)
            }
            if (idx === 2) {
              runDeleteSong(song)
            }
          },
        )
        return
      }

      Alert.alert(song.title, 'Choose an action', [
        { text: 'Edit Metadata', onPress: () => runEditMetadata(song) },
        { text: 'Add to Playlist', onPress: () => openPlaylistModal(song).catch(() => null) },
        { text: 'Delete', style: 'destructive', onPress: () => runDeleteSong(song) },
        { text: 'Cancel', style: 'cancel' },
      ])
    },
    [openPlaylistModal, runDeleteSong, runEditMetadata],
  )

  const toggleSongPlaylist = useCallback(
    async (playlistId: number) => {
      if (!selectedSong) {
        return
      }
      const alreadyInPlaylist = songPlaylistIds.includes(playlistId)
      if (alreadyInPlaylist) {
        await removeSongFromPlaylist(playlistId, selectedSong.id)
        setSongPlaylistIds((prev) => prev.filter((id) => id !== playlistId))
        return
      }

      await addSongToPlaylist(playlistId, selectedSong.id)
      setSongPlaylistIds((prev) => [...prev, playlistId])
    },
    [selectedSong, songPlaylistIds],
  )

  const handleCreatePlaylist = useCallback(async () => {
    const name = newPlaylistName.trim()
    if (!name) {
      Alert.alert('Playlist', 'Enter a playlist name.')
      return
    }

    await createPlaylist(name)
    setNewPlaylistName('')
    setCreatePlaylistModalVisible(false)
    await refreshLibrary()
  }, [newPlaylistName, refreshLibrary])

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Library</Text>

      <View style={styles.actionsRow}>
        <TouchableOpacity style={styles.actionButton} onPress={() => setCreatePlaylistModalVisible(true)}>
          <Text style={styles.actionButtonText}>Create Playlist</Text>
        </TouchableOpacity>
      </View>

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

      <Text style={styles.count}>{isLoading ? 'Loading...' : `${sorted.length} songs`}</Text>

      <FlatList
        data={sorted}
        keyExtractor={(s) => String(s.id)}
        renderItem={({ item }) => (
          <SongRow
            song={item}
            onPress={() => startPreview(item).catch(() => null)}
            onLongPress={() => showSongActions(item)}
          />
        )}
        ListEmptyComponent={!isLoading ? <Text style={styles.empty}>No songs yet</Text> : null}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={styles.list}
      />

      {(previewVisible || isPreviewLoading) && (
        <View style={styles.previewBar}>
          <Text style={styles.previewText} numberOfLines={1}>
            {isPreviewLoading
              ? 'Preparing preview...'
              : `Previewing: ${previewSong?.title ?? 'Unknown track'}`}
          </Text>
          <TouchableOpacity style={styles.previewStopButton} onPress={() => stopPreview().catch(() => null)}>
            <Text style={styles.previewStopText}>Stop</Text>
          </TouchableOpacity>
        </View>
      )}

      <Modal visible={playlistModalVisible} transparent animationType="fade" onRequestClose={() => setPlaylistModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Playlists</Text>
            <Text style={styles.modalSubtitle} numberOfLines={1}>{selectedSong?.title ?? ''}</Text>

            <FlatList
              data={playlists}
              keyExtractor={(item) => String(item.id)}
              ListEmptyComponent={<Text style={styles.empty}>No playlists yet</Text>}
              renderItem={({ item }) => {
                const isAdded = songPlaylistIds.includes(item.id)
                return (
                  <TouchableOpacity style={styles.playlistRow} onPress={() => toggleSongPlaylist(item.id).catch(() => null)}>
                    <Text style={styles.playlistName}>{item.name}</Text>
                    <Text style={[styles.playlistState, isAdded && styles.playlistStateActive]}>
                      {isAdded ? 'Remove' : 'Add'}
                    </Text>
                  </TouchableOpacity>
                )
              }}
            />

            <TouchableOpacity style={styles.modalCloseButton} onPress={() => setPlaylistModalVisible(false)}>
              <Text style={styles.modalCloseText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        visible={createPlaylistModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCreatePlaylistModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>New Playlist</Text>
            <TextInput
              value={newPlaylistName}
              onChangeText={setNewPlaylistName}
              placeholder="Playlist name"
              placeholderTextColor="#666"
              style={styles.input}
            />
            <View style={styles.modalActionsRow}>
              <TouchableOpacity style={styles.modalButtonSecondary} onPress={() => setCreatePlaylistModalVisible(false)}>
                <Text style={styles.modalButtonSecondaryText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalButtonPrimary} onPress={() => handleCreatePlaylist().catch(() => null)}>
                <Text style={styles.modalButtonPrimaryText}>Create</Text>
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
  actionsRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingBottom: 8 },
  actionButton: { backgroundColor: '#1e3a1e', borderWidth: 1, borderColor: '#4caf50', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  actionButtonText: { color: '#4caf50', fontSize: 12, fontWeight: '600' },
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
  modalCard: { backgroundColor: '#171717', borderRadius: 12, borderWidth: 1, borderColor: '#2a2a2a', padding: 16, maxHeight: '75%' },
  modalTitle: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 8 },
  modalSubtitle: { color: '#888', fontSize: 12, marginBottom: 12 },
  playlistRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#222' },
  playlistName: { color: '#eee', fontSize: 14, flex: 1, marginRight: 10 },
  playlistState: { color: '#6ea8ff', fontSize: 13, fontWeight: '600' },
  playlistStateActive: { color: '#ffad5a' },
  modalCloseButton: { marginTop: 12, alignSelf: 'flex-end', paddingVertical: 8, paddingHorizontal: 10 },
  modalCloseText: { color: '#4caf50', fontSize: 13, fontWeight: '600' },
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
  previewBar: {
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#284228',
    backgroundColor: '#142214',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  previewText: { flex: 1, color: '#9dd49d', fontSize: 12, fontWeight: '600' },
  previewStopButton: { borderWidth: 1, borderColor: '#4caf50', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  previewStopText: { color: '#4caf50', fontSize: 12, fontWeight: '700' },
})
