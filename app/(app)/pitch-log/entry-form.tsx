'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Check, ChevronDown } from '@/components/icon';
import { Button, Field, Input, Textarea } from '@/components/ui';
import { Segmented } from '@/components/segmented';
import { ADMIN_MAX_VIDEO_MB, MAX_VIDEO_MB, VideoUpload, type UploadedVideo } from '@/components/video-upload';
import { usePlaybackUrls } from '@/components/use-playback-urls';
import { IntensityGuide } from '@/components/intensity-guide';
import { EffortChips, focusEffortChips } from '@/components/effort-chips';
import { makePitchThumb } from '@/lib/pitch-thumbs';
import { dateKeyLabel } from '@/lib/pitch-stats';
import { readEffort } from '@/lib/pitch-effort';
import { SESSION_TYPES, isRestSession } from '@/lib/session-type';
import type { LogPrefill } from '@/lib/velocity-meta';
import {
  GOOD_DAY_MIN,
  PITCH_CUES,
  SATISFACTION_ENDS,
  SATISFACTION_OPTIONS,
  isRatedSession,
} from '@/lib/pitch-satisfaction';
import {
  applySpeedUnit,
  fromSpeed,
  readSpeedUnit,
  round1,
  serverSpeedUnit,
  SPEED_UNITS,
  speedLabel,
  subscribeUnits,
  toSpeed,
  type SpeedUnit,
} from '@/lib/units-storage';
import { haptic } from '@/lib/haptics';
import { CHECK_CONNECTION } from '@/lib/offline';
import { discardPhoneVideos, isPhoneVideoPath, removePhoneVideos } from '@/lib/local-video';

/**
 * 하루치 투구를 남기는 입력 폼. 새로 남길 때와 고칠 때 모두 쓴다.
 *
 * 일지 화면에서 접었다 펼 수 있게 따로 뒀다. 지난 기록을 돌아볼 때는
 * 폼이 자리만 차지하고, 오늘 던진 걸 남길 때는 바로 열려 있어야 한다.
 */

/**
 * 올렸다가 저장하지 않고 버린 영상을 지우게 한다(app/api/pitch-log/discard — 기록에 붙은 파일은 서버가 건드리지 않는다).
 * 폼을 닫는 중에도 끝까지 가게 keepalive. 못 가도 그만이다 — 파일이 남을 뿐 기록은 멀쩡하다.
 */
function discardUploads(paths: string[]) {
  if (paths.length === 0) return;
  /* 폰 영상은 서버에 파일이 없다 — 어느 기록에도 안 붙은 것만 폰에서 지운다(예전엔 저장 없이 닫으면 앱 안에 남았다) */
  if (paths.some(isPhoneVideoPath)) void discardPhoneVideos(paths);
  const server = paths.filter((p) => !isPhoneVideoPath(p));
  if (server.length === 0) return;
  void fetch('/api/pitch-log/discard', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ paths: server }),
    keepalive: true,
  }).catch(() => {});
}

const EMPTY_FORM = {
  /* 비워 두고 꼭 고르게 — 예전엔 '불펜'이 미리 골라져 캐치볼도 불펜으로 저장됐다(2026-10-18 사용자: "비워둬") */
  sessionType: '' as string,
  pitchCount: '',
  /*
   * 체감 강도(%) — 기본값 없이 비워 둔다(2판 D2). 예전 1~10 막대는 5 에서 시작해 운영 기록의 3분의 2가 손대지 않은 5 였고,
   * 그 숫자로 휴식일 · 세게 던진 날이 정해졌다. 저장하기 전에 한 번은 고르게 한다.
   */
  effortPct: null as number | null,
  maxVelocity: '',
  avgVelocity: '',
  memo: '',
  /** 투구 만족도 '1'~'5', 안 골랐으면 '' */
  satisfaction: '',
  cuesGood: [] as string[],
  cuesBad: [] as string[],
};

type FormState = typeof EMPTY_FORM;

/*
 * 신호가 약해 못 보낸 기록을 폰에 맡겨 둔다 — 날짜 · 기록마다 하나(2026-10-16 베타 시뮬: 저장이 실패하면 영어 'Load failed'가 뜨고,
 * 창을 닫으면 적은 것이 통째로 사라졌다). 다시 열면 채워 주고, 저장에 성공하거나 '지우기'를 누르면 걷는다. 영상은 담지 않는다.
 * 저절로 다시 보내지는 않는다 — 응답만 끊기고 서버엔 들어간 경우 같은 기록이 둘 생길 수 있어서, 사람이 저장을 다시 누른다.
 */
const DRAFT_PREFIX = 'bullpen-pitch-log-draft:';
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function readDraft(key: string): FormState | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as { savedAt?: unknown; form?: Partial<FormState> };
    if (
      typeof d.savedAt !== 'number' ||
      Date.now() - d.savedAt > DRAFT_MAX_AGE_MS ||
      typeof d.form?.sessionType !== 'string'
    ) {
      window.localStorage.removeItem(key);
      return null;
    }
    return { ...EMPTY_FORM, ...d.form };
  } catch {
    return null;
  }
}

