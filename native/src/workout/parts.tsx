import { Icon } from '~/shell/icon';
import { SymbolView } from 'expo-symbols';
import { useEvent, useEventListener } from 'expo';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Animated, AppState, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { EXERCISE_NOTE_MAX, cleanExerciseNote } from '@/lib/exercise-meta';
import { referenceWatchUrl } from '@/lib/reference-video';
import { rpc } from '~/lib/rpc';
import { PALETTES, type Palette } from '~/lib/ui';
import { CommandTracker, LiveSeek, nativeVideoStageHeight, videoPictureRect, videoTrackAspect, PlaybackIntent, beginScrub, clampTime, endScrub, onProviderPlaying, seekRange, settleExternalPause, stepTime, YT_ID, type InterruptReason, type PlayTicket, type ScrubSession } from '@/lib/exercise-video-state';
import { call, loadMe } from '~/pitch/api';
import { LocalVideo } from '../../modules/local-video';
import { Press } from '~/shell/press';
import { useDraftGuard } from '~/community/draft-guard';
import { rememberNote } from '~/library/sync';
import { useFavs } from '~/training/favorites';
import { ExerciseVideoFullscreen } from './exercise-video-fullscreen';
import { ExerciseVideoControls } from './exercise-video-controls';
import { activeExerciseVideo, nextVideoId } from './exercise-video-active';
import { useExerciseVideoLifecycle, useExerciseVideoNavigationGuard, useOffscreenPause } from './exercise-video-visibility';
import { YouTubeExerciseVideo } from './exercise-video-youtube';

/** 운동 진행 화면(native/src/app/workout.tsx)의 작은 조각 — 웹 app/(session)/workout/run/session-client.tsx 의 같은 이름 부품을 옮겼다 */

