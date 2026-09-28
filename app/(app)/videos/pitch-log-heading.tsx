'use client';

import { ViewTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeading } from '@/components/ui';
import { Segmented } from '@/components/segmented';

/**
 * 투구 기록의 머리 — 제목(투구 기록)과 보기 고르개 [캘린더 | 목록 | 구속 측정].
 *
 * 투구 기록(videos-client.tsx)과 구속 측정 관리자(admin/velocity)가 같이 쓴다. 관리자가 웹에서
 * 세 번째 칸을 누르면 구속 측정 관리자로 가는데, 예전에는 거기 머리가 따로라 투구 기록으로 돌아갈
 * 고르개가 사라졌다(2026-09-28 사용자 — "구속 측정 관리자도 투구 기록 기능의 하나라는 느낌으로").
 * 이제 두 화면이 같은 제목 · 같은 고르개를 달고, 고르개의 칸만 바뀐다.
 *
 * 제목 줄과 고르개 줄에 전환 이름표(ViewTransition name)를 단다. 투구 기록 ↔ 구속 측정 관리자는
 * 화면(주소)이 바뀌는 이동이라 본문 전체가 페이드하는데(app/(app)/layout.tsx 의 app-main), 이름표가
 * 같은 요소는 옛 화면과 새 화면에서 짝지어져 그 자리에 그대로 남는다 — 눌렀던 고르개가 사라졌다
 * 나타나지 않는다(2026-09-28 사용자: "어딘가로 멀리 이동하는 느낌 · 누르는 바가 사라지면 안 된다").
 * 불러오는 동안의 화면(admin/velocity/loading.tsx)도 같은 머리를 달아, 자료가 오기 전에도 머리는 제자리다.
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

/** 보기 고르개 — 두 화면이 같은 모양 */
export function PitchViewSwitch({
  value,
  options,
  onChange,
}: {
  value: PitchView;
  options: readonly ViewOption[];
  onChange: (next: PitchView) => void;
}) {
  return (
    <Segmented
      label="기록 보기 방식"
      value={value}
      onChange={onChange}
      options={options}
      tone="raised"
      itemClassName="px-4 py-1.5"
    />
  );
}

/**
 * 제목 줄과 고르개 줄. 세로가 낮은 PC(노트북)에서는 고르개 줄을 따로 두지 않고 제목 줄
 * 오른쪽에 붙인다 — 한 줄(60px 남짓)만큼 본문이 커진다. 한 벌만 보이고 나머지는 숨는다
 * (display: none). 두 조각을 돌려주므로 stack-page 안에 바로 둔다.
 *
 * controls — 고르개 줄(왼쪽 것 · 고르개). action — 제목 줄 오른쪽 단추.
 */
export function PitchLogHeading({
  controls,
  action,
}: {
  controls: ReactNode;
  action?: ReactNode;
}) {
  return (
    <>
      <ViewTransition name="pitch-log-heading">
        <PageHeading
          eyebrow="Pitch log"
          title="투구 기록"
          action={
            <div className="flex items-center gap-2">
              <div className="hidden items-center gap-2 desk-low:flex">{controls}</div>
              {action}
            </div>
          }
        />
      </ViewTransition>
      <ViewTransition name="pitch-log-controls">
        <div className="flex flex-wrap items-center justify-between gap-2 desk-low:hidden">
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
