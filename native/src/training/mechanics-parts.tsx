import { FocusReview } from '~/mechanics/focus-review';
import { FocusProgress } from '~/mechanics/focus-progress';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { type Href, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Thumb } from '~/lib/thumb';
import { josa } from '@/lib/korean';
import { DRILL_STAGES } from '@/lib/exercise-meta';
import { MECHANICS_ELEMENTS, MECHANICS_OVERVIEW, MECHANICS_SOURCE_NOTE, MECHANICS_SYMPTOMS, sideText, type MechanicsElement } from '@/lib/mechanics/elements';
import { MECHANICS_LEVELS, PER_WEEK, WEEKS, mechanicsLevel, type LevelKey, type MechanicsLevel } from '@/lib/mechanics/levels';
import {
  FILM_EVERY,
  FILM_VERDICTS,
  RX_LEVEL_TEXT,
  RX_REPORT_TEXT,
  filmPrompt,
  type FilmNote,
  type FocusView,
} from '@/lib/mechanics/program';
import type { MechanicsDrillView } from '@/lib/mechanics/drills';
import type { ElementReportView, MechanicsProgramView } from '@/lib/mechanics/load';
import { ExerciseMedia } from '~/armcare/parts';
import { act, Description, FilmVerdictButtons, leave } from '~/mechanics/parts';
import type { Palette } from '~/lib/ui';
import { Fold, s } from './screen';
import { Star } from './fav-button';
import { Sheet } from '~/workout/sheets';
import { Press } from '~/shell/press';
import { TYPE } from '~/lib/ui';
import { Icon } from '~/shell/icon';

/**
 * 메카닉 전체 화면(native/src/app/training-mechanics.tsx)의 조각 — 웹 mechanics-program.tsx(오늘의 세션 · 수준 고르기 · 12칸 · 영상으로 확인)와
 * mechanics-guide.tsx · mechanics-drill.tsx(요소별 드릴)를 옮겼다. 시작은 앱 따라 하기(/mechanics, '그래도 하기'면 ?anyway=1 — 웹과 같은 주소),
 * 수준 바꾸기 · 처음부터 · 견준 결과는 웹과 같은 서버 동작(mechanics.*).
 */

type Reload = () => Promise<void>;

/** 수준 바꾸기 — 성공하면 화면을 다시 받는다(웹 useStartLevel) */
function useStartLevel(reload: Reload) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const start = async (key: LevelKey) => {
    if (pending) return;
    setPending(true);
    setError(null);
    const res = await act<{ ok: true }>('mechanics.startMechanicsProgram', key);
    if ('error' in res) setError(res.error);
    else {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await reload();
    }
    setPending(false);
  };
  return { start, pending, error };
}

/** 큰 단추 — 하늘색(주) · 회색(다음) */
function Btn({
  label,
  onPress,
  disabled,
  primary = true,
  c,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  primary?: boolean;
  c: Palette;
}) {
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      style={[s.pill, { backgroundColor: primary ? c.sky : c.chip, opacity: disabled ? 0.6 : 1 }]}
    >
      <Text style={[s.bodyBold, { color: primary ? '#fff' : c.ink }]}>{label}</Text>
    </Press>
  );
}

/** 투구의 흐름 · 왜 순서가 중요한가 · 이렇게 쓰세요(웹 OverviewDetail) */
export function OverviewDetail({ c }: { c: Palette }) {
  return (
    <View style={{ gap: 12 }}>
      <Text style={[TYPE.reading, { color: c.ink }]}>{MECHANICS_OVERVIEW.lead}</Text>
      <View style={{ gap: 6 }}>
        {MECHANICS_ELEMENTS.map((el) => (
          <View key={el.key} style={[s.row, { gap: 8, alignItems: 'flex-start' }]}>
            <Num n={el.order} c={c} />
            <Text style={[TYPE.reading, { color: c.ink, flex: 1 }]}>
              <Text style={{ color: c.ink, fontWeight: '700' }}>{el.name}</Text> {el.line}
            </Text>
          </View>
        ))}
      </View>
      <Text style={[s.bodyBold, { color: c.ink }]}>왜 순서가 중요한가요</Text>
      <Text style={[TYPE.reading, { color: c.ink }]}>{MECHANICS_OVERVIEW.whyOrder}</Text>
      <Text style={[s.bodyBold, { color: c.ink }]}>이렇게 쓰세요</Text>
      {MECHANICS_OVERVIEW.howTo.map((h, i) => (
        <Text key={h} style={[TYPE.reading, { color: c.ink }]}>
          {i + 1}. {h}
        </Text>
      ))}
      <Text style={[s.tiny, { color: c.muted }]}>{MECHANICS_SOURCE_NOTE}</Text>
    </View>
  );
}

