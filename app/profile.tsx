import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, Platform, AppState, Modal,
  KeyboardAvoidingView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import {
  hasPermission, requestPermission,
  presentPickerForToken, confirmPendingTokenAuto,
  removeAppToken, startMonitoring,
  getMonitoringStatus, setNameMap, getNameMap,
} from '../src/lib/screenTime';
import { AppTokenLabel } from '../src/components/AppTokenLabel';

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [sleepHours, setSleepHours] = useState('7.5');
  const [workHours, setWorkHours] = useState('8.0');
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [screenTimePermission, setScreenTimePermission] = useState(false);

  // 추적 앱 관리 모달
  const [appPickerVisible, setAppPickerVisible] = useState(false);
  const [trackedApps, setTrackedApps] = useState<string[]>([]);  // token keys
  const [nameMap, setNameMapState] = useState<Record<string, string>>({});
  const [picking, setPicking] = useState(false);

  // 이름 입력 모달 (앱 추가 시 필수)
  const [pendingTokenKeys, setPendingTokenKeys] = useState<string[]>([]);
  const [nameInputs, setNameInputs] = useState<Record<string, string>>({});
  const [savingNames, setSavingNames] = useState(false);

  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    loadProfile();
    const timer = setTimeout(refreshPermission, 300);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (
        appStateRef.current.match(/inactive|background/) &&
        nextState === 'active'
      ) {
        refreshPermission();
      }
      appStateRef.current = nextState;
    });
    return () => sub.remove();
  }, []);

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUserId(user.id);
    setEmail(user.email ?? '');

    const [settingsRes, permitted] = await Promise.all([
      supabase
        .from('user_settings')
        .select('sleep_hours, work_hours, nickname')
        .eq('user_id', user.id)
        .single(),
      hasPermission(),
    ]);

    if (settingsRes.data) {
      setSleepHours(String(settingsRes.data.sleep_hours));
      setWorkHours(String(settingsRes.data.work_hours));
      setNickname(settingsRes.data.nickname ?? '');
    }

    setScreenTimePermission(permitted);
  }

  async function refreshPermission() {
    const permitted = await hasPermission();
    setScreenTimePermission(permitted);
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

  async function handleScreenTimePermission() {
    if (screenTimePermission) {
      Alert.alert(
        '스크린타임 권한',
        '이미 허용되어 있어요. 권한을 변경하려면 iPhone 설정 → 스크린 타임에서 변경해요.',
        [{ text: '확인' }]
      );
      return;
    }
    const result = await requestPermission();
    setScreenTimePermission(result);
  }

  // 추적 앱 관리 모달 열기
  async function handleOpenAppPicker() {
    const status = await getMonitoringStatus();
    const keys = status?.appList ?? [];
    setTrackedApps(keys);
    const map = await getNameMap();
    setNameMapState(map);
    setAppPickerVisible(true);
  }

  // 추적 중인 앱 제거
  async function handleRemoveApp(key: string) {
    const displayName = nameMap[key] ?? key;
    Alert.alert(
      '추적 중지',
      `'${displayName}' 추적을 중지할까요?\n\n과거 손익계산서에서 이 앱의 기록이 더 이상 표시되지 않아요.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '중지',
          style: 'destructive',
          onPress: async () => {
            await removeAppToken(key);
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              await supabase
                .from('app_categories')
                .delete()
                .eq('user_id', user.id)
                .eq('app_name', displayName);
            }
            const remaining = trackedApps.filter(a => a !== key);
            setTrackedApps(remaining);
            if (remaining.length > 0) await startMonitoring();
          },
        },
      ]
    );
  }

  // "앱 추가" → picker → 이름 입력 (필수)
  async function handleAddApp() {
    setPicking(true);
    const result = await presentPickerForToken();
    setPicking(false);
    if (result === 'cancelled') return;
    if (result === 'category_only') {
      Alert.alert('개별 앱을 선택해주세요', '카테고리를 펼쳐서 추적할 앱을 개별로 선택해주세요.');
      return;
    }

    const newKeys: string[] = [];
    for (let i = 0; i < result.count; i++) {
      const newKey = await confirmPendingTokenAuto(i);
      if (newKey) newKeys.push(newKey);
    }

    if (newKeys.length === 0) return;
    setNameInputs({});
    setPendingTokenKeys(newKeys);
  }

  async function saveNames() {
    for (const key of pendingTokenKeys) {
      if (!nameInputs[key]?.trim()) {
        Alert.alert('이름 필요', '모든 앱의 이름을 입력해주세요.');
        return;
      }
    }
    const newNames = pendingTokenKeys.map(k => nameInputs[k].trim());
    const existingNames = trackedApps.map(k => nameMap[k] ?? k);
    const duplicate = newNames.find(n => existingNames.includes(n));
    if (duplicate) {
      Alert.alert('중복', `'${duplicate}'는 이미 추가된 앱이에요.`);
      return;
    }

    setSavingNames(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const newNameMap: Record<string, string> = {};
      pendingTokenKeys.forEach(k => { newNameMap[k] = nameInputs[k].trim(); });

      if (user) {
        await supabase.from('app_categories').upsert(
          pendingTokenKeys.map(key => ({
            user_id: user.id,
            app_name: newNameMap[key],
            bundle_id: '',
            category: '소비',
            budget_minutes: 0,
            goal_minutes: 0,
          })),
          { onConflict: 'user_id,app_name' }
        );
      }
      await setNameMap(newNameMap);
      setNameMapState(prev => ({ ...prev, ...newNameMap }));
      setTrackedApps(prev => {
        const next = [...prev];
        pendingTokenKeys.forEach(k => { if (!next.includes(k)) next.push(k); });
        return next;
      });
      await startMonitoring();
    } finally {
      setSavingNames(false);
      setPendingTokenKeys([]);
    }
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

        {/* 계정 */}
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

        <View style={styles.resultBox}>
          <Text style={styles.resultLabel}>하루 가처분 시간</Text>
          <Text style={styles.resultValue}>
            {isNaN(disposableHours) ? '—' : `${disposableHours.toFixed(1)}h`}
          </Text>
          <Text style={styles.resultSub}>
            24h － 수면 {sleepHours}h － 업무 {workHours}h
          </Text>
        </View>

        <View style={styles.thickDivider} />

        {/* 스크린타임 */}
        {Platform.OS === 'ios' && (
          <>
            <Text style={styles.sectionLabel}>스크린타임</Text>
            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>자동 사용량 측정</Text>
                  <Text style={styles.inputSub}>
                    {screenTimePermission
                      ? '앱 사용 시간이 자동으로 기록돼요'
                      : '허용하면 앱 사용 시간을 자동으로 기록해요'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={[
                    styles.permissionBtn,
                    screenTimePermission && styles.permissionBtnActive,
                  ]}
                  onPress={handleScreenTimePermission}
                >
                  <Text style={[
                    styles.permissionBtnText,
                    screenTimePermission && styles.permissionBtnTextActive,
                  ]}>
                    {screenTimePermission ? '허용됨' : '허용하기'}
                  </Text>
                </TouchableOpacity>
              </View>
              {screenTimePermission && (
                <>
                  <View style={styles.divider} />
                  <TouchableOpacity style={styles.infoRow} onPress={handleOpenAppPicker}>
                    <Text style={styles.inputLabel}>추적 앱 변경</Text>
                    <Text style={styles.inputSub}>{'>'}</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
            <View style={styles.thickDivider} />
          </>
        )}

        {/* 앱 관리 */}
        <Text style={styles.sectionLabel}>앱 관리</Text>
        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => router.push('/category-settings')}
        >
          <Text style={styles.navBtnText}>소비 · 투자 설정</Text>
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

      {/* 추적 앱 관리 모달 */}
      <Modal
        visible={appPickerVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setAppPickerVisible(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <View style={{ width: 40 }} />
            <Text style={styles.modalTitle}>추적 앱 관리</Text>
            <TouchableOpacity onPress={() => setAppPickerVisible(false)}>
              <Text style={styles.modalDone}>닫기</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.modalContent}>
            {trackedApps.length === 0 ? (
              <Text style={styles.emptyText}>추적 중인 앱이 없어요</Text>
            ) : (
              <View style={styles.trackedList}>
                {trackedApps.map((key, i) => (
                  <View
                    key={key}
                    style={[styles.trackedRow, i < trackedApps.length - 1 && styles.trackedRowBorder]}
                  >
                    <Text style={styles.trackedName}>{nameMap[key] ?? key}</Text>
                    <TouchableOpacity
                      onPress={() => handleRemoveApp(key)}
                      disabled={picking}
                      style={styles.removeBtn}
                    >
                      <Text style={styles.removeBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}

            <TouchableOpacity
              style={[styles.addBtn, picking && { opacity: 0.4 }]}
              onPress={handleAddApp}
              disabled={picking}
            >
              <Text style={styles.addBtnText}>+ 앱 추가</Text>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </Modal>

      {/* 앱 이름 입력 모달 (필수) */}
      <Modal
        visible={pendingTokenKeys.length > 0}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => {}}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: '#0f0f0f' }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalHeader}>
            <View style={{ width: 40 }} />
            <Text style={styles.modalTitle}>앱 이름 입력</Text>
            <View style={{ width: 40 }} />
          </View>

          <Text style={styles.nicknameModalHint}>
            앱 이름을 직접 입력해주세요{'\n'}
            <Text style={{ color: '#5a5754' }}>예: 유튜브, 인스타그램</Text>
          </Text>

          <ScrollView contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 32 }}>
            {pendingTokenKeys.map((key, i) => (
              <View key={key} style={styles.nicknameRow}>
                <AppTokenLabel
                  tokenKey={key}
                  fontSize={18}
                  iconOnly
                  style={{ width: 30, height: 30, marginRight: 12 }}
                />
                <TextInput
                  style={[styles.nicknameRowInput, { flex: 1 }]}
                  placeholder="앱 이름 입력 (필수)"
                  placeholderTextColor="#3a3836"
                  value={nameInputs[key] ?? ''}
                  onChangeText={text => setNameInputs(prev => ({ ...prev, [key]: text }))}
                  maxLength={20}
                  returnKeyType={i < pendingTokenKeys.length - 1 ? 'next' : 'done'}
                  autoFocus={i === 0}
                />
              </View>
            ))}
          </ScrollView>

          <View style={styles.nicknameModalActions}>
            <TouchableOpacity
              style={[styles.nicknameSaveBtn, savingNames && { opacity: 0.5 }]}
              onPress={saveNames}
              disabled={savingNames}
            >
              <Text style={styles.nicknameSaveText}>
                {savingNames ? '저장 중...' : '저장하기'}
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  permissionBtn: {
    backgroundColor: '#1c1c1a',
    borderWidth: 1,
    borderColor: '#2a2826',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  permissionBtnActive: {
    backgroundColor: 'rgba(57,255,20,0.08)',
    borderColor: 'rgba(57,255,20,0.3)',
  },
  permissionBtnText: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 12,
    color: '#5a5754',
  },
  permissionBtnTextActive: {
    color: '#39FF14',
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
  // 모달
  modalContainer: {
    flex: 1,
    backgroundColor: '#0f0f0f',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2a2826',
  },
  modalTitle: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 15,
    color: '#f0ede8',
  },
  modalDone: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 14,
    color: '#e8410a',
  },
  modalEdit: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 13,
    color: '#5a5754',
  },
  modalEditActive: {
    color: '#e8410a',
  },
  pickingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1c1c1a',
    borderRadius: 8,
    marginHorizontal: 20,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  pickingBannerText: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 13,
    color: '#f0ede8',
  },
  modalContent: {
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  modalSectionLabel: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 10,
    color: '#5a5754',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  emptyText: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 13,
    color: '#3a3836',
    paddingVertical: 20,
    textAlign: 'center',
  },
  trackedList: {
    backgroundColor: '#161614',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2826',
    overflow: 'hidden',
    marginBottom: 20,
  },
  trackedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  trackedName: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 13,
    color: '#f0ede8',
    flex: 1,
  },
  trackedRowBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: '#2a2826',
  },
  removeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: 12,
  },
  removeBtnText: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 14,
    color: '#5a5754',
  },
  addBtn: {
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2826',
    alignItems: 'center',
  },
  addBtnText: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 14,
    color: '#f0ede8',
  },

  inlineNicknameInput: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 11,
    color: '#9a9690',
    padding: 0,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2a2826',
    paddingBottom: 2,
  },
  inlineNicknameLabel: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 11,
    color: '#5a5754',
  },

  // 별명 입력 모달
  nicknameModalHint: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 11,
    color: '#9a9690',
    lineHeight: 18,
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  nicknameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: '#2a2826',
  },
  nicknameRowInput: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 13,
    color: '#f0ede8',
    flex: 1,
    textAlign: 'right',
    padding: 0,
  },
  nicknameModalActions: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 24,
    paddingVertical: 20,
    borderTopWidth: 0.5,
    borderTopColor: '#2a2826',
  },
  nicknameSkipBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2826',
    alignItems: 'center',
  },
  nicknameSkipText: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 13,
    color: '#5a5754',
  },
  nicknameSaveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: '#f0ede8',
    alignItems: 'center',
  },
  nicknameSaveText: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 13,
    color: '#0f0f0f',
  },
});
