import { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { Session } from '@supabase/supabase-js';
import { useFonts, GeistMono_400Regular, GeistMono_500Medium, GeistMono_700Bold, GeistMono_800ExtraBold } from '@expo-google-fonts/geist-mono';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { supabase } from '../src/lib/supabase';
import * as Notifications from 'expo-notifications';
import { useAutoSync } from '../src/hooks/useAutoSync';
import { hasPermission, startMonitoring, stopMonitoring, clearAppTokens } from '../src/lib/screenTime';
import { SyncContext } from '../src/lib/SyncContext';

SplashScreen.preventAutoHideAsync();

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
  
  const { syncedAt } = useAutoSync();

  // 로그인 상태이고 ScreenTime 권한이 있으면 모니터링 항상 활성화
  useEffect(() => {
    if (!session) return;
    hasPermission().then(async permitted => {
      if (!permitted) { console.log('[Layout] ScreenTime 권한 없음'); return; }
      const ok = await startMonitoring();
      console.log('[Layout] startMonitoring:', ok);
    });
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
          const { data } = await supabase
            .from('user_settings')
            .select('id')
            .eq('user_id', session.user.id)
            .single();

          setIsNewUser(!data);
        }

        if (_event === 'SIGNED_OUT') {
          await stopMonitoring();
          await clearAppTokens();
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
    <SyncContext.Provider value={syncedAt}>
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