export function OverviewFold({ c }: { c: Palette }) {
  return (
    <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float, paddingVertical: 6 }]}>
      <Fold label="투구의 흐름 · 왜 순서가 중요한가요" c={c}>
        <OverviewDetail c={c} />
      </Fold>
    </View>
  );
}

function Num({ n, done, c }: { n: number; done?: boolean; c: Palette }) {
  return (
    <View style={[st.num, { backgroundColor: done ? c.sky : c.sky + '1a' }]}>
      {done ? (
        <SymbolView name="checkmark" size={11} weight="bold" tintColor="#fff" />
      ) : (
        <Text style={[s.smallBold, { color: c.link }]}>{n}</Text>
      )}
    </View>
  );
}

/* ----------------------------- 프로그램 칸 ----------------------------- */

/** 수준 고르기 — 카드 넷. 하던 중에 바꾸면 한 번 묻는다(진행이 처음으로) */
export function LevelPicker({ current, index, reload, c }: { current: LevelKey | null; index: number; reload: Reload; c: Palette }) {
  const { start, pending, error } = useStartLevel(reload);
  const choose = (lv: MechanicsLevel) => {
    if (current && index > 0) {
      Alert.alert('수준을 바꿀까요?', `${lv.name} 1번 세션부터 시작해요. 지금까지 한 드릴 기록은 남아요.`, [
        { text: '취소', style: 'cancel' },
        { text: '바꾸기', onPress: () => void start(lv.key) },
      ]);
    } else void start(lv.key);
  };
  return (
    <View style={{ gap: 10 }}>
      {MECHANICS_LEVELS.map((lv, i) => {
        const on = lv.key === current;
        return (
          <View
            key={lv.key}
            style={[s.card, { backgroundColor: c.card, boxShadow: c.float, borderWidth: 1, borderColor: on ? c.sky : c.line }]}
          >
            <View style={[s.row, { alignItems: 'flex-start' }]}>
              <View style={[st.bigNum, { backgroundColor: c.sky + '1a' }]}>
                <Text style={[s.bodyBold, { color: c.link }]}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={[s.body, { color: c.muted }]}>
                  <Text style={{ color: c.ink, fontWeight: '700', fontSize: 17 }}>{lv.name}</Text> {lv.line}
                </Text>
                <Text style={[s.small, { color: c.ink }]}>{lv.who}</Text>
                <Fold label="자세히" c={c}>
                  <Text style={[s.small, { color: c.muted }]}>{lv.what}</Text>
                  <Text style={[s.small, { color: c.muted }]}>첫 세션: {lv.blocks[0][0].join(' · ')}</Text>
                </Fold>
              </View>
            </View>
            {on ? (
              <Text style={[s.bodyBold, { color: c.link }]}>✓ 지금 하는 수준이에요</Text>
            ) : (
              <Btn
                label={current ? `${lv.name}${josa(lv.name, '으로/로')} 바꾸기` : `${lv.name} 시작`}
                primary={!current}
                disabled={pending}
                onPress={() => choose(lv)}
                c={c}
              />
            )}
          </View>
        );
      })}
      {error ? <Text style={[s.small, { color: c.danger }]}>{error}</Text> : null}
    </View>
  );
}

/* ----------------------------- 3D 리포트 처방 ----------------------------- */

type FocusOffer = { reportId: string; jobId: string; rx: { element: string; level: 'improve' | 'edge' }[] };

/** 요소 칩 '브레이크 집중' · '몸통 회전 보조'(웹 RxChips) */
function RxChips({ rx, c }: { rx: FocusOffer['rx']; c: Palette }) {
  return (
    <View style={s.wrap}>
      {rx.map((r) => (
        <Text
          key={r.element}
          style={[s.smallBold, s.tag, { color: r.level === 'improve' ? '#fff' : c.sky, backgroundColor: r.level === 'improve' ? c.sky : c.sky + '1a' }]}
        >
          {r.element} {RX_LEVEL_TEXT[r.level]}
        </Text>
      ))}
    </View>
  );
}

const dayText = (key: string) => `${Number(key.slice(5, 7))}월 ${Number(key.slice(8, 10))}일`;

