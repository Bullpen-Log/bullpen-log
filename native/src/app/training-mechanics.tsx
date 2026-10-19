import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState, type RefObject } from 'react';
import { Text, View, type ScrollViewInstance } from 'react-native';
import { MECHANICS_ELEMENTS, MECHANICS_SYMPTOMS, mechanicsElement } from '@/lib/mechanics/elements';
import type { AppMechanicsElementsTab, AppMechanicsProgramTab } from '@/lib/mechanics/home-load';
import { LevelOffer, ThrowNoteCard } from '~/mechanics/parts';
import { usePalette, type Palette } from '~/lib/ui';
import {
  CompletedCard,
  ElementCard,
  ElementChain,
  FilmCard,
  LevelProgress,
  LevelSettings,
  NoProgram,
  OverviewDetail,
  OverviewFold,
  SessionCard,
  SymptomChips,
} from '~/training/mechanics-parts';
import { Fold, Screen, s, useJump, useScreenData } from '~/training/screen';
import { useRememberPart } from '~/training/remember';

/**
 * 메커니즘(앱 화면) — 웹 /training?view=mechanics(&tab=elements&el=…)(app/(app)/training/training-page.tsx 의 mechanics 칸 · mechanics-section.tsx)를
 * 옮겼다. 자료는 웹과 같은 함수로 모은다(app/actions/app-training-parts.ts → lib/mechanics/home-load.ts). 트레이닝 탭의 메커니즘 카드에서 들어온다.
 *
 * [프로그램] 오늘의 세션(아픈 날 접기 · 그래도 하기) · 권하기 · 12칸 · 영상으로 확인 · 수준 바꾸기, [요소별 드릴] 투구의 흐름 · 증상 · 요소 카드.
 * 시작은 앱 따라 하기(/mechanics · /mechanics?anyway=1 — 웹이 내는 주소 그대로). ?el= 은 그 요소 카드를 펴고 내려간다.
 */
const TABS = [
  { value: 'program', label: '프로그램' },
  { value: 'elements', label: '요소별 드릴' },
] as const;
type Tab = (typeof TABS)[number]['value'];

export default function TrainingMechanicsScreen() {
  useRememberPart('mechanics');
  const c = usePalette();
  const params = useLocalSearchParams<{ tab?: string; el?: string }>();
  const [tab, setTab] = useState<Tab>(params.tab === 'elements' ? 'elements' : 'program');
  const state = useScreenData<AppMechanicsProgramTab | AppMechanicsElementsTab>('app-training-parts.loadAppMechanics', tab, `training-mechanics:${tab}`);
  const scroll = useRef<ScrollViewInstance>(null);

  const pick = (t: Tab) => {
    setTab(t);
    router.setParams({ tab: t });
  };
  const data = state.data && state.data.tab === tab ? state.data : null;
  return (
    <Screen title="메커니즘" tabs={TABS} tab={tab} onTab={pick} state={{ ...state, data }} scrollRef={scroll}>
      {data?.tab === 'program' ? (
        <ProgramTab data={data} reload={state.load} c={c} />
      ) : data?.tab === 'elements' ? (
        <ElementsTab data={data} focus={typeof params.el === 'string' ? params.el : null} scroll={scroll} c={c} />
      ) : null}
    </Screen>
  );
}

/** 프로그램 칸 — 웹 MechanicsProgram 과 같은 차례 */
function ProgramTab({ data, reload, c }: { data: AppMechanicsProgramTab; reload: () => Promise<void>; c: Palette }) {
  const { program } = data;
  if (!program?.level) return <NoProgram reload={reload} c={c} />;
  const completed = program.week == null;
  return (
    <View style={{ gap: 12 }}>
      {/* 오늘 드릴로 던진 공 — 투구 기록에 남기라고(트레이닝 탭 카드 · 따라 하기 끝 화면과 같은 알림) */}
      {data.throwNote ? <ThrowNoteCard note={data.throwNote} c={c} /> : null}
      {completed ? (
        <CompletedCard program={program} reload={reload} c={c} />
      ) : (
        <SessionCard program={program} session={data.session} doneToday={data.doneToday} painFold={data.painFold} c={c} />
      )}
      {!completed && program.advice && program.advice.kind !== 'done' && program.advice.to ? (
        <LevelOffer kind={program.advice.kind} to={program.advice.to} onChanged={() => void reload()} keepLabel="지금 수준 계속" c={c} />
      ) : null}
      <LevelProgress program={program} c={c} />
      <FilmCard sessionsDone={program.sessionsDone} films={program.films} c={c} />
      <LevelSettings current={program.level} index={program.index} reload={reload} c={c} />
      <OverviewFold c={c} />
    </View>
  );
}

/** 요소별 드릴 칸 — 투구의 흐름 → 증상 → 요소 카드(한 번에 하나만 편다, 웹 MechanicsGuide) */
function ElementsTab({
  data,
  focus,
  scroll,
  c,
}: {
  data: AppMechanicsElementsTab;
  focus: string | null;
  scroll: RefObject<ScrollViewInstance | null>;
  c: Palette;
}) {
  const first = MECHANICS_ELEMENTS.find((e) => e.key === focus)?.name ?? null;
  const [open, setOpen] = useState<string | null>(first);
  const [via, setVia] = useState<(typeof MECHANICS_SYMPTOMS)[number] | null>(null);
  const jump = useJump(scroll, first);
  const openElement = (name: string, symptom: (typeof MECHANICS_SYMPTOMS)[number] | null) => {
    setOpen(name);
    setVia(symptom);
    jump.jump(name);
  };
  return (
    <View onLayout={jump.onRoot} style={{ gap: 12 }}>
      <Text accessibilityRole="header" style={[s.section, { color: c.ink, paddingHorizontal: 4 }]}>
        투구의 흐름
      </Text>
      <ElementChain current={open} onPick={(name) => openElement(name, null)} c={c} />
      <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float, paddingVertical: 6 }]}>
        <Fold label="왜 순서가 중요한가요" c={c}>
          <OverviewDetail c={c} />
        </Fold>
      </View>
      <Text style={[s.smallBold, { color: c.muted, paddingHorizontal: 4, paddingTop: 4 }]}>이런 고민이 있나요?</Text>
      <SymptomChips onPick={(sym) => openElement(sym.main, sym)} c={c} />
      {MECHANICS_ELEMENTS.map((el) => (
        <ElementCard
          key={el.key}
          el={el}
          drills={data.drills}
          hand={data.hand}
          open={open === el.name}
          via={open === el.name ? via : null}
          onToggle={() => {
            setOpen(open === el.name ? null : el.name);
            setVia(null);
          }}
          onElement={(name) => {
            if (mechanicsElement(name)) openElement(name, null);
          }}
          onLayout={jump.onItem(el.name)}
          c={c}
        />
      ))}
    </View>
  );
}
