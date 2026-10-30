import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { type Href, router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { josa } from '@/lib/korean';
import { MECHANICS_LEVELS, SESSIONS_PER_LEVEL, mechanicsLevel, type LevelKey } from '@/lib/mechanics/levels';
import { MECHANICS_FOLD_BUTTONS, MECHANICS_FOLD_TEXT, foldSession, isArmLoaded, labelOf } from '@/lib/mechanics/program';
import { SKILL_STAGES } from '@/lib/mechanics/progression';
import type { MechanicsProgramView } from '@/lib/mechanics/load';
import type { AppMechanicsProgramTab, AppSessionDrill } from '@/lib/mechanics/home-load';
import { ExerciseMedia } from '~/armcare/parts';
import { MechanicsEquipment } from '~/mechanics/focus-progress';
import { FocusHistory } from '~/mechanics/focus-review';
import { act, Description } from '~/mechanics/parts';
import type { Palette } from '~/lib/ui';
import { fromApp } from '~/shell/web-nav';
import { Press } from '~/shell/press';
import { Sheet } from '~/workout/sheets';
import { Star } from './fav-button';
import { LevelPicker } from './mechanics-parts';

/**
 * 메카닉 첫 화면의 '훈련' 칸(2026-10-31 확정 시안 01) — 오늘 훈련 카드(상태마다 주 행동 하나) → 오늘 장비 한 줄 → 훈련 구성 → 진도.
 * 이 화면은 읽기만 한다. 시작 · 이어하기는 실행 화면(/mechanics — 배정을 고정하거나 같은 세션을 이어 연다)이, 난이도 · 장비 · 처음부터는 각각
 * 그 단추의 서버 동작이 쓴다. 받아 둔 어제 값으로는 시작 · 관리 쓰기를 열지 않는다(fresh · today).
 */

type Reload = () => Promise<void>;

/** 처방 글에 횟수가 있으면 그대로, 없으면 목표 미지정 — reps 0 을 '0회'로 보이지 않는다(실행 화면과 같은 규칙) */
export const doseLabel = (dose: string) => (/\d+\s*회/.test(dose) ? dose : '목표 횟수 미지정');

const deviceDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const dayText = (key: string) => {
  const d = new Date(`${key}T12:00:00Z`);
  return `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일 ${'일월화수목금토'[d.getUTCDay()]}요일`;
};
const go = (href: string) => router.push(fromApp(href) as Href);

/* ----------------------------- 오늘 훈련 카드 ----------------------------- */

type CardModel = {
  eyebrow: string;
  title: string;
  sub?: string | null;
  meta?: string | null;
  tone?: 'normal' | 'warn' | 'done';
  primary?: { label: string; onPress: () => void } | null;
  secondary?: { label: string; onPress: () => void } | null;
  body?: ReactNode;
};

/** 큰 오늘 카드 — 작은 연결 오브제 셋(장식, 수치가 아니다)은 누를 때만 0.4초 남짓 반응한다 */
function TodayCard({ m, c }: { m: CardModel; c: Palette }) {
  const [pulse, setPulse] = useState(0);
  const tap = (fn: () => void) => () => {
    setPulse((n) => n + 1);
    fn();
  };
  return (
    <View style={[st.today, { backgroundColor: c.card, boxShadow: c.floatHero }]}>
      <View style={st.todayTop}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[st.eyebrow, { color: m.tone === 'warn' ? c.warn : c.link }]}>{m.eyebrow}</Text>
          <Text accessibilityRole="header" style={[st.todayTitle, { color: c.ink }]}>
            {m.title}
          </Text>
          {m.sub ? <Text style={[st.body, { color: c.muted }]}>{m.sub}</Text> : null}
        </View>
        <LinkObject pulse={pulse} tone={m.tone ?? 'normal'} c={c} />
      </View>
      {m.body}
      {m.meta ? <Text style={[st.metaText, { color: c.ink }]}>{m.meta}</Text> : null}
      {m.primary ? (
        <Press onPress={tap(m.primary.onPress)} accessibilityRole="button" style={[st.primary, { backgroundColor: c.action }]}>
          <Text style={[st.primaryText, { color: c.onAction }]}>{m.primary.label}</Text>
          <SymbolView name="play.fill" size={13} tintColor={c.onAction} />
        </Press>
      ) : null}
      {m.secondary ? (
        <Press onPress={tap(m.secondary.onPress)} accessibilityRole="button" style={st.textBtn}>
          <Text style={[st.smallBold, { color: c.link }]}>{m.secondary.label}</Text>
        </Press>
      ) : null}
    </View>
  );
}