/** 처방 카드(프로그램 칸 맨 위, 웹 FocusCard) — 무엇을 · 몇 번째 · 느낌 신호 · 목표. 다 마치면 '다시 찍어 견줘요' */
export function FocusCard({ focus, reload, c }: { focus: FocusView; reload: Reload; c: Palette }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = async () => {
    if (pending) return;
    setPending(true);
    setError(null);
    const res = await act<{ ok: true }>('mechanics.endMechanicsFocus', { runId: focus.runId });
    if ('error' in res) setError(res.error);
    else await reload();
    setPending(false);
  };
  const askEnd = () =>
    Alert.alert('처방을 그만둘까요?', '지금 수준 프로그램의 드릴로 돌아가요. 수준 진행은 그대로예요.', [
      { text: '취소', style: 'cancel' },
      { text: '그만두기', style: 'destructive', onPress: () => void end() },
    ]);
  return (
    <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      <View style={s.between}>
        <Text style={[s.title, { color: c.ink }]}>3D 리포트 처방</Text>
        <Text style={[s.tiny, { color: c.muted }]}>{dayText(focus.startedOn)} 시작</Text>
      </View>
      <RxChips rx={focus.rx} c={c} />
      {focus.criteriaNote ? <Text style={[s.tiny, { color: c.warn }]}>{focus.criteriaNote}</Text> : null}
      <FocusProgress focus={focus} reload={reload} c={c} />
      <FocusReview focus={focus} reload={reload} c={c} />
      {!focus.skill &&
        (focus.finished ? (
          <>
            <Text style={[s.body, { color: c.ink }]}>처방을 마쳤어요. 같은 자리에서 다시 찍어 리포트와 견줘요.</Text>
            <Btn label="리포트 받기" onPress={() => router.push('/lab' as Href)} c={c} />
            <Btn label={pending ? '닫는 중…' : '처방 닫기'} primary={false} disabled={pending} onPress={() => void end()} c={c} />
          </>
        ) : (
          <>
            <View style={s.between}>
              <Text style={[s.bodyBold, { color: c.ink }]}>
                {focus.done} / {focus.total} 세션
              </Text>
              <Text style={[s.tiny, { color: c.muted }]}>
                {focus.week}주차{focus.stage ? ` · ${focus.stage}` : ''}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {Array.from({ length: focus.total }, (_, i) => (
                <View
                  key={i}
                  style={[st.cell, { height: 6, backgroundColor: i < focus.done ? c.sky : i === focus.done ? c.sky + '66' : c.chip }]}
                />
              ))}
            </View>
            {focus.cue ? <Text style={[s.bodyBold, s.box, { color: c.link, backgroundColor: c.sky + '14' }]}>“{focus.cue}”</Text> : null}
            {focus.target ? (
              <Text style={[s.small, { color: c.muted }]}>
                목표 {focus.target.label} {focus.target.now} → {focus.target.goal}
              </Text>
            ) : null}
            <View style={[s.between, { alignItems: 'center' }]}>
              <Press onPress={() => router.push(`/lab/${focus.reportId}` as Href)} accessibilityRole="button" style={s.textBtn}>
                <Text style={[s.smallBold, { color: c.link }]}>리포트 보기 ›</Text>
              </Press>
              <Press onPress={askEnd} accessibilityRole="button" style={s.textBtn}>
                <Text style={[s.tiny, { color: c.muted }]}>처방 그만두기</Text>
              </Press>
            </View>
          </>
        ))}
      {focus.skill && (
        <Press onPress={askEnd} accessibilityRole="button" style={s.textBtn}>
          <Text style={[s.tiny, { color: c.muted }]}>처방 그만두기</Text>
        </Press>
      )}
      {error ? <Text style={[s.small, { color: c.danger }]}>{error}</Text> : null}
    </View>
  );
}

/**
 * 3D 리포트 [처방 시작]에서 왔을 때(?focus=<리포트 번호>, 웹 FocusStartSheet) — 무엇을 3주 · 9세션 할지 보이고 시작. 수준이 없으면 같이 고른다.
 * 진행 중인 다른 처방은 새 처방으로 바뀐다고 먼저 알린다.
 */
