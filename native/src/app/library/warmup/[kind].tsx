import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { WarmupRoutineView } from '@/lib/library-load';
import { Bar } from '~/community/parts';
import { EXERCISE_LIST, remember, type Exercise } from '~/library/parts';
import { buildWarmup, commonRowsFor, countsOf, validKind, type WarmupRoutineModel } from '~/library/warmup-model';
import { InfoSheet, LinkRow, PrepBanner, WarmupRowItem, backToPrep, entryParams, routineIcon, st as ws, warmupEntryOf, whenOf, type WarmupEntry } from '~/library/warmup-parts';
import { usePalette, type Palette } from '~/lib/ui';
import { useScreenData } from '~/training/screen';
import { READABLE } from '~/lib/layout';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';

/**
 * 워밍업 루틴 상세(앱 화면, 2026-10-31 워밍업 시안 02) — 이름 · 하는 날 · 설명 → 공통 · 추가 수 → 공통 구간(목적별에서는 접어 둠) → 이 루틴의 추가 운동.
 * 공통 루틴이면 공통 운동만. 운동을 누르면 기존 운동 상세가 위에 쌓여 돌아오면 같은 펼침 · 같은 자리다(이 화면은 그대로 남아 있다).
 * 다른 루틴을 열면(주소의 kind 가 바뀜) 그 루틴 기준으로 새로 — 펼침은 kind 마다 따로.
 * 읽기만 한다 — 운동 화면의 워밍업 읽기 · 체크 · 시작 · 정리를 부르지 않는다. 설명이 비면 칸을 생략하고, 추가가 비면 '구성 준비 중'.
 */
type Data = { exercises: Exercise[]; warmupRoutines?: WarmupRoutineView[] };

export default function WarmupRoutineScreen() {
  const c = usePalette();
  const params = useLocalSearchParams<{ kind: string; from?: string; today?: string }>();
  const kind = validKind(params.kind);
  const entry = warmupEntryOf(params);
  const [info, setInfo] = useState(false);
  const state = useScreenData<Data>(EXERCISE_LIST, '', 'library:exercises');
  const routines = state.data?.warmupRoutines;
  const exercises = state.data?.exercises;
  /* 받은 운동은 기억해 둔다 — 운동 상세가 목록을 다시 받지 않고 곧바로 그린다(~/library/parts recall) */
  const model = useMemo(() => {
    if (!routines || !exercises) return null;
    remember(exercises);
    return buildWarmup(routines, exercises);
  }, [routines, exercises]);
  const routine = model && kind ? ([model.common, ...model.purposes].find((r) => r?.kind === kind) ?? null) : null;
  /* 새로 받았는데도 루틴 원래 모습이 없다(옛 서버) — 빈 루틴으로 단정하지 않고 못 받은 것으로 */
  const failed = state.failed ?? (state.data && !routines && state.fresh ? '루틴 정보를 받지 못했어요.' : null);
  const today = model && entry.today ? ([model.common, ...model.purposes].find((r) => r?.kind === entry.today) ?? null) : null;
  /* 뒤가 없으면(바로 열린 주소) 루틴 목록으로 — 들어온 곳(운동 준비)은 그대로 실어 */
  const goBack = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/library/warmup', params: entryParams(entry) } as Href));

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar
        back="워밍업 루틴"
        onBack={goBack}
        c={c}
        right={
          <Press onPress={() => setInfo(true)} hitSlop={6} accessibilityRole="button" accessibilityLabel="워밍업 루틴 안내" style={st.iconBtn}>
            <Icon name="info" size={22} color={c.link} />
          </Press>
        }
      />
      <InfoSheet open={info} onClose={() => setInfo(false)} c={c} />
      {routine && model ? (
        /* kind 마다 새 자리 — 다른 루틴으로 바뀌면 펼침 · 자리가 그 루틴 기준으로 */
        <Body
          key={routine.kind}
          routine={routine}
          common={model.common}
          entry={entry}
          todayName={today?.name ?? null}
          stale={state.failed}
          refreshing={state.refreshing}
          reload={() => void state.load()}
          c={c}
        />
      ) : (
        <View style={{ padding: 16, gap: 14 }}>
          <Text accessibilityRole="header" style={[st.title, { color: c.ink }]}>
            {model ? '없는 루틴이에요' : '루틴 상세'}
          </Text>
          {model ? (
            <>
              <Text style={[ws.body, { color: c.muted }]}>숨겨졌거나 지워졌을 수 있어요.</Text>
              <LinkRow label="워밍업 루틴 목록으로" onPress={goBack} c={c} />
            </>
          ) : failed ? (
            <View style={{ gap: 12, alignItems: 'flex-start' }}>
              <Text style={[ws.body, { color: c.ink }]}>루틴을 불러오지 못했어요.</Text>
              <Text style={[ws.small, { color: c.muted }]}>{failed === '불러오지 못했어요.' ? '연결을 확인한 뒤 다시 시도해 주세요.' : failed}</Text>
              <Press onPress={() => void state.load()} accessibilityRole="button" style={[st.action, { backgroundColor: c.action }]}>
                <Text style={[ws.bold, { color: '#fff' }]}>다시 불러오기</Text>
              </Press>
            </View>
          ) : (
            <View accessibilityLabel="루틴 불러오는 중" style={{ gap: 10 }}>
              <ActivityIndicator />
              {[0, 1, 2].map((i) => (
                <View key={i} style={[ws.row, { backgroundColor: c.card }]} />
              ))}
            </View>
          )}
          {entry.prep ? <LinkRow label="운동 준비로 돌아가기" onPress={backToPrep} c={c} /> : null}
        </View>
      )}
    </View>
  );
}

