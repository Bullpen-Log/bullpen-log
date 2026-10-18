import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AppLabDetail } from '@/app/actions/pitch-lab';
import { CONSENT_TEXT } from '@/lib/pitch-3d/v2/lab-summary';
import { Lab3D, type Lab3DHandle, type LabTransport } from '~/lab/lab-3d';
import { rpc, RpcError } from '~/lib/rpc';
import { usePalette, type Palette } from '~/lib/ui';
import { leaveTo } from '~/shell/web-nav';

/**
 * 3D 동작 분석 결과(앱 화면) — 웹 /videos/lab/[id](app/(app)/videos/lab/[id]/lab-detail.tsx)를 옮겼다(2026-10-18 김민: 길 B). 사이트의 결과 화면이
 * 앱(BullpenNative/8 부터)이면 이 화면을 띄운다(page.tsx → OpenNative). 둘레(제목 · 원본 영상 · 메커니즘 점검 · 숫자)는 앱이 그리고, 3D 칸만 사이트
 * app/embed/lab/[id] 를 웹뷰로(~/lab/lab-3d.tsx) — 웹과 같은 인형 부품 하나를 쓴다. 판정 · 숫자 · 이름은 웹과 같은 곳(lib/pitch-3d/v2/lab-summary.ts,
 * 서버 app/actions/pitch-lab.ts loadAppLabDetail).
 *
 * 원본 영상 두 칸은 3D 시계를 따라간다(웹과 같은 규칙): 멈춤 · 끌기 때 그 시각에 서고, 재생 때 같은 빠르기로 튼다.
 * 분석 걸기도 앱에서(판 9 — RequestPanel): 동의 글은 웹과 같은 한 곳(lab-summary CONSENT_TEXT), 비용 지키기 · 동의 확인은 서버 requestPitch3dV2.
 */
type LoadResult = AppLabDetail | { ok: false; to: string };