export function FocusStartSheet({
  reportId,
  level,
  current,
  reload,
  onClose,
  c,
}: {
  reportId: string;
  level: LevelKey | null;
  current: FocusView | null;
  reload: Reload;
  onClose: () => void;
  c: Palette;
}) {
  const [offer, setOffer] = useState<FocusOffer | { error: string } | null>(null);
  const [pick, setPick] = useState<LevelKey | null>(level);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void act<FocusOffer>('mechanics.loadMechanicsFocusOffer', reportId).then((r) => alive && setOffer(r));
    return () => {
      alive = false;
    };
  }, [reportId]);
  const running = current && !current.finished ? current : null;
  const start = async () => {
    if (pending || !pick) return;
    setPending(true);
    setError(null);
    const res = await act<{ ok: true }>('mechanics.startMechanicsFocus', {
      reportId,
      level: pick,
      expectedRunId: current?.runId ?? null,
      expectedJobId: offer && !('error' in offer) ? offer.jobId : '',
    });
    if ('error' in res) {
      setError(res.error);
      setPending(false);
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await reload();
    onClose();
  };
  if (offer && 'error' in offer) {
    return (
      <Sheet fit open onClose={onClose} title="처방을 시작할 수 없어요" c={c}>
        <Text style={[s.body, { color: c.ink }]}>{offer.error}</Text>
        <Btn label="닫기" primary={false} onPress={onClose} c={c} />
      </Sheet>
    );
  }
  const what = offer ? offer.rx.map((r) => `${r.element} ${RX_LEVEL_TEXT[r.level]}`).join(' · ') : '';
  return (
    <Sheet
      fit
      open
      onClose={onClose}
      title="처방을 시작할까요?"
      c={c}
      footer={
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Btn label="나중에" primary={false} onPress={onClose} c={c} />
          </View>
          <View style={{ flex: 1 }}>
            <Btn label={pending ? '시작하는 중…' : '시작'} disabled={pending || !pick || !offer} onPress={() => void start()} c={c} />
          </View>
        </View>
      }
    >
      {!offer ? (
        <ActivityIndicator style={{ paddingVertical: 24 }} />
      ) : (
        <View style={{ gap: 14 }}>
          <RxChips rx={offer.rx} c={c} />
          <Text style={[s.body, { color: c.ink }]}>
            {what}
            {josa(what, '을/를')} 기초부터 연습해요. 필수 드릴·동작 목표·다음 날 반응을 확인하고 다음 단계를 선택해요.
          </Text>
          {running ? (
            <Text style={[s.bodyBold, s.box, { color: c.warn, backgroundColor: c.warnBg }]}>
              진행 중인 처방({running.rx[0]?.element} {running.done}/{running.total})은 새 처방으로 바뀌어요.
            </Text>
          ) : null}
          {!level ? (
            <View style={{ gap: 8 }}>
              <Text style={[s.bodyBold, { color: c.ink }]}>수준부터 골라요</Text>
              <View style={st.grid} accessibilityRole="radiogroup">
                {MECHANICS_LEVELS.map((lv) => {
                  const on = pick === lv.key;
                  return (
                    <Press
                      key={lv.key}
                      select
                      selected={on}
                      onPress={() => setPick(lv.key)}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: on }}
                      style={[
                        st.chainItem,
                        {
                          flexDirection: 'column',
                          alignItems: 'flex-start',
                          justifyContent: 'center',
                          gap: 2,
                          paddingVertical: 8,
                          borderWidth: 1,
                          borderColor: on ? c.sky : c.line,
                          backgroundColor: on ? c.sky + '14' : c.card,
                        },
                      ]}
                    >
                      <Text style={[s.bodyBold, { color: on ? c.sky : c.ink }]}>{lv.name}</Text>
                      <Text style={[s.tiny, { color: c.muted }]}>{lv.line}</Text>
                    </Press>
                  );
                })}
              </View>
            </View>
          ) : null}
          {error ? <Text style={[s.small, { color: c.danger }]}>{error}</Text> : null}
        </View>
      )}
    </Sheet>
  );
}

/** 12세션을 다 마쳤을 때 — 다음(또는 아래) 수준 · 한 번 더(웹 CompletedCard) */
export function CompletedCard({ program, reload, c }: { program: MechanicsProgramView; reload: Reload; c: Palette }) {
  const { start, pending, error } = useStartLevel(reload);
  const level = mechanicsLevel(program.level!);
  const advice = program.advice;
  const down = advice?.kind === 'down' && advice.to ? mechanicsLevel(advice.to) : null;
  const next = advice?.kind === 'done' && advice.to ? mechanicsLevel(advice.to) : null;
  const target = next ?? down;
  return (
    <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      <Text style={[s.title, { color: c.ink }]}>{level.name} 프로그램을 마쳤어요</Text>
      <Text style={[s.body, { color: c.muted }]}>
        {down
          ? `‘어려움’이 이어지는 요소가 있었어요. ${down.name}에서 자세를 다지거나, ${level.name}${josa(level.name, '을/를')} 한 번 더 해도 돼요.`
          : next
            ? `${WEEKS * PER_WEEK}번을 다 했어요. ${next.name}${josa(next.name, '으로/로')} 넘어가기 전 실제 투구에서 유지되는지와 다음 날 반응을 확인해요.`
            : `${WEEKS * PER_WEEK}번을 다 했어요. 횟수만으로 다음 수준을 정하지 않아요. 같은 조건의 영상·실제 투구·다음 날 반응을 확인해요.`}
      </Text>
      {target ? (
        <Btn label={pending ? '바꾸는 중…' : `${target.name} 시작`} disabled={pending} onPress={() => void start(target.key)} c={c} />
      ) : null}
      <Btn label={`${level.name} 한 번 더`} primary={!target} disabled={pending} onPress={() => void start(level.key)} c={c} />
      {error ? <Text style={[s.small, { color: c.danger }]}>{error}</Text> : null}
    </View>
  );
}

