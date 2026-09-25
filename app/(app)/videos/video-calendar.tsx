'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { ArrowRight, Camera, Check, Film, Loader2, Star } from 'lucide-react';
import { MonthCalendar, type DayCell, type DayMark } from '@/components/month-calendar';
import { Card } from '@/components/ui';
import { Expand } from '@/components/expand';
import { usePlaybackUrls } from '@/components/use-playback-urls';
import { useSpeedUnit } from '@/components/use-units';
import { formatSpeed } from '@/lib/units';
import { toDateKey } from '@/lib/pitch-stats';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import {
  fetchPitchThumbs,
  fetchPlaybackUrls,
  frameOf,
  makePitchThumb,
  savePitchThumb,
} from '@/lib/pitch-thumbs';
import { setFeaturedVideo } from '@/app/actions/featured-video';
import type { VideoLog } from './videos-client';

/**
 * 투구 영상 캘린더 — 영상을 찾고 보는 달력.
 *
 * 영상은 '그날'로 기억한다. 목록에서 카드를 훑으며 찾는 것보다, 달력에서 그날을 짚는
 * 것이 빠르다. 그래서 칸을 크게 두고 칸마다 그날 영상의 한 장면을 채웠다 — 칸만 보고도
 * 어느 날 무엇을 찍었는지 알아본다.
 *
 * ■ 칸의 그림(썸네일)
 *
 * 그날 대표 영상의 한 장면이다. 대표는 사람이 고르고(★), 안 고른 날은 그날 처음 올린
 * 영상이다 — 홈 캘린더와 같은 규칙이다.
 *
 * 장면도 사람이 고른다. 밑에서 영상을 보다 멈추고 '이 장면을 썸네일로'를 누르면 그
 * 프레임이 칸에 들어간다. 안 고른 영상은 자동으로 뜬다 — 올릴 때 손에 든 파일에서 뜨고,
 * 예전에 올려 없는 것은 이 달력을 열 때 한 개씩 영상을 받아 앞쪽 한 장면을 뜬다
 * (lib/pitch-thumbs.ts).
 *
 * ■ 날짜를 누르면
 *
 * 달력 밑에서 그날 칸이 펴지고 대표 영상이 그 자리에서 재생된다. 영상이 여럿인 날은
 * 옆에 작은 그림으로 늘어놓아 바꿔 본다. 자세 분석·구간 보정은 그날 기록 화면에 있다.
 */

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** 2026-08-30 → 8월 30일 (일) */
function spokenDate(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return `${m}월 ${d}일 (${WEEKDAYS[new Date(y, m - 1, d).getDay()]})`;
}

type Day = {
  key: string;
  /** 그날 영상 — 남긴 차례대로 */
  paths: string[];
  logs: VideoLog[];
};

/** 칸의 그림 상태 — 주소 / 없음(뜨는 중) / 물어보는 중(undefined) */
type Thumbs = Record<string, string | null>;

