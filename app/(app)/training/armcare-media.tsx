'use client';

import { useState, useTransition } from 'react';
import { Info } from 'lucide-react';
import { LibraryVideo } from '@/components/library-video';
import { exerciseDescription } from '@/app/actions/content';

/** 암케어 화면이 운동 하나를 그리는 데 쓰는 것 — 서버가 만들어 넘긴다 */
export type ArmcareExerciseView = {
  id: string;
  title: string;
  intensity: string;
  difficulty: string | null;
  equipment: string[];
  /** 키우는 근육, 크게 쓰는 차례로 */
  targetMuscles: string[];
  /** '1세트 × 10회 (좌우 각각)' — 루틴은 오늘 할 세트로 바꿔 적는다 */
  prescription: string | null;
  thumbUrl: string | null;
  videoPath: string | null;
  referenceVideoId: string | null;
  aspectRatio: number | null;
  /** 아직 촬영 전이라 유튜브 참고 영상으로 대신하고 있는가 */
  isReference: boolean;
};

/**
 * '자세·영상 보기' — 누르면 영상과 설명이 펼쳐진다.
 *
 * 설명 글은 펼칠 때 받아 온다. 암케어 여든 개의 설명을 미리 다 실으면 화면 짐이
 * 커지고, 정작 펼쳐 보는 것은 한두 개다(라이브러리 상세와 같은 방식 —
 * app/actions/content.ts 의 exerciseDescription).
 *
 * 영상은 누르기 전에는 받지 않는다(LibraryVideo). 펼친 동안에만 심는다 — 접은 뒤에도
 * 재생기가 남아 있으면 소리 없이 계속 돈다.
 */
export function ExerciseMedia({ exercise }: { exercise: ArmcareExerciseView }) {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState<string | null>();
  const [loading, startLoading] = useTransition();

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && description === undefined) {
      startLoading(async () => {
        setDescription(await exerciseDescription(exercise.id));
      });
    }
  };

  return (
    <div className="border-t border-line/70">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-label={`${exercise.title} 자세·영상 ${open ? '접기' : '보기'}`}
        className="flex w-full items-center justify-center gap-1.5 py-2 text-[11px] font-semibold text-muted transition-colors hover:text-sky"
      >
        <Info aria-hidden className="h-3.5 w-3.5" />
        {open ? '접기' : '자세·영상 보기'}
      </button>
      {open && (
        <div className="space-y-3 px-4 pb-4">
          {(exercise.videoPath || exercise.referenceVideoId) && (
            <LibraryVideo
              path={exercise.videoPath}
              referenceVideoId={exercise.referenceVideoId}
              title={exercise.title}
              thumbUrl={exercise.thumbUrl}
              aspectRatio={exercise.aspectRatio}
            />
          )}
          {loading ? (
            <p className="text-xs text-muted">설명을 불러오는 중…</p>
          ) : description ? (
            <p className="whitespace-pre-wrap break-keep text-sm leading-relaxed text-ink/85">
              {description}
            </p>
          ) : description === null ? (
            <p className="text-xs text-muted">설명을 불러오지 못했습니다.</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
