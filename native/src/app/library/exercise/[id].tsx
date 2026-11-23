import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { rpc } from '~/lib/rpc';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette, type Palette } from '~/lib/ui';
import { Bar } from '~/community/parts';
import { ExerciseDetail, type DetailEntry } from '~/library/detail';
import { EXERCISE_LIST, recall, type Exercise } from '~/library/parts';
import { useFav } from '~/training/favorites';
import { s, useScreenData } from '~/training/screen';
import { READABLE } from '~/lib/layout';
import { validKind } from '~/library/warmup-model';
import { Press } from '~/shell/press';
import { Icon } from '~/shell/icon';

/**
 * 운동 상세(앱 화면, 2026-10-31 시안 02) — 운동 영상 목록의 카드 · 운동 진행의 [운동 상세]가 연다. 위에 쌓이는 화면이라 뒤로 가면
 * 목록(조건 · 보던 자리)이나 운동 진행(같은 판 · 입력 중인 세트 · 쉬는 시계)이 그대로 있다 — 이 화면은 읽기만 하고, 별 · 메모만 따로 저장한다.
 * 주소: /library/exercise/<id>[?session=<판>&today=<그 판에 배정된 구성>]. 목록에서 받은 줄을 그대로 그리고, 바로 열린 주소면 목록을 받아 찾는다.
 */
export default function ExerciseDetailScreen() {
  const c = usePalette();
  const params = useLocalSearchParams<{
    id: string;
    session?: string;
    today?: string;
    warmup?: string;
    rname?: string;
    section?: string;
    rnote?: string;
    builder?: string;
    bname?: string;
    bsets?: string;
  }>();
  const id = params.id ?? '';
  /* 워밍업 루틴에서 왔으면 그 루틴(정해 둔 모양의 종류만) — 세션 칸에 넣지 않는다 */
  const warmup = validKind(params.warmup);
  const routine =
    warmup && !params.session
      ? { kind: warmup, name: (params.rname || '워밍업 루틴').slice(0, 40), section: params.section === 'common' ? ('common' as const) : ('extra' as const), note: params.rnote?.trim().slice(0, 300) || null }
      : null;
  /* 암케어 루틴 만들기 · 운동 추가에서 왔으면 — 읽기만(세트 · 선택 · 저장은 그 화면 몫) */
  const bsets = Number(params.bsets);
  const from: 'edit' | 'pick' | null = params.builder === 'edit' ? 'edit' : params.builder === 'pick' ? 'pick' : null;
  const builder =
    from && !params.session && !warmup
      ? { from, name: (params.bname || (from === 'pick' ? '운동 추가' : '루틴')).slice(0, 20), sets: Number.isInteger(bsets) && bsets >= 1 && bsets <= 5 ? bsets : 1 }
      : null;
  const entry: DetailEntry = { sessionId: params.session || null, today: params.today || null, routine, builder };
  const kept = id ? recall<Exercise>(id) : null;
  const back = entry.sessionId ? '운동으로' : routine ? routine.name : builder ? builder.name : '운동 영상';
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      {kept ? <Body item={kept} entry={entry} back={back} c={c} /> : <FromList id={id} entry={entry} back={back} c={c} />}
    </View>
  );
}

/* 뒤가 없으면(바로 열린 주소) 워밍업 루틴 · 운동 영상으로. 운동 진행에서 온 것은 예전처럼 그냥 뒤로(그 화면이 판을 지킨다) */
const onBackOf = (entry: DetailEntry) =>
  entry.sessionId
    ? undefined
    : () => (router.canGoBack() ? router.back() : router.replace((entry.routine ? `/library/warmup/${entry.routine.kind}` : '/library/training') as Href));

/** 목록에 없던 운동(앱을 막 켜 상세 주소로 바로 옴 · 운동 진행에서 옴) — 목록을 받아 찾는다(세션을 열거나 만들지 않는다) */
function FromList({ id, entry, back, c }: { id: string; entry: DetailEntry; back: string; c: Palette }) {
  const state = useScreenData<{ exercises: Exercise[] }>(EXERCISE_LIST, '', 'library:exercises');
  const item = state.data?.exercises.find((ex) => ex.id === id);
  if (item) return <Body item={item} entry={entry} back={back} c={c} />;
  const note = state.data
    ? entry.sessionId
      ? '운동 영상 목록에 없는 운동이에요. 운동 화면의 자세·영상 보기에서 볼 수 있어요.'
      : '없는 운동이에요. 숨겨졌거나 지워졌을 수 있어요.'
    : state.failed;
  return (
    <>
      <Bar back={back} onBack={onBackOf(entry)} c={c} />
      {note ? (
        <View style={{ padding: 32, gap: 12, alignItems: 'center' }}>
          <Text style={[s.body, s.center, { color: c.muted }]}>{note}</Text>
          {!state.data ? (
            <Press accessibilityRole="button" onPress={() => void state.load()} style={s.textBtn}>
              <Text style={[s.smallBold, { color: c.link }]}>다시 불러오기</Text>
            </Press>
          ) : null}
        </View>
      ) : (
        <ActivityIndicator style={{ marginTop: 40 }} />
      )}
    </>
  );
}

