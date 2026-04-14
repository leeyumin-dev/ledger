import { useState, useCallback, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView,
    TouchableOpacity, TextInput, Alert, Modal,
    KeyboardAvoidingView, Platform
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../src/lib/supabase';
import { AppHeader } from '../../src/components/AppHeader';
import { useSyncedAt } from '../../src/lib/SyncContext';
import { AppTokenLabel } from '../../src/components/AppTokenLabel';
import { isTokenKey } from '../../src/lib/screenTime';

type AppUsage = {
    id: string;
    app_name: string;
    duration_minutes: number;
    category: string;
    source: 'auto' | 'manual' | null;
};

type BudgetWarning = {
    app_name: string;
    ratio: number;
    used_minutes: number;
    budget_minutes: number;
};

function getWarningColor(ratio: number) {
    if (ratio >= 1.2) return '#ff4444';
    if (ratio >= 1.0) return '#f87171';
    if (ratio >= 0.9) return '#fb923c';
    return '#fbbf24';
}

function getWarningBg(ratio: number) {
    if (ratio >= 1.0) return 'rgba(248,113,113,0.08)';
    return 'rgba(251,191,36,0.06)';
}

function getWarningBorder(ratio: number) {
    if (ratio >= 1.0) return 'rgba(248,113,113,0.25)';
    return 'rgba(251,191,36,0.2)';
}

function fmt(m: number) {
    return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function TodayScreen() {
    const [sleepHours, setSleepHours] = useState(7.5);
    const [workHours, setWorkHours] = useState(8.0);
    const [usageList, setUsageList] = useState<AppUsage[]>([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [budgetWarnings, setBudgetWarnings] = useState<BudgetWarning[]>([]);
    const [warningExpanded, setWarningExpanded] = useState(false);

    const [newAppName, setNewAppName] = useState('');
    const [newMinutes, setNewMinutes] = useState('');
    const [newCategory, setNewCategory] = useState('소비');
    const [categoryList, setCategoryList] = useState<{ app_name: string, category: string }[]>([]);
    const [autoTrackedApps, setAutoTrackedApps] = useState<Set<string>>(new Set());
    const [nudgeVisible, setNudgeVisible] = useState(false);

    const syncedAt = useSyncedAt();
    const isFocused = useRef(false);

    const today = new Date().toISOString().split('T')[0];
    const todayLabel = new Date().toLocaleDateString('ko-KR', {
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
    });

    useFocusEffect(
        useCallback(() => {
            isFocused.current = true;
            loadData();
            return () => { isFocused.current = false; };
        }, [])
    );

    useEffect(() => {
        if (syncedAt > 0 && isFocused.current) {
            loadData();
        }
    }, [syncedAt]);

    async function loadData(latestApp: string = '') {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const [settingsRes, usageRes, categoryRes] = await Promise.all([
            supabase.from('user_settings').select('sleep_hours, work_hours').eq('user_id', user.id).single(),
            supabase.from('app_usage').select('*').eq('user_id', user.id).eq('date', today),
            supabase.from('app_categories').select('app_name, category, budget_minutes').eq('user_id', user.id),
        ]);

        if (settingsRes.data) {
            setSleepHours(settingsRes.data.sleep_hours);
            setWorkHours(settingsRes.data.work_hours);
        }

        const usageData = usageRes.data ?? [];
        const categoryData = categoryRes.data ?? [];

        setUsageList(usageData);
        // 수동 입력 자동완성용 — 토큰 키 제외
        setCategoryList(categoryData
            .filter(c => !isTokenKey(c.app_name))
            .map(c => ({ app_name: c.app_name, category: c.category }))
        );

        const autoApps = new Set<string>(
            usageData.filter(u => u.source === 'auto').map(u => u.app_name)
        );
        setAutoTrackedApps(autoApps);

        // 넛지: 토큰 앱이 있고 아직 안 본 경우 표시
        const hasTokenApps = categoryData.some(c => isTokenKey(c.app_name));
        if (hasTokenApps) {
            const nudgeKey = `ledger_category_nudge_${user.id}`;
            const seen = await AsyncStorage.getItem(nudgeKey);
            if (!seen) setNudgeVisible(true);
        }

        const warnings = categoryData
            .filter(c => c.budget_minutes > 0)
            .map(c => {
                const usage = usageData.find(u => u.app_name === c.app_name);
                const used = usage ? usage.duration_minutes : 0;
                const ratio = used / c.budget_minutes;
                return { app_name: c.app_name, ratio, used_minutes: used, budget_minutes: c.budget_minutes };
            })
            .filter(w => w.ratio >= 0.8)
            .sort((a, b) => {
                if (a.app_name === latestApp) return -1;
                if (b.app_name === latestApp) return 1;
                return b.ratio - a.ratio;
            });

        setBudgetWarnings(warnings);
    }

    async function addUsage() {
        if (!newAppName || !newMinutes) {
            Alert.alert('입력 오류', '앱 이름과 시간을 입력해주세요.');
            return;
        }
        if (autoTrackedApps.has(newAppName)) {
            Alert.alert('자동 추적 중', '이 앱은 자동으로 추적 중이에요.');
            return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const addMinutes = parseInt(newMinutes);
        const appName = newAppName;

        const { data: existing } = await supabase
            .from('app_usage')
            .select('id, duration_minutes')
            .eq('user_id', user.id)
            .eq('date', today)
            .eq('app_name', appName)
            .single();

        if (existing) {
            await supabase
                .from('app_usage')
                .update({ duration_minutes: existing.duration_minutes + addMinutes })
                .eq('id', existing.id);
        } else {
            await supabase
                .from('app_usage')
                .insert({
                    user_id: user.id,
                    date: today,
                    app_name: appName,
                    duration_minutes: addMinutes,
                    category: newCategory,
                });
        }

        setNewAppName('');
        setNewMinutes('');
        setNewCategory('소비');
        setModalVisible(false);

        await loadData(appName);
    }

    async function dismissNudge(navigate: boolean) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) await AsyncStorage.setItem(`ledger_category_nudge_${user.id}`, '1');
        setNudgeVisible(false);
        if (navigate) router.push('/category-settings');
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
    const essentialMinutes = usageList.filter(u => u.category === '필수').reduce((s, u) => s + u.duration_minutes, 0);
    const lossHours = Math.floor(lossMinutes / 60);
    const lossMins = lossMinutes % 60;
    const investHours = Math.floor(investMinutes / 60);
    const investMins = investMinutes % 60;
    const netMinutes = Math.round(disposable * 60) - lossMinutes - essentialMinutes + investMinutes;
    const netHours = Math.abs(Math.floor(netMinutes / 60));
    const netMins = Math.abs(netMinutes % 60);
    const isProfit = netMinutes >= 0;

    return (
        <View style={{ flex: 1, backgroundColor: '#0f0f0f' }}>
            <AppHeader />
            <ScrollView style={styles.container}>

                <View style={styles.header}>
                    <Text style={styles.headerSub}>{todayLabel}</Text>
                    <Text style={styles.headerTitle}>손익계산서</Text>
                </View>

                {/* 카테고리 설정 넛지 */}
                {nudgeVisible && (
                    <TouchableOpacity style={styles.nudgeBox} onPress={() => dismissNudge(true)} activeOpacity={0.8}>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.nudgeTitle}>앱 카테고리와 예산을 설정해보세요</Text>
                            <Text style={styles.nudgeSub}>추가한 앱의 카테고리 분류와 일일 예산을 설정하면{'\n'}손익계산서가 더 정확해져요</Text>
                        </View>
                        <TouchableOpacity onPress={() => dismissNudge(false)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Text style={styles.nudgeDismiss}>✕</Text>
                        </TouchableOpacity>
                    </TouchableOpacity>
                )}

                {/* 예산 경고 배너 */}
                {budgetWarnings.length > 0 && (() => {
                    const first = budgetWarnings[0];
                    const rest = budgetWarnings.slice(1);
                    const color = getWarningColor(first.ratio);
                    const pct = Math.round(first.ratio * 100);
                    const barWidth = Math.min(first.ratio * 100, 100);
                    const status = first.ratio >= 1 ? '예산 초과' : `${pct}% 소진`;

                    return (
                        <View style={[
                            styles.warnBox,
                            { backgroundColor: getWarningBg(first.ratio), borderColor: getWarningBorder(first.ratio) }
                        ]}>
                            <View style={styles.warnMain}>
                                <View style={[styles.warnDot, { backgroundColor: color }]} />
                                {isTokenKey(first.app_name) ? (
                                    <AppTokenLabel
                                        tokenKey={first.app_name}
                                        color={color}
                                        fontSize={11}
                                        style={{ width: 18, height: 18 }}
                                    />
                                ) : (
                                    <Text style={[styles.warnName, { color }]}>{first.app_name}</Text>
                                )}
                                <Text style={[styles.warnStatus, { color }]}>{status}</Text>
                                <Text style={[styles.warnPct, { color }]}>
                                    {fmt(first.used_minutes)} / {fmt(first.budget_minutes)} · {pct}%
                                </Text>
                            </View>

                            <View style={styles.warnBarBg}>
                                <View style={[styles.warnBar, { width: `${barWidth}%` as any, backgroundColor: color }]} />
                            </View>

                            {rest.length > 0 && (
                                <>
                                    <TouchableOpacity
                                        style={styles.warnToggle}
                                        onPress={() => setWarningExpanded(prev => !prev)}
                                    >
                                        <Text style={[styles.warnToggleText, { color: `${color}99` }]}>
                                            {warningExpanded ? `외 ${rest.length}개 접기` : `외 ${rest.length}개 더 보기`}
                                        </Text>
                                        <Text style={[styles.warnArrow, { color: `${color}99` }]}>
                                            {warningExpanded ? '▲' : '▼'}
                                        </Text>
                                    </TouchableOpacity>

                                    {warningExpanded && rest.map(w => {
                                        const c = getWarningColor(w.ratio);
                                        const p = Math.round(w.ratio * 100);
                                        const s = w.ratio >= 1 ? '초과' : `${p}% 소진`;
                                        return (
                                            <View key={w.app_name} style={styles.warnExtraItem}>
                                                <View style={[styles.warnDot, { backgroundColor: c }]} />
                                                {isTokenKey(w.app_name) ? (
                                                    <AppTokenLabel
                                                        tokenKey={w.app_name}
                                                        color={c}
                                                        fontSize={10}
                                                        style={{ width: 16, height: 16 }}
                                                    />
                                                ) : (
                                                    <Text style={[styles.warnExtraName, { color: c }]}>{w.app_name}</Text>
                                                )}
                                                <Text style={[styles.warnExtraStatus, { color: c }]}>{s}</Text>
                                                <Text style={[styles.warnExtraPct, { color: c }]}>
                                                    {fmt(w.used_minutes)} / {fmt(w.budget_minutes)} · {p}%
                                                </Text>
                                            </View>
                                        );
                                    })}
                                </>
                            )}
                        </View>
                    );
                })()}

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
                    <TouchableOpacity key={u.id} onLongPress={() => u.source !== 'auto' && deleteUsage(u.id)} delayLongPress={500} activeOpacity={0.7}>
                        <Row
                            label={isTokenKey(u.app_name)
                                ? <AppTokenLabel tokenKey={u.app_name} color="#9a9690" fontSize={13} style={{ width: 20, height: 20 }} />
                                : u.app_name
                            }
                            value={`${Math.floor(u.duration_minutes / 60)}h ${u.duration_minutes % 60}m`}
                            indent loss auto={u.source === 'auto'}
                        />
                    </TouchableOpacity>
                ))}
                {usageList.filter(u => u.category === '소비').length === 0 && (
                    <Text style={styles.emptyRow}>지출 없음</Text>
                )}

                {/* 투자 */}
                <Text style={[styles.sectionLabel, { marginTop: 16 }]}>시간 투자</Text>
                {usageList.filter(u => u.category === '투자').map(u => (
                    <TouchableOpacity key={u.id} onLongPress={() => u.source !== 'auto' && deleteUsage(u.id)} delayLongPress={500} activeOpacity={0.7}>
                        <Row
                            label={isTokenKey(u.app_name)
                                ? <AppTokenLabel tokenKey={u.app_name} color="#9a9690" fontSize={13} style={{ width: 20, height: 20 }} />
                                : u.app_name
                            }
                            value={`${Math.floor(u.duration_minutes / 60)}h ${u.duration_minutes % 60}m`}
                            indent profit auto={u.source === 'auto'}
                        />
                    </TouchableOpacity>
                ))}
                {usageList.filter(u => u.category === '투자').length === 0 && (
                    <Text style={styles.emptyRow}>투자 없음</Text>
                )}

                {/* 필수 */}
                <Text style={[styles.sectionLabel, { marginTop: 16 }]}>필수 지출</Text>
                {usageList.filter(u => u.category === '필수').map(u => (
                    <TouchableOpacity key={u.id} onLongPress={() => u.source !== 'auto' && deleteUsage(u.id)} delayLongPress={500} activeOpacity={0.7}>
                        <Row
                            label={isTokenKey(u.app_name)
                                ? <AppTokenLabel tokenKey={u.app_name} color="#9a9690" fontSize={13} style={{ width: 20, height: 20 }} />
                                : u.app_name
                            }
                            value={`${Math.floor(u.duration_minutes / 60)}h ${u.duration_minutes % 60}m`}
                            indent muted auto={u.source === 'auto'}
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

            <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
                <Text style={styles.fabText}>＋</Text>
            </TouchableOpacity>

            <Modal visible={modalVisible} transparent animationType="slide">
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setModalVisible(false)}>
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
                                {autoTrackedApps.has(newAppName) && (
                                    <Text style={styles.autoTrackWarning}>이 앱은 자동으로 추적 중이에요</Text>
                                )}

                                {newAppName.length > 0 && (
                                    <View style={[styles.quickRow, { marginBottom: 12 }]}>
                                        {categoryList
                                            .filter(item => item.app_name.includes(newAppName) && item.app_name !== newAppName)
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
                                            <Text style={[styles.catText, newCategory === cat && styles.catTextActive]}>{cat}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                <TouchableOpacity
                                    style={[styles.modalBtn, autoTrackedApps.has(newAppName) && styles.modalBtnDisabled]}
                                    onPress={addUsage}
                                    disabled={autoTrackedApps.has(newAppName)}
                                >
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

function Row({ label, value, indent, bold, loss, profit, muted, auto }: {
    label: string | React.ReactNode;
    value: string;
    indent?: boolean; bold?: boolean;
    loss?: boolean; profit?: boolean; muted?: boolean; auto?: boolean;
}) {
    return (
        <View style={[styles.row, indent && styles.rowIndent]}>
            <View style={styles.rowLabelWrap}>
                {typeof label === 'string'
                    ? <Text style={[styles.rowLabel, bold && styles.boldText]}>{label}</Text>
                    : label
                }
                {auto && <Text style={styles.autoBadge}>자동</Text>}
            </View>
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
    nudgeBox: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#161614', borderWidth: 1, borderColor: '#2a2826', borderRadius: 10, padding: 14, marginBottom: 16, gap: 12 },
    nudgeTitle: { fontFamily: 'GeistMono_500Medium', fontSize: 12, color: '#f0ede8', marginBottom: 6 },
    nudgeSub: { fontFamily: 'GeistMono_400Regular', fontSize: 10, color: '#5a5754', lineHeight: 16 },
    nudgeDismiss: { fontFamily: 'GeistMono_400Regular', fontSize: 14, color: '#3a3836' },
    container: { flex: 1, backgroundColor: '#0f0f0f', paddingHorizontal: 24 },
    header: { paddingTop: 20, paddingBottom: 24 },
    headerSub: { fontFamily: 'GeistMono_400Regular', fontSize: 11, color: '#5a5754', letterSpacing: 1, marginBottom: 6 },
    headerTitle: { fontFamily: 'GeistMono_500Medium', fontSize: 28, color: '#f0ede8', letterSpacing: -0.5 },
    thickDivider: { height: 1.5, backgroundColor: '#3a3836', marginVertical: 12 },
    thinDivider: { height: 0.5, backgroundColor: '#2a2826', marginVertical: 8 },
    sectionLabel: { fontFamily: 'GeistMono_400Regular', fontSize: 10, color: '#5a5754', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
    rowIndent: { paddingLeft: 16 },
    rowLabelWrap: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
    rowLabel: { fontFamily: 'GeistMono_400Regular', fontSize: 13, color: '#9a9690' },
    rowValue: { fontFamily: 'GeistMono_400Regular', fontSize: 13, color: '#f0ede8' },
    autoBadge: { fontFamily: 'GeistMono_400Regular', fontSize: 9, color: '#4ade80', borderWidth: 1, borderColor: 'rgba(74,222,128,0.4)', borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
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
    modalBtnDisabled: { backgroundColor: '#2a2826' },
    autoTrackWarning: { fontFamily: 'GeistMono_400Regular', fontSize: 11, color: '#f87171', marginBottom: 8, marginTop: -4 },
    quickLabel: { fontFamily: 'GeistMono_400Regular', fontSize: 10, color: '#5a5754', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 8 },
    quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    quickBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: '#2a2826' },
    quickBtnText: { fontFamily: 'GeistMono_400Regular', fontSize: 12, color: '#5a5754' },
    warnBox: { borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 12 },
    warnMain: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    warnDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
    warnName: { fontFamily: 'GeistMono_500Medium', fontSize: 11, flex: 1 },
    warnStatus: { fontFamily: 'GeistMono_500Medium', fontSize: 11 },
    warnPct: { fontFamily: 'GeistMono_400Regular', fontSize: 10 },
    warnBarBg: { height: 3, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2, marginTop: 7, marginBottom: 4 },
    warnBar: { height: 3, borderRadius: 2 },
    warnToggle: { flexDirection: 'row', alignItems: 'center', paddingTop: 7, marginTop: 4, borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.06)' },
    warnToggleText: { fontFamily: 'GeistMono_400Regular', fontSize: 10, flex: 1 },
    warnArrow: { fontFamily: 'GeistMono_400Regular', fontSize: 9 },
    warnExtraItem: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 6, marginTop: 2, borderTopWidth: 0.5, borderTopColor: 'rgba(255,255,255,0.06)' },
    warnExtraName: { fontFamily: 'GeistMono_400Regular', fontSize: 10, flex: 1 },
    warnExtraStatus: { fontFamily: 'GeistMono_400Regular', fontSize: 10 },
    warnExtraPct: { fontFamily: 'GeistMono_400Regular', fontSize: 10 },
});
