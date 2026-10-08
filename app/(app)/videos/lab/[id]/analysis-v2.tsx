'use client';

import { useState } from 'react';
import { Rotate3d } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui';
import { ErrorLine } from '@/components/error-line';
import {
  isV2JobActive,
  V2_VIDEO_FAULT,
  v2WaitingText,
  type Pitch3dV2Job,
} from '@/lib/pitch-3d/v2/contract';

/**
 * v2 분석의 상태 조각들(화면 결정 4~8) — 결과 화면(lab-detail.tsx)과 목록 카드(lab-client.tsx)가 쓴다.
 * 3D 는 body-3d.tsx, 상태 흐름은 use-v2-analysis.ts.
 */

/** 동의 글(핵심 5, 글자 그대로 — 바꾸면 처리방침 쪽과 맞춰야 한다) */
export const CONSENT_TEXT =
  '선수(미성년이면 보호자)에게 영상을 해외 분석 서버(미국)로 보내는 동의를 받았어요.';

/** 카드 · 머리의 상태 표시 — 없으면 null */
export function v2StatusLabel(
  job: Pitch3dV2Job | null,
  now: number
): { text: string; tone: 'sky' | 'muted' | 'warn' } | null {
  if (!job) return null;
  if (isV2JobActive(job, now)) return { text: '3D 분석 중', tone: 'sky' };
  if (job.status === 'done') return { text: '3D 결과 있음', tone: 'muted' };
  if (job.status === 'failed')
    return {
      text: job.fail?.code === 'timeout' ? '3D 시간 초과' : '3D 실패',
      tone: 'warn',
    };
  /* queued · running 인데 15분 지남 — 다음 물음이 timeout 으로 돌린다 */
  return { text: '3D 시간 초과', tone: 'warn' };
}

export function V2StatusBadge({ job, now }: { job: Pitch3dV2Job | null; now: number }) {
  const s = v2StatusLabel(job, now);
  if (!s) return null;
  return (
    <Badge
      className={
        s.tone === 'sky'
          ? 'bg-sky-tint text-sky desk:border-sky-soft'
          : s.tone === 'warn'
            ? 'bg-warn-bg text-warn desk:border-warn-line'
            : undefined
      }
    >
      {s.text}
    </Badge>
  );
}

/** 3D 칸이 결과 없이 비었을 때 — 분석 전 · 기다림 · 실패(검토 2절의 글을 그대로) */
export function V2EmptyWell({
  job,
  now,
  loading,
  v2Enabled,
  hasVideos,
}: {
  job: Pitch3dV2Job | null;
  now: number;
  loading: boolean;
  v2Enabled: boolean;
  hasVideos: boolean;
}) {
  let title: string;
  let line: string | null = null;
  if (loading) {
    title = '결과를 불러오는 중이에요';
  } else if (job && isV2JobActive(job, now)) {
    title = v2WaitingText(job, now);
    line = '화면을 떠나도 분석은 계속돼요. 돌아오면 이어서 보여요.';
  } else if (job?.status === 'failed' && job.fail) {
    title = job.fail.reason;
    line = V2_VIDEO_FAULT.has(job.fail.code)
      ? '영상 탓이라 같은 영상으로 다시 해도 같아요. 밝은 곳 · 원본 파일 · 삼각대 · 두 폰 60~120° 로 다시 찍어 올려 주세요.'
      : '서버 쪽 문제예요. 아래에서 다시 분석할 수 있어요.';
  } else if (!v2Enabled) {
    title = '서버 분석 설정이 없어요';
    line =
      '관리자가 PITCH3D_GPU_URL · KEY · SECRET 을 넣으면 여기서 3D 분석을 걸 수 있어요.';
  } else if (!hasVideos) {
    title = '옆 · 뒤 영상이 다 있어야 해요';
  } else {
    title = '아직 3D 분석을 하지 않았어요';
    line = '아래 동의를 확인하고 분석을 걸면 1~2분 뒤 여기에 뼈대가 움직여요.';
  }
  return (
    <div
      className="flex aspect-[4/5] max-h-[60vh] w-full flex-col items-center justify-center gap-2 rounded-2xl bg-[#151722] px-6 text-center"
      aria-live="polite"
    >
      <Rotate3d aria-hidden className="h-7 w-7 text-[#8b93a7]" />
      <p className="text-sm font-semibold text-[#e8eef7] break-keep">{title}</p>
      {line && (
        <p className="max-w-sm text-xs leading-relaxed text-[#9aa3b8] break-keep">
          {line}
        </p>
      )}
    </div>
  );
}

/** 분석 걸기 줄 — 동의 확인 + 단추. 돌고 있으면 꺼진다(두 번 누름은 서버 Busy 가 한 번 더 막는다) */
export function V2RequestRow({
  job,
  now,
  busy,
  v2Enabled,
  hasVideos,
  hasResult,
  error,
  onRequest,
}: {
  job: Pitch3dV2Job | null;
  now: number;
  busy: boolean;
  v2Enabled: boolean;
  hasVideos: boolean;
  hasResult: boolean;
  error?: string;
  onRequest: (consent: boolean) => Promise<boolean>;
}) {
  const [consent, setConsent] = useState(false);
  const [needConsent, setNeedConsent] = useState(false);
  if (!v2Enabled || !hasVideos) return null;
  const active = isV2JobActive(job, now);
  const videoFault =
    job?.status === 'failed' && job.fail && V2_VIDEO_FAULT.has(job.fail.code);
  const submit = async () => {
    if (!consent) {
      setNeedConsent(true);
      return;
    }
    setNeedConsent(false);
    await onRequest(true);
  };
  return (
    <div className="space-y-3">
      {active && hasResult && (
        <p className="rounded-xl bg-sky-tint px-3 py-2 text-xs text-sky break-keep">
          다시 분석 중이에요 — 끝날 때까지 이전 결과를 보고 있어요.
        </p>
      )}
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={consent}
          disabled={active || busy}
          onChange={(e) => {
            setConsent(e.target.checked);
            if (e.target.checked) setNeedConsent(false);
          }}
          aria-invalid={needConsent || undefined}
          className={`mt-0.5 h-5 w-5 shrink-0 rounded accent-sky ${needConsent ? 'outline outline-2 outline-danger' : ''}`}
        />
        <span
          className={`text-sm leading-snug break-keep ${needConsent ? 'text-danger' : 'text-ink'}`}
        >
          {CONSENT_TEXT}
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {videoFault ? (
          <Link
            href="/videos/lab"
            className="flex min-h-11 flex-1 items-center justify-center rounded-2xl bg-ink/6 px-4 text-sm font-semibold text-ink"
          >
            다른 영상으로 올리기
          </Link>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={active || busy}
            className="min-h-11 flex-1 rounded-2xl bg-sky px-4 text-sm font-bold text-white disabled:opacity-40"
          >
            {busy
              ? '거는 중'
              : active
                ? '분석 중'
                : hasResult || job
                  ? '다시 분석'
                  : '3D 분석(서버)'}
          </button>
        )}
      </div>
      {error && <ErrorLine>{error}</ErrorLine>}
    </div>
  );
}