export function clockText(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * 쉬는 시간 알약 — 세트를 마친 뒤 0:00 부터 올라가는 시계 하나와 권장 쉬는 시간(참고).
 * 2026-10-12 사용자: "휴식 시간을 정해 두지 말고 0초부터 올라가게" — 권장 시간을 넘으면 그 글만 하늘색으로(소리 · 알림 없음, 웹과 같다).
 */
export function RestPill({ seconds, target, c }: { seconds: number; target: number | null; c: Palette }) {
  const over = target != null && seconds >= target;
  return (
    <View
      accessibilityRole="timer"
      accessibilityLabel={`쉰 시간 ${clockText(seconds)}${target != null ? `, 권장 쉬는 시간 ${clockText(target)}` : ''}`}
      style={[s.rest, { backgroundColor: c.chip }]}
    >
      <SymbolView name="timer" size={16} tintColor={over ? c.sky : c.muted} />
      <Text style={[s.restClock, { color: c.ink }]}>{clockText(seconds)}</Text>
      <Text style={[s.small, { color: over ? c.link : c.muted, fontWeight: over ? '700' : '400' }]}>
        {target == null ? '쉬는 중' : `권장 ${clockText(target)}`}
      </Text>
    </View>
  );
}

/** 처방 세트 수만큼의 점 — 남긴 세트만큼 찬다. 처방보다 더 하면 점이 늘어난다(더 한 것도 한 것이다). 칠해지는 순간 한 번 톡 커진다(웹 finish-pop) */
export function SetDots({ planned, done, c }: { planned: number; done: number; c: Palette }) {
  const total = Math.max(planned, done);
  const all = done >= planned;
  return (
    <View style={s.dotsRow}>
      <View style={s.dots}>
        {Array.from({ length: total }, (_, i) => (
          <Pop key={`${i}-${i < done}`} on={i < done}>
            <View style={[s.dot, { backgroundColor: i < done ? c.sky : c.line }]} />
          </Pop>
        ))}
      </View>
      <Pop key={`all-${all}`} on={all}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          {all ? <Icon name="check" size={12} color={c.link} /> : null}
          <Text style={[s.small, { color: all ? c.link : c.muted, fontWeight: all ? '700' : '400' }]}>
            {all ? `${planned}세트 다 했어요` : `${planned}세트 중 ${done}세트`}
          </Text>
        </View>
      </Pop>
    </View>
  );
}

/** on 으로 새로 그려질 때 0.6 → 1 로 한 번 튀어 커진다(웹 finish-pop) */
function Pop({ on, children }: { on: boolean; children: React.ReactNode }) {
  const [v] = useState(() => new Animated.Value(on ? 0 : 1));
  useEffect(() => {
    if (on) Animated.spring(v, { toValue: 1, friction: 5, tension: 160, useNativeDriver: true }).start();
  }, [on, v]);
  return <Animated.View style={{ transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }}>{children}</Animated.View>;
}

const PAD_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0'] as const;

/**
 * 숫자판 — 폰 기본 자판은 화면 절반을 덮고 열고 닫는 데 두 번씩 더 눌러야 해서 앱이 그린다(웹과 같은 까닭).
 * 지금 값을 받아 다음 값을 돌려주는 꼴로 넘긴다 — 빠르게 두 번 누르면 옛 값을 보고 한 자리를 잃는다('60' → '0').
 */
export function NumberPad({
  onChange,
  allowDecimal,
  keyHeight,
  c,
}: {
  onChange: (update: (prev: string) => string) => void;
  allowDecimal: boolean;
  keyHeight: number;
  c: Palette;
}) {
  const press = (key: string) =>
    onChange((prev) => {
      if (key === '.') {
        if (!allowDecimal || prev.includes('.')) return prev;
        return (prev === '' ? '0' : prev) + '.';
      }
      /* 소수점 아래 한 자리까지. 0.5kg 자리를 담으면 충분하다. */
      const dot = prev.indexOf('.');
      if (dot >= 0 && prev.length - dot > 1) return prev;
      if (prev.replace('.', '').length >= 5) return prev;
      return prev === '0' ? key : prev + key;
    });
  return (
    <View style={s.pad}>
      {PAD_KEYS.map((k) => {
        const off = k === '.' && !allowDecimal;
        return (
          <Pressable
            key={k}
            onPress={() => press(k)}
            disabled={off}
            accessibilityRole="button"
            style={({ pressed }) => [
              s.key,
              { height: keyHeight, backgroundColor: c.card, opacity: off ? 0.25 : pressed ? 0.6 : 1 },
            ]}
          >
            <Text style={[s.keyText, { color: c.ink }]}>{k}</Text>
          </Pressable>
        );
      })}
      <Pressable
        onPress={() => onChange((prev) => prev.slice(0, -1))}
        accessibilityRole="button"
        accessibilityLabel="한 글자 지우기"
        style={({ pressed }) => [s.key, { height: keyHeight, opacity: pressed ? 0.6 : 1 }]}
      >
        <Text style={[s.keyText, { color: c.ink }]}>⌫</Text>
      </Pressable>
    </View>
  );
}

/**
 * '몇 개 더 할 수 있었나요?'(설계 §13-7) — 0 = 더는 못 함, 4+ = 넉넉. 건너뛰기도 있다.
 * 다음 무게 추천에 쓴다(lib/program/next-weight.ts — 목표보다 하나라도 더 남으면 올린다).
 */
export function RirQuestion({
  setNo,
  reserve,
  onAnswer,
  c,
}: {
  setNo: number;
  reserve: number | null;
  onAnswer: (n: number | null) => void;
  c: Palette;
}) {
  const options = [
    { n: 0, label: '0', hint: '더는 못 함' },
    { n: 1, label: '1', hint: '' },
    { n: 2, label: '2', hint: '' },
    { n: 3, label: '3', hint: '' },
    { n: 4, label: '4+', hint: '넉넉' },
  ];
  return (
    <View style={{ gap: 8 }}>
      <Text style={[s.rirTitle, { color: c.ink }]}>{setNo}세트, 몇 개 더 할 수 있었나요?</Text>
      {reserve != null ? (
        <Text style={[s.small, s.center, { color: c.muted }]}>목표는 {reserve}개 남기기예요. 다음 무게에 써요.</Text>
      ) : null}
      <View style={s.rirRow}>
        {options.map((o) => (
          <Pressable
            key={o.n}
            onPress={() => onAnswer(o.n)}
            accessibilityRole="button"
            accessibilityLabel={o.hint ? `${o.label}개, ${o.hint}` : `${o.label}개`}
            style={({ pressed }) => [s.rirKey, { backgroundColor: pressed ? c.sky : c.chip }]}
          >
            <Text style={[s.rirNum, { color: c.ink }]}>{o.label}</Text>
            <Text style={[s.tiny, { color: c.muted }]}>{o.hint}</Text>
          </Pressable>
        ))}
      </View>
      <Press onPress={() => onAnswer(null)} accessibilityRole="button" style={s.skip}>
        <Text style={[s.bodyBold, { color: c.muted }]}>건너뛰기</Text>
      </Press>
    </View>
  );
}

/**
 * 운동 이름 아래의 '내 메모' — 운동 하나에 하나(웹 exercise-note.tsx). 다음에 그 운동을 할 때 여기 미리 떠 있고, 라이브러리에도 보인다.
 * 쓰던 글은 어느 운동의 것인지와 같이 들고 있어 다른 운동으로 가면 안 보이고 돌아오면 그대로 다시 열린다. 저장 단추는 입력칸 위 —
 * 자판이 아래를 가린다.
 */
type Draft = { exerciseId: string; text: string; base: string; error?: string };

export function NoteBox({
  exerciseId,
  note: given,
  onSaved,
  c,
}: {
  exerciseId: string;
  /** 화면이 받은 서버 메모 — 다른 화면(운동 영상 상세 · 운동 진행)에서 저장한 것이 있으면 그것을 보인다(~/library/sync) */
  note: string | null;
  onSaved?: (exerciseId: string, note: string | null) => void;
  c: Palette;
}) {
  const note = useFavs().note(exerciseId, given);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const writing = draft?.exerciseId === exerciseId ? draft : null;
  const dirty = (d: Draft | null) => !!d && cleanExerciseNote(d.text) !== d.base;
  /* 고치던 메모가 있으면(다른 운동 것이어도) 화면을 나가기 전에 묻는다 */
  useDraftGuard(dirty(draft));
  /* [취소] — 고친 글이 있으면 버릴지 묻는다(계속 쓰면 초안 그대로) */
  const cancel = () => {
    if (!dirty(writing)) return setDraft(null);
    Alert.alert('메모를 저장하지 않고 닫을까요?', undefined, [
      { text: '계속 쓰기', style: 'cancel' },
      { text: '버리기', style: 'destructive', onPress: () => setDraft(null) },
    ]);
  };

  const save = async () => {
    if (!writing) return;
    /* 안 바꿨으면 서버에 갈 것 없이 닫는다 */
    if (cleanExerciseNote(writing.text) === (note ?? '')) return setDraft(null);
    const target = writing.exerciseId;
    const sent = writing.text;
    /* 저장하는 사이 다른 운동의 메모를 열었으면 그쪽은 건드리지 않는다 */
    const settle = (next: (d: Draft) => Draft | null) => setDraft((d) => (d?.exerciseId === target ? next(d) : d));
    settle((d) => ({ ...d, error: undefined }));
    setSaving(true);
    try {
      const res = await rpc<{ note: string | null } | { error: string }>('exercise-note.saveExerciseNote', {
        exerciseId: target,
        body: sent,
      });
      if ('error' in res) settle((d) => ({ ...d, error: res.error }));
      else {
        rememberNote(target, res.note, given);
        onSaved?.(target, res.note);
        /* 저장하는 동안 더 쓴 글이 있으면 닫지 않는다 — 한 번 더 누르면 된다 */
        settle((d) => (d.text === sent ? null : d));
      }
    } catch {
      settle((d) => ({ ...d, error: '신호가 없어 저장됐는지 확인하지 못했어요. 신호가 잡히면 저장을 다시 눌러 주세요(같은 글로 다시 저장해요).' }));
    } finally {
      setSaving(false);
    }
  };

  if (writing)
    return (
      <View style={[s.noteBox, { borderColor: c.sky, backgroundColor: c.card, boxShadow: c.float }]}>
        <View style={s.noteHead}>
          <Text style={[s.smallBold, { color: c.link, flex: 1 }]}>내 메모</Text>
          <Press onPress={cancel} disabled={saving} style={s.noteBtn} accessibilityRole="button">
            <Text style={[s.smallBold, { color: c.muted }]}>취소</Text>
          </Press>
          <Press
            onPress={() => void save()}
            disabled={saving}
            accessibilityRole="button"
            style={[s.noteBtn, { backgroundColor: c.action, opacity: saving ? 0.6 : 1 }]}
          >
            <Text style={[s.smallBold, { color: '#fff' }]}>{saving ? '저장 중…' : '저장'}</Text>
          </Press>
        </View>
        {writing.error ? <Text style={[s.small, { color: c.danger }]}>{writing.error}</Text> : null}
        <TextInput
          autoFocus
          multiline
          value={writing.text}
          onChangeText={(text) => setDraft({ exerciseId, text, base: writing.base })}
          maxLength={EXERCISE_NOTE_MAX}
          accessibilityLabel="이 운동 메모"
          placeholder="예: 그립 한 칸 넓게, 벤치 등받이 3칸"
          placeholderTextColor={c.muted}
          style={[s.noteInput, { color: c.ink, borderColor: c.line }]}
        />
        <Text style={[s.tiny, { color: c.muted }]}>
          다음에 이 운동을 할 때와 라이브러리에서 보여요. 비우고 저장하면 지워져요. {writing.text.length}/{EXERCISE_NOTE_MAX}
        </Text>
      </View>
    );

  const open = () => setDraft({ exerciseId, text: note ?? '', base: note ?? '' });
  if (!note)
    return (
      <Press onPress={open} accessibilityRole="button" style={s.noteAdd}>
        <Text style={[s.small, { color: c.muted }]}>✎ 이 운동에 내 메모 남기기</Text>
      </Press>
    );
  return (
    <Press onPress={open} accessibilityRole="button" style={[s.noteBox, { borderColor: c.line, backgroundColor: c.card, boxShadow: c.float }]}>
      <Text style={[s.tiny, { color: c.muted, fontWeight: '600' }]}>내 메모 · 고치기</Text>
      <Text style={[s.body, { color: c.ink }]}>{note}</Text>
    </Press>
  );
}

/**
 * 자세 영상 — 직접 찍은 영상은 폰에 받아 둔 720p HEVC 판(LibraryClip)으로 틀고,
 * 유튜브 참고 영상은 공식 삽입 재생기를 작은 웹뷰로(우리 사이트를 주소로 둔다 — 유튜브가 출처 없는 삽입을 막는다).
 */
/** 관리자인가 — 앱을 켤 때 한 번 받은 나(app.loadAppMe, ~/pitch/api loadMe). 받기 전 · 실패면 아님 */
function useIsAdmin() {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    let alive = true;
    loadMe().then(
      (me) => alive && setAdmin(me.isAdmin),
      () => undefined
    );
    return () => {
      alive = false;
    };
  }, []);
  return admin;
}

