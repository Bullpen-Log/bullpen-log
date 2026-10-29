import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { File, Paths } from 'expo-file-system';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { cleanFeelNote, FEEL_NOTE_MAX, type NewVideo, type VideoSport } from '@/lib/my-videos';
import { isPhoneVideoPath, phoneAssetId, phoneVideoPath } from '@/lib/phone-video-path';
import { toDateKey } from '@/lib/pitch-stats';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette, withAlpha } from '~/lib/ui';
import { discardServerVideo, loadMe } from '~/pitch/api';
import { PICK_ORIGINAL, attach, attachErrorText, dropPickerTemp, readVideoFacts, saveToPhone } from '~/pitch/attach';
import { Segmented } from '~/shell/heading';
import { Icon } from '~/shell/icon';
import { DateNavButton } from '~/shell/mini-calendar';
import { Press } from '~/shell/press';
import { toast } from '~/shell/toast';
import { outboxOwner } from '~/workout/outbox';
import { LocalVideo } from '../../../modules/local-video';
import { DetailPlayer } from '~/videos/detail-player';
import { FlowBar, FooterActions, Outcome, VideoSummary } from '~/videos/flow-parts';
import {
  clearVideoDraft,
  enqueueVideo,
  keepVideoDraft,
  loadVideoDraft,
  markAdded,
  sendStopped,
  sendVideoNow,
  useQueueVersion,
  videoOutbox,
  videoStatusOf,
} from '~/videos/outbox';
import type { VideoDraft } from '~/videos/queue-core';
import { durationText, videoDateText } from '~/videos/text';

/**
 * 영상 추가(2026-10-29 확정 시안 01-add) — 앨범 · 촬영 → 파일 준비 → 저장 전 확인(날짜 · 메모 · 추가 정보) → 저장 → 완료 · 동기화 대기 · 실패.
 * 투구수 · 강도를 묻지 않아 운동량 · 부하 · 체크인이 그대로다.
 *   - 앨범 · 카메라는 시스템 화면(expo-image-picker). 카메라는 권한부터 묻고, 막혔으면 설정 열기 · 앨범으로 돌아갈 길을 준다. 사진 전체 접근은 묻지 않는다(시스템 선택기).
 *   - 파일 준비(회원 = 이 기기 싱커 앱 안에 사본, 관리자 = 서버) 와 영상 정보 저장(대기열 → 서버)은 다른 단계로 보인다. 진행률을 모르면 퍼센트를 만들지 않는다.
 *   - 고르면 바로 계정별 초안으로 남기고, 메모 · 날짜 · 종류를 고칠 때마다 다시 남긴다 — 나가도(뒤로 · 끌어내림) 목록의 '작성 중인 영상 이어서'로 돌아온다.
 *   - [추가 취소]만 이번에 만든 사본을 지운다(앨범 원본 · 기존 내 영상은 그대로). 영상 바꾸기는 새 파일이 준비된 뒤에야 옛 사본을 지운다.
 *   - 저장: 폰에 줄을 먼저 적고(실패하면 저장 실패 — 초안 유지) → 초안을 지우고 → 보낸다. 15초 안에 서버 답이 없으면 동기화 대기(뒤에서 이어 보냄).
 */
type Stage =
  | { k: 'picking'; replacing: boolean }
  | { k: 'preparing'; server: boolean; replacing: boolean }
  | { k: 'form' }
  | { k: 'saving' }
  | { k: 'pending' }
  | { k: 'saved' }
  | { k: 'permission'; settings: boolean; granted: boolean }
  | { k: 'problem'; title: string; text: string; name: string | null }
  | { k: 'loading' };

const SPORTS: { value: VideoSport; label: string }[] = [
  { value: 'pitch', label: '투구' },
  { value: 'hit', label: '타격' },
];
const SOURCE_TEXT: Record<NewVideo['capturedSource'], string> = {
  header: '파일에서 읽은 날짜',
  camera: '촬영한 날',
  manual: '직접 고른 날짜',
  unknown: '날짜 모름 · 그대로 저장할 수 있어요',
};
const newId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === 'x' ? r : (r & 3) | 8).toString(16);
  });
