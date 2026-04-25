import {
  View, Text,
  TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert
} from 'react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { supabase } from '../src/lib/supabase';
import { colors, font, fontSize, spacing, radius } from '../src/lib/theme';

GoogleSignin.configure({
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
});

export default function LoginScreen() {
  async function handleGoogleSignIn() {
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken;
      if (!idToken) throw new Error('ID 토큰을 받지 못했어요.');

      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
      if (error) Alert.alert('오류', error.message);
    } catch (error: any) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) return;
      if (error.code === statusCodes.IN_PROGRESS) return;
      Alert.alert('오류', 'Google 로그인에 실패했어요.');
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        <Text style={styles.logo}>Ledger.</Text>
        <Text style={styles.tagline}>시간 재무제표</Text>

        <TouchableOpacity style={styles.googleBtn} onPress={handleGoogleSignIn}>
          <Text style={styles.googleBtnText}>Google로 계속하기</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  logo: {
    fontFamily: font.medium,
    fontSize: 48,
    color: colors.textPrimary,
    letterSpacing: -1,
    marginBottom: 6,
  },
  tagline: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.textMuted,
    marginBottom: spacing['2xl'],
  },
  googleBtn: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  googleBtnText: {
    fontFamily: font.medium,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },
});
