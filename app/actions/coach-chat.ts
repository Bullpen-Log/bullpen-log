'use server';

import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/dal';
import { prisma } from '@/lib/prisma';
import { appNow } from '@/lib/clock';
import { shiftDateKey } from '@/lib/pitch-stats';
import { coachPaid } from '@/lib/coach-access';
import { ageOn } from '@/lib/analysis-consent';
import { coachAiConsentFor, healthConsentFor } from '@/lib/analysis-consent-store';
import { COACH_AI_CONSENT, COACH_AI_PURPOSE } from '@/lib/coach/ai-consent';
import { AI_BLOCK_TEXT, AI_MIN_AGE, aiGate, capUsdOf, type AiGate } from '@/lib/coach/ai-gate';
import { costMicroOf } from '@/lib/coach/ai-price';
import { ageBandOf, contextBlock, type CoachAiContext } from '@/lib/coach/ai-prompt';
import { aiKeyReady, chatTurn, type ChatLine } from '@/lib/coach/ai';
import { sanitizeAdjusts, type CoachAdjust } from '@/lib/coach/adjust';
import { REASON_TEXT, WEEKDAY_LABELS, savedOf, slotLine } from '@/lib/coach/answers';
import { slotStateOf } from '@/lib/coach/status';
import { coachWeekBase } from '@/lib/coach/today';
import { loadTrainingDone } from '@/lib/training-week';
import { dbDate } from '@/lib/nutrition/days';

/**
 * 코치 AI 대화(docs/designs/ai-coach.md 10-6) — 앱 코치 탭의 대화 시트. 답 글 + 바꿀 거리(거른 것만) → 미리보기 · 적용은 조정 단추와 같은 길
 * (app/actions/coach.ts previewCoachAdjust · applyCoachAdjust). AI 가 저장 · 적용하지 않는다.
 * 막는 판정은 lib/coach/ai-gate.ts 하나(국외 이전 동의 · 만 14세 · 열쇠 · 월 상한 · 하루 30마디). 대화는 30일 둔다(크론이 지움).
 * 출시 전 베타에는 모듈째 잠긴다(lib/release-ops.ts 'coach-chat' = 'analysis').
 */

const KEEP_DAYS = 30;
const HISTORY_TURNS = 20;
const MAX_TEXT = 500;

type User = Awaited<ReturnType<typeof requireUser>>;

/** 한국 날짜의 시작 · 이번 달 시작(UTC 로) — 하루 30마디 · 월 상한 셈 */
function windowsOf(today: string) {
  return { dayStart: new Date(`${today}T00:00:00+09:00`), monthStart: new Date(`${today.slice(0, 8)}01T00:00:00+09:00`) };
}

async function gateFor(user: User, today: string): Promise<{ gate: AiGate; consented: boolean }> {
  const { dayStart, monthStart } = windowsOf(today);
  const [consent, month, todayChats] = await Promise.all([
    coachAiConsentFor(user.id),
    prisma.coachLog.aggregate({ where: { createdAt: { gte: monthStart } }, _sum: { costMicro: true } }),
    prisma.coachLog.count({ where: { userId: user.id, kind: 'chat', createdAt: { gte: dayStart } } }),
  ]);
  const gate = aiGate('chat', {
    consent: consent.valid,
    age: ageOn(user.birthDate, appNow()),
    hasKey: aiKeyReady(),
    capUsd: capUsdOf(process.env.COACH_AI_MONTHLY_USD),
    monthCostMicro: month._sum.costMicro ?? 0,
    todayChats,
  });
  return { gate, consented: consent.valid };
}

async function activeCoach(user: User): Promise<boolean> {
  if (!(await coachPaid(user))) return false;
  const p = await prisma.coachProfile.findUnique({ where: { userId: user.id }, select: { status: true } });
  return p?.status === 'active';
}

type ShownMessage = { id: string; role: 'user' | 'coach'; text: string; adjusts: CoachAdjust[] };

