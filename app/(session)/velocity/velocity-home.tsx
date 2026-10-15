'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Camera, ChevronLeft } from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-delete';
import { uploadClip } from '@/lib/velocity-clip-upload';
import { clearDraft, loadDraft, retryUploads } from '@/lib/velocity-draft';
import type { CalFit } from '@/lib/velocity-calibration';
import { useSpeedUnit } from '@/components/use-units';
import { Panel, SectionLabel } from '@/components/velocity/kit';
import { SessionHistory } from '@/components/velocity/session-history';
import { SetupSummaryRow } from '@/components/velocity/setup-art';
import {
  useStoredSetup,
  VelocitySettingsButton,
} from '@/components/velocity/velocity-settings';
import type { VelocityHistoryItem } from '@/components/velocity/session-types';

/**
 * 구속 측정 메인 화면 — 그리기만 한다(읽기 · 권한은 page.tsx).
 *
 *   위 줄   ‹ 투구 기록 · 제목 · 설정(톱니 → 시트: 단위 · 소리 · 자동 측정 · 보정 …)
 *   본문    큰 제목 · 저장하지 않은 공 · 마지막 세션 한 장(숫자 · 그래프) · 최근 세션 · 지난 설정
 *   아래    측정 시작 → /velocity/measure (설정 단계부터)
 *
 * 폰 틀은 측정 화면(velocity-screen.tsx)과 같다 — PC 에서는 390px 폭 폰 모양, 폰에서는 꽉 채운다.
 * ui-chrome 은 PC 의 작아진 크기 기준을 쓰지 않고 폰 크기 그대로.
 */
export function VelocityHome({
  history,
  calibration,
  today,
}: {
  history: VelocityHistoryItem[];
  calibration: CalFit;
  today: string;
}) {
  const unit = useSpeedUnit();
  const stored = useStoredSetup();
  /* 폰에 맡겨 둔(저장하지 않은) 세션 — 앱이 꺼졌거나 저장 전에 나갔다(lib/velocity-draft.ts) */
  const [draft, setDraft] = useState<{ n: number; date: string } | null>(null);
  const [askClear, setAskClear] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadDraft<unknown, unknown>().then((d) => {
      if (alive && d?.pitches?.length) setDraft({ n: d.pitches.length, date: d.date });
    });
    /* 저장한 뒤 올리지 못한 영상을 다시 올린다 */
    void retryUploads((u) =>
      uploadClip(
        u.pitchId,
        u.blob,
        { sec: u.sec, eventSec: u.eventSec },
        undefined,
        u.kind,
        u.phone
      ).then((r) => r.ok)
    );
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="ui-chrome relative flex min-h-0 flex-1 flex-col overflow-hidden bg-page text-ink desk:mx-auto desk:my-4 desk:h-[calc(100dvh-2rem)] desk:max-h-[52.75rem] desk:w-[24.375rem] desk:flex-none desk:overflow-hidden desk:rounded-[2.5rem] desk:border-[6px] desk:border-ink/85 desk:shadow-2xl">
      {/* 위 줄 — 체크인 흐름의 머리처럼 흰 막대 없이 맨바탕 위에 '‹ 돌아가기'와 설정 톱니(48px) */}
      <header className="flex shrink-0 items-center justify-between px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Link
          href="/videos"
          className="inline-flex min-h-12 items-center gap-0.5 rounded-full px-2 text-base font-medium text-muted transition-colors hover:text-ink"
        >
          <ChevronLeft aria-hidden className="h-5 w-5" />
          투구 기록
        </Link>
        <VelocitySettingsButton
          calibration={calibration}
          label="구속 측정 설정"
          className="inline-flex h-12 w-12 items-center justify-center rounded-full text-muted transition-colors hover:bg-ink/6 hover:text-ink [&>svg]:h-6 [&>svg]:w-6"
        />
      </header>

      <div className="stack-block min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-1">
        {/* 쪽 머리 — 다른 탭의 큰 제목과 같은 굵기 · 자간(text-heading), 밑에 한 줄만 */}
        <div className="px-1">
          <h1 className="text-heading text-3xl leading-tight text-ink">구속 측정</h1>
          <p className="mt-1 text-subhead text-muted">폰 카메라로 구속 · 릴리스 · 코스를 남겨요.</p>
        </div>

        {draft && (
          <section className="rounded-2xl bg-sky-tint p-(--block-pad) motion-safe:animate-fade-in">
            <p className="text-base font-bold text-ink">저장하지 않은 공 {draft.n}개</p>
            <p className="mt-1 text-subhead text-muted">
              {draft.date === today ? '오늘' : dateText(draft.date)} 잰 공이에요. 이어서
              저장하거나 더 잴 수 있어요.
            </p>
            <div className="mt-3 flex gap-2">
              <Link
                href="/velocity/measure?resume=1"
                className="inline-flex h-12 flex-1 items-center justify-center rounded-2xl bg-sky text-base font-bold text-white transition-colors hover:bg-sky-strong"
              >
                이어서 하기
              </Link>
              <button
                type="button"
                onClick={() => setAskClear(true)}
                className="inline-flex h-12 items-center justify-center rounded-2xl px-5 text-base font-semibold text-danger transition-colors hover:bg-danger/10"
              >
                지우기
              </button>
            </div>
          </section>
        )}

        <SessionHistory items={history} unit={unit} today={today} />

        {/* 지난 설정 — 시작하면 그대로 쓸지 묻는다. 처음이면 설정부터 묻는다는 한 줄 */}
        <section>
          <SectionLabel>측정 설정</SectionLabel>
          <Panel className="p-(--block-pad)">
            {stored ? (
              <>
                <SetupSummaryRow
                  sessionType={stored.sessionType}
                  cameraPos={stored.cameraPos}
                  net={stored.net}
                />
                <p className="mt-3 text-center text-footnote text-muted">
                  시작하면 이 설정을 그대로 쓸지 물어요.
                </p>
              </>
            ) : (
              <p className="text-subhead text-muted">
                처음이면 어떤 투구를 어디서 잴지부터 물어요.
              </p>
            )}
          </Panel>
        </section>
      </div>

      {/* 아래 — 측정 시작. 설정 단계(지난 설정 → 종류 → 무엇을 → 카메라 위치 → 네트)부터. 체크인 흐름의 [시작]과 같은 단추 */}
      <div className="flex shrink-0 items-center gap-2 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        <Link
          href="/velocity/measure"
          className="inline-flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl bg-sky text-lg font-bold text-white transition-colors hover:bg-sky-strong"
        >
          <Camera aria-hidden className="h-5 w-5" />
          측정 시작
        </Link>
      </div>
      <ConfirmDialog
        open={askClear}
        onClose={() => setAskClear(false)}
        onConfirm={() => {
          setAskClear(false);
          setDraft(null);
          void clearDraft();
        }}
        title="저장하지 않은 공을 지울까요?"
        detail={`공 ${draft?.n ?? 0}개와 영상이 폰에서 지워져요.`}
        confirmLabel="지우기"
        pending={false}
      />
    </div>
  );
}

/** '2026-10-14' → '10월 14일' */
function dateText(date: string) {
  const [, m, d] = date.split('-').map(Number);
  return m && d ? `${m}월 ${d}일` : date;
}