export function ExerciseVideo({
  path,
  referenceVideoId,
  aspectRatio,
  height,
}: {
  path: string | null;
  referenceVideoId: string | null;
  aspectRatio: number | null;
  /**
   * 영상 무대 높이(조작부 제외) — 상세(2026-10-31 시안 02)가 넘긴다. 이 높이 안에 원래 비율 그대로(contain).
   * 안 주면 원래 비율. 조작부 · 반복 · 화면 이탈 멈춤은 VP01 부터 모든 진입점이 같다.
   */
  height?: number;
}) {
  const admin = useIsAdmin();
  useExerciseVideoNavigationGuard(Boolean(path || (referenceVideoId && YT_ID.test(referenceVideoId))));
  /* 소스 우선순위는 그대로 — 앱은 직접 찍은 영상(path)이 먼저(웹은 참고 영상이 먼저, VP01 에서 바꾸지 않음) */
  if (path) return <LibraryClip path={path} aspectRatio={aspectRatio} height={height} />;
  /* 유튜브 영상 번호만(11자) — 다른 글자가 섞인 번호는 그리지 않는다 */
  if (!referenceVideoId || !YT_ID.test(referenceVideoId)) return null;
  return (
    <View style={{ gap: 6 }}>
      <YouTubeExerciseVideo key={referenceVideoId} videoId={referenceVideoId} aspectRatio={aspectRatio} height={height} />
      {/* 관리자만 — 웹 components/library-video.tsx 와 같다(2026-10-04 '앱 안에 머물기': 일반 사용자는 유튜브로 나가지 않게) */}
      {admin ? (
        <Press
          onPress={() => void WebBrowser.openBrowserAsync(referenceWatchUrl(referenceVideoId))}
          accessibilityRole="link"
          style={s.noteAdd}
        >
          <Text style={[s.small, { color: '#0a84d6' }]}>유튜브에서 열기 ↗</Text>
        </Press>
      ) : null}
    </View>
  );
}

