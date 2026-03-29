import { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '../src/lib/supabase';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [sleepHours, setSleepHours] = useState('7.5');
  const [workHours, setWorkHours] = useState('8.0');
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    setEmail(user.email ?? '');

    const { data } = await supabase
      .from('user_settings')
      .select('sleep_hours, work_hours, nickname')
      .eq('user_id', user.id)
      .single();

    if (data) {
      setSleepHours(String(data.sleep_hours));
      setWorkHours(String(data.work_hours));
      setNickname(data.nickname ?? '');
    }
  }

  async function saveProfile() {
    if (!userId) return;
    setLoading(true);

    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id: userId,
        sleep_hours: parseFloat(sleepHours),
        work_hours: parseFloat(workHours),
        nickname: nickname.trim(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) Alert.alert('오류', '저장에 실패했어요.');
    else Alert.alert('저장 완료', '프로필이 저장됐어요.');

    setLoading(false);
  }

  async function handleLogout() {
    Alert.alert('로그아웃', '정말 로그아웃할까요?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: () => supabase.auth.signOut(),
      },
    ]);
  }

  const disposableHours = 24 - parseFloat(sleepHours || '0') - parseFloat(workHours || '0');

  return (
    <View style={{ flex: 1, backgroundColor: '#0f0f0f' }}>
      {/* 헤더 */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backIcon}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>프로필 & 설정</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>

        {/* 계정 정보 */}
        <Text style={styles.sectionLabel}>계정</Text>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>이메일</Text>
            <Text style={styles.infoValue} numberOfLines={1}>{email}</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>닉네임</Text>
            <TextInput
              style={styles.nicknameInput}
              value={nickname}
              onChangeText={setNickname}
              placeholder="닉네임 입력"
              placeholderTextColor="#5a5754"
              maxLength={20}
            />
          </View>
        </View>
        <Text style={styles.infoHint}>닉네임은 월간 결산 보고서 제목에 표시됩니다</Text>

        <View style={styles.thickDivider} />

        {/* 시간 설정 */}
        <Text style={styles.sectionLabel}>시간 설정</Text>

        <View style={styles.inputRow}>
          <View style={styles.inputLeft}>
            <Text style={styles.inputLabel}>수면 시간</Text>
            <Text style={styles.inputSub}>가처분 시간 계산에 사용</Text>
          </View>
          <View style={styles.inputRight}>
            <TextInput
              style={styles.input}
              value={sleepHours}
              onChangeText={setSleepHours}
              keyboardType="decimal-pad"
              placeholder="7.5"
              placeholderTextColor="#5a5754"
            />
            <Text style={styles.inputUnit}>시간</Text>
          </View>
        </View>

        <View style={styles.thinDivider} />

        <View style={styles.inputRow}>
          <View style={styles.inputLeft}>
            <Text style={styles.inputLabel}>업무 시간</Text>
            <Text style={styles.inputSub}>평일 기준</Text>
          </View>
          <View style={styles.inputRight}>
            <TextInput
              style={styles.input}
              value={workHours}
              onChangeText={setWorkHours}
              keyboardType="decimal-pad"
              placeholder="8.0"
              placeholderTextColor="#5a5754"
            />
            <Text style={styles.inputUnit}>시간</Text>
          </View>
        </View>

        {/* 가처분 시간 계산 결과 */}
        <View style={styles.resultBox}>
          <Text style={styles.resultLabel}>하루 가처분 시간</Text>
          <Text style={styles.resultValue}>
            {isNaN(disposableHours) ? '—' : `${disposableHours.toFixed(1)}h`}
          </Text>
          <Text style={styles.resultSub}>24h － 수면 {sleepHours}h － 업무 {workHours}h</Text>
        </View>

        <View style={styles.thickDivider} />

        {/* 앱 관리 */}
        <Text style={styles.sectionLabel}>앱 관리</Text>
        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => router.push('/category-settings')}
        >
          <Text style={styles.navBtnText}>앱 카테고리 분류</Text>
          <Text style={styles.navBtnArrow}>›</Text>
        </TouchableOpacity>

        {/* 저장 버튼 */}
        <TouchableOpacity
          style={[styles.saveBtn, loading && styles.saveBtnDisabled]}
          onPress={saveProfile}
          disabled={loading}
        >
          <Text style={styles.saveBtnText}>
            {loading ? '저장 중...' : '저장하기'}
          </Text>
        </TouchableOpacity>

        <View style={styles.thickDivider} />

        {/* 로그아웃 */}
        <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
          <Text style={styles.logoutText}>로그아웃</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 28,
    color: '#f0ede8',
    lineHeight: 32,
  },
  headerTitle: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 15,
    color: '#f0ede8',
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },
  sectionLabel: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 10,
    color: '#5a5754',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  infoCard: {
    backgroundColor: '#161614',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2826',
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  infoLabel: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 12,
    color: '#5a5754',
    width: 64,
  },
  infoValue: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 13,
    color: 'rgba(255,255,255,0.4)',
    flex: 1,
    textAlign: 'right',
  },
  nicknameInput: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 14,
    color: '#f0ede8',
    flex: 1,
    textAlign: 'right',
    padding: 0,
  },
  divider: {
    height: 0.5,
    backgroundColor: '#2a2826',
    marginHorizontal: 16,
  },
  infoHint: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 10,
    color: '#5a5754',
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  thickDivider: {
    height: 1.5,
    backgroundColor: '#3a3836',
    marginVertical: 20,
  },
  thinDivider: {
    height: 0.5,
    backgroundColor: '#2a2826',
    marginVertical: 4,
  },
  inputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
  },
  inputLeft: { flex: 1 },
  inputLabel: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 13,
    color: '#f0ede8',
    marginBottom: 3,
  },
  inputSub: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 10,
    color: '#5a5754',
  },
  inputRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  input: {
    backgroundColor: '#161614',
    borderWidth: 1,
    borderColor: '#2a2826',
    borderRadius: 8,
    padding: 10,
    width: 64,
    color: '#f0ede8',
    fontFamily: 'GeistMono_500Medium',
    fontSize: 14,
    textAlign: 'center',
  },
  inputUnit: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 12,
    color: '#5a5754',
  },
  resultBox: {
    backgroundColor: '#161614',
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 4,
  },
  resultLabel: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 10,
    color: '#5a5754',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  resultValue: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 36,
    color: '#f0ede8',
    marginBottom: 6,
  },
  resultSub: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 10,
    color: '#5a5754',
  },
  navBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#161614',
    borderRadius: 10,
    padding: 16,
    marginBottom: 16,
  },
  navBtnText: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 13,
    color: '#f0ede8',
  },
  navBtnArrow: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 18,
    color: '#5a5754',
  },
  saveBtn: {
    backgroundColor: '#e8410a',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 14,
    color: '#ffffff',
  },
  logoutBtn: {
    padding: 16,
    alignItems: 'center',
  },
  logoutText: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 13,
    color: '#5a5754',
  },
});
