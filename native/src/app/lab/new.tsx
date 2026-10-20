import { type Href, router, Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadAppLabList } from '@/app/actions/pitch-lab';
import { CONSENT_TEXT } from '@/lib/pitch-3d/v2/lab-summary';
import { LAB_GROUND_OPTIONS, LAB_MAX_VIDEO_MB, labSideBase, labViewLabel, type LabGround, type LabHand, type LabView } from '@/lib/pitch-lab-meta';
import { Badge, Bar, Chip, LoadState, s, useLoad } from '~/community/parts';
import { GuideLink, NumberInput } from '~/lab/parts';
import { useLabUpload, type LabSlowmo } from '~/lab/use-lab-upload';
import { rpc } from '~/lib/rpc';
import { usePalette, type Palette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';

/**
 * 새 3D 분석(사용자 단계 흐름) — 사용자 화면(app/lab/index.tsx)의 [새 분석 시작]. 준비 → 옆 영상 → 뒤 영상 → 확인(손 · 던진 곳 · 키 · 동의) → 올리고 분석.
 * 한 화면에 한 가지만 묻는다(2026-10-21 김민이 고름 — 단계 흐름 + 내 분석 목록). 고르기 · 검사 · 올리기는 관리자 샘플 화면과 같은 훅(~/lab/use-lab-upload).
 * 올린 뒤 곧바로 분석을 걸고(requestPitch3dV2 — 동의 · 비용 지키기는 서버) 결과 화면으로 간다. 걸기가 막혀도 결과 화면이 까닭 · 다시 걸기를 보인다.
 * 거리 · 메모 같은 실험용 칸은 관리자 샘플 화면에만.
 */
type Loaded = Awaited<ReturnType<typeof loadAppLabList>>;
type Step = 'ready' | 'side' | 'back' | 'info' | 'send';
const STEPS: Step[] = ['ready', 'side', 'back', 'info'];

const HAND_OPTIONS = [
  { value: 'R', label: '오른손' },
  { value: 'L', label: '왼손' },
] as const;
const FPS_OPTIONS = [
  { value: 'unknown', label: '모름' },
  { value: '120', label: '120' },
  { value: '240', label: '240' },
] as const;

export default function LabNewScreen() {
  const c = usePalette();
  const { data, error, reload } = useLoad<Loaded>('pitch-lab.loadAppLabList', 'mine');
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      {!data ? (
        <>
          <Bar back="3D 동작 분석" title="새 분석" c={c} />
          <LoadState error={error} onRetry={() => void reload()} c={c} />
        </>
      ) : (
        <Flow heightCm={data.heightCm} defaultHand={data.hand} c={c} />
      )}
    </View>
  );
}

