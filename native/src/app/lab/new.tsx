import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { type Href, router, Stack } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppAnalysisConsent } from '@/app/actions/analysis-consent';
import type { loadAppLabList } from '@/app/actions/pitch-lab';
import { CONSENT_TEXT } from '@/lib/pitch-3d/v2/lab-summary';
import { LAB_MAX_VIDEO_MB, LAB_VIEWS, labSideBase, type LabGround, type LabHand, type LabView } from '@/lib/pitch-lab-meta';
import { LoadState, useLoad } from '~/community/parts';
import { FlatIcon, MoundIcon, StepRail } from '~/lab/art';
import { GuideLink, SubjectChips } from '~/lab/parts';
import { LabProgress, type LabAction, type LabPhase } from '~/lab/progress';
import { useLabUpload, type LabPicked, type LabSlowmo } from '~/lab/use-lab-upload';
import { READABLE } from '~/lib/layout';
import { rpc, RpcError } from '~/lib/rpc';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { Segmented } from '~/shell/heading';
import { Icon } from '~/shell/icon';

/**
 * 새 3D 분석(2026-10-29 확정 시안 analysis-video-selection · capture-info · final-review · progress) — 영상 선택(두 칸 한 화면) → 촬영 정보 → 최종 확인 → 전송 · 접수.
 * 고르기 · 검사 · 올리기는 관리자 샘플 화면과 같은 훅(~/lab/use-lab-upload), 검사 규칙 · 서버 확인은 그대로(lib/pitch-lab-guard · saveLabSample · requestPitch3dV2).
 *
 * 단계마다 따로 성공을 가른다: 영상 전송(올린 칸은 다시 안 보냄) → 정보 저장 → 분석 요청 접수. 영상은 올라갔는데 요청이 실패하면 같은 샘플 번호로 요청만 다시,
 * 요청 답이 끊겨 접수를 모르면 새로 걸기 전에 작업 상태를 먼저 묻는다. 접수되면 결과 화면(같은 진행 틀)으로 넘어가고 거기서 상태를 이어 묻는다.
 * 국외 이전 동의(lib/analysis-consent.ts): 문서가 확정돼 있으면 서버에 남은 동의를 보고, 없으면 첫 이용 동의 화면(app/lab/consent.tsx)을 거친다.
 * 확정 전이면 예전처럼 요청할 때 확인(체크) — 관리자는 남의 투구라 늘 요청할 때 확인.
 */
type Loaded = Awaited<ReturnType<typeof loadAppLabList>>;
type ConsentLoaded = AppAnalysisConsent | { ok: false; to: string };
type Step = 'pick' | 'info' | 'review';
const MB = 1048576;
const HEIGHT_MIN = 120;
const HEIGHT_MAX = 230;

export default function LabNewScreen() {
  const c = usePalette();
  const { data, error, reload } = useLoad<Loaded>('pitch-lab.loadAppLabList', 'mine');
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      {!data ? (
        <>
          <Head title="새 분석" onBack={() => router.back()} c={c} />
          <LoadState error={error} onRetry={() => void reload()} c={c} />
        </>
      ) : (
        <Flow heightCm={data.heightCm} defaultHand={data.hand} isAdmin={data.isAdmin} c={c} />
      )}
    </View>
  );
}

function Head({ title, onBack, right, c }: { title: string; onBack?: (() => void) | null; right?: React.ReactNode; c: Palette }) {
  const inset = useSafeAreaInsets();
  return (
    <View style={[st.head, { paddingTop: inset.top + 2, backgroundColor: c.page }]}>
      {onBack ? (
        <Pressable accessibilityRole="button" accessibilityLabel="뒤로" onPress={onBack} hitSlop={6} style={st.iconBtn}>
          <Icon name="chevron-left" size={22} color={c.link} />
        </Pressable>
      ) : (
        <View style={st.iconBtn} />
      )}
      <Text accessibilityRole="header" style={[TYPE.card, { flex: 1, textAlign: 'center', color: c.ink }]} numberOfLines={1}>
        {title}
      </Text>
      <View style={st.iconBtn}>{right}</View>
    </View>
  );
}

const fmtSec = (s: number | null) => (s == null ? null : `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.round(s % 60)).padStart(2, '0')}`);
const fmtMb = (b: number | null | undefined) => (b ? `${Math.round((b / MB) * 10) / 10}MB` : null);
const fpsText = (p: LabPicked | undefined) => (p?.fps != null ? `${Math.round(p.fps)}fps` : null);
const todayHead = () => {
  const d = new Date();
  return `${d.getMonth() + 1}월 ${d.getDate()}일 투구`;
};

