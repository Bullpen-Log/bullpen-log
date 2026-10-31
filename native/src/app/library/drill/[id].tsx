import { router, useLocalSearchParams, type Href } from 'expo-router';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FOCUS_POINTS } from '@/lib/exercise-meta';
import { usePalette, type Palette } from '~/lib/ui';
import { Bar } from '~/community/parts';
import { DrillDetail } from '~/library/drill-detail';
import { entryOf, type DrillEntry } from '~/library/drill-browse';
import { DRILL_LIST, recall, type Drill } from '~/library/parts';
import { useFav } from '~/training/favorites';
import { s, useScreenData } from '~/training/screen';
import { READABLE } from '~/lib/layout';
import { Press } from '~/shell/press';
import { Icon } from '~/shell/icon';

/**
 * 드릴 상세(앱 화면, 2026-10-31 드릴 시안 02) — 투구 드릴 목록의 카드 · 메커니즘 실행의 [드릴 상세] · 3D 분석에서 찾은 목록이 연다.
 * 위에 쌓이는 화면이라 뒤로 가면 목록(조건 · 보던 자리)이나 메커니즘 실행(같은 드릴 · 입력 중인 기록)이 그대로 있다 — 읽기만 하고 별만 저장한다.
 * 주소: /library/drill/<id>[?from=mechanics&pos=2/3&phase=input | ?from=analysis&result=<결과>&el=<요소>]. 값은 entryOf 가 정해 둔 모양만 받는다.
 * 목록에서 받은 줄을 그대로 그리고(같은 내용을 다시 받지 않는다), 바로 열린 주소면 목록을 받아 찾는다.
 */
export default function DrillDetailScreen() {
  const c = usePalette();
  const params = useLocalSearchParams<{ id: string; from?: string; result?: string; el?: string; pos?: string; phase?: string }>();
  const id = params.id ?? '';
  const entry = entryOf(params, FOCUS_POINTS);
  const kept = id ? recall<Drill>(id) : null;
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      {kept ? <Body item={kept} entry={entry} failed={null} retry={null} c={c} /> : <FromList id={id} entry={entry} c={c} />}
    </View>
  );
}

/* 뒤로 — 쌓인 화면이 없으면(바로 열린 주소 · 앱을 막 켬) 들어온 곳으로. 새 메커니즘 실행을 열지 않게 훈련은 메커니즘 첫 화면으로 */
function fallbackOf(entry: DrillEntry): Href {
  if (entry.from === 'mechanics') return '/training-mechanics' as Href;
  if (entry.from === 'analysis' && entry.result) return `/lab/${entry.result}` as Href;
  return '/library/mechanics' as Href;
}
const back = (entry: DrillEntry) => () => (router.canGoBack() ? router.back() : router.replace(fallbackOf(entry)));

/** 목록에 없던 드릴(앱을 막 켜 상세 주소로 바로 옴 · 메커니즘에서 옴) — 목록을 받아 찾는다(세션을 열거나 만들지 않는다) */
function FromList({ id, entry, c }: { id: string; entry: DrillEntry; c: Palette }) {
  const state = useScreenData<{ drills: Drill[] }>(DRILL_LIST, '', 'library:drills');
  const item = state.data?.drills.find((g) => g.id === id);
  if (item) return <Body item={item} entry={entry} failed={state.failed} retry={() => void state.load()} c={c} />;
  /* 정상으로 받았는데 없다 — 숨겨졌거나 지워졌다(받아 둔 옛 값으로 계속 보이지 않는다). 못 받은 것과 따로 */
  const missing = state.data != null && !state.failed;
  return (
    <>
      <Bar back={entry.from === 'mechanics' ? '하던 훈련' : '투구 드릴'} onBack={back(entry)} c={c} />
      {missing || state.failed ? (
        <View style={{ padding: 32, gap: 12, alignItems: 'center' }}>
          <Text style={[s.bodyBold, s.center, { color: c.ink }]}>{missing ? '없는 드릴이에요' : '드릴을 불러오지 못했어요'}</Text>
          <Text style={[s.small, s.center, { color: c.muted }]}>
            {missing
              ? entry.from === 'mechanics'
                ? '드릴 목록에 없는 드릴이에요. 하던 훈련 화면에서 영상과 설명을 볼 수 있어요.'
                : '숨겨졌거나 지워졌을 수 있어요.'
              : state.failed === '불러오지 못했어요.'
                ? '연결을 확인한 뒤 다시 시도해 주세요.'
                : state.failed}
          </Text>
          <Press accessibilityRole="button" onPress={missing ? back(entry) : () => void state.load()} style={s.textBtn}>
            <Text style={[s.smallBold, { color: c.link }]}>{missing ? (entry.from === 'mechanics' ? '하던 훈련으로' : '투구 드릴 목록으로') : '다시 불러오기'}</Text>
          </Press>
        </View>
      ) : (
        <ActivityIndicator accessibilityLabel="드릴을 불러오는 중" style={{ marginTop: 40 }} />
      )}
    </>
  );
}

