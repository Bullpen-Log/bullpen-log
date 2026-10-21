/**
 * 앱 내비게이션 구성.
 *
 * PC는 오른쪽 위 막대와 옆에서 나오는 사이드바로, 모바일은 아래 탭 5개로
 * 같은 목록을 나눠 보여준다. 모바일의 "더보기"도 PC 와 같은 사이드바를 연다.
 * 한 곳에서 정의해 두 화면이 어긋나지 않게 한다.
 */

import { TRAINING_HOME_HREF } from '@/lib/training-part';
import { can, isOwner, type Permission } from '@/lib/permissions';
import {
  FEATURE_HOME,
  SETUP_PATH,
  type FeatureKey,
  type FeatureLocks,
} from '@/lib/feature-locks';

/**
 * 싱커의 '덕아웃' 탭(2026-10-21 금윤호: "싱커에서 커뮤니티 기능을 없애고 그 자리에 덕아웃 이동 기능") — 싱커 틀 안의 커뮤니티 판은 지웠고,
 * 이 탭은 진짜 덕아웃(app/(dugout))으로 넘어간다. ?dugout=1 은 앱(웹뷰) 안에서도 / 가 /today 로 돌아가지 않고 덕아웃을 열게 하는 표시(app/(dugout)/page.tsx).
 * 커뮤니티 글은 덕아웃의 /community.
 */
export const DUGOUT_HREF = '/?dugout=1';
/** 웹(브라우저)의 싱커 틀은 덕아웃 탭 대신 홈 왼쪽의 원형 뒤로가기를 쓴다(2026-10-21) — 목록에서 그 항목을 뺀다. 앱은 탭 그대로 */
export function withoutDugoutTab<T extends { href: string }>(items: T[]): T[] {
  return items.filter((i) => i.href !== DUGOUT_HREF);
}
export function withoutDugoutTabGroups<G extends { items: { href: string }[] }>(
  groups: G[]
): G[] {
  return groups
    .map((g) => ({ ...g, items: withoutDugoutTab(g.items) }))
    .filter((g) => g.items.length > 0);
}

/** 쓸 수 있는 아이콘 이름. 그림은 components/nav-icons.tsx 에 있다. */
export type NavIconName =
  | 'home'
  /* ABS 판정 — 스트라이크존(2026-10-21 둥근 아이콘) */
  | 'zone'
  /* 투구 기록 — 야구공(components/baseball-icon.tsx) */
  | 'baseball'
  /* 타격 — 야구 방망이(components/baseball-icon.tsx, 2026-10-20) */
  | 'bat'
  /* 종목 하단바의 ‹(평소 하단바로) · 암케어 · 기록(2026-10-20) */
  | 'back'
  | 'heart'
  | 'calendar'
  | 'dumbbell'
  | 'film'
  /* 영양 — 숟가락·포크. 끼니를 적는 곳이라는 것이 한눈에 보인다 */
  | 'utensils'
  | 'target'
  | 'book'
  | 'settings'
  /* 관리자 — 설정(톱니)과 헷갈리지 않게 방패를 쓴다 */
  | 'shield'
  /* 구속 측정 관리자 — 계기판 */
  | 'gauge'
  /* 트레이닝 영상 촬영 관리자 — 슬레이트(촬영 시작 판) */
  | 'clapper'
  /* 구속 측정 — 스피드건(레이더 건)처럼 곧장 잰다. 계기판(관리자)과 가르려고 다른 그림 */
  | 'radar'
  /* 투구 분석(3D, 실험실) — 서 있는 사람 */
  | 'body'
  /* 커뮤니티 — 말풍선 둘 · 고객센터 — 구명 튜브(2026-10-17) */
  | 'community'
  | 'support'
  /* 팀 · 레슨장 관리(마스터 화면) — 사람 둘 */
  | 'users'
  | 'menu';

