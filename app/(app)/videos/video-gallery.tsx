'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Film, X } from 'lucide-react';
import { usePlaybackUrls } from '@/components/use-playback-urls';
import { REST_SESSION_TYPE, SESSION_TYPES } from '@/lib/session-type';
import type { ClipOption } from './compare-view';
import type { VideoLog } from './videos-client';

/**
 * 투구 영상을 달별로 모아 보는 곳.
 *
 * 투구 일지의 달력은 '그 날짜'를 알 때, 목록은 기록 전체를 훑을 때 쓴다.
 * 그런데 폼을 견주려 할 때는 '영상이 있는 날'만 보고 싶다 — 달력에서는 작은
 * 점을, 목록에서는 필름 표시를 눈으로 뒤져야 했다.
 *
 * ■ 썸네일을 따로 만들지 않는다
 *
 * 영상의 한 프레임을 그대로 쓴다(#t=). 브라우저가 머리 부분만 받아 그 자리를
 * 그려 주므로, 저장할 것도 없고 이미 올려 둔 영상에도 바로 적용된다. 썸네일을
 * 따로 만들면 앞으로 올리는 것만 되고 지난 것은 하나씩 소급해야 한다.
 *
 * 펼친 달의 영상만 주소를 받아 온다. 몇 해 쓰면 영상이 삼백 개가 넘는데 열
 * 때마다 전부 발급하면 그만큼 기다린다.
 *
 * ■ 카드를 누르면 그날 기록으로 간다
 *
 * 그 자리에서 틀어도 봤지만, 영상만 덩그러니 나오지 그날 몇 구를 어떤 강도로
 * 던졌는지는 안 보인다. 영상을 볼 때 알고 싶은 건 대개 그 둘을 같이 놓은
 * 것이고, 그날 기록에는 자세 분석까지 붙어 있다.
 *
 * ■ 두 개를 골라 견준다
 *
 * 아래에 A·B 두 자리를 두고, 카드를 누르면 빈 자리에 들어간다. 어느 것이 A고
 * B인지 눈에 보이고, 바꾸려면 ✕ 하나면 된다. 체크만 두면 "지금 뭐가 골라져
 * 있지"를 위로 올라가 확인해야 한다.
 */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 2026-08-30 → 8월 30일 (일) */
function spokenDate(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return `${m}월 ${d}일 (${WEEKDAYS[new Date(y, m - 1, d).getDay()]})`;
}

/** 2026-08 → 2026년 8월 */
function spokenMonth(month: string) {
  const [y, m] = month.split('-').map(Number);
  return `${y}년 ${m}월`;
}

type Sort = 'recent' | 'velocity' | 'intensity';

const SORTS: { key: Sort; label: string }[] = [
  { key: 'recent', label: '최근순' },
  { key: 'velocity', label: '구속 빠른순' },
  { key: 'intensity', label: '강도 높은순' },
];

/** 갤러리에서 쓰는 영상 한 개 */
type Clip = ClipOption & {
  sessionType: string;
  pitchCount: number;
  intensity: number;
  maxVelocity: number | null;
};

