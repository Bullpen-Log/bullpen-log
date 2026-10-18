import { SymbolView } from 'expo-symbols';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { Pressable, Text, View, type ScrollViewInstance } from 'react-native';
import type { ArmcareAreaKey } from '@/lib/armcare/anatomy';
import type { AppArmcareGuideTab, AppArmcareTodayTab } from '@/lib/armcare/today-load';
import { drainChecks, onCheckResult } from '~/armcare/outbox';
import { PainGuideButton, type PainView } from '~/armcare/pain-guide-sheet';
import { MyRoutinesProvider } from '~/armcare/add-to-routine';
import { sendCheck } from '~/armcare/send';
import { act, leave } from '~/mechanics/parts';
import { usePalette, type Palette } from '~/lib/ui';
import { openCheckin } from '~/shell/web-nav';
import { AREAS_BY_JOINT, AreaCard, Checklist, GapCard, PainNote, RehabCard, RoutineCard, WeekDots, openPlay } from '~/training/armcare-parts';
import { Fold, Screen, SectionHead, WebRow, s, useJump, useScreenData } from '~/training/screen';
import { useRememberPart } from '~/training/remember';

/**
 * 암케어(앱 화면) — 웹 /training?view=armcare(&tab=guide)(app/(app)/training/training-page.tsx 의 armcare 칸 · armcare-section.tsx)를 옮겼다.
 * 자료는 웹과 같은 함수로 모은다(app/actions/app-training-parts.ts → lib/armcare/today-load.ts). 트레이닝 탭의 암케어 카드에서 들어온다.
 *
 * [루틴] 맞춤 루틴(재활 중이면 오늘 재활) · 내 루틴 · 이번 주, [부위별 보강] 빈 곳 보강 · 부위 카드. 따라 하기는 앱 화면(/armcare/<id>?d=…),
 * 루틴 만들기 · 고치기도 앱 화면(/training/routine/<id>), 체크는 웹 목록과 같은 기록. 팔 통증 안내는 앱 시트(~/armcare/pain-guide-sheet — 웹 arm-pain-guide-body 와 같은 글), 루틴에 담기는 앱 창(~/armcare/add-to-routine), 3D 근육 지도는 웹으로 보낸다(leave).
 */
const TABS = [
  { value: 'today', label: '루틴' },
  { value: 'guide', label: '부위별 보강' },
] as const;
type Tab = (typeof TABS)[number]['value'];

export default function TrainingArmcareScreen() {
  useRememberPart('armcare');
  const c = usePalette();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'guide' ? 'guide' : 'today');
  const state = useScreenData<AppArmcareTodayTab | AppArmcareGuideTab>('app-training-parts.loadAppArmcare', tab, `training-armcare:${tab}`);
  const scroll = useRef<ScrollViewInstance>(null);
  const { load } = state;

  /*
   * 따라 하기에서 신호가 없어 폰에 남은 체크를 이어 보낸다(웹 SendPendingChecks) — 하나라도 남겼으면 다시 받아 체크가 보이게.
   * 껍데기(앱을 켤 때 · 앞에 올 때)가 보낸 것도 듣는다.
   */
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = onCheckResult((_p, r) => {
      if (r && typeof r === 'object' && 'error' in r) return;
      /* 여러 개를 이어 보내면 다 보낸 뒤 한 번만 */
      clearTimeout(timer);
      timer = setTimeout(() => void load(), 400);
    });
    void drainChecks(sendCheck, () => undefined);
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [load]);

  const pick = (t: Tab) => {
    setTab(t);
    router.setParams({ tab: t });
  };

  const data = state.data && state.data.tab === tab ? state.data : null;
  return (
    <Screen title="암케어" tabs={TABS} tab={tab} onTab={pick} state={{ ...state, data }} scrollRef={scroll} settings>
      {data?.tab === 'today' ? (
        <TodayTab data={data} fresh={state.fresh} reload={load} c={c} />
      ) : data?.tab === 'guide' ? (
        <GuideTab data={data} scroll={scroll} c={c} />
      ) : null}
    </Screen>
  );
}

/* ----------------------------- 루틴 칸 ----------------------------- */