export type NavItem = {
  href: string;
  label: string;
  /**
   * 아이콘 이름.
   *
   * 예전에는 이모지 문자를 썼다. 캐주얼하게 보이려던 것인데, 이모지는 기기마다
   * 다른 그림이 나오고 저마다 알록달록해서 앱의 색과 따로 논다. 무엇보다
   * '임시로 넣어둔 것'처럼 보였다. 굵기와 색을 앱이 정할 수 있는 선 아이콘을 쓴다.
   *
   * 그림이 아니라 이름만 둔다. 이 파일은 서버에서도 읽는데, 리액트 컴포넌트는
   * 서버에서 화면 쪽으로 건네줄 수 없다 — 실제로 넘겼더니 화면이 통째로 죽었다.
   * 이름을 그림으로 바꾸는 일은 components/nav-icons.tsx 가 한다.
   */
  icon: NavIconName;
  /**
   * 휴대폰 아래 탭에서 쓸 짧은 이름. 없으면 label 을 그대로 쓴다.
   *
   * 탭 칸이 좁아 긴 이름은 줄바꿈되거나 잘린다. 좁은 곳에서는 뜻이 갈리는
   * 쪽만 남기고('투구 영상' → '영상'), 사이드바처럼 자리가 넉넉한 곳은 전체
   * 이름을 그대로 쓴다.
   */
  short?: string;
  /**
   * 아이콘 배경색. 목록에서 항목을 눈으로 가르는 데 쓴다.
   *
   * 라이브러리 카테고리와 같은 색 토큰(--color-cat-*)을 그대로 쓴다.
   * 같은 앱 안에서 색 체계를 두 벌 만들 이유가 없다.
   */
  tone?: 'lower' | 'upper' | 'mobility' | 'power' | 'core' | 'armcare' | 'recovery';
  /** 관리자에게만 보이는 항목 — perm 이 없으면 대표관리자만, 있으면 그 권한이 있는 관리자(준관리자 포함, lib/permissions.ts) */
  adminOnly?: boolean;
  perm?: Permission;
  /**
   * 앱(스마트폰 껍데기)에서는 누구나, 웹에서는 관리자만 보이는 항목 — 폰의 고속 촬영이 있어야
   * 하는 구속 측정. 여는 쪽의 규칙(app/(session)/velocity/access.ts)과 같다.
   */
  appOrAdmin?: boolean;
  /**
   * 어느 기능에 속하나 — 처음 가입한 사람에게 잠긴 탭(lib/feature-locks.ts, 2026-10-09). 잠겨 있으면
   * 아래 applyLocks 가 주소를 그 기능의 첫 설정 화면으로 바꾸고 locked 를 단다. 없으면 늘 열린 항목.
   */
  lock?: FeatureKey;
  /**
   * 잠겨 있다 — applyLocks 만 단다. 셸(components/app-shell.tsx)이 보고 흐리게 + 자물쇠로 그린다.
   * 링크는 산다(누르면 첫 설정 화면으로 간다) — 그래서 aria-disabled 가 아니라 이 표시다.
   */
  locked?: boolean;
  /**
   * 앱 더보기에서 뺀다 — 투구 · 타격 화면 안에서 들어가는 것(2026-10-21 김민: "더보기에 너무 많다 — 구속 측정 · ABS · 3D 는 투구 페이지에서,
   * 운동 영상 · 드릴은 투구 · 타격 카테고리에서"). 항목은 남긴다 — 앱 투구 탭의 ABS 칸 · 홈에서 쓸어 여는 카메라가 이 목록을 본다.
   * PC 웹 메뉴는 그대로 보인다(PC 에는 종목 홈이 없다).
   */
  appMoreHidden?: boolean;
};

export type NavGroup = {
  /** 그룹 제목. 없으면 제목 없이 바로 항목이 나온다(홈 등). */
  title?: string;
  items: NavItem[];
};

