'use client';

import {
  addTransitionType,
  startTransition,
  useEffect,
  useLayoutEffect,
  useState,
} from 'react';
import { markTutorialDone } from '@/app/actions/onboarding-state';
import type { FeatureKey } from '@/lib/feature-locks';
import { QUIET_REFRESH } from '@/lib/transition-types';
import { TutorialDialog, readyToShow, type TutorialSlide } from './tutorial-dialog';
import { holdTour } from './tour-gate';
import { nutritionSlides, pitchSlides, trainingSlides } from './slides';

/**
 * 탭 튜토리얼 — 투구 기록 · 트레이닝 · 영양의 첫 설정을 마친 직후, 그 탭에서 한 번 뜬다(lib/feature-locks.ts).
 *
 * 서버 페이지가 열지 정한다:
 *   <TabTutorial tutorialKey="pitch" open={!locks.pitch && !hasSeenTutorial(user, 'pitch')} />
 * 닫히면 계정에 봤다고 적는다(markTutorialDone). 액션이 틀까지 새로 읽어(revalidatePath('/', 'layout')) 응답에 새 화면을
 * 실어 오므로 그것으로 open 이 꺼진다 — 따로 새로 받지 않는다(예전에는 quietRefresh 를 또 불러 같은 화면을 두 번 받았다).
 * 그 사이 다시 뜨지 않게 '여기서 닫았다'를 들고 있는다.
 *
 * 처음 그릴 때 곧바로 열지 않는다 — 시작 연출이 도는 중이면 걷힌 뒤, 돌던 화면 전환(첫 설정에서 탭으로 밀려 들어오는
 * 이동)이 끝난 뒤, 그다음 그림 두 장 뒤에(tutorial-dialog.tsx 의 readyToShow).
 *
 * 열기로 정해진 동안 기본 투어와 같은 표시(<html data-tour>, tour-gate.tsx 의 holdTour)를 붙든다. 탭 화면을 새로
 * 불러오면(오늘 체크인 전) 체크인 관문도 뜨려 하는데, 둘 다 맨 위 칸의 창이라 관문이 나중에 열려 튜토리얼을 덮었다 — 관문은
 * 이 표시가 풀리기를 기다린다. 첫 설정을 마치고 넘어오는 보통 길에서는 관문이 이미 닫혀 있어 아무 일도 없다.
 */

/** 탭 튜토리얼의 열쇠 — 잠글 수 있는 기능과 같다(lib/feature-locks.ts 의 FeatureKey) */
export type TabTutorialKey = FeatureKey;

const LABELS: Record<TabTutorialKey, string> = {
  pitch: '투구 기록 · 처음 안내',
  training: '트레이닝 · 처음 안내',
  nutrition: '영양 · 처음 안내',
};

const SLIDES: Record<TabTutorialKey, TutorialSlide[]> = {
  pitch: pitchSlides,
  training: trainingSlides,
  nutrition: nutritionSlides,
};

export function TabTutorial({
  tutorialKey,
  open,
}: {
  tutorialKey: TabTutorialKey;
  open: boolean;
}) {
  /* 창이 실제로 떠 있나 — open 이 켜진 뒤 연출 · 화면 전환 · 그림 두 장을 기다렸다 켠다 */
  const [shown, setShown] = useState(false);
  /* 이 화면에서 닫았다 — 서버가 '봤다'를 돌려주기 전에도 다시 안 뜨게. Esc 로 닫은 것도 이번 화면에서는 다시 안 뜬다 */
  const [closed, setClosed] = useState(false);
  /* 서버가 open 을 끄면 되돌린다 — 열쇠를 다시 지워(resetTutorial) 켜질 때를 위해(그리는 도중 상태 보정) */
  if (!open && closed) setClosed(false);
  const pending = open && !closed;
  /* 열 일이 없어졌으면(다른 기기에서 보고 와 서버가 끔) 창도 내린다 */
  if (!pending && shown) setShown(false);

  /* 표시는 그리자마자(layout) — 관문의 효과보다 먼저. 떠나거나 닫히면 푼다 */
  useLayoutEffect(() => {
    if (!pending) return;
    return holdTour();
  }, [pending]);

  useEffect(() => {
    if (!pending) return;
    let cancelled = false;
    readyToShow().then(() => {
      if (!cancelled) setShown(true);
    });
    return () => {
      cancelled = true;
    };
  }, [pending]);

  const close = (done: boolean) => {
    setShown(false);
    setClosed(true);
    /* Esc 는 적지 않는다 — 다음에 이 탭에 들어오면 다시 뜬다 */
    if (!done) return;
    /* 액션 응답에 실려 오는 새 화면으로 바뀌는 전환에 '조용히' 표시 — 본문(app-main)이 한 번 옅어지지 않게(lib/quiet-refresh.ts) */
    startTransition(async () => {
      addTransitionType(QUIET_REFRESH);
      await markTutorialDone(tutorialKey).catch(() => undefined);
    });
  };

  return (
    <TutorialDialog
      open={shown}
      label={LABELS[tutorialKey]}
      slides={SLIDES[tutorialKey]}
      onClose={close}
    />
  );
}
