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
    { label: '4주', weeks: 4 },
    { label: '8주', weeks: 8 },
    { label: '12주', weeks: 12 },
    { label: '24주', weeks: 24 },
] as const;

export default function TrendsScreen() {
    const [rawData, setRawData] = useState<RawRecord[]>([]);
    const [goals, setGoals] = useState<Record<string, number>>({});
    const [userSettings, setUserSettings] = useState({ sleep: 480, work: 540 }); // 기본값 (분 단위)
    const [rangeWeeks, setRangeWeeks] = useState<4 | 8 | 12 | 24>(8);
    const syncedAt = useSyncedAt();
    const isFocused = useRef(false);

    useFocusEffect(
        useCallback(() => {
            isFocused.current = true;
            loadTrends();
            return () => { isFocused.current = false; };
        }, [])
    );

    useEffect(() => {
        if (syncedAt > 0 && isFocused.current) {
            loadTrends();
        }
    }, [syncedAt]);

    async function loadTrends() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const [usageRes, categoriesRes, settingsRes] = await Promise.all([
            supabase.from('app_usage').select('app_name, date, duration_minutes, category').eq('user_id', user.id).order('date', { ascending: true }),
            supabase.from('app_categories').select('app_name, goal_minutes').eq('user_id', user.id),
            supabase.from('user_settings').select('sleep_hours, work_hours').eq('user_id', user.id).single(),
        ]);

        if (usageRes.data) setRawData(usageRes.data);
        if (categoriesRes.data) {
            const goalMap: Record<string, number> = {};
            categoriesRes.data.forEach(c => { goalMap[c.app_name] = c.goal_minutes ?? 0; });
            setGoals(goalMap);
        }
        if (settingsRes.data) {
            setUserSettings({
                sleep: Math.round((settingsRes.data.sleep_hours || 8) * 60),
                work: Math.round((settingsRes.data.work_hours || 9) * 60),
            });
        }
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
        return `${monday.getMonth() + 1}/${monday.getDate()}`;
    }

    // 통계 계산 엔진
    const analytics = useMemo(() => {
        if (rawData.length === 0) return null;

        const now = new Date();
        const cutoff = new Date(now);
        cutoff.setDate(cutoff.getDate() - rangeWeeks * 7);
        const cutoffStr = toLocalStr(cutoff);

        const prevCutoff = new Date(cutoff);
        prevCutoff.setDate(prevCutoff.getDate() - rangeWeeks * 7);
        const prevCutoffStr = toLocalStr(prevCutoff);

        // 기간별 데이터 분리
        const currentData = rawData.filter(d => d.date >= cutoffStr);
        const previousData = rawData.filter(d => d.date >= prevCutoffStr && d.date < cutoffStr);

        // 앱별 집계 및 변화율 계산
        const aggregateApps = (data: RawRecord[]) => {
            const map: Record<string, { total: number; category: string }> = {};
            data.forEach(d => {
                if (!map[d.app_name]) map[d.app_name] = { total: 0, category: d.category };
                map[d.app_name].total += d.duration_minutes;
            });
            return map;
        };

        const currentApps = aggregateApps(currentData);
        const previousApps = aggregateApps(previousData);

        const breakdown = Object.entries(currentApps).map(([name, val]) => {
            const prevTotal = previousApps[name]?.total || 0;
            const change = prevTotal > 0 ? ((val.total - prevTotal) / prevTotal) * 100 : 0;
            const avgWeekly = val.total / rangeWeeks;
            const isOverLimit = (goals[name] || 0) > 0 && avgWeekly > goals[name];

            return {
                name,
                category: val.category,
                total: val.total,
                avgWeekly,
                change,
                isOverLimit,
                limitExceededMinutes: isOverLimit ? Math.round(avgWeekly - goals[name]) : 0
            };
        }).sort((a, b) => b.total - a.total);

        // 주간 순손익 차트 데이터 생성
        const weeklyNet: Record<string, number> = {};
        const weeks: string[] = [];
        for (let i = rangeWeeks - 1; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i * 7);
            const label = getWeekLabel(toLocalStr(d));
            weeks.push(label);
            weeklyNet[label] = 0;
        }

        // 공식 적용: 순손익 = (24h - 수면 - 업무) - (소비 + 필수) + 투자
        // 여기서는 주간 단위이므로: (24h*7 - 수면*7 - 업무*7) - (소비_주 - 필수_주) + 투자_주
        const fixedWeeklyMins = (1440 * 7) - (userSettings.sleep * 7) - (userSettings.work * 7);

        currentData.forEach(d => {
            const week = getWeekLabel(d.date);
            if (weeklyNet[week] !== undefined) {
                if (d.category === '투자') weeklyNet[week] += d.duration_minutes;
                else if (d.category === '소비' || d.category === '필수') weeklyNet[week] -= d.duration_minutes;
            }
        });

        const chartPoints = weeks.map(w => ({
            value: Math.round((fixedWeeklyMins + weeklyNet[w]) / 60 * 10) / 10,
            label: w,
        }));

        const totalNetMinutes = (fixedWeeklyMins * rangeWeeks) + Object.values(weeklyNet).reduce((a, b) => a + b, 0);
        const avgProfitRate = (totalNetMinutes / (fixedWeeklyMins * rangeWeeks)) * 100;
        const topInvestApp = breakdown.find(b => b.category === '투자')?.name || '없음';
        const riskApp = breakdown.find(b => b.isOverLimit);

        return {
            breakdown,
            chartPoints,
            totalNetMinutes,
            avgProfitRate,
            topInvestApp,
            riskApp,
            totalNetDisplay: `${Math.floor(totalNetMinutes / 60)}h ${Math.round(totalNetMinutes % 60)}m`
        };
    }, [rawData, rangeWeeks, goals, userSettings]);

    return (
        <View style={styles.container}>
            <AppHeader />
            
            <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                {/* Header Section */}
                <View style={styles.header}>
                    <Text style={styles.subHeader}>INTELLIGENCE LAB</Text>
                    <Text style={styles.title}>성장 궤적 분석</Text>
                </View>

                {/* Range Selector */}
                <View style={styles.rangeRow}>
                    <View style={styles.rangeGroup}>
                        {RANGE_OPTIONS.map(opt => (
                            <TouchableOpacity
                                key={opt.weeks}
                                style={[styles.rangeBtn, rangeWeeks === opt.weeks && styles.rangeBtnActive]}
                                onPress={() => setRangeWeeks(opt.weeks as any)}
                            >
                                <Text style={[styles.rangeBtnText, rangeWeeks === opt.weeks && styles.rangeBtnTextActive]}>
                                    {opt.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {analytics ? (
                    <>
                        {/* Stats Grid */}
                        <View style={styles.statsGrid}>
                            <View style={styles.statCard}>
                                <Text style={styles.statLabel}>평균 수익률</Text>
                                <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
                                    <Text style={[styles.statValue, { color: colors.profit }]}>
                                        {analytics.avgProfitRate > 0 ? '+' : ''}{Math.round(analytics.avgProfitRate)}%
                                    </Text>
                                    <Text style={{ fontSize: 10, color: colors.profit }}>▲</Text>
                                </View>
                            </View>
                            <View style={styles.statCard}>
                                <Text style={styles.statLabel}>최고의 투자앱</Text>
                                <Text style={styles.statValue} numberOfLines={1}>{analytics.topInvestApp}</Text>
                            </View>
                        </View>

                        {/* Main Performance Chart */}
                        <View style={styles.glassCard}>
                            <View style={styles.chartHeader}>
                                <View>
                                    <Text style={styles.cardTitle}>순손익 추이</Text>
                                    <Text style={styles.cardSub}>최근 {rangeWeeks}주간의 경영 성과</Text>
                                </View>
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={[styles.totalNetText, { color: analytics.totalNetMinutes > 0 ? colors.profit : colors.loss }]}>
                                        {analytics.totalNetMinutes > 0 ? '+' : ''}{analytics.totalNetDisplay}
                                    </Text>
                                    <Text style={styles.totalNetLabel}>TOTAL NET</Text>
                                </View>
                            </View>

                            <View style={[styles.chartBox, { overflow: 'hidden' }]}>
                                <LineChart
                                    data={analytics.chartPoints}
                                    width={SCREEN_WIDTH - 128}
                                    height={160}
                                    thickness={2}
                                    color={colors.accent}
                                    hideDataPoints
                                    areaChart
                                    startFillColor={colors.accent}
                                    startOpacity={0.15}
                                    endOpacity={0.01}
                                    initialSpacing={10}
                                    noOfSections={3}
                                    yAxisColor="rgba(255,255,255,0.05)"
                                    xAxisColor="transparent"
                                    yAxisTextStyle={[styles.axisText, { color: colors.textMuted }]}
                                    xAxisLabelTextStyle={styles.axisText}
                                    yAxisLabelSuffix="h"
                                    rulesType="solid"
                                    rulesColor="rgba(255,255,255,0.02)"
                                    dashWidth={0}
                                />
                            </View>
                        </View>

                        {/* AI Insight */}
                        <View style={styles.insightCard}>
                            <View style={styles.insightHeader}>
                                <Text style={{ fontSize: 14 }}>✨</Text>
                                <Text style={styles.insightTitle}>PATTERN INSIGHT</Text>
                            </View>
                            <Text style={styles.insightText}>
                                {analytics.topInvestApp !== '없음' 
                                    ? `"${analytics.topInvestApp}에 대한 투자가 지속되고 있습니다. 이 흐름을 유지하면 다음 달 수익률이 약 12% 개선될 것으로 예측됩니다."`
                                    : '"아직 뚜렷한 투자 지표가 보이지 않습니다. 가용 시간의 10%를 자기계발 자산으로 전환해보는 것은 어떨까요?"'}
                            </Text>
                        </View>

                        {/* Risk Analysis (Limit Exceeded) */}
                        {analytics.riskApp && (
                            <View style={styles.riskCard}>
                                <View style={styles.riskHeader}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Text style={{ fontSize: 14 }}>⚠️</Text>
                                        <Text style={styles.riskTitle}>RISK ANALYSIS</Text>
                                    </View>
                                    <View style={styles.riskBadge}>
                                        <Text style={styles.riskBadgeText}>주의항목 1건</Text>
                                    </View>
                                </View>
                                <Text style={styles.riskText}>
                                    <Text style={{ color: colors.loss, fontWeight: '700' }}>{analytics.riskApp.name}</Text> 지출이 이번 주 한도를 <Text style={{ color: colors.loss, fontWeight: '700' }}>{analytics.riskApp.limitExceededMinutes}분 초과</Text>했습니다. 자산 잠식 위험이 있으니 사용 시간 통제가 필요합니다.
                                </Text>
                            </View>
                        )}

                        {/* App Breakdown */}
                        <View style={{ marginTop: 24 }}>
                            <View style={styles.breakdownHeader}>
                                <Text style={styles.sectionLabel}>항목별 변화율</Text>
                                <Text style={styles.sectionSub}>{rangeWeeks}주 대비</Text>
                            </View>
                            
                            <View style={{ gap: 12 }}>
                                {analytics.breakdown.map((item) => (
                                    <View key={item.name} style={[styles.itemCard, item.isOverLimit && styles.itemCardRisk]}>
                                        <View style={styles.itemMain}>
                                            <View style={styles.iconBox}>
                                                {isTokenKey(item.name) ? (
                                                    <AppTokenLabel tokenKey={item.name} iconOnly fontSize={20} style={{ width: 28, height: 28 }} />
                                                ) : (
                                                    <Text style={{ fontSize: 18 }}>{item.category === '투자' ? '📚' : '📱'}</Text>
                                                )}
                                                {item.isOverLimit && <View style={styles.riskDot} />}
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                                    <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                                                    {item.isOverLimit && <Text style={styles.overLimitLabel}>OVER LIMIT</Text>}
                                                </View>
                                                <Text style={styles.itemSub}>주평균 {Math.floor(item.avgWeekly / 60)}h {Math.round(item.avgWeekly % 60)}m {item.isOverLimit ? '(한도 초과)' : ''}</Text>
                                            </View>
                                            <View style={{ alignItems: 'flex-end' }}>
                                                <Text style={[styles.changeText, { color: item.change === 0 ? colors.textMuted : item.category === '소비' ? (item.change > 0 ? colors.loss : colors.profit) : (item.change > 0 ? colors.profit : colors.loss) }]}>
                                                    {item.change > 0 ? '+' : ''}{Math.round(item.change)}%
                                                </Text>
                                                <Text style={styles.changeLabel}>
                                                    {item.change === 0 ? 'STABLE' : item.category === '소비' ? (item.change > 0 ? 'UPWARD' : 'REDUCED') : (item.change > 0 ? 'GROWTH' : 'DECLINE')}
                                                </Text>
                                            </View>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        </View>
                    </>
                ) : (
                    <View style={styles.emptyBox}>
                        <Text style={styles.emptyText}>분석할 데이터가 충분하지 않습니다</Text>
                        <Text style={styles.emptySub}>기록이 쌓이면 정밀한 성장 궤적을 분석해 드립니다.</Text>
                    </View>
                )}

                <View style={{ height: 100 }} />
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgBase },
    scrollContent: { paddingHorizontal: 24 },
    header: { paddingTop: 24, marginBottom: 24 },
    subHeader: { fontFamily: font.regular, fontSize: 10, color: colors.textMuted, letterSpacing: 2, marginBottom: 4 },
    title: { fontFamily: font.bold, fontSize: 24, color: colors.textPrimary, letterSpacing: -1 },
    rangeRow: { marginBottom: 32 },
    rangeGroup: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.05)', padding: 4, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' },
    rangeBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10 },
    rangeBtnActive: { backgroundColor: colors.accent, shadowColor: colors.accent, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10 },
    rangeBtnText: { fontFamily: font.medium, fontSize: 11, color: colors.textMuted },
    rangeBtnTextActive: { color: '#ffffff' },
    statsGrid: { flexDirection: 'row', gap: 12, marginBottom: 12 },
    statCard: { flex: 1, backgroundColor: colors.bgSurface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.border },
    statLabel: { fontFamily: font.regular, fontSize: 9, color: colors.textMuted, letterSpacing: 1.5, marginBottom: 8, textTransform: 'uppercase' },
    statValue: { fontFamily: font.bold, fontSize: 18, color: colors.textPrimary },
    glassCard: { backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', marginBottom: 20 },
    chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
    cardTitle: { fontFamily: font.bold, fontSize: 14, color: colors.textPrimary, marginBottom: 2 },
    cardSub: { fontFamily: font.regular, fontSize: 10, color: colors.textMuted },
    totalNetText: { fontFamily: font.bold, fontSize: 12, letterSpacing: -0.5 },
    totalNetLabel: { fontFamily: font.bold, fontSize: 8, color: colors.textDisabled, marginTop: 2 },
    chartBox: { marginTop: 10, alignItems: 'center' },
    axisText: { color: colors.textDisabled, fontSize: 9, fontFamily: font.regular },
    insightCard: { backgroundColor: 'rgba(139, 92, 246, 0.05)', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: 'rgba(139, 92, 246, 0.1)', marginBottom: 12 },
    insightHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    insightTitle: { fontFamily: font.bold, fontSize: 10, color: '#a78bfa', letterSpacing: 1.5 },
    insightText: { fontFamily: font.regular, fontSize: 12, color: colors.textSecondary, lineHeight: 20, fontStyle: 'italic' },
    riskCard: { backgroundColor: 'rgba(244, 63, 94, 0.05)', borderRadius: 24, padding: 20, borderWidth: 1, borderColor: 'rgba(244, 63, 94, 0.1)', marginBottom: 24 },
    riskHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    riskTitle: { fontFamily: font.bold, fontSize: 10, color: '#fb7185', letterSpacing: 1.5 },
    riskBadge: { backgroundColor: 'rgba(244, 63, 94, 0.1)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 100 },
    riskBadgeText: { fontFamily: font.bold, fontSize: 8, color: colors.loss },
    riskText: { fontFamily: font.regular, fontSize: 12, color: colors.textSecondary, lineHeight: 20 },
    breakdownHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    sectionLabel: { fontFamily: font.bold, fontSize: 11, color: colors.textMuted, letterSpacing: 1.5, textTransform: 'uppercase' },
    sectionSub: { fontFamily: font.regular, fontSize: 9, color: colors.textDisabled },
    itemCard: { backgroundColor: 'rgba(255,255,255,0.02)', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.04)' },
    itemCardRisk: { borderColor: 'rgba(244, 63, 94, 0.15)', backgroundColor: 'rgba(244, 63, 94, 0.01)' },
    itemMain: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    iconBox: { width: 36, height: 36, backgroundColor: colors.bgBase, borderRadius: 10, alignItems: 'center', justifyContent: 'center', position: 'relative' },
    riskDot: { position: 'absolute', top: -1, right: -1, width: 6, height: 6, backgroundColor: colors.loss, borderRadius: 3 },
    itemName: { fontFamily: font.bold, fontSize: 12, color: colors.textPrimary },
    overLimitLabel: { fontFamily: font.bold, fontSize: 7, color: colors.loss, letterSpacing: -0.2 },
    itemSub: { fontFamily: font.regular, fontSize: 9, color: colors.textDisabled, marginTop: 1 },
    changeText: { fontFamily: font.bold, fontSize: 12 },
    changeLabel: { fontFamily: font.bold, fontSize: 7, color: colors.textDisabled, marginTop: 1 },
    emptyBox: { paddingVertical: 80, alignItems: 'center' },
    emptyText: { fontFamily: font.medium, fontSize: 14, color: colors.textMuted, marginBottom: 8 },
    emptySub: { fontFamily: font.regular, fontSize: 12, color: colors.textDisabled },
});