/**
 * 큰 카테고리로 나눈다.
 *
 *   홈 · 투구 기록 · 트레이닝 · 커뮤니티 · 영양 · 라이브러리 · 설정
 *   (자료실은 2026-10-20 메뉴에서 뺐다 — 김민. /board 주소 · 관리자 첫 화면 칸은 그대로)
 *
 * '분석'은 홈으로 들어갔다. 분석은 결국 '그날 어땠나'를 보는 일인데 날짜는 홈 캘린더가
 * 쥐고 있어서, 캘린더 밑에 늘 떠 있는 분석 칸이 고른 날의 분석을 보여 준다. 예전 주소
 * (/coach)는 그 칸으로 넘겨 준다.
 *
 * 홈과 트레이닝은 '남기는 것'과 '하는 것'으로 갈랐다. 홈에서 체크인과 투구
 * 기록을 남기고 운동 일정을 만들면, 실제 운동은 트레이닝에서 한다. 예전에는
 * 한 화면에 다 있어서 운동 하나 체크하려고 한참 스크롤해야 했다.
 * (일정 만들기는 양쪽에 다 있다.)
 *
 * '구속 측정'은 메뉴에 없다. 카메라로 재는 기능이라 앱(폰) 안에서만 열고, 들어가는
 * 길은 투구 기록 탭의 단추다(/velocity — app/(session)/velocity). 관리자는 웹에서도 연다.
 *
 * 주소는 예전 것을 그대로 쓴다(/today = 홈). 주소는 사용자에게 거의 안 보이는데
 * 스무 군데를 고치면 어딘가 하나는 놓치게 된다.
 *
 * '투구 일지'는 메뉴에서 뺐다. 달력과 목록이 홈 맨 앞으로 올라갔기 때문이다.
 * 매일 하는 일은 결국 '오늘 것을 남기고 요즘 어떻게 던졌는지 본다' 하나인데
 * 그것이 홈과 일지로 갈라져 있어서, 하루를 마치려면 두 화면을 오가야 했다.
 * 날짜 하나를 파고드는 화면(/pitch-log/<날짜>)은 그대로 있고, 홈 달력에서
 * 날짜를 누르면 거기로 간다.
 *
 * '투구 기록'은 투구 영상과 투구 기록을 한 탭에 합친 것이다(주소는 예전 그대로
 * /videos). 한동안 영상만 '투구 영상' 탭으로 갈라 두었는데, 영상을 볼 때 알고 싶은
 * 것은 결국 그날 몇 구를 어떤 강도로 던졌는가이고, 기록을 볼 때도 그날 영상이 곁에
 * 있어야 했다 — 둘이 두 화면에 나뉘어 오갔다. 이제 한 캘린더에 투구한 날이 모두
 * 나오고 영상이 있는 날은 그 장면이 칸을 채운다. 날짜 하나를 파고드는 화면
 * (/pitch-log/<날짜>)도 이 탭에 속한다(NAV_ALSO).
 *
 * 이름에 'AI'를 붙이지 않는다. 두 가지 이유가 있다.
 *
 * 하나는 사실과 다르다는 것이다. 오늘의 운동을 고르는 것은 규칙(코드)이고
 * AI는 그 결과를 문장으로 풀어 쓸 뿐이다. 'AI 트레이닝'이라고 부르면
 * 정작 이 앱이 잘하는 부분(위험한 운동은 애초에 후보에서 빠진다)이 가려진다.
 *
 * 다른 하나는 모바일 하단 탭이 이미 '트레이닝'·'리포트'라는 것이다.
 * 같은 화면을 두 이름으로 부르고 있었다.
 *
 * 라이브러리 쪽은 내용 그대로 '운동 영상'·'투구 드릴'로 부른다.
 */
