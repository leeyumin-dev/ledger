import { useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Share, Alert, Dimensions
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import ViewShot from 'react-native-view-shot';
import * as MediaLibrary from 'expo-media-library';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { supabase } from '../../src/lib/supabase';
import { AppHeader } from '../../src/components/AppHeader';
import { AppTokenLabel } from '../../src/components/AppTokenLabel';
import { isTokenKey, getMonitoringStatus } from '../../src/lib/screenTime';
import { colors, font, fontSize, spacing, radius, shadows, gradients } from '../../src/lib/theme';
import { getWeeklyPersona, getMonthlyPersona, getYearlyPersona, Persona } from '../../src/lib/personas';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type UsageItem = {
  app_name: string;
  duration_minutes: number;
  category: string;
  date: string;
};

type TabType = 'weekly' | 'monthly' | 'yearly';

function getAIComment(isProfit: boolean, assetRate: number, type: 'weekly' | 'monthly' | 'yearly') {
  const period = type === 'weekly' ? '이번 주' : type === 'monthly' ? '이번 달' : '지난 1년';
  if (isProfit && assetRate > 40) {
    return `"${period} 당신의 시간 경영은 매우 공격적인 자산 형성 능력을 보여주었습니다. 특히 투자 비중이 ${assetRate.toFixed(1)}%로 우수하여 장기적인 성장이 기대됩니다."`;
  }
  if (isProfit) {
    return `"${period} 안정적인 흑자 경영을 달성했습니다. 불필요한 지출을 잘 방어하셨네요. 현재의 리듬을 유지하며 조금 더 공격적인 투자를 시도해보세요."`;
  }
  if (assetRate > 20) {
    return `"${period} 투자는 꾸준히 이루어졌으나, 고정 지출이나 도파민 소비가 예상보다 컸습니다. 순손실을 줄이기 위한 지출 구조조정이 필요해 보입니다."`;
  }
  return `"${period} 경영 상태가 다소 불안정합니다. 시간 자산이 빠르게 누수되고 있습니다. 다음 기수에는 가장 먼저 '방어해야 할 앱' 1가지를 정해보는 건 어떨까요?"`;
}

function getBadges(
  yearDays: { recorded: number; profit: number; loss: number },
  yearStats: { net: number },
  top3Invest: [string, number][]
) {
  const all = [
    { name: '시간 연금술사', icon: '💎', earned: yearStats.net >= 0 },
    { name: '갓생 실천가', icon: '🔥', earned: yearDays.profit >= 100 },
    { name: '기록 중독자', icon: '📝', earned: yearDays.recorded >= 100 },
    { name: '회생 전문가', icon: '🚑', earned: yearStats.net > 0 && yearDays.loss > yearDays.profit },
    { name: '독서왕', icon: '📚', earned: top3Invest.some(([app]) => app.includes('독서') || app.includes('책')) },
    { name: '운동 머신', icon: '🏋️', earned: top3Invest.some(([app]) => app.includes('운동')) },
  ];
  return all.filter(b => b.earned).slice(0, 5);
}

export default function ShareScreen() {
  const cardRef = useRef<ViewShot>(null);
  const [tab, setTab] = useState<TabType>('weekly');
  const [usageList, setUsageList] = useState<UsageItem[]>([]);
  const [sleepHours, setSleepHours] = useState(7.5);
  const [workHours, setWorkHours] = useState(8.0);
  const [prevMonthNet, setPrevMonthNet] = useState<number | null>(null);
  const [nickname, setNickname] = useState('');
  const [loading, setLoading] = useState(true);

  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysInYear = new Date(year, 1, 29).getDate() === 29 ? 366 : 365;

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [tab])
  );

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    if (user.email) setNickname(user.email.split('@')[0]);

    const prevMonthDate = new Date(year, month - 2, 1);
    const prevMonthStr = `${prevMonthDate.getFullYear()}-${String(prevMonthDate.getMonth() + 1).padStart(2, '0')}`;
    const prevDaysInMonth = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0).getDate();

    const [settingsRes, usageRes, prevUsageRes, monitorStatus] = await Promise.all([
      supabase.from('user_settings').select('sleep_hours, work_hours, nickname').eq('user_id', user.id).single(),
      supabase.from('app_usage').select('*').eq('user_id', user.id).gte('date', `${year}-01-01`),
      supabase.from('app_usage').select('*').eq('user_id', user.id).gte('date', `${prevMonthStr}-01`).lte('date', `${prevMonthStr}-${prevDaysInMonth}`),
      getMonitoringStatus(),
    ]);

    let curSl = 7.5; let curWk = 8.0;
    if (settingsRes.data) {
      curSl = settingsRes.data.sleep_hours; curWk = settingsRes.data.work_hours;
      setSleepHours(curSl); setWorkHours(curWk);
      if (settingsRes.data.nickname) setNickname(settingsRes.data.nickname);
    }
    
    const validLocalKeys = new Set(monitorStatus?.appList ?? []);
    const filterStale = (list: UsageItem[]) =>
      list.filter(u => !isTokenKey(u.app_name) || validLocalKeys.has(u.app_name));

    const filteredUsage = filterStale(usageRes.data ?? []);
    setUsageList(filteredUsage);

    let analysisData = [];
    let analysisDays = 7;
    if (tab === 'weekly') {
      const { start, end } = getCurrentWeekRange();
      analysisData = filteredUsage.filter(u => u.date >= start && u.date <= end);
      analysisDays = 7;
    } else if (tab === 'monthly') {
      analysisData = filteredUsage.filter(u => u.date.startsWith(`${year}-${String(month).padStart(2, '0')}`));
      analysisDays = daysInMonth;
    } else {
      analysisData = filteredUsage;
      analysisDays = daysInYear;
    }

    if (prevUsageRes.data) {
      const pData = (prevUsageRes.data as UsageItem[]).filter(u => !isTokenKey(u.app_name) || validLocalKeys.has(u.app_name));
      const prev = calcNetRaw(pData, prevDaysInMonth, curSl, curWk);
      setPrevMonthNet(prev.net);
    }
    setLoading(false);
  }

  function getCurrentWeekRange() {
    const d = new Date(); const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const mon = new Date(d.setDate(diff)); const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const f = (date: Date) => date.toISOString().split('T')[0];
    return { start: f(mon), end: f(sun) };
  }

  function calculateAnalysis(data: UsageItem[], days: number, sleep: number, work: number) {
    const loss = data.filter(u => u.category === '소비').reduce((s, u) => s + u.duration_minutes, 0);
    const invest = data.filter(u => u.category === '투자').reduce((s, u) => s + u.duration_minutes, 0);
    const essential = data.filter(u => u.category === '필수').reduce((s, u) => s + u.duration_minutes, 0);
    const totalDispMin = (24 - sleep - work) * days * 60;
    const netMin = totalDispMin - loss - essential + invest;
    return {
      isProfit: netMin >= 0, netMinutes: netMin,
      assetFormationRate: totalDispMin > 0 ? (invest / totalDispMin) * 100 : 0,
      consumptionRate: totalDispMin > 0 ? (loss / totalDispMin) * 100 : 0,
      workRate: (work * days * 60) / (24 * days * 60) * 100,
      sleepRate: (sleep * days * 60) / (24 * days * 60) * 100,
    };
  }

  function calcNetRaw(data: UsageItem[], days: number, sleep: number, work: number) {
    const loss = data.filter(u => u.category === '소비').reduce((s, u) => s + u.duration_minutes, 0);
    const invest = data.filter(u => u.category === '투자').reduce((s, u) => s + u.duration_minutes, 0);
    const essential = data.filter(u => u.category === '필수').reduce((s, u) => s + u.duration_minutes, 0);
    const disposable = (24 - sleep - work) * days * 60;
    return { loss, invest, essential, net: Math.round(disposable) - loss - essential + invest };
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
    const profit = Object.values(byDate).filter(d => disposablePerDay - d.loss - d.essential + d.invest >= 0).length;
    return { recorded: Object.keys(byDate).length, profit, loss: Object.keys(byDate).length - profit };
  }

  function fmt(m: number) {
    const abs = Math.abs(m); const h = Math.floor(abs / 60); const min = abs % 60;
    return h > 0 ? `${h}h ${min}m` : `${min}m`;
  }

  const { start: wStart, end: wEnd } = getCurrentWeekRange();
  const weekData = usageList.filter(u => u.date >= wStart && u.date <= wEnd);
  const weekStats = calculateAnalysis(weekData, 7, sleepHours, workHours);
  const top3WeekItems = Object.entries(weekData.filter(u => u.category === '투자' || u.category === '소비').reduce((acc, curr) => { acc[curr.app_name] = { min: (acc[curr.app_name]?.min || 0) + curr.duration_minutes, category: curr.category }; return acc; }, {} as Record<string, { min: number, category: string }>) ).sort((a, b) => b[1].min - a[1].min).slice(0, 3);

  const monthStr = `${year}-${String(month).padStart(2, '0')}`;
  const monthData = usageList.filter(u => u.date.startsWith(monthStr));
  const monthStats = calcNetRaw(monthData, daysInMonth, sleepHours, workHours);
  const monthIsProfit = monthStats.net >= 0;
  const defenseRate = Math.round((1 - monthStats.loss / Math.max(Math.round((24 - sleepHours - workHours) * daysInMonth * 60), 1)) * 100);
  const top5MonthItems = Object.entries(monthData.filter(u => u.category === '투자' || u.category === '소비').reduce((acc, curr) => { acc[curr.app_name] = { min: (acc[curr.app_name]?.min || 0) + curr.duration_minutes, category: curr.category }; return acc; }, {} as Record<string, { min: number, category: string }>) ).sort((a, b) => b[1].min - a[1].min).slice(0, 5);

  const yearStats = calcNetRaw(usageList, daysInYear, sleepHours, workHours);
  const yearIsProfit = yearStats.net >= 0;
  const yearDays = calcDays(usageList);
  const top3YearInvest = Object.entries(usageList.filter(u => u.category === '투자').reduce((acc, curr) => { acc[curr.app_name] = (acc[curr.app_name] || 0) + curr.duration_minutes; return acc; }, {} as Record<string, number>)).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const earnedBadges = getBadges(yearDays, yearStats, top3YearInvest as [string, number][]);

  const monthAnalysis = calculateAnalysis(monthData, daysInMonth, sleepHours, workHours);
  const yearAnalysis = calculateAnalysis(usageList, daysInYear, sleepHours, workHours);
  const persona = tab === 'weekly' ? getWeeklyPersona(weekStats)
    : tab === 'monthly' ? getMonthlyPersona(monthAnalysis)
    : getYearlyPersona(yearAnalysis);

  const getYearlyRhythm = () => {
    const result: (boolean | null)[] = [];
    const dayMap: Record<string, boolean> = {};
    usageList.forEach(u => {
      const dStats = calculateAnalysis(usageList.filter(x => x.date === u.date), 1, sleepHours, workHours);
      dayMap[u.date] = dStats.isProfit;
    });
    for (let i = 0; i < 200; i++) {
      const d = new Date(year, 0, i + 1).toISOString().split('T')[0];
      result.push(dayMap[d] ?? null);
    }
    return result;
  };

  async function handleShare() {
    const uri = await cardRef.current?.capture?.();
    if (uri) await Share.share({ url: uri, message: '나의 시간 재무제표 결산' });
  }

  async function handleSave() {
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') return Alert.alert('권한 필요', '갤러리 권한이 필요해요.');
    const uri = await cardRef.current?.capture?.();
    if (uri) { await MediaLibrary.saveToLibraryAsync(uri); Alert.alert('저장 완료', '갤러리에 저장됐어요.'); }
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgBase }}>
      <AppHeader />
      <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
        <View style={styles.tabRow}>
          {(['weekly', 'monthly', 'yearly'] as TabType[]).map(t => (
            <TouchableOpacity key={t} style={[styles.toggleBtn, tab === t && styles.toggleBtnActive]} onPress={() => setTab(t)}>
              <Text style={[styles.toggleBtnText, tab === t && styles.toggleBtnTextActive]}>{t === 'weekly' ? '주간' : t === 'monthly' ? '월간' : '연간'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <ViewShot ref={cardRef} options={{ format: 'png', quality: 1.0 }} style={{ backgroundColor: colors.bgBase, paddingHorizontal: 20, paddingVertical: 24 }}>
          {tab === 'weekly' && (
            <View style={[styles.reportCanvas, persona && { borderColor: `${persona.color}40` }]}>
              <View style={styles.headerSection}>
                <Text style={styles.reportDate}>{wStart.replace(/-/g, '.')} — {wEnd.slice(5).replace('-', '.')}</Text>
                {persona && (
                  <View style={[styles.personaBadge, { borderColor: `${persona.color}40`, backgroundColor: `${persona.color}10` }]}>
                    <Text style={[styles.personaBadgeText, { color: persona.color }]}>{persona.emoji} {persona.label}</Text>
                  </View>
                )}
              </View>
              <View style={styles.heroSection}>
                <Text style={styles.heroLabel}>주간 당기 순손익</Text>
                <View style={styles.heroValueGroup}><Text style={[styles.heroValue, { color: weekStats.isProfit ? colors.profit : colors.loss }]} adjustsFontSizeToFit numberOfLines={1}>{weekStats.isProfit ? '＋' : '－'}{fmt(weekStats.netMinutes)}</Text></View>
                <Text style={styles.heroStatus}>이번 주 시간 잔고는 <Text style={{ color: weekStats.isProfit ? colors.profit : colors.loss, fontFamily: font.bold }}>{weekStats.isProfit ? '흑자' : '적자'}</Text>입니다.</Text>
              </View>
              <View style={styles.aiCommentBox}>
                <View style={styles.aiHeader}><Text style={styles.aiIcon}>✨</Text><Text style={styles.aiTitle}>AI 경영 분석관 리포트</Text></View>
                <Text style={styles.aiText}>{getAIComment(weekStats.isProfit, weekStats.assetFormationRate, 'weekly')}</Text>
              </View>
              <View style={styles.metricsGrid}>
                <View style={styles.metricItem}><Text style={styles.metricLabel}>손익분기점 (BEP)</Text><Text style={styles.metricVal}>{weekStats.isProfit ? '달성 완료' : '미달성'}</Text><Text style={[styles.metricSub, { color: weekStats.isProfit ? colors.profit : colors.loss }]}>{weekStats.isProfit ? '▲ 안정 경영' : '▼ 지출 과다'}</Text></View>
                <View style={[styles.metricItem, { borderLeftWidth: 1, borderLeftColor: colors.border }]}><Text style={styles.metricLabel}>자산 형성률</Text><Text style={styles.metricVal}>{weekStats.assetFormationRate.toFixed(1)}%</Text><Text style={[styles.metricSub, { color: colors.textSecondary }]}>LEVEL: {weekStats.assetFormationRate > 30 ? 'HIGH' : 'NORMAL'}</Text></View>
              </View>
              <View style={styles.portfolioSection}>
                <Text style={styles.sectionLabel}>주요 자산 및 지출 내역</Text>
                <View style={styles.assetTable}>
                  {top3WeekItems.map(([name, data]) => (
                    <View key={name} style={styles.assetRow}><Text style={styles.assetName}>{name}</Text><Text style={[styles.assetTime, { color: data.category === '투자' ? colors.profit : colors.loss }]}>{data.category === '투자' ? '＋' : '－'}{fmt(data.min)}</Text></View>
                  ))}
                </View>
              </View>
              <Text style={styles.watermark}>시간 재무제표 LEDGER</Text>
            </View>
          )}

          {tab === 'monthly' && (
            <View style={[styles.reportCanvas, persona && { borderColor: `${persona.color}40` }]}>
              <View style={styles.headerSection}>
                <Text style={styles.monthSubLabel}>{year}년 {month}월</Text>
                <Text style={styles.corpTitle}>{nickname || '나의'} 주식회사</Text>
                <Text style={styles.statementType}>시간 경영 결산 보고서</Text>
                {persona && (
                  <View style={[styles.personaBadge, { marginTop: 16, borderColor: `${persona.color}40`, backgroundColor: `${persona.color}10` }]}>
                    <Text style={[styles.personaBadgeText, { color: persona.color }]}>{persona.emoji} {persona.label}</Text>
                  </View>
                )}
              </View>
              <View style={styles.summaryGrid}>
                <View style={styles.summaryItem}><Text style={styles.sumLabel}>당기 순손익</Text><View style={styles.heroValueGroup}><Text style={[styles.sumVal, { color: monthIsProfit ? colors.profit : colors.loss }]} adjustsFontSizeToFit numberOfLines={1}>{monthIsProfit ? '＋' : '－'}{fmt(monthStats.net)}</Text></View><Text style={styles.sumSub}>{monthIsProfit ? '흑자 경영' : '적자 경영'}</Text></View>
                <View style={styles.summaryItem}><Text style={styles.sumLabel}>평균 방어율</Text><Text style={[styles.sumVal, { color: colors.accent }]}>{defenseRate}%</Text><Text style={styles.sumSub}>{defenseRate > 80 ? '리스크 관리 우수' : '관리 필요'}</Text></View>
              </View>
              <View style={styles.aiCommentBox}>
                <View style={styles.aiHeader}><Text style={styles.aiIcon}>✨</Text><Text style={styles.aiTitle}>AI 경영 분석관 리포트</Text></View>
                <Text style={styles.aiText}>{getAIComment(monthIsProfit, (monthStats.invest / Math.max(monthStats.net, 1)) * 100, 'monthly')}</Text>
              </View>
              <View style={styles.assetPortfolioCard}>
                <Text style={styles.portfolioTitle}>주요 경영 내역 (TOP 5)</Text>
                {top5MonthItems.map(([name, data], idx) => (
                  <View key={name} style={[styles.portfolioRow, idx === top5MonthItems.length - 1 && { borderBottomWidth: 0 }]}>
                    <View style={styles.portfolioInfo}>
                      <Text style={styles.portfolioName}>{name}</Text>
                      <View style={styles.portfolioBarBg}><View style={[styles.portfolioBarFill, { width: `${(data.min / (top5MonthItems[0]?.[1].min || 1)) * 100}%`, backgroundColor: data.category === '투자' ? colors.profit : colors.loss }]} /></View>
                    </View>
                    <Text style={[styles.portfolioTime, { color: data.category === '투자' ? colors.profit : colors.loss }]}>{data.category === '투자' ? '＋' : '－'}{fmt(data.min)}</Text>
                  </View>
                ))}
              </View>
              <Text style={styles.watermark}>시간 재무제표 LEDGER</Text>
            </View>
          )}

          {tab === 'yearly' && (
            <View style={[styles.reportCanvas, persona && { borderColor: `${persona.color}40` }]}>
              <View style={styles.headerSection}>
                <Text style={[styles.monthSubLabel, { color: '#fbbf24' }]}>{year} ANNUAL</Text>
                <Text style={styles.corpTitle}>{nickname || '나의'} 주식회사</Text>
                <Text style={styles.statementType}>연간 경영 공시 보고서</Text>
                {persona && (
                  <View style={[styles.personaBadge, { marginTop: 16, borderColor: `${persona.color}40`, backgroundColor: `${persona.color}10` }]}>
                    <Text style={[styles.personaBadgeText, { color: persona.color }]}>{persona.emoji} {persona.label}</Text>
                  </View>
                )}
              </View>
              <View style={styles.heroSection}>
                <Text style={styles.heroLabel}>연간 당기 순손익</Text>
                <View style={styles.heroValueGroup}><Text style={[styles.heroValue, { color: yearIsProfit ? colors.profit : colors.loss, fontSize: 52 }]} adjustsFontSizeToFit numberOfLines={1}>{yearIsProfit ? '＋' : '－'}{fmt(yearStats.net)}</Text></View>
                <Text style={styles.heroStatus}>지난 1년, 당신은 매 순간을 기회로 바꾸며{'\n'}<Text style={{ color: '#fbbf24', fontFamily: font.bold }}>독보적인 가치</Text>를 증명했습니다.</Text>
              </View>
              <View style={styles.metricsGrid}>
                <View style={styles.metricItem}><Text style={styles.metricLabel}>총 기록 일수</Text><Text style={styles.metricVal}>{yearDays.recorded}일</Text><Text style={[styles.metricSub, { color: '#fbbf24' }]}>꾸준함 상위 1%</Text></View>
                <View style={[styles.metricItem, { borderLeftWidth: 1, borderLeftColor: colors.border }]}><Text style={styles.metricLabel}>연간 방어율</Text><Text style={styles.metricVal}>{Math.round((1 - yearStats.loss / Math.max(yearStats.invest + yearStats.loss, 1)) * 100)}%</Text><Text style={[styles.metricSub, { color: colors.textSecondary }]}>LEVEL: MASTER</Text></View>
              </View>
              <View style={styles.section}>
                <Text style={styles.sectionLabel}>명예의 전당</Text>
                <View style={styles.hallOfFame}>
                  {earnedBadges.map(b => (
                    <View key={b.name} style={styles.badgeIconItem}><Text style={{ fontSize: 24 }}>{b.icon}</Text></View>
                  ))}
                  {earnedBadges.length === 0 && <Text style={styles.emptyTxt}>아직 획득한 명예 뱃지가 없습니다.</Text>}
                </View>
              </View>
              <View style={styles.yearlyCanvas}>
                <Text style={styles.canvasLabel}>365일간의 활동 기록</Text>
                <View style={styles.heatmapGrid}>
                  {getYearlyRhythm().map((val, i) => (
                    <View key={i} style={[styles.cell, val === true && { backgroundColor: colors.profit }, val === false && { backgroundColor: colors.loss }]} />
                  ))}
                </View>
              </View>
              <Text style={styles.watermark}>시간 재무제표 LEDGER</Text>
            </View>
          )}
        </ViewShot>

        <View style={styles.actionRow}>
          <TouchableOpacity style={styles.mainActionBtn} onPress={handleShare}><Ionicons name="share-outline" size={20} color="white" style={{ marginRight: 8 }} /><Text style={styles.mainActionText}>리포트 공유하기</Text></TouchableOpacity>
          <TouchableOpacity style={styles.subActionBtn} onPress={handleSave}><Text style={styles.subActionText}>이미지 저장</Text></TouchableOpacity>
        </View>
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgBase },
  tabRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingVertical: 16 },
  toggleBtn: { flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: colors.bgSurface, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  toggleBtnActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  toggleBtnText: { fontFamily: font.medium, fontSize: 13, color: colors.textMuted },
  toggleBtnTextActive: { color: 'white' },

  reportCanvas: { backgroundColor: colors.bgSurface, borderRadius: 32, padding: 24, paddingVertical: 40, borderWidth: 1, borderColor: colors.borderSub, ...shadows.strong },
  headerSection: { alignItems: 'center', marginBottom: 32 },
  reportDate: { fontFamily: font.medium, fontSize: 10, color: colors.textMuted, letterSpacing: 2, marginBottom: 12 },
  monthSubLabel: { fontFamily: font.bold, fontSize: 13, color: colors.accent, letterSpacing: 2, marginBottom: 8 },
  corpTitle: { fontFamily: font.bold, fontSize: 24, color: colors.textPrimary, letterSpacing: -1 },
  statementType: { fontFamily: font.medium, fontSize: 15, color: colors.textSecondary, marginTop: 4 },
  personaBadge: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 16, borderWidth: 1 },
  personaBadgeText: { fontFamily: font.bold, fontSize: 14 },

  heroSection: { alignItems: 'center', marginBottom: 32 },
  heroLabel: { fontFamily: font.medium, fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 },
  heroValueGroup: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  heroValue: { fontFamily: font.bold, fontSize: 48, letterSpacing: -2 },
  heroStatus: { fontFamily: font.regular, fontSize: 12, color: colors.textSecondary, marginTop: 16, textAlign: 'center' },

  aiCommentBox: { backgroundColor: 'rgba(168, 85, 247, 0.03)', borderRadius: 20, padding: 18, marginBottom: 32, borderLeftWidth: 4, borderLeftColor: '#a855f7', borderRightWidth: 1, borderRightColor: 'rgba(168, 85, 247, 0.1)', borderTopWidth: 1, borderTopColor: 'rgba(168, 85, 247, 0.1)', borderBottomWidth: 1, borderBottomColor: 'rgba(168, 85, 247, 0.1)' },
  aiHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  aiIcon: { fontSize: 14 },
  aiTitle: { fontFamily: font.bold, fontSize: 10, color: '#a855f7', textTransform: 'uppercase', letterSpacing: 1 },
  aiText: { fontFamily: font.regular, fontSize: 12, color: colors.textSecondary, lineHeight: 20, fontStyle: 'italic' },

  summaryGrid: { flexDirection: 'row', gap: 12, marginBottom: 32 },
  summaryItem: { flex: 1, backgroundColor: colors.bgRaised, padding: 20, borderRadius: 20, alignItems: 'center' },
  sumLabel: { fontFamily: font.medium, fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 8 },
  sumVal: { fontFamily: font.bold, fontSize: 20 },
  sumSub: { fontFamily: font.medium, fontSize: 9, color: colors.textDisabled, marginTop: 4 },

  metricsGrid: { flexDirection: 'row', backgroundColor: colors.bgBase, borderRadius: 20, overflow: 'hidden', marginBottom: 32, borderWidth: 1, borderColor: colors.border },
  metricItem: { flex: 1, padding: 20, alignItems: 'center' },
  metricLabel: { fontFamily: font.medium, fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 8 },
  metricVal: { fontFamily: font.bold, fontSize: 16, color: colors.textPrimary },
  metricSub: { fontFamily: font.bold, fontSize: 9, marginTop: 4 },

  assetPortfolioCard: { backgroundColor: colors.bgRaised, borderRadius: 24, padding: 20, marginBottom: 32 },
  portfolioTitle: { fontFamily: font.bold, fontSize: 11, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 1.5, marginBottom: 20 },
  portfolioRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  portfolioInfo: { flex: 1, marginRight: 16 },
  portfolioName: { fontFamily: font.medium, fontSize: 13, color: colors.textSecondary, marginBottom: 6 },
  portfolioBarBg: { height: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 2, overflow: 'hidden' },
  portfolioBarFill: { height: '100%', borderRadius: 2 },
  portfolioTime: { fontFamily: font.bold, fontSize: 13 },

  portfolioSection: { marginBottom: 32 },
  sectionLabelRow: { borderBottomWidth: 1, borderBottomColor: colors.borderSub, marginBottom: 16, paddingBottom: 8 },
  sectionLabel: { fontFamily: font.medium, fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 2 },
  assetTable: { borderTopWidth: 0 },
  assetRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.borderSub },
  assetName: { fontFamily: font.medium, fontSize: 13, color: colors.textSecondary },
  assetTime: { fontFamily: font.bold, fontSize: 13, color: colors.textPrimary },

  hallOfFame: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 32 },
  badgeIconItem: { width: 50, height: 50, borderRadius: 25, backgroundColor: colors.bgRaised, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.borderSub },

  yearlyCanvas: { backgroundColor: colors.bgBase, borderRadius: 20, padding: 16, marginBottom: 32 },
  canvasLabel: { fontFamily: font.medium, fontSize: 9, color: colors.textDisabled, textTransform: 'uppercase', marginBottom: 12, textAlign: 'center' },
  heatmapGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, justifyContent: 'center' },
  cell: { width: (SCREEN_WIDTH - 120) / 20, height: (SCREEN_WIDTH - 120) / 20, borderRadius: 1, backgroundColor: '#1a1a1a' },

  watermark: { fontFamily: font.regular, fontSize: 9, color: colors.textDisabled, textAlign: 'center', marginTop: 32, letterSpacing: 4 },
  actionRow: { paddingHorizontal: 24, gap: 12, marginTop: 16 },
  mainActionBtn: { backgroundColor: colors.accent, borderRadius: 16, paddingVertical: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', ...shadows.medium },
  mainActionText: { fontFamily: font.bold, fontSize: 16, color: 'white' },
  subActionBtn: { backgroundColor: colors.bgSurface, borderRadius: 16, paddingVertical: 16, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
  subActionText: { fontFamily: font.medium, fontSize: 14, color: colors.textSecondary },
  emptyTxt: { fontFamily: font.regular, fontSize: 12, color: colors.textDisabled, textAlign: 'center', paddingVertical: 10 },
});
