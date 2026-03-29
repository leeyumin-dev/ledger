import { Tabs } from 'expo-router';
import { View } from 'react-native';
// import AdBanner from '../../src/components/BannerAd';

export default function TabLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#e8410a',
          tabBarInactiveTintColor: '#5a5754',
          tabBarStyle: {
            backgroundColor: '#0f0f0f',
            borderTopColor: '#1c1c1c',
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

      {/* 탭바 위 배너 광고 */}
      {/* <View style={{ position: 'absolute', bottom: 49, left: 0, right: 0, alignItems: 'center' }}>
        <AdBanner />
      </View> */}
    </View>
  );
}