/*
 * 메뉴 항목에는 설명을 붙이지 않는다. 예전에는 '운동 영상' 밑에 '부위 · 강도 · 장비로
 * 찾는 운동' 같은 한 줄이 있었는데, 이름으로 충분한 것을 되풀이해 메뉴만 길어졌다.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    items: [{ href: '/today', label: '홈', icon: 'home' }],
  },
  /*
   * 덕아웃(커뮤니티)은 하단 탭 둘째(2026-10-21 김민: 홈 · 덕아웃 · 투구 · 타격 · 더보기 — 도크 첫 줄도 이 차례).
   * 잠금 없음 — 가입하면 바로 열린다. 고객센터는 아래 '소통'에 남는다.
   */
  {
    items: [{ href: DUGOUT_HREF, label: '덕아웃', icon: 'community' }],
  },
  /* 투구 기록 · 트레이닝 · 영양 · 구속 측정은 처음 가입한 사람에게 잠겨 있다(lock — 위 NavItem.lock) */
  {
    items: [{ href: '/videos', label: '투구', icon: 'baseball', lock: 'pitch' }],
  },
  /* 타격 — 하단 탭 넷째(2026-10-20 김민, docs/designs/hitting-restructure.md). 도크 첫 줄이 막대의 넷(홈 · 덕아웃 · 투구 · 타격)이라 투구 바로 뒤 */
  {
    items: [{ href: '/hitting', label: '타격', icon: 'bat' }],
  },
  {
    /*
     * 트레이닝 홈 — 트레이닝 · 암케어 · 메커니즘 앱 카드(lib/training-part.ts). 휴대폰은 투구 · 타격 종목 하단바가 대신한다(2026-10-20) —
     * 하단 탭에서 빠져 더보기 · PC 메뉴에만 남는다.
     */
    items: [
      {
        href: TRAINING_HOME_HREF,
        label: '트레이닝',
        icon: 'dumbbell',
        lock: 'training',
      },
    ],
  },
  /* 영양 — 하단 탭에서 더보기로(같은 날). 몸을 만드는 두 바퀴라 더보기에서도 트레이닝 쪽 맨 앞 */
  {
    items: [{ href: '/nutrition', label: '영양', icon: 'utensils', lock: 'nutrition' }],
  },
  /*
   * 구속 측정 — 투구 기록을 거치지 않고 카메라 측정으로 곧장(2026-09-28 사용자). 막대의 넷
   * (홈 · 투구 기록 · 트레이닝 · 커뮤니티) 뒤에 둔다 — 도크의 첫 줄이 막대의 넷이라, 그 사이에 끼우면
   * 막대에서 날아온 아이콘이 제 줄에 앉지 못한다. 투구 기록에 속하므로 같은 자물쇠다.
   */
  {
    items: [
      {
        href: '/velocity',
        label: '구속 측정',
        icon: 'radar',
        appOrAdmin: true,
        lock: 'pitch',
        appMoreHidden: true,
      },
      /*
       * ABS(볼 · 스트라이크 자동 판정) — 구속 측정과 같은 카메라 화면을 판정 모드로 연다(2026-10-18 사용자: "별개의 기능으로 따로도 쓸 수 있어야").
       * 검문 2(docs/designs/abs-single-camera.md)를 지날 때까지 관리자만.
       */
      {
        href: '/abs',
        label: 'ABS 판정',
        icon: 'zone',
        appOrAdmin: true,
        adminOnly: true,
        perm: 'abs',
        lock: 'pitch',
        appMoreHidden: true,
      },
    ],
  },
  /*
   * 3D 동작 분석 — 옆 · 뒤 두 영상으로 3D(2026-10-13 김민 '더보기에 투구분석'). 2026-10-14 이름을 바꾸고('투구 분석'은 기록 분석 /coach 와
   * 헷갈렸다) 일반 사용자에게도 연다 — 사람마다 자기 영상만(lib/pitch-lab.ts ownerIds), GPU 비용은 lib/pitch-lab-guard.ts.
   */
  {
    items: [
      {
        href: '/videos/lab',
        label: '3D 동작 분석',
        icon: 'body',
        lock: 'pitch',
        appMoreHidden: true,
      },
      /* 3D 스윙 분석(타자, 베타 2026-10-21) — 타격 탭 안에서 들어간다. 모델을 만들기 전이라 리포트는 '준비 중' */
      {
        href: '/hitting/lab',
        label: '3D 스윙 분석',
        icon: 'body',
        appMoreHidden: true,
      },
    ],
  },
  {
    title: '라이브러리',
    items: [
      {
        href: '/library/training',
        label: '운동 영상',
        icon: 'film',
        tone: 'power',
        appMoreHidden: true,
      },
      {
        href: '/library/mechanics',
        label: '투구 드릴',
        icon: 'target',
        tone: 'mobility',
        appMoreHidden: true,
      },
    ],
  },
  /*
   * 소통 — 고객센터(공지 · 자주 묻는 질문 · 1:1 문의), 2026-10-17 1판(틀). 매일 쓰는 곳은 아니라 라이브러리 뒤. 잠금 없음.
   * 커뮤니티도 여기 있다가 2026-10-20 하단 탭으로 올라갔다(위).
   */
  {
    title: '소통',
    items: [{ href: '/support', label: '고객센터', icon: 'support' }],
  },
  {
    title: '관리',
    items: [
      {
        href: '/admin',
        label: '관리자',
        icon: 'shield',
        tone: 'armcare',
        adminOnly: true,
        perm: 'adminHome',
      },
      /* 카메라로 잰 값과 스피드건 값을 견줘 정확도를 올리는 자료 — 관리자만, 웹 화면 */
      {
        href: '/admin/velocity',
        label: '구속 측정 관리자',
        icon: 'gauge',
        tone: 'armcare',
        adminOnly: true,
        perm: 'velocityAdmin',
      },
      /* 유튜브 참고 영상을 우리 영상으로 — 촬영 계획 · 체크 · 휴대폰 촬영 모드(2026-10-09) */
      {
        href: '/admin/shoot',
        label: '영상 촬영',
        icon: 'clapper',
        tone: 'armcare',
        adminOnly: true,
        perm: 'shoot',
      },
      /* 3D 스윙 분석 모델링용 타자 샘플 · 마커 샘플 올리기(2026-10-21, 대표관리자만 — lib/permissions.ts 'dev3d') */
      {
        href: '/admin/dev3d',
        label: '3D 개발 관리자',
        icon: 'body',
        tone: 'armcare',
        adminOnly: true,
        perm: 'dev3d',
      },
      /* 1:1 문의 답하기 · 공지 쓰기 · 커뮤니티 신고 처리(2026-10-17) */
      {
        href: '/admin/support',
        label: '소통 관리',
        icon: 'support',
        tone: 'armcare',
        adminOnly: true,
      },
      /* 팀 · 레슨장 마스터 화면으로 전환(2026-10-20) — 관리자만. 마스터 계정은 이 메뉴 자체를 못 본다((app) 틀이 /manage 로 보낸다) */
      {
        href: '/manage',
        label: '팀 · 레슨장 관리',
        icon: 'users',
        tone: 'armcare',
        adminOnly: true,
      },
    ],
  },
];

