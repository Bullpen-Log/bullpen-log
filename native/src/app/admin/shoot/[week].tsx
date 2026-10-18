import * as Haptics from 'expo-haptics';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import * as WebBrowser from 'expo-web-browser';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadAppShootWeek } from '@/app/actions/app-shoot';
import type { ShootResult } from '@/app/actions/shoot';
import type { ShootExerciseInfo } from '@/lib/shoot/load';
import { BUCKET_LABEL, clockText, countOf, cursorOfList, stateOf, weekItems, type ItemState, type ShootCheckView, type ShootStatus } from '@/lib/shoot/progress';
import { crewsOf } from '@/lib/shoot/crews';
import { weekLabel, type PlanItem } from '@/lib/shoot/schedule';
import { Bar, Chip, LoadState, s, useLoad } from '~/community/parts';
import { rpc } from '~/lib/rpc';
import { leaveTo } from '~/shell/web-nav';
import { STATE_LABEL, StackBar, StatePill, stampText, statePill } from '~/shoot/parts';
import { usePalette, type Palette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';

/**
 * 주차 시간표(관리자, 앱) — 웹 app/(app)/admin/shoot/[week]/week-view.tsx 를 옮겼다. 자리별로 번호 · 운동 · 시범 방법, 왼쪽 동그라미 = 찍음 ↔ 대기,
 * 줄을 누르면 자세히(상태 넷 · 메모 · 참고 영상 · 진행 방법). 체크는 웹과 같은 shoot.setShootStatus(바로 반영 · 실패하면 되돌림).
 * 영상 찍기 · 앨범에서 올리기(카메라 · 컷 편집)는 영상 엔진이 브라우저라 웹 촬영 모드(/admin/shoot/<주>/run?at=<번호>)로 보낸다.
 * ?at=<번호> 로 열면 그 운동 창을 연다(첫 화면 '다시 찍기 · 미룬 것'에서).
 */
type Loaded = Awaited<ReturnType<typeof loadAppShootWeek>>;
type Data = NonNullable<Extract<Loaded, { ok: true }>['data']>;
type Filter = 'all' | 'open' | 'done';

export default function ShootWeekScreen() {
  const c = usePalette();
  const { week: param, at } = useLocalSearchParams<{ week: string; at?: string }>();
  const { data, error, reload } = useLoad<Loaded>('app-shoot.loadAppShootWeek', Number(param));
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="영상 촬영" title={data?.data ? weekLabel(data.data.week) : ''} c={c} />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : !data.data ? (
        <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center', padding: 24 }}>그런 주차가 없어요.</Text>
      ) : (
        <WeekBody key={data.data.week.week} data={data.data} me={data.me} at={at ?? null} reload={reload} c={c} />
      )}
    </View>
  );
}