/** 'library/<uuid>.mp4' → '<uuid>' — 폰에 받아 둔 파일 이름(LocalVideo libraryLoad · libraryFetch 와 같은 규칙) */
const libraryKey = (path: string) => /^library\/([\w-]{1,64})\.\w+$/.exec(path)?.[1] ?? null;

/**
 * 폰에 있으면(앱 안 · 받아 둔 것) 그 파일, 없으면 720p HEVC 판(서버 small 'hevc' — 없으면 H.264 판)을 한 번 받아 폰에 두고 튼다.
 * 2026-10-20 김민: 서버 전송비 — 예전엔 볼 때마다 서버에서 받았다. 받기에 실패하면 예전처럼 주소로 바로 튼다.
 * HEVC 는 같은 화질에 H.264 판의 절반 남짓(영상 10개 시험 −56%, scripts/library-bundle/compress.swift 머리).
 */
async function libraryUri(path: string, fresh = false): Promise<string | null> {
  const key = libraryKey(path);
  /* 다시 불러오기(fresh)는 폰의 파일을 건너뛰고 서버 주소로 바로 튼다 — 받아 둔 파일이 망가졌으면 같은 파일만 다시 열려 빠져나오지 못했다 */
  if (key && !fresh) {
    const local = await LocalVideo.libraryLoad({ key }).catch(() => null);
    if (local) return `file://${local.path}`;
  }
  const r = await call<{ urls: Record<string, string> }>('/api/library/video-url', {
    method: 'POST',
    body: { paths: [path], small: 'hevc' },
  });
  const url = r.urls[path];
  if (!url) return null;
  if (!key || fresh) return url;
  const got = await LocalVideo.libraryFetch({ key, url }).catch(() => null);
  return got ? `file://${got.path}` : url;
}

