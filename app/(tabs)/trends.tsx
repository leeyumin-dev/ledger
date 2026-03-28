import { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { LineChart } from 'react-native-gifted-charts';
import { supabase } from '../../src/lib/supabase';

const SCREEN_WIDTH = Dimensions.get('window').width;

type WeeklyData = {
    week: string;
    minutes: number;
};

type AppTrend = {
    app_name: string;
    category: string;
    data: WeeklyData[];
};

export default function TrendsScreen() {
    const [trends, setTrends] = useState<AppTrend[]>([]);
    const [selectedApp, setSelectedApp] = useState<string>('');

    useFocusEffect(
        useCallback(() => {
            loadTrends();
        }, [])
    );

    async function loadTrends() {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data } = await supabase
            .from('app_usage')
            .select('app_name, date, duration_minutes, category')
            .eq('user_id', user.id)
            .order('date', { ascending: true });

        if (!data || data.length === 0) return;

        // 앱별로 그룹화
        const byApp: Record<string, { category: string; byWeek: Record<string, number> }> = {};

        data.forEach(item => {
            if (!byApp[item.app_name]) {
                byApp[item.app_name] = { category: item.category, byWeek: {} };
            }
            const week = getWeekLabel(item.date);
            byApp[item.app_name].byWeek[week] =
                (byApp[item.app_name].byWeek[week] || 0) + item.duration_minutes;
        });

        // 전체 주차 목록 (최근 8주)
        const allWeeks = getRecentWeeks(8);

        const result: AppTrend[] = Object.entries(byApp).map(([app_name, val]) => ({
            app_name,
            category: val.category,
            data: allWeeks.map(week => ({
                week,
                minutes: val.byWeek[week] || 0,
            })),
        }));

        setTrends(result);
        if (result.length > 0) setSelectedApp(result[0].app_name);
    }

    function getWeekLabel(dateStr: string) {
        const date = new Date(dateStr);
        const month = date.getMonth() + 1;
        const weekNum = Math.ceil(date.getDate() / 7);
        return `${month}/${weekNum}주`;
    }

    function getRecentWeeks(count: number) {
        const weeks: string[] = [];
        const now = new Date();
        for (let i = count - 1; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i * 7);
            weeks.push(getWeekLabel(d.toISOString().split('T')[0]));
        }
        return [...new Set(weeks)];
    }

    const selected = trends.find(t => t.app_name === selectedApp);

    const chartData = selected?.data.map(d => ({
        value: Math.round(d.minutes / 60 * 10) / 10,
        label: d.week,
        dataPointText: d.minutes > 0 ? `${Math.floor(d.minutes / 60)}h` : '',
    })) ?? [];

    const isLossApp = selected?.category === '소비';
    const lineColor = isLossApp ? '#f87171' : '#4ade80';
    const maxValue = Math.ceil(Math.max(...chartData.map(d => d.value), 1) + 1);

    return (
        <ScrollView style={styles.container}>

            <View style={styles.header}>
                <Text style={styles.headerSub}>장기 추세</Text>
                <Text style={styles.headerTitle}>추세 차트</Text>
            </View>

            <View style={styles.thickDivider} />

            {trends.length === 0 ? (
                <View style={styles.emptyBox}>
                    <Text style={styles.emptyText}>아직 데이터가 없어요</Text>
                    <Text style={styles.emptySub}>오늘 화면에서 앱 사용 시간을 추가해봐요</Text>
                </View>
            ) : (
                <>
                    {/* 앱 선택 */}
                    <Text style={styles.sectionLabel}>앱 선택</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.appScroll}>
                        {trends.map(t => (
                            <TouchableOpacity
                                key={t.app_name}
                                style={[styles.appBtn, selectedApp === t.app_name && styles.appBtnActive]}
                                onPress={() => setSelectedApp(t.app_name)}
                            >
                                <Text style={[styles.appBtnText, selectedApp === t.app_name && styles.appBtnTextActive]}>
                                    {t.app_name}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    {/* 차트 */}
                    {selected && (
                        <View style={styles.chartBox}>
                            <View style={styles.chartHeader}>
                                <Text style={styles.chartTitle}>{selected.app_name}</Text>
                                <View style={[
                                    styles.catBadge,
                                    { backgroundColor: isLossApp ? 'rgba(248,113,113,0.1)' : 'rgba(74,222,128,0.1)' }
                                ]}>
                                    <Text style={[styles.catBadgeText, { color: lineColor }]}>
                                        {selected.category}
                                    </Text>
                                </View>
                            </View>

                            <Text style={styles.chartSub}>최근 8주 · 시간(h) 기준</Text>

                            <LineChart
                                data={chartData}
                                width={SCREEN_WIDTH - 120}
                                height={180}
                                color={lineColor}
                                thickness={2}
                                dataPointsColor={lineColor}
                                dataPointsRadius={4}
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
                                maxValue={maxValue}
                                roundToDigits={1}
                                backgroundColor="#161614"
                                textColor={lineColor}
                                textFontSize={10}
                            />
                        </View>
                    )}

                    {/* 주차별 요약 */}
                    <Text style={[styles.sectionLabel, { marginTop: 24 }]}>주차별 상세</Text>
                    {selected?.data.filter(d => d.minutes > 0).reverse().map(d => (
                        <View key={d.week} style={styles.weekRow}>
                            <Text style={styles.weekLabel}>{d.week}</Text>
                            <View style={styles.weekBarBg}>
                                <View style={[
                                    styles.weekBar,
                                    {
                                        width: `${Math.min((d.minutes / Math.max(...(selected?.data.map(x => x.minutes) ?? [1]))) * 100, 100)}%` as any,
                                        backgroundColor: lineColor,
                                    }
                                ]} />
                            </View>
                            <Text style={[styles.weekVal, { color: lineColor }]}>
                                {Math.floor(d.minutes / 60)}h {d.minutes % 60}m
                            </Text>
                        </View>
                    ))}
                    {selected?.data.every(d => d.minutes === 0) && (
                        <Text style={styles.emptyText}>이 앱의 기록이 없어요</Text>
                    )}
                </>
            )}

            <View style={{ height: 40 }} />
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0f0f0f', paddingHorizontal: 24 },
    header: { paddingTop: 72, paddingBottom: 24 },
    headerSub: { fontFamily: 'GeistMono_400Regular', fontSize: 11, color: '#5a5754', letterSpacing: 1, marginBottom: 6 },
    headerTitle: { fontFamily: 'GeistMono_500Medium', fontSize: 28, color: '#f0ede8', letterSpacing: -0.5 },
    thickDivider: { height: 1.5, backgroundColor: '#3a3836', marginVertical: 12 },
    sectionLabel: { fontFamily: 'GeistMono_400Regular', fontSize: 10, color: '#5a5754', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 12 },
    appScroll: { marginBottom: 20 },
    appBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#2a2826', marginRight: 8 },
    appBtnActive: { backgroundColor: '#e8410a', borderColor: '#e8410a' },
    appBtnText: { fontFamily: 'GeistMono_400Regular', fontSize: 12, color: '#5a5754' },
    appBtnTextActive: { color: '#ffffff' },
    chartBox: { backgroundColor: '#161614', borderRadius: 12, padding: 16, marginBottom: 8 },
    chartHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    chartTitle: { fontFamily: 'GeistMono_500Medium', fontSize: 14, color: '#f0ede8' },
    chartSub: { fontFamily: 'GeistMono_400Regular', fontSize: 10, color: '#5a5754', marginBottom: 16 },
    catBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
    catBadgeText: { fontFamily: 'GeistMono_400Regular', fontSize: 10 },
    weekRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#1c1c1a' },
    weekLabel: { fontFamily: 'GeistMono_400Regular', fontSize: 11, color: '#5a5754', width: 48 },
    weekBarBg: { flex: 1, height: 4, backgroundColor: '#2a2826', borderRadius: 2 },
    weekBar: { height: 4, borderRadius: 2 },
    weekVal: { fontFamily: 'GeistMono_500Medium', fontSize: 11, width: 60, textAlign: 'right' },
    emptyBox: { paddingVertical: 48, alignItems: 'center' },
    emptyText: { fontFamily: 'GeistMono_500Medium', fontSize: 14, color: '#5a5754', marginBottom: 8 },
    emptySub: { fontFamily: 'GeistMono_400Regular', fontSize: 12, color: '#3a3836', textAlign: 'center' },
});