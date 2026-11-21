import { Icon } from '~/shell/icon';
import * as Haptics from 'expo-haptics';
import { type Href, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, KeyboardAvoidingView, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadAppShootWeek } from '@/app/actions/app-shoot';
import type { ShootResult } from '@/app/actions/shoot';
import type { ShootExerciseInfo } from '@/lib/shoot/load';
import { BUCKET_LABEL, clockText, countOf, cursorOfList, isRescheduled, stateOf, weekItems, type ItemState, type ShootCheckView, type ShootStatus } from '@/lib/shoot/progress';
import { crewsOf } from '@/lib/shoot/crews';
import { SHOOT_NOTE_MAX, shootRunHref } from '@/lib/shoot/guide';
import { hasFixedShootTime, weekLabel, type PlanItem } from '@/lib/shoot/schedule';
import { shootReferenceOf, type ShootReference } from '@/lib/shoot/reference';
import { splitInstagramReference } from '@/lib/mechanics/reference-draft';
import { ShootReferencePlayer } from '~/shoot/reference-player';
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
  const [referenceId, setReferenceId] = useState<string | null>(null);
  useFocusEffect(useCallback(() => () => setReferenceId(null), []));
  const [error, setError] = useState<string | null>(null);

  const items = useMemo(() => weekItems(week), [week]);
  const queue = useMemo(() => [...items, ...carried.map((x) => x.item)], [items, carried]);
  const carriedWeek = useMemo(() => new Map(carried.map((x) => [x.item.exerciseId, x.week])), [carried]);
  const count = countOf(items, map);
  const { current, next } = cursorOfList(queue, map, null, !!week.deferred);
  const crews = crewsOf(week);
  const crewOf = useMemo(() => new Map(week.stations.flatMap((st) => st.items.map((it) => [it.exerciseId, st.crew] as const))), [week]);
  const equipment = useMemo(() => [...new Set(items.flatMap((it) => it.equipment))].filter((e) => e !== '맨몸'), [items]);
  const runHref = (crew?: string, no?: string) => shootRunHref(week.week, crew, no);
  const guideHref = (crew?: string, no?: string) => shootRunHref(week.week, crew, no, 'guide');

  /* 첫 화면 목록에서 ?at= 로 오면 그 운동 창을 연 채 시작한다 */
  const [openId, setOpenId] = useState<string | null>(() => (at ? (queue.find((it) => it.no === at)?.exerciseId ?? null) : null));

  function openDetail(exerciseId: string) {
    setReferenceId(null);
    setOpenId(exerciseId);
  }

  /* 방금 바꾼 것 되돌리기 알림 — 웹 ShootUndoToast 와 같이 6초 */
  const [toast, setToast] = useState<{ seq: number; text: string; it: PlanItem; status: ShootStatus | null; note: string | null } | null>(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  const inflight = useRef(0);
  const readVersion = useRef(0);

  /* 다른 폰의 체크 받기 — 웹 use-shoot-checks 처럼 15초마다 · 앱으로 돌아올 때, 저장 중에는 쉰다 */
  const base = data.checks;
  useEffect(() => {
    let alive = true;
    const tick = async () => {
      if (inflight.current > 0 || AppState.currentState !== 'active') return;
      const version = ++readVersion.current;
      const r = await rpc<ShootResult>('shoot.fetchShootChecks').catch(() => null);
      if (alive && r?.ok && version === readVersion.current && inflight.current === 0) setLocal({ from: base, list: r.checks });
    };
    const id = setInterval(tick, 15_000);
    const sub = AppState.addEventListener('change', (st) => st === 'active' && void tick());
    return () => {
      alive = false;
      clearInterval(id);
      sub.remove();
    };
  }, [base]);

  /* 바로 반영 → 서버 → 받은 체크로 맞춤(다른 사람이 찍은 것까지), 실패하면 되돌림 */
  const set = async (it: PlanItem, status: ShootStatus | null, note?: string | null, label?: string): Promise<boolean> => {
    const optimisticWrite = status !== 'later';
    if (!optimisticWrite && inflight.current > 0) return false;
    setError(null);
    const before = checks;
    const prev = map.get(it.exerciseId);
    const reopened = isRescheduled(it, prev);
    const optimistic: ShootCheckView[] =
      status === null
        ? checks.filter((x) => x.exerciseId !== it.exerciseId)
        : [
            { exerciseId: it.exerciseId, status, at: prev?.status === status && !reopened ? prev.at : new Date().toISOString(), by: me, note: note !== undefined ? note?.trim() || null : (prev?.note ?? null) },
            ...checks.filter((x) => x.exerciseId !== it.exerciseId),
          ];
    if (optimisticWrite) setChecks(optimistic);
    readVersion.current++;
    inflight.current++;
    try {
      const r = await rpc<ShootResult>('shoot.setShootStatus', it.exerciseId, status, note).finally(() => inflight.current--);
      if (!r.ok) {
        if (optimisticWrite) setChecks(before);
        setError(r.error);
        return false;
      }
      setChecks(r.checks);
      if (label) setToast((t) => ({ seq: (t?.seq ?? 0) + 1, text: label, it, status: reopened ? 'redo' : (prev?.status ?? null), note: prev?.note ?? null }));
      return true;
    } catch {
      if (optimisticWrite) setChecks(before);
      setError('신호가 약해 저장하지 못했어요. 다시 해 주세요.');
      return false;
    }
  };
  const toggle = (it: PlanItem) => {
    const done = stateOf(it, map) === 'done';
    void Haptics.impactAsync(done ? Haptics.ImpactFeedbackStyle.Light : Haptics.ImpactFeedbackStyle.Medium);
    void set(it, done ? null : 'done', undefined, `${it.no} ${done ? '대기로 되돌림' : '찍음'}`);
  };
  const show = (it: PlanItem) => {
    const st = stateOf(it, map);
    return filter === 'open' ? st !== 'done' : filter === 'done' ? st === 'done' : true;
  };
  const openItem = openId ? queue.find((it) => it.exerciseId === openId) : undefined;
  const mark = (it: PlanItem) => (it === current ? '지금' : it === next ? '다음' : null);
  const session = week.session;
  const startMinute = session?.startMinute ?? 0;
  const plannedTime = (it: PlanItem) => hasFixedShootTime(week, it.at) ? startMinute + it.at : undefined;
  const drillCount = items.filter((item) => item.kind === 'drill').length;

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
        <Text style={{ color: c.muted, fontSize: 15, lineHeight: 20, paddingHorizontal: 4 }}>
          {session
            ? `${clockText(startMinute)}–${clockText(startMinute + week.end)} · 메커니즘 ${drillCount}개 · 트레이닝 ${items.length - drillCount}개`
            : week.deferred
            ? `미룬 운동을 모아 둔 곳이에요 · ${items.length + carried.length}개`
            : `${items.length}개 · 계획 0:15~${clockText(week.end)} · ${crews.length ? `${crews.join(' · ')} 두 사람이 공간을 나눠 동시에` : `자리 ${week.stations.length}곳`}${carried.length ? ` · 앞 주에서 넘어온 것 ${carried.length}개` : ''}`}
        </Text>
        <View style={{ gap: 8 }}>
          {(crews.length ? crews : [undefined]).map((crew) => (
            <View key={crew ?? 'all'} style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable accessibilityRole="button" onPress={() => leaveTo(runHref(crew))} style={[s.pill, { flex: 1, minHeight: 52, paddingHorizontal: 8, backgroundColor: c.action }]}>
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center' }}>
                  {crew ? `${crew}조 촬영 시작` : count.done > 0 ? '이어 찍기' : '촬영 시작'}
                </Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => leaveTo(guideHref(crew))} style={[s.pill, { flex: 1, minHeight: 52, paddingHorizontal: 8, backgroundColor: c.chip }]}>
                <Text style={{ color: c.ink, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>
                  {crew ? `${crew}조 촬영지원` : '촬영지원'}
                </Text>
              </Pressable>
            </View>
          ))}
        </View>
        {session && (
          <View accessibilityLabel="당일 촬영 일정" style={{ borderRadius: 14, padding: 14, gap: 8, backgroundColor: c.card }}>
            {session.agenda.map(({ start, end, title }) => (
              <Text key={start} style={{ color: c.ink, fontSize: 14, lineHeight: 20 }}>
                {clockText(startMinute + start)}–{clockText(startMinute + end)}  {title}
              </Text>
            ))}
          </View>
        )}

        <View style={{ borderRadius: 14, padding: 14, gap: 12, backgroundColor: c.card, boxShadow: c.float }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <Text style={{ color: c.muted, fontSize: 15 }}>
              <Text style={{ color: c.ink, fontSize: 24, fontWeight: '700' }}>{count.done}</Text> / {count.total} 찍음
              {count.redo > 0 ? <Text style={{ color: c.warn }}>  다시 {count.redo}</Text> : null}
              {count.later > 0 ? <Text>  미룸 {count.later}</Text> : null}
            </Text>
            <Text style={[s.meta, { color: c.muted }]}>{Math.round(count.total ? (count.done / count.total) * 100 : 0)}%</Text>
          </View>
          <StackBar done={count.done} redo={count.redo} later={count.later} total={count.total} height={10} c={c} />
          {current ? (
            <View style={{ gap: 8 }}>
              <NowCard tag="지금" it={current} fromWeek={carriedWeek.get(current.exerciseId)} plannedAt={plannedTime(current)} onPress={() => openDetail(current.exerciseId)} strong c={c} />
              {next ? <NowCard tag="다음" it={next} fromWeek={carriedWeek.get(next.exerciseId)} plannedAt={plannedTime(next)} onPress={() => openDetail(next.exerciseId)} c={c} /> : null}
            </View>
          ) : (
            <Text style={{ color: c.link, fontSize: 15, fontWeight: '600' }}>
              이 주 계획을 다 찍었어요{count.later ? ` · 미룬 것 ${count.later}개가 남아 있어요` : ''}.
            </Text>
          )}
        </View>

        <View style={{ borderRadius: 14, padding: 14, gap: 8, backgroundColor: c.card, boxShadow: c.float }}>
          <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>챙길 기구</Text>
          <View style={s.chips}>
            {equipment.map((e) => (
              <Text key={e} style={{ color: c.ink, fontSize: 13, fontWeight: '400', borderRadius: 12, overflow: 'hidden', paddingHorizontal: 10, paddingVertical: 4, backgroundColor: c.chip }}>
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
            <Chip key={f} label={f === 'all' ? '전체' : f === 'open' ? '남음' : '찍음'} on={filter === f} onPress={() => { setReferenceId(null); setFilter(f); }} c={c} />
          ))}
        </View>

        {week.stations.map((st) => {
          const list = st.items.filter(show);
          if (list.length === 0) return null;
          const sc = countOf(st.items, map);
          return (
            <View key={st.warmup ? 'warmup' : st.station} style={[s.group, { backgroundColor: c.card, boxShadow: c.float }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: c.line }}>
                <Text style={{ flex: 1, color: c.ink, fontSize: 15, fontWeight: '600' }} numberOfLines={2}>
                  {st.crew ? <Text style={{ color: c.link }}>{st.crew} </Text> : null}
                  {st.space ? <Text style={{ color: c.muted, fontWeight: '400' }}>{st.space} · </Text> : null}
                  {st.warmup ? '몸풀기 · 가벼운 모빌리티 · 스트레칭' : st.station}
                </Text>
                <Text style={[s.meta, { color: c.muted, fontVariant: ['tabular-nums'] }]}>
                  {hasFixedShootTime(week, st.start) ? `${clockText(startMinute + st.start)}–${clockText(startMinute + st.end)}` : '기존 웨이트 목록'}  <Text style={{ color: c.ink, fontWeight: '600' }}>{sc.done}</Text>/{sc.total}
                </Text>
              </View>
              {list.map((it) => (
                <ItemRow
                  key={it.exerciseId}
                  it={it}
                  state={stateOf(it, map)}
                  check={map.get(it.exerciseId)}
                  uploaded={!!infos[it.exerciseId]?.uploaded}
                  mark={mark(it)}
                  onToggle={() => toggle(it)}
                  onOpen={() => openDetail(it.exerciseId)}
                  reference={shootReferenceOf(infos[it.exerciseId])}
                  referenceOpen={referenceId === it.exerciseId && !openId}
                  onReference={() => setReferenceId((id) => id === it.exerciseId ? null : it.exerciseId)}
                  c={c}
                />
              ))}
            </View>
          );
        })}

        {carried.length > 0 ? (
          <View style={[s.group, { backgroundColor: c.card, borderWidth: 1, borderStyle: 'dashed', borderColor: c.line }]}>
            <View style={{ paddingHorizontal: 14, paddingVertical: 10, gap: 2, borderBottomWidth: 0.5, borderBottomColor: c.line }}>
              <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>
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
                <ItemRow
                  key={it.exerciseId}
                  it={it}
                  state={stateOf(it, map)}
                  check={map.get(it.exerciseId)}
                  uploaded={!!infos[it.exerciseId]?.uploaded}
                  mark={mark(it)}
                  carried
                  onToggle={() => toggle(it)}
                  onOpen={() => openDetail(it.exerciseId)}
                  reference={shootReferenceOf(infos[it.exerciseId])}
                  referenceOpen={referenceId === it.exerciseId && !openId}
                  onReference={() => setReferenceId((id) => id === it.exerciseId ? null : it.exerciseId)}
                  c={c}
                />
              ))}
          </View>
        ) : null}
      </ScrollView>

      <Modal visible={!!openItem} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!inflight.current) setOpenId(null); }}>
        {openItem ? (
          <DetailSheet
            key={openItem.exerciseId}
            it={openItem}
            info={infos[openItem.exerciseId]}
            check={map.get(openItem.exerciseId)}
            state={stateOf(openItem, map)}
            plannedAt={plannedTime(openItem)}
            onSet={(status, note) => set(openItem, status, note, `${openItem.no} ${status ? STATE_LABEL[status] : '대기로 되돌림'}`)}
            onRun={() => {
              setOpenId(null);
              leaveTo(runHref(crewOf.get(openItem.exerciseId), openItem.no));
            }}
            onGuide={() => {
              setOpenId(null);
              leaveTo(guideHref(crewOf.get(openItem.exerciseId), openItem.no));
            }}
            onClose={() => setOpenId(null)}
            c={c}
          />
        ) : null}
      </Modal>
      {toast ? (
        <View key={toast.seq} accessibilityRole="alert" style={{ position: 'absolute', left: 16, right: 16, bottom: inset.bottom + 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, paddingLeft: 16, paddingVertical: 4, backgroundColor: c.ink }}>
          <Text style={{ flex: 1, color: c.page, fontSize: 15 }} numberOfLines={1}>
            {toast.text}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setToast(null);
              void set(toast.it, toast.status, toast.note);
            }}
            style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }}
          >
            <Text style={{ color: c.link, fontSize: 15, fontWeight: '600' }}>되돌리기</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="알림 닫기" onPress={() => setToast(null)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Icon name="x" size={14} color={c.page} />
          </Pressable>
        </View>
      ) : null}
    </>
  );
}