/** 대화 시트 — 동의했나 · 막힘 글 · 남은 마디 · 최근 대화(30일, 40마디) */
export async function loadCoachChat() {
  const user = await requireUser();
  if (!(await activeCoach(user))) return { ok: false as const, error: '코치를 시작한 뒤에 쓸 수 있어요.' };
  const { today } = await coachWeekBase(user.id);
  const [{ gate, consented }, rows] = await Promise.all([
    gateFor(user, today),
    prisma.coachMessage.findMany({
      where: { userId: user.id, createdAt: { gte: new Date(Date.now() - KEEP_DAYS * 86_400_000) } },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: { id: true, role: true, text: true, adjusts: true },
    }),
  ]);
  const messages: ShownMessage[] = rows.reverse().map((m) => ({
    id: m.id,
    role: m.role === 'user' ? 'user' : 'coach',
    text: m.text,
    adjusts: Array.isArray(m.adjusts) ? (m.adjusts as CoachAdjust[]) : [],
  }));
  return {
    ok: true as const,
    consented,
    consent: COACH_AI_CONSENT,
    block: gate.ok || gate.why === 'consent' ? null : AI_BLOCK_TEXT[gate.why],
    left: gate.ok ? gate.left : 0,
    messages,
  };
}

/** 국외 이전 동의(U43) — 코치 진행 중 · 만 14세 이상만 */
export async function agreeCoachAi(version: unknown): Promise<{ ok: true } | { error: string }> {
  const user = await requireUser();
  if (version !== COACH_AI_CONSENT.version) return { error: '동의 내용이 바뀌었어요. 다시 읽고 동의해 주세요.' };
  if (!(await activeCoach(user))) return { error: '코치를 시작한 뒤에 쓸 수 있어요.' };
  const age = ageOn(user.birthDate, appNow());
  if (age == null || age < AI_MIN_AGE) return { error: AI_BLOCK_TEXT.age };
  if ((await coachAiConsentFor(user.id)).valid) return { ok: true };
  await prisma.analysisConsent.create({ data: { userId: user.id, version: COACH_AI_CONSENT.version, source: 'first_use', purpose: COACH_AI_PURPOSE } });
  return { ok: true };
}

/** 'AI 끄기' — 동의를 거두고 대화 기록을 지운다. 코치는 그대로(규칙 · 정해진 문장) */
export async function revokeCoachAi(): Promise<{ ok: true }> {
  const user = await requireUser();
  await prisma.$transaction([
    prisma.analysisConsent.updateMany({ where: { userId: user.id, purpose: COACH_AI_PURPOSE, revokedAt: null }, data: { revokedAt: new Date() } }),
    prisma.coachMessage.deleteMany({ where: { userId: user.id } }),
  ]);
  return { ok: true };
}

/** 대화 지우기(전부) */
export async function clearCoachChat(): Promise<{ ok: true }> {
  const user = await requireUser();
  await prisma.coachMessage.deleteMany({ where: { userId: user.id } });
  return { ok: true };
}

