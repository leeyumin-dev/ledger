import { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, TextInput,
    TouchableOpacity, KeyboardAvoidingView,
    Platform, Alert, ScrollView, ActivityIndicator
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
} from '../src/lib/screenTime';
import { AppTokenLabel } from '../src/components/AppTokenLabel';

// 0: 소개  1: 수면  2: 업무  3: 스크린타임
const TOTAL_STEPS = 4;

export default function OnboardingScreen() {
    const [currentStep, setCurrentStep] = useState(0);
    const [sleepHours, setSleepHours] = useState('7.5');
    const [workHours, setWorkHours] = useState('8.0');
    const [loading, setLoading] = useState(false);

    // Step 3: 피커로 등록된 앱 키 목록 (app_0, app_1, ...)
    const [registeredApps, setRegisteredApps] = useState<string[]>([]);
    const [pickingApp, setPickingApp] = useState<string | null>(null);
    const [permissionGranted, setPermissionGranted] = useState(false);

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

        const { data: { user } } = await supabase.auth.getUser();

        for (let i = 0; i < result.count; i++) {
            const newKey = await confirmPendingTokenAuto(i);
            if (!newKey) continue;
            if (user) {
                await supabase.from('app_categories').upsert(
                    [{ user_id: user.id, app_name: newKey, bundle_id: '', category: '소비', budget_minutes: 0 }],
                    { onConflict: 'user_id,app_name' }
                );
            }
            setRegisteredApps(prev => prev.includes(newKey) ? prev : [...prev, newKey]);
        }
    }

    async function handleRemoveApp(key: string) {
        await removeAppToken(key);
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await supabase
                .from('app_categories')
                .delete()
                .eq('user_id', user.id)
                .eq('app_name', key);
        }
        const remaining = registeredApps.filter(a => a !== key);
        setRegisteredApps(remaining);
        // 모니터링 상태 동기화
        if (remaining.length > 0) {
            await startMonitoring();
        } else {
            await stopMonitoring();
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
                            placeholderTextColor="#5a5754"
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
                            placeholderTextColor="#5a5754"
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
                                <ActivityIndicator color="#e8410a" size="small" style={{ marginRight: 10 }} />
                                <Text style={styles.pickingBannerText}>{pickingApp}…</Text>
                            </View>
                        )}

                        {/* 등록된 앱 목록 */}
                        {registeredApps.length > 0 && (
                            <View style={styles.registeredSection}>
                                <Text style={styles.catLabel}>추적 중인 앱</Text>
                                {registeredApps.map(key => (
                                    <View key={key} style={styles.registeredRow}>
                                        <AppTokenLabel
                                            tokenKey={key}
                                            style={{ width: 22, height: 22 }}
                                        />
                                        <TouchableOpacity
                                            onPress={() => handleRemoveApp(key)}
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
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0f0f0f',
    },
    inner: {
        paddingHorizontal: 28,
        paddingTop: 60,
        paddingBottom: 48,
    },
    topRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
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
    stepText: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 10,
        color: '#5a5754',
        letterSpacing: 1.5,
    },
    dots: {
        flexDirection: 'row',
        gap: 6,
        marginBottom: 32,
    },
    dot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#3a3836',
    },
    dotActive: {
        backgroundColor: '#e8410a',
    },
    title: {
        fontFamily: 'GeistMono_500Medium',
        fontSize: 26,
        color: '#f0ede8',
        lineHeight: 36,
        letterSpacing: -0.5,
        marginBottom: 14,
    },
    sub: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 13,
        color: '#5a5754',
        lineHeight: 22,
        marginBottom: 32,
    },
    input: {
        backgroundColor: '#161614',
        borderWidth: 1,
        borderColor: '#2a2826',
        borderRadius: 10,
        padding: 16,
        color: '#f0ede8',
        fontFamily: 'GeistMono_500Medium',
        fontSize: 24,
        textAlign: 'center',
        marginBottom: 16,
    },
    catLabel: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 10,
        color: '#5a5754',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        marginBottom: 10,
        marginTop: 16,
    },
    permissionBtn: {
        backgroundColor: '#161614',
        borderWidth: 1,
        borderColor: '#2a2826',
        borderRadius: 10,
        padding: 14,
        alignItems: 'center',
        marginBottom: 20,
    },
    permissionBtnText: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 13,
        color: '#f0ede8',
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
        backgroundColor: '#1c1c1a',
        borderRadius: 8,
        marginBottom: 12,
        paddingVertical: 10,
        paddingHorizontal: 14,
    },
    pickingBannerText: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 13,
        color: '#f0ede8',
    },
    registeredSection: {
        marginBottom: 8,
    },
    registeredRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        borderBottomWidth: 0.5,
        borderBottomColor: '#2a2826',
    },
    removeBtn: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: '#3a3836',
        marginLeft: 12,
    },
    removeBtnText: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 11,
        color: '#5a5754',
    },
    emptyHint: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 12,
        color: '#3a3836',
        textAlign: 'center',
        paddingVertical: 20,
    },
    addBtn: {
        marginTop: 12,
        marginBottom: 4,
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
    btn: {
        backgroundColor: '#e8410a',
        borderRadius: 10,
        padding: 16,
        alignItems: 'center',
        marginTop: 20,
        marginBottom: 12,
    },
    btnDisabled: {
        opacity: 0.5,
    },
    btnText: {
        fontFamily: 'GeistMono_500Medium',
        fontSize: 14,
        color: '#ffffff',
    },
    skipText: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 12,
        color: '#3a3836',
        textAlign: 'center',
        paddingVertical: 8,
    },
});
