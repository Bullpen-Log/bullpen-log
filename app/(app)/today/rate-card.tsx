'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui';
import { Segmented } from '@/components/segmented';
import { ErrorLine } from '@/components/error-line';
import { toast } from '@/components/toast';
import { ratePitchLog } from '@/app/actions/pitch-satisfaction';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { quietRefresh } from '@/lib/quiet-refresh';
import { SATISFACTION_ENDS, SATISFACTION_OPTIONS } from '@/lib/pitch-satisfaction';

/**
 * '오늘 불펜 어땠어요?' — 투구 만족도를 안 매긴 오늘 · 어제 기록이 있으면 홈에 뜨는 한 번 누르기 카드.
 *
 * 입력 폼에서도 매길 수 있지만, 기록을 남길 때 빠뜨리면 다시 열어 고치지 않는다. 만족도가 쌓여야
 * '잘 던진 날 찾기'가 돌므로 홈에서 한 번 더 묻는다. 매기면 서버가 그 기록을 더는 안 돌려줘 카드가 사라진다.
 */
export function RateCard({
  id,
  when,
  sessionType,
}: {
  /** 매길 투구 기록 */
  id: string;
  when: '오늘' | '어제';
  /** 불펜 · 라이브 · 경기 */
  sessionType: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string>();

  const pick = async (v: string) => {
    /* 저장하는 동안 다른 칸을 또 눌러도 한 번만 */
    if (value) return;
    setValue(v);
    setError(undefined);
    const res = await orOffline(ratePitchLog(id, Number(v)), { error: OFFLINE_MESSAGE });
    if ('error' in res) {
      setValue('');
      setError(res.error);
      return;
    }
    toast('저장했어요');
    quietRefresh(router);
  };

  return (
    <Card className="space-y-3">
      <p className="text-sm font-bold text-ink">
        {when} {sessionType} 어땠어요?
      </p>
      <div className="space-y-2">
        <Segmented
          label="투구 만족도"
          value={value}
          onChange={pick}
          options={SATISFACTION_OPTIONS}
          size="md"
        />
        <div className="flex justify-between px-1 text-xs text-muted/70">
          <span>1 {SATISFACTION_ENDS.low}</span>
          <span>{SATISFACTION_ENDS.high} 5</span>
        </div>
      </div>
      {error && <ErrorLine>{error}</ErrorLine>}
    </Card>
  );
}
