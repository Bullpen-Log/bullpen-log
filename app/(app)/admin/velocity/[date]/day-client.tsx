'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Film, Trash2, X } from 'lucide-react';
import { Badge, Button, Card, FormError } from '@/components/ui';
import {
  adminDeleteClip,
  adminDeleteVelocityPitch,
  adminDeleteVelocitySession,
  adminUpdateSession,
  adminUpdateVelocityPitch,
  type AdminActionResult,
} from '@/app/actions/velocity-admin';
import type { AdminPitchRow, AdminSessionRow } from '@/lib/velocity-admin-load';
import {
  CONFIDENCE_TEXT,
  pitchTypeLabel,
  sessionSetupText,
  zoneLabel,
  type ConfidenceKey,
} from '@/lib/velocity-meta';
import { approachOf } from '@/lib/velocity-setup';
import { analyzeVideo, type AnalyzeResult } from '@/lib/velocity-engine/analyze-video';
import { quietRefresh } from '@/lib/quiet-refresh';
import { errorTone, hhmm, mb, signed } from '../format';

/**
 * 하루의 세션 카드들 — 세션마다 머리(시각 · 닉네임 · 설정 · 기기 · 화각) · 공 줄 · 지우기.
 * 공 줄에서 스피드건 값 · 제외 표시를 바로 고치고, 클립이 있으면 창을 열어 보고 다시 잰다.
 *
 * 값은 km/h 고정 — 관리자 보정 자료라 사용자 단위 설정을 따르지 않는다.
 */
export function DayClient({ sessions }: { sessions: AdminSessionRow[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [clip, setClip] = useState<{
    session: AdminSessionRow;
    pitch: AdminPitchRow;
  } | null>(null);

  /** 액션을 돌리고 결과를 새로 받는다 — 실패하면 위에 한 줄 */
  function run(action: () => Promise<AdminActionResult>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const res = await action();
      if (!res.ok) {
        setError(res.error);
        return;
      }
      after?.();
      quietRefresh(router);
    });
  }

  return (
    <div className="stack-block flex flex-col">
      <FormError>{error}</FormError>
      {sessions.map((s) => (
        <SessionCard
          key={s.id}
          session={s}
          pending={pending}
          onRun={run}
          onOpenClip={(pitch) => setClip({ session: s, pitch })}
        />
      ))}
      {clip && (
        <ClipDialog
          session={clip.session}
          pitch={clip.pitch}
          pending={pending}
          onClose={() => setClip(null)}
          onDeleteClip={() =>
            run(
              () => adminDeleteClip(clip.pitch.id),
              () => setClip(null)
            )
          }
        />
      )}
    </div>
  );
}

type Run = (action: () => Promise<AdminActionResult>, after?: () => void) => void;

/* ───────────────────────── 세션 ───────────────────────── */

