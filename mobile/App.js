import 'react-native-gesture-handler'
import React, { useEffect } from 'react'
import { NavigationContainer } from '@react-navigation/native'
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import { Text, View } from 'react-native'

import { USBStatusBar } from './src/components/USBStatusBar'
import { SearchScreen } from './src/screens/SearchScreen'
import { LibraryScreen } from './src/screens/LibraryScreen'
import { USBManagerScreen } from './src/screens/USBManagerScreen'
import { SettingsScreen } from './src/screens/SettingsScreen'
import { hydrateApiConfig } from './src/services/api.service'

const Tab = createBottomTabNavigator()

const TabIcon = ({ label, focused }) => (
  <View style={{ alignItems: 'center', justifyContent: 'center' }}>
    <Text style={{ fontSize: 18, color: focused ? '#4caf50' : '#666' }}>
      {label === 'Search' ? '🔍' : label === 'Library' ? '🎵' : label === 'USB' ? '💾' : '⚙️'}
    </Text>
  </View>
)

export default function App() {
  useEffect(() => {
    const bootstrap = async () => {
      await hydrateApiConfig()
    }

    void bootstrap()
  }, [])

  return (
    <SafeAreaProvider>
      <StatusBar style="light" backgroundColor="#000" />
      <SafeAreaView style={{ flex: 1, backgroundColor: '#111' }} edges={['top']}>
        <USBStatusBar />
        <NavigationContainer>
          <Tab.Navigator
            screenOptions={{
              headerShown: false,
              tabBarStyle: { backgroundColor: '#1a1a1a', borderTopColor: '#333' },
              tabBarActiveTintColor: '#4caf50',
              tabBarInactiveTintColor: '#666',
              tabBarLabelStyle: { fontSize: 11 },
            }}
          >
            <Tab.Screen
              name="Search"
              component={SearchScreen}
              options={{ tabBarIcon: ({ focused }) => <TabIcon label="Search" focused={focused} /> }}
            />
            <Tab.Screen
              name="Library"
              component={LibraryScreen}
              options={{ tabBarIcon: ({ focused }) => <TabIcon label="Library" focused={focused} /> }}
            />
            <Tab.Screen
              name="USB"
              component={USBManagerScreen}
              options={{ tabBarIcon: ({ focused }) => <TabIcon label="USB" focused={focused} /> }}
            />
            <Tab.Screen
              name="Settings"
              component={SettingsScreen}
              options={{ tabBarIcon: ({ focused }) => <TabIcon label="Settings" focused={focused} /> }}
            />
          </Tab.Navigator>
        </NavigationContainer>
      </SafeAreaView>
    </SafeAreaProvider>
  )
}
