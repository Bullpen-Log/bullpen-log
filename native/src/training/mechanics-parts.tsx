import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { josa } from '@/lib/korean';
import { DRILL_STAGES } from '@/lib/exercise-meta';
import { MECHANICS_ELEMENTS, MECHANICS_OVERVIEW, MECHANICS_SOURCE_NOTE, MECHANICS_SYMPTOMS, sideText, type MechanicsElement } from '@/lib/mechanics/elements';
import { MECHANICS_LEVELS, PER_WEEK, SESSIONS_PER_LEVEL, WEEKS, mechanicsLevel, type LevelKey, type MechanicsLevel } from '@/lib/mechanics/levels';
import {
  FILM_EVERY,
  FILM_VERDICTS,
  MECHANICS_FOLD_BUTTONS,
  MECHANICS_FOLD_TEXT,
  filmPrompt,
  foldSession,
  isArmLoaded,
  type FilmNote,
  type MechanicsPainFold,
} from '@/lib/mechanics/program';
import type { MechanicsDrillView } from '@/lib/mechanics/drills';
import type { MechanicsProgramView } from '@/lib/mechanics/load';
import type { AppSessionDrill } from '@/lib/mechanics/home-load';
import { ExerciseMedia } from '~/armcare/parts';
import { act, Description, FilmVerdictButtons, leave } from '~/mechanics/parts';
import type { Palette } from '~/lib/ui';
import { Fold, s } from './screen';
import { Star } from './fav-button';
import { fromApp } from '~/shell/web-nav';
import { Press } from '~/shell/press';

/**
 * 메커니즘 전체 화면(native/src/app/training-mechanics.tsx)의 조각 — 웹 mechanics-program.tsx(오늘의 세션 · 수준 고르기 · 12칸 · 영상으로 확인)와
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
function Btn({ label, onPress, disabled, primary = true, c }: { label: string; onPress: () => void; disabled?: boolean; primary?: boolean; c: Palette }) {
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
      <Text style={[s.body, { color: c.ink }]}>{MECHANICS_OVERVIEW.lead}</Text>
      <View style={{ gap: 6 }}>
        {MECHANICS_ELEMENTS.map((el) => (
          <View key={el.key} style={[s.row, { gap: 8, alignItems: 'flex-start' }]}>
            <Num n={el.order} c={c} />
            <Text style={[s.body, { color: c.muted, flex: 1 }]}>
              <Text style={{ color: c.ink, fontWeight: '700' }}>{el.name}</Text> {el.line}
            </Text>
          </View>
        ))}
      </View>
      <Text style={[s.bodyBold, { color: c.ink }]}>왜 순서가 중요한가요</Text>
      <Text style={[s.body, { color: c.ink }]}>{MECHANICS_OVERVIEW.whyOrder}</Text>
      <Text style={[s.bodyBold, { color: c.ink }]}>이렇게 쓰세요</Text>
      {MECHANICS_OVERVIEW.howTo.map((h, i) => (
        <Text key={h} style={[s.body, { color: c.ink }]}>
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
        <Text style={[s.smallBold, { color: c.sky }]}>{n}</Text>
      )}
    </View>
  );
}

/* ----------------------------- 프로그램 칸 ----------------------------- */

/** 수준을 안 골랐을 때 — 한 줄 소개 · 고르기 카드 넷 · 투구의 흐름(웹과 같다) */
export function NoProgram({ reload, c }: { reload: Reload; c: Palette }) {
  return (
    <View style={{ gap: 12 }}>
      <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float, gap: 6 }]}>
        <Text style={[s.title, { color: c.ink }]}>투구 메커니즘 향상 프로그램</Text>
        <Text style={[s.body, { color: c.ink }]}>{SESSIONS_PER_LEVEL}세션 · 한 번에 15~25분이에요.</Text>
        <Fold label="자세히" c={c}>
          <Text style={[s.body, { color: c.muted }]}>드릴 3~4개를 투구 차례대로 해요. 던지는 날 캐치볼 전에 하면 알맞아요. 처음이면 입문부터.</Text>
        </Fold>
      </View>
      <LevelPicker current={null} index={0} reload={reload} c={c} />
      <OverviewFold c={c} />
    </View>
  );
}

