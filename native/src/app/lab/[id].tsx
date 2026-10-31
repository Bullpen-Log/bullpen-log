import * as Haptics from 'expo-haptics';
import { ScrollLockScope } from '~/shell/scroll-lock';
import { SymbolView } from 'expo-symbols';
import { Icon } from '~/shell/icon';
import { type Href, router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useEventListener } from 'expo';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
  type ScrollViewInstance,
} from 'react-native';
import type { ReportItem } from '@/lib/pitch-3d/v2/report';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppAnalysisConsent } from '@/app/actions/analysis-consent';
import type { AppLabDetail } from '@/app/actions/pitch-lab';
import { CONSENT_TEXT } from '@/lib/pitch-3d/v2/lab-summary';
import { followTick, sourceTimesAt } from '@/lib/pitch-3d/v2/video-sync';
import type { LabShifts } from '@/lib/pitch-lab-meta';
import { useLoad } from '~/community/parts';
import { Lab3D, type Lab3DHandle, type LabTransport } from '~/lab/lab-3d';
import { GuideLink } from '~/lab/parts';
import { LabProgress, type LabAction, type LabPhase } from '~/lab/progress';
import { CompareCard, ElementGrid, KeyFinding, RxCard, STAGE_BG } from '~/lab/report';
import { rpc, RpcError } from '~/lib/rpc';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { leaveTo } from '~/shell/web-nav';
import { toast } from '~/shell/toast';
import { Segmented } from '~/shell/heading';
import { READABLE_WIDE, TwoColumns } from '~/lib/layout';

/**
 * 3D 동작 분석 — 한 투구의 진행과 결과(앱 화면, 2026-10-29 확정 시안 analysis-progress · analysis-results).
 *
 * 보여 줄 결과가 없으면 진행 화면(~/lab/progress): 분석 전 · 대기 · 분석 중 · 지연 · 연결 확인 불가 · 완료 · 실패를 서버 작업 상태로 그린다.
 * 화면이 보이고 앱이 앞에 있는 동안 5초마다, 그리고 돌아올 때(화면 · 앱) 바로 checkPitch3dV2 를 부른다. 답은 지금 작업 번호와 견줘 다른 작업의 늦은 답을
 * 버린다. 묻기 실패는 분석 실패가 아니다(마지막 상태를 두고 '상태 다시 확인'). 끝나도 결과로 저절로 넘기지 않는다 — '결과 보기'를 누를 때.
 *
 * 결과가 있으면 차례(시안 결과 최신본): 머리(촬영 정보 · 이번 한 구 기준) → 핵심 결과(KeyFinding) → 3D → 원본과 비교 → 요소별 분석(2열 고르기 카드) →
 * 추천 훈련 또는 다음 행동 → 지난번과 견주기 → 분석 상세. 3D 칸만 사이트 app/embed/lab/[id] 웹뷰(~/lab/lab-3d.tsx) — 판정 · 숫자는 서버 loadAppLabDetail.
 *
 * 원본은 처음엔 하나도 만들지 않는다(재생기 · 받기 · 시계 맞추기 0). '원본과 비교'를 누르면 고른 쪽(옆 또는 뒤) 하나만 붙이고, 바꾸면 앞의 것을 떼고
 * 새 것을 붙인다(재생기는 컴포넌트와 함께 풀린다 — useVideoPlayer). 붙은 재생기는 3D 시계를 따라간다(lib/pitch-3d/v2/video-sync.ts followTick — 재생 중엔
 * 빠르기를 맞추고 크게 벌어질 때만 옮긴다). 새로 붙은 원본은 준비되면 마지막 3D 시각 · 빠르기로 선다. 3D 를 못 불러오면 '원본으로 확인'으로 원본 하나를
 * 손으로 재생 · 탐색할 수 있다(재생기 기본 조작). 3D 다시 불러오기는 웹뷰만 다시 연다 — 분석을 다시 걸지 않는다.
 */
type LoadResult = AppLabDetail | { ok: false; to: string };
type SourceView = AppLabDetail['videos'][number]['view'];
type ConsentLoaded = AppAnalysisConsent | { ok: false; to: string };
type LiveJob = { id: string; status: 'queued' | 'running' | 'done' | 'failed'; requestedAt: string };

/** 이만큼 지나도 끝나지 않으면 '오래 걸리고 있어요'(보장 시간이 아니다 — 15분이 지나면 서버가 시간 초과로 돌린다, GPU 를 멈추는 것은 아니다) */
const DELAY_MS = 5 * 60_000;
const POLL_MS = 5_000;

