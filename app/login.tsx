import { useState } from 'react';
import {
  View, Text, TextInput,
  TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { supabase } from '../src/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

GoogleSignin.configure({
  iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
  webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
});

export default function LoginScreen() {
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading]   = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  async function handleAuth() {
    setLoading(true);

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) Alert.alert('오류', error.message);
      else Alert.alert('확인', '이메일을 확인해주세요.');
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) Alert.alert('오류', '이메일 또는 비밀번호가 틀렸어요.');
    }

    setLoading(false);
  }

  async function handleKakaoSignIn() {
    try {
      const redirectTo = Linking.createURL('/auth/callback');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'kakao',
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error || !data.url) { Alert.alert('오류', '카카오 로그인에 실패했어요.'); return; }
      await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    } catch {
      Alert.alert('오류', '카카오 로그인에 실패했어요.');
    }
  }

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

        {/* 로고 */}
        <Text style={styles.logo}>Ledger.</Text>
        <Text style={styles.tagline}>시간 재무제표</Text>

        {/* 입력 필드 */}
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="이메일"
            placeholderTextColor="#5a5754"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <TextInput
            style={styles.input}
            placeholder="비밀번호"
            placeholderTextColor="#5a5754"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        {/* 버튼 */}
        <TouchableOpacity
          style={[styles.btn, loading && styles.btnDisabled]}
          onPress={handleAuth}
          disabled={loading}
        >
          <Text style={styles.btnText}>
            {loading ? '처리 중...' : isSignUp ? '회원가입' : '로그인'}
          </Text>
        </TouchableOpacity>

        {/* 구분선 */}
        <View style={styles.divider}>
          <View style={styles.dividerLine} />
          <Text style={styles.dividerText}>또는</Text>
          <View style={styles.dividerLine} />
        </View>

        {/* 구글 로그인 */}
        <TouchableOpacity
          style={styles.googleBtn}
          onPress={handleGoogleSignIn}
          disabled={loading}
        >
          <Text style={styles.googleBtnText}>Google로 계속하기</Text>
        </TouchableOpacity>

        {/* 카카오 로그인 */}
        <TouchableOpacity
          style={styles.kakaoBtn}
          onPress={handleKakaoSignIn}
          disabled={loading}
        >
          <Text style={styles.kakaoBtnText}>카카오로 계속하기</Text>
        </TouchableOpacity>

        {/* 전환 */}
        <TouchableOpacity onPress={() => setIsSignUp(!isSignUp)}>
          <Text style={styles.toggle}>
            {isSignUp ? '이미 계정이 있어요 → 로그인' : '계정이 없어요 → 회원가입'}
          </Text>
        </TouchableOpacity>

      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  logo: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 48,
    color: '#f0ede8',
    letterSpacing: -1,
    marginBottom: 6,
  },
  tagline: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 13,
    color: '#5a5754',
    marginBottom: 52,
  },
  form: {
    gap: 12,
    marginBottom: 16,
  },
  input: {
    backgroundColor: '#161614',
    borderWidth: 1,
    borderColor: '#2a2826',
    borderRadius: 10,
    padding: 16,
    color: '#f0ede8',
    fontFamily: 'GeistMono_400Regular',
    fontSize: 14,
  },
  btn: {
    backgroundColor: '#e8410a',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginBottom: 16,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 14,
    color: '#ffffff',
  },
  toggle: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 12,
    color: '#5a5754',
    textAlign: 'center',
    marginTop: 16,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#2a2826',
  },
  dividerText: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 11,
    color: '#5a5754',
    marginHorizontal: 12,
  },
  googleBtn: {
    backgroundColor: '#161614',
    borderWidth: 1,
    borderColor: '#2a2826',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginBottom: 4,
  },
  googleBtnText: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 14,
    color: '#f0ede8',
  },
  kakaoBtn: {
    backgroundColor: '#FEE500',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginBottom: 4,
  },
  kakaoBtnText: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 14,
    color: '#000000',
  },
});