function LibraryClip({ path, aspectRatio, height }: { path: string; aspectRatio: number | null; height?: number }) {
  const window = useWindowDimensions();
  const [state, setState] = useState<{ path: string; uri: string | null; failed: boolean; tries: number } | null>(null);
  /* [다시 불러오기] — 이 영상만 다시 받는다(설명 · 기록 · 별은 그대로) */
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let alive = true;
    libraryUri(path, tries > 0).then(
      (uri) => alive && setState({ path, uri, failed: !uri, tries }),
      () => alive && setState({ path, uri: null, failed: true, tries })
    );
    return () => {
      alive = false;
    };
  }, [path, tries]);
  const box = [s.video, { height: nativeVideoStageHeight(window.width - 32, window.height, aspectRatio ?? 9 / 16, height) }];
  if (state?.path !== path || state.tries !== tries || (!state.uri && !state.failed))
    return (
      <View style={[box, s.centerBox]} accessibilityLabel="영상을 불러오는 중">
        <ActivityIndicator color="#fff" />
      </View>
    );
  const retry = (
    <Press onPress={() => setTries((n) => n + 1)} accessibilityRole="button" style={s.clipRetry}>
      <Text style={[s.smallBold, { color: '#fff' }]}>다시 불러오기</Text>
    </Press>
  );
  if (!state.uri)
    return (
      <View style={[box, s.centerBox, { gap: 8 }]}>
        <Text style={[s.small, { color: 'rgba(255,255,255,0.8)' }]}>영상을 불러오지 못했어요.</Text>
        {retry}
      </View>
    );
  return <ClipPlayer key={`${state.uri}#${tries}`} uri={state.uri} aspectRatio={aspectRatio} height={height} retry={retry} />;
}

/*
 * 운동 영상(자체 영상) — VP01 기본 플레이어. 관리자 · 일반 사용자, 상세 · 운동 진행 · 암케어 · 워밍업 모두 같다.
 * 현재 영상 반복(토글 가능, 처음 켜짐) · 자체 영상 음소거 · 영상 한 번 탭으로 멈춤/재생 · 영상 안쪽 하단의 얇은 조작부(누르는 자리는 44pt). 화면 이탈 · 앱이 뒤로 · 화면 밖 ·
 * 다른 영상 재생 · 해제 때 멈추고, 돌아와도 저절로 틀지 않는다. 크게 보기는 앱 안 모달 — 같은 player, VideoView 는 한 번에 하나.
 * height 는 영상 높이 상한. 실제 영상 비율에 맞춘 영역 안에 조작부를 겹친다.
 */