/** 수준 고르기 — 카드 넷. 하던 중에 바꾸면 한 번 묻는다(진행이 처음으로) */
function LevelPicker({ current, index, reload, c }: { current: LevelKey | null; index: number; reload: Reload; c: Palette }) {
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
          <View key={lv.key} style={[s.card, { backgroundColor: c.card, boxShadow: c.float, borderWidth: 1, borderColor: on ? c.sky : c.line }]}>
            <View style={[s.row, { alignItems: 'flex-start' }]}>
              <View style={[st.bigNum, { backgroundColor: c.sky + '1a' }]}>
                <Text style={[s.bodyBold, { color: c.sky }]}>{i + 1}</Text>
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
              <Text style={[s.bodyBold, { color: c.sky }]}>✓ 지금 하는 수준이에요</Text>
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

/**
 * 오늘(다음) 세션 — 드릴 셋 · 시작(웹 SessionCard). 아픈 날은 팔에 싣는 드릴을 접고 '무브먼트 드릴만 하기', 성인의 통증 날만 '펼치기 → 그래도 하기'
 * (/mechanics?anyway=1). 펼친 것은 이 화면에서만 — 다시 열면 다시 접힌다.
 */
export function SessionCard({
  program,
  session,
  doneToday,
  painFold,
  c,
}: {
  program: MechanicsProgramView;
  session: AppSessionDrill[];
  doneToday: string[];
  painFold: MechanicsPainFold | null;
  c: Palette;
}) {
  const [unfolded, setUnfolded] = useState(false);
  const level = mechanicsLevel(program.level!);
  const done = new Set(program.finishedToday ? [] : doneToday);
  const folding = painFold != null && !(unfolded && painFold.canUnfold);
  const anyway = painFold != null && unfolded && painFold.canUnfold;
  const { open, folded } = foldSession(session, folding ? painFold : null);
  const started = open.some((d) => done.has(d.guideId));
  const openDone = folding && open.length > 0 && open.every((d) => done.has(d.guideId));
  const go = (href: string) => router.push(fromApp(href) as Href);

  return (
    <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      <View style={s.between}>
        <Text style={[s.title, { color: c.ink }]}>{program.finishedToday ? '다음 세션' : '오늘의 세션'}</Text>
        <Text style={[s.tiny, { color: c.muted, flexShrink: 1, textAlign: 'right' }]}>
          {level.name} · {program.index + 1}번 세션 · {level.key === 'intermediate' || level.key === 'advanced' ? '20~25분' : '15~20분'}
        </Text>
      </View>
      {program.finishedToday ? (
        <Text style={[s.bodyBold, { color: c.sky }]}>✓ 오늘 세션을 마쳤어요. 더 하고 싶으면 다음 세션을 이어서 해도 돼요.</Text>
      ) : null}
      {painFold ? (
        folding ? (
          <Text style={[s.bodyBold, s.box, { color: c.warn, backgroundColor: c.warnBg }]}>{painFold.reason}</Text>
        ) : (
          <View style={[st.foldBar, { backgroundColor: c.warnBg }]}>
            <Text style={[s.bodyBold, { color: c.warn, flex: 1 }]}>{MECHANICS_FOLD_TEXT.anyway(painFold.label)}</Text>
            <Press onPress={() => setUnfolded(false)} accessibilityRole="button" style={s.textBtn}>
              <Text style={[s.smallBold, { color: c.warn }]}>{MECHANICS_FOLD_BUTTONS.refold}</Text>
            </Press>
          </View>
        )
      ) : null}
      {open.map((d, i) => {
        const loaded = anyway && isArmLoaded(d.category);
        return (
          <View key={d.guideId} style={[st.drill, { backgroundColor: c.page }]}>
            <Num n={i + 1} done={done.has(d.guideId)} c={c} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[s.bodyBold, { color: c.ink }]}>{d.title}</Text>
              <Text style={[s.small, { color: c.muted }]}>
                {d.element} · {d.stage} · {d.tool} · {d.dose}
              </Text>
              {d.gearNote?.replaced ? (
                <Text style={[s.small, { color: c.muted }]}>
                  {d.gearNote.replaced}에는 {d.gearNote.need}
                  {josa(d.gearNote.need, '이/가')} 있어야 해서 같은 단계 드릴로 바꿨어요
                </Text>
              ) : null}
              {loaded ? <Text style={[s.smallBold, { color: c.warn }]}>{MECHANICS_FOLD_TEXT.loadedTag}</Text> : null}
            </View>
          </View>
        );
      })}
      {folding && folded.length > 0 ? (
        <View style={[st.drill, { borderWidth: 1, borderStyle: 'dashed', borderColor: c.line }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[s.bodyBold, { color: c.ink }]}>접어 둔 드릴 {folded.length}개</Text>
            <Text style={[s.small, { color: c.muted }]}>{folded.map((f) => f.title).join(' · ')}</Text>
          </View>
          {painFold?.canUnfold ? (
            <Press onPress={() => setUnfolded(true)} accessibilityRole="button" style={[s.chip, { backgroundColor: c.chip }]}>
              <Text style={[s.smallBold, { color: c.ink }]}>{MECHANICS_FOLD_BUTTONS.unfold} ▾</Text>
            </Press>
          ) : null}
        </View>
      ) : null}
      {folding ? (
        open.length === 0 ? (
          <Text style={[s.bodyBold, { color: c.ink }]}>{MECHANICS_FOLD_TEXT.allFolded}</Text>
        ) : openDone ? (
          <Text style={[s.bodyBold, { color: c.sky }]}>✓ {MECHANICS_FOLD_TEXT.openDone}</Text>
        ) : (
          <Start label={started ? '이어서 하기' : MECHANICS_FOLD_BUTTONS.openOnly} onPress={() => go('/mechanics')} c={c} />
        )
      ) : (
        <Start
          label={anyway ? MECHANICS_FOLD_BUTTONS.anyway : started ? '이어서 하기' : '세션 시작'}
          onPress={() => go(anyway ? '/mechanics?anyway=1' : '/mechanics')}
          c={c}
        />
      )}
      <Fold label="하는 법" c={c}>
        <Text style={[s.small, { color: c.muted }]}>
          드릴마다 느낌을 눌러요. 쉬움이 여러 요소에서 쌓이면 다음 수준을 권해요. 던지는 날 몸을 푼 뒤, 캐치볼 전에 하면 알맞아요.
        </Text>
      </Fold>
    </View>
  );
}

function Start({ label, onPress, c }: { label: string; onPress: () => void; c: Palette }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" style={[s.pill, { backgroundColor: c.sky }]}>
      <SymbolView name="play.fill" size={13} tintColor="#fff" />
      <Text style={[s.bodyBold, { color: '#fff', fontSize: 16 }]}>{label}</Text>
    </Press>
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
            ? `4주 동안 ${WEEKS * PER_WEEK}번을 다 했어요. ${next.name}${josa(next.name, '으로/로')} 넘어가거나, 편하지 않았다면 한 번 더 해도 돼요.`
            : `4주 동안 ${WEEKS * PER_WEEK}번을 다 했어요. 가장 높은 수준이라, 한 번 더 하며 전체 동작을 다듬어요.`}
      </Text>
      {target ? <Btn label={pending ? '바꾸는 중…' : `${target.name} 시작`} disabled={pending} onPress={() => void start(target.key)} c={c} /> : null}
      <Btn label={`${level.name} 한 번 더`} primary={!target} disabled={pending} onPress={() => void start(level.key)} c={c} />
      {error ? <Text style={[s.small, { color: c.danger }]}>{error}</Text> : null}
    </View>
  );
}

