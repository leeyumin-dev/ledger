import { useState, useRef, useEffect, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, ScrollView, Alert, Platform, AppState, Modal,
  KeyboardAvoidingView, Dimensions, ActivityIndicator
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import {
  hasPermission, requestPermission,
  presentPickerForToken, confirmPendingTokenAuto,
  removeAppToken, startMonitoring,
  getMonitoringStatus, setNameMap, getNameMap,
} from '../src/lib/screenTime';
import { AppTokenLabel } from '../src/components/AppTokenLabel';
import { colors, font, fontSize, spacing, radius } from '../src/lib/theme';

const { width } = Dimensions.get('window');

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const view = params.view as 'account' | 'time' | 'sensor';

  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [sleepHours, setSleepHours] = useState('7.5');
  const [workHours, setWorkHours] = useState('8.0');
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [screenTimePermission, setScreenTimePermission] = useState(false);

  // 추적 앱 관리
  const [appPickerVisible, setAppPickerVisible] = useState(false);
  const [trackedApps, setTrackedApps] = useState<string[]>([]);
  const [nameMap, setNameMapState] = useState<Record<string, string>>({});
  const [orphanedApps, setOrphanedApps] = useState<string[]>([]);

  // 이름 입력
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
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
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

    const [settingsRes, permitted, monitorStatus, map] = await Promise.all([
      supabase.from('user_settings').select('sleep_hours, work_hours, nickname').eq('user_id', user.id).single(),
      hasPermission(),
      getMonitoringStatus(),
      getNameMap(),
    ]);

    if (settingsRes.data) {
      setSleepHours(String(settingsRes.data.sleep_hours || '7.5'));
      setWorkHours(String(settingsRes.data.work_hours || '8.0'));
      setNickname(settingsRes.data.nickname ?? '');
    }
    setScreenTimePermission(permitted);
    setTrackedApps(monitorStatus?.appList ?? []);
    setNameMapState(map);
    setReady(true);
  }

  async function refreshPermission() {
    const permitted = await hasPermission();
    setScreenTimePermission(permitted);
  }

  async function saveProfile() {
    if (!userId) return;
    setLoading(true);
    const { error } = await supabase.from('user_settings').upsert({
        user_id: userId,
        sleep_hours: parseFloat(sleepHours),
        work_hours: parseFloat(workHours),
        nickname: nickname.trim(),
        updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

    if (error) Alert.alert('오류', '저장에 실패했어요.');
    else {
      Alert.alert('저장 완료', '설정이 성공적으로 반영되었습니다.');
      router.back();
    }
    setLoading(false);
  }

  async function handleScreenTimePermission() {
    if (screenTimePermission) {
      Alert.alert('스크린타임 권한', '이미 허용되어 있습니다.');
      return;
    }
    const result = await requestPermission();
    setScreenTimePermission(result);
  }

  async function handleOpenAppPicker() {
    const [status, map] = await Promise.all([getMonitoringStatus(), getNameMap()]);
    const keys = status?.appList ?? [];
    setTrackedApps(keys);
    setNameMapState(map);
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data } = await supabase.from('app_categories').select('app_name').eq('user_id', user.id);
      const localNames = new Set(keys.map(k => map[k]).filter(Boolean));
      setOrphanedApps((data ?? []).map(d => d.app_name).filter(n => !localNames.has(n)));
    }
    setAppPickerVisible(true);
  }

  async function handleRemoveApp(key: string) {
    const displayName = nameMap[key] ?? key;
    Alert.alert('추적 중지', `'${displayName}' 추적을 중지할까요?`, [
        { text: '취소', style: 'cancel' },
        { text: '중지', style: 'destructive', onPress: async () => {
            await removeAppToken(key);
            const { data: { user } } = await supabase.auth.getUser();
            if (user) await supabase.from('app_categories').delete().eq('user_id', user.id).eq('app_name', displayName);
            setTrackedApps(prev => prev.filter(a => a !== key));
            if (trackedApps.length > 1) await startMonitoring();
        }}
    ]);
  }

  async function handleAddApp() {
    const result = await presentPickerForToken();
    if (result === 'cancelled') return;
    const newKeys: string[] = [];
    for (let i = 0; i < result.count; i++) {
      const newKey = await confirmPendingTokenAuto(i);
      if (newKey) newKeys.push(newKey);
    }
    if (newKeys.length === 0) return;
    setNameInputs({});
    setPendingTokenKeys(newKeys);
  }

  async function handleReselect(appName: string) {
    const result = await presentPickerForToken();
    if (result === 'cancelled') return;
    const newKeys: string[] = [];
    for (let i = 0; i < result.count; i++) {
      const newKey = await confirmPendingTokenAuto(i);
      if (newKey) newKeys.push(newKey);
    }
    if (newKeys.length === 0) return;
    const prefill: Record<string, string> = {};
    prefill[newKeys[0]] = appName;
    setNameInputs(prefill);
    setReselecting(appName);
    setPendingTokenKeys(newKeys);
  }

  async function saveNames() {
    for (const key of pendingTokenKeys) {
      if (!nameInputs[key]?.trim()) {
        Alert.alert('이름 필요', '앱 이름을 입력해주세요.');
        return;
      }
    }
    setSavingNames(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const newNameMap: Record<string, string> = {};
      pendingTokenKeys.forEach(k => { newNameMap[k] = nameInputs[k].trim(); });
      if (user) {
        await supabase.from('app_categories').upsert(
          pendingTokenKeys.map(key => ({
            user_id: user.id, app_name: newNameMap[key], bundle_id: '', category: '소비', budget_minutes: 0, goal_minutes: 0,
          })), { onConflict: 'user_id,app_name' }
        );
      }
      await setNameMap(newNameMap);
      setNameMapState(prev => ({ ...prev, ...newNameMap }));
      setTrackedApps(prev => [...new Set([...prev, ...pendingTokenKeys])]);
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

  const disposableHours = 24 - parseFloat(sleepHours || '0') - parseFloat(workHours || '0');

  const viewConfig = useMemo(() => {
    if (view === 'account') return { title: '계정 정보', btn: '정보 저장하기' };
    if (view === 'time') return { title: '기초 자산 설정', btn: '목표 저장하기' };
    if (view === 'sensor') return { title: '스크린타임 연동', btn: '설정 완료' };
    return { title: '설정', btn: '저장하기' };
  }, [view]);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}><Text style={styles.backIcon}>‹</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>{viewConfig.title}</Text>
        <View style={{ width: 40 }} />
      </View>

      {!ready && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.textDisabled} />
        </View>
      )}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} style={{ display: ready ? 'flex' : 'none' }}>
        
        {/* 1. Account Section */}
        {view === 'account' && (
          <View key="account-view">
            <View style={styles.glassCard}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>닉네임</Text>
                <TextInput style={[styles.nicknameInput, { color: colors.accent }]} value={nickname} onChangeText={setNickname} placeholder="이름 입력" placeholderTextColor={colors.textDisabled} maxLength={20} />
              </View>
              <View style={styles.divider} />
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>계정 이메일</Text>
                <Text style={[styles.infoValue, { color: colors.textMuted }]}>{email}</Text>
              </View>
            </View>
          </View>
        )}

        {/* 2. Time Targets Section */}
        {view === 'time' && (
          <View key="time-view">
            <View style={styles.glassCard}>
              <View style={styles.inputRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputTitle}>기초 수면 시간</Text>
                  <Text style={styles.inputSub}>하루 평균 수면량을 입력하세요</Text>
                </View>
                <View style={styles.glassInputBox}>
                  <TextInput style={styles.glassInput} value={sleepHours} onChangeText={setSleepHours} keyboardType="decimal-pad" />
                  <Text style={styles.unit}>h</Text>
                </View>
              </View>
              <View style={styles.divider} />
              <View style={styles.inputRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputTitle}>고정 업무 시간</Text>
                  <Text style={styles.inputSub}>직장/학업 등 필수 시간을 입력하세요</Text>
                </View>
                <View style={styles.glassInputBox}>
                  <TextInput style={styles.glassInput} value={workHours} onChangeText={setWorkHours} keyboardType="decimal-pad" />
                  <Text style={styles.unit}>h</Text>
                </View>
              </View>
            </View>

            <View style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>DAILY DISPOSABLE TIME</Text>
              <Text style={styles.summaryValue}>{isNaN(disposableHours) ? '—' : `${disposableHours.toFixed(1)}h`}</Text>
              <Text style={styles.summarySub}>24h - {sleepHours}h(수면) - {workHours}h(업무)</Text>
            </View>
          </View>
        )}

        {/* 3. Data Source Section */}
        {view === 'sensor' && (
          <View key="sensor-view">
            <View style={styles.glassCard}>
              <View style={styles.infoRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputTitle}>스크린타임 자동 측정</Text>
                  <Text style={styles.inputSub}>{screenTimePermission ? '정상 작동 중' : '권한 허용 필요'}</Text>
                </View>
                <TouchableOpacity style={[styles.badgeBtn, screenTimePermission && styles.badgeBtnActive]} onPress={handleScreenTimePermission}>
                  <Text style={[styles.badgeText, screenTimePermission && styles.badgeTextActive]}>{screenTimePermission ? 'ACTIVE' : 'OFF'}</Text>
                </TouchableOpacity>
              </View>
              {screenTimePermission && (
                <>
                  <View style={styles.divider} />
                  <TouchableOpacity style={styles.infoRow} onPress={handleOpenAppPicker}>
                    <View>
                        <Text style={styles.inputTitle}>추적 앱 인벤토리 관리</Text>
                        <Text style={styles.inputSub}>현재 {trackedApps.length}개의 자산 연결됨</Text>
                    </View>
                    <Text style={styles.arrow}>›</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>
        )}

        <TouchableOpacity style={[styles.saveBtn, loading && { opacity: 0.5 }]} onPress={saveProfile} disabled={loading}>
          {loading ? <ActivityIndicator color={colors.bgBase} /> : <Text style={styles.saveBtnText}>{viewConfig.btn}</Text>}
        </TouchableOpacity>
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Sensor Modal */}
      <Modal visible={appPickerVisible} animationType="slide" presentationStyle="pageSheet">
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bgBase }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setAppPickerVisible(false)}><Text style={styles.modalClose}>닫기</Text></TouchableOpacity>
            <Text style={styles.modalTitle}>추적 앱 관리</Text>
            <View style={{ width: 40 }} />
          </View>

          {pendingTokenKeys.length > 0 ? (
            <ScrollView contentContainerStyle={{ padding: 24 }}>
                <Text style={styles.modalHint}>연결된 앱의 이름을 설정하세요.</Text>
                {pendingTokenKeys.map((key, i) => (
                  <View key={key} style={styles.nameInputRow}>
                    <AppTokenLabel tokenKey={key} fontSize={18} iconOnly style={{ width: 32, height: 32, marginRight: 12 }} />
                    <TextInput style={styles.nameInput} placeholder="앱 이름 (필수)" placeholderTextColor={colors.textDisabled} value={nameInputs[key] ?? ''} onChangeText={text => setNameInputs(prev => ({ ...prev, [key]: text }))} autoFocus={i === 0} />
                  </View>
                ))}
                <TouchableOpacity style={styles.nameSaveBtn} onPress={saveNames}><Text style={styles.nameSaveText}>자산으로 등록</Text></TouchableOpacity>
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={styles.modalContent}>
              <Text style={styles.sectionLabel}>추적 중 ({trackedApps.length})</Text>
              <View style={styles.glassCard}>
                {trackedApps.length === 0 ? <Text style={styles.emptyText}>추적 중인 앱이 없습니다</Text> : trackedApps.map((key, i) => (
                    <View key={key}>
                        {i > 0 && <View style={styles.divider} />}
                        <View style={styles.sensorRow}>
                            <View style={styles.sensorIcon}>
                                <AppTokenLabel tokenKey={key} iconOnly fontSize={20} style={{ width: 28, height: 28 }} />
                                <View style={styles.liveDot} />
                            </View>
                            <View style={{ flex: 1 }}><Text style={styles.sensorName}>{nameMap[key] ?? key}</Text><Text style={styles.sensorStatus}>LIVE</Text></View>
                            <TouchableOpacity onPress={() => handleRemoveApp(key)} style={styles.removeBtn}><Text style={styles.removeIcon}>✕</Text></TouchableOpacity>
                        </View>
                    </View>
                ))}
              </View>
              {orphanedApps.length > 0 && (
                <View style={{ marginTop: 32 }}>
                    <Text style={[styles.sectionLabel, { color: colors.loss }]}>재연결 필요 ({orphanedApps.length})</Text>
                    <View style={[styles.glassCard, { borderColor: 'rgba(244, 63, 94, 0.2)', backgroundColor: 'rgba(244, 63, 94, 0.02)' }]}>
                        {orphanedApps.map((name, i) => (
                            <View key={name}>
                                {i > 0 && <View style={styles.divider} />}
                                <View style={styles.sensorRow}>
                                    <View style={[styles.sensorIcon, { opacity: 0.3 }]}><Text style={{ fontSize: 18 }}>📱</Text></View>
                                    <View style={{ flex: 1 }}><Text style={[styles.sensorName, { color: colors.textDisabled }]}>{name}</Text><Text style={[styles.sensorStatus, { color: colors.loss }]}>DISCONNECTED</Text></View>
                                    <TouchableOpacity onPress={() => handleReselect(name)} style={styles.reBtn}><Text style={styles.reBtnText}>재연결</Text></TouchableOpacity>
                                </View>
                            </View>
                        ))}
                    </View>
                </View>
              )}
              <TouchableOpacity style={styles.addBtn} onPress={handleAddApp}><Text style={styles.addBtnText}>+ ADD NEW ASSET</Text></TouchableOpacity>
            </ScrollView>
          )}
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backIcon: { fontSize: 32, color: colors.textPrimary, fontWeight: '300' },
  headerTitle: { fontFamily: font.bold, fontSize: 14, color: colors.textPrimary, letterSpacing: -0.5 },
  content: { paddingHorizontal: 24, paddingTop: 32 },
  sectionLabel: { fontFamily: font.bold, fontSize: 10, color: colors.textDisabled, letterSpacing: 1.5, marginBottom: 12, paddingLeft: 16 },
  glassCard: { backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', overflow: 'hidden' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 20 },
  infoLabel: { fontFamily: font.bold, fontSize: 12, color: colors.textMuted },
  infoValue: { fontFamily: font.bold, fontSize: 12, color: colors.textPrimary },
  nicknameInput: { fontFamily: font.bold, fontSize: 12, color: colors.textPrimary, flex: 1, textAlign: 'right', padding: 0 },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.03)' },
  inputRow: { flexDirection: 'row', alignItems: 'center', padding: 20 },
  inputTitle: { fontFamily: font.bold, fontSize: 12, color: colors.textPrimary },
  inputSub: { fontFamily: font.regular, fontSize: 9, color: colors.textMuted, marginTop: 4 },
  glassInputBox: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  glassInput: { backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, width: 64, color: '#fff', fontFamily: font.bold, fontSize: 14, textAlign: 'right' },
  unit: { fontFamily: font.bold, fontSize: 12, color: colors.textMuted },
  summaryBox: { backgroundColor: 'rgba(249, 115, 22, 0.03)', borderRadius: 24, padding: 24, alignItems: 'center', marginTop: 12, marginBottom: 32, borderWidth: 1, borderColor: 'rgba(249, 115, 22, 0.1)' },
  summaryLabel: { fontFamily: font.bold, fontSize: 9, color: colors.accent, letterSpacing: 1.5, marginBottom: 12 },
  summaryValue: { fontFamily: font.bold, fontSize: 42, color: colors.textPrimary, marginBottom: 8, letterSpacing: -1 },
  summarySub: { fontFamily: font.regular, fontSize: 10, color: colors.textDisabled },
  badgeBtn: { backgroundColor: 'rgba(255,255,255,0.05)', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 100 },
  badgeBtnActive: { backgroundColor: 'rgba(16, 185, 129, 0.1)' },
  badgeText: { fontFamily: font.bold, fontSize: 9, color: colors.textMuted },
  badgeTextActive: { color: colors.profit },
  arrow: { fontSize: 18, color: colors.textDisabled, fontWeight: '300' },
  saveBtn: { backgroundColor: colors.textPrimary, borderRadius: 24, paddingVertical: 18, alignItems: 'center', marginTop: 40 },
  saveBtnText: { fontFamily: font.bold, fontSize: 13, color: colors.bgBase },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  modalTitle: { fontFamily: font.bold, fontSize: 14, color: colors.textPrimary, letterSpacing: -0.5 },
  modalClose: { fontFamily: font.bold, fontSize: 13, color: colors.accent },
  modalContent: { padding: 24 },
  emptyText: { fontFamily: font.regular, fontSize: 12, color: colors.textDisabled, textAlign: 'center', paddingVertical: 40 },
  sensorRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  sensorIcon: { width: 32, height: 32, backgroundColor: '#0a0a0a', borderRadius: 8, alignItems: 'center', justifyContent: 'center', position: 'relative', borderWidth: 1, borderColor: '#1a1a1a' },
  liveDot: { position: 'absolute', top: -2, right: -2, width: 6, height: 6, backgroundColor: colors.profit, borderRadius: 3, shadowColor: colors.profit, shadowOpacity: 0.8, shadowRadius: 3 },
  sensorName: { fontFamily: font.bold, fontSize: 12, color: colors.textPrimary },
  sensorStatus: { fontFamily: font.bold, fontSize: 7, color: colors.profit, marginTop: 1, letterSpacing: 0.5 },
  removeBtn: { padding: 6 },
  removeIcon: { fontSize: 12, color: colors.textDisabled },
  reBtn: { backgroundColor: '#111', borderWidth: 1, borderColor: '#222', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  reBtnText: { fontFamily: font.bold, fontSize: 10, color: colors.accent },
  addBtn: { width: '100%', paddingVertical: 18, borderStyle: 'dashed', borderWidth: 1, borderColor: '#222', borderRadius: 24, alignItems: 'center', marginTop: 24 },
  addBtnText: { fontFamily: font.bold, fontSize: 10, color: colors.textDisabled, letterSpacing: 1 },
  nameInputRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)', paddingVertical: 14 },
  nameInput: { fontFamily: font.bold, fontSize: 13, color: colors.textPrimary, flex: 1, textAlign: 'right' },
  nameSaveBtn: { backgroundColor: colors.accent, borderRadius: 20, paddingVertical: 18, alignItems: 'center', marginTop: 32 },
  nameSaveText: { fontFamily: font.bold, fontSize: 13, color: '#fff' },
  modalHint: { fontFamily: font.regular, fontSize: 12, color: colors.textSecondary, marginBottom: 20 },
});
