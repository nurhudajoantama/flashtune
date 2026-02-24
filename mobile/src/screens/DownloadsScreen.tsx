import React from 'react'
import { Modal, View, Text, StyleSheet, FlatList, TouchableOpacity } from 'react-native'
import { useDownloadStore } from '../store/download.store'
import type { DownloadItem } from '../types'

const statusLabel: Record<DownloadItem['status'], string> = {
  queued: 'Queued',
  downloading: 'Downloading',
  writing: 'Saving to folder',
  done: 'Done',
  error: 'Failed',
}

const statusColor: Record<DownloadItem['status'], string> = {
  queued: '#999',
  downloading: '#6ea8ff',
  writing: '#ffad5a',
  done: '#6fdc6f',
  error: '#ff6b6b',
}

const ProgressRing = ({ progress, status }: { progress: number; status: DownloadItem['status'] }) => {
  const pct = Math.max(0, Math.min(100, Math.round(progress * 100)))
  return (
    <View style={[styles.ring, { borderColor: statusColor[status] }]}>
      <Text style={styles.ringText}>{pct}</Text>
    </View>
  )
}

export const DownloadsScreen = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const queue = useDownloadStore((state) => state.queue)
  const clearCompleted = useDownloadStore((state) => state.clearCompleted)
  const removeItem = useDownloadStore((state) => state.removeItem)

  const hasCompleted = queue.some((item) => item.status === 'done' || item.status === 'error')

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.headerRow}>
          <Text style={styles.header}>Downloads</Text>
          {hasCompleted && (
            <TouchableOpacity onPress={clearCompleted}>
              <Text style={styles.clearText}>Clear completed</Text>
            </TouchableOpacity>
          )}
        </View>

        <FlatList
          data={queue}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          ListEmptyComponent={<Text style={styles.empty}>No downloads yet</Text>}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => (
            <View style={styles.itemRow}>
              <ProgressRing progress={item.progress} status={item.status} />

              <View style={styles.itemCenter}>
                <Text style={styles.title} numberOfLines={1}>{item.song.title}</Text>
                <Text style={styles.artist} numberOfLines={1}>{item.song.artist}</Text>
                {item.status === 'error' && item.error ? <Text style={styles.errorText}>{item.error}</Text> : null}
              </View>

              <View style={styles.itemRight}>
                <Text style={[styles.statusText, { color: statusColor[item.status] }]}>{statusLabel[item.status]}</Text>
                {item.status === 'error' && (
                  <TouchableOpacity onPress={() => removeItem(item.id)}>
                    <Text style={styles.dismissText}>Dismiss</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        />

        <View style={styles.footer}>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <Text style={styles.closeBtnText}>Close</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 12,
  },
  header: { color: '#fff', fontSize: 22, fontWeight: '700' },
  clearText: { color: '#6ea8ff', fontSize: 13, fontWeight: '600' },
  list: { paddingHorizontal: 16, paddingBottom: 16 },
  empty: { color: '#666', textAlign: 'center', marginTop: 36 },
  separator: { height: 1, backgroundColor: '#222' },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, gap: 12 },
  ring: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringText: { color: '#ddd', fontSize: 10, fontWeight: '700' },
  itemCenter: { flex: 1 },
  title: { color: '#fff', fontSize: 14, fontWeight: '600' },
  artist: { color: '#888', fontSize: 12, marginTop: 2 },
  errorText: { color: '#ff6b6b', fontSize: 11, marginTop: 4 },
  itemRight: { alignItems: 'flex-end', gap: 6 },
  statusText: { fontSize: 12, fontWeight: '600' },
  dismissText: { color: '#bbb', fontSize: 12 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: '#222' },
  closeBtn: { backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#444', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  closeBtnText: { color: '#ddd', fontSize: 14, fontWeight: '600' },
})
