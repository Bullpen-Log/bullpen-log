'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MapPlace } from '@/lib/market/map-load';
import { coachTone } from '@/components/dugout/coach-card';

/**
 * 덕아웃 지도(2026-10-24, 네이버 지도 · 카카오맵처럼) — 왼쪽 목록 · 오른쪽 지도(휴대폰은 지도 위 · 목록 밑).
 * 지도는 카카오맵 JavaScript SDK(약관상 무료 사용 · 로고와 저작권 표시는 지도가 그대로 그린다 — 가리지 않는다).
 * 열쇠는 NEXT_PUBLIC_KAKAO_MAP_KEY(카카오 개발자 콘솔 JavaScript 키, 쓰는 도메인을 플랫폼 · Web 에 등록해야 뜬다).
 * 열쇠가 없거나 못 불러오면 목록만 보인다.
 */

/* 카카오 SDK 의 쓰는 부분만 */
type KLatLng = { getLat(): number; getLng(): number };
type KMap = {
  setBounds(b: unknown, ...pad: number[]): void;
  panTo(p: KLatLng): void;
  setLevel(l: number, o?: { anchor?: KLatLng; animate?: boolean }): void;
  getLevel(): number;
  relayout(): void;
  addControl?(c: unknown, pos: unknown): void;
};
type KOverlay = { setMap(m: KMap | null): void; setZIndex(z: number): void };
type Kakao = {
  maps: {
    load(cb: () => void): void;
    LatLng: new (lat: number, lng: number) => KLatLng;
    LatLngBounds: new () => { extend(p: KLatLng): void };
    Map: new (el: HTMLElement, o: { center: KLatLng; level: number }) => KMap;
    CustomOverlay: new (o: { position: KLatLng; content: HTMLElement; yAnchor?: number; zIndex?: number; clickable?: boolean }) => KOverlay;
    ZoomControl: new () => unknown;
    ControlPosition: { RIGHT: unknown };
    event: { addListener(t: unknown, n: string, f: () => void): void };
  };
};
declare global {
  interface Window {
    kakao?: Kakao;
  }
}

const KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
let loading: Promise<Kakao> | null = null;

function loadKakao(): Promise<Kakao> {
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    if (!KEY) return reject(new Error('no key'));
    if (window.kakao?.maps) return window.kakao.maps.load(() => resolve(window.kakao!));
    const s = document.createElement('script');
    s.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(KEY)}&autoload=false`;
    s.async = true;
    s.onload = () => (window.kakao ? window.kakao.maps.load(() => resolve(window.kakao!)) : reject(new Error('load')));
    s.onerror = () => reject(new Error('load'));
    document.head.appendChild(s);
  }).catch((e) => {
    loading = null;
    throw e;
  }) as Promise<Kakao>;
  return loading;
}

/** 서울시청 — 점이 하나도 없을 때 가운데 */
const SEOUL = { lat: 37.5665, lng: 126.978 };

/**
 * 이름을 붙이는 확대 정도(2026-10-26 김민 "축소했을 때는 아이콘만, 어느 정도 확대하면 이름") — 카카오 지도 수준은 작을수록 확대(1 ≈ 20m · 5 ≈ 250m · 8 ≈ 2km).
 * 이 수준 이하로 확대하면 이름표, 더 멀리 보면 색 점만. 고른 곳은 늘 이름표. 이름이 겹쳐 보이면 이 숫자를 줄인다.
 */
const NAME_LEVEL = 5;

/** 점 하나 칠하기 — named 면 이름표(알약), 아니면 색 점. 바닥 가운데가 그 자리다(점은 반만큼 내려 가운데가 자리에) */
function paint(el: HTMLElement, p: MapPlace, on: boolean, named: boolean) {
  const color = p.type === 'lesson' ? '#7c3aed' : p.type === 'field' ? '#c2410c' : '#16804a';
  el.style.cssText = named
    ? `display:flex;align-items:center;gap:4px;padding:5px 9px;border-radius:999px;font:600 12px/1 system-ui,sans-serif;white-space:nowrap;cursor:pointer;box-shadow:0 2px 6px rgba(0,0,0,.25);border:2px solid ${color};transform:translateY(-6px) scale(${on ? 1.12 : 1});transition:transform .15s;background:${on ? color : '#fff'};color:${on ? '#fff' : '#1d1d1f'}`
    : `display:block;width:16px;height:16px;padding:0;border-radius:999px;cursor:pointer;box-shadow:0 1px 4px rgba(0,0,0,.35);border:2.5px solid #fff;background:${color};transform:translateY(50%);transition:transform .15s`;
  el.textContent = named ? (p.name.length > 12 ? `${p.name.slice(0, 12)}…` : p.name) : '';
}