function SessionCard({
  session: s,
  pending,
  onRun,
  onOpenClip,
}: {
  session: AdminSessionRow;
  pending: boolean;
  onRun: Run;
  onOpenClip: (pitch: AdminPitchRow) => void;
}) {
  const [memo, setMemo] = useState(s.memo ?? '');
  const meta = [
    s.source === 'file' ? '영상 파일' : '카메라',
    s.device,
    `화각 ${s.fovDeg}°`,
    s.focalPx != null ? `초점거리 ${Math.round(s.focalPx)}px` : null,
    s.frameW && s.frameH ? `${s.frameW}×${s.frameH}` : null,
    s.releaseDistM != null ? `릴리스까지 ${s.releaseDistM}m` : null,
    s.autoMode ? '자동 감지' : '수동',
    s.calPairs > 0
      ? `저장 때 보정 ×${s.calScale} ${signed(s.calOffset, 2)} (짝 ${s.calPairs})`
      : '보정 없이 저장',
    s.lensCal ? `렌즈 ${s.lensCal}` : null,
  ].filter((v): v is string => !!v);

  return (
    <Card className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold tabular-nums text-ink">
              {hhmm(s.createdAt)}
            </span>
            <span className="text-sm font-semibold text-ink">{s.nickname}</span>
            <span className="text-xs text-muted">{sessionSetupText(s)}</span>
            {s.forCalibration && (
              <Badge className="border-sky-soft/60 text-sky">보정용</Badge>
            )}
            <span className="text-xs text-muted">{s.pitches.length}구</span>
          </div>
          <p className="break-keep text-xs leading-relaxed text-muted">
            {meta.join(' · ')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <label className="inline-flex items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={s.forCalibration}
              disabled={pending}
              onChange={(e) =>
                onRun(() =>
                  adminUpdateSession(s.id, { forCalibration: e.target.checked })
                )
              }
              className="h-4 w-4 accent-sky"
            />
            보정용
          </label>
          <Button
            type="button"
            variant="danger"
            disabled={pending}
            className="px-3 py-2 text-xs"
            onClick={() => {
              if (
                window.confirm(
                  `${s.nickname} 의 ${hhmm(s.createdAt)} 세션(${s.pitches.length}구)을 지울까요? 같이 만든 투구 기록과 클립도 지워져요.`
                )
              ) {
                onRun(() => adminDeleteVelocitySession(s.id));
              }
            }}
          >
            <Trash2 aria-hidden className="h-3.5 w-3.5" />
            세션 지우기
          </Button>
        </div>
      </div>

      {/* 메모 — blur 로 저장 */}
      <input
        value={memo}
        placeholder="세션 메모 — 장소 · 조명 · 삼각대 같은 촬영 조건"
        disabled={pending}
        onChange={(e) => setMemo(e.target.value)}
        onBlur={() => {
          if ((memo.trim() || null) !== (s.memo ?? null)) {
            onRun(() => adminUpdateSession(s.id, { memo }));
          }
        }}
        className="w-full rounded-xl border border-line bg-surface-2 px-4 py-2.5 text-sm text-ink placeholder:text-muted/60 focus:border-sky focus:outline-none"
      />

      <ul className="space-y-2">
        {s.pitches.map((p) => (
          <PitchRow
            key={`${p.id}:${p.gunKmh ?? ''}`}
            pitch={p}
            pending={pending}
            onRun={onRun}
            onOpenClip={onOpenClip}
          />
        ))}
      </ul>
    </Card>
  );
}

/* ───────────────────────── 공 한 줄 ───────────────────────── */

function PitchRow({
  pitch: p,
  pending,
  onRun,
  onOpenClip,
}: {
  pitch: AdminPitchRow;
  pending: boolean;
  onRun: Run;
  onOpenClip: (pitch: AdminPitchRow) => void;
}) {
  /* 서버 값이 바뀌면 부모가 key 를 바꿔 이 칸을 새로 만든다(SessionCard 의 key) */
  const [gun, setGun] = useState(p.gunKmh == null ? '' : String(p.gunKmh));

  const best = p.releaseKmh ?? p.kmh;
  const diff = p.gunKmh == null ? null : Math.round((best - p.gunKmh) * 10) / 10;
  const confidence =
    CONFIDENCE_TEXT[p.confidence as ConfidenceKey] ?? CONFIDENCE_TEXT.medium;

  function commitGun() {
    const trimmed = gun.trim();
    const next = trimmed === '' ? null : Number(trimmed);
    if (next != null && !Number.isFinite(next)) return;
    if (next === p.gunKmh) return;
    onRun(() => adminUpdateVelocityPitch(p.id, { gunKmh: next }));
  }

  return (
    <li
      className={`grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 rounded-2xl border border-line px-4 py-3 transition-opacity sm:grid-cols-[2rem_1fr_auto_auto_auto] ${
        p.calibExclude ? 'opacity-50' : ''
      }`}
    >
      {/* 차례 · 시각 */}
      <span className="text-xs tabular-nums text-muted">
        <span className="block text-sm font-bold text-ink">{p.seq}</span>
        {hhmm(p.createdAt)}
      </span>

      {/* 카메라 값들 */}
      <span className="min-w-0">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-xs text-muted">카메라</span>
          <span className="text-sm tabular-nums text-muted">{p.rawKmh}</span>
          <span className="text-xs text-muted">→</span>
          <span className="text-sm font-semibold tabular-nums text-ink">{p.kmh}</span>
          <span className="ml-1 text-xs text-muted">릴리스</span>
          <span className="text-display text-lg tabular-nums text-ink">
            {p.releaseKmh ?? '—'}
          </span>
          <span className="text-xs text-muted">km/h · ±{p.errorKmh}</span>
        </span>
        <span className="block truncate text-xs text-muted">
          {confidence}
          {p.pitchType && ` · ${pitchTypeLabel(p.pitchType)}`}
          {p.zone != null && ` · ${zoneLabel(p.zone)}`}
          {p.result === 'strike' && ' · S'}
          {p.result === 'ball' && ' · B'}
          {!p.autoDetected && ' · 수동'}
          {p.frames != null && ` · ${p.frames}장`}
          {p.fps != null && ` · ${Math.round(p.fps)}fps`}
          {p.memo && ` · ${p.memo}`}
        </span>
      </span>

      {/* 스피드건 · 차이 */}
      <span className="col-span-2 flex items-center gap-2 sm:col-span-1">
        <label className="flex items-center gap-1.5 text-xs text-muted">
          건
          <input
            inputMode="decimal"
            value={gun}
            disabled={pending}
            placeholder="—"
            onChange={(e) => setGun(e.target.value)}
            onBlur={commitGun}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className="w-20 rounded-lg border border-line bg-surface-2 px-2.5 py-1.5 text-sm tabular-nums text-ink focus:border-sky focus:outline-none"
          />
          km/h
        </label>
        <span
          className={`w-12 text-right text-sm font-semibold tabular-nums ${errorTone(diff)}`}
        >
          {signed(diff)}
        </span>
      </span>

      {/* 제외 · 클립 · 지우기 */}
      <span className="col-span-2 flex items-center gap-2 sm:col-span-1">
        <label className="inline-flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={p.calibExclude}
            disabled={pending}
            onChange={(e) =>
              onRun(() =>
                adminUpdateVelocityPitch(p.id, { calibExclude: e.target.checked })
              )
            }
            className="h-4 w-4 accent-sky"
          />
          제외
        </label>
        {p.clipPath && (
          <button
            type="button"
            onClick={() => onOpenClip(p)}
            className="inline-flex items-center gap-1 rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-sky hover:text-sky"
          >
            <Film aria-hidden className="h-3.5 w-3.5" />
            클립
          </button>
        )}
      </span>
      <span className="col-span-2 flex justify-end sm:col-span-1">
        <button
          type="button"
          disabled={pending}
          aria-label="공 지우기"
          onClick={() => {
            if (window.confirm(`${p.seq}번 공을 지울까요? 클립도 같이 지워져요.`)) {
              onRun(() => adminDeleteVelocityPitch(p.id));
            }
          }}
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger-bg hover:text-danger"
        >
          <Trash2 aria-hidden className="h-4 w-4" />
        </button>
      </span>
    </li>
  );
}

/* ───────────────────────── 클립 창 ───────────────────────── */

type Remeasure =
  | { kind: 'idle' }
  | { kind: 'running'; ratio: number }
  | { kind: 'done'; result: AnalyzeResult }
  | { kind: 'failed'; message: string };

function ClipDialog({
  session: s,
  pitch: p,
  pending,
  onClose,
  onDeleteClip,
}: {
  session: AdminSessionRow;
  pitch: AdminPitchRow;
  pending: boolean;
  onClose: () => void;
  onDeleteClip: () => void;
}) {
  const [re, setRe] = useState<Remeasure>({ kind: 'idle' });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const approach = approachOf({
    mode: s.mode === 'hit' ? 'hit' : 'pitch',
    cameraPos: s.cameraPos === 'behind-catcher' ? 'behind-catcher' : 'behind-pitcher',
  });

  async function remeasure() {
    if (!p.clipUrl) return;
    setRe({ kind: 'running', ratio: 0 });
    try {
      const res = await fetch(p.clipUrl);
      if (!res.ok) throw new Error('클립을 내려받지 못했습니다.');
      const blob = await res.blob();
      const name = p.clipPath?.split('/').pop() ?? 'clip.mp4';
      const file = new File([blob], name, {
        type: p.clipMime ?? blob.type ?? 'video/mp4',
      });
      const result = await analyzeVideo({
        file,
        fovDeg: s.fovDeg,
        approach,
        focalPerLongSide:
          s.focalPx && s.frameW && s.frameH
            ? s.focalPx / Math.max(s.frameW, s.frameH)
            : null,
        releaseDistanceM: s.releaseDistM,
        onProgress: (ratio) => setRe({ kind: 'running', ratio }),
      });
      setRe({ kind: 'done', result });
    } catch (e) {
      setRe({
        kind: 'failed',
        message: e instanceof Error ? e.message : '다시 재지 못했습니다.',
      });
    }
  }

  const a = p.analysis;
  const details: [string, string][] = [
    [
      '프레임',
      a?.frameCount != null
        ? `${a.frameCount}장`
        : p.frames != null
          ? `${p.frames}장`
          : '—',
    ],
    [
      'fps',
      a?.fps != null
        ? `${Math.round(a.fps)}`
        : p.fps != null
          ? `${Math.round(p.fps)}`
          : '—',
    ],
    ['맞음새', a?.fitQuality != null ? `${a.fitQuality}` : '—'],
    ['첫 속도', a?.startKmh != null ? `${a.startKmh} km/h` : '—'],
    ['끝 속도', a?.endKmh != null ? `${a.endKmh} km/h` : '—'],
    [
      '날아간 구간',
      p.travelM != null ? `${p.travelM}m · ${p.durationSec ?? '—'}초` : '—',
    ],
    [
      '릴리스 포인트',
      p.releaseDxCm != null && p.releaseDyCm != null
        ? `${signed(p.releaseDxCm)} · ${signed(p.releaseDyCm)} cm${
            p.releaseDistM != null ? ` @ ${p.releaseDistM}m` : ''
          }`
        : p.releaseDistM != null
          ? `@ ${p.releaseDistM}m`
          : '—',
    ],
    ['흔들림', a?.shakePx != null ? `${a.shakePx}px` : '—'],
    ['초점거리', a?.focalPx != null ? `${Math.round(a.focalPx)}px` : '—'],
    [
      '클립',
      [
        p.clipSec != null ? `${p.clipSec}초` : null,
        p.clipBytes != null ? mb(p.clipBytes) : null,
        p.clipEventSec != null ? `던짐 ${p.clipEventSec}초` : null,
        p.clipMime,
      ]
        .filter(Boolean)
        .join(' · ') || '—',
    ],
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${p.seq}번 공 클립`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/60 p-0 motion-safe:animate-fade-in sm:items-center sm:p-6"
      onClick={onClose}
    >
      <div
        className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-t-3xl border border-line bg-surface p-5 shadow-2xl sm:rounded-3xl sm:p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted">
              {s.nickname} · {hhmm(p.createdAt)} · {sessionSetupText(s)}
            </p>
            <h3 className="text-lg font-bold text-ink">
              {p.seq}번 공 · 릴리스 {p.releaseKmh ?? '—'} km/h
              {p.gunKmh != null && (
                <span className="ml-2 text-sm font-semibold text-muted">
                  건 {p.gunKmh} ·{' '}
                  <span className={errorTone((p.releaseKmh ?? p.kmh) - p.gunKmh)}>
                    {signed(Math.round(((p.releaseKmh ?? p.kmh) - p.gunKmh) * 10) / 10)}
                  </span>
                </span>
              )}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-line-strong text-muted transition-colors hover:border-sky hover:text-sky"
          >
            <X aria-hidden className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4 grid gap-block lg:grid-cols-5">
          <div className="lg:col-span-3">
            {p.clipUrl ? (
              <video
                controls
                playsInline
                preload="metadata"
                src={p.clipUrl}
                onLoadedMetadata={(e) => {
                  /* 공이 던져진 시각 조금 앞에서 시작 */
                  const v = e.currentTarget;
                  if (p.clipEventSec != null)
                    v.currentTime = Math.max(0, p.clipEventSec - 0.4);
                }}
                className="aspect-video w-full rounded-2xl bg-ink object-contain"
              />
            ) : (
              <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm text-muted">
                재생 주소를 만들지 못했어요. 저장소 설정을 확인해요.
              </p>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="secondary"
                className="px-4 py-2 text-xs"
                disabled={!p.clipUrl || re.kind === 'running'}
                onClick={remeasure}
              >
                {re.kind === 'running'
                  ? `다시 재는 중 ${Math.round(re.ratio * 100)}%`
                  : '이 클립으로 다시 재기(브라우저)'}
              </Button>
              <Button
                type="button"
                variant="danger"
                className="px-4 py-2 text-xs"
                disabled={pending}
                onClick={() => {
                  if (window.confirm('클립만 지울까요? 공과 잰 값은 남아요.'))
                    onDeleteClip();
                }}
              >
                <Trash2 aria-hidden className="h-3.5 w-3.5" />
                클립 지우기
              </Button>
            </div>
            {re.kind === 'running' && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-sky transition-[width] duration-200"
                  style={{ width: `${Math.round(re.ratio * 100)}%` }}
                />
              </div>
            )}
            {re.kind === 'failed' && (
              <p className="mt-2 text-xs text-danger">{re.message}</p>
            )}
            {re.kind === 'done' && (
              <RemeasureResult result={re.result} gunKmh={p.gunKmh} />
            )}
          </div>

          <dl className="divide-y divide-line rounded-2xl border border-line px-4 lg:col-span-2">
            {details.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3 py-2">
                <dt className="text-xs text-muted">{k}</dt>
                <dd className="text-right text-sm tabular-nums text-ink">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </div>
  );
}

/** 다시 잰 결과 — 저장하지 않고 그 자리에만 보여 준다 */
function RemeasureResult({
  result,
  gunKmh,
}: {
  result: AnalyzeResult;
  gunKmh: number | null;
}) {
  const m = result.measure;
  if (!m.ok) {
    return (
      <div className="mt-3 rounded-2xl border border-warn-line bg-warn-bg px-4 py-3">
        <p className="text-sm font-semibold text-warn">거부 — {m.message}</p>
        <p className="mt-1 text-xs leading-relaxed text-warn">{m.fix}</p>
        <p className="mt-1 text-xs text-muted">
          프레임 {result.frameCount} · fps{' '}
          {result.fps == null ? '—' : Math.round(result.fps)} · 흔들림 {result.shakePx}
          px
        </p>
      </div>
    );
  }
  const release = result.release?.releaseKmh ?? null;
  const diff =
    gunKmh == null ? null : Math.round(((release ?? m.kmh) - gunKmh) * 10) / 10;
  return (
    <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
      {[
        { label: '카메라', value: `${m.kmh}`, unit: 'km/h' },
        { label: '릴리스', value: release == null ? '—' : `${release}`, unit: 'km/h' },
        {
          label: '신뢰도',
          value: CONFIDENCE_TEXT[m.confidence].replace('신뢰도 ', ''),
          unit: `±${m.errorKmh}`,
        },
        { label: '건과 차', value: signed(diff), unit: 'km/h', tone: errorTone(diff) },
      ].map((t) => (
        <div key={t.label} className="bg-surface px-3 py-2.5">
          <p className="text-xs text-muted">{t.label}</p>
          <p className={`text-display mt-0.5 text-lg ${t.tone ?? 'text-ink'}`}>
            {t.value}
            <span className="ml-1 font-sans text-xs text-muted">{t.unit}</span>
          </p>
        </div>
      ))}
    </div>
  );
}