const MB = 1024 * 1024;
/** 폰에 사본을 넣을 때 남겨 둘 여유 — 다 채우면 기기가 앱을 멈춘다 */
const SPACE_MARGIN = 200 * MB;

type Picked = { kind: 'asset'; asset: ImagePicker.ImagePickerAsset } | { kind: 'cancel' } | { kind: 'permission'; settings: boolean } | { kind: 'error'; text: string };
type Prepared = { ok: true; input: NewVideo; fileName: string | null; owner: string } | { ok: false; title: string; text: string; name: string | null };

/** 카메라 권한 — 묻지 않았으면 묻고, 막혔으면 설정에서만 풀 수 있는지 */
async function cameraAccess(): Promise<'ok' | 'denied' | 'settings'> {
  const cur = await ImagePicker.getCameraPermissionsAsync();
  if (cur.granted) return 'ok';
  if (!cur.canAskAgain) return 'settings';
  const r = await ImagePicker.requestCameraPermissionsAsync();
  return r.granted ? 'ok' : r.canAskAgain ? 'denied' : 'settings';
}

/** 시스템 선택기 · 카메라를 한 번 연다(길이 상한 180초 — 예전과 같음) */
async function launch(source: 'album' | 'camera'): Promise<Picked> {
  try {
    if (source === 'camera') {
      const access = await cameraAccess();
      if (access !== 'ok') return { kind: 'permission', settings: access === 'settings' };
    }
    const opts: ImagePicker.ImagePickerOptions = { ...PICK_ORIGINAL, videoMaxDuration: 180 };
    const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
    const asset = res.canceled ? null : res.assets?.[0];
    return asset ? { kind: 'asset', asset } : { kind: 'cancel' };
  } catch (e) {
    return { kind: 'error', text: attachErrorText(e, source === 'camera' ? '카메라를 열지 못했어요.' : '사진 앱을 열지 못했어요.') };
  }
}

const sizeOf = (asset: ImagePicker.ImagePickerAsset): number | null => {
  if (asset.fileSize) return asset.fileSize;
  try {
    return new File(asset.uri).size ?? null;
  } catch {
    return null;
  }
};
const freeSpace = (): number | null => {
  try {
    const n = Paths.availableDiskSpace;
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
};
const noSpace = (size: number | null) => ({
  ok: false as const,
  title: '이 기기에 공간이 부족해요',
  text: `${size ? `영상 ${Math.round(size / MB)}MB를 ` : '영상을 '}넣을 자리가 모자라요. 사진 · 앱을 정리한 뒤 다시 골라 주세요. 앨범 원본은 그대로예요.`,
  name: null,
});
/* 계정 묻기는 길어도 5초 — 신호가 없으면 껍데기가 아는 계정으로(폰에 넣는다) */
const meOrNull = () => Promise.race([loadMe().catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 5000))]);