/** 소프트 솔리드 연결 오브제 — 장식. 사용자가 누를 때만 셋이 0.4초씩(시작 시간차 포함 0.52초) 들썩이고, 동작 줄이기면 가만히 있다 */
function LinkObject({ pulse, tone, c }: { pulse: number; tone: 'normal' | 'warn' | 'done'; c: Palette }) {
  const reduced = useReducedMotion();
  const a = useSharedValue(0);
  const b = useSharedValue(0);
  const d = useSharedValue(0);
  useEffect(() => {
    if (!pulse || reduced) return;
    const hop = (delay: number) => withDelay(delay, withSequence(withTiming(-5, { duration: 160 }), withTiming(0, { duration: 240 })));
    a.set(hop(0));
    b.set(hop(60));
    d.set(hop(120));
  }, [pulse, reduced, a, b, d]);
  const sa = useAnimatedStyle(() => ({ transform: [{ translateY: a.get() }] }));
  const sb = useAnimatedStyle(() => ({ transform: [{ translateY: b.get() }] }));
  const sd = useAnimatedStyle(() => ({ transform: [{ translateY: d.get() }] }));
  const base = tone === 'warn' ? ['#fde68a', '#fcd34d', '#f59e0b'] : tone === 'done' ? ['#bbf7d0', '#86efac', '#34d399'] : ['#bfe0fb', '#8cc5f4', '#4f9fe3'];
  const cube = (style: object, color: string, size: number) => (
    <Animated.View style={[{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: color, boxShadow: '0 6px 12px -6px rgba(10,60,120,0.35), inset 0 2px 0 rgba(255,255,255,0.55)' }, style]} />
  );
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={st.link}>
      {cube(sa, base[0], 26)}
      {cube(sb, base[1], 30)}
      {cube(sd, base[2], 34)}
    </View>
  );
}

/* ----------------------------- 훈련 칸 ----------------------------- */

