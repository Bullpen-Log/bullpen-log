'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { ButtonLink, PageHeading } from '@/components/ui';
import { useTodayKey } from '@/components/use-today-key';
import { Segmented } from '@/components/segmented';
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

/**
 * [캘린더 | 목록] — 같은 기록을 다르게 찾는 두 방식.
 *
 * 캘린더는 '그날'을 알 때 — 투구한 날이 칠해지고, 영상이 있는 날은 그날 영상의 한
 * 장면이 칸을 채운다. 날짜를 누르면 그날 기록과 영상이 밑에 펴진다.
 * 목록은 여러 날을 가로질러 훑을 때 — 구속·강도로 줄 세우고, 영상 두 개를 골라 견준다.
 * 홈의 [캘린더 | 목록]과 같은 고르개를 쓴다.
 */
const VIEW_OPTIONS = [
  { value: 'calendar', label: '캘린더' },
  { value: 'list', label: '목록' },
] as const;

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
}) {
  const todayKey = useTodayKey(today);
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [comparing, setComparing] = useState(false);
  /* 목록에서 고른 둘. 비교 화면이 이 둘로 열린다. */
  const [preset, setPreset] = useState<{ a: string; b: string } | null>(null);
  /* 목록에서 비교할 둘을 고르는 중인가 */
  const [selecting, setSelecting] = useState(false);

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
      <div className="space-y-6">
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

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Pitch log"
        title="투구 기록"
        action={
          /* 기록을 남기는 곳은 날짜 화면이다 — 이 탭에서 곧장 오늘로 */
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
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* 캘린더에서도 견주기로 곧장 — 목록으로 넘어가 둘을 고르는 자리를 연다 */}
        {view === 'calendar' && clips.length >= 2 ? (
          <button
            type="button"
            onClick={() => {
              setView('list');
              setSelecting(true);
            }}
            className="rounded-lg border border-sky bg-sky-tint px-3 py-1.5 text-xs font-semibold text-sky-strong transition-colors hover:bg-sky-tint/70"
          >
            2분할 비교
          </button>
        ) : (
          <span />
        )}
        <Segmented
          label="기록 보기 방식"
          value={view}
          onChange={(next) => {
            setView(next);
            if (next === 'calendar') setSelecting(false);
          }}
          options={VIEW_OPTIONS}
          tone="raised"
          itemClassName="px-4 py-1.5"
        />
      </div>

      {/* 두 방식을 오갈 때 살짝 떠오르며 바뀐다 */}
      <div key={view} className="motion-safe:animate-fade-in">
        {view === 'calendar' ? (
          <VideoCalendar
            logs={logs}
            featured={featured}
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
