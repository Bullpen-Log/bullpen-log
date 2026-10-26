import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { createUploadTask, FileSystemUploadType } from 'expo-file-system/legacy';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { ORG_VIDEO_MAX_BYTES } from '@/lib/org/comments';
import { useEventListener } from 'expo';
import { call } from '~/community/parts';
import { cacheEpoch } from '~/lib/store';
import { createRetry, createUrlCache } from './url-cache';
import { TYPE, type Palette } from '~/lib/ui';

/**
 * 팀 · 레슨장 영상(2단계) — 일지 영상(코치) · 숙제 영상(선수). 코치와 선수가 서로 봐야 해서 폰 안이 아니라 저장소에 올린다
 * (서버 app-lesson.coachVideoUpload · myVideoUpload 가 `{내 번호}/org-…` 서명 주소를 준다). 재생 주소는 걸린 영상만(coachVideoUrls · myVideoUrls).
 */
export type VideoWho = { role: 'coach'; orgId: string } | { role: 'player'; memberId: string };

/** 사진 앱에서 영상 하나 골라 올린다 — 고르기를 그만두면 null. 사진 선택기 기본(호환 H.264)으로 받아 크기를 줄인다 */
export async function pickAndUploadOrgVideo(who: VideoWho, onProgress?: (percent: number) => void): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['videos'], videoMaxDuration: 180 });
  if (res.canceled || !res.assets?.[0]) return null;
  const asset = res.assets[0];
  const size = asset.fileSize ?? safeSize(asset.uri);
  if (size != null && size > ORG_VIDEO_MAX_BYTES) throw new Error(`영상은 ${ORG_VIDEO_MAX_BYTES / 1024 / 1024}MB 이하만 올릴 수 있어요. 짧게 잘라 주세요.`);
  const type = asset.mimeType ?? 'video/quicktime';
  const meta = { fileName: asset.fileName ?? 'video.mov', fileSize: size ?? 1, fileType: type };
  const t =
    who.role === 'coach'
      ? await call<{ ok: true; path: string; signedUrl: string }>('app-lesson.coachVideoUpload', who.orgId, meta)
      : await call<{ ok: true; path: string; signedUrl: string }>('app-lesson.myVideoUpload', who.memberId, meta);
  if (!t.ok) throw new Error(('error' in t && t.error) || '올릴 준비를 못 했어요.');
  const put = async (retry: boolean) => {
    const task = createUploadTask(
      t.signedUrl,
      asset.uri,
      { httpMethod: 'PUT', uploadType: FileSystemUploadType.BINARY_CONTENT, headers: { 'content-type': type } },
      (p) => p.totalBytesExpectedToSend > 0 && onProgress?.(Math.round((p.totalBytesSent / p.totalBytesExpectedToSend) * 100))
    );
    const r = await task.uploadAsync();
    /* 다시 보낸 것인데 '이미 있어요'(409) — 앞의 것이 다 올라갔다(웹 putFile 과 같다) */
    if (retry && r?.status === 409) return;
    if (!r || r.status < 200 || r.status >= 300) throw new Error('영상을 올리지 못했어요.');
  };
  try {
    await put(false);
  } catch {
    /* 신호가 잠깐 끊긴 것일 수 있다 — 같은 주소로 한 번 더 */
    await new Promise((r) => setTimeout(r, 1500));
    await put(true);
  }
  return t.path;
}

function safeSize(uri: string): number | null {
  try {
    return new File(uri).size ?? null;
  } catch {
    return null;
  }
}

/** 재생 주소 기억 — 계정 세대 · 범위 · 경로마다 20분까지(org/url-cache.ts — 예전엔 경로만으로 앱이 켜진 동안 쥐어 죽은 주소를 썼다) */
const urls = createUrlCache({ epoch: cacheEpoch });

function useOrgVideoUrl(path: string, who: VideoWho): { uri: string | null; error: string | null; renew: () => void } {
  const role = who.role;
  const id = who.role === 'coach' ? who.orgId : who.memberId;
  const scope = `${role}:${id}`;
  /* 다시 받기 차례 — 늘리면 기억을 지우고 새로 받는다 */
  const [ask, setAsk] = useState(0);
  const k = `${scope}|${path}|${ask}`;
  const [state, setState] = useState<{ k: string; uri: string | null; error: string | null }>(() => ({ k, uri: urls.get(scope, path), error: null }));
  useEffect(() => {
    let alive = true;
    const at = `${scope}|${path}|${ask}`;
    /* 기억에 있으면(살아 있는 주소) 그것 — 처음 열 때는 초기값이 이미 이것이다 */
    const hit = urls.get(scope, path);
    if (hit) {
      void Promise.resolve().then(() => alive && setState((s) => (s.k === at && s.uri === hit ? s : { k: at, uri: hit, error: null })));
      return () => {
        alive = false;
      };
    }
    /* 받는 사이 로그아웃 · 다른 계정이면 버린다(기억에도 안 둔다) */
    const e = cacheEpoch();
    void (role === 'coach'
      ? call<{ ok: true; urls: Record<string, string> }>('app-lesson.coachVideoUrls', id, [path])
      : call<{ ok: true; urls: Record<string, string> }>('app-lesson.myVideoUrls', id, [path])
    ).then((r) => {
      if (!alive || e !== cacheEpoch()) return;
      const uri = r.ok ? r.urls[path] : undefined;
      if (uri) urls.set(scope, path, uri);
      setState({ k: at, uri: uri ?? null, error: uri ? null : '영상을 불러오지 못했어요.' });
    });
    return () => {
      alive = false;
    };
  }, [scope, path, ask, role, id]);
  const renew = () => {
    urls.forget(scope, path);
    setAsk((n) => n + 1);
  };
  return state.k === k ? { uri: state.uri, error: state.error, renew } : { uri: null, error: null, renew };
}