export function VideoGallery({
  logs,
  selecting,
  onSelectingChange,
  onCompare,
}: {
  logs: VideoLog[];
  /**
   * 비교할 둘을 고르는 중인가.
   *
   * 평소에는 눌러서 그날 기록으로 들어간다. 고르기까지 겸하게 했더니 기록을
   * 여는 방법이 없어졌다 — 누르면 골라지기만 했다.
   */
  selecting: boolean;
  onSelectingChange: (v: boolean) => void;
  /** 두 개를 고르고 '비교하기'를 눌렀을 때 */
  onCompare: (aId: string, bId: string) => void;
}) {
  const [filter, setFilter] = useState<string>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [picked, setPicked] = useState<(Clip | null)[]>([null, null]);
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const clips = useMemo<Clip[]>(
    () =>
      logs
        .filter((l) => l.videoPaths.length > 0 && l.sessionType !== REST_SESSION_TYPE)
        .flatMap((log) =>
          log.videoPaths.map((path, i) => ({
            id: `${log.id}-${i}`,
            date: log.date.slice(0, 10),
            path,
            label: log.videoPaths.length > 1 ? `영상 ${i + 1}` : '영상',
            summary: [
              log.maxVelocity != null ? `${log.maxVelocity}km/h` : null,
              `${log.pitchCount}구`,
              `강도 ${log.intensity}/10`,
            ]
              .filter(Boolean)
              .join(' · '),
            sessionType: log.sessionType,
            pitchCount: log.pitchCount,
            intensity: log.intensity,
            maxVelocity: log.maxVelocity,
          }))
        ),
    [logs]
  );

  const counts = useMemo(() => {
    const byType = new Map<string, number>();
    for (const c of clips)
      byType.set(c.sessionType, (byType.get(c.sessionType) ?? 0) + 1);
    return byType;
  }, [clips]);

  const chips = [
    { key: 'all', label: '전체', count: clips.length },
    ...SESSION_TYPES.filter((t) => t.name !== REST_SESSION_TYPE).map((t) => ({
      key: t.name,
      label: t.name,
      count: counts.get(t.name) ?? 0,
    })),
  ].filter((c) => c.count > 0);

  /* 달별로 묶는다 — 정렬을 골랐어도 달 안에서만 순서가 바뀐다 */
  const months = useMemo(() => {
    const rows = clips.filter((c) => filter === 'all' || c.sessionType === filter);
    const map = new Map<string, Clip[]>();
    for (const c of rows) {
      const m = c.date.slice(0, 7);
      map.set(m, [...(map.get(m) ?? []), c]);
    }
    const cmp = (a: Clip, b: Clip) => {
      if (sort === 'velocity') return (b.maxVelocity ?? -1) - (a.maxVelocity ?? -1);
      if (sort === 'intensity') return b.intensity - a.intensity;
      return b.date.localeCompare(a.date);
    };
    return [...map.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, items]) => ({ month, items: [...items].sort(cmp) }));
  }, [clips, filter, sort]);

  const openByDefault = useMemo(
    () => new Set(months.slice(0, 1).map((g) => g.month)),
    [months]
  );
  const isOpen = (month: string) => toggled[month] ?? openByDefault.has(month);

  /* 펼친 달의 영상만 주소를 받는다 */
  const visiblePaths = useMemo(
    () =>
      months.filter((g) => isOpen(g.month)).flatMap((g) => g.items.map((c) => c.path)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [months, toggled, openByDefault]
  );
  const { urls } = usePlaybackUrls(visiblePaths);

  const pick = (clip: Clip) => {
    setPicked((prev) => {
      /* 이미 골라 둔 것을 다시 누르면 뺀다 */
      const at = prev.findIndex((p) => p?.id === clip.id);
      if (at >= 0) return prev.map((p, i) => (i === at ? null : p));
      const empty = prev.findIndex((p) => p == null);
      if (empty < 0) return prev;
      return prev.map((p, i) => (i === empty ? clip : p));
    });
  };

  const slotOf = (id: string) => picked.findIndex((p) => p?.id === id);
  const ready = picked[0] != null && picked[1] != null;

  if (clips.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-line px-4 py-10 text-center text-sm leading-relaxed text-muted">
        아직 올린 투구 영상이 없습니다.
        <br />
        날짜를 눌러 기록을 남길 때 영상을 함께 올릴 수 있습니다.
      </p>
    );
  }

  return (
    <div className={selecting ? 'space-y-3 pb-24' : 'space-y-3'}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-sm font-bold text-ink">
          투구 영상 <span className="text-display text-base">{clips.length}</span>개
        </p>
        {clips.length >= 2 && (
          <button
            type="button"
            onClick={() => {
              onSelectingChange(!selecting);
              setPicked([null, null]);
            }}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
              selecting
                ? 'border-line-strong text-muted hover:text-ink'
                : 'border-sky bg-sky-tint text-sky-strong hover:bg-sky-tint/70'
            }`}
          >
            {selecting ? '고르기 그만두기' : '2분할 비교'}
          </button>
        )}

        <span className="ml-auto flex flex-wrap gap-1.5">
          {SORTS.map((s) => (
            <button
              key={s.key}
              type="button"
              onClick={() => setSort(s.key)}
              aria-pressed={sort === s.key}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                sort === s.key
                  ? 'border-sky bg-sky-tint text-sky-strong'
                  : 'border-line text-muted hover:border-sky-soft'
              }`}
            >
              {s.label}
            </button>
          ))}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setFilter(c.key)}
            aria-pressed={filter === c.key}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              filter === c.key
                ? 'border-sky bg-sky-tint text-sky-strong'
                : 'border-line text-muted hover:border-sky-soft'
            }`}
          >
            {c.label}
            <span
              className={`text-display text-[13px] leading-none ${
                filter === c.key ? 'text-sky-strong' : 'text-line-strong'
              }`}
            >
              {c.count}
            </span>
          </button>
        ))}
      </div>

      {months.map((group) => {
        const open = isOpen(group.month);
        return (
          <section
            key={group.month}
            className="overflow-hidden rounded-2xl border border-line bg-surface"
          >
            <button
              type="button"
              onClick={() => setToggled((prev) => ({ ...prev, [group.month]: !open }))}
              aria-expanded={open}
              className="flex w-full items-center gap-2 px-5 py-3 text-left transition-colors hover:bg-surface-2"
            >
              <ChevronDown
                aria-hidden
                className={`h-4 w-4 shrink-0 text-muted transition-transform ${
                  open ? '' : '-rotate-90'
                }`}
              />
              <span className="text-sm font-bold text-ink">
                {spokenMonth(group.month)}
              </span>
              <span className="text-display text-sm leading-none text-muted">
                {group.items.length}
              </span>
            </button>

            {open && (
              <ul className="grid gap-3 border-t border-line p-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map((clip) => {
                  const slot = slotOf(clip.id);
                  const url = urls[clip.path];

                  /* 썸네일과 설명 — 링크에도 단추에도 같은 속이 들어간다 */
                  const body = (
                    <>
                      {url ? (
                        /*
                          영상의 한 프레임을 그대로 쓴다. preload="metadata" 라
                          머리 부분만 받으므로 목록이 무거워지지 않는다.
                        */
                        <video
                          src={`${url}#t=0.5`}
                          preload="metadata"
                          muted
                          playsInline
                          className="aspect-video w-full bg-shade object-contain"
                        />
                      ) : (
                        <span className="flex aspect-video w-full items-center justify-center bg-surface-2">
                          <Film aria-hidden className="h-6 w-6 text-line-strong" />
                        </span>
                      )}

                      {selecting && slot >= 0 && (
                        <span className="absolute top-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-sky text-[11px] font-bold text-white shadow">
                          {slot === 0 ? 'A' : 'B'}
                        </span>
                      )}

                      <span className="block space-y-1 px-3 py-2.5 text-left">
                        <span className="flex flex-wrap items-baseline gap-x-1.5">
                          <span className="text-[13px] font-semibold text-ink">
                            {spokenDate(clip.date)}
                          </span>
                          <span className="text-[11px] text-muted">
                            {clip.sessionType}
                            {clip.label !== '영상' && ` · ${clip.label}`}
                          </span>
                        </span>
                        <span className="block text-[11px] text-muted">
                          {clip.summary}
                        </span>
                      </span>
                    </>
                  );

                  const shell = `relative block overflow-hidden rounded-xl border transition-colors ${
                    selecting && slot >= 0
                      ? 'border-sky ring-1 ring-sky'
                      : 'border-line hover:border-sky-soft'
                  }`;

                  return (
                    <li key={clip.id}>
                      {selecting ? (
                        <button
                          type="button"
                          onClick={() => pick(clip)}
                          aria-pressed={slot >= 0}
                          aria-label={`${spokenDate(clip.date)} 영상 고르기`}
                          disabled={!url}
                          className={`w-full ${shell}`}
                        >
                          {body}
                        </button>
                      ) : (
                        <Link href={`/pitch-log/${clip.date}`} className={shell}>
                          {body}
                        </Link>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}

      {/*
        고른 두 개 — 아래에 붙여 둔다. 위로 올라가 확인하지 않아도 되게.
        고르는 중에만 낸다 — 평소에는 영상을 보는 화면이다.
      */}
      {selecting && (
        <div className="fixed inset-x-0 bottom-16 z-30 px-4 sm:bottom-4">
          <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-2xl border border-line-strong bg-surface px-4 py-3 shadow-2xl">
            {[0, 1].map((i) => {
              const p = picked[i];
              return (
                <span
                  key={i}
                  className={`inline-flex min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs ${
                    p
                      ? 'border-sky bg-sky-tint text-sky-strong'
                      : 'border-dashed border-line text-muted'
                  }`}
                >
                  <span className="font-bold">{i === 0 ? 'A' : 'B'}</span>
                  <span className="min-w-0 truncate">
                    {p ? spokenDate(p.date) : '비어 있음'}
                  </span>
                  {p && (
                    <button
                      type="button"
                      onClick={() =>
                        setPicked((prev) => prev.map((x, j) => (j === i ? null : x)))
                      }
                      aria-label={`${i === 0 ? 'A' : 'B'}면 비우기`}
                      className="shrink-0 rounded p-0.5 transition-colors hover:text-danger"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </span>
              );
            })}

            <button
              type="button"
              disabled={!ready}
              onClick={() => {
                if (picked[0] && picked[1]) onCompare(picked[0].id, picked[1].id);
              }}
              className="ml-auto rounded-lg bg-sky px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-strong disabled:cursor-not-allowed disabled:bg-line-strong"
            >
              {ready ? '비교하기' : '두 개를 고르세요'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
