import { useState, useEffect } from 'react';
import {
    View, Text, StyleSheet, ScrollView,
    TouchableOpacity
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { isTokenKey, getMonitoringStatus } from '../src/lib/screenTime';
import { AppTokenLabel } from '../src/components/AppTokenLabel';
import { colors, font, fontSize, spacing, radius } from '../src/lib/theme';

type UsageItem = {
    id: string;
    app_name: string;
    duration_minutes: number;
    category: string;
};

export default function DailyDetailScreen() {
    const { date } = useLocalSearchParams<{ date: string }>();
    const [usageList, setUsageList] = useState<UsageItem[]>([]);
    const [sleepHours, setSleepHours] = useState(7.5);
    const [workHours, setWorkHours] = useState(8.0);

    const dateLabel = date
        ? new Date(date).toLocaleDateString('ko-KR', {
            year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
        })
        : '';

    useEffect(() => {
        loadData();
    }, [date]);

    async function loadData() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const [settingsRes, usageRes, monitorStatus] = await Promise.all([
            supabase.from('user_settings').select('sleep_hours, work_hours').eq('user_id', user.id).single(),
            supabase.from('app_usage').select('*').eq('user_id', user.id).eq('date', date),
            getMonitoringStatus(),
        ]);

        if (settingsRes.data) {
            setSleepHours(settingsRes.data.sleep_hours);
            setWorkHours(settingsRes.data.work_hours);
        }
        if (usageRes.data) {
            const validLocalKeys = new Set(monitorStatus?.appList ?? []);
            setUsageList(usageRes.data.filter(u =>
                !isTokenKey(u.app_name) || validLocalKeys.has(u.app_name)
            ));
        }
    }

    function groupByApp(category: string) {
        const items = usageList.filter(u => u.category === category);
        const map: Record<string, number> = {};
        items.forEach(u => { map[u.app_name] = (map[u.app_name] || 0) + u.duration_minutes; });
        return Object.entries(map).sort((a, b) => b[1] - a[1]);
    }

    function fmt(m: number) {
        return `${Math.floor(Math.abs(m) / 60)}h ${Math.abs(m) % 60}m`;
    }

    const disposable = 24 - sleepHours - workHours;
    const lossMinutes = usageList.filter(u => u.category === '소비').reduce((s, u) => s + u.duration_minutes, 0);
    const investMinutes = usageList.filter(u => u.category === '투자').reduce((s, u) => s + u.duration_minutes, 0);
    const essentialMinutes = usageList.filter(u => u.category === '필수').reduce((s, u) => s + u.duration_minutes, 0);
    const netMinutes = Math.round(disposable * 60) - lossMinutes - essentialMinutes + investMinutes;
    const isProfit = netMinutes >= 0;

    return (
        <ScrollView style={styles.container}>

            <View style={styles.header}>
                <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
                    <Text style={styles.backText}>← 보관함</Text>
                </TouchableOpacity>
                <Text style={styles.headerSub}>{dateLabel}</Text>
                <Text style={styles.headerTitle}>일간 손익계산서</Text>
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
            {groupByApp('소비').length === 0
                ? <Text style={styles.emptyRow}>지출 없음</Text>
                : groupByApp('소비').map(([app, min]) => (
                    <Row key={app} label={isTokenKey(app)
                        ? <AppTokenLabel tokenKey={app} color="#9a9690" fontSize={13} style={{ flex: 1, height: 26 }} />
                        : app} value={fmt(min)} indent loss />
                ))
            }

            {/* 투자 */}
            <Text style={[styles.sectionLabel, { marginTop: 16 }]}>시간 투자</Text>
            {groupByApp('투자').length === 0
                ? <Text style={styles.emptyRow}>투자 없음</Text>
                : groupByApp('투자').map(([app, min]) => (
                    <Row key={app} label={isTokenKey(app)
                        ? <AppTokenLabel tokenKey={app} color="#9a9690" fontSize={13} style={{ flex: 1, height: 26 }} />
                        : app} value={fmt(min)} indent profit />
                ))
            }

            {/* 필수 */}
            {groupByApp('필수').length > 0 && (
                <>
                    <Text style={[styles.sectionLabel, { marginTop: 16 }]}>필수 지출</Text>
                    {groupByApp('필수').map(([app, min]) => (
                        <Row key={app} label={isTokenKey(app)
                            ? <AppTokenLabel tokenKey={app} color="#9a9690" fontSize={13} style={{ flex: 1, height: 26 }} />
                            : app} value={fmt(min)} indent muted />
                    ))}
                </>
            )}

            <View style={styles.thinDivider} />
            <Row label="총 지출" value={fmt(lossMinutes)} bold loss />
            <Row label="총 투자" value={fmt(investMinutes)} bold profit />

            <View style={styles.thickDivider} />

            {/* 순이익/손실 */}
            {usageList.length === 0 ? (
                <View style={styles.emptyBox}>
                    <Text style={styles.emptyText}>이 날의 기록이 없어요</Text>
                </View>
            ) : (
                <View style={[styles.verdictBox, isProfit ? styles.verdictProfit : styles.verdictLoss]}>
                    <Text style={[styles.verdictLabel, { color: isProfit ? 'rgba(74,222,128,0.7)' : 'rgba(248,113,133,0.7)' }]}>
                        {isProfit ? '당기 순이익' : '당기 순손실'}
                    </Text>
                    <Text style={[styles.verdictValue, { color: isProfit ? colors.profit : colors.loss }]}>
                        {isProfit ? '＋' : '－'} {fmt(Math.abs(netMinutes))}
                    </Text>
                    <Text style={styles.verdictSub}>{dateLabel}</Text>
                </View>
            )}

            <View style={{ height: 40 }} />
        </ScrollView>
    );
}