function TodayTab({ data, fresh, reload, c }: { data: AppArmcareTodayTab; fresh: boolean; reload: () => Promise<void>; c: Palette }) {
  const [open, setOpen] = useState<string | null>(null);
  const { custom } = data;
  return (
    <View style={{ gap: 20 }}>
      <View style={{ gap: 10 }}>
        {custom.kind === 'rehab' ? (
          <SectionHead title="오늘 재활" desc="아픈 곳에 맞춰 단계별로 · 맞춤 루틴 대신" c={c} />
        ) : (
          <SectionHead title="맞춤 루틴" desc="오늘 몸 상태로 짜요" c={c} />
        )}
        {custom.kind === 'rehab' ? (
          <RehabCard rehab={custom.rehab} dateKey={data.dateKey} c={c} />
        ) : custom.kind === 'checkin' ? (
          <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float }]}>
            <Text style={[s.bodyBold, { color: c.ink, fontSize: 17 }]}>오늘 체크인을 먼저 남겨 주세요</Text>
            <Text style={[s.body, { color: c.muted }]}>30초면 돼요. 몸 상태를 보고 루틴을 짜요.</Text>
            <Pressable
              onPress={() => openCheckin('/training?view=home')}
              accessibilityRole="button"
              style={[s.pill, { backgroundColor: c.sky }]}
            >
              <Text style={[s.bodyBold, { color: '#fff' }]}>체크인하기 ›</Text>
            </Pressable>
          </View>
        ) : custom.kind === 'rest' ? (
          <View style={[s.card, { backgroundColor: c.warnBg }]}>
            <Text style={[s.bodyBold, { color: c.warn }]}>오늘은 팔을 쉬는 날이에요</Text>
            <Text style={[s.body, { color: c.warn }]}>{custom.reason}</Text>
            {custom.pain ? (
              data.painView ? (
                <PainGuideButton pain={data.painView} tone="warn" c={c} />
              ) : (
                <Pressable onPress={() => leave('/training?view=armcare')} accessibilityRole="link" style={[s.chip, { backgroundColor: c.card, alignSelf: 'flex-start' }]}>
                  <Text style={[s.smallBold, { color: c.warn }]}>통증 안내 보기 ›</Text>
                </Pressable>
              )
            ) : null}
            <Pressable
              onPress={() => openCheckin('/training?view=home')}
              accessibilityRole="button"
              style={s.textBtn}
            >
              <Text style={[s.smallBold, { color: c.sky }]}>통증이 아니면 체크인 고치기</Text>
            </Pressable>
          </View>
        ) : (
          <CustomRoutine custom={custom} painView={data.painView ?? null} dateKey={data.dateKey} fresh={fresh} reload={reload} c={c} />
        )}
        {data.rehabStart ? <RehabStartRow start={data.rehabStart} c={c} /> : null}
      </View>

      <View style={{ gap: 10 }}>
        <SectionHead title="내 루틴" desc="내가 골라 둔 운동 · 언제든" c={c} />
        {data.painToday && data.routines.length > 0 ? (
          <Text style={[s.small, s.box, { color: c.warn, backgroundColor: c.warnBg }]}>오늘 통증을 남기셨어요. 쉬는 걸 권해요.</Text>
        ) : null}
        {data.routines.length === 0 ? (
          <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float, gap: 6 }]}>
            <Text style={[s.bodyBold, { color: c.ink }]}>아직 만든 루틴이 없어요</Text>
            <Text style={[s.small, { color: c.muted }]}>자주 하는 운동만 골라 이름을 붙여 두세요.</Text>
          </View>
        ) : (
          data.routines.map((r) => (
            <RoutineCard
              key={r.id}
              routine={r}
              dateKey={data.dateKey}
              fresh={fresh}
              open={open === r.id}
              onToggle={() => setOpen(open === r.id ? null : r.id)}
              onChanged={() => void reload()}
              c={c}
            />
          ))
        )}
        {data.routines.length < data.routineMax ? (
          <Pressable onPress={() => router.push('/training/routine/new' as Href)} accessibilityRole="button" style={[s.webRow, { backgroundColor: c.card, boxShadow: c.float }]}>
            <Text style={[s.body, { color: c.ink, flex: 1 }]}>새 루틴 만들기</Text>
            <SymbolView name="chevron.right" size={13} weight="semibold" tintColor={c.muted} />
          </Pressable>
        ) : (
          <Text style={[s.tiny, { color: c.muted, paddingHorizontal: 4 }]}>루틴은 {data.routineMax}개까지 둘 수 있어요.</Text>
        )}
      </View>

      <WeekDots week={data.week} c={c} />
    </View>
  );
}

