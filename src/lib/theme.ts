// ─── Colors ───────────────────────────────────────────────────────────────────

export const colors = {
  // Background layers
  bgBase:    '#0f0f0f',  // 앱 전체 배경
  bgSurface: '#171717',  // 카드, 패널
  bgRaised:  '#1f1f1f',  // 입력창, 선택 영역, 토글

  // Border
  border:    '#262626',
  borderSub: 'rgba(255,255,255,0.06)',

  // Text
  textPrimary:   '#f0ede8',
  textSecondary: '#a09d98',
  textMuted:     '#5a5754',
  textDisabled:  '#3a3836',

  // Brand accent
  accent:   '#e8410a',
  accentBg: 'rgba(232,65,10,0.1)',

  // Semantic — 재무 언어와 연동
  loss:    '#f87171',              // 당기 순손실 (소비)
  lossBg:  'rgba(248,113,133,0.1)',
  lossBorder: 'rgba(248,113,133,0.2)',

  profit:    '#4ade80',            // 흑자 (투자)
  profitBg:  'rgba(74,222,128,0.1)',
  profitBorder: 'rgba(74,222,128,0.2)',

  warning:    '#fbbf24',           // 예산 경고
  warningBg:  'rgba(251,191,36,0.08)',
  warningBorder: 'rgba(251,191,36,0.2)',
} as const;

// ─── Typography ───────────────────────────────────────────────────────────────

export const font = {
  regular:   'GeistMono_400Regular',
  medium:    'GeistMono_500Medium',
  bold:      'GeistMono_700Bold',
  extraBold: 'GeistMono_800ExtraBold',
} as const;

// 6단계 크기 체계
export const fontSize = {
  xs:   10,  // 레이블, 뱃지, 워터마크
  sm:   12,  // 보조 텍스트, 힌트
  md:   14,  // 본문, 버튼
  lg:   17,  // 서브헤딩
  xl:   22,  // 화면 제목
  '2xl': 32, // 손익 결과 숫자
  '3xl': 52, // 연간 빅 넘버
} as const;

// ─── Spacing (8px grid) ───────────────────────────────────────────────────────

export const spacing = {
  xs:  4,
  sm:  8,
  md:  16,
  lg:  24,
  xl:  32,
  '2xl': 48,
} as const;

// ─── Border radius ────────────────────────────────────────────────────────────

export const radius = {
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
} as const;
