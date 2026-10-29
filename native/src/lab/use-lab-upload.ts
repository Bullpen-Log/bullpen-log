import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { createVideoPlayer, type VideoThumbnail } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { labPairBlock, labVideoBlock, type LabCapture, type LabVideoInfo } from '@/lib/pitch-lab-guard';
import {
  LAB_MAX_VIDEO_BYTES,
  LAB_MAX_VIDEO_MB,
  LAB_VIEWS,
  labViewLabel,
  type LabBat,
  type LabGround,
  type LabHand,
  type LabMeta,
  type LabSport,
  type LabView,
} from '@/lib/pitch-lab-meta';
import { swingViewLabel } from '@/lib/swing-lab-meta';
import { probeLabAsset, uploadLabVideo } from '~/lab/upload';
import { PICK_ORIGINAL, dropPickerTemp } from '~/pitch/attach';
import { rpc } from '~/lib/rpc';

/**
 * 옆 · 뒤 영상 짝 고르기 · 검사 · 올리기 — 관리자 샘플 화면(app/lab/samples.tsx · swing/samples.tsx)의 올리기 카드와 사용자 새 분석 흐름(app/lab/new.tsx)이 같이 쓴다.
 * 올리기 전 검사 · 짝 검사 · 지문은 웹과 같은 lib(pitch-lab-guard), 서버 saveLabSample 이 한 번 더 본다.
 * sport 'hit' = 3D 스윙 분석(타자, 2026-10-21) — 칸 이름이 정면 · 포수 뒤, 저장은 swing-lab.saveSwingSample, 마커 샘플이면 ③ · ④ 카메라(extras)도 올린다.
 *
 * 2026-10-29 새 분석 화면(한 화면 두 칸): 칸마다 검사 중 · 문제를 따로 쥐고, 칸마다 차례표(token)로 늦게 끝난 검사가 바꾼 · 지운 칸을 덮지 않게 한다.
 * 옆 · 뒤 바꾸기는 파일 · 검사 결과 · 장면 그림을 통째로 맞바꾸고 올릴 곳(샘플 번호)을 새로 잡는다. 올리기는 두 파일의 실제 보낸 바이트를 합쳐 세고,
 * 같은 샘플 번호로 다시 올리면 이미 끝난 칸은 건너뛴다(정보 저장만 실패했으면 영상을 다시 보내지 않는다).
 */
export type LabPicked = {
  asset: ImagePicker.ImagePickerAsset;
  fps: number | null;
  cap: LabCapture & { fp: string };
  /** 파일 머리에서 읽은 것(길이 · 해상도 · 렌즈) — 못 읽은 칸은 null */
  info: LabVideoInfo;
  /** 영상에서 뽑은 한 장면 — 뽑는 중이면 undefined, 못 뽑으면 null(필름 그림) */
  thumb?: VideoThumbnail | null;
};
export type LabSlowmo = 'unknown' | '120' | '240';
export type LabUploadInfo = {
  slowmo: LabSlowmo;
  hand: LabHand;
  ground: LabGround;
  heightCm: number | null;
  distances?: Partial<Record<LabView, number>>;
  memo: string | null;
  /** 누구 투구 — 관리자 샘플 목록이 사람별로 묶는다(비면 '기타') */
  subject?: string | null;
  /** 타자 배트(sport 'hit') */
  bat?: LabBat;
  /** 마커 샘플(3D 개발 관리자, sport 'hit') */
  kind?: 'sample' | 'marker';
  /** 마커 샘플의 ③ · ④ 카메라(고른 것만) */
  extras?: Partial<Record<'cam3' | 'cam4', ImagePicker.ImagePickerAsset>>;
};
/** 칸 하나의 파일 문제 — blocked 면 촬영 안내로 보내는 줄을 띄운다 */
export type LabSlotError = { text: string; blocked: boolean };
/** 칸마다 보낸 양(진행 화면) */
export type LabSendState = Partial<Record<LabView, { sent: number; total: number; done: boolean }>>;

/** 샘플 번호(UUID v4 모양 — 사이트 isLabId) — 앱에는 crypto.randomUUID 가 없다. 사람마다 자기 폴더 안이라 Math.random 이면 겹칠 일이 없다 */
const newLabId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === 'x' ? r : (r & 3) | 8).toString(16);
  });

