import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { createUploadTask, FileSystemUploadType } from 'expo-file-system/legacy';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, useState, type RefObject } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { ORG_VIDEO_MAX_BYTES } from '@/lib/org/comments';
import { call } from '~/community/parts';
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

/** 재생 주소 — 화면이 켜진 동안 같은 경로는 다시 안 묻는다(서명 주소는 서버가 한동안 같은 것을 준다) */
const urlCache = new Map<string, string>();

function useOrgVideoUrl(path: string, who: VideoWho): { uri: string | null; error: string | null } {
  const [state, setState] = useState<{ path: string; uri: string | null; error: string | null }>({ path, uri: urlCache.get(path) ?? null, error: null });
  const scopeId = who.role === 'coach' ? who.orgId : who.memberId;
  useEffect(() => {
    if (urlCache.has(path)) return;
    let alive = true;
    void (who.role === 'coach'
      ? call<{ ok: true; urls: Record<string, string> }>('app-lesson.coachVideoUrls', scopeId, [path])
      : call<{ ok: true; urls: Record<string, string> }>('app-lesson.myVideoUrls', scopeId, [path])
    ).then((r) => {
      if (!alive) return;
      const uri = r.ok ? r.urls[path] : undefined;
      if (uri) urlCache.set(path, uri);
      setState({ path, uri: uri ?? null, error: uri ? null : '영상을 불러오지 못했어요.' });
    });
    return () => {
      alive = false;
    };
  }, [path, who.role, scopeId]);
  return state.path === path ? { uri: state.uri ?? urlCache.get(path) ?? null, error: state.error } : { uri: urlCache.get(path) ?? null, error: null };
}

/** 조직 영상 하나 — playerRef 를 주면 지금 시각(영상 시점 말) · 옮기기(시점 말 누름)에 쓴다 */
export function OrgVideo({ path, who, playerRef, c }: { path: string; who: VideoWho; playerRef?: RefObject<VideoPlayer | null>; c: Palette }) {
  const { uri, error } = useOrgVideoUrl(path, who);
  if (error) return <Text style={[TYPE.sub, { color: c.muted }]}>{error}</Text>;
  if (!uri)
    return (
      <View style={[st.box, { backgroundColor: c.chip, alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator />
      </View>
    );
  return <Player uri={uri} playerRef={playerRef} />;
}

function Player({ uri, playerRef }: { uri: string; playerRef?: RefObject<VideoPlayer | null> }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
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
