import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActionSheetIOS, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { WarmupRoutineView } from '@/lib/library-load';
import { Bar, leave } from '~/community/parts';
import { useMenu } from '~/shell/menu-store';
import { EXERCISE_LIST, remember, type Exercise } from '~/library/parts';
import { buildWarmup, countsOf, type WarmupRoutineModel } from '~/library/warmup-model';
import { InfoSheet, LinkRow, PrepBanner, backToPrep, entryParams, routineIcon, st as ws, warmupEntryOf, whenOf, type WarmupEntry } from '~/library/warmup-parts';
import { usePalette, type Palette } from '~/lib/ui';
import { useScreenData } from '~/training/screen';
import { READABLE } from '~/lib/layout';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';

/**
 * 워밍업 루틴 라이브러리(앱 화면, 2026-10-31 워밍업 시안 01) — 공통 카드 한 장 → 목적별 추가 루틴 세로 카드. 루틴 운동은 여기서 펼치지 않고 상세(/library/warmup/<kind>)에서.
 * 자료는 운동 영상과 같은 곳(app-library.loadAppExerciseLibrary)의 warmupRoutines(루틴마다 담긴 차례 · 루틴 안내 · 숨김) — 셈은 ~/library/warmup-model.
 * 추가 수는 공통을 뺀 수다(warmupFolders 는 공통 + 그날 합집합이라 그 길이를 쓰면 두 번 센다). 등록 안 된 루틴은 만들지 않고, 추가가 빈 루틴은 '구성 준비 중'(누를 수 없음).
 * 읽기만 한다 — 운동 화면의 워밍업 읽기(app-workout.loadAppWarmup — 지난 판 닫기 · 열린 판에 기대는 것)는 부르지 않는다.
 * 운동 준비(오늘 운동 준비)에서 왔으면 그 화면이 셈한 오늘 루틴에 '오늘 구성'을 달고 아래에 준비로 돌아가는 줄. 다른 루틴을 봐도 그날 구성은 안 바뀐다.
 */
type Data = { exercises: Exercise[]; warmupRoutines?: WarmupRoutineView[] };