/** 고른 영상 → 보관할 사본 + 저장할 칸. 실패는 까닭별 글(형식 · 공간 · 읽기) */
async function prepare(asset: ImagePicker.ImagePickerAsset, camera: boolean, onServer: (server: boolean) => void): Promise<Prepared> {
  const name = asset.fileName ?? null;
  if (asset.type && asset.type !== 'video')
    return { ok: false, title: '영상 파일이 아니에요', text: '사진이 아니라 영상을 골라 주세요.', name };
  const me = await meOrNull();
  const owner = me?.userId ?? outboxOwner();
  if (!owner) return { ok: false, title: '계정을 확인하지 못했어요', text: '신호가 잡히면 다시 해 주세요. 앨범 원본은 그대로예요.', name };
  const admin = !!me?.isAdmin;
  onServer(admin);
  const size = sizeOf(asset);
  const free = freeSpace();
  if (!admin && size != null && free != null && size + SPACE_MARGIN > free) return noSpace(size);
  const facts = await readVideoFacts(asset.uri).catch(() => null);
  let path: string | null;
  try {
    if (admin) path = await attach(asset, true);
    else {
      path = phoneVideoPath(owner, await saveToPhone(asset.uri));
      dropPickerTemp(asset.uri);
    }
  } catch (e) {
    const after = freeSpace();
    if (!admin && size != null && after != null && size > after) return noSpace(size);
    return { ok: false, title: '이 영상을 읽지 못했어요', text: attachErrorText(e, '다른 영상을 골라 주세요.'), name };
  }
  if (!path) return { ok: false, title: '이 영상을 읽지 못했어요', text: '다른 영상을 골라 주세요.', name };
  const at = camera ? Date.now() : (facts?.startMs ?? null);
  return {
    ok: true,
    owner,
    fileName: name,
    input: {
      clientId: newId(),
      path,
      sport: 'pitch',
      origin: camera ? 'camera' : 'album',
      capturedAt: at != null ? new Date(at).toISOString() : null,
      capturedDate: at != null ? toDateKey(new Date(at)) : null,
      capturedSource: camera ? 'camera' : at != null ? 'header' : 'unknown',
      feelNote: null,
      durationSec: facts?.durationSec ?? (asset.duration ? asset.duration / 1000 : null),
      width: asset.width || null,
      height: asset.height || null,
    },
  };
}

/** 이번에 만든 사본만 지운다 — 회원은 이 기기 앱 안 사본, 관리자는 서버(아무 데도 안 붙었을 때만 서버가 지움) */
function dropCopy(path: string) {
  if (isPhoneVideoPath(path)) void LocalVideo.remove({ ids: [phoneAssetId(path)] }).catch(() => undefined);
  else void discardServerVideo(path);
}

