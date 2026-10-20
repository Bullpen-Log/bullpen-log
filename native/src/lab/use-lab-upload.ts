import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { useRef, useState } from 'react';
import { labPairBlock, labVideoBlock, type LabCapture } from '@/lib/pitch-lab-guard';
import { LAB_MAX_VIDEO_BYTES, LAB_MAX_VIDEO_MB, LAB_VIEWS, labViewLabel, type LabGround, type LabHand, type LabMeta, type LabView } from '@/lib/pitch-lab-meta';
import { probeLabAsset, uploadLabVideo } from '~/lab/upload';
import { PICK_ORIGINAL, dropPickerTemp } from '~/pitch/attach';
import { rpc } from '~/lib/rpc';

/**
 * 옆 · 뒤 영상 짝 고르기 · 검사 · 올리기 — 관리자 샘플 화면(app/lab/samples.tsx)의 올리기 카드와 사용자 새 분석 흐름(app/lab/new.tsx)이 같이 쓴다.
 * 올리기 전 검사 · 짝 검사 · 지문은 웹과 같은 lib(pitch-lab-guard), 서버 saveLabSample 이 한 번 더 본다.
 */
export type LabPicked = { asset: ImagePicker.ImagePickerAsset; fps: number | null; cap: LabCapture & { fp: string } };
export type LabSlowmo = 'unknown' | '120' | '240';
export type LabUploadInfo = {
  slowmo: LabSlowmo;
  hand: LabHand;
  ground: LabGround;
  heightCm: number | null;
  distances?: Partial<Record<LabView, number>>;
  memo: string | null;
};

/** 샘플 번호(UUID v4 모양 — 사이트 isLabId) — 앱에는 crypto.randomUUID 가 없다. 사람마다 자기 폴더 안이라 Math.random 이면 겹칠 일이 없다 */
const newLabId = () =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = Math.floor(Math.random() * 16);
    return (ch === 'x' ? r : (r & 3) | 8).toString(16);
  });

export function useLabUpload(hand: LabHand) {
  const [picked, setPicked] = useState<Partial<Record<LabView, LabPicked>>>({});
  const [checking, setChecking] = useState<LabView | null>(null);
  const [progress, setProgress] = useState<{ view: LabView; percent: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* 검사에 막혀 고르지 않음 — 촬영 안내로 보내는 줄을 띄운다 */
  const [blocked, setBlocked] = useState(false);
  /* 두 영상 다 고속(원본 슬로모)이면 고른 순간 저절로 채운 슬로모 배수 */
  const [autoSlowmo, setAutoSlowmo] = useState<LabSlowmo | null>(null);
  /* 고른 짝의 샘플 번호 — 다시 올리기도 같은 번호(서명 주소가 upsert 라 덮어씀). 올릴 때마다 새 번호면 실패한 쪽 영상이 버려진 폴더에 남았다 */
  const labId = useRef<string | null>(null);

  const busy = progress != null;
  const pairBlock = picked.side && picked.back ? labPairBlock(picked.side.cap, picked.back.cap) : null;
  const ready = LAB_VIEWS.every((v) => picked[v]) && !pairBlock && !busy && checking == null;

  const pick = async (view: LabView) => {
    setError(null);
    setBlocked(false);
    const res = await ImagePicker.launchImageLibraryAsync(PICK_ORIGINAL);
    const asset = res.canceled ? null : res.assets[0];
    if (!asset) return;
    /* 짝이 바뀐다 — 다음 올리기는 새 샘플 번호 */
    labId.current = null;
    if ((asset.fileSize ?? 0) > LAB_MAX_VIDEO_BYTES) return setError(`영상은 ${LAB_MAX_VIDEO_MB}MB 이하만 올릴 수 있어요.`);
    setPicked((p) => ({ ...p, [view]: undefined }));
    setChecking(view);
    try {
      /*
       * 올리기 전 검사(GPU 0원) — 화면 녹화 · 30fps 급 · 낮은 해상도 · 줌 · 너무 짧으면 고르지 않고 까닭을 알린다(웹과 같은 규칙).
       * 2026-10-14 사용자: 이상한 영상으로 계속 실패해 GPU 비용이 나가지 않게.
       */
      const probe = await probeLabAsset(asset);
      const block = labVideoBlock(probe.info);
      if (block) {
        setError(`${labViewLabel(view, hand)} 영상: ${block}`);
        setBlocked(true);
        return;
      }
      setPicked((p) => {
        const next = { ...p, [view]: { asset, fps: probe.info.fps, cap: probe.capture } };
        const both = LAB_VIEWS.map((x) => next[x]?.fps);
        if (both.every((x): x is number => x != null && x >= 100)) setAutoSlowmo(Math.min(...both) >= 200 ? '240' : '120');
        return next;
      });
    } catch {
      setError('영상을 읽지 못했어요. 다시 골라 주세요.');
    } finally {
      setChecking(null);
    }
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

  /** 두 영상을 올리고 샘플 정보를 저장한다 — 된 샘플 번호, 실패면 null(error 에 까닭) */
  const upload = async (info: LabUploadInfo): Promise<string | null> => {
    setError(null);
    setBlocked(false);
    const id = (labId.current ??= newLabId());
    try {
      for (const view of LAB_VIEWS) {
        setProgress({ view, percent: 0 });
        await uploadLabVideo(id, view, picked[view]!.asset, (percent) => setProgress({ view, percent }));
      }
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
        kind: 'sample',
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
      const r = await rpc<{ ok: true } | { error: string }>('pitch-lab.saveLabSample', { id, meta });
      if ('error' in r) {
        setError(r.error);
        return null;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      /* 올렸으니 선택기가 앱 캐시에 복사해 둔 원본은 지운다 */
      LAB_VIEWS.forEach((v) => dropPickerTemp(picked[v]!.asset.uri));
      labId.current = null;
      setPicked({});
      return id;
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : '올리지 못했어요. 다시 해 주세요.');
      return null;
    } finally {
      setProgress(null);
    }
  };

  return { picked, checking, progress, busy, error, blocked, pairBlock, ready, fpsWarn, autoSlowmo, pick, upload };
}
