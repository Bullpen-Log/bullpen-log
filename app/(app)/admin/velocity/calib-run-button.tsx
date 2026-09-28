'use client';

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui';
import { adminSaveCalibRun, type CalibResultInput } from '@/app/actions/velocity-admin';
import type {
  AdminDay,
  AdminPitchRow,
  AdminSessionRow,
} from '@/lib/velocity-admin-load';
import { VELOCITY_ENGINE_VERSION } from '@/lib/velocity-engine/version';
import { remeasurePitch, type Run } from './explorer-panels';

/**
 * '이 날 보정 재측정' — 그날 영상이 남은 공을 전부 지금 모델로 다시 재서 [보정] 폴더에 새 차수로 남긴다.
 * 원본 공의 값은 건드리지 않는다(사용자 요청, 2026-09-28 — 원본과 보정을 따로 쌓아 모델이 좋아졌는지 본다).
 *
 * 재는 것은 브라우저가 한다(remeasurePitch — 클립을 내려받아 analyzeVideo). 공 하나에 몇 초씩 걸리므로
 * 진행을 단추 글자에 '재는 중 3/12' 로 보인다. 내려받지 못한 공은 CLIP_UNAVAILABLE 로 남기고 계속 간다.
 */

/** 못 잰 공의 빈 값 — 까닭(reject)만 남긴다 */
const EMPTY: Omit<CalibResultInput, 'pitchId' | 'ok' | 'reject'> = {
  rawKmh: null,
  releaseKmh: null,
  errorKmh: null,
  confidence: null,
  frames: null,
  fps: null,
};

export function CalibRunButton({
  date,
  day,
  pending,
  onRun,
  onSaved,
  nextPass,
}: {
  /** YYYY-MM-DD */
  date: string;
  /** 그날 원본(세션 · 공) — 아직 안 왔으면 null */
  day: AdminDay | null;
  pending: boolean;
  onRun: Run;
  /** 저장이 끝나면 새 차수 id 로 — 보통 그 폴더로 옮긴다 */
  onSaved: (runId: string) => void;
  /** 이번이 몇 차가 되는지 알면 확인창에 적는다 */
  nextPass?: number;
}) {
  const [progress, setProgress] = useState<{ at: number; total: number } | null>(null);

  const targets: { session: AdminSessionRow; pitch: AdminPitchRow }[] = day
    ? day.sessions.flatMap((session) =>
        session.pitches.filter((p) => p.clipUrl).map((pitch) => ({ session, pitch }))
      )
    : [];
  const none = targets.length === 0;
  const busy = progress != null;

  async function start() {
    if (none || busy) return;
    const pass = nextPass != null ? `${nextPass}차` : '새 차수';
    if (
      !window.confirm(
        `${date} 의 영상 ${targets.length}개를 지금 모델 v${VELOCITY_ENGINE_VERSION} 로 다시 재서 보정 폴더에 ${pass}로 남길까요? 원본 값은 그대로예요.`
      )
    ) {
      return;
    }

    const results: CalibResultInput[] = [];
    for (const [i, { session, pitch }] of targets.entries()) {
      setProgress({ at: i + 1, total: targets.length });
      try {
        const r = await remeasurePitch(session, pitch);
        const m = r.measure;
        results.push(
          m.ok
            ? {
                pitchId: pitch.id,
                ok: true,
                rawKmh: m.kmh,
                releaseKmh: r.release?.releaseKmh ?? null,
                errorKmh: m.errorKmh,
                confidence: m.confidence,
                frames: m.detail.frames,
                fps: r.fps,
                reject: null,
              }
            : {
                pitchId: pitch.id,
                ok: false,
                ...EMPTY,
                frames: r.frameCount,
                fps: r.fps,
                reject: m.code,
              }
        );
      } catch {
        /* 내려받기 · 열기 실패 — 이 공만 남기고 다음 공으로 */
        results.push({
          pitchId: pitch.id,
          ok: false,
          ...EMPTY,
          reject: 'CLIP_UNAVAILABLE',
        });
      }
    }
    setProgress(null);

    /* 저장 — onRun 의 after 는 결과를 못 받으므로 runId 를 여기서 붙들어 둔다 */
    let runId: string | undefined;
    onRun(
      async () => {
        const res = await adminSaveCalibRun({ date, results });
        if (res.ok) runId = res.runId;
        return res;
      },
      () => {
        if (runId) onSaved(runId);
      }
    );
  }

  return (
    <Button
      type="button"
      variant="secondary"
      className="h-9 px-3 py-0 text-xs"
      disabled={pending || busy || none}
      title={
        none
          ? '이 날에는 영상이 남은 공이 없어요 — 정확도 보정용 저장을 켜고 잰 공만 다시 잴 수 있어요.'
          : `영상 ${targets.length}개를 모델 v${VELOCITY_ENGINE_VERSION} 로 다시 재요`
      }
      onClick={start}
    >
      <RotateCcw
        aria-hidden
        className={`h-3.5 w-3.5 ${busy ? 'motion-safe:animate-spin' : ''}`}
      />
      {progress ? `재는 중 ${progress.at}/${progress.total}` : '이 날 보정 재측정'}
    </Button>
  );
}