/**
 * 모바일 하단 탭 — 매일 쓰는 것 + 더보기.
 * 라이브러리는 매일 열지 않으므로 '더보기'로 보낸다.
 */
/**
 * 종목 하단바(2026-10-20 김민 D1 · E1 · E2, docs/designs/hitting-restructure.md) — 투구 · 타격 화면에 들어가면 하단바가 그 종목 것으로
 * 바뀐다. 첫 칸 ‹ 는 평소 하단바(홈)로. 칸끼리는 누르기만(판 넘기기 없음 — E2). 주소는 지금 것 그대로(E1), 같이 쓰는 트레이닝은
 * ?sport= 로 어느 바인지 붙인다. 운동 판은 종목과 상관없이 하루 하나(TrainingSession userId · date).
 */
export type SportKey = 'pitch' | 'hit';

export const SPORT_BACK: NavItem = { href: '/today', label: '뒤로', icon: 'back' };

/**
 * 종목 홈(2026-10-20 김민: "투구 · 타격 각 카테고리에도 홈, 이름은 투구 · 타격") — 홈은 오늘 카드 · 바로가기 · 이번 주 요약,
 * 기록(달력 · 목록)은 ?view=log 로 가른다(같은 판 · 같은 자료). 기록 칸에 lock 을 안 다는 것은 applyLocks 가 홈과 같은 설정 주소로 바꿔
 * key 가 겹치기 때문 — 잠겨 있으면 그 화면이 첫 설정으로 보낸다.
 */
export const SPORT_LOG_VIEW = 'log';

