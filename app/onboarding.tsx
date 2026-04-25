import { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet,
    TouchableOpacity, KeyboardAvoidingView,
    Platform, Alert, ScrollView, ActivityIndicator, Modal, Dimensions
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
import { colors, font, fontSize, spacing, radius, shadows, gradients } from '../src/lib/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// 0: 수면  1: 업무  2: 스크린타임
const TOTAL_STEPS = 3;

export default function OnboardingScreen() {
    const [currentStep, setCurrentStep] = useState(0);
    const [sleepHours, setSleepHours] = useState(7.5);
    const [workHours, setWorkHours] = useState(8.0);
    const [loading, setLoading] = useState(false);

    const [registeredApps, setRegisteredApps] = useState<{key: string; name: string}[]>([]);
    const [pickingApp, setPickingApp] = useState<string | null>(null);
    const [permissionGranted, setPermissionGranted] = useState(false);

    const [pendingTokenKeys, setPendingTokenKeys] = useState<string[]>([]);
    const [nameInputs, setNameInputs] = useState<Record<string, string>>({});
    const [savingNames, setSavingNames] = useState(false);

    useEffect(() => {
        if (currentStep === 2) {
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
                    sleep_hours: sleepHours,
                    work_hours: workHours,
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

    async function handleAddApp() {
        setPickingApp('앱 선택 중');
        const result = await presentPickerForToken();
        setPickingApp(null);
        if (result === 'cancelled') return;
        
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
        for (const key of pendingTokenKeys) {
            if (!nameInputs[key]?.trim()) {
                Alert.alert('이름 필요', '모든 앱의 이름을 입력해주세요.');
                return;
            }
        }
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

    const adjustTime = (type: 'sleep' | 'work', amount: number) => {
        if (type === 'sleep') {
            setSleepHours(prev => Math.max(0, Math.min(24, +(prev + amount).toFixed(1))));
        } else {
            setWorkHours(prev => Math.max(0, Math.min(24, +(prev + amount).toFixed(1))));
        }
    };

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={gradients.primaryGlow}
                style={styles.glow}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
            />

            <View style={styles.stepHeader}>
                <View style={styles.stepIndicator}>
                    {Array(TOTAL_STEPS).fill(0).map((_, i) => (
                        <View 
                            key={i} 
                            style={[styles.stepBar, i <= currentStep && styles.stepBarActive]} 
                        />
                    ))}
                </View>
                <TouchableOpacity onPress={handleBack} disabled={currentStep === 0} style={{ opacity: currentStep === 0 ? 0 : 1 }}>
                    <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
            </View>

            <View style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={styles.inner} bounces={false}>
                    {/* Step 0 — 수면 시간 */}
                    {currentStep === 0 && (
                        <>
                            <View style={styles.titleGroup}>
                                <Ionicons name="moon" size={32} color={colors.accent} style={{ marginBottom: 12 }} />
                                <Text style={styles.title}>매일 몇 시간{'\n'}주무시나요?</Text>
                                <Text style={styles.sub}>
                                    수면 시간은 가처분 시간 계산에서{'\n'}자동으로 제외됩니다.
                                </Text>
                            </View>

                            <View style={styles.stepperCard}>
                                <Text style={styles.cardLabel}>Daily Sleep Record</Text>
                                <View style={styles.stepperRow}>
                                    <TouchableOpacity 
                                        style={styles.stepBtn} 
                                        onPress={() => adjustTime('sleep', -0.5)}
                                        activeOpacity={0.7}
                                    >
                                        <Ionicons name="remove" size={24} color={colors.textPrimary} />
                                    </TouchableOpacity>
                                    
                                    <View style={styles.valueGroup}>
                                        <Text style={styles.bigValue}>{sleepHours.toFixed(1)}</Text>
                                        <Text style={styles.valueUnit}>시간</Text>
                                    </View>

                                    <TouchableOpacity 
                                        style={styles.stepBtn} 
                                        onPress={() => adjustTime('sleep', 0.5)}
                                        activeOpacity={0.7}
                                    >
                                        <Ionicons name="add" size={24} color={colors.textPrimary} />
                                    </TouchableOpacity>
                                </View>
                                
                                <View style={styles.gaugeContainer}>
                                    <View style={[styles.gaugeFill, { width: `${(sleepHours / 24) * 100}%` }]} />
                                    <View style={styles.gaugeBackground} />
                                </View>
                                <View style={styles.gaugeLabels}>
                                    <Text style={styles.gaugeLabel}>0h</Text>
                                    <Text style={styles.gaugeLabel}>하루의 {((sleepHours / 24) * 100).toFixed(0)}%</Text>
                                    <Text style={styles.gaugeLabel}>24h</Text>
                                </View>
                            </View>
                        </>
                    )}

                    {/* Step 1 — 업무 시간 */}
                    {currentStep === 1 && (
                        <>
                            <View style={styles.titleGroup}>
                                <Ionicons name="briefcase" size={32} color={colors.accent} style={{ marginBottom: 12 }} />
                                <Text style={styles.title}>하루 평균 업무량은{'\n'}어느 정도인가요?</Text>
                                <Text style={styles.sub}>
                                    평일 기준으로 입력해요.{'\n'}가처분 시간 산출의 핵심 지표입니다.
                                </Text>
                            </View>

                            <View style={styles.stepperCard}>
                                <Text style={styles.cardLabel}>Daily Work Record</Text>
                                <View style={styles.stepperRow}>
                                    <TouchableOpacity 
                                        style={styles.stepBtn} 
                                        onPress={() => adjustTime('work', -0.5)}
                                        activeOpacity={0.7}
                                    >
                                        <Ionicons name="remove" size={24} color={colors.textPrimary} />
                                    </TouchableOpacity>
                                    
                                    <View style={styles.valueGroup}>
                                        <Text style={styles.bigValue}>{workHours.toFixed(1)}</Text>
                                        <Text style={styles.valueUnit}>시간</Text>
                                    </View>

                                    <TouchableOpacity 
                                        style={styles.stepBtn} 
                                        onPress={() => adjustTime('work', 0.5)}
                                        activeOpacity={0.7}
                                    >
                                        <Ionicons name="add" size={24} color={colors.textPrimary} />
                                    </TouchableOpacity>
                                </View>

                                <View style={styles.gaugeContainer}>
                                    <View style={[styles.gaugeFill, { width: `${(workHours / 24) * 100}%` }]} />
                                    <View style={styles.gaugeBackground} />
                                </View>
                                <View style={styles.gaugeLabels}>
                                    <Text style={styles.gaugeLabel}>0h</Text>
                                    <Text style={styles.gaugeLabel}>하루의 {((workHours / 24) * 100).toFixed(0)}%</Text>
                                    <Text style={styles.gaugeLabel}>24h</Text>
                                </View>
                            </View>
                        </>
                    )}

                    {/* Step 2 — 스크린타임 설정 */}
                    {currentStep === 2 && (
                        <>
                            <View style={styles.titleGroup}>
                                <Ionicons name="apps" size={32} color={colors.accent} style={{ marginBottom: 12 }} />
                                <Text style={styles.title}>자동 수집을{'\n'}설정해요</Text>
                                <Text style={styles.sub}>
                                    추적할 앱을 선택하면 사용 시간이{'\n'}자동으로 재무제표에 기록됩니다.
                                </Text>
                            </View>

                            <TouchableOpacity
                                style={[
                                    styles.permissionBtn,
                                    permissionGranted && styles.permissionBtnGranted,
                                ]}
                                onPress={handleRequestPermission}
                                disabled={loading || permissionGranted}
                            >
                                <View style={styles.permissionStatusRow}>
                                    <View style={[styles.statusDot, permissionGranted && styles.statusDotActive]} />
                                    <Text style={[styles.permissionBtnText, permissionGranted && styles.permissionBtnGrantedText]}>
                                        {permissionGranted ? '스크린 타임 권한 활성' : '스크린 타임 권한 허용 필요'}
                                    </Text>
                                </View>
                                {!permissionGranted && <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />}
                            </TouchableOpacity>

                            <View style={styles.appCard}>
                                <Text style={styles.cardLabel}>추적 중인 앱 (자산)</Text>
                                {registeredApps.length > 0 ? (
                                    registeredApps.map(entry => (
                                        <View key={entry.key} style={styles.appRow}>
                                            <AppTokenLabel tokenKey={entry.key} iconOnly size={24} style={{ marginRight: 12 }} />
                                            <Text style={styles.appName}>{entry.name}</Text>
                                            <TouchableOpacity onPress={() => handleRemoveApp(entry.key)}>
                                                <Text style={styles.removeText}>제거</Text>
                                            </TouchableOpacity>
                                        </View>
                                    ))
                                ) : (
                                    <View style={styles.emptyContainer}>
                                        <Ionicons name="search-outline" size={32} color={colors.textDisabled} style={{ marginBottom: 8 }} />
                                        <Text style={styles.emptyText}>아직 추가된 앱이 없어요</Text>
                                    </View>
                                )}
                                
                                <TouchableOpacity 
                                    style={styles.addAppBtn} 
                                    onPress={handleAddApp}
                                    disabled={!!pickingApp || loading}
                                >
                                    {pickingApp ? (
                                        <ActivityIndicator size="small" color={colors.accent} />
                                    ) : (
                                        <Text style={styles.addAppText}>＋ 앱 추가하기</Text>
                                    )}
                                </TouchableOpacity>
                            </View>
                        </>
                    )}
                </ScrollView>

                <View style={styles.footer}>
                    {currentStep < 2 ? (
                        <TouchableOpacity style={styles.nextBtn} onPress={handleNext}>
                            <Text style={styles.nextBtnText}>다음 단계로</Text>
                        </TouchableOpacity>
                    ) : (
                        <>
                            <TouchableOpacity 
                                style={[styles.nextBtn, (loading || !!pickingApp) && styles.btnDisabled]} 
                                onPress={handleFinishSetup}
                                disabled={loading || !!pickingApp}
                            >
                                <Text style={styles.nextBtnText}>설정 완료</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => router.replace('/(tabs)')}>
                                <Text style={styles.skipText}>건너뛰고 나중에 설정하기</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            </View>

            {/* 앱 이름 입력 모달 */}
            <Modal
                visible={pendingTokenKeys.length > 0}
                animationType="slide"
                presentationStyle="pageSheet"
            >
                <View style={styles.modalContainer}>
                    <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>추가된 앱 이름 입력</Text>
                        <Text style={styles.modalSub}>앱 이름을 직접 입력해 주세요 (예: 유튜브)</Text>
                    </View>
                    <ScrollView style={{ flex: 1, paddingHorizontal: 24 }}>
                        {pendingTokenKeys.map((key, i) => (
                            <View key={key} style={styles.nicknameRow}>
                                <AppTokenLabel tokenKey={key} iconOnly size={28} style={{ marginRight: 12 }} />
                                <TextInput
                                    style={styles.nicknameInput}
                                    placeholder="앱 이름 (필수)"
                                    placeholderTextColor={colors.textDisabled}
                                    value={nameInputs[key] ?? ''}
                                    onChangeText={text => setNameInputs(prev => ({ ...prev, [key]: text }))}
                                    autoFocus={i === 0}
                                />
                            </View>
                        ))}
                    </ScrollView>
                    <View style={styles.modalFooter}>
                        <TouchableOpacity 
                            style={styles.modalSaveBtn} 
                            onPress={saveNames}
                            disabled={savingNames}
                        >
                            <Text style={styles.modalSaveText}>{savingNames ? '저장 중...' : '확인'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
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
        top: -SCREEN_HEIGHT * 0.1,
        left: 0,
        right: 0,
        height: SCREEN_HEIGHT * 0.5,
    },
    stepHeader: {
        paddingTop: 60,
        paddingHorizontal: 24,
    },
    stepIndicator: {
        flexDirection: 'row',
        gap: 6,
        marginBottom: 24,
    },
    stepBar: {
        flex: 1,
        height: 3,
        backgroundColor: colors.bgRaised,
        borderRadius: 2,
    },
    stepBarActive: {
        backgroundColor: colors.accent,
    },
    inner: {
        paddingHorizontal: 24,
        paddingTop: 20,
        paddingBottom: 40,
    },
    titleGroup: {
        marginBottom: 32,
    },
    title: {
        fontFamily: font.medium,
        fontSize: 28,
        color: colors.textPrimary,
        lineHeight: 38,
        letterSpacing: -0.5,
        marginBottom: 12,
    },
    sub: {
        fontFamily: font.regular,
        fontSize: 14,
        color: colors.textSecondary,
        lineHeight: 22,
    },
    stepperCard: {
        backgroundColor: colors.bgSurface,
        borderRadius: radius['2xl'],
        padding: 24,
        alignItems: 'center',
        ...shadows.strong,
    },
    cardLabel: {
        fontFamily: font.medium,
        fontSize: 10,
        color: colors.textMuted,
        textTransform: 'uppercase',
        letterSpacing: 1.5,
        marginBottom: 24,
        alignSelf: 'flex-start',
    },
    stepperRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        width: '100%',
        marginBottom: 32,
    },
    stepBtn: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: colors.bgRaised,
        alignItems: 'center',
        justifyContent: 'center',
        ...shadows.soft,
    },
    valueGroup: {
        alignItems: 'center',
        flexDirection: 'row',
        gap: 8,
    },
    bigValue: {
        fontFamily: font.bold,
        fontSize: 52,
        color: colors.textPrimary,
        letterSpacing: -2,
    },
    valueUnit: {
        fontFamily: font.medium,
        fontSize: 15,
        color: colors.textMuted,
        marginTop: 12,
    },
    gaugeContainer: {
        width: '100%',
        height: 6,
        borderRadius: 3,
        overflow: 'hidden',
        marginBottom: 12,
        position: 'relative',
    },
    gaugeBackground: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: colors.bgRaised,
        zIndex: 1,
    },
    gaugeFill: {
        height: '100%',
        backgroundColor: colors.accent,
        zIndex: 2,
        borderRadius: 3,
    },
    gaugeLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
    },
    gaugeLabel: {
        fontFamily: font.regular,
        fontSize: 10,
        color: colors.textMuted,
    },
    footer: {
        padding: 24,
        paddingBottom: Platform.OS === 'ios' ? 48 : 24,
        backgroundColor: colors.bgBase,
    },
    nextBtn: {
        backgroundColor: colors.accent,
        borderRadius: 16,
        paddingVertical: 18,
        alignItems: 'center',
        ...shadows.medium,
    },
    nextBtnText: {
        fontFamily: font.bold,
        fontSize: 16,
        color: '#ffffff',
    },
    btnDisabled: {
        opacity: 0.5,
    },
    skipText: {
        fontFamily: font.regular,
        fontSize: 13,
        color: colors.textMuted,
        textAlign: 'center',
        marginTop: 18,
    },
    permissionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: colors.bgSurface,
        borderRadius: 16,
        padding: 20,
        marginBottom: 20,
        ...shadows.soft,
    },
    permissionBtnGranted: {
        backgroundColor: 'rgba(74,222,128,0.05)',
    },
    permissionStatusRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    statusDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.textDisabled,
        marginRight: 12,
    },
    statusDotActive: {
        backgroundColor: colors.profit,
    },
    permissionBtnText: {
        fontFamily: font.medium,
        fontSize: 14,
        color: colors.textSecondary,
    },
    permissionBtnGrantedText: {
        color: colors.profit,
    },
    appCard: {
        backgroundColor: colors.bgSurface,
        borderRadius: radius['2xl'],
        padding: 24,
        ...shadows.strong,
    },
    appRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.borderSub,
    },
    appName: {
        fontFamily: font.medium,
        fontSize: 15,
        color: colors.textPrimary,
        flex: 1,
    },
    removeText: {
        fontFamily: font.regular,
        fontSize: 12,
        color: colors.textMuted,
    },
    emptyContainer: {
        alignItems: 'center',
        paddingVertical: 32,
    },
    emptyText: {
        fontFamily: font.regular,
        fontSize: 14,
        color: colors.textDisabled,
    },
    addAppBtn: {
        marginTop: 20,
        alignItems: 'center',
        paddingVertical: 8,
    },
    addAppText: {
        fontFamily: font.bold,
        fontSize: 15,
        color: colors.accent,
    },
    modalContainer: {
        flex: 1,
        backgroundColor: colors.bgBase,
    },
    modalHeader: {
        padding: 24,
        paddingTop: 48,
        alignItems: 'center',
    },
    modalTitle: {
        fontFamily: font.bold,
        fontSize: 20,
        color: colors.textPrimary,
        marginBottom: 8,
    },
    modalSub: {
        fontFamily: font.regular,
        fontSize: 14,
        color: colors.textSecondary,
    },
    nicknameRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 20,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    nicknameInput: {
        flex: 1,
        fontFamily: font.medium,
        fontSize: 16,
        color: colors.textPrimary,
    },
    modalFooter: {
        padding: 24,
        paddingBottom: 48,
    },
    modalSaveBtn: {
        backgroundColor: colors.textPrimary,
        borderRadius: 16,
        paddingVertical: 20,
        alignItems: 'center',
    },
    modalSaveText: {
        fontFamily: font.bold,
        fontSize: 16,
        color: colors.bgBase,
    },
});
