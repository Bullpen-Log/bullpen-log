'use server';

import { getCurrentUser } from '@/lib/dal';
import { can } from '@/lib/permissions';
import { SHOOT_PLAN } from '@/lib/shoot/plan';
import { loadShootChecks, loadShootExercises, loadShootWeek } from '@/lib/shoot/load';
import {
  carriedOver,
  clockText,
  countOf,
  cursorOf,
  planItems,
  stateOf,
  weekItems,
} from '@/lib/shoot/progress';
import { weekLabel } from '@/lib/shoot/schedule';
import { crewsOf } from '@/lib/shoot/crews';

/**
 * 아이폰 앱의 촬영 관리자(native/src/app/admin/shoot/*) — 웹 app/(app)/admin/shoot 의 휴대폰 모양과 같은 자료(게이지 · 다음 촬영 · 주차 · 손볼 것,
 * 주차 시간표). 체크는 웹과 같은 shoot.setShootStatus. 촬영 모드(카메라 · 컷 편집)는 영상 엔진이 브라우저라 웹(/admin/shoot/<주>/run)에 둔다.
 * 관리자가 아니면 { ok:false, to }. /api/rpc/app-shoot.<함수> 로 부른다.
 */
async function admin() {
  const user = await getCurrentUser();
  if (!user) return { ok: false, to: '/login' } as const;
  if (!can(user.role, 'shoot')) return { ok: false, to: '/today' } as const;
  return user;
}

/** 촬영 관리자 첫 화면 — 웹 overview.tsx 의 휴대폰 부분 */
export async function loadAppShoot() {
  const a = await admin();
  if ('ok' in a) return a;
  const plan = SHOOT_PLAN;
  const items = planItems(plan);
  const [checkList, info] = await Promise.all([
    loadShootChecks(),
    loadShootExercises(
      items.map((i) => i.exerciseId),
      { withMedia: false }
    ),
  ]);
  const checks = new Map(checkList.map((c) => [c.exerciseId, c]));
  const all = countOf(items, checks);
  const uploaded = items.filter((i) => info.get(i.exerciseId)?.uploaded).length;
  const toUpload = items.filter((i) => stateOf(i, checks) === 'done' && !info.get(i.exerciseId)?.uploaded).length;
  const weekOfItem = new Map(plan.weeks.flatMap((w) => weekItems(w).map((it) => [it.exerciseId, w.week] as const)));
  const weeks = plan.weeks.map((w) => {
    /* 미룬 영상 칸은 다른 주에서 미룬 것까지 센다(progress.ts carriedOver) */
    const its = w.deferred ? [...weekItems(w), ...carriedOver(plan, w.week, checks)] : weekItems(w);
    const count = countOf(its, checks);
    const cur = cursorOf(w, checks);
    const total = its.length;
    const crews = crewsOf(w);
    /* 2026-10-18 사용자: 다 찍은 주는 '완료'. 미룬 영상 칸은 남은 수 */
    const state =
      total > 0 && count.done === total
        ? '완료'
        : w.deferred
          ? total > 0
            ? `미룸 ${total - count.done}개`
            : '비어 있음'
          : count.done + count.redo + count.later > 0
            ? '진행 중'
            : '예정';
    return {
      week: w.week,
      label: weekLabel(w),
      outdoor: !!w.outdoor,
      deferred: !!w.deferred,
      state,
      count,
      total,
      line: w.deferred
        ? '미룸으로 체크하면 여기로'
        : crews.length
          ? `${crews.join(' · ')} 동시 · 계획 ${clockText(w.end)}`
          : `계획 ${clockText(w.end)} · 자리 ${w.stations.length}곳`,
      current: cur.current ? { no: cur.current.no, title: cur.current.title } : null,
    };
  });
  /* 다음 촬영 — 실내 · 야외를 따로(야외는 날씨를 보고 고른다) */
  const nexts = (['실내', '야외'] as const)
    .map((label) => {
      const n = weeks.find((x) => x.outdoor === (label === '야외') && x.current);
      return n ? { label, week: n.week, weekLabel: n.label, done: n.count.done, total: n.total, current: n.current! } : null;
    })
    .filter((n) => n != null);
  const needs = items.filter((i) => {
    const st = stateOf(i, checks);
    return st === 'redo' || st === 'later';
  });
  /* 목록은 12개까지, 제목의 개수는 전부(웹 overview.tsx attention.length 와 같다) */
  const attentionTotal = needs.length;
  const attention = needs
    .slice(0, 12)
    .map((it) => {
      const c = checks.get(it.exerciseId)!;
      return { exerciseId: it.exerciseId, no: it.no, title: it.title, note: c.note, status: c.status, week: weekOfItem.get(it.exerciseId) ?? 1 };
    });
  const kind = (k: 'exercise' | 'drill' | 'warmup') => items.filter((i) => (i.kind ?? 'exercise') === k).length;
  const span = (ws: number[]) => (ws.length ? `${ws[0]}~${ws[ws.length - 1]}주` : '');
  const indoor = plan.weeks.filter((w) => !w.outdoor && !w.deferred).map((w) => w.week);
  const outdoor = plan.weeks.filter((w) => w.outdoor).map((w) => w.week);
  return {
    ok: true as const,
    description: `실내 ${span(indoor)} 운동 ${kind('exercise')}개 · 야외 ${span(outdoor)} 투구 드릴 ${kind('drill')}개와 워밍업 ${kind('warmup')}개를 우리 영상으로 찍어요. 주 1회 3시간 · ${plan.weeks.filter((w) => !w.deferred).length}주 계획.`,
    all,
    uploaded,
    toUpload,
    nexts,
    weeks,
    attention,
    attentionTotal,
  };
}

/** 주차 시간표 — 웹 [week]/page.tsx 의 loadShootWeek 그대로(계획 · 넘어온 것 · 운동 정보 · 체크 · 주차 목록) */
export async function loadAppShootWeek(n: unknown) {
  const a = await admin();
  if ('ok' in a) return a;
  const week = Number(n);
  const data = Number.isInteger(week) ? await loadShootWeek(week) : null;
  if (!data) return { ok: true as const, data: null };
  return { ok: true as const, data, me: a.nickname };
}