export default function LabScreen() {
  const c = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<AppLabDetail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    if (typeof id !== 'string') return;
    let alive = true;
    rpc<LoadResult>('pitch-lab.loadAppLabDetail', { id }).then(
      (r) => {
        if (!alive) return;
        if (!r.ok) return leaveTo(r.to);
        setData(r);
        setFailed(null);
      },
      (e: unknown) => {
        if (!alive) return;
        if (e instanceof RpcError && e.code === 'redirect') return leaveTo(e.to ?? '/login');
        setFailed(e instanceof RpcError && e.code === 'update' ? '앱을 업데이트해 주세요.' : '신호가 약해 결과를 불러오지 못했어요.');
      }
    );
    return () => {
      alive = false;
    };
  }, [id, tries]);
  const reload = useCallback(() => setTries((n) => n + 1), []);

  /* ── 작업 상태 묻기 ── */
  const job = data?.job ?? null;
  const [live, setLive] = useState<LiveJob | null>(null);
  const [offline, setOffline] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const fails = useRef(0);
  const cur: LiveJob | null = job ? (live && live.id === job.id ? live : { id: job.id, status: job.status, requestedAt: job.requestedAt }) : null;
  const active = cur != null && (cur.status === 'queued' || cur.status === 'running') && (job?.active ?? false);
  const jobId = job?.id ?? null;
  const ask = useCallback(() => {
    if (typeof id !== 'string' || !jobId) return;
    rpc<{ job: { jobId: string; status: LiveJob['status']; requestedAt: string } | null } | { error: string }>('pitch-lab.checkPitch3dV2', { id }).then(
      (r) => {
        setNow(Date.now());
        if (!('job' in r)) {
          fails.current += 1;
          if (fails.current >= 2) setOffline(true);
          return;
        }
        fails.current = 0;
        setOffline(false);
        const j = r.job;
        if (!j) return;
        /* 다른 작업의 답 — 더 새 작업이면(다른 기기에서 다시 걸었다) 화면을 다시 읽고, 옛 작업이면 버린다 */
        if (j.jobId !== jobId) {
          if (Date.parse(j.requestedAt) > Date.parse(job?.requestedAt ?? '')) reload();
          return;
        }
        setLive({ id: j.jobId, status: j.status, requestedAt: j.requestedAt });
        /* 실패는 까닭(영상 탓인지 등)을 서버 화면 값으로 — 다시 읽는다. 완료는 '결과 보기'를 누를 때 */
        if (j.status === 'failed') reload();
        if (j.status === 'done' && data?.result) toast('다시 분석이 끝났어요');
      },
      () => {
        setNow(Date.now());
        fails.current += 1;
        if (fails.current >= 2) setOffline(true);
      }
    );
  }, [id, jobId, job?.requestedAt, reload, data?.result]);
  /* 보이는 동안 · 앱이 앞에 있는 동안만, 돌아오면 바로 한 번 */
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, [])
  );
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => setForeground(st === 'active'));
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (!active || !focused || !foreground) return;
    ask();
    const timer = setInterval(ask, POLL_MS);
    return () => clearInterval(timer);
  }, [active, focused, foreground, ask]);

  if (!data)
    return (
      <View style={[s.fill, { backgroundColor: c.page }]}>
        <Header c={c} title="3D 동작 분석" />
        <View style={[s.fill, s.centerBox]}>
          {failed ? (
            <>
              <Text style={[s.body, s.center, { color: c.ink }]}>{failed}</Text>
              <Pressable onPress={reload} accessibilityRole="button" style={[s.pill, { backgroundColor: c.action }]}>
                <Text style={[s.bodyBold, { color: '#fff' }]}>다시 불러오기</Text>
              </Pressable>
            </>
          ) : (
            <ActivityIndicator />
          )}
        </View>
      </View>
    );

  /* 결과가 있으면 결과(다시 분석 중이면 위에 표시), 없으면 진행 */
  if (!data.result)
    return (
      <View style={[s.fill, { backgroundColor: c.page }]}>
        <Header c={c} title="3D 동작 분석" />
        <ProgressView
          c={c}
          data={data}
          cur={cur}
          active={active}
          offline={offline}
          delayed={active && now - Date.parse(cur!.requestedAt) > DELAY_MS}
          onRecheck={ask}
          onShowResult={reload}
          onStarted={reload}
        />
      </View>
    );
  return <ResultView c={c} data={data} active={active} doneAgain={live?.status === 'done' && live.id === jobId && data.shown !== jobId} onReload={reload} />;
}

function Header({ c, title }: { c: Palette; title: string }) {
  const inset = useSafeAreaInsets();
  return (
    <View style={[s.header, { paddingTop: inset.top + 4, backgroundColor: c.page, borderBottomColor: c.line }]}>
      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/lab' as Href))} accessibilityRole="button" accessibilityLabel="뒤로" style={s.iconBtn}>
        <Icon name="chevron-left" size={20} color={c.link} />
      </Pressable>
      <Text accessibilityRole="header" numberOfLines={1} style={[s.headTitle, { color: c.ink }]}>
        {title}
      </Text>
      <View style={s.iconBtn} />
    </View>
  );
}