function WeekBody({ data, me, at, reload, c }: { data: Data; me: string; at: string | null; reload: () => Promise<void>; c: Palette }) {
  const inset = useSafeAreaInsets();
  const { week, carried, infos, weeks } = data;
  /* 바로 반영한 체크 — 서버에서 새로 읽으면(당겨서 새로고침 · 돌아옴) 그것이 이긴다(from 이 지난 읽기면 버린다) */
  const [local, setLocal] = useState<{ from: ShootCheckView[]; list: ShootCheckView[] } | null>(null);
  const checks = local && local.from === data.checks ? local.list : data.checks;
  const setChecks = (list: ShootCheckView[]) => setLocal({ from: data.checks, list });
  const map = useMemo(() => new Map(checks.map((x) => [x.exerciseId, x])), [checks]);
  const [filter, setFilter] = useState<Filter>('all');
  const [error, setError] = useState<string | null>(null);

  const items = useMemo(() => weekItems(week), [week]);
  const queue = useMemo(() => [...items, ...carried.map((x) => x.item)], [items, carried]);
  const carriedWeek = useMemo(() => new Map(carried.map((x) => [x.item.exerciseId, x.week])), [carried]);
  const count = countOf(items, map);
  const { current, next } = cursorOfList(queue, map, null, !!week.deferred);
  const crews = crewsOf(week);
  const crewOf = useMemo(() => new Map(week.stations.flatMap((st) => st.items.map((it) => [it.exerciseId, st.crew] as const))), [week]);
  const equipment = useMemo(() => [...new Set(items.flatMap((it) => it.equipment))].filter((e) => e !== '맨몸'), [items]);
  const runHref = (crew?: string, no?: string) => {
    const q = [crew ? `crew=${encodeURIComponent(crew)}` : '', no ? `at=${encodeURIComponent(no)}` : ''].filter(Boolean).join('&');
    return `/admin/shoot/${week.week}/run${q ? `?${q}` : ''}`;
  };

  /* 첫 화면 목록에서 ?at= 로 오면 그 운동 창을 연 채 시작한다 */
  const [openId, setOpenId] = useState<string | null>(() => (at ? (queue.find((it) => it.no === at)?.exerciseId ?? null) : null));

  /* 바로 반영 → 서버 → 받은 체크로 맞춤(다른 사람이 찍은 것까지), 실패하면 되돌림 */
  const set = async (it: PlanItem, status: ShootStatus | null, note?: string | null): Promise<boolean> => {
    setError(null);
    const before = checks;
    const prev = map.get(it.exerciseId);
    const optimistic: ShootCheckView[] =
      status === null
        ? checks.filter((x) => x.exerciseId !== it.exerciseId)
        : [
            { exerciseId: it.exerciseId, status, at: prev?.status === status ? prev.at : new Date().toISOString(), by: me, note: note !== undefined ? note || null : (prev?.note ?? null) },
            ...checks.filter((x) => x.exerciseId !== it.exerciseId),
          ];
    setChecks(optimistic);
    try {
      const r = await rpc<ShootResult>('shoot.setShootStatus', it.exerciseId, status, note);
      if (!r.ok) {
        setChecks(before);
        setError(r.error);
        return false;
      }
      setChecks(r.checks);
      return true;
    } catch {
      setChecks(before);
      setError('신호가 약해 저장하지 못했어요. 다시 해 주세요.');
      return false;
    }
  };
  const toggle = (it: PlanItem) => {
    const done = stateOf(it, map) === 'done';
    void Haptics.impactAsync(done ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
    void set(it, done ? null : 'done');
  };
  const show = (it: PlanItem) => {
    const st = stateOf(it, map);
    return filter === 'open' ? st !== 'done' : filter === 'done' ? st === 'done' : true;
  };
  const openItem = openId ? queue.find((it) => it.exerciseId === openId) : undefined;
  const mark = (it: PlanItem) => (it === current ? '지금' : it === next ? '다음' : null);

  return (
    <>
      <ScrollView
        contentContainerStyle={[{ padding: 16, gap: 12, paddingBottom: inset.bottom + 32 }, READABLE]}
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => void reload()} />}
      >
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {weeks.map((w) => (
            <Chip key={w.week} label={w.label} on={w.week === week.week} onPress={() => w.week !== week.week && router.replace(`/admin/shoot/${w.week}` as Href)} c={c} />
          ))}
        </ScrollView>
        <Text style={{ color: c.muted, fontSize: 14, lineHeight: 20, paddingHorizontal: 4 }}>
          {week.deferred
            ? `미룬 운동을 모아 둔 곳이에요 · ${items.length + carried.length}개`
            : `${items.length}개 · 계획 0:15~${clockText(week.end)} · ${crews.length ? `${crews.join(' · ')} 두 사람이 공간을 나눠 동시에` : `자리 ${week.stations.length}곳`}${carried.length ? ` · 앞 주에서 넘어온 것 ${carried.length}개` : ''}`}
        </Text>

        <View style={{ borderRadius: 14, padding: 14, gap: 12, backgroundColor: c.card, boxShadow: c.float }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Text style={{ color: c.muted, fontSize: 14 }}>
              <Text style={{ color: c.ink, fontSize: 24, fontWeight: '700' }}>{count.done}</Text> / {count.total} 찍음
              {count.redo > 0 ? <Text style={{ color: c.warn }}>  다시 {count.redo}</Text> : null}
              {count.later > 0 ? <Text>  미룸 {count.later}</Text> : null}
            </Text>
            <Text style={[s.meta, { color: c.muted }]}>{Math.round(count.total ? (count.done / count.total) * 100 : 0)}%</Text>
          </View>
          <StackBar done={count.done} redo={count.redo} later={count.later} total={count.total} height={10} c={c} />
          {current ? (
            <View style={{ gap: 8 }}>
              <NowCard tag="지금" it={current} fromWeek={carriedWeek.get(current.exerciseId)} onPress={() => setOpenId(current.exerciseId)} strong c={c} />
              {next ? <NowCard tag="다음" it={next} fromWeek={carriedWeek.get(next.exerciseId)} onPress={() => setOpenId(next.exerciseId)} c={c} /> : null}
            </View>
          ) : (
            <Text style={{ color: c.sky, fontSize: 15, fontWeight: '600' }}>
              이 주 계획을 다 찍었어요{count.later ? ` · 미룬 것 ${count.later}개가 남아 있어요` : ''}.
            </Text>
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(crews.length ? crews : [undefined]).map((cr) => (
              <Pressable key={cr ?? 'all'} accessibilityRole="button" onPress={() => leaveTo(runHref(cr))} style={[s.pill, { flex: 1, minHeight: 52, backgroundColor: c.sky }]}>
                <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>{cr ? `${cr} 촬영` : count.done > 0 ? '이어 찍기' : '촬영 모드로 시작'}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={{ borderRadius: 14, padding: 14, gap: 8, backgroundColor: c.card, boxShadow: c.float }}>
          <Text style={{ color: c.ink, fontSize: 15, fontWeight: '700' }}>챙길 기구</Text>
          <View style={s.chips}>
            {equipment.map((e) => (
              <Text key={e} style={{ color: c.ink, fontSize: 13, fontWeight: '500', borderRadius: 12, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 4, backgroundColor: c.chip }}>
                {e}
              </Text>
            ))}
          </View>
          <Text style={[s.meta, { color: c.muted, lineHeight: 19 }]}>
            자리 순서 · {week.stations.map((st) => (st.warmup ? '몸풀기' : st.station)).join(' → ')}.{' '}
            {week.outdoor
              ? '워밍업으로 모델이 몸을 푼 뒤 드릴로. 던지는 드릴은 2~3구, 메디신볼은 3회 — 공 줍는 사람 한 명.'
              : '시범은 가볍게 3회 · 버티기 10초 · 천천히 내리기는 1~2회 · 좌우는 한쪽만.'}
          </Text>
        </View>

        {error ? <Text style={{ color: c.danger, fontSize: 15, fontWeight: '600' }}>{error}</Text> : null}

        <View accessibilityRole="radiogroup" style={s.chips}>
          {(['all', 'open', 'done'] as const).map((f) => (
            <Chip key={f} label={f === 'all' ? '전체' : f === 'open' ? '남음' : '찍음'} on={filter === f} onPress={() => setFilter(f)} c={c} />
          ))}
        </View>

        {week.stations.map((st) => {
          const list = st.items.filter(show);
          if (list.length === 0) return null;
          const sc = countOf(st.items, map);
          return (
            <View key={st.warmup ? 'warmup' : st.station} style={[s.group, { backgroundColor: c.card, boxShadow: c.float }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: c.line }}>
                <Text style={{ flex: 1, color: c.ink, fontSize: 15, fontWeight: '700' }} numberOfLines={2}>
                  {st.crew ? <Text style={{ color: c.sky }}>{st.crew} </Text> : null}
                  {st.space ? <Text style={{ color: c.muted, fontWeight: '500' }}>{st.space} · </Text> : null}
                  {st.warmup ? '몸풀기 · 가벼운 모빌리티 · 스트레칭' : st.station}
                </Text>
                <Text style={[s.meta, { color: c.muted, fontVariant: ['tabular-nums'] }]}>
                  {clockText(st.start)}–{clockText(st.end)}  <Text style={{ color: c.ink, fontWeight: '600' }}>{sc.done}</Text>/{sc.total}
                </Text>
              </View>
              {list.map((it) => (
                <ItemRow key={it.exerciseId} it={it} state={stateOf(it, map)} check={map.get(it.exerciseId)} uploaded={!!infos[it.exerciseId]?.uploaded} mark={mark(it)} onToggle={() => toggle(it)} onOpen={() => setOpenId(it.exerciseId)} c={c} />
              ))}
            </View>
          );
        })}

        {carried.length > 0 ? (
          <View style={[s.group, { backgroundColor: c.card, borderWidth: 1, borderStyle: 'dashed', borderColor: c.line }]}>
            <View style={{ paddingHorizontal: 14, paddingVertical: 10, gap: 2, borderBottomWidth: 0.5, borderBottomColor: c.line }}>
              <Text style={{ color: c.ink, fontSize: 15, fontWeight: '700' }}>
                {week.deferred ? '다른 주에서 미룬 것' : '앞 주에서 넘어온 것'} {carried.length}개
              </Text>
              <Text style={[s.meta, { color: c.muted }]}>
                {week.deferred ? '미룸으로 체크하면 여기로 모여요. 번호는 원래 주차 번호예요.' : '이 주 계획을 다 찍은 뒤 이어 찍어요. 번호는 원래 주차 번호예요.'}
              </Text>
            </View>
            {carried
              .map((x) => x.item)
              .filter(show)
              .map((it) => (
                <ItemRow key={it.exerciseId} it={it} state={stateOf(it, map)} check={map.get(it.exerciseId)} uploaded={!!infos[it.exerciseId]?.uploaded} mark={mark(it)} carried onToggle={() => toggle(it)} onOpen={() => setOpenId(it.exerciseId)} c={c} />
              ))}
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={!!openItem} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setOpenId(null)}>
        {openItem ? (
          <DetailSheet
            key={openItem.exerciseId}
            it={openItem}
            info={infos[openItem.exerciseId]}
            check={map.get(openItem.exerciseId)}
            onSet={(status, note) => set(openItem, status, note)}
            onRun={() => {
              setOpenId(null);
              leaveTo(runHref(crewOf.get(openItem.exerciseId), openItem.no));
            }}
            onClose={() => setOpenId(null)}
            c={c}
          />
        ) : null}
      </Modal>
    </>
  );
}

function NowCard({ tag, it, fromWeek, onPress, strong = false, c }: { tag: string; it: PlanItem; fromWeek?: number; onPress: () => void; strong?: boolean; c: Palette }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [{ borderRadius: 12, padding: 12, gap: 3, backgroundColor: pressed ? c.line : strong ? c.chip : c.page }]}>
      <Text style={[s.meta, { color: strong ? c.sky : c.muted, fontWeight: '600' }]}>
        {tag} · {it.no}
        {fromWeek ? ` · ${fromWeek}주차에서` : ''} · 계획 {clockText(it.at)}
      </Text>
      <Text style={{ color: c.ink, fontSize: 17, fontWeight: '700' }} numberOfLines={1}>
        {it.title}
      </Text>
      <Text style={[s.meta, { color: c.muted }]} numberOfLines={1}>
        {it.cue} · {it.equipment.join(' · ')}
      </Text>
    </Pressable>
  );
}

const STATE_SYMBOL: Record<ItemState, 'checkmark' | 'arrow.counterclockwise' | 'clock' | null> = {
  done: 'checkmark',
  redo: 'arrow.counterclockwise',
  later: 'clock',
  todo: null,
};

function ItemRow({
  it,
  state,
  check,
  uploaded,
  mark,
  carried = false,
  onToggle,
  onOpen,
  c,
}: {
  it: PlanItem;
  state: ItemState;
  check: ShootCheckView | undefined;
  uploaded: boolean;
  mark: '지금' | '다음' | null;
  carried?: boolean;
  onToggle: () => void;
  onOpen: () => void;
  c: Palette;
}) {
  const pill = statePill(state, c);
  const symbol = STATE_SYMBOL[state];
  return (
    <View style={{ borderTopWidth: 0.5, borderTopColor: c.line, backgroundColor: mark === '지금' ? c.chip : undefined }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: 4, paddingRight: 12 }}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: state === 'done' }}
          accessibilityLabel={state === 'done' ? `${it.no} 대기로 되돌리기` : `${it.no} 찍음으로 표시`}
          onPress={onToggle}
          style={{ width: 48, height: 52, alignItems: 'center', justifyContent: 'center' }}
        >
          <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: pill.bg, borderWidth: pill.border ? 1 : 0, borderColor: pill.border }}>
            {symbol ? <SymbolView name={symbol} size={14} tintColor={pill.color} weight="bold" /> : null}
          </View>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingVertical: 8, opacity: pressed ? 0.6 : 1 }]}>
          <Text style={[s.meta, { color: c.muted, width: 38, fontVariant: ['tabular-nums'] }]}>{it.no}</Text>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: state === 'done' ? c.muted : c.ink, fontSize: 15, fontWeight: '600', textDecorationLine: state === 'done' ? 'line-through' : 'none' }}>
              {it.title}
              {it.load >= 2 ? <Text style={{ color: c.warn, fontSize: 11, fontWeight: '700' }}>  높음</Text> : null}
              {uploaded ? <Text style={{ color: c.sky, fontSize: 11, fontWeight: '700' }}>  올림</Text> : null}
            </Text>
            <Text style={[s.meta, { color: c.muted }]} numberOfLines={1}>
              {carried ? `${it.station} · ` : ''}
              {it.cue}
              {check?.note ? <Text style={{ color: c.warn }}> · {check.note}</Text> : null}
            </Text>
          </View>
          {mark ? (
            <View style={{ borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: mark === '지금' ? c.sky : c.page }}>
              <Text style={{ color: mark === '지금' ? '#fff' : c.sky, fontSize: 12, fontWeight: '700' }}>{mark}</Text>
            </View>
          ) : state === 'redo' || state === 'later' ? (
            <StatePill state={state} c={c} />
          ) : null}
        </Pressable>
      </View>
      {it.breakAfter && !carried ? (
        <Text style={{ color: c.sky, fontSize: 13, fontWeight: '600', paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: c.line }}>
          쉬기 5분 · 모델은 물 마시고 다음 운동 영상 보기
        </Text>
      ) : null}
    </View>
  );
}

