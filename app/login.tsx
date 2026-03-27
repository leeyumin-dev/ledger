import { useState } from 'react';
import {
  View, Text, TextInput,
  TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, Alert
} from 'react-native';
import { supabase } from '../src/lib/supabase';

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
  },
});