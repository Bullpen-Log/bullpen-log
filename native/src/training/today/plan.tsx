import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { NO_WORKOUT_KIND, WORKOUT_KINDS } from '@/lib/checkin';
import { findFocus, focusesFor, goalForUnchosen } from '@/lib/report/personalize';
import { formatAmount } from '@/lib/exercise-meta';
import { formatSummary, volumeIn } from '@/lib/workout/summarize';
import type { OutingLineText } from '@/lib/outing-line';
import type { WeightUnit } from '@/lib/units';
import { STATE_NOTICE_TEXT, moreText, type StateNotice } from '@/lib/report/state-notice';
import type { TodayGroup, TodayMake, TodayPlan, TodayRow, TrainingToday } from '@/lib/report/training-today-data';
import { ExerciseMedia } from '~/armcare/parts';
import { act } from '~/mechanics/parts';
import { withAlpha, type Palette } from '~/lib/ui';
import { EffortGuide, Sheet } from '~/workout/sheets';
import { trainingEffortLevel } from '@/lib/training-effort';
import { SwipeRow } from '~/shell/swipe-row';
import { AddSheet, PlanForm } from './forms';
import { BigButton, Card, Chip, LinkRow, s, useWeightUnit, type TodayActions } from './parts';

/**
 * 트레이닝 '운동' 화면의 일정 쪽 조각 — 웹 app/(app)/training/ 의 state-notice-band · done-card · exercise-list · training-note ·
 * training-prefs-card · components/outing-line.tsx 를 옮겼다. 만들기 폼 · 운동 추가 창은 ./forms. 서버 동작은 웹과 같은 것을 부른다.
 */

const tick = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

/** '2026-08-24' → '8/24' */
const shortDate = (key: string) => {
  const [, m, d] = key.split('-');
  return `${Number(m)}/${Number(d)}`;
};

/* ----------------------------- 상태 바뀜 띠 ----------------------------- */

/** 일정을 만든 뒤 판단 입력이 바뀌었을 때(웹 StateNoticeBand) — 다시 만들기는 만들 때 고른 조건 그대로 */
export function NoticeBand({ notice, fields, c, a }: { notice: StateNotice; fields: [string, string][]; c: Palette; a: TodayActions }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Card c={c} tone="warn">
      <View style={[s.row, { alignItems: 'flex-start' }]}>
        <SymbolView name="arrow.clockwise" size={15} tintColor={c.warn} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[s.bodyBold, { color: c.warn }]}>{STATE_NOTICE_TEXT.title}</Text>
          {[...notice.lines, ...(notice.more > 0 ? [moreText(notice.more)] : [])].map((line, i) => (
            <Text key={i} style={[s.small, { color: c.warn }]}>
              · {line}
            </Text>
          ))}
          {notice.note ? <Text style={[s.small, { color: c.warn }]}>{notice.note}</Text> : null}
        </View>
      </View>
      {notice.canRemake ? (
        <BigButton
          c={c}
          busy={busy}
          label={busy ? STATE_NOTICE_TEXT.remaking : STATE_NOTICE_TEXT.remake}
          onPress={() => {
            setBusy(true);
            setError(null);
            void a.generate(fields).then((err) => {
              setBusy(false);
              setError(err);
            });
          }}
        />
      ) : notice.blockedBy === 'checkin' ? (
        <LinkRow c={c} label={STATE_NOTICE_TEXT.checkinButton} onPress={a.checkin} />
      ) : null}
      {error ? <Text style={[s.small, { color: c.danger }]}>{error}</Text> : null}
    </Card>
  );
}

/* ----------------------------- 완료 카드 ----------------------------- */

