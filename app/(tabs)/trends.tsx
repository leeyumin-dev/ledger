import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { LineChart } from 'react-native-gifted-charts';
import { supabase } from '../../src/lib/supabase';
import { AppHeader } from '../../src/components/AppHeader';
import { AppTokenLabel } from '../../src/components/AppTokenLabel';
import { isTokenKey } from '../../src/lib/screenTime';
import { useSyncedAt } from '../../src/lib/SyncContext';

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
    const lineColor = isLossApp ? '#f87171' : '#4ade80';
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
        <View style={{ flex: 1, backgroundColor: '#0f0f0f' }}>
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
                            const ringColor = t.category === '소비' ? '#f87171' : '#4ade80';
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
                                    <Text style={[styles.statVal, { color: achieved ? '#4ade80' : '#f87171' }]}>
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
                                <Text style={[styles.goalBadgeTitle, { color: achieved ? '#4ade80' : (isLossApp ? '#f87171' : '#f0ede8') }]}>
                                    {achieved
                                        ? (isLossApp ? '이번 주 한도 달성!' : '이번 주 목표 달성!')
                                        : (isLossApp ? '이번 주 한도 초과' : '이번 주 목표 진행 중')}
                                </Text>
                                <Text style={styles.goalBadgeSub}>
                                    {Math.floor(currentWeekMinutes / 60)}h {currentWeekMinutes % 60}m / {isLossApp ? '한도' : '목표'} {Math.floor(goalMinutes / 60)}h {goalMinutes % 60}m
                                </Text>
                            </View>
                            {achievementPct !== null && (
                                <Text style={[styles.goalBadgePct, { color: achieved ? '#4ade80' : (isLossApp ? '#f87171' : '#9a9690') }]}>
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
                                    <AppTokenLabel key={selected.app_name} tokenKey={selected.app_name} color="#f0ede8" fontSize={14} style={{ flex: 1, height: 22 }} />
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
                                xAxisColor="#2a2826"
                                yAxisColor="#2a2826"
                                yAxisTextStyle={{ color: '#5a5754', fontSize: 10, fontFamily: 'GeistMono_400Regular' }}
                                xAxisLabelTextStyle={{ color: '#5a5754', fontSize: 9, fontFamily: 'GeistMono_400Regular' }}
                                noOfSections={4}
                                maxValue={maxChartVal}
                                roundToDigits={1}
                                backgroundColor="#161614"
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
                                <View key={d.week} style={[styles.weekRow, i === 0 && { borderTopWidth: 0.5, borderTopColor: '#1c1c1a' }]}>
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
    container: { flex: 1, backgroundColor: '#0f0f0f', paddingHorizontal: 24 },
    rangeRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 16, paddingBottom: 12, gap: 12 },
    rangeLabel: { fontFamily: 'GeistMono_400Regular', fontSize: 10, color: '#5a5754', letterSpacing: 1 },
    rangeGroup: { flexDirection: 'row', backgroundColor: '#1c1c1a', borderRadius: 10, padding: 3, gap: 2, flex: 1 },
    rangeBtn: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center' },
    rangeBtnActive: { backgroundColor: '#e8410a' },
    rangeBtnText: { fontFamily: 'GeistMono_400Regular', fontSize: 12, color: '#5a5754' },
    rangeBtnTextActive: { color: '#ffffff' },
    sectionLabel: { fontFamily: 'GeistMono_400Regular', fontSize: 10, color: '#5a5754', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 },
    appScroll: { marginBottom: 16 },
    // 토큰키 앱: 아이콘만, 텍스트 앱: 기존 박스
    appIconBtn: { marginRight: 10, alignItems: 'center', justifyContent: 'center' },
    appIconWrap: {
        width: 40, height: 40, borderRadius: 12,
        backgroundColor: '#1c1c1a',
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 0, borderColor: 'transparent',
        overflow: 'hidden',
    },
    appTextBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: '#2a2826', alignItems: 'center', minWidth: 60 },
    appBtnLoss: { backgroundColor: 'rgba(248,113,113,0.1)', borderColor: 'rgba(248,113,113,0.3)' },
    appBtnInvest: { backgroundColor: 'rgba(74,222,128,0.1)', borderColor: 'rgba(74,222,128,0.3)' },
    appBtnText: { fontFamily: 'GeistMono_500Medium', fontSize: 12, color: '#5a5754' },
    appBtnTextActive: { color: '#ffffff' },
    appBtnSub: { fontFamily: 'GeistMono_400Regular', fontSize: 9, color: '#5a5754', marginTop: 2 },
    statRow: { flexDirection: 'row', backgroundColor: '#161614', borderRadius: 12, marginBottom: 16, overflow: 'hidden' },
    statItem: { flex: 1, padding: 14, alignItems: 'center' },
    statDivider: { width: 0.5, backgroundColor: '#2a2826', marginVertical: 10 },
    statLabel: { fontFamily: 'GeistMono_400Regular', fontSize: 9, color: '#5a5754', marginBottom: 6, letterSpacing: 0.5 },
    statVal: { fontFamily: 'GeistMono_500Medium', fontSize: 14 },
    goalBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: 12,
        padding: 14,
        marginBottom: 16,
        borderWidth: 1,
    },
    goalBadgeAchieved: {
        backgroundColor: 'rgba(74,222,128,0.08)',
        borderColor: 'rgba(74,222,128,0.25)',
    },
    goalBadgePending: {
        backgroundColor: '#161614',
        borderColor: '#2a2826',
    },
    goalBadgeWarning: {
        backgroundColor: 'rgba(248,113,113,0.06)',
        borderColor: 'rgba(248,113,113,0.2)',
    },
    goalBadgeIcon: { fontSize: 20 },
    goalBadgeTitle: {
        fontFamily: 'GeistMono_500Medium',
        fontSize: 13,
        marginBottom: 3,
    },
    goalBadgeSub: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 11,
        color: '#5a5754',
    },
    goalBadgePct: {
        fontFamily: 'GeistMono_700Bold',
        fontSize: 18,
    },
    chartBox: { backgroundColor: '#161614', borderRadius: 12, padding: 16, marginBottom: 8 },
    chartHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
    chartTitle: { fontFamily: 'GeistMono_500Medium', fontSize: 14, color: '#f0ede8' },
    chartSub: { fontFamily: 'GeistMono_400Regular', fontSize: 10, color: '#5a5754' },
    goalChipText: {
        fontFamily: 'GeistMono_400Regular',
        fontSize: 10,
        color: 'rgba(74,222,128,0.6)',
    },
    weekList: { borderRadius: 12, overflow: 'hidden', marginBottom: 8 },
    weekRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: '#1c1c1a' },
    weekLabel: { fontFamily: 'GeistMono_400Regular', fontSize: 11, color: '#5a5754', width: 52 },
    weekBarBg: { flex: 1, height: 4, backgroundColor: '#2a2826', borderRadius: 2 },
    weekBar: { height: 4, borderRadius: 2 },
    weekVal: { fontFamily: 'GeistMono_500Medium', fontSize: 11, width: 64, textAlign: 'right' },
    weekAchieved: { fontFamily: 'GeistMono_500Medium', fontSize: 12, color: '#4ade80', width: 16 },
    emptyBox: { paddingVertical: 48, alignItems: 'center' },
    emptyText: { fontFamily: 'GeistMono_500Medium', fontSize: 14, color: '#5a5754', marginBottom: 8 },
    emptySub: { fontFamily: 'GeistMono_400Regular', fontSize: 12, color: '#3a3836', textAlign: 'center' },
});