export default function NewVideoScreen() {
  const c = usePalette();
  const params = useLocalSearchParams<{ source?: string; sport?: string; resume?: string }>();
  const resume = params.resume === '1';
  const firstSource: 'album' | 'camera' = params.source === 'camera' ? 'camera' : 'album';
  const today = toDateKey(new Date());
  const [stage, setStage] = useState<Stage>(() =>
    !resume
      ? { k: 'picking', replacing: false }
      : outboxOwner()
        ? { k: 'loading' }
        : { k: 'problem', title: '계정을 확인하지 못했어요', text: '잠시 뒤 다시 열어 주세요.', name: null }
  );
  const [video, setVideo] = useState<NewVideo | null>(null);
  const [owner, setOwner] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [extra, setExtra] = useState(params.sport === 'hit');
  const [formError, setFormError] = useState<string | null>(null);
  const [draftWarn, setDraftWarn] = useState(false);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [queued, setQueued] = useState(false);
  /* 이어 쓰기인데 이 기기에 파일이 없음 — 저장을 막고 바꾸기 · 취소만 */
  const [fileGone, setFileGone] = useState(false);
  const launching = useRef(false);
  const started = useRef(false);
  /* 줄로 넘겼거나(저장) 취소했으면 더는 초안을 남기지 않는다 — 나갈 때의 마지막 남기기가 지운 초안을 되살리지 않게 */
  const frozen = useRef(false);
  useQueueVersion();

  /* 지금 칸 → 초안(고칠 때마다 · 나갈 때 · 앱이 뒤로 갈 때) — 저장 단계에 들어간 뒤로는 줄이 원본이라 남기지 않는다 */
  const latest = useRef<VideoDraft | null>(null);
  useEffect(() => {
    latest.current = video && owner && !queued ? { owner, input: { ...video, feelNote: note || null }, fileName, updatedAt: Date.now() } : null;
  }, [video, owner, note, fileName, queued]);
  const flush = () => {
    const d = latest.current;
    if (!d || frozen.current) return Promise.resolve();
    return keepVideoDraft(d).then(
      () => setDraftWarn(false),
      () => setDraftWarn(true)
    );
  };
  useEffect(() => {
    if (!video || queued) return;
    const t = setTimeout(() => void flush(), 400);
    return () => clearTimeout(t);
  }, [video, note, fileName, queued]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') void flush();
    });
    return () => {
      sub.remove();
      void flush();
    };
  }, []);

  /** 앨범 · 카메라를 한 번만 연다(두 번 눌러도 · 앱이 가려졌다 와도 다시 안 열림) */
  const pick = (source: 'album' | 'camera', replacing: boolean) => {
    if (launching.current) return;
    launching.current = true;
    setFormError(null);
    setStage({ k: 'picking', replacing });
    void launch(source)
      .then((r) => {
        if (r.kind === 'cancel') {
          if (replacing || video) setStage({ k: 'form' });
          else router.back();
          return;
        }
        if (r.kind === 'permission') return setStage({ k: 'permission', settings: r.settings, granted: false });
        if (r.kind === 'error') {
          if (video) {
            setStage({ k: 'form' });
            setFormError(`${r.text} 지금 영상은 그대로예요.`);
          } else setStage({ k: 'problem', title: '영상을 가져오지 못했어요', text: r.text, name: null });
          return;
        }
        setStage({ k: 'preparing', server: false, replacing });
        return prepare(r.asset, source === 'camera', (server) => setStage({ k: 'preparing', server, replacing })).then((p) => {
          if (!p.ok) {
            if (video) {
              setStage({ k: 'form' });
              setFormError(`${p.title}. ${p.text} 지금 영상은 그대로예요.`);
            } else setStage({ k: 'problem', title: p.title, text: p.text, name: p.name });
            return;
          }
          const old = video;
          /* 바꾸기 — 메모 · 종류는 그대로, 날짜 · 길이는 새 파일 것. 번호는 새로(새 영상은 새 번호) */
          const next: NewVideo = old ? { ...p.input, sport: old.sport } : { ...p.input, sport: params.sport === 'hit' ? 'hit' : 'pitch' };
          const d: VideoDraft = { owner: p.owner, input: { ...next, feelNote: note || null }, fileName: p.fileName, updatedAt: Date.now() };
          /* 새 초안을 먼저 남기고 → 그다음 옛 사본을 지운다(사이에 앱이 죽어도 초안이 지운 파일을 가리키지 않게) */
          return keepVideoDraft(d)
            .then(
              () => setDraftWarn(false),
              () => setDraftWarn(true)
            )
            .then(() => {
              if (old && old.path !== next.path) dropCopy(old.path);
              setOwner(p.owner);
              setFileGone(false);
              setVideo(next);
              setFileName(p.fileName);
              setStage({ k: 'form' });
            });
        });
      })
      .finally(() => {
        launching.current = false;
      });
  };

  /* 처음 — 이어 쓰기면 초안을 읽고(파일이 이 기기에 있는지도), 아니면 고른 길을 연다 */
  const begin = useEffectEvent(() => {
    if (started.current) return;
    started.current = true;
    if (!resume) return pick(firstSource, false);
    const me = outboxOwner();
    if (!me) return;
    void loadVideoDraft(me).then(
      (d) => {
        if (!d) return setStage({ k: 'problem', title: '작성 중인 영상이 없어요', text: '이미 저장했거나 취소한 영상이에요.', name: null });
        setOwner(d.owner);
        setVideo(d.input);
        setNote(d.input.feelNote ?? '');
        setFileName(d.fileName);
        setExtra(d.input.sport === 'hit');
        if (!isPhoneVideoPath(d.input.path)) return setStage({ k: 'form' });
        return LocalVideo.exists({ ids: [phoneAssetId(d.input.path)] }).then(
          ({ found }) => {
            setStage({ k: 'form' });
            if (!found.length) {
              setFileGone(true);
              setFormError('이 기기에서 영상 파일을 찾지 못했어요. 영상 바꾸기로 다시 고르거나 추가를 취소해 주세요.');
            }
          },
          () => setStage({ k: 'form' })
        );
      },
      () => setStage({ k: 'problem', title: '작성 중인 영상을 읽지 못했어요', text: '잠시 뒤 다시 열어 주세요.', name: null })
    );
  });
  useEffect(() => {
    begin();
  }, []);

  /* 설정에서 돌아왔을 때 — 카메라 권한을 다시 본다(저절로 카메라를 열지는 않는다) */
  useEffect(() => {
    if (stage.k !== 'permission') return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s !== 'active') return;
      void ImagePicker.getCameraPermissionsAsync().then(
        (p) => setStage((st) => (st.k === 'permission' ? { ...st, granted: p.granted } : st)),
        () => undefined
      );
    });
    return () => sub.remove();
  }, [stage.k]);

  const clientId = video?.clientId ?? null;
  /* 동기화 대기 화면에서 뒤에서 보내기가 끝나면 그대로 완료 · 실패로 바뀐다 */
  const live = clientId && stage.k === 'pending' ? videoStatusOf(clientId) : null;
  const failedRow = video && queued ? videoOutbox.stateOf(video.path) : null;
  const shown: Stage = live === 'sent' ? { k: 'saved' } : live === 'failed' ? { k: 'form' } : stage;
  const shownError = formError ?? (live === 'failed' ? `${failedRow?.error ?? '서버가 영상 정보를 받지 않았어요.'} 영상과 메모는 남아 있어요.` : null);
  const serverPath = video ? !isPhoneVideoPath(video.path) : false;

  const save = () => {
    if (!video || !owner || stage.k === 'saving' || fileGone) return;
    if (outboxOwner() !== owner) {
      setFormError('로그인한 계정이 바뀌었어요. 이 영상을 고른 계정으로 다시 로그인하면 이어서 저장할 수 있어요.');
      return;
    }
    const input: NewVideo = { ...video, feelNote: cleanFeelNote(note) };
    setFormError(null);
    setSyncNote(null);
    setStage({ k: 'saving' });
    void enqueueVideo(owner, input)
      .then(
        () => {
          frozen.current = true;
          setQueued(true);
          setNote(input.feelNote ?? '');
          markAdded(input.path);
          /* 초안은 줄로 넘어간 뒤에 지운다(못 지워도 목록은 줄이 있는 번호의 초안을 숨긴다) */
          void clearVideoDraft(owner, input.clientId).catch(() => undefined);
          return sendVideoNow(input.clientId).then((s) => {
            if (s === 'sent' || s === 'gone') {
              void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              setStage({ k: 'saved' });
            } else if (s === 'failed') {
              setStage({ k: 'form' });
              setFormError(`${videoOutbox.stateOf(input.path)?.error ?? '서버가 영상 정보를 받지 않았어요.'} 영상과 메모는 이 화면과 내 영상 목록에 남아 있어요.`);
            } else {
              setStage({ k: 'pending' });
              if (sendStopped() === 'login') setSyncNote('로그인이 풀려 아직 못 보냈어요. 다시 로그인하면 이어서 보내요.');
            }
          });
        },
        () => {
          setStage({ k: 'form' });
          setFormError('이 기기에 영상 정보를 저장하지 못했어요. 영상과 메모는 이 화면에 남아 있어요. 기기 공간을 확인한 뒤 다시 저장해 주세요.');
        }
      );
  };
  const resync = () => {
    if (!clientId) return;
    setSyncNote(null);
    void sendVideoNow(clientId).then((s) => {
      if (s === 'sent' || s === 'gone') setStage({ k: 'saved' });
      else if (s === 'failed') {
        setStage({ k: 'form' });
        setFormError(`${video ? (videoOutbox.stateOf(video.path)?.error ?? '') : ''} 영상과 메모는 남아 있어요.`.trim());
      } else setSyncNote(sendStopped() === 'login' ? '로그인이 풀려 아직 못 보냈어요. 다시 로그인하면 이어서 보내요.' : '아직 연결되지 않았어요. 영상은 이 기기에 그대로 있어요.');
    });
  };

  /** 추가 취소 — 초안을 먼저 지우고(못 지우면 멈춤) 이번 사본을 지운다 */
  const cancelAdd = () => {
    if (!video || !owner) return router.back();
    const v = video;
    const keep = frozen.current;
    frozen.current = true;
    void clearVideoDraft(owner, v.clientId).then(
      () => {
        dropCopy(v.path);
        router.back();
      },
      () => {
        frozen.current = keep;
        Alert.alert('취소하지 못했어요', '기기에 남긴 초안을 지우지 못했어요. 잠시 뒤 다시 해 주세요.');
      }
    );
  };
  const askCancel = () =>
    Alert.alert('추가를 취소할까요?', '이번에 준비한 영상과 작성한 메모를 남기지 않고 돌아가요. 앨범에 있는 원본과 기존 내 영상은 그대로예요.', [
      { text: '계속 작성', style: 'cancel' },
      { text: '추가 취소', style: 'destructive', onPress: cancelAdd },
    ]);
  const back = () => {
    if (shown.k === 'form' && video && !queued)
      return Alert.alert('잠시 나갈까요?', '준비한 영상과 메모를 남겨두고 돌아올 수 있어요. 내 영상 목록에서 이어서 작성할 수 있어요.', [
        { text: '계속 작성', style: 'cancel' },
        { text: '초안 남기고 나가기', onPress: () => void flush().then(() => router.back()) },
        { text: '추가 취소', style: 'destructive', onPress: askCancel },
      ]);
    if (shown.k === 'form' && queued) toast('저장하지 못한 영상은 내 영상 목록에 ‘저장 실패’로 남아요.', 'info');
    if ((shown.k === 'permission' || shown.k === 'problem') && video) return setStage({ k: 'form' });
    router.back();
  };
  const storageInfo = () =>
    Alert.alert(
      '저장 위치',
      serverPath
        ? '관리자 영상은 싱커 서버에 보관해요. 앨범에서 가져온 원본은 그대로 남아요.'
        : '영상은 이 기기의 싱커 앱 안에 보관돼요. 서버에는 영상 정보(날짜 · 메모 · 종류)만 동기화돼요. 앨범에서 가져온 원본은 그대로 남아요. 싱커 앱을 지우면 앱 안의 영상도 함께 지워질 수 있어요.'
    );
  const pickDate = (d: string) => setVideo((v) => (v ? { ...v, capturedDate: d, capturedSource: 'manual' } : v));
  const clearDate = () => setVideo((v) => (v ? { ...v, capturedDate: null, capturedSource: 'unknown' } : v));

  const busy = shown.k === 'picking' || shown.k === 'preparing' || shown.k === 'saving' || shown.k === 'loading';
  const title = shown.k === 'picking' && !video ? (firstSource === 'camera' ? '촬영하기' : '앨범에서 가져오기') : '영상 추가';
  const summary = video ? (
    <VideoSummary
      path={video.path}
      title={cleanFeelNote(note) ?? (video.origin === 'camera' ? '새로 촬영한 영상' : '앨범에서 가져온 영상')}
      sub={[videoDateText(video.capturedDate), durationText(video.durationSec)].filter(Boolean).join(' · ')}
      badge={shown.k === 'saved' ? { icon: 'check', label: '저장됨' } : { icon: 'refresh-cw', label: '동기화 대기' }}
    />
  ) : null;

  let body: React.ReactNode = null;
  let footer: React.ReactNode = null;
  switch (shown.k) {
    case 'loading':
    case 'picking':
      body = (
        <View style={styles.wait}>
          <ActivityIndicator />
        </View>
      );
      break;
    case 'preparing':
      body = (
        <Outcome
          icon="film"
          busy
          title="영상을 준비하고 있어요"
          text={shown.server ? '서버에 보관할 파일을 올리고 있어요.' : '싱커에 보관할 파일을 이 기기에 준비하고 있어요.'}
        />
      );
      footer = <FooterActions note="완료될 때까지 잠시 기다려 주세요. 앨범 원본은 그대로예요." />;
      break;
    case 'saving':
      body = <Outcome icon="film" busy title="영상 정보를 저장하고 있어요" text="잠시만 기다려 주세요." />;
      footer = <FooterActions note={serverPath ? null : '영상은 이 기기에 보관돼요.'} />;
      break;
    case 'pending':
      body = (
        <Outcome
          icon="refresh-cw"
          tone="warn"
          title="동기화 대기 중이에요"
          text={serverPath ? '영상은 서버에 있어요. 연결되면 영상 정보가 저장돼요.' : '영상은 이 기기에 저장됐어요. 연결되면 영상 정보가 동기화돼요.'}
        >
          {summary}
          {syncNote ? <Text style={[TYPE.sub, { color: c.muted, textAlign: 'center' }]}>{syncNote}</Text> : null}
        </Outcome>
      );
      footer = (
        <FooterActions primary={{ label: '내 영상으로', onPress: () => router.back() }} secondary={{ label: '다시 동기화', icon: 'refresh-cw', onPress: resync }} />
      );
      break;
    case 'saved':
      body = (
        <Outcome icon="check" tone="good" title="내 영상에 저장했어요">
          {summary}
        </Outcome>
      );
      footer = (
        <FooterActions
          primary={{ label: '내 영상으로', onPress: () => router.back() }}
          secondary={{ label: '다른 영상 추가', icon: 'plus', onPress: () => router.replace({ pathname: '/my-videos/add' as never, params: { sport: video?.sport ?? 'pitch' } }) }}
        />
      );
      break;
    case 'permission':
      body = (
        <Outcome
          icon="camera"
          tone="warn"
          title={shown.granted ? '이제 촬영할 수 있어요' : '카메라 접근이 필요해요'}
          text={
            shown.granted
              ? '카메라 접근이 허용됐어요.'
              : shown.settings
                ? '설정에서 싱커의 카메라 접근을 허용한 뒤 다시 촬영할 수 있어요.'
                : '영상을 찍으려면 카메라 접근을 허용해 주세요.'
          }
        />
      );
      footer = (
        <FooterActions
          primary={
            shown.granted || !shown.settings
              ? { label: '촬영하기', icon: 'camera', onPress: () => pick('camera', false) }
              : { label: '설정 열기', onPress: () => void Linking.openSettings() }
          }
          secondary={{ label: '앨범에서 가져오기', icon: 'image-plus', onPress: () => pick('album', !!video) }}
        />
      );
      break;
    case 'problem':
      body = (
        <Outcome icon="circle-alert" tone="danger" title={shown.title} text={shown.text}>
          {shown.name ? <Text style={[TYPE.sub, { color: c.muted, textAlign: 'center' }]}>{shown.name}</Text> : null}
        </Outcome>
      );
      footer = (
        <FooterActions
          primary={{ label: '다른 영상 선택', icon: 'image-plus', onPress: () => pick('album', !!video) }}
          secondary={{ label: video ? '작성 화면으로' : '돌아가기', onPress: back }}
        />
      );
      break;
    case 'form':
      if (!video) break;
      body = (
        <>
          {shownError ? (
            <View accessibilityRole="alert" style={[styles.inlineError, { backgroundColor: withAlpha(c.danger, 0.08) }]}>
              <Icon name="circle-alert" size={18} color={c.danger} />
              <Text style={[TYPE.body, { flex: 1, color: c.ink }]}>{shownError}</Text>
            </View>
          ) : null}
          <DetailPlayer path={video.path} drawing={false} onDrawingDone={() => undefined} />
          <View style={styles.fileRow}>
            <Text numberOfLines={1} style={[TYPE.sub, { flex: 1, color: c.muted }]}>
              {[fileName, durationText(video.durationSec)].filter(Boolean).join(' · ') || '선택한 영상'}
            </Text>
            <Press accessibilityRole="button" accessibilityLabel="영상 바꾸기 — 앨범에서 다른 영상 고르기" onPress={() => pick('album', true)} hitSlop={8}>
              <Text style={[TYPE.buttonCompact, { color: c.link }]}>영상 바꾸기</Text>
            </Press>
          </View>
          <View style={[styles.group, { backgroundColor: c.card, boxShadow: c.float }]}>
            <View style={styles.dateRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>촬영 날짜</Text>
                <Text style={[TYPE.sub, { color: c.muted }]}>{SOURCE_TEXT[video.capturedDate ? video.capturedSource : 'unknown']}</Text>
              </View>
              <DateNavButton
                label={video.capturedDate ? videoDateText(video.capturedDate) : '날짜 모름'}
                date={video.capturedDate ?? ''}
                today={today}
                min="2015-01-01"
                marked={() => false}
                onPick={pickDate}
              />
            </View>
            {video.capturedDate ? (
              <Press accessibilityRole="button" onPress={clearDate} style={styles.unknownDate} hitSlop={6}>
                <Text style={[TYPE.sub, { color: c.link }]}>날짜 모름으로 저장</Text>
              </Press>
            ) : null}
          </View>
          <View style={{ gap: 6 }}>
            <Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>
              영상 메모 <Text style={[TYPE.sub, { color: c.muted, fontWeight: '400' }]}>선택</Text>
            </Text>
            <TextInput
              value={note}
              onChangeText={setNote}
              multiline
              submitBehavior="blurAndSubmit"
              returnKeyType="done"
              maxLength={FEEL_NOTE_MAX}
              placeholder="이 영상에서 느낀 점"
              placeholderTextColor={c.muted}
              accessibilityLabel={`영상 메모, 선택, ${FEEL_NOTE_MAX}자까지`}
              style={[styles.note, { color: c.ink, backgroundColor: c.card, boxShadow: c.float }]}
            />
            {note ? (
              <Text style={[TYPE.sub, { color: c.muted, textAlign: 'right', fontVariant: ['tabular-nums'] }]}>
                {[...note].length}/{FEEL_NOTE_MAX}
              </Text>
            ) : null}
          </View>
          <View style={{ gap: 10 }}>
            <Press accessibilityRole="button" accessibilityState={{ expanded: extra }} onPress={() => setExtra((x) => !x)} style={styles.extraToggle}>
              <Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>추가 정보</Text>
              <Icon name={extra ? 'chevron-up' : 'chevron-down'} size={18} color={c.muted} />
            </Press>
            {extra ? <Segmented options={SPORTS} value={video.sport} onChange={(sport) => setVideo((v) => (v ? { ...v, sport } : v))} label="영상 종류" /> : null}
          </View>
          <Text style={[TYPE.sub, { color: c.muted }]}>투구수 · 강도는 묻지 않아요. 운동량 · 부하에 더해지지 않아요.</Text>
          {draftWarn ? (
            <Text style={[TYPE.sub, { color: c.warn }]}>작성 중인 내용을 이 기기에 남기지 못했어요. 저장을 마치기 전에 앱을 닫으면 사라질 수 있어요.</Text>
          ) : null}
        </>
      );
      footer = (
        <FooterActions
          primary={{ label: queued ? '다시 저장' : '내 영상에 저장', disabled: fileGone, onPress: save }}
          secondary={{ label: serverPath ? '저장 위치 · 서버' : '저장 위치 · 이 기기', icon: serverPath ? 'film' : 'lock', onPress: storageInfo }}
        />
      );
      break;
  }

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      {/* 끌어내려 닫기 = 초안 남기고 나가기(나갈 때 남긴다). 준비 · 저장 중엔 막는다 */}
      <Stack.Screen options={{ gestureEnabled: !busy }} />
      <View style={{ paddingTop: 8 }}>
        <FlowBar
          title={title}
          onBack={back}
          backLabel={shown.k === 'form' && video && !queued ? '뒤로 — 초안을 남기거나 추가를 취소해요' : '뒤로'}
          backDisabled={busy}
          right={shown.k === 'form' && video && !queued ? { label: '취소', onPress: askCancel } : null}
        />
      </View>
      <ScrollView
        keyboardDismissMode="interactive"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: 32 }, READABLE]}
      >
        {body}
      </ScrollView>
      {footer}
    </View>
  );
}

const styles = StyleSheet.create({
  wait: { paddingTop: 80, alignItems: 'center' },
  inlineError: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: 14 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44 },
  group: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 6 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56 },
  unknownDate: { alignSelf: 'flex-end', minHeight: 36, justifyContent: 'center' },
  note: { minHeight: 88, borderRadius: 14, padding: 12, fontSize: 16, lineHeight: 22, textAlignVertical: 'top' },
  extraToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
});