function Flow({ heightCm, defaultHand, isAdmin, c }: { heightCm: number | null; defaultHand: LabHand; isAdmin: boolean; c: Palette }) {
  const inset = useSafeAreaInsets();
  const [step, setStep] = useState<Step>('pick');
  const [hand, setHand] = useState<LabHand>(defaultHand);
  /* 던진 곳은 고르기 전까지 비워 둔다 — 기본값으로 저절로 정하지 않는다 */
  const [ground, setGround] = useState<LabGround | null>(null);
  const [height, setHeight] = useState(heightCm ? String(heightCm) : '');
  /* 촬영 당시 슬로 모션 설정 — 파일에서 두 영상 다 고속으로 읽히면 그것, 아니면 직접 고른 값(파일 확인 결과와 따로 둔다) */
  const [manualSlowmo, setManualSlowmo] = useState<LabSlowmo>('unknown');
  const [attest, setAttest] = useState(false);
  const [attestNeed, setAttestNeed] = useState(false);
  /* 누구 투구(관리자만 — 여러 사람을 올린다, 사람 폴더로 묶임). 비면 기타 */
  const [subject, setSubject] = useState('');
  const up = useLabUpload(hand);
  const cs = useLoad<ConsentLoaded>('analysis-consent.loadAppAnalysisConsent');
  const consent = cs.data && cs.data.ok ? cs.data : null;
  /* 동의 방식 — 관리자는 남의 투구라 요청마다 확인(attest) · 문서 확정이면 서버에 남은 동의(stored / need) · 확정 전이면 예전처럼 요청할 때 확인(attest) */
  const mode: 'attest' | 'stored' | 'need' | 'loading' = isAdmin
    ? 'attest'
    : !consent
      ? 'loading'
      : !consent.ready
        ? 'attest'
        : consent.state.valid
          ? 'stored'
          : 'need';

  /* 전송 · 접수 단계 */
  const [phase, setPhase] = useState<LabPhase | null>(null);
  const [sentId, setSentId] = useState<string | null>(null);
  const [needConsent, setNeedConsent] = useState(false);
  const lock = useRef(false);

  /* 올리지 않고 나가면 고른 파일을 앱 캐시에서 지운다(올렸으면 훅이 이미 지웠다) */
  const discard = useRef(up.discard);
  useEffect(() => {
    discard.current = up.discard;
  });
  useEffect(() => () => discard.current(), []);

  const both = LAB_VIEWS.map((v) => up.picked[v]?.fps ?? null);
  const fileKnown = both.every((x): x is number => x != null);
  const slowmo: LabSlowmo = fileKnown ? (up.autoSlowmo ?? 'unknown') : manualSlowmo;
  const heightNum = height.trim() === '' ? null : Number(height);
  const heightError =
    heightNum != null && (!Number.isFinite(heightNum) || heightNum < HEIGHT_MIN || heightNum > HEIGHT_MAX)
      ? `키는 ${HEIGHT_MIN}~${HEIGHT_MAX}cm 사이로 적어 주세요. 모르면 비워 두세요.`
      : null;

  const goBack = () => (step === 'review' ? setStep('info') : step === 'info' ? setStep('pick') : router.back());

  const check = async (id: string) => {
    const r = await rpc<{ job: { status: string } | null } | { error: string }>('pitch-lab.checkPitch3dV2', { id });
    return 'job' in r ? r.job : null;
  };
  const accepted = (id: string) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.replace(`/lab/${id}` as Href);
  };
  /* 요청만(영상은 이미 저장) — 답이 끊기면 새로 걸기 전에 작업이 생겼는지 먼저 본다 */
  const request = (id: string): Promise<void> => {
    setPhase({ kind: 'accepting' });
    setNeedConsent(false);
    return rpc<{ ok: true } | { error: string; need?: 'consent' }>('pitch-lab.requestPitch3dV2', { id, consent: true }).then(
      (r) => {
        if (!('error' in r)) return accepted(id);
        /* 이미 돌고 있다는 답이면 접수된 것 */
        return check(id)
          .catch(() => null)
          .then((j) => {
            if (j && (j.status === 'queued' || j.status === 'running')) return accepted(id);
            setNeedConsent(r.need === 'consent');
            setPhase({ kind: 'request-failed', reason: r.error });
          });
      },
      (e: unknown) => {
        if (e instanceof RpcError && e.code === 'redirect') return router.replace('/login' as Href);
        /* 답이 끊겼다 — 접수됐는지 먼저 묻고, 모르면 연결 확인 불가로(새로 걸지 않는다) */
        return check(id).then(
          (j) => {
            if (j && j.status !== 'failed') return accepted(id);
            setPhase({ kind: 'request-failed', reason: '요청이 서버에 닿지 않았어요. 영상은 저장돼 있어 요청만 다시 보내면 돼요.' });
          },
          () => setPhase({ kind: 'offline', was: 'accepting' })
        );
      }
    );
  };
  /* 영상 전송(올린 칸은 건너뜀) → 정보 저장 → 요청. 두 번 누름은 lock 으로 막는다 */
  const run = async () => {
    let id = sentId;
    if (!id) {
      setPhase({ kind: 'upload', sent: 0, total: 0, views: { side: 'wait', back: 'wait' } });
      id = await up.upload({
        slowmo,
        hand,
        ground: ground ?? 'mound',
        heightCm: heightNum,
        memo: null,
        subject: isAdmin ? subject.trim() || null : null,
      });
      if (!id) return setPhase({ kind: 'upload-failed', reason: '' });
      setSentId(id);
    }
    await request(id);
  };
  const start = () => {
    if (lock.current) return;
    lock.current = true;
    const release = () => {
      lock.current = false;
    };
    void run().then(release, release);
  };
  const onStart = () => {
    if (mode === 'loading') return;
    if (mode === 'need') return router.push('/lab/consent?from=new' as Href);
    if (mode === 'attest' && !attest) return setAttestNeed(true);
    start();
  };

  /* 전송 · 접수 화면 */
  if (phase) {
    const shown: LabPhase =
      phase.kind === 'upload'
        ? (() => {
            const s = up.sending;
            const sent = LAB_VIEWS.reduce((n, v) => n + (s[v]?.sent ?? 0), 0);
            const total = LAB_VIEWS.reduce((n, v) => n + (s[v]?.total ?? 0), 0);
            const at = (v: LabView) => (s[v]?.done ? 'done' : up.progress?.view === v ? 'sending' : 'wait') as 'done' | 'sending' | 'wait';
            return { kind: 'upload', sent, total, views: { side: at('side'), back: at('back') } };
          })()
        : phase.kind === 'upload-failed'
          ? { kind: 'upload-failed', reason: up.error ?? '신호가 약해 영상을 다 보내지 못했어요.' }
          : phase;
    const busy = phase.kind === 'accepting' || phase.kind === 'upload';
    const primary: LabAction | null =
      shown.kind === 'upload-failed'
        ? { label: '다시 보내기', onPress: start }
        : shown.kind === 'request-failed'
          ? needConsent
            ? { label: '동의하고 계속', onPress: () => router.push('/lab/consent?from=new' as Href) }
            : { label: '분석 요청 다시 보내기', onPress: () => sentId && void request(sentId) }
          : shown.kind === 'offline'
            ? { label: '상태 다시 확인', onPress: () => sentId && void request(sentId) }
            : null;
    const secondary: LabAction | null =
      shown.kind === 'upload-failed'
        ? { label: '영상 다시 고르기', onPress: () => (setPhase(null), setStep('pick')) }
        : shown.kind === 'request-failed' || shown.kind === 'offline'
          ? { label: '목록으로', onPress: () => router.replace('/lab' as Href) }
          : null;
    const info: [string, string][] = [
      ['옆 영상', sentSummary(up.picked.side) ?? '보냈어요'],
      ['뒤 영상', sentSummary(up.picked.back) ?? '보냈어요'],
      ['던진 곳', ground === 'flat' ? '평지' : '마운드'],
      ['던지는 손', hand === 'L' ? '왼손' : '오른손'],
      ['키', heightNum ? `${heightNum}cm` : '미입력'],
      ['동의', mode === 'stored' ? '동의 완료' : '요청할 때 확인'],
    ];
    return (
      <View style={{ flex: 1 }}>
        <Stack.Screen options={{ gestureEnabled: !busy }} />
        <Head title="3D 동작 분석" onBack={busy ? null : () => router.replace('/lab' as Href)} c={c} />
        <LabProgress
          c={c}
          phase={shown}
          head={`${todayHead()} · ${ground === 'flat' ? '평지' : '마운드'} · ${hand === 'L' ? '왼손' : '오른손'}`}
          info={info}
          primary={primary}
          secondary={secondary}
          note={
            shown.kind === 'upload'
              ? '전송이 끝날 때까지 앱을 열어 두세요.'
              : shown.kind === 'request-failed' || shown.kind === 'offline'
                ? '영상은 저장돼 있어요. 다시 보내지 않아요.'
                : null
          }
        />
      </View>
    );
  }

  const at = step === 'pick' ? 0 : step === 'info' ? 1 : 2;
  const canNext = step === 'pick' ? up.ready : step === 'info' ? ground != null && !heightError && up.ready : mode !== 'loading' && up.ready;
  const hint =
    step === 'pick'
      ? up.ready
        ? '촬영 정보를 확인해 주세요.'
        : up.checking
          ? '영상을 확인하고 있어요.'
          : '옆 · 뒤 영상을 모두 골라 주세요.'
      : step === 'info'
        ? ground == null
          ? '던진 곳을 선택해 주세요.'
          : heightError
            ? '키를 확인해 주세요.'
            : null
        : null;
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
      <Head
        title="새 분석"
        onBack={goBack}
        right={
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="촬영 방법"
            onPress={() => router.push(`/lab/guide?hand=${hand}` as Href)}
            hitSlop={6}
            style={st.iconBtn}
          >
            <Icon name="info" size={20} color={c.link} />
          </Pressable>
        }
        c={c}
      />
      <View style={[{ paddingHorizontal: 16, paddingBottom: 6 }, READABLE]}>
        <StepRail at={at} c={c} />
      </View>
      <ScrollView contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: 24 }, READABLE]} keyboardShouldPersistTaps="handled">
        {step === 'pick' ? (
          <PickStep hand={hand} setHand={setHand} up={up} c={c} />
        ) : step === 'info' ? (
          <InfoStep
            hand={hand}
            setHand={setHand}
            ground={ground}
            setGround={setGround}
            height={height}
            setHeight={setHeight}
            heightError={heightError}
            manualSlowmo={manualSlowmo}
            setManualSlowmo={setManualSlowmo}
            up={up}
            onEditVideos={() => setStep('pick')}
            subject={isAdmin ? subject : null}
            setSubject={setSubject}
            c={c}
          />
        ) : (
          <ReviewStep
            slowmo={slowmo}
            hand={hand}
            ground={ground ?? 'mound'}
            heightNum={heightNum}
            up={up}
            mode={mode}
            consent={consent}
            attest={attest}
            attestNeed={attestNeed}
            setAttest={(v) => {
              setAttest(v);
              setAttestNeed(false);
            }}
            onEditVideos={() => setStep('pick')}
            onEditInfo={() => setStep('info')}
            c={c}
          />
        )}
      </ScrollView>
      <View style={[{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: inset.bottom + 12, gap: 8 }, READABLE]}>
        {hint ? <Text style={[TYPE.sub, { color: c.muted, textAlign: 'center' }]}>{hint}</Text> : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !canNext }}
          disabled={!canNext}
          onPress={() => (step === 'pick' ? setStep('info') : step === 'info' ? setStep('review') : onStart())}
          style={({ pressed }) => [st.cta, { backgroundColor: canNext ? c.action : c.chip, opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={[TYPE.button, { color: canNext ? '#fff' : c.muted }]}>
            {step === 'pick' ? '촬영 정보 확인' : step === 'info' ? '최종 확인' : mode === 'need' ? '동의하고 분석 시작' : '분석 시작'}
          </Text>
          <Icon name="arrow-right" size={18} color={canNext ? '#fff' : c.muted} />
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const sentSummary = (p: LabPicked | undefined) =>
  p ? [p.asset.fileName, fmtSec(p.info.durationSec ?? p.cap.durationSec ?? null), fpsText(p), fmtMb(p.asset.fileSize)].filter(Boolean).join(' · ') : null;

type Up = ReturnType<typeof useLabUpload>;

function Title({ title, sub, c }: { title: string; sub?: string; c: Palette }) {
  return (
    <View style={{ gap: 4 }}>
      <Text accessibilityRole="header" style={[TYPE.hero, { color: c.ink, fontSize: 26 }]}>
        {title}
      </Text>
      {sub ? <Text style={[TYPE.body, { color: c.muted }]}>{sub}</Text> : null}
    </View>
  );
}

/* ───────────────────────────── 1. 영상 선택 ───────────────────────────── */

function PickStep({ hand, setHand, up, c }: { hand: LabHand; setHand: (h: LabHand) => void; up: Up; c: Palette }) {
  const ready = LAB_VIEWS.every((v) => up.picked[v]);
  const anyChecking = up.checking != null;
  return (
    <>
      <Title title="분석할 영상을 골라요." sub="같은 투구를 두 폰으로 동시에 찍은 원본 2개" c={c} />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Text style={[TYPE.body, { color: c.muted, flex: 1 }]}>투구 손</Text>
        <View style={{ width: 160 }}>
          <Segmented
            label="투구 손"
            value={hand}
            onChange={setHand}
            options={[
              { value: 'R', label: '오른손' },
              { value: 'L', label: '왼손' },
            ]}
          />
        </View>
      </View>
      {LAB_VIEWS.map((v) => (
        <Slot key={v} view={v} hand={hand} up={up} c={c} />
      ))}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 }}>
        <Text style={[TYPE.sub, { color: ready && !up.pairBlock ? c.sky : c.muted, flexShrink: 1 }]}>
          {ready && !up.pairBlock ? '영상 2개 파일 확인 완료' : `영상 ${LAB_VIEWS.filter((v) => up.picked[v]).length} / 2개 준비`}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityHint="옆 영상과 뒤 영상의 자리를 맞바꿔요"
          disabled={anyChecking || !LAB_VIEWS.some((v) => up.picked[v])}
          onPress={() => {
            void Haptics.selectionAsync();
            up.swap();
          }}
          hitSlop={6}
          style={({ pressed }) => [st.linkBtn, { opacity: anyChecking || !LAB_VIEWS.some((v) => up.picked[v]) ? 0.4 : pressed ? 0.6 : 1 }]}
        >
          <Icon name="arrow-up-down" size={16} color={c.link} />
          <Text style={[TYPE.buttonCompact, { color: c.link }]}>옆 · 뒤 바꾸기</Text>
        </Pressable>
      </View>
      {up.pairBlock ? (
        <View style={[st.notice, { backgroundColor: c.warnBg }]}>
          <Text style={[TYPE.body, { color: c.ink }]}>{up.pairBlock}</Text>
          <GuideLink label="두 폰으로 동시에 찍는 법 보기 ›" section="steps" hand={hand} c={c} />
        </View>
      ) : null}
      {up.fpsWarn ? (
        <View style={[st.notice, { backgroundColor: c.card }]}>
          <Text style={[TYPE.body, { color: c.warn }]}>{up.fpsWarn}</Text>
          <GuideLink label="원본 그대로 옮기는 법 ›" section="move" hand={hand} c={c} />
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
        <Icon name="info" size={14} color={c.muted} />
        <Text style={[TYPE.sub, { color: c.muted }]}>영상당 {LAB_MAX_VIDEO_MB}MB 이하 · 원본 그대로</Text>
      </View>
    </>
  );
}

/** 칸 하나 — 선택 전 · 검사 중 · 준비 · 파일 문제. 준비면 실제 장면 그림 · 파일 이름 · 길이 · 프레임 · 용량, 바꾸기 · 빼기 · 미리보기 */
function Slot({ view, hand, up, c }: { view: LabView; hand: LabHand; up: Up; c: Palette }) {
  const p = up.picked[view];
  const checking = up.checkingOf[view] === true;
  const err = up.slotError[view];
  const [preview, setPreview] = useState(false);
  const calm = useReducedMotion();
  const name = view === 'side' ? '옆 영상' : '뒤 영상';
  const where = view === 'side' ? `${labSideBase(hand)} 쪽` : '2루 쪽';
  return (
    <View style={[st.slot, { backgroundColor: c.card, boxShadow: c.float, borderColor: err ? c.warn : 'transparent' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[TYPE.card, { color: c.ink }]}>{name}</Text>
        <Text style={[TYPE.sub, { color: c.muted }]}>{where}</Text>
        <View style={{ flex: 1 }} />
        {checking ? (
          <Text style={[TYPE.sub, { color: c.muted }]}>확인 중</Text>
        ) : p ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Icon name="circle-check" size={14} color={c.sky} />
            <Text style={[TYPE.sub, { color: c.sky }]}>확인 완료</Text>
          </View>
        ) : err ? (
          <Text style={[TYPE.sub, { color: c.warn }]}>파일 문제</Text>
        ) : null}
      </View>
      {p ? (
        <Animated.View entering={calm ? undefined : FadeIn.duration(180)} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${name} 미리보기`}
            onPress={() => setPreview(true)}
            style={[st.thumb, { backgroundColor: c.skyTint }]}
          >
            {p.thumb ? (
              <Image source={p.thumb} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : p.thumb === undefined ? (
              <ActivityIndicator color={c.muted} />
            ) : (
              <Icon name="film" size={24} color={c.muted} />
            )}
            <View style={st.playDot}>
              <Icon name="play" size={12} color="#fff" />
            </View>
          </Pressable>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]} numberOfLines={1}>
              {p.asset.fileName || '이름 없는 영상'}
            </Text>
            <Text style={[TYPE.sub, { color: c.muted }]}>
              {[fmtSec(p.info.durationSec ?? p.cap.durationSec ?? null) ?? '길이 모름', fpsText(p) ?? '프레임 확인 안 됨', fmtMb(p.asset.fileSize)].filter(Boolean).join(' · ')}
            </Text>
            <View style={{ flexDirection: 'row', gap: 14 }}>
              <Pressable accessibilityRole="button" onPress={() => void up.pick(view)} hitSlop={8} style={st.smallLink}>
                <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>다른 영상으로 바꾸기</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel={`${name} 빼기`} onPress={() => up.remove(view)} hitSlop={8} style={st.smallLink}>
                <Text style={[TYPE.sub, { color: c.muted, fontWeight: '600' }]}>빼기</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${name} 고르기`}
          disabled={checking}
          onPress={() => void up.pick(view)}
          style={({ pressed }) => [st.empty, { borderColor: c.lineStrong, opacity: pressed ? 0.6 : 1 }]}
        >
          {checking ? <ActivityIndicator color={c.muted} /> : <Icon name="plus" size={20} color={c.sky} />}
          <Text style={[TYPE.buttonCompact, { color: checking ? c.muted : c.sky }]}>{checking ? '영상을 확인하고 있어요' : '앨범에서 고르기'}</Text>
          {checking ? (
            <Pressable accessibilityRole="button" onPress={() => up.remove(view)} hitSlop={8}>
              <Text style={[TYPE.sub, { color: c.muted }]}>취소</Text>
            </Pressable>
          ) : null}
        </Pressable>
      )}
      {err ? (
        <View style={{ gap: 2 }}>
          <Text style={[TYPE.sub, { color: c.warn }]}>{err.text}</Text>
          {err.blocked ? <GuideLink label="촬영 안내 보기 ›" section="checklist" hand={hand} c={c} /> : null}
        </View>
      ) : null}
      {preview && p ? <ClipPreview uri={p.asset.uri} title={name} onClose={() => setPreview(false)} /> : null}
    </View>
  );
}

/** 미리보기 — 연 동안만 재생기 하나(닫으면 풀린다) */
function ClipPreview({ uri, title, onClose }: { uri: string; title: string; onClose: () => void }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.loop = true;
    p.play();
  });
  return (
    <Modal visible animationType="fade" onRequestClose={onClose} presentationStyle="overFullScreen" transparent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', justifyContent: 'center', padding: 16, gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[TYPE.card, { color: '#fff', flex: 1 }]}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={onClose} hitSlop={8} style={st.iconBtn}>
            <Icon name="x" size={22} color="#fff" />
          </Pressable>
        </View>
        <VideoView player={player} style={{ width: '100%', aspectRatio: 9 / 16, maxHeight: '80%', alignSelf: 'center' }} contentFit="contain" nativeControls />
      </View>
    </Modal>
  );
}

/* ───────────────────────────── 2. 촬영 정보 ───────────────────────────── */

function InfoStep(p: {
  hand: LabHand;
  setHand: (h: LabHand) => void;
  ground: LabGround | null;
  setGround: (g: LabGround) => void;
  height: string;
  setHeight: (h: string) => void;
  heightError: string | null;
  manualSlowmo: LabSlowmo;
  setManualSlowmo: (v: LabSlowmo) => void;
  up: Up;
  onEditVideos: () => void;
  subject: string | null;
  setSubject: (v: string) => void;
  c: Palette;
}) {
  const { c, up } = p;
  const fps = LAB_VIEWS.map((v) => up.picked[v]?.fps ?? null);
  const unknown = fps.some((x) => x == null);
  const pickHand = () =>
    Alert.alert('던지는 손', '이번 분석에만 적용돼요.', [
      { text: '오른손', onPress: () => p.setHand('R') },
      { text: '왼손', onPress: () => p.setHand('L') },
      { text: '취소', style: 'cancel' },
    ]);
  return (
    <>
      <Title title="촬영 정보를 확인해요." c={c} />
      <View style={[st.card, { backgroundColor: c.card, boxShadow: c.float, flexDirection: 'row', alignItems: 'center', gap: 12 }]}>
        {LAB_VIEWS.map((v) => {
          const x = up.picked[v];
          return (
            <View key={v} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[st.miniThumb, { backgroundColor: c.skyTint }]}>
                {x?.thumb ? <Image source={x.thumb} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Icon name="film" size={16} color={c.muted} />}
              </View>
              <View>
                <Text style={[TYPE.sub, { color: c.ink, fontWeight: '600' }]}>{v === 'side' ? '옆 영상' : '뒤 영상'}</Text>
                <Text style={[TYPE.sub, { color: c.muted }]}>{fmtSec(x?.info.durationSec ?? x?.cap.durationSec ?? null) ?? '길이 모름'}</Text>
              </View>
            </View>
          );
        })}
        <Pressable accessibilityRole="button" onPress={p.onEditVideos} hitSlop={8} style={st.smallLink}>
          <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>영상 수정</Text>
        </Pressable>
      </View>

      <Text accessibilityRole="header" style={[TYPE.card, { color: c.ink }]}>
        어디에서 던졌나요?
      </Text>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 12 }}>
        {(['mound', 'flat'] as const).map((g) => {
          const on = p.ground === g;
          return (
            <Pressable
              key={g}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              onPress={() => {
                void Haptics.selectionAsync();
                p.setGround(g);
              }}
              style={({ pressed }) => [
                st.groundCard,
                { backgroundColor: on ? c.skyTint : c.card, boxShadow: c.float, borderColor: on ? c.sky : 'transparent', opacity: pressed ? 0.8 : 1 },
              ]}
            >
              {g === 'mound' ? <MoundIcon width={86} /> : <FlatIcon width={86} />}
              <Text style={[TYPE.card, { color: on ? c.sky : c.ink }]}>{g === 'mound' ? '마운드' : '평지'}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text accessibilityRole="header" style={[TYPE.card, { color: c.ink }]}>
        투수 정보
      </Text>
      <View style={[st.card, { backgroundColor: c.card, boxShadow: c.float, paddingVertical: 4 }]}>
        {p.subject != null ? (
          <View style={{ gap: 6, paddingVertical: 10 }}>
            <Text style={[TYPE.sub, { color: c.muted }]}>누구 투구(관리자)</Text>
            <SubjectChips value={p.subject} onChange={p.setSubject} c={c} />
          </View>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel={`던지는 손 ${p.hand === 'L' ? '왼손' : '오른손'}, 바꾸기`} onPress={pickHand} style={st.infoRow}>
          <Text style={[TYPE.body, { color: c.ink, flex: 1, fontWeight: '600' }]}>던지는 손</Text>
          <Text style={[TYPE.body, { color: c.sky }]}>{p.hand === 'L' ? '왼손' : '오른손'}</Text>
          <Icon name="chevron-right" size={16} color={c.muted} />
        </Pressable>
        <View style={[st.infoRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
          <Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>키</Text>
          <Text style={[TYPE.sub, { color: c.muted, flex: 1 }]}>선택</Text>
          <TextInput
            value={p.height}
            onChangeText={(t) => p.setHeight(t.replace(/[^0-9.]/g, '').slice(0, 5))}
            keyboardType="decimal-pad"
            placeholder="미입력"
            placeholderTextColor={c.muted}
            accessibilityLabel="키(센티미터, 선택)"
            style={[TYPE.body, { color: c.sky, minWidth: 64, minHeight: 44, textAlign: 'right' }]}
          />
          <Text style={[TYPE.sub, { color: c.muted }]}>cm</Text>
        </View>
      </View>
      {p.heightError ? <Text style={[TYPE.sub, { color: c.warn }]}>{p.heightError}</Text> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Icon name="info" size={14} color={c.muted} />
        <Text style={[TYPE.sub, { color: c.muted }]}>수정한 정보는 이번 분석에만 적용돼요. 프로필은 그대로예요.</Text>
      </View>

      <View style={[st.card, { backgroundColor: c.card, boxShadow: c.float, gap: 10 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={[TYPE.card, { color: c.ink, flex: 1 }]}>영상 정보</Text>
          <Text style={[TYPE.sub, { color: c.muted }]}>파일에서 확인</Text>
        </View>
        <View style={{ flexDirection: 'row' }}>
          {LAB_VIEWS.map((v, i) => (
            <View key={v} style={[{ flex: 1, flexDirection: 'row', alignItems: 'baseline', gap: 6 }, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: c.line, paddingLeft: 12 }]}>
              <Text style={[TYPE.sub, { color: c.muted }]}>{v === 'side' ? '옆' : '뒤'}</Text>
              {fps[i] != null ? (
                <Text style={[TYPE.num, { color: c.ink, fontSize: 18 }]}>
                  {Math.round(fps[i]!)}
                  <Text style={[TYPE.sub, { color: c.muted }]}> fps</Text>
                </Text>
              ) : (
                <Text style={[TYPE.body, { color: c.warn }]}>확인 안 됨</Text>
              )}
            </View>
          ))}
        </View>
        {up.fpsWarn ? <Text style={[TYPE.sub, { color: c.warn }]}>{up.fpsWarn}</Text> : null}
        {unknown ? (
          <View style={{ gap: 6 }}>
            <Text style={[TYPE.sub, { color: c.muted }]}>파일에서 프레임을 읽지 못했어요. 찍을 때 고른 슬로 모션 설정을 알면 골라 주세요(직접 선택).</Text>
            <Segmented
              label="촬영 설정(직접 선택)"
              value={p.manualSlowmo}
              onChange={p.setManualSlowmo}
              options={[
                { value: '120', label: '120fps' },
                { value: '240', label: '240fps' },
                { value: 'unknown', label: '모름' },
              ]}
            />
          </View>
        ) : null}
      </View>
    </>
  );
}

/* ───────────────────────────── 3. 최종 확인 ───────────────────────────── */

function ReviewStep(p: {
  /** 촬영 당시 슬로 모션 설정(파일에서 못 읽었을 때 직접 고른 값) */
  slowmo: LabSlowmo;
  hand: LabHand;
  ground: LabGround;
  heightNum: number | null;
  up: Up;
  mode: 'attest' | 'stored' | 'need' | 'loading';
  consent: AppAnalysisConsent | null;
  attest: boolean;
  attestNeed: boolean;
  setAttest: (v: boolean) => void;
  onEditVideos: () => void;
  onEditInfo: () => void;
  c: Palette;
}) {
  const { c, up } = p;
  const fps = LAB_VIEWS.map((v) => up.picked[v]?.fps ?? null);
  const frameNote = fps.some((x) => x == null)
    ? `파일에서 프레임을 확인하지 못한 영상이 있어요. 촬영 설정은 ${p.slowmo === 'unknown' ? '모름' : `${p.slowmo}fps`}(직접 선택)으로 보내요.`
    : up.fpsWarn;
  return (
    <>
      <Title title="분석 전 확인" c={c} />
      <SectionHead title="분석할 영상" action="수정" onAction={p.onEditVideos} c={c} />
      <View style={{ flexDirection: 'row', gap: 12 }}>
        {LAB_VIEWS.map((v) => {
          const x = up.picked[v];
          return (
            <View key={v} style={[st.card, { flex: 1, backgroundColor: c.card, boxShadow: c.float, gap: 8, padding: 10 }]}>
              <View style={[st.reviewThumb, { backgroundColor: c.skyTint }]}>
                {x?.thumb ? <Image source={x.thumb} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Icon name="film" size={22} color={c.muted} />}
              </View>
              <Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>{v === 'side' ? '옆 영상' : '뒤 영상'}</Text>
              <Text style={[TYPE.sub, { color: c.muted }]}>
                {[fmtSec(x?.info.durationSec ?? x?.cap.durationSec ?? null), fpsText(x) ?? '프레임 확인 안 됨'].filter(Boolean).join(' · ')}
              </Text>
            </View>
          );
        })}
      </View>
      {frameNote ? <Text style={[TYPE.sub, { color: c.warn }]}>{frameNote}</Text> : null}
      <SectionHead title="이번 투구" action="수정" onAction={p.onEditInfo} c={c} />
      <View style={[st.card, { backgroundColor: c.card, boxShadow: c.float, flexDirection: 'row' }]}>
        {(
          [
            ['던진 곳', p.ground === 'flat' ? '평지' : '마운드'],
            ['던지는 손', p.hand === 'L' ? '왼손' : '오른손'],
            ['키', p.heightNum ? `${p.heightNum}cm` : '미입력'],
          ] as const
        ).map(([k, v], i) => (
          <View key={k} style={[{ flex: 1, gap: 4 }, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: c.line, paddingLeft: 12 }]}>
            <Text style={[TYPE.sub, { color: c.muted }]}>{k}</Text>
            <Text style={[TYPE.card, { color: v === '미입력' ? c.muted : c.ink }]}>{v}</Text>
          </View>
        ))}
      </View>
      {p.mode === 'stored' ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="국외 이전 동의 완료, 내역 보기"
          onPress={() => router.push('/lab/consent' as Href)}
          style={({ pressed }) => [st.card, st.consentRow, { backgroundColor: c.card, boxShadow: c.float, opacity: pressed ? 0.7 : 1 }]}
        >
          <View style={[st.consentIcon, { backgroundColor: c.skyTint }]}>
            <Icon name="shield" size={18} color={c.sky} />
          </View>
          <Text style={[TYPE.body, { color: c.ink, fontWeight: '600', flex: 1 }]}>동의 완료</Text>
          <Text style={[TYPE.sub, { color: c.muted }]}>내역 보기</Text>
          <Icon name="chevron-right" size={14} color={c.muted} />
        </Pressable>
      ) : p.mode === 'need' ? (
        <View style={[st.card, st.consentRow, { backgroundColor: c.card, boxShadow: c.float }]}>
          <View style={[st.consentIcon, { backgroundColor: c.warnBg }]}>
            <Icon name="shield" size={18} color={c.warn} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>국외 이전 동의가 필요해요</Text>
            <Text style={[TYPE.sub, { color: c.muted }]}>
              {p.consent?.state.outdated ? '동의 내용이 바뀌어 다시 확인이 필요해요.' : '분석을 시작하기 전에 한 번 확인해요.'}
            </Text>
          </View>
        </View>
      ) : p.mode === 'attest' ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: p.attest }}
          onPress={() => p.setAttest(!p.attest)}
          style={[st.card, { backgroundColor: c.card, boxShadow: c.float, flexDirection: 'row', gap: 12, alignItems: 'flex-start' }]}
        >
          <View
            style={[
              st.box,
              { borderColor: p.attestNeed ? c.danger : p.attest ? c.sky : c.lineStrong, backgroundColor: p.attest ? c.sky : 'transparent' },
            ]}
          >
            {p.attest ? <Icon name="check" size={12} color="#fff" /> : null}
          </View>
          <Text style={[TYPE.body, { flex: 1, color: p.attestNeed ? c.danger : c.ink }]}>{CONSENT_TEXT}</Text>
        </Pressable>
      ) : (
        <ActivityIndicator color={c.muted} />
      )}
    </>
  );
}

function SectionHead({ title, action, onAction, c }: { title: string; action: string; onAction: () => void; c: Palette }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
      <Text accessibilityRole="header" style={[TYPE.card, { color: c.ink, flex: 1 }]}>
        {title}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel={`${title} ${action}`} onPress={onAction} hitSlop={8} style={st.smallLink}>
        <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>{action}</Text>
      </Pressable>
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 4 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  cta: { minHeight: 52, borderRadius: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  slot: { borderRadius: 22, padding: 14, gap: 12, borderWidth: 1.5 },
  thumb: { width: 76, height: 76, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  playDot: { position: 'absolute', right: 6, bottom: 6, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  empty: { minHeight: 88, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 6 },
  smallLink: { minHeight: 32, justifyContent: 'center' },
  linkBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44 },
  notice: { borderRadius: 14, padding: 12, gap: 4 },
  card: { borderRadius: 20, padding: 14 },
  miniThumb: { width: 36, height: 36, borderRadius: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  groundCard: { flex: 1, minHeight: 120, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14 },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52 },
  reviewThumb: { aspectRatio: 4 / 3, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  consentRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60 },
  consentIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  box: { width: 22, height: 22, borderRadius: 6, marginTop: 1, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
});
