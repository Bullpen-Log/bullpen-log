'use client';

import { useState } from 'react';
import { Film, RotateCcw, Trash2 } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
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
import { errorStats, pitchError } from '@/lib/velocity-stats';
import { approachOf } from '@/lib/velocity-setup';
import { analyzeVideo, type AnalyzeResult } from '@/lib/velocity-engine/analyze-video';
import { readVideoFps } from '@/lib/velocity-engine/video-fps';
import { errorTone, hhmm, mb, signed } from './format';
import { FolderGlyph } from './explorer-glyphs';

/**
 * 탐색기 오른쪽 창(휴대폰은 창을 띄움)에 들어가는 것 — 공 파일 미리보기 · 세션 정보 · 폴더 통계.
 * 값은 km/h 고정 — 관리자 보정 자료라 사용자 단위 설정을 따르지 않는다.
 */

export type Run = (
  action: () => Promise<AdminActionResult>,
  after?: () => void
) => void;

/** 폴더 하나의 통계 — 연도 · 월 · 날짜 · 세션 모두 같은 모양 */
export type FolderStat = {
  sessions?: number;
  users?: number;
  pitches: number;
  pairs: number;
  clips: number;
  biasKmh: number | null;
  p90Kmh: number | null;
  sdKmh: number | null;
  maxKmh: number | null;
};

export function sessionStat(s: AdminSessionRow): FolderStat {
  const errors = s.pitches.map(pitchError).filter((e): e is number => e != null);
  return {
    pitches: s.pitches.length,
    pairs: errors.length,
    clips: s.pitches.filter((p) => p.clipPath).length,
    maxKmh: s.pitches.length ? Math.max(...s.pitches.map((p) => p.kmh)) : null,
    ...errorStats(errors),
  };
}

/** '12:00 · 금윤호' */
export const sessionName = (s: AdminSessionRow) =>
  `${hhmm(s.createdAt)} · ${s.nickname}`;
/** '03번 공' */
export const pitchName = (p: AdminPitchRow) => `${String(p.seq).padStart(2, '0')}번 공`;

/* ───────────────────────── 폴더 통계 ───────────────────────── */

export function FolderStatPanel({
  title,
  subtitle,
  stat,
}: {
  title: string;
  subtitle?: string;
  stat: FolderStat;
}) {
  const rows: [string, string, string?][] = [
    ...(stat.sessions != null
      ? [['세션', `${stat.sessions}개`] as [string, string]]
      : []),
    ...(stat.users != null && stat.users > 1
      ? [['사람', `${stat.users}명`] as [string, string]]
      : []),
    ['공', `${stat.pitches}구`],
    ['스피드건 짝', `${stat.pairs}개`],
    ['클립', `${stat.clips}개`],
    ['편향(릴리스 − 건)', `${signed(stat.biasKmh)} km/h`, errorTone(stat.biasKmh)],
    ['p90 |오차|', stat.p90Kmh == null ? '—' : `${stat.p90Kmh.toFixed(1)} km/h`],
    ['표준편차', stat.sdKmh == null ? '—' : `${stat.sdKmh.toFixed(1)} km/h`],
    ['최고(보정 후)', stat.maxKmh == null ? '—' : `${stat.maxKmh} km/h`],
  ];
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <FolderGlyph className="h-10 w-12 shrink-0" />
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-ink">{title}</p>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
      </div>
      <DetailList rows={rows} />
      <p className="text-xs leading-relaxed text-muted">
        폴더를 열어 세션 · 공을 보고, 공 파일을 누르면 여기서 영상과 값을 고쳐요.
      </p>
    </div>
  );
}

/* ───────────────────────── 세션 정보 ───────────────────────── */

