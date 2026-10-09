'use client';

import { useState, type ReactNode } from 'react';
import { ChevronDown, Wrench } from 'lucide-react';
import { LibraryVideo } from '@/components/library-video';
import { referenceThumbUrl } from '@/lib/reference-video';
import type { ShootExerciseInfo } from '@/lib/shoot/load';
import type { PlanItem } from '@/lib/shoot/schedule';

/**
 * 촬영할 운동 한 개의 자세한 것 — 참고 영상 · 시범 방법 · 기구 · 앱 처방 · 진행 방법(설명).
 * 주차 화면의 창과 촬영 모드가 같이 쓴다. 영상은 라이브러리와 같은 재생기 — 참고 영상(유튜브, 우리 영상을 올린 뒤에도
 * lib/shoot/refs.json 에 남은 번호)과 올린 우리 영상을 따로 접어 둔다.
 */
export function ShootExerciseDetail({
  item,
  info,
  videoOpen = true,
  compact = false,
}: {
  item: PlanItem;
  info: ShootExerciseInfo | undefined;
  /** 처음에 영상을 펼쳐 둘까 */
  videoOpen?: boolean;
  /** 촬영 모드 — 시범 방법은 위 카드가 크게 보여서 여기서 뺀다 */
  compact?: boolean;
}) {
  const [showVideo, setShowVideo] = useState(videoOpen);
  const [showHow, setShowHow] = useState(!compact);
  const [showOwn, setShowOwn] = useState(!compact && !info?.youtube);
  const equipment = info?.equipment.length ? info.equipment : item.equipment;
  return (
    <div className="space-y-4">
      {!compact && (
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
          <dt className="text-muted">시범</dt>
          <dd className="font-semibold text-ink">{item.cue}</dd>
          <dt className="text-muted">자리</dt>
          <dd className="text-ink">{item.station}</dd>
          <dt className="text-muted">기구</dt>
          <dd className="text-ink">{equipment.join(' · ') || '맨몸'}</dd>
          {item.group && (
            <>
              <dt className="text-muted">{item.kind === 'warmup' ? '루틴' : '단계'}</dt>
              <dd className="text-ink">{item.group}</dd>
            </>
          )}
          {info?.prescription && (
            <>
              <dt className="text-muted">앱 처방</dt>
              <dd className="text-ink">{info.prescription}</dd>
            </>
          )}
        </dl>
      )}
      {compact && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink">
          <Wrench aria-hidden className="h-4 w-4 text-muted" />
          {equipment.map((e) => (
            <span
              key={e}
              className="rounded-full bg-ink/6 px-2.5 py-1 text-[13px] font-medium"
            >
              {e}
            </span>
          ))}
          {info?.prescription && (
            <span className="text-xs text-muted">앱 처방 {info.prescription}</span>
          )}
        </p>
      )}

      {info?.youtube && (
        <Fold label="참고 영상" open={showVideo} onToggle={() => setShowVideo((v) => !v)}>
          <LibraryVideo
            key={`yt-${info.youtube.id}`}
            path={null}
            referenceVideoId={info.youtube.id}
            title={info.title}
            thumbUrl={referenceThumbUrl(info.youtube.id)}
            aspectRatio={info.youtube.aspectRatio}
            isAdmin
          />
        </Fold>
      )}

      {info?.own && (
        <Fold
          label={info.uploaded ? '올린 우리 영상' : '예전에 찍은 우리 영상'}
          badge="소리 없음"
          open={showOwn}
          onToggle={() => setShowOwn((v) => !v)}
        >
          <LibraryVideo
            key={info.own.path}
            path={info.own.path}
            referenceVideoId={null}
            title={info.title}
            thumbUrl={info.own.thumbUrl}
            aspectRatio={info.own.aspectRatio}
            isAdmin
          />
        </Fold>
      )}

      {info?.description && (
        <section>
          <button
            type="button"
            onClick={() => setShowHow((v) => !v)}
            aria-expanded={showHow}
            className="flex min-h-10 w-full items-center justify-between gap-2 text-left text-sm font-semibold text-ink"
          >
            진행 방법
            <ChevronDown
              aria-hidden
              className={`h-4 w-4 text-muted transition-transform duration-200 ${showHow ? 'rotate-180' : ''}`}
            />
          </button>
          {showHow && (
            <p className="motion-safe:animate-fade-in selectable mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink/85">
              {info.description}
            </p>
          )}
        </section>
      )}
    </div>
  );
}

/** 접히는 칸 — 제목 줄을 누르면 펼친다 */
function Fold({
  label,
  badge,
  open,
  onToggle,
  children,
}: {
  label: string;
  badge?: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-10 w-full items-center justify-between gap-2 text-left text-sm font-semibold text-ink"
      >
        <span className="flex items-center gap-2">
          {label}
          {badge && (
            <span className="rounded-full bg-sky/12 px-2 py-0.5 text-[11px] font-bold text-sky-strong">
              {badge}
            </span>
          )}
        </span>
        <ChevronDown
          aria-hidden
          className={`h-4 w-4 text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <div className="motion-safe:animate-fade-in mt-2">{children}</div>}
    </section>
  );
}
