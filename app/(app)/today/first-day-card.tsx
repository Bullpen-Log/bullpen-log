'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight } from '@/components/icon';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import { OPEN_POPUP_TYPES } from '@/lib/transition-types';
import { quietRefresh } from '@/lib/quiet-refresh';
import { SETUP_PATH } from '@/lib/feature-locks';
import { ArmStatusNote } from '@/components/arm-status-note';
import type { ArmStatus } from '@/lib/report/arm-status';

/**
 * 처음 온 사람의 첫 카드 — 지금 팔 상태(위험 · 주의 · 안전)를 먼저 보여 주고, 할 일은 단추로 바로 한다(2026-10-05 방향 검토 A4).
 *
 * 예전에는 '오른쪽 위 알림(종)을 눌러 오늘 투구부터 남겨 주세요' 글 한 단락이었다. 처음 온 사람은 종이 어디 있는지
 * 모르고, 가입에서 나이를 받았는데도 그걸로 무엇을 알려 주는지 보이지 않았다.
 *
 * 투구 기록이 한 번이라도 생기면(쉬는 날 포함) 홈이 이 카드를 거둔다(core.everLogged).
 * '오늘 안 던졌어요'는 알림(종)의 단추와 같은 길(/api/pitch-log 에 '휴식' 한 줄)로 남긴다.
 *
 * 투구 기록이 잠겨 있으면(첫 설정 전, lib/feature-locks.ts — 2026-10-09 가입에서 투구 질문을 뺐다) 팔 상태와 '오늘 안
 * 던졌어요'는 숨기고 첫 설정으로 가는 단추 하나만 둔다. 던지는 손 · 평소 투구량을 모르는 채 낸 상태는 아직 믿을 것이
 * 못 되고, 기록 창도 설정 화면으로 보내 버리므로 여기서 바로 설정으로 안내한다.
 */
export function FirstDayCard({
  today,
  status,
  pitchLocked,
}: {
  /** 오늘 'YYYY-MM-DD'(한국 시각) */
  today: string;
  /** 지금 팔 상태(lib/report/arm-status.ts armStatusOf) */
  status: ArmStatus;
  /** 투구 기록이 잠겨 있다(첫 설정 전) — 상태 · 휴식 단추 대신 설정으로 가는 단추 하나 */
  pitchLocked: boolean;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();

  const rest = async () => {
    if (saving) return;
    setSaving(true);
    setError(undefined);
    try {
      const res = await fetch('/api/pitch-log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: today,
          sessionType: REST_SESSION_TYPE,
          videoPaths: [],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? '저장하지 못했어요. 다시 눌러 주세요.');
        return;
      }
      quietRefresh(router);
    } catch {
      setError('인터넷 연결을 확인한 뒤 다시 눌러 주세요.');
    } finally {
      setSaving(false);
    }
  };

  /* 단추 모양 — 채운 알약(주된 일)과 바탕색 알약 */
  const primary =
    'inline-flex min-h-11 items-center rounded-full bg-sky px-4 text-sm font-semibold text-white transition-colors hover:bg-sky-strong desk:min-h-9';

  return (
    <div className="space-y-3 rounded-2xl border border-sky-soft/60 bg-sky-tint p-(--block-pad)">
      <p className="text-sm font-bold text-sky-strong">여기부터 시작하세요</p>

      {pitchLocked ? (
        <>
          <p className="text-sm leading-relaxed text-ink/80">
            몇 가지만 알려 주면 투구 기록을 시작할 수 있어요. 던지는 손과 평소
            투구량으로 지금 팔이 위험한지 안전한지 알려 드려요.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href={SETUP_PATH.pitch} className={primary}>
              투구 기록 설정하기
            </Link>
          </div>
        </>
      ) : (
        <>
          <ArmStatusNote status={status} bare />

          <p className="text-sm leading-relaxed text-ink/80">
            던진 양을 남기면 내 기록과 견줘 상태를 알려 드려요.
          </p>

          <div className="flex flex-wrap gap-2">
            <Link
              href={`/pitch-log/${today}`}
              transitionTypes={OPEN_POPUP_TYPES}
              className={primary}
            >
              오늘 투구 남기기
            </Link>
            <button
              type="button"
              onClick={rest}
              disabled={saving}
              className="inline-flex min-h-11 items-center rounded-full bg-surface px-4 text-sm font-medium text-ink transition-colors hover:bg-surface-2 disabled:opacity-50 desk:min-h-9"
            >
              {saving ? '남기는 중…' : '오늘 안 던졌어요'}
            </button>
          </div>
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
        </>
      )}

      <Link
        href="/training"
        className="inline-flex min-h-11 items-center gap-0.5 text-sm font-semibold text-sky-strong desk:min-h-9"
      >
        첫 운동 만들기
        <ChevronRight aria-hidden className="h-4 w-4" />
      </Link>
    </div>
  );
}