function ClipPlayer({ uri, aspectRatio, height, retry }: { uri: string; aspectRatio: number | null; height?: number; retry: ReactNode }) {
  const window = useWindowDimensions();
  const [width, setWidth] = useState(window.width - 32);
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.loop = true;
    p.timeUpdateEventInterval = 0.25;
  });
  const [mediaRatio, setMediaRatio] = useState(() => videoTrackAspect(player.videoTrack?.size.width, player.videoTrack?.size.height, aspectRatio));
  const picture = videoPictureRect(width, Math.max(96, Math.min(height ?? 420, 420, window.height - 180)), mediaRatio);
  const intent = useRef(new PlaybackIntent());
  const tracker = useRef(new CommandTracker());
  const ticket = useRef<PlayTicket | null>(null);
  const scrub = useRef<ScrubSession | null>(null);
  const [scrubbing, setScrubbingState] = useState(false);
  const preview = useRef(new LiveSeek());
  const [loop, setLoopState] = useState(true);
  const stage = useRef<ComponentRef<typeof View>>(null);
  const [id] = useState(() => nextVideoId('clip'));
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const { playbackRate } = useEvent(player, 'playbackRateChange', { playbackRate: player.playbackRate });
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [full, setFull] = useState(false);
  /*
   * 재생/멈춤 단추의 모양과 동작은 '사용자 의도'를 따른다 — 불러오는 중 · 버퍼링 중에도 의도가 재생이면 멈춤 단추.
   * 누른 뒤 마운트(첫 활성화)라 처음 의도는 재생(VP01 검토: 로딩 중 '재생'을 누르면 멈춰 두 번 눌러야 하던 것).
   */
  const [want, setWant] = useState(true);
  const syncWant = () => setWant(intent.current.desired);
  const pauseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 한 번이라도 실제로 재생됐나 — 그 뒤의 '준비됨'(버퍼링 끝)은 시작 신호가 아니다. */
  const started = useRef(false);

  /** 지금 재생기 상태로 바깥 멈춤을 확정(의도 맞춤). 맞췄으면 true. */
  const settleNow = () => {
    let st: { playing: boolean; ready: boolean };
    try {
      st = { playing: player.playing, ready: player.status === 'readyToPlay' };
    } catch {
      return false; // 이미 해제됨
    }
    if (!settleExternalPause(intent.current, { ...st, scrubbing: !!scrub.current })) return false;
    ticket.current = null;
    syncWant();
    return true;
  };
  /** 확정 기다림 중이면 지금 확정한다 — 사용자가 새로 누르기 전에 화면 값과 의도를 맞춰 첫 누름이 삼켜지지 않게. */
  const flushPendingPause = () => {
    if (!pauseTimer.current) return;
    clearTimeout(pauseTimer.current);
    pauseTimer.current = null;
    settleNow();
  };
  const scheduleSettle = () => {
    if (pauseTimer.current) clearTimeout(pauseTimer.current);
    const gen = intent.current.interrupt;
    pauseTimer.current = setTimeout(() => {
      pauseTimer.current = null;
      if (intent.current.interrupt !== gen) return; // 그새 사용자가 새로 정했다
      settleNow();
    }, EXTERNAL_PAUSE_SETTLE_MS);
  };

  const pausePlayer = () => {
    let active = false;
    try {
      active = player.playing;
    } catch {
      /* 이미 해제됨 */
    }
    tracker.current.sentPause(active);
    safePause(player);
  };
  /** 멈춤. 끄는 중이어도 끌기 세션은 남긴다 — 놓을 때 이동은 하고 재개만 막는다(endScrub). */
  const interrupt = (reason: InterruptReason) => {
    if (pauseTimer.current) {
      clearTimeout(pauseTimer.current);
      pauseTimer.current = null;
    }
    preview.current.cancel();
    setScrubbingState(false);
    setScrubbing(player, false);
    intent.current.pause(reason);
    ticket.current = null;
    syncWant();
    pausePlayer();
  };
  const tryPlay = () => {
    if (!intent.current.allows(ticket.current)) return;
    activeExerciseVideo.activate(id, () => interrupt('other-player'));
    tracker.current.sentPlay();
    safePlay(player);
  };
  const toggle = () => {
    if (status === 'error') return;
    flushPendingPause();
    if (intent.current.desired) interrupt('user');
    else {
      ticket.current = intent.current.requestPlay();
      syncWant();
      tryPlay();
    }
  };

  /* 새 player = 새 소스. 누른 뒤 마운트(첫 활성화)라 재생을 한 번 요청한다 */
  useEffect(() => {
    const it = intent.current;
    const previews = preview.current;
    const timer = pauseTimer;
    it.setSource();
    ticket.current = it.requestPlay();
    tryPlay();
    return () => {
      previews.cancel();
      setScrubbing(player, false);
      it.pause('unmount');
      activeExerciseVideo.release(id);
      if (timer.current) clearTimeout(timer.current);
      safePause(player);
    };
    // tryPlay 는 ref 만 쓴다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player, id]);

  useEventListener(player, 'playingChange', ({ isPlaying: on }) => {
    if (on) {
      const r = onProviderPlaying(intent.current, tracker.current, { acceptExternal: false });
      if (r.verdict === 'stop') pausePlayer();
      else {
        started.current = true;
        activeExerciseVideo.activate(id, () => interrupt('other-player'));
      }
      return;
    }
    /*
     * 우리가 시키지 않은 멈춤(오디오 끊김 · 시스템)이면 의도도 멈춤으로 맞춘다 — 다음 한 번 누름이 재생이 되게.
     * 버퍼링(status 'loading')은 멈춤이 아니다. iOS 는 반복 끝에서 잠깐 멈췄다 처음부터 다시 틀어(expo-video onPlayedToEnd)
     * 곧바로 확정하지 않고 잠시 뒤에도 멈춰 있을 때만 맞춘다.
     */
    if (tracker.current.onPaused() === 'ours' || scrub.current || player.status !== 'readyToPlay') return;
    scheduleSettle();
  });
  useEventListener(player, 'statusChange', ({ status: st }) => {
    if (st !== 'readyToPlay') return;
    setDuration(validDuration(player.duration));
    const size = player.videoTrack?.size;
    setMediaRatio(videoTrackAspect(size?.width, size?.height, aspectRatio));
    if (!started.current) {
      tryPlay(); // 처음 준비 = 첫 활성화 재생
      return;
    }
    /*
     * 이미 재생된 뒤의 '준비됨'은 버퍼링이 끝났다는 뜻 — 다시 틀지 않는다. 버퍼링 중에 시스템이 멈췄으면(그때는 재생 알림이
     * 오지 않는다) 여기서 멈춰 있는 것을 보고 의도를 맞춘다(그대로 두면 단추가 '멈춤'인 채 멈춰 있었다).
     */
    if (intent.current.desired && !player.playing && !scrub.current) scheduleSettle();
  });
  useEventListener(player, 'playToEnd', () => {
    if (!player.loop) interrupt('user');
  });
  useEventListener(player, 'sourceLoad', ({ duration: d, availableVideoTracks }) => {
    setDuration(validDuration(d));
    const size = player.videoTrack?.size ?? availableVideoTracks[0]?.size;
    setMediaRatio(videoTrackAspect(size?.width, size?.height, aspectRatio));
  });
  useEventListener(player, 'videoTrackChange', ({ videoTrack }) => setMediaRatio(videoTrackAspect(videoTrack?.size.width, videoTrack?.size.height, aspectRatio)));
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (!scrub.current) setTime(currentTime);
  });

  // Cached local files can become ready before event listeners attach.
  useEffect(() => {
    let alive = true;
    void Promise.resolve().then(() => {
      if (!alive || player.status !== 'readyToPlay') return;
      setDuration(validDuration(player.duration));
      const size = player.videoTrack?.size;
      setMediaRatio(videoTrackAspect(size?.width, size?.height, aspectRatio));
    });
    return () => { alive = false; };
  }, [player, aspectRatio]);

  useExerciseVideoLifecycle((reason) => interrupt(reason));
  useOffscreenPause(stage, (isPlaying || want || scrubbing) && !full, () => interrupt('offscreen'));

  const range = seekRange(duration);
  const seekTo = (t: number) => {
    if (!range) return;
    const to = clampTime(t, range);
    safeSeek(player, to);
    setTime(to);
  };
  const onScrubStart = () => {
    flushPendingPause();
    scrub.current = beginScrub(intent.current, player.currentTime, scrub.current);
    setScrubbingState(true);
    setScrubbing(player, true);
    syncWant();
    pausePlayer();
  };
  const onScrubDraft = (t: number) => {
    const ss = scrub.current;
    if (!ss || ss.ticket.interrupt !== intent.current.interrupt) return;
    ss.draft = t;
    preview.current.request(() => seekTo(t));
  };
  const onScrubEnd = (commit: boolean, t: number, interrupted = false) => {
    if (interrupted) { intent.current.pause('unmount'); ticket.current = null; }
    preview.current.cancel();
    setScrubbingState(false);
    setScrubbing(player, false);
    const ss = scrub.current;
    scrub.current = null;
    if (!ss) return;
    if (commit) ss.draft = t;
    const r = endScrub(intent.current, ss, commit, range);
    if (r.seekTo != null) seekTo(r.seekTo);
    if (r.resume && AppState.currentState !== 'active') {
      // 끄는 사이 앱이 뒤로 갔으면 재개하지 않는다(돌아와도 저절로 틀지 않는다).
      intent.current.pause('background');
    } else if (r.resume) {
      ticket.current = intent.current.ticket();
      tryPlay();
    }
    syncWant();
  };
  const ctl = {
    playing: want,
    ready: status === 'readyToPlay' && duration != null,
    duration,
    time,
    onToggle: toggle,
    onScrubStart,
    onScrubDraft,
    onScrubEnd,
    onStep: (dir: 1 | -1) => seekTo(stepTime(player.currentTime, dir, range)),
    loop,
    onLoop: () => { const next = !player.loop; setLoopState(next); setLoop(player, next); },
    rates: [0.5, 1],
    rate: playbackRate,
    onRate: (r: number) => {
      flushPendingPause();
      setRate(player, r);
      // iOS expo-video 는 배속을 바꾸면 AVPlayer.rate 를 바로 써서 멈춘 영상이 움직인다 — 멈춤 의도면 곧바로 다시 멈춘다.
      if (!intent.current.desired) pausePlayer();
    },
    expanded: full,
    onExpand: () => setFull((f) => !f),
    status: status === 'error' ? '오류' : status === 'loading' || (want && !isPlaying) ? '불러오는 중' : null,
  };
  return (
    <>
      <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ width: '100%', alignItems: 'center' }}>
        <View ref={stage} style={{ height: picture.height, width: picture.width, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' }}>
          {/* 같은 재생기를 두 VideoView에 동시에 붙이지 않는다(Android). 크게 보기 동안 이 자리는 비운다. */}
          {!full && (status === 'error' ? (
            <View style={[StyleSheet.absoluteFill, s.centerBox, { gap: 8 }]}>
              <Text style={[s.small, { color: 'rgba(255,255,255,0.8)' }]}>영상을 재생하지 못했어요.</Text>
              {retry}
            </View>
          ) : <>
            <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls={false} fullscreenOptions={{ enable: false }} contentFit="contain" pointerEvents="none" />
            <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={want ? '영상 멈춤' : '영상 재생'} style={StyleSheet.absoluteFill} />
            {status === 'loading' ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.centerBox]}><ActivityIndicator color="#fff" /></View> : null}
          </>)}
          {full ? null : <ExerciseVideoControls c={PALETTES.navy} {...ctl} />}
        </View>
      </View>
      {full ? (
        <ExerciseVideoFullscreen
          player={player}
          aspectRatio={mediaRatio}
          onClose={() => setFull(false)}
          onStageTap={toggle}
          status={status}
          isPlaying={want}
          retry={retry}
          controls={<ExerciseVideoControls c={PALETTES.navy} {...ctl} />}
        />
      ) : null}
    </>
  );
}

