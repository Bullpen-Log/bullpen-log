'use client';

import { useMemo, useState } from 'react';
import { PageHeading } from '@/components/ui';
import { CompareView, type ClipOption } from './compare-view';
import { VideoGallery } from './video-gallery';

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
 * 갤러리와 2분할 비교, 두 화면을 오간다.
 *
 * 2분할 비교는 두 걸음이다 — 고르고, 견준다. 예전에는 단추를 누르면 곧장
 * 비교 화면이 열렸고 거기서 가장 예전 것과 가장 최근 것이 멋대로 짝지어져
 * 있었다. 대개는 그 둘이 아니라서 들어가자마자 목록을 두 번 열어 다시 골라야
 * 했다. 이제 갤러리에서 썸네일을 보며 둘을 고른 뒤에 넘어간다.
 */
export function VideosClient({ logs }: { logs: VideoLog[] }) {
  const [comparing, setComparing] = useState(false);
  /* 갤러리에서 고른 둘. 비교 화면이 이 둘로 열린다. */
  const [preset, setPreset] = useState<{ a: string; b: string } | null>(null);
  /* 갤러리에서 비교할 둘을 고르는 중인가 */
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
        description="올린 투구 영상을 달별로 모아 봅니다. 카드를 누르면 그날 기록으로 갑니다."
      />
      <VideoGallery
        logs={logs}
        selecting={selecting}
        onSelectingChange={setSelecting}
        onCompare={(a, b) => {
          setPreset({ a, b });
          setComparing(true);
        }}
      />
    </div>
  );
}
