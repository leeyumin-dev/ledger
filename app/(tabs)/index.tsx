import { View, Text, StyleSheet, ScrollView } from 'react-native';

export default function TodayScreen() {
  return (
    <ScrollView style={styles.container}>

      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.headerSub}>2026년 3월 26일 수요일</Text>
        <Text style={styles.headerTitle}>손익계산서</Text>
      </View>

      {/* 구분선 */}
      <View style={styles.thickDivider} />

      {/* 수입 섹션 */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>시간 수입</Text>
        <Row label="하루 가용 시간" value="24h 00m" />
        <Row label="수면 (필수)"    value="－ 7h 30m" indent />
        <Row label="업무"           value="－ 8h 00m" indent />
      </View>

      <View style={styles.thinDivider} />
      <Row label="가처분 시간" value="8h 30m" bold />

      {/* 지출 섹션 */}
      <View style={styles.section}>
        <Text style={styles.sectionLabel}>시간 지출</Text>
        <Row label="유튜브"      value="2h 14m" indent loss />
        <Row label="인스타그램"  value="1h 03m" indent loss />
        <Row label="게임"        value="0h 47m" indent loss />
      </View>

      <View style={styles.thinDivider} />
      <Row label="총 지출" value="4h 04m" bold loss />

      {/* 순이익 */}
      <View style={styles.thickDivider} />
      <Row label="당기 순이익 (잉여 시간)" value="4h 26m" bold profit />

      {/* 하단 여백 */}
      <View style={{ height: 40 }} />

    </ScrollView>
  );
}

// ── Row 컴포넌트 ──────────────────────────────
function Row({
  label, value, indent, bold, loss, profit
}: {
  label: string;
  value: string;
  indent?: boolean;
  bold?: boolean;
  loss?: boolean;
  profit?: boolean;
}) {
  return (
    <View style={[styles.row, indent && styles.rowIndent]}>
      <Text style={[styles.rowLabel, bold && styles.bold]}>
        {label}
      </Text>
      <Text style={[
        styles.rowValue,
        bold   && styles.bold,
        loss   && styles.lossText,
        profit && styles.profitText,
      ]}>
        {value}
      </Text>
    </View>
  );
}

// ── 스타일 ────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f0f',
    paddingHorizontal: 24,
  },
  header: {
    paddingTop: 72,
    paddingBottom: 24,
  },
  headerSub: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 11,
    color: '#5a5754',
    letterSpacing: 1,
    marginBottom: 6,
  },
  headerTitle: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 28,
    color: '#f0ede8',
    letterSpacing: -0.5,
  },
  thickDivider: {
    height: 1.5,
    backgroundColor: '#3a3836',
    marginVertical: 12,
  },
  thinDivider: {
    height: 0.5,
    backgroundColor: '#2a2826',
    marginVertical: 8,
  },
  section: {
    marginTop: 16,
  },
  sectionLabel: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 10,
    color: '#5a5754',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  rowIndent: {
    paddingLeft: 16,
  },
  rowLabel: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 13,
    color: '#9a9690',
  },
  rowValue: {
    fontFamily: 'GeistMono_400Regular',
    fontSize: 13,
    color: '#f0ede8',
  },
  bold: {
    fontFamily: 'GeistMono_500Medium',
    fontSize: 14,
    color: '#f0ede8',
  },
  lossText: {
    color: '#f87171',
  },
  profitText: {
    color: '#4ade80',
  },
});