function NowCard({ tag, it, fromWeek, plannedAt, onPress, strong = false, c }: { tag: string; it: PlanItem; fromWeek?: number; plannedAt?: number; onPress: () => void; strong?: boolean; c: Palette }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [{ borderRadius: 12, padding: 12, gap: 3, backgroundColor: pressed ? c.line : strong ? c.chip : c.page }]}>
      <Text style={[s.meta, { color: strong ? c.link : c.muted, fontWeight: '600' }]}>
        {tag} · {it.no}
        {fromWeek ? ` · ${fromWeek}주차에서` : ''}{plannedAt !== undefined ? ` · 계획 ${clockText(plannedAt)}` : ''}
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
  reference,
  referenceOpen,
  onReference,
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
  reference: ShootReference | null;
  referenceOpen: boolean;
  onReference: () => void;
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
              {it.load >= 2 ? <Text style={{ color: c.warn, fontSize: 11, fontWeight: '600' }}>  높음</Text> : null}
              {uploaded ? <Text style={{ color: c.link, fontSize: 11, fontWeight: '600' }}>  올림</Text> : null}
            </Text>
            <Text style={[s.meta, { color: c.muted }]} numberOfLines={1}>
              {carried ? `${it.station} · ` : ''}
              {it.cue}
              {check?.note ? <Text style={{ color: c.warn }}> · {check.note}</Text> : null}
            </Text>
          </View>
          {mark ? (
            <View style={{ borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: mark === '지금' ? c.sky : c.page }}>
              <Text style={{ color: mark === '지금' ? '#fff' : c.link, fontSize: 13, fontWeight: '600' }}>{mark}</Text>
            </View>
          ) : state === 'redo' || state === 'later' ? (
            <StatePill state={state} c={c} />
          ) : null}
        </Pressable>
        {reference && (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: referenceOpen }}
            accessibilityLabel={`${it.no} ${it.title} 참고 영상 ${referenceOpen ? '접기' : '재생'}`}
            onPress={onReference}
            style={{ width: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name={referenceOpen ? 'x' : 'play'} size={19} color={c.link} />
          </Pressable>
        )}
      </View>
      {reference && referenceOpen && (
        <View style={{ paddingHorizontal: 12, paddingBottom: 12 }}>
          <ShootReferencePlayer key={it.exerciseId} reference={reference} title={it.title} c={c} />
        </View>
      )}
      {it.breakAfter && !carried ? (
        <Text style={{ color: c.link, fontSize: 13, fontWeight: '600', paddingHorizontal: 16, paddingVertical: 8, borderTopWidth: 0.5, borderTopColor: c.line }}>
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
  state,
  plannedAt,
  onSet,
  onRun,
  onGuide,
  onClose,
  c,
}: {
  it: PlanItem;
  info: ShootExerciseInfo | undefined;
  check: ShootCheckView | undefined;
  state: ItemState;
  plannedAt?: number;
  onSet: (status: ShootStatus | null, note?: string | null) => Promise<boolean>;
  onRun: () => void;
  onGuide: () => void;
  onClose: () => void;
  c: Palette;
}) {
  const inset = useSafeAreaInsets();
  const [note, setNote] = useState(check?.note ?? '');
  const [saved, setSaved] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const saving = useRef(false);

  async function save(status: ShootStatus, value: string) {
    if (saving.current) return false;
    saving.current = true;
    setPending(true);
    setFailed(false);
    try {
      const ok = await onSet(status, value);
      setFailed(!ok);
      if (ok) setSaved(true);
      return ok;
    } finally {
      saving.current = false;
      setPending(false);
    }
  }
  const [how, setHow] = useState(true);
  const reference = shootReferenceOf(info);
  const [referenceOpen, setReferenceOpen] = useState(reference?.kind === 'youtube');
  const description = splitInstagramReference(info?.description ?? '').text;
  const equipment = info?.equipment.length ? info.equipment : it.equipment;
  const facts: [string, string][] = [
    ['시범', it.cue],
    ['자리', it.station],
    ['기구', equipment.join(' · ') || '맨몸'],
    ...(it.group ? [[it.kind === 'warmup' ? '루틴' : '단계', it.group] as [string, string]] : []),
    ...(info?.prescription ? [['앱 처방', info.prescription] as [string, string]] : []),
  ];
  if (reason !== null) {
    return (
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
        <ScrollView contentContainerStyle={[{ padding: 16, gap: 12, paddingBottom: inset.bottom + 24 }, READABLE]} keyboardShouldPersistTaps="handled">
          <Text accessibilityRole="header" style={{ color: c.ink, fontSize: 22, fontWeight: '700' }}>미루기</Text>
          <Text style={{ color: c.muted, fontSize: 15 }}>{it.no} {it.title}</Text>
          <Text style={[s.label, { color: c.ink }]}>미룸 사유</Text>
          <TextInput
            accessibilityLabel="미룸 사유"
            value={reason}
            onChangeText={setReason}
            editable={!pending}
            multiline
            maxLength={SHOOT_NOTE_MAX}
            placeholder="예: 장비가 없어 다음 촬영일에 찍기로 했어요"
            placeholderTextColor={c.muted}
            style={[s.input, { minHeight: 88, backgroundColor: c.card, color: c.ink }]}
          />
          {failed && <Text accessibilityRole="alert" style={{ color: c.danger }}>저장하지 못했어요. 입력한 사유는 그대로예요. 다시 시도해 주세요.</Text>}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable accessibilityRole="button" disabled={pending} onPress={() => { setReason(null); setFailed(false); }} style={[s.pill, { minHeight: 48, backgroundColor: c.chip }]}>
              <Text style={{ color: c.ink, fontSize: 16, fontWeight: '600' }}>취소</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={pending || !reason.trim()} onPress={async () => {
              const value = reason.trim();
              if (value && await save('later', value)) {
                setNote(value);
                setReason(null);
              }
            }} style={[s.pill, { flex: 1, minHeight: 48, backgroundColor: c.action, opacity: pending || !reason.trim() ? 0.5 : 1 }]}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{pending ? '저장 중…' : '사유 저장하고 미루기'}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, paddingBottom: 8 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: c.ink, fontSize: 19, fontWeight: '700' }}>
            {it.no} {it.title}
          </Text>
          <Text style={[s.meta, { color: c.muted }]}>
            {it.station} · {BUCKET_LABEL[it.bucket]}{plannedAt !== undefined ? ` · 계획 ${clockText(plannedAt)}` : ''}
          </Text>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} hitSlop={10} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={{ color: c.link, fontSize: 17 }}>닫기</Text>
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
                if (v === state || saving.current) return;
                if (v === 'later') {
                  setFailed(false);
                  setReason(note || check?.note || '');
                  return;
                }
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
        <Pressable accessibilityRole="button" onPress={onRun} style={[s.pill, { backgroundColor: c.action }]}>
          <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>{info?.uploaded ? '다시 찍기 · 촬영 모드에서' : '영상 찍기 · 촬영 모드에서'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onGuide} style={[s.pill, { minHeight: 48, backgroundColor: c.chip }]}>
          <Text style={{ color: c.ink, fontSize: 16, fontWeight: '600' }}>촬영지원에서 이 운동 보기</Text>
        </Pressable>

        <View style={{ borderRadius: 14, padding: 14, gap: 8, backgroundColor: c.card, boxShadow: c.float }}>
          {facts.map(([k, v]) => (
            <View key={k} style={{ flexDirection: 'row', gap: 12 }}>
              <Text style={{ color: c.muted, fontSize: 15, width: 56 }}>{k}</Text>
              <Text style={{ flex: 1, color: c.ink, fontSize: 15, fontWeight: k === '시범' ? '600' : '400' }}>{v}</Text>
            </View>
          ))}
        </View>
        {reference && (
          <View style={{ gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: referenceOpen }}
              onPress={() => setReferenceOpen((open) => !open)}
              style={[s.pill, { minHeight: 48, backgroundColor: c.chip }]}
            >
              <Text style={{ color: c.link, fontSize: 15, fontWeight: '600' }}>{referenceOpen ? '참고 영상 접기' : '참고 영상 재생'}</Text>
            </Pressable>
            {referenceOpen && <ShootReferencePlayer reference={reference} title={it.title} c={c} />}
          </View>
        )}
        {description ? (
          <View style={{ gap: 6 }}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: how }} onPress={() => setHow((v) => !v)} style={{ minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>진행 방법</Text>
              <Text style={{ color: c.muted, fontSize: 15 }}>{how ? '접기' : '펴기'}</Text>
            </Pressable>
            {how ? (
              <Text selectable style={{ color: c.ink, fontSize: 15, lineHeight: 23 }}>
                {description}
              </Text>
            ) : null}
          </View>
        ) : null}

        <View style={{ gap: 6 }}>
          <Text style={[s.label, { color: c.muted }]}>{state === 'later' ? '미룸 사유' : '메모'}{state === 'todo' ? ' — 저장하면 다시 찍기로 표시돼요' : ''}</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={note}
              onChangeText={(t) => {
                setNote(t);
                setSaved(false);
              }}
              maxLength={SHOOT_NOTE_MAX}
              editable={!pending}
              placeholder="초점 나감 · 무게 바꿔서 다시"
              placeholderTextColor={c.muted}
              style={[s.input, { flex: 1, backgroundColor: c.card, color: c.ink }]}
            />
            <Pressable
              accessibilityRole="button"
              disabled={pending || (state === 'later' && !note.trim())}
              onPress={() => void save(state === 'todo' ? 'redo' : state, note)}
              style={{ minHeight: 48, borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: c.chip }}
            >
              <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>{pending ? '저장 중…' : saved ? '저장됨' : '저장'}</Text>
            </Pressable>
          </View>
          {failed && <Text accessibilityRole="alert" style={{ color: c.danger }}>저장하지 못했어요. 다시 시도해 주세요.</Text>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
