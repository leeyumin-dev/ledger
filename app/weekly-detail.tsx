import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { supabase } from '../src/lib/supabase';
import { colors, font, fontSize, spacing, radius, shadows } from '../src/lib/theme';
import { getWeeklyPersona } from '../src/lib/personas';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';

type UsageItem = {
  id: string;
  app_name: string;
  duration_minutes: number;
  category: string;
  date: string;
};

function getAIComment(isProfit: boolean, assetRate: number) {
  if (isProfit && assetRate > 40) {
    return `"이번 주 당신의 시간 경영은 매우 공격적인 자산 형성 능력을 보여주었습니다. 특히 투자 비중이 ${assetRate.toFixed(1)}%로 우수하여 장기적인 성장이 기대됩니다."`;
  }
  if (isProfit) {
    return `"이번 주 안정적인 흑자 경영을 달성했습니다. 불필요한 지출을 잘 방어하셨네요. 현재의 리듬을 유지하며 조금 더 공격적인 투자를 시도해보세요."`;
  }
  if (assetRate > 20) {
    return `"이번 주 투자는 꾸준히 이루어졌으나, 고정 지출이나 도파민 소비가 예상보다 컸습니다. 순손실을 줄이기 위한 지출 구조조정이 필요해 보입니다."`;
  }
  return `"이번 주 경영 상태가 다소 불안정합니다. 시간 자산이 빠르게 누수되고 있습니다. 다음 주에는 가장 먼저 '방어해야 할 앱' 1가지를 정해보는 건 어떨까요?"`;
}

