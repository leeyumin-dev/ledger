import { colors } from './theme';

export type Persona = {
  label: string;
  emoji: string;
  color: string;
  description: string;
  category: 'growth' | 'stable' | 'warning' | 'danger';
};

// 확장 페르소나 컬러 팔레트
const palette = {
  gold:    '#fbbf24',
  violet:  '#8b5cf6',
  blue:    '#3b82f6',
  cyan:    '#06b6d4',
  emerald: '#10b981',
  orange:  '#f97316',
  rose:    '#f43f5e',
  slate:   '#94a3b8',
};

type AnalysisData = {
  isProfit: boolean;
  netMinutes: number;
  assetFormationRate: number;
  consumptionRate: number;
  workRate: number;
  sleepRate: number;
};

// 주간 페르소나 (더욱 다채로운 컬러 적용)
export function getWeeklyPersona(data: AnalysisData): Persona {
  const { isProfit, assetFormationRate, consumptionRate, workRate } = data;

  if (isProfit && assetFormationRate > 50) {
    return { label: "유니콘 시간 기업", emoji: "🦄", color: palette.cyan, description: "당신의 시간 가치는 기하급수적으로 상승 중입니다. 완벽한 공격적 투자 모델입니다.", category: 'growth' };
  }
  if (isProfit && assetFormationRate > 30) {
    return { label: "블루칩 자산가", emoji: "💎", color: palette.blue, description: "안정적인 흑자 경영과 꾸준한 자산 형성이 돋보이는 모범적인 한 주였습니다.", category: 'stable' };
  }
  if (workRate > 45) {
    return { label: "열정적인 벤처 CEO", emoji: "🔥", color: palette.violet, description: "업무 자산 취득에 모든 에너지를 쏟고 계시군요. 리스크 관리에 주의하세요.", category: 'warning' };
  }
  if (!isProfit && consumptionRate > 60) {
    return { label: "방만 경영 주의보", emoji: "⚠️", color: palette.rose, description: "지출 자산이 수익을 압도하고 있습니다. 과감한 시간 다이어트가 필요한 시점입니다.", category: 'danger' };
  }
  if (isProfit) {
    return { label: "안정적 포트폴리오", emoji: "⚖️", color: palette.emerald, description: "눈에 띄는 과소비 없이 기초 자산을 잘 지켜낸 탄탄한 경영입니다.", category: 'stable' };
  }
  return { label: "내실 다지는 중", emoji: "🛡️", color: palette.slate, description: "폭발적인 성장은 없었지만 리스크를 최소화했습니다. 다음 기회를 노려보세요.", category: 'stable' };
}

// 월간 페르소나 (거시적 칭호 + 무게감 있는 컬러)
export function getMonthlyPersona(data: AnalysisData): Persona {
  const { isProfit, assetFormationRate, workRate, sleepRate } = data;

  if (isProfit && assetFormationRate > 40) {
    return { label: "전설적인 펀드 매니저", emoji: "🏛", color: palette.gold, description: "한 달간 압도적인 자산 형성 능력을 증명했습니다. 당신은 시간 경영의 정점에 서 있습니다.", category: 'growth' };
  }
  if (isProfit && assetFormationRate > 20) {
    return { label: "1급 시간 경영사", emoji: "📊", color: palette.blue, description: "한 달 전체의 밸런스가 매우 훌륭합니다. 효율적인 시스템이 이미 구축되어 있군요.", category: 'stable' };
  }
  if (workRate > 50) {
    return { label: "철의 여인/사나이", emoji: "⚙️", color: palette.violet, description: "이달의 절반 이상을 가치 창출에만 집중했습니다. 생산성은 높지만 휴식이 절실합니다.", category: 'warning' };
  }
  if (sleepRate > 40) {
    return { label: "에너지 충전 경영주", emoji: "🔋", color: palette.cyan, description: "이번 달은 무리한 확장보다 기초 체력을 다지는 데 집중했습니다. 반등의 기반이 됩니다.", category: 'stable' };
  }
  if (!isProfit) {
    return { label: "경영 정상화 대상", emoji: "🛠", color: palette.orange, description: "지속적인 자산 손실로 인해 비상 경영이 필요합니다. 지출 습관을 전면 재검토하세요.", category: 'danger' };
  }
  return { label: "시장 평균 유지", emoji: "📉", color: palette.slate, description: "큰 성과도 실책도 없었던 평범한 한 달이었습니다. 다음 달엔 더 정교한 계획을 세워보세요.", category: 'stable' };
}

// 연간 페르소나 (명예로운 컬러)
export function getYearlyPersona(data: AnalysisData): Persona {
  const { isProfit, assetFormationRate } = data;

  if (isProfit && assetFormationRate > 35) {
    return { label: "올해의 독보적 자산가", emoji: "👑", color: palette.gold, description: "지난 1년, 당신이 쌓아올린 시간 자산은 독보적인 가치를 증명했습니다. 당신은 진정한 마스터입니다.", category: 'growth' };
  }
  if (isProfit) {
    return { label: "올해의 혁신 경영인", emoji: "🌟", color: palette.emerald, description: "안정적인 경영으로 1년간 흔들림 없는 성장을 일궈냈습니다. 훌륭한 리더십이었습니다.", category: 'stable' };
  }
  return { label: "성장이 기대되는 기업", emoji: "🌱", color: palette.cyan, description: "고난이 있었지만 기록을 멈추지 않은 의지가 가장 큰 자산입니다. 내년의 반등을 응원합니다.", category: 'stable' };
}

// 일일 페르소나 (직관적인 컬러)
export function getDailyPersona(data: AnalysisData): Persona {
  const { isProfit, assetFormationRate, consumptionRate } = data;

  if (isProfit && assetFormationRate > 60) {
    return { label: "오늘의 경영 MVP", emoji: "🏆", color: palette.gold, description: "오늘은 시간 자산 가치가 폭발적으로 상승한 날입니다. 이 완벽한 감각을 잊지 마세요!", category: 'growth' };
  }
  if (isProfit) {
    return { label: "안정적인 흑자 마감", emoji: "✅", color: palette.emerald, description: "기초 자산을 효과적으로 방어하며 내실을 다진 보람찬 하루였습니다.", category: 'stable' };
  }
  if (consumptionRate > 70) {
    return { label: "도파민 지출 과다", emoji: "🛑", color: palette.rose, description: "특정 소비 항목에 시간이 너무 많이 투입되었습니다. 내일은 더 타이트한 방어가 필요합니다.", category: 'danger' };
  }
  return { label: "효율성 개선 진행 중", emoji: "🛠", color: palette.orange, description: "자산 형성이 미미하지만, 하루를 기록한 것만으로도 변화의 시작입니다.", category: 'stable' };
}