export function VideoCalendar({
  logs,
  featured,
  initialMonth,
  initialDate,
}: {
  logs: VideoLog[];
  /** 날짜별로 고른 대표 영상 */
  featured: Record<string, string>;
  /** 처음에 펴 둘 달(YYYY-MM) */
  initialMonth: string | null;
  /** 처음에 열어 둘 날(YYYY-MM-DD) — 홈에서 '영상 탭에서 보기'로 들어온 경우 */
  initialDate: string | null;
}) {
  /* 날짜별 영상. 쉬는 날로 남긴 기록은 뺀다(영상이 붙을 일이 없지만 혹시 몰라). */
  const days = useMemo(() => {
    const map = new Map<string, Day>();
    for (const log of logs) {
      if (log.sessionType === REST_SESSION_TYPE || log.videoPaths.length === 0)
        continue;
      const key = log.date.slice(0, 10);
      const day = map.get(key) ?? { key, paths: [], logs: [] };
      day.paths.push(...log.videoPaths);
      day.logs.push(log);
      map.set(key, day);
    }
    return map;
  }, [logs]);

  /*
   * 여기서 방금 고른 대표. 누르는 즉시 바뀐 것으로 보이고, 저장은 뒤따른다.
   * 저장이 안 되면 되돌리고 까닭을 띄운다(갤러리와 같은 방식).
   */
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [, startSaving] = useTransition();

  const repOf = (key: string) => {
    const day = days.get(key);
    if (!day) return null;
    const pick = chosen[key] ?? featured[key];
    return pick && day.paths.includes(pick) ? pick : day.paths[0];
  };

  const feature = (date: string, path: string) => {
    if (repOf(date) === path) return;
    const before = chosen[date];
    const undo = () =>
      setChosen((c) => {
        const next = { ...c };
        if (before === undefined) delete next[date];
        else next[date] = before;
        return next;
      });
    setError(null);
    setChosen((c) => ({ ...c, [date]: path }));
    startSaving(async () => {
      try {
        const res = await setFeaturedVideo(date, path);
        if ('error' in res) {
          undo();
          setError(res.error);
        }
      } catch {
        undo();
        setError('대표 영상을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.');
      }
    });
  };

  /* 처음 펼 달 — 들어온 날짜 → 들어온 달 → 가장 최근에 영상을 올린 달 → 이번 달 */
  const [month, setMonth] = useState(() => {
    const latest = [...days.keys()].sort().at(-1);
    const from =
      initialDate ??
      (initialMonth ? `${initialMonth}-01` : (latest ?? toDateKey(new Date())));
    const [y, m] = from.split('-').map(Number);
    return new Date(y, m - 1, 1);
  });
  const monthKey = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`;

  /*
   * 고른 날, 그리고 밑 칸이 보여 주는 날. 닫는 동안(0.3초)에도 칸이 비지 않게 마지막
   * 날을 들고 있는다 — 그리는 동안 맞추는 방식(이펙트 없이).
   */
  const [selected, setSelected] = useState<string | null>(
    initialDate && days.has(initialDate) ? initialDate : null
  );
  const [shown, setShown] = useState<string | null>(selected);
  if (selected && selected !== shown) setShown(selected);

  /* ── 칸의 그림 ── */
  const [thumbs, setThumbs] = useState<Thumbs>({});
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const asked = useRef(new Set<string>());

  /*
   * 그림이 필요한 영상 — 펼친 달의 대표들, 그리고 연 날의 영상 전부(옆 작은 그림).
   * 앞의 것이 먼저다: 없는 것을 뜰 때도 이 차례로 뜬다.
   */
  const wanted = useMemo(() => {
    const reps: string[] = [];
    for (const key of [...days.keys()].sort()) {
      if (!key.startsWith(monthKey)) continue;
      const day = days.get(key)!;
      const pick = chosen[key] ?? featured[key];
      reps.push(pick && day.paths.includes(pick) ? pick : day.paths[0]);
    }
    const open = shown ? (days.get(shown)?.paths ?? []) : [];
    return [...new Set([...reps, ...open])];
  }, [days, monthKey, chosen, featured, shown]);

  /* 아직 안 물어본 것만 묻는다. 없는 것은 null — 아래에서 뜬다. */
  useEffect(() => {
    const ask = wanted.filter((p) => !asked.current.has(p));
    if (ask.length === 0) return;
    for (const p of ask) asked.current.add(p);
    fetchPitchThumbs(ask)
      .then((urls) =>
        setThumbs((prev) => {
          const next = { ...prev };
          for (const p of ask) next[p] = urls[p] ?? null;
          return next;
        })
      )
      .catch(() => {
        /* 다음에 다시 묻게 표시를 지운다 */
        for (const p of ask) asked.current.delete(p);
      });
  }, [wanted]);

  /*
   * 없는 그림은 한 개씩 뜬다 — 영상을 받아 앞쪽 한 장면을 떠 올린다.
   *
   * 한 번에 하나다. 영상은 한 개가 수십 MB 라 여럿을 한꺼번에 받으면 화면 전체가
   * 느려진다. 못 뜬 영상(형식·네트워크)은 이번에는 더 묻지 않고 필름 그림으로 둔다.
   */
  const running = useRef(false);
  useEffect(() => {
    if (running.current) return;
    const next = wanted.find((p) => thumbs[p] === null && !failed.has(p));
    if (!next) return;
    running.current = true;
    void (async () => {
      let url: string | null = null;
      try {
        const play = (await fetchPlaybackUrls([next]))[next];
        if (play && (await makePitchThumb(next, play))) {
          url = (await fetchPitchThumbs([next], true))[next] ?? null;
        }
      } catch {
        url = null;
      }
      running.current = false;
      if (url) setThumbs((prev) => ({ ...prev, [next]: url }));
      else setFailed((prev) => new Set(prev).add(next));
    })();
  }, [wanted, thumbs, failed]);

  /* 화면 낭독기가 읽을 말 — 칸 속은 그림이라 눈으로 안 보는 사람에게는 이것뿐이다 */
  const marks = useMemo(() => {
    const out: Record<string, DayMark> = {};
    for (const [key, day] of days) {
      const kinds = [...new Set(day.logs.map((l) => l.sessionType))].join(' · ');
      out[key] = {
        intensity: null,
        label: '',
        spoken: `영상 ${day.paths.length}개, ${kinds}`,
      };
    }
    return out;
  }, [days]);

  const monthCount = useMemo(
    () =>
      [...days.values()]
        .filter((d) => d.key.startsWith(monthKey))
        .reduce((n, d) => n + d.paths.length, 0),
    [days, monthKey]
  );

  /* 날짜를 누르면 밑 칸이 그날로 — 고른 날을 다시 누르면 닫는다 */
  const panelRef = useRef<HTMLDivElement>(null);
  const open = (key: string) => {
    setSelected((prev) => (prev === key ? null : key));
  };

  /*
   * 밑 칸이 화면 아래로 잘리면 거기까지 굴려 준다. 달력이 커서 밑 칸은 거의 늘 화면
   * 밖에서 펴진다 — 눌렀는데 아무 일도 없는 것처럼 보이면 안 된다.
   */
  useEffect(() => {
    if (!selected) return;
    const timer = window.setTimeout(() => {
      const el = panelRef.current;
      if (!el) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (el.getBoundingClientRect().top > window.innerHeight - 160) {
        el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
      }
    }, 320);
    return () => window.clearTimeout(timer);
  }, [selected]);

  const renderDay = (cell: DayCell) => {
    const day = days.get(cell.key);
    if (!day) {
      return (
        <>
          {!cell.isFuture && (
            <span aria-hidden className="absolute inset-0 bg-surface-2/70" />
          )}
          <span
            className={`absolute left-1.5 top-1 text-xs ${
              cell.isFuture
                ? 'text-muted/35'
                : cell.isToday
                  ? 'font-bold text-sky'
                  : 'font-medium text-muted'
            }`}
          >
            {cell.day}
          </span>
        </>
      );
    }
    const rep = repOf(cell.key)!;
    return (
      <>
        <Thumb url={thumbs[rep]} failed={failed.has(rep)} zoom />
        {/* 날짜 숫자가 밝은 장면 위에서도 읽히게 위쪽만 살짝 어둡게 */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-9 bg-gradient-to-b from-black/55 to-transparent"
        />
        <span
          className={`absolute left-1.5 top-1 text-xs font-bold text-white drop-shadow ${
            cell.isToday ? 'underline underline-offset-2' : ''
          }`}
        >
          {cell.day}
        </span>
        {day.paths.length > 1 && (
          <span className="absolute bottom-1 right-1 inline-flex items-center gap-0.5 rounded-md bg-black/60 px-1 py-0.5 text-[10px] font-semibold leading-none text-white">
            <Film aria-hidden className="h-2.5 w-2.5" />
            {day.paths.length}
          </span>
        )}
      </>
    );
  };

  const shownDay = shown ? days.get(shown) : undefined;

  return (
    <div className="space-y-4">
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-danger-line bg-danger-bg px-3 py-2 text-xs text-danger"
        >
          {error}
        </p>
      )}

      <Card>
        <MonthCalendar
          month={month}
          onMonthChange={setMonth}
          selected={selected}
          onSelect={open}
          marks={marks}
          renderDay={renderDay}
          size="large"
          emptySpoken="영상 없음"
        >
          <span>
            이 달 영상 <b className="font-semibold text-ink">{monthCount}</b>개
          </span>
          <span className="text-line-strong">·</span>
          <span>
            칸의 그림은 그날 대표 영상의 한 장면 — 날짜를 눌러 보다가 바꿀 수 있어요
          </span>
        </MonthCalendar>
      </Card>

      <div ref={panelRef} className="scroll-mt-20">
        <Expand open={selected != null}>
          {shown && (
            <DayPanel
              key={shown}
              date={shown}
              day={shownDay}
              rep={repOf(shown)}
              thumbs={thumbs}
              failed={failed}
              onFeature={(path) => feature(shown, path)}
              onThumb={(path, url) => {
                setThumbs((prev) => ({ ...prev, [path]: url }));
                setFailed((prev) => {
                  if (!prev.has(path)) return prev;
                  const next = new Set(prev);
                  next.delete(path);
                  return next;
                });
              }}
            />
          )}
        </Expand>
      </div>
    </div>
  );
}

/**
 * 영상 한 장면 그림. 받는 동안은 옅게 깜빡이는 자리를 두고, 다 받으면 떠오른다.
 * 못 뜬 영상은 필름 그림 — 영상은 있다는 것까지는 보여 준다.
 */
function Thumb({
  url,
  failed,
  zoom = false,
}: {
  url: string | null | undefined;
  failed: boolean;
  /** 칸에 마우스를 올리면 살짝 당겨 보인다(달력 칸) */
  zoom?: boolean;
}) {
  const [loaded, setLoaded] = useState<string | null>(null);
  if (url) {
    return (
      <>
        {loaded !== url && (
          <span aria-hidden className="absolute inset-0 animate-pulse bg-surface-2" />
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt=""
          draggable={false}
          onLoad={() => setLoaded(url)}
          className={`absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-300 ease-out ${
            loaded === url ? 'opacity-100' : 'opacity-0'
          } ${zoom ? 'group-hover:scale-105' : ''}`}
        />
      </>
    );
  }
  return (
    <span
      aria-hidden
      className="absolute inset-0 flex items-center justify-center bg-sky-tint/70"
    >
      <Film
        className={`h-4 w-4 text-sky/70 ${failed ? '' : 'motion-safe:animate-pulse'}`}
      />
    </span>
  );
}

/**
 * 고른 날 — 대표 영상을 그 자리에서 재생한다.
 *
 * 영상이 여럿이면 옆에 작은 그림으로 늘어놓아 바꿔 본다. 보다가 멈춘 장면을 칸의
 * 그림으로 쓸 수 있다('이 장면을 썸네일로'). 대표가 아닌 영상에서 누르면 그 영상이
 * 대표가 된다 — 칸의 그림은 대표의 한 장면이라서다.
 */
function DayPanel({
  date,
  day,
  rep,
  thumbs,
  failed,
  onFeature,
  onThumb,
}: {
  date: string;
  day: Day | undefined;
  rep: string | null;
  thumbs: Thumbs;
  failed: Set<string>;
  onFeature: (path: string) => void;
  onThumb: (path: string, url: string | null) => void;
}) {
  const speedUnit = useSpeedUnit();
  const [playing, setPlaying] = useState<string | null>(rep);
  const { urls } = usePlaybackUrls(day?.paths ?? []);
  const player = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');

  if (!day || !playing) {
    return (
      <section className="motion-safe:animate-fade-in rounded-2xl border border-dashed border-line px-5 py-8 text-center">
        <p className="text-sm text-muted">{spokenDate(date)}에는 올린 영상이 없어요.</p>
        <Link
          href={`/pitch-log/${date}`}
          className="mt-2 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-sky transition-colors hover:bg-sky-tint"
        >
          그날 기록에서 영상 올리기
          <ArrowRight aria-hidden className="h-3.5 w-3.5" />
        </Link>
      </section>
    );
  }

  const url = urls[playing];
  const log = day.logs.find((l) => l.videoPaths.includes(playing));
  const index = day.paths.indexOf(playing);

  async function takeThisScene() {
    const video = player.current;
    if (!video || !url || !playing) return;
    video.pause();
    setStatus('saving');
    /* 멈춘 바로 그 장면을 뜬다. 못 뜨면 영상을 새로 받아 그 초에서 뜬다. */
    const shot = await frameOf(video);
    const ok = shot
      ? await savePitchThumb(playing, shot).catch(() => false)
      : await makePitchThumb(playing, url, video.currentTime);
    if (!ok) {
      setStatus('failed');
      return;
    }
    const fresh = await fetchPitchThumbs([playing], true).catch(
      () => ({}) as Record<string, string>
    );
    onThumb(playing, fresh[playing] ?? null);
    if (playing !== rep) onFeature(playing);
    setStatus('saved');
  }

  return (
    <section className="motion-safe:animate-fade-in overflow-hidden rounded-2xl border border-line bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line px-5 py-3">
        <h3 className="text-sm font-bold text-ink">
          {spokenDate(date)}
          <span className="font-normal text-muted"> · 영상 {day.paths.length}개</span>
        </h3>
        <Link
          href={`/pitch-log/${date}`}
          className="group inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-semibold text-sky transition-colors hover:bg-sky-tint hover:text-sky-strong"
        >
          그날 기록에서 자세 분석
          <ArrowRight
            aria-hidden
            className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5"
          />
        </Link>
      </header>

      <div
        className={`grid gap-4 p-4 sm:p-5 ${
          day.paths.length > 1 ? 'lg:grid-cols-[minmax(0,1fr)_14rem]' : ''
        }`}
      >
        <div className="min-w-0 space-y-3">
          <div className="overflow-hidden rounded-xl bg-shade">
            {url ? (
              /*
                crossOrigin — 멈춘 장면을 그대로 뜨려면(frameOf) 다른 주소의 영상이라도
                캔버스에 그릴 수 있어야 한다. 저장소는 그것을 허락한다.
              */
              <video
                key={url}
                ref={player}
                src={url}
                crossOrigin="anonymous"
                controls
                playsInline
                preload="metadata"
                onPlay={() => setStatus('idle')}
                className="motion-safe:animate-fade-in block aspect-video max-h-[65vh] w-full object-contain"
              />
            ) : (
              <div className="flex aspect-video w-full items-center justify-center text-xs text-white/60">
                영상을 불러오는 중…
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={takeThisScene}
              disabled={!url || status === 'saving'}
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:border-sky hover:text-sky disabled:cursor-wait disabled:opacity-60"
            >
              {status === 'saving' ? (
                <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
              ) : (
                <Camera aria-hidden className="h-4 w-4" />
              )}
              이 장면을 썸네일로
            </button>
            {day.paths.length > 1 && playing !== rep && (
              <button
                type="button"
                onClick={() => onFeature(playing)}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-line-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:border-sky hover:text-sky"
              >
                <Star aria-hidden className="h-4 w-4" />이 영상을 대표로
              </button>
            )}
            <span aria-live="polite" className="text-xs">
              {status === 'saved' && (
                <span className="motion-safe:animate-fade-in inline-flex items-center gap-1 text-ok">
                  <Check aria-hidden className="h-3.5 w-3.5" />
                  칸의 그림을 이 장면으로 바꿨어요
                </span>
              )}
              {status === 'failed' && (
                <span className="motion-safe:animate-fade-in text-danger">
                  이 브라우저에서 장면을 뜨지 못했어요. 다른 브라우저에서 해 보세요.
                </span>
              )}
            </span>
          </div>

          {log && (
            <p className="text-xs text-muted">
              {day.paths.length > 1 && `영상 ${index + 1} · `}
              {log.sessionType} · {log.pitchCount}구 · 강도 {log.intensity}
              {log.maxVelocity != null &&
                ` · 최고 ${formatSpeed(log.maxVelocity, speedUnit) ?? '—'}`}
            </p>
          )}
        </div>

        {day.paths.length > 1 && (
          <ul className="grid grid-cols-2 content-start gap-2 lg:grid-cols-1">
            {day.paths.map((path, i) => {
              const on = path === playing;
              return (
                <li
                  key={path}
                  className="motion-safe:animate-row-in"
                  style={{ '--row': i } as React.CSSProperties}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setPlaying(path);
                      setStatus('idle');
                    }}
                    aria-pressed={on}
                    aria-label={`영상 ${i + 1}${path === rep ? ', 대표' : ''}`}
                    className={`group block w-full overflow-hidden rounded-lg border text-left transition-colors ${
                      on
                        ? 'border-sky ring-1 ring-sky'
                        : 'border-line hover:border-line-strong'
                    }`}
                  >
                    <span className="relative block aspect-video bg-surface-2">
                      <Thumb url={thumbs[path]} failed={failed.has(path)} zoom />
                    </span>
                    <span className="flex items-center justify-between gap-1 px-2 py-1.5 text-xs">
                      <span className={on ? 'font-semibold text-ink' : 'text-muted'}>
                        영상 {i + 1}
                      </span>
                      {path === rep && (
                        <span className="inline-flex items-center gap-0.5 font-semibold text-sky">
                          <Star aria-hidden className="h-3 w-3 fill-current" />
                          대표
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