function Body({
  routine,
  common,
  entry,
  todayName,
  stale,
  refreshing,
  reload,
  c,
}: {
  routine: WarmupRoutineModel<Exercise>;
  common: WarmupRoutineModel<Exercise> | null;
  entry: WarmupEntry;
  todayName: string | null;
  stale: string | null;
  refreshing: boolean;
  reload: () => void;
  c: Palette;
}) {
  const inset = useSafeAreaInsets();
  /* 목적별은 공통을 접고 시작 — 고른 루틴의 차이(추가 운동)가 먼저 보이게 */
  const [commonOpen, setCommonOpen] = useState(false);
  const isCommon = routine.common;
  const commonRows = isCommon ? routine.rows : commonRowsFor(common, routine);
  const cn = countsOf(commonRows);
  const xn = countsOf(isCommon ? [] : routine.rows);
  const when = whenOf(routine.kind);
  const unsure = cn.unsure + xn.unsure;
  const rowProps = { onRetry: reload, retrying: refreshing, c };
  return (
    <ScrollView contentContainerStyle={[{ paddingHorizontal: 16, paddingBottom: inset.bottom + 40, gap: 14 }, READABLE]}>
      <View style={st.head}>
        <View style={{ flex: 1, gap: 4 }}>
          <Text selectable accessibilityRole="header" style={[st.title, { color: c.ink }]}>
            {routine.name}
          </Text>
          {when ? <Text style={[ws.bold, { color: c.link, fontSize: 14 }]}>{when}</Text> : null}
        </View>
        <View style={[st.tile, { backgroundColor: c.card, boxShadow: c.float }]}>
          <Icon name={routineIcon(routine.kind)} size={26} color={c.link} />
        </View>
      </View>
      {routine.description ? <Text style={[ws.body, { color: c.muted }]}>{routine.description}</Text> : null}
      {entry.prep ? <PrepBanner todayName={todayName} c={c} /> : null}
      {stale ? (
        <View accessibilityLiveRegion="polite" style={[st.notice, { backgroundColor: c.card, boxShadow: c.float }]}>
          <Text style={[ws.small, { color: c.muted, flex: 1 }]}>새 정보를 불러오지 못했어요. 이전에 받은 내용이에요.</Text>
          <Press onPress={reload} disabled={refreshing} accessibilityRole="button" style={st.textBtn}>
            <Text style={[ws.bold, { color: c.link }]}>다시 시도</Text>
          </Press>
        </View>
      ) : null}

      {/* 수 — 목록 카드와 같은 기준(공통 한 번씩 + 공통 뺀 추가). 볼 수 없는 운동이 있으면 등록 수와 따로 */}
      {!isCommon ? (
        <View accessibilityLabel={summaryLabel(cn.total, xn.total, unsure)} style={[st.summary, { backgroundColor: c.skyTint }]}>
          <Text style={[ws.small, { color: c.muted }]}>
            공통 <Text style={{ color: c.link, fontWeight: '700' }}>{cn.total}개</Text>
            {'  +  '}추가 <Text style={{ color: xn.total > 0 ? c.link : c.muted, fontWeight: '700' }}>{xn.total > 0 ? `${xn.total}개` : '준비 중'}</Text>
          </Text>
          {xn.total > 0 ? (
            <Text style={[ws.small, { color: unsure > 0 ? c.warn : c.link, fontWeight: '700' }]}>
              {unsure > 0 ? `등록 ${cn.total + xn.total}개 · ${unsure}개 확인 필요` : `전체 ${cn.total + xn.total}개`}
            </Text>
          ) : null}
        </View>
      ) : unsure > 0 ? (
        <Text style={[ws.small, { color: c.warn }]}>
          등록 {cn.total}개 · {unsure}개 확인 필요
        </Text>
      ) : null}

      {isCommon ? (
        cn.total > 0 ? (
          <View style={{ gap: 10 }}>
            {routine.rows.map((r) => (
              <WarmupRowItem key={r.exerciseId} row={r} routine={routine} section="common" {...rowProps} />
            ))}
          </View>
        ) : (
          <Preparing text="공통 워밍업은 구성 준비 중이에요." c={c} />
        )
      ) : (
        <>
          {common && cn.total > 0 ? (
            <View style={{ gap: 10 }}>
              <Press
                onPress={() => setCommonOpen((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: commonOpen }}
                accessibilityLabel={`${common.name} ${cn.total}개, ${commonOpen ? '접기' : '펼치기'}`}
                style={[st.toggle, { backgroundColor: c.skyTint }]}
              >
                <View style={[st.smallTile, { backgroundColor: c.card }]}>
                  <Icon name={routineIcon(common.kind)} size={18} color={c.link} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[ws.bold, { color: c.ink }]}>{common.name}</Text>
                  <Text style={[ws.small, { color: c.muted }]}>먼저{common.description ? ` · ${common.description}` : ''}</Text>
                </View>
                <Text style={[ws.bold, { color: c.link }]}>{cn.total}개</Text>
                <Icon name={commonOpen ? 'chevron-up' : 'chevron-down'} size={16} color={c.link} />
              </Press>
              {/* 접힌 운동은 그리지 않는다 — 읽기 · 포커스가 들어가지 않게 */}
              {commonOpen ? (
                <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(140)} style={{ gap: 10 }}>
                  {commonRows.map((r) => (
                    <WarmupRowItem key={r.exerciseId} row={r} routine={common} section="common" {...rowProps} />
                  ))}
                </Animated.View>
              ) : null}
            </View>
          ) : common ? (
            <Text style={[ws.small, { color: c.muted }]}>공통 워밍업은 구성 준비 중이에요.</Text>
          ) : null}
          <View style={{ gap: 2, marginTop: 6 }}>
            {common ? <Text style={[ws.small, { color: c.muted }]}>이어서</Text> : null}
            <View style={st.head}>
              <Text accessibilityRole="header" style={[st.section, { color: c.ink, flex: 1 }]}>
                추가 운동
              </Text>
              {xn.total > 0 ? <Text style={[ws.small, { color: c.muted }]}>{xn.total}개</Text> : null}
            </View>
          </View>
          {xn.total > 0 ? (
            <View style={{ gap: 10 }}>
              {routine.rows.map((r) => (
                <WarmupRowItem key={r.exerciseId} row={r} routine={routine} section="extra" {...rowProps} />
              ))}
            </View>
          ) : (
            <Preparing text={`추가 운동은 구성 준비 중이에요.${common && cn.total > 0 ? ' 공통 워밍업은 위에서 볼 수 있어요.' : ''}`} c={c} />
          )}
        </>
      )}
      {entry.prep ? <LinkRow label="운동 준비로 돌아가기" onPress={backToPrep} c={c} /> : null}
    </ScrollView>
  );
}

const summaryLabel = (common: number, extra: number, unsure: number) =>
  `공통 ${common}개, 추가 ${extra > 0 ? `${extra}개` : '준비 중'}${extra > 0 ? (unsure > 0 ? `, 등록 ${common + extra}개 중 ${unsure}개 확인 필요` : `, 전체 ${common + extra}개`) : ''}`;

function Preparing({ text, c }: { text: string; c: Palette }) {
  return (
    <View style={[ws.row, { backgroundColor: c.card, boxShadow: c.float }]}>
      <Text style={[ws.small, { color: c.muted, flex: 1 }]}>{text}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 28, fontWeight: '700', lineHeight: 35 },
  section: { fontSize: 20, fontWeight: '700' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  tile: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  smallTile: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingLeft: 14, paddingVertical: 6 },
  textBtn: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  summary: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8, borderRadius: 16, paddingHorizontal: 14, minHeight: 48, paddingVertical: 10 },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12 },
  action: { minHeight: 44, borderRadius: 22, paddingHorizontal: 18, justifyContent: 'center' },
});