export function SessionPanel({
  session: s,
  pending,
  onRun,
  onDeleted,
}: {
  session: AdminSessionRow;
  pending: boolean;
  onRun: Run;
  onDeleted: () => void;
}) {
  const [memo, setMemo] = useState(s.memo ?? '');
  const stat = sessionStat(s);
  const rows: [string, string, string?][] = [
    ['설정', sessionSetupText(s)],
    ['출처', s.source === 'file' ? '영상 파일' : '카메라'],
    ...(s.device ? [['기기', s.device] as [string, string]] : []),
    ['화각', `${s.fovDeg}°`],
    ...(s.focalPx != null
      ? [['초점거리', `${Math.round(s.focalPx)}px`] as [string, string]]
      : []),
    ...(s.frameW && s.frameH
      ? [['해상도', `${s.frameW}×${s.frameH}`] as [string, string]]
      : []),
    ...(s.releaseDistM != null
      ? [['릴리스까지', `${s.releaseDistM}m`] as [string, string]]
      : []),
    ['재는 방식', s.autoMode ? '자동 감지' : '수동'],
    [
      '저장 때 보정',
      s.calPairs > 0
        ? `×${s.calScale} ${signed(s.calOffset, 2)} (짝 ${s.calPairs})`
        : '보정 없이',
    ],
    ...(s.lensCal ? [['렌즈 보정', s.lensCal] as [string, string]] : []),
    ['공 · 짝 · 클립', `${stat.pitches}구 · ${stat.pairs}개 · ${stat.clips}개`],
    [
      '편향 · p90',
      `${signed(stat.biasKmh)} · ${stat.p90Kmh == null ? '—' : stat.p90Kmh.toFixed(1)} km/h`,
      errorTone(stat.biasKmh),
    ],
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <FolderGlyph
          className="h-10 w-12 shrink-0"
          badge={s.forCalibration ? 'calib' : null}
        />
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-ink">{sessionName(s)}</p>
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
            {s.date}
            {s.forCalibration && (
              <Badge className="border-sky-soft/60 text-sky">보정용</Badge>
            )}
          </p>
        </div>
      </div>

      <DetailList rows={rows} />

      <label className="block">
        <span className="text-xs text-muted">세션 메모</span>
        <input
          value={memo}
          placeholder="장소 · 조명 · 삼각대 같은 촬영 조건"
          disabled={pending}
          onChange={(e) => setMemo(e.target.value)}
          onBlur={() => {
            if ((memo.trim() || null) !== (s.memo ?? null)) {
              onRun(() => adminUpdateSession(s.id, { memo }));
            }
          }}
          className="mt-1 h-10 w-full rounded-xl border border-line bg-surface-2 px-3 text-sm text-ink placeholder:text-muted/60 focus:border-sky focus:outline-none"
        />
      </label>

      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-line px-3 text-xs text-ink hover:bg-surface-2">
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
          보정용 세션
        </label>
        <Button
          type="button"
          variant="danger"
          disabled={pending}
          className="h-9 px-3 py-0 text-xs"
          onClick={() => {
            if (
              window.confirm(
                `${sessionName(s)} 세션(${s.pitches.length}구)을 지울까요? 같이 만든 투구 기록과 클립도 지워져요.`
              )
            ) {
              onRun(() => adminDeleteVelocitySession(s.id), onDeleted);
            }
          }}
        >
          <Trash2 aria-hidden className="h-3.5 w-3.5" />
          세션 지우기
        </Button>
      </div>
    </div>
  );
}

/* ───────────────────────── 공 파일 미리보기 ───────────────────────── */

type Remeasure =
  | { kind: 'idle' }
  | { kind: 'running'; ratio: number }
  | { kind: 'done'; result: AnalyzeResult }
  | { kind: 'failed'; message: string };

/**
 * 공 하나 — 영상(있으면) · 값 · 스피드건 입력 · 제외 · 다시 재기 · 지우기.
 * 부모가 key 를 `${공 id}:${건 값}` 으로 주어 서버 값이 바뀌면 입력칸을 새로 만든다.
 */