export function MechanicsTraining({
  data,
  fresh,
  reload,
  openGear,
  c,
}: {
  data: AppMechanicsProgramTab;
  fresh: boolean;
  reload: Reload;
  openGear: () => void;
  c: Palette;
}) {
  const { program, session, doneToday, painFold } = data;
  const [unfolded, setUnfolded] = useState(false);
  const [detail, setDetail] = useState<AppSessionDrill | null>(null);
  const [respondOpen, setRespondOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  if (!program) return null;
  /* 받아 둔 값이 다른 날 것이면 오늘 시작 · 기록을 열지 않는다 — 새로 받은 뒤에 연다 */
  const stale = !fresh && data.today !== deviceDay();
  const level = program.level ? mechanicsLevel(program.level) : null;
  const rx = program.focus && !program.focus.finished ? program.focus : null;
  const skill = rx?.skill ?? null;
  const done = new Set(doneToday);
  const folding = painFold != null && !(unfolded && painFold.canUnfold);
  const anyway = painFold != null && unfolded && painFold.canUnfold;
  const { open, folded } = foldSession(session, folding ? painFold : null);
  const savedNow = open.filter((d) => done.has(d.guideId)).length;
  const firstLeft = open.find((d) => !done.has(d.guideId)) ?? null;
  const { label } = labelOf(program.focus, program.level, program.index);
  const pending = skill?.elements.find((e) => e.evidenceId && e.canRespond && !e.finished && (e.response == null || e.response === 'unknown')) ?? null;
  const startHref = anyway ? '/mechanics?anyway=1' : '/mechanics';
  const completed12 = program.week == null && !rx;

  let m: CardModel;
  if (stale)
    m = {
      eyebrow: data.today ? `${dayText(data.today)} 기준` : '이전에 불러온 내용',
      title: '어제 불러온 내용이에요',
      sub: '오늘 훈련을 시작하기 전에 최신 상태를 확인해 주세요.',
      meta: `${label} · 오늘 장비 · 수행 · 훈련 가능 여부 확인 전`,
      tone: 'warn',
      primary: { label: '새로고침', onPress: () => void reload() },
    };
  else if (completed12) m = { eyebrow: `${level?.name ?? ''} 연습`, title: `${SESSIONS_PER_LEVEL}회 연습을 마쳤어요`, sub: '다음 훈련은 아래에서 내용을 확인하고 직접 골라요.', tone: 'done' };
  else if (program.canFinalize)
    m = {
      eyebrow: '마무리 확인',
      title: '세션 완료를 확인해 주세요',
      sub: '수행 기록은 이미 남아 있어요. 다시 수행하지 않고 세션 마무리 상태만 확인해요.',
      meta: `필수 드릴 ${session.filter((d) => d.required !== false && done.has(d.guideId)).length}개 기록 저장됨`,
      tone: 'warn',
      primary: { label: '세션 완료 확인', onPress: () => go('/mechanics') },
    };
  else if (program.blockers.length > 0)
    m = {
      eyebrow: '구성 확인',
      title: '장비를 확인해 주세요',
      body: (
        <View style={{ gap: 4 }}>
          {program.blockers.map((b) => (
            <Text key={b} style={[st.body, { color: c.ink }]}>
              · {b}
            </Text>
          ))}
        </View>
      ),
      tone: 'warn',
      primary: { label: '장비 확인', onPress: openGear },
    };
  else if (painFold && folding)
    m =
      open.length === 0
        ? { eyebrow: '오늘 훈련', title: '오늘은 던지기 드릴을 쉬어요', sub: painFold.reason, tone: 'warn', primary: null }
        : open.every((d) => done.has(d.guideId))
          ? { eyebrow: '오늘 훈련', title: '할 수 있는 드릴은 마쳤어요', sub: MECHANICS_FOLD_TEXT.openDone, tone: 'done' }
          : {
              eyebrow: '오늘 훈련',
              title: '던지지 않는 드릴만 해요',
              sub: painFold.reason,
              meta: `가능한 드릴 ${open.length}개 · 던지기 제외`,
              tone: 'warn',
              primary: { label: savedNow > 0 ? '이어하기' : MECHANICS_FOLD_BUTTONS.openOnly, onPress: () => go('/mechanics') },
            };
  else if (pending && savedNow === 0)
    m = {
      eyebrow: '지난 훈련 확인',
      title: '다음 날 반응을 남겨 주세요',
      sub: `${pending.element} · ${pending.stage} 단계`,
      primary: { label: '반응 확인', onPress: () => setRespondOpen(true) },
      secondary: { label: '오늘 훈련 시작하기', onPress: () => go(startHref) },
    };
  else if (program.finishedToday && savedNow === 0)
    m = {
      eyebrow: dayText(program.lastFinish?.on ?? data.today),
      title: '오늘 훈련 끝',
      sub: program.lastFinish?.label ?? null,
      meta: program.lastFinish ? `${program.lastFinish.saved}개 드릴 수행 · 기록 저장됨` : '기록 저장됨',
      tone: 'done',
      primary: program.lastFinish
        ? { label: '수행 기록 보기', onPress: () => router.push(`/mechanics/done?id=${program.lastFinish!.attemptId}` as Href) }
        : null,
    };
  else if (savedNow > 0)
    m = {
      eyebrow: skill ? '3D 분석 기반 훈련' : '오늘 훈련',
      title: label,
      sub: firstLeft ? `다음 · ${firstLeft.title}` : null,
      meta: `${savedNow} / ${open.length}개 수행 · 진행 중`,
      primary: { label: '이어하기', onPress: () => go(startHref) },
    };
  else if (skill)
    m = {
      eyebrow: '3D 분석 기반 훈련',
      title: label.replace(/^3D 연계 · /, ''),
      sub: rx?.cue ? `동작 목표 · ${rx.cue}` : null,
      meta: `${open.length}개 드릴 · 동작 익히기`,
      primary: { label: '시작하기', onPress: () => go(startHref) },
    };
  else
    m = {
      eyebrow: rx ? '3D 리포트 처방' : '오늘 훈련',
      title: label,
      sub: level?.line ?? null,
      meta: `${open.length}개 드릴 · 준비`,
      primary: { label: anyway ? MECHANICS_FOLD_BUTTONS.anyway : '시작하기', onPress: () => go(startHref) },
    };

  const listTitle = program.finishedToday && savedNow === 0 && !program.canFinalize ? '다음 훈련' : '훈련 구성';
  return (
    <View style={{ gap: 14 }}>
      <TodayCard m={m} c={c} />

      {/* 오늘 장비 한 줄 — 바꾸기는 시트에서(실제 저장은 그대로) */}
      <Press onPress={openGear} disabled={stale} accessibilityRole="button" accessibilityHint="오늘 사용할 장비를 바꿔요" style={st.gear}>
        <SymbolView name="slider.horizontal.3" size={16} tintColor={c.muted} />
        <View style={{ flex: 1 }}>
          <Text style={[st.small, { color: c.muted }]}>오늘 사용 장비</Text>
          <Text style={[st.smallBold, { color: c.ink }]}>{program.equipment.length ? program.equipment.join(' · ') : '맨몸 · 야구공'}</Text>
        </View>
        <Text style={[st.smallBold, { color: stale ? c.muted : c.link }]}>변경</Text>
      </Press>

      {!completed12 && !stale && open.length + folded.length > 0 ? (
        <View style={{ gap: 8 }}>
          <View style={st.between}>
            <Text accessibilityRole="header" style={[st.section, { color: c.ink }]}>
              {listTitle}
            </Text>
            <Text style={[st.small, { color: c.muted }]}>{open.length}개</Text>
          </View>
          <View style={[st.list, { backgroundColor: c.card, boxShadow: c.float }]}>
            {open.map((d, i) => {
              const saved = done.has(d.guideId) && !(program.finishedToday && savedNow === 0);
              return (
                <Press
                  key={d.guideId}
                  onPress={() => setDetail(d)}
                  accessibilityRole="button"
                  accessibilityHint="드릴 상세를 열어요"
                  style={[st.drill, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}
                >
                  <View style={[st.num, { backgroundColor: saved ? c.sky : c.skyTint }]}>
                    {saved ? <SymbolView name="checkmark" size={11} weight="bold" tintColor="#fff" /> : <Text style={[st.smallBold, { color: c.link }]}>{i + 1}</Text>}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[st.drillTitle, { color: c.ink }]}>{d.title}</Text>
                    <Text style={[st.small, { color: c.muted }]}>
                      {doseLabel(d.dose)}
                      {d.required === false ? ' · 선택' : ''}
                      {saved ? ' · 저장됨' : ''}
                      {anyway && isArmLoaded(d.category) ? ` · ${MECHANICS_FOLD_TEXT.loadedTag}` : ''}
                    </Text>
                  </View>
                  <SymbolView name="chevron.right" size={12} tintColor={c.muted} />
                </Press>
              );
            })}
          </View>
          {folding && folded.length > 0 ? (
            <View style={[st.foldBox, { borderColor: c.line }]}>
              <Text style={[st.small, { color: c.muted, flex: 1 }]}>
                던지기 드릴 {folded.length}개는 구성에서 제외했어요 · {folded.map((f) => f.title).join(' · ')}
              </Text>
              {painFold?.canUnfold ? (
                <Press onPress={() => setUnfolded(true)} accessibilityRole="button" style={[st.chip, { backgroundColor: c.chip }]}>
                  <Text style={[st.smallBold, { color: c.ink }]}>{MECHANICS_FOLD_BUTTONS.unfold}</Text>
                </Press>
              ) : null}
            </View>
          ) : null}
          {anyway && painFold ? (
            <View style={[st.foldBox, { borderColor: c.warnLine, backgroundColor: c.warnBg }]}>
              <Text style={[st.smallBold, { color: c.warn, flex: 1 }]}>{MECHANICS_FOLD_TEXT.anyway(painFold.label)}</Text>
              <Press onPress={() => setUnfolded(false)} accessibilityRole="button" style={st.textBtn}>
                <Text style={[st.smallBold, { color: c.warn }]}>{MECHANICS_FOLD_BUTTONS.refold}</Text>
              </Press>
            </View>
          ) : null}
          {listTitle === '다음 훈련' && open.length > 0 ? (
            <Press onPress={() => go(startHref)} accessibilityRole="button" style={st.textBtn}>
              <Text style={[st.smallBold, { color: c.link }]}>다음 훈련 시작하기</Text>
            </Press>
          ) : null}
        </View>
      ) : null}

      {/* 진도 — 3D 연계는 학습 단계(기초 · 연결 · 통합), 수준 연습은 12회 순서. 하나로 합치지 않는다 */}
      {skill ? (
        <View style={[st.card, { backgroundColor: c.card, boxShadow: c.float }]}>
          {skill.elements.map((e) => (
            <View key={e.fault} style={{ gap: 8 }}>
              <Text style={[st.bodyBold, { color: c.ink }]}>{e.element} 학습 단계</Text>
              <View style={st.stages} accessibilityLabel={`${e.element} 지금 ${e.stage} 단계${e.finished ? ', 자가 확인 완료' : ''}`}>
                {SKILL_STAGES.map((sg) => {
                  const on = sg === e.stage;
                  return (
                    <View key={sg} style={[st.stage, { backgroundColor: on ? c.skyTint : c.chip, borderColor: on ? c.sky : 'transparent' }]}>
                      <Text style={[st.smallBold, { color: on ? c.link : c.muted }]}>{sg}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          ))}
          <Text style={[st.small, { color: c.muted }]}>자가 확인 기준 · 3D 측정 결과와 구분해요.</Text>
        </View>
      ) : level && !rx ? (
        <View style={[st.card, { backgroundColor: c.card, boxShadow: c.float }]}>
          <View style={st.between}>
            <Text style={[st.bodyBold, { color: c.ink }]}>{level.name} 연습 순서</Text>
            <Text style={[st.small, { color: c.muted }]} accessibilityLabel={`${program.total}회 중 ${program.index}회 완료`}>
              <Text style={{ color: c.ink, fontWeight: '700' }}>{program.index}</Text> / {program.total}회
            </Text>
          </View>
          <View style={st.segments}>
            {Array.from({ length: program.total }, (_, i) => (
              <View key={i} style={[st.segment, { backgroundColor: i < program.index ? c.sky : i === program.index ? c.sky + '55' : c.chip }]} />
            ))}
          </View>
          <View style={st.between}>
            <Text style={[st.small, { color: c.muted }]}>완료한 연습 횟수</Text>
            <Press onPress={() => setProgressOpen(true)} accessibilityRole="button" style={st.textBtn}>
              <Text style={[st.smallBold, { color: c.link }]}>진행 보기</Text>
            </Press>
          </View>
        </View>
      ) : null}

      {detail ? <DrillDetailSheet drill={detail} onClose={() => setDetail(null)} c={c} /> : null}
      {respondOpen && pending && skill ? (
        <RespondSheet runId={skill.id} element={pending} reload={reload} onClose={() => setRespondOpen(false)} c={c} />
      ) : null}
      {progressOpen && level ? (
        <Sheet fit open onClose={() => setProgressOpen(false)} title={`${level.name} 연습 순서`} c={c}>
          <View style={{ gap: 10 }}>
            <Text style={[st.body, { color: c.ink }]}>12회 연습 순서예요. 주간 의무 횟수나 실력 점수가 아니에요.</Text>
            <Text style={[st.body, { color: c.muted }]}>{level.what}</Text>
            <Text style={[st.bodyBold, { color: c.ink }]}>
              {program.index}회 완료 · {Math.min(program.index + 1, program.total)}번째 훈련 차례
            </Text>
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}

/** 드릴 상세 — 목표량 · 분류 · 장비 · 동작 목표 · 시범 영상(누를 때 하나만) · 자세 설명 · 즐겨찾기. 목표량은 실제 기록과 구분한다 */
function DrillDetailSheet({ drill: d, onClose, c }: { drill: AppSessionDrill; onClose: () => void; c: Palette }) {
  return (
    <Sheet fit open onClose={onClose} title={d.title} c={c}>
      <View style={{ gap: 12 }}>
        <View style={[st.between, { alignItems: 'flex-start' }]}>
          <View style={{ flex: 1, gap: 0 }}>
            {(
              [
                ['목표 수행량', doseLabel(d.dose)],
                ['분류', `${d.element} · ${d.stage} · ${d.required === false ? '선택' : '필수'}`],
                ['장비', d.tool],
              ] as const
            ).map(([k, v]) => (
              <View key={k} style={[st.kv, { borderBottomColor: c.line }]}>
                <Text style={[st.body, { color: c.muted, flex: 1 }]}>{k}</Text>
                <Text style={[st.bodyBold, { color: c.ink, flexShrink: 1, textAlign: 'right' }]}>{v}</Text>
              </View>
            ))}
          </View>
          <Star kind="drill" id={d.video.id} initial={d.video.favorite} title={d.title} c={c} />
        </View>
        {d.gearNote?.replaced ? (
          <Text style={[st.small, { color: c.muted }]}>
            ‘{d.gearNote.replaced}’에는 {d.gearNote.need}
            {josa(d.gearNote.need, '이/가')} 있어야 해서 같은 단계의 이 드릴로 바꿨어요.
          </Text>
        ) : null}
        {d.cue ? (
          <View style={[st.goal, { backgroundColor: c.skyTint }]}>
            <Text style={[st.smallBold, { color: c.link }]}>동작 목표</Text>
            <Text style={[st.bodyBold, { color: c.ink }]}>{d.cue}</Text>
          </View>
        ) : null}
        <ExerciseMedia compact path={d.video.videoPath} referenceVideoId={d.video.referenceVideoId} thumbUrl={d.video.thumbUrl} aspectRatio={d.video.aspectRatio} c={c} />
        <Description guideId={d.guideId} c={c} />
        <Text style={[st.small, { color: c.muted }]}>목표량은 안내예요. 실제 수행량은 드릴을 마친 뒤 직접 적어요.</Text>
      </View>
    </Sheet>
  );
}

/** 다음 날 반응 — 저장만 한다. 이것으로 학습 단계 · 난이도 · 훈련 횟수가 바뀌지 않는다(단계 전환은 3D 처방 카드의 따로 된 단추) */
function RespondSheet({
  runId,
  element,
  reload,
  onClose,
  c,
}: {
  runId: string;
  element: { evidenceId: string | null; element: string; stage: string; practiceOn: string | null };
  reload: Reload;
  onClose: () => void;
  c: Palette;
}) {
  const [pick, setPick] = useState<'clear' | 'pain' | 'unknown' | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    if (!pick || pending || !element.evidenceId) return;
    setPending(true);
    setError(null);
    const r = await act<{ ok: true }>('mechanics.recordMechanicsNextDay', { runId, evidenceId: element.evidenceId, response: pick });
    setPending(false);
    if ('error' in r) return setError(r.error);
    void Haptics.selectionAsync();
    await reload();
    onClose();
  };
  return (
    <Sheet
      fit
      open
      onClose={onClose}
      title="다음 날 반응"
      description={`${element.practiceOn ? `${Number(element.practiceOn.slice(5, 7))}월 ${Number(element.practiceOn.slice(8, 10))}일 · ` : ''}${element.element}`}
      c={c}
    >
      <View style={{ gap: 10 }}>
        <Text style={[st.body, { color: c.ink }]}>훈련 다음 날 반응을 남겨요.</Text>
        {(
          [
            { v: 'clear', label: '통증 없었어요' },
            { v: 'pain', label: '통증 있었어요' },
            { v: 'unknown', label: '아직 확인하지 못했어요' },
          ] as const
        ).map((x) => (
          <Press
            key={x.v}
            onPress={() => setPick(x.v)}
            accessibilityRole="radio"
            accessibilityState={{ checked: pick === x.v }}
            style={[st.option, { borderColor: pick === x.v ? c.sky : c.line, backgroundColor: pick === x.v ? c.skyTint : c.card }]}
          >
            <Text style={[st.bodyBold, { color: pick === x.v ? c.link : c.ink }]}>{x.label}</Text>
          </Press>
        ))}
        <Press onPress={() => void save()} disabled={!pick || pending} accessibilityRole="button" style={[st.primary, { backgroundColor: c.action, opacity: !pick || pending ? 0.5 : 1 }]}>
          <Text style={[st.primaryText, { color: c.onAction }]}>{pending ? '저장하는 중…' : '반응 저장'}</Text>
        </Press>
        <Text style={[st.small, { color: c.muted }]}>저장해도 다음 단계로 자동 전환되지 않아요.</Text>
        {error ? <Text style={[st.small, { color: c.danger }]}>{error}</Text> : null}
      </View>
    </Sheet>
  );
}

/* ----------------------------- 미시작 · 난이도 ----------------------------- */

/** 미시작 — 난이도는 고르고 확인해야 등록된다(저절로 고르거나 등록하지 않는다) */
export function MechanicsStart({ reload, fresh, c }: { reload: Reload; fresh: boolean; c: Palette }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TodayCard
        m={{
          eyebrow: '처음 시작',
          title: '어디서 시작할까요?',
          sub: '나에게 맞는 난이도를 골라요. 오늘 던지는 양과 세기는 투구 계획을 따라요.',
          primary: fresh ? { label: '난이도 고르기', onPress: () => setOpen(true) } : null,
          meta: fresh ? null : '최신 상태를 확인한 뒤 고를 수 있어요.',
        }}
        c={c}
      />
      {open ? <LevelPickSheet reload={reload} onClose={() => setOpen(false)} c={c} /> : null}
    </>
  );
}

function LevelPickSheet({ reload, onClose, c }: { reload: Reload; onClose: () => void; c: Palette }) {
  const [pick, setPick] = useState<LevelKey | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chosen = pick ? mechanicsLevel(pick) : null;
  const start = async () => {
    if (!pick || pending) return;
    setPending(true);
    setError(null);
    const r = await act<{ ok: true }>('mechanics.startMechanicsProgram', pick);
    setPending(false);
    if ('error' in r) return setError(r.error);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await reload();
    onClose();
  };
  return (
    <Sheet
      fit
      open
      onClose={onClose}
      title="난이도 고르기"
      description="학습 난이도를 골라요. 오늘 던지는 양 · 세기는 투구 계획을 따라요."
      c={c}
      footer={
        <Press onPress={() => void start()} disabled={!pick || pending} accessibilityRole="button" style={[st.primary, { backgroundColor: c.action, opacity: !pick || pending ? 0.5 : 1 }]}>
          <Text style={[st.primaryText, { color: c.onAction }]}>
            {pending ? '시작하는 중…' : chosen ? `${chosen.name}${josa(chosen.name, '으로/로')} 시작하기` : '난이도를 골라 주세요'}
          </Text>
        </Press>
      }
    >
      <View style={{ gap: 8 }} accessibilityRole="radiogroup">
        {MECHANICS_LEVELS.map((lv) => {
          const on = pick === lv.key;
          return (
            <Press
              key={lv.key}
              onPress={() => setPick(lv.key)}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              style={[st.option, { borderColor: on ? c.sky : c.line, backgroundColor: on ? c.skyTint : c.card, gap: 4 }]}
            >
              <Text style={[st.bodyBold, { color: on ? c.link : c.ink }]}>{lv.name}</Text>
              <Text style={[st.small, { color: c.muted }]}>{lv.line}</Text>
              {on ? (
                <>
                  <Text style={[st.small, { color: c.ink }]}>{lv.who}</Text>
                  <Text style={[st.small, { color: c.muted }]}>{lv.what}</Text>
                </>
              ) : null}
            </Press>
          );
        })}
        {error ? <Text style={[st.small, { color: c.danger }]}>{error}</Text> : null}
      </View>
    </Sheet>
  );
}

/* ----------------------------- 관리 · 장비 ----------------------------- */

/** 관리(…) — 난이도 변경 · 이전 3D 훈련 · 처음부터 다시 하기. 바꾸면 진행이 어떻게 되는지 먼저 알리고 묻는다(기록은 지우지 않는다) */
export function ManageSheet({ program, fresh, reload, onClose, c }: { program: MechanicsProgramView | null; fresh: boolean; reload: Reload; onClose: () => void; c: Palette }) {
  const [view, setView] = useState<'menu' | 'level' | 'history'>('menu');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reset = () =>
    Alert.alert('처음부터 다시 할까요?', '난이도 고르기로 돌아가요. 지금까지 한 드릴 기록 · 투구 기록 · 완료 기록은 남아요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '처음부터',
        style: 'destructive',
        onPress: async () => {
          setPending(true);
          setError(null);
          const res = await act<{ ok: true }>('mechanics.resetMechanicsProgram');
          setPending(false);
          if ('error' in res) return setError(res.error);
          await reload();
          onClose();
        },
      },
    ]);
  const row = (label: string, onPress: () => void, disabled = false, danger = false) => (
    <Press key={label} onPress={onPress} disabled={disabled} accessibilityRole="button" style={[st.menuRow, { borderBottomColor: c.line, opacity: disabled ? 0.5 : 1 }]}>
      <Text style={[st.bodyBold, { color: danger ? c.danger : c.ink, flex: 1 }]}>{label}</Text>
      <SymbolView name="chevron.right" size={12} tintColor={c.muted} />
    </Press>
  );
  return (
    <Sheet fit open onClose={onClose} title={view === 'level' ? '난이도 변경' : view === 'history' ? '이전 3D 훈련' : '훈련 관리'} c={c}>
      {view === 'menu' ? (
        <View>
          {!fresh ? <Text style={[st.small, { color: c.muted, paddingBottom: 8 }]}>최신 상태를 확인한 뒤 바꿀 수 있어요.</Text> : null}
          {program?.level ? row('난이도 변경', () => setView('level'), !fresh) : null}
          {row('이전 3D 훈련', () => setView('history'))}
          {program?.level ? row(pending ? '되돌리는 중…' : '처음부터 다시 하기', reset, !fresh || pending, true) : null}
          {error ? <Text style={[st.small, { color: c.danger, paddingTop: 8 }]}>{error}</Text> : null}
        </View>
      ) : view === 'level' && program?.level ? (
        <View style={{ gap: 10 }}>
          <Text style={[st.small, { color: c.muted }]}>
            {program.index > 0 ? `바꾸면 그 난이도의 1번째 훈련부터 시작해요. 지금까지 한 드릴 기록과 완료 기록은 남아요.` : '아직 마친 훈련이 없어요.'}
          </Text>
          <LevelPicker current={program.level} index={program.index} reload={reload} c={c} />
        </View>
      ) : (
        <FocusHistory history={program?.history ?? []} reload={reload} c={c} />
      )}
    </Sheet>
  );
}

/** 오늘 장비 바꾸기 — 실제 저장은 그대로(saveMechanicsEquipment). 진행 중 세션의 배정 · 필수는 바뀌지 않는다고 알린다 */
export function GearSheet({ program, reload, onClose, c }: { program: MechanicsProgramView; reload: Reload; onClose: () => void; c: Palette }) {
  return (
    <Sheet fit open onClose={onClose} title="오늘 사용할 장비" description="맨몸 · 야구공은 기본이에요. 추가로 사용할 장비를 골라요." c={c}>
      <View style={{ gap: 10 }}>
        {program.activeAttempt ? (
          <Text style={[st.small, { color: c.muted }]}>진행 중인 훈련의 드릴 구성과 필수 드릴은 그대로예요. 바뀐 장비는 다음 훈련부터 반영돼요.</Text>
        ) : null}
        <MechanicsEquipment
          key={program.equipment.join(',')}
          equipment={program.equipment}
          reload={async () => {
            await reload();
            onClose();
          }}
          c={c}
        />
      </View>
    </Sheet>
  );
}

const st = StyleSheet.create({
  today: { borderRadius: 26, padding: 20, gap: 14 },
  todayTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  eyebrow: { fontSize: 13, fontWeight: '700' },
  todayTitle: { fontSize: 26, fontWeight: '800', lineHeight: 32 },
  metaText: { fontSize: 15, fontWeight: '700', lineHeight: 21 },
  link: { width: 84, height: 70, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'flex-end', gap: 2 },
  primary: { minHeight: 52, borderRadius: 18, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  primaryText: { fontSize: 17, fontWeight: '700' },
  textBtn: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 4 },
  gear: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12 },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  section: { fontSize: 20, fontWeight: '800' },
  list: { borderRadius: 22, paddingHorizontal: 14 },
  drill: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  drillTitle: { fontSize: 17, fontWeight: '700', lineHeight: 23 },
  num: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  foldBox: { borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  chip: { minHeight: 40, borderRadius: 20, paddingHorizontal: 14, justifyContent: 'center' },
  card: { borderRadius: 22, padding: 16, gap: 10 },
  segments: { flexDirection: 'row', gap: 3 },
  segment: { flex: 1, height: 6, borderRadius: 3 },
  stages: { flexDirection: 'row', gap: 6 },
  stage: { flex: 1, minHeight: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  kv: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  goal: { borderRadius: 16, padding: 14, gap: 4 },
  option: { minHeight: 52, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center' },
  menuRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  small: { fontSize: 13, lineHeight: 19 },
  smallBold: { fontSize: 13, fontWeight: '600', lineHeight: 19 },
  body: { fontSize: 15, lineHeight: 22 },
  bodyBold: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
});
