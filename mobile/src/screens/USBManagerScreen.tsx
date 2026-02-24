import React from 'react'
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from 'react-native'
import { useUSBStore } from '../store/usb.store'
import { formatBytes } from '../utils/helpers'

interface MockFile {
  id: string
  name: string
  size: number
}

const MOCK_FILES: MockFile[] = [
  { id: '1', name: 'bohemian-rhapsody.mp3', size: 8_540_000 },
  { id: '2', name: 'hotel-california.mp3', size: 9_120_000 },
  { id: '3', name: 'stairway-to-heaven.mp3', size: 11_300_000 },
  { id: '4', name: 'smells-like-teen-spirit.mp3', size: 7_200_000 },
  { id: '5', name: 'sweet-child-o-mine.mp3', size: 8_650_000 },
]

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
  const { connected, name, usedBytes, freeBytes, totalBytes } = useUSBStore()

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
      </View>

      {/* File list — always show mock for skeleton */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Music/</Text>
        <Text style={styles.sectionCount}>{MOCK_FILES.length} files</Text>
      </View>

      <FlatList
        data={MOCK_FILES}
        keyExtractor={(f) => f.id}
        renderItem={({ item }) => (
          <View style={styles.fileRow}>
            <Text style={styles.fileName} numberOfLines={1}>{item.name}</Text>
            <View style={styles.fileRight}>
              <Text style={styles.fileSize}>{formatBytes(item.size)}</Text>
              <TouchableOpacity onPress={() => console.log('Delete', item.id)} style={styles.deleteBtn}>
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
