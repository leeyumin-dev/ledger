import { Tabs } from 'expo-router';
import { View } from 'react-native';
import { colors, font } from '../../src/lib/theme';

export default function TabLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: {
            backgroundColor: colors.bgBase,
            borderTopColor: colors.border,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '500',
          },
        }}
      >
        <Tabs.Screen name="index"    options={{ title: '오늘' }} />
        <Tabs.Screen name="archive"  options={{ title: '보관함' }} />
        <Tabs.Screen name="share"    options={{ title: '결산' }} />
        <Tabs.Screen name="trends" options={{ title: '추세' }} />
        <Tabs.Screen name="settings" options={{ href: null }} />
      </Tabs>
    </View>
  );
}