export default function WarmupLibraryScreen() {
  const c = usePalette();
  const { isAdmin } = useMenu();
  const inset = useSafeAreaInsets();
  const params = useLocalSearchParams<{ from?: string; today?: string }>();
  const [entry] = useState<WarmupEntry>(() => warmupEntryOf(params));
  const [info, setInfo] = useState(false);
  const state = useScreenData<Data>(EXERCISE_LIST, '', 'library:exercises');
  /* 루틴 원래 모습이 없는 옛 답(앱을 고치기 전의 저장본 · 옛 서버)은 확정된 자료로 쓰지 않는다 — 빈 루틴으로 단정하지 않게 */
  const routines = state.data?.warmupRoutines;
  const exercises = state.data?.exercises;
  /* 받은 운동은 기억해 둔다 — 운동 상세가 목록을 다시 받지 않고 곧바로 그린다(~/library/parts recall) */
  const model = useMemo(() => {
    if (!routines || !exercises) return null;
    remember(exercises);
    return buildWarmup(routines, exercises);
  }, [routines, exercises]);
  /* 새로 받았는데도 루틴 원래 모습이 없다(옛 서버) — 빈 루틴으로 단정하지 않고 못 받은 것으로 */
  const failed = state.failed ?? (state.data && !routines && state.fresh ? '루틴 정보를 받지 못했어요.' : null);
  const today = model && entry.today ? ([model.common, ...model.purposes].find((r) => r?.kind === entry.today) ?? null) : null;

  const openMenu = () => {
    const options = ['운동 영상', '투구 드릴', ...(isAdmin ? ['워밍업 편집(웹)'] : []), '취소'];
    ActionSheetIOS.showActionSheetWithOptions({ title: '라이브러리', options, cancelButtonIndex: options.length - 1 }, (i) => {
      if (options[i] === '운동 영상') router.replace('/library/training' as Href);
      else if (options[i] === '투구 드릴') router.replace('/library/mechanics' as Href);
      else if (options[i] === '워밍업 편집(웹)') leave('/library/warmup?web=1');
    });
  };
  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/' as Href));
  const open = (kind: string) => router.push({ pathname: '/library/warmup/[kind]', params: { kind, ...entryParams(entry) } } as Href);

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar
        back={entry.prep ? '운동 준비' : '뒤로'}
        onBack={goBack}
        c={c}
        right={
          <Press onPress={openMenu} hitSlop={6} accessibilityRole="button" accessibilityLabel="라이브러리 메뉴" style={st.iconBtn}>
            <View style={[st.menuDot, { backgroundColor: c.chip }]}>
              <Icon name="ellipsis" size={18} color={c.link} />
            </View>
          </Press>
        }
      />
      <InfoSheet open={info} onClose={() => setInfo(false)} c={c} />
      <ScrollView
        contentContainerStyle={[{ paddingHorizontal: 16, gap: 14, paddingBottom: inset.bottom + 32 }, READABLE]}
        refreshControl={model ? <RefreshControl refreshing={state.refreshing} onRefresh={() => void state.refresh()} /> : undefined}
      >
        <View style={st.head}>
          <Text accessibilityRole="header" style={[st.title, { color: c.ink, flex: 1 }]}>
            워밍업 루틴
          </Text>
          <Press onPress={() => setInfo(true)} accessibilityRole="button" accessibilityLabel="워밍업 루틴 안내" style={[st.info, { backgroundColor: c.card, boxShadow: c.float }]}>
            <Icon name="info" size={20} color={c.link} />
          </Press>
        </View>
        {entry.prep ? <PrepBanner todayName={today?.name ?? null} c={c} /> : null}
        {model && state.failed ? (
          <View accessibilityLiveRegion="polite" style={[st.notice, { backgroundColor: c.card, boxShadow: c.float }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[ws.bold, { color: c.ink }]}>새 루틴을 불러오지 못했어요</Text>
              <Text style={[ws.small, { color: c.muted }]}>이전에 불러온 루틴이에요.</Text>
            </View>
            <Press onPress={() => void state.load()} accessibilityRole="button" style={st.textBtn}>
              <Text style={[ws.bold, { color: c.link }]}>다시 시도</Text>
            </Press>
          </View>
        ) : null}

        {!model ? (
          failed ? (
            <View style={st.empty}>
              <Text style={[st.emptyTitle, { color: c.ink }]}>루틴을 불러오지 못했어요</Text>
              <Text style={[ws.small, { color: c.muted, textAlign: 'center' }]}>{failed === '불러오지 못했어요.' ? '연결을 확인한 뒤 다시 시도해 주세요.' : failed}</Text>
              <Press onPress={() => void state.load()} accessibilityRole="button" style={[st.action, { backgroundColor: c.action }]}>
                <Text style={[ws.bold, { color: '#fff' }]}>다시 불러오기</Text>
              </Press>
            </View>
          ) : (
            <Skeleton c={c} />
          )
        ) : !model.common && model.purposes.length === 0 ? (
          <View style={st.empty}>
            <Text style={[st.emptyTitle, { color: c.ink }]}>등록된 워밍업 루틴이 없어요</Text>
            <Text style={[ws.small, { color: c.muted, textAlign: 'center' }]}>운동 영상 라이브러리에서 운동을 볼 수 있어요.</Text>
            <Press onPress={() => router.replace('/library/training' as Href)} accessibilityRole="button" style={[st.action, { backgroundColor: c.chip }]}>
              <Text style={[ws.bold, { color: c.ink }]}>운동 영상 보기</Text>
            </Press>
          </View>
        ) : (
          <>
            {model.common ? (
              <View style={{ gap: 8 }}>
                <Text style={[ws.small, st.label, { color: c.muted }]}>먼저</Text>
                <CommonCard r={model.common} today={entry.today === model.common.kind} onOpen={() => open(model.common!.kind)} c={c} />
              </View>
            ) : null}
            <View style={{ gap: 8 }}>
              <View style={[st.head, { marginTop: 6 }]}>
                <Text accessibilityRole="header" style={[st.section, { color: c.ink, flex: 1 }]}>
                  운동에 맞게
                </Text>
                {model.purposes.length > 0 ? <Text style={[ws.small, { color: c.muted }]}>{model.purposes.length}개 루틴</Text> : null}
              </View>
              {model.purposes.length > 0 ? (
                <>
                  {model.common ? <Text style={[ws.small, { color: c.muted }]}>공통 다음에 한 가지를 이어서 해요</Text> : null}
                  {model.purposes.map((r) => (
                    <PurposeCard key={r.kind} r={r} today={entry.today === r.kind} onOpen={() => open(r.kind)} c={c} />
                  ))}
                </>
              ) : (
                <Text style={[ws.small, { color: c.muted }]}>등록된 목적별 루틴이 없어요.</Text>
              )}
            </View>
          </>
        )}
        {entry.prep ? <LinkRow label="운동 준비로 돌아가기" onPress={backToPrep} c={c} /> : null}
      </ScrollView>
    </View>
  );
}