function DetailSheet({
  it,
  info,
  check,
  onSet,
  onRun,
  onClose,
  c,
}: {
  it: PlanItem;
  info: ShootExerciseInfo | undefined;
  check: ShootCheckView | undefined;
  onSet: (status: ShootStatus | null, note?: string | null) => Promise<boolean>;
  onRun: () => void;
  onClose: () => void;
  c: Palette;
}) {
  const inset = useSafeAreaInsets();
  const state: ItemState = check?.status ?? 'todo';
  const [note, setNote] = useState(check?.note ?? '');
  const [saved, setSaved] = useState(false);
  const [how, setHow] = useState(true);
  const equipment = info?.equipment.length ? info.equipment : it.equipment;
  const facts: [string, string][] = [
    ['시범', it.cue],
    ['자리', it.station],
    ['기구', equipment.join(' · ') || '맨몸'],
    ...(it.group ? [[it.kind === 'warmup' ? '루틴' : '단계', it.group] as [string, string]] : []),
    ...(info?.prescription ? [['앱 처방', info.prescription] as [string, string]] : []),
  ];
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, paddingBottom: 8 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: c.ink, fontSize: 19, fontWeight: '700' }}>
            {it.no} {it.title}
          </Text>
          <Text style={[s.meta, { color: c.muted }]}>
            {it.station} · {BUCKET_LABEL[it.bucket]} · 계획 {clockText(it.at)}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} hitSlop={10} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: c.sky, fontSize: 17 }}>닫기</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={[{ padding: 16, paddingTop: 4, gap: 14, paddingBottom: inset.bottom + 32 }, READABLE]} keyboardShouldPersistTaps="handled">
        <View accessibilityRole="radiogroup" style={s.chips}>
          {(['todo', 'done', 'redo', 'later'] as const).map((v) => (
            <Chip
              key={v}
              label={STATE_LABEL[v]}
              on={state === v}
              color={v === 'redo' ? c.warn : undefined}
              onPress={() => {
                if (v === state) return;
                void Haptics.impactAsync(v === 'done' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light);
                void onSet(v === 'todo' ? null : v);
              }}
              c={c}
            />
          ))}
        </View>
        {check ? (
          <Text style={[s.meta, { color: c.muted, marginTop: -6 }]}>
            {check.by ?? '누군가'} · {stampText(check.at)}
          </Text>
        ) : null}
        <Pressable accessibilityRole="button" onPress={onRun} style={[s.pill, { backgroundColor: c.sky }]}>
          <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{info?.uploaded ? '다시 찍기 · 촬영 모드에서' : '영상 찍기 · 촬영 모드에서'}</Text>
        </Pressable>
        <Text style={[s.meta, { color: c.muted, marginTop: -6 }]}>촬영 모드에서 카메라로 찍거나 앨범에서 골라 잘라 올려요.</Text>

        <View style={{ borderRadius: 14, padding: 14, gap: 8, backgroundColor: c.card, boxShadow: c.float }}>
          {facts.map(([k, v]) => (
            <View key={k} style={{ flexDirection: 'row', gap: 12 }}>
              <Text style={{ color: c.muted, fontSize: 15, width: 56 }}>{k}</Text>
              <Text style={{ flex: 1, color: c.ink, fontSize: 15, fontWeight: k === '시범' ? '600' : '400' }}>{v}</Text>
            </View>
          ))}
        </View>
        {info?.youtube ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => void WebBrowser.openBrowserAsync(`https://www.youtube.com/watch?v=${info.youtube!.id}`)}
            style={({ pressed }) => [{ minHeight: 48, borderRadius: 14, paddingHorizontal: 14, justifyContent: 'center', backgroundColor: pressed ? c.line : c.card }]}
          >
            <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>참고 영상 보기 ›</Text>
          </Pressable>
        ) : null}
        {info?.description ? (
          <View style={{ gap: 6 }}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: how }} onPress={() => setHow((v) => !v)} style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>진행 방법</Text>
              <Text style={{ color: c.muted, fontSize: 14 }}>{how ? '접기' : '펴기'}</Text>
            </Pressable>
            {how ? (
              <Text selectable style={{ color: c.ink, fontSize: 15, lineHeight: 23 }}>
                {info.description}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={{ gap: 6 }}>
          <Text style={[s.label, { color: c.muted }]}>메모{state === 'todo' ? ' — 저장하면 다시 찍기로 표시돼요' : ''}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={note}
              onChangeText={(t) => {
                setNote(t);
                setSaved(false);
              }}
              maxLength={200}
              placeholder="초점 나감 · 무게 바꿔서 다시"
              placeholderTextColor={c.muted}
              style={[s.input, { flex: 1, backgroundColor: c.card, color: c.ink }]}
            />
            <Pressable
              accessibilityRole="button"
              onPress={async () => {
                const ok = await onSet(state === 'todo' ? 'redo' : state, note);
                if (ok) setSaved(true);
              }}
              style={{ minHeight: 48, borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: c.chip }}
            >
              <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>{saved ? '저장됨' : '저장'}</Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