/** 영상으로 확인 — 첫 세션 전 · 6번째마다(웹 FilmCard). 견준 기록은 쌓인다 */
export function FilmCard({ sessionsDone, films, c }: { sessionsDone: number; films: FilmNote[]; c: Palette }) {
  const kind = filmPrompt(sessionsDone);
  const current = films.find((f) => f.session === sessionsDone) ?? null;
  if (!kind && films.length === 0) return null;
  if (!kind) {
    return (
      <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float }]}>
        <Text style={[s.bodyBold, { color: c.ink, fontSize: 17 }]}>견준 기록</Text>
        <FilmHistory films={films} c={c} />
      </View>
    );
  }
  return (
    <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      <View style={[s.row, { alignItems: 'flex-start' }]}>
        <View style={[st.bigNum, { backgroundColor: c.sky + '1a' }]}>
          <Icon name="video" size={17} color={c.sky} filled />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[s.bodyBold, { color: c.ink, fontSize: 17 }]}>
            {kind === 'baseline' ? '시작 전에 한 번 찍어 두세요' : '찍어서 처음과 견줘 볼 때예요'}
          </Text>
          <Text style={[s.body, { color: c.muted }]}>
            {kind === 'baseline'
              ? `세션 ${FILM_EVERY}번 뒤에 이 영상과 견줘 봐요.`
              : `세션 ${sessionsDone}번을 했어요. 처음 영상과 견줘 봐요.`}
          </Text>
          <Fold label="어떻게 찍나요" c={c}>
            <Text style={[s.small, { color: c.muted }]}>
              {kind === 'baseline'
                ? '옆에서 평소처럼 몇 개 던지는 모습을 찍어 투구 기록에 남겨요.'
                : '같은 자리에서 다시 찍어 처음 영상과 나란히 보세요. 구속도 재 두면 효과를 알 수 있어요.'}
            </Text>
          </Fold>
        </View>
      </View>
      <Btn
        label={kind === 'baseline' ? '투구 탭 열기' : '2분할 비교 열기'}
        primary={false}
        /* 투구 탭은 껍데기의 앱 탭(웹이 /videos 로 가면 앱 투구 탭), 2분할 비교는 앱 화면 */
        onPress={() => (kind === 'baseline' ? leave('/videos') : router.push('/pitch/compare' as Href))}
        c={c}
      />
      {kind === 'compare' ? (
        <View style={[st.divider, { borderTopColor: c.line }]}>
          <FilmVerdictButtons session={sessionsDone} current={current} c={c} />
        </View>
      ) : null}
      {films.some((f) => f.session !== sessionsDone) ? (
        <View style={[st.divider, { borderTopColor: c.line }]}>
          <FilmHistory films={films.filter((f) => f.session !== sessionsDone)} c={c} />
        </View>
      ) : null}
    </View>
  );
}

/** 견준 기록 한 줄씩 — '세션 6번 · 좋아졌어요 · 10/9' */
function FilmHistory({ films, c }: { films: FilmNote[]; c: Palette }) {
  const label = (v: FilmNote['verdict']) => FILM_VERDICTS.find((x) => x.value === v)?.label ?? v;
  return (
    <View style={{ gap: 4 }}>
      {films.map((f) => (
        <View key={f.session} style={s.between}>
          <Text style={[s.body, { color: c.ink }]}>
            세션 {f.session}번 ·{' '}
            <Text style={{ fontWeight: '700', color: f.verdict === 'better' ? c.sky : c.ink }}>{label(f.verdict)}</Text>
            {'\n'}
            <Text style={[s.tiny, { color: c.muted }]}>
              {f.comparable ? '촬영 조건 같음' : '촬영 조건 미확인'} · {f.transferred ? '실제 투구 확인' : '실제 투구 미확인'} ·{' '}
              {f.response === 'clear' ? '통증 없음' : f.response === 'pain' ? '통증 있음' : '운동 후 반응 미확인'}
            </Text>
          </Text>
          <Text style={[s.tiny, { color: c.muted }]}>
            {Number(f.on.slice(5, 7))}/{Number(f.on.slice(8, 10))}
          </Text>
        </View>
      ))}
    </View>
  );
}

