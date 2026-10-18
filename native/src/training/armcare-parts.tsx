import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { type Href, router } from 'expo-router';
import { AddToRoutine } from '~/armcare/add-to-routine';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { Image, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { ARMCARE_AREAS, ARMCARE_MUSCLES, areaOfMuscle, type ArmcareArea, type ArmcareAreaKey } from '@/lib/armcare/anatomy';
import type { ArmcareExerciseView } from '@/app/(app)/training/armcare-media';
import type { AppArmcareItem, AppMyRoutine, AppRehabSummary } from '@/lib/armcare/today-load';
import type { ArmPainLine } from '@/lib/armcare/coverage-load';
import { checkId, checkOutbox } from '~/armcare/outbox';
import { ExerciseMedia, HowTo } from '~/armcare/parts';
import { act, leave } from '~/mechanics/parts';
import type { Palette } from '~/lib/ui';
import { Fold, s } from './screen';
import { fromApp } from '~/shell/web-nav';
import { MuscleChips } from '~/armcare/muscle-info';
import { AREA_DETAILS } from '@/lib/armcare/details';

/**
 * 암케어 전체 화면(native/src/app/training-armcare.tsx)의 조각 — 웹 armcare-today.tsx(체크 목록 · 이번 주) · my-routines.tsx · rehab-card.tsx(겉) ·
 * armcare-guide.tsx(부위별 보강)를 옮겼다. 체크는 웹 목록과 같은 기록(exercise-log.setExerciseDone), 따라 하기는 앱 화면(/armcare/<id>?d=…).
 */

/** 따라 하기 앱 화면 — 웹 주소 /armcare/play/<id>?… 와 같은 물음 */
export const openPlay = (id: string, query: string) => router.push(fromApp(query ? `/armcare/${id}?${query}` : `/armcare/${id}`) as Href);

/** 운동 한 줄의 겉 — 이름 · 처방 · 근육 · 강도 · 미리보기, '자세 · 영상'을 누르면 영상과 설명 */
function ExerciseRow({
  ex,
  note,
  warning,
  check,
  c,
}: {
  ex: ArmcareExerciseView;
  note?: string | null;
  warning?: string | null;
  check?: { done: boolean; disabled: boolean; onToggle: () => void };
  c: Palette;
}) {
  const [open, setOpen] = useState(false);
  const meta = [`강도 ${ex.intensity}`, ex.difficulty, ...ex.equipment].filter(Boolean).join(' · ');
  return (
    <View style={[st.row, { backgroundColor: check?.done ? c.sky + '14' : c.card, borderColor: check?.done ? c.sky : c.line }]}>
      <View style={st.rowHead}>
        {check ? (
          <Pressable
            onPress={check.onToggle}
            disabled={check.disabled}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: check.done, disabled: check.disabled }}
            accessibilityLabel={ex.title}
            style={st.checkHit}
          >
            <View style={[st.check, check.done ? { backgroundColor: c.sky, borderColor: c.sky } : { borderColor: c.line }]}>
              {check.done ? <SymbolView name="checkmark" size={13} weight="bold" tintColor="#fff" /> : null}
            </View>
          </Pressable>
        ) : null}
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[s.bodyBold, { color: c.ink }]}>
            {ex.title}
            {note ? <Text style={[s.small, { color: c.sky }]}>{`  ${note}`}</Text> : null}
          </Text>
          {ex.prescription ? <Text style={[s.smallBold, { color: c.muted }]}>{ex.prescription}</Text> : null}
          {warning ? <Text style={[s.small, { color: c.warn }]}>{warning}</Text> : null}
          {ex.targetMuscles.length ? <MuscleChips muscles={ex.targetMuscles} max={2} c={c} /> : null}
          <Text style={[s.tiny, { color: c.muted }]}>{meta}</Text>
          {/* 부위별 보강에서만(루틴 목록을 넘긴 곳) — 웹 AddToRoutine 처럼 운동 줄 안 [담기] */}
          <AddToRoutine exerciseId={ex.id} title={ex.title} c={c} />
        </View>
        {ex.thumbUrl ? <Image source={{ uri: ex.thumbUrl }} style={st.thumb} /> : null}
      </View>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={[st.disclose, { borderTopColor: c.line }]}
      >
        <SymbolView name="info.circle" size={13} tintColor={c.muted} />
        <Text style={[s.smallBold, { color: c.muted, flex: 1 }]}>자세 · 영상 보기</Text>
        <SymbolView name={open ? 'chevron.up' : 'chevron.down'} size={11} tintColor={c.muted} />
      </Pressable>
      {open ? (
        <View style={{ gap: 10, paddingHorizontal: 12, paddingBottom: 12 }}>
          <ExerciseMedia path={ex.videoPath} referenceVideoId={ex.referenceVideoId} thumbUrl={ex.thumbUrl} aspectRatio={ex.aspectRatio} />
          <HowTo exerciseId={ex.id} method={ex.method} inline c={c} />
        </View>
      ) : null}
    </View>
  );
}

