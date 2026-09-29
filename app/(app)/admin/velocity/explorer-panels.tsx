'use client';

import { useState } from 'react';
import { ChevronRight, Film, RotateCcw, Trash2 } from 'lucide-react';
import { Badge, Button } from '@/components/ui';
import {
  adminApplyMeasurement,
  adminDeleteCalibRun,
  adminDeleteClip,
  adminDeleteVelocityPitch,
  adminDeleteVelocitySession,
  adminUpdateSession,
  adminUpdateVelocityPitch,
  type AdminActionResult,
} from '@/app/actions/velocity-admin';
import type {
  AdminCalibResultRow,
  AdminCalibRunSummary,
  AdminPitchRow,
  AdminSessionRow,
} from '@/lib/velocity-admin-load';
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
import { analysisOf } from '@/lib/velocity-analysis';
import { readVideoFps } from '@/lib/velocity-engine/video-fps';
import { readVideoLens, videoFovFor } from '@/lib/velocity-engine/video-lens';
import { LENS_VERSION } from '@/lib/velocity-lens';
import {
  reject,
  type RejectCode,
  type Rejection,
} from '@/lib/velocity-engine/validate';
import { calibRunName, errorTone, hhmm, mb, signed } from './format';
import { FolderGlyph } from './explorer-glyphs';

/**
 * 탐색기 오른쪽 창(휴대폰은 창을 띄움)에 들어가는 것 — 공 파일 미리보기 · 세션 정보 · 폴더 통계 ·
 * 보정 차수 · 보정 결과.
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
        날짜 폴더를 열면 그날 공이 스피드건 그룹으로 보여요. 공 파일을 누르면 여기서
        영상과 값을 고치고, 접힌 세션 정보에서 세션을 지워요.
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

/** 세션 설정에서 공이 멀어지나 · 다가오나 */
function approachOfSession(s: AdminSessionRow) {
  return approachOf({
    mode: s.mode === 'hit' ? 'hit' : 'pitch',
    cameraPos: s.cameraPos === 'behind-catcher' ? 'behind-catcher' : 'behind-pitcher',
  });
}

/**
 * 공 하나의 클립을 내려받아 지금 모델로 다시 잰다 — 미리보기의 '이 영상으로 다시 재기'와
 * 그날 전부를 도는 보정 재측정(calib-run-button.tsx)이 같이 쓴다. 클립이 없거나 못 내려받으면 던진다.
 */
export async function remeasurePitch(
  session: AdminSessionRow,
  pitch: AdminPitchRow,
  onProgress?: (ratio: number) => void
): Promise<AnalyzeResult> {
  if (!pitch.clipUrl) throw new Error('이 공에는 영상이 없습니다.');
  const res = await fetch(pitch.clipUrl);
  if (!res.ok) throw new Error('클립을 내려받지 못했습니다.');
  const blob = await res.blob();
  const name = pitch.clipPath?.split('/').pop() ?? 'clip.mp4';
  const file = new File([blob], name, {
    type: pitch.clipMime ?? blob.type ?? 'video/mp4',
  });
  /*
   * 초점거리: 렌즈 보정(공으로 잰 것)이 있는 세션만 그 값을 쓴다. 세션의 focalPx 는 화각 가정으로 만든
   * 값이라 그것을 쓰면 옛 화각이 굳는다. 보정이 없으면 파일의 렌즈 정보로 영상 모드 화각(아이폰 59.8°)을,
   * 그것도 없으면 세션의 화각.
   */
  const lens = await readVideoLens(file);
  return analyzeVideo({
    file,
    /* 올린 영상 파일(mp4 · mov)이면 그 fps 로 장면마다 꺼낸다. 앱이 찍은 클립(webm)은 몰라서 예전처럼 */
    fps: await readVideoFps(file),
    fovDeg: videoFovFor(lens) ?? session.fovDeg,
    approach: approachOfSession(session),
    /*
     * 렌즈 보정은 지금 판(윤곽 자로 잰 것)만 — 옛 판(면적)은 윤곽 지름과 0.91~0.95 배 어긋나 구속이 5~9% 낮게 나온다.
     * 그런 세션은 파일의 렌즈 정보(없으면 세션 화각)로 잰다.
     */
    focalPerLongSide:
      session.lensCal &&
      session.lensCalVersion === LENS_VERSION &&
      session.focalPx &&
      session.frameW &&
      session.frameH
        ? session.focalPx / Math.max(session.frameW, session.frameH)
        : null,
    releaseDistanceM: session.releaseDistM,
    onProgress,
  });
}