/** 국외 이전 동의 방식(app/lab/new.tsx 와 같은 판단) — 관리자 · 문서 확정 전은 요청마다 확인, 확정이면 서버에 남은 동의 */
function useConsentMode() {
  const cs = useLoad<ConsentLoaded>('analysis-consent.loadAppAnalysisConsent');
  const d = cs.data && cs.data.ok ? cs.data : null;
  const mode: 'attest' | 'stored' | 'need' | 'loading' = !d ? 'loading' : d.staff || !d.ready ? 'attest' : d.state.valid ? 'stored' : 'need';
  return { mode, consent: d };
}

const headOf = (data: AppLabDetail) =>
  [
    data.title,
    data.capture ? (data.capture.ground === 'flat' ? '평지' : '마운드') : null,
    data.capture ? (data.capture.hand === 'L' ? '왼손' : '오른손') : null,
  ]
    .filter(Boolean)
    .join(' · ');

function infoOf(data: AppLabDetail, consent: string): [string, string][] {
  const cap = data.capture;
  const file = (v: 'side' | 'back') => {
    const f = cap?.files.find((x) => x.view === v);
    return f ? [f.name || null, f.sec != null ? `${f.sec.toFixed(1)}초` : null, f.mb != null ? `${f.mb}MB` : null].filter(Boolean).join(' · ') || '올림' : '올림';
  };
  return [
    ['옆 영상', file('side')],
    ['뒤 영상', file('back')],
    ['던진 곳', cap ? (cap.ground === 'flat' ? '평지' : '마운드') : '모름'],
    ['던지는 손', cap ? (cap.hand === 'L' ? '왼손' : '오른손') : '모름'],
    ['키', cap?.heightCm ? `${cap.heightCm}cm` : '미입력'],
    ['슬로 모션', cap?.slowmoFps ? `${cap.slowmoFps}fps(촬영 설정)` : '모름'],
    ['동의', consent],
  ];
}

/* ───────────────────────────── 진행 ───────────────────────────── */