/** 맞춤 루틴 — 아직 안 만들었으면 권하는 종류 · [맞춤 루틴 만들기], 만들었으면 머리 · [따라하기] · [다시 만들기] · 체크 목록(웹 ArmcareToday) */
function CustomRoutine({
  custom,
  painView,
  dateKey,
  fresh,
  reload,
  c,
}: {
  custom: Extract<AppArmcareTodayTab['custom'], { kind: 'routine' }>;
  /** 팔 통증 안내 시트에 넣을 값 — 옛 서버면 없어 웹으로 보낸다 */
  painView: PainView | null;
  dateKey: string;
  fresh: boolean;
  reload: () => Promise<void>;
  c: Palette;
}) {
  const [making, setMaking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { decision, routine } = custom;
  const make = async () => {
    if (making) return;
    setMaking(true);
    setError(null);
    const res = await act<{ ok: true }>('armcare.makeArmcareRoutine');
    if ('error' in res) setError(res.error);
    else await reload();
    setMaking(false);
  };
  const extra = (
    <>
      {custom.afterThrowing ? <Text style={[s.bodyBold, { color: c.ink }]}>{custom.afterThrowing}</Text> : null}
      {custom.pain ? (
        painView ? (
          <PainGuideButton pain={painView} tone="sky" c={c} />
        ) : (
          <Pressable onPress={() => leave('/training?view=armcare')} accessibilityRole="link" style={[s.chip, { backgroundColor: c.sky + '1a', alignSelf: 'flex-start' }]}>
            <Text style={[s.smallBold, { color: c.sky }]}>통증 안내 보기 ›</Text>
          </Pressable>
        )
      ) : null}
    </>
  );
  const errorLine = error ? <Text style={[s.small, { color: c.danger }]}>{error}</Text> : null;

  if (!routine) {
    return (
      <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float, borderWidth: 1, borderColor: c.sky + '40' }]}>
        <Text style={[s.title, { color: c.ink }]}>오늘은 {decision.label}을 권해요</Text>
        <Text style={[s.bodyBold, { color: c.sky }]}>{decision.reason}</Text>
        {extra}
        <Pressable
          onPress={() => void make()}
          disabled={making || !fresh}
          accessibilityRole="button"
          style={[s.pill, { backgroundColor: c.sky, opacity: making || !fresh ? 0.6 : 1 }]}
        >
          <Text style={[s.bodyBold, { color: '#fff' }]}>{making ? '만드는 중…' : '맞춤 루틴 만들기'}</Text>
        </Pressable>
        {errorLine}
      </View>
    );
  }

  const kindChanged = routine.kind !== decision.kind;
  const unsafeCount = routine.items.filter((it) => it.unsafe).length;
  return (
    <View style={{ gap: 10 }}>
      <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float, borderWidth: 1, borderColor: c.sky + '40' }]}>
        <View style={s.between}>
          <Text style={[s.title, { color: c.ink, flexShrink: 1 }]}>오늘의 {routine.label}</Text>
          <Text style={[s.small, { color: c.muted }]}>
            <Text style={[s.bodyBold, { color: c.ink }]}>{routine.items.length}</Text>개 · 약{' '}
            <Text style={[s.bodyBold, { color: c.ink }]}>{routine.estimatedMinutes}</Text>분
          </Text>
        </View>
        <Text style={[s.bodyBold, { color: c.sky }]}>{routine.reason}</Text>
        {extra}
        {routine.notes.length > 0 ? (
          <Fold label={`안내 ${routine.notes.length}개`} c={c}>
            {routine.notes.map((n) => (
              <Text key={n} style={[s.small, { color: c.muted }]}>
                {n}
              </Text>
            ))}
          </Fold>
        ) : null}
        {kindChanged || unsafeCount > 0 ? (
          <Text style={[s.small, s.box, { color: c.warn, backgroundColor: c.warnBg }]}>
            {kindChanged ? `몸 상태가 바뀌었어요. ${decision.reason}.` : `몸 상태가 바뀌어 무리인 운동이 ${unsafeCount}개 있어요.`} 다시 만들어도 체크한 것은 남아요.
          </Text>
        ) : null}
        <View style={[s.row, { borderTopWidth: 1, borderTopColor: c.line, paddingTop: 12, flexWrap: 'wrap' }]}>
          <Pressable onPress={() => openPlay('today', `d=${dateKey}`)} accessibilityRole="button" style={[s.smallPill, { backgroundColor: c.sky }]}>
            <SymbolView name="play.fill" size={12} tintColor="#fff" />
            <Text style={[s.bodyBold, { color: '#fff' }]}>따라하기</Text>
          </Pressable>
          <Pressable
            onPress={() => void make()}
            disabled={making || !fresh}
            accessibilityRole="button"
            style={[s.smallPill, { backgroundColor: c.chip, opacity: making || !fresh ? 0.6 : 1 }]}
          >
            <SymbolView name="arrow.clockwise" size={12} tintColor={c.ink} />
            <Text style={[s.smallBold, { color: c.ink }]}>{making ? '만드는 중…' : '다시 만들기'}</Text>
          </Pressable>
        </View>
        {errorLine}
      </View>
      <Checklist items={routine.items} dateKey={dateKey} fresh={fresh} onChanged={() => void reload()} c={c} />
    </View>
  );
}