/**
 * 공 하나 — 영상(있으면) · 값 · 스피드건 입력 · 제외 · 다시 재기 · 지우기. 맨 밑에 세션 정보를
 * 접어 둔다(세션 폴더가 없어져 여기서 본다).
 * 부모가 key 를 `${공 id}:${건 값}` 으로 주어 서버 값이 바뀌면 입력칸을 새로 만든다.
 */
export function PitchPreview({
  session: s,
  pitch: p,
  pending,
  onRun,
  onDeleted,
  onSessionDeleted,
}: {
  session: AdminSessionRow;
  pitch: AdminPitchRow;
  pending: boolean;
  onRun: Run;
  onDeleted: () => void;
  /** 접힌 세션 정보에서 세션을 지웠을 때 — 없으면 아무것도 안 한다 */
  onSessionDeleted?: () => void;
}) {
  const [gun, setGun] = useState(p.gunKmh == null ? '' : String(p.gunKmh));
  const [re, setRe] = useState<Remeasure>({ kind: 'idle' });

  const best = p.releaseKmh ?? p.kmh;
  const diff = p.gunKmh == null ? null : Math.round((best - p.gunKmh) * 10) / 10;
  const confidence =
    CONFIDENCE_TEXT[p.confidence as ConfidenceKey] ?? CONFIDENCE_TEXT.medium;
  const approach = approachOfSession(s);

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
      const result = await remeasurePitch(s, p, (ratio) =>
        setRe({ kind: 'running', ratio })
      );
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
      {/* 이름 줄 — 어느 세션의 몇 번 공인지, 어느 모델로 쟀는지 */}
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-muted">
        <span className="text-base font-bold text-ink">{pitchName(p)}</span>
        <span>{sessionName(s)}</span>
        <span className="ml-auto tabular-nums">
          모델 v{p.engineVersion ?? s.engineVersion ?? '—'}
        </span>
      </p>

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

      {/* 값 — 수기 공은 카메라 값이 없다(스피드건 값이 곧 구속) */}
      <div>
        {p.manual ? (
          <>
            <p className="flex items-baseline gap-2">
              <span className="text-xs text-muted">스피드건(수기)</span>
              <span className="text-display text-3xl tabular-nums text-ink">
                {p.gunKmh ?? p.kmh}
              </span>
              <span className="text-xs text-muted">km/h</span>
              <Badge className="ml-auto border-warn-line bg-warn-bg text-warn">
                수기 · 카메라 값 없음
              </Badge>
            </p>
            <p className="mt-1 break-keep text-xs leading-relaxed text-muted">
              카메라가 재지 못한 영상을 스피드건 값만 적어 올린 공이에요. 보정 짝에는 안
              들어가요 — 엔진이 좋아지면 아래 &lsquo;이 영상으로 다시 재기&rsquo;로 재서
              값을 채우면 짝이 돼요.
            </p>
          </>
        ) : (
          <>
            <p className="flex items-baseline gap-2">
              <span className="text-xs text-muted">릴리스</span>
              <span className="text-display text-3xl tabular-nums text-ink">
                {p.releaseKmh == null ? '—' : Math.round(p.releaseKmh * 10) / 10}
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
          </>
        )}
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
      {re.kind === 'done' && (
        <RemeasureResult
          result={re.result}
          gunKmh={p.gunKmh}
          manual={p.manual}
          pending={pending}
          onApply={() => {
            const r = re.result;
            const m = r.measure;
            if (!m.ok) return;
            onRun(() =>
              adminApplyMeasurement(p.id, {
                rawKmh: m.kmh,
                errorKmh: m.errorKmh,
                confidence: m.confidence,
                releaseKmh: r.release?.releaseKmh ?? null,
                releaseDxCm: r.release?.dxCm ?? null,
                releaseDyCm: r.release?.dyCm ?? null,
                releaseDistM: r.release?.distanceM ?? m.detail.releaseDistanceM,
                travelM: m.detail.travelM,
                durationSec: m.detail.durationSec,
                frames: m.detail.frames,
                fps: r.fps,
                analysis: analysisOf(r, approach),
              })
            );
            setRe({ kind: 'idle' });
          }}
        />
      )}

      {/* 세션 — 폴더가 없어져 공에서 접어 본다(설정 · 메모 · 보정용 · 지우기) */}
      <details className="group rounded-xl border border-line">
        <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-xs font-semibold text-ink [&::-webkit-details-marker]:hidden">
          <ChevronRight
            aria-hidden
            className="h-3.5 w-3.5 text-muted transition-transform duration-200 motion-safe:group-open:rotate-90"
          />
          세션 정보 · 메모 · 지우기
          <span className="ml-auto font-normal text-muted">{sessionName(s)}</span>
        </summary>
        <div className="border-t border-line px-3 py-3">
          <SessionPanel
            key={s.id}
            session={s}
            pending={pending}
            onRun={onRun}
            onDeleted={onSessionDeleted ?? (() => undefined)}
          />
        </div>
      </details>

      <DetailList rows={details} />
    </div>
  );
}