/* ----------------------------- 요소별 드릴(웹 mechanics-guide.tsx · mechanics-drill.tsx) ----------------------------- */

/** 그 요소의 드릴 — 단계마다, 주 요소인 드릴 먼저 · 함께 쓰는 드릴 뒤에 */
function drillsFor(name: string, drills: MechanicsDrillView[]) {
  return DRILL_STAGES.map((stage) => {
    const inStage = drills.filter((d) => d.stage === stage.name && d.focusPoints.includes(name));
    return { stage, primary: inStage.filter((d) => d.focusPoints[0] === name), secondary: inStage.filter((d) => d.focusPoints[0] !== name) };
  });
}

/** 여섯 요소를 투구 차례대로 — 누르면 그 카드로 */
export function ElementChain({
  current,
  onPick,
  report = null,
  c,
}: {
  current: string | null;
  onPick: (name: string) => void;
  /** 3D 리포트 처방의 요소들 — 칩 끝에 점(고칠 점 진하게 · 경계 옅게) */
  report?: ElementReportView[] | null;
  c: Palette;
}) {
  return (
    <View style={st.grid}>
      {MECHANICS_ELEMENTS.map((el) => {
        const on = current === el.name;
        const r = report?.find((x) => x.element === el.name);
        return (
          <Press
            select
            selected={on}
            key={el.key}
            onPress={() => onPick(el.name)}
            accessibilityRole="button"
            accessibilityLabel={r ? `${el.name}, 내 리포트 ${RX_REPORT_TEXT[r.level]}` : undefined}
            accessibilityState={{ selected: on }}
            style={[st.chainItem, { backgroundColor: on ? c.sky : c.card }]}
          >
            <View style={[st.num, { backgroundColor: on ? 'rgba(255,255,255,0.25)' : c.sky + '1a' }]}>
              <Text style={[s.smallBold, { color: on ? '#fff' : c.sky }]}>{el.order}</Text>
            </View>
            <Text style={[s.bodyBold, { color: on ? '#fff' : c.ink, flexShrink: 1 }]}>{el.name}</Text>
            {r ? (
              <View
                style={[st.dot, { marginLeft: 'auto', backgroundColor: on ? '#fff' : c.warn, opacity: r.level === 'improve' ? 1 : 0.45 }]}
              />
            ) : null}
          </Press>
        );
      })}
    </View>
  );
}

export function SymptomChips({ onPick, c }: { onPick: (symptom: (typeof MECHANICS_SYMPTOMS)[number]) => void; c: Palette }) {
  return (
    <View style={s.wrap}>
      {MECHANICS_SYMPTOMS.map((sym) => (
        <Press key={sym.text} onPress={() => onPick(sym)} accessibilityRole="button" style={[s.chip, { backgroundColor: c.card }]}>
          <Text style={[s.smallBold, { color: c.ink }]}>{sym.text}</Text>
        </Press>
      ))}
    </View>
  );
}

/** 칩에는 첫 문장만 — 첫 마침표 앞, 마침표 없이 */
const shortFault = (text: string) => text.split('. ')[0].replace(/\.$/, '');

/** 요소 하나 자세히 — 무엇 · 왜 · 잘될 때 · 증상 · 확인하기 · 느낌 신호 */
function ElementDetail({ el, hand, c }: { el: MechanicsElement; hand: string | null; c: Palette }) {
  const t = (x: string) => sideText(x, hand);
  const part = (title: string, body: string | string[]) => (
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={[s.bodyBold, { color: c.ink }]}>{title}</Text>
      {(Array.isArray(body) ? body : [body]).map((b) => (
        <Text key={b} style={[TYPE.reading, { color: c.ink }]}>
          {Array.isArray(body) ? '· ' : ''}
          {t(b)}
        </Text>
      ))}
    </View>
  );
  return (
    <View style={{ gap: 12 }}>
      {part('무엇인가요', el.what)}
      {part('왜 중요한가요', el.why)}
      {part('잘될 때 모습', el.good)}
      {part('이런 증상이 있으면', el.faults)}
      {part('스스로 확인하기', el.check)}
      <Text style={[s.bodyBold, { color: c.ink }]}>느낌 신호</Text>
      {el.cues.map((cue) => (
        <Text key={cue} style={[s.bodyBold, s.box, { color: c.link, backgroundColor: c.sky + '14' }]}>
          “{cue}”
        </Text>
      ))}
      <Text style={[s.tiny, { color: c.muted }]}>{MECHANICS_SOURCE_NOTE}</Text>
    </View>
  );
}

