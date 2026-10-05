'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import { OPEN_POPUP_TYPES } from '@/lib/transition-types';
import { quietRefresh } from '@/lib/quiet-refresh';

/**
 * 처음 온 사람의 첫 카드 — 오늘 던져도 되는 양을 먼저 보여 주고, 할 일은 단추로 바로 한다(2026-10-05 방향 검토 A4).
 *
 * 예전에는 '오른쪽 위 알림(종)을 눌러 오늘 투구부터 남겨 주세요' 글 한 단락이었다. 처음 온 사람은 종이 어디 있는지
 * 모르고, 가입에서 나이를 받았는데도 그걸로 무엇을 알려 주는지 보이지 않았다.
 *
 * 투구 기록이 한 번이라도 생기면(쉬는 날 포함) 홈이 이 카드를 거둔다(core.everLogged).
 * '오늘 안 던졌어요'는 알림(종)의 단추와 같은 길(/api/pitch-log 에 '휴식' 한 줄)로 남긴다.
 */
export function FirstDayCard({
  today,
  range,
  intensity,
  note,
}: {
  /** 오늘 'YYYY-MM-DD'(한국 시각) */
  today: string;
  /** 오늘 알맞은 투구 '30~40구'. 쉬는 날 · 계획을 멈춘 날이면 null */
  range: string | null;
  /** '강도 5~7' */
  intensity: string;
  /** 숫자 밑 한 줄 — 어떻게 잡은 숫자인지 */
  note: string | null;
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

  return (
    <div className="space-y-3 rounded-2xl border border-sky-soft/60 bg-sky-tint p-(--block-pad)">
      <p className="text-sm font-bold text-sky-strong">여기부터 시작하세요</p>

      {range && (
        <div>
          <p className="text-xs text-muted">오늘 알맞은 투구</p>
          <p className="mt-0.5 flex items-baseline gap-2">
            <span className="text-numeric text-3xl leading-none text-ink tabular-nums">
              {range}
            </span>
            {intensity && <span className="text-sm text-muted">{intensity}</span>}
          </p>
          {note && <p className="mt-1.5 text-xs leading-relaxed text-muted">{note}</p>}
        </div>
      )}

      <p className="text-sm leading-relaxed text-ink/80">
        던진 양을 남기면 다음부터 내 기록으로 맞춰요.
      </p>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/pitch-log/${today}`}
          transitionTypes={OPEN_POPUP_TYPES}
          className="inline-flex min-h-11 items-center rounded-full bg-sky px-4 text-sm font-semibold text-white transition-colors hover:bg-sky-strong desk:min-h-9"
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