/**
 * 체크 목록 — 웹 Checklist 와 같다: 완료 수 · 막대, 부위별로 묶기(맞춤 루틴), 누르면 그 날짜에 체크(웹 목록과 같은 기록).
 * 따라 하기에서 신호가 없어 폰에 남은 체크(~/armcare/outbox)도 한 것으로 보인다 — 곧 보내진다.
 * fresh 가 아니면(받아 둔 값 — 어제 것일 수 있다) 체크를 막는다.
 */
export function Checklist({
  items: initial,
  dateKey,
  fresh,
  grouped = true,
  doneLabel = '오늘 암케어 끝',
  onChanged,
  c,
}: {
  items: AppArmcareItem[];
  dateKey: string;
  fresh: boolean;
  grouped?: boolean;
  doneLabel?: string;
  /** 체크가 서버에 남은 뒤 — 화면이 다시 받아 루틴 머리 '오늘 n/m' · 이번 주 점을 맞춘다 */
  onChanged?: () => void;
  c: Palette;
}) {
  const [items, setItems] = useState(initial);
  const [seen, setSeen] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  /* 서버가 새 목록을 주면(다시 받기 · 다시 만들기) 그것을 따른다 */
  if (seen !== initial) {
    setSeen(initial);
    setItems(initial);
  }
  const pending = useSyncExternalStore(checkOutbox.subscribe, checkOutbox.snapshot);
  const waiting = new Set(pending.map(checkId));
  const doneOf = (it: AppArmcareItem) => it.done || waiting.has(checkId({ exerciseId: it.exercise.id, dateKey }));

  const toggle = async (id: string) => {
    const target = items.find((it) => it.exercise.id === id);
    if (!target) return;
    const key = { exerciseId: id, dateKey };
    /* 폰에만 담긴 체크(따라 하기에서 신호 없이 마침)를 푼다 — 서버에 간 적이 없으니 대기열에서 빼기만(서버 값으로 풀면 대기열이 나중에 다시 체크했다) */
    if (!target.done && waiting.has(checkId(key))) {
      checkOutbox.drop(key);
      return;
    }
    const next = !doneOf(target);
    if (next) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const flip = (v: boolean) => setItems((prev) => prev.map((it) => (it.exercise.id === id ? { ...it, done: v } : it)));
    flip(next);
    setError(null);
    const res = await act<{ ok: true }>('exercise-log.setExerciseDone', id, next, dateKey);
    if ('error' in res) {
      flip(!next);
      setError(res.error);
    } else onChanged?.();
  };

  const doneCount = items.filter(doneOf).length;
  const allDone = items.length > 0 && doneCount === items.length;
  const groups: { label: string | null; items: AppArmcareItem[] }[] = [];
  for (const it of items) {
    const last = groups.at(-1);
    if (!grouped) {
      if (last) last.items.push(it);
      else groups.push({ label: null, items: [it] });
    } else if (last && last.label === it.areaLabel) last.items.push(it);
    else groups.push({ label: it.areaLabel, items: [it] });
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={[s.card, { backgroundColor: c.card, gap: 10 }]}>
        <View style={s.between}>
          <Text style={[s.bodyBold, { color: c.ink }]}>
            {doneCount}
            <Text style={{ color: c.muted }}>/{items.length}</Text> 완료
          </Text>
          {allDone ? <Text style={[s.smallBold, s.tag, { color: '#fff', backgroundColor: c.sky }]}>✓ {doneLabel}</Text> : null}
        </View>
        <View style={[st.bar, { backgroundColor: c.chip }]}>
          <View style={[st.barFill, { backgroundColor: c.sky, width: `${items.length ? (doneCount / items.length) * 100 : 0}%` }]} />
        </View>
      </View>
      {error ? <Text style={[s.small, s.box, { color: c.danger, backgroundColor: c.danger + '14' }]}>{error}</Text> : null}
      {groups.map((g) => (
        <View key={`${g.label ?? 'all'}-${g.items[0].exercise.id}`} style={{ gap: 8 }}>
          {g.label ? <Text style={[s.bodyBold, { color: c.ink, paddingHorizontal: 4 }]}>{g.label}</Text> : null}
          {g.items.map((it) => {
            const done = doneOf(it);
            return (
              <ExerciseRow
                key={it.exercise.id}
                ex={it.exercise}
                note={it.note}
                warning={it.unsafe && !done ? '지금 몸 상태에는 권하지 않는 운동이에요' : null}
                check={{ done, disabled: !fresh, onToggle: () => void toggle(it.exercise.id) }}
                c={c}
              />
            );
          })}
        </View>
      ))}
    </View>
  );
}

