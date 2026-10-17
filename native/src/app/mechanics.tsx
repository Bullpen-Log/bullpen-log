import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { type Href, router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { josa } from '@/lib/korean';
import { mechanicsElement } from '@/lib/mechanics/elements';
import {
  FEELS,
  MECHANICS_FOLD_TEXT,
  doseFields,
  filmPrompt,
  isArmLoaded,
  type DrillFeel,
  type DrillThrowNote,
  type levelAdvice,
} from '@/lib/mechanics/program';
import type { PlayerVariant, SessionDrillView } from '@/lib/mechanics/load';
import type { MechanicsPlay } from '@/lib/mechanics/play-load';
import { BullpenNative } from '../../modules/bullpen-native';
import { ExerciseMedia } from '~/armcare/parts';
import { act, Description, FilmVerdictButtons, leave, LevelOffer, ThrowNoteCard } from '~/mechanics/parts';
import { rpc, RpcError } from '~/lib/rpc';
import { usePalette, type Palette } from '~/lib/ui';

/**
 * 메커니즘 세션 따라 하기(앱 화면) — 웹 app/(session)/mechanics/play/mechanics-player.tsx 를 옮겼다. 사이트의 따라 하기가 앱(BullpenNative/4 부터)이면
 * 이 화면을 띄우고(page.tsx → OpenNative), 무엇을 띄울지는 웹과 같은 곳에서 읽는다(app/actions/app-mechanics.ts → lib/mechanics/play-load.ts).
 *
 * 웹과 같은 규칙: 드릴에는 시계가 없다(횟수 · 공 수로 한다). 마치면 느낌(어려움 · 적당 · 쉬움) 하나를 누르는 것이 '다음'이고, 그 느낌을 서버에
 * 남긴 뒤에야 넘어간다(recordMechanicsDrill — 느낌이 진도의 전부라 폰에 담아 뒤에서 보내지 않는다, 웹도 못 남기면 그 자리에 머문다).
 * 마지막 드릴 뒤 세션을 마친다(finishMechanicsSession, 아픈 날 무브먼트만 했으면 partial). 화면은 켜 둔다(웹 useWakeLock 과 같게).
 */
type LoadResult = ({ ok: true } & MechanicsPlay) | { ok: false; to: string };
type FinishResult = { ok: true; advice: ReturnType<typeof levelAdvice>; throwNote: DrillThrowNote | null };

export default function MechanicsPlayScreen() {
  const c = usePalette();
  const { anyway } = useLocalSearchParams<{ anyway?: string }>();
  const [data, setData] = useState<MechanicsPlay | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let alive = true;
    rpc<LoadResult>('app-mechanics.loadAppMechanicsPlay', anyway ?? null).then(
      (r) => {
        if (!alive) return;
        if (r.ok) setData(r);
        else leave(r.to);
      },
      (e: unknown) => {
        if (!alive) return;
        if (e instanceof RpcError && e.code === 'redirect') return leave(e.to ?? '/login');
        setFailed(e instanceof RpcError && e.code === 'update' ? '앱을 업데이트해 주세요.' : '신호가 약해 세션을 불러오지 못했어요.');
      }
    );
    return () => {
      alive = false;
    };
  }, [anyway, tries]);

  if (data) return <Player {...data} c={c} />;
  return (
    <View style={[s.fill, s.centerBox, { backgroundColor: c.page, gap: 16 }]}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      {failed ? (
        <>
          <Text style={[s.body, { color: c.ink, textAlign: 'center' }]}>{failed}</Text>
          <Pressable
            onPress={() => {
              setFailed(null);
              setTries((n) => n + 1);
            }}
            accessibilityRole="button"
            style={[s.pill, { backgroundColor: c.sky }]}
          >
            <Text style={[s.bodyBold, { color: '#fff' }]}>다시 불러오기</Text>
          </Pressable>
          <Pressable onPress={() => router.back()} accessibilityRole="button" style={s.pill}>
            <Text style={[s.bodyBold, { color: c.muted }]}>닫기</Text>
          </Pressable>
        </>
      ) : (
        <ActivityIndicator />
      )}
    </View>
  );
}

/* ----------------------------- 고른 동작 · 도구(웹 viewOf 그대로) ----------------------------- */

type Choice = { alt: number; variantId: string };
type DrillChoiceView = {
  title: string;
  guideId: string;
  tool: string;
  dose: string;
  sets: number;
  tempo: string;
  variant: PlayerVariant;
  variants: PlayerVariant[];
};

