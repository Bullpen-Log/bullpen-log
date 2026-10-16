'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeading } from '@/components/ui';
import { useTodayKey } from '@/components/use-today-key';
import {
  PITCH_VIEW_OPTIONS,
  PitchLogHeading,
  PitchViewSwitch,
  VELOCITY_ADMIN_OPTION,
  type PitchView,
} from './pitch-log-heading';
import { CompareView, type ClipOption } from './compare-view';
import { VideoGallery } from './video-gallery';
import { VideoCalendar } from './video-calendar';
import { effortText } from '@/lib/pitch-effort';
import { formatSpeed } from '@/lib/units';
import { useSpeedUnit } from '@/components/use-units';
import { type ThrowCardData } from './throw-plan-card';
import { TodayCard, type TodayCardData } from './today-card';

/**
 * 투구 기록 한 건 — 캘린더 · 목록에 필요한 만큼만. 평균 구속 · 자세 분석 같은 것은 그날
 * 기록 화면(/pitch-log/<날짜>)에서 본다. 영상이 없는 기록도 온다(videoPaths 가 빈 배열).
 */
export type VideoLog = {
  id: string;
  date: string;
  sessionType: string;
  pitchCount: number;
  /** 옛 1~10(쉰 날 0). 화면에 보일 때는 lib/pitch-effort.ts effortText · maxEffortPct 로 % 를 만든다 */
  intensity: number;
  /** 체감 강도 5~100%(2판 D2). 옛 기록 · 쉰 날은 null */
  effortPct: number | null;
  maxVelocity: number | null;
  memo: string | null;
  videoPaths: string[];
  /** 만족도 1~5 · 좋았던 것 · 아쉬웠던 것(lib/pitch-satisfaction.ts) — 목록의 느낌으로 찾기(lib/pitch-find.ts). 옛 기록은 null · [] */
  satisfaction: number | null;
  cuesGood: string[];
  cuesBad: string[];
};

/*
 * 찍으러 가는 문 둘(구속 측정 · 3D 동작 분석) — 2026-10-14 사용자: 제목 옆 '분석'(보기)과 나눠, 고르개 밑에 같은 무게로.
 * 휴대폰은 반반 두 칸(글자가 보여야 처음 쓰는 사람도 찾는다), PC 는 고르개 줄 오른쪽에 글 단추.
 */
/* 보기 칸 [캘린더 | 목록 | 구속 측정]은 투구 기록 머리와 같이 둔다(pitch-log-heading.tsx) */
type View = PitchView;

/**
 * 캘린더·목록과 2분할 비교, 화면들을 오간다.
 *
 * 2분할 비교는 두 걸음이다 — 고르고, 견준다. 예전에는 단추를 누르면 곧장
 * 비교 화면이 열렸고 거기서 가장 예전 것과 가장 최근 것이 멋대로 짝지어져
 * 있었다. 대개는 그 둘이 아니라서 들어가자마자 목록을 두 번 열어 다시 골라야
 * 했다. 이제 목록에서 썸네일을 보며 둘을 고른 뒤에 넘어간다.
 */
