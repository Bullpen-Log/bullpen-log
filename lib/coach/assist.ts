import 'server-only';
import { prisma } from '@/lib/prisma';
import { appNow } from '@/lib/clock';
import { toDateKey } from '@/lib/pitch-stats';
import { dbDate, keyOfDbDate } from '@/lib/nutrition/days';
import { visibleExercises, visibleGuides } from '@/lib/library-cache';
import { activeProgram } from '@/lib/program/load';
import { parseProgram } from '@/lib/program/program';
import { decideAccess } from '@/lib/release-access';
import { isFeatureLocked, releaseStage } from '@/lib/release-gate';
import {
  ASSIST_TOOLS,
  armcareCard,
  assistCapOf,
  byName,
  calendarCard,
  favoriteCard,
  nextEquipment,
  parseToolInput,
  postCard,
  programCard,
  settingsCard,
  throwPlanCard,
  type Proposed,
} from '@/lib/coach/tool-defs';
import { deleteCalendarEvent, saveCalendarEvent } from '@/app/actions/calendar-event';
import { setThrowPlan } from '@/app/actions/day-cards';
import { setDrillFavorite, setExerciseFavorite } from '@/app/actions/favorite';
import { saveAppOwnedEquipment, saveAppTrainingLevel } from '@/app/actions/training-setup';
import { makeArmcareRoutine } from '@/app/actions/armcare';
import { skipProgramDay, stopProgram } from '@/app/actions/program';

/**
 * 비서 쓰기(개인 비서 4단계, 2026-11-20 김민: "모든 부분에서 액세스와 컨트롤") — 달력 · 등판 답 · 즐겨찾기 · 트레이닝 설정 · 암케어 ·
 * 근력 프로그램 · 덕아웃 글 초안. 코치는 카드만 만든다: 확인(DB 를 보고) → 카드 → 사용자가 누르면 실행(그때 다시 확인).
 * 실행은 앱 화면이 부르는 서버 동작 그대로(같은 규칙 · 같은 거름). 남에게 가는 것(덕아웃 글)은 초안만, 지우기 · 그만두기는 앱이 한 번 더 묻는다.
 * 결제 · 계정 · 관리 · 남의 기록 · 숨은 기능 · 진단은 도구가 없다.
 */

type Who = { id: string; role: string | null | undefined; pilot?: boolean };
type Result = { ok: true } | { error: string };

export { ASSIST_TOOLS };

const allowed = (who: Who, tool: string, args: Record<string, unknown>) => decideAccess(who, assistCapOf(tool, args), { stage: releaseStage() }).allowed;

const checkedInOn = async (userId: string, day: string) => !!(await prisma.dailyCheckin.findFirst({ where: { userId, date: dbDate(day) }, select: { id: true } }));

/** 카드 확인 — 쓸 수 없는 기능이면 까닭을 돌려준다(코치가 그 까닭으로 답한다) */
export async function proposeAssist(who: Who, today: string, tool: string, raw: unknown): Promise<Proposed> {
  const input = parseToolInput(tool, raw);
  if (!input) return { refuse: '입력 모양이 틀렸어요.' };
  if (!allowed(who, tool, input)) return { refuse: '이 사람은 지금 그 기능을 쓸 수 없어요.' };
  switch (tool) {
    case 'calendar': {
      const rows =
        input.kind === 'add'
          ? []
          : (await prisma.calendarEvent.findMany({ where: { userId: who.id, date: dbDate(String(input.date)) }, select: { id: true, date: true, title: true, time: true } })).map((r) => ({
              ...r,
              date: keyOfDbDate(r.date),
            }));
      return calendarCard(input, today, rows);
    }
    case 'throw_plan':
      return throwPlanCard(input.answer, await checkedInOn(who.id, today));
    case 'favorite': {
      const drill = input.kind === '드릴';
      const list: { id: string; title: string }[] = drill ? await visibleGuides() : await visibleExercises();
      const found = byName(list, String(input.name));
      const already = !found
        ? false
        : drill
          ? !!(await prisma.userDrillFavorite.findFirst({ where: { userId: who.id, guideId: found.id }, select: { userId: true } }))
          : !!(await prisma.userExerciseFavorite.findFirst({ where: { userId: who.id, exerciseId: found.id }, select: { userId: true } }));
      return favoriteCard(drill ? '드릴' : '운동', found, input.on === true, already);
    }
    case 'training_settings': {
      const u = await prisma.user.findUnique({ where: { id: who.id }, select: { trainingLevel: true, ownedEquipment: true } });
      return settingsCard(input.kind as 'level', String(input.value), u?.trainingLevel ?? null, u?.ownedEquipment ?? []);
    }
    case 'armcare_today':
      return armcareCard(await checkedInOn(who.id, today));
    case 'program_day': {
      const row = await activeProgram(who.id);
      return programCard(input.kind as 'skip', row ? { name: parseProgram(row.programKey)?.def.name ?? '근력 프로그램', nextDay: row.nextDay } : null);
    }
    case 'draft_post':
      return postCard(input);
  }
  return { refuse: '모르는 도구예요.' };
}