/** 요소 카드 — 접힌 머리(차례 · 이름 · 드릴 수 · 한 줄), 펼치면 함께 볼 요소 · 증상 칩 · 자세히 · 단계별 드릴 */
export function ElementCard({
  el,
  drills,
  hand,
  open,
  via,
  onToggle,
  onElement,
  onLayout,
  report = null,
  c,
}: {
  el: MechanicsElement;
  drills: MechanicsDrillView[];
  hand: string | null;
  /** 이 요소의 3D 리포트 처방 — 펼치면 맨 위에 '내 리포트' 한 줄 · 처방 드릴 */
  report?: ElementReportView | null;
  open: boolean;
  via: (typeof MECHANICS_SYMPTOMS)[number] | null;
  onToggle: () => void;
  onElement: (name: string) => void;
  onLayout: (e: LayoutChangeEvent) => void;
  c: Palette;
}) {
  const stages = drillsFor(el.name, drills);
  const count = stages.reduce((n, x) => n + x.primary.length + x.secondary.length, 0);
  return (
    <View onLayout={onLayout} style={[st.card, { backgroundColor: c.card, boxShadow: c.float, borderColor: open ? c.sky + '66' : c.line }]}>
      <Press onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} style={st.cardHead}>
        <View style={[st.bigNum, { backgroundColor: c.sky + '1a', width: 28, height: 28 }]}>
          <Text style={[s.smallBold, { color: c.link }]}>{el.order}</Text>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[s.bodyBold, { color: c.ink, fontSize: 17 }]}>
            {el.name} <Text style={[s.small, { color: c.muted, fontWeight: '400' }]}>드릴 {count}개</Text>
          </Text>
          <Text style={[s.small, { color: c.muted }]}>{el.line}</Text>
        </View>
        <SymbolView name={open ? 'chevron.up' : 'chevron.down'} size={12} tintColor={c.muted} />
      </Press>
      {open ? (
        <View style={{ gap: 12, paddingBottom: 14 }}>
          {report ? (
            <View style={[s.box, { gap: 4, backgroundColor: c.sky + '14' }]}>
              <Text style={[s.bodyBold, { color: c.ink }]}>
                내 리포트: {RX_REPORT_TEXT[report.level]}
                {report.target ? ` · ${report.target.label} ${report.target.now}` : ''}
              </Text>
              {report.criteriaNote ? <Text style={[s.tiny, { color: c.warn }]}>{report.criteriaNote}</Text> : null}
              {report.titles.map((t, i) => (
                <Text key={t.title} style={[s.small, { color: c.ink }]}>
                  <Text style={{ color: c.link, fontWeight: '700' }}>{i + 1}</Text> {t.title} · {t.stage}
                </Text>
              ))}
              {report.reportId ? (
                <Press
                  onPress={() => router.push(`/lab/${report.reportId}` as Href)}
                  accessibilityRole="button"
                  style={[s.textBtn, { paddingHorizontal: 0 }]}
                >
                  <Text style={[s.smallBold, { color: c.link }]}>리포트에서 개선 드릴 보기 ›</Text>
                </Press>
              ) : null}
            </View>
          ) : null}
          {via && via.also.length > 0 ? (
            <Text style={[s.small, s.box, { color: c.ink, backgroundColor: c.sky + '14' }]}>
              ‘{via.text}’라면 {el.name}부터 보고, 함께{' '}
              {via.also.map((name, i) => (
                <Text key={name}>
                  {i > 0 ? ' · ' : ''}
                  <Text onPress={() => onElement(name)} style={{ color: c.link, fontWeight: '700' }}>
                    {name}
                  </Text>
                </Text>
              ))}
              도 보세요.
            </Text>
          ) : null}
          <View style={s.wrap}>
            {el.faults.slice(0, 3).map((f) => (
              <Text key={f} style={[s.smallBold, s.tag, { color: c.warn, backgroundColor: c.warnBg }]}>
                {shortFault(sideText(f, hand))}
              </Text>
            ))}
          </View>
          <Fold label={`${el.name} 자세히 보기`} c={c}>
            <ElementDetail el={el} hand={hand} c={c} />
          </Fold>
          {stages.map(({ stage, primary, secondary }) =>
            primary.length + secondary.length === 0 ? null : (
              <View key={stage.name} style={{ gap: 8 }}>
                <Text style={[s.small, { color: c.muted }]}>
                  <Text style={{ color: c.ink, fontWeight: '600', fontSize: 15 }}>{stage.name}</Text> {stage.desc}
                </Text>
                {primary.map((d) => (
                  <DrillRow key={d.title} drill={d} secondary={false} c={c} />
                ))}
                {secondary.map((d) => (
                  <DrillRow key={d.title} drill={d} secondary c={c} />
                ))}
              </View>
            )
          )}
          {count === 0 ? <Text style={[s.small, { color: c.muted }]}>이 요소를 키우는 드릴이 아직 없어요.</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * 드릴 한 줄 — 이름 · 도구, '자세·영상 보기'를 누르면 도구 칩 · 영상 · 자세 설명 · 즐겨찾기(웹 MechanicsDrill). 영상은 펼친 동안에만.
 * 도구를 바꾸면 그 드릴의 영상 · 설명으로(key).
 */
export function DrillRow({
  drill,
  secondary,
  start = 0,
  c,
}: {
  drill: MechanicsDrillView;
  secondary: boolean;
  start?: number;
  c: Palette;
}) {
  const [open, setOpen] = useState(false);
  /* start — 처음 고른 도구(즐겨찾기 모음은 별을 단 도구부터) */
  const [pick, setPick] = useState(start);
  const variant = drill.variants[Math.min(pick, drill.variants.length - 1)];
  const tools =
    drill.variants.length > 1 ? drill.variants.map((v) => v.tool) : variant.equipment.length > 0 ? variant.equipment : [variant.tool];
  return (
    <View style={[st.drillRow, { backgroundColor: c.page, borderColor: c.line }]}>
      <View style={[s.row, { alignItems: 'flex-start', padding: 12 }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[s.bodyBold, { color: c.ink }]}>
            {drill.title}
            {secondary ? <Text style={[s.small, { color: c.muted, fontWeight: '400' }]}>{'  함께 쓰는 드릴'}</Text> : null}
          </Text>
          <Text style={[s.small, { color: c.muted }]}>{tools.join(' · ')}</Text>
        </View>
        {variant.thumbUrl ? <Thumb uri={variant.thumbUrl} style={st.thumb} /> : null}
        {/* 즐겨찾기 — 고른 도구의 드릴에(웹 FavoriteButton 과 같은 서버 동작). 펼치지 않아도 보이게 줄 머리에 둔다(2026-10-20 김민) */}
        <Star key={variant.id} kind="drill" id={variant.id} initial={variant.favorite} title={drill.title} c={c} />
      </View>
      <Press
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${drill.title} 자세·영상 ${open ? '접기' : '보기'}`}
        style={[st.disclose, { borderTopColor: c.line }]}
      >
        <SymbolView name="info.circle" size={13} tintColor={c.muted} />
        <Text style={[s.smallBold, { color: c.muted, flex: 1 }]}>자세·영상 보기</Text>
        <SymbolView name={open ? 'chevron.up' : 'chevron.down'} size={11} tintColor={c.muted} />
      </Press>
      {open ? (
        <View style={{ gap: 10, paddingHorizontal: 12, paddingBottom: 12 }}>
          {drill.variants.length > 1 ? (
            <View accessibilityRole="radiogroup" accessibilityLabel="도구" style={s.wrap}>
              {drill.variants.map((v, i) => (
                <Press
                  select
                  selected={i === pick}
                  key={v.id}
                  onPress={() => setPick(i)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: i === pick }}
                  style={[s.chip, { backgroundColor: i === pick ? c.sky : c.chip }]}
                >
                  <Text style={[s.smallBold, { color: i === pick ? '#fff' : c.muted }]}>{v.tool}</Text>
                </Press>
              ))}
            </View>
          ) : null}
          <ExerciseMedia
            key={variant.id}
            path={variant.videoPath}
            referenceVideoId={variant.referenceVideoId}
            thumbUrl={variant.thumbUrl}
            aspectRatio={variant.aspectRatio}
          />
          <Description key={`d-${variant.id}`} guideId={variant.id} inline c={c} />
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  num: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  bigNum: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  drill: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  foldBar: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 14, paddingLeft: 14, paddingRight: 4, paddingVertical: 4 },
  weeks: { flexDirection: 'row', gap: 8 },
  cell: { flex: 1, height: 8, borderRadius: 4 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chainItem: { width: '48%', flexGrow: 1, minHeight: 48, borderRadius: 16, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8 },
  card: { borderRadius: 18, borderWidth: 1, paddingHorizontal: 14 },
  cardHead: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 },
  drillRow: { borderRadius: 14, borderWidth: 1, overflow: 'hidden' },
  thumb: { width: 72, height: 52, borderRadius: 8, backgroundColor: '#000' },
  disclose: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