function Row({ label, value, indent, bold, loss, profit, muted }: {
    label: string | React.ReactNode; value: string;
    indent?: boolean; bold?: boolean;
    loss?: boolean; profit?: boolean; muted?: boolean;
}) {
    return (
        <View style={[styles.row, indent && styles.rowIndent]}>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center' }}>
                {typeof label === 'string'
                    ? <Text style={[styles.rowLabel, bold && styles.boldText]}>{label}</Text>
                    : label}
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
    container: { flex: 1, backgroundColor: colors.bgBase, paddingHorizontal: spacing.lg },
    header: { paddingTop: 60, paddingBottom: spacing.lg },
    backBtn: { marginBottom: spacing.md },
    backText: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.accent },
    headerSub: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 1, marginBottom: 6 },
    headerTitle: { fontFamily: font.medium, fontSize: fontSize.xl, color: colors.textPrimary, letterSpacing: -0.5 },
    thickDivider: { height: 1.5, backgroundColor: colors.border, marginVertical: spacing.sm },
    thinDivider: { height: 0.5, backgroundColor: colors.borderSub, marginVertical: spacing.sm },
    sectionLabel: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: spacing.sm },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: 6 },
    rowIndent: { paddingLeft: spacing.md },
    rowLabel: { fontFamily: font.regular, fontSize: 13, color: colors.textSecondary },
    rowValue: { fontFamily: font.regular, fontSize: 13, color: colors.textPrimary },
    boldText: { fontFamily: font.medium, fontSize: fontSize.md, color: colors.textPrimary },
    lossText: { color: colors.loss },
    profitText: { color: colors.profit },
    mutedText: { color: colors.textMuted },
    emptyRow: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.textDisabled, paddingLeft: spacing.md, paddingVertical: 6 },
    emptyBox: { paddingVertical: 48, alignItems: 'center' },
    emptyText: { fontFamily: font.medium, fontSize: fontSize.md, color: colors.textMuted },
    verdictBox: { borderRadius: radius.md, padding: spacing.md, alignItems: 'center', borderWidth: 1 },
    verdictLoss: { backgroundColor: colors.lossBg, borderColor: colors.lossBorder },
    verdictProfit: { backgroundColor: colors.profitBg, borderColor: colors.profitBorder },
    verdictLabel: { fontFamily: font.regular, fontSize: fontSize.xs, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: spacing.sm },
    verdictValue: { fontFamily: font.medium, fontSize: fontSize['2xl'], letterSpacing: -0.5, marginBottom: 6 },
    verdictSub: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textMuted },
});