'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { formatSpeed } from '@/lib/units';
import { useSpeedUnit } from '@/components/use-units';
import Link from 'next/link';
import { ChevronDown, Film, Star, X } from 'lucide-react';
import { usePlaybackUrls } from '@/components/use-playback-urls';
import { intensityClass } from '@/components/month-calendar';
import { REST_SESSION_TYPE, SESSION_TYPES } from '@/lib/session-type';
import { setFeaturedVideo } from '@/app/actions/featured-video';
import type { ClipOption } from './compare-view';
import type { VideoLog } from './videos-client';

/**
 * 투구 기록을 달별로 모아 보는 곳 — 영상이 있는 기록은 영상 한 장면과 함께.
 *
 * 영상 카드는 영상 하나에 한 장이다(한 기록에 영상이 둘이면 두 장). 영상 없이 남긴
 * 기록과 쉬는 날도 한 장씩 나온다 — 그림 자리에 투구수와 강도를 크게 적는다. 예전
 * '투구 영상' 탭은 영상이 붙은 기록만 보여 줘서, 영상 없이 남긴 날은 이 목록에 없었다.
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
 *
 * ■ 영상이 여럿인 날은 대표를 고른다
 *
 * 홈 캘린더에서 날짜를 누르면 그날 영상 하나를 그 자리에서 틀어 준다. 무엇을 띄울지는
 * 여기서 정한다 — 카드 왼쪽 위의 '대표로'. 안 고른 날은 그날 처음 올린 영상이 대표다.
 * 영상이 하나뿐인 날은 고를 것이 없어서 단추를 두지 않는다.
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

/**
 * 목록의 카드 한 장 — 영상 하나, 또는 영상이 없는 기록 하나.
 * path 가 없으면 영상 없는 기록이다(2분할 비교로 고를 수 없다).
 */
type Clip = Omit<ClipOption, 'path'> & {
  /** 이 카드의 기록 — 영상이 둘인 기록은 카드가 두 장이라, 기록을 셀 때는 이것으로 센다 */
  logId: string;
  path: string | null;
  sessionType: string;
  pitchCount: number;
  intensity: number;
  maxVelocity: number | null;
  rest: boolean;
};

