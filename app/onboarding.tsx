import { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TextInput,
    TouchableOpacity, KeyboardAvoidingView,
    Platform, Alert, ScrollView, ActivityIndicator, Modal
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import {
    requestPermission,
    hasPermission,
    presentPickerForToken,
    confirmPendingTokenAuto,
    startMonitoring,
    stopMonitoring,
    removeAppToken,
    setNameMap,
} from '../src/lib/screenTime';
import { AppTokenLabel } from '../src/components/AppTokenLabel';
import { colors, font, fontSize, spacing, radius } from '../src/lib/theme';

// 0: 소개  1: 수면  2: 업무  3: 스크린타임
const TOTAL_STEPS = 4;

export default function OnboardingScreen() {
    const [currentStep, setCurrentStep] = useState(0);
    const [sleepHours, setSleepHours] = useState('7.5');
    const [workHours, setWorkHours] = useState('8.0');
    const [loading, setLoading] = useState(false);

    // Step 3: 등록된 앱 목록 { tokenKey, displayName }
    const [registeredApps, setRegisteredApps] = useState<{key: string; name: string}[]>([]);
    const [pickingApp, setPickingApp] = useState<string | null>(null);
    const [permissionGranted, setPermissionGranted] = useState(false);

    // 이름 입력 모달 (필수 입력)
    const [pendingTokenKeys, setPendingTokenKeys] = useState<string[]>([]);
    const [nameInputs, setNameInputs] = useState<Record<string, string>>({});
    const [savingNames, setSavingNames] = useState(false);

    // Step 3 진입 시 권한 상태 확인
    useEffect(() => {
        if (currentStep === 3) {
            hasPermission().then(setPermissionGranted);
        }
    }, [currentStep]);

    function handleBack() {
        if (currentStep > 0) setCurrentStep(prev => prev - 1);
    }

    async function handleNext() {
        setCurrentStep(prev => prev + 1);
    }

    async function saveAndComplete() {
        setLoading(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const { error } = await supabase
                .from('user_settings')
                .upsert({
                    user_id: user.id,
                    sleep_hours: parseFloat(sleepHours),
                    work_hours: parseFloat(workHours),
                    updated_at: new Date().toISOString(),
                }, { onConflict: 'user_id' });

            if (error) {
                Alert.alert('오류', '저장에 실패했어요.');
                return;
            }

            router.replace('/(tabs)');
        } finally {
            setLoading(false);
        }
    }

    async function handleRequestPermission() {
        setLoading(true);
        try {
            const permitted = await hasPermission();
            if (permitted) {
                setPermissionGranted(true);
                return;
            }
            const granted = await requestPermission();
            if (granted) {
                setPermissionGranted(true);
            } else {
                Alert.alert(
                    '권한 필요',
                    '스크린 타임 권한이 필요해요. 설정 → 스크린 타임에서 허용해주세요.',
                    [{ text: '확인' }]
                );
            }
        } finally {
            setLoading(false);
        }
    }

    // "앱 추가" → picker → 다중 선택 지원, 중복 자동 방지
    async function handleAddApp() {
        setPickingApp('앱 선택 중');
        const result = await presentPickerForToken();
        setPickingApp(null);
        if (result === 'cancelled') return;
        if (result === 'category_only') {
            Alert.alert('개별 앱을 선택해주세요', '카테고리를 펼쳐서 추적할 앱을 개별로 선택해주세요.');
            return;
        }

        const newKeys: string[] = [];
        for (let i = 0; i < result.count; i++) {
            const newKey = await confirmPendingTokenAuto(i);
            if (!newKey) continue;
            newKeys.push(newKey);
        }

        if (newKeys.length > 0) {
            setNameInputs({});
            setPendingTokenKeys(newKeys);
        }
    }

    async function handleRemoveApp(key: string) {
        const entry = registeredApps.find(a => a.key === key);
        if (!entry) return;
        await removeAppToken(key);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await supabase
                .from('app_categories')
                .delete()
                .eq('user_id', user.id)
                .eq('app_name', entry.name);
        }
        const remaining = registeredApps.filter(a => a.key !== key);
        setRegisteredApps(remaining);
        if (remaining.length > 0) {
            await startMonitoring();
        } else {
            await stopMonitoring();
        }
    }

    async function saveNames() {
        // 모든 앱에 이름 입력 필수
        for (const key of pendingTokenKeys) {
            if (!nameInputs[key]?.trim()) {
                Alert.alert('이름 필요', '모든 앱의 이름을 입력해주세요.');
                return;
            }
        }
        // 이름 중복 확인
        const newNames = pendingTokenKeys.map(k => nameInputs[k].trim());
        const existingNames = registeredApps.map(a => a.name);
        const duplicate = newNames.find(n => existingNames.includes(n));
        if (duplicate) {
            Alert.alert('중복', `'${duplicate}'는 이미 추가된 앱이에요.`);
            return;
        }

        setSavingNames(true);
        try {
            const { data: { user } } = await supabase.auth.getUser();
            const nameMap: Record<string, string> = {};
            pendingTokenKeys.forEach(k => { nameMap[k] = nameInputs[k].trim(); });

            if (user) {
                await supabase.from('app_categories').upsert(
                    pendingTokenKeys.map(key => ({
                        user_id: user.id,
                        app_name: nameMap[key],
                        bundle_id: '',
                        category: '소비',
                        budget_minutes: 0,
                    })),
                    { onConflict: 'user_id,app_name' }
                );
            }
            await setNameMap(nameMap);

            setRegisteredApps(prev => [
                ...prev,
                ...pendingTokenKeys.map(k => ({ key: k, name: nameMap[k] })),
            ]);
        } finally {
            setSavingNames(false);
            setPendingTokenKeys([]);
        }
    }

    async function handleFinishSetup() {
        setLoading(true);
        if (registeredApps.length > 0) {
            await startMonitoring();
        }
        setLoading(false);
        await saveAndComplete();
    }

    async function skipScreenTime() {
        await saveAndComplete();
    }

    return (
        <View style={{ flex: 1 }}>
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
            <ScrollView
                contentContainerStyle={styles.inner}
                keyboardShouldPersistTaps="handled"
            >
                {/* 헤더: 뒤로가기 + 스텝 표시 */}
                <View style={styles.topRow}>
                    {currentStep > 0 ? (
                        <TouchableOpacity onPress={handleBack} style={styles.backBtn}>
                            <Text style={styles.backIcon}>‹</Text>
                        </TouchableOpacity>
                    ) : (
                        <View style={styles.backBtn} />
                    )}
                    <Text style={styles.stepText}>
                        {String(currentStep + 1).padStart(2, '0')} / {String(TOTAL_STEPS).padStart(2, '0')}
                    </Text>
                </View>

                {/* 점 인디케이터 */}
                <View style={styles.dots}>
                    {Array(TOTAL_STEPS).fill(0).map((_, i) => (
                        <View key={i} style={[styles.dot, i === currentStep && styles.dotActive]} />
                    ))}
                </View>

                {/* Step 0 — 소개 */}
                {currentStep === 0 && (
                    <>
                        <Text style={styles.title}>반가워요</Text>
                        <Text style={styles.sub}>
                            Ledger는 시간을 재무제표로 기록해요.{'\n'}
                            낭비한 시간을 당기 순손실로 보여드려요.
                        </Text>
                    </>
                )}

                {/* Step 1 — 수면 시간 */}
                {currentStep === 1 && (
                    <>
                        <Text style={styles.title}>매일 몇 시간{'\n'}주무세요?</Text>
                        <Text style={styles.sub}>
                            가처분 시간 계산에 사용해요.{'\n'}
                            나중에 설정에서 바꿀 수 있어요.
                        </Text>
                        <TextInput
                            style={styles.input}
                            value={sleepHours}
                            onChangeText={setSleepHours}
                            keyboardType="decimal-pad"
                            placeholder="7.5"
                            placeholderTextColor={colors.textMuted}
                        />
                    </>
                )}

                {/* Step 2 — 업무 시간 */}
                {currentStep === 2 && (
                    <>
                        <Text style={styles.title}>하루 업무 시간은{'\n'}몇 시간이에요?</Text>
                        <Text style={styles.sub}>
                            평일 기준으로 입력해요.{'\n'}
                            나중에 설정에서 바꿀 수 있어요.
                        </Text>
                        <TextInput
                            style={styles.input}
                            value={workHours}
                            onChangeText={setWorkHours}
                            keyboardType="decimal-pad"
                            placeholder="8.0"
                            placeholderTextColor={colors.textMuted}
                        />
                    </>
                )}

                {/* Step 3 — 스크린타임 설정 */}
                {currentStep === 3 && (
                    <>
                        <Text style={styles.title}>자동 수집을{'\n'}설정해요</Text>
                        <Text style={styles.sub}>
                            앱을 추가하면 사용 시간이 자동으로 기록돼요.{'\n'}
                            나중에 설정에서도 추가할 수 있어요.
                        </Text>

                        <TouchableOpacity
                            style={[
                                styles.permissionBtn,
                                (loading || permissionGranted) && styles.btnDisabled,
                                permissionGranted && styles.permissionBtnGranted,
                            ]}
                            onPress={handleRequestPermission}
                            disabled={loading || permissionGranted}
                        >
                            <Text style={[
                                styles.permissionBtnText,
                                permissionGranted && styles.permissionBtnGrantedText,
                            ]}>
                                {permissionGranted ? '스크린 타임 허용됨' : loading ? '확인 중...' : '스크린 타임 권한 허용'}
                            </Text>
                        </TouchableOpacity>

                        {pickingApp && (
                            <View style={styles.pickingBanner}>
                                <ActivityIndicator color={colors.accent} size="small" style={{ marginRight: 10 }} />
                                <Text style={styles.pickingBannerText}>{pickingApp}…</Text>
                            </View>
                        )}

                        {/* 등록된 앱 목록 */}
                        {registeredApps.length > 0 && (
                            <View style={styles.registeredSection}>
                                <Text style={styles.catLabel}>추적 중인 앱</Text>
                                {registeredApps.map(entry => (
                                    <View key={entry.key} style={styles.registeredRow}>
                                        <Text style={styles.registeredName}>{entry.name}</Text>
                                        <TouchableOpacity
                                            onPress={() => handleRemoveApp(entry.key)}
                                            disabled={!!pickingApp || loading}
                                            style={styles.removeBtn}
                                        >
                                            <Text style={styles.removeBtnText}>제거</Text>
                                        </TouchableOpacity>
                                    </View>
                                ))}
                            </View>
                        )}

                        {registeredApps.length === 0 && !pickingApp && (
                            <Text style={styles.emptyHint}>아직 추가된 앱이 없어요</Text>
                        )}

                        <TouchableOpacity
                            style={styles.addBtn}
                            onPress={handleAddApp}
                            disabled={!!pickingApp || loading}
                        >
                            <Text style={styles.addBtnText}>+ 앱 추가</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            style={[styles.btn, (loading || !!pickingApp) && styles.btnDisabled]}
                            onPress={handleFinishSetup}
                            disabled={loading || !!pickingApp}
                        >
                            <Text style={styles.btnText}>
                                {loading ? '설정 중...' : `완료${registeredApps.length > 0 ? ` (${registeredApps.length}개)` : ''}`}
                            </Text>
                        </TouchableOpacity>

                        <TouchableOpacity onPress={skipScreenTime} disabled={loading || !!pickingApp}>
                            <Text style={styles.skipText}>건너뛰고 나중에 설정할게요</Text>
                        </TouchableOpacity>
                    </>
                )}

                {/* 다음 버튼 (Step 0~2) */}
                {currentStep < 3 && (
                    <TouchableOpacity
                        style={[styles.btn, loading && styles.btnDisabled]}
                        onPress={handleNext}
                        disabled={loading}
                    >
                        <Text style={styles.btnText}>다음</Text>
                    </TouchableOpacity>
                )}

            </ScrollView>
        </KeyboardAvoidingView>

        {/* 앱 이름 입력 모달 (필수) */}
        <Modal
            visible={pendingTokenKeys.length > 0}
            animationType="slide"
            presentationStyle="pageSheet"
            onRequestClose={() => {}}
        >
            <KeyboardAvoidingView
                style={{ flex: 1, backgroundColor: colors.bgBase }}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <View style={styles.nicknameModalHeader}>
                    <Text style={styles.nicknameModalTitle}>추가된 앱 이름 입력</Text>
                </View>

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
                                onChangeText={text =>
                                    setNameInputs(prev => ({ ...prev, [key]: text }))
                                }
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
    container: {
        flex: 1,
        backgroundColor: colors.bgBase,
    },
    inner: {
        paddingHorizontal: 28,
        paddingTop: 60,
        paddingBottom: spacing['2xl'],
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: spacing.md,
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
    stepText: {
        fontFamily: font.regular,
        fontSize: fontSize.xs,
        color: colors.textMuted,
        letterSpacing: 1.5,
    },
    dots: {
        flexDirection: 'row',
        gap: 6,
        marginBottom: spacing.xl,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: colors.textDisabled,
    },
    dotActive: {
        backgroundColor: colors.accent,
    },
    title: {
        fontFamily: font.medium,
        fontSize: 26,
        color: colors.textPrimary,
        lineHeight: 36,
        letterSpacing: -0.5,
        marginBottom: 14,
    },
    sub: {
        fontFamily: font.regular,
        fontSize: 13,
        color: colors.textMuted,
        lineHeight: 22,
        marginBottom: spacing.xl,
    },
    input: {
        backgroundColor: colors.bgSurface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        padding: spacing.md,
        color: colors.textPrimary,
        fontFamily: font.medium,
        fontSize: 24,
        textAlign: 'center',
        marginBottom: spacing.md,
    },
    catLabel: {
        fontFamily: font.regular,
        fontSize: fontSize.xs,
        color: colors.textMuted,
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        marginBottom: 10,
        marginTop: spacing.md,
    },
    permissionBtn: {
        backgroundColor: colors.bgSurface,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: radius.md,
        padding: 14,
        alignItems: 'center',
        marginBottom: 20,
    },
    permissionBtnText: {
        fontFamily: font.regular,
        fontSize: 13,
        color: colors.textPrimary,
    },
    permissionBtnGranted: {
        borderColor: 'rgba(57,255,20,0.3)',
        backgroundColor: 'rgba(57,255,20,0.06)',
    },
    permissionBtnGrantedText: {
        color: '#39FF14',
    },
    pickingBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.bgRaised,
        borderRadius: radius.sm,
        marginBottom: spacing.sm,
        paddingVertical: 10,
        paddingHorizontal: 14,
    },
    pickingBannerText: {
        fontFamily: font.regular,
        fontSize: 13,
        color: colors.textPrimary,
    },
    registeredSection: {
        marginBottom: spacing.sm,
    },
    registeredRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: spacing.sm,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.border,
    },
    registeredName: {
        fontFamily: font.regular,
        fontSize: 13,
        color: colors.textPrimary,
        flex: 1,
    },
    removeBtn: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: colors.textDisabled,
        marginLeft: spacing.sm,
    },
    removeBtnText: {
        fontFamily: font.regular,
        fontSize: fontSize.xs,
        color: colors.textMuted,
    },
    emptyHint: {
        fontFamily: font.regular,
        fontSize: fontSize.sm,
        color: colors.textDisabled,
        textAlign: 'center',
        paddingVertical: 20,
    },
    addBtn: {
        marginTop: spacing.sm,
        marginBottom: 4,
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
    btn: {
        backgroundColor: colors.accent,
        borderRadius: radius.md,
        padding: spacing.md,
        alignItems: 'center',
        marginTop: 20,
        marginBottom: spacing.sm,
    },
    btnDisabled: {
        opacity: 0.5,
    },
    btnText: {
        fontFamily: font.medium,
        fontSize: fontSize.md,
        color: '#ffffff',
    },
    skipText: {
        fontFamily: font.regular,
        fontSize: fontSize.sm,
        color: colors.textDisabled,
        textAlign: 'center',
        paddingVertical: spacing.sm,
    },

    // 별명 입력 모달
    nicknameModalHeader: {
        paddingHorizontal: spacing.lg,
        paddingTop: spacing.lg,
        paddingBottom: spacing.sm,
    },
    nicknameModalTitle: {
        fontFamily: font.medium,
        fontSize: fontSize.lg,
        color: colors.textPrimary,
        textAlign: 'center',
    },
    nicknameModalHint: {
        fontFamily: font.regular,
        fontSize: fontSize.xs,
        color: colors.textSecondary,
        lineHeight: 18,
        paddingHorizontal: spacing.lg,
        paddingBottom: 20,
        textAlign: 'center',
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
    nicknameModalActions: {
        flexDirection: 'row',
        gap: spacing.sm,
        paddingHorizontal: spacing.lg,
        paddingVertical: 20,
        borderTopWidth: 0.5,
        borderTopColor: colors.border,
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
