import { Tabs } from 'expo-router';

export default function TabLayout() {
    return (
        <Tabs
            // 탭 네비게이션의 공통 옵션을 설정합니다.
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
            {/* 각 탭 화면을 정의합니다. name: 경로, options: 화면 제목 */}
            <Tabs.Screen name="index" options={{ title: '오늘' }} />
            <Tabs.Screen name="archive" options={{ title: '보관함' }} />
            <Tabs.Screen name="share" options={{ title: '결산' }} />
            <Tabs.Screen name="settings" options={{ title: '설정' }} />
        </Tabs>
    );
}