import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { LineChart } from 'react-native-gifted-charts';
import { supabase } from '../../src/lib/supabase';
import { AppHeader } from '../../src/components/AppHeader';
import { AppTokenLabel } from '../../src/components/AppTokenLabel';
import { isTokenKey } from '../../src/lib/screenTime';
import { useSyncedAt } from '../../src/lib/SyncContext';
import { colors, font, fontSize, spacing, radius } from '../../src/lib/theme';

const SCREEN_WIDTH = Dimensions.get('window').width;

type RawRecord = { app_name: string; date: string; duration_minutes: number; category: string };

const RANGE_OPTIONS = [
    { label: '1개월', weeks: 4 },
    { label: '2개월', weeks: 8 },
    { label: '3개월', weeks: 12 },
    { label: '6개월', weeks: 26 },
] as const;

export default function TrendsScreen() {
    const [rawData, setRawData] = useState<RawRecord[]>([]);
    const [goals, setGoals] = useState<Record<string, number>>({});
    const [selectedApp, setSelectedApp] = useState<string>('');
    const [rangeWeeks, setRangeWeeks] = useState<4 | 8 | 12 | 26>(8);
    const syncedAt = useSyncedAt();
    const isFocused = useRef(false);

    useFocusEffect(
        useCallback(() => {
            isFocused.current = true;
            loadTrends();
            return () => { isFocused.current = false; };
        }, [])
    );

    // 동기화 완료 후 재로드 (홈 화면과 동일 패턴)
    useEffect(() => {
        if (syncedAt > 0 && isFocused.current) {
            loadTrends();
        }
    }, [syncedAt]);

    async function loadTrends() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const [usageRes, categoriesRes] = await Promise.all([
            supabase.from('app_usage').select('app_name, date, duration_minutes, category').eq('user_id', user.id).order('date', { ascending: true }),
            supabase.from('app_categories').select('app_name, goal_minutes').eq('user_id', user.id),
        ]);

        if (!usageRes.data || usageRes.data.length === 0) return;
        setRawData(usageRes.data);

        if (categoriesRes.data) {
            const goalMap: Record<string, number> = {};
            categoriesRes.data.forEach(c => { goalMap[c.app_name] = c.goal_minutes ?? 0; });
            setGoals(goalMap);
        }

        const apps = [...new Set(usageRes.data.map(d => d.app_name))];
        if (apps.length > 0) setSelectedApp(prev => prev || apps[0]);
    }

    function toLocalStr(d: Date) {
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function getWeekLabel(dateStr: string) {
        const date = new Date(dateStr + 'T00:00:00');
        const day = date.getDay();
        const diff = day === 0 ? -6 : 1 - day;
        const monday = new Date(date);
        monday.setDate(date.getDate() + diff);
        const month = monday.getMonth() + 1;
        const weekNum = Math.ceil(monday.getDate() / 7);
        return `${month}월 ${weekNum}주`;
    }

    function getCurrentWeekLabel() {
        return getWeekLabel(toLocalStr(new Date()));
    }

    function getRecentWeeks(count: number): string[] {
        const weeks: string[] = [];
        const now = new Date();
        for (let i = count - 1; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i * 7);
            weeks.push(getWeekLabel(toLocalStr(d)));
        }
        return [...new Set(weeks)];
    }

    const { trends, allApps } = useMemo(() => {
        if (rawData.length === 0) return { trends: [], allApps: [] };

        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - rangeWeeks * 7);
        const cutoffStr = toLocalStr(cutoff);
        const filtered = rawData.filter(d => d.date >= cutoffStr);

        const byApp: Record<string, { category: string; byWeek: Record<string, number> }> = {};
        filtered.forEach(item => {
            if (!byApp[item.app_name]) {
                byApp[item.app_name] = { category: item.category, byWeek: {} };
            }
            const week = getWeekLabel(item.date);
            byApp[item.app_name].byWeek[week] =
                (byApp[item.app_name].byWeek[week] || 0) + item.duration_minutes;
        });

        const allWeeks = getRecentWeeks(rangeWeeks);
        const trends = Object.entries(byApp).map(([app_name, val]) => ({
            app_name,
            category: val.category,
            data: allWeeks.map(week => ({ week, minutes: val.byWeek[week] || 0 })),
            total: Object.values(val.byWeek).reduce((s, v) => s + v, 0),
        })).sort((a, b) => b.total - a.total);

        return { trends, allApps: trends.map(t => t.app_name) };
    }, [rawData, rangeWeeks]);

    const selected = trends.find(t => t.app_name === selectedApp) ?? trends[0];

    const chartData = selected?.data.map(d => ({
        value: Math.round(d.minutes / 60 * 10) / 10,
        label: rangeWeeks <= 8 ? d.week.replace('월 ', '/') : d.week.split('월 ')[0] + '/' + d.week.split(' ')[1]?.[0],
        dataPointText: d.minutes > 0 ? `${Math.floor(d.minutes / 60)}h` : '',
    })) ?? [];

    const isLossApp = selected?.category === '소비';
    const isInvestApp = selected?.category === '투자';
    const lineColor = isLossApp ? colors.loss : colors.profit;
    const goalMinutes = selected ? (goals[selected.app_name] ?? 0) : 0;
    const goalHours = goalMinutes / 60;
    const maxChartVal = Math.ceil(Math.max(...chartData.map(d => d.value), goalHours, 1) + 1);

    const totalMinutes = selected?.data.reduce((s, d) => s + d.minutes, 0) ?? 0;
    const avgMinutes = totalMinutes / rangeWeeks;

    // 이번 주 달성률
    const currentWeekLabel = getCurrentWeekLabel();
    const currentWeekData = selected?.data.find(d => d.week === currentWeekLabel);
    const currentWeekMinutes = currentWeekData?.minutes ?? 0;
    const achievementPct = goalMinutes > 0 ? Math.round((currentWeekMinutes / goalMinutes) * 100) : null;
    // 투자: 목표 이상 사용 = 달성, 소비: 한도 이하 사용 = 달성
    const achieved = achievementPct !== null && (isLossApp ? achievementPct <= 100 : achievementPct >= 100);

    return (
        <View style={{ flex: 1, backgroundColor: colors.bgBase }}>
            <AppHeader />
            <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>

            {/* 범위 선택 */}
            <View style={styles.rangeRow}>
                <Text style={styles.rangeLabel}>기간</Text>
                <View style={styles.rangeGroup}>
                    {RANGE_OPTIONS.map(opt => (
                        <TouchableOpacity
                            key={opt.weeks}
                            style={[styles.rangeBtn, rangeWeeks === opt.weeks && styles.rangeBtnActive]}
                            onPress={() => setRangeWeeks(opt.weeks as 4 | 8 | 12 | 26)}
                        >
                            <Text style={[styles.rangeBtnText, rangeWeeks === opt.weeks && styles.rangeBtnTextActive]}>
                                {opt.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {rawData.length === 0 ? (
                <View style={styles.emptyBox}>
                    <Text style={styles.emptyText}>아직 데이터가 없어요</Text>
                    <Text style={styles.emptySub}>오늘 화면에서 앱 사용 시간을 추가해봐요</Text>
                </View>
            ) : (
                <>
                    {/* 앱 선택 */}
                    <Text style={styles.sectionLabel}>앱 선택</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.appScroll}>
                        {trends.map(t => {
                            const isSelected = selectedApp === t.app_name;
                            const ringColor = t.category === '소비' ? colors.loss : colors.profit;
                            return (
                                <TouchableOpacity
                                    key={t.app_name}
                                    style={styles.appIconBtn}
                                    onPress={() => setSelectedApp(t.app_name)}
                                    activeOpacity={0.7}
                                >
                                    {isTokenKey(t.app_name) ? (
                                        <View style={[
                                            styles.appIconWrap,
                                            isSelected && { borderColor: ringColor, borderWidth: 2 }
                                        ]}>
                                            <AppTokenLabel
                                                tokenKey={t.app_name}
                                                fontSize={20}
                                                iconOnly
                                                style={{ width: 32, height: 32 }}
                                            />
                                        </View>
                                    ) : (
                                        <View style={[
                                            styles.appTextBtn,
                                            isSelected && (t.category === '소비' ? styles.appBtnLoss : styles.appBtnInvest)
                                        ]}>
                                            <Text style={[styles.appBtnText, isSelected && styles.appBtnTextActive]}>
                                                {t.app_name}
                                            </Text>
                                        </View>
                                    )}
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    {/* 요약 스탯 */}
                    {selected && (
                        <View style={styles.statRow}>
                            <View style={styles.statItem}>
                                <Text style={styles.statLabel}>총 {RANGE_OPTIONS.find(o => o.weeks === rangeWeeks)?.label}</Text>
                                <Text style={[styles.statVal, { color: lineColor }]}>
                                    {Math.floor(totalMinutes / 60)}h {totalMinutes % 60}m
                                </Text>
                            </View>
                            <View style={styles.statDivider} />
                            <View style={styles.statItem}>
                                <Text style={styles.statLabel}>주평균</Text>
                                <Text style={[styles.statVal, { color: lineColor }]}>
                                    {Math.floor(avgMinutes / 60)}h {Math.round(avgMinutes % 60)}m
                                </Text>
                            </View>
                            <View style={styles.statDivider} />
                            {(isInvestApp || isLossApp) && goalMinutes > 0 ? (
                                <View style={styles.statItem}>
                                    <Text style={styles.statLabel}>{isLossApp ? '이번 주 소비율' : '이번 주 달성률'}</Text>
                                    <Text style={[styles.statVal, { color: achieved ? colors.profit : colors.loss }]}>
                                        {achievementPct}%
                                    </Text>
                                </View>
                            ) : (
                                <View style={styles.statItem}>
                                    <Text style={styles.statLabel}>카테고리</Text>
                                    <Text style={[styles.statVal, { color: lineColor }]}>
                                        {selected.category}
                                    </Text>
                                </View>
                            )}
                        </View>
                    )}

                    {/* 이번 주 목표 달성 배지 */}
                    {(isInvestApp || isLossApp) && goalMinutes > 0 && (
                        <View style={[
                            styles.goalBadge,
                            achieved ? styles.goalBadgeAchieved : (isLossApp ? styles.goalBadgeWarning : styles.goalBadgePending)
                        ]}>
                            <Text style={[styles.goalBadgeIcon]}>{achieved ? '🏆' : (isLossApp ? '⚠️' : '🎯')}</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={[styles.goalBadgeTitle, { color: achieved ? colors.profit : (isLossApp ? colors.loss : colors.textPrimary) }]}>
                                    {achieved
                                        ? (isLossApp ? '이번 주 한도 달성!' : '이번 주 목표 달성!')
                                        : (isLossApp ? '이번 주 한도 초과' : '이번 주 목표 진행 중')}
                                </Text>
                                <Text style={styles.goalBadgeSub}>
                                    {Math.floor(currentWeekMinutes / 60)}h {currentWeekMinutes % 60}m / {isLossApp ? '한도' : '목표'} {Math.floor(goalMinutes / 60)}h {goalMinutes % 60}m
                                </Text>
                            </View>
                            {achievementPct !== null && (
                                <Text style={[styles.goalBadgePct, { color: achieved ? colors.profit : (isLossApp ? colors.loss : colors.textSecondary) }]}>
                                    {achievementPct}%
                                </Text>
                            )}
                        </View>
                    )}

                    {/* 차트 */}
                    {selected && (
                        <View style={styles.chartBox}>
                            <View style={styles.chartHeader}>
                                {isTokenKey(selected.app_name) ? (
                                    <AppTokenLabel key={selected.app_name} tokenKey={selected.app_name} color={colors.textPrimary} fontSize={14} style={{ flex: 1, height: 22 }} />
                                ) : (
                                    <Text style={styles.chartTitle}>{selected.app_name}</Text>
                                )}
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                    {goalMinutes > 0 && (
                                        <Text style={[styles.goalChipText, { color: isLossApp ? 'rgba(248,113,113,0.6)' : 'rgba(74,222,128,0.6)' }]}>
                                            {isLossApp ? `한도 ${Math.floor(goalMinutes / 60)}h/주` : `목표 ${Math.floor(goalMinutes / 60)}h/주`}
                                        </Text>
                                    )}
                                    <Text style={styles.chartSub}>최근 {RANGE_OPTIONS.find(o => o.weeks === rangeWeeks)?.label} · 시간(h)</Text>
                                </View>
                            </View>
                            <LineChart
                                data={chartData}
                                width={SCREEN_WIDTH - 120}
                                height={180}
                                color={lineColor}
                                thickness={2}
                                dataPointsColor={lineColor}
                                dataPointsRadius={rangeWeeks <= 8 ? 4 : 3}
                                startFillColor={lineColor}
                                startOpacity={0.2}
                                endOpacity={0.02}
                                areaChart
                                hideRules
                                xAxisColor={colors.border}
                                yAxisColor={colors.border}
                                yAxisTextStyle={{ color: colors.textMuted, fontSize: fontSize.xs, fontFamily: font.regular }}
                                xAxisLabelTextStyle={{ color: colors.textMuted, fontSize: 9, fontFamily: font.regular }}
                                noOfSections={4}
                                maxValue={maxChartVal}
                                roundToDigits={1}
                                backgroundColor={colors.bgSurface}
                                textColor={lineColor}
                                textFontSize={10}
                                showReferenceLine1={goalMinutes > 0}
                                referenceLine1Position={goalHours}
                                referenceLine1Config={{
                                    color: isLossApp ? 'rgba(248,113,113,0.4)' : 'rgba(74,222,128,0.4)',
                                    thickness: 1,
                                    width: SCREEN_WIDTH - 120,
                                    type: 'dashed',
                                    dashWidth: 4,
                                    dashGap: 4,
                                }}
                            />
                        </View>
                    )}

                    {/* 주차별 상세 */}
                    <Text style={[styles.sectionLabel, { marginTop: 20 }]}>주차별 상세</Text>
                    <View style={styles.weekList}>
                        {selected?.data.filter(d => d.minutes > 0).slice().reverse().map((d, i) => {
                            const maxMin = Math.max(...(selected?.data.map(x => x.minutes) ?? [1]));
                            const barPct = Math.min((d.minutes / Math.max(maxMin, 1)) * 100, 100);
                            const weekAchieved = goalMinutes > 0 && (
                                isInvestApp ? d.minutes >= goalMinutes : d.minutes <= goalMinutes
                            );
                            return (
                                <View key={d.week} style={[styles.weekRow, i === 0 && { borderTopWidth: 0.5, borderTopColor: colors.bgRaised }]}>
                                    <Text style={styles.weekLabel}>{d.week}</Text>
                                    <View style={styles.weekBarBg}>
                                        <View style={[styles.weekBar, { width: `${barPct}%` as any, backgroundColor: lineColor }]} />
                                    </View>
                                    <Text style={[styles.weekVal, { color: lineColor }]}>
                                        {Math.floor(d.minutes / 60)}h {d.minutes % 60}m
                                    </Text>
                                    {weekAchieved && <Text style={styles.weekAchieved}>✓</Text>}
                                </View>
                            );
                        })}
                        {selected?.data.every(d => d.minutes === 0) && (
                            <Text style={styles.emptyText}>이 기간에 기록이 없어요</Text>
                        )}
                    </View>
                </>
            )}

            <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgBase, paddingHorizontal: spacing.lg },
    rangeRow: { flexDirection: 'row', alignItems: 'center', paddingTop: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm },
    rangeLabel: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 1 },
    rangeGroup: { flexDirection: 'row', backgroundColor: colors.bgRaised, borderRadius: radius.md, padding: 3, gap: 2, flex: 1 },
    rangeBtn: { flex: 1, paddingVertical: 7, borderRadius: radius.sm, alignItems: 'center' },
    rangeBtnActive: { backgroundColor: colors.accent },
    rangeBtnText: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.textMuted },
    rangeBtnTextActive: { color: '#ffffff' },
    sectionLabel: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: spacing.sm },
    appScroll: { marginBottom: spacing.md },
    appIconBtn: { marginRight: 10, alignItems: 'center', justifyContent: 'center' },
    appIconWrap: {
        width: 40, height: 40, borderRadius: radius.md,
        backgroundColor: colors.bgRaised,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 0, borderColor: 'transparent',
        overflow: 'hidden',
    },
    appTextBtn: { paddingHorizontal: 12, paddingVertical: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, alignItems: 'center', minWidth: 60 },
    appBtnLoss: { backgroundColor: colors.lossBg, borderColor: colors.lossBorder },
    appBtnInvest: { backgroundColor: colors.profitBg, borderColor: colors.profitBorder },
    appBtnText: { fontFamily: font.medium, fontSize: fontSize.sm, color: colors.textMuted },
    appBtnTextActive: { color: '#ffffff' },
    appBtnSub: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textMuted, marginTop: 2 },
    statRow: { flexDirection: 'row', backgroundColor: colors.bgSurface, borderRadius: radius.md, marginBottom: spacing.md, overflow: 'hidden' },
    statItem: { flex: 1, padding: 14, alignItems: 'center' },
    statDivider: { width: 0.5, backgroundColor: colors.border, marginVertical: 10 },
    statLabel: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textMuted, marginBottom: 6, letterSpacing: 0.5 },
    statVal: { fontFamily: font.medium, fontSize: fontSize.md },
    goalBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        borderRadius: radius.md,
        padding: 14,
        marginBottom: spacing.md,
        borderWidth: 1,
    },
    goalBadgeAchieved: {
        backgroundColor: colors.profitBg,
        borderColor: colors.profitBorder,
    },
    goalBadgePending: {
        backgroundColor: colors.bgSurface,
        borderColor: colors.border,
    },
    goalBadgeWarning: {
        backgroundColor: colors.lossBg,
        borderColor: colors.lossBorder,
    },
    goalBadgeIcon: { fontSize: 20 },
    goalBadgeTitle: {
        fontFamily: font.medium,
        fontSize: 13,
        marginBottom: 3,
    },
    goalBadgeSub: {
        fontFamily: font.regular,
        fontSize: fontSize.xs,
        color: colors.textMuted,
    },
    goalBadgePct: {
        fontFamily: font.bold,
        fontSize: 18,
    },
    chartBox: { backgroundColor: colors.bgSurface, borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm },
    chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    chartTitle: { fontFamily: font.medium, fontSize: fontSize.md, color: colors.textPrimary },
    chartSub: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textMuted },
    goalChipText: {
        fontFamily: font.regular,
        fontSize: fontSize.xs,
    },
    weekList: { borderRadius: radius.md, overflow: 'hidden', marginBottom: spacing.sm },
    weekRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: colors.bgRaised },
    weekLabel: { fontFamily: font.regular, fontSize: 11, color: colors.textMuted, width: 52 },
    weekBarBg: { flex: 1, height: 4, backgroundColor: colors.border, borderRadius: 2 },
    weekBar: { height: 4, borderRadius: 2 },
    weekVal: { fontFamily: font.medium, fontSize: 11, width: 64, textAlign: 'right' },
    weekAchieved: { fontFamily: font.medium, fontSize: fontSize.sm, color: colors.profit, width: 16 },
    emptyBox: { paddingVertical: 48, alignItems: 'center' },
    emptyText: { fontFamily: font.medium, fontSize: fontSize.md, color: colors.textMuted, marginBottom: spacing.sm },
    emptySub: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.textDisabled, textAlign: 'center' },
});
