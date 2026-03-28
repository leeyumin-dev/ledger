import { useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Share, Alert
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import ViewShot from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import { supabase } from '../../src/lib/supabase';

type UsageItem = {
  app_name: string;
  duration_minutes: number;
  category: string;
  date: string;
};

type TabType = 'weekly' | 'monthly' | 'yearly';

export default function ShareScreen() {
  const cardRef = useRef<ViewShot>(null);
  const [tab, setTab] = useState<TabType>('weekly');
  const [usageList, setUsageList] = useState<UsageItem[]>([]);
  const [sleepHours, setSleepHours] = useState(7.5);
  const [workHours, setWorkHours] = useState(8.0);

  const today = new Date();
  const weekNum = Math.ceil(today.getDate() / 7);
  const month = today.getMonth() + 1;
  const year = today.getFullYear();

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const [settingsRes, usageRes] = await Promise.all([
      supabase.from('user_settings').select('sleep_hours, work_hours').eq('user_id', user.id).single(),
      supabase.from('app_usage').select('*').eq('user_id', user.id)
        .gte('date', `${year}-01-01`).lte('date', `${year}-12-31`),
    ]);

    if (settingsRes.data) {
      setSleepHours(settingsRes.data.sleep_hours);
      setWorkHours(settingsRes.data.work_hours);
    }
    if (usageRes.data) setUsageList(usageRes.data);
  }

  // 주간 데이터
  const startOfWeek = new Date(today);
  startOfWeek.setDate(today.getDate() - today.getDay());
  const weekStart = startOfWeek.toISOString().split('T')[0];
  const weekEnd = today.toISOString().split('T')[0];
  const weekData = usageList.filter(u => u.date >= weekStart && u.date <= weekEnd);

  // 월간 데이터
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const monthData = usageList.filter(u => u.date.startsWith(monthStr));
  const daysInMonth = new Date(year, month, 0).getDate();

  // 연간 데이터
  const yearData = usageList;
  const daysInYear = new Date(year, 1, 29).getDate() === 29 ? 366 : 365;

  function calcNet(data: UsageItem[], days: number) {
    const loss = data.filter(u => u.category === '소비').reduce((s, u) => s + u.duration_minutes, 0);
    const invest = data.filter(u => u.category === '투자').reduce((s, u) => s + u.duration_minutes, 0);
    const essential = data.filter(u => u.category === '필수').reduce((s, u) => s + u.duration_minutes, 0);
    const disposable = (24 - sleepHours - workHours) * days * 60;
    return { loss, invest, essential, net: Math.round(disposable) - loss - essential + invest };
  }

  function groupByApp(data: UsageItem[], category: string) {
    const items = data.filter(u => u.category === category);
    const map: Record<string, number> = {};
    items.forEach(u => { map[u.app_name] = (map[u.app_name] || 0) + u.duration_minutes; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }

  function calcDays(data: UsageItem[], disposableMin: number) {
    const byDate: Record<string, { loss: number; invest: number; essential: number }> = {};
    data.forEach(u => {
      if (!byDate[u.date]) byDate[u.date] = { loss: 0, invest: 0, essential: 0 };
      if (u.category === '소비') byDate[u.date].loss += u.duration_minutes;
      if (u.category === '투자') byDate[u.date].invest += u.duration_minutes;
      if (u.category === '필수') byDate[u.date].essential += u.duration_minutes;
    });
    const profit = Object.values(byDate).filter(d => disposableMin - d.loss - d.essential + d.invest >= 0).length;
    return { recorded: Object.keys(byDate).length, profit, loss: Object.keys(byDate).length - profit };
  }

  function fmt(m: number) {
    const abs = Math.abs(m);
    const h = Math.floor(abs / 60);
    const min = abs % 60;
    if (h === 0) return `${min}m`;
    if (min === 0) return `${h}h`;
    return `${h}h ${min}m`;
  }

  async function handleShare() {
    try {
      const uri = await cardRef.current?.capture?.();
      if (!uri) return;
      await Share.share({ url: uri, message: `Ledger — 시간 재무제표` });
    } catch {
      Alert.alert('오류', '공유에 실패했어요.');
    }
  }

  async function handleSave() {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('권한 필요', '갤러리 접근 권한이 필요해요.');
        return;
      }
      const uri = await cardRef.current?.capture?.();
      if (!uri) return;
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('저장 완료', '갤러리에 저장됐어요.');
    } catch {
      Alert.alert('오류', '저장에 실패했어요.');
    }
  }

  const weekStats = calcNet(weekData, 7);
  const monthStats = calcNet(monthData, daysInMonth);
  const yearStats = calcNet(yearData, daysInYear);

  const disposablePerDay = (24 - sleepHours - workHours) * 60;
  const monthDays = calcDays(monthData, disposablePerDay);
  const yearDays = calcDays(yearData, disposablePerDay);

  const weekIsProfit = weekStats.net >= 0;
  const monthIsProfit = monthStats.net >= 0;
  const yearIsProfit = yearStats.net >= 0;

  const top3MonthLoss = groupByApp(monthData, '소비').slice(0, 3);
  const top3MonthInvest = groupByApp(monthData, '투자').slice(0, 3);
  const top3YearLoss = groupByApp(yearData, '소비').slice(0, 3);
  const top3YearInvest = groupByApp(yearData, '투자').slice(0, 3);

  const tabLabel = {
    weekly: `${month}월 ${weekNum}주차`,
    monthly: `${year}년 ${month}월`,
    yearly: `${year}년`,
  }[tab];

  return (
    <View style={{ flex: 1, backgroundColor: '#0f0f0f' }}>
      <ScrollView style={styles.container}>

        {/* 헤더 + 토글 */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerSub}>공유하기</Text>
            <Text style={styles.headerTitle}>결산</Text>
          </View>
          <View style={styles.toggleWrap}>
            {(['weekly', 'monthly', 'yearly'] as TabType[]).map(t => (
              <TouchableOpacity
                key={t}
                style={[styles.toggleBtn, tab === t && styles.toggleBtnActive]}
                onPress={() => setTab(t)}
              >
                <Text style={[styles.toggleBtnText, tab === t && styles.toggleBtnTextActive]}>
                  {t === 'weekly' ? '주간' : t === 'monthly' ? '월간' : '연간'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* 캡처 카드 */}
        <ViewShot ref={cardRef} options={{ format: 'png', quality: 1.0 }} style={styles.cardWrapper}>
          <View style={styles.card}>
            <Text style={styles.cardLogo}>LEDGER</Text>
            <Text style={styles.cardTitle}>
              {tab === 'weekly' ? '주간 손익계산서' : tab === 'monthly' ? '월간 감사보고서' : '연간 사업보고서'}
            </Text>
            <Text style={styles.cardPeriod}>{tabLabel} 결산 공시</Text>

            <View style={styles.cardDivider} />

            {/* 주간 */}
            {tab === 'weekly' && (
              <>
                {groupByApp(weekData, '소비').length === 0 && groupByApp(weekData, '투자').length === 0 ? (
                  <Text style={styles.cardLabel}>이번 주 기록이 없어요</Text>
                ) : (
                  <>
                    {groupByApp(weekData, '소비').map(([app, min]) => (
                      <View key={app} style={styles.cardRow}>
                        <Text style={styles.cardLabel}>{app}</Text>
                        <Text style={styles.cardLoss}>－ {fmt(min)}</Text>
                      </View>
                    ))}
                    {groupByApp(weekData, '투자').map(([app, min]) => (
                      <View key={app} style={styles.cardRow}>
                        <Text style={styles.cardLabel}>{app}</Text>
                        <Text style={styles.cardProfit}>＋ {fmt(min)}</Text>
                      </View>
                    ))}
                    <View style={styles.cardDivider} />
                    <View style={styles.cardRow}>
                      <Text style={[styles.cardLabel, { color: '#f0ede8', fontFamily: 'GeistMono_500Medium' }]}>총 지출</Text>
                      <Text style={styles.cardLoss}>{fmt(weekStats.loss)}</Text>
                    </View>
                    <View style={styles.cardRow}>
                      <Text style={[styles.cardLabel, { color: '#f0ede8', fontFamily: 'GeistMono_500Medium' }]}>총 투자</Text>
                      <Text style={styles.cardProfit}>{fmt(weekStats.invest)}</Text>
                    </View>
                  </>
                )}
                <View style={[styles.verdictBox, weekIsProfit ? styles.verdictProfit : styles.verdictLoss]}>
                  <Text style={[styles.verdictLabel, { color: weekIsProfit ? 'rgba(74,222,128,0.7)' : 'rgba(248,113,133,0.7)' }]}>
                    {weekIsProfit ? '당기 순이익' : '당기 순손실'}
                  </Text>
                  <Text style={[styles.verdictValue, { color: weekIsProfit ? '#4ade80' : '#f87171' }]}>
                    {weekIsProfit ? '＋' : '－'} {fmt(Math.abs(weekStats.net))}
                  </Text>
                </View>
              </>
            )}

            {/* 월간 */}
            {tab === 'monthly' && (
              <>
                <View style={styles.metricsRow}>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>기록일</Text>
                    <Text style={styles.metricValue}>{monthDays.recorded}일</Text>
                    <Text style={styles.metricSub}>/ {daysInMonth}일</Text>
                  </View>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>흑자일</Text>
                    <Text style={[styles.metricValue, { color: '#4ade80' }]}>{monthDays.profit}일</Text>
                    <Text style={styles.metricSub}>/ {monthDays.recorded}일</Text>
                  </View>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>낭비일</Text>
                    <Text style={[styles.metricValue, { color: '#f87171' }]}>{monthDays.loss}일</Text>
                    <Text style={styles.metricSub}>/ {monthDays.recorded}일</Text>
                  </View>
                </View>
                <View style={styles.cardDivider} />
                <View style={styles.cardRow}>
                  <Text style={styles.cardLabel}>총 가처분 시간</Text>
                  <Text style={[styles.cardLabel, { color: '#f0ede8' }]}>{(24 - sleepHours - workHours) * daysInMonth}h</Text>
                </View>
                <View style={styles.cardRow}>
                  <Text style={styles.cardLabel}>총 지출 (소비)</Text>
                  <Text style={styles.cardLoss}>－ {fmt(monthStats.loss)}</Text>
                </View>
                <View style={styles.cardRow}>
                  <Text style={styles.cardLabel}>총 투자</Text>
                  <Text style={styles.cardProfit}>＋ {fmt(monthStats.invest)}</Text>
                </View>
                <View style={styles.cardDivider} />
                <Text style={[styles.cardLabel, { marginBottom: 6 }]}>TOP 소비</Text>
                {top3MonthLoss.map(([app, min], i) => (
                  <View key={app} style={styles.rankRow}>
                    <Text style={styles.rankNum}>0{i + 1}</Text>
                    <Text style={styles.rankApp}>{app}</Text>
                    <View style={styles.rankBarBg}>
                      <View style={[styles.rankBar, {
                        width: `${(min / (top3MonthLoss[0]?.[1] || 1)) * 100}%` as any,
                        backgroundColor: '#f87171'
                      }]} />
                    </View>
                    <Text style={[styles.rankVal, { color: '#f87171' }]}>{fmt(min)}</Text>
                  </View>
                ))}
                {top3MonthLoss.length === 0 && <Text style={styles.cardLabel}>소비 기록 없음</Text>}
                <Text style={[styles.cardLabel, { marginBottom: 6, marginTop: 8 }]}>TOP 투자</Text>
                {top3MonthInvest.map(([app, min], i) => (
                  <View key={app} style={styles.rankRow}>
                    <Text style={styles.rankNum}>0{i + 1}</Text>
                    <Text style={styles.rankApp}>{app}</Text>
                    <View style={styles.rankBarBg}>
                      <View style={[styles.rankBar, {
                        width: `${(min / (top3MonthInvest[0]?.[1] || 1)) * 100}%` as any,
                        backgroundColor: '#4ade80'
                      }]} />
                    </View>
                    <Text style={[styles.rankVal, { color: '#4ade80' }]}>{fmt(min)}</Text>
                  </View>
                ))}
                {top3MonthInvest.length === 0 && <Text style={styles.cardLabel}>투자 기록 없음</Text>}
                <View style={[styles.verdictBox, monthIsProfit ? styles.verdictProfit : styles.verdictLoss]}>
                  <Text style={[styles.verdictLabel, { color: monthIsProfit ? 'rgba(74,222,128,0.7)' : 'rgba(248,113,133,0.7)' }]}>
                    {monthIsProfit ? '월간 순이익' : '월간 순손실'}
                  </Text>
                  <Text style={[styles.verdictValue, { color: monthIsProfit ? '#4ade80' : '#f87171' }]}>
                    {monthIsProfit ? '＋' : '－'} {fmt(Math.abs(monthStats.net))}
                  </Text>
                </View>
              </>
            )}

            {/* 연간 */}
            {tab === 'yearly' && (
              <>
                <View style={styles.metricsRow}>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>기록일</Text>
                    <Text style={styles.metricValue}>{yearDays.recorded}일</Text>
                    <Text style={styles.metricSub}>/ {daysInYear}일</Text>
                  </View>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>흑자일</Text>
                    <Text style={[styles.metricValue, { color: '#4ade80' }]}>{yearDays.profit}일</Text>
                    <Text style={styles.metricSub}>일</Text>
                  </View>
                  <View style={styles.metricCard}>
                    <Text style={styles.metricLabel}>낭비일</Text>
                    <Text style={[styles.metricValue, { color: '#f87171' }]}>{yearDays.loss}일</Text>
                    <Text style={styles.metricSub}>일</Text>
                  </View>
                </View>
                <View style={styles.cardDivider} />
                <View style={styles.cardRow}>
                  <Text style={styles.cardLabel}>총 지출 (소비)</Text>
                  <Text style={styles.cardLoss}>－ {fmt(yearStats.loss)}</Text>
                </View>
                <View style={styles.cardRow}>
                  <Text style={styles.cardLabel}>총 투자</Text>
                  <Text style={styles.cardProfit}>＋ {fmt(yearStats.invest)}</Text>
                </View>
                <View style={styles.cardDivider} />
                <Text style={[styles.cardLabel, { marginBottom: 6 }]}>올해 TOP 소비</Text>
                {top3YearLoss.map(([app, min], i) => (
                  <View key={app} style={styles.rankRow}>
                    <Text style={styles.rankNum}>0{i + 1}</Text>
                    <Text style={styles.rankApp}>{app}</Text>
                    <View style={styles.rankBarBg}>
                      <View style={[styles.rankBar, {
                        width: `${(min / (top3YearLoss[0]?.[1] || 1)) * 100}%` as any,
                        backgroundColor: '#f87171'
                      }]} />
                    </View>
                    <Text style={[styles.rankVal, { color: '#f87171' }]}>{fmt(min)}</Text>
                  </View>
                ))}
                {top3YearLoss.length === 0 && <Text style={styles.cardLabel}>소비 기록 없음</Text>}
                <Text style={[styles.cardLabel, { marginBottom: 6, marginTop: 8 }]}>올해 TOP 투자</Text>
                {top3YearInvest.map(([app, min], i) => (
                  <View key={app} style={styles.rankRow}>
                    <Text style={styles.rankNum}>0{i + 1}</Text>
                    <Text style={styles.rankApp}>{app}</Text>
                    <View style={styles.rankBarBg}>
                      <View style={[styles.rankBar, {
                        width: `${(min / (top3YearInvest[0]?.[1] || 1)) * 100}%` as any,
                        backgroundColor: '#4ade80'
                      }]} />
                    </View>
                    <Text style={[styles.rankVal, { color: '#4ade80' }]}>{fmt(min)}</Text>
                  </View>
                ))}
                {top3YearInvest.length === 0 && <Text style={styles.cardLabel}>투자 기록 없음</Text>}
                <View style={[styles.verdictBox, yearIsProfit ? styles.verdictProfit : styles.verdictLoss]}>
                  <Text style={[styles.verdictLabel, { color: yearIsProfit ? 'rgba(74,222,128,0.7)' : 'rgba(248,113,133,0.7)' }]}>
                    {yearIsProfit ? '연간 순이익' : '연간 순손실'}
                  </Text>
                  <Text style={[styles.verdictValue, { color: yearIsProfit ? '#4ade80' : '#f87171' }]}>
                    {yearIsProfit ? '＋' : '－'} {fmt(Math.abs(yearStats.net))}
                  </Text>
                </View>
              </>
            )}

            <Text style={styles.watermark}>Ledger — 시간 재무제표</Text>
          </View>
        </ViewShot>

        {/* 공유/저장 버튼 */}
        <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
          <Text style={styles.shareBtnText}>공유하기</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
          <Text style={styles.saveBtnText}>이미지 저장</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f', paddingHorizontal: 24 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 72, paddingBottom: 24 },
  headerSub: { fontFamily: 'GeistMono_400Regular', fontSize: 11, color: '#5a5754', letterSpacing: 1, marginBottom: 6 },
  headerTitle: { fontFamily: 'GeistMono_500Medium', fontSize: 28, color: '#f0ede8', letterSpacing: -0.5 },
  toggleWrap: { flexDirection: 'row', backgroundColor: '#1c1c1a', borderRadius: 20, padding: 3, gap: 2 },
  toggleBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  toggleBtnActive: { backgroundColor: '#e8410a' },
  toggleBtnText: { fontFamily: 'GeistMono_400Regular', fontSize: 11, color: '#5a5754' },
  toggleBtnTextActive: { color: '#ffffff' },
  cardWrapper: { borderRadius: 20, overflow: 'hidden', marginBottom: 16 },
  card: { backgroundColor: '#111111', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 20, padding: 24 },
  cardLogo: { fontFamily: 'GeistMono_400Regular', fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: 3, marginBottom: 4 },
  cardTitle: { fontFamily: 'GeistMono_500Medium', fontSize: 18, color: '#f0ede8', marginBottom: 3 },
  cardPeriod: { fontFamily: 'GeistMono_400Regular', fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 16 },
  cardDivider: { height: 0.5, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 12 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  cardLabel: { fontFamily: 'GeistMono_400Regular', fontSize: 11, color: 'rgba(255,255,255,0.4)' },
  cardLoss: { fontFamily: 'GeistMono_500Medium', fontSize: 11, color: '#f87171' },
  cardProfit: { fontFamily: 'GeistMono_500Medium', fontSize: 11, color: '#4ade80' },
  metricsRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  metricCard: { flex: 1, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 8, padding: 10, alignItems: 'center' },
  metricLabel: { fontFamily: 'GeistMono_400Regular', fontSize: 9, color: 'rgba(255,255,255,0.3)', marginBottom: 4 },
  metricValue: { fontFamily: 'GeistMono_500Medium', fontSize: 16, color: '#f0ede8' },
  verdictBox: { borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, marginTop: 12, marginBottom: 12 },
  verdictLoss: { backgroundColor: 'rgba(248,113,133,0.1)', borderColor: 'rgba(248,113,133,0.2)' },
  verdictProfit: { backgroundColor: 'rgba(74,222,128,0.1)', borderColor: 'rgba(74,222,128,0.2)' },
  verdictLabel: { fontFamily: 'GeistMono_400Regular', fontSize: 10, letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6 },
  verdictValue: { fontFamily: 'GeistMono_500Medium', fontSize: 28, letterSpacing: -0.5 },
  watermark: { fontFamily: 'GeistMono_400Regular', fontSize: 9, color: 'rgba(255,255,255,0.2)', textAlign: 'center', letterSpacing: 1, marginTop: 8 },
  shareBtn: { backgroundColor: '#e8410a', borderRadius: 10, padding: 16, alignItems: 'center', marginBottom: 10 },
  shareBtnText: { fontFamily: 'GeistMono_500Medium', fontSize: 14, color: '#ffffff' },
  saveBtn: { backgroundColor: '#161614', borderWidth: 1, borderColor: '#2a2826', borderRadius: 10, padding: 16, alignItems: 'center' },
  saveBtnText: { fontFamily: 'GeistMono_400Regular', fontSize: 14, color: '#f0ede8' },
  metricSub: { fontFamily: 'GeistMono_400Regular', fontSize: 9, color: 'rgba(255,255,255,0.2)', marginTop: 2 },
  rankRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  rankNum: { fontFamily: 'GeistMono_400Regular', fontSize: 9, color: 'rgba(255,255,255,0.2)', width: 16 },
  rankApp: { fontFamily: 'GeistMono_400Regular', fontSize: 10, color: 'rgba(255,255,255,0.4)', width: 52 },
  rankBarBg: { flex: 1, height: 3, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 2 },
  rankBar: { height: 3, borderRadius: 2 },
  rankVal: { fontFamily: 'GeistMono_500Medium', fontSize: 10, width: 48, textAlign: 'right' },
});