/** 이 수준의 12칸 — 주마다 세 칸, 마친 칸 · 다음 칸 */
export function LevelProgress({ program, c }: { program: MechanicsProgramView; c: Palette }) {
  const level = mechanicsLevel(program.level!);
  return (
    <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      <View style={s.between}>
        <Text style={[s.bodyBold, { color: c.ink, fontSize: 17 }]}>{level.name} 프로그램</Text>
        <Text style={[s.small, { color: c.muted }]}>
          {program.index} / {program.total}
        </Text>
      </View>
      <View style={st.weeks} accessibilityLabel={`${program.total}번 중 ${program.index}번 마침`}>
        {Array.from({ length: WEEKS }, (_, w) => (
          <View key={w} style={{ flex: 1, gap: 4 }}>
            <View style={{ flexDirection: 'row', gap: 3 }}>
              {Array.from({ length: PER_WEEK }, (_, d) => {
                const i = w * PER_WEEK + d;
                return (
                  <View
                    key={d}
                    style={[st.cell, { backgroundColor: i < program.index ? c.sky : i === program.index ? c.sky + '66' : c.chip }]}
                  />
                );
              })}
            </View>
            <Text style={[s.tiny, s.center, { color: c.muted }]}>{w + 1}주</Text>
          </View>
        ))}
      </View>
      <Text style={[s.small, { color: c.muted }]}>{level.what}</Text>
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
          <SymbolView name="video.fill" size={15} tintColor={c.sky} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[s.bodyBold, { color: c.ink, fontSize: 17 }]}>
            {kind === 'baseline' ? '시작 전에 한 번 찍어 두세요' : '찍어서 처음과 견줘 볼 때예요'}
          </Text>
          <Text style={[s.body, { color: c.muted }]}>
            {kind === 'baseline' ? `세션 ${FILM_EVERY}번 뒤에 이 영상과 견줘 봐요.` : `세션 ${sessionsDone}번을 했어요. 처음 영상과 견줘 봐요.`}
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
            세션 {f.session}번 · <Text style={{ fontWeight: '700', color: f.verdict === 'better' ? c.sky : c.ink }}>{label(f.verdict)}</Text>
          </Text>
          <Text style={[s.tiny, { color: c.muted }]}>
            {Number(f.on.slice(5, 7))}/{Number(f.on.slice(8, 10))}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** 수준 바꾸기(펼치면 고르기 카드) · 처음부터(웹 LevelSettings) */
export function LevelSettings({ current, index, reload, c }: { current: LevelKey; index: number; reload: Reload; c: Palette }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reset = () =>
    Alert.alert('처음부터 다시 할까요?', '수준 고르기로 돌아가요. 지금까지 한 드릴 기록은 남아요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '처음부터',
        style: 'destructive',
        onPress: async () => {
          setPending(true);
          setError(null);
          const res = await act<{ ok: true }>('mechanics.resetMechanicsProgram');
          if ('error' in res) setError(res.error);
          else await reload();
          setPending(false);
        },
      },
    ]);
  return (
    <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      <Press onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={[s.row, { minHeight: 44 }]}>
        <Text style={[s.bodyBold, { color: c.ink, flex: 1, fontSize: 17 }]}>수준 바꾸기</Text>
        <SymbolView name={open ? 'chevron.up' : 'chevron.down'} size={12} tintColor={c.muted} />
      </Press>
      {open ? <LevelPicker current={current} index={index} reload={reload} c={c} /> : null}
      {error ? <Text style={[s.small, { color: c.danger }]}>{error}</Text> : null}
      <Press onPress={reset} disabled={pending} accessibilityRole="button" style={[s.row, { minHeight: 44, gap: 6, opacity: pending ? 0.5 : 1 }]}>
        <SymbolView name="arrow.counterclockwise" size={13} tintColor={c.muted} />
        <Text style={[s.smallBold, { color: c.muted }]}>{pending ? '되돌리는 중…' : '처음부터 다시 하기'}</Text>
      </Press>
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
export function ElementChain({ current, onPick, c }: { current: string | null; onPick: (name: string) => void; c: Palette }) {
  return (
    <View style={st.grid}>
      {MECHANICS_ELEMENTS.map((el) => {
        const on = current === el.name;
        return (
          <Press
            select
            selected={on}
            key={el.key}
            onPress={() => onPick(el.name)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            style={[st.chainItem, { backgroundColor: on ? c.sky : c.card }]}
          >
            <View style={[st.num, { backgroundColor: on ? 'rgba(255,255,255,0.25)' : c.sky + '1a' }]}>
              <Text style={[s.smallBold, { color: on ? '#fff' : c.sky }]}>{el.order}</Text>
            </View>
            <Text style={[s.bodyBold, { color: on ? '#fff' : c.ink, flexShrink: 1 }]}>{el.name}</Text>
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
    <View style={{ gap: 4 }}>
      <Text style={[s.bodyBold, { color: c.ink }]}>{title}</Text>
      {(Array.isArray(body) ? body : [body]).map((b) => (
        <Text key={b} style={[s.body, { color: c.ink }]}>
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
        <Text key={cue} style={[s.bodyBold, s.box, { color: c.sky, backgroundColor: c.sky + '14' }]}>
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
  c,
}: {
  el: MechanicsElement;
  drills: MechanicsDrillView[];
  hand: string | null;
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
          <Text style={[s.smallBold, { color: c.sky }]}>{el.order}</Text>
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
          {via && via.also.length > 0 ? (
            <Text style={[s.small, s.box, { color: c.ink, backgroundColor: c.sky + '14' }]}>
              ‘{via.text}’라면 {el.name}부터 보고, 함께{' '}
              {via.also.map((name, i) => (
                <Text key={name}>
                  {i > 0 ? ' · ' : ''}
                  <Text onPress={() => onElement(name)} style={{ color: c.sky, fontWeight: '700' }}>
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
                  <Text style={{ color: c.ink, fontWeight: '700', fontSize: 15 }}>{stage.name}</Text> {stage.desc}
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
export function DrillRow({ drill, secondary, start = 0, c }: { drill: MechanicsDrillView; secondary: boolean; start?: number; c: Palette }) {
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
        {variant.thumbUrl ? <Image source={{ uri: variant.thumbUrl }} style={st.thumb} /> : null}
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