export function VideosClient({
  logs,
  featured,
  initialMonth,
  initialDate,
  today,
  canMeasure,
  velocityHref,
  measured,
  initialView,
  initialCompare = false,
  throwCard,
  todayCard,
  noteDays,
}: {
  logs: VideoLog[];
  /** '오늘 던지는 일정' 카드의 재료(체크인 3판, throw-plan-card.tsx) */
  throwCard: ThrowCardData;
  /** 맨 위 '오늘' 카드 — 오늘 계획 한 줄 · 오늘 남긴 양(today-card.tsx) */
  todayCard: TodayCardData;
  /** 체크인 메모를 남긴 날 — 캘린더 칸의 작은 쪽지 */
  noteDays: string[];
  /** 날짜(YYYY-MM-DD)별로 고른 대표 영상. 안 고른 날은 없다. */
  featured: Record<string, string>;
  /** 처음에 펴 둘 달(YYYY-MM). 없으면 가장 최근 달 */
  initialMonth: string | null;
  /** 처음에 열어 둘 날(YYYY-MM-DD) — 홈에서 그날 영상으로 들어온 경우 */
  initialDate: string | null;
  /** 서버가 본 오늘 — 화면이 뜬 뒤에는 브라우저의 오늘로 맞춘다(자정을 넘겨 켜 둔 탭) */
  today: string;
  /** 카메라 구속 측정 단추를 보일까 — 앱 안이거나 관리자일 때만(app/(app)/videos/page.tsx) */
  canMeasure: boolean;
  /** 관리자 웹 — 세 번째 칸을 고르면 보기를 바꾸지 않고 이 주소(구속 측정 관리자)로 간다 */
  velocityHref: string | null;
  /** 날짜별 카메라 측정 요약(공 수 · 최고 km/h) — 캘린더의 그날 칸에 적는다 */
  measured: Record<string, { n: number; max: number }>;
  /** 처음 보일 칸 — ?view=velocity 로 들어오면 구속 측정 */
  initialView: View;
  /** 처음부터 비교할 둘을 고르는 자리로(?compare=1) — 영상이 둘 넘게 있을 때만 */
  initialCompare?: boolean;
}) {
  const router = useRouter();
  const todayKey = useTodayKey(today);
  const [view, setView] = useState<View>(initialView);
  /*
   * 고르개 칸 — 관리자 웹은 셋째 칸이 구속 측정 관리자. 카메라 측정(구속 측정 모드)은 칸이 아니라
   * 고르개 옆의 단추다(아래 viewControls) — 다른 화면(/velocity)으로 가고 뒤로 가기로 여기로 돌아온다.
   */
  const viewOptions: readonly { value: View; label: string }[] =
    canMeasure && velocityHref
      ? [...PITCH_VIEW_OPTIONS, VELOCITY_ADMIN_OPTION]
      : PITCH_VIEW_OPTIONS;
  /*
   * 갈 곳을 미리 받아 둔다 — 구속 측정 관리자는 자료가 많아, 누른 뒤에 받기 시작하면 한참 기다린다
   * (사용자: "멀리 이동하는 느낌 · 로딩이 길다"). 구속 측정 모드도 같은 이유로.
   */
  useEffect(() => {
    if (velocityHref) router.prefetch(velocityHref);
    if (canMeasure) router.prefetch('/velocity');
  }, [router, velocityHref, canMeasure]);
  const [comparing, setComparing] = useState(false);
  /* 2분할 비교 영상 요약의 구속도 고른 단위로(2026-10-16 베타: mph 를 골라도 km/h 였다) */
  const speedUnit = useSpeedUnit();
  /* 목록에서 고른 둘. 비교 화면이 이 둘로 열린다. */
  const [preset, setPreset] = useState<{ a: string; b: string } | null>(null);
  /* 목록에서 비교할 둘을 고르는 중인가 */
  const [selecting, setSelecting] = useState(
    () => initialCompare && logs.reduce((n, log) => n + log.videoPaths.length, 0) >= 2
  );

  /** 비교 화면에서 고를 수 있는 영상 목록 */
  const clips = useMemo<ClipOption[]>(
    () =>
      logs.flatMap((log) =>
        log.videoPaths.map((path, i) => ({
          id: `${log.id}-${i}`,
          date: log.date.slice(0, 10),
          path,
          label: log.videoPaths.length > 1 ? `영상 ${i + 1}` : '영상',
          summary: [
            formatSpeed(log.maxVelocity, speedUnit),
            `${log.pitchCount}구`,
            effortText(log) && `강도 ${effortText(log)}`,
          ]
            .filter(Boolean)
            .join(' · '),
        }))
      ),
    [logs, speedUnit]
  );

  if (comparing) {
    return (
      <div className="stack-page">
        <PageHeading
          eyebrow="Pitch log"
          title="2분할 비교"
          action={
            <button
              type="button"
              onClick={() => setComparing(false)}
              className="inline-flex min-h-10 items-center rounded-lg border border-line-strong px-3 text-xs font-semibold text-ink transition-colors hover:border-sky hover:text-sky"
            >
              투구 기록으로
            </button>
          }
        />
        <CompareView clips={clips} initialA={preset?.a} initialB={preset?.b} />
      </div>
    );
  }

  /* 보기 고르개 줄 — 세로가 낮은 PC 에서는 제목 줄 오른쪽으로 올라간다(아래) */
  const viewControls = (
    <PitchViewSwitch
      value={view}
      onChange={(next) => {
        /* 관리자 웹의 세 번째 칸은 보기가 아니라 관리자 화면으로 가는 길 */
        if (next === 'velocity' && velocityHref) {
          router.push(velocityHref);
          return;
        }
        setView(next);
        if (next === 'calendar') setSelecting(false);
      }}
      options={viewOptions}
    />
  );

  return (
    <div className="stack-page">
      {/* 머리 — 제목 줄 오른쪽에 찍으러 가는 문 둘 + '분석', 밑 줄은 고르개만(2026-10-16) */}
      <PitchLogHeading
        controls={viewControls}
        canMeasure={canMeasure}
      />

      {/* 오늘 — 계획 한 줄 · 던지는 일정(접힌 알약) · 기록 남기기 */}
      <TodayCard today={todayKey} data={todayCard} throwCard={throwCard} />

      {/* 두 방식을 오갈 때 살짝 떠오르며 바뀐다 */}
      <div key={view} className="motion-safe:animate-fade-in">
        {view === 'calendar' ? (
          <VideoCalendar
            logs={logs}
            featured={featured}
            measured={measured}
            noteDays={noteDays}
            initialMonth={initialMonth}
            initialDate={initialDate}
          />
        ) : (
          <VideoGallery
            logs={logs}
            featured={featured}
            initialMonth={initialMonth}
            selecting={selecting}
            onSelectingChange={setSelecting}
            onCompare={(a, b) => {
              setPreset({ a, b });
              setComparing(true);
            }}
          />
        )}
      </div>
    </div>
  );
}
