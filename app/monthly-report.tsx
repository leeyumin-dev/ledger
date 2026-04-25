import { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView,
    TouchableOpacity
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { colors, font, fontSize, spacing, radius } from '../src/lib/theme';

type UsageItem = {
    app_name: string;
    duration_minutes: number;
    category: string;
    date: string;
};

export default function MonthlyReportScreen() {
    const { month } = useLocalSearchParams<{ month: string }>();
    const [usageList, setUsageList] = useState<UsageItem[]>([]);
    const [sleepHours, setSleepHours] = useState(7.5);
    const [workHours, setWorkHours] = useState(8.0);
    const [prevMonthNet, setPrevMonthNet] = useState<number | null>(null);

    const now = new Date();
    const targetMonth = month || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const [year, mon] = targetMonth.split('-').map(Number);
    const monthLabel = `${year}년 ${mon}월`;
    const daysInMonth = new Date(year, mon, 0).getDate();

    useEffect(() => {
        loadData();
    }, [targetMonth]);

    async function loadData() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const start = `${targetMonth}-01`;
        const end = `${targetMonth}-${String(daysInMonth).padStart(2, '0')}`;

        // 전월 계산
        const prevDate = new Date(year, mon - 2, 1);
        const prevMonth = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;
        const prevDays = new Date(prevDate.getFullYear(), prevDate.getMonth() + 1, 0).getDate();
        const prevStart = `${prevMonth}-01`;
        const prevEnd = `${prevMonth}-${String(prevDays).padStart(2, '0')}`;

        const [settingsRes, usageRes, prevUsageRes] = await Promise.all([
            supabase.from('user_settings').select('sleep_hours, work_hours').eq('user_id', user.id).single(),
            supabase.from('app_usage').select('*').eq('user_id', user.id).gte('date', start).lte('date', end),
            supabase.from('app_usage').select('*').eq('user_id', user.id).gte('date', prevStart).lte('date', prevEnd),
        ]);

        if (settingsRes.data) {
            setSleepHours(settingsRes.data.sleep_hours);
            setWorkHours(settingsRes.data.work_hours);
        }
        if (usageRes.data) setUsageList(usageRes.data);

        // 전월 순이익 계산
        if (prevUsageRes.data && settingsRes.data) {
            const prevLoss = prevUsageRes.data.filter(u => u.category === '소비').reduce((s, u) => s + u.duration_minutes, 0);
            const prevInvest = prevUsageRes.data.filter(u => u.category === '투자').reduce((s, u) => s + u.duration_minutes, 0);
            const prevEssential = prevUsageRes.data.filter(u => u.category === '필수').reduce((s, u) => s + u.duration_minutes, 0);
            const prevDisposable = (24 - settingsRes.data.sleep_hours - settingsRes.data.work_hours) * prevDays;
            setPrevMonthNet(Math.round(prevDisposable * 60) - prevLoss - prevEssential + prevInvest);
        }
    }

    function groupByApp(category: string) {
        const items = usageList.filter(u => u.category === category);
        const map: Record<string, number> = {};
        items.forEach(item => {
            map[item.app_name] = (map[item.app_name] || 0) + item.duration_minutes;
        });
        return Object.entries(map).sort((a, b) => b[1] - a[1]);
    }

    function fmt(m: number) {
        const abs = Math.abs(m);
        return `${Math.floor(abs / 60)}h ${abs % 60}m`;
    }

    const lossMinutes = usageList.filter(u => u.category === '소비').reduce((s, u) => s + u.duration_minutes, 0);
    const investMinutes = usageList.filter(u => u.category === '투자').reduce((s, u) => s + u.duration_minutes, 0);
    const essentialMinutes = usageList.filter(u => u.category === '필수').reduce((s, u) => s + u.duration_minutes, 0);
    const totalDisposable = (24 - sleepHours - workHours) * daysInMonth;
    const netMinutes = Math.round(totalDisposable * 60) - lossMinutes - essentialMinutes + investMinutes;
    const isProfit = netMinutes >= 0;

    // 전월 대비
    const improvement = prevMonthNet !== null ? netMinutes - prevMonthNet : null;

    // TOP3 소비 앱
    const top3Loss = groupByApp('소비').slice(0, 3);
    const top3Invest = groupByApp('투자').slice(0, 3);

    // 기록된 날 수
    const recordedDays = new Set(usageList.map(u => u.date)).size;
    const profitDays = (() => {
        const byDate: Record<string, { loss: number; invest: number; essential: number }> = {};
        usageList.forEach(u => {
            if (!byDate[u.date]) byDate[u.date] = { loss: 0, invest: 0, essential: 0 };
            if (u.category === '소비') byDate[u.date].loss += u.duration_minutes;
            if (u.category === '투자') byDate[u.date].invest += u.duration_minutes;
            if (u.category === '필수') byDate[u.date].essential += u.duration_minutes;
        });
        const disposablePerDay = (24 - sleepHours - workHours) * 60;
        return Object.values(byDate).filter(d =>
            disposablePerDay - d.loss - d.essential + d.invest >= 0
        ).length;
    })();

    return (
        <ScrollView style={styles.container}>

            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Text style={styles.backText}>← 보관함</Text>
                </TouchableOpacity>
                <Text style={styles.headerSub}>{monthLabel} 감사보고서</Text>
                <Text style={styles.headerTitle}>월간 결산</Text>
            </View>

            {/* 핵심 지표 */}
            <View style={styles.metricsRow}>
                <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>기록일</Text>
                    <Text style={styles.metricValue}>{recordedDays}일</Text>
                    <Text style={styles.metricSub}>/ {daysInMonth}일</Text>
                </View>
                <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>흑자일</Text>
                    <Text style={[styles.metricValue, { color: colors.profit }]}>{profitDays}일</Text>
                    <Text style={styles.metricSub}>/ {recordedDays}일</Text>
                </View>
                <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>낭비일</Text>
                    <Text style={[styles.metricValue, { color: colors.loss }]}>{recordedDays - profitDays}일</Text>
                    <Text style={styles.metricSub}>/ {recordedDays}일</Text>
                </View>
            </View>

            <View style={styles.thickDivider} />

            {/* 손익 요약 */}
            <Text style={styles.sectionLabel}>월간 손익</Text>
            <Row label="가처분 시간 합계" value={`${totalDisposable.toFixed(1)}h`} />
            <Row label="총 지출 (소비)" value={fmt(lossMinutes)} loss indent />
            <Row label="총 투자" value={fmt(investMinutes)} profit indent />
            {essentialMinutes > 0 && (
                <Row label="필수 지출" value={fmt(essentialMinutes)} muted indent />
            )}
            <View style={styles.thinDivider} />

            {/* 순이익/손실 박스 */}
            <View style={[styles.verdictBox, isProfit ? styles.verdictProfit : styles.verdictLoss]}>
                <Text style={[styles.verdictLabel, { color: isProfit ? 'rgba(74,222,128,0.7)' : 'rgba(248,113,133,0.7)' }]}>
                    {isProfit ? '월간 순이익' : '월간 순손실'}
                </Text>
                <Text style={[styles.verdictValue, { color: isProfit ? colors.profit : colors.loss }]}>
                    {isProfit ? '＋' : '－'} {fmt(netMinutes)}
                </Text>
                {improvement !== null && (
                    <Text style={[
                        styles.verdictImprovement,
                        { color: improvement >= 0 ? colors.profit : colors.loss }
                    ]}>
                        전월 대비 {improvement >= 0 ? '＋' : '－'}{fmt(improvement)}
                    </Text>
                )}
            </View>

            <View style={styles.thickDivider} />

            {/* TOP3 소비 앱 */}
            <Text style={styles.sectionLabel}>이달 TOP 소비</Text>
            {top3Loss.length === 0
                ? <Text style={styles.emptyRow}>소비 기록 없음</Text>
                : top3Loss.map(([app, min], i) => (
                    <View key={app} style={styles.rankRow}>
                        <Text style={styles.rankNum}>0{i + 1}</Text>
                        <Text style={styles.rankApp}>{app}</Text>
                        <View style={styles.rankBarBg}>
                            <View style={[
                                styles.rankBar,
                                {
                                    width: `${(min / top3Loss[0][1]) * 100}%` as any,
                                    backgroundColor: colors.loss,
                                }
                            ]} />
                        </View>
                        <Text style={styles.rankVal}>{fmt(min)}</Text>
                    </View>
                ))
            }

            <View style={styles.thinDivider} />

            {/* TOP3 투자 앱 */}
            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>이달 TOP 투자</Text>
            {top3Invest.length === 0
                ? <Text style={styles.emptyRow}>투자 기록 없음</Text>
                : top3Invest.map(([app, min], i) => (
                    <View key={app} style={styles.rankRow}>
                        <Text style={styles.rankNum}>0{i + 1}</Text>
                        <Text style={styles.rankApp}>{app}</Text>
                        <View style={styles.rankBarBg}>
                            <View style={[
                                styles.rankBar,
                                {
                                    width: `${(min / top3Invest[0][1]) * 100}%` as any,
                                    backgroundColor: colors.profit,
                                }
                            ]} />
                        </View>
                        <Text style={styles.rankVal}>{fmt(min)}</Text>
                    </View>
                ))
            }

            <View style={{ height: 40 }} />
        </ScrollView>
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
    container: { flex: 1, backgroundColor: colors.bgBase, paddingHorizontal: spacing.lg },
    header: { paddingTop: 60, paddingBottom: spacing.lg },
    backBtn: { marginBottom: spacing.md },
    backText: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.accent },
    headerSub: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 1, marginBottom: 6 },
    headerTitle: { fontFamily: font.medium, fontSize: fontSize.xl, color: colors.textPrimary, letterSpacing: -0.5 },
    metricsRow: { flexDirection: 'row', gap: 10, marginBottom: spacing.md },
    metricCard: { flex: 1, backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: 14, alignItems: 'center' },
    metricLabel: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textMuted, marginBottom: 6 },
    metricValue: { fontFamily: font.medium, fontSize: fontSize.xl, color: colors.textPrimary, marginBottom: 2 },
    metricSub: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textDisabled },
    thickDivider: { height: 1.5, backgroundColor: colors.border, marginVertical: spacing.sm },
    thinDivider: { height: 0.5, backgroundColor: colors.borderSub, marginVertical: spacing.sm },
    sectionLabel: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: spacing.sm },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 6 },
    rowIndent: { paddingLeft: spacing.md },
    rowLabel: { fontFamily: font.regular, fontSize: 13, color: colors.textSecondary },
    rowValue: { fontFamily: font.regular, fontSize: 13, color: colors.textPrimary },
    boldText: { fontFamily: font.medium, fontSize: fontSize.md, color: colors.textPrimary },
    lossText: { color: colors.loss },
    profitText: { color: colors.profit },
    mutedText: { color: colors.textMuted },
    emptyRow: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.textDisabled, paddingLeft: spacing.md, paddingVertical: 6 },
    verdictBox: { borderRadius: radius.md, padding: spacing.md, alignItems: 'center', borderWidth: 1, marginVertical: 4 },
    verdictLoss: { backgroundColor: colors.lossBg, borderColor: colors.lossBorder },
    verdictProfit: { backgroundColor: colors.profitBg, borderColor: colors.profitBorder },
    verdictLabel: { fontFamily: font.regular, fontSize: fontSize.xs, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: spacing.sm },
    verdictValue: { fontFamily: font.medium, fontSize: fontSize['2xl'], letterSpacing: -0.5, marginBottom: 6 },
    verdictImprovement: { fontFamily: font.regular, fontSize: fontSize.xs },
    rankRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
    rankNum: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textDisabled, width: 20 },
    rankApp: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.textSecondary, width: 64 },
    rankBarBg: { flex: 1, height: 4, backgroundColor: colors.border, borderRadius: 2 },
    rankBar: { height: 4, borderRadius: 2 },
    rankVal: { fontFamily: font.medium, fontSize: fontSize.xs, color: colors.textPrimary, width: 56, textAlign: 'right' },
});