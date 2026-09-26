'use client';

import { useState, useTransition } from 'react';
import { Info, Scan } from 'lucide-react';
import { LibraryVideo } from '@/components/library-video';
import { useArmcareInfo } from '@/components/armcare-info-context';
import { exerciseDescription } from '@/app/actions/content';
import { methodByKey, type ArmcareMethodKey } from '@/lib/armcare/methods';

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
  /** 훈련 방식(리바운드 등) — 기본 보강이면 null (lib/armcare/methods.ts) */
  method: ArmcareMethodKey | null;
};

/**
 * 운동 설명 — 펼칠 때 받아 온다(app/actions/content.ts 의 exerciseDescription).
 *
 * 암케어 여든 개의 설명을 미리 다 실으면 화면 짐이 커지고, 정작 펼쳐 보는 것은 한두
 * 개다(라이브러리 상세와 같은 방식). '자세·영상 보기'와 루틴 따라하기의 '자세 설명'이
 * 함께 쓴다.
 *
 * 받다가 신호가 끊기면 오류를 던지는 대신 '못 받았다'로 둔다. 예전에는 그 오류가 화면
 * 전체의 오류로 번져, 따라하기 도중에 오류 화면으로 바뀌었다(2026-09-26 검토). 다시
 * 펼치면 다시 받는다.
 */
export function useExerciseDescription(id: string) {
  const [got, setGot] = useState<{ id: string; text: string | null; failed: boolean }>();
  const [loading, startLoading] = useTransition();
  /* 다른 운동의 것은 버린다 — 같은 자리에서 운동이 바뀌어도 앞 운동의 글이 남지 않게 */
  const mine = got?.id === id ? got : undefined;

  const load = () => {
    if (loading || (mine && !mine.failed)) return;
    startLoading(async () => {
      try {
        setGot({ id, text: await exerciseDescription(id), failed: false });
      } catch {
        setGot({ id, text: null, failed: true });
      }
    });
  };

  return { text: mine?.text ?? null, failed: mine?.failed ?? false, loaded: !!mine, loading, load };
}

/** 받아 온 설명 — 받는 중 · 못 받음 · 없음을 한 줄로 */
export function DescriptionText({
  desc,
}: {
  desc: ReturnType<typeof useExerciseDescription>;
}) {
  if (desc.loading) return <p className="text-xs text-muted">설명을 불러오는 중…</p>;
  if (desc.failed) {
    return (
      <p className="text-xs text-muted">
        설명을 불러오지 못했어요.{' '}
        <button
          type="button"
          onClick={desc.load}
          className="font-semibold text-sky-strong underline underline-offset-2"
        >
          다시 받기
        </button>
      </p>
    );
  }
  if (!desc.loaded) return null;
  return desc.text ? (
    <p className="whitespace-pre-wrap break-keep text-sm leading-relaxed text-ink/85">
      {desc.text}
    </p>
  ) : (
    <p className="text-xs text-muted">아직 적힌 설명이 없어요.</p>
  );
}

/**
 * '자세·영상 보기' — 누르면 영상과 설명이 펼쳐진다.
 *
 * 영상은 누르기 전에는 받지 않는다(LibraryVideo). 펼친 동안에만 심는다 — 접은 뒤에도
 * 재생기가 남아 있으면 소리 없이 계속 돈다.
 */
export function ExerciseMedia({
  exercise,
  showMuscleButton = false,
}: {
  exercise: ArmcareExerciseView;
  /**
   * 옆에 '근육 위치' 단추 — 누르면 이 운동이 쓰는 근육 모두가 3D 그림·설명 창으로 뜬다
   * (armcare-info.tsx, 2026-09-26 사용자분: 간편하게). 루틴의 체크 목록에서만 켠다 —
   * 부위별 보강에서는 3D 지도가 바로 위에 있다. 창이 없는 화면이면 안 그린다.
   */
  showMuscleButton?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const desc = useExerciseDescription(exercise.id);
  const info = useArmcareInfo();
  const primary = exercise.targetMuscles[0];

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) desc.load();
  };

  return (
    <div className="border-t border-line/70">
      <div className="flex">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={`${exercise.title} 자세·영상 ${open ? '접기' : '보기'}`}
          className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold text-muted transition-colors hover:text-sky"
        >
          <Info aria-hidden className="h-3.5 w-3.5" />
          {open ? '접기' : '자세·영상 보기'}
        </button>
        {showMuscleButton && info && primary && (
          <button
            type="button"
            /*
             * 운동이 쓰는 근육을 모두 켠다. 예전에는 맨 앞 근육 하나만 열어, 케이블 외회전
             * 0도(극하근 · 소원근)를 눌러도 극하근만 나왔다(2026-09-26 사용자분). 근육이
             * 하나뿐이면 그 근육을 바로 연다.
             */
            onClick={(e) =>
              info(
                exercise.targetMuscles.length > 1
                  ? {
                      kind: 'exercise',
                      title: exercise.title,
                      muscles: exercise.targetMuscles,
                    }
                  : { kind: 'muscle', name: primary },
                e
              )
            }
            aria-label={`${exercise.title} 근육 위치 보기`}
            className="flex flex-1 items-center justify-center gap-1.5 border-l border-line/70 py-2.5 text-xs font-semibold text-muted transition-colors hover:text-sky"
          >
            <Scan aria-hidden className="h-3.5 w-3.5" />
            근육 위치
          </button>
        )}
      </div>
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
          <DescriptionText desc={desc} />
          <MethodNote method={exercise.method} />
        </div>
      )}
    </div>
  );
}

/**
 * 이 운동의 훈련 방식 — 리바운드·드롭 캐치처럼 이름에 방식이 붙은 운동에만 붙인다.
 *
 * 2026-09-26 사용자분이 암케어의 '훈련 방식' 칸을 없애며 정했다: "각 운동 설명에 필요하면
 * 적어 놓는 형태로". 그래서 기본 보강 운동(method 가 null)에는 아무것도 붙이지 않는다.
 * 글은 lib/armcare/methods.ts. 루틴 따라하기의 '자세 설명'도 같은 것을 쓴다.
 */
export function MethodNote({ method }: { method: ArmcareMethodKey | null }) {
  if (!method) return null;
  const m = methodByKey(method);
  return (
    <div className="space-y-2 rounded-xl border border-sky-soft/60 bg-sky-tint/50 px-3.5 py-3">
      <p className="text-[13px] font-bold break-keep text-sky-strong">
        {m.label} 방식 <span className="font-medium text-muted">· {m.cue}</span>
      </p>
      <dl className="grid grid-cols-[4.5em_1fr] gap-x-3 gap-y-1.5 text-[13px] leading-relaxed break-keep">
        <dt className="font-semibold text-sky-strong">하는 법</dt>
        <dd className="text-ink/85">{m.what}</dd>
        <dt className="font-semibold text-sky-strong">왜</dt>
        <dd className="text-ink/85">{m.why}</dd>
        <dt className="font-semibold text-sky-strong">무게</dt>
        <dd className="text-ink/85">{m.load}</dd>
        <dt className="font-semibold text-sky-strong">멈출 때</dt>
        <dd className="text-ink/85">{m.stop}</dd>
      </dl>
      {m.caution && (
        <p className="rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-xs leading-relaxed break-keep text-warn">
          {m.caution}
        </p>
      )}
    </div>
  );
}