function ProgressView({
  c,
  data,
  cur,
  active,
  offline,
  delayed,
  onRecheck,
  onShowResult,
  onStarted,
}: {
  c: Palette;
  data: AppLabDetail;
  cur: LiveJob | null;
  active: boolean;
  offline: boolean;
  delayed: boolean;
  onRecheck: () => void;
  onShowResult: () => void;
  onStarted: () => void;
}) {
  const { mode, consent } = useConsentMode();
  const [attest, setAttest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<{ text: string; need: boolean } | null>(null);
  const job = data.job ?? null;
  const fail = job?.status === 'failed' ? job.fail : null;
  const was = cur?.status === 'running' ? 'running' : 'queued';
  const phase: LabPhase =
    cur?.status === 'done'
      ? { kind: 'done' }
      : active
        ? offline
          ? { kind: 'offline', was }
          : delayed
            ? { kind: 'delayed', was }
            : { kind: was }
        : fail
          ? { kind: 'failed', reason: fail.reason, video: fail.kind === 'video' }
          : err
            ? { kind: 'request-failed', reason: err.text }
            : job && (job.status === 'queued' || job.status === 'running')
              ? /* 15분이 지났는데 서버가 아직 시간 초과로 안 돌림 — 다음 물음이 돌린다 */ { kind: 'delayed', was }
              : { kind: 'request-failed', reason: data.request.enabled ? '아직 분석을 시작하지 않았어요. 영상은 저장돼 있어요.' : '옆 · 뒤 영상이 다 있어야 분석할 수 있어요.' };
  const canRequest = data.request.enabled && !active && (phase.kind === 'request-failed' || (phase.kind === 'failed' && !phase.video));
  const request = () => {
    if (mode === 'need') return router.push('/lab/consent?from=new' as Href);
    if (mode === 'attest' && !attest) return setErr({ text: '아래 동의를 확인해 주세요.', need: false });
    setBusy(true);
    setErr(null);
    void rpc<{ job: unknown } | { error: string; need?: 'consent' }>('pitch-lab.requestPitch3dV2', { id: data.id, consent: true })
      .then(
        (r) => {
          if ('error' in r) return setErr({ text: r.error, need: r.need === 'consent' });
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onStarted();
        },
        /* 답이 끊겼다 — 접수됐는지 먼저 다시 읽는다(새로 걸지 않는다) */
        () => onStarted()
      )
      .then(() => setBusy(false));
  };
  const primary: LabAction | null =
    phase.kind === 'done'
      ? { label: '결과 보기', onPress: onShowResult }
      : phase.kind === 'offline'
        ? { label: '상태 다시 확인', onPress: onRecheck }
        : phase.kind === 'queued' || phase.kind === 'running' || phase.kind === 'delayed'
          ? { label: '다른 화면 보기', onPress: () => (router.canGoBack() ? router.back() : router.replace('/lab' as Href)) }
          : phase.kind === 'failed' && phase.video
            ? { label: '영상 다시 고르기', onPress: () => router.replace('/lab/new' as Href) }
            : canRequest
              ? err?.need || mode === 'need'
                ? { label: '동의하고 계속', onPress: () => router.push('/lab/consent?from=new' as Href) }
                : { label: phase.kind === 'failed' ? '분석 다시 요청' : '분석 시작', onPress: request, busy }
              : null;
  const secondary: LabAction | null =
    phase.kind === 'failed' || phase.kind === 'request-failed' || phase.kind === 'offline' ? { label: '목록으로', onPress: () => router.replace('/lab' as Href) } : null;
  const consentText =
    mode === 'stored' && consent?.state.current
      ? '동의 완료'
      : mode === 'need'
        ? '동의 필요'
        : '요청할 때 확인';
  return (
    <LabProgress
      c={c}
      phase={phase}
      head={headOf(data)}
      info={infoOf(data, consentText)}
      primary={primary}
      secondary={secondary}
      note={
        phase.kind === 'queued' || phase.kind === 'running' || phase.kind === 'delayed'
          ? '화면을 나가도 분석은 계속돼요. 끝나면 목록에서 볼 수 있어요.'
          : phase.kind === 'offline'
            ? '연결을 확인하면 이어서 상태를 받아요. 분석 요청을 새로 만들지 않아요.'
            : null
      }
      extra={
        <>
          {phase.kind === 'failed' && phase.video && data.request.fix ? (
            <View style={[s.notice, { backgroundColor: c.card, borderColor: c.line, flexDirection: 'column', alignItems: 'flex-start', gap: 4 }]}>
              <Text style={[s.small, { color: c.ink }]}>{data.request.fix}</Text>
              {data.request.fixSection ? <GuideLink label="촬영 안내 보기 ›" section={data.request.fixSection} hand={data.capture?.hand ?? 'R'} c={c} /> : null}
            </View>
          ) : null}
          {canRequest && mode === 'attest' ? <AttestBox checked={attest} onChange={setAttest} c={c} /> : null}
        </>
      }
    />
  );
}

function AttestBox({ checked, onChange, c }: { checked: boolean; onChange: (v: boolean) => void; c: Palette }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => onChange(!checked)}
      style={[s.notice, { backgroundColor: c.card, borderColor: c.line, alignItems: 'flex-start' }]}
    >
      <View style={{ width: 22, height: 22, borderRadius: 6, marginTop: 1, borderWidth: 2, borderColor: checked ? c.sky : c.lineStrong, backgroundColor: checked ? c.sky : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {checked ? <Icon name="check" size={12} color="#fff" /> : null}
      </View>
      <Text style={[s.small, { flex: 1, color: c.ink, lineHeight: 20 }]}>{CONSENT_TEXT}</Text>
    </Pressable>
  );
}

/* ───────────────────────────── 결과 ───────────────────────────── */

function ResultView({ c, data, active, doneAgain, onReload }: { c: Palette; data: AppLabDetail; active: boolean; doneAgain: boolean; onReload: () => void }) {
  const inset = useSafeAreaInsets();
  /* 3D 칸(높이 = 폭 × 1.25 + 조작부)이 화면 높이의 절반을 넘지 않게 — 결론과 3D 가 같이 읽히게 */
  const { height: winH } = useWindowDimensions();
  const stageMax = Math.max(260, Math.min((winH - inset.top - 56 - 132 - 40) / 1.25, (winH * 0.5) / 1.25));
  const scroll = useRef<ScrollViewInstance>(null);
  const content = useRef<ComponentRef<typeof View>>(null);
  const stage = useRef<ComponentRef<typeof View>>(null);
  const lab = useRef<Lab3DHandle>(null);
  const r = data.result!;
  const report = r.report;

  /* ── 원본 비교: 하나만 ── */
  const sources = data.videos.filter((v) => v.url);
  const [compare, setCompare] = useState<SourceView | null>(null);
  const [viewerFailed, setViewerFailed] = useState(false);
  /* 지금 붙은 원본 재생기 하나 */
  const active1 = useRef<{ view: SourceView; p: VideoPlayer } | null>(null);
  const seekedAt = useRef(0);
  /* 마지막 3D 시계 — 새로 붙은 원본이 준비되면 여기에 선다 */
  const lastT = useRef<LabTransport | null>(null);
  /* 3D 없이 원본에서 장면 보기 — 붙자마자 설 시각 */
  const pending = useRef<number | null>(null);
  const shifts = useRef<LabShifts | null>(null);
  const register = useCallback((view: SourceView, p: VideoPlayer | null) => {
    if (p) active1.current = { view, p };
    else if (active1.current?.view === view) active1.current = null;
  }, []);
  const onTransport = useCallback((t: LabTransport) => {
    lastT.current = t;
    const a = active1.current;
    if (!a) return;
    const want = t[a.view];
    if (want == null || !Number.isFinite(want)) return;
    const p = a.p;
    if (t.reason === 'tick') {
      const nowMs = Date.now();
      const step = followTick({ time: p.currentTime, rate: p.playbackRate, ready: p.status === 'readyToPlay', sinceSeekS: (nowMs - seekedAt.current) / 1000 }, want, t.speed);
      if (step.seek != null) {
        p.currentTime = step.seek;
        seekedAt.current = nowMs;
      }
      if (step.rate != null) p.playbackRate = step.rate;
      return;
    }
    p.playbackRate = t.speed;
    if (t.playing) {
      if (Math.abs(p.currentTime - want) > 0.02) p.currentTime = want;
      p.play();
    } else {
      p.pause();
      p.currentTime = want;
    }
  }, []);
  /* 새 원본이 준비됐다 — 3D 가 있으면 마지막 3D 시각 · 빠르기 · 재생으로, 없으면 장면 보기로 맡긴 시각에 */
  const onSourceReady = useCallback((view: SourceView, p: VideoPlayer) => {
    if (active1.current?.p !== p) return;
    if (pending.current != null) {
      p.currentTime = pending.current;
      pending.current = null;
      return;
    }
    const t = lastT.current;
    const want = t?.[view];
    if (!t || want == null || !Number.isFinite(want)) return;
    p.playbackRate = t.speed;
    p.currentTime = want;
    seekedAt.current = Date.now();
    if (t.playing) p.play();
  }, []);
  const ensureShifts = useCallback(async () => {
    if (shifts.current) return shifts.current;
    const got = await rpc<LabShifts>('pitch-lab.loadLabVideoShifts', { id: data.id }).catch(() => ({ side: 0, back: 0 }) as LabShifts);
    shifts.current = got;
    return got;
  }, [data.id]);
  const openCompare = (view: SourceView) => {
    setCompare(view);
    if (view === 'side' || view === 'back') lab.current?.view(view);
  };

  /* 3D(→ 원본)를 그 장면에 세우고 무대가 보이게 */
  const scrollTo = (el: ComponentRef<typeof View> | null) => {
    const box = content.current;
    if (!el || !box) return;
    void AccessibilityInfo.isReduceMotionEnabled().then((calm) =>
      el.measureLayout(box as never, (_x, y) => scroll.current?.scrollTo({ y: Math.max(0, y - 12), animated: !calm }), () => undefined)
    );
  };
  const jump = (frame: number | null, move = true) => {
    if (frame == null) return;
    if (!viewerFailed) {
      lab.current?.seek(frame);
      if (move) scrollTo(stage.current);
      return;
    }
    /* 3D 없이 — 원본에서 그 장면(옆 · 뒤 시각은 같은 장면의 원본 시각 + 편집 목록 앞머리) */
    const sync = data.sync;
    if (!sync || frame >= sync.t.length) return;
    void ensureShifts().then((sh) => {
      const src = sourceTimesAt(sync.t, sync.tBack, sync.t[frame]);
      const view = compare === 'back' ? 'back' : 'side';
      const at = Math.max(0, (view === 'back' ? src.back : src.side) + (sh[view] ?? 0));
      const a = active1.current;
      if (a && a.view === view && a.p.status === 'readyToPlay') {
        a.p.pause();
        a.p.currentTime = at;
      } else {
        pending.current = at;
        if (compare == null) setCompare(view);
      }
      if (move) scrollTo(stage.current);
    });
  };
  const onScene = (it: ReportItem) => jump(it.frame);

  /* 원본 보기 버튼 — 3D 가 있으면 '원본과 비교', 없으면 '원본으로 확인' */
  const compareBlock =
    sources.length === 0 ? null : compare == null ? (
      <Pressable
        accessibilityRole="button"
        onPress={() => {
          void Haptics.selectionAsync();
          if (viewerFailed) void ensureShifts();
          openCompare('side');
        }}
        style={({ pressed }) => [s.compareBtn, { backgroundColor: c.card, boxShadow: c.float, opacity: pressed ? 0.75 : 1 }]}
      >
        <Icon name="film" size={18} color={c.sky} />
        <Text style={[s.bodyBold, { color: c.ink }]}>{viewerFailed ? '원본으로 확인' : '원본과 비교'}</Text>
      </Pressable>
    ) : (
      <View style={[s.compareBox, { backgroundColor: c.card, boxShadow: c.float }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Segmented
              label="원본 방향"
              value={compare}
              onChange={(v) => {
                void Haptics.selectionAsync();
                openCompare(v);
              }}
              options={sources.map((v) => ({ value: v.view, label: v.view === 'side' ? '옆 영상' : v.view === 'back' ? '뒤 영상' : v.label }))}
            />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="비교 닫기" onPress={() => setCompare(null)} hitSlop={6} style={s.iconBtn}>
            <Icon name="x" size={20} color={c.muted} />
          </Pressable>
        </View>
        {(() => {
          const v = sources.find((x) => x.view === compare);
          return v?.url ? (
            <SourceVideo key={v.view} uri={v.url} view={v.view} manual={viewerFailed} onPlayer={register} onReady={onSourceReady} />
          ) : null;
        })()}
        <Text style={[s.small, { color: c.muted }]}>
          {viewerFailed ? '3D 없이 원본만 보고 있어요. 재생 · 멈춤 · 탐색 · 속도는 영상 조작으로 바꿔요.' : '3D와 같은 순간 · 같은 속도로 따라가요. 한 번에 원본 하나만 열어요.'}
        </Text>
      </View>
    );

  /* 머리는 투구 이름(올린 때), 밑줄에 찍은 때 · 촬영 조건 · '이번 한 구 기준' */
  const sub = [data.when, report.ground === 'flat' ? '평지' : '마운드', report.hand === 'L' ? '왼손' : '오른손', '이번 한 구 기준'].filter(Boolean).join(' · ');
  return (
    <View style={[s.fill, { backgroundColor: c.page }]}>
      {/* 왼쪽 끝에서 3D 를 돌리면 아이폰 '뒤로 쓸기'가 먼저 잡아 화면이 넘어갔다(2026-10-21 김민) — 이 화면은 쓸어 닫기를 끈다(‹ 단추로 나감) */}
      <Stack.Screen options={{ gestureEnabled: false }} />
      <Header c={c} title="분석 결과" />
      <ScrollLockScope>
        {(scrollEnabled) => (
          <ScrollView ref={scroll} innerViewRef={content} scrollEnabled={scrollEnabled} contentContainerStyle={[{ padding: 16, paddingBottom: inset.bottom + 32, gap: 20 }, READABLE_WIDE]}>
            <View style={{ gap: 4 }}>
              <Text style={[TYPE.section, { color: c.ink }]}>{data.title}</Text>
              <Text style={[s.small, { color: c.muted }]}>{sub}</Text>
              {r.handNote ? <Text style={[s.small, { color: c.muted }]}>{r.handNote}</Text> : null}
            </View>
            {doneAgain ? (
              <Pressable onPress={onReload} accessibilityRole="button" style={[s.notice, { backgroundColor: c.skyTint, borderColor: c.line }]}>
                <Text style={[s.small, { flex: 1, color: c.ink }]}>다시 분석이 끝났어요. 지금 보이는 건 이전 결과예요.</Text>
                <Text style={[s.smallBold, { color: c.link }]}>새 결과 보기</Text>
              </Pressable>
            ) : data.waiting && !data.waiting.active ? (
              <View style={[s.notice, { backgroundColor: c.warnBg, borderColor: c.line }]} accessibilityLiveRegion="polite">
                <Text style={[s.small, { flex: 1, color: c.ink }]}>다시 분석이 안 됐어요. {data.waiting.title} 지금 보이는 건 이전 결과예요.</Text>
              </View>
            ) : null}
            <TwoColumns
              left={(boxW) => (
                <View style={{ gap: 12 }}>
                  <KeyFinding c={c} report={report} onScene={onScene} />
                  <Text accessibilityRole="header" style={[TYPE.card, { color: c.ink, marginTop: 8, paddingHorizontal: 4 }]}>
                    3D 동작
                  </Text>
                  <View ref={stage} accessibilityLabel="3D 동작" style={[s.stage, { backgroundColor: STAGE_BG }]}>
                    <View style={{ width: Math.min(boxW - 20, stageMax), alignSelf: 'center' }}>
                      {/* 다시 분석이 끝나 새 결과로 바뀔 때만 새로 연다(key) — 원본을 여닫거나 요소를 골라도 그대로 */}
                      <Lab3D
                        key={data.shown ?? ''}
                        ref={lab}
                        id={data.id}
                        width={Math.min(boxW - 20, stageMax)}
                        bg={STAGE_BG}
                        onTransport={onTransport}
                        onFailed={setViewerFailed}
                        stop={report.headline.frame}
                        dark
                      />
                      {active && data.waiting ? <Reanalyzing /> : null}
                    </View>
                  </View>
                  {compareBlock}
                </View>
              )}
              right={
                <>
                  <ElementGrid c={c} report={report} onPick={(it) => jump(it.frame, false)} onScene={onScene} />
                  <RxCard c={c} report={report} mine={r.mine} focus={r.focus} resultId={data.id} />
                  {r.previous ? <CompareCard c={c} prev={r.previous} /> : null}
                  <Details c={c} r={r} active={active} id={data.id} req={data.request} onJump={jump} onStarted={onReload} />
                </>
              }
            />
          </ScrollView>
        )}
      </ScrollLockScope>
    </View>
  );
}

/** 접힌 '분석 상세' — 측정값 · 오차 범위 · 엔진 · 다시 분석(첫 화면을 채우지 않게 맨 아래) */
function Details({
  c,
  r,
  active,
  id,
  req,
  onJump,
  onStarted,
}: {
  c: Palette;
  r: NonNullable<AppLabDetail['result']>;
  active: boolean;
  id: string;
  req: AppLabDetail['request'];
  onJump: (frame: number | null) => void;
  onStarted: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[s.list, { backgroundColor: c.card, boxShadow: c.float }]}>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [s.metric, pressed && { opacity: 0.6 }]}
      >
        <Text style={[s.bodyBold, { color: c.ink, flex: 1 }]}>분석 상세</Text>
        <Text style={[s.small, { color: c.muted }]}>{open ? '' : '측정값 · 범위 · 다시 분석'}</Text>
        <SymbolView name={open ? 'chevron.up' : 'chevron.down'} size={14} tintColor={c.muted} />
      </Pressable>
      {open && (
        <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 10 }}>
          {r.stale && !active && <Text style={[s.small, { color: c.ink }]}>엔진이 나아졌어요. 다시 분석하면 새 엔진으로 볼 수 있어요.</Text>}
          {active && <Text style={[s.small, { color: c.ink }]}>다시 분석 중이에요. 끝날 때까지 이전 결과를 보여 줘요.</Text>}
          {!active ? <RequestPanel id={id} req={req} onStarted={onStarted} c={c} /> : null}
          <Text style={[s.small, { color: c.muted }]}>3D 보기용 각도와 분석에 쓴 측정값은 다를 수 있어요. 아래는 분석에 쓴 값이에요. 누르면 그 순간으로 가요.</Text>
          <View>
            {r.rows.map((m, i) => (
              <Pressable
                key={m.key}
                onPress={() => {
                  void Haptics.selectionAsync();
                  onJump(m.frame);
                }}
                accessibilityRole="button"
                style={({ pressed }) => [s.metricRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }, pressed && { opacity: 0.6 }]}
              >
                <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                  <Text style={[s.body, { color: c.ink }]}>{m.label}</Text>
                  {m.experimental && <Tag c={c} text="실험" />}
                  {m.check && <Tag c={c} text="확인 필요" warn />}
                </View>
                <Text style={[s.numeric, { color: c.ink }]}>
                  {m.value}
                  {m.unit}
                  <Text style={[s.small, { color: c.muted }]}>
                    {' '}±{m.pm}
                    {m.unit}
                  </Text>
                </Text>
              </Pressable>
            ))}
          </View>
          {r.warnings && <Text style={[s.small, { color: c.warn }]}>두 영상 사이 각도 · 초점 · 장면 수 때문에 오차 범위를 넓힌 값이 있어요.</Text>}
          <Text style={[s.small, { color: c.muted }]}>{r.engineLine}</Text>
        </View>
      )}
    </View>
  );
}