type At = { time: number; rate: number; playing: boolean };

/**
 * 조직 영상 하나 — playerRef 를 주면 지금 시각(영상 시점 말) · 옮기기(시점 말 누름)에 쓴다.
 * 재생 중 주소가 죽으면(앱을 오래 켜 둠 · 뒤에 있다 돌아옴) 주소를 새로 받아 그 자리 · 배속에서 이어 튼다 — 저절로는 두 번까지, 그 뒤엔
 * '다시 불러오기'를 누를 때만(끝없이 다시 받지 않게). 주소를 못 받으면(신호 없음 · 권한 없음)도 누를 때만 다시.
 */
export function OrgVideo({ path, who, playerRef, c }: { path: string; who: VideoWho; playerRef?: RefObject<VideoPlayer | null>; c: Palette }) {
  const { uri, error, renew } = useOrgVideoUrl(path, who);
  const [retry] = useState(() => createRetry());
  const [resume, setResume] = useState<At | null>(null);
  const [dead, setDead] = useState(false);
  const onDead = (at: At | null) => {
    if (at) setResume(at);
    if (retry.take()) renew();
    else setDead(true);
  };
  const again = () => {
    retry.reset();
    setDead(false);
    renew();
  };
  if (error || dead)
    return (
      <View style={{ gap: 8 }}>
        <Text style={[TYPE.sub, { color: c.muted }]}>{error ?? '영상을 재생하지 못했어요.'}</Text>
        <Pressable accessibilityRole="button" onPress={again} hitSlop={8} style={({ pressed }) => [pressed && { opacity: 0.6 }]}>
          <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>다시 불러오기</Text>
        </Pressable>
      </View>
    );
  if (!uri)
    return (
      <View style={[st.box, { backgroundColor: c.chip, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator />
      </View>
    );
  /* 주소가 바뀌면 재생기를 새로 — 이어 틀 자리 · 배속은 resume */
  return <Player key={uri} uri={uri} playerRef={playerRef} start={resume} onDead={onDead} />;
}

function Player({ uri, playerRef, start, onDead }: { uri: string; playerRef?: RefObject<VideoPlayer | null>; start: At | null; onDead: (at: At | null) => void }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    if (start) {
      p.currentTime = start.time;
      p.playbackRate = start.rate;
      if (start.playing) p.play();
    }
  });
  /* 오류 직전에 틀고 있었나 — 오류가 나면 재생이 멈춰 그때 읽으면 늘 멈춤이다 */
  const playing = useRef(false);
  useEventListener(player, 'playingChange', ({ isPlaying }) => {
    playing.current = isPlaying;
  });
  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'error') onDead(where(player, playing.current));
  });
  useEffect(() => {
    if (!playerRef) return;
    playerRef.current = player;
    return () => {
      playerRef.current = null;
    };
  }, [player, playerRef]);
  return <VideoView player={player} style={st.box} nativeControls contentFit="contain" />;
}

/** 이어 틀 자리 · 배속 — 재생기가 이미 놓였으면 null */
function where(p: VideoPlayer, playing: boolean): At | null {
  try {
    return { time: p.currentTime, rate: p.playbackRate, playing };
  } catch {
    return null;
  }
}

/** 지금 재생 시각(초) — 재생기가 이미 놓였으면 null */
export function playerTime(p: VideoPlayer | null): number | null {
  try {
    return p ? Math.round(p.currentTime * 10) / 10 : null;
  } catch {
    return null;
  }
}

/** 그 초로 옮기고 멈춘다 */
export function seekPlayer(p: VideoPlayer | null, sec: number) {
  try {
    if (!p) return;
    p.pause();
    p.currentTime = sec;
  } catch {}
}

/** '1:05' */
export const secText = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

const st = StyleSheet.create({
  box: { width: '100%', aspectRatio: 16 / 9, borderRadius: 10, overflow: 'hidden', backgroundColor: '#000' },
});