function pin(p: MapPlace, named: boolean): HTMLElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.setAttribute('aria-label', p.name);
  paint(el, p, false, named);
  return el;
}

export function PlaceMap({ places }: { places: MapPlace[] }) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KMap | null>(null);
  const kakaoRef = useRef<Kakao | null>(null);
  const overlays = useRef<Map<string, { o: KOverlay; el: HTMLElement; p: MapPlace }>>(new Map());
  const lastPaint = useRef<{ pick: string | null; named: boolean } | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(!KEY);
  const [pick, setPick] = useState<string | null>(null);
  /* 이름표를 붙일 만큼 확대했나(NAME_LEVEL) */
  const [named, setNamed] = useState(false);
  const listRef = useRef<HTMLUListElement>(null);
  const router = useRouter();
  const located = useMemo(() => places.filter((p) => p.lat != null && p.lng != null), [places]);

  /* 지도 만들기 — 한 번 */
  useEffect(() => {
    if (!KEY) return;
    let alive = true;
    loadKakao()
      .then((k) => {
        if (!alive || !box.current) return;
        kakaoRef.current = k;
        const m = new k.maps.Map(box.current, { center: new k.maps.LatLng(SEOUL.lat, SEOUL.lng), level: 8 });
        m.addControl?.(new k.maps.ZoomControl(), k.maps.ControlPosition.RIGHT);
        k.maps.event.addListener(m, 'zoom_changed', () => setNamed(m.getLevel() <= NAME_LEVEL));
        mapRef.current = m;
        setReady(true);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  /* 점 그리기 — 목록이 바뀔 때마다 다시, 다 보이게 */
  useEffect(() => {
    const k = kakaoRef.current;
    const m = mapRef.current;
    if (!ready || !k || !m) return;
    overlays.current.forEach(({ o }) => o.setMap(null));
    overlays.current.clear();
    lastPaint.current = null;
    const bounds = new k.maps.LatLngBounds();
    for (const p of located) {
      const pos = new k.maps.LatLng(p.lat!, p.lng!);
      const el = pin(p, m.getLevel() <= NAME_LEVEL);
      el.addEventListener('click', () => setPick(p.id));
      const o = new k.maps.CustomOverlay({ position: pos, content: el, yAnchor: 1, clickable: true, zIndex: 1 });
      o.setMap(m);
      overlays.current.set(p.id, { o, el, p });
      bounds.extend(pos);
    }
    if (located.length === 1) {
      m.panTo(new k.maps.LatLng(located[0].lat!, located[0].lng!));
      m.setLevel(4);
    } else if (located.length > 1) m.setBounds(bounds, 40, 40, 40, 40);
    setNamed(m.getLevel() <= NAME_LEVEL);
  }, [ready, located]);

  /* 확대 경계를 넘으면 전체를, 선택만 바뀌면 이전 · 현재 점만 다시 칠한다. */
  useEffect(() => {
    const paintOne = ({ o, el, p }: { o: KOverlay; el: HTMLElement; p: MapPlace }) => {
      const on = p.id === pick;
      paint(el, p, on, named || on);
      o.setZIndex(on ? 10 : 1);
    };
    const previous = lastPaint.current;
    if (!previous || previous.named !== named) {
      overlays.current.forEach(paintOne);
    } else if (previous.pick !== pick) {
      if (previous.pick) {
        const old = overlays.current.get(previous.pick);
        if (old) paintOne(old);
      }
      if (pick) {
        const current = overlays.current.get(pick);
        if (current) paintOne(current);
      }
    }
    lastPaint.current = { pick, named };
  }, [pick, named, located, ready]);

  /* 고른 곳 — 지도 옮김 · 목록에서 보이게 */
  useEffect(() => {
    const hit = pick ? overlays.current.get(pick) : null;
    const k = kakaoRef.current;
    if (hit && k && mapRef.current) mapRef.current.panTo(new k.maps.LatLng(hit.p.lat!, hit.p.lng!));
    if (pick) listRef.current?.querySelector(`[data-place="${pick}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [pick]);

  const picked = places.find((p) => p.id === pick) ?? null;

  return (
    <div className="grid gap-4 md:h-[calc(var(--vvh,100dvh)-14.5rem)] md:min-h-[440px] md:grid-cols-[340px_minmax(0,1fr)] md:gap-5">
      {/*
        목록 340 + 간격 20 + 지도 나머지(2026-10-26 v2 연습장). 높이 = 화면 − (위 막대 · 머리 · 종류 줄 · 밑 여유 24) 쯤, 짧은 화면은 440 밑으로 안 줄고
        문서가 굴러간다(넘친 것을 자르지 않는다)
      */}
      {/* 지도 — 휴대폰은 위, PC 는 오른쪽 */}
      <div className="relative order-1 h-[52vh] min-h-72 overflow-hidden rounded-2xl border border-line bg-surface-2 md:order-2 md:h-full">
        <div ref={box} className="h-full w-full" />
        {failed && (
          <div className="absolute inset-0 grid place-items-center p-6 text-center">
            <div className="space-y-1">
              <p className="text-sm font-semibold text-ink">지도를 불러오지 못했어요</p>
              <p className="text-xs text-muted">목록에서 골라 주세요.</p>
            </div>
          </div>
        )}
        {ready && located.length === 0 && (
          <p className="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-surface/95 px-3 py-1.5 text-xs text-muted shadow">
            지도에 표시할 곳이 아직 없어요
          </p>
        )}
        {/* 고른 곳 카드 — 네이버 지도처럼 지도 아래쪽에 */}
        {picked && (
          <div className="absolute inset-x-3 bottom-3 z-10 rounded-2xl bg-surface p-3 shadow-lg md:right-auto md:w-80">
            <button type="button" onClick={() => setPick(null)} aria-label="닫기" className="absolute top-2 right-2 grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-ink/5">
              ×
            </button>
            <PlaceSummary p={picked} />
            <div className="mt-3 flex gap-2">
              <Link href={picked.href} className="flex min-h-10 flex-1 items-center justify-center rounded-xl border border-line text-sm font-semibold text-ink hover:border-ink/30">
                자세히
              </Link>
              {picked.bookHref && (
                <Link href={picked.bookHref} className="flex min-h-10 flex-1 items-center justify-center rounded-xl bg-sky text-sm font-bold text-white hover:bg-sky-strong">
                  {picked.type === 'venue' ? '대관 예약' : '레슨 예약'}
                </Link>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 목록 */}
      <ul ref={listRef} className="order-2 divide-y divide-line overflow-y-auto rounded-2xl border border-line bg-surface md:order-1">
        {places.length === 0 && <li className="p-6 text-center text-sm text-muted">찾는 곳이 없어요</li>}
        {places.map((p) => (
          <li key={`${p.type}-${p.id}`} data-place={p.id}>
            <button
              type="button"
              /* 좌표가 없는 곳은 지도에 점이 없어 바로 자세히로 */
              onClick={() => (p.lat != null ? setPick(p.id) : router.push(p.href))}
              className={`flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-ink/3 ${pick === p.id ? 'bg-ink/5' : ''}`}
            >
              {p.image ? (
                // eslint-disable-next-line @next/next/no-img-element -- 저장소 서명 주소
                <img src={p.image} alt="" className="h-14 w-14 shrink-0 rounded-xl bg-surface-2 object-cover" loading="lazy" />
              ) : (
                <span aria-hidden className={`grid h-14 w-14 shrink-0 place-items-center rounded-xl text-lg font-black ${coachTone(p.name)}`}>
                  {p.name.slice(0, 1)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <PlaceSummary p={p} />
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlaceSummary({ p }: { p: MapPlace }) {
  return (
    <div className="min-w-0 space-y-0.5 pr-6">
      <p className="truncate text-[15px] font-semibold text-ink">{p.name}</p>
      <p className="truncate text-[13px] text-muted">
        {p.kindLabel}
        {p.region || p.address ? ` · ${p.region ?? p.address}` : ''}
      </p>
      <p className="flex items-center gap-1.5 truncate text-[13px] text-ink">
        {p.rating != null && (
          <span className="shrink-0">
            <span className="text-warn">★</span> {p.rating}
          </span>
        )}
        <span className="truncate">{p.sub}</span>
      </p>
    </div>
  );
}
