import { useEffect } from 'react';
import type { TrainingPart } from '@/lib/training-part';
import { rpc } from '~/lib/rpc';

/**
 * 이 트레이닝 앱(오늘 운동 · 암케어 · 메카닉)을 '마지막으로 쓴 앱'으로 적는다 — 웹 remember-app.tsx 와 같은 쿠키
 * (app-training.rememberTrainingPart). 트레이닝 탭 첫 화면이 그 앱 카드를 맨 위에 둔다. 못 적어도 화면은 그대로(조용히 넘긴다).
 */
export function useRememberPart(part: TrainingPart) {
  useEffect(() => {
    rpc('app-training.rememberTrainingPart', part).catch(() => undefined);
  }, [part]);
}
