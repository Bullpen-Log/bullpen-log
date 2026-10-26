import 'server-only';
import { openMechanicsAttempt } from '@/lib/mechanics/store';
import type { getCurrentUser } from '@/lib/dal';
import { loadMechanicsProgram, type SessionDrillView } from '@/lib/mechanics/load';
import { mechanicsLevel } from '@/lib/mechanics/levels';
import { playItemsFor, resumeAt } from '@/lib/mechanics/program';

/**
 * 메카닉 세션 따라 하기에 무엇을 띄울지 — 웹 화면(app/(session)/mechanics/play/page.tsx)과 아이폰 앱 화면(app/actions/app-mechanics.ts →
 * native/src/app/mechanics.tsx)이 같이 쓴다. 둘이 따로 고르면 아픈 날 접는 드릴 · 이어서 할 자리가 두 화면에서 달라진다.
 *
 * 열 수 없으면 갈 곳(to)을 돌려준다 — 웹은 그리로 redirect, 앱은 화면을 닫고 웹을 그리로 보낸다.
 * 'use server' 파일에 두지 않는다 — user 를 받는 함수가 거기 있으면 누구나 부를 수 있는 입구가 된다.
 */

export const MECHANICS_BACK = '/training?view=mechanics';

type PlayUser = NonNullable<Awaited<ReturnType<typeof getCurrentUser>>>;

/** 따라 하기 화면(MechanicsPlayer)이 받는 것 그대로 */
export type MechanicsPlay = {
  requirementsVersion: 1;
  backHref: string;
  items: SessionDrillView[];
  startAt: number;
  label: string;
  sessionNumber: number;
  attemptId: string;
  doneGuideIds: string[];
  isAdmin: boolean;
  partial: boolean;
  painLabel: string | null;
  /** 3D 리포트 처방 중이면 이번이 몇 번째 처방 세션인가 — 끝 화면 '처방 5 / 9 마쳤어요'. 아니면 null */
  focus: { number: number; total: number; label?: string } | null;
};

/**
 * 세션은 이 화면을 열 때 한 번 짜서 넘긴다 — 도중에 단계가 올라도 하던 차례가 바뀌지 않는다(서버 동작이 화면을 다시
 * 그리지 않는다, app/actions/mechanics.ts). 시작 때 고정한 배정과 해당 세션에 저장한 수행만 이어서 한다. 날짜별 체크는 다음 세션에 재사용하지 않는다.
 *
 * 어깨 · 팔꿈치가 아픈 날(2판 P6-5, 사용자 결정 D5 — lib/mechanics/program.ts playItemsFor): ?anyway=1 이 없으면 무브먼트
 * 드릴만, 그 '다른 드릴' · 도구도 무브먼트만 넘긴다. 접은 드릴이 있었으면 마쳐도 세션 수를 안 올린다(partial). 할 드릴이
 * 없으면 프로그램 칸으로 돌려보낸다(거기에 '그래도 하기'가 있다). ?anyway=1 이면 세션 그대로, 팔에 싣는 드릴마다 주의 한 줄.
 * 2판 P6 검토 — 오늘 팔을 다 쓴 날 · 통증 확인 전 · 성장기 통증 날도 접고(lib/mechanics/fold.ts mechanicsFoldOf), 그날은 ?anyway=1 을 무시한다.
 */
export async function loadMechanicsPlay(
  user: PlayUser,
  anywayParam: unknown
): Promise<({ ok: true } & MechanicsPlay) | { ok: false; to: string }> {
  const { program, session, painFold } = await loadMechanicsProgram(user.id);
  if (!program || session.length === 0) return { ok: false, to: MECHANICS_BACK };

  /*
   * 펼칠 수 있는 날만 ?anyway=1 을 받는다 — 팔을 다 쓴 날 · 통증 확인 전 · 성장기 통증 날은 주소에 붙여 와도 무브먼트만(2판 P6 검토,
   * lib/mechanics/fold.ts — 등판 보호 · 안전 층은 '그래도 하기'로 못 넘긴다).
   */
  const anyway = anywayParam === '1' && painFold?.canUnfold !== false;
  const savedAll = program.canFinalize;
  if (program.blockers.length > 0 && !savedAll) return { ok: false, to: MECHANICS_BACK };
  if (!savedAll && playItemsFor(session, painFold, anyway).items.length === 0) return { ok: false, to: MECHANICS_BACK };
  const attempt = await openMechanicsAttempt(user.id, program.planKey, session);
  if (!attempt) return { ok: false, to: MECHANICS_BACK };
  const required = attempt.items.filter((item) => item.required !== false);
  const allRecorded =
    required.length > 0 && required.every((item) => item.alternatives.some((a) => a.variants.some((v) => attempt.doneIds.includes(v.id))));
  // 이미 수행한 세션의 완료 응답만 잃은 경우, 부하 제한 중에도 완료 확인은 열어 준다.
  const { items, partial } = allRecorded ? { items: attempt.items, partial: false } : playItemsFor(attempt.items, painFold, anyway);
  if (items.length === 0) return { ok: false, to: MECHANICS_BACK };

  const done = new Set(attempt.doneIds);
  for (const item of items) {
    if (item.alternatives.some((a) => a.variants.some((v) => done.has(v.id)))) done.add(item.guideId);
  }

  return {
    ok: true,
    requirementsVersion: 1,
    backHref: MECHANICS_BACK,
    items,
    startAt: resumeAt(items, done),
    label:
      program.focus && !program.focus.finished
        ? program.focus.skill
          ? `${program.focus.stage} 연습 ${program.focus.done + 1}회`
          : `처방 ${program.focus.done + 1}/${program.focus.total}`
        : program.level && program.week
          ? `${mechanicsLevel(program.level).name} ${program.index + 1}번 세션`
          : `${program.sessionsDone + 1}번째 세션`,
    sessionNumber: attempt.session,
    attemptId: attempt.id,
    doneGuideIds: [...done],
    isAdmin: user.role === 'ADMIN',
    partial,
    painLabel: painFold && anyway ? painFold.label : null,
    focus:
      program.focus && !program.focus.finished
        ? {
            number: program.focus.done + 1,
            total: program.focus.total,
            ...(program.focus.skill ? { label: `${program.focus.stage} 연습` } : {}),
          }
        : null,
  };
}
