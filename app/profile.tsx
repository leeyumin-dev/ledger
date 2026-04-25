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
import { colors, font, fontSize, spacing, radius } from '../src/lib/theme';

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
  const [orphanedApps, setOrphanedApps] = useState<string[]>([]);  // Supabase에는 있지만 로컬 토큰 없는 앱

  // 이름 입력 (앱 추가 / 재선택 시 필수)
  const [pendingTokenKeys, setPendingTokenKeys] = useState<string[]>([]);
  const [nameInputs, setNameInputs] = useState<Record<string, string>>({});
  const [savingNames, setSavingNames] = useState(false);
  const [reselecting, setReselecting] = useState<string | null>(null);

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
    const [status, map] = await Promise.all([
      getMonitoringStatus(),
      getNameMap(),
    ]);
    const keys = status?.appList ?? [];
    setTrackedApps(keys);
    setNameMapState(map);

    // Supabase에 있지만 로컬 토큰 없는 앱 = 재선택 필요
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase
        .from('app_categories')
        .select('app_name')
        .eq('user_id', user.id);
      const localNames = new Set(keys.map(k => map[k]).filter(Boolean));
      setOrphanedApps(
        (data ?? []).map(d => d.app_name).filter(n => !localNames.has(n))
      );
    }

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

  // 재선택 필요 앱 → picker → 기존 이름 자동 채움
  async function handleReselect(appName: string) {
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

    if (newKeys.length === 0) {
      Alert.alert('이미 추가됨', '선택한 앱이 이미 추적 중이에요.');
      return;
    }

    // 기존 이름으로 자동 채움 (첫 번째 키에만)
    const prefill: Record<string, string> = {};
    prefill[newKeys[0]] = appName;
    setNameInputs(prefill);
    setReselecting(appName);
    setPendingTokenKeys(newKeys);
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

    if (newKeys.length === 0) {
      // 선택한 앱이 전부 이미 추적 중인 경우
      Alert.alert('이미 추가됨', '선택한 앱이 이미 추적 중이에요.');
      return;
    }
    setNameInputs({});
    setPendingTokenKeys(newKeys);
  }

  async function cancelNameInput() {
    for (const key of pendingTokenKeys) {
      await removeAppToken(key);
    }
    setPendingTokenKeys([]);
    setNameInputs({});
    setReselecting(null);
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
      if (reselecting) {
        setOrphanedApps(prev => prev.filter(n => n !== reselecting));
        setReselecting(null);
      }
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
    <View style={{ flex: 1, backgroundColor: colors.bgBase }}>
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
              placeholderTextColor={colors.textMuted}
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
              placeholderTextColor={colors.textMuted}
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
              placeholderTextColor={colors.textMuted}
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
        onRequestClose={pendingTokenKeys.length > 0 ? cancelNameInput : () => setAppPickerVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: colors.bgBase }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.modalHeader}>
            {pendingTokenKeys.length > 0 ? (
              <TouchableOpacity onPress={cancelNameInput}>
                <Text style={styles.modalDone}>취소</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ width: 40 }} />
            )}
            <Text style={styles.modalTitle}>
              {pendingTokenKeys.length > 0 ? '앱 이름 입력' : '추적 앱 관리'}
            </Text>
            {pendingTokenKeys.length > 0 ? (
              <View style={{ width: 40 }} />
            ) : (
              <TouchableOpacity onPress={() => setAppPickerVisible(false)}>
                <Text style={styles.modalDone}>닫기</Text>
              </TouchableOpacity>
            )}
          </View>

          {pendingTokenKeys.length > 0 ? (
            <>
              <Text style={styles.nicknameModalHint}>
                앱 이름을 직접 입력해주세요{'\n'}
                <Text style={{ color: colors.textMuted }}>예: 유튜브, 인스타그램</Text>
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
                      placeholderTextColor={colors.textDisabled}
                      value={nameInputs[key] ?? ''}
                      onChangeText={text => setNameInputs(prev => ({ ...prev, [key]: text }))}
                      maxLength={20}
                      returnKeyType={i < pendingTokenKeys.length - 1 ? 'next' : 'done'}
                      autoFocus={i === 0}
                    />
                  </View>
                ))}
                <TouchableOpacity
                  style={[styles.nicknameSaveBtn, savingNames && { opacity: 0.5 }, { marginTop: 24 }]}
                  onPress={saveNames}
                  disabled={savingNames}
                >
                  <Text style={styles.nicknameSaveText}>
                    {savingNames ? '저장 중...' : '저장하기'}
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </>
          ) : (
            <ScrollView contentContainerStyle={styles.modalContent}>
              {trackedApps.length === 0 && orphanedApps.length === 0 ? (
                <Text style={styles.emptyText}>추적 중인 앱이 없어요</Text>
              ) : (
                <>
                  {trackedApps.length > 0 && (
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
                  {orphanedApps.length > 0 && (
                    <>
                      <Text style={styles.orphanedLabel}>재선택 필요</Text>
                      <View style={styles.trackedList}>
                        {orphanedApps.map((name, i) => (
                          <View
                            key={name}
                            style={[styles.trackedRow, i < orphanedApps.length - 1 && styles.trackedRowBorder]}
                          >
                            <Text style={[styles.trackedName, { color: colors.textMuted }]}>{name}</Text>
                            <TouchableOpacity
                              onPress={() => handleReselect(name)}
                              disabled={picking}
                              style={styles.reselectBtn}
                            >
                              <Text style={styles.reselectBtnText}>재선택</Text>
                            </TouchableOpacity>
                          </View>
                        ))}
                      </View>
                    </>
                  )}
                </>
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
          )}
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
    paddingBottom: spacing.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.borderSub,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backIcon: {
    fontSize: 28,
    color: colors.textPrimary,
    lineHeight: 32,
  },
  headerTitle: {
    fontFamily: font.medium,
    fontSize: 15,
    color: colors.textPrimary,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  sectionLabel: {
    fontFamily: font.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  infoCard: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
  },
  infoLabel: {
    fontFamily: font.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
    width: 64,
  },
  infoValue: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.textDisabled,
    flex: 1,
    textAlign: 'right',
  },
  nicknameInput: {
    fontFamily: font.medium,
    fontSize: fontSize.md,
    color: colors.textPrimary,
    flex: 1,
    textAlign: 'right',
    padding: 0,
  },
  divider: {
    height: 0.5,
    backgroundColor: colors.border,
    marginHorizontal: spacing.md,
  },
  infoHint: {
    fontFamily: font.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: spacing.sm,
    marginBottom: 4,
    paddingHorizontal: 4,
  },
  thickDivider: {
    height: 1.5,
    backgroundColor: colors.textDisabled,
    marginVertical: 20,
  },
  thinDivider: {
    height: 0.5,
    backgroundColor: colors.border,
    marginVertical: 4,
  },
  inputRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  inputLeft: { flex: 1 },
  inputLabel: {
    fontFamily: font.medium,
    fontSize: 13,
    color: colors.textPrimary,
    marginBottom: 3,
  },
  inputSub: {
    fontFamily: font.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  inputRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  input: {
    backgroundColor: colors.bgSurface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: 10,
    width: 64,
    color: colors.textPrimary,
    fontFamily: font.medium,
    fontSize: fontSize.md,
    textAlign: 'center',
  },
  inputUnit: {
    fontFamily: font.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  resultBox: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.md,
    padding: 20,
    alignItems: 'center',
    marginTop: spacing.sm,
    marginBottom: 4,
  },
  resultLabel: {
    fontFamily: font.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  resultValue: {
    fontFamily: font.medium,
    fontSize: 36,
    color: colors.textPrimary,
    marginBottom: 6,
  },
  resultSub: {
    fontFamily: font.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },
  permissionBtn: {
    backgroundColor: colors.bgRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: 14,
    paddingVertical: spacing.sm,
  },
  permissionBtnActive: {
    backgroundColor: 'rgba(57,255,20,0.08)',
    borderColor: 'rgba(57,255,20,0.3)',
  },
  permissionBtnText: {
    fontFamily: font.regular,
    fontSize: fontSize.sm,
    color: colors.textMuted,
  },
  permissionBtnTextActive: {
    color: '#39FF14',
  },
  navBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.bgSurface,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  navBtnText: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.textPrimary,
  },
  navBtnArrow: {
    fontFamily: font.regular,
    fontSize: 18,
    color: colors.textMuted,
  },
  saveBtn: {
    backgroundColor: colors.accent,
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveBtnText: {
    fontFamily: font.medium,
    fontSize: fontSize.md,
    color: '#ffffff',
  },
  logoutBtn: {
    padding: spacing.md,
    alignItems: 'center',
  },
  logoutText: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.textMuted,
  },
  // 모달
  modalContainer: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: spacing.md,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  modalTitle: {
    fontFamily: font.medium,
    fontSize: 15,
    color: colors.textPrimary,
  },
  modalDone: {
    fontFamily: font.medium,
    fontSize: fontSize.md,
    color: colors.accent,
  },
  modalEdit: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.textMuted,
  },
  modalEditActive: {
    color: colors.accent,
  },
  pickingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgRaised,
    borderRadius: radius.sm,
    marginHorizontal: 20,
    marginTop: spacing.sm,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  pickingBannerText: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.textPrimary,
  },
  modalContent: {
    paddingHorizontal: 20,
    paddingTop: spacing.lg,
  },
  modalSectionLabel: {
    fontFamily: font.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.textDisabled,
    paddingVertical: 20,
    textAlign: 'center',
  },
  trackedList: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    marginBottom: 20,
  },
  trackedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    minHeight: 52,
  },
  trackedName: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.textPrimary,
    flex: 1,
  },
  trackedRowBorder: {
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  removeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: spacing.sm,
  },
  removeBtnText: {
    fontFamily: font.regular,
    fontSize: fontSize.md,
    color: colors.textMuted,
  },
  orphanedLabel: {
    fontFamily: font.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
    marginTop: 20,
    marginBottom: spacing.sm,
    paddingHorizontal: 4,
  },
  reselectBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginLeft: spacing.sm,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  reselectBtnText: {
    fontFamily: font.regular,
    fontSize: fontSize.sm,
    color: colors.accent,
  },
  addBtn: {
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  addBtnText: {
    fontFamily: font.regular,
    fontSize: fontSize.md,
    color: colors.textPrimary,
  },

  inlineNicknameInput: {
    fontFamily: font.regular,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    padding: 0,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
    paddingBottom: 2,
  },
  inlineNicknameLabel: {
    fontFamily: font.regular,
    fontSize: fontSize.xs,
    color: colors.textMuted,
  },

  // 별명 입력 모달
  nicknameModalHint: {
    fontFamily: font.regular,
    fontSize: fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 18,
    paddingHorizontal: spacing.lg,
    paddingBottom: 20,
  },
  nicknameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.border,
  },
  nicknameRowInput: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.textPrimary,
    flex: 1,
    textAlign: 'right',
    padding: 0,
  },
  nicknameSkipBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
  },
  nicknameSkipText: {
    fontFamily: font.regular,
    fontSize: 13,
    color: colors.textMuted,
  },
  nicknameSaveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.textPrimary,
    alignItems: 'center',
  },
  nicknameSaveText: {
    fontFamily: font.medium,
    fontSize: 13,
    color: colors.bgBase,
  },
});