/** 고른 영상의 한 장면(0.2초) — 재생기를 잠깐 만들어 뽑고 바로 놓는다(store.ts frameThumbs 와 같은 길) */
async function thumbOf(uri: string): Promise<VideoThumbnail | null> {
  const player = createVideoPlayer(uri);
  try {
    const [shot] = await player.generateThumbnailsAsync(0.2, { maxWidth: 240 });
    return shot ?? null;
  } catch {
    return null;
  } finally {
    player.release();
  }
}

export function useLabUpload(hand: LabHand, sport: LabSport = 'pitch') {
  const viewLabel = (view: LabView) => (sport === 'hit' ? swingViewLabel(view, hand) : labViewLabel(view, hand));
  const [picked, setPicked] = useState<Partial<Record<LabView, LabPicked>>>({});
  const [checkingOf, setCheckingOf] = useState<Partial<Record<LabView, boolean>>>({});
  const [slotError, setSlotError] = useState<Partial<Record<LabView, LabSlotError>>>({});
  const [progress, setProgress] = useState<{ view: LabView; percent: number } | null>(null);
  const [sending, setSending] = useState<LabSendState>({});
  const [error, setError] = useState<string | null>(null);
  /* 검사에 막혀 고르지 않음 — 촬영 안내로 보내는 줄을 띄운다(관리자 샘플 화면) */
  const [blocked, setBlocked] = useState(false);
  /* 두 영상 다 고속(원본 슬로모)이면 고른 순간 저절로 채운 슬로모 배수 */
  const [autoSlowmo, setAutoSlowmo] = useState<LabSlowmo | null>(null);
  /* 고른 짝의 샘플 번호 — 다시 올리기도 같은 번호(서명 주소가 upsert 라 덮어씀). 짝이 바뀌면 새 번호 */
  const labId = useRef<string | null>(null);
  /* 그 번호로 이미 다 올린 칸 — 다시 올릴 때 건너뛴다 */
  const uploaded = useRef(new Set<string>());
  /* 칸마다 차례표 — 고르기 · 바꾸기 · 지우기마다 올라, 앞 검사의 늦은 답을 버린다 */
  const tokens = useRef<Record<LabView, number>>({ side: 0, back: 0 });
  /* 마지막에 그린 고른 것 — 고르기 · 지우기가 옛 파일을 지울 때(상태 읽기를 렌더 밖에서) */
  const pickedRef = useRef(picked);
  useEffect(() => {
    pickedRef.current = picked;
  }, [picked]);

  const busy = progress != null;
  const checking = LAB_VIEWS.find((v) => checkingOf[v]) ?? null;
  const pairBlock = picked.side && picked.back ? labPairBlock(picked.side.cap, picked.back.cap) : null;
  const ready = LAB_VIEWS.every((v) => picked[v]) && !pairBlock && !busy && checking == null;

  const resetTarget = () => {
    labId.current = null;
    uploaded.current = new Set();
  };
  const slowmoOf = (next: Partial<Record<LabView, LabPicked>>) => {
    const both = LAB_VIEWS.map((x) => next[x]?.fps);
    if (both.every((x): x is number => x != null && x >= 100)) setAutoSlowmo(Math.min(...both) >= 200 ? '240' : '120');
  };

  const pick = async (view: LabView) => {
    setError(null);
    setBlocked(false);
    const res = await ImagePicker.launchImageLibraryAsync(PICK_ORIGINAL);
    const asset = res.canceled ? null : res.assets[0];
    if (!asset) return;
    const token = ++tokens.current[view];
    const stale = () => tokens.current[view] !== token;
    /* 짝이 바뀐다 — 다음 올리기는 새 샘플 번호. 바뀌기 전 파일은 앱 캐시에서 지운다 */
    resetTarget();
    const old = pickedRef.current[view];
    if (old && old.asset.uri !== asset.uri) dropPickerTemp(old.asset.uri);
    setPicked((p) => ({ ...p, [view]: undefined }));
    setSlotError((e) => ({ ...e, [view]: undefined }));
    const fail = (text: string, isBlocked: boolean) => {
      dropPickerTemp(asset.uri);
      setSlotError((e) => ({ ...e, [view]: { text, blocked: isBlocked } }));
      setError(`${viewLabel(view)} 영상: ${text}`);
      setBlocked(isBlocked);
    };
    if ((asset.fileSize ?? 0) > LAB_MAX_VIDEO_BYTES) return fail(`영상 하나에 ${LAB_MAX_VIDEO_MB}MB까지 올릴 수 있어요. 이 영상은 ${Math.round((asset.fileSize ?? 0) / 1048576)}MB예요.`, false);
    setCheckingOf((c) => ({ ...c, [view]: true }));
    try {
      /*
       * 올리기 전 검사(GPU 0원) — 화면 녹화 · 30fps 급 · 낮은 해상도 · 줌 · 너무 짧으면 고르지 않고 까닭을 알린다(웹과 같은 규칙).
       * 2026-10-14 사용자: 이상한 영상으로 계속 실패해 GPU 비용이 나가지 않게.
       */
      const probe = await probeLabAsset(asset);
      if (stale()) return;
      const block = labVideoBlock(probe.info);
      if (block) return fail(block, true);
      setPicked((p) => {
        const next = { ...p, [view]: { asset, fps: probe.info.fps, cap: probe.capture, info: probe.info } };
        slowmoOf(next);
        return next;
      });
      /* 장면 그림은 검사 뒤 따로 — 기다리지 않는다(못 뽑으면 필름 그림) */
      void thumbOf(asset.uri).then((thumb) => {
        if (stale()) return;
        setPicked((p) => (p[view]?.asset.uri === asset.uri ? { ...p, [view]: { ...p[view]!, thumb } } : p));
      });
    } catch {
      if (!stale()) fail('영상을 읽지 못했어요. 다시 골라 주세요.', false);
    } finally {
      if (!stale()) setCheckingOf((c) => ({ ...c, [view]: false }));
    }
  };

  /** 옆 · 뒤 바꾸기 — 파일 · 검사 결과 · 장면 그림 · 문제를 통째로. 검사 중에는 안 된다(화면이 단추를 끈다) */
  const swap = () => {
    if (checking != null || busy) return;
    tokens.current.side++;
    tokens.current.back++;
    resetTarget();
    setPicked((p) => ({ side: p.back, back: p.side }));
    setSlotError((e) => ({ side: e.back, back: e.side }));
    setError(null);
    setBlocked(false);
  };

  /** 칸 비우기 — 검사 중이면 그 답을 버리고, 앱 캐시의 파일을 지운다 */
  const remove = (view: LabView) => {
    if (busy) return;
    tokens.current[view]++;
    resetTarget();
    const old = pickedRef.current[view];
    if (old) dropPickerTemp(old.asset.uri);
    setPicked((p) => ({ ...p, [view]: undefined }));
    setSlotError((e) => ({ ...e, [view]: undefined }));
    setCheckingOf((c) => ({ ...c, [view]: false }));
    setError(null);
    setBlocked(false);
  };

  /** 올리지 않고 나갈 때 — 고른 파일을 앱 캐시에서 지운다 */
  const discard = () => {
    tokens.current.side++;
    tokens.current.back++;
    LAB_VIEWS.forEach((v) => {
      const p = pickedRef.current[v];
      if (p) dropPickerTemp(p.asset.uri);
    });
  };

  const known = LAB_VIEWS.map((v) => picked[v]?.fps).filter((x): x is number => x != null);
  const slow = known.filter((x) => x <= 65);
  /* 2026-10-15 사용자: "에어드롭으로 옮길 때 프레임이 떨어진다" — 웹과 같은 알림 */
  const fpsWarn =
    slow.length > 0
      ? `초당 ${Math.round(Math.min(...slow))}장 영상이에요. 슬로 모션으로 찍었다면 다른 폰으로 옮기며 원본이 바뀐 거예요. AirDrop 은 옵션에서 모든 사진 데이터를 켜고 다시 옮겨 주세요.`
      : known.length === 2 && Math.abs(known[0] - known[1]) > 0.1 * Math.max(...known)
        ? `두 영상의 초당 장수가 달라요(옆 ${Math.round(known[0])} · 뒤 ${Math.round(known[1])}). 같은 설정으로 찍었다면 옮기며 한쪽 원본이 바뀐 거예요.`
        : null;

  /** 두 영상을 올리고 샘플 정보를 저장한다 — 된 샘플 번호, 실패면 null(error 에 까닭). 같은 짝으로 다시 부르면 끝난 칸은 건너뛴다 */
  const upload = async (info: LabUploadInfo): Promise<string | null> => {
    setError(null);
    setBlocked(false);
    const id = (labId.current ??= newLabId());
    const sizeOf = (v: LabView) => picked[v]!.asset.fileSize ?? 0;
    setSending(Object.fromEntries(LAB_VIEWS.map((v) => [v, { sent: uploaded.current.has(v) ? sizeOf(v) : 0, total: sizeOf(v), done: uploaded.current.has(v) }])));
    try {
      for (const view of LAB_VIEWS) {
        if (uploaded.current.has(view)) continue;
        setProgress({ view, percent: 0 });
        await uploadLabVideo(
          id,
          view,
          picked[view]!.asset,
          (percent, sent, total) => {
            setProgress({ view, percent });
            if (sent != null && total != null) setSending((s) => ({ ...s, [view]: { sent, total, done: false } }));
          },
          sport
        );
        uploaded.current.add(view);
        setSending((s) => ({ ...s, [view]: { sent: s[view]?.total ?? sizeOf(view), total: s[view]?.total ?? sizeOf(view), done: true } }));
      }
      for (const key of ['cam3', 'cam4'] as const) {
        const extra = info.extras?.[key];
        if (extra && !uploaded.current.has(key)) {
          await uploadLabVideo(id, key, extra, () => undefined, sport);
          uploaded.current.add(key);
        }
      }
      setProgress(null);
      const meta: Omit<LabMeta, 'createdAt'> = {
        /* 늘 두 폰 동시 촬영 · 원본(2026-10-15) — 서버도 다르면 받지 않는다 */
        synced: true,
        slowmoFps: info.slowmo === 'unknown' ? null : (Number(info.slowmo) as 120 | 240),
        screenRecorded: false,
        hand: info.hand,
        ground: info.ground,
        heightCm: info.heightCm,
        distanceM: null,
        distances: info.distances ?? {},
        memo: info.memo,
        ...(info.subject ? { subject: info.subject } : {}),
        kind: info.kind ?? 'sample',
        ...(info.bat ? { bat: info.bat } : {}),
        files: Object.fromEntries(
          LAB_VIEWS.map((v) => {
            const p = picked[v]!;
            return [
              v,
              {
                name: p.asset.fileName ?? '',
                size: p.asset.fileSize ?? 0,
                fp: p.cap.fp,
                ...(p.cap.startMs != null ? { at: new Date(p.cap.startMs).toISOString(), src: p.cap.timeSource ?? undefined } : {}),
                ...(p.cap.durationSec != null ? { dur: p.cap.durationSec } : {}),
              },
            ];
          })
        ),
      };
      const r = await rpc<{ ok: true } | { error: string }>(sport === 'hit' ? 'swing-lab.saveSwingSample' : 'pitch-lab.saveLabSample', { id, meta });
      if ('error' in r) {
        setError(r.error);
        return null;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      /* 올렸으니 선택기가 앱 캐시에 복사해 둔 원본은 지운다 */
      LAB_VIEWS.forEach((v) => dropPickerTemp(picked[v]!.asset.uri));
      Object.values(info.extras ?? {}).forEach((a) => a && dropPickerTemp(a.uri));
      resetTarget();
      setPicked({});
      return id;
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : '올리지 못했어요. 다시 해 주세요.');
      return null;
    } finally {
      setProgress(null);
    }
  };

  return {
    picked,
    checking,
    checkingOf,
    slotError,
    progress,
    sending,
    busy,
    error,
    blocked,
    pairBlock,
    ready,
    fpsWarn,
    autoSlowmo,
    pick,
    swap,
    remove,
    discard,
    upload,
  };
}