/** 원본 하나 — 못 불러오면 그 사실과 다시 불러오기(가짜 그림으로 채우지 않는다). 다시 불러오면 재생기를 새로 만든다(key) */
function SourceVideo(props: {
  uri: string;
  view: SourceView;
  manual: boolean;
  onPlayer: (view: SourceView, p: VideoPlayer | null) => void;
  onReady: (view: SourceView, p: VideoPlayer) => void;
}) {
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  if (failed)
    return (
      <View style={[s.video, s.centerBox, { gap: 8, padding: 12 }]} accessibilityLiveRegion="polite">
        <Text style={[s.small, s.center, { color: '#c7cfdd' }]}>영상을 불러오지 못했어요.</Text>
        <Pressable
          onPress={() => {
            setFailed(false);
            setTries((n) => n + 1);
          }}
          accessibilityRole="button"
          style={[s.pill, { backgroundColor: 'rgba(255,255,255,0.14)' }]}
        >
          <Text style={[s.bodyBold, { color: '#fff' }]}>다시 불러오기</Text>
        </Pressable>
      </View>
    );
  return <SourcePlayer key={tries} {...props} onError={() => setFailed(true)} />;
}

function SourcePlayer({
  uri,
  view,
  manual,
  onPlayer,
  onReady,
  onError,
}: {
  uri: string;
  view: SourceView;
  /** 3D 가 없을 때 — 영상 기본 조작(재생 · 탐색 · 속도)을 켠다 */
  manual: boolean;
  onPlayer: (view: SourceView, p: VideoPlayer | null) => void;
  onReady: (view: SourceView, p: VideoPlayer) => void;
  onError: () => void;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.loop = false;
  });
  const [ready, setReady] = useState(false);
  const readyOnce = useRef(false);
  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'error') onError();
    if (status === 'readyToPlay') {
      setReady(true);
      if (!readyOnce.current) {
        readyOnce.current = true;
        onReady(view, player);
      }
    }
  });
  useEffect(() => {
    onPlayer(view, player);
    return () => onPlayer(view, null);
  }, [player, view, onPlayer]);
  return (
    <View style={s.video}>
      <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={manual} pointerEvents={manual ? 'auto' : 'none'} />
      {!ready ? (
        <View style={[StyleSheet.absoluteFill, s.centerBox]} pointerEvents="none">
          <ActivityIndicator color="#c7cfdd" />
          <Text style={[s.small, { color: '#9aa3b8' }]}>원본 영상을 불러오고 있어요.</Text>
        </View>
      ) : null}
    </View>
  );
}