function writeDraft(key: string, form: FormState) {
  try {
    window.localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), form }));
  } catch {
    /* 사생활 보호 모드 등 — 맡길 곳이 없으면 그냥 지나간다(폼은 열린 채 남는다) */
  }
}

function clearDraft(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* 위와 같다 */
  }
}

/** fetch 가 서버에 닿지 못했나 — 브라우저마다 글이 달라('Failed to fetch' · 'Load failed') 글이 아니라 모양으로 본다 */
function isNetworkError(err: unknown) {
  return err instanceof TypeError || (typeof navigator !== 'undefined' && navigator.onLine === false);
}

/** 고칠 기록. 주어지면 수정 모드가 된다. */
/** 메커니즘 드릴로 던진 공 — 새 기록 칸에 채울 값(pitch-log/[date]/load.ts drillPrefillOf) */
export type DrillPrefill = { pitchCount: number; effortPct: number; memo: string };

/**
 * 과거 영상 가져오기(app/(app)/videos/import-sheet.tsx)가 폰에 넣어 둔 영상으로 새 기록 폼을 연다 — 영상 경로와 미리보기 주소(blob:).
 * 폰 정리는 시트가 맡는다(저장 안 하고 닫으면 시트가 지움). 이 폼에서 빼면 그 영상만 폰에서 지운다.
 */
export type ImportPrefill = { videoPaths: string[]; previewUrls: Record<string, string> };

export type EntryDraft = {
  id: string;
  sessionType: string;
  pitchCount: number;
  /** 옛 1~10(쉰 날 0) — effortPct 가 없는 옛 기록은 이것으로 % 를 채운다(lib/pitch-effort.ts readEffort) */
  intensity: number;
  /** 체감 강도(%). 칸이 생기기 전 기록 · 쉰 날은 null */
  effortPct?: number | null;
  maxVelocity: number | null;
  avgVelocity: number | null;
  memo: string | null;
  /** 이미 붙어 있는 영상의 저장소 경로 */
  videoPaths: string[];
  satisfaction?: number | null;
  cuesGood?: string[];
  cuesBad?: string[];
};

/** 고르는 알약 — 휴대폰은 테두리 없는 회색 알약(고른 것은 파랑으로 두름), PC 는 예전 네모 */
function chipClass(active: boolean) {
  return `min-h-10 rounded-full border px-4 text-sm transition-colors desk:min-h-0 desk:rounded-xl desk:py-2 ${
    active
      ? 'border-sky bg-sky/10 font-semibold text-sky-strong'
      : 'border-transparent bg-ink/6 text-ink/80 desk:border-line desk:bg-surface-2 desk:text-muted desk:hover:border-sky-soft desk:hover:text-ink'
  }`;
}

/**
 * 투구 만족도 1~5 + 접힌 '느낀 점 더하기'(좋았던 것 · 아쉬웠던 것 칩).
 *
 * 매기는 것은 한 번 누르기 하나로 둔다 — 칸이 많으면 귀찮아서 안 남기고, 안 남기면 '잘 던진 날 찾기'가 돌지 않는다.
 * 칩은 더 적고 싶은 날만 펼친다. 한 감각은 한쪽에만 — 반대쪽에서 고르면 이쪽에서 풀린다.
 */
