'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Columns2, Ellipsis, Plus, Radar } from 'lucide-react';
import Link from 'next/link';
import { ButtonLink, PageHeading } from '@/components/ui';
import { Modal } from '@/components/modal';
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
import { OPEN_POPUP_TYPES } from '@/lib/transition-types';
import { LinkPending } from '@/components/link-pending';

/**
 * 투구 기록 한 건 — 캘린더 · 목록에 필요한 만큼만. 평균 구속 · 자세 분석 같은 것은 그날
 * 기록 화면(/pitch-log/<날짜>)에서 본다. 영상이 없는 기록도 온다(videoPaths 가 빈 배열).
 */
export type VideoLog = {
  id: string;
  date: string;
  sessionType: string;
  pitchCount: number;
  intensity: number;
  maxVelocity: number | null;
  memo: string | null;
  videoPaths: string[];
};

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
}: {
  logs: VideoLog[];
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
  /* 목록에서 고른 둘. 비교 화면이 이 둘로 열린다. */
  const [preset, setPreset] = useState<{ a: string; b: string } | null>(null);
  /* 목록에서 비교할 둘을 고르는 중인가 */
  const [selecting, setSelecting] = useState(false);
  /* 휴대폰 ⋯ 시트 — 2분할 비교 · 구속 측정 */
  const [moreOpen, setMoreOpen] = useState(false);

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
            log.maxVelocity != null ? `${log.maxVelocity}km/h` : null,
            `${log.pitchCount}구`,
            `강도 ${log.intensity}/10`,
          ]
            .filter(Boolean)
            .join(' · '),
        }))
      ),
    [logs]
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
              className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-sky hover:text-sky"
            >
              투구 기록으로
            </button>
          }
        />
        <CompareView clips={clips} initialA={preset?.a} initialB={preset?.b} />
      </div>
    );
  }

  /* 견주기로 곧장 — 목록으로 넘어가 둘을 고르는 자리를 연다 */
  const startCompare = () => {
    setMoreOpen(false);
    setView('list');
    setSelecting(true);
  };

  /* 보기 고르개 줄 — 세로가 낮은 PC 에서는 제목 줄 오른쪽으로 올라간다(아래) */
  const viewControls = (
    <>
      {/* 캘린더에서도 견주기로 곧장 — 목록으로 넘어가 둘을 고르는 자리를 연다 */}
      {/* 휴대폰에서는 ⋯ 시트 안에(아래 moreSheet) — 머리가 네 줄로 쌓였다 */}
      {view === 'calendar' && clips.length >= 2 ? (
        <button
          type="button"
          onClick={startCompare}
          className="hidden rounded-lg border border-sky bg-sky-tint px-3 py-1.5 text-xs font-semibold text-sky-strong transition-colors hover:bg-sky-tint/70 desk:block"
        >
          2분할 비교
        </button>
      ) : (
        <span className="hidden desk:block" />
      )}
      <div className="flex w-full items-center gap-2 desk:w-auto">
        <PitchViewSwitch
          className="w-full desk:w-auto"
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
        {/*
          구속 측정 모드로 — 폰 카메라로 재는 화면(/velocity). 앱 안이면 누구나, 웹이면 관리자만
          (canMeasure). 링크가 아니라 push 라 뒤로 가기로 이 화면 · 이 보기로 돌아온다.
        */}
        {canMeasure && (
          <button
            type="button"
            onClick={() => router.push('/velocity')}
            className="hidden h-9 items-center gap-1.5 rounded-lg border border-sky bg-sky-tint px-3 text-xs font-semibold text-sky-strong transition-colors hover:bg-sky-tint/70 desk:inline-flex"
          >
            <Radar aria-hidden className="h-4 w-4" />
            구속 측정
          </button>
        )}
      </div>
    </>
  );

  return (
    <div className="stack-page">
      {/*
        머리 — 휴대폰은 아이폰 큰 제목처럼 제목 오른쪽에 둥근 [⋯] [+] 둘, 그 밑에 꽉 찬 고르개 한 줄(2026-10-04 '앱 느낌'
        4단계). 예전엔 제목 · 기록 남기기 · 2분할 비교 · 구속 측정 · 고르개가 네 줄로 쌓였다. PC 는 예전 그대로.
      */}
      <PitchLogHeading
        controls={viewControls}
        inlineAction
        action={
          <>
            {/* 기록을 남기는 곳은 날짜 화면이다 — 이 탭에서 곧장 오늘로(PC). 단추 기본 모양이 inline-flex 라 감싸서 숨긴다 */}
            <span className="hidden desk:inline-flex">
              <ButtonLink
                href={`/pitch-log/${todayKey}`}
                transitionTypes={OPEN_POPUP_TYPES}
                className="gap-1.5"
              >
                <LinkPending>
                  <Plus aria-hidden className="h-4 w-4" />
                </LinkPending>
                오늘 기록 남기기
              </ButtonLink>
            </span>
            <div className="flex items-center gap-2 desk:hidden">
              {(clips.length >= 2 || canMeasure) && (
                <button
                  type="button"
                  onClick={() => setMoreOpen(true)}
                  aria-label="더 보기 — 2분할 비교 · 구속 측정"
                  className="flex h-11 w-11 items-center justify-center rounded-full bg-ink/6 text-ink transition-opacity active:opacity-60"
                >
                  <Ellipsis aria-hidden className="h-5 w-5" />
                </button>
              )}
              <Link
                href={`/pitch-log/${todayKey}`}
                transitionTypes={OPEN_POPUP_TYPES}
                aria-label="오늘 기록 남기기"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-sky text-white transition-opacity active:opacity-60"
              >
                <LinkPending className="h-5 w-5">
                  <Plus aria-hidden className="h-5 w-5" strokeWidth={2.4} />
                </LinkPending>
              </Link>
            </div>
          </>
        }
      />

      {/* 휴대폰 ⋯ — 아이폰 동작 시트처럼 할 수 있는 것을 줄로 */}
      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="투구 기록">
        <div className="divide-y divide-line overflow-hidden rounded-2xl bg-surface-2">
          {clips.length >= 2 && (
            <button
              type="button"
              onClick={startCompare}
              className="flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm text-ink active:bg-ink/6"
            >
              <Columns2 aria-hidden className="h-5 w-5 text-sky" />
              <span className="flex-1">
                2분할 비교
                <span className="block text-xs text-muted">영상 두 개를 골라 나란히 봐요</span>
              </span>
            </button>
          )}
          {canMeasure && (
            <button
              type="button"
              onClick={() => {
                setMoreOpen(false);
                router.push('/velocity');
              }}
              className="flex min-h-12 w-full items-center gap-3 px-4 py-2 text-left text-sm text-ink active:bg-ink/6"
            >
              <Radar aria-hidden className="h-5 w-5 text-sky" />
              <span className="flex-1">
                구속 측정
                <span className="block text-xs text-muted">폰 카메라로 공 빠르기를 재요</span>
              </span>
            </button>
          )}
        </div>
      </Modal>

      {/* 두 방식을 오갈 때 살짝 떠오르며 바뀐다 */}
      <div key={view} className="motion-safe:animate-fade-in">
        {view === 'calendar' ? (
          <VideoCalendar
            logs={logs}
            featured={featured}
            measured={measured}
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
