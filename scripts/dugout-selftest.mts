/**
 * 덕아웃 셀프테스트(2026-10-20) — 장터 규격표 · 값 검사(lib/market/specs.ts) · 바깥 공간이 로그인 없이 보이고 쓰기는 막히는지(소스 읽기).
 *
 *   npm run dugout:test
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import {
  CATEGORIES,
  REGIONS,
  filterHref,
  formatPrice,
  parsePrice,
  parseSpecs,
  prefillSpecs,
  readFilter,
  specLines,
  specSummary,
} from '@/lib/market/specs';
import {
  averageRating,
  canConfirm,
  canReview,
  parseSlot,
  slotParts,
} from '@/lib/market/lessons';
import {
  parseHours,
  readHours,
  slotValid,
  slotsOf,
  timeToMin,
  upcomingDays,
  weekdayOf,
} from '@/lib/market/venues';
import { recommend } from '@/lib/market/gear';
import { ESCROW_FEE_RATE, escrowFee, payout, platformFee } from '@/lib/market/pay';

let pass = 0;
const fails: string[] = [];
function check(name: string, ok: boolean, detail = '') {
  if (ok) pass++;
  else fails.push(`${name}${detail ? ` — ${detail}` : ''}`);
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${!ok && detail ? `  (${detail})` : ''}`);
}
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const src = (p: string) => readFileSync(join(ROOT, p), 'utf8');
function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

console.log('[1] 규격표 — 품목마다 칸이 다르고, 꼭 적을 칸이 비면 막는다');
{
  check(
    '품목 아홉, 글러브 · 배트가 앞',
    CATEGORIES.length === 9 &&
      CATEGORIES[0].key === 'glove' &&
      CATEGORIES[1].key === 'bat'
  );
  const ok = parseSpecs(
    'glove',
    (n) => ({ 'spec-position': 'pitcher', 'spec-hand': 'R', 'spec-inch': '11.75' })[n]
  );
  check(
    '글러브 규격이 읽힌다',
    'specs' in ok && ok.specs.inch === 11.75 && ok.specs.hand === 'R'
  );
  const miss = parseSpecs('glove', (n) => ({ 'spec-position': 'pitcher' })[n]);
  check('던지는 손이 비면 막힌다', 'error' in miss && miss.error.includes('던지는 손'));
  const range = parseSpecs(
    'bat',
    (n) => ({ 'spec-lengthInch': '50', 'spec-material': 'wood' })[n]
  );
  check('배트 길이 범위 밖은 막힌다', 'error' in range);
  const unknown = parseSpecs('bag', (n) => ({ 'spec-foo': 'x' })[n]);
  check(
    '칸 없는 품목은 빈 규격',
    'specs' in unknown && Object.keys(unknown.specs).length === 0
  );
  check('모르는 품목은 막힌다', 'error' in parseSpecs('shoes', () => ''));
  check(
    '사람 말로',
    specSummary('glove', { position: 'pitcher', hand: 'R', inch: 11.75 }) ===
      '투수 · 우투(왼손에 낌) · 11.75인치'
  );
  check(
    '깨진 규격은 빈 줄',
    specLines('glove', 'oops').length === 0 && specLines('glove', null).length === 0
  );
  check(
    '내 프로필로 미리 채움 — 좌투',
    prefillSpecs('glove', { throwingHand: '좌투' }).hand === 'L' &&
      prefillSpecs('bat', { throwingHand: '좌투' }).hand === undefined
  );
}

console.log('\n[2] 가격 · 거르기 주소');
{
  check(
    '가격 글 → 원',
    parsePrice('80,000') === 80000 &&
      parsePrice('12000원') === 12000 &&
      parsePrice('0') === 0
  );
  check(
    '너무 큰 값 · 글자만은 null',
    parsePrice('99999999999') === null &&
      parsePrice('abc') === 0 &&
      parsePrice('') === null
  );
  check('0 은 나눔', formatPrice(0) === '나눔' && formatPrice(80000) === '80,000원');
  const f = readFilter(
    (k) =>
      ({ category: 'glove', sort: 'cheap', page: '2', region: '서울', q: ' 글러브 ' })[
        k
      ]
  );
  check(
    '주소 → 거르기',
    f.category === 'glove' &&
      f.sort === 'cheap' &&
      f.page === 2 &&
      f.region === '서울' &&
      f.q === '글러브'
  );
  const bad = readFilter(
    (k) => ({ category: 'nope', sort: 'x', page: '-1', region: '화성' })[k]
  );
  check(
    '틀린 값은 무시',
    bad.category === undefined &&
      bad.sort === 'new' &&
      bad.page === 1 &&
      bad.region === undefined
  );
  check(
    '거르기 → 주소',
    filterHref({ category: 'bat', sort: 'cheap', page: 2 }) ===
      '/dugout/market?category=bat&sort=cheap&page=2' &&
      filterHref({ sort: 'new', page: 1 }) === '/dugout/market'
  );
  check(
    '지역 — 전국(택배)이 첫째',
    REGIONS[0] === '전국(택배)' && REGIONS.length === 18
  );
}

console.log(
  '\n[3] 바깥 공간 — 로그인 없이 보이고, 쓰기 · 채팅 · 찜은 막힌다(소스 읽기)'
);
{
  const layout = src('app/(dugout)/layout.tsx');
  check(
    '(dugout) 틀은 requireUser 를 안 부른다(로그인 없이 본다)',
    !/requireUser\(/.test(layout) && /getCurrentUser\(/.test(layout)
  );
  const pages = walk(join(ROOT, 'app', '(dugout)')).filter((p) => /page\.tsx$/.test(p));
  check(`(dugout) 화면이 있다(${pages.length}개)`, pages.length >= 7);
  const open = pages.filter((p) => /requireUser\(/.test(readFileSync(p, 'utf8')));
  check(
    '덕아웃 화면은 requireUser 가 아니라 getCurrentUser + redirect(로그인 안 하면 /login?next=)',
    open.length === 0,
    open.join(', ')
  );
  const writers = ['market/new', 'market/[id]/edit', 'chat', 'me'].map((d) =>
    pages.find((p) => p.replace(/\\/g, '/').includes(`/dugout/${d}/page.tsx`))
  );
  check(
    '쓰기 · 채팅 · 내 것 화면은 로그인 없으면 /login 으로',
    writers.every(
      (p) =>
        p &&
        /redirect\(`\/login\?next=|redirect\('\/login\?next=/.test(
          readFileSync(p, 'utf8')
        )
    )
  );
  const FN = /^export async function (\w+)/gm;
  for (const f of ['market', 'chat']) {
    const text = src(`app/actions/${f}.ts`);
    const heads = [...text.matchAll(FN)];
    const bare = heads
      .map((m, i) => ({
        name: m[1],
        body: text.slice(m.index, heads[i + 1]?.index ?? text.length),
      }))
      .filter((x) => !/requireUser\(/.test(x.body))
      .map((x) => x.name);
    check(
      `app/actions/${f}.ts 의 동작 ${heads.length}개가 모두 requireUser 를 거친다`,
      heads.length >= 2 && bare.length === 0,
      bare.join(', ')
    );
  }
  const market = src('app/actions/market.ts');
  check('사진 경로는 내 폴더 안인지 본다(isOwnedBy)', /isOwnedBy\(/.test(market));
  check('가리기는 관리자만', /user\.role !== 'ADMIN'\) return;/.test(market));
  const root = src('app/page.tsx');
  check(
    '첫 화면: 로그인 안 하면 /dugout, 하면 /today',
    /redirect\(user \? '\/today' : '\/dugout'\)/.test(root)
  );
  const proxy = src('proxy.ts');
  check('휴대폰 브라우저도 덕아웃은 본다(proxy OPEN)', /dugout/.test(proxy));
  const registry = src('app/api/rpc/registry.ts');
  check(
    'rpc 허용 목록에 market · chat',
    /'@\/app\/actions\/market'/.test(registry) &&
      /'@\/app\/actions\/chat'/.test(registry)
  );
  const upload = src('app/api/market/upload-url/route.ts');
  check(
    '사진 올리기 주소는 로그인 · 종류 · 크기를 본다',
    /getCurrentUser\(/.test(upload) &&
      /IMAGE_TYPES/.test(upload) &&
      /MAX_IMAGE_BYTES/.test(upload)
  );
}

console.log('\n[4] 레슨 예약 · 장소 예약 · 장비 고르기 — 순수 규칙');
{
  const now = new Date('2026-10-21T03:00:00Z');
  check(
    '희망 시간 — 2시간 뒤부터 60일 안(한국 시각)',
    parseSlot('2026-10-21T15:00', now) != null &&
      parseSlot('2026-10-21T13:30', now) == null &&
      parseSlot('2027-01-01T10:00', now) == null &&
      parseSlot('nope', now) == null
  );
  const sp = slotParts(new Date('2026-10-21T10:30:00+09:00'));
  check(
    '시간표 칸 — 한국 날짜 · 시각',
    sp.dateKey === '2026-10-21' && sp.time === '10:30'
  );
  check(
    '확정은 요청 상태 · 안 지난 때만',
    canConfirm(
      { status: 'REQUESTED', slot1: new Date('2026-10-22T10:00:00Z'), slot2: null },
      1,
      now
    ) &&
      !canConfirm(
        { status: 'REQUESTED', slot1: new Date('2026-10-22T10:00:00Z'), slot2: null },
        2,
        now
      ) &&
      !canConfirm(
        { status: 'CONFIRMED', slot1: new Date('2026-10-22T10:00:00Z'), slot2: null },
        1,
        now
      )
  );
  check(
    '후기는 끝난 예약에 한 번',
    canReview({ status: 'DONE', hasReview: false }) &&
      !canReview({ status: 'DONE', hasReview: true }) &&
      !canReview({ status: 'CONFIRMED', hasReview: false })
  );
  check('평균 별점', averageRating([5, 4, 4]) === 4.3 && averageRating([]) === null);

  const hours = readHours(
    (n) =>
      ({ 'hours-1-open': '10:00', 'hours-1-close': '22:00', 'hours-0-closed': 'on' })[n]
  );
  check(
    '영업시간 읽기 — 월만 열고 나머지 쉼',
    'hours' in hours &&
      hours.hours[1]?.open === '10:00' &&
      hours.hours[0] === null &&
      hours.hours[2] === null
  );
  check(
    '닫는 시각이 앞이면 막힘',
    'error' in
      readHours((n) => ({ 'hours-1-open': '22:00', 'hours-1-close': '10:00' })[n])
  );
  check('다 쉬면 막힘', 'error' in readHours(() => ''));
  const h = parseHours({ 1: { open: '10:00', close: '13:00' } });
  const slots = slotsOf(h, 1, 60, [{ startMin: 660, endMin: 720 }], 630);
  check(
    '칸 — 10 · 11 · 12시, 11시는 잡힘, 10시는 지남',
    slots.length === 3 &&
      slots[1].taken &&
      slots[0].past &&
      !slots[2].taken &&
      !slots[2].past
  );
  check(
    '요청 칸 검사 — 경계 · 길이 · 영업시간',
    slotValid(h, 1, 60, 600, 660) &&
      !slotValid(h, 1, 60, 630, 690) &&
      !slotValid(h, 1, 60, 780, 840) &&
      !slotValid(h, 2, 60, 600, 660)
  );
  check(
    '시각 ↔ 분',
    timeToMin('09:30') === 570 &&
      timeToMin('24:00') === 1440 &&
      timeToMin('9:30') === null
  );
  check(
    '앞으로 14일 · 요일',
    upcomingDays('2026-10-21').length === 14 &&
      upcomingDays('2026-10-21')[1] === '2026-10-22' &&
      weekdayOf('2026-10-21') === 3
  );
  check(
    '수수료 — 안전결제는 100원 올림, 플랫폼은 100원 내림, 몫 = 금액 − 수수료',
    escrowFee(80000) === Math.ceil((80000 * ESCROW_FEE_RATE) / 100) * 100 &&
      platformFee(55500, 0.1) === 5500 &&
      payout(55500, 0.1) === 50000
  );
  const picks = recommend('u13', 'pitcher', 'L');
  check(
    '장비 추천 다섯 — 글러브가 포지션 · 손을 품는다',
    picks.length === 5 &&
      picks[0].spec.includes('투수용') &&
      picks[0].spec.includes('좌투')
  );
}

console.log(
  `\n${pass} 통과${fails.length ? `, ${fails.length} 실패:\n  - ${fails.join('\n  - ')}` : ''}`
);
if (fails.length) process.exit(1);
