import { useState, useCallback, useEffect, useRef } from 'react';
import {
    View, Text, StyleSheet, ScrollView,
    TouchableOpacity, TextInput, Alert, Modal,
    KeyboardAvoidingView, Platform, Dimensions
} from 'react-native';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '../../src/lib/supabase';
import { AppHeader } from '../../src/components/AppHeader';
import { useSyncedAt, useSync } from '../../src/lib/SyncContext';
import { toLocalDateStr } from '../../src/lib/screenTime';
import { colors, font, fontSize, spacing, radius, shadows, gradients } from '../../src/lib/theme';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

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

function fmt(m: number) {
    const absM = Math.abs(m);
    const h = Math.floor(absM / 60);
    const mm = absM % 60;
    if (h === 0) return `${mm}m`;
    return `${h}h ${mm}m`;
}

export default function TodayScreen() {
    const params = useLocalSearchParams<{ date?: string }>();
    const targetDate = params.date || toLocalDateStr();
    
    const [sleepHours, setSleepHours] = useState(7.5);
    const [workHours, setWorkHours] = useState(8.0);
    const [usageList, setUsageList] = useState<AppUsage[]>([]);
    const [modalVisible, setModalVisible] = useState(false);
    const [budgetWarnings, setBudgetWarnings] = useState<BudgetWarning[]>([]);
    
    const [newAppName, setNewAppName] = useState('');
    const [newMinutes, setNewMinutes] = useState('');
    const [newCategory, setNewCategory] = useState('소비');
    const [prevNetMinutes, setPrevNetMinutes] = useState<number | null>(null);

    const syncedAt = useSyncedAt();
    const sync = useSync();
    const isFocused = useRef(false);

    const dateObj = new Date(targetDate + 'T00:00:00');
    const dateLabel = dateObj.toLocaleDateString('ko-KR', {
        month: 'short', day: 'numeric', weekday: 'short'
    }).toUpperCase();
    const isToday = targetDate === toLocalDateStr();

    useFocusEffect(
        useCallback(() => {
            isFocused.current = true;
            if (isToday) sync();
            loadData();
            return () => { isFocused.current = false; };
        }, [targetDate, sync])
    );

    useEffect(() => {
        if (syncedAt > 0 && isFocused.current && isToday) {
            loadData();
        }
    }, [syncedAt]);

    async function loadData() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const yesterdayObj = new Date(dateObj);
        yesterdayObj.setDate(yesterdayObj.getDate() - 1);
        const yesterdayStr = yesterdayObj.toISOString().split('T')[0];

        const [settingsRes, usageRes, prevUsageRes, categoryRes] = await Promise.all([
            supabase.from('user_settings').select('sleep_hours, work_hours').eq('user_id', user.id).single(),
            supabase.from('app_usage').select('*').eq('user_id', user.id).eq('date', targetDate),
            supabase.from('app_usage').select('duration_minutes, category').eq('user_id', user.id).eq('date', yesterdayStr),
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

        setUsageList(usageRes.data ?? []);

        const warnings = (categoryRes.data ?? [])
            .filter(c => c.budget_minutes > 0)
            .map(c => {
                const usage = (usageRes.data ?? []).find(u => u.app_name === c.app_name);
                const used = usage ? usage.duration_minutes : 0;
                return { app_name: c.app_name, ratio: used / c.budget_minutes, used_minutes: used, budget_minutes: c.budget_minutes };
            })
            .filter(w => w.ratio >= 0.8)
            .sort((a, b) => b.ratio - a.ratio);

        setBudgetWarnings(warnings);
    }

    async function addUsage() {
        if (!newAppName || !newMinutes) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const addMinutes = parseInt(newMinutes);
        const { data: existing } = await supabase.from('app_usage').select('id, duration_minutes').eq('user_id', user.id).eq('date', targetDate).eq('app_name', newAppName).single();
        if (existing) await supabase.from('app_usage').update({ duration_minutes: existing.duration_minutes + addMinutes }).eq('id', existing.id);
        else await supabase.from('app_usage').insert({ user_id: user.id, date: targetDate, app_name: newAppName, duration_minutes: addMinutes, category: newCategory });
        setNewAppName(''); setNewMinutes(''); setModalVisible(false);
        await loadData();
    }

    async function deleteUsage(id: string) {
        Alert.alert('삭제', '이 항목을 삭제할까요?', [
            { text: '취소', style: 'cancel' },
            { text: '삭제', style: 'destructive', onPress: async () => { await supabase.from('app_usage').delete().eq('id', id); loadData(); } }
        ]);
    }

    const disposable = 24 - sleepHours - workHours;
    const lossMinutes = usageList.filter(u => u.category === '소비').reduce((s, u) => s + u.duration_minutes, 0);
    const investMinutes = usageList.filter(u => u.category === '투자').reduce((s, u) => s + u.duration_minutes, 0);
    const essentialMinutes = usageList.filter(u => u.category === '필수').reduce((s, u) => s + u.duration_minutes, 0);
    const netMinutes = Math.round(disposable * 60) - lossMinutes - essentialMinutes + investMinutes;
    const isProfit = netMinutes >= 0;

    return (
        <View style={{ flex: 1, backgroundColor: colors.bgBase }}>
            <LinearGradient
                colors={isProfit ? ['rgba(74,222,128,0.06)', 'transparent'] : ['rgba(248,113,113,0.06)', 'transparent']}
                style={styles.glow}
                start={{ x: 0.5, y: 0 }}
                end={{ x: 0.5, y: 1 }}
            />
            
            <AppHeader />

            <ScrollView style={styles.container} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
                
                <View style={styles.header}>
                    <View style={styles.headerTopRow}>
                        <Text style={styles.dateLabel}>{dateLabel}</Text>
                        {isToday ? (syncedAt > 0 && <Text style={styles.syncedLabel}>방금 동기화됨</Text>) : (
                            <TouchableOpacity onPress={() => router.setParams({ date: undefined })}>
                                <Text style={[styles.syncedLabel, { color: colors.accent }]}>오늘로 돌아가기</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    <Text style={styles.pageTitle}>{isToday ? '오늘의 손익계산서' : '과거 손익계산서'}</Text>
                </View>

                {budgetWarnings.length > 0 && (
                    <TouchableOpacity style={styles.alertCard} activeOpacity={0.9} onPress={() => router.push('/category-settings')}>
                        <View style={styles.alertTop}>
                            <View style={[styles.alertDot, { backgroundColor: budgetWarnings[0].ratio >= 1 ? colors.loss : colors.warning }]} />
                            <Text style={[styles.alertMsg, { color: budgetWarnings[0].ratio >= 1 ? colors.loss : colors.warning }]}>
                                {budgetWarnings[0].app_name} {budgetWarnings[0].ratio >= 1 ? '예산 초과' : '예산 임박'}
                            </Text>
                            <Text style={[styles.alertPct, { color: budgetWarnings[0].ratio >= 1 ? colors.loss : colors.warning }]}>{Math.round(budgetWarnings[0].ratio * 100)}%</Text>
                        </View>
                    </TouchableOpacity>
                )}

                {/* 메인 순손익 카드 */}
                <View style={styles.heroCard}>
                    <Text style={styles.heroLabel}>당기 순손익</Text>
                    <View style={styles.heroValueGroup}>
                        <Text style={[styles.heroValue, { color: isProfit ? colors.profit : colors.loss }]}>
                            {isProfit ? '＋' : '－'} {fmt(netMinutes)}
                        </Text>
                        {prevNetMinutes !== null && (
                            <View style={styles.heroDiffContainer}>
                                <Text style={styles.heroDiffLabel}>전일 대비</Text>
                                <Text style={[styles.heroDiffText, { color: netMinutes >= prevNetMinutes ? colors.profit : colors.loss }]}>
                                    {netMinutes >= prevNetMinutes ? '▲' : '▼'} {fmt(netMinutes - prevNetMinutes)}
                                </Text>
                            </View>
                        )}
                    </View>
                </View>

                {/* 1. 시간 수입 섹션 (계층화 리뉴얼) */}
                <View style={styles.sectionContainer}>
                    <Text style={styles.sectionHeaderLabel}>기초 시간 자산 (공급)</Text>
                    <View style={[styles.ledgerCard, { borderLeftColor: colors.textDisabled }]}>
                        <StatementRow label="하루 가용 시간" value="24h 00m" muted />
                        
                        <View style={styles.subGroup}>
                            <Text style={styles.subGroupLabel}>고정 비용 차감</Text>
                            <View style={styles.subItemRow}>
                                <Text style={styles.subItemLabel}>• 수면 시간</Text>
                                <Text style={styles.subItemValue}>－ {sleepHours.toFixed(1)}h</Text>
                            </View>
                            <View style={styles.subItemRow}>
                                <Text style={styles.subItemLabel}>• 업무 시간</Text>
                                <Text style={styles.subItemValue}>－ {workHours.toFixed(1)}h</Text>
                            </View>
                        </View>

                        <View style={styles.ledgerDivider} />
                        <StatementRow label="가처분 시간 합계" value={`${disposable.toFixed(1)}h`} isTotal isLast />
                    </View>
                </View>

                {/* 2. 시간 지출 섹션 (소비) */}
                <View style={styles.sectionContainer}>
                    <Text style={[styles.sectionHeaderLabel, { color: colors.loss }]}>시간 지출 (소비 자산)</Text>
                    <View style={[styles.ledgerCard, { borderLeftColor: colors.loss }]}>
                        {usageList.filter(u => u.category === '소비').map((u, idx, arr) => (
                            <TouchableOpacity key={u.id} onLongPress={() => deleteUsage(u.id)} activeOpacity={0.7}>
                                <StatementRow 
                                    label={u.app_name} 
                                    value={`－ ${fmt(u.duration_minutes)}`} 
                                    loss 
                                    auto={u.source === 'auto'} 
                                    isLast={idx === arr.length - 1}
                                />
                            </TouchableOpacity>
                        ))}
                        {usageList.filter(u => u.category === '소비').length === 0 && <Text style={styles.emptyText}>지출 내역이 없습니다.</Text>}
                    </View>
                </View>

                {/* 3. 시간 투자 섹션 (자산) */}
                <View style={styles.sectionContainer}>
                    <Text style={[styles.sectionHeaderLabel, { color: colors.profit }]}>시간 투자 (성장 자산)</Text>
                    <View style={[styles.ledgerCard, { borderLeftColor: colors.profit }]}>
                        {usageList.filter(u => u.category === '투자').map((u, idx, arr) => (
                            <TouchableOpacity key={u.id} onLongPress={() => deleteUsage(u.id)} activeOpacity={0.7}>
                                <StatementRow 
                                    label={u.app_name} 
                                    value={`＋ ${fmt(u.duration_minutes)}`} 
                                    profit 
                                    auto={u.source === 'auto'} 
                                    isLast={idx === arr.length - 1}
                                />
                            </TouchableOpacity>
                        ))}
                        {usageList.filter(u => u.category === '투자').length === 0 && <Text style={styles.emptyText}>투자 내역이 없습니다.</Text>}
                    </View>
                </View>

                {/* 4. 필수 활동 */}
                {usageList.filter(u => u.category === '필수').length > 0 && (
                    <View style={styles.sectionContainer}>
                        <Text style={styles.sectionHeaderLabel}>기타 필수 활동</Text>
                        <View style={[styles.ledgerCard, { borderLeftColor: colors.border }]}>
                            {usageList.filter(u => u.category === '필수').map((u, idx, arr) => (
                                <TouchableOpacity key={u.id} onLongPress={() => deleteUsage(u.id)} activeOpacity={0.7}>
                                    <StatementRow label={u.app_name} value={fmt(u.duration_minutes)} muted isLast={idx === arr.length - 1} />
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                )}

            </ScrollView>

            <TouchableOpacity style={styles.fab} onPress={() => setModalVisible(true)}>
                <Ionicons name="add" size={28} color="white" />
            </TouchableOpacity>

            <Modal visible={modalVisible} transparent animationType="slide">
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
                    <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setModalVisible(false)}>
                        <TouchableOpacity activeOpacity={1} style={styles.modalBox}>
                            <Text style={styles.modalTitle}>시간 직접 추가</Text>
                            <TextInput style={styles.modalInput} placeholder="앱 이름" placeholderTextColor={colors.textDisabled} value={newAppName} onChangeText={setNewAppName} />
                            <TextInput style={styles.modalInput} placeholder="사용 시간 (분)" placeholderTextColor={colors.textDisabled} value={newMinutes} onChangeText={setNewMinutes} keyboardType="number-pad" />
                            <View style={styles.categoryRow}>
                                {['소비', '투자', '필수'].map(cat => (
                                    <TouchableOpacity key={cat} style={[styles.catBtn, newCategory === cat && styles.catBtnActive]} onPress={() => setNewCategory(cat)}>
                                        <Text style={[styles.catText, newCategory === cat && styles.catTextActive]}>{cat}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <TouchableOpacity style={styles.modalSubmit} onPress={addUsage}><Text style={styles.modalSubmitText}>추가하기</Text></TouchableOpacity>
                        </TouchableOpacity>
                    </TouchableOpacity>
                </KeyboardAvoidingView>
            </Modal>
        </View>
    );
}

function SectionHeader({ title, icon, color }: { title: string, icon: any, color?: string }) {
    return (
        <View style={styles.sectionHeader}>
            <Ionicons name={icon} size={14} color={color || colors.textMuted} style={{ marginRight: 6 }} />
            <Text style={[styles.sectionLabel, color ? { color } : null]}>{title}</Text>
        </View>
    );
}

function StatementRow({ label, value, loss, profit, muted, auto, isLast, isTotal }: any) {
    return (
        <View style={[styles.row, isLast && { borderBottomWidth: 0 }, isTotal && { paddingVertical: 14 }]}>
            <View style={styles.rowLabelGroup}>
                <Text style={[styles.rowLabel, muted && { color: colors.textMuted }, isTotal && { fontFamily: font.bold, fontSize: 13 }]}>{label}</Text>
                {auto && <View style={styles.autoBadge}><Text style={styles.autoBadgeText}>자동</Text></View>}
            </View>
            <Text style={[
                styles.rowValue,
                loss && { color: colors.loss, fontFamily: font.bold },
                profit && { color: colors.profit, fontFamily: font.bold },
                muted && { color: colors.textSecondary },
                isTotal && { color: colors.textPrimary, fontFamily: font.bold, fontSize: 15 }
            ]}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, paddingHorizontal: 20 },
    glow: { position: 'absolute', top: -100, left: 0, right: 0, height: 350 },
    header: { paddingTop: 16, marginBottom: 16 },
    headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
    dateLabel: { fontFamily: font.medium, fontSize: 10, color: colors.textMuted, letterSpacing: 0.5 },
    syncedLabel: { fontFamily: font.regular, fontSize: 9, color: colors.textDisabled },
    pageTitle: { fontFamily: font.bold, fontSize: 22, color: colors.textPrimary, letterSpacing: -0.8 },
    alertCard: { backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 12, padding: 10, marginBottom: 16, borderWidth: 1, borderColor: colors.borderSub },
    alertTop: { flexDirection: 'row', alignItems: 'center' },
    alertDot: { width: 4, height: 4, borderRadius: 2, marginRight: 8 },
    alertMsg: { fontFamily: font.medium, fontSize: 12, flex: 1 },
    alertPct: { fontFamily: font.bold, fontSize: 11 },

    heroCard: { backgroundColor: colors.bgSurface, borderRadius: radius.xl, paddingVertical: 20, paddingHorizontal: 24, marginBottom: 28, ...shadows.medium },
    heroLabel: { fontFamily: font.medium, fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 },
    heroValueGroup: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    heroValue: { fontFamily: font.bold, fontSize: 32, letterSpacing: -1.5 },
    heroDiffContainer: { alignItems: 'flex-end' },
    heroDiffLabel: { fontFamily: font.regular, fontSize: 9, color: colors.textMuted, marginBottom: 2 },
    heroDiffText: { fontFamily: font.bold, fontSize: 12 },

    sectionContainer: { marginBottom: 24 },
    sectionHeaderLabel: { fontFamily: font.bold, fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 10, paddingLeft: 4 },
    ledgerCard: { backgroundColor: colors.bgSurface, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 4, borderWidth: 1, borderColor: colors.borderSub, borderLeftWidth: 4 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.borderSub },
    rowLabelGroup: { flexDirection: 'row', alignItems: 'center' },
    rowLabel: { fontFamily: font.medium, fontSize: 14, color: colors.textPrimary },
    rowValue: { fontFamily: font.medium, fontSize: 14, color: colors.textPrimary },
    
    subGroup: { paddingVertical: 10, paddingLeft: 4 },
    subGroupLabel: { fontFamily: font.bold, fontSize: 10, color: colors.textDisabled, marginBottom: 8, textTransform: 'uppercase' },
    subItemRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6, paddingLeft: 8 },
    subItemLabel: { fontFamily: font.regular, fontSize: 13, color: colors.textSecondary },
    subItemValue: { fontFamily: font.medium, fontSize: 13, color: colors.textSecondary },

    autoBadge: { marginLeft: 8, paddingHorizontal: 4, paddingVertical: 1, borderRadius: 4, backgroundColor: 'rgba(74,222,128,0.05)', borderWidth: 1, borderColor: 'rgba(74,222,128,0.1)' },
    autoBadgeText: { fontFamily: font.bold, fontSize: 8, color: colors.profit },
    ledgerDivider: { height: 1, backgroundColor: colors.borderSub, marginHorizontal: -16 },
    emptyText: { fontFamily: font.regular, fontSize: 13, color: colors.textDisabled, paddingVertical: 20, textAlign: 'center' },

    fab: { position: 'absolute', bottom: 24, right: 20, width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center', ...shadows.soft },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
    modalBox: { backgroundColor: colors.bgSurface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
    modalTitle: { fontFamily: font.bold, fontSize: 18, color: colors.textPrimary, marginBottom: 20 },
    modalInput: { backgroundColor: colors.bgBase, borderRadius: 10, padding: 14, color: colors.textPrimary, fontFamily: font.medium, marginBottom: 10 },
    categoryRow: { flexDirection: 'row', gap: 6, marginBottom: 20 },
    catBtn: { flex: 1, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center' },
    catBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
    catText: { fontFamily: font.medium, fontSize: 13, color: colors.textMuted },
    catTextActive: { color: 'white' },
    modalSubmit: { backgroundColor: colors.accent, borderRadius: 12, padding: 16, alignItems: 'center' },
    modalSubmitText: { fontFamily: font.bold, fontSize: 15, color: 'white' },
});
