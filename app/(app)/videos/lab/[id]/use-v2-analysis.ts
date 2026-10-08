'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  checkPitch3dV2,
  loadPitch3dV2,
  requestPitch3dV2,
} from '@/app/actions/pitch-lab';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import {
  isV2JobActive,
  V2_POLL_MS,
  type Pitch3dV2Job,
  type Pitch3dV2Ok,
} from '@/lib/pitch-3d/v2/contract';

/**
 * v2(서버 GPU) 분석의 화면 쪽 상태(설계 pitch-3d-quality.md 검토 1절 · 화면 결정 4~7).
 *
 *   - 보여 줄 결과 = job.shownJobId 의 파일(done 인 마지막 작업). 다시 분석 중 · 실패 뒤에도 그대로 보인다.
 *   - 작업이 돌고 있으면(queued · running, 15분 안) 5초마다 checkPitch3dV2 — 화면이 숨겨져 있으면 쉬고, 신호가 끊기면 간격을 늘린다.
 *   - 화면을 떠났다 돌아오면 서버의 job.json 으로 이어 본다(v1 은 떠나면 멈췄다).
 *
 * preview(개발 확인용 결과)가 있으면 서버를 부르지 않는다.
 */
export function useV2Analysis(
  sampleId: string,
  initialJob: Pitch3dV2Job | null,
  preview?: Pitch3dV2Ok | null
) {
  const [job, setJob] = useState<Pitch3dV2Job | null>(initialJob);
  const [result, setResult] = useState<Pitch3dV2Ok | null>(preview ?? null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [offline, setOffline] = useState(false);

  /* 보여 줄 결과 읽기 — 번호가 바뀔 때만 */
  const shownId = job?.shownJobId ?? null;
  /* 읽는 중 = 보여 줄 번호가 있는데 아직 그 결과를 안 받음 */
  const loading = !preview && shownId != null && shownId !== loadedFor;
  useEffect(() => {
    if (preview || !shownId || shownId === loadedFor) return;
    let gone = false;
    void orOffline(loadPitch3dV2({ id: sampleId, jobId: shownId }), {
      error: OFFLINE_MESSAGE,
    }).then((r) => {
      if (gone) return;
      if ('error' in r) {
        setError(r.error);
        return;
      }
      setLoadedFor(shownId);
      if (r.result?.ok) setResult(r.result);
      else
        setError(
          r.result ? r.result.reason : '결과를 읽지 못했어요. 다시 분석해 주세요.'
        );
    });
    return () => {
      gone = true;
    };
  }, [preview, sampleId, shownId, loadedFor]);

  /* 돌고 있는 동안 묻기 */
  useEffect(() => {
    if (preview || !job || !isV2JobActive(job, Date.now())) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stopped) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        timer = setTimeout(tick, V2_POLL_MS);
        return;
      }
      const r = await orOffline(checkPitch3dV2({ id: sampleId }), {
        error: OFFLINE_MESSAGE,
      });
      if (stopped) return;
      if ('error' in r) {
        const off = r.error === OFFLINE_MESSAGE;
        setOffline(off);
        if (!off) setError(r.error);
        timer = setTimeout(tick, V2_POLL_MS * 2);
        return;
      }
      setOffline(false);
      setJob(r.job);
      if (r.job && isV2JobActive(r.job, Date.now()))
        timer = setTimeout(tick, V2_POLL_MS);
    };
    timer = setTimeout(tick, V2_POLL_MS);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [job, preview, sampleId]);

  const request = useCallback(
    async (consent: boolean) => {
      setError(undefined);
      setBusy(true);
      const r = await orOffline(requestPitch3dV2({ id: sampleId, consent }), {
        error: OFFLINE_MESSAGE,
      });
      setBusy(false);
      if ('error' in r) {
        setError(r.error);
        return false;
      }
      setJob(r.job);
      return true;
    },
    [sampleId]
  );

  return {
    job,
    result,
    loading,
    busy,
    error,
    offline,
    request,
    clearError: () => setError(undefined),
  };
}
