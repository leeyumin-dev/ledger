import { useState, useCallback } from 'react';
import {
    View, Text, StyleSheet, ScrollView,
    TouchableOpacity, TextInput, Alert, Modal,
    KeyboardAvoidingView, Platform
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { supabase } from '../../src/lib/supabase';

type AppUsage = {
    id: string;
    app_name: string;
    duration_minutes: number;
    category: string;
};

export default function TodayScreen() {
    const [sleepHours, setSleepHours] = useState(7.5);
    const [workHours, setWorkHours] = useState(8.0);
    const [usageList, setUsageList] = useState<AppUsage[]>([]);
    const [loading, setLoading] = useState(false);
    const [modalVisible, setModalVisible] = useState(false);

    const [newAppName, setNewAppName] = useState('');
    const [newMinutes, setNewMinutes] = useState('');
    const [newCategory, setNewCategory] = useState('소비');
    const [categoryList, setCategoryList] = useState<{ app_name: string, category: string }[]>([]);

    const today = new Date().toISOString().split('T')[0];

    const todayLabel = new Date().toLocaleDateString('ko-KR', {
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
    });

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [])
    );

    async function loadData() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const [settingsRes, usageRes, categoryRes] = await Promise.all([
            supabase.from('user_settings').select('sleep_hours, work_hours').eq('user_id', user.id).single(),
            supabase.from('app_usage').select('*').eq('user_id', user.id).eq('date', today),
            supabase.from('app_categories').select('app_name, category').eq('user_id', user.id).order('app_name'),
        ]);

        if (settingsRes.data) {
            setSleepHours(settingsRes.data.sleep_hours);
            setWorkHours(settingsRes.data.work_hours);
        }
        if (usageRes.data) setUsageList(usageRes.data);
        if (categoryRes.data) setCategoryList(categoryRes.data);
    }

    async function fetchCategory(appName: string) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
            .from('app_categories')
            .select('category')
            .eq('user_id', user.id)
            .eq('app_name', appName)
            .single();

        if (data) setNewCategory(data.category);
    }

    async function addUsage() {
        if (!newAppName || !newMinutes) {
            Alert.alert('입력 오류', '앱 이름과 시간을 입력해주세요.');
            return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const addMinutes = parseInt(newMinutes);

        // 기존 데이터 조회
        const { data: existing } = await supabase
            .from('app_usage')
            .select('id, duration_minutes')
            .eq('user_id', user.id)
            .eq('date', today)
            .eq('app_name', newAppName)
            .single();

        if (existing) {
            // 있으면 누적해서 업데이트
            await supabase
                .from('app_usage')
                .update({ duration_minutes: existing.duration_minutes + addMinutes })
                .eq('id', existing.id);
        } else {
            // 없으면 새로 insert
            await supabase
                .from('app_usage')
                .insert({
                    user_id: user.id,
                    date: today,
                    app_name: newAppName,
                    duration_minutes: addMinutes,
                    category: newCategory,
                });
        }

        setNewAppName('');
        setNewMinutes('');
        setNewCategory('소비');
        setModalVisible(false);
        loadData();
    }

    async function deleteUsage(id: string) {
        Alert.alert(
            '삭제',
            '이 항목을 삭제할까요?',
            [
                { text: '취소', style: 'cancel' },
                {
                    text: '삭제',
                    style: 'destructive',
                    onPress: async () => {
                        await supabase.from('app_usage').delete().eq('id', id);
                        loadData();
                    }
                }
            ]
        );
    }

    const disposable = 24 - sleepHours - workHours;
    const lossMinutes = usageList.filter(u => u.category === '소비').reduce((s, u) => s + u.duration_minutes, 0);
    const investMinutes = usageList.filter(u => u.category === '투자').reduce((s, u) => s + u.duration_minutes, 0);
    const lossHours = Math.floor(lossMinutes / 60);
    const lossMins = lossMinutes % 60;
    const investHours = Math.floor(investMinutes / 60);
    const investMins = investMinutes % 60;
    const essentialMinutes = usageList.filter(u => u.category === '필수').reduce((s, u) => s + u.duration_minutes, 0);
    const netMinutes = Math.round(disposable * 60) - lossMinutes - essentialMinutes + investMinutes;
    const netHours = Math.abs(Math.floor(netMinutes / 60));
    const netMins = Math.abs(netMinutes % 60);
    const isProfit = netMinutes >= 0;

    return (
        <View style={{ flex: 1, backgroundColor: '#0f0f0f' }}>
            <ScrollView style={styles.container}>

                <View style={styles.header}>
                    <Text style={styles.headerSub}>{todayLabel}</Text>
                    <Text style={styles.headerTitle}>손익계산서</Text>
                </View>

                <View style={styles.thickDivider} />

                {/* 수입 */}
                <Text style={styles.sectionLabel}>시간 수입</Text>
                <Row label="하루 가용 시간" value="24h 00m" bold />
                <Row label="수면 (필수)" value={`－ ${sleepHours}h`} indent muted />
                <Row label="업무" value={`－ ${workHours}h`} indent muted />
                <View style={styles.thinDivider} />
                <Row label="가처분 시간" value={`${disposable.toFixed(1)}h`} bold />

                {/* 지출 */}
                <Text style={[styles.sectionLabel, { marginTop: 16 }]}>시간 지출</Text>
                {usageList.filter(u => u.category === '소비').map(u => (
                    <TouchableOpacity
                        key={u.id}
                        onLongPress={() => deleteUsage(u.id)}
                        delayLongPress={500}
                        activeOpacity={0.7}
                    >
                        <Row
                            label={u.app_name}
                            value={`${Math.floor(u.duration_minutes / 60)}h ${u.duration_minutes % 60}m`}
                            indent loss
                        />
                    </TouchableOpacity>
                ))}
                {usageList.filter(u => u.category === '소비').length === 0 && (
                    <Text style={styles.emptyRow}>지출 없음</Text>
                )}

                {/* 투자 */}
                <Text style={[styles.sectionLabel, { marginTop: 16 }]}>시간 투자</Text>
                {usageList.filter(u => u.category === '투자').map(u => (
                    <TouchableOpacity
                        key={u.id}
                        onLongPress={() => deleteUsage(u.id)}
                        delayLongPress={500}
                        activeOpacity={0.7}
                    >
                        <Row
                            label={u.app_name}
                            value={`${Math.floor(u.duration_minutes / 60)}h ${u.duration_minutes % 60}m`}
                            indent profit
                        />
                    </TouchableOpacity>
                ))}
                {usageList.filter(u => u.category === '투자').length === 0 && (
                    <Text style={styles.emptyRow}>투자 없음</Text>
                )}
                {/* 필수 */}
                <Text style={[styles.sectionLabel, { marginTop: 16 }]}>필수 지출</Text>
                {usageList.filter(u => u.category === '필수').map(u => (
                    <TouchableOpacity
                        key={u.id}
                        onLongPress={() => deleteUsage(u.id)}
                        delayLongPress={500}
                        activeOpacity={0.7}
                    >
                        <Row
                            label={u.app_name}
                            value={`${Math.floor(u.duration_minutes / 60)}h ${u.duration_minutes % 60}m`}
                            indent
                            muted
                        />
                    </TouchableOpacity>
                ))}
                {usageList.filter(u => u.category === '필수').length === 0 && (
                    <Text style={styles.emptyRow}>필수 지출 없음</Text>
                )}

                <View style={styles.thinDivider} />
                <Row label="총 지출" value={`${lossHours}h ${lossMins}m`} bold loss />
                <Row label="총 투자" value={`${investHours}h ${investMins}m`} bold profit />

                <View style={styles.thickDivider} />

                {/* 순이익/손실 */}
                <View style={[styles.verdictBox, isProfit ? styles.verdictProfit : styles.verdictLoss]}>
                    <Text style={[styles.verdictLabel, { color: isProfit ? 'rgba(74,222,128,0.7)' : 'rgba(248,113,133,0.7)' }]}>
                        {isProfit ? '당기 순이익' : '당기 순손실'}
                    </Text>
                    <Text style={[styles.verdictValue, { color: isProfit ? '#4ade80' : '#f87171' }]}>
                        {isProfit ? '＋' : '－'} {netHours}h {netMins}m
                    </Text>
                </View>

                <Text style={styles.longPressHint}>항목을 길게 누르면 삭제돼요</Text>

                <View style={{ height: 100 }} />

            </ScrollView>

            {/* 추가 버튼 */}
            <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
                <Text style={styles.fabText}>＋</Text>
            </TouchableOpacity>

            {/* 입력 모달 */}
            <Modal visible={modalVisible} transparent animationType="slide">
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                >
                    <TouchableOpacity
                        style={styles.modalOverlay}
                        activeOpacity={1}
                        onPress={() => setModalVisible(false)}
                    >
                        <TouchableOpacity activeOpacity={1} onPress={() => { }}>
                            <View style={styles.modalBox}>
                                <Text style={styles.modalTitle}>앱 사용 시간 추가</Text>

                                <Text style={styles.quickLabel}>앱 이름</Text>
                                <TextInput
                                    style={styles.modalInput}
                                    placeholder="앱 이름 입력 또는 아래에서 선택"
                                    placeholderTextColor="#5a5754"
                                    value={newAppName}
                                    onChangeText={(text) => {
                                        setNewAppName(text);
                                        const matched = categoryList.find(item => item.app_name === text);
                                        if (matched) setNewCategory(matched.category);
                                    }}
                                />

                                {newAppName.length > 0 && (
                                    <View style={[styles.quickRow, { marginBottom: 12 }]}>
                                        {categoryList
                                            .filter(item =>
                                                item.app_name.includes(newAppName) &&
                                                item.app_name !== newAppName
                                            )
                                            .slice(0, 5)
                                            .map(item => (
                                                <TouchableOpacity
                                                    key={item.app_name}
                                                    style={styles.quickBtn}
                                                    onPress={() => {
                                                        setNewAppName(item.app_name);
                                                        setNewCategory(item.category);
                                                    }}
                                                >
                                                    <Text style={styles.quickBtnText}>{item.app_name}</Text>
                                                </TouchableOpacity>
                                            ))
                                        }
                                    </View>
                                )}

                                <TextInput
                                    style={styles.modalInput}
                                    placeholder="사용 시간 (분 단위, 예: 90)"
                                    placeholderTextColor="#5a5754"
                                    value={newMinutes}
                                    onChangeText={setNewMinutes}
                                    keyboardType="number-pad"
                                />

                                <View style={styles.categoryRow}>
                                    {['소비', '투자', '필수'].map(cat => (
                                        <TouchableOpacity
                                            key={cat}
                                            style={[styles.catBtn, newCategory === cat && styles.catBtnActive]}
                                            onPress={() => setNewCategory(cat)}
                                        >
                                            <Text style={[styles.catText, newCategory === cat && styles.catTextActive]}>
                                                {cat}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                <TouchableOpacity style={styles.modalBtn} onPress={addUsage}>
                                    <Text style={styles.modalBtnText}>추가하기</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={styles.modalCancel} onPress={() => setModalVisible(false)}>
                                    <Text style={styles.modalCancelText}>취소</Text>
                                </TouchableOpacity>
                            </View>
                        </TouchableOpacity>
                    </TouchableOpacity>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

function Row({ label, value, indent, bold, loss, profit, muted }: {
    label: string; value: string;
    indent?: boolean; bold?: boolean;
    loss?: boolean; profit?: boolean; muted?: boolean;
}) {
    return (
        <View style={[styles.row, indent && styles.rowIndent]}>
            <Text style={[styles.rowLabel, bold && styles.boldText]}>{label}</Text>
            <Text style={[
                styles.rowValue,
                bold && styles.boldText,
                loss && styles.lossText,
                profit && styles.profitText,
                muted && styles.mutedText,
            ]}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f0f0f', paddingHorizontal: 24 },
    loadingContainer: { flex: 1, backgroundColor: '#0f0f0f', justifyContent: 'center', alignItems: 'center' },
    loadingText: { fontFamily: 'GeistMono_400Regular', fontSize: 13, color: '#5a5754' },
    header: { paddingTop: 72, paddingBottom: 24 },
    headerSub: { fontFamily: 'GeistMono_400Regular', fontSize: 11, color: '#5a5754', letterSpacing: 1, marginBottom: 6 },
    headerTitle: { fontFamily: 'GeistMono_500Medium', fontSize: 28, color: '#f0ede8', letterSpacing: -0.5 },
    thickDivider: { height: 1.5, backgroundColor: '#3a3836', marginVertical: 12 },
    thinDivider: { height: 0.5, backgroundColor: '#2a2826', marginVertical: 8 },
    sectionLabel: { fontFamily: 'GeistMono_400Regular', fontSize: 10, color: '#5a5754', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
    rowIndent: { paddingLeft: 16 },
    rowLabel: { fontFamily: 'GeistMono_400Regular', fontSize: 13, color: '#9a9690' },
    rowValue: { fontFamily: 'GeistMono_400Regular', fontSize: 13, color: '#f0ede8' },
    boldText: { fontFamily: 'GeistMono_500Medium', fontSize: 14, color: '#f0ede8' },
    lossText: { color: '#f87171' },
    profitText: { color: '#4ade80' },
    mutedText: { color: '#5a5754' },
    emptyRow: { fontFamily: 'GeistMono_400Regular', fontSize: 12, color: '#3a3836', paddingLeft: 16, paddingVertical: 6 },
    verdictBox: { borderRadius: 12, padding: 20, alignItems: 'center', borderWidth: 1 },
    verdictLoss: { backgroundColor: 'rgba(248,113,133,0.1)', borderColor: 'rgba(248,113,133,0.2)' },
    verdictProfit: { backgroundColor: 'rgba(74,222,128,0.1)', borderColor: 'rgba(74,222,128,0.2)' },
    verdictLabel: { fontFamily: 'GeistMono_400Regular', fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 },
    verdictValue: { fontFamily: 'GeistMono_500Medium', fontSize: 32, letterSpacing: -0.5 },
    longPressHint: { fontFamily: 'GeistMono_400Regular', fontSize: 10, color: '#3a3836', textAlign: 'center', marginTop: 16 },
    fab: { position: 'absolute', bottom: 32, right: 24, width: 52, height: 52, borderRadius: 26, backgroundColor: '#e8410a', justifyContent: 'center', alignItems: 'center' },
    fabText: { fontSize: 24, color: 'white', lineHeight: 28 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    modalBox: { backgroundColor: '#161614', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
    modalTitle: { fontFamily: 'GeistMono_500Medium', fontSize: 16, color: '#f0ede8', marginBottom: 20 },
    modalInput: { backgroundColor: '#0f0f0f', borderWidth: 1, borderColor: '#2a2826', borderRadius: 10, padding: 14, color: '#f0ede8', fontFamily: 'GeistMono_400Regular', fontSize: 14, marginBottom: 12 },
    categoryRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
    catBtn: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#2a2826', alignItems: 'center' },
    catBtnActive: { backgroundColor: '#e8410a', borderColor: '#e8410a' },
    catText: { fontFamily: 'GeistMono_400Regular', fontSize: 12, color: '#5a5754' },
    catTextActive: { color: '#ffffff' },
    modalBtn: { backgroundColor: '#e8410a', borderRadius: 10, padding: 16, alignItems: 'center', marginBottom: 8 },
    modalBtnText: { fontFamily: 'GeistMono_500Medium', fontSize: 14, color: '#ffffff' },
    modalCancel: { padding: 12, alignItems: 'center' },
    modalCancelText: { fontFamily: 'GeistMono_400Regular', fontSize: 13, color: '#5a5754' },
    quickApps: {
        marginBottom: 14,
    },
    quickLabel: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 10,
        color: '#5a5754',
        letterSpacing: 1.2,
        textTransform: 'uppercase',
        marginBottom: 8,
    },
    quickRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 6,
    },
    quickBtn: {
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#2a2826',
    },
    quickBtnActive: {
        backgroundColor: '#e8410a',
        borderColor: '#e8410a',
    },
    quickBtnText: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 12,
        color: '#5a5754',
    },
    quickBtnTextActive: {
        color: '#ffffff',
    },
});