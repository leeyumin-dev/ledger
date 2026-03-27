import { useEffect, useState, useCallback } from 'react';
import { Stack, router } from 'expo-router';
import { Session } from '@supabase/supabase-js';
import { useFonts, GeistMono_400Regular, GeistMono_500Medium } from '@expo-google-fonts/geist-mono';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { supabase } from '../src/lib/supabase';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [session, setSession]       = useState<Session | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [isNewUser, setIsNewUser]   = useState(false);

  const [fontsLoaded] = useFonts({
    GeistMono_400Regular,
    GeistMono_500Medium,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
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
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const handleDeepLink = async (url: string) => {
      if (url.includes('access_token')) {
        const params = new URLSearchParams(url.split('#')[1]);
        const accessToken  = params.get('access_token');
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

  if (!fontsLoaded || !initialized) return null;

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="login" />
      <Stack.Screen name="onboarding" />
    </Stack>
  );
}