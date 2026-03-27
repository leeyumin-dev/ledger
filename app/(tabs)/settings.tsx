import { useState, useEffect } from 'react';
import {
    View, Text, TextInput,
    TouchableOpacity, StyleSheet,
    ScrollView, Alert
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../src/lib/supabase';

export default function SettingsScreen() {
    const [sleepHours, setSleepHours] = useState('7.5');
    const [workHours, setWorkHours] = useState('8.0');
    const [loading, setLoading] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);

    useEffect(() => {
        loadSettings();
    }, []);

    async function loadSettings() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        setUserId(user.id);

        const { data } = await supabase
            .from('user_settings')
            .select('*')
            .eq('user_id', user.id)
            .single();

        if (data) {
            setSleepHours(String(data.sleep_hours));
            setWorkHours(String(data.work_hours));
        }
    }

    async function saveSettings() {
        if (!userId) return;
        setLoading(true);

        const { error } = await supabase
            .from('user_settings')
            .upsert({
                user_id: userId,
                sleep_hours: parseFloat(sleepHours),
                work_hours: parseFloat(workHours),
                updated_at: new Date().toISOString(),
            }, {
                onConflict: 'user_id'
            });

        if (error) Alert.alert('오류', '저장에 실패했어요.');
        else Alert.alert('저장 완료', '설정이 저장됐어요.');

        setLoading(false);
    }

    async function handleLogout() {
        await supabase.auth.signOut();
    }

    const disposableHours = 24 - parseFloat(sleepHours || '0') - parseFloat(workHours || '0');

    return (
        <ScrollView style={styles.container}>

            <View style={styles.header}>
                <Text style={styles.headerSub}>환경설정</Text>
                <Text style={styles.headerTitle}>설정</Text>
            </View>

            <View style={styles.thickDivider} />

            {/* 기본 정보 */}
            <Text style={styles.sectionLabel}>기본 정보</Text>

            <View style={styles.inputRow}>
                <View style={styles.inputLeft}>
                    <Text style={styles.inputLabel}>수면 시간</Text>
                    <Text style={styles.inputSub}>하루 가처분 시간 계산에 사용</Text>
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

            <View style={styles.thickDivider} />

            {/* 가처분 시간 계산 결과 */}
            <View style={styles.resultBox}>
                <Text style={styles.resultLabel}>오늘의 가처분 시간</Text>
                <Text style={styles.resultValue}>
                    {isNaN(disposableHours) ? '-' : `${disposableHours.toFixed(1)}h`}
                </Text>
                <Text style={styles.resultSub}>24h － 수면 {sleepHours}h － 업무 {workHours}h</Text>
            </View>

            <View style={styles.thickDivider} />
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
                style={[styles.btn, loading && styles.btnDisabled]}
                onPress={saveSettings}
                disabled={loading}
            >
                <Text style={styles.btnText}>
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
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0f0f0f',
        paddingHorizontal: 24,
    },
    header: {
        paddingTop: 72,
        paddingBottom: 24,
    },
    headerSub: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 11,
        color: '#5a5754',
        letterSpacing: 1,
        marginBottom: 6,
    },
    headerTitle: {
        fontFamily: 'GeistMono_500Medium',
        fontSize: 28,
        color: '#f0ede8',
        letterSpacing: -0.5,
    },
    thickDivider: {
        height: 1.5,
        backgroundColor: '#3a3836',
        marginVertical: 12,
    },
    thinDivider: {
        height: 0.5,
        backgroundColor: '#2a2826',
        marginVertical: 4,
    },
    sectionLabel: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 10,
        color: '#5a5754',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        marginBottom: 12,
    },
    inputRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
    },
    inputLeft: {
        flex: 1,
    },
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
        marginBottom: 16,
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
    logoutBtn: {
        padding: 16,
        alignItems: 'center',
    },
    logoutText: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 13,
        color: '#5a5754',
    },
    navBtn: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        backgroundColor: '#161614',
        borderRadius: 10,
        padding: 16,
        marginBottom: 10,
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
});