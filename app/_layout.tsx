import { useEffect, useState } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Stack, router } from 'expo-router';
import { Session } from '@supabase/supabase-js';
import { useFonts, GeistMono_400Regular, GeistMono_500Medium, GeistMono_700Bold, GeistMono_800ExtraBold } from '@expo-google-fonts/geist-mono';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { supabase } from '../src/lib/supabase';
import { useAutoSync } from '../src/hooks/useAutoSync';
import { hasPermission, startMonitoring, stopMonitoring, isTokenKey, cleanStaleTokenKeys, clearAllLocalData } from '../src/lib/screenTime';
import { scheduleWeeklySettlementNotification, cancelWeeklySettlementNotification, scheduleGoalCheckNotification, cancelGoalCheckNotification } from '../src/lib/notifications';
import { SyncContext } from '../src/lib/SyncContext';

SplashScreen.preventAutoHideAsync();

// 유저 비연동 AsyncStorage 키 정리 (계정 전환 / 로그아웃 시 호출)
async function _clearNonUserScopedAsyncStorage() {
  await AsyncStorage.removeItem('ledger_last_sync_date');
  const allKeys = await AsyncStorage.getAllKeys();
  const staleKeys = allKeys.filter(k => k.startsWith('ledger_notif80_'));
  if (staleKeys.length > 0) await AsyncStorage.multiRemove(staleKeys);
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function RootLayout() {
  const [session, setSession] = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [isNewUser, setIsNewUser] = useState(false);

  const [fontsLoaded] = useFonts({
    GeistMono_400Regular,
    GeistMono_500Medium,
    GeistMono_700Bold,
    GeistMono_800ExtraBold,
  });
  
  const { syncedAt, sync } = useAutoSync();

  // 로그인 상태이고 ScreenTime 권한이 있으면 모니터링 항상 활성화
  useEffect(() => {
    if (!session) return;

    hasPermission().then(async permitted => {
      if (!permitted) { console.log('[Layout] ScreenTime 권한 없음'); return; }
      const ok = await startMonitoring();
      console.log('[Layout] startMonitoring:', ok);
    });

    scheduleGoalCheckNotification();
    scheduleWeeklySettlementNotification().then(async () => {
      const scheduled = await Notifications.getAllScheduledNotificationsAsync();
      console.log('[Notif] 등록된 알림:', JSON.stringify(
        scheduled.map(n => ({ id: n.identifier, trigger: n.trigger })),
        null, 2
      ));
    });

    // 재설치 후 로그인 시 stale 토큰 감지 및 정리
    (async () => {
      const { data: categories } = await supabase
        .from('app_categories')
        .select('app_name')
        .eq('user_id', session.user.id);

      const registeredTokenKeys = new Set(
        (categories ?? []).map(c => c.app_name).filter(isTokenKey)
      );

      // app_usage에 있는 토큰 키 중 app_categories에 없는 것 → 고아 행 삭제
      const { data: usageRows } = await supabase
        .from('app_usage')
        .select('app_name')
        .eq('user_id', session.user.id);

      const orphanKeys = [...new Set(
        (usageRows ?? [])
          .map(u => u.app_name)
          .filter(name => isTokenKey(name) && !registeredTokenKeys.has(name))
      )];

      if (orphanKeys.length > 0) {
        await supabase.from('app_usage').delete()
          .eq('user_id', session.user.id).in('app_name', orphanKeys);
      }

      // app_categories에 있지만 로컬 토큰이 없는 것 → 재설치로 유실된 stale 토큰
      const staleKeys = await cleanStaleTokenKeys([...registeredTokenKeys]);
      if (staleKeys.length === 0) return;

      await Promise.all([
        supabase.from('app_categories').delete()
          .eq('user_id', session.user.id).in('app_name', staleKeys),
        supabase.from('app_usage').delete()
          .eq('user_id', session.user.id).in('app_name', staleKeys),
      ]);

      Alert.alert(
        '추적 앱 초기화됨',
        '앱 재설치로 인해 추적 앱 데이터가 초기화됐어요.\n프로필에서 앱을 다시 추가해주세요.'
      );
    })();
  }, [session]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      if (session) {
        const { data } = await supabase
          .from('user_settings')
          .select('id')
          .eq('user_id', session.user.id)
          .single();
        setIsNewUser(!data);
      }
      setInitialized(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setSession(session);

        if (session && _event === 'SIGNED_IN') {
          // 이전 로그인 계정과 다른 경우 → 로컬 데이터 즉시 클리어
          const prevUserId = await AsyncStorage.getItem('ledger_current_user_id');
          if (prevUserId && prevUserId !== session.user.id) {
            await stopMonitoring();
            await clearAllLocalData();
            await _clearNonUserScopedAsyncStorage();
          }
          await AsyncStorage.setItem('ledger_current_user_id', session.user.id);

          const { data } = await supabase
            .from('user_settings')
            .select('id')
            .eq('user_id', session.user.id)
            .single();

          setIsNewUser(!data);
        }

        if (_event === 'SIGNED_OUT') {
          await stopMonitoring();
          await clearAllLocalData();
          await AsyncStorage.removeItem('ledger_current_user_id');
          await _clearNonUserScopedAsyncStorage();
          await cancelWeeklySettlementNotification();
          await cancelGoalCheckNotification();
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const handleDeepLink = async (url: string) => {
      if (url.includes('access_token')) {
        const params = new URLSearchParams(url.split('#')[1]);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');

        if (accessToken && refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
        }
      }
    };

    Linking.getInitialURL().then(url => { if (url) handleDeepLink(url); });

    const subscription = Linking.addEventListener('url', ({ url }) => handleDeepLink(url));
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (!fontsLoaded || !initialized) return;
    SplashScreen.hideAsync();

    if (session) {
      if (isNewUser) {
        router.replace('/onboarding');
      } else {
        router.replace('/(tabs)');
      }
    } else {
      router.replace('/login');
    }
  }, [fontsLoaded, initialized, session, isNewUser]);

  useEffect(() => {
    async function requestNotificationPermission() {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.log('알림 권한 거부됨');
      }
    }
    requestNotificationPermission();
  }, []);

  if (!fontsLoaded || !initialized) return null;

  return (
      <SyncContext.Provider value={{ syncedAt, sync }}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="login" />
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="weekly-detail" />
        <Stack.Screen name="monthly-report" />
      </Stack>
    </SyncContext.Provider>
  );
}