/** 다시 분석 중 — 이전 결과(3D) 위를 덮는 판 */
function Reanalyzing() {
  return (
    <View style={[StyleSheet.absoluteFill, s.centerBox, { backgroundColor: 'rgba(21,23,34,0.82)' }]} accessibilityLiveRegion="polite">
      <ActivityIndicator color="#c7cfdd" />
      <Text style={[s.bodyBold, s.center, { color: '#e8eef7' }]}>다시 분석하고 있어요</Text>
      <Text style={[s.small, s.center, { color: '#9aa3b8' }]}>끝나면 알려 드려요. 지금 보이는 건 이전 결과예요.</Text>
    </View>
  );
}

/**
 * 다시 분석 걸기(분석 상세 안) — 동의 방식은 새 분석과 같다(useConsentMode). 영상 탓 실패면 고칠 것 한 줄 · '다른 영상으로 올리기'.
 * 검사 · 같은 영상 다시 막기 · 하루 실패 상한 · 동의 확인은 서버 requestPitch3dV2 가 한다.
 */
function RequestPanel({ id, req, onStarted, c }: { id: string; req: AppLabDetail['request']; onStarted: () => void; c: Palette }) {
  const { mode } = useConsentMode();
  const [attest, setAttest] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!req.enabled) return null;
  const submit = () => {
    if (mode === 'need') return router.push('/lab/consent?from=new' as Href);
    if (mode === 'attest' && !attest) return setError('동의를 확인해 주세요.');
    setError(null);
    setBusy(true);
    void rpc<{ job: unknown } | { error: string }>('pitch-lab.requestPitch3dV2', { id, consent: true })
      .then(
        (r) => {
          if ('error' in r) return setError(r.error);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          onStarted();
        },
        () => onStarted()
      )
      .then(() => setBusy(false));
  };
  return (
    <View style={{ gap: 10 }}>
      {req.fix ? <Text style={[s.small, { color: c.ink }]}>{req.fix}</Text> : null}
      {mode === 'attest' ? <AttestBox checked={attest} onChange={setAttest} c={c} /> : null}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {req.videoFault ? (
          <Pressable onPress={() => router.push('/lab/new' as Href)} accessibilityRole="button" style={[s.pill, { flex: 1, backgroundColor: c.page }]}>
            <Text style={[s.bodyBold, { color: c.ink, textAlign: 'center' }]}>다른 영상으로 분석</Text>
          </Pressable>
        ) : (
          <Pressable onPress={submit} disabled={busy || mode === 'loading'} accessibilityRole="button" style={[s.pill, { flex: 1, backgroundColor: c.page, opacity: busy ? 0.5 : 1 }]}>
            <Text style={[s.bodyBold, { color: c.ink, textAlign: 'center' }]}>{busy ? '보내는 중' : mode === 'need' ? '동의하고 다시 분석' : '다시 분석'}</Text>
          </Pressable>
        )}
      </View>
      {error ? <Text style={[s.smallBold, { color: c.danger }]}>{error}</Text> : null}
    </View>
  );
}

function Tag({ c, text, warn = false }: { c: Palette; text: string; warn?: boolean }) {
  return (
    <View style={[s.tag, { backgroundColor: warn ? c.warnBg : c.chip }]}>
      <Text style={[s.tagText, { color: warn ? c.warn : c.muted }]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  centerBox: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  center: { textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  headTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { fontSize: 15 },
  bodyBold: { fontSize: 15, fontWeight: '600' },
  small: { fontSize: 13, lineHeight: 18 },
  smallBold: { fontSize: 13, fontWeight: '600' },
  numeric: { fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
  pill: { minHeight: 44, paddingHorizontal: 20, borderRadius: 22, justifyContent: 'center' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  video: { width: '100%', aspectRatio: 4 / 5, maxHeight: 420, borderRadius: 14, backgroundColor: '#000', overflow: 'hidden' },
  stage: { borderRadius: 24, padding: 10, overflow: 'hidden' },
  compareBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 50, borderRadius: 25 },
  compareBox: { borderRadius: 22, padding: 12, gap: 10 },
  list: { borderRadius: 14, overflow: 'hidden' },
  metric: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 14, paddingVertical: 8 },
  metricRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingVertical: 6 },
  tag: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  tagText: { fontSize: 13 },
});

