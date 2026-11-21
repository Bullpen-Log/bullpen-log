'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ClipEditor, type ClipSubmit } from '@/components/clip/clip-editor';
import { haptic } from '@/lib/haptics';
import {
  dropClip,
  getClip,
  keepClip,
  pendingClips,
  type PendingClip,
} from '@/lib/clip/outbox';
import { sendClip } from '@/lib/clip/send';
import {
  AppCameraError,
  appCameraAvailable,
  appCameraLeftovers,
  appCameraMissingText,
  discardAppCameraFiles,
  readAppCameraFile,
  recordWithAppCamera,
  type AppTakeLeftover,
} from '@/lib/shoot-camera';
import { reassertWakeLock } from '@/components/use-wake-lock';
import type { ShootCheckView } from '@/lib/shoot/progress';

/** 영상을 붙일 운동 — 촬영 계획의 한 줄 */
export type ClipTarget = {
  exerciseId: string;
  /** '1-24' */
  no: string;
  title: string;
  /** 시범 방법 */
  cue: string;
};

type Editing = {
  target: ClipTarget;
  /** 앱 카메라에서 넘겨받는 중이면 null */
  file: File | null;
  from: 'album' | 'native';
  seq: number;
  /** 넘겨받는 진행(0~1) — file 이 null 일 때 */
  progress?: number;
  /** 앱에 남아 있는 원본(앱 카메라) — 폰 저장소에 맡기면 지운다. 그 전에 화면이 죽으면 다음에 '이어서 편집' */
  path?: string | null;
};

const noSubscribe = () => () => {};

/** 창이 닫히는 움직임이 끝난 뒤 파일을 놓는다(원본은 수십 MB) */
const RELEASE_MS = 300;

/**
 * 촬영 영상 한 벌 — 카메라 · 앨범에서 고르기 → 컷 편집 창 → 폰에 맡기기 → 올려 운동에 붙이기 → 체크 반영.
 * 촬영 모드와 주차 화면이 같이 쓴다. 돌려주는 elements(숨은 파일 고르기 둘 + 편집 창)를 화면 어딘가에 그려 둔다.
 *
 * 카메라: 앱 카메라만(lib/shoot-camera.ts — 아이폰 기본 카메라 화면을 앱이 1080p 로 띄운다). 웹 카메라(<input capture>)는 쓰지 않는다 —
 * 480×360 쯤으로 찍힌다. 앱 카메라가 없으면(웹 · 옛 앱) cameraNotice 로 까닭을 알린다. 찍을 때 소리도 녹음되지만 올릴 때 뺀다.
 * 앨범에서 고르기는 남긴다(다른 폰 · 카메라 앱으로 찍은 것) — 화질이 낮으면 편집 창이 올리기를 막는다.
 * 올리지 못한 것(신호 끊김)은 pending 에 남고 retryPending 으로 다시 올린다.
 */