export const SPORT_BARS: Record<SportKey, NavItem[]> = {
  pitch: [
    SPORT_BACK,
    { href: '/videos', label: '투구', icon: 'baseball', lock: 'pitch' },
    { href: '/videos?view=log', label: '기록', icon: 'calendar' },
    {
      href: '/training?sport=pitch',
      label: '트레이닝',
      icon: 'dumbbell',
      lock: 'training',
    },
    {
      href: '/training?view=armcare',
      label: '암케어',
      icon: 'heart',
      lock: 'training',
    },
    {
      href: '/training?view=mechanics',
      label: '메커니즘',
      icon: 'target',
      lock: 'training',
    },
  ],
  hit: [
    SPORT_BACK,
    { href: '/hitting', label: '타격', icon: 'bat' },
    { href: '/hitting?view=log', label: '기록', icon: 'calendar' },
    {
      href: '/training?sport=hit',
      label: '트레이닝',
      icon: 'dumbbell',
      lock: 'training',
    },
  ],
};

/**
 * 지금 주소가 어느 종목 바인가 — 없으면 평소 하단바. 첫 설정 화면도 그 종목 바(잠긴 칸은 applyLocks 가 설정 주소로 바꿔 둔다).
 * 그냥 /training(홈 링 · 요약 칸의 링크)은 투구 바(포지션은 묻지 않는다 — 2026-10-20 타격 시작 질문 뺌). 트레이닝 홈(?view=home)은 평소 바.
 */
export function sportOf(
  pathname: string,
  params: { get(name: string): string | null }
): SportKey | null {
  if (pathname === '/hitting' || pathname.startsWith('/hitting/')) return 'hit';
  if (
    pathname === '/videos' ||
    pathname.startsWith('/videos/') ||
    pathname.startsWith('/pitch-log/')
  )
    return 'pitch';
  if (pathname === '/training') {
    const view = params.get('view');
    if (view === 'home' || view === 'last') return null;
    if (view === 'armcare' || view === 'mechanics') return 'pitch';
    const sport = params.get('sport');
    return sport === 'hit' ? 'hit' : 'pitch';
  }
  if (pathname === SETUP_PATH.training) return 'pitch';
  return null;
}

/** 종목 바에서 지금 켜진 칸 — 같은 /training 이 칸 셋으로 갈라져 경로만으로는 못 고른다 */
export function sportActiveHref(
  sport: SportKey,
  pathname: string,
  params: { get(name: string): string | null }
): string | null {
  if (pathname === '/training' || pathname === SETUP_PATH.training) {
    const view = params.get('view');
    if (sport === 'pitch' && view === 'armcare') return '/training?view=armcare';
    if (sport === 'pitch' && view === 'mechanics') return '/training?view=mechanics';
    return `/training?sport=${sport}`;
  }
  const home = sport === 'pitch' ? '/videos' : '/hitting';
  const log =
    params.get('view') === SPORT_LOG_VIEW || pathname.startsWith('/pitch-log/');
  return log ? `${home}?view=${SPORT_LOG_VIEW}` : home;
}

/**
 * 하단 탭의 '더보기' 자리.
 *
 * 링크처럼 생겼지만 화면으로 넘어가지 않는다 — 누르면 PC 와 같은 사이드바가
 * 옆에서 나온다(components/app-shell.tsx 의 MobileTabs). 목록에서 이 자리를
 * 알아보는 표시로만 쓴다. /more 화면은 지웠다 — 그 주소로 오면 홈으로(next.config.ts).
 */
export const MORE_HREF = '/more';

