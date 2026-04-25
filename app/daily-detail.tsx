import { useState, useCallback, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView,
    TouchableOpacity, Alert, Dimensions
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { colors, font, fontSize, spacing, radius, shadows, gradients } from '../src/lib/theme';
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

function fmt(m: number) {
    const absM = Math.abs(m);
    const h = Math.floor(absM / 60);
    const mm = absM % 60;
    if (h === 0) return `${mm}m`;
    return `${h}h ${mm}m`;
}

export default function DailyDetailScreen() {
    const { date } = useLocalSearchParams<{ date: string }>();
    const [sleepHours, setSleepHours] = useState(7.5);
    const [workHours, setWorkHours] = useState(8.0);
    const [usageList, setUsageList] = useState<AppUsage[]>([]);
    const [loading, setLoading] = useState(true);
    const [prevNetMinutes, setPrevNetMinutes] = useState<number | null>(null);

    const dateObj = new Date(date + 'T00:00:00');
    const dateLabel = dateObj.toLocaleDateString('ko-KR', {
        month: 'short', day: 'numeric', weekday: 'short'
    }).toUpperCase();

    useEffect(() => {
        loadData();
    }, [date]);

    async function loadData() {
        setLoading(true);
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const yesterdayObj = new Date(dateObj);
        yesterdayObj.setDate(yesterdayObj.getDate() - 1);
        const yesterdayStr = yesterdayObj.toISOString().split('T')[0];

        const [settingsRes, usageRes, prevUsageRes] = await Promise.all([
            supabase.from('user_settings').select('sleep_hours, work_hours').eq('user_id', user.id).single(),
            supabase.from('app_usage').select('*').eq('user_id', user.id).eq('date', date),
            supabase.from('app_usage').select('duration_minutes, category').eq('user_id', user.id).eq('date', yesterdayStr),
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
        }

        setUsageList(usageRes.data ?? []);
        setLoading(false);
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
            
            <View style={styles.navBar}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
                </TouchableOpacity>
                <Text style={styles.navTitle}>손익계산서 상세</Text>
                <View style={{ width: 40 }} />
            </View>

            <ScrollView style={styles.container} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
                
                <View style={styles.header}>
                    <Text style={styles.dateLabel}>{dateLabel}</Text>
                    <Text style={styles.pageTitle}>과거 손익계산서</Text>
                </View>

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

                <View style={styles.section}>
                    <SectionHeader title="시간 수입" />
                    <StatementRow label="하루 가용 시간" value="24h 00m" sm muted />
                    <StatementRow label="고정 비용 (수면/업무)" value={`－ ${(sleepHours + workHours).toFixed(1)}h`} sm muted />
                    <StatementRow label="가처분 시간 합계" value={`${disposable.toFixed(1)}h`} sm muted />
                </View>

                <View style={styles.section}>
                    <SectionHeader title="시간 지출 (소비)" />
                    {usageList.filter(u => u.category === '소비').map(u => (
                        <TouchableOpacity key={u.id} onLongPress={() => deleteUsage(u.id)} activeOpacity={0.7}>
                            <StatementRow label={u.app_name} value={fmt(u.duration_minutes)} loss auto={u.source === 'auto'} />
                        </TouchableOpacity>
                    ))}
                    {usageList.filter(u => u.category === '소비').length === 0 && <Text style={styles.emptyText}>지출 없음</Text>}
                </View>

                <View style={styles.section}>
                    <SectionHeader title="시간 투자 (자산)" />
                    {usageList.filter(u => u.category === '투자').map(u => (
                        <TouchableOpacity key={u.id} onLongPress={() => deleteUsage(u.id)} activeOpacity={0.7}>
                            <StatementRow label={u.app_name} value={fmt(u.duration_minutes)} profit auto={u.source === 'auto'} />
                        </TouchableOpacity>
                    ))}
                    {usageList.filter(u => u.category === '투자').length === 0 && <Text style={styles.emptyText}>투자 없음</Text>}
                </View>

                <View style={styles.section}>
                    <SectionHeader title="필수 지출" />
                    {usageList.filter(u => u.category === '필수').map(u => (
                        <TouchableOpacity key={u.id} onLongPress={() => deleteUsage(u.id)} activeOpacity={0.7}>
                            <StatementRow label={u.app_name} value={fmt(u.duration_minutes)} muted auto={u.source === 'auto'} />
                        </TouchableOpacity>
                    ))}
                </View>

            </ScrollView>
        </View>
    );
}

function SectionHeader({ title }: { title: string }) {
    return (
        <View style={styles.sectionHeader}>
            <Text style={styles.sectionLabel}>{title}</Text>
            <View style={styles.sectionLine} />
        </View>
    );
}

function StatementRow({ label, value, bold, loss, profit, muted, auto, sm }: any) {
    return (
        <View style={[styles.row, sm && { paddingVertical: 4 }]}>
            <View style={styles.rowLabelGroup}>
                <Text style={[styles.rowLabel, bold && styles.boldText, muted && { color: colors.textDisabled }, sm && { fontSize: 12 }]}>{label}</Text>
                {auto && <View style={styles.autoBadge}><Text style={styles.autoBadgeText}>자동</Text></View>}
            </View>
            <Text style={[styles.rowValue, bold && styles.boldText, loss && { color: colors.loss }, profit && { color: colors.profit }, muted && { color: colors.textDisabled }, sm && { fontSize: 12 }]}>{value}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, paddingHorizontal: 20 },
    glow: { position: 'absolute', top: -100, left: 0, right: 0, height: 350 },
    navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 16, marginBottom: 12 },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
    navTitle: { fontFamily: font.bold, fontSize: 16, color: colors.textPrimary },
    header: { paddingVertical: 16, marginBottom: 16 },
    dateLabel: { fontFamily: font.medium, fontSize: 10, color: colors.textMuted, letterSpacing: 0.5, marginBottom: 4 },
    pageTitle: { fontFamily: font.bold, fontSize: 22, color: colors.textPrimary, letterSpacing: -0.8 },
    heroCard: { backgroundColor: colors.bgSurface, borderRadius: radius.xl, paddingVertical: 20, paddingHorizontal: 24, marginBottom: 24, ...shadows.medium },
    heroLabel: { fontFamily: font.medium, fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 6 },
    heroValueGroup: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    heroValue: { fontFamily: font.bold, fontSize: 32, letterSpacing: -1.5 },
    heroDiffContainer: { alignItems: 'flex-end' },
    heroDiffLabel: { fontFamily: font.regular, fontSize: 9, color: colors.textMuted, marginBottom: 2 },
    heroDiffText: { fontFamily: font.bold, fontSize: 12 },
    section: { marginBottom: 12 },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
    sectionLabel: { fontFamily: font.medium, fontSize: 10, color: colors.textDisabled, textTransform: 'uppercase', letterSpacing: 1, marginRight: 10 },
    sectionLine: { flex: 1, height: 1, backgroundColor: colors.borderSub, opacity: 0.3 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
    rowLabelGroup: { flexDirection: 'row', alignItems: 'center' },
    rowLabel: { fontFamily: font.regular, fontSize: 14, color: colors.textSecondary },
    rowValue: { fontFamily: font.medium, fontSize: 14, color: colors.textPrimary },
    boldText: { fontFamily: font.bold, fontSize: 14, color: colors.textPrimary },
    autoBadge: { marginLeft: 6, paddingHorizontal: 3, paddingVertical: 0.5, borderRadius: 3, borderWidth: 0.5, borderColor: colors.profitBorder },
    autoBadgeText: { fontFamily: font.medium, fontSize: 7, color: colors.profit },
    emptyText: { fontFamily: font.regular, fontSize: 12, color: colors.textDisabled, paddingVertical: 4 },
});