function SatisfactionFields({
  value,
  good,
  bad,
  onChange,
}: {
  value: string;
  good: string[];
  bad: string[];
  onChange: (next: {
    satisfaction?: string;
    cuesGood?: string[];
    cuesBad?: string[];
  }) => void;
}) {
  const [open, setOpen] = useState(good.length + bad.length > 0);
  const toggle = (cue: string, side: 'good' | 'bad') => {
    const mine = side === 'good' ? good : bad;
    const other = side === 'good' ? bad : good;
    const nextMine = mine.includes(cue)
      ? mine.filter((c) => c !== cue)
      : [...mine, cue];
    const nextOther = other.filter((c) => c !== cue);
    onChange(
      side === 'good'
        ? { cuesGood: nextMine, cuesBad: nextOther }
        : { cuesGood: nextOther, cuesBad: nextMine }
    );
  };

  return (
    <div className="space-y-2">
      <span className="block text-xs font-medium tracking-normal text-muted">
        투구 만족도
      </span>
      <Segmented
        label="투구 만족도"
        value={value}
        onChange={(v) => onChange({ satisfaction: v })}
        options={SATISFACTION_OPTIONS}
        size="md"
      />
      <div className="flex justify-between px-1 text-xs text-muted/70">
        <span>1 {SATISFACTION_ENDS.low}</span>
        <span>{SATISFACTION_ENDS.high} 5</span>
      </div>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex min-h-10 items-center gap-1 text-sm font-medium text-sky desk:min-h-0 desk:py-1"
      >
        느낀 점 더하기
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="motion-safe:animate-fade-in space-y-3">
          {(
            [
              ['good', '좋았던 것', good],
              ['bad', '아쉬웠던 것', bad],
            ] as const
          ).map(([side, title, picked]) => (
            <div key={side} role="group" aria-label={title} className="space-y-2">
              <span className="block text-xs text-muted">{title}</span>
              <div className="chip-grid flex flex-wrap gap-2">
                {PITCH_CUES.map((cue) => {
                  const on = picked.includes(cue);
                  return (
                    <button
                      key={cue}
                      type="button"
                      onClick={() => toggle(cue, side)}
                      aria-pressed={on}
                      className={`inline-flex items-center gap-1 ${chipClass(on)}`}
                    >
                      {on && (
                        <Check aria-hidden className="h-3.5 w-3.5" />
                      )}
                      {cue}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** 저장소 경로에서 사람이 읽을 이름만 떼어낸다 */
function fileNameOf(path: string) {
  return path.split('/').pop() || path;
}

/** 구속 칸이 쓰는 범위. 저장 단위(km/h) 기준이다. */
const SPEED_MIN_KMH = 30;
const SPEED_MAX_KMH = 200;

/**
 * 구속 한 칸 — 고른 단위로 보여주고, 들고 있는 값은 늘 km/h 다.
 *
 * 부모(form)가 담는 값을 바꾸지 않는 것이 중요하다. 저장도 부하 계산도 km/h
 * 기준이라, 화면에서 mph 로 보인다고 그 숫자가 그대로 올라가면 145 가 234 가
 * 된다.
 *
 * 소수 한 자리를 그대로 둔다. 예전부터 138.5 처럼 적을 수 있었고, 스피드건에
 * 따라 소수를 읽어 주는 것도 있다.
 */
function SpeedInput({
  label,
  hint,
  kmh,
  onKmh,
  sample,
}: {
  label: string;
  hint: string;
  /** 지금 값 (km/h 문자열) */
  kmh: string;
  onKmh: (kmh: string) => void;
  /** km/h 기준 예시 숫자 — 다른 단위면 환산해 보여준다 */
  sample: number;
}) {
  const unit = useSyncExternalStore(subscribeUnits, readSpeedUnit, serverSpeedUnit);
  const shown = kmh === '' ? '' : String(round1(toSpeed(Number(kmh), unit)));

  return (
    <Field label={`${label} (${speedLabel(unit)})`} hint={hint}>
      <Input
        type="number"
        /* 아이폰은 type=number 만으로는 숫자판이 아니라 전체 자판을 연다 */
        inputMode="decimal"
        step="0.1"
        min={round1(toSpeed(SPEED_MIN_KMH, unit))}
        max={round1(toSpeed(SPEED_MAX_KMH, unit))}
        value={shown}
        onChange={(e) => {
          const v = e.target.value;
          onKmh(v === '' ? '' : String(round1(fromSpeed(Number(v), unit))));
        }}
        placeholder={String(Math.round(toSpeed(sample, unit)))}
      />
    </Field>
  );
}

/**
 * 구속 단위를 칸 바로 밑에서 고른다(2026-10-16 베타 시뮬: 미국에서 쓰는 사람이 mph 86 을 km/h 칸에 그대로 적어 '역대 최고 88km/h'가
 * 쌓였다 — 단위 설정이 설정 깊숙이에만 있었다). 바꾸면 앱 전체 표시 단위가 바뀌고(설정의 단위와 같은 값), 적은 값은 그대로 km/h 로 들고 있다.
 */
function SpeedUnitSwitch() {
  const unit = useSyncExternalStore(subscribeUnits, readSpeedUnit, serverSpeedUnit);
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted">스피드건이 mph 면 단위를 바꿔 적어요</span>
      <Segmented
        label="구속 단위"
        value={unit}
        onChange={(v) => applySpeedUnit(v as SpeedUnit)}
        options={SPEED_UNITS.map((u) => ({ value: u.value, label: u.label }))}
        layout="flow"
      />
    </div>
  );
}

export function EntryForm({
  date,
  initial,
  prefill,
  drillPrefill,
  importPrefill,
  onSaved,
  onError,
  onCancel,
  onSavingChange,
  isAdmin = false,
}: {
  date: string;
  /** 주어지면 등록이 아니라 수정 폼이 된다. */
  initial?: EntryDraft;
  /**
   * 새 기록을 구속 측정 값으로 채워 연다(2026-10-16 — 측정은 별개 기록, 그날 화면이 아직 안 남긴 측정을 권한다). 저장하면 그 세션들을
   * 이 기록에 잇는다(app/api/pitch-log POST). 수정 폼에서는 안 쓴다.
   */
  prefill?: LogPrefill | null;
  /**
   * 새 기록을 메커니즘 드릴로 던진 공으로 채워 연다(2026-10-16 — 트레이닝의 '드릴로 공 N회 던졌어요' 카드가 데려온다).
   * 캐치볼 · 투구수 · 체감 강도 · 메모만 채우고 선수가 고쳐 저장한다. 구속 측정 prefill 이 있으면 그쪽이 먼저. 수정 폼에서는 안 쓴다.
   */
  drillPrefill?: DrillPrefill | null;
  /** 과거 영상 가져오기 — 폰에 넣어 둔 영상을 붙인 채 연다(2026-10-17). 날짜는 date. 수정 폼에서는 안 쓴다 */
  importPrefill?: ImportPrefill | null;
  onSaved: () => Promise<void> | void;
  onError: (message?: string) => void;
  onCancel?: () => void;
  /** 저장 중인지 바깥에 알린다 — 가져오기 시트가 그동안 건너뛰기 · 닫기를 막는다(폰 영상이 저장 도중 지워지지 않게) */
  onSavingChange?: (saving: boolean) => void;
  /** 관리자 영상은 폰이 아니라 늘 서버에 — 앱을 다시 깔면 폰 안 영상이 지워진다(2026-10-16 김민: 관리자가 올리는 건 Supabase 에) */
  isAdmin?: boolean;
}) {
  const editing = Boolean(initial);

  /*
   * 쉰 날 기록은 투구수 · 강도가 0 으로 저장돼 있다(서버가 쉰 날은 0 으로 적는다). 그대로 채우면 던진 날로 바꿀 때 0% 가
   * 들어가 저장이 막힌다 — 쉰 날이면 비운 채(새 기록처럼) 시작한다. 체감 강도(%)가 없는 옛 기록은 1~10 × 10 으로 채운다.
   */
  const initialEffort = initial ? readEffort(initial) : null;
  /* 처음 채울 값 — 폰에 맡겨 둔 기록을 '지우기' 하면 여기로 되돌린다 */
  const startForm = (): FormState =>
    initial
      ? {
          sessionType: initial.sessionType,
          pitchCount: initial.pitchCount > 0 ? String(initial.pitchCount) : '',
          effortPct: initialEffort?.pct ?? null,
          maxVelocity: initial.maxVelocity == null ? '' : String(initial.maxVelocity),
          avgVelocity: initial.avgVelocity == null ? '' : String(initial.avgVelocity),
          memo: initial.memo ?? '',
          satisfaction:
            initial.satisfaction == null ? '' : String(initial.satisfaction),
          cuesGood: initial.cuesGood ?? [],
          cuesBad: initial.cuesBad ?? [],
        }
      : prefill
        ? {
            ...EMPTY_FORM,
            sessionType: prefill.sessionType ?? EMPTY_FORM.sessionType,
            pitchCount: String(prefill.pitchCount),
            effortPct: prefill.effortPct,
            maxVelocity: String(prefill.maxVelocity),
            avgVelocity: String(prefill.avgVelocity),
          }
        : drillPrefill
          ? {
              ...EMPTY_FORM,
              sessionType: '캐치볼',
              pitchCount: String(drillPrefill.pitchCount),
              effortPct: drillPrefill.effortPct,
              memo: drillPrefill.memo,
            }
          : EMPTY_FORM;
  const [form, setForm] = useState(startForm);
  const draftKey = `${DRAFT_PREFIX}${date}:${initial?.id ?? 'new'}`;
  /* 폰에 맡겨 둔(신호가 약해 못 보낸) 기록으로 채웠다 — 폼 위에 한 줄 + 지우기 */
  const [restored, setRestored] = useState(false);
  const [videos, setVideos] = useState<UploadedVideo[]>(() =>
    initial
      ? initial.videoPaths.map((path) => ({ path, name: fileNameOf(path) }))
      : (importPrefill?.videoPaths ?? []).map((path) => ({
          path,
          name: fileNameOf(path),
          previewUrl: importPrefill?.previewUrls[path],
        }))
  );
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    onSavingChange?.(saving);
  }, [saving, onSavingChange]);
  /*
   * '더 적기' — 구속 · 영상 · 만족도 · 메모(2026-10-15 사용자 "투구 파트도 우리 시스템에 맞게"). 꼭 적을 것(종류 · 투구수 · 체감 강도)만
   * 펴 두고 나머지는 접는다 — 예전엔 칸 열 개가 한꺼번에 떠 저장 단추까지 한참 굴렸다. 고칠 때 이미 적은 것이 있으면 펴서 연다.
   * 접어도 내용은 그대로 둔다(hidden) — 올리던 영상 · 적던 글이 사라지지 않게.
   */
  const [more, setMore] = useState(
    () =>
      /* 구속 측정으로 채웠으면 구속 칸이 보이게 편다 */
      (!initial && !!prefill) ||
      /* 드릴로 채웠으면 메모가 보이게 편다 */
      (!initial && !!drillPrefill) ||
      /* 가져온 영상이 보이게 편다 */
      (!initial && !!importPrefill) ||
      (!!initial &&
      (initial.maxVelocity != null ||
        initial.avgVelocity != null ||
        initial.videoPaths.length > 0 ||
        !!initial.memo ||
        initial.satisfaction != null ||
        (initial.cuesGood?.length ?? 0) + (initial.cuesBad?.length ?? 0) > 0))
  );
  useEffect(() => {
    /* 측정 · 드릴 · 가져온 영상으로 채워 여는 폼은 그 값이 먼저다 */
    if (prefill || drillPrefill || importPrefill) return;
    const draft = readDraft(draftKey);
    if (!draft) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 붙은 뒤 한 번, 폰에 맡겨 둔 기록을 되찾는다(서버 그림과 어긋나지 않게 효과에서)
    setForm(draft);
    setRestored(true);
    if (draft.maxVelocity || draft.avgVelocity || draft.memo || draft.satisfaction) setMore(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 처음 붙을 때 한 번만
  }, []);
  /* 체감 강도를 안 고른 채 저장을 눌렀다 — 칩 밑에 한 줄, 고르면 걷는다 */
  const [effortMissing, setEffortMissing] = useState(false);
  const effortId = useId();
  /* 옛 1~10 에서 채운 값을 손대지 않았다 — 저장할 때 옛 강도를 그대로 보내고, 칩 밑에 어디서 온 값인지 알린다 */
  const keepsLegacyEffort =
    initialEffort?.derivedFrom != null && form.effortPct === initialEffort.pct;
  /*
   * 이 폼에서 새로 올리고 아직 저장하지 않은 영상. 빼거나 저장 없이 폼을 닫으면 지운다 — 예전에는 버린 업로드가 저장소에
   * 영영 남았다. 저장이 끝나면 비운다(기록에 붙었다). 저장하는 중에 닫히면 지우지 않는다(곧 기록에 붙는다).
   */
  const freshRef = useRef(new Set<string>());
  const savingRef = useRef(false);
  /* 닫을 때 풀 미리보기(blob:) — 방금 올린 파일을 쥐고 있어, 안 풀면 화면을 떠나도 그 파일이 메모리에 남는다 */
  const blobUrlsRef = useRef<string[]>([]);
  useEffect(() => {
    blobUrlsRef.current = videos
      .map((v) => v.previewUrl)
      .filter((u): u is string => !!u?.startsWith('blob:'));
  }, [videos]);
  useEffect(() => {
    const fresh = freshRef.current;
    const blobs = blobUrlsRef;
    return () => {
      if (!savingRef.current) discardUploads([...fresh]);
      for (const url of blobs.current) URL.revokeObjectURL(url);
    };
  }, []);
  /* 목록이 바뀔 때 — 새로 올린 것이 빠졌으면 그것만 지운다 */
  const changeVideos = (next: UploadedVideo[]) => {
    const kept = new Set(next.map((v) => v.path));
    const gone = [...freshRef.current].filter((p) => !kept.has(p));
    gone.forEach((p) => freshRef.current.delete(p));
    discardUploads(gone);
    /* 가져온 영상(폰)을 뺐으면 폰에서도 지운다 — 시트는 저장 안 한 묶음만 정리해서, 여기서 뺀 것은 여기서 */
    const goneImport = (importPrefill?.videoPaths ?? []).filter(
      (p) => !kept.has(p) && isPhoneVideoPath(p) && videos.some((v) => v.path === p)
    );
    if (goneImport.length > 0) void removePhoneVideos(goneImport).catch(() => undefined);
    setVideos(next);
  };
  /*
   * 영상을 올리는 중인가. 그동안은 저장을 막는다.
   *
   * 올리는 영상은 다 올라가야 목록(videos)에 들어간다. 그 전에 저장하면 기록은
   * 영상 없이 저장되고 사용자는 모른다 — "올리는 중 35%"일 때 누른 저장이 그랬다.
   * 올라간 파일은 붙을 곳 없이 저장소에 남았다.
   */
  const [uploading, setUploading] = useState(false);

  /*
   * 이미 올려둔 영상의 재생 주소를 받아온다.
   *
   * 저장소 파일은 주소를 그때그때 발급받아야 열린다. 주소가 오기 전에는
   * 목록에 이름만 보이고, 오면 그 자리에서 재생할 수 있게 된다.
   */
  const existingPaths = useMemo(
    () => (initial?.videoPaths ?? []).slice(),
    [initial?.videoPaths]
  );
  const { urls: playbackUrls } = usePlaybackUrls(existingPaths);

  /*
   * 주소가 오면 그 자리에서 합친다.
   *
   * 상태에 다시 넣지 않는다. 주소는 받아온 것에서 그대로 나오는 값이라,
   * 굳이 따로 들고 있으면 둘이 어긋날 자리만 생긴다.
   */
  const shownVideos = useMemo(
    () =>
      videos.map((v) =>
        v.previewUrl ? v : { ...v, previewUrl: playbackUrls[v.path] }
      ),
    [videos, playbackUrls]
  );

  /** 저장돼 있던 영상을 빼면 되돌릴 수 없다 — 뺄 때 알린다 */
  const removeNote = (video: UploadedVideo) =>
    initial?.videoPaths.includes(video.path)
      ? '저장돼 있던 영상이에요. 빼면 되돌릴 수 없어요.'
      : undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    /* 단추는 막혀 있지만 Enter 로도 제출된다 */
    if (uploading) return;
    /*
     * 구속이 범위 밖 — 폼이 noValidate 라 여기서 본다. 예전에는 브라우저 검사가 접힌 '더 적기' 안의 칸을 보여 주지 못해
     * 저장을 눌러도 아무 말 없이 멈췄다(2026-10-16). 펴서 칸이 보이게 하고 알린다(서버도 같은 선으로 막는다).
     */
    const outOfRange = (kmh: string) =>
      kmh !== '' && !(Number(kmh) >= SPEED_MIN_KMH && Number(kmh) <= SPEED_MAX_KMH);
    if (!isRestSession(form.sessionType) && [form.maxVelocity, form.avgVelocity].some(outOfRange)) {
      const unit = readSpeedUnit();
      setMore(true);
      onError(
        `구속은 ${round1(toSpeed(SPEED_MIN_KMH, unit))}~${round1(toSpeed(SPEED_MAX_KMH, unit))} ${speedLabel(unit)} 사이로 적어 주세요.`
      );
      return;
    }
    if (!form.sessionType) {
      onError('투구 종류를 골라 주세요.');
      return;
    }
    /* 던진 날인데 체감 강도를 안 골랐다 — 서버까지 가지 않고 그 칸으로 보낸다(서버도 같은 말로 막는다) */
    if (!isRestSession(form.sessionType) && form.effortPct == null) {
      onError(undefined);
      setEffortMissing(true);
      focusEffortChips(effortId);
      return;
    }
    setSaving(true);
    savingRef.current = true;
    onError(undefined);

    try {
      const res = await fetch('/api/pitch-log', {
        method: editing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          /* 고칠 때는 열 때의 영상 목록도 — 서버가 이 폼에서 뺀 것만 지운다(다른 기기에서 더한 것은 남김) */
          ...(editing
            ? { id: initial!.id, baseVideoPaths: initial!.videoPaths }
            : { date, ...(prefill ? { velocitySessionIds: prefill.sessionIds } : {}) }),
          videoPaths: videos.map((v) => v.path),
          sessionType: form.sessionType,
          pitchCount: form.pitchCount,
          /*
           * 옛 기록(체감 강도 % 없음)을 고치는데 채워 둔 값을 그대로 두었으면 옛 1~10 을 보낸다 — 서버가 같은 강도면 % 칸을
           * 비운 채 둔다(lib/pitch-effort.ts effortUpdate). 그래야 null 이 '% 로 고른 적 없음'으로 남는다. 바꿨으면 % 를 보낸다.
           */
          ...(keepsLegacyEffort
            ? { intensity: initial!.intensity }
            : { effortPct: form.effortPct }),
          maxVelocity: form.maxVelocity,
          avgVelocity: form.avgVelocity,
          memo: form.memo,
          satisfaction: form.satisfaction,
          cuesGood: form.cuesGood,
          cuesBad: form.cuesBad,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          data.error ?? (editing ? '수정에 실패했어요.' : '저장에 실패했어요.')
        );
      }
      /* 새로 올린 영상은 이제 기록에 붙었다 — 폼을 닫아도 지우지 않는다 */
      freshRef.current.clear();
      /* 고치며 뺀 폰 영상은 이 폰에서도 지운다(서버는 파일이 없어 미리보기만 지운다). 다른 폰의 영상이면 아무 일 없다 */
      if (editing) {
        const kept = new Set(videos.map((v) => v.path));
        void removePhoneVideos(initial!.videoPaths.filter((p) => isPhoneVideoPath(p) && !kept.has(p)));
      }
      clearDraft(draftKey);
      setRestored(false);

      // 수정은 폼을 비우지 않는다. 저장하면 폼 자체가 닫히기 때문이다.
      if (!editing) {
        setForm(EMPTY_FORM);
        /* 방금 올린 것만 주소를 거둔다 — 저장소 재생 주소는 거둘 것이 없다 */
        videos.forEach((v) => {
          if (v.previewUrl?.startsWith('blob:')) URL.revokeObjectURL(v.previewUrl);
        });
        setVideos([]);
      }
      haptic('success');
      await onSaved();
    } catch (err) {
      if (isNetworkError(err)) {
        /* 신호가 약해 서버에 못 닿았다 — 브라우저 영어 글('Load failed') 대신 한국어로, 적은 것은 폰에 맡긴다(창을 닫아도 다시 채움) */
        writeDraft(draftKey, form);
        onError(`저장하지 못했어요. ${CHECK_CONNECTION} 적은 내용은 이 폰에 남겨 뒀어요.`);
      } else {
        const fallback = editing ? '수정에 실패했어요.' : '저장에 실패했어요.';
        onError(err instanceof Error ? err.message : fallback);
      }
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  const resting = isRestSession(form.sessionType);
  const rated = isRatedSession(form.sessionType);

  return (
    /* noValidate — 브라우저 검사는 접힌 칸을 못 보여 줘 말없이 막는다. 검사는 handleSubmit · 서버가 한국어로 한다 */
    <form noValidate onSubmit={handleSubmit} className="space-y-5">
      {restored && (
        <p className="flex flex-wrap items-center gap-x-2 rounded-xl bg-sky/10 px-3 py-2 text-footnote text-ink/80">
          저장하지 못했던 기록을 다시 채웠어요. 저장을 눌러 주세요.
          <button
            type="button"
            onClick={() => {
              clearDraft(draftKey);
              setRestored(false);
              setForm(startForm());
            }}
            className="min-h-10 font-medium text-sky desk:min-h-0"
          >
            지우기
          </button>
        </p>
      )}
      <div className="space-y-5">
          <Field
            label="투구 종류"
            hint={SESSION_TYPES.find((t) => t.name === form.sessionType)?.hint}
          >
            <div className="chip-grid mt-1 flex flex-wrap gap-2">
              {SESSION_TYPES.map((t) => {
                const active = form.sessionType === t.name;
                return (
                  <button
                    key={t.name}
                    type="button"
                    onClick={() => setForm({ ...form, sessionType: t.name })}
                    aria-pressed={active}
                    className={chipClass(active)}
                  >
                    {t.name}
                  </button>
                );
              })}
            </div>
          </Field>

          {/*
        쉰 날에는 투구수 · 강도 칸을 감춘다. 안 던졌는데 "투구수를 입력하세요"라고 하면 남길 수가 없다.
        쉰 날은 메모가 전부라 접지 않고 바로 둔다(이미 붙은 영상이 있으면 뺄 수 있게 같이).
      */}
          {!resting && (
            <>
              <Field label="투구수">
                {/* 상한은 오타를 잡는 자리다. 서버에서 같은 선으로 한 번 더 본다. */}
                <Input
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="500"
                  value={form.pitchCount}
                  onChange={(e) => setForm({ ...form, pitchCount: e.target.value })}
                  placeholder="45"
                  required
                />
                {/* 구속 측정으로 채운 투구 수는 잰 공만이다 — 못 잰 공을 알린다(2026-10-18 사용자) */}
                {!initial && prefill?.missed ? (
                  <p className="mt-1.5 text-xs text-warn">
                    못 잰 공 {prefill.missed}개는 빠졌어요. 실제로 던진 수가 다르면 고쳐 주세요.
                  </p>
                ) : null}
              </Field>
              {/*
                강도(1~10) — 투구수 옆 반 칸이 아니라 한 줄을 다 쓴다. 칩 열이 넓은 화면의 반의반 칸에는 안 들어간다.
                강도는 부하 지수 · 휴식일 · 세게 던진 날을 정하는 값이라, 감으로 찍으면 그 뒤 계산이 전부 흔들린다.
                고르는 자리 바로 밑에 기준을 둔다. Field(label)로 감싸지 않는다 — 단추 여럿을 label 이 감싸면 이름을
                눌러도 첫 칩이 눌린다.
              */}
              <div className="space-y-3">
                <EffortChips
                  id={effortId}
                  value={form.effortPct}
                  onChange={(pct) => {
                    setEffortMissing(false);
                    setForm({ ...form, effortPct: pct });
                  }}
                  invalid={effortMissing}
                />
                <IntensityGuide kind="pitch" />
              </div>

            </>
          )}
          {resting ? (
            <>
          {/*
        고칠 때도 영상을 바꿀 수 있다.

        예전에는 새로 남길 때만 열어두었다 — 영상을 빼면 거기 붙은 폼 분석이
        주인 없이 남기 때문이다. 그래서 영상 하나 바꾸려면 기록을 통째로 지우고
        다시 써야 했다. 지금은 뺀 영상의 분석을 서버가 함께 지우므로 열어둔다.

        쉰 날에도 이미 붙어 있는 영상은 보여준다. 안 보이면 뺄 수가 없다.
      */}
          {(!resting || videos.length > 0) && (
            <Field
              label="투구 영상"
              hint={
                resting
                  ? '쉰 날에는 새로 올릴 수 없어요. 이미 붙어 있는 영상은 뺄 수 있어요.'
                  : '폰이나 컴퓨터에 있는 영상을 바로 올릴 수 있어요.'
              }
            >
              <div className="space-y-3">
                <VideoUpload
                  videos={shownVideos}
                  onChange={changeVideos}
                  max={2}
                  disabled={resting}
                  confirmRemove={removeNote}
                  onUploadingChange={setUploading}
                  compress
                  toPhone={!isAdmin}
                  maxMb={isAdmin ? ADMIN_MAX_VIDEO_MB : MAX_VIDEO_MB}
                  /* 영상 캘린더의 썸네일 — 손에 든 파일에서 바로 뜬다(기다리지 않는다) */
                  onUploaded={(path, file) => {
                    freshRef.current.add(path);
                    void makePitchThumb(path, file);
                  }}
                />
              </div>
            </Field>
          )}

          <Field
            label={resting ? '메모' : '특이사항 · 느낀점'}
            hint={
              rated && Number(form.satisfaction) >= GOOD_DAY_MIN && !form.memo.trim()
                ? '잘 던진 날 남긴 메모는 다음에 던지는 날 홈에 다시 띄워 드려요.'
                : undefined
            }
          >
            <Textarea
              rows={4}
              value={form.memo}
              onChange={(e) => setForm({ ...form, memo: e.target.value })}
              placeholder={
                resting
                  ? '어깨가 뻐근해서 쉼'
                  : '릴리즈 포인트가 일정했고 5회부터 팔이 무거워짐'
              }
            />
          </Field>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setMore((o) => !o)}
                aria-expanded={more}
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-xl bg-ink/5 px-4 text-left transition-colors active:bg-ink/8 desk:min-h-10 desk:border desk:border-line desk:bg-transparent desk:hover:border-sky-soft"
              >
                <span className="text-subhead font-semibold text-sky-strong">더 적기</span>
                <span className="flex min-w-0 items-center gap-1 text-footnote text-muted">
                  <span className="truncate">구속 · 영상 · 만족도 · 메모</span>
                  <ChevronDown
                    aria-hidden
                    className={`h-4 w-4 shrink-0 transition-transform ${more ? 'rotate-180' : ''}`}
                  />
                </span>
              </button>
              {/* 넓은 화면에서는 두 칸 — 왼쪽 구속 · 만족도, 오른쪽 영상 · 메모 */}
              <div
                className={
                  more
                    ? 'space-y-5 motion-safe:animate-fade-in lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-8 lg:space-y-0'
                    : 'hidden'
                }
              >
                <div className="space-y-5">
              {/*
        구속은 둘 다 선택 항목이다.

        예전에는 최고 구속이 필수였는데, 스피드건이 없는 선수는 그것 때문에
        기록을 아예 못 남겼다. 기록이 없으면 부하 지수도 트레이닝도 돌지
        않으니 앱이 통째로 멈추는 셈이었다. 부하는 투구수 × 강도로 내므로
        구속이 없어도 계산은 그대로 된다.
      */}
              <div className="grid gap-5 sm:grid-cols-2">
                <SpeedInput
                  label="최고 구속"
                  hint="스피드건이 없으면 비워두세요."
                  kmh={form.maxVelocity}
                  onKmh={(v) => setForm({ ...form, maxVelocity: v })}
                  sample={138}
                />
                <SpeedInput
                  label="평균 구속"
                  hint="비워두셔도 돼요."
                  kmh={form.avgVelocity}
                  onKmh={(v) => setForm({ ...form, avgVelocity: v })}
                  sample={132}
                />
              </div>
              <SpeedUnitSwitch />
          {/* 불펜 · 라이브 · 경기만 — 캐치볼은 가볍게 주고받는 날이라 '잘 던진 날 찾기'를 흐린다 */}
          {rated && (
            <SatisfactionFields
              value={form.satisfaction}
              good={form.cuesGood}
              bad={form.cuesBad}
              onChange={(next) => setForm({ ...form, ...next })}
            />
          )}

                </div>
                <div className="space-y-5">
          {/*
        고칠 때도 영상을 바꿀 수 있다.

        예전에는 새로 남길 때만 열어두었다 — 영상을 빼면 거기 붙은 폼 분석이
        주인 없이 남기 때문이다. 그래서 영상 하나 바꾸려면 기록을 통째로 지우고
        다시 써야 했다. 지금은 뺀 영상의 분석을 서버가 함께 지우므로 열어둔다.

        쉰 날에도 이미 붙어 있는 영상은 보여준다. 안 보이면 뺄 수가 없다.
      */}
          {(!resting || videos.length > 0) && (
            <Field
              label="투구 영상"
              hint={
                resting
                  ? '쉰 날에는 새로 올릴 수 없어요. 이미 붙어 있는 영상은 뺄 수 있어요.'
                  : '폰이나 컴퓨터에 있는 영상을 바로 올릴 수 있어요.'
              }
            >
              <div className="space-y-3">
                <VideoUpload
                  videos={shownVideos}
                  onChange={changeVideos}
                  max={2}
                  disabled={resting}
                  confirmRemove={removeNote}
                  onUploadingChange={setUploading}
                  compress
                  toPhone={!isAdmin}
                  maxMb={isAdmin ? ADMIN_MAX_VIDEO_MB : MAX_VIDEO_MB}
                  /* 영상 캘린더의 썸네일 — 손에 든 파일에서 바로 뜬다(기다리지 않는다) */
                  onUploaded={(path, file) => {
                    freshRef.current.add(path);
                    void makePitchThumb(path, file);
                  }}
                />
              </div>
            </Field>
          )}

          <Field
            label={resting ? '메모' : '특이사항 · 느낀점'}
            hint={
              rated && Number(form.satisfaction) >= GOOD_DAY_MIN && !form.memo.trim()
                ? '잘 던진 날 남긴 메모는 다음에 던지는 날 홈에 다시 띄워 드려요.'
                : undefined
            }
          >
            <Textarea
              rows={4}
              value={form.memo}
              onChange={(e) => setForm({ ...form, memo: e.target.value })}
              placeholder={
                resting
                  ? '어깨가 뻐근해서 쉼'
                  : '릴리즈 포인트가 일정했고 5회부터 팔이 무거워짐'
              }
            />
          </Field>
                </div>
              </div>
            </>
          )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          disabled={saving || uploading}
          className="w-full sm:w-auto"
        >
          {saving
            ? '저장 중…'
            : uploading
              ? '영상 올리는 중… 끝나면 저장할 수 있어요'
              : editing
                ? '수정 저장'
                : /* '2026-10-04 기록 저장' 은 웹 표기 같았다 — '10월 4일 기록 저장'(2026-10-04 '앱 느낌') */
                  `${dateKeyLabel(date)} 기록 저장`}
        </Button>
        {editing && onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-11 w-full rounded-full bg-ink/6 px-5 text-sm font-medium text-ink transition-colors active:bg-ink/10 sm:w-auto desk:min-h-0 desk:bg-transparent desk:px-0 desk:font-normal desk:text-muted desk:hover:text-ink"
          >
            취소
          </button>
        )}
      </div>
    </form>
  );
}
