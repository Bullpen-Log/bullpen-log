import { SymbolView } from 'expo-symbols';
import { useEvent } from 'expo';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { EXERCISE_NOTE_MAX, cleanExerciseNote } from '@/lib/exercise-meta';
import { referenceEmbedUrl, referenceWatchUrl } from '@/lib/reference-video';
import { rpc } from '~/lib/rpc';
import { SITE_URL } from '~/lib/site';
import type { Palette } from '~/lib/ui';
import { call, loadMe } from '~/pitch/api';

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
      <Text style={[s.small, { color: over ? c.sky : c.muted, fontWeight: over ? '700' : '400' }]}>
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
          {all ? <SymbolView name="checkmark" size={12} weight="bold" tintColor={c.sky} /> : null}
          <Text style={[s.small, { color: all ? c.sky : c.muted, fontWeight: all ? '700' : '400' }]}>
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
      <Pressable onPress={() => onAnswer(null)} accessibilityRole="button" style={s.skip}>
        <Text style={[s.bodyBold, { color: c.muted }]}>건너뛰기</Text>
      </Pressable>
    </View>
  );
}

/**
 * 운동 이름 아래의 '내 메모' — 운동 하나에 하나(웹 exercise-note.tsx). 다음에 그 운동을 할 때 여기 미리 떠 있고, 라이브러리에도 보인다.
 * 쓰던 글은 어느 운동의 것인지와 같이 들고 있어 다른 운동으로 가면 안 보이고 돌아오면 그대로 다시 열린다. 저장 단추는 입력칸 위 —
 * 자판이 아래를 가린다.
 */
type Draft = { exerciseId: string; text: string; error?: string };

export function NoteBox({
  exerciseId,
  note,
  onSaved,
  c,
}: {
  exerciseId: string;
  note: string | null;
  onSaved: (exerciseId: string, note: string | null) => void;
  c: Palette;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const writing = draft?.exerciseId === exerciseId ? draft : null;

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
        onSaved(target, res.note);
        /* 저장하는 동안 더 쓴 글이 있으면 닫지 않는다 — 한 번 더 누르면 된다 */
        settle((d) => (d.text === sent ? null : d));
      }
    } catch {
      settle((d) => ({ ...d, error: '신호가 없어 메모를 저장하지 못했어요. 신호가 잡히면 다시 눌러 주세요.' }));
    } finally {
      setSaving(false);
    }
  };

  if (writing)
    return (
      <View style={[s.noteBox, { borderColor: c.sky, backgroundColor: c.card, boxShadow: c.float }]}>
        <View style={s.noteHead}>
          <Text style={[s.smallBold, { color: c.sky, flex: 1 }]}>내 메모</Text>
          <Pressable onPress={() => setDraft(null)} disabled={saving} style={s.noteBtn} accessibilityRole="button">
            <Text style={[s.smallBold, { color: c.muted }]}>취소</Text>
          </Pressable>
          <Pressable
            onPress={() => void save()}
            disabled={saving}
            accessibilityRole="button"
            style={[s.noteBtn, { backgroundColor: c.sky, opacity: saving ? 0.6 : 1 }]}
          >
            <Text style={[s.smallBold, { color: '#fff' }]}>{saving ? '저장 중…' : '저장'}</Text>
          </Pressable>
        </View>
        {writing.error ? <Text style={[s.small, { color: c.danger }]}>{writing.error}</Text> : null}
        <TextInput
          autoFocus
          multiline
          value={writing.text}
          onChangeText={(text) => setDraft({ exerciseId, text })}
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

  const open = () => setDraft({ exerciseId, text: note ?? '' });
  if (!note)
    return (
      <Pressable onPress={open} accessibilityRole="button" style={s.noteAdd}>
        <Text style={[s.small, { color: c.muted }]}>✎ 이 운동에 내 메모 남기기</Text>
      </Pressable>
    );
  return (
    <Pressable onPress={open} accessibilityRole="button" style={[s.noteBox, { borderColor: c.line, backgroundColor: c.card, boxShadow: c.float }]}>
      <Text style={[s.tiny, { color: c.muted, fontWeight: '600' }]}>내 메모 · 고치기</Text>
      <Text style={[s.body, { color: c.ink }]}>{note}</Text>
    </Pressable>
  );
}