function Flow({ heightCm, defaultHand, c }: { heightCm: number | null; defaultHand: LabHand; c: Palette }) {
  const inset = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('ready');
  const [hand, setHand] = useState<LabHand>(defaultHand);
  const [ground, setGround] = useState<LabGround>('mound');
  const [height, setHeight] = useState(heightCm ? String(heightCm) : '');
  const [slowmo, setSlowmo] = useState<LabSlowmo>('unknown');
  const [consent, setConsent] = useState(false);
  const up = useLabUpload(hand);
  /* 두 영상 다 고속이면 슬로모 배수를 저절로(고른 순간 한 번 — 그 뒤 손으로 바꿀 수 있다) */
  const [seenAuto, setSeenAuto] = useState<LabSlowmo | null>(null);
  if (up.autoSlowmo !== seenAuto) {
    setSeenAuto(up.autoSlowmo);
    if (up.autoSlowmo) setSlowmo(up.autoSlowmo);
  }

  const at = STEPS.indexOf(step);
  const prev = () => (at > 0 ? setStep(STEPS[at - 1]) : router.back());
  const canNext =
    step === 'ready' ||
    (step === 'side' && !!up.picked.side && up.checking == null) ||
    (step === 'back' && !!up.picked.back && up.checking == null && !up.pairBlock) ||
    (step === 'info' && up.ready && consent);

  const send = async () => {
    setStep('send');
    const id = await up.upload({ slowmo, hand, ground, heightCm: height ? Number(height) : null, memo: null });
    if (!id) return setStep('info');
    /* 걸기가 막혀도(서버 설정 · 하루 실패 등) 결과 화면이 까닭과 다시 걸기를 보인다 — 여기서는 기다리지 않고 넘어간다 */
    await rpc('pitch-lab.requestPitch3dV2', { id, consent: true }).catch(() => null);
    router.replace(`/lab/${id}` as Href);
  };
  const next = () => {
    if (step === 'info') return void send();
    setStep(STEPS[at + 1]);
  };

  const sending = step === 'send';
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      {/* 올리는 동안은 쓸어 닫지 않게 */}
      <Stack.Screen options={{ gestureEnabled: !sending }} />
      <Bar back={sending ? undefined : '3D 동작 분석'} title="새 분석" c={c} />
      {/* 단계 막대 */}
      <View style={[{ flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingBottom: 8 }, READABLE]}>
        {STEPS.map((x, i) => (
          <View key={x} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: sending || i <= at ? c.sky : c.line }} />
        ))}
      </View>
      <ScrollView contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: 24 }, READABLE]} keyboardShouldPersistTaps="handled">
        {step === 'ready' ? (
          <ReadyStep hand={hand} c={c} />
        ) : step === 'side' || step === 'back' ? (
          <PickStep view={step} hand={hand} up={up} c={c} />
        ) : step === 'info' ? (
          <InfoStep
            hand={hand}
            setHand={setHand}
            ground={ground}
            setGround={setGround}
            height={height}
            setHeight={setHeight}
            slowmo={slowmo}
            setSlowmo={setSlowmo}
            consent={consent}
            setConsent={setConsent}
            up={up}
            c={c}
          />
        ) : (
          <SendStep up={up} c={c} />
        )}
      </ScrollView>
      {!sending ? (
        <View style={[{ flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 8, paddingBottom: inset.bottom + 12 }, READABLE]}>
          {at > 0 ? (
            <Pressable accessibilityRole="button" onPress={prev} style={[s.primary, { flex: 1, marginTop: 0, backgroundColor: c.chip }]}>
              <Text style={[s.primaryText, { color: c.ink }]}>이전</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityRole="button"
            disabled={!canNext}
            onPress={next}
            style={[s.primary, { flex: 2, marginTop: 0, backgroundColor: c.sky, opacity: canNext ? 1 : 0.4 }]}
          >
            <Text style={s.primaryText}>{step === 'ready' ? '영상 고르기' : step === 'info' ? '올리고 분석하기' : '다음'}</Text>
          </Pressable>
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}

type Up = ReturnType<typeof useLabUpload>;

function StepTitle({ title, sub, c }: { title: string; sub?: string; c: Palette }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={{ color: c.ink, fontSize: 24, fontWeight: '700' }}>{title}</Text>
      {sub ? <Text style={{ color: c.muted, fontSize: 15, lineHeight: 21 }}>{sub}</Text> : null}
    </View>
  );
}

function ReadyStep({ hand, c }: { hand: LabHand; c: Palette }) {
  const points: [string, string][] = [
    ['iphone.gen3', '폰 두 대로 같은 공을 동시에'],
    ['slowmo', '슬로 모션 240fps · 1배 줌'],
    ['camera.metering.center.weighted', `옆(${labSideBase(hand)} 쪽)과 뒤(2루 쪽)에 삼각대로`],
    ['photo.on.rectangle', `찍은 원본 그대로, 하나에 ${LAB_MAX_VIDEO_MB}MB까지`],
  ];
  return (
    <>
      <StepTitle title="이렇게 찍은 영상이 필요해요" c={c} />
      <View style={[s.group, { backgroundColor: c.card, boxShadow: c.float }]}>
        {points.map(([icon, text], i) => (
          <View key={text} style={[s.row, { gap: 12 }, i < points.length - 1 ? { borderBottomWidth: 0.5, borderBottomColor: c.line } : null]}>
            <SymbolView name={icon as never} size={20} tintColor={c.sky} />
            <Text style={{ flex: 1, color: c.ink, fontSize: 16 }}>{text}</Text>
          </View>
        ))}
      </View>
      <GuideLink label="촬영 안내 자세히 보기 ›" section="checklist" hand={hand} c={c} />
    </>
  );
}

function PickStep({ view, hand, up, c }: { view: LabView; hand: LabHand; up: Up; c: Palette }) {
  const p = up.picked[view];
  const checking = up.checking === view;
  return (
    <>
      <StepTitle
        title={`${labViewLabel(view, hand)} 영상`}
        sub={view === 'side' ? `${labSideBase(hand)} 쪽에서 투수 옆모습을 찍은 영상을 골라 주세요.` : '2루 쪽에서 투수 등 뒤를 찍은 영상을 골라 주세요. 옆 영상과 같은 공이어야 해요.'}
        c={c}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${labViewLabel(view, hand)} 영상 고르기`}
        disabled={up.checking != null}
        onPress={() => void up.pick(view)}
        style={({ pressed }) => [
          { minHeight: 180, borderRadius: 20, padding: 16, gap: 8, alignItems: 'center', justifyContent: 'center' },
          { backgroundColor: p ? c.chip : c.card, boxShadow: c.float, opacity: pressed ? 0.7 : 1 },
        ]}
      >
        <SymbolView name={p ? 'checkmark.circle.fill' : 'video.badge.plus'} size={40} tintColor={c.sky} />
        <Text style={{ color: c.ink, fontSize: 17, fontWeight: '600' }}>
          {checking ? '확인하는 중…' : p ? '다른 영상으로 바꾸기' : '앨범에서 고르기'}
        </Text>
        {p ? (
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <Text style={[s.meta, { color: c.muted }]}>{`${((p.asset.fileSize ?? 0) / 1024 / 1024).toFixed(1)}MB`}</Text>
            {p.fps != null ? <Badge text={`${Math.round(p.fps)}fps`} color={p.fps >= 100 ? c.ok : c.warn} c={c} /> : null}
          </View>
        ) : null}
      </Pressable>
      {up.error ? <Text style={{ color: c.danger, fontSize: 15, fontWeight: '600' }}>{up.error}</Text> : null}
      {up.error && up.blocked ? <GuideLink label="어떻게 찍으면 되는지 촬영 안내 보기 ›" section="checklist" hand={hand} c={c} /> : null}
      {view === 'back' && up.pairBlock ? (
        <>
          <Text style={{ color: c.danger, fontSize: 15, fontWeight: '600' }}>{up.pairBlock}</Text>
          <GuideLink label="두 폰으로 동시에 찍는 법 보기 ›" section="steps" hand={hand} c={c} />
        </>
      ) : null}
      {view === 'back' && up.fpsWarn ? (
        <View style={{ borderRadius: 12, padding: 12, gap: 4, backgroundColor: c.card }}>
          <Text style={{ color: c.warn, fontSize: 15, lineHeight: 20 }}>{up.fpsWarn}</Text>
          <GuideLink label="원본 그대로 옮기는 법 ›" section="move" hand={hand} c={c} />
        </View>
      ) : null}
    </>
  );
}

function InfoStep(p: {
  hand: LabHand;
  setHand: (h: LabHand) => void;
  ground: LabGround;
  setGround: (g: LabGround) => void;
  height: string;
  setHeight: (h: string) => void;
  slowmo: LabSlowmo;
  setSlowmo: (v: LabSlowmo) => void;
  consent: boolean;
  setConsent: (v: boolean) => void;
  up: Up;
  c: Palette;
}) {
  const { c } = p;
  return (
    <>
      <StepTitle title="마지막으로 확인해요" sub="맞게 적을수록 3D 인형 크기와 점검이 정확해요." c={c} />
      <View style={{ borderRadius: 16, padding: 14, gap: 6, backgroundColor: c.card, boxShadow: c.float }}>
        <Text style={[s.label, { color: c.muted }]}>던지는 손</Text>
        <View accessibilityRole="radiogroup" style={s.chips}>
          {HAND_OPTIONS.map((o) => (
            <Chip key={o.value} label={o.label} on={p.hand === o.value} onPress={() => p.setHand(o.value)} c={c} />
          ))}
        </View>
        <Text style={[s.label, { color: c.muted }]}>던진 곳</Text>
        <View accessibilityRole="radiogroup" style={s.chips}>
          {LAB_GROUND_OPTIONS.map((o) => (
            <Chip key={o.value} label={o.label} on={p.ground === o.value} onPress={() => p.setGround(o.value)} c={c} />
          ))}
        </View>
        <Text style={[s.label, { color: c.muted }]}>슬로 모션(초당 장수)</Text>
        <View accessibilityRole="radiogroup" style={s.chips}>
          {FPS_OPTIONS.map((o) => (
            <Chip key={o.value} label={o.label} on={p.slowmo === o.value} onPress={() => p.setSlowmo(o.value)} c={c} />
          ))}
        </View>
        <Text style={[s.label, { color: c.muted }]}>키(cm)</Text>
        <NumberInput value={p.height} onChange={p.setHeight} placeholder="175" c={c} />
      </View>
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: p.consent }}
        onPress={() => p.setConsent(!p.consent)}
        style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', paddingVertical: 4 }}
      >
        <View
          style={{
            width: 22,
            height: 22,
            borderRadius: 6,
            marginTop: 1,
            borderWidth: 2,
            borderColor: p.consent ? c.sky : c.line,
            backgroundColor: p.consent ? c.sky : 'transparent',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {p.consent ? <SymbolView name="checkmark" size={12} weight="bold" tintColor="#fff" /> : null}
        </View>
        <Text style={{ flex: 1, color: c.ink, fontSize: 14, lineHeight: 20 }}>{CONSENT_TEXT}</Text>
      </Pressable>
      {p.up.error ? <Text style={{ color: c.danger, fontSize: 15, fontWeight: '600' }}>{p.up.error}</Text> : null}
    </>
  );
}

function SendStep({ up, c }: { up: Up; c: Palette }) {
  const pct = up.progress ? (up.progress.view === 'side' ? 0 : 50) + up.progress.percent / 2 : 100;
  return (
    <View style={{ paddingVertical: 40, gap: 16, alignItems: 'center' }}>
      <StepTitle title={up.progress ? '영상을 올리는 중이에요' : '분석을 시작하는 중이에요'} c={c} />
      <View style={{ alignSelf: 'stretch', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: c.line }}>
        <View style={{ height: 8, width: `${pct}%`, backgroundColor: c.sky }} />
      </View>
      <Text style={[s.meta, { color: c.muted, textAlign: 'center' }]}>
        {up.progress ? `${up.progress.view === 'side' ? '옆' : '뒤'} 영상 ${up.progress.percent}%` : '곧 결과 화면으로 넘어가요.'} 앱을 닫지 말아 주세요.
      </Text>
    </View>
  );
}