export default function LabScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<AppLabDetail | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const scroll = useRef<ScrollViewInstance>(null);
  const lab = useRef<Lab3DHandle>(null);

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

  /* 분석이 도는 동안 5초마다 서버에 묻고(웹 use-v2-analysis.ts 와 같다 — 서버가 GPU 에 상태를 물어 갱신), 끝나면 다시 읽는다 */
  const active = data?.waiting?.active === true;
  useEffect(() => {
    if (!active || typeof id !== 'string') return;
    const timer = setInterval(() => {
      rpc<{ job: { status: string } | null } | { error: string }>('pitch-lab.checkPitch3dV2', { id }).then(
        (r) => {
          if ('job' in r && r.job && r.job.status !== 'queued' && r.job.status !== 'running') setTries((n) => n + 1);
        },
        () => undefined
      );
    }, 5_000);
    return () => clearInterval(timer);
  }, [active, id]);

  const players = useRef<Partial<Record<'side' | 'back', VideoPlayer>>>({});
  const register = useCallback((view: 'side' | 'back', p: VideoPlayer | null) => {
    if (p) players.current[view] = p;
    else delete players.current[view];
  }, []);
  /* 원본 영상이 3D 시계를 따라간다(웹 lab-detail.tsx onTransport 와 같은 문턱) */
  const onTransport = useCallback((t: LabTransport) => {
    for (const view of ['side', 'back'] as const) {
      const p = players.current[view];
      if (!p) continue;
      const want = t[view];
      if (!Number.isFinite(want)) continue;
      if (t.reason === 'tick') {
        if (Math.abs(p.currentTime - want) > 0.25) p.currentTime = want;
        continue;
      }
      p.playbackRate = t.speed;
      if (t.playing) {
        if (Math.abs(p.currentTime - want) > 0.05) p.currentTime = want;
        p.play();
      } else {
        p.pause();
        p.currentTime = want;
      }
    }
  }, []);

  const jump = (frame: number | null) => {
    if (frame == null) return;
    void Haptics.selectionAsync();
    lab.current?.seek(frame);
    scroll.current?.scrollTo({ y: 0, animated: true });
  };

  const header = (
    <View style={[s.header, { paddingTop: inset.top + 4, backgroundColor: c.page, borderBottomColor: c.line }]}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="뒤로" style={s.iconBtn}>
        <SymbolView name="chevron.left" size={20} weight="semibold" tintColor={c.sky} />
      </Pressable>
      <Text accessibilityRole="header" numberOfLines={1} style={[s.headTitle, { color: c.ink }]}>
        3D 동작 분석
      </Text>
      <View style={s.iconBtn} />
    </View>
  );

  if (!data)
    return (
      <View style={[s.fill, { backgroundColor: c.page }]}>
        {header}
        <View style={[s.fill, s.centerBox]}>
          {failed ? (
            <>
              <Text style={[s.body, s.center, { color: c.ink }]}>{failed}</Text>
              <Pressable onPress={() => setTries((n) => n + 1)} accessibilityRole="button" style={[s.pill, { backgroundColor: c.sky }]}>
                <Text style={[s.bodyBold, { color: '#fff' }]}>다시 불러오기</Text>
              </Pressable>
            </>
          ) : (
            <ActivityIndicator />
          )}
        </View>
      </View>
    );

  const r = data.result;
  const boxW = width - 32;
  return (
    <View style={[s.fill, { backgroundColor: c.page }]}>
      {header}
      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, paddingBottom: inset.bottom + 32, gap: 20 }}>
        <View style={{ gap: 6 }}>
          <View style={s.row}>
            <Text style={[s.title, { color: c.ink }]}>{data.title}</Text>
            {data.status && <StatusPill c={c} status={data.status} />}
          </View>
          {data.chips.length > 0 && <Text style={[s.small, { color: c.muted }]}>{data.chips.join(' · ')}</Text>}
        </View>

        <View style={{ gap: 8 }}>
          {r?.handNote && <Text style={[s.small, { color: c.muted }]}>{r.handNote}</Text>}
          {r ? (
            <Lab3D ref={lab} id={data.id} width={boxW} bg={c.page} onTransport={onTransport} />
          ) : (
            data.waiting && <Waiting waiting={data.waiting} />
          )}
          {r?.stale && !active && (
            <View style={[s.notice, { backgroundColor: c.card, borderColor: c.line }]}>
              <Text style={[s.small, { color: c.ink, flex: 1 }]}>엔진이 나아졌어요. 다시 분석하면 새 엔진으로 볼 수 있어요.</Text>
            </View>
          )}
          {r && active && (
            <View style={[s.notice, { backgroundColor: c.card, borderColor: c.line }]}>
              <Text style={[s.small, { color: c.ink, flex: 1 }]}>다시 분석 중이에요. 끝날 때까지 이전 결과를 보여 줘요.</Text>
            </View>
          )}
          {!active && typeof id === 'string' && (
            <RequestPanel id={id} req={data.request} hasResult={!!r || !!data.status} onStarted={() => setTries((n) => n + 1)} c={c} />
          )}
        </View>

        <View style={{ gap: 8 }}>
          <Text style={[s.section, { color: c.ink }]}>원본 영상</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {data.videos.map((v) => (
              <View key={v.view} style={{ flex: 1, gap: 4 }}>
                <Text style={[s.small, { color: c.muted }]}>{v.label}</Text>
                {v.url ? (
                  <SourceVideo uri={v.url} view={v.view} onPlayer={register} />
                ) : (
                  <View style={[s.video, s.centerBox, { backgroundColor: c.chip }]}>
                    <Text style={[s.small, { color: c.muted }]}>영상 없음</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
          {r && <Text style={[s.small, { color: c.muted }]}>영상은 3D 를 따라가요. 멈추거나 끌면 같은 장면에 서요.</Text>}
        </View>

        {r && r.mech.items.length > 0 && <MechList c={c} mech={r.mech} onJump={jump} />}

        <View style={{ gap: 8 }}>
          <Text style={[s.section, { color: c.ink }]}>숫자</Text>
          {r ? (
            <>
              <Text style={[s.small, { color: c.muted }]}>숫자는 아직 참고용이에요. 누르면 그 순간으로 가요.</Text>
              <View style={[s.list, { backgroundColor: c.card }]}>
                {r.rows.map((m, i) => (
                  <Pressable
                    key={m.key}
                    onPress={() => jump(m.frame)}
                    accessibilityRole="button"
                    style={({ pressed }) => [s.metric, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }, pressed && { opacity: 0.6 }]}
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
              {r.warnings && (
                <Text style={[s.small, { color: c.warn }]}>두 영상 사이 각도 · 초점 · 장면 수 때문에 오차 범위를 넓힌 값이 있어요.</Text>
              )}
              <Text style={[s.small, { color: c.muted }]}>{r.engineLine}</Text>
            </>
          ) : (
            <Text style={[s.small, { color: c.muted }]}>결과가 나오면 여기에 지표가 와요.</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/** 원본 영상 하나 — 소리 없이, 손으로 틀지 않는다(3D 시계가 튼다) */
function SourceVideo({
  uri,
  view,
  onPlayer,
}: {
  uri: string;
  view: 'side' | 'back';
  /** 3D 시계가 부를 재생기를 화면에 알린다(없어지면 null) */
  onPlayer: (view: 'side' | 'back', p: VideoPlayer | null) => void;
}) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.loop = false;
  });
  useEffect(() => {
    onPlayer(view, player);
    return () => onPlayer(view, null);
  }, [player, view, onPlayer]);
  return <VideoView player={player} style={s.video} contentFit="contain" nativeControls={false} pointerEvents="none" />;
}

/** 결과가 없을 때 3D 칸 — 분석 전 · 기다림 · 실패(웹 V2EmptyWell 과 같은 말). 분석 걸기는 밑의 RequestPanel */
function Waiting({ waiting }: { waiting: NonNullable<AppLabDetail['waiting']> }) {
  return (
    <View style={[s.well]} accessibilityLiveRegion="polite">
      {waiting.active ? <ActivityIndicator color="#c7cfdd" /> : <SymbolView name="rotate.3d" size={26} tintColor="#8b93a7" />}
      <Text style={[s.bodyBold, s.center, { color: '#e8eef7' }]}>{waiting.title}</Text>
      {waiting.line && <Text style={[s.small, s.center, { color: '#9aa3b8' }]}>{waiting.line}</Text>}
    </View>
  );
}

/**
 * 분석 걸기 — 웹 analysis-v2.tsx V2RequestRow 와 같은 규칙: 동의 확인 + 단추, 영상 탓 실패면 고칠 것 한 줄 · '다른 영상으로 올리기' · '같은 영상으로 다시'.
 * 검사 · 같은 영상 다시 막기 · 하루 실패 10번 · 동의 확인은 서버 requestPitch3dV2(웹과 같은 동작)가 한다. 걸면 다시 읽어 기다림 칸 · 5초 묻기로 이어진다.
 */
function RequestPanel({ id, req, hasResult, onStarted, c }: { id: string; req: AppLabDetail['request']; hasResult: boolean; onStarted: () => void; c: Palette }) {
  const [consent, setConsent] = useState(false);
  const [need, setNeed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!req.enabled) return null;
  const submit = async () => {
    if (!consent) return setNeed(true);
    setNeed(false);
    setError(null);
    setBusy(true);
    try {
      const r = await rpc<{ job: unknown } | { error: string }>('pitch-lab.requestPitch3dV2', { id, consent: true });
      if ('error' in r) return setError(r.error);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onStarted();
    } catch {
      setError('신호가 약해 보내지 못했어요. 다시 해 주세요.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 10 }}>
      {req.fix ? (
        <View style={[s.notice, { backgroundColor: c.card, borderColor: c.line, flexDirection: 'column', alignItems: 'flex-start', gap: 4 }]}>
          <Text style={[s.small, { color: c.ink }]}>{req.fix}</Text>
          {req.fixSection ? (
            <Pressable onPress={() => router.push(`/lab/guide?s=${req.fixSection}` as Href)} accessibilityRole="link" hitSlop={6}>
              <Text style={[s.smallBold, { color: c.sky }]}>촬영 안내 보기 ›</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: consent, disabled: busy }}
        onPress={() => {
          setConsent((v) => !v);
          setNeed(false);
        }}
        style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}
      >
        <View style={{ width: 22, height: 22, borderRadius: 6, marginTop: 1, borderWidth: 2, borderColor: need ? c.danger : consent ? c.sky : c.line, backgroundColor: consent ? c.sky : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {consent ? <SymbolView name="checkmark" size={12} weight="bold" tintColor="#fff" /> : null}
        </View>
        <Text style={[s.small, { flex: 1, color: need ? c.danger : c.ink, lineHeight: 20 }]}>{CONSENT_TEXT}</Text>
      </Pressable>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {req.videoFault ? (
          <>
            <Pressable onPress={() => router.push('/lab' as Href)} accessibilityRole="button" style={[s.pill, { flex: 1, backgroundColor: c.card }]}>
              <Text style={[s.bodyBold, { color: c.ink }]}>다른 영상으로 올리기</Text>
            </Pressable>
            <Pressable onPress={() => void submit()} disabled={busy} accessibilityRole="button" style={[s.pill, { flex: 1, backgroundColor: c.card, opacity: busy ? 0.5 : 1 }]}>
              <Text style={[s.bodyBold, { color: c.ink }]}>{busy ? '거는 중' : '같은 영상으로 다시'}</Text>
            </Pressable>
          </>
        ) : (
          <Pressable onPress={() => void submit()} disabled={busy} accessibilityRole="button" style={[s.pill, { flex: 1, backgroundColor: c.sky, opacity: busy ? 0.5 : 1 }]}>
            <Text style={[s.bodyBold, { color: '#fff' }]}>{busy ? '거는 중' : hasResult ? '다시 분석' : '3D 분석(서버)'}</Text>
          </Pressable>
        )}
      </View>
      {error ? <Text style={[s.smallBold, { color: c.danger }]}>{error}</Text> : null}
    </View>
  );
}

type Mech = NonNullable<AppLabDetail['result']>['mech'];

/** 메커니즘 점검 — 겉은 한 줄, 누르면 숫자 · 그 순간 보기 · 쉬운 드릴 셋 · 그 요소 드릴 모두 보기(웹 mech-card.tsx 와 같다) */
function MechList({ c, mech, onJump }: { c: Palette; mech: Mech; onJump: (frame: number | null) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <View style={{ gap: 8 }}>
      <View style={[s.row, { alignItems: 'baseline' }]}>
        <Text style={[s.section, { color: c.ink }]}>메커니즘 점검</Text>
        {mech.tentative && <Text style={[s.small, { color: c.muted }]}>한 구만 봐서 참고용</Text>}
      </View>
      <View style={[s.list, { backgroundColor: c.card }]}>
        {mech.items.map((it, i) => {
          const isOpen = open === it.key;
          const improve = it.status === 'improve';
          return (
            <View key={it.key} style={i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }}>
              <Pressable
                onPress={() => setOpen(isOpen ? null : it.key)}
                accessibilityRole="button"
                accessibilityState={{ expanded: isOpen }}
                style={({ pressed }) => [s.mechHead, pressed && { opacity: 0.6 }]}
              >
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
                    <Text style={[s.bodyBold, { color: c.ink }]}>{it.title}</Text>
                    <Tag c={c} text={it.statusText} warn={improve} />
                  </View>
                  <Text style={[s.small, { color: c.muted }]}>{it.line}</Text>
                </View>
                <SymbolView name={isOpen ? 'chevron.up' : 'chevron.down'} size={14} tintColor={c.muted} />
              </Pressable>
              {isOpen && (
                <View style={s.mechBody}>
                  {it.detail ? <Text style={[s.small, { color: c.ink }]}>{it.detail}</Text> : null}
                  {it.frame != null && (
                    <Pressable onPress={() => onJump(it.frame)} accessibilityRole="button" hitSlop={8}>
                      <Text style={[s.smallBold, { color: c.sky }]}>그 순간 보기</Text>
                    </Pressable>
                  )}
                  {it.drills && (
                    <View style={{ gap: 4 }}>
                      <Text style={[s.small, { color: c.muted }]}>{improve ? '도움이 되는 드릴' : '함께 보면 좋은 드릴'}</Text>
                      {it.drills.items.map((d) => (
                        <View key={d.title} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          {d.stage && <Tag c={c} text={d.stage} />}
                          <Text style={[s.body, { color: c.ink, flexShrink: 1 }]}>{d.title}</Text>
                        </View>
                      ))}
                      {it.drills.elementKey && (
                        <Pressable
                          onPress={() => leaveTo(`/training?view=mechanics&tab=elements&el=${it.drills!.elementKey}`)}
                          accessibilityRole="link"
                          style={{ minHeight: 44, justifyContent: 'center' }}
                        >
                          <Text style={[s.smallBold, { color: c.sky }]}>
                            {it.focus} 드릴 {it.drills.count}개 모두 보기 ›
                          </Text>
                        </Pressable>
                      )}
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

function StatusPill({ c, status }: { c: Palette; status: NonNullable<AppLabDetail['status']> }) {
  const bg = status.tone === 'sky' ? `${c.sky}22` : status.tone === 'warn' ? c.warnBg : c.chip;
  const fg = status.tone === 'sky' ? c.sky : status.tone === 'warn' ? c.warn : c.muted;
  return (
    <View style={[s.tag, { backgroundColor: bg }]}>
      <Text style={[s.smallBold, { color: fg }]}>{status.text}</Text>
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
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  title: { fontSize: 22, fontWeight: '700', flexShrink: 1 },
  section: { fontSize: 17, fontWeight: '600' },
  body: { fontSize: 15 },
  bodyBold: { fontSize: 15, fontWeight: '600' },
  small: { fontSize: 13, lineHeight: 18 },
  smallBold: { fontSize: 13, fontWeight: '600' },
  numeric: { fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
  pill: { minHeight: 44, paddingHorizontal: 20, borderRadius: 22, justifyContent: 'center' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth },
  video: { width: '100%', height: 180, borderRadius: 12, backgroundColor: '#000', overflow: 'hidden' },
  list: { borderRadius: 14, overflow: 'hidden' },
  metric: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, paddingHorizontal: 14, paddingVertical: 8 },
  mechHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 14, paddingVertical: 10, minHeight: 48 },
  mechBody: { paddingHorizontal: 14, paddingBottom: 12, gap: 8 },
  tag: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 1 },
  tagText: { fontSize: 12 },
  well: {
    aspectRatio: 4 / 5,
    width: '100%',
    borderRadius: 16,
    backgroundColor: '#151722',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 24,
  },
});