/* ----------------------------- 부위별 보강 칸 ----------------------------- */

function GuideTab({ data, scroll, c }: { data: AppArmcareGuideTab; scroll: RefObject<ScrollViewInstance | null>; c: Palette }) {
  const [open, setOpen] = useState<ArmcareAreaKey | null>(null);
  /* 통증 칩을 누르면 그 부위 카드를 펴고 그리로 내려간다 — 카드는 이 칸 바로 밑에 둔다(useJump) */
  const jump = useJump(scroll);
  const showArea = (key: ArmcareAreaKey) => {
    setOpen(key);
    jump.jump(key);
  };
  return (
    <MyRoutinesProvider routines={data.routines ?? null}>
      <View onLayout={jump.onRoot} style={{ gap: 12 }}>
        <Text style={[s.small, { color: c.muted }]}>부위를 펼쳐 보세요.</Text>
        {data.coverage.pain ? <PainNote pain={data.coverage.pain} onArea={showArea} c={c} /> : null}
        <GapCard gaps={data.coverage.gaps} allCovered={data.coverage.allCovered} total={data.coverage.total} dateKey={data.dateKey} c={c} />
        <WebRow label="3D 근육 지도 보기" href="/training?view=armcare&tab=guide" c={c} />
        {AREAS_BY_JOINT.flatMap(({ joint, areas }) => [
          <Text key={joint} accessibilityRole="header" style={[s.section, { color: c.ink, paddingHorizontal: 4, paddingTop: 8 }]}>
            {joint}
          </Text>,
          ...areas.map((area) => (
            <AreaCard
              key={area.key}
              area={area}
              exercises={data.exercises}
              open={open === area.key}
              onToggle={() => setOpen(open === area.key ? null : area.key)}
              onLayout={jump.onItem(area.key)}
              c={c}
            />
          )),
        ])}
        <Text style={[s.tiny, { color: c.muted }]}>운동이 부상을 막아 준다는 보장은 없어요. 아프면 쉬고 진료를 받으세요.</Text>
        {data.untagged > 0 ? (
          <Text style={[s.tiny, { color: c.muted }]}>근육을 아직 적지 않은 암케어 운동 {data.untagged}개는 여기 나오지 않아요.</Text>
        ) : null}
      </View>
    </MyRoutinesProvider>
  );
}

/** '팔이 아프면 · 재활 프로그램' 줄 — 앱 시작 화면(rehab-start.tsx)으로. 오늘 체크인의 아픈 자리 · 정도 · 나이를 미리 넘긴다 */
function RehabStartRow({ start, c }: { start: NonNullable<AppArmcareTodayTab['rehabStart']>; c: Palette }) {
  const q = new URLSearchParams();
  if (start.age != null) q.set('age', String(start.age));
  if (start.area) q.set('area', start.area);
  if (start.level) q.set('level', String(start.level));
  return (
    <Pressable onPress={() => router.push(`/rehab-start?${q}` as Href)} accessibilityRole="button" style={[s.webRow, { backgroundColor: c.card, boxShadow: c.float }]}>
      <Text style={[s.body, { color: c.ink, flex: 1 }]}>
        팔이 아프면 · <Text style={{ color: c.sky, fontWeight: '600' }}>재활 프로그램</Text>
      </Text>
      <SymbolView name="chevron.right" size={13} weight="semibold" tintColor={c.muted} />
    </Pressable>
  );
}