/** 공통 카드 — 파란 면 · 그림 판. 운동이 비었으면 '구성 준비 중'(누를 수 없음) */
function CommonCard({ r, today, onOpen, c }: { r: WarmupRoutineModel<Exercise>; today: boolean; onOpen: () => void; c: Palette }) {
  const n = countsOf(r.rows);
  const ready = n.total > 0;
  const body = (
    <>
      <View style={st.row}>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={[st.row, { gap: 8, flexWrap: 'wrap' }]}>
            <Text style={[st.cardTitle, { color: c.ink }]}>{r.name}</Text>
            {today ? <TodayBadge c={c} /> : null}
          </View>
          {r.description ? <Text style={[ws.small, { color: c.muted }]}>{r.description}</Text> : null}
          <Text style={[ws.bold, { color: ready ? c.ink : c.muted }]}>
            {ready ? `${n.total}개 운동${n.unsure > 0 ? ` · ${n.unsure}개 확인 필요` : ''}` : '구성 준비 중'}
          </Text>
        </View>
        <View style={[st.tile, { backgroundColor: c.card, boxShadow: c.float }]}>
          <Icon name={routineIcon(r.kind)} size={28} color={c.link} />
        </View>
      </View>
      {ready ? (
        <View style={[st.cardFoot, { borderTopColor: c.sky + '40' }]}>
          <Text style={[ws.bold, { color: c.link, flex: 1 }]}>구성 보기</Text>
          <Icon name="chevron-right" size={16} color={c.link} />
        </View>
      ) : null}
    </>
  );
  const style = [st.common, { backgroundColor: c.skyTint }, today && { borderWidth: 1.5, borderColor: c.sky }];
  return ready ? (
    <Press onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${r.name}, ${n.total}개 운동${today ? ', 오늘 구성' : ''}, 구성 보기`} style={style}>
      {body}
    </Press>
  ) : (
    <View accessibilityLabel={`${r.name}, 구성 준비 중`} style={style}>
      {body}
    </View>
  );
}

/** 목적별 카드 — 이름 · 하는 날 · 추가 수(공통 뺀). 추가가 비었으면 '구성 준비 중'이고 화살표 · 누름이 없다 */
function PurposeCard({ r, today, onOpen, c }: { r: WarmupRoutineModel<Exercise>; today: boolean; onOpen: () => void; c: Palette }) {
  const n = countsOf(r.rows);
  const ready = n.total > 0;
  const when = whenOf(r.kind);
  const body = (
    <>
      <View style={[st.smallTile, { backgroundColor: c.chip }]}>
        <Icon name={routineIcon(r.kind)} size={22} color={ready ? c.link : c.muted} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={[st.row, { gap: 8, flexWrap: 'wrap' }]}>
          <Text style={[st.cardName, { color: c.ink }]}>{r.name}</Text>
          {today ? <TodayBadge c={c} /> : null}
        </View>
        {when ? <Text style={[ws.small, { color: c.muted }]}>{when}</Text> : null}
        <Text style={[ws.bold, { color: ready ? c.link : c.muted, fontSize: 14 }]}>
          {ready ? `추가 ${n.total}개 운동${n.unsure > 0 ? ` · ${n.unsure}개 확인 필요` : ''}` : '구성 준비 중'}
        </Text>
      </View>
      {ready ? <Icon name="chevron-right" size={18} color={c.link} /> : null}
    </>
  );
  const style = [st.purpose, { backgroundColor: c.card, boxShadow: c.float }, today && { borderWidth: 1.5, borderColor: c.sky }];
  return ready ? (
    <Press onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${r.name}, 추가 ${n.total}개 운동${today ? ', 오늘 구성' : ''}, 상세 보기`} style={style}>
      {body}
    </Press>
  ) : (
    <View accessibilityLabel={`${r.name}, 구성 준비 중`} style={[style, { opacity: 0.85 }]}>
      {body}
    </View>
  );
}

function TodayBadge({ c }: { c: Palette }) {
  return <Text style={[st.badge, { color: c.link, backgroundColor: c.card, borderColor: c.sky + '66' }]}>오늘 구성</Text>;
}

/** 처음 받는 동안 — 카드 모양(수는 아직 모른다) */
function Skeleton({ c }: { c: Palette }) {
  return (
    <View accessibilityLabel="워밍업 루틴 불러오는 중" style={{ gap: 12 }}>
      <View style={[st.common, { backgroundColor: c.chip, height: 150 }]} />
      {[0, 1, 2].map((i) => (
        <View key={i} style={[st.purpose, { backgroundColor: c.card }]}>
          <View style={[st.smallTile, { backgroundColor: c.chip }]} />
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ height: 14, width: '50%', borderRadius: 7, backgroundColor: c.chip }} />
            <View style={{ height: 12, width: '35%', borderRadius: 6, backgroundColor: c.chip }} />
          </View>
        </View>
      ))}
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center' },
  title: { fontSize: 32, fontWeight: '700', lineHeight: 40 },
  section: { fontSize: 20, fontWeight: '700' },
  label: { fontWeight: '600', paddingLeft: 2 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  menuDot: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  info: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingLeft: 14, paddingVertical: 6 },
  textBtn: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  common: { borderRadius: 24, padding: 20, gap: 14 },
  cardTitle: { fontSize: 22, fontWeight: '700', lineHeight: 28 },
  tile: { width: 64, height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  cardFoot: { flexDirection: 'row', alignItems: 'center', minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 4 },
  purpose: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 88, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 14 },
  smallTile: { width: 50, height: 50, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  cardName: { fontSize: 17, fontWeight: '700', lineHeight: 23 },
  badge: { fontSize: 12, fontWeight: '700', borderRadius: 8, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden' },
  empty: { alignItems: 'center', gap: 12, paddingTop: 40, paddingHorizontal: 16 },
  emptyTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  action: { minHeight: 44, borderRadius: 22, paddingHorizontal: 18, justifyContent: 'center' },
});