/**
 * PC 틀(오른쪽 위 아이콘 줄 · 도크 · 판의 연출)을 쓰는 화면 — 마우스로 쓰는(hover · 가는 포인터)
 * 576px 이상. PC 창을 화면 반으로 나눠도 PC 틀 그대로다.
 *
 * 예전에는 손가락으로 쓰는 화면도 1024px 이상이면 PC 틀이었다. 가로로 둔 아이패드가 거기 걸려
 * 32px 단추를 손가락으로 눌러야 했다. 이제 손가락 화면은 넓어도 PC 틀이 아니다 — 큰 손가락
 * 화면은 패드 틀(globals.css 의 @custom-variant pad, 왼쪽 탭 막대)이다(2026-10-12).
 *
 * 576px 인 까닭: 윈도우 배율 150% 노트북(1920 → 1280 CSS px)에서 창을 반으로 나누면
 * 640px 에 조금 못 미친다. 휴대폰은 세로 430px 안팎이라 한참 밑이다. 로고와 오른쪽
 * 아이콘 줄은 520px 쯤까지 겹치지 않는다.
 *
 * app/globals.css 의 @custom-variant desk 와 글자 하나 다르지 않은 조건이다. CSS 는
 * desk: 로 틀을 보이고 숨기고, JS(matchMedia)는 이것으로 연출을 돌지 정한다. 둘이
 * 어긋나면 좁힌 PC 창에서 막대는 보이는데 연출이 안 돌거나 그 반대가 된다.
 * px 가 아니라 rem 으로 적는 것도 CSS 와 같게 하려는 것이다.
 */
export const DESK_MEDIA = '(min-width: 36rem) and (hover: hover) and (pointer: fine)';

/**
 * 메뉴 주소 말고도 그 탭에 속하는 주소 — 거기 있을 때도 그 탭에 불이 들어온다.
 *
 * 투구 기록 탭(/videos)은 날짜 하나를 파고드는 화면(/pitch-log/<날짜>)까지 맡는다.
 * 캘린더에서 날짜를 눌러 들어가도 지금 어느 탭에 있는지 메뉴가 알려 준다.
 */
export const NAV_ALSO: Record<string, readonly string[]> = {
  /*
   * 구속 측정 관리자도 투구 기록의 한 보기다(같은 머리 · 같은 고르개, app/(app)/videos/pitch-log-heading.tsx).
   * 첫 설정 화면(lib/feature-locks.ts SETUP_PATH)도 그 탭의 것이다 — 탭 주소 밑이라 이미 켜지지만, 설정을 마친 뒤
   * 다시 들어와도 그 탭이라는 것을 여기 적어 둔다.
   */
  '/videos': ['/pitch-log', '/admin/velocity', SETUP_PATH.pitch],
  '/training': [SETUP_PATH.training],
  '/nutrition': [SETUP_PATH.nutrition],
  /* 분석 · 그래프는 홈의 '더 보기'다(2026-10-05 홈 정리, app/(app)/coach/page.tsx) */
  '/today': ['/coach'],
};

/** 차례 홈 · 덕아웃 · 투구 · 타격 · 더보기(2026-10-21 김민). 트레이닝은 투구 · 타격 종목 하단바 안(아래 SPORT_BARS), 영양은 더보기 */
export const MOBILE_TABS: NavItem[] = [
  { href: '/today', label: '홈', icon: 'home' },
  { href: DUGOUT_HREF, label: '덕아웃', icon: 'community' },
  {
    href: '/videos',
    label: '투구',
    icon: 'baseball',
    lock: 'pitch',
  },
  { href: '/hitting', label: '타격', icon: 'bat' },
  { href: MORE_HREF, label: '더보기', icon: 'menu' },
];

/** applyLocks 가 곁 항목(탭의 첫 화면이 아닌 잠긴 항목)의 주소에 붙이는 칸 이름 — isLockSideHref 가 같은 이름을 본다 */
const LOCK_FROM_PARAM = 'from';