/** 운동을 마친 날 [운동 시작] 자리(웹 DoneCard) — 종료 요약과 같은 세 숫자 · 같은 줄 */
export function DoneView({ done, intensity, canResume, c, a }: {
  done: NonNullable<TrainingToday['done']>;
  intensity: number | null;
  canResume: boolean;
  c: Palette;
  a: TodayActions;
}) {
  const unit = useWeightUnit();
  return (
    <Card c={c} tone="done">
      <View style={s.between}>
        <View style={s.row}>
          <SymbolView name="checkmark.circle.fill" size={18} tintColor={c.sky} />
          <Text style={[s.cardTitle, { color: c.sky }]}>오늘 운동 완료</Text>
        </View>
        {intensity != null ? <Text style={[s.smallBold, { color: c.sky }]}>강도 {intensity}/10</Text> : null}
      </View>
      <View style={[s.row, { gap: 8 }]}>
        {[
          { label: '운동 시간', value: `${done.minutes}`, unit: '분' },
          { label: '총 세트', value: `${done.sets}`, unit: '세트' },
          {
            label: '총 볼륨',
            value: done.volumeKg > 0 ? volumeIn(done.volumeKg, unit).toLocaleString('ko-KR') : '—',
            unit: done.volumeKg > 0 ? unit : '',
          },
        ].map((n) => (
          <View key={n.label} style={[st.stat, { backgroundColor: c.page }]}>
            <Text style={[s.tiny, { color: c.muted }]}>{n.label}</Text>
            <Text style={[st.statValue, { color: c.ink }]}>
              {n.value}
              <Text style={[s.tiny, { color: c.muted }]}> {n.unit}</Text>
            </Text>
          </View>
        ))}
      </View>
      {done.lines.length > 0 ? (
        <View style={[s.box, { backgroundColor: c.page, paddingVertical: 2 }]}>
          {done.lines.map((l, i) => (
            <View key={l.id} style={[st.line, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
              <Text numberOfLines={1} style={[s.smallBold, { flex: 1, color: c.ink }]}>
                {l.title}
              </Text>
              <Text style={[s.tiny, s.num, { color: c.muted }]}>{formatSummary(l.summary, unit)}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={[s.small, { color: c.muted, textAlign: 'center' }]}>남긴 세트 없이 마쳤어요.</Text>
      )}
      {canResume ? (
        <Pressable accessibilityRole="button" disabled={a.starting} onPress={() => a.start(false)} style={[s.pill, a.starting && { opacity: 0.6 }]}>
          <Text style={[s.bodyBold, { color: c.sky }]}>운동 더 하기</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

/* ----------------------------- 한 줄들 ----------------------------- */

/** 다음 등판 한 줄(웹 OutingLine) — 짐작이면 '바꾸기'가 체크인을 연다 */
export function OutingRow({ line, c, a }: { line: OutingLineText; c: Palette; a: TodayActions }) {
  return (
    <View style={[st.lineCard, { backgroundColor: c.card, boxShadow: c.float }]}>
      <SymbolView name="calendar.badge.clock" size={16} tintColor={c.sky} />
      <View style={{ flex: 1 }}>
        <Text style={[s.bodyBold, { color: c.ink }]}>{line.main}</Text>
        {line.guess ? <Text style={[s.tiny, { color: c.muted }]}>{line.guess}</Text> : null}
      </View>
      {line.guess ? (
        <Pressable accessibilityRole="button" onPress={a.checkin} style={st.lineBtn}>
          <Text style={[s.bodyBold, { color: c.sky }]}>바꾸기</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** 처방을 멈춘 날(웹 멈춤 카드) — 할 일은 체크인 */
export function HaltedCard({ reason, c, a }: { reason: string; c: Palette; a: TodayActions }) {
  return (
    <Card c={c} tone="warn">
      <Text style={[s.bodyBold, { color: c.warn }]}>오늘은 운동을 처방하지 않았어요</Text>
      <Text style={[s.body, { color: c.warn }]}>{reason}</Text>
      <LinkRow c={c} label="오늘 체크인 남기기" onPress={a.checkin} />
    </Card>
  );
}

/* ----------------------------- 오늘 하고 싶은 운동 ----------------------------- */

/**
 * '오늘 하고 싶은 운동이 있나요?'(웹 TrainingPrefsCard) — 접힌 한 줄에서 시작, 고르면 일정 만들기가 그쪽으로 짠다. 종류와 '오늘 할 부위'
 * (2026-10-20 — 만들기 폼의 '직접 고르기'를 빼고 그 부위 고르기를 여기로, 몸 부위 여러 개 고르기는 뺐다). 부위는 preferredParts 맨 앞의 열쇠로 온다.
 */
export function PrefsCard({ prefs, today, c, a }: { prefs: NonNullable<TrainingToday['prefs']>; today: string; c: Palette; a: TodayActions }) {
  const answer = prefs.answer;
  const saved = answer?.parts.map(findFocus).find((f) => f != null) ?? null;
  const [open, setOpen] = useState(false);
  const [workout, setWorkout] = useState<string | null>(answer?.workout ?? null);
  const [focus, setFocus] = useState<string | null>(saved?.key ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const summary = answer ? [answer.workout ?? NO_WORKOUT_KIND, ...(saved ? [saved.label] : [])].join(' · ') : null;
  /* 고른 종류의 목표에 있는 부위만(회복은 부위 없음) — 종류를 바꿔 목록에 없게 된 부위는 안 보낸다 */
  const focuses = workout === '회복' ? [] : focusesFor(goalForUnchosen(workout));
  const pickedFocus = focuses.some((f) => f.key === focus) ? focus : null;

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await act<{ ok: true }>('day-cards.saveTrainingPrefs', { date: today, workout, parts: [], focus: pickedFocus });
    setBusy(false);
    if ('error' in r) return setError(r.error);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setOpen(false);
    await a.reload();
  };

  /* 접힌 알약(웹 DayCard folded) — 답이 없으면 질문 · '답하기', 있으면 '오늘 설정 · 답' */
  if (!open)
    return (
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [st.prefsPill, { backgroundColor: withAlpha(c.ink, pressed ? 0.1 : 0.06) }]}
      >
        <Text numberOfLines={1} style={[s.tiny, { color: c.muted, fontWeight: '600', flexShrink: 1 }]}>
          {summary == null ? '오늘 하고 싶은 운동이 있나요?' : '오늘 설정'}
        </Text>
        <Text numberOfLines={1} style={[s.tiny, { color: summary == null ? c.sky : c.ink, flexShrink: 1 }]}>
          {summary ?? '답하기'}
        </Text>
        <SymbolView name="pencil" size={13} tintColor={c.muted} />
      </Pressable>
    );

  return (
    <View style={[st.prefsPanel, { backgroundColor: withAlpha(c.skyTint, 0.6), borderColor: withAlpha(c.sky, 0.25) }]}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[s.bodyBold, { color: c.ink }]}>오늘 하고 싶은 운동이 있나요?</Text>
          <Text style={[s.tiny, { color: c.muted }]}>고르면 그쪽으로 일정을 짜요. 아픈 날은 고른 것과 상관없이 회복으로 가요.</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => setOpen(false)} style={st.prefsFold}>
          <Text style={[s.tiny, { color: c.muted, fontWeight: '500' }]}>접기</Text>
        </Pressable>
      </View>
      <View style={{ gap: 10 }}>
        <View style={s.chips}>
          <Chip c={c} label={NO_WORKOUT_KIND} on={workout == null} onPress={() => setWorkout(null)} />
          {WORKOUT_KINDS.map((k) => (
            <Chip key={k.name} c={c} label={k.name} on={workout === k.name} onPress={() => setWorkout(k.name)} />
          ))}
        </View>
        <Text style={[s.tiny, { color: c.muted }]}>
          {WORKOUT_KINDS.find((k) => k.name === workout)?.desc ?? '앱이 투구량과 몸 상태를 보고 골라요.'}
        </Text>
        {focuses.length > 0 ? (
          <>
            <Text style={[s.smallBold, { color: c.muted }]}>오늘 할 부위 (안 고르면 상체 · 하체를 번갈아 골라요)</Text>
            <View style={s.chips}>
              {focuses.map((f) => (
                <Chip
                  key={f.key}
                  c={c}
                  label={f.desc ? `${f.label} · ${f.desc}` : f.label}
                  on={pickedFocus === f.key}
                  /* 다시 누르면 비운다 — 앱이 상체 · 하체를 번갈아 정한다 */
                  onPress={() => setFocus(pickedFocus === f.key ? null : f.key)}
                />
              ))}
            </View>
          </>
        ) : null}
        {error ? <Text style={[s.small, { color: c.danger }]}>{error}</Text> : null}
        <BigButton c={c} busy={busy} label={busy ? '저장 중…' : '이대로 할래요'} onPress={() => void save()} />
      </View>
    </View>
  );
}

/* ----------------------------- 일정 만들기 ----------------------------- */

/**
 * 아직 안 만든 날 · 남은 운동이 없는 날(웹 PlanForm — 자동 맞춤). '오늘 하고 싶은 운동' 카드는 웹처럼 이 카드 안, 폼 바로 위에 접힌 알약으로 —
 * 고른 답이 이 폼이 짜는 일정에 들어간다(웹 training-page planBlock).
 */
export function MakeCard({
  make,
  head,
  note,
  prefs,
  today,
  c,
  a,
}: {
  make: TodayMake;
  head: string;
  note: string | null;
  prefs: TrainingToday['prefs'];
  today: string;
  c: Palette;
  a: TodayActions;
}) {
  return (
    <Card c={c}>
      <Text style={[s.cardTitle, { color: c.ink }]}>{head}</Text>
      {note ? <Text style={[s.body, { color: c.muted }]}>{note}</Text> : null}
      {prefs ? <PrefsCard prefs={prefs} today={today} c={c} a={a} /> : null}
      <PlanForm make={make} generated={false} c={c} a={a} />
    </Card>
  );
}

/* ----------------------------- 일정 카드 · 목록 · 메모 ----------------------------- */

type Local = { done: Record<string, boolean>; fav: Record<string, boolean>; gone: string[] };
const EMPTY: Local = { done: {}, fav: {}, gone: [] };

/**
 * 만든 날 — 일정 머리(목표 · 까닭) · 체크 목록 · 오늘 운동 메모(웹 training-page 의 일정 갈래). 체크 · 별 · 빼기는 화면을 먼저 바꾸고 서버에
 * 보낸다(웹 exercise-list 와 같은 길 — 실패하면 서버가 마지막으로 확인해 준 값으로 되돌림). 빼기 · 메모 뒤에는 화면을 다시 읽는다(시간 · 개수가 바뀐다).
 */
export function PlanBody({
  plan,
  make,
  data,
  c,
  a,
}: {
  plan: TodayPlan;
  /** '조건 바꿔 다시 만들기' 폼의 재료 */
  make: TodayMake;
  data: TrainingToday;
  c: Palette;
  a: TodayActions;
}) {
  const [remake, setRemake] = useState(false);
  const [adding, setAdding] = useState(false);
  const [local, setLocal] = useState<Local>(EMPTY);
  /* 새로 받은 목록이면 화면에서만 바꾼 것을 걷는다 — 서버 값이 이긴다(웹 seen 과 같다) */
  const [seen, setSeen] = useState(plan.groups);
  if (seen !== plan.groups) {
    setSeen(plan.groups);
    setLocal(EMPTY);
  }
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(new Set<string>());
  const [listOpen, setListOpen] = useState(false);
  const unit = useWeightUnit();

  const groups: TodayGroup[] = plan.groups
    .map((g) => ({
      ...g,
      items: g.items
        .filter((r) => !local.gone.includes(r.id))
        .map((r) => ({ ...r, done: local.done[r.id] ?? r.done, favorite: local.fav[r.id] ?? r.favorite })),
    }))
    .filter((g) => g.items.length > 0);
  const all = groups.flatMap((g) => g.items);
  const doneCount = all.filter((r) => r.done).length;

  const toggle = async (r: TodayRow) => {
    if (pending.current.has(r.id)) return;
    pending.current.add(r.id);
    tick();
    const next = !r.done;
    setError(null);
    setLocal((l) => ({ ...l, done: { ...l.done, [r.id]: next } }));
    const res = await act<{ ok: true }>('exercise-log.setExerciseDone', r.id, next, data.today);
    pending.current.delete(r.id);
    if ('error' in res) {
      setLocal((l) => ({ ...l, done: { ...l.done, [r.id]: !next } }));
      setError(res.error);
    }
  };
  const star = async (r: TodayRow) => {
    tick();
    setLocal((l) => ({ ...l, fav: { ...l.fav, [r.id]: !r.favorite } }));
    const res = await act<{ favorite: boolean }>('favorite.toggleExerciseFavorite', r.id);
    if ('error' in res) {
      setLocal((l) => ({ ...l, fav: { ...l.fav, [r.id]: r.favorite } }));
      setError(res.error);
    } else setLocal((l) => ({ ...l, fav: { ...l.fav, [r.id]: res.favorite } }));
  };
  /* 웹처럼 밀어서 [빼기]를 누르면 바로 뺀다(묻지 않음) — 실패하면 되돌리고 알린다 */
  const remove = async (r: TodayRow) => {
    setError(null);
    setLocal((l) => ({ ...l, gone: [...l.gone, r.id] }));
    const res = await act<{ ok: true }>('plan-edit.removeFromTodayPlan', r.id);
    if ('error' in res) {
      setLocal((l) => ({ ...l, gone: l.gone.filter((x) => x !== r.id) }));
      return setError(res.error);
    }
    await a.reload();
  };

  const list = (
    <View style={{ gap: 12 }}>
      <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float }]}>
        <View style={s.between}>
          <Text style={[s.bodyBold, { color: c.ink }]}>
            오늘 <Text style={[s.num, { fontSize: 18 }]}>{doneCount}</Text>
            <Text style={{ color: c.muted }}>/{all.length}</Text> 완료
          </Text>
          {all.length > 0 && doneCount === all.length ? <Text style={[s.bodyBold, { color: c.sky }]}>전부 마쳤어요</Text> : null}
        </View>
        <View style={[s.bar, { backgroundColor: c.line }]}>
          <View style={{ width: `${all.length ? (doneCount / all.length) * 100 : 0}%`, backgroundColor: c.sky, borderRadius: 4 }} />
        </View>
        {doneCount === 0 && all.length > 0 ? (
          <Text style={[s.tiny, { color: c.muted }]}>마친 운동을 눌러 표시해 주세요. 운동 부하와 다음 일정에 들어가요.</Text>
        ) : null}
      </View>
      {error ? <Text style={[s.small, { color: c.danger }]}>{error}</Text> : null}
      {groups.map((g) => (
        <View key={g.slot} style={{ gap: 8 }}>
          <Text style={[s.bodyBold, { color: c.ink, paddingHorizontal: 4 }]}>
            {g.label} <Text style={[s.tiny, { color: c.muted }]}>{g.hint}</Text>
          </Text>
          {g.items.map((r) => (
            <ExerciseRow key={r.id} r={r} unit={unit} c={c} onToggle={() => void toggle(r)} onStar={() => void star(r)} onRemove={() => void remove(r)} />
          ))}
        </View>
      ))}
      {/* 더하는 것은 목록 끝에서 찾아서(웹 AddExercise 와 같은 자리) */}
      <Pressable
        accessibilityRole="button"
        onPress={() => setAdding(true)}
        style={({ pressed }) => [st.add, { backgroundColor: `${c.sky}14` }, pressed && { opacity: 0.6 }]}
      >
        <SymbolView name="plus" size={15} tintColor={c.sky} />
        <Text style={[s.bodyBold, { color: c.sky }]}>운동 추가</Text>
      </Pressable>
    </View>
  );

  return (
    <>
      <Card c={c}>
        <View style={s.between}>
          <Text style={[s.title, { color: c.ink, flex: 1 }]}>{plan.title}</Text>
          <Text style={[s.small, { color: c.muted }]}>
            <Text style={[s.bodyBold, s.num, { color: c.ink }]}>{all.length}</Text>종목 · 약{' '}
            <Text style={[s.bodyBold, s.num, { color: c.ink }]}>{plan.minutes}</Text>분
          </Text>
        </View>
        {plan.goal ? <Text style={[s.bodyBold, { color: c.ink }]}>목표 · {plan.goal}</Text> : null}
        <Text style={[s.body, { color: c.muted }]}>{plan.reason}</Text>
        {plan.reasons.length > 0 ? (
          <View style={{ gap: 2 }}>
            <Text style={[s.smallBold, { color: c.ink }]}>오늘 이렇게 짰어요</Text>
            {plan.reasons.map((line) => (
              <Text key={line} style={[s.small, { color: c.muted }]}>
                · {line}
              </Text>
            ))}
          </View>
        ) : null}
        {plan.autoPain ? (
          <View style={[s.box, { backgroundColor: c.page, gap: 6 }]}>
            <Text style={[s.smallBold, { color: c.sky }]}>
              자동 맞춤 <Text style={{ color: c.muted, fontWeight: '400' }}>{plan.autoPain.summary}</Text>
            </Text>
            <Text style={[s.small, { color: c.ink }]}>{plan.autoPain.reason}</Text>
            {plan.autoPain.caution ? <Text style={[s.tiny, { color: c.muted }]}>메모를 보고 조심한 곳: {plan.autoPain.caution}</Text> : null}
            <Text style={[s.small, { color: c.warn }]}>메모에 통증 같은 말이 있어요.</Text>
            <LinkRow c={c} label="통증이면 체크인 고치기" onPress={a.checkin} />
          </View>
        ) : null}
        {plan.cut ? (
          <Text style={[s.tiny, { color: c.warn }]}>
            회복 데이라 {plan.cut.requested}분 → {plan.cut.minutes}분
          </Text>
        ) : null}
        {plan.droppedForSafety > 0 ? (
          <Text style={[s.small, s.box, { color: c.warn, backgroundColor: c.warnBg }]}>
            몸 상태가 바뀌어 무리인 운동 {plan.droppedForSafety}개를 뺐어요.
          </Text>
        ) : null}
        <View style={[s.divider, { borderTopColor: c.line }]}>
          <LinkRow c={c} label="조건 바꿔 다시 만들기" onPress={() => setRemake(true)} />
        </View>
      </Card>

      {/* 조건 바꿔 다시 만들기 — 웹은 카드 안 접이, 앱은 시트. 웹처럼 '오늘 하고 싶은 운동' 카드가 폼 위에 선다 */}
      {remake ? (
        <Sheet open onClose={() => setRemake(false)} title="조건 바꿔 다시 만들기" c={c}>
          <Card c={c}>
            {data.prefs ? <PrefsCard prefs={data.prefs} today={data.today} c={c} a={a} /> : null}
            <PlanForm make={make} generated c={c} a={a} onLeave={() => setRemake(false)} />
          </Card>
        </Sheet>
      ) : null}
      {adding ? <AddSheet inPlanIds={all.map((r) => r.id)} onClose={() => setAdding(false)} c={c} a={a} /> : null}

      {/* 마친 날은 목록을 접는다 — 위 완료 카드가 오늘 한 것을 숫자까지 말한다(웹 DoneFold) */}
      {data.done ? (
        <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float, paddingVertical: 4 }]}>
          <Pressable accessibilityRole="button" accessibilityState={{ expanded: listOpen }} onPress={() => setListOpen((v) => !v)} style={s.linkRow}>
            <SymbolView name={listOpen ? 'chevron.up' : 'chevron.down'} size={12} tintColor={c.muted} />
            <Text style={[s.bodyBold, { flex: 1, color: c.ink }]}>오늘 목록 보기</Text>
            <Text style={[s.tiny, { color: c.muted }]}>{all.length}개</Text>
          </Pressable>
          {listOpen ? <View style={{ paddingBottom: 12 }}>{list}</View> : null}
        </View>
      ) : (
        list
      )}

      <NoteView note={data.note} anyDone={doneCount > 0} today={data.today} c={c} a={a} />

      {plan.tooFew ? (
        <Card c={c} tone="warn">
          <Text style={[s.small, { color: c.warn }]}>
            오늘 조건에 맞는 운동이 {plan.tooFew.count}개뿐이에요(권장 {plan.tooFew.min}개 이상).
          </Text>
        </Card>
      ) : null}
    </>
  );
}

/** 운동 한 줄 — 누르면 체크, 왼쪽으로 밀면 [즐겨찾기 | 빼기](웹 휴대폰 SwipeRow — 공통 틀 ~/shell/swipe-row), 밑에 지난번 · 영상(웹 CheckRow + RowFooter) */
function ExerciseRow({
  r,
  unit,
  c,
  onToggle,
  onStar,
  onRemove,
}: {
  r: TodayRow;
  unit: WeightUnit;
  c: Palette;
  onToggle: () => void;
  onStar: () => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  const last = r.last ? formatAmount(r.last, unit) : null;
  const hasVideo = Boolean(r.videoPath || r.referenceVideoId);
  return (
    <View style={st.swipe}>
      <SwipeRow
        actions={[
          { label: r.favorite ? '즐겨찾기 해제' : '즐겨찾기', color: '#ff9500', onPress: onStar },
          { label: '빼기', color: '#ff3b30', onPress: onRemove },
        ]}
      >
        {/* 불투명한 바탕 위에 옅은 하늘색 — 반투명 줄이면 밀 때 뒤의 단추가 비친다 */}
        <View style={{ backgroundColor: c.card, borderRadius: 16 }}>
        <View style={[st.ex, { backgroundColor: r.done ? `${c.sky}14` : c.card, borderColor: r.done ? c.sky : c.card }]}>
          <View style={s.row}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: r.done }}
              accessibilityLabel={r.title}
              accessibilityActions={[
                { name: 'favorite', label: r.favorite ? '즐겨찾기 해제' : '즐겨찾기' },
                { name: 'remove', label: '목록에서 빼기' },
              ]}
              onAccessibilityAction={(e) => (e.nativeEvent.actionName === 'favorite' ? onStar() : e.nativeEvent.actionName === 'remove' ? onRemove() : undefined)}
              onPress={onToggle}
              style={[s.row, { flex: 1, minWidth: 0, minHeight: 56 }]}
            >
              <SymbolView name={r.done ? 'checkmark.circle.fill' : 'circle'} size={24} tintColor={r.done ? c.sky : c.muted} />
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text numberOfLines={2} style={[s.bodyBold, { color: c.ink }]}>
                  {r.title}
                </Text>
                <Text numberOfLines={1} style={[s.tiny, { color: c.muted }]}>
                  {r.category}
                  {r.manual ? ' · 직접 넣음' : ''}
                </Text>
                {r.prescription ? <Text style={[s.small, { color: c.ink }]}>{r.prescription}</Text> : null}
                {r.reason ? <Text style={[s.tiny, { color: c.sky }]}>{r.reason}</Text> : null}
                {r.unsafe ? <Text style={[s.tiny, { color: c.warn }]}>오늘 몸 상태에는 권하지 않는 운동이에요</Text> : null}
              </View>
              {/* 사진은 오른쪽(웹 check-row 와 같다) */}
              {r.thumbUrl ? <Image source={{ uri: r.thumbUrl }} style={[st.thumb, { backgroundColor: c.line }]} /> : null}
            </Pressable>
          </View>
          {last || hasVideo ? (
            <View style={[s.between, s.divider, { borderTopColor: c.line, minHeight: 40 }]}>
              <Text numberOfLines={1} style={[s.tiny, { flex: 1, color: c.muted }]}>
                {last && r.last ? (
                  <>
                    지난번 {shortDate(r.last.date)} · <Text style={{ color: c.ink, fontWeight: '600' }}>{last}</Text>
                  </>
                ) : null}
              </Text>
              {hasVideo ? (
                <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((v) => !v)} style={st.lineBtn}>
                  <Text style={[s.smallBold, { color: c.sky }]}>{open ? '접기' : '영상'}</Text>
                </Pressable>
              ) : null}
            </View>
          ) : null}
          {open ? (
            <View style={{ gap: 10, paddingBottom: 6 }}>
              <ExerciseMedia path={r.videoPath} referenceVideoId={r.referenceVideoId} thumbUrl={r.thumbUrl} aspectRatio={r.aspectRatio} />
              {r.description ? (
                <Text selectable style={[s.body, { color: c.ink }]}>
                  {r.description}
                </Text>
              ) : null}
            </View>
          ) : null}
        </View>
        </View>
      </SwipeRow>
    </View>
  );
}

/** 오늘 운동이 어땠는지 — 하루에 하나(웹 TrainingNote). 강도는 1~10 중 하나를 골라야 저장된다(기본값을 채우지 않는다) */
function NoteView({ note, anyDone, today, c, a }: { note: TrainingToday['note']; anyDone: boolean; today: string; c: Palette; a: TodayActions }) {
  /* 저장한 뒤 다시 읽기가 오기 전까지 저장한 값을 보인다 — 새로 받은 메모가 오면 그것이 이긴다 */
  const [mine, setMine] = useState<TrainingToday['note'] | null>(null);
  const [seen, setSeen] = useState(note);
  if (seen !== note) {
    setSeen(note);
    setMine(null);
  }
  const cur = mine ?? note;
  const saved = cur.intensity != null;
  const [editing, setEditing] = useState(!saved);
  const [value, setValue] = useState<number | null>(note.intensity);
  const [text, setText] = useState(note.memo ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!saved && !anyDone)
    return (
      <Text style={[s.body, s.box, { color: c.muted, backgroundColor: c.card }]}>
        운동을 하나라도 마치면 여기에 오늘 운동이 어땠는지 남길 수 있어요.
      </Text>
    );

  if (saved && !editing)
    return (
      <Card c={c}>
        <View style={s.between}>
          <Text style={[s.bodyBold, { color: c.sky }]}>✓ 오늘 운동 강도 {cur.intensity}/10</Text>
          <Pressable accessibilityRole="button" onPress={() => setEditing(true)} style={st.lineBtn}>
            <Text style={[s.smallBold, { color: c.sky }]}>고치기</Text>
          </Pressable>
        </View>
        {cur.memo ? <Text style={[s.body, { color: c.ink }]}>{cur.memo}</Text> : null}
      </Card>
    );

  const save = async () => {
    if (busy) return;
    setError(null);
    if (value == null) return setError('운동 강도를 먼저 골라 주세요.');
    setBusy(true);
    const r = await act<{ ok: true }>('exercise-log.saveTrainingNote', value, text, today);
    setBusy(false);
    if ('error' in r) return setError(r.error);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setMine({ intensity: value, memo: text.trim() || null });
    setEditing(false);
    await a.reload();
  };

  return (
    <Card c={c}>
      <View style={{ gap: 2 }}>
        <Text style={[s.bodyBold, { color: c.ink }]}>오늘 운동은 어땠나요?</Text>
        <Text style={[s.tiny, { color: c.muted }]}>하루에 한 번만 적으면 돼요. 투구와 함께 몸에 걸린 부담을 보는 데 써요.</Text>
      </View>
      <Text style={[s.smallBold, { color: c.ink }]}>운동 강도 · {value == null ? '아직 안 골랐어요' : `${value} / 10`}</Text>
      <View style={[s.row, { gap: 6 }]}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <Pressable
            key={n}
            accessibilityRole="button"
            accessibilityLabel={`강도 ${n}`}
            accessibilityState={{ selected: value === n }}
            onPress={() => {
              void Haptics.selectionAsync();
              setValue(n);
            }}
            style={[st.level, { backgroundColor: value === n ? c.sky : c.chip }]}
          >
            <Text style={[s.smallBold, s.num, { color: value === n ? '#fff' : c.ink }]}>{n}</Text>
          </Pressable>
        ))}
      </View>
      <View style={s.between}>
        <Text style={[s.tiny, { color: c.muted }]}>1 아주 가벼움</Text>
        <Text style={[s.tiny, { color: c.muted }]}>10 최대</Text>
      </View>
      {/* 웹 IntensityGuide — 고른 칸의 기준을 바로 밑에(마치기 시트와 같은 표) */}
      {value != null ? (
        <Text style={[s.small, { color: c.muted }]}>
          <Text style={{ fontWeight: '700', color: c.ink }}>{trainingEffortLevel(value)?.label}</Text> · {trainingEffortLevel(value)?.detail}
        </Text>
      ) : null}
      <EffortGuide c={c} />
      <Text style={[s.smallBold, { color: c.ink }]}>
        느낀점 <Text style={[s.tiny, { color: c.muted, fontWeight: '400' }]}>선택</Text>
      </Text>
      <TextInput
        value={text}
        onChangeText={setText}
        multiline
        maxLength={1000}
        placeholder="무거웠던 곳, 잘 된 동작 (안 적어도 돼요)"
        placeholderTextColor={c.muted}
        style={[st.input, { color: c.ink, backgroundColor: c.page, borderColor: c.line }]}
      />
      {error ? <Text style={[s.small, { color: c.danger }]}>{error}</Text> : null}
      <BigButton c={c} busy={busy} label={busy ? '저장 중…' : saved ? '고쳐서 저장' : '오늘 운동 기록 저장'} onPress={() => void save()} />
      {saved ? <LinkRow c={c} label="취소" onPress={() => setEditing(false)} /> : null}
    </Card>
  );
}

const st = StyleSheet.create({
  stat: { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] },
  line: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 12 },
  lineCard: { minHeight: 52, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 16, paddingRight: 6, paddingVertical: 6 },
  lineBtn: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  ex: { borderRadius: 16, borderWidth: 1, paddingLeft: 12, paddingRight: 12, paddingVertical: 4, gap: 4 },
  /* 웹 DayCard — 접힌 알약 · 펼친 하늘 판 · 접기 */
  prefsPill: { alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40, borderRadius: 20, paddingHorizontal: 14 },
  prefsPanel: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  prefsFold: { minHeight: 40, marginVertical: -8, paddingHorizontal: 12, borderRadius: 20, justifyContent: 'center' },
  /* 웹 check-row 의 h-14 w-20 */
  thumb: { width: 80, height: 56, borderRadius: 12 },
  swipe: { borderRadius: 16, overflow: 'hidden' },
  level: { flex: 1, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  add: { minHeight: 52, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  input: { minHeight: 80, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, textAlignVertical: 'top' },
});