const validDuration = (d: number) => (Number.isFinite(d) && d > 0 ? d : null);
/** 바깥 멈춤으로 확정하기 전 기다림 — iOS 반복 끝의 잠깐 멈춤(곧 다시 재생)을 사용자 멈춤으로 오해하지 않게. */
const EXTERNAL_PAUSE_SETTLE_MS = 800;

/* 재생기 값은 훅 밖 함수에서 바꾼다(컴포넌트 안에서 훅 값을 바꾸면 린트가 막는다 — pitch/video.tsx 와 같다). 정리 중 오류는 삼킨다 */
function safePlay(p: VideoPlayer) {
  try {
    p.play();
  } catch {
    /* 이미 해제됨 */
  }
}
function safePause(p: VideoPlayer) {
  try {
    p.pause();
  } catch {
    /* 이미 해제됨 */
  }
}
function safeSeek(p: VideoPlayer, t: number) {
  try {
    p.currentTime = t;
  } catch {
    /* 이미 해제됨 */
  }
}
function setRate(p: VideoPlayer, r: number) {
  try {
    p.playbackRate = r;
  } catch {
    /* 이미 해제됨 */
  }
}


const s = StyleSheet.create({
  clipRetry: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center' },
  rest: { alignSelf: 'center', minHeight: 40, borderRadius: 20, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  restClock: { fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  small: { fontSize: 13 },
  smallBold: { fontSize: 13, fontWeight: '600' },
  tiny: { fontSize: 11 },
  body: { fontSize: 15, lineHeight: 21 },
  bodyBold: { fontSize: 15, fontWeight: '600' },
  center: { textAlign: 'center' },
  dotsRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  pad: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  key: { width: '31.9%', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 22, fontWeight: '400' },
  rirTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  rirRow: { flexDirection: 'row', gap: 6 },
  rirKey: { flex: 1, minHeight: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  rirNum: { fontSize: 20, fontWeight: '700' },
  skip: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  noteAdd: { minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' },
  noteBox: { marginTop: 12, borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  noteHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  noteBtn: { minHeight: 40, minWidth: 44, borderRadius: 8, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  noteInput: { minHeight: 72, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 17, textAlignVertical: 'top' },
  video: { width: '100%', maxHeight: 420, borderRadius: 16, backgroundColor: '#000', overflow: 'hidden' },
  centerBox: { alignItems: 'center', justifyContent: 'center', padding: 16 },
});

function setLoop(p: VideoPlayer, value: boolean) { try { p.loop = value; } catch { /* released */ } }
function setScrubbing(p: VideoPlayer, value: boolean) {
  try { p.scrubbingModeOptions = { scrubbingModeEnabled: value }; } catch { /* released */ }
}