type Pref = 'less' | 'never' | null;
/* 이 화면에서 바꾼 값 — 목록이 쥔 줄(recall)은 옛 값이라, 다시 열어도 방금 고른 것이 보이게 */
const chosenPref = new Map<string, Pref>();
const PREFS: readonly { value: Pref; label: string }[] = [
  { value: null, label: '보통' },
  { value: 'less', label: '덜 추천' },
  { value: 'never', label: '추천 안 함' },
];

/**
 * 추천 빈도(2026-11-23) — 매일 일정이 이 운동을 얼마나 내보낼지. '덜 추천'은 뒤로 밀리고 '추천 안 함'은 일정에서 빠진다
 * (favorite.setExercisePref). 더 자주 받고 싶으면 위의 별(즐겨찾기). 직접 더하는 것 · 근력 프로그램의 운동은 그대로다.
 */
function PrefRow({ item, c }: { item: Exercise; c: Palette }) {
  const [pref, setPref] = useState<Pref>(chosenPref.has(item.id) ? chosenPref.get(item.id)! : (item.pref ?? null));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const choose = async (next: Pref) => {
    if (busy || next === pref) return;
    const before = pref;
    setPref(next);
    setError(null);
    setBusy(true);
    try {
      const r = await rpc<{ pref: Pref } | { error: string }>('favorite.setExercisePref', item.id, next);
      if ('error' in r) throw new Error(r.error);
      chosenPref.set(item.id, next);
    } catch (e) {
      setPref(before);
      setError(e instanceof Error && e.message ? e.message : '저장하지 못했어요.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={[s.box, { backgroundColor: c.card, gap: 10 }]}>
      <Text style={[s.smallBold, { color: c.ink }]}>오늘 일정에 추천</Text>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 8 }}>
        {PREFS.map((p) => {
          const on = p.value === pref;
          return (
            <Press
              key={p.label}
              onPress={() => void choose(p.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled: busy }}
              style={{ flex: 1, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.action : c.chip }}
            >
              <Text style={{ color: on ? c.onAction : c.ink, fontSize: 15, fontWeight: on ? '600' : '400' }}>{p.label}</Text>
            </Press>
          );
        })}
      </View>
      <Text style={[s.small, { color: error ? c.danger : c.muted }]}>
        {error ?? (pref === 'never' ? '매일 일정에 나오지 않아요. 직접 더할 수는 있어요.' : pref === 'less' ? '매일 일정에서 뒤로 밀려요.' : '더 자주 받으려면 위의 별을 눌러요.')}
      </Text>
    </View>
  );
}

function Body({ item, entry, back, c }: { item: Exercise; entry: DetailEntry; back: string; c: Palette }) {
  const inset = useSafeAreaInsets();
  const star = useFav('exercise', item.id, item.favorite);
  return (
    <>
      <Bar
        back={back}
        onBack={onBackOf(entry)}
        c={c}
        right={
          <Press
            onPress={star.toggle}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={star.on ? `${item.title} 즐겨찾기 해제` : `${item.title} 즐겨찾기에 담기`}
            accessibilityState={{ selected: star.on }}
            style={s.iconBtn}
          >
            <Icon name="star" size={22} color={star.on ? '#ff9500' : c.link} fill={star.on ? '#ff9500' : 'none'} />
          </Press>
        }
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[{ padding: 16, paddingBottom: inset.bottom + 40, gap: 12 }, READABLE]}>
        {/* 별 저장 실패 — 확인된 실패는 원래 값으로 되돌렸고, 답을 못 받은 것은 따로 알린다. [다시 시도]는 같은 바람(뒤집기 아님) */}
        {star.error ? (
          <View accessibilityLiveRegion="polite" style={[s.box, { backgroundColor: c.card, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
            <Text style={[s.small, { color: c.danger, flex: 1 }]}>
              {star.lost ? star.error : `즐겨찾기를 저장하지 못했어요. ${star.error}`}
            </Text>
            {star.canRetry ? (
              <Press onPress={star.retry} accessibilityRole="button" style={s.textBtn}>
                <Text style={[s.smallBold, { color: c.link }]}>다시 시도</Text>
              </Press>
            ) : null}
          </View>
        ) : null}
        <ExerciseDetail item={item} entry={entry} c={c} />
        <PrefRow item={item} c={c} />
      </ScrollView>
    </>
  );
}
