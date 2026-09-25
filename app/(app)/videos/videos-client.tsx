'use client';

import { useMemo, useState } from 'react';
import { PageHeading } from '@/components/ui';
import { Segmented } from '@/components/segmented';
import { CompareView, type ClipOption } from './compare-view';
import { VideoGallery } from './video-gallery';
import { VideoCalendar } from './video-calendar';

/** 갤러리에 필요한 만큼만. 느낀점·평균 구속 같은 것은 그날 기록에서 본다. */
export type VideoLog = {
  id: string;
  date: string;
  sessionType: string;
  pitchCount: number;
  intensity: number;
  maxVelocity: number | null;
  videoPaths: string[];
};

/**
 * [캘린더 | 목록] — 같은 영상을 다르게 찾는 두 방식.
 *
 * 캘린더는 '그날'을 알 때 — 칸마다 그날 영상의 한 장면이 있어 짚어서 바로 튼다.
 * 목록은 여러 날을 가로질러 훑을 때 — 구속·강도로 줄 세우고, 두 개를 골라 견준다.
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
}: {
  logs: VideoLog[];
  /** 날짜(YYYY-MM-DD)별로 고른 대표 영상. 안 고른 날은 없다. */
  featured: Record<string, string>;
  /** 처음에 펴 둘 달(YYYY-MM). 없으면 가장 최근 달 */
  initialMonth: string | null;
  /** 처음에 열어 둘 날(YYYY-MM-DD) — 홈에서 그날 영상으로 들어온 경우 */
  initialDate: string | null;
}) {
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
          eyebrow="Video"
          title="2분할 비교"
          description="서로 다른 날의 투구 영상을 나란히 놓고 봅니다."
          action={
            <button
              type="button"
              onClick={() => setComparing(false)}
              className="rounded-lg border border-line-strong px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-sky hover:text-sky"
            >
              영상 목록으로
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
        eyebrow="Video"
        title="투구 영상"
        description={
          view === 'calendar'
            ? '날짜를 누르면 그날 영상을 바로 봅니다. 칸의 그림은 그날 대표 영상의 한 장면입니다.'
            : '올린 투구 영상을 달별로 모아 봅니다. 카드를 누르면 그날 기록으로 갑니다.'
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
          label="영상 보기 방식"
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
