import { useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Share, Alert
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import ViewShot from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { supabase } from '../../src/lib/supabase';
import { AppHeader } from '../../src/components/AppHeader';
import { AppTokenLabel } from '../../src/components/AppTokenLabel';
import { isTokenKey, getMonitoringStatus } from '../../src/lib/screenTime';
import { colors, font, fontSize, spacing, radius } from '../../src/lib/theme';

type UsageItem = {
  app_name: string;
  duration_minutes: number;
  category: string;
  date: string;
};

type TabType = 'weekly' | 'monthly' | 'yearly';

function getAnalogy(lossMinutes: number): string {
  const h = Math.floor(lossMinutes / 60);
  if (h >= 500) return `"당신이 날린 ${h}시간은 지구를 15바퀴 걸어서 돌 수 있는 시간입니다."`;
  if (h >= 300) return `"당신이 날린 ${h}시간은 에베레스트를 12번 오를 수 있는 시간입니다."`;
  if (h >= 200) return `"당신이 날린 ${h}시간은 서울-부산을 기차로 400번 오갈 수 있는 시간입니다."`;
  if (h >= 100) return `"당신이 날린 ${h}시간은 제주도를 비행기로 100번 왕복할 수 있는 시간입니다."`;
  return `"당신이 날린 ${h}시간, 아직 늦지 않았습니다."`;
}

function getBadges(
  yearDays: { recorded: number; profit: number; loss: number },
  yearStats: { loss: number; invest: number; net: number },
  top3Invest: [string, number][]
) {
  return [
    { name: '시간 연금술사', earned: yearStats.net >= 0 },
    { name: '갓생 실천가', earned: yearDays.profit >= 100 },
    { name: '기록 중독자', earned: yearDays.recorded >= 100 },
    { name: '꾸준한 관찰자', earned: yearDays.recorded >= 30 },
    { name: '첫 발걸음', earned: yearDays.recorded >= 1 },
    { name: '회생 전문가', earned: yearStats.net > 0 && yearDays.loss > yearDays.profit },
    { name: '침대 위 철학자', earned: yearDays.loss > yearDays.profit },
    { name: '독서왕', earned: top3Invest.some(([app]) => app.includes('독서') || app.includes('책')) },
    { name: '운동 머신', earned: top3Invest.some(([app]) => app.includes('운동')) },
    { name: '올라운더', earned: top3Invest.length >= 3 },
  ];
}

export default function ShareScreen() {
  const cardRef = useRef<ViewShot>(null);
  const [tab, setTab] = useState<TabType>('weekly');
  const [usageList, setUsageList] = useState<UsageItem[]>([]);
  const [sleepHours, setSleepHours] = useState(7.5);
  const [workHours, setWorkHours] = useState(8.0);
  const [prevMonthNet, setPrevMonthNet] = useState<number | null>(null);
  const [prevDefenseRate, setPrevDefenseRate] = useState<number | null>(null);
  const [nickname, setNickname] = useState('');

  const today = new Date();
  const month = today.getMonth() + 1;
  const year = today.getFullYear();
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysInYear = new Date(year, 1, 29).getDate() === 29 ? 366 : 365;

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (user.email) setNickname(user.email.split('@')[0]);

    const prevMonthDate = new Date(year, month - 2, 1);
    const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
    const prevDaysInMonth = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0).getDate();

    const [settingsRes, usageRes, prevUsageRes, monitorStatus] = await Promise.all([
      supabase.from('user_settings').select('sleep_hours, work_hours, nickname').eq('user_id', user.id).single(),
      supabase.from('app_usage').select('*').eq('user_id', user.id)
        .gte('date', `${year}-01-01`).lte('date', `${year}-12-31`),
      supabase.from('app_usage').select('*').eq('user_id', user.id)
        .gte('date', `${prevMonthStr}-01`)
        .lte('date', `${prevMonthStr}-${String(prevDaysInMonth).padStart(2, '0')}`),
      getMonitoringStatus(),
    ]);

    const validLocalKeys = new Set(monitorStatus?.appList ?? []);
    const filterStale = (list: UsageItem[]) =>
      list.filter(u => !isTokenKey(u.app_name) || validLocalKeys.has(u.app_name));

    if (settingsRes.data) {
      setSleepHours(settingsRes.data.sleep_hours);
      setWorkHours(settingsRes.data.work_hours);
      if (settingsRes.data.nickname) setNickname(settingsRes.data.nickname);
    }
    if (usageRes.data) setUsageList(filterStale(usageRes.data));

    if (prevUsageRes.data && settingsRes.data) {
      const filteredPrev = filterStale(prevUsageRes.data);
      const prev = calcNetRaw(
        filteredPrev,
        prevDaysInMonth,
        settingsRes.data.sleep_hours,
        settingsRes.data.work_hours
      );
      setPrevMonthNet(prev.net);
      const prevLoss = filteredPrev.filter((u: UsageItem) => u.category === '소비').reduce((s: number, u: UsageItem) => s + u.duration_minutes, 0);
      const prevDisposable = Math.round((24 - settingsRes.data.sleep_hours - settingsRes.data.work_hours) * prevDaysInMonth * 60);
      setPrevDefenseRate(Math.round((1 - prevLoss / Math.max(prevDisposable, 1)) * 100));
    }
  }

  function calcNetRaw(data: UsageItem[], days: number, sleep: number, work: number) {
    const loss = data.filter(u => u.category === '소비').reduce((s, u) => s + u.duration_minutes, 0);
    const invest = data.filter(u => u.category === '투자').reduce((s, u) => s + u.duration_minutes, 0);
    const essential = data.filter(u => u.category === '필수').reduce((s, u) => s + u.duration_minutes, 0);
    const disposable = (24 - sleep - work) * days * 60;
    return { loss, invest, essential, net: Math.round(disposable) - loss - essential + invest };
  }

  function calcNet(data: UsageItem[], days: number) {
    return calcNetRaw(data, days, sleepHours, workHours);
  }

  function groupByApp(data: UsageItem[], category: string): [string, number][] {
    const items = data.filter(u => u.category === category);
    const map: Record<string, number> = {};
    items.forEach(u => { map[u.app_name] = (map[u.app_name] || 0) + u.duration_minutes; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }

  function calcDays(data: UsageItem[]) {
    const byDate: Record<string, { loss: number; invest: number; essential: number }> = {};
    data.forEach(u => {
      if (!byDate[u.date]) byDate[u.date] = { loss: 0, invest: 0, essential: 0 };
      if (u.category === '소비') byDate[u.date].loss += u.duration_minutes;
      if (u.category === '투자') byDate[u.date].invest += u.duration_minutes;
      if (u.category === '필수') byDate[u.date].essential += u.duration_minutes;
    });
    const disposablePerDay = (24 - sleepHours - workHours) * 60;
    const profit = Object.values(byDate).filter(d =>
      disposablePerDay - d.loss - d.essential + d.invest >= 0
    ).length;
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

  const startOfWeek = new Date(today);
  const dayOfWeek = today.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  startOfWeek.setDate(today.getDate() - daysFromMonday);
  const toLocalStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const weekStart = toLocalStr(startOfWeek);
  const weekEnd = toLocalStr(today);
  const weekData = usageList.filter(u => u.date >= weekStart && u.date <= weekEnd);
  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const monthData = usageList.filter(u => u.date.startsWith(monthStr));
  const yearData = usageList;

  const weekStats = calcNet(weekData, 7);
  const monthStats = calcNet(monthData, daysInMonth);
  const yearStats = calcNet(yearData, daysInYear);

  const weekIsProfit = weekStats.net >= 0;
  const monthIsProfit = monthStats.net >= 0;
  const yearIsProfit = yearStats.net >= 0;

  const top3MonthLoss = groupByApp(monthData, '소비').slice(0, 3);
  const top3MonthInvest = groupByApp(monthData, '투자').slice(0, 3);
  const top3YearLoss = groupByApp(yearData, '소비').slice(0, 3);
  const top3YearInvest = groupByApp(yearData, '투자').slice(0, 3);

  const yearDays = calcDays(yearData);
  const improvement = prevMonthNet !== null ? monthStats.net - prevMonthNet : null;
  const defenseRate = Math.round(
    (1 - monthStats.loss / Math.max(Math.round((24 - sleepHours - workHours) * daysInMonth * 60), 1)) * 100
  );

  async function handleShare() {
    try {
      const uri = await cardRef.current?.capture?.();
      if (!uri) return;
      await Share.share({ url: uri, message: 'Ledger — 시간 재무제표' });
    } catch {
      Alert.alert('오류', '공유에 실패했어요.');
    }
  }

  async function handleSave() {
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') { Alert.alert('권한 필요', '갤러리 접근 권한이 필요해요.'); return; }
      const uri = await cardRef.current?.capture?.();
      if (!uri) return;
      await MediaLibrary.saveToLibraryAsync(uri);
      Alert.alert('저장 완료', '갤러리에 저장됐어요.');
    } catch {
      Alert.alert('오류', '저장에 실패했어요.');
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgBase }}>
      <AppHeader />
      <ScrollView style={styles.container}>

        {/* 탭 토글 */}
        <View style={styles.tabRow}>
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
        {/* ViewShot */}
        <ViewShot ref={cardRef} options={{ format: 'png', quality: 1.0 }} style={{ backgroundColor: colors.bgBase, paddingHorizontal: spacing.lg, paddingVertical: 28 }}>

          {/* ── 주간 ── */}
          {tab === 'weekly' && (
            <View style={styles.reportWrap}>
              <Text style={styles.weekTitle}>주간 손익계산서</Text>
              <Text style={styles.yearSub}>
                {weekStart.replace(/-/g, '.')} ~ {weekEnd.slice(5).replace('-', '.')}
              </Text>
              <Text style={styles.weekHero}>
                이번 주 당신의 시간 잔고는{'\n'}
                <Text style={{ color: weekIsProfit ? colors.profit : colors.loss, fontFamily: font.medium }}>
                  '{weekIsProfit ? '흑자' : '적자'}'
                </Text>
                입니다
              </Text>

              <View style={styles.section}>
                <View style={styles.secHeader}>
                  <View style={[styles.secDot, { backgroundColor: colors.loss }]} />
                  <Text style={styles.secLabel}>시간 손실 항목</Text>
                </View>
                {groupByApp(weekData, '소비').map(([app, min]) => (
                  <View key={app} style={styles.row}>
                    {isTokenKey(app)
                      ? <AppTokenLabel tokenKey={app} color={colors.textPrimary} fontSize={12} style={{ flex: 1, height: 26 }} />
                      : <Text style={styles.rowName}>{app}</Text>}
                    <Text style={[styles.rowVal, { color: colors.loss }]}>－ {fmt(min)}</Text>
                  </View>
                ))}
                {groupByApp(weekData, '소비').length === 0 && <Text style={styles.emptyTxt}>손실 없음</Text>}
                <View style={styles.subRow}>
                  <Text style={styles.subLabel}>합계</Text>
                  <Text style={[styles.subVal, { color: colors.loss }]}>－ {fmt(weekStats.loss)}</Text>
                </View>
              </View>

              <View style={styles.hr} />

              <View style={styles.section}>
                <View style={styles.secHeader}>
                  <View style={[styles.secDot, { backgroundColor: colors.profit }]} />
                  <Text style={styles.secLabel}>투자 수익</Text>
                </View>
                {groupByApp(weekData, '투자').map(([app, min]) => (
                  <View key={app} style={styles.row}>
                    {isTokenKey(app)
                      ? <AppTokenLabel tokenKey={app} color={colors.textPrimary} fontSize={12} style={{ flex: 1, height: 26 }} />
                      : <Text style={styles.rowName}>{app}</Text>}
                    <Text style={[styles.rowVal, { color: colors.profit }]}>＋ {fmt(min)}</Text>
                  </View>
                ))}
                {groupByApp(weekData, '투자').length === 0 && <Text style={styles.emptyTxt}>투자 없음</Text>}
                <View style={styles.subRow}>
                  <Text style={styles.subLabel}>합계</Text>
                  <Text style={[styles.subVal, { color: colors.profit }]}>＋ {fmt(weekStats.invest)}</Text>
                </View>
              </View>

              <View style={styles.hr} />

              <View style={styles.bepRow}>
                <View>
                  <Text style={styles.bepLabel}>도파민 손익분기점</Text>
                  <Text style={[styles.bepStatus, { color: weekIsProfit ? `${colors.profit}99` : `${colors.loss}99` }]}>
                    {weekIsProfit ? '흑자 주간 달성' : '적자 주간'}
                  </Text>
                </View>
                <View style={[styles.bepBox, {
                  backgroundColor: weekIsProfit ? colors.profitBg : colors.lossBg,
                  borderColor: weekIsProfit ? colors.profitBorder : colors.lossBorder,
                }]}>
                  <Text style={[styles.bepVal, { color: weekIsProfit ? colors.profit : colors.loss }]}>
                    {weekIsProfit ? '＋' : '－'} {fmt(Math.abs(weekStats.net))}
                  </Text>
                </View>
              </View>

              <View style={styles.hr} />

              <View style={styles.aiBox}>
                <Text style={styles.aiTag}>AI 잔소리 ·</Text>
                <Text style={styles.aiText}>"유튜브는 줄었는데 인스타가 늘었네. 다음 주엔 인스타 한 번 줄여봐."</Text>
              </View>

              <Text style={styles.watermark}>Ledger — 시간 재무제표</Text>
            </View>
          )}

          {/* ── 월간 ── */}
          {tab === 'monthly' && (
            <View style={styles.reportWrap}>
              <Text style={styles.monthTitle}>{month}월, {nickname || '나의'} 주식회사의</Text>
              <Text style={styles.monthSub}>시간 손익계산서</Text>

              {/* 도넛 차트 */}
              <View style={styles.donutCard}>
                <View style={styles.donutLegRow}>
                  {[
                    { label: '자기관리', color: '#39FF14' },
                    { label: '낭비', color: '#EF4444' },
                    { label: '업무', color: '#F59E0B' },
                    { label: '기타', color: '#555' },
                  ].map(a => (
                    <View key={a.label} style={styles.legItem}>
                      <View style={[styles.legDot, { backgroundColor: a.color }]} />
                      <Text style={styles.legTxt}>{a.label}</Text>
                    </View>
                  ))}
                </View>
                <View style={{ alignItems: 'center', marginBottom: 8 }}>
                  <Svg width={160} height={160} viewBox="0 0 36 36">
                    <Circle cx="18" cy="18" r="16" fill="none" stroke="#222" strokeWidth="4" />
                    <Circle cx="18" cy="18" r="16" fill="none" stroke="#39FF14" strokeWidth="4"
                      strokeDasharray="58 100" strokeDashoffset="0" transform="rotate(-90 18 18)" />
                    <Circle cx="18" cy="18" r="16" fill="none" stroke="#22C55E" strokeWidth="4"
                      strokeDasharray="47 100" strokeDashoffset="-58" transform="rotate(-90 18 18)" />
                    <Circle cx="18" cy="18" r="16" fill="none" stroke="#F59E0B" strokeWidth="4"
                      strokeDasharray="16 100" strokeDashoffset="-105" transform="rotate(-90 18 18)" />
                    <Circle cx="18" cy="18" r="16" fill="none" stroke="#EF4444" strokeWidth="4"
                      strokeDasharray="10 100" strokeDashoffset="-121" transform="rotate(-90 18 18)" />
                    <SvgText x="18" y="16" textAnchor="middle" fill="#fff" fontSize="5" fontWeight="900">
                      {`${defenseRate}%`}
                    </SvgText>
                    <SvgText x="18" y="22" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="3">
                      Investment
                    </SvgText>
                  </Svg>
                </View>
                <Text style={styles.donutCaption}>시간 자산 배분</Text>
              </View>

              {/* MVP / Villain */}
              <View style={styles.mvpGrid}>
                <View style={styles.mvpCard}>
                  <View style={styles.mvpTop}>
                    <Text style={styles.mvpBadgeG}>MVP</Text>
                  </View>
                  {top3MonthInvest[0] && isTokenKey(top3MonthInvest[0][0])
                    ? <AppTokenLabel tokenKey={top3MonthInvest[0][0]} color="#f0ede8" fontSize={13} style={{ width: 120, height: 24, marginBottom: 4 }} />
                    : <Text style={styles.mvpName}>{top3MonthInvest[0]?.[0] || '—'}</Text>}
                  <Text style={[styles.mvpTime, { color: '#39FF14' }]}>
                    ＋ {top3MonthInvest[0] ? fmt(top3MonthInvest[0][1]) : '0h'}
                  </Text>
                </View>
                <View style={styles.mvpCard}>
                  <View style={styles.mvpTop}>
                    <Text style={styles.mvpBadgeR}>Villain</Text>
                  </View>
                  {top3MonthLoss[0] && isTokenKey(top3MonthLoss[0][0])
                    ? <AppTokenLabel tokenKey={top3MonthLoss[0][0]} color="#f0ede8" fontSize={13} style={{ width: 120, height: 24, marginBottom: 4 }} />
                    : <Text style={styles.mvpName}>{top3MonthLoss[0]?.[0] || '—'}</Text>}
                  <Text style={[styles.mvpTime, { color: '#FF3131' }]}>
                    － {top3MonthLoss[0] ? fmt(top3MonthLoss[0][1]) : '0h'}
                  </Text>
                </View>
              </View>

              {/* 전월 대비 */}
              {improvement !== null && (
                <View style={styles.prevCard}>
                  <Text style={styles.prevSectionLabel}>전월 대비</Text>
                  <View style={styles.prevRateRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.prevRateLabel}>지난달 방어율</Text>
                      <Text style={styles.prevRateValDim}>{prevDefenseRate ?? '—'}%</Text>
                    </View>
                    <Text style={styles.prevArrow}>→</Text>
                    <View style={{ flex: 1, alignItems: 'flex-end' }}>
                      <Text style={styles.prevRateLabel}>이번달 방어율</Text>
                      <Text style={[styles.prevRateVal, { color: improvement >= 0 ? colors.profit : colors.loss }]}>{defenseRate}%</Text>
                    </View>
                  </View>
                  <View style={[styles.prevImprovBox, {
                    backgroundColor: improvement >= 0 ? colors.profitBg : colors.lossBg,
                    borderColor: improvement >= 0 ? colors.profitBorder : colors.lossBorder,
                  }]}>
                    <Text style={[styles.prevImprovPct, { color: improvement >= 0 ? colors.profit : colors.loss }]}>
                      {improvement >= 0 ? '+' : ''}{Math.round(Math.abs(improvement) / Math.max(Math.abs(prevMonthNet || 1), 1) * 100)}%
                    </Text>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.prevImprovTitle, { color: improvement >= 0 ? colors.profit : colors.loss }]}>
                        {improvement >= 0 ? '전월 대비 생산성 증가' : '전월 대비 생산성 감소'}
                      </Text>
                      <Text style={styles.prevImprovMsg}>
                        {improvement >= 0 ? '지난달보다 생산적인 시간이 늘었어요!' : '지난달보다 낭비가 늘었어요.'}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* 요약 카드 */}
              <View style={[styles.summaryCard, { backgroundColor: monthIsProfit ? colors.profit : colors.loss }]}>
                <View style={styles.summaryInner}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.summaryDefense}>방어율 {defenseRate}% 달성!</Text>
                    <Text style={styles.summaryMsg}>
                      {monthIsProfit ? '우수한 경영 능력을\n보여주었습니다.' : '이번 달은\n조금 아쉬웠어요.'}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.netLabel}>NET PROFIT</Text>
                    <Text style={styles.netVal}>
                      {monthIsProfit ? '＋' : '－'} {fmt(Math.abs(monthStats.net))}
                    </Text>
                  </View>
                </View>
              </View>

              <Text style={styles.watermark}>Ledger — 시간 재무제표</Text>
            </View>
          )}

          {/* ── 연간 ── */}
          {tab === 'yearly' && (
            <View style={styles.reportWrap}>
              <Text style={styles.yearTitle}>{year} 연간 경영 공시</Text>
              <Text style={styles.yearSub}>Management Disclosure</Text>

              {/* 빅 넘버 */}
              <View style={{ marginBottom: 20 }}>
                <Text style={styles.yearBigLabel}>Annual Net Investment</Text>
                <Text style={[styles.yearBigNum, { color: yearIsProfit ? colors.profit : colors.loss }]}>
                  {yearIsProfit ? '+' : '-'}{fmt(Math.abs(yearStats.net))}
                </Text>
                <View style={styles.analogyBox}>
                  <Text style={styles.analogyText}>{getAnalogy(yearStats.loss)}</Text>
                </View>
              </View>

              {/* 그리드 */}
              <View style={styles.yearGrid}>
                <View style={styles.yearGridCard}>
                  <Text style={styles.yearGridLabel}>기록의 투명성</Text>
                  <Text style={styles.yearGridVal}>{Math.round((yearDays.recorded / 365) * 100)}%</Text>
                  <Text style={styles.yearGridSub}>365일 중 {yearDays.recorded}일 기록</Text>
                  <View style={styles.barBg}>
                    <View style={[styles.barFill, { width: `${Math.round((yearDays.recorded / 365) * 100)}%` as any, backgroundColor: colors.profit }]} />
                  </View>
                </View>
                <View style={styles.yearGridCard}>
                  <Text style={styles.yearGridLabel}>최고 투자 종목</Text>
                  <Text style={[styles.yearGridVal, { fontSize: 18 }]} numberOfLines={1}>
                    {top3YearInvest[0] ? (isTokenKey(top3YearInvest[0][0]) ? '앱' : top3YearInvest[0][0]) : '—'}
                  </Text>
                  <Text style={styles.yearGridSub}>{top3YearInvest[0] ? fmt(top3YearInvest[0][1]) : '0h'}</Text>
                  <View style={styles.barBg}>
                    <View style={[styles.barFill, { width: '85%' as any, backgroundColor: colors.profit }]} />
                  </View>
                </View>
              </View>

              {/* 3대 지표 */}
              <View style={styles.yearMetrics}>
                {[
                  { label: '기록일', val: yearDays.recorded, color: colors.textPrimary },
                  { label: '흑자일', val: yearDays.profit, color: colors.profit },
                  { label: '낭비일', val: yearDays.loss, color: colors.loss },
                ].map((m, i) => (
                  <View key={m.label} style={[
                    styles.yearMetricItem,
                    i < 2 && { borderRightWidth: 0.5, borderRightColor: 'rgba(255,255,255,0.07)' }
                  ]}>
                    <Text style={[styles.yearMetricVal, { color: m.color }]}>{m.val}</Text>
                    <Text style={styles.yearMetricLabel}>{m.label}</Text>
                  </View>
                ))}
              </View>

              {/* 뱃지 */}
              <View style={{ marginBottom: 14 }}>
                <Text style={styles.badgeTitle}>갓생 획득 뱃지</Text>
                <View style={styles.badgeRow}>
                  {getBadges(yearDays, yearStats, top3YearInvest)
                    .filter(b => b.earned)
                    .map(b => (
                      <View key={b.name} style={styles.badgeItem}>
                        <Text style={styles.badgeText}>✦ {b.name}</Text>
                      </View>
                    ))}
                </View>
              </View>

              {/* 랭크 */}
              <View style={styles.rankBox}>
                <Text style={styles.rankText}>
                  귀하의 시간 관리 능력은{'\n'}Ledger 유저 중{' '}
                  <Text style={{ color: colors.accent, fontFamily: font.medium, fontSize: 16 }}>
                    상위 5%
                  </Text>
                  {'\n'}입니다.
                </Text>
              </View>

              <Text style={styles.watermark}>Ledger — 시간 재무제표</Text>
            </View>
          )}

        </ViewShot>

        {/* 공유 / 저장 */}
        <View style={{ marginTop: 16, gap: 10, paddingHorizontal: 20 }}>
          <TouchableOpacity style={styles.shareBtn} onPress={handleShare}>
            <Text style={styles.shareBtnText}>공유하기</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>이미지 저장</Text>
          </TouchableOpacity>
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  tabRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.md, paddingHorizontal: spacing.md },
  toggleBtn: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.sm, alignItems: 'center', backgroundColor: colors.bgRaised },
  toggleBtnActive: { backgroundColor: colors.accent },
  toggleBtnText: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.textMuted },
  toggleBtnTextActive: { color: '#ffffff' },

  reportWrap: { paddingBottom: spacing.md },

  // 주간
  weekTitle: { fontFamily: font.medium, fontSize: fontSize.xl, color: colors.textPrimary, textAlign: 'center', marginBottom: spacing.md },
  weekHero: { fontFamily: font.regular, fontSize: fontSize.lg, color: colors.textPrimary, textAlign: 'center', lineHeight: 28, marginBottom: spacing.lg },
  section: { paddingVertical: 14 },
  secHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  secDot: { width: 8, height: 8, borderRadius: 4 },
  secLabel: { fontFamily: font.medium, fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 1.5, textTransform: 'uppercase' },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7 },
  rowName: { fontFamily: font.regular, fontSize: 15, color: colors.textSecondary },
  rowVal: { fontFamily: font.medium, fontSize: 15 },
  emptyTxt: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.textDisabled, paddingVertical: 4 },
  subRow: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 10, borderTopWidth: 0.5, borderTopColor: colors.borderSub, marginTop: 6 },
  subLabel: { fontFamily: font.medium, fontSize: 13, color: colors.textMuted },
  subVal: { fontFamily: font.medium, fontSize: 15 },
  hr: { height: 0.5, backgroundColor: colors.borderSub },
  bepRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 18 },
  bepLabel: { fontFamily: font.medium, fontSize: 13, color: colors.textMuted, marginBottom: 4 },
  bepStatus: { fontFamily: font.regular, fontSize: fontSize.xs },
  bepBox: { borderWidth: 1, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  bepVal: { fontFamily: font.medium, fontSize: fontSize['2xl'], letterSpacing: -1 },
  aiBox: { paddingVertical: spacing.md },
  aiTag: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textDisabled, letterSpacing: 1.5, marginBottom: 6 },
  aiText: { fontFamily: font.regular, fontSize: fontSize.md, color: colors.textMuted, lineHeight: 22, fontStyle: 'italic' },
  ctaBox: { backgroundColor: colors.accent, padding: 14, alignItems: 'center', marginBottom: spacing.md },
  ctaText: { fontFamily: font.medium, fontSize: fontSize.sm, color: '#fff', letterSpacing: 1 },

  // 월간
  monthTitle: { fontFamily: font.medium, fontSize: 20, color: colors.textPrimary, textAlign: 'center', marginBottom: 2 },
  monthSub: { fontFamily: font.regular, fontSize: 13, color: colors.textMuted, textAlign: 'center', textDecorationLine: 'underline', textDecorationColor: colors.profit, marginBottom: spacing.md },
  donutCard: { backgroundColor: colors.bgSurface, borderRadius: radius.xl, padding: spacing.md, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  donutLegRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap', marginBottom: spacing.sm },
  legItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legDot: { width: 8, height: 8, borderRadius: 4 },
  legTxt: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textMuted },
  donutCaption: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textDisabled, textAlign: 'center', letterSpacing: 2, textTransform: 'uppercase' },
  mvpGrid: { flexDirection: 'row', gap: 10, marginBottom: spacing.md },
  mvpCard: { flex: 1, backgroundColor: colors.bgSurface, borderRadius: radius.xl, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  mvpTop: { marginBottom: 10 },
  mvpBadgeG: { fontFamily: font.medium, fontSize: fontSize.xs, color: colors.profit, backgroundColor: colors.profitBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, alignSelf: 'flex-start' },
  mvpBadgeR: { fontFamily: font.medium, fontSize: fontSize.xs, color: colors.loss, backgroundColor: colors.lossBg, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, alignSelf: 'flex-start' },
  mvpName: { fontFamily: font.medium, fontSize: fontSize.md, color: colors.textPrimary, marginBottom: 4 },
  mvpTime: { fontFamily: font.medium, fontSize: fontSize.xl },
  prevCard: { backgroundColor: colors.accentBg, borderRadius: radius.lg, padding: 14, marginBottom: spacing.md, borderWidth: 1, borderColor: `${colors.accent}33` },
  prevSectionLabel: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textDisabled, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 },
  prevRateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.sm },
  prevRateLabel: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textMuted, marginBottom: 2 },
  prevRateValDim: { fontFamily: font.medium, fontSize: 16, color: colors.textSecondary },
  prevArrow: { fontFamily: font.regular, fontSize: 20, color: colors.textDisabled },
  prevRateVal: { fontFamily: font.medium, fontSize: 16 },
  prevImprovBox: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderWidth: 1, borderRadius: radius.sm, padding: spacing.sm, paddingHorizontal: spacing.sm },
  prevImprovPct: { fontFamily: font.medium, fontSize: 16 },
  prevImprovTitle: { fontFamily: font.medium, fontSize: fontSize.xs, marginBottom: 2 },
  prevImprovMsg: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textMuted },
  summaryCard: { borderRadius: radius.xl, padding: 18, marginBottom: spacing.sm },
  summaryInner: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  summaryDefense: { fontFamily: font.medium, fontSize: fontSize.xs, color: 'rgba(0,0,0,0.6)', marginBottom: 4 },
  summaryMsg: { fontFamily: font.medium, fontSize: fontSize.md, color: '#000', lineHeight: 20 },
  netLabel: { fontFamily: font.regular, fontSize: fontSize.xs, color: 'rgba(0,0,0,0.6)', letterSpacing: 1, marginBottom: 2 },
  netVal: { fontFamily: font.medium, fontSize: fontSize.xl, color: '#000', fontStyle: 'italic' },

  // 연간
  yearTitle: { fontFamily: font.medium, fontSize: 24, color: colors.textPrimary, textAlign: 'center', fontStyle: 'italic', marginBottom: 2 },
  yearSub: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textDisabled, textAlign: 'center', letterSpacing: 3, textTransform: 'uppercase', marginBottom: spacing.lg },
  yearBigLabel: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: spacing.sm },
  yearBigNum: { fontFamily: font.medium, fontSize: fontSize['3xl'], letterSpacing: -2, lineHeight: 60, marginBottom: spacing.md },
  analogyBox: { backgroundColor: colors.bgSurface, borderRadius: radius.md, borderLeftWidth: 4, borderLeftColor: colors.profit, padding: 14 },
  analogyText: { fontFamily: font.regular, fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 20, fontStyle: 'italic' },
  yearGrid: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  yearGridCard: { flex: 1, backgroundColor: colors.bgSurface, borderRadius: radius.lg, padding: 14, borderWidth: 1, borderColor: colors.border },
  yearGridLabel: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 6 },
  yearGridVal: { fontFamily: font.medium, fontSize: 26, color: colors.textPrimary, marginBottom: 2 },
  yearGridSub: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textMuted, fontStyle: 'italic', marginBottom: 10 },
  barBg: { height: 4, backgroundColor: colors.border, borderRadius: 2 },
  barFill: { height: 4, borderRadius: 2 },
  yearMetrics: { flexDirection: 'row', backgroundColor: colors.bgSurface, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  yearMetricItem: { flex: 1, padding: 14, alignItems: 'center' },
  yearMetricVal: { fontFamily: font.medium, fontSize: 28, marginBottom: 4 },
  yearMetricLabel: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textDisabled },
  badgeTitle: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textMuted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: spacing.sm },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  badgeItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 7, backgroundColor: colors.bgSurface, borderRadius: 20, borderWidth: 1, borderColor: colors.profitBorder },
  badgeText: { fontFamily: font.medium, fontSize: fontSize.sm, color: colors.profit },
  rankBox: { alignItems: 'center', paddingVertical: 12, marginBottom: spacing.sm },
  rankText: { fontFamily: font.regular, fontSize: fontSize.md, color: colors.textMuted, lineHeight: 24, textAlign: 'center' },

  // 공통
  watermark: { fontFamily: font.regular, fontSize: fontSize.xs, color: colors.textDisabled, textAlign: 'center', letterSpacing: 1, marginTop: spacing.md },
  shareBtn: { backgroundColor: colors.accent, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  shareBtnText: { fontFamily: font.medium, fontSize: fontSize.md, color: '#ffffff' },
  saveBtn: { backgroundColor: colors.bgSurface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: spacing.md, alignItems: 'center' },
  saveBtnText: { fontFamily: font.regular, fontSize: fontSize.md, color: colors.textPrimary },
});