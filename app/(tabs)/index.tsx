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
import { useSyncedAt, useSync } from '../../src/lib/SyncContext';
import { toLocalDateStr, getMonitoringStatus } from '../../src/lib/screenTime';
import { colors, font, fontSize, spacing, radius } from '../../src/lib/theme';

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
    if (ratio >= 1.0) return colors.loss;
    return colors.warning;
}

function getWarningBg(ratio: number) {
    if (ratio >= 1.0) return colors.lossBg;
    return colors.warningBg;
}

function getWarningBorder(ratio: number) {
    if (ratio >= 1.0) return colors.lossBorder;
    return colors.warningBorder;
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
    const [prevNetMinutes, setPrevNetMinutes] = useState<number | null>(null);

    const syncedAt = useSyncedAt();
    const sync = useSync();
    const isFocused = useRef(false);

    const today = toLocalDateStr();
    const yesterday = toLocalDateStr(new Date(Date.now() - 86400000));
    const todayLabel = new Date().toLocaleDateString('ko-KR', {
        year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
    });

    useFocusEffect(
        useCallback(() => {
            isFocused.current = true;
            sync();        // 포커스 시 최신 데이터 동기화
            loadData();
            return () => { isFocused.current = false; };
        }, [sync])
    );

    useEffect(() => {
        if (syncedAt > 0 && isFocused.current) {
            loadData();
        }
    }, [syncedAt]);

    async function loadData(latestApp: string = '') {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const [settingsRes, usageRes, prevUsageRes, categoryRes] = await Promise.all([
            supabase.from('user_settings').select('sleep_hours, work_hours').eq('user_id', user.id).single(),
            supabase.from('app_usage').select('*').eq('user_id', user.id).eq('date', today),
            supabase.from('app_usage').select('duration_minutes, category').eq('user_id', user.id).eq('date', yesterday),
            supabase.from('app_categories').select('app_name, category, budget_minutes').eq('user_id', user.id),
        ]);

        if (settingsRes.data) {
            setSleepHours(settingsRes.data.sleep_hours);
            setWorkHours(settingsRes.data.work_hours);
        }

        const sl = settingsRes.data?.sleep_hours ?? 7.5;
        const wk = settingsRes.data?.work_hours ?? 8.0;
        const prevUsage = prevUsageRes.data ?? [];
        if (prevUsage.length > 0) {
            const pLoss = prevUsage.filter(u => u.category === '소비').reduce((s, u) => s + u.duration_minutes, 0);
            const pInvest = prevUsage.filter(u => u.category === '투자').reduce((s, u) => s + u.duration_minutes, 0);
            const pEssential = prevUsage.filter(u => u.category === '필수').reduce((s, u) => s + u.duration_minutes, 0);
            setPrevNetMinutes(Math.round((24 - sl - wk) * 60) - pLoss - pEssential + pInvest);
        } else {
            setPrevNetMinutes(null);
        }

        const usageData = usageRes.data ?? [];
        const categoryData = categoryRes.data ?? [];

        setUsageList(usageData);
        setCategoryList(categoryData.map(c => ({ app_name: c.app_name, category: c.category })));

        const autoApps = new Set<string>(
            usageData.filter(u => u.source === 'auto').map(u => u.app_name)
        );
        setAutoTrackedApps(autoApps);

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

    async function deleteUsage(id: string, isAuto: boolean) {
        Alert.alert(
            '삭제',
            isAuto ? '자동 추적 항목입니다. 삭제해도 다음 동기화 시 다시 추가될 수 있어요.' : '이 항목을 삭제할까요?',
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
        <View style={{ flex: 1, backgroundColor: colors.bgBase }}>
            <AppHeader />
            <ScrollView style={styles.container}>

                <View style={styles.header}>
                    <Text style={styles.headerSub}>{todayLabel}</Text>
                    <Text style={styles.headerTitle}>손익계산서</Text>
                    {syncedAt > 0 && (
                        <Text style={styles.syncedAtLabel}>
                            {(() => {
                                const diff = Date.now() - syncedAt;
                                if (diff < 60_000) return '방금 동기화됨';
                                if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전 동기화됨`;
                                return `${Math.floor(diff / 3_600_000)}시간 전 동기화됨`;
                            })()}
                        </Text>
                    )}
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
                                <Text style={[styles.warnName, { color }]}>{first.app_name}</Text>
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
                                                <Text style={[styles.warnExtraName, { color: c }]}>{w.app_name}</Text>
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
                    <TouchableOpacity key={u.id} onLongPress={() => deleteUsage(u.id, u.source === 'auto')} delayLongPress={500} activeOpacity={0.7}>
                        <Row
                            label={u.app_name}
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
                    <TouchableOpacity key={u.id} onLongPress={() => deleteUsage(u.id, u.source === 'auto')} delayLongPress={500} activeOpacity={0.7}>
                        <Row
                            label={u.app_name}
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
                    <TouchableOpacity key={u.id} onLongPress={() => deleteUsage(u.id, u.source === 'auto')} delayLongPress={500} activeOpacity={0.7}>
                        <Row
                            label={u.app_name}
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
                    <Text style={[styles.verdictValue, { color: isProfit ? colors.profit : colors.loss }]}>
                        {isProfit ? '＋' : '－'} {netHours}h {netMins}m
                    </Text>
                    {prevNetMinutes !== null && (() => {
                        const diff = netMinutes - prevNetMinutes;
                        const diffAbs = Math.abs(diff);
                        const dh = Math.floor(diffAbs / 60);
                        const dm = diffAbs % 60;
                        const improved = diff > 0;
                        const same = diff === 0;
                        return (
                            <Text style={[styles.verdictDiff, { color: same ? '#5a5754' : improved ? 'rgba(74,222,128,0.6)' : 'rgba(248,113,133,0.6)' }]}>
                                {same ? '전일과 동일' : `전일 대비 ${improved ? '▲' : '▼'} ${dh > 0 ? `${dh}h ` : ''}${dm}m`}
                            </Text>
                        );
                    })()}
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

                                {/* 자동 추적 중인 앱 안내 */}
                                {autoTrackedApps.size > 0 && (
                                    <View style={styles.autoTrackNotice}>
                                        <Text style={styles.autoTrackNoticeLabel}>자동 수집 중 — 추가 불필요</Text>
                                        <View style={styles.autoTrackNoticeList}>
                                            {[...autoTrackedApps].map(name => (
                                                <Text key={name} style={{ fontFamily: font.regular, fontSize: fontSize.sm, color: colors.profit, marginBottom: 2 }}>{name}</Text>
                                            ))}
                                        </View>
                                    </View>
                                )}

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
            </View>
            {auto && <Text style={styles.autoBadge}>자동</Text>}
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
    nudgeBox: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.md, gap: spacing.sm },
    nudgeTitle: { fontFamily: font.medium, fontSize: fontSize.sm, color: colors.textPrimary, marginBottom: 6 },
    nudgeSub: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textMuted, lineHeight: 16 },
    nudgeDismiss: { fontFamily: font.regular, fontSize: fontSize.md, color: colors.textDisabled },
    container: { flex: 1, backgroundColor: colors.bgBase, paddingHorizontal: spacing.lg },
    header: { paddingTop: spacing.md, paddingBottom: spacing.lg },
    headerSub: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 1, marginBottom: 6 },
    headerTitle: { fontFamily: font.medium, fontSize: fontSize.xl, color: colors.textPrimary, letterSpacing: -0.5 },
    syncedAtLabel: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textDisabled, marginTop: 6 },
    thickDivider: { height: 1.5, backgroundColor: colors.border, marginVertical: spacing.sm },
    thinDivider: { height: 0.5, backgroundColor: colors.borderSub, marginVertical: spacing.sm },
    sectionLabel: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: spacing.sm },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
    rowIndent: { paddingLeft: spacing.md },
    rowLabelWrap: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    rowLabel: { fontFamily: font.regular, fontSize: 13, color: colors.textSecondary },
    rowValue: { fontFamily: font.regular, fontSize: 13, color: colors.textPrimary },
    autoBadge: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.profit, borderWidth: 1, borderColor: colors.profitBorder, borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
    boldText: { fontFamily: font.medium, fontSize: fontSize.md, color: colors.textPrimary },
    lossText: { color: colors.loss },
    profitText: { color: colors.profit },
    mutedText: { color: colors.textMuted },
    emptyRow: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.textDisabled, paddingLeft: spacing.md, paddingVertical: 6 },
    verdictBox: { borderRadius: radius.md, padding: spacing.md, alignItems: 'center', borderWidth: 1 },
    verdictLoss: { backgroundColor: colors.lossBg, borderColor: colors.lossBorder },
    verdictProfit: { backgroundColor: colors.profitBg, borderColor: colors.profitBorder },
    verdictLabel: { fontFamily: font.regular, fontSize: fontSize.xs, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: spacing.sm },
    verdictValue: { fontFamily: font.medium, fontSize: fontSize['2xl'], letterSpacing: -0.5 },
    verdictDiff: { fontFamily: font.regular, fontSize: fontSize.xs, marginTop: spacing.sm },
    longPressHint: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textDisabled, textAlign: 'center', marginTop: spacing.md },
    fab: { position: 'absolute', bottom: 32, right: spacing.lg, width: 52, height: 52, borderRadius: 26, backgroundColor: colors.accent, justifyContent: 'center', alignItems: 'center' },
    fabText: { fontSize: 24, color: 'white', lineHeight: 28 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
    modalBox: { backgroundColor: colors.bgSurface, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.lg },
    modalTitle: { fontFamily: font.medium, fontSize: fontSize.lg, color: colors.textPrimary, marginBottom: spacing.md },
    modalInput: { backgroundColor: colors.bgBase, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, color: colors.textPrimary, fontFamily: font.regular, fontSize: fontSize.md, marginBottom: spacing.sm },
    categoryRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.md },
    catBtn: { flex: 1, padding: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    catBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    catText: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.textMuted },
    catTextActive: { color: '#ffffff' },
    modalBtn: { backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: 'center', marginBottom: spacing.sm },
    modalBtnText: { fontFamily: font.medium, fontSize: fontSize.md, color: '#ffffff' },
    modalCancel: { padding: spacing.sm, alignItems: 'center' },
    modalCancelText: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted },
    modalBtnDisabled: { backgroundColor: colors.border },
    autoTrackWarning: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.loss, marginBottom: spacing.sm, marginTop: -4 },
    autoTrackNotice: { backgroundColor: colors.profitBg, borderWidth: 1, borderColor: colors.profitBorder, borderRadius: radius.sm, padding: 10, marginBottom: spacing.md },
    autoTrackNoticeLabel: { fontFamily: font.regular, fontSize: fontSize.xs, color: `${colors.profit}99`, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: spacing.sm },
    autoTrackNoticeList: { gap: 2 },
    quickLabel: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: spacing.sm },
    quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    quickBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: colors.border },
    quickBtnText: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.textMuted },
    warnBox: { borderWidth: 1, borderRadius: radius.md, padding: spacing.sm, marginBottom: spacing.sm },
    warnMain: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    warnDot: { width: 6, height: 6, borderRadius: 3, flexShrink: 0 },
    warnName: { fontFamily: font.medium, fontSize: fontSize.xs, flex: 1 },
    warnStatus: { fontFamily: font.medium, fontSize: fontSize.xs },
    warnPct: { fontFamily: font.regular, fontSize: fontSize.xs },
    warnBarBg: { height: 3, backgroundColor: colors.borderSub, borderRadius: 2, marginTop: 7, marginBottom: 4 },
    warnBar: { height: 3, borderRadius: 2 },
    warnToggle: { flexDirection: 'row', alignItems: 'center', paddingTop: 7, marginTop: 4, borderTopWidth: 0.5, borderTopColor: colors.borderSub },
    warnToggleText: { fontFamily: font.regular, fontSize: fontSize.xs, flex: 1 },
    warnArrow: { fontFamily: font.regular, fontSize: fontSize.xs },
    warnExtraItem: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 6, marginTop: 2, borderTopWidth: 0.5, borderTopColor: colors.borderSub },
    warnExtraName: { fontFamily: font.regular, fontSize: fontSize.xs, flex: 1 },
    warnExtraStatus: { fontFamily: font.regular, fontSize: fontSize.xs },
    warnExtraPct: { fontFamily: font.regular, fontSize: fontSize.xs },
});