export function useClipFlow({
  adopt,
  onAttached,
}: {
  /** 서버가 돌려준 체크로 바꾸기(useShootChecks().adopt) */
  adopt: (checks: ShootCheckView[], label?: string) => void;
  /** 붙인 뒤 — 촬영 모드는 다음 운동으로 */
  onAttached?: (exerciseId: string) => void;
}) {
  const router = useRouter();
  const albumRef = useRef<HTMLInputElement>(null);
  /** 앱 카메라가 있나 — 앱이 사이트를 열 때 넣어 주는 것이라 바뀌지 않는다(서버 그림은 false) */
  const appCamera = useSyncExternalStore(noSubscribe, appCameraAvailable, () => false);
  /** 앱 카메라가 없을 때 까닭(웹 · 옛 앱) — 서버 그림에서는 빈 글자 */
  const cameraMissingText = useSyncExternalStore(
    noSubscribe,
    () => (appCameraAvailable() ? '' : appCameraMissingText()),
    () => ''
  );
  const [cameraNotice, setCameraNotice] = useState<string | null>(null);
  const targetRef = useRef<ClipTarget | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  /** 지금 편집의 번호 — 카메라 취소 · 실패 때 그 편집만 닫으려고 */
  const seqRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<PendingClip[]>([]);
  const [retry, setRetry] = useState<{ index: number; total: number; p: number } | null>(
    null
  );
  const [retryError, setRetryError] = useState<string | null>(null);
  /** 다시 올리기가 도는 중 — 상태보다 먼저 막으려고(두 번 눌림) */
  const retrying = useRef(false);
  /** 편집 창에서 만든 촬영본의 폰 기록 — 같은 영상으로 [다시 올리기]면 이것을 이어 쓴다(이미 올린 경로까지) */
  const lastRecord = useRef<{ file: File; record: PendingClip } | null>(null);
  /** 카메라가 열려 있거나 넘겨받는 중 — 두 번 눌러 두 번째가 'busy' 로 첫 편집 창을 닫아 찍은 영상을 잃었다(2026-11-21 검토) */
  const cameraBusy = useRef(false);
  /** 편집하다 화면이 죽어 앱에 남은 촬영본(lib/shoot-camera.ts appCameraLeftovers) — 지금 편집 창에 열린 것은 뺀다 */
  const [leftovers, setLeftovers] = useState<AppTakeLeftover[]>([]);
  const openPath = useRef<string | null>(null);
  /** 이 화면이 지운 원본 — 지우기 대답보다 목록이 먼저 와도 다시 보이지 않게 */
  const dropped = useRef(new Set<string>());
  const discard = (paths: (string | null | undefined)[]) => {
    for (const p of paths) if (p) dropped.current.add(p);
    return discardAppCameraFiles(paths);
  };
  useEffect(() => {
    openPath.current = editing?.path ?? null;
  }, [editing?.path]);
  async function refreshLeftovers() {
    const list = await appCameraLeftovers();
    setLeftovers(
      list.filter((t) => t.meta && t.path !== openPath.current && !dropped.current.has(t.path))
    );
  }

  /*
   * 찍기 · 편집 동안 '뒤로'를 막는다 — 앱은 화면 왼쪽 끝을 밀면 앞 화면으로 간다(웹뷰 allowsBackForwardNavigationGestures).
   * 촬영을 마치고 편집 창이 뜨는 동안 손이 왼쪽 끝에 닿으면 촬영 목록(주차 시간표)으로 튕기고 찍은 영상도 잃었다(2026-10-18 사용자:
   * "가끔 촬영이 끝나면 올리기 대신 목록 화면으로 튕긴다"). 같은 주소의 칸을 하나 더 쌓아 두면 뒤로 가도 같은 화면에 남는다 —
   * 주소를 안 넘겨 Next 라우터는 아무 일도 안 하고(같은 화면), 뒤로 가면 다시 쌓는다. 창을 닫은 뒤 남은 한 칸은 뒤로 한 번에 지나간다.
   */
  useEffect(() => {
    if (!open) return;
    const isGuard = () => !!(window.history.state as { bpClipGuard?: boolean } | null)?.bpClipGuard;
    const guard = () => {
      if (!isGuard()) window.history.pushState({ bpClipGuard: true }, '');
    };
    guard();
    window.addEventListener('popstate', guard);
    return () => window.removeEventListener('popstate', guard);
  }, [open]);

  /* 지난번에 올리지 못하고 맡겨 둔 것 · 편집하다 남은 촬영본 */
  useEffect(() => {
    let alive = true;
    void pendingClips().then((list) => {
      if (alive) setPending(list);
    });
    void appCameraLeftovers().then((list) => {
      if (alive) setLeftovers(list.filter((t) => t.meta && !dropped.current.has(t.path)));
    });
    return () => {
      alive = false;
    };
  }, []);

  /**
   * 앱 카메라로 찍기 — 창을 먼저 열어(카메라 뒤에서 '가져오는 중'), 찍고 나면 파일을 넘겨받아 편집으로.
   * prev: [다시 찍기]로 왔으면 앞 촬영본 — 카메라를 취소하거나 실패하면 그것으로 돌아간다(예전엔 창이 닫혀 앞 영상까지 잃었다).
   */
  async function startCamera(target: ClipTarget, prev: Editing | null = null) {
    targetRef.current = target;
    setCameraNotice(null);
    if (!appCameraAvailable()) {
      setCameraNotice(appCameraMissingText());
      haptic('warning');
      return;
    }
    if (cameraBusy.current) {
      // 창이 닫혔는데 카메라가 아직 대답을 안 했다 — 앱 카메라가 멈춘 것(앱을 다시 켜야 풀린다)
      if (!open) setCameraNotice('카메라가 대답하지 않아요. 앱을 완전히 껐다 다시 켜 주세요.');
      return;
    }
    cameraBusy.current = true;
    haptic('light');
    const seq = ++seqRef.current;
    setEditing({ target, file: null, from: 'native', seq, progress: 0 });
    setOpen(true);
    const back = () => {
      if (seqRef.current !== seq) return;
      if (prev?.file) setEditing({ ...prev, seq });
      else closeSeq(seq);
    };
    try {
      const take = await recordWithAppCamera(
        (progress) => setEditing((cur) => (cur && cur.seq === seq ? { ...cur, progress } : cur)),
        { exerciseId: target.exerciseId, no: target.no, title: target.title, cue: target.cue }
      );
      if (!take) {
        back();
        return;
      }
      if (seqRef.current !== seq) {
        // 그사이 창이 바뀌었다 — 원본은 앱에 남겨 '이어서 편집'으로
        void refreshLeftovers();
        return;
      }
      setEditing((cur) => (cur && cur.seq === seq ? { ...cur, file: take.file, path: take.path } : cur));
      // 새로 찍었으니 앞 촬영본(다시 찍기 전)의 원본은 버린다
      if (prev?.path && prev.path !== take.path) void discard([prev.path]);
    } catch (err) {
      back();
      setCameraNotice(
        err instanceof AppCameraError ? err.message : '카메라를 열지 못했어요. 다시 해 주세요.'
      );
      haptic('error');
      void refreshLeftovers();
    } finally {
      cameraBusy.current = false;
      reassertWakeLock();
    }
  }

  /** 남은 촬영본 이어서 편집 — 앱에서 다시 넘겨받는다. 못 읽으면(지워짐) 목록에서 뺀다 */
  async function resumeLeftover(take: AppTakeLeftover) {
    if (!take.meta || cameraBusy.current) return;
    cameraBusy.current = true;
    const target = take.meta;
    targetRef.current = target;
    setCameraNotice(null);
    setLeftovers((list) => list.filter((t) => t.path !== take.path));
    const seq = ++seqRef.current;
    setEditing({ target, file: null, from: 'native', seq, progress: 0, path: take.path });
    setOpen(true);
    try {
      const file = await readAppCameraFile(take.path, (progress) =>
        setEditing((cur) => (cur && cur.seq === seq ? { ...cur, progress } : cur))
      );
      setEditing((cur) => (cur && cur.seq === seq ? { ...cur, file } : cur));
    } catch {
      closeSeq(seq);
      await discard([take.path]);
      setCameraNotice(`${target.no} 영상을 앱에서 찾지 못했어요. 다시 찍어 주세요.`);
      haptic('error');
      void refreshLeftovers();
    } finally {
      cameraBusy.current = false;
    }
  }

  /** 남은 촬영본 버리기 */
  async function dropLeftover(take: AppTakeLeftover) {
    setLeftovers((list) => list.filter((t) => t.path !== take.path));
    await discard([take.path]);
    void refreshLeftovers();
  }

  function startAlbum(target: ClipTarget) {
    targetRef.current = target;
    albumRef.current?.click();
  }

  /** 고른 파일로 편집 창 열기 — 다른 창(주차 화면의 운동 창) 안에서 고른 것도 이리로 */
  function edit(target: ClipTarget, file: File, from: Editing['from']) {
    targetRef.current = target;
    const seq = ++seqRef.current;
    setEditing({ target, file, from, seq });
    setOpen(true);
  }

  function picked(e: ChangeEvent<HTMLInputElement>, from: Editing['from']) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    const target = targetRef.current;
    if (!file || !target) return;
    edit(target, file, from);
  }

  /** 그 편집(seq)이 아직 열려 있으면 닫는다 — 카메라를 취소했을 때 */
  function closeSeq(seq: number) {
    if (seqRef.current !== seq) return;
    setOpen(false);
    setEditing(null);
  }

  /**
   * 창 닫기 — 앱 카메라 원본은 지우지 않는다: 잘못 눌러 닫아도 위에 '편집 못 한 촬영 · 이어서 편집'으로 남는다(버리기는 거기서).
   */
  function close() {
    setOpen(false);
    const seq = editing?.seq;
    // 넘겨받는 중에 닫았으면 그 카메라 대답은 이 창에 붙이지 않는다(원본은 앱에 남아 '이어서 편집'으로)
    seqRef.current++;
    const keep = editing?.path;
    window.setTimeout(() => {
      setEditing((cur) => (cur && cur.seq === seq ? null : cur));
      if (keep) {
        openPath.current = null;
        void refreshLeftovers();
      }
    }, RELEASE_MS);
  }

  function attached(target: ClipTarget, checks: ShootCheckView[]) {
    adopt(checks, `${target.no} 올림 · 소리 없음`);
    haptic('success');
    onAttached?.(target.exerciseId);
    // 운동 정보(우리 영상으로 바뀜 · 올림 수)를 서버에서 다시 받는다
    router.refresh();
  }

  const submit: ClipSubmit = async (clip, thumb, report) => {
    const target = editing?.target;
    if (!target) return { ok: false, error: '운동을 다시 골라 주세요.' };
    /* 앱의 원본 — 폰 저장소에 맡겼거나 올렸으면 지운다(그 전엔 화면이 죽어도 이어서 편집할 수 있게 남긴다) */
    const raw = editing?.path ?? null;
    const dropRaw = () => {
      if (!raw) return;
      void discard([raw]);
      setEditing((cur) => (cur && cur.path === raw ? { ...cur, path: null } : cur));
    };
    const prev = lastRecord.current;
    let record: PendingClip;
    let kept: boolean;
    if (prev && prev.file === clip.file) {
      // 같은 촬영본을 다시 올린다 — 폰 기록(올린 경로 포함)을 그대로
      const stored = await getClip(prev.record.exerciseId);
      kept = !!stored && stored.savedAt === prev.record.savedAt;
      record = kept ? stored! : prev.record;
    } else {
      record = {
        exerciseId: target.exerciseId,
        label: `${target.no} ${target.title}`,
        video: clip.file,
        thumb,
        aspectRatio: clip.aspectRatio,
        savedAt: Date.now(),
      };
      kept = await keepClip(record);
      lastRecord.current = { file: clip.file, record };
    }
    if (kept) dropRaw();
    const res = await sendClip(record, report);
    reassertWakeLock();
    if (!res.ok) {
      haptic('error');
      setPending(await pendingClips());
      return { ok: false, error: res.error, kept };
    }
    lastRecord.current = null;
    dropRaw();
    setPending(await pendingClips());
    close();
    attached(target, res.checks);
    return { ok: true };
  };

  /**
   * 맡겨 둔 것을 차례로 올린다 — 하나라도 실패하면 거기서 멈추고 까닭을 남긴다.
   * 보내기 직전에 폰 기록을 다시 읽어, 그사이 새로 찍었거나(촬영본이 바뀜) 이미 올린 것은 건너뛴다.
   * 그 운동에 이미 우리 영상이 있으면(다른 폰에서 올림) 바꿀지 묻는다 — 아니면 맡겨 둔 옛 촬영본을 버린다.
   */
  async function retryPending(isUploaded: (exerciseId: string) => boolean = () => false) {
    if (retrying.current) return;
    retrying.current = true;
    const list = await pendingClips();
    setRetryError(null);
    for (let i = 0; i < list.length; i++) {
      const snapshot = list[i];
      const clip = await getClip(snapshot.exerciseId);
      if (!clip || clip.savedAt !== snapshot.savedAt) continue;
      if (
        isUploaded(clip.exerciseId) &&
        !window.confirm(
          `${clip.label} — 이미 올린 영상이 있어요. 폰에 맡겨 둔 영상으로 바꿀까요?
취소하면 맡겨 둔 영상을 버려요.`
        )
      ) {
        await dropClip(clip.exerciseId, clip.savedAt);
        continue;
      }
      setRetry({ index: i, total: list.length, p: 0 });
      const res = await sendClip(clip, (p) =>
        setRetry({ index: i, total: list.length, p })
      );
      if (!res.ok) {
        setRetryError(`${clip.label} — ${res.error}`);
        break;
      }
      const [no, ...rest] = clip.label.split(' ');
      attached({ exerciseId: clip.exerciseId, no, title: rest.join(' '), cue: '' }, res.checks);
    }
    setRetry(null);
    retrying.current = false;
    setPending(await pendingClips());
  }

  const elements = (
    <ClipEditor
        open={open}
        file={editing?.file ?? null}
        loading={editing && !editing.file ? (editing.progress ?? 0) : null}
        fileKey={editing?.seq ?? 0}
        title={editing ? `${editing.target.no} ${editing.target.title}` : ''}
        cue={editing?.target.cue}
        from={editing?.from ?? 'album'}
        onClose={close}
        onRetake={
          editing?.from === 'album'
            ? () => albumRef.current?.click()
            : () => editing && void startCamera(editing.target, editing)
        }
        onSubmit={submit}
      >
        <input
          ref={albumRef}
          type="file"
          accept="video/*"
          hidden
          onChange={(e) => picked(e, 'album')}
        />
      </ClipEditor>
  );

  return {
    elements,
    /** 앱 카메라가 있나 */
    appCamera,
    /** 앱 카메라가 없는 까닭(없으면 빈 글자) */
    cameraMissingText,
    /** 못 찍은 까닭(앱 카메라 없음 · 권한 · 실패) */
    cameraNotice,
    clearCameraNotice: () => setCameraNotice(null),
    startCamera,
    startAlbum,
    edit,
    pending,
    retryPending,
    /** 편집하다 화면이 죽어(또는 닫아) 앱에 남은 촬영본 — 이어서 편집 · 버리기 */
    leftovers,
    resumeLeftover,
    dropLeftover,
    retry,
    retryError,
    clearRetryError: () => setRetryError(null),
  };
}
