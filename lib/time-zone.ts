/**
 * 날짜를 세는 시간대 — 기기 기준(2026-10-28 김민 Q10: "시간대 · 날짜 넘어감은 모두 기기 기준", 설계 docs/designs/overseas-sinker-dugout.md 6절).
 *
 * 화면(브라우저 · 앱)은 그 기기의 시간대. 서버는 요청이 알려 준 기기 시간대 — 앱 요청은 머리글 x-bp-tz(native/src/lib/rpc.ts),
 * 웹 화면은 쿠키 bp-tz(뿌리 레이아웃의 첫 스크립트가 기기 시간대로 맞춘다). 서버의 읽기는 lib/clock-server.ts 가 단다(__bpZone).
 * 아무것도 모르면(옛 앱 · 스크립트 · 서버 혼자 도는 일) 한국 — 예전과 같다. 한국 기기는 숫자가 하나도 안 바뀐다.
 *
 * 이미 남긴 기록은 날짜 키(YYYY-MM-DD)로 저장돼 시간대와 상관없이 그대로다 — 바뀌는 것은 '오늘이 며칠인가'와 하루가 넘어가는 때뿐.
 */
export const DEFAULT_TIME_ZONE = 'Asia/Seoul';

const okZones = new Map<string, boolean>();
/** 쓸 수 있는 IANA 시간대 이름인가(예 'America/Chicago') — 밖에서 온 값(머리글 · 쿠키)을 거른다 */
export function isTimeZone(zone: unknown): zone is string {
  if (typeof zone !== 'string' || zone.length === 0 || zone.length > 64) return false;
  let ok = okZones.get(zone);
  if (ok === undefined) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: zone });
      ok = true;
    } catch {
      ok = false;
    }
    if (okZones.size < 500) okZones.set(zone, ok);
  }
  return ok;
}

/** 이 기기의 시간대(브라우저 · 앱) — 모르면 null */
export function deviceTimeZone(): string | null {
  try {
    const z = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isTimeZone(z) ? z : null;
  } catch {
    return null;
  }
}

const g = globalThis as { __bpZone?: () => string | null };

/** 지금 날짜를 셀 시간대 — 서버는 요청의 기기 시간대, 화면은 기기, 모르면 한국 */
export function serviceTimeZone(): string {
  if (typeof window === 'undefined') return g.__bpZone?.() ?? DEFAULT_TIME_ZONE;
  return deviceTimeZone() ?? DEFAULT_TIME_ZONE;
}

const formats = new Map<string, Intl.DateTimeFormat>();
/** 그 시간대(기본: 지금 셀 시간대)로 그리는 날짜 · 시각 형식 — 시간대마다 하나씩 만들어 둔다 */
export function zonedFormat(locale: string, opts: Intl.DateTimeFormatOptions, zone = serviceTimeZone()): Intl.DateTimeFormat {
  const key = `${zone}|${locale}|${JSON.stringify(opts)}`;
  let f = formats.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { ...opts, timeZone: zone });
    if (formats.size < 500) formats.set(key, f);
  }
  return f;
}

/**
 * 그 날짜 키(YYYY-MM-DD)의 정오 — 지금 셀 시간대의 벽시계 12시. 하루치 셈(부하 · 루틴)에 '그날'을 넘길 때 —
 * 한국 정오(+09:00)를 그대로 쓰면 미국에서는 전날 밤이라 하루가 밀렸다(2026-10-28).
 */
export function zonedNoon(key: string, zone = serviceTimeZone()): Date {
  const guess = new Date(`${key}T12:00:00Z`);
  const p = zonedFormat('en-US', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, zone).formatToParts(guess);
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value);
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'));
  return new Date(guess.getTime() - (wall - guess.getTime()));
}

/**
 * 뿌리 레이아웃의 첫 스크립트 — 기기 시간대를 쿠키 bp-tz 로 서버에 알린다. 쿠키가 기기와 다르면(처음 · 시간대가 바뀜) 맞추고 한 번 새로 받는다
 * (서버가 방금 그린 화면은 옛 시간대의 '오늘'이라). 쿠키가 없고 기기가 한국이면 서버 기본과 같아 새로 받지 않는다 — 한국 사용자는 아무 일도 없다.
 * 쿠키를 못 쓰는 곳에서 끝없이 새로 받지 않게 세션마다 한 번만.
 */
export const TIME_ZONE_INIT_SCRIPT = `(function(){try{var z=Intl.DateTimeFormat().resolvedOptions().timeZone;if(!z)return;var m=document.cookie.match(/(?:^|; )bp-tz=([^;]*)/);var c=m?decodeURIComponent(m[1]):${JSON.stringify(DEFAULT_TIME_ZONE)};document.cookie='bp-tz='+encodeURIComponent(z)+'; path=/; max-age=31536000; samesite=lax';if(c===z)return;if(sessionStorage.getItem('bp-tz-reloaded'))return;sessionStorage.setItem('bp-tz-reloaded','1');location.reload();}catch(e){}})();`;
