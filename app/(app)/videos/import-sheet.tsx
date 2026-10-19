'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/modal';
import { Button } from '@/components/ui';
import { toast } from '@/components/toast';
import { Film } from '@/components/icon';
import { EntryForm, type ImportPrefill } from '@/app/(app)/pitch-log/entry-form';
import { readLabFileFacts } from '@/lib/pitch-lab-file';
import {
  groupItems,
  importDateOf,
  needsDateCheck,
  setGroupDate,
  splitOut,
  type ImportGroup,
  type ImportItem,
} from '@/lib/pitch-import';
import {
  discardPhoneVideos,
  localVideoAvailable,
  removePhoneVideos,
  saveBlobToPhone,
} from '@/lib/local-video';
import { makePitchThumb } from '@/lib/pitch-thumbs';
import { isPhoneVideoPath, phoneVideoPath } from '@/lib/phone-video-path';
import { uploadToStorage } from '@/components/video-upload';
import { quietRefresh } from '@/lib/quiet-refresh';
import { appNow, appNowMs } from '@/lib/clock';
import { dateKeyLabel, toDateKey } from '@/lib/pitch-stats';

/**
 * 과거 투구 영상 가져오기 — 아이폰 앱에서만(폰에 넣을 수 있을 때). 갤러리 영상 여러 개 → 찍은 날짜로 묶음(lib/pitch-import.ts)
 * → 묶음마다 기존 기록 폼(EntryForm importPrefill) → 저장 · 건너뛰기 → 'N개 중 M개 남겼어요'.
 *
 * 폰에 넣는 때는 그 묶음 폼이 열릴 때다(앞 묶음 영상을 먼저 다 넣지 않는다). 저장 안 하고 닫으면 그 묶음의 영상만 지운다(D5).
 * 화면 다시 받기는 시트가 닫힐 때 한 번(D6). 폰에 넣기 전에 영상 번호를 localStorage 에 적어 두고 저장 · 건너뛰기 · 그만두기 때
 * 지운다 — 앱이 죽어 남은 번호는 다음에 시트를 열 때 지운다(D15). 설계: docs/designs/pitch-log-findability.md 2단계.
 */

const PENDING_KEY = 'bullpen-import-pending';

function readPending(): string[] {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list)
      ? list.filter((p): p is string => typeof p === 'string')
      : [];
  } catch {
    return [];
  }
}

function writePending(paths: string[]) {
  try {
    if (paths.length === 0) localStorage.removeItem(PENDING_KEY);
    else localStorage.setItem(PENDING_KEY, JSON.stringify(paths));
  } catch {
    /* 못 적으면 정리도 못 한다 — 그만 */
  }
}

const noopSubscribe = () => () => {};

/** 투구 탭 '오늘' 카드 밑의 입구 — 앱 안(폰 저장 가능)에서만 보인다 */
export function ImportEntry({ isAdmin = false }: { isAdmin?: boolean }) {
  const mounted = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
  const [open, setOpen] = useState(false);
  if (!mounted || !localVideoAvailable()) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full bg-ink/6 px-4 text-sm font-medium text-ink transition-colors hover:bg-ink/10 pad:w-auto desk:min-h-9 desk:rounded-xl desk:text-xs"
      >
        <Film aria-hidden className="h-4 w-4" />
        지난 영상 가져오기
      </button>
      {open && <ImportSheet isAdmin={isAdmin} onClose={() => setOpen(false)} />}
    </>
  );
}

type Step = 'pick' | 'reading' | 'preview' | 'form' | 'done';

/** 폰에 넣은 묶음 영상 — 폼에 붙이고, 저장 안 하면 지운다 */
type Placed = { paths: string[]; previewUrls: Record<string, string> };

