'use client';

import { useEffect } from 'react';
import { TRAINING_PART_COOKIE, type TrainingPart } from '@/lib/training-part';

/** 한 해 — 마지막으로 쓴 앱은 오래 기억해도 된다 */
const REMEMBER_SECONDS = 60 * 60 * 24 * 365;

/**
 * 지금 보는 트레이닝 앱(트레이닝 · 암케어 · 메커니즘)을 쿠키에 적는다 — 트레이닝 홈이 이 앱 카드를 맨 위에 둔다
 * (training-home.tsx). 예전에는 [트레이닝 | 암케어 | 메커니즘] 고르개가 하던 일이다(2026-10-04 고르개를 홈으로 바꿈).
 * 누를 때가 아니라 앱이 떠 있을 때 적는다 — 다른 화면의 링크로 들어온 것도 '마지막으로 쓴 앱'이다.
 */
export function RememberTrainingApp({ part }: { part: TrainingPart }) {
  useEffect(() => {
    document.cookie = `${TRAINING_PART_COOKIE}=${part}; path=/; max-age=${REMEMBER_SECONDS}; samesite=lax`;
  }, [part]);
  return null;
}
