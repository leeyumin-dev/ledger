import {
  View, Text,
  TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert, Dimensions
} from 'react-native';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { supabase } from '../src/lib/supabase';
import { colors, font, fontSize, spacing, radius } from '../src/lib/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const { height } = Dimensions.get('window');

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
    <View style={styles.container}>
      {/* Premium Glow Effect */}
      <LinearGradient
        colors={['rgba(232,65,10,0.12)', 'transparent']}
        style={styles.glow}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      <KeyboardAvoidingView
        style={styles.content}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.header}>
          <Text style={styles.logo}>Ledger.</Text>
          <View style={styles.taglineRow}>
            <View style={styles.taglineLine} />
            <Text style={styles.tagline}>시간 재무제표</Text>
            <View style={styles.taglineLine} />
          </View>
        </View>

        <View style={styles.introContainer}>
          <Text style={styles.introTitle}>
            당신의 시간은{'\n'}
            <Text style={{ color: colors.accent }}>얼마의 가치</Text>가 있나요?
          </Text>
          <Text style={styles.introDesc}>
            Ledger는 시간을 재무제표로 기록합니다.{'\n'}
            낭비한 시간은 손실로, 투자한 시간은{'\n'}
            자산으로 관리하여 매일의 성장을 확인하세요.
          </Text>
        </View>

        <View style={styles.footer}>
          <TouchableOpacity 
            style={styles.googleBtn} 
            onPress={handleGoogleSignIn}
            activeOpacity={0.8}
          >
            <Ionicons name="logo-google" size={18} color={colors.textPrimary} style={{ marginRight: 12 }} />
            <Text style={styles.googleBtnText}>Google 계정으로 시작하기</Text>
          </TouchableOpacity>
          
          <Text style={styles.footerMuted}>
            계속 진행함으로써 이용약관 및{'\n'}개인정보 처리방침에 동의하게 됩니다.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  glow: {
    position: 'absolute',
    top: -height * 0.1,
    left: 0,
    right: 0,
    height: height * 0.6,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: height * 0.12,
    paddingBottom: spacing['2xl'],
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
  },
  logo: {
    fontFamily: font.bold,
    fontSize: 52,
    color: colors.textPrimary,
    letterSpacing: -3,
    marginBottom: 4,
  },
  taglineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  taglineLine: {
    width: 20,
    height: 1,
    backgroundColor: colors.accent,
    opacity: 0.6,
  },
  tagline: {
    fontFamily: font.medium,
    fontSize: 11,
    color: colors.textSecondary,
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  introContainer: {
    marginTop: -height * 0.05,
  },
  introTitle: {
    fontFamily: font.medium,
    fontSize: 32,
    color: colors.textPrimary,
    lineHeight: 42,
    letterSpacing: -1,
    marginBottom: 20,
  },
  introDesc: {
    fontFamily: font.regular,
    fontSize: 15,
    color: colors.textSecondary,
    lineHeight: 24,
  },
  footer: {
    width: '100%',
  },
  googleBtn: {
    flexDirection: 'row',
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleBtnText: {
    fontFamily: font.medium,
    fontSize: 15,
    color: colors.textPrimary,
  },
  footerMuted: {
    fontFamily: font.regular,
    fontSize: 10,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 16,
  },
});