export function VideoGallery({
  logs,
  featured,
  initialMonth,
  selecting,
  onSelectingChange,
  onCompare,
}: {
  logs: VideoLog[];
  /** 날짜별로 고른 대표 영상. 안 고른 날은 없다 — 그날 처음 올린 영상이 대표다. */
  featured: Record<string, string>;
  /** 처음에 펴 둘 달(YYYY-MM) — 캘린더의 '대표 바꾸기'로 들어온 경우 */
  initialMonth: string | null;
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
  /* 구속을 보여줄 단위. 저장은 늘 km/h 다(lib/units.ts). */
  const speedUnit = useSpeedUnit();
  const [filter, setFilter] = useState<string>('all');
  const [sort, setSort] = useState<Sort>('recent');
  const [picked, setPicked] = useState<(Clip | null)[]>([null, null]);
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const clips = useMemo<Clip[]>(
    () =>
      logs.flatMap((log): Clip[] => {
        const rest = log.sessionType === REST_SESSION_TYPE;
        const base = {
          logId: log.id,
          date: log.date.slice(0, 10),
          summary: rest
            ? '쉬는 날로 남김'
            : [
                log.maxVelocity != null
                  ? formatSpeed(log.maxVelocity, speedUnit)
                  : null,
                `${log.pitchCount}구`,
                `강도 ${log.intensity}/10`,
              ]
                .filter(Boolean)
                .join(' · '),
          sessionType: log.sessionType,
          pitchCount: log.pitchCount,
          intensity: log.intensity,
          maxVelocity: log.maxVelocity,
          rest,
        };
        /* 영상이 없거나 쉬는 날이면 기록 한 장 — 쉬는 날 기록의 영상은 세지 않는다 */
        if (rest || log.videoPaths.length === 0) {
          return [{ ...base, id: log.id, path: null, label: '기록' }];
        }
        return log.videoPaths.map((path, i) => ({
          ...base,
          id: `${log.id}-${i}`,
          path,
          label: log.videoPaths.length > 1 ? `영상 ${i + 1}` : '영상',
        }));
      }),
    /* 단위를 바꾸면 요약 글도 다시 만들어야 한다 — 빼면 목록만 km/h 로 남는다 */
    [logs, speedUnit]
  );
  /* 영상이 있는 카드 — 2분할 비교는 이것만 고른다 */
  const videoCount = useMemo(() => clips.filter((c) => c.path).length, [clips]);
  /* 기록 수(카드 수가 아니라) — 영상이 둘인 기록도 한 건 */
  const recordCount = logs.length;

  /* 종류별 기록 수 — 카드 수가 아니라 기록 수(위의 '투구 기록 N건'과 같게) */
  const counts = useMemo(() => {
    const byType = new Map<string, Set<string>>();
    for (const c of clips)
      byType.set(c.sessionType, (byType.get(c.sessionType) ?? new Set()).add(c.logId));
    return new Map([...byType].map(([type, ids]) => [type, ids.size]));
  }, [clips]);

  const chips = [
    { key: 'all', label: '전체', count: recordCount },
    ...SESSION_TYPES.map((t) => ({
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

  /* 처음엔 가장 최근 달만 편다. 캘린더에서 날짜를 골라 들어왔으면 그 날짜의 달을 편다. */
  const openByDefault = useMemo(() => {
    const wanted =
      initialMonth && months.some((g) => g.month === initialMonth)
        ? initialMonth
        : months[0]?.month;
    return new Set(wanted ? [wanted] : []);
  }, [months, initialMonth]);
  const isOpen = (month: string) => toggled[month] ?? openByDefault.has(month);

  /* 캘린더에서 들어왔으면 그 달까지 내려 준다 — 펴 두기만 하면 아래에 있어 안 보인다 */
  useEffect(() => {
    if (!initialMonth) return;
    document
      .getElementById(`month-${initialMonth}`)
      ?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [initialMonth]);

  /*
   * 날짜별 영상 — 남긴 차례대로(서버가 그 차례로 준다). 대표를 안 고른 날은 이 첫
   * 영상이 대표다. 홈 캘린더도 같은 차례로 셈하므로 둘이 같은 영상을 가리킨다.
   */
  const dayPaths = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const log of logs) {
      const key = log.date.slice(0, 10);
      map.set(key, [...(map.get(key) ?? []), ...log.videoPaths]);
    }
    return map;
  }, [logs]);

  /*
   * 여기서 방금 고른 대표. 누르는 즉시 바뀐 것으로 보이고, 저장은 뒤따른다.
   * 저장이 안 되면 되돌리고 까닭을 띄운다.
   */
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [featureError, setFeatureError] = useState<string | null>(null);
  const [, startSaving] = useTransition();

  const featuredOf = (date: string) => {
    const paths = dayPaths.get(date) ?? [];
    const pick = chosen[date] ?? featured[date];
    return pick && paths.includes(pick) ? pick : paths[0];
  };

  const feature = (clip: Clip) => {
    if (!clip.path || featuredOf(clip.date) === clip.path) return;
    const path = clip.path;
    const before = chosen[clip.date];
    const undo = () =>
      setChosen((c) => {
        const next = { ...c };
        if (before === undefined) delete next[clip.date];
        else next[clip.date] = before;
        return next;
      });

    setFeatureError(null);
    setChosen((c) => ({ ...c, [clip.date]: path }));
    startSaving(async () => {
      try {
        const res = await setFeaturedVideo(clip.date, path);
        if ('error' in res) {
          undo();
          setFeatureError(res.error);
        }
      } catch {
        undo();
        setFeatureError('대표 영상을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.');
      }
    });
  };

  /* 펼친 달의 영상만 주소를 받는다 */
  const visiblePaths = useMemo(
    () =>
      months
        .filter((g) => isOpen(g.month))
        .flatMap((g) => g.items.flatMap((c) => (c.path ? [c.path] : []))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [months, toggled, openByDefault]
  );
  const { urls } = usePlaybackUrls(visiblePaths);

  const pick = (clip: Clip) => {
    if (!clip.path) return;
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
        아직 남긴 투구 기록이 없습니다.
        <br />
        위의 &apos;오늘 기록 남기기&apos;로 시작하세요. 영상도 그때 함께 올릴 수
        있습니다.
      </p>
    );
  }

  return (
    <div className={selecting ? 'space-y-3 pb-24' : 'space-y-3'}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="text-sm font-bold text-ink">
          투구 기록 <span className="text-display text-base">{recordCount}</span>건
          <span className="font-normal text-muted">
            {' · '}영상 <span className="text-display text-base">{videoCount}</span>개
          </span>
        </p>
        {videoCount >= 2 && (
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

      {featureError && (
        <p
          role="alert"
          className="rounded-lg border border-danger-line bg-danger-bg px-3 py-2 text-xs text-danger"
        >
          {featureError}
        </p>
      )}

      {months.map((group) => {
        const open = isOpen(group.month);
        return (
          <section
            key={group.month}
            id={`month-${group.month}`}
            /* 위에 붙은 상단 바에 가리지 않게 내려와 멈춘다 */
            className="scroll-mt-20 overflow-hidden rounded-2xl border border-line bg-surface"
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
              <ul className="grid gap-3 border-t border-line p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                {group.items.map((clip) => {
                  const slot = slotOf(clip.id);
                  const url = clip.path ? urls[clip.path] : undefined;

                  /* 썸네일과 설명 — 링크에도 단추에도 같은 속이 들어간다 */
                  const body = (
                    <>
                      {!clip.path ? (
                        /*
                          영상 없이 남긴 기록 — 그림 자리에 투구수와 강도를 크게. 칸의 색은
                          캘린더와 같은 강도 색이고, 쉬는 날은 점선이다.
                        */
                        <span
                          className={`flex aspect-video w-full flex-col items-center justify-center gap-1 ${
                            clip.rest
                              ? 'border-b border-dashed border-line-strong bg-surface-2 text-muted'
                              : intensityClass(clip.intensity)
                          }`}
                        >
                          <span className="text-display text-3xl leading-none">
                            {clip.rest ? '휴식' : `${clip.pitchCount}구`}
                          </span>
                          {!clip.rest && (
                            <span className="text-[11px] font-medium opacity-80">
                              강도 {clip.intensity} · 영상 없음
                            </span>
                          )}
                        </span>
                      ) : url ? (
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
                            {clip.path && clip.label !== '영상' && ` · ${clip.label}`}
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

                  /*
                   * 대표 고르기 — 영상이 여럿인 날만. 비교할 둘을 고르는 동안에는
                   * 감춘다(카드를 누르는 뜻이 둘로 갈리면 헷갈린다).
                   *
                   * 카드(링크) 안에 넣지 않고 옆에 겹쳐 둔다. 링크 안에 단추를 넣으면
                   * 누를 때 둘 다 반응하고, 화면 낭독기도 어느 쪽인지 헷갈린다.
                   */
                  const choosable =
                    !selecting &&
                    clip.path != null &&
                    (dayPaths.get(clip.date)?.length ?? 0) > 1;
                  const isFeatured = featuredOf(clip.date) === clip.path;

                  return (
                    <li key={clip.id} className="relative">
                      {choosable && (
                        <button
                          type="button"
                          onClick={() => feature(clip)}
                          aria-pressed={isFeatured}
                          aria-label={
                            isFeatured
                              ? `${spokenDate(clip.date)} 대표 영상 — 캘린더에 이 영상이 뜹니다`
                              : `${spokenDate(clip.date)} 대표 영상으로 고르기`
                          }
                          title={
                            isFeatured
                              ? '캘린더에서 이 날을 누르면 이 영상이 뜹니다'
                              : '이 날의 대표 영상으로 고르기'
                          }
                          className={`absolute left-2 top-2 z-10 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold shadow transition-colors ${
                            isFeatured
                              ? 'bg-sky text-white'
                              : 'bg-shade/60 text-white/90 hover:bg-shade/80 hover:text-white'
                          }`}
                        >
                          <Star
                            aria-hidden
                            className={`h-3 w-3 ${isFeatured ? 'fill-current' : ''}`}
                          />
                          {isFeatured ? '대표' : '대표로'}
                        </button>
                      )}
                      {selecting && !clip.path ? (
                        /* 영상이 없는 기록은 견줄 수 없다 — 고르는 동안에는 흐리게 둔다 */
                        <div aria-disabled className={`opacity-40 ${shell}`}>
                          {body}
                        </div>
                      ) : selecting ? (
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

        하단 탭바 위(bottom-16)에 둔다. 탭바는 PC 틀(desk — 1024px 이상, 또는 마우스로
        보는 640px 이상)에서만 사라지므로 바닥에 붙이는 것도 거기서부터다. 폭만 보고
        sm(640px)부터 붙였더니 아이폰 가로·아이패드 세로(손가락, 640~1023px)에서 이 막대가
        탭바 밑에 깔렸다 — [비교하기]가 거의 안 보이고, 누르면 그 아래 탭이 눌려 화면이
        바뀌며 고른 것이 사라졌다.
      */}
      {selecting && (
        <div className="fixed inset-x-0 bottom-16 z-30 px-4 desk:bottom-4">
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
