export type AppDef = {
  app_name: string;
  bundle_id: string;
  category: '소비' | '투자' | '필수';
};

export const DEFAULT_APPS: AppDef[] = [
  // ── 소비 · 영상 ──────────────────────────────
  { app_name: '유튜브',       bundle_id: 'com.google.ios.youtube',         category: '소비' },
  { app_name: '넷플릭스',     bundle_id: 'com.netflix.Netflix',             category: '소비' },
  { app_name: '틱톡',         bundle_id: 'com.zhiliaoapp.musically',        category: '소비' },
  { app_name: '왓챠',         bundle_id: 'com.watchcha.app',               category: '소비' },
  { app_name: '웨이브',       bundle_id: 'com.sk.wavve',                   category: '소비' },
  { app_name: '쿠팡플레이',   bundle_id: 'com.coupang.coupangplay',        category: '소비' },
  { app_name: '애플TV',       bundle_id: 'com.apple.tv',                   category: '소비' },
  { app_name: '디즈니플러스', bundle_id: 'com.disney.disneyplus',          category: '소비' },
  { app_name: '라프텔',       bundle_id: 'com.laftel.app',                 category: '소비' },

  // ── 소비 · 소셜 ──────────────────────────────
  { app_name: '인스타그램',   bundle_id: 'com.burbn.instagram',            category: '소비' },
  { app_name: '트위터',       bundle_id: 'com.atebits.Tweetie2',           category: '소비' },
  { app_name: '스레드',       bundle_id: 'com.burbn.barcelona',            category: '소비' },
  { app_name: '페이스북',     bundle_id: 'com.facebook.Facebook',          category: '소비' },
  { app_name: '스냅챗',       bundle_id: 'com.toyopagroup.picaboo',        category: '소비' },
  { app_name: '핀터레스트',   bundle_id: 'pinterest.iphone',               category: '소비' },
  { app_name: '블루스카이',   bundle_id: 'xyz.blueskyweb.app',             category: '소비' },
  { app_name: '레딧',         bundle_id: 'com.reddit.Reddit',              category: '소비' },

  // ── 소비 · 게임 ──────────────────────────────
  { app_name: '배틀그라운드', bundle_id: 'com.pubg.krmobile',              category: '소비' },
  { app_name: '브롤스타즈',   bundle_id: 'com.supercell.laser',            category: '소비' },
  { app_name: '클래시오브클랜', bundle_id: 'com.supercell.magic',          category: '소비' },
  { app_name: '리니지M',      bundle_id: 'com.ncsoft.lineagem',            category: '소비' },
  { app_name: '카트라이더',   bundle_id: 'com.nexon.karts',               category: '소비' },
  { app_name: '로블록스',     bundle_id: 'com.roblox.robloxmobile',       category: '소비' },
  { app_name: '원신',         bundle_id: 'com.miHoYo.GenshinImpact',      category: '소비' },

  // ── 소비 · 쇼핑 ──────────────────────────────
  { app_name: '쿠팡',         bundle_id: 'com.coupang.mobile',             category: '소비' },
  { app_name: '무신사',       bundle_id: 'com.musinsa.musinsa',           category: '소비' },
  { app_name: '당근마켓',     bundle_id: 'com.towneers.karrot',            category: '소비' },
  { app_name: '번개장터',     bundle_id: 'com.bunjang.bunjang',            category: '소비' },
  { app_name: '에이블리',     bundle_id: 'com.ably.market',               category: '소비' },
  { app_name: '지그재그',     bundle_id: 'kr.co.kakaostyle.zigzag',       category: '소비' },

  // ── 소비 · 음악 ──────────────────────────────
  { app_name: '멜론',         bundle_id: 'com.kakao.melon',               category: '소비' },
  { app_name: '스포티파이',   bundle_id: 'com.spotify.client',            category: '소비' },
  { app_name: '유튜브뮤직',   bundle_id: 'com.google.ios.youtubemusic',   category: '소비' },
  { app_name: '지니뮤직',     bundle_id: 'com.ktmusic.genie',             category: '소비' },
  { app_name: '애플뮤직',     bundle_id: 'com.apple.Music',               category: '소비' },

  // ── 필수 ─────────────────────────────────────
  { app_name: '카카오톡',     bundle_id: 'com.kakao.talk',                category: '필수' },
  { app_name: '네이버',       bundle_id: 'com.naver.naver',               category: '필수' },
  { app_name: '카카오맵',     bundle_id: 'net.daum.map.kakao',            category: '필수' },
  { app_name: '네이버지도',   bundle_id: 'com.nhn.NaverMap',              category: '필수' },
  { app_name: '구글지도',     bundle_id: 'com.google.Maps',               category: '필수' },

  // ── 투자 ─────────────────────────────────────
  { app_name: '밀리의서재',   bundle_id: 'com.millie.milliereader',       category: '투자' },
  { app_name: '리디북스',     bundle_id: 'com.ridi.books',                category: '투자' },
  { app_name: '클래스101',    bundle_id: 'kr.co.class101.app',            category: '투자' },
  { app_name: '런데이',       bundle_id: 'com.zeroback.runday',           category: '투자' },
  { app_name: '나이키런닝',   bundle_id: 'com.nike.runclub',              category: '투자' },
  { app_name: '캄',           bundle_id: 'com.calm.ios',                  category: '투자' },
  { app_name: '마보',         bundle_id: 'com.mindfulness.mabo',          category: '투자' },
  { app_name: '듀오링고',     bundle_id: 'com.duolingo.duolingo',         category: '투자' },
];