function Body({ item, entry, failed, retry, c }: { item: Drill; entry: DrillEntry; failed: string | null; retry: (() => void) | null; c: Palette }) {
  const inset = useSafeAreaInsets();
  const star = useFav('drill', item.id, item.favorite);
  /* 원래 화면으로 — 훈련은 같은 실행(쌓인 화면 그대로), 분석은 같은 결과(사이의 목록까지 걷고, 없으면 그 결과를 연다). 주소는 정해 둔 모양만 */
  const onReturn =
    entry.from === 'mechanics'
      ? back(entry)
      : entry.from === 'analysis'
        ? () => (entry.result ? router.dismissTo(`/lab/${entry.result}` as Href) : back(entry)())
        : null;
  return (
    <>
      <Bar
        back={entry.from === 'mechanics' ? '하던 훈련' : '투구 드릴'}
        onBack={back(entry)}
        c={c}
        right={
          <Press
            onPress={star.toggle}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={star.on ? `${item.title} 즐겨찾기 해제` : `${item.title} 즐겨찾기 추가`}
            accessibilityState={{ selected: star.on, busy: star.busy }}
            style={s.iconBtn}
          >
            <Icon name="star" size={22} color={star.on ? '#ff9500' : c.link} fill={star.on ? '#ff9500' : 'none'} />
          </Press>
        }
      />
      <ScrollView contentContainerStyle={[{ padding: 16, paddingBottom: inset.bottom + 40, gap: 12 }, READABLE]}>
        {/* 별 저장 실패 — 확인된 실패는 원래 값으로 되돌렸고, 답을 못 받은 것은 따로 알린다. [다시 시도]는 같은 바람(켜라 / 꺼라) */}
        {star.error ? (
          <View accessibilityLiveRegion="polite" style={[s.box, { backgroundColor: c.card, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
            <Text style={[s.small, { color: c.danger, flex: 1 }]}>{star.lost ? star.error : `즐겨찾기를 저장하지 못했어요. ${star.error}`}</Text>
            {star.canRetry ? (
              <Press onPress={star.retry} accessibilityRole="button" style={s.textBtn}>
                <Text style={[s.smallBold, { color: c.link }]}>다시 시도</Text>
              </Press>
            ) : null}
          </View>
        ) : null}
        {/* 받아 둔 내용은 두고 새로 받지 못한 것만 알린다 */}
        {failed && retry ? (
          <View accessibilityLiveRegion="polite" style={[s.box, { backgroundColor: c.card, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
            <Text style={[s.small, { color: c.muted, flex: 1 }]}>새 정보를 불러오지 못했어요. 이전에 받은 내용이에요.</Text>
            <Press onPress={retry} accessibilityRole="button" style={s.textBtn}>
              <Text style={[s.smallBold, { color: c.link }]}>다시 시도</Text>
            </Press>
          </View>
        ) : null}
        <DrillDetail item={item} entry={entry} onReturn={onReturn} c={c} />
      </ScrollView>
    </>
  );
}
