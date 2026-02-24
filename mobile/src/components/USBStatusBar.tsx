import React from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useUSBStore } from '../store/usb.store'
import { formatBytes } from '../utils/helpers'

export const USBStatusBar = () => {
  const { connected, name, freeBytes } = useUSBStore()

  return (
    <View style={[styles.bar, connected ? styles.connected : styles.disconnected]}>
      <View style={[styles.dot, connected ? styles.dotOn : styles.dotOff]} />
      <Text style={styles.text}>
        {connected
          ? `${name ?? 'USB'} · ${formatBytes(freeBytes)} free`
          : 'USB Disconnected — plug in your drive'}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 14 },
  connected: { backgroundColor: '#0d2b0d' },
  disconnected: { backgroundColor: '#2b0d0d' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  dotOn: { backgroundColor: '#4caf50' },
  dotOff: { backgroundColor: '#f44336' },
  text: { color: '#ccc', fontSize: 12 },
})
