import { useState } from 'react';
import {
    View, Text, StyleSheet, TextInput,
    TouchableOpacity, KeyboardAvoidingView,
    Platform, Alert, ScrollView
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { DEFAULT_APPS } from '../src/lib/defaultApps';

type SelectedApp = {
    app_name: string;
    category: string;
    selected: boolean;
};

export default function OnboardingScreen() {
    const [currentStep, setCurrentStep] = useState(0);
    const [sleepHours, setSleepHours] = useState('7.5');
    const [workHours, setWorkHours] = useState('8.0');
    const [loading, setLoading] = useState(false);
    const [selectedApps, setSelectedApps] = useState<SelectedApp[]>(
        DEFAULT_APPS.map(app => ({ ...app, selected: true }))
    );

    const totalSteps = 4;
    const isLast = currentStep === totalSteps - 1;

    function toggleApp(appName: string) {
        setSelectedApps(prev =>
            prev.map(app =>
                app.app_name === appName
                    ? { ...app, selected: !app.selected }
                    : app
            )
        );
    }

    async function handleNext() {
        if (isLast) {
            await saveAndComplete();
        } else {
            setCurrentStep(prev => prev + 1);
        }
    }

    async function saveAndComplete() {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // 설정 저장
        const { error: settingsError } = await supabase
            .from('user_settings')
            .upsert({
                user_id: user.id,
                sleep_hours: parseFloat(sleepHours),
                work_hours: parseFloat(workHours),
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' });

        if (settingsError) {
            Alert.alert('오류', '저장에 실패했어요.');
            setLoading(false);
            return;
        }

        // 선택된 앱 저장
        const appsToSave = selectedApps
            .filter(app => app.selected)
            .map(app => ({
                user_id: user.id,
                app_name: app.app_name,
                category: app.category,
                budget_minutes: 0,
            }));

        if (appsToSave.length > 0) {
            await supabase
                .from('app_categories')
                .upsert(appsToSave, { onConflict: 'user_id,app_name' });
        }

        router.replace('/(tabs)');
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
                {/* 스텝 표시 */}
                <Text style={styles.stepText}>{String(currentStep + 1).padStart(2, '0')} / {String(totalSteps).padStart(2, '0')}</Text>

                {/* 점 인디케이터 */}
                <View style={styles.dots}>
                    {Array(totalSteps).fill(0).map((_, i) => (
                        <View key={i} style={[styles.dot, i === currentStep && styles.dotActive]} />
                    ))}
                </View>

                {/* 1단계 — 소개 */}
                {currentStep === 0 && (
                    <>
                        <Text style={styles.title}>반가워요</Text>
                        <Text style={styles.sub}>
                            Ledger는 시간을 재무제표로 기록해요.{'\n'}
                            낭비한 시간을 당기 순손실로 보여드려요.
                        </Text>
                    </>
                )}

                {/* 2단계 — 수면 시간 */}
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

                {/* 3단계 — 업무 시간 */}
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

                {/* 4단계 — 앱 카테고리 */}
                {currentStep === 3 && (
                    <>
                        <Text style={styles.title}>자주 쓰는 앱을{'\n'}선택해요</Text>
                        <Text style={styles.sub}>
                            선택한 앱이 손익계산서에 자동 분류돼요.{'\n'}
                            지금 안 해도 설정 → 앱 카테고리 분류에서{'\n'}
                            언제든지 추가하고 바꿀 수 있어요.
                        </Text>

                        {/* 소비 */}
                        <Text style={styles.catLabel}>소비</Text>
                        <View style={styles.appRow}>
                            {selectedApps.filter(a => a.category === '소비').map(app => (
                                <TouchableOpacity
                                    key={app.app_name}
                                    style={[styles.appBtn, app.selected && styles.appBtnActive]}
                                    onPress={() => toggleApp(app.app_name)}
                                >
                                    <Text style={[styles.appBtnText, app.selected && styles.appBtnTextActive]}>
                                        {app.app_name}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* 투자 */}
                        <Text style={styles.catLabel}>투자</Text>
                        <View style={styles.appRow}>
                            {selectedApps.filter(a => a.category === '투자').map(app => (
                                <TouchableOpacity
                                    key={app.app_name}
                                    style={[styles.appBtn, app.selected && styles.appBtnActive]}
                                    onPress={() => toggleApp(app.app_name)}
                                >
                                    <Text style={[styles.appBtnText, app.selected && styles.appBtnTextActive]}>
                                        {app.app_name}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* 필수 */}
                        <Text style={styles.catLabel}>필수</Text>
                        <View style={styles.appRow}>
                            {selectedApps.filter(a => a.category === '필수').map(app => (
                                <TouchableOpacity
                                    key={app.app_name}
                                    style={[styles.appBtn, app.selected && styles.appBtnActive]}
                                    onPress={() => toggleApp(app.app_name)}
                                >
                                    <Text style={[styles.appBtnText, app.selected && styles.appBtnTextActive]}>
                                        {app.app_name}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </>
                )}

                {/* 다음 버튼 */}
                <TouchableOpacity
                    style={[styles.btn, loading && styles.btnDisabled]}
                    onPress={handleNext}
                    disabled={loading}
                >
                    <Text style={styles.btnText}>
                        {loading ? '저장 중...' : isLast ? '시작하기' : '다음'}
                    </Text>
                </TouchableOpacity>

                {/* 건너뛰기 (4단계에서만) */}
                {currentStep === 3 && (
                    <TouchableOpacity onPress={() => saveAndComplete()}>
                        <Text style={styles.skipText}>건너뛰고 나중에 설정할게요</Text>
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
        paddingTop: 80,
        paddingBottom: 48,
    },
    stepText: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 10,
        color: '#5a5754',
        letterSpacing: 1.5,
        marginBottom: 16,
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
    appRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    appBtn: {
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#2a2826',
        backgroundColor: '#161614',
    },
    appBtnActive: {
        backgroundColor: '#e8410a',
        borderColor: '#e8410a',
    },
    appBtnText: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 13,
        color: '#5a5754',
    },
    appBtnTextActive: {
        color: '#ffffff',
    },
    btn: {
        backgroundColor: '#e8410a',
        borderRadius: 10,
        padding: 16,
        alignItems: 'center',
        marginTop: 32,
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