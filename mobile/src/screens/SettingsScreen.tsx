import React, { useState } from 'react'
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Alert,
} from 'react-native'
import { configureApi, getApiConfig } from '../services/api.service'

const PLACEHOLDER_VERSION = '1.0.0 (build 1)'

export const SettingsScreen = () => {
  const initialConfig = getApiConfig()
  const [backendUrl, setBackendUrl] = useState(initialConfig.baseURL)
  const [apiKey, setApiKey] = useState(initialConfig.apiKey)

  const handleSave = () => {
    configureApi({ baseURL: backendUrl.trim(), apiKey: apiKey.trim() })
    Alert.alert('Saved', 'Settings updated.')
  }

  const handleClearTemp = () => {
    Alert.alert('Clear temp files?', 'This will delete any leftover temp files from interrupted downloads.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clear', style: 'destructive', onPress: () => console.log('Clear temp files') },
    ])
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.header}>Settings</Text>

      <Text style={styles.sectionLabel}>Backend</Text>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>Backend URL</Text>
        <TextInput
          style={styles.input}
          value={backendUrl}
          onChangeText={setBackendUrl}
          placeholder="http://192.168.1.100:3000"
          placeholderTextColor="#555"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
      </View>

      <View style={styles.field}>
        <Text style={styles.fieldLabel}>API Key</Text>
        <TextInput
          style={styles.input}
          value={apiKey}
          onChangeText={setApiKey}
          placeholder="your-api-key"
          placeholderTextColor="#555"
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
      </View>

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
        <Text style={styles.saveBtnText}>Save</Text>
      </TouchableOpacity>

      <Text style={[styles.sectionLabel, { marginTop: 28 }]}>Storage</Text>

      <TouchableOpacity style={styles.dangerBtn} onPress={handleClearTemp}>
        <Text style={styles.dangerBtnText}>Clear Temp Files</Text>
      </TouchableOpacity>

      <Text style={styles.sectionLabel}>About</Text>

      <View style={styles.infoRow}>
        <Text style={styles.infoLabel}>Version</Text>
        <Text style={styles.infoValue}>{PLACEHOLDER_VERSION}</Text>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#111' },
  content: { padding: 16, paddingBottom: 40 },
  header: { fontSize: 22, fontWeight: '700', color: '#fff', paddingTop: 8, paddingBottom: 16 },
  sectionLabel: { color: '#555', fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10, marginTop: 4 },
  field: { marginBottom: 12 },
  fieldLabel: { color: '#aaa', fontSize: 13, marginBottom: 6 },
  input: {
    backgroundColor: '#1e1e1e',
    color: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#333',
  },
  saveBtn: { backgroundColor: '#4caf50', borderRadius: 8, paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  dangerBtn: { backgroundColor: '#2b0d0d', borderRadius: 8, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#5a1a1a', marginBottom: 24 },
  dangerBtnText: { color: '#f44336', fontWeight: '600', fontSize: 14 },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#222' },
  infoLabel: { color: '#aaa', fontSize: 14 },
  infoValue: { color: '#555', fontSize: 14 },
})
