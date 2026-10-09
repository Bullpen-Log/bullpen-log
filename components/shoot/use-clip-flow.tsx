'use client';

import { useEffect, useRef, useState, type ChangeEvent } from 'react';
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
  file: File;
  from: 'camera' | 'album' | 'native';
  seq: number;
};

/** 창이 닫히는 움직임이 끝난 뒤 파일을 놓는다(원본은 수십 MB) */
const RELEASE_MS = 300;

/**
 * 촬영 영상 한 벌 — 카메라 · 앨범에서 고르기 → 컷 편집 창 → 폰에 맡기기 → 올려 운동에 붙이기 → 체크 반영.
 * 촬영 모드와 주차 화면이 같이 쓴다. 돌려주는 elements(숨은 파일 고르기 둘 + 편집 창)를 화면 어딘가에 그려 둔다.
 *
 * 카메라: 아이폰 기본 카메라(<input capture>)가 바로 켜진다. 앱에서 찍어도 소리는 같이 녹음되지만 올릴 때 뺀다.
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
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const targetRef = useRef<ClipTarget | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
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

  /* 지난번에 올리지 못하고 맡겨 둔 것 */
  useEffect(() => {
    let alive = true;
    void pendingClips().then((list) => {
      if (alive) setPending(list);
    });
    return () => {
      alive = false;
    };
  }, []);

  function startCamera(target: ClipTarget) {
    targetRef.current = target;
    haptic('light');
    cameraRef.current?.click();
  }

  function startAlbum(target: ClipTarget) {
    targetRef.current = target;
    albumRef.current?.click();
  }

  /** 고른 파일로 편집 창 열기 — 다른 창(주차 화면의 운동 창) 안에서 고른 것도 이리로 */
  function edit(target: ClipTarget, file: File, from: Editing['from']) {
    targetRef.current = target;
    setEditing({ target, file, from, seq: Date.now() });
    setOpen(true);
  }

  function picked(e: ChangeEvent<HTMLInputElement>, from: Editing['from']) {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    const target = targetRef.current;
    if (!file || !target) return;
    edit(target, file, from);
  }

  function close() {
    setOpen(false);
    const seq = editing?.seq;
    window.setTimeout(
      () => setEditing((cur) => (cur && cur.seq === seq ? null : cur)),
      RELEASE_MS
    );
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
    const res = await sendClip(record, report);
    if (!res.ok) {
      haptic('error');
      setPending(await pendingClips());
      return { ok: false, error: res.error, kept };
    }
    lastRecord.current = null;
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
        fileKey={editing?.seq ?? 0}
        title={editing ? `${editing.target.no} ${editing.target.title}` : ''}
        cue={editing?.target.cue}
        from={editing?.from ?? 'album'}
        onClose={close}
        onRetake={
          editing?.from === 'album'
            ? () => albumRef.current?.click()
            : () => cameraRef.current?.click()
        }
        onSubmit={submit}
      >
        <input
          ref={cameraRef}
          type="file"
          accept="video/*"
          capture="environment"
          hidden
          onChange={(e) => picked(e, 'camera')}
        />
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
    startCamera,
    startAlbum,
    edit,
    pending,
    retryPending,
    retry,
    retryError,
    clearRetryError: () => setRetryError(null),
  };
}