/** 카드 실행 — 사용자가 누를 때(그날에만 맞는 카드는 applyCoachCard 가 먼저 가린다) */
export async function applyAssist(who: Who, tool: string, args: Record<string, unknown>): Promise<Result> {
  if (!ASSIST_TOOLS.has(tool)) return { error: '이 카드는 실행할 수 없어요.' };
  if (!allowed(who, tool, args)) return { error: '지금은 쓸 수 없는 기능이에요.' };
  const today = toDateKey(appNow());
  try {
    return norm(await run(who.id, tool, args, today));
  } catch (e) {
    if (isFeatureLocked(e)) return { error: '지금은 쓸 수 없는 기능이에요.' };
    throw e;
  }
}

/** 서버 동작들의 결과 모양(ok · error · favorite …)을 하나로 */
function norm(r: unknown): Result {
  const e = r && typeof r === 'object' ? (r as { error?: unknown }).error : null;
  return typeof e === 'string' && e ? { error: e } : { ok: true };
}

async function run(userId: string, tool: string, a: Record<string, unknown>, today: string): Promise<unknown> {
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  switch (tool) {
    case 'calendar': {
      if (a.kind === 'delete') return deleteCalendarEvent(str(a.id));
      if (str(a.date) < today) return { error: '지난 날이에요. 다시 말해 주세요.' };
      const input = { date: str(a.date), title: str(a.title), time: typeof a.time === 'string' ? a.time : null };
      if (a.kind === 'add') return saveCalendarEvent(null, input);
      /* 바꾸기는 메모 · 알림을 그대로 둔다(저장은 칸 전체를 쓴다) */
      const row = await prisma.calendarEvent.findFirst({ where: { id: str(a.id), userId }, select: { memo: true, remindMin: true } });
      if (!row) return { error: '그 일정을 찾지 못했어요. 달력에서 지웠는지 봐 주세요.' };
      return saveCalendarEvent(str(a.id), { ...input, memo: row.memo, remindMin: row.remindMin });
    }
    case 'throw_plan':
      return setThrowPlan({ date: today, plan: str(a.answer) });
    case 'favorite':
      return a.kind === '드릴' ? setDrillFavorite(str(a.id), a.on === true) : setExerciseFavorite(str(a.id), a.on === true);
    case 'training_settings': {
      if (a.kind === 'level') return saveAppTrainingLevel(a.value);
      const u = await prisma.user.findUnique({ where: { id: userId }, select: { ownedEquipment: true } });
      if (!u?.ownedEquipment.length) return { error: '가진 장비를 트레이닝 설정에서 먼저 골라 주세요.' };
      return saveAppOwnedEquipment(nextEquipment(u.ownedEquipment, a.kind as 'add_equipment', str(a.value)));
    }
    case 'armcare_today':
      return makeArmcareRoutine();
    case 'program_day':
      return a.kind === 'stop' ? stopProgram() : skipProgramDay({ day: typeof a.day === 'number' ? a.day : -1 });
  }
  return { error: '이 카드는 실행할 수 없어요.' };
}