export default function WeeklyDetailScreen() {
  const { week } = useLocalSearchParams<{ week: string }>();
  const [usageList, setUsageList] = useState<UsageItem[]>([]);
  const [sleepHours, setSleepHours] = useState(7.5);
  const [workHours, setWorkHours] = useState(8.0);
  const [loading, setLoading] = useState(true);
  const [weekRange, setWeekRange] = useState({ start: '', end: '' });

  useEffect(() => {
    loadData();
  }, [week]);

  async function loadData() {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const range = getWeekRange(week);
    setWeekRange(range);

    const [settingsRes, usageRes] = await Promise.all([
      supabase.from('user_settings').select('sleep_hours, work_hours').eq('user_id', user.id).single(),
      supabase.from('app_usage').select('*').eq('user_id', user.id).gte('date', range.start).lte('date', range.end).order('date'),
    ]);

    if (settingsRes.data) {
      setSleepHours(settingsRes.data.sleep_hours);
      setWorkHours(settingsRes.data.work_hours);
    }
    setUsageList(usageRes.data ?? []);
    setLoading(false);
  }

  function getWeekRange(weekLabel: string) {
    const now = new Date();
    const year = now.getFullYear();
    const match = weekLabel.match(/(\d+)월 (\d+)주차/);
    if (!match) return { start: '', end: '' };
    const month = parseInt(match[1]) - 1;
    const weekNum = parseInt(match[2]);
    const firstDay = new Date(year, month, 1).getDay();
    const firstMondayDate = firstDay <= 1 ? 2 - firstDay : 9 - firstDay;
    const mondayDate = firstMondayDate + (weekNum - 1) * 7;
    const monday = new Date(year, month, mondayDate);
    const sunday = new Date(year, month, mondayDate + 6);
    const f = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { start: f(monday), end: f(sunday) };
  }

  function fmt(m: number) {
    const abs = Math.abs(m);
    const h = Math.floor(abs / 60);
    const min = abs % 60;
    return h > 0 ? `${h}h ${min}m` : `${min}m`;
  }

  // 동기 계산
  const lossMin = usageList.filter(u => u.category === '소비').reduce((s, u) => s + u.duration_minutes, 0);
  const investMin = usageList.filter(u => u.category === '투자').reduce((s, u) => s + u.duration_minutes, 0);
  const essentialMin = usageList.filter(u => u.category === '필수').reduce((s, u) => s + u.duration_minutes, 0);
  const totalDispMin = (24 - sleepHours - workHours) * 7 * 60;
  const netMinutes = Math.round(totalDispMin) - lossMin - essentialMin + investMin;
  const isProfit = netMinutes >= 0;
  const assetFormationRate = totalDispMin > 0 ? (investMin / totalDispMin) * 100 : 0;
  const consumptionRate = totalDispMin > 0 ? (lossMin / totalDispMin) * 100 : 0;

  const analysis = {
    isProfit, netMinutes, assetFormationRate, consumptionRate,
    workRate: (workHours * 7 * 60) / (24 * 7 * 60) * 100,
    sleepRate: (sleepHours * 7 * 60) / (24 * 7 * 60) * 100,
  };
  const persona = getWeeklyPersona(analysis);

  const portfolioItems = Object.entries(
    usageList.filter(u => u.category === '투자' || u.category === '소비')
      .reduce((acc, curr) => {
        acc[curr.app_name] = { min: (acc[curr.app_name]?.min || 0) + curr.duration_minutes, category: curr.category };
        return acc;
      }, {} as Record<string, { min: number; category: string }>)
  ).sort((a, b) => b[1].min - a[1].min).slice(0, 3);

  // 주간 리듬 (월~일)
  const weekDays = ['월', '화', '수', '목', '금', '토', '일'];
  const weekRhythm = weekDays.map((_, i) => {
    if (!weekRange.start) return { netH: '-', isProfit: null };
    const d = new Date(weekRange.start);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    const dayData = usageList.filter(u => u.date === dateStr);
    if (dayData.length === 0) return { netH: '-', isProfit: null };
    const dLoss = dayData.filter(u => u.category === '소비').reduce((s, u) => s + u.duration_minutes, 0);
    const dInvest = dayData.filter(u => u.category === '투자').reduce((s, u) => s + u.duration_minutes, 0);
    const dEssential = dayData.filter(u => u.category === '필수').reduce((s, u) => s + u.duration_minutes, 0);
    const dispPerDay = (24 - sleepHours - workHours) * 60;
    const net = Math.round(dispPerDay) - dLoss - dEssential + dInvest;
    const h = net / 60;
    return { netH: h >= 0 ? `+${h.toFixed(1)}` : `${h.toFixed(1)}`, isProfit: net >= 0 };
  });

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={isProfit ? ['rgba(74,222,128,0.1)', 'transparent'] : ['rgba(248,113,113,0.1)', 'transparent']}
        style={styles.glow}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      <View style={styles.navBar}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.navTitle}>주간 경영 보고서</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView style={styles.container} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 60 }}>
        <View style={[styles.reportCanvas, { borderColor: `${persona.color}40` }]}>

          {/* 헤더 */}
          <View style={styles.headerSection}>
            <Text style={styles.reportDate}>
              {weekRange.start.replace(/-/g, '.')} — {weekRange.end.slice(5).replace('-', '.')}
            </Text>
            <View style={[styles.personaBadge, { borderColor: `${persona.color}40`, backgroundColor: `${persona.color}10` }]}>
              <Text style={[styles.personaBadgeText, { color: persona.color }]}>{persona.emoji} {persona.label}</Text>
            </View>
          </View>

          {/* 주간 순손익 */}
          <View style={styles.heroSection}>
            <Text style={styles.heroLabel}>주간 당기 순손익</Text>
            <Text style={[styles.heroValue, { color: isProfit ? colors.profit : colors.loss }]} adjustsFontSizeToFit numberOfLines={1}>
              {isProfit ? '＋' : '－'}{fmt(netMinutes)}
            </Text>
            <Text style={styles.heroStatus}>
              이번 주 시간 잔고는{' '}
              <Text style={{ color: isProfit ? colors.profit : colors.loss, fontFamily: font.bold }}>
                {isProfit ? '흑자' : '적자'}
              </Text>입니다.
            </Text>
          </View>

          {/* AI 코멘트 */}
          <View style={styles.aiCommentBox}>
            <View style={styles.aiHeader}>
              <Text style={styles.aiIcon}>✨</Text>
              <Text style={styles.aiTitle}>AI 경영 분석관 리포트</Text>
            </View>
            <Text style={styles.aiText}>{getAIComment(isProfit, assetFormationRate)}</Text>
          </View>

          {/* 경영 지표 */}
          <View style={styles.metricsGrid}>
            <View style={styles.metricItem}>
              <Text style={styles.metricLabel}>손익분기점 (BEP)</Text>
              <Text style={styles.metricVal}>{isProfit ? '달성 완료' : '미달성'}</Text>
              <Text style={[styles.metricSub, { color: isProfit ? colors.profit : colors.loss }]}>
                {isProfit ? '▲ 안정 경영' : '▼ 지출 과다'}
              </Text>
            </View>
            <View style={[styles.metricItem, { borderLeftWidth: 1, borderLeftColor: colors.border }]}>
              <Text style={styles.metricLabel}>자산 형성률</Text>
              <Text style={styles.metricVal}>{assetFormationRate.toFixed(1)}%</Text>
              <Text style={[styles.metricSub, { color: colors.textSecondary }]}>
                LEVEL: {assetFormationRate > 30 ? 'HIGH' : 'NORMAL'}
              </Text>
            </View>
          </View>

          {/* 포트폴리오 */}
          <View style={styles.portfolioSection}>
            <Text style={styles.sectionLabel}>주요 자산 및 지출 내역</Text>
            <View style={styles.assetTable}>
              {portfolioItems.length > 0 ? portfolioItems.map(([name, data]) => (
                <View key={name} style={styles.assetRow}>
                  <Text style={styles.assetName}>{name}</Text>
                  <Text style={[styles.assetTime, { color: data.category === '투자' ? colors.profit : colors.loss }]}>
                    {data.category === '투자' ? '＋' : '－'}{fmt(data.min)}
                  </Text>
                </View>
              )) : (
                <Text style={styles.emptyText}>이번 주 기록이 없습니다.</Text>
              )}
            </View>
          </View>

          {/* 주간 리듬 */}
          <View style={styles.rhythmSection}>
            <Text style={styles.sectionLabel}>주간 활동 리듬</Text>
            <View style={styles.rhythmGrid}>
              {weekRhythm.map((r, i) => (
                <View key={i} style={[styles.rhythmCell, r.isProfit === true && styles.rhythmActive, r.isProfit === false && styles.rhythmLoss]}>
                  <Text style={[styles.rhythmLabel, r.isProfit === true && { color: '#050505' }, r.isProfit === false && { color: colors.loss }]}>
                    {weekDays[i]}
                  </Text>
                  <Text style={[styles.rhythmVal, r.isProfit === true && { color: '#050505' }, r.isProfit === false && { color: colors.loss }]}>
                    {r.netH}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          <Text style={styles.watermark}>시간 재무제표 LEDGER</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgBase },
  container: { flex: 1, paddingHorizontal: 20 },
  glow: { position: 'absolute', top: -100, left: 0, right: 0, height: 400 },
  navBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 16, marginBottom: 16 },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  navTitle: { fontFamily: font.bold, fontSize: 16, color: colors.textPrimary },

  reportCanvas: { backgroundColor: colors.bgSurface, borderRadius: 32, padding: 24, paddingVertical: 40, borderWidth: 1, borderColor: colors.borderSub, ...shadows.strong, marginBottom: 24 },

  headerSection: { alignItems: 'center', marginBottom: 32 },
  reportDate: { fontFamily: font.medium, fontSize: 10, color: colors.textMuted, letterSpacing: 2, marginBottom: 12 },
  personaBadge: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 16, borderWidth: 1 },
  personaBadgeText: { fontFamily: font.bold, fontSize: 14 },

  heroSection: { alignItems: 'center', marginBottom: 32 },
  heroLabel: { fontFamily: font.medium, fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 12 },
  heroValue: { fontFamily: font.bold, fontSize: 56, letterSpacing: -2, width: '100%', textAlign: 'center' },
  heroStatus: { fontFamily: font.regular, fontSize: 12, color: colors.textSecondary, marginTop: 16 },

  aiCommentBox: { backgroundColor: 'rgba(168,85,247,0.03)', borderRadius: 20, padding: 18, marginBottom: 32, borderLeftWidth: 4, borderLeftColor: '#a855f7', borderRightWidth: 1, borderRightColor: 'rgba(168,85,247,0.1)', borderTopWidth: 1, borderTopColor: 'rgba(168,85,247,0.1)', borderBottomWidth: 1, borderBottomColor: 'rgba(168,85,247,0.1)' },
  aiHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 },
  aiIcon: { fontSize: 14 },
  aiTitle: { fontFamily: font.bold, fontSize: 10, color: '#a855f7', textTransform: 'uppercase', letterSpacing: 1 },
  aiText: { fontFamily: font.regular, fontSize: 12, color: colors.textSecondary, lineHeight: 20, fontStyle: 'italic' },

  metricsGrid: { flexDirection: 'row', backgroundColor: colors.bgBase, borderRadius: 20, overflow: 'hidden', marginBottom: 32, borderWidth: 1, borderColor: colors.border },
  metricItem: { flex: 1, padding: 20, alignItems: 'center' },
  metricLabel: { fontFamily: font.medium, fontSize: 9, color: colors.textMuted, textTransform: 'uppercase', marginBottom: 8 },
  metricVal: { fontFamily: font.bold, fontSize: 16, color: colors.textPrimary },
  metricSub: { fontFamily: font.bold, fontSize: 9, marginTop: 4 },

  portfolioSection: { marginBottom: 32 },
  sectionLabel: { fontFamily: font.medium, fontSize: 10, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 2, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.borderSub, paddingBottom: 8 },
  assetTable: {},
  assetRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.borderSub },
  assetName: { fontFamily: font.medium, fontSize: 13, color: colors.textSecondary },
  assetTime: { fontFamily: font.bold, fontSize: 13 },
  emptyText: { fontFamily: font.regular, fontSize: 13, color: colors.textDisabled, textAlign: 'center', paddingVertical: 20 },

  rhythmSection: { paddingTop: 20, borderTopWidth: 1, borderTopColor: colors.border, borderStyle: 'dashed' },
  rhythmGrid: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  rhythmCell: { flex: 1, marginHorizontal: 2, borderRadius: 8, backgroundColor: colors.bgBase, alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  rhythmActive: { backgroundColor: colors.profit },
  rhythmLoss: { backgroundColor: 'rgba(248,113,113,0.2)' },
  rhythmLabel: { fontFamily: font.medium, fontSize: 9, color: colors.textMuted, marginBottom: 4 },
  rhythmVal: { fontFamily: font.bold, fontSize: 8, color: colors.textMuted },

  watermark: { fontFamily: font.regular, fontSize: 9, color: colors.textDisabled, textAlign: 'center', marginTop: 32, letterSpacing: 4 },
});