function ImportSheet({ isAdmin, onClose }: { isAdmin: boolean; onClose: () => void }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>('pick');
  const filesRef = useRef<File[]>([]);
  const [groups, setGroups] = useState<ImportGroup[]>([]);
  const [cursor, setCursor] = useState(0);
  const [saved, setSaved] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [placed, setPlaced] = useState<Placed | null>(null);
  const [placing, setPlacing] = useState<{ n: number; pct: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /* 묶음 폼이 저장하는 중 — 그동안 건너뛰기 · 닫기를 막는다(저장 도중 폰 영상이 지워지지 않게) */
  const [formSaving, setFormSaving] = useState(false);
  const todayKey = toDateKey(appNow());
  const inputRef = useRef<HTMLInputElement>(null);

  /*
   * 지난번 가져오다 만 영상(앱이 죽어 번호만 남음) — 시트를 열 때 한 번 정리. 저장은 됐는데 앱이 죽어 목록에만 남은 것도 있어
   * 서버가 '어느 기록에도 없음'이라고 답한 것만 지운다. 서버에 못 물으면 목록을 그대로 둔다(다음에 다시).
   */
  useEffect(() => {
    const left = readPending();
    if (left.length === 0) return;
    void discardPhoneVideos(left).then((gone) => {
      if (gone == null) return;
      writePending(readPending().filter((p) => !left.includes(p)));
      if (gone.length > 0) toast(`지난번 가져오다 만 영상 ${gone.length}개를 정리했어요`);
    });
  }, []);

  const pick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter((f) =>
      f.type.startsWith('video/')
    );
    e.target.value = '';
    if (files.length === 0) return;
    filesRef.current = files;
    setStep('reading');
    const now = appNowMs();
    const items: ImportItem[] = [];
    for (const [id, file] of files.entries()) {
      const { date, source } = importDateOf(
        await readLabFileFacts(file),
        file.lastModified,
        now
      );
      items.push({ id, name: file.name, date, source });
    }
    setGroups(groupItems(items));
    setStep('preview');
  };

  /** 묶음 폼 열기 — 이 묶음 영상만 폰에 넣는다 */
  const openGroup = async (at: number) => {
    const group = groups[at];
    if (!group) {
      setStep('done');
      return;
    }
    setCursor(at);
    setError(null);
    setPlaced(null);
    setStep('form');
    const paths: string[] = [];
    const previewUrls: Record<string, string> = {};
    try {
      for (const [n, item] of group.items.entries()) {
        const file = filesRef.current[item.id];
        setPlacing({ n: n + 1, pct: 0 });
        if (isAdmin) {
          /* 관리자는 서버 저장소에(2026-10-19 김민: "관리자 계정으로 기록 · 촬영 · 업로드한 것은 모두 서버에") */
          const path = await uploadToStorage(file, '/api/pitch-log/upload-url', (pct) =>
            setPlacing({ n: n + 1, pct })
          );
          paths.push(path);
          writePending([...readPending(), path]);
          previewUrls[path] = URL.createObjectURL(file);
          void makePitchThumb(path, file);
          continue;
        }
        const localId = await saveBlobToPhone(file, (p) =>
          setPlacing({ n: n + 1, pct: Math.round(p * 100) })
        );
        const res = await fetch('/api/pitch-log/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ localId }),
        }).catch(() => null);
        const data = (await res?.json().catch(() => ({}))) as {
          path?: string;
          error?: string;
        };
        if (!res?.ok || !data?.path) {
          /* 폰에는 넣었는데 경로를 못 받았다 — 어디에도 안 적혀 영영 남으니 바로 지운다 */
          const stray = phoneVideoPath('x', localId);
          if (stray) await removePhoneVideos([stray]);
          throw new Error(data?.error ?? '영상을 기록에 붙이지 못했어요. 신호를 확인하고 다시 해 보세요.');
        }
        paths.push(data.path);
        writePending([...readPending(), data.path]);
        previewUrls[data.path] = URL.createObjectURL(file);
        /* 목록 · 캘린더 그림 — 없으면 목록이 영상을 통째로 읽어 폰이 버거워진다(가져온 원본은 크다). 기다리지 않는다 */
        void makePitchThumb(data.path, file);
      }
      setPlaced({ paths, previewUrls });
    } catch (err) {
      /* 넣다 만 것은 지운다 — 이 묶음은 건너뛰거나 다시 할 수 있다 */
      await forget(paths);
      setError(
        err instanceof Error
          ? err.message
          : '영상을 폰에 넣지 못했어요. 다시 해 보거나 이 묶음을 건너뛰세요.'
      );
    } finally {
      setPlacing(null);
    }
  };

  /**
   * 미정 목록에서 빼고, 어느 기록에도 안 붙은 것만 폰에서 지운다 — 저장이 실제로는 됐는데 답만 못 받은 묶음(신호 끊김)을
   * 건너뛰거나 닫아도 그 기록의 영상은 남는다. 서버에 못 물으면 목록에 그대로 둬 다음에 시트를 열 때 다시 본다.
   */
  const forget = async (paths: string[]) => {
    if (paths.length === 0) return;
    /* 서버에 올린 것(관리자) — 어느 기록에도 안 붙은 것만 서버가 지운다 */
    const server = paths.filter((p) => !isPhoneVideoPath(p));
    if (server.length)
      void fetch('/api/pitch-log/discard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: server }),
      }).catch(() => undefined);
    const gone = await discardPhoneVideos(paths);
    if (gone != null) writePending(readPending().filter((p) => !paths.includes(p)));
  };

  const release = (p: Placed | null) => {
    for (const url of Object.values(p?.previewUrls ?? {})) URL.revokeObjectURL(url);
  };

  const onSaved = () => {
    /* 저장됐다 — 미정 목록에서만 뺀다(폰 영상은 기록 것) */
    writePending(readPending().filter((p) => !(placed?.paths ?? []).includes(p)));
    release(placed);
    setPlaced(null);
    setSaved((n) => n + 1);
    void openGroup(cursor + 1);
  };

  const skip = async () => {
    if (formSaving) return;
    await forget(placed?.paths ?? []);
    release(placed);
    setPlaced(null);
    setSkipped((n) => n + 1);
    void openGroup(cursor + 1);
  };

  /** 어디서든 닫기 — 넣었지만 저장 안 한 묶음 영상은 지우고, 하나라도 남겼으면 화면을 새로 받는다 */
  const close = async () => {
    if (placing || formSaving) return;
    if (step === 'form') await forget(placed?.paths ?? []);
    release(placed);
    if (saved > 0) quietRefresh(router);
    onClose();
  };

  const total = groups.length;
  const group = groups[cursor];
  const prefill: ImportPrefill | null = placed
    ? { videoPaths: placed.paths, previewUrls: placed.previewUrls }
    : null;

  return (
    <Modal
      open
      onClose={() => void close()}
      title="지난 영상 가져오기"
      description={
        step === 'form' && group
          ? `${total}개 묶음 중 ${cursor + 1}번째 · ${dateKeyLabel(group.date ?? todayKey)}`
          : '사진 앱의 투구 영상을 찍은 날짜로 묶어 기록으로 남겨요'
      }
      size="wide"
    >
      {step === 'pick' && (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted">
            영상은 찍은 폰의 앱 안에 저장돼요(서버에 올리지 않아요). 한 번에 여러 개를
            골라요. 같은 날 영상은 2개씩 한 기록이 돼요.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            multiple
            onChange={pick}
            className="hidden"
          />
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => inputRef.current?.click()}
          >
            영상 고르기
          </Button>
        </div>
      )}

      {step === 'reading' && (
        <p className="py-6 text-center text-sm text-muted">영상 날짜를 읽는 중…</p>
      )}

      {step === 'preview' && (
        <div className="space-y-4">
          <p className="text-sm leading-relaxed text-muted">
            묶음마다 기록 하나가 돼요. 날짜를 못 읽은 영상은 날짜를 적어 주세요. 다른 날
            영상이 섞였으면 [따로]로 빼요.
          </p>
          <ul className="space-y-3">
            {groups.map((g) => (
              <li
                key={g.key}
                className="rounded-2xl border border-line bg-surface-2 p-(--block-pad)"
              >
                <label className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-ink">날짜</span>
                  <input
                    type="date"
                    value={g.date ?? ''}
                    max={todayKey}
                    required
                    onChange={(e) => {
                      if (e.target.value)
                        setGroups((prev) => setGroupDate(prev, g.key, e.target.value));
                    }}
                    className="min-h-10 rounded-xl border border-transparent bg-ink/5 px-3 text-sm text-ink desk:border-line desk:bg-surface"
                  />
                  {g.items.some(needsDateCheck) && (
                    <span className="text-footnote text-warn">날짜를 확인하세요</span>
                  )}
                </label>
                <ul className="mt-2 divide-y divide-line">
                  {g.items.map((item) => (
                    <li key={item.id} className="flex min-h-10 items-center gap-2 py-1">
                      <Film aria-hidden className="h-4 w-4 shrink-0 text-muted" />
                      <span className="min-w-0 flex-1 truncate text-sm text-ink">
                        {item.name}
                      </span>
                      {g.items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setGroups((prev) => splitOut(prev, item.id))}
                          className="shrink-0 rounded-full px-3 py-1 text-footnote font-semibold text-sky-strong hover:bg-sky-tint"
                        >
                          따로
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={groups.some((g) => g.date == null)}
            onClick={() => void openGroup(0)}
          >
            {total}개 묶음 기록 남기기
          </Button>
        </div>
      )}

      {step === 'form' && group && (
        <div className="space-y-4">
          {placing && (
            <p className="text-sm text-muted">
              영상 {placing.n}/{group.items.length}을 폰에 넣는 중… {placing.pct}%
            </p>
          )}
          {error && (
            <div
              role="alert"
              className="space-y-2 rounded-2xl border border-danger-line bg-danger-bg p-(--block-pad) text-sm text-danger"
            >
              <p>{error}</p>
              {!placed && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => void openGroup(cursor)}
                >
                  다시 해 보기
                </Button>
              )}
            </div>
          )}
          {placed && (
            <EntryForm
              key={`${group.key}:${group.date}`}
              date={group.date ?? todayKey}
              importPrefill={prefill}
              onSaved={onSaved}
              onError={(m) => setError(m ?? null)}
              onSavingChange={setFormSaving}
            />
          )}
          <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
            <span className="text-footnote text-muted">
              남긴 {saved} · 건너뜀 {skipped}
            </span>
            <button
              type="button"
              disabled={!!placing || formSaving}
              onClick={() => void skip()}
              className="rounded-full px-3 py-2 text-footnote font-semibold text-muted transition-colors hover:text-ink disabled:opacity-50"
            >
              이 묶음 건너뛰기
            </button>
          </div>
        </div>
      )}

      {step === 'done' && (
        <div className="space-y-4 py-2 text-center">
          <p className="text-base font-semibold text-ink">
            {total}개 묶음 중 {saved}개를 남겼어요
            {skipped > 0 ? ` · 건너뜀 ${skipped}` : ''}
          </p>
          <p className="text-sm text-muted">
            남긴 기록은 캘린더 · 목록에서 보여요. 기억나는 느낌은 그날 화면의 &apos;더
            적기&apos;에 붙여요.
          </p>
          <Button
            type="button"
            size="lg"
            className="w-full"
            onClick={() => void close()}
          >
            닫기
          </Button>
        </div>
      )}
    </Modal>
  );
}