export function PitchPreview({
  session: s,
  pitch: p,
  pending,
  onRun,
  onDeleted,
}: {
  session: AdminSessionRow;
  pitch: AdminPitchRow;
  pending: boolean;
  onRun: Run;
  onDeleted: () => void;
}) {
  const [gun, setGun] = useState(p.gunKmh == null ? '' : String(p.gunKmh));
  const [re, setRe] = useState<Remeasure>({ kind: 'idle' });

  const best = p.releaseKmh ?? p.kmh;
  const diff = p.gunKmh == null ? null : Math.round((best - p.gunKmh) * 10) / 10;
  const confidence =
    CONFIDENCE_TEXT[p.confidence as ConfidenceKey] ?? CONFIDENCE_TEXT.medium;
  const approach = approachOf({
    mode: s.mode === 'hit' ? 'hit' : 'pitch',
    cameraPos: s.cameraPos === 'behind-catcher' ? 'behind-catcher' : 'behind-pitcher',
  });

  function commitGun() {
    const trimmed = gun.trim();
    const next = trimmed === '' ? null : Number(trimmed);
    if (next != null && !Number.isFinite(next)) return;
    if (next === p.gunKmh) return;
    onRun(() => adminUpdateVelocityPitch(p.id, { gunKmh: next }));
  }

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
        /* 올린 영상 파일(mp4 · mov)이면 그 fps 로 장면마다 꺼낸다. 앱이 찍은 클립(webm)은 몰라서 예전처럼 */
        fps: await readVideoFps(file),
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
    [
      '첫 · 끝 속도',
      a?.startKmh != null ? `${a.startKmh} → ${a.endKmh ?? '—'} km/h` : '—',
    ],
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
      ]
        .filter(Boolean)
        .join(' · ') || '—',
    ],
    ['잰 시각', `${hhmm(p.createdAt)}${p.autoDetected ? ' · 자동 감지' : ' · 수동'}`],
  ];

  return (
    <div className="space-y-4">
      {/* 영상 — 세로 영상은 세로로(칸을 16:9 로 못박지 않는다) */}
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
          className="mx-auto block h-auto max-h-[45dvh] w-full rounded-xl bg-shade object-contain"
        />
      ) : (
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-line px-4 py-6 text-xs leading-relaxed text-muted">
          <Film aria-hidden className="h-4 w-4 shrink-0" />
          {p.clipPath
            ? '재생 주소를 만들지 못했어요. 저장소 설정을 확인해요.'
            : '영상이 없어요 — 정확도 보정용 저장을 켜고 잰 공만 영상이 남아요.'}
        </p>
      )}

      {/* 값 */}
      <div>
        <p className="flex items-baseline gap-2">
          <span className="text-xs text-muted">릴리스</span>
          <span className="text-display text-3xl tabular-nums text-ink">
            {p.releaseKmh ?? '—'}
          </span>
          <span className="text-xs text-muted">km/h</span>
          {diff != null && (
            <span
              className={`ml-auto text-sm font-semibold tabular-nums ${errorTone(diff)}`}
            >
              건과 {signed(diff)}
            </span>
          )}
        </p>
        <p className="mt-1 text-xs tabular-nums text-muted">
          카메라 {p.rawKmh} → {p.kmh} km/h · ±{p.errorKmh} · {confidence}
        </p>
        <p className="mt-0.5 break-keep text-xs text-muted">
          {[
            pitchTypeLabel(p.pitchType),
            zoneLabel(p.zone),
            p.result === 'strike' ? '스트라이크' : p.result === 'ball' ? '볼' : null,
            p.memo,
          ]
            .filter(Boolean)
            .join(' · ') || '구종 · 코스 없음'}
        </p>
      </div>

      {/* 스피드건 · 제외 */}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 text-xs text-muted">
          스피드건
          <input
            inputMode="decimal"
            value={gun}
            disabled={pending}
            placeholder="—"
            aria-label={`${pitchName(p)} 스피드건 값(km/h)`}
            onChange={(e) => setGun(e.target.value)}
            onBlur={commitGun}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className="h-9 w-20 rounded-lg border border-line bg-surface-2 px-2.5 text-sm tabular-nums text-ink focus:border-sky focus:outline-none"
          />
          km/h
        </label>
        <label className="ml-auto inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-line px-3 text-xs text-ink hover:bg-surface-2">
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
          보정에서 빼기
        </label>
      </div>

      {/* 할 일 */}
      <div className="flex flex-wrap gap-2">
        {p.clipUrl && (
          <Button
            type="button"
            variant="secondary"
            className="h-9 px-3 py-0 text-xs"
            disabled={re.kind === 'running'}
            onClick={remeasure}
          >
            <RotateCcw aria-hidden className="h-3.5 w-3.5" />
            {re.kind === 'running'
              ? `다시 재는 중 ${Math.round(re.ratio * 100)}%`
              : '이 영상으로 다시 재기'}
          </Button>
        )}
        {p.clipPath && (
          <Button
            type="button"
            variant="ghost"
            className="h-9 px-3 py-0 text-xs"
            disabled={pending}
            onClick={() => {
              if (window.confirm('영상만 지울까요? 공과 잰 값은 남아요.')) {
                onRun(() => adminDeleteClip(p.id));
              }
            }}
          >
            <Film aria-hidden className="h-3.5 w-3.5" />
            영상 지우기
          </Button>
        )}
        <Button
          type="button"
          variant="danger"
          className="h-9 px-3 py-0 text-xs"
          disabled={pending}
          onClick={() => {
            if (window.confirm(`${pitchName(p)}을 지울까요? 영상도 같이 지워져요.`)) {
              onRun(() => adminDeleteVelocityPitch(p.id), onDeleted);
            }
          }}
        >
          <Trash2 aria-hidden className="h-3.5 w-3.5" />공 지우기
        </Button>
      </div>

      {re.kind === 'running' && (
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-sky transition-[width] duration-200"
            style={{ width: `${Math.round(re.ratio * 100)}%` }}
          />
        </div>
      )}
      {re.kind === 'failed' && <p className="text-xs text-danger">{re.message}</p>}
      {re.kind === 'done' && <RemeasureResult result={re.result} gunKmh={p.gunKmh} />}

      <DetailList rows={details} />
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
      <div className="rounded-xl border border-warn-line bg-warn-bg px-3 py-2.5">
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
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line">
      {[
        { label: '다시 잰 카메라', value: `${m.kmh}`, unit: 'km/h' },
        {
          label: '다시 잰 릴리스',
          value: release == null ? '—' : `${release}`,
          unit: 'km/h',
        },
        {
          label: '신뢰도',
          value: CONFIDENCE_TEXT[m.confidence].replace('신뢰도 ', ''),
          unit: `±${m.errorKmh}`,
        },
        { label: '건과 차', value: signed(diff), unit: 'km/h', tone: errorTone(diff) },
      ].map((t) => (
        <div key={t.label} className="bg-surface px-3 py-2">
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

/** 이름 · 값 줄 목록 — 탐색기의 '속성' 창처럼 */
function DetailList({ rows }: { rows: [string, string, string?][] }) {
  return (
    <dl className="divide-y divide-line rounded-xl border border-line px-3">
      {rows.map(([k, v, tone]) => (
        <div key={k} className="flex items-baseline justify-between gap-3 py-1.5">
          <dt className="shrink-0 text-xs text-muted">{k}</dt>
          <dd
            className={`min-w-0 break-keep text-right text-xs tabular-nums ${tone ?? 'text-ink'}`}
          >
            {v}
          </dd>
        </div>
      ))}
    </dl>
  );
}
