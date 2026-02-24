import React, { useCallback, useState } from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native'
import { useUSBStore } from '../store/usb.store'
import { usePlayerStore } from '../store/player.store'
import { formatBytes } from '../utils/helpers'
import {
  deleteFile,
  getStorageInfo,
  listDirectory,
  requestUsbPermission,
  type FileEntry,
} from '../services/usb.service'
import { attachUsbDatabase, detachUsbDatabase } from '../services/database.service'
import { resetTrackPlayer, stopTrackPlayer } from '../services/track-player.service'

type UsbFile = FileEntry & { id: string; uri: string }

const StorageBar = ({ used, total }: { used: number; total: number }) => {
  const pct = total > 0 ? Math.min(used / total, 1) : 0
  return (
    <View style={styles.storageBarTrack}>
      <View style={[styles.storageBarFill, { flex: pct }]} />
      <View style={{ flex: 1 - pct }} />
    </View>
  )
}

export const USBManagerScreen = () => {
  const {
    connected,
    uri,
    name,
    usedBytes,
    freeBytes,
    totalBytes,
    setConnected,
    setDisconnected,
  } = useUSBStore()
  const [files, setFiles] = useState<UsbFile[]>([])
  const [busy, setBusy] = useState(false)

  const loadDriveState = useCallback(async (rootUri: string) => {
    const [storage, entries] = await Promise.all([
      getStorageInfo(rootUri),
      listDirectory(`${rootUri}/Music`),
    ])

    setConnected({
      uri: rootUri,
      name: 'USB Drive',
      usedBytes: storage.used,
      freeBytes: storage.free,
      totalBytes: storage.total,
    })

    setFiles(
      entries
        .filter((entry) => !entry.isDirectory)
        .map((entry) => ({
          ...entry,
          id: `${entry.name}-${entry.size}`,
          uri: `${rootUri}/Music/${entry.name}`,
        })),
    )
  }, [setConnected])

  const handleConnect = useCallback(async () => {
    setBusy(true)
    try {
      const rootUri = await requestUsbPermission()
      await attachUsbDatabase(rootUri)
      await loadDriveState(rootUri)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unable to connect USB drive'
      Alert.alert('USB error', message)
    } finally {
      setBusy(false)
    }
  }, [loadDriveState])

  const handleDisconnect = useCallback(async () => {
    setBusy(true)
    let disconnectError: string | null = null

    try {
      await detachUsbDatabase()
    } catch (err: unknown) {
      const detail = err instanceof Error ? err.message : 'Unknown sync error'
      disconnectError = `USB disconnected, but database sync before detach failed: ${detail}`
    } finally {
      await stopTrackPlayer().catch(() => null)
      await resetTrackPlayer().catch(() => null)
      usePlayerStore.getState().hide()
      setFiles([])
      setDisconnected()
      setBusy(false)
    }

    if (disconnectError) {
      Alert.alert('Disconnect warning', `${disconnectError}. Reconnect USB and verify your latest changes.`)
    }
  }, [setDisconnected])

  const handleDelete = useCallback(async (file: UsbFile) => {
    if (!uri) return

    try {
      await deleteFile(file.uri)
      await loadDriveState(uri)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Delete failed'
      Alert.alert('Delete failed', message)
    }
  }, [loadDriveState, uri])

  return (
    <View style={styles.container}>
      <Text style={styles.header}>USB Manager</Text>

      {/* Status card */}
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <View style={[styles.statusDot, connected ? styles.dotOn : styles.dotOff]} />
          <Text style={styles.cardTitle}>{connected ? name ?? 'USB Drive' : 'No drive connected'}</Text>
        </View>

        {connected && (
          <>
            <StorageBar used={usedBytes} total={totalBytes} />
            <Text style={styles.storageText}>
              {formatBytes(usedBytes)} used · {formatBytes(freeBytes)} free · {formatBytes(totalBytes)} total
            </Text>
          </>
        )}

        {!connected && (
          <Text style={styles.hintText}>Plug in your USB flashdrive via OTG to manage files</Text>
        )}

        <View style={styles.actionsRow}>
          <TouchableOpacity style={styles.actionBtn} onPress={handleConnect} disabled={busy}>
            <Text style={styles.actionBtnText}>{busy ? 'Working…' : 'Connect USB'}</Text>
          </TouchableOpacity>
          {connected && (
            <TouchableOpacity style={styles.disconnectBtn} onPress={handleDisconnect} disabled={busy}>
              <Text style={styles.disconnectBtnText}>{busy ? 'Disconnecting…' : 'Disconnect'}</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Music/</Text>
        <Text style={styles.sectionCount}>{files.length} files</Text>
      </View>

      <FlatList
        data={files}
        keyExtractor={(f) => f.id}
        renderItem={({ item }) => (
          <View style={styles.fileRow}>
            <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
            <View style={styles.fileRight}>
              <Text style={styles.fileSize}>{formatBytes(item.size)}</Text>
              <TouchableOpacity onPress={() => handleDelete(item)} style={styles.deleteBtn}>
                <Text style={styles.deleteBtnText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        contentContainerStyle={styles.list}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  header: { fontSize: 22, fontWeight: '700', color: '#fff', paddingHorizontal: 16, paddingTop: 20, paddingBottom: 12 },
  card: { marginHorizontal: 16, marginBottom: 16, backgroundColor: '#1a1a1a', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#2a2a2a' },
  cardRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  dotOn: { backgroundColor: '#4caf50' },
  dotOff: { backgroundColor: '#f44336' },
  cardTitle: { color: '#fff', fontSize: 15, fontWeight: '600' },
  storageBarTrack: { flexDirection: 'row', height: 6, borderRadius: 3, backgroundColor: '#333', marginBottom: 6, overflow: 'hidden' },
  storageBarFill: { backgroundColor: '#4caf50', borderRadius: 3 },
  storageText: { color: '#777', fontSize: 12 },
  hintText: { color: '#555', fontSize: 13, marginTop: 4 },
  actionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { backgroundColor: '#4caf50', borderRadius: 8, paddingVertical: 9, paddingHorizontal: 12 },
  actionBtnText: { color: '#fff', fontWeight: '600' },
  disconnectBtn: { backgroundColor: '#2b0d0d', borderRadius: 8, paddingVertical: 9, paddingHorizontal: 12 },
  disconnectBtnText: { color: '#f44336', fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 6 },
  sectionTitle: { color: '#aaa', fontSize: 13, fontWeight: '600', fontFamily: 'monospace' },
  sectionCount: { color: '#555', fontSize: 12 },
  list: { paddingHorizontal: 16 },
  separator: { height: 1, backgroundColor: '#222' },
  fileRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11 },
  fileName: { flex: 1, color: '#ddd', fontSize: 13, fontFamily: 'monospace' },
  fileRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  fileSize: { color: '#666', fontSize: 12 },
  deleteBtn: { padding: 4 },
  deleteBtnText: { color: '#f44336', fontSize: 14 },
})