/** 지금 보이는 드릴 — 고른 동작 · 도구의 것(바꾸지 않았으면 세션이 고른 그대로) */
function viewOf(item: SessionDrillView, choice: Choice): DrillChoiceView {
  const alt = item.alternatives[choice.alt] ?? item.alternatives[0];
  const variants = alt?.variants ?? [{ ...item.variant, owned: true }];
  const variant = variants.find((v) => v.id === choice.variantId) ?? variants[0];
  return {
    title: alt?.title ?? item.title,
    guideId: variant.id,
    tool: variant.tool,
    ...doseFields(variant.category, item.stage),
    variant,
    variants,
  };
}

const tick = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

/* ----------------------------- 본체 ----------------------------- */

function Player({ backHref, items, startAt, label, sessionNumber, partial, painLabel, c }: MechanicsPlay & { c: Palette }) {
  const inset = useSafeAreaInsets();
  const [index, setIndex] = useState(startAt);
  const [done, setDone] = useState<boolean[]>(() => items.map((_, i) => i < startAt));
  /* 세션을 마친 뒤 서버가 돌려준 권하기 · 드릴로 던진 공 카드 — 끝 화면이 보인다 */
  const [advice, setAdvice] = useState<FinishResult['advice']>(null);
  const [throwNote, setThrowNote] = useState<DrillThrowNote | null>(null);
  const [finished, setFinished] = useState(false);
  /* 마치기 저장이 실패했나 — 끝 화면 대신 다시 저장 단추를 둔다(안 그러면 세션 수가 안 올라 같은 세션이 또 나왔다) */
  const [finishFailed, setFinishFailed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  /* 드릴마다 고른 동작(alternatives 의 몇 번째) · 도구 — 장비가 없거나 자리가 좁으면 바꿔 한다 */
  const [choices, setChoices] = useState<Choice[]>(() => items.map((it) => ({ alt: 0, variantId: it.guideId })));
  /* 지금 드릴에서 마친 세트 수 — 화면 안에서만 센다(드릴을 옮기면 처음부터) */
  const [setsDone, setSetsDone] = useState(0);

  /* 느낌 단추는 드릴이 바뀌어도 같은 자리다 — 한 장면에 두 번 눌리면 pending 이 그려지기 전이라 둘 다 들어간다. 그래서 상태 대신 ref 로 막는다 */
  const busy = useRef(false);
  const run = async (job: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      await job();
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  useEffect(() => {
    void BullpenNative.keepAwake(!finished).catch(() => undefined);
  }, [finished]);
  useEffect(() => () => void BullpenNative.keepAwake(false).catch(() => undefined), []);

  /* 드릴이 바뀌면 맨 위(이름 · 영상)부터 — 자세 설명을 읽느라 내려가 있던 자리에 다음 드릴이 뜨면 할 차례가 화면 밖에 있다 */
  const scrollRef = useRef<ScrollViewInstance>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [index]);

  const item = items[index];
  const view = viewOf(item, choices[index]);
  const counted = Math.min(setsDone, view.sets);
  const choose = (next: Choice) => setChoices((list) => list.map((v, i) => (i === index ? next : v)));

  const next = () => {
    setIndex(index + 1);
    setSetsDone(0);
  };

  /** 세션을 마친다 — 실패하면 끝 화면으로 넘어가지 않고 다시 저장하게 한다 */
  const finish = async () => {
    const res = await act<FinishResult>('mechanics.finishMechanicsSession', { partial, session: sessionNumber });
    if ('error' in res) {
      setError(res.error);
      setFinishFailed(true);
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setFinishFailed(false);
    setAdvice(res.advice);
    setThrowNote(res.throwNote);
    setFinished(true);
  };

  const record = (feel: DrillFeel) =>
    run(async () => {
      tick();
      const res = await act<{ ok: true }>('mechanics.recordMechanicsDrill', { guideId: view.guideId, element: item.element, feel });
      if ('error' in res) {
        setError(res.error);
        return;
      }
      setDone((d) => d.map((v, i) => (i === index ? true : v)));
      if (index + 1 < items.length) next();
      else await finish();
    });

  /* 건너뛰기 — 마지막 드릴이면 건너뛰고 마친다. 단추가 다음 드릴에서도 같은 자리라 0.45초 안의 둘째 탭은 버린다(안 보인 드릴까지 건너뛰었다) */
  const skipping = useRef(false);
  const skip = () => {
    if (skipping.current) return;
    skipping.current = true;
    setTimeout(() => (skipping.current = false), 450);
    if (index + 1 < items.length) next();
    else void run(finish);
  };

  const header = (
    <View style={[s.header, { paddingTop: inset.top + 8, backgroundColor: c.card, borderBottomColor: c.line }]}>
      <View style={s.headRow}>
        <Pressable onPress={() => leave(backHref)} accessibilityRole="button" accessibilityLabel="따라 하기 닫기" style={s.iconBtn}>
          <View style={[s.circle, { backgroundColor: c.chip }]}>
            <SymbolView name="xmark" size={14} weight="semibold" tintColor={c.muted} />
          </View>
        </Pressable>
        <Text numberOfLines={1} style={[s.headTitle, { color: c.ink }]}>
          메커니즘 · {label}
        </Text>
        <Text style={[s.smallBold, s.count, { color: c.muted }]}>
          {finished ? items.length : index + 1} / {items.length}
        </Text>
      </View>
      <View style={s.segments}>
        {items.map((it, i) => (
          <View
            key={it.guideId}
            style={[s.segment, { backgroundColor: done[i] ? c.sky : i === index && !finished ? c.sky + '66' : c.chip }]}
          />
        ))}
      </View>
    </View>
  );

  const shell = (body: ReactNode) => (
    <View style={[s.fill, { backgroundColor: c.page }]}>
      {/* 옆으로 쓸어 닫기는 끈다 — 공을 든 손이 화면 끝을 스쳐 닫혔다(암케어와 같다). 나가기는 ✕ 로 */}
      <Stack.Screen options={{ gestureEnabled: false }} />
      {header}
      {body}
    </View>
  );

  if (finished) {
    const count = done.filter(Boolean).length;
    return shell(
      <ScrollView style={s.fill} contentContainerStyle={[s.finish, { paddingBottom: Math.max(24, inset.bottom + 16) }]}>
        <View style={[s.doneMark, { backgroundColor: c.sky }]}>
          <SymbolView name="checkmark" size={32} weight="bold" tintColor="#fff" />
        </View>
        <Text accessibilityRole="header" style={[s.finishTitle, { color: c.ink }]}>
          {partial ? '오늘 드릴을 마쳤어요' : '세션을 마쳤어요'}
        </Text>
        <Text style={[s.body, s.center, { color: c.muted }]}>드릴 {count}개를 했어요.</Text>
        {partial ? <Text style={[s.body, s.center, { color: c.muted }]}>{MECHANICS_FOLD_TEXT.partialFinish}</Text> : null}

        {throwNote ? <ThrowNoteCard note={throwNote} c={c} /> : null}

        {!partial && advice?.to ? <LevelOffer kind={advice.kind} to={advice.to} c={c} /> : null}

        {!partial && filmPrompt(sessionNumber) === 'compare' ? (
          <View style={[s.block, { backgroundColor: c.card }]}>
            <Text style={[s.blockTitle, { color: c.ink }]}>세션 {sessionNumber}번 · 찍어서 견줘 볼 때예요</Text>
            <Text style={[s.body, { color: c.muted }]}>
              같은 자리에서 다시 찍어 처음 영상과 2분할로 견줘 보세요. 구속도 재 두면 효과를 알 수 있어요.
            </Text>
            <Pressable onPress={() => router.push('/pitch/compare' as Href)} accessibilityRole="link" style={[s.pill, { backgroundColor: c.chip }]}>
              <Text style={[s.bodyBold, { color: c.ink }]}>2분할 비교 열기</Text>
            </Pressable>
            {/* 견준 결과 — 지금 못 견줬으면 '아직'을 누르거나 프로그램 칸에서 나중에 남긴다 */}
            <View style={[s.divider, { borderTopColor: c.line }]}>
              <FilmVerdictButtons session={sessionNumber} c={c} />
            </View>
          </View>
        ) : null}

        <Pressable onPress={() => leave(backHref)} accessibilityRole="button" style={[s.pill, s.stretch, { backgroundColor: c.sky }]}>
          <Text style={[s.bodyBold, { color: '#fff' }]}>완료</Text>
        </Pressable>
      </ScrollView>
    );
  }

  return shell(
    <>
      <ScrollView ref={scrollRef} style={s.fill} contentContainerStyle={s.content}>
        {/* 드릴마다 새로 그린다(key) — 앞 드릴의 영상이 다음 드릴에서 돌고 설명 칸이 펼친 채 남지 않게 */}
        <DrillView key={item.guideId} item={item} view={view} alt={choices[index].alt} onChoose={choose} painLabel={painLabel} c={c} />
      </ScrollView>

      {/* 누르는 막대 — 엄지가 닿는 아래에 */}
      <View style={[s.bottom, { paddingBottom: Math.max(12, inset.bottom), backgroundColor: c.card, borderTopColor: c.line }]}>
        {/* 세트 세기 — 한 세트를 마칠 때마다 누른다. 다시 누르면 그 앞까지로 */}
        <View accessibilityLabel="마친 세트" style={s.setRow}>
          {Array.from({ length: view.sets }, (_, i) => {
            const on = i < counted;
            return (
              <Pressable
                key={i}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setSetsDone(counted === i + 1 ? i : i + 1);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[s.setBtn, on ? { borderColor: c.sky, backgroundColor: c.sky + '1a' } : { borderColor: c.line }]}
              >
                <Text style={[s.smallBold, { color: on ? c.sky : c.muted }]}>
                  {on ? '✓ ' : ''}
                  {i + 1}세트
                </Text>
              </Pressable>
            );
          })}
        </View>
        <Text style={[s.bodyBold, s.center, { color: c.ink }]}>{counted === view.sets ? '다 했어요. 어땠어요?' : '마쳤으면, 어땠어요?'}</Text>
        {/* 셋 다 같은 모양 — '쉬움'만 칠하면 무심코 누르기 쉬워 단계가 부풀었다(웹 2026-10-04 검토). 정직하게 고른 느낌이 진도의 전부다 */}
        <View style={s.feelRow}>
          {FEELS.map((f) => (
            <Pressable
              key={f.value}
              onPress={() => void record(f.value)}
              disabled={pending}
              accessibilityRole="button"
              style={({ pressed }) => [s.feel, { backgroundColor: pressed ? c.sky + '1a' : c.chip, opacity: pending ? 0.6 : 1 }]}
            >
              <Text style={[s.feelLabel, { color: c.ink }]}>{f.label}</Text>
              <Text style={[s.tiny, s.center, { color: c.muted }]}>{f.hint}</Text>
            </Pressable>
          ))}
        </View>
        {error ? <Text style={[s.small, s.box, { color: c.danger, backgroundColor: c.danger + '14' }]}>{error}</Text> : null}
        {finishFailed ? (
          <Pressable onPress={() => void run(finish)} disabled={pending} accessibilityRole="button" style={s.textBtn}>
            <Text style={[s.bodyBold, { color: c.sky }]}>세션 마치기 다시 저장</Text>
          </Pressable>
        ) : (
          <Pressable onPress={skip} disabled={pending} accessibilityRole="button" style={s.textBtn}>
            <Text style={[s.smallBold, { color: c.muted }]}>{index + 1 < items.length ? '이번 드릴은 건너뛰기' : '건너뛰고 세션 마치기'}</Text>
          </Pressable>
        )}
      </View>
    </>
  );
}

/** 드릴 하나 — 요소 · 단계, 이름, 몇 번, 다른 드릴 · 도구, 느낌 신호, 영상, 설명(펼치면 받음) */
function DrillView({
  item,
  view,
  alt,
  onChoose,
  painLabel,
  c,
}: {
  item: SessionDrillView;
  view: DrillChoiceView;
  alt: number;
  onChoose: (next: Choice) => void;
  painLabel: string | null;
  c: Palette;
}) {
  const element = mechanicsElement(item.element);
  const alts = item.alternatives.length;
  const note = item.gearNote;
  /* 아픈 날 펼쳐서 하는 중 — 고른 도구가 팔에 싣는 것일 때만(도구 칩으로 바꾸면 따라 바뀐다) */
  const caution = painLabel != null && isArmLoaded(view.variant.category);
  const v = view.variant;

  return (
    <View style={{ gap: 16 }}>
      {caution ? (
        <View accessibilityRole="alert" style={[s.notice, { backgroundColor: c.warnBg }]}>
          <SymbolView name="exclamationmark.triangle.fill" size={14} tintColor={c.warn} />
          <Text style={[s.smallBold, { color: c.warn, flex: 1 }]}>{MECHANICS_FOLD_TEXT.loadedDrill(painLabel)}</Text>
        </View>
      ) : null}

      <View style={{ gap: 6 }}>
        <View style={s.tags}>
          <Text style={[s.tag, { color: c.sky, backgroundColor: c.sky + '1a' }]}>{item.element}</Text>
          <Text style={[s.tag, { color: c.ink, backgroundColor: c.chip }]}>{item.stage}</Text>
          {view.variants.length < 2 ? <Text style={[s.small, { color: c.muted }]}>{view.tool}</Text> : null}
        </View>
        <Text style={[s.title, { color: c.ink }]}>{view.title}</Text>
        <View style={s.doseRow}>
          <Text style={[s.amount, { color: c.sky }]}>{view.dose}</Text>
          {alts > 1 ? (
            <Pressable
              onPress={() => {
                const n = (alt + 1) % alts;
                void Haptics.selectionAsync();
                onChoose({ alt: n, variantId: item.alternatives[n].guideId });
              }}
              accessibilityRole="button"
              style={s.swap}
            >
              <SymbolView name="shuffle" size={14} weight="semibold" tintColor={c.sky} />
              <Text style={[s.bodyBold, { color: c.sky }]}>다른 드릴</Text>
              <Text style={[s.small, { color: c.muted, fontVariant: ['tabular-nums'] }]}>
                {alt + 1}/{alts}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={[s.small, { color: c.muted }]}>{view.tempo}</Text>
      </View>

      {view.variants.length > 1 ? (
        <View accessibilityLabel="도구" style={s.tools}>
          {view.variants.map((t) => {
            const on = t.id === view.guideId;
            return (
              <Pressable
                key={t.id}
                onPress={() => {
                  void Haptics.selectionAsync();
                  onChoose({ alt, variantId: t.id });
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                /* 가진 장비에 없는 도구는 점선 — 골라도 되지만(오늘 빌린 공) 처음엔 안 고른다 */
                style={[
                  s.tool,
                  on
                    ? { backgroundColor: c.sky, borderColor: c.sky }
                    : t.owned
                      ? { backgroundColor: c.card, borderColor: c.card }
                      : { borderColor: c.line, borderStyle: 'dashed' },
                ]}
              >
                <Text style={[s.bodyBold, { color: on ? '#fff' : t.owned ? c.ink : c.muted }]}>{t.tool}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {!v.owned ? (
        <Text style={[s.small, { color: c.muted }]}>이 도구는 가진 장비에 없어요. 있으면 그대로 해도 돼요.</Text>
      ) : note?.replaced && alt === 0 ? (
        <Text style={[s.small, { color: c.muted }]}>
          프로그램의 ‘{note.replaced}’에는 {note.need}
          {josa(note.need, '이/가')} 있어야 해서, 같은 단계의 이 드릴로 바꿨어요.
        </Text>
      ) : null}

      {item.cue ? <Text style={[s.bodyBold, s.box, { color: c.sky, backgroundColor: c.sky + '14' }]}>“{item.cue}”</Text> : null}

      <ExerciseMedia key={`video-${view.guideId}`} path={v.videoPath} referenceVideoId={v.referenceVideoId} thumbUrl={v.thumbUrl} aspectRatio={v.aspectRatio} />

      <Description key={`desc-${view.guideId}`} guideId={view.guideId} c={c} />

      {element ? (
        <Text style={[s.small, { color: c.muted }]}>
          {item.element} · {element.line}
        </Text>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  centerBox: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { paddingHorizontal: 8, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 6 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  circle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  headTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  count: { paddingRight: 8, fontVariant: ['tabular-nums'] },
  segments: { flexDirection: 'row', gap: 4, paddingHorizontal: 8 },
  segment: { flex: 1, height: 6, borderRadius: 3 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  box: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, overflow: 'hidden' },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 },
  tag: { fontSize: 12, fontWeight: '700', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2, overflow: 'hidden' },
  title: { fontSize: 24, fontWeight: '700', lineHeight: 30 },
  doseRow: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  amount: { fontSize: 17, fontWeight: '700' },
  swap: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 8 },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tool: { minHeight: 44, borderRadius: 22, borderWidth: 1, paddingHorizontal: 14, justifyContent: 'center' },
  bottom: { paddingHorizontal: 12, paddingTop: 12, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  setRow: { flexDirection: 'row', gap: 8 },
  setBtn: { flex: 1, minHeight: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  feelRow: { flexDirection: 'row', gap: 8 },
  feel: { flex: 1, minHeight: 64, borderRadius: 16, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', gap: 2 },
  feelLabel: { fontSize: 16, fontWeight: '700' },
  textBtn: { minHeight: 44, alignSelf: 'center', paddingHorizontal: 12, justifyContent: 'center' },
  finish: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingTop: 32, gap: 16 },
  doneMark: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  finishTitle: { fontSize: 26, fontWeight: '700' },
  block: { borderRadius: 16, padding: 16, gap: 12, alignSelf: 'stretch' },
  blockTitle: { fontSize: 17, fontWeight: '700', lineHeight: 23 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  pill: { minHeight: 48, borderRadius: 24, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  stretch: { alignSelf: 'stretch' },
  tiny: { fontSize: 11, lineHeight: 14 },
  small: { fontSize: 13, lineHeight: 18 },
  smallBold: { fontSize: 13, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 22 },
  bodyBold: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
  center: { textAlign: 'center' },
});