/** 오늘 맥락 덩이 — 코드 · 숫자만(lib/coach/ai-prompt.ts). 오늘 신호는 건강 동의가 있을 때만 */
async function contextOf(user: User, base: Awaited<ReturnType<typeof coachWeekBase>>, age: number): Promise<string | null> {
  const { today, slots, locked } = base;
  if (!slots) return null;
  const weekStart = slots[0].date;
  const [done, profile, health, checkin] = await Promise.all([
    loadTrainingDone(user.id, weekStart, shiftDateKey(weekStart, 6)),
    prisma.coachProfile.findUnique({ where: { userId: user.id }, select: { answers: true } }),
    healthConsentFor(user.id),
    prisma.dailyCheckin.findFirst({
      where: { userId: user.id, date: dbDate(today) },
      select: { condition: true, sleepQuality: true, shoulder: true, elbow: true },
    }),
  ]);
  const saved = savedOf(profile?.answers);
  const outing = slots.find((s) => s.date >= today && (s.items.some((x) => x.kind === 'fixed' && x.what === 'game') || s.reasons.some((r) => r === 'outing' || r === 'outing-soft')));
  const daysTo = outing ? Math.round((Date.parse(`${outing.date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000) : null;
  const signals = !health.valid
    ? null
    : !checkin
      ? []
      : [
          `condition:${checkin.condition}`,
          ...(checkin.sleepQuality != null ? [`sleep:${checkin.sleepQuality}`] : []),
          ...(checkin.shoulder === '통증' ? ['pain:shoulder'] : []),
          ...(checkin.elbow === '통증' ? ['pain:elbow'] : []),
        ];
  const ctx: CoachAiContext = {
    today,
    ageBand: ageBandOf(age),
    role: saved.role ?? null,
    priority: saved.priority ?? null,
    nextOutingInDays: daysTo,
    signals,
    week: slots.map((s, i) => ({
      date: s.date,
      day: WEEKDAY_LABELS[i],
      plan: slotLine(s),
      reasons: s.reasons.map((r) => REASON_TEXT[r]),
      state: slotStateOf(s, done[s.date], today),
      locked: locked(s.date),
    })),
  };
  return contextBlock(ctx);
}

const FALLBACK = {
  refusal: '그 이야기는 도와드리기 어려워요. 이번 주 일정 이야기를 해 주세요.',
  other: '지금은 답하기 어려워요. 단추로는 계속 바꿀 수 있어요.',
};

/** 한 마디 — 판정 → 맥락 → AI → 비용 기록 → 바꿀 거리 거르기 → 두 마디 저장. 막히면 저장 없이 막힘 글 */
export async function sendCoachMessage(
  text: unknown
): Promise<{ ok: true; blocked: string } | { ok: true; reply: string; adjusts: CoachAdjust[]; left: number } | { error: string }> {
  const user = await requireUser();
  if (!(await activeCoach(user))) return { error: '코치를 시작한 뒤에 쓸 수 있어요.' };
  const said = typeof text === 'string' ? text.trim() : '';
  if (!said) return { error: '할 말을 적어 주세요.' };
  if (said.length > MAX_TEXT) return { error: `${MAX_TEXT}자 안으로 적어 주세요.` };
  const base = await coachWeekBase(user.id);
  const { gate } = await gateFor(user, base.today);
  if (!gate.ok) return { ok: true, blocked: AI_BLOCK_TEXT[gate.why] };
  const context = await contextOf(user, base, ageOn(user.birthDate, appNow()) ?? 20);
  if (!context || !base.slots) return { error: '이번 주 일정이 없어요.' };

  const history = await prisma.coachMessage.findMany({
    where: { userId: user.id, createdAt: { gte: new Date(Date.now() - KEEP_DAYS * 86_400_000) } },
    orderBy: { createdAt: 'desc' },
    take: HISTORY_TURNS,
    select: { role: true, text: true },
  });
  const lines: ChatLine[] = history.reverse().map((m) => ({ role: m.role === 'user' ? 'user' : 'coach', text: m.text }));
  const turn = await chatTurn(lines, context, said);
  await prisma.coachLog.create({
    data: {
      userId: user.id,
      kind: 'chat',
      model: turn.model,
      ok: turn.ok,
      ms: turn.ms,
      inTok: turn.usage.input_tokens ?? 0,
      outTok: turn.usage.output_tokens ?? 0,
      cacheTok: turn.usage.cache_read_input_tokens ?? 0,
      costMicro: costMicroOf(turn.model, turn.usage),
    },
  });
  const reply = turn.ok ? turn.reply : turn.why === 'refusal' ? FALLBACK.refusal : FALLBACK.other;
  const adjusts = turn.ok ? sanitizeAdjusts(turn.adjusts, base.slots, base.today, base.locked) : [];
  await prisma.coachMessage.createMany({
    data: [
      { userId: user.id, role: 'user', text: said },
      { userId: user.id, role: 'coach', text: reply, adjusts: adjusts.length ? adjusts : undefined },
    ],
  });
  revalidatePath('/coach');
  return { ok: true, reply, adjusts, left: Math.max(0, gate.left - 1) };
}
