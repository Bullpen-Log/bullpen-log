import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import type { MechanicsFinishSummary } from '@/lib/mechanics/program';
import { DoneLoading, MechanicsDone } from '~/mechanics/done';
import { leave } from '~/mechanics/parts';
import { rpc, RpcError } from '~/lib/rpc';
import { cacheEpoch } from '~/lib/store';
import { usePalette } from '~/lib/ui';

/**
 * 지난 메카닉 완료 보기(첫 화면 '수행 기록 보기', 2026-10-31 시안 03 '이미 완료한 기록') — 마친 때 묶어 둔 요약을 읽기만 한다
 * (mechanics.loadMechanicsFinish). 새 세션을 열거나(loadMechanicsPlay) 다시 마치지 않고, 완료 효과 · 투구 기록 알림 · 권하기도 보이지 않는다.
 * ?id= 가 없으면 가장 최근 완료.
 */
type FinishRead =
  | { status: 'completed'; summary: MechanicsFinishSummary }
  | { status: 'open'; saved: number; required: number; session: number }
  | { status: 'missing' };

export default function MechanicsDoneScreen() {
  const c = usePalette();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [summary, setSummary] = useState<MechanicsFinishSummary | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const load = useCallback(() => {
    const epoch = cacheEpoch();
    return rpc<FinishRead>('mechanics.loadMechanicsFinish', { attemptId: typeof id === 'string' ? id : null }).then(
      (r) => {
        if (epoch !== cacheEpoch()) return;
        if (r.status === 'completed') setSummary(r.summary);
        else
          setFailed(
            r.status === 'open'
              ? '이 세션은 아직 마무리 전이에요. 메카닉 화면에서 마무리를 확인해 주세요.'
              : '남아 있는 완료 기록이 없어요. 이 판 앞에 마친 세션은 드릴 상세를 다시 계산하지 않아요.'
          );
      },
      (e: unknown) => {
        if (epoch !== cacheEpoch()) return;
        if (e instanceof RpcError && e.code === 'redirect') return leave(e.to ?? '/login');
        setFailed('신호가 약해 완료 기록을 읽지 못했어요. 읽기만 다시 해요.');
      }
    );
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  const close = () => router.back();
  if (summary) return <MechanicsDone summary={summary} mode="view" onClose={close} c={c} />;
  return <DoneLoading failed={failed != null} message={failed ?? ''} onRetry={() => {
        setFailed(null);
        void load();
      }} onClose={close} c={c} />;
}
