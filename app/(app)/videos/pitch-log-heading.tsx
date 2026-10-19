'use client';

import { ViewTransition, type ReactNode } from 'react';
import { TAB_SWIPE } from '@/lib/transition-types';

/* 탭 쓸기(TAB_SWIPE)로 오갈 때는 화면 전환을 걸지 않는다(lib/transition-types.ts) */
const SWIPE_OFF = { [TAB_SWIPE]: 'none', default: 'auto' };
import { useRouter } from 'next/navigation';
import { Radar, Rotate3d, Target } from '@/components/icon';
import { PageHeading } from '@/components/ui';
import { Segmented } from '@/components/segmented';
import { AnalysisLink } from '@/components/analysis-link';

/**
 * 투구 기록의 머리 — 제목(투구 기록)과 보기 고르개 [캘린더 | 목록 | 구속 측정].
 *
 * 투구 기록(videos-client.tsx)과 구속 측정 관리자(admin/velocity)가 같이 쓴다. 관리자가 웹에서
 * 세 번째 칸을 누르면 구속 측정 관리자로 가는데, 예전에는 거기 머리가 따로라 투구 기록으로 돌아갈
 * 고르개가 사라졌다(2026-09-28 사용자 — "구속 측정 관리자도 투구 기록 기능의 하나라는 느낌으로").
 * 이제 두 화면이 같은 제목 · 같은 고르개를 달고, 고르개의 칸만 바뀐다.
 *
 * 두 화면의 머리가 같은 자리 · 같은 모양이라, 오갈 때 눌렀던 고르개가 사라졌다 나타나지 않는다(2026-09-28 사용자: "어딘가로 멀리
 * 이동하는 느낌 · 누르는 바가 사라지면 안 된다"). 예전엔 전환 이름표로 짝지었는데, 판 넘기기가 투구 판을 늘 붙여 두면서 이름이 둘이 돼
 * 뺐다(2026-10-15). 불러오는 동안의 화면(admin/velocity/loading.tsx)도 같은 머리를 달아, 자료가 오기 전에도 머리는 제자리다.
 */

export type PitchView = 'calendar' | 'list' | 'velocity';

/**
 * [캘린더 | 목록] — 같은 기록을 다르게 찾는 두 방식.
 *
 * 캘린더는 '그날'을 알 때 — 투구한 날이 칠해지고, 영상이 있는 날은 그날 영상의 한
 * 장면이 칸을 채운다. 날짜를 누르면 그날 기록과 영상이 밑에 펴진다.
 * 목록은 여러 날을 가로질러 훑을 때 — 구속·강도로 줄 세우고, 영상 두 개를 골라 견준다.
 * 홈의 [캘린더 | 목록]과 같은 고르개를 쓴다.
 */
export const PITCH_VIEW_OPTIONS = [
  { value: 'calendar', label: '캘린더' },
  { value: 'list', label: '목록' },
] as const;

/*
 * 구속 측정(불펜 벨로시티)은 앱 안이거나 관리자일 때만 세 번째 칸으로 붙는다. 관리자가 웹에서
 * 보면 폰 틀 패널 대신 구속 측정 관리자(/admin/velocity)로 가는 칸이 된다.
 */
export const VELOCITY_OPTION = { value: 'velocity', label: '구속 측정' } as const;
export const VELOCITY_ADMIN_OPTION = { value: 'velocity', label: '구속 측정 관리자' } as const;

type ViewOption = { readonly value: PitchView; readonly label: string };

/**
 * 고르개 폭 — 휴대폰은 남는 폭을 채우고(옆에 작은 칩 둘), 패드 · PC 는 칸 크기대로. 투구 기록과 구속 측정 관리자가 같은 값을 써야
 * 머리 비율이 같다(2026-10-15 사용자: "캘린더 · 목록은 상단 화면 비율이 같은데 구속 측정 관리자만 다르다"). 칩이 못 들어오면(관리자의
 * 세 칸) 칩 줄이 밑으로 내려간다 — 고르개는 제 글자 폭 밑으로 줄지 않는다.
 */
const SWITCH_WIDTH = 'flex-1 pad:flex-none pad:min-w-80 desk:w-auto desk:flex-none';
/*
 * 칸이 셋(관리자의 '구속 측정 관리자')이면 휴대폰은 고르개가 한 줄을 다 쓰고 칩은 밑 줄로 — 칩 옆에 끼우면 고르개가 글자보다 좁아져
 * '목록'과 '구속 측정 관리자'가 겹치며 틀 밖으로 나갔다(2026-10-15 김민). 패드 · PC 는 그대로.
 */
const SWITCH_WIDTH_WIDE = 'w-full pad:w-auto pad:flex-none pad:min-w-80 desk:w-auto desk:flex-none';

/*
 * 찍으러 가는 문 — 제목 줄 오른쪽('분석' 앞). 휴대폰은 그림만 있는 40px 동그라미, 패드 · PC 는 이름까지(2026-10-16 디자인 점검 — 고르개 옆
 * 칩이 고르개 밑 한 줄을 더 써, 투구 탭 위가 고르개 · 칩 · 오늘 카드 세 겹이었다. 그 전엔 10-15 고르개 밑 흰 카드 단추 줄).
 */
const TOOL_CHIP =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center gap-1 rounded-full bg-ink/6 text-footnote font-semibold text-ink transition-opacity active:opacity-60 pad:w-auto pad:px-3 desk:h-9 desk:w-auto desk:rounded-lg desk:border desk:border-sky desk:bg-sky-tint desk:px-3 desk:text-xs desk:text-sky-strong desk:hover:bg-sky-tint/70';

