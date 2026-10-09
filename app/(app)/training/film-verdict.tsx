'use client';

import { useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { ErrorLine } from '@/components/error-line';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { FILM_VERDICTS, type FilmNote, type FilmVerdict } from '@/lib/mechanics/program';
import { recordMechanicsFilm } from '@/app/actions/mechanics';

/**
 * 찍어서 견준 뒤의 한 답 — '처음보다 좋아졌어요 · 비슷해요 · 아직 못 견줬어요'(2026-10-09 트레이닝 검토 2-⑥).
 *
 * 여섯 번째 세션마다 찍어 견주라고만 하고 결과를 안 받아, 드릴을 12번 해도 무엇이 나아졌는지 앱에 남는 것이 없었다.
 * 답은 MechanicsProgram.progress 의 films 에 세션 번호와 함께 남고, 프로그램 칸이 '견준 기록'으로 보인다.
 * 세션 끝 화면과 프로그램 칸이 같이 쓴다.
 */
export function FilmVerdictButtons({
  session,
  current,
  onSaved,
}: {
  /** 방금 마친(또는 지금 견줄) 세션 번호 */
  session: number;
  /** 이미 남긴 답 — 바꿀 수 있다 */
  current: FilmNote | null;
  onSaved?: (note: FilmNote) => void;
}) {
  const [saved, setSaved] = useState<FilmVerdict | null>(current?.verdict ?? null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const pick = (verdict: FilmVerdict) =>
    startTransition(async () => {
      setError(null);
      const res = await orOffline(recordMechanicsFilm(verdict), { error: OFFLINE_MESSAGE });
      if ('error' in res) {
        setError(res.error);
        return;
      }
      setSaved(verdict);
      onSaved?.(res.note);
    });

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted">처음 영상과 견줘 보니 어땠나요?</p>
      <div role="group" aria-label="처음 영상과 견준 결과" className="grid grid-cols-3 gap-1.5">
        {FILM_VERDICTS.map((v) => {
          const on = saved === v.value;
          return (
            <button
              key={v.value}
              type="button"
              disabled={pending}
              aria-pressed={on}
              onClick={() => pick(v.value)}
              className={`flex min-h-12 items-center justify-center gap-1 rounded-xl px-2 text-sm font-semibold break-keep transition-colors disabled:opacity-60 ${
                on ? 'bg-sky text-white' : 'bg-ink/6 text-ink active:bg-ink/10'
              }`}
            >
              {on && <Check aria-hidden className="h-4 w-4" strokeWidth={3} />}
              {v.label}
            </button>
          );
        })}
      </div>
      {saved && (
        <p className="text-[11px] text-muted">
          세션 {session}번 결과로 남겼어요. 다시 누르면 바꿔요.
        </p>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
    </div>
  );
}