/**
 * 잠긴 항목의 주소를 첫 설정 화면으로 바꾸고 locked 를 단다(lib/feature-locks.ts, 2026-10-09).
 *
 * 항목을 지우지 않는다 — 처음 가입한 사람도 막대에서 그 탭이 '있다'는 것은 보고, 누르면 질문 몇 개를 거쳐 열린다.
 * 셸은 locked 를 보고 흐리게 + 자물쇠로 그린다(components/app-shell.tsx).
 *
 * 탭의 첫 화면(FEATURE_HOME)이 아닌 항목(구속 측정 → 투구 기록 설정)은 ?from= 을 붙여 주소를 갈라 둔다. 셸이 주소를
 * 항목의 이름(React key · 아이콘 이름표 nav-fly-N · 판의 돋는 차례)으로 쓰는데, 같은 주소가 둘이면 이름표가 겹쳐 메뉴
 * 연출이 통째로 멈춘다. 그 칸은 셸의 '지금 여기' 판정도 본다(isLockSideHref) — 설정 화면은 읽지 않는다.
 *
 * 주소에 뜻 없는 칸이 하나 남지만(복사하면 보인다) 그대로 둔다. 없애려면 셸이 주소 대신 다른 열쇠로 항목을 가려야 해서
 * 막대 · 도크 · 판 · 탭의 이름표 · 동그라미(useSlidingThumb) · 고른 자리(pick)를 다 바꿔야 한다. 설정 화면이 이 칸을
 * 읽어 마친 뒤 그 자리(/velocity)로 돌려보내게 되면 뜻도 생긴다.
 */
export function applyLocks<T extends NavItem>(
  items: T[],
  locks: FeatureLocks
): (T & { locked?: boolean })[] {
  return items.map((item) => {
    const key = item.lock;
    if (!key || !locks[key]) return item;
    const path = item.href.split('?')[0];
    const href =
      path === FEATURE_HOME[key]
        ? SETUP_PATH[key]
        : `${SETUP_PATH[key]}?${LOCK_FROM_PARAM}=${encodeURIComponent(path)}`;
    return { ...item, href, locked: true };
  });
}

/**
 * applyLocks 가 바꾼 곁 항목의 주소인가(구속 측정 → /videos/setup?from=%2Fvelocity).
 *
 * 셸은 이것을 '지금 여기'로 켜지 않는다 — 같은 설정 화면을 가리키는 탭 항목(투구 기록 → /videos/setup)이 따로 있어서,
 * 경로만 보면 투구 기록 설정 화면에서 둘이 같이 켜졌다(aria-current 둘, 판에서는 파란 줄 둘).
 */
export function isLockSideHref(href: string): boolean {
  const q = href.indexOf('?');
  return q >= 0 && new URLSearchParams(href.slice(q + 1)).has(LOCK_FROM_PARAM);
}

/** 도크 · 판의 묶음에 같은 것을 — 묶음은 그대로, 항목만 바꾼다 */
export function applyLocksToGroups(
  groups: NavGroup[],
  locks: FeatureLocks
): NavGroup[] {
  return groups.map((g) => ({ ...g, items: applyLocks(g.items, locks) }));
}

/**
 * PC 오른쪽 간편 이동 막대에 둘 항목.
 *
 * 휴대폰 하단 탭과 같은 목록을 쓴다 — 자주 가는 곳은 기기가 달라도 같다.
 * 다만 '더보기'는 뺀다. PC 막대에는 사이드바를 여는 네모 버튼이 따로 있어서,
 * 여기 또 두면 같은 버튼이 두 개가 된다.
 */
export function quickTabs(): NavItem[] {
  return MOBILE_TABS.filter((t) => t.href !== MORE_HREF);
}

/**
 * 볼 수 없는 항목을 걸러낸다 — 관리자 전용은 관리자만, 앱 · 관리자 전용(구속 측정)은 앱 안이거나
 * 관리자일 때만. 앱 안인지는 요청의 User-Agent 로 부르는 쪽이 가린다(lib/app-env.ts).
 */
export function visibleGroups(role: string, isNative = false): NavGroup[] {
  /* 준관리자(2026-10-20)는 perm 이 있는 관리자 항목 중 표가 연 것만 · 웹 구속 측정은 구속 관리자 권한으로 */
  const owner = isOwner(role);
  const webMeasure = owner || can(role, 'velocityAdmin');
  return NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter(
      (i) =>
        (!i.adminOnly || (i.perm ? can(role, i.perm) : owner)) &&
        (!i.appOrAdmin || webMeasure || isNative)
    ),
  })).filter((g) => g.items.length > 0);
}