/** 이번 주 암케어 — 최근 7일(오늘 포함) 점 7개(웹 WeekDots) */
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
export function WeekDots({ week, c }: { week: { key: string; done: boolean }[]; c: Palette }) {
  const days = week.filter((d) => d.done).length;
  return (
    <View style={[s.card, { backgroundColor: c.card }]} accessibilityLabel={`이번 주 암케어 최근 7일 중 ${days}일`}>
      <View style={s.between}>
        <Text style={[s.bodyBold, { color: c.ink }]}>이번 주 암케어</Text>
        <Text style={[s.small, { color: c.muted }]}>
          <Text style={[s.bodyBold, { color: c.ink }]}>{days}</Text>/7일
        </Text>
      </View>
      <View style={st.week}>
        {week.map((d, i) => {
          const [y, m, dd] = d.key.split('-').map(Number);
          const isToday = i === week.length - 1;
          return (
            <View key={d.key} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <View
                style={[
                  st.dot,
                  d.done
                    ? { backgroundColor: c.sky }
                    : isToday
                      ? { borderWidth: 2, borderStyle: 'dashed', borderColor: c.sky + '66' }
                      : { backgroundColor: c.chip },
                ]}
              >
                {d.done ? <SymbolView name="checkmark" size={11} weight="bold" tintColor="#fff" /> : null}
              </View>
              <Text style={[s.tiny, { color: isToday ? c.ink : c.muted, fontWeight: isToday ? '700' : '400' }]}>
                {isToday ? '오늘' : WEEKDAYS[new Date(y, m - 1, dd).getDay()]}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** 내 루틴 하나 — 이름 · 운동 수 · 오늘 몇 개, 펼치면 체크 목록. ▶ 따라 하기(앱), 연필 고치기(앱 화면 /training/routine/<id>) */
export function RoutineCard({ routine: r, dateKey, fresh, open, onToggle, onChanged, c }: {
  routine: AppMyRoutine;
  dateKey: string;
  fresh: boolean;
  open: boolean;
  onToggle: () => void;
  onChanged?: () => void;
  c: Palette;
}) {
  const pending = useSyncExternalStore(checkOutbox.subscribe, checkOutbox.snapshot);
  const all = r.items.length;
  /* 폰에 담긴 체크도 한 것으로(체크 목록과 같은 셈) — 목록에서 누른 것은 화면이 다시 받으면(onChanged) 따라온다 */
  const done = r.items.filter((it) => it.done || pending.some((p) => p.exerciseId === it.exercise.id && p.dateKey === dateKey)).length;
  return (
    <View style={[st.routine, { backgroundColor: c.card, borderColor: open ? c.sky + '66' : c.line }]}>
      <View style={s.row}>
        <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} style={st.routineHead}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[s.bodyBold, { color: c.ink }]}>{r.name}</Text>
            <Text style={[s.small, { color: c.muted }]}>
              운동 {all}개 · 약 {r.estimatedMinutes}분
            </Text>
          </View>
          <Text
            style={[
              s.smallBold,
              s.tag,
              all > 0 && done === all
                ? { color: '#fff', backgroundColor: c.sky }
                : done > 0
                  ? { color: c.sky, backgroundColor: c.sky + '1a' }
                  : { color: c.muted, backgroundColor: c.chip },
            ]}
          >
            오늘 {done}/{all}
          </Text>
          <SymbolView name={open ? 'chevron.up' : 'chevron.down'} size={12} tintColor={c.muted} />
        </Pressable>
        {all > 0 ? (
          <Pressable onPress={() => openPlay(r.id, `d=${dateKey}`)} accessibilityRole="button" accessibilityLabel={`${r.name} 따라하기`} style={st.circleHit}>
            <View style={[st.circle, { backgroundColor: c.sky }]}>
              <SymbolView name="play.fill" size={15} tintColor="#fff" />
            </View>
          </Pressable>
        ) : null}
        <Pressable onPress={() => router.push(`/training/routine/${r.id}` as Href)} accessibilityRole="button" accessibilityLabel={`${r.name} 고치기`} style={st.circleHit}>
          <View style={[st.circle, { backgroundColor: c.chip }]}>
            <SymbolView name="pencil" size={15} tintColor={c.ink} />
          </View>
        </Pressable>
      </View>
      {open ? (
        <View style={{ gap: 8, paddingTop: 4 }}>
          {all === 0 ? (
            <Text style={[s.small, { color: c.muted }]}>담긴 운동이 모두 라이브러리에서 숨겨졌어요. 고치기에서 다시 담아 주세요.</Text>
          ) : (
            <Checklist items={r.items} dateKey={dateKey} fresh={fresh} grouped={false} doneLabel="루틴 끝" onChanged={onChanged} c={c} />
          )}
          {r.hidden > 0 ? <Text style={[s.tiny, { color: c.muted }]}>담아 둔 운동 중 {r.hidden}개는 라이브러리에서 숨겨져 빠졌어요.</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

/** 오늘 재활 겉 모습(웹 rehab-card.tsx 접힌 카드) — 시작은 앱 따라 하기(/armcare/rehab), 자세히는 앱 화면(/rehab — 시험 · 매주 확인은 거기서 웹으로) */
/**
 * 재활 카드 위 한 줄(진료 > 쉬는 날 > 낮추기 > 단계 시험 > 매주 확인 > 정도 낮아짐) — 웹 rehab-card.tsx 의 TopLine 처럼 단계 시험 · 매주 확인 줄에는
 * 오른쪽 [시험하기] · [확인하기](앱 화면 rehab-test · rehab-weekly). 진료 줄은 경고색.
 */
export function RehabLine({ line, bg, c }: { line: NonNullable<AppRehabSummary['line']>; bg: string; c: Palette }) {
  if (line.kind === 'refer') return <Text style={[s.body, s.box, { color: c.warn, backgroundColor: c.warnBg }]}>{line.text}</Text>;
  const action =
    line.kind === 'stage-test' ? { label: '시험하기', href: '/rehab-test' } : line.kind === 'weekly' ? { label: '확인하기', href: '/rehab-weekly' } : null;
  return (
    <View style={[s.box, { backgroundColor: bg, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
      <Text style={[s.body, { color: c.ink, flex: 1 }]}>{line.text}</Text>
      {action ? (
        <Pressable onPress={() => router.push(action.href as Href)} accessibilityRole="button" style={[s.textBtn, { minHeight: 44, justifyContent: 'center' }]}>
          <Text style={[s.smallBold, { color: c.sky }]}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function RehabCard({ rehab, dateKey, c }: { rehab: AppRehabSummary; dateKey: string; c: Palette }) {
  return (
    <View style={[s.card, { backgroundColor: c.card, borderWidth: 1, borderColor: c.sky + '40' }]}>
      <View style={{ gap: 2 }}>
        <Text style={[s.smallBold, { color: c.muted }]}>재활 프로그램 · {rehab.day}일째</Text>
        <Text style={[s.title, { color: c.ink }]}>{rehab.title}</Text>
      </View>
      {rehab.line ? <RehabLine line={rehab.line} bg={c.page} c={c} /> : null}
      {rehab.today ? (
        <View style={[st.todayBox, { backgroundColor: rehab.today.warn ? c.warnBg : c.sky + '14' }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[s.bodyBold, { color: rehab.today.warn ? c.warn : c.ink }]}>오늘 재활 끝 · {rehab.today.resultLabel}</Text>
            <Text style={[s.small, { color: c.muted }]}>{rehab.today.text}</Text>
          </View>
          <Pressable onPress={() => openPlay('rehab', `d=${dateKey}`)} accessibilityRole="button" style={s.textBtn}>
            <Text style={[s.smallBold, { color: c.sky }]}>다시 답하기</Text>
          </Pressable>
        </View>
      ) : !rehab.rest ? (
        <View style={s.row}>
          <Text style={[s.body, { color: c.muted, flex: 1 }]}>
            오늘 <Text style={[s.bodyBold, { color: c.ink }]}>{rehab.count}</Text>개 · 약{' '}
            <Text style={[s.bodyBold, { color: c.ink }]}>{rehab.estimatedMinutes}</Text>분{rehab.done > 0 ? ` · ${rehab.done}개 함` : ''}
          </Text>
          <Pressable onPress={() => openPlay('rehab', `d=${dateKey}`)} accessibilityRole="button" style={[s.smallPill, { backgroundColor: c.sky }]}>
            <SymbolView name="play.fill" size={12} tintColor="#fff" />
            <Text style={[s.bodyBold, { color: '#fff' }]}>시작</Text>
          </Pressable>
        </View>
      ) : null}
      <Text style={[s.small, { color: c.muted }]}>{rehab.progress}</Text>
      <Pressable
        onPress={() => (rehab.detail ? router.push('/rehab' as Href) : leave('/training?view=armcare'))}
        accessibilityRole={rehab.detail ? 'button' : 'link'}
        style={[st.disclose, { borderTopColor: c.line, paddingHorizontal: 0 }]}
      >
        <Text style={[s.smallBold, { color: c.sky, flex: 1 }]}>{rehab.detail ? '자세히' : '자세히 · 단계 시험 · 매주 확인은 웹에서'}</Text>
        <SymbolView name={rehab.detail ? 'chevron.right' : 'arrow.up.right'} size={12} tintColor={c.sky} />
      </Pressable>
    </View>
  );
}

/* ----------------------------- 부위별 보강(웹 armcare-guide.tsx) ----------------------------- */

/** 체크인에 남긴 팔 통증 — 누르면 그 부위 카드로. 정도 2 이상이면 진료가 먼저라고 */
export function PainNote({ pain, onArea, c }: { pain: ArmPainLine; onArea: (key: ArmcareAreaKey) => void; c: Palette }) {
  return (
    <View style={[s.card, { backgroundColor: c.warnBg, gap: 8 }]}>
      <Text style={[s.bodyBold, { color: c.warn }]}>
        {pain.when} 체크인: {pain.spots.map((x) => x.label).join(' · ')}
        {pain.levelLabel ? ` · ${pain.levelLabel}` : ''}
      </Text>
      <View style={s.wrap}>
        {pain.spots.map((x) => (
          <Pressable key={x.key} onPress={() => onArea(x.key)} accessibilityRole="button" style={[s.chip, { backgroundColor: c.card }]}>
            <Text style={[s.smallBold, { color: c.warn }]}>{x.label} 보기 ›</Text>
          </Pressable>
        ))}
      </View>
      {pain.level != null && pain.level >= 2 ? (
        <Text style={[s.small, { color: c.warn }]}>평소에도 아프면 보강보다 진료가 먼저예요. 아픈 곳은 빈 곳 보강에서 뺐어요.</Text>
      ) : null}
    </View>
  );
}

/** 2주째 비어 있는 부위 — 그 부위로 짠 10분 루틴(앱 따라 하기 /armcare/focus). 다 챙겼으면 칭찬 한 줄 */
export function GapCard({
  gaps,
  allCovered,
  total,
  dateKey,
  c,
}: {
  gaps: { key: ArmcareAreaKey; label: string }[];
  allCovered: boolean;
  total: number;
  dateKey: string;
  c: Palette;
}) {
  if (gaps.length === 0) {
    if (!allCovered) return null;
    return <Text style={[s.bodyBold, s.box, { color: c.sky, backgroundColor: c.card }]}>✓ 최근 2주 동안 여덟 부위를 모두 챙겼어요</Text>;
  }
  const decel = gaps.some((g) => g.key === 'shoulder-back' || g.key === 'elbow-inner');
  return (
    <View style={[s.card, { backgroundColor: c.card }]}>
      <View style={{ gap: 2 }}>
        <Text style={[s.bodyBold, { color: c.ink, fontSize: 17 }]}>{total === 0 ? '최근 2주 암케어 기록이 없어요' : '2주째 비어 있어요'}</Text>
        <Text style={[s.body, { color: c.muted }]}>
          {gaps.map((g) => g.label).join(' · ')}
          {decel ? ', 던질 때 팔을 멈춰 주는 곳이에요' : ''}
          {total === 0 ? '. 여기부터 시작해 보세요.' : ''}
        </Text>
      </View>
      <Pressable
        onPress={() => openPlay('focus', `areas=${gaps.map((g) => g.key).join(',')}&d=${dateKey}`)}
        accessibilityRole="button"
        style={[s.pill, { backgroundColor: c.sky }]}
      >
        <SymbolView name="play.fill" size={13} tintColor="#fff" />
        <Text style={[s.bodyBold, { color: '#fff' }]}>{gaps.length === 1 ? '이곳으로' : `이 ${gaps.length}곳으로`} 10분 루틴</Text>
      </Pressable>
    </View>
  );
}

/** 그 부위에 드는 운동 — 주로 키우는 것 먼저, 함께 쓰는 것 뒤에(웹 exercisesFor) */
function exercisesFor(area: ArmcareArea, exercises: ArmcareExerciseView[]) {
  const primary: ArmcareExerciseView[] = [];
  const secondary: ArmcareExerciseView[] = [];
  for (const ex of exercises) {
    const areas = ex.targetMuscles.map((m) => areaOfMuscle(m)?.key);
    if (areas[0] === area.key) primary.push(ex);
    else if (areas.includes(area.key)) secondary.push(ex);
  }
  return { primary, secondary };
}

/** 부위 카드 — 접힌 머리(이름 · 운동 수), 펼치면 흔한 부상 · 근육 · '자세히'(부상 설명 · 알아 두기 · 근육이 하는 일) · 운동 */
export function AreaCard({
  area,
  exercises,
  open,
  onToggle,
  onLayout,
  c,
}: {
  area: ArmcareArea;
  exercises: ArmcareExerciseView[];
  open: boolean;
  onToggle: () => void;
  onLayout: (e: LayoutChangeEvent) => void;
  c: Palette;
}) {
  const { primary, secondary } = exercisesFor(area, exercises);
  const muscles = ARMCARE_MUSCLES.filter((m) => m.area === area.key);
  const count = primary.length + secondary.length;
  return (
    <View
      onLayout={onLayout}
      style={[st.routine, { backgroundColor: c.card, borderColor: open ? c.sky + '66' : c.line }]}
    >
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} style={st.routineHead}>
        <Text style={[s.bodyBold, { color: c.ink, flex: 1 }]}>
          {area.label} <Text style={[s.small, { color: c.muted, fontWeight: '400' }]}>운동 {count}개</Text>
        </Text>
        <SymbolView name={open ? 'chevron.up' : 'chevron.down'} size={12} tintColor={c.muted} />
      </Pressable>
      {open ? (
        <View style={{ gap: 12, paddingTop: 4 }}>
          <View style={s.wrap}>
            {area.injuries.map((i) => (
              <Text key={i.name} style={[s.smallBold, s.tag, { color: c.warn, backgroundColor: c.warnBg }]}>
                {i.name}
              </Text>
            ))}
          </View>
          {/* 근육 — 누르면 그 근육 설명(웹 InfoButton muscle) */}
          <MuscleChips muscles={muscles.map((m) => m.name)} highlight={muscles.map((m) => m.name)} c={c} />
          {/* 부위 자세히 — 웹 armcare-info-body AreaInfo 의 차례 · 글(lib/armcare/details AREA_DETAILS) */}
          <Fold label={`${area.label} 자세히 보기`} c={c}>
            {AREA_DETAILS[area.key] ? (
              <>
                <AreaSection title="던질 때 하는 일" c={c}>
                  <Text style={[st.areaBody, { color: c.ink }]}>{AREA_DETAILS[area.key].role}</Text>
                </AreaSection>
                <AreaSection title="왜 챙겨야 하나요" c={c}>
                  <Text style={[st.areaBody, { color: c.ink }]}>{AREA_DETAILS[area.key].why}</Text>
                </AreaSection>
              </>
            ) : null}
            <AreaSection title="흔한 부상" c={c}>
              {area.injuries.map((i) => (
                <View key={i.name} style={{ gap: 2 }}>
                  <Text style={[s.smallBold, { color: c.warn }]}>{i.name}</Text>
                  <Text style={[s.small, { color: c.ink, opacity: 0.75 }]}>{i.desc}</Text>
                </View>
              ))}
            </AreaSection>
            <AreaSection title="이 부위의 근육" c={c}>
              {muscles.map((m) => (
                <Text key={m.name} style={[s.small, { color: c.ink }]}>
                  <Text style={{ fontWeight: '700', color: c.sky }}>{m.name}</Text> {m.does}
                </Text>
              ))}
            </AreaSection>
            {area.notes.length ? (
              <AreaSection title="알아 두기" c={c}>
                {area.notes.map((n) => (
                  <Text key={n} style={[s.small, { color: c.ink }]}>
                    · {n}
                  </Text>
                ))}
              </AreaSection>
            ) : null}
            {AREA_DETAILS[area.key] ? (
              <>
                <AreaSection title="이런 신호가 있으면 더 챙기세요" c={c}>
                  {AREA_DETAILS[area.key].signs.map((sign) => (
                    <Text key={sign} style={[s.small, { color: c.ink }]}>
                      · {sign}
                    </Text>
                  ))}
                </AreaSection>
                <AreaSection title="이렇게 키워요" c={c}>
                  <Text style={[st.areaBody, { color: c.ink }]}>{AREA_DETAILS[area.key].train}</Text>
                </AreaSection>
              </>
            ) : null}
            <Text style={[s.tiny, { color: c.muted }]}>운동이 부상을 막아 준다는 보장은 없어요. 통증이 이어지면 쉬고 진료를 받으세요.</Text>
          </Fold>
          <Text style={[s.smallBold, { color: c.muted }]}>운동</Text>
          {count === 0 ? (
            <Text style={[s.small, { color: c.muted }]}>이 부위를 키우는 운동이 아직 없어요.</Text>
          ) : (
            [...primary, ...secondary].map((ex) => (
              <ExerciseRow key={ex.id} ex={ex} note={secondary.includes(ex) ? '함께 쓰는 운동' : null} c={c} />
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

function AreaSection({ title, children, c }: { title: string; children: ReactNode; c: Palette }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[s.smallBold, { color: c.ink }]}>{title}</Text>
      {children}
    </View>
  );
}

/** 어깨 · 팔꿈치 차례의 부위들 */
export const AREAS_BY_JOINT = (['어깨', '팔꿈치'] as const).map((joint) => ({
  joint,
  areas: ARMCARE_AREAS.filter((a) => a.joint === joint),
}));

const st = StyleSheet.create({
  areaBody: { fontSize: 14, lineHeight: 21 },
  row: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 12, paddingVertical: 12 },
  checkHit: { width: 32, height: 44, marginTop: -8, marginLeft: -4, alignItems: 'center', justifyContent: 'center' },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  thumb: { width: 72, height: 52, borderRadius: 8, backgroundColor: '#000' },
  disclose: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderTopWidth: StyleSheet.hairlineWidth },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden' },
  barFill: { height: '100%', borderRadius: 4 },
  week: { flexDirection: 'row', gap: 4 },
  dot: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  routine: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 4, gap: 4 },
  routineHead: { flex: 1, minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: 10 },
  circleHit: { width: 44, height: 52, alignItems: 'center', justifyContent: 'center' },
  circle: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  todayBox: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingLeft: 14, paddingRight: 4, paddingVertical: 8 },
});