/**
 * 자세 영상 — 직접 찍은 영상은 라이브러리 재생 주소(/api/library/video-url, 웹 components/library-video.tsx 와 같은 small 판)로 틀고,
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
}: {
  path: string | null;
  referenceVideoId: string | null;
  aspectRatio: number | null;
}) {
  const admin = useIsAdmin();
  if (path) return <LibraryClip path={path} aspectRatio={aspectRatio} />;
  /* 유튜브 영상 번호만(11자) — 이 글이 사이트 주소(baseUrl)로 도는 웹뷰에 그대로 들어가니, 다른 글자가 섞인 번호는 그리지 않는다 */
  if (!referenceVideoId || !/^[A-Za-z0-9_-]{11}$/.test(referenceVideoId)) return null;
  const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#000;height:100%}iframe{border:0;width:100%;height:100%}</style><iframe src="${referenceEmbedUrl(referenceVideoId)}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>`;
  return (
    <View style={{ gap: 6 }}>
      <View style={[s.video, { aspectRatio: aspectRatio ?? 16 / 9 }]}>
        <WebView
          source={{ html, baseUrl: SITE_URL }}
          allowsInlineMediaPlayback
          allowsFullscreenVideo
          scrollEnabled={false}
          style={{ backgroundColor: '#000' }}
        />
      </View>
      {/* 관리자만 — 웹 components/library-video.tsx 와 같다(2026-10-04 '앱 안에 머물기': 일반 사용자는 유튜브로 나가지 않게) */}
      {admin ? (
        <Pressable
          onPress={() => void WebBrowser.openBrowserAsync(referenceWatchUrl(referenceVideoId))}
          accessibilityRole="link"
          style={s.noteAdd}
        >
          <Text style={[s.small, { color: '#0a84d6' }]}>유튜브에서 열기 ↗</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function LibraryClip({ path, aspectRatio }: { path: string; aspectRatio: number | null }) {
  const [state, setState] = useState<{ path: string; uri: string | null; failed: boolean } | null>(null);
  useEffect(() => {
    let alive = true;
    call<{ urls: Record<string, string> }>('/api/library/video-url', { method: 'POST', body: { paths: [path], small: true } }).then(
      (r) => alive && setState({ path, uri: r.urls[path] ?? null, failed: !r.urls[path] }),
      () => alive && setState({ path, uri: null, failed: true })
    );
    return () => {
      alive = false;
    };
  }, [path]);
  const box = [s.video, { aspectRatio: aspectRatio ?? 9 / 16 }];
  if (state?.path !== path || (!state.uri && !state.failed))
    return (
      <View style={[box, s.centerBox]}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  if (!state.uri)
    return (
      <View style={[box, s.centerBox]}>
        <Text style={[s.small, { color: 'rgba(255,255,255,0.8)' }]}>영상을 불러오지 못했어요.</Text>
      </View>
    );
  return <ClipPlayer uri={state.uri} aspectRatio={aspectRatio} />;
}

/*
 * 운동 영상 — 아이폰 기본 재생 단추(가운데 큰 재생 · 10초 건너뛰기)가 영상의 동작을 가려서(2026-10-20 김민) 기본 단추를 끄고,
 * 화면을 누르면 멈춤 · 재생, 오른쪽 아래 작은 단추 둘(재생 · 멈춤, 크게 보기 — 크게 보기 안에서는 기본 단추가 다시 나온다).
 */
function ClipPlayer({ uri, aspectRatio }: { uri: string; aspectRatio: number | null }) {
  const view = useRef<VideoView>(null);
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.loop = true;
    p.play();
  });
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const toggle = () => togglePlay(player);
  return (
    <View style={[s.video, { aspectRatio: aspectRatio ?? 9 / 16 }]}>
      <VideoView ref={view} player={player} style={StyleSheet.absoluteFill} nativeControls={false} contentFit="contain" />
      <Pressable onPress={toggle} accessibilityRole="button" accessibilityLabel={isPlaying ? '영상 멈춤' : '영상 재생'} style={StyleSheet.absoluteFill} />
      <View style={s.clipTools}>
        <Pressable onPress={toggle} hitSlop={6} accessibilityRole="button" accessibilityLabel={isPlaying ? '멈춤' : '재생'} style={s.clipTool}>
          <SymbolView name={isPlaying ? 'pause.fill' : 'play.fill'} size={13} tintColor="#fff" />
        </Pressable>
        <Pressable
          onPress={() => void view.current?.enterFullscreen().catch(() => undefined)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="크게 보기"
          style={s.clipTool}
        >
          <SymbolView name="arrow.up.left.and.arrow.down.right" size={13} tintColor="#fff" />
        </Pressable>
      </View>
    </View>
  );
}

/* 재생기 값은 훅 밖 함수에서 바꾼다(컴포넌트 안에서 훅 값을 바꾸면 린트가 막는다 — pitch/video.tsx 와 같다) */
function togglePlay(p: VideoPlayer) {
  if (p.playing) p.pause();
  else p.play();
}

const s = StyleSheet.create({
  clipTools: { position: 'absolute', right: 8, bottom: 8, flexDirection: 'row', gap: 6 },
  clipTool: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  rest: { alignSelf: 'center', height: 40, borderRadius: 20, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  restClock: { fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  small: { fontSize: 13 },
  smallBold: { fontSize: 13, fontWeight: '700' },
  tiny: { fontSize: 11 },
  body: { fontSize: 15, lineHeight: 21 },
  bodyBold: { fontSize: 15, fontWeight: '600' },
  center: { textAlign: 'center' },
  dotsRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10 },
  dots: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  pad: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  key: { width: '31.9%', borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  keyText: { fontSize: 22, fontWeight: '500' },
  rirTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  rirRow: { flexDirection: 'row', gap: 6 },
  rirKey: { flex: 1, minHeight: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  rirNum: { fontSize: 20, fontWeight: '700' },
  skip: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  noteAdd: { minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' },
  noteBox: { marginTop: 12, borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
  noteHead: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  noteBtn: { minHeight: 40, minWidth: 44, borderRadius: 8, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  noteInput: { minHeight: 72, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 16, textAlignVertical: 'top' },
  video: { width: '100%', maxHeight: 420, borderRadius: 16, backgroundColor: '#000', overflow: 'hidden' },
  centerBox: { alignItems: 'center', justifyContent: 'center', padding: 16 },
});