/**
 * 구속 측정(앱 안이면 누구나, 웹이면 관리자만 · canMeasure) · ABS 판정(관리자만 — lib/camera-mode.ts adminOnly · canAbs) · 3D 동작 분석(누구나).
 * 링크가 아니라 push 라 뒤로 가기로 그 화면 · 그 보기로 돌아온다. 휴대폰은 그림만(이름은 aria-label), 패드 · PC 는 이름까지.
 * ABS 는 메뉴에만 있어 투구 탭에서 찾기 어려웠다(2026-10-20 김민) — 구속 측정 화면의 ABS 모드(/abs)로 바로 연다.
 */
function PitchTools({ canMeasure, canAbs }: { canMeasure: boolean; canAbs: boolean }) {
  const router = useRouter();
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {canMeasure && (
        <button
          type="button"
          onClick={() => router.push('/velocity')}
          aria-label="구속 측정"
          className={TOOL_CHIP}
        >
          <Radar aria-hidden className="h-4 w-4 text-sky-strong" />
          <span aria-hidden className="hidden pad:inline desk:inline">구속 측정</span>
        </button>
      )}
      {canMeasure && canAbs && (
        <button type="button" onClick={() => router.push('/abs')} aria-label="ABS 판정" className={TOOL_CHIP}>
          <Target aria-hidden className="h-4 w-4 text-sky-strong" />
          <span aria-hidden className="hidden pad:inline desk:inline">ABS 판정</span>
        </button>
      )}
      <button
        type="button"
        onClick={() => router.push('/videos/lab')}
        aria-label="3D 동작 분석"
        className={TOOL_CHIP}
      >
        <Rotate3d aria-hidden className="h-4 w-4 text-sky-strong" />
        <span aria-hidden className="hidden pad:inline desk:inline">3D 동작 분석</span>
      </button>
    </div>
  );
}

/** 보기 고르개 — 두 화면이 같은 모양 */
export function PitchViewSwitch({
  value,
  options,
  onChange,
  className,
}: {
  value: PitchView;
  options: readonly ViewOption[];
  onChange: (next: PitchView) => void;
  className?: string;
}) {
  return (
    <Segmented
      label="기록 보기 방식"
      value={value}
      onChange={onChange}
      options={options}
      tone="raised"
      className={className ?? (options.length > 2 ? SWITCH_WIDTH_WIDE : SWITCH_WIDTH)}
      itemClassName="flex-1 px-4 py-1.5"
    />
  );
}

/**
 * 제목 줄과 고르개 줄. 세로가 낮은 PC(노트북)에서는 고르개 줄을 따로 두지 않고 제목 줄
 * 오른쪽에 붙인다 — 한 줄(60px 남짓)만큼 본문이 커진다. 한 벌만 보이고 나머지는 숨는다
 * (display: none). 두 조각을 돌려주므로 stack-page 안에 바로 둔다.
 *
 * controls — 고르개. canMeasure — 제목 줄의 구속 측정 단추를 보일지. action — 제목 줄 오른쪽 단추.
 */
export function PitchLogHeading({
  controls,
  canMeasure,
  canAbs = false,
  action,
}: {
  controls: ReactNode;
  canMeasure: boolean;
  /** ABS 판정 단추 — 관리자만 */
  canAbs?: boolean;
  /** 제목 줄 오른쪽 — '분석' 뒤에 붙는다(구속 측정 관리자는 PC 단추들) */
  action?: ReactNode;
}) {
  return (
    <>
      {/*
        이름표(pitch-log-heading · pitch-log-controls)는 뺐다(2026-10-15) — 판 넘기기(tab-pager)가 투구 판을 늘 붙여 두어, 구속 측정
        관리자를 열면 같은 이름이 둘 붙어 화면 전환이 깨졌다(InvalidStateError). 두 화면 사이 머리는 이제 같은 자리에 그대로라 짝지을 일이 없다.
      */}
      <ViewTransition default={SWIPE_OFF}>
        {/* 제목 옆 '분석'은 두 화면 모두 — 휴대폰도 제목 오른쪽(inlineAction), 그래서 머리 높이가 같다 */}
        <PageHeading
          eyebrow="Pitch log"
          title="투구"
          inlineAction
          action={
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 desk-low:flex">{controls}</div>
              <PitchTools canMeasure={canMeasure} canAbs={canAbs} />
              <AnalysisLink view="pitch" />
              {action}
            </div>
          }
        />
      </ViewTransition>
      <ViewTransition default={SWIPE_OFF}>
        <div className="flex flex-wrap items-center gap-2 desk-low:hidden">
          {controls}
        </div>
      </ViewTransition>
    </>
  );
}

/**
 * 구속 측정 관리자의 고르개 — 세 번째 칸에 불이 들어와 있고, 캘린더 · 목록을 누르면 투구
 * 기록 화면의 그 보기로 돌아간다(/videos?view=list).
 */
export function VelocityAdminViewSwitch() {
  const router = useRouter();
  return (
    <PitchViewSwitch
      value="velocity"
      options={[...PITCH_VIEW_OPTIONS, VELOCITY_ADMIN_OPTION]}
      onChange={(next) => {
        if (next === 'calendar') router.push('/videos');
        if (next === 'list') router.push('/videos?view=list');
      }}
    />
  );
}