/** 다시 잰 결과 — 그 자리에 보여 주고, '이 값으로 채우기'를 누르면 공에 저장한다(수기 공은 짝이 된다) */
function RemeasureResult({
  result,
  gunKmh,
  manual,
  pending,
  onApply,
}: {
  result: AnalyzeResult;
  gunKmh: number | null;
  manual: boolean;
  pending: boolean;
  onApply: () => void;
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
      <div className="col-span-2 bg-surface px-3 py-2">
        <Button
          type="button"
          variant={manual ? 'primary' : 'secondary'}
          className="h-9 w-full px-3 py-0 text-xs"
          disabled={pending}
          onClick={onApply}
        >
          {manual ? '이 값으로 채우기 — 수기를 풀고 보정 짝으로' : '이 값으로 바꾸기'}
        </Button>
      </div>
    </div>
  );
}

/* ───────────────────────── 보정 차수(폴더) ───────────────────────── */

/** ISO 시각 → '2026-09-28 14:03'(한국 시간) — 보정일은 날짜까지 같이 보인다 */
function ymdhm(iso: string) {
  const parts = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

/**
 * 보정 차수 하나 — 그날 영상들을 그때 모델로 다시 잰 묶음. 통계는 다시 잰 값 기준(원본은 안 바뀐다).
 */
export function CalibRunPanel({
  run,
  pending,
  onRun,
  onDeleted,
}: {
  run: AdminCalibRunSummary;
  pending: boolean;
  onRun: Run;
  onDeleted: () => void;
}) {
  const rows: [string, string, string?][] = [
    ['보정일', ymdhm(run.createdAt)],
    ['차수', `${run.pass}차`],
    ['모델', `v${run.engineVersion}`],
    ['결과 · 잰 것 · 짝', `${run.results}개 · ${run.ok}개 · ${run.pairs}개`],
    ['편향(다시 잼 − 건)', `${signed(run.biasKmh)} km/h`, errorTone(run.biasKmh)],
    ['p90 |오차|', run.p90Kmh == null ? '—' : `${run.p90Kmh.toFixed(1)} km/h`],
    ['표준편차', run.sdKmh == null ? '—' : `${run.sdKmh.toFixed(1)} km/h`],
    ['돌린 사람', run.nickname],
    ...(run.memo ? [['메모', run.memo] as [string, string]] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <FolderGlyph className="h-10 w-12 shrink-0" badge="calib" />
        <div className="min-w-0">
          <p className="truncate text-base font-bold text-ink">{calibRunName(run)}</p>
          <p className="text-xs text-muted">{run.date} 영상을 다시 잰 것</p>
        </div>
      </div>

      <DetailList rows={rows} />

      <p className="break-keep text-xs leading-relaxed text-muted">
        폴더를 열면 공마다 원본 값 · 다시 잰 값 · 스피드건을 나란히 견줘요. 원본 공은
        그대로고, 결과 파일에서 골라 채울 수 있어요.
      </p>

      <Button
        type="button"
        variant="danger"
        disabled={pending}
        className="h-9 px-3 py-0 text-xs"
        onClick={() => {
          if (
            window.confirm(
              `${calibRunName(run)}(결과 ${run.results}개)를 지울까요? 원본 공과 영상은 남아요.`
            )
          ) {
            onRun(() => adminDeleteCalibRun(run.id), onDeleted);
          }
        }}
      >
        <Trash2 aria-hidden className="h-3.5 w-3.5" />이 차수 지우기
      </Button>
    </div>
  );
}

/* ───────────────────────── 보정 결과(파일) ───────────────────────── */

/** 거부 까닭 한 줄 — validate.ts 의 REJECTIONS 는 안 내보내서 reject() 로 푼다. 모르는 코드는 그대로 */
function rejectText(code: string | null) {
  if (!code) return '거부';
  if (code === 'CLIP_UNAVAILABLE') return '영상을 내려받지 못함';
  const r = reject(code as RejectCode) as Partial<Rejection>;
  return r.message ?? code;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * 보정 차수 안의 공 하나 — 원본 값 · 다시 잰 값 · 스피드건을 세 칸으로 견주고, 다시 잰 값을 원본 공에
 * 채울 수 있다(수기 공이면 수기가 풀려 보정 짝이 된다).
 */
export function CalibResultPanel({
  row,
  run,
  pending,
  onRun,
}: {
  row: AdminCalibResultRow;
  run: AdminCalibRunSummary;
  pending: boolean;
  onRun: Run;
}) {
  const p = row.pitch;
  /* 소수 한 자리로 — 엔진이 그렇게 저장하지만 옛 자료 · 채운 값이 섞여도 화면은 한결같게 */
  const orig = round1(p.releaseKmh ?? p.kmh);
  const again =
    row.ok && (row.releaseKmh ?? row.rawKmh) != null
      ? round1((row.releaseKmh ?? row.rawKmh) as number)
      : null;
  const gun = p.gunKmh;
  const origDiff = gun == null ? null : round1(orig - gun);
  const againDiff = gun == null || again == null ? null : round1(again - gun);
  const canApply = row.ok && row.rawKmh != null;

  const tiles: { label: string; value: string; unit?: string; tone?: string }[] = [
    {
      label: p.manual ? '원본(수기)' : '원본',
      value: `${orig}`,
      unit: 'km/h',
    },
    {
      label: `다시 잼 v${run.engineVersion}`,
      value: again == null ? '거부' : `${again}`,
      unit: again == null ? undefined : 'km/h',
      tone: again == null ? 'text-warn' : undefined,
    },
    {
      label: '스피드건',
      value: gun == null ? '—' : `${gun}`,
      unit: 'km/h',
    },
  ];

  const details: [string, string, string?][] = [
    ['원본 − 건', `${signed(origDiff)} km/h`, errorTone(origDiff)],
    ['다시 잼 − 건', `${signed(againDiff)} km/h`, errorTone(againDiff)],
    ...(row.ok
      ? [
          [
            '다시 잼 카메라',
            row.rawKmh == null
              ? '—'
              : `${row.rawKmh} km/h · ±${row.errorKmh ?? '—'} · ${
                  CONFIDENCE_TEXT[row.confidence as ConfidenceKey] ??
                  CONFIDENCE_TEXT.medium
                }`,
          ] as [string, string],
        ]
      : [
          ['거부 까닭', rejectText(row.reject), 'text-warn'] as [
            string,
            string,
            string,
          ],
        ]),
    [
      '프레임 · fps',
      `${row.frames ?? '—'}장 · ${row.fps == null ? '—' : Math.round(row.fps)}`,
    ],
    ['원본 모델', `v${p.engineVersion ?? row.session.engineVersion ?? '—'}`],
  ];

  return (
    <div className="space-y-4">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs text-muted">
        <span className="text-base font-bold text-ink">{pitchName(p)}</span>
        <span>{sessionName(row.session)}</span>
        <span className="ml-auto">{run.date}</span>
      </p>

      {/* 세 칸 — 원본 · 다시 잼 · 스피드건 */}
      <div className="grid grid-cols-3 gap-px overflow-hidden rounded-xl border border-line bg-line">
        {tiles.map((t) => (
          <div key={t.label} className="bg-surface px-3 py-2">
            <p className="truncate text-xs text-muted">{t.label}</p>
            <p className={`text-display mt-0.5 text-lg ${t.tone ?? 'text-ink'}`}>
              {t.value}
              {t.unit && (
                <span className="ml-1 font-sans text-xs text-muted">{t.unit}</span>
              )}
            </p>
          </div>
        ))}
      </div>

      {p.clipUrl ? (
        <video
          controls
          playsInline
          preload="metadata"
          src={p.clipUrl}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            if (p.clipEventSec != null)
              v.currentTime = Math.max(0, p.clipEventSec - 0.4);
          }}
          className="mx-auto block h-auto max-h-[45dvh] w-full rounded-xl bg-shade object-contain"
        />
      ) : (
        <p className="flex items-center gap-2 rounded-xl border border-dashed border-line px-4 py-6 text-xs leading-relaxed text-muted">
          <Film aria-hidden className="h-4 w-4 shrink-0" />
          원본 공의 영상이 지금은 없어요(지웠거나 재생 주소를 못 만들었어요).
        </p>
      )}

      <DetailList rows={details} />

      {canApply && (
        <Button
          type="button"
          variant={p.manual ? 'primary' : 'secondary'}
          className="h-9 w-full px-3 py-0 text-xs"
          disabled={pending}
          onClick={() =>
            onRun(() =>
              adminApplyMeasurement(row.pitchId, {
                rawKmh: row.rawKmh as number,
                errorKmh: row.errorKmh ?? 0,
                confidence: row.confidence ?? 'medium',
                releaseKmh: row.releaseKmh,
                releaseDxCm: null,
                releaseDyCm: null,
                releaseDistM: null,
                travelM: null,
                durationSec: null,
                frames: row.frames,
                fps: row.fps,
              })
            )
          }
        >
          {p.manual
            ? '이 값을 원본 공에 채우기 — 수기를 풀고 보정 짝으로'
            : '이 값을 원본 공에 채우기'}
        </Button>
      )}
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
