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
  matchCoach,
  medianHours,
  nextOpenLabel,
  openInBand,
  reviewSummary,
  readPrefs,
  weekdaysOfWhen,
  listHref,
} from '@/lib/market/lessons';
import { makeDummyCoach } from '@/lib/market/lesson-dummy';
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
import { existsSync } from 'node:fs';
import { inSinkerDugout } from '@/lib/sinker-dugout';
import { activitySummary, benchDate, feedCardOf, feedLabel, pickAnswer, seatsLeft, venueBookingText, venuePriceText, type ListPost } from '@/lib/sinker-dugout-feed';
import { surfaceOf } from '@/lib/app-env';
import { BRAND, brandOfPath, usesSinker } from '@/lib/brand';
import {
  formatExercise,
  lessonLoadOf,
  parseExercises,
  readExercises,
} from '@/lib/org/lesson-work';
import { readPublicKeys } from '@/lib/public-profile';
import { appsFor, isExpoToken } from '@/lib/notify-rules';
import { COLLECTED_KEYS, type ExistingCandidate, canApprove, planImport, readCombinedFile, readCoords, reviewFlags } from '@/lib/market/candidates';
import {
  ACCESS_NOTICE,
  FIELD_OPERATION_NOTICE,
  FIELD_TYPE_HINT,
  IDENTITY_NOTICE,
  MOBILE_MASK,
  kakaoIdsOf,
  maskMobiles,
  pickAddress,
  pickKakaoPlace,
  readFieldReviewFile,
} from '@/lib/market/field-candidates';
import {
  formatTicketCode,
  isTicketCode,
  makeTicketCode,
  normalizeTicketCode,
  ticketStateOf,
} from '@/lib/login-ticket';

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
      '/market/browse?category=bat&sort=cheap&page=2' &&
      filterHref({ sort: 'new', page: 1 }) === '/market/browse'
  );
  {
    /* 장터 입구 · 결과 갈림(2026-10-26) — 입구(/market)는 거르기 판 없이 둘러보기, 옛 걸러 둔 링크는 결과 화면으로 그 뜻 그대로 */
    const landing = src('app/(dugout)/market/page.tsx');
    const browse = src('app/(dugout)/market/browse/page.tsx');
    check(
      '장터 입구: 옛 /market?… 링크는 같은 값으로 /market/browse 로 넘긴다',
      /LISTING_FILTER_KEYS\.some/.test(landing) && /redirect\(`\$\{MARKET_BROWSE\}\?/.test(landing)
    );
    check('장터 입구에는 거르기 판이 없고 결과 화면에만 있다', !/MarketFilterRail/.test(landing) && /<MarketFilterRail/.test(browse));
    check('상세 → 뒤로는 고르던 목록으로(목록 두 곳이 열어 둔 물건을 적는다)', /<MarketListMemory/.test(landing) && /<MarketListMemory/.test(browse) && /MarketBackLink/.test(src('app/(dugout)/market/[id]/page.tsx')));
  }
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
    pages.find((p) => p.replace(/\\/g, '/').includes(`/${d}/page.tsx`))
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
      /* 종의 읽기 둘(loadBell · countBell, 2026-10-22)은 getCurrentUser — 로그인 전이면 빈 목록 · 0 을 돌려 종이 그냥 비어 보인다 */
      .filter((x) => !/requireUser\(|getCurrentUser\(/.test(x.body))
      .map((x) => x.name);
    check(
      `app/actions/${f}.ts 의 동작 ${heads.length}개가 모두 로그인 사용자 기준이다`,
      heads.length >= 2 && bare.length === 0,
      bare.join(', ')
    );
  }
  const market = src('app/actions/market.ts');
  check('사진 경로는 내 폴더 안인지 본다(isOwnedBy)', /isOwnedBy\(/.test(market));
  check('가리기는 관리자만', /user\.role !== 'ADMIN'\) return;/.test(market));
  const root = src('app/(dugout)/page.tsx');
  check(
    '첫 화면(/)은 덕아웃 홈 — 앱 안이면 /today 또는 /login',
    /isNativeUserAgent\(/.test(root) &&
      /redirect\(user \? '\/today' : '\/login'\)/.test(root)
  );
  const proxy = src('proxy.ts');
  check(
    '휴대폰 브라우저도 덕아웃은 본다(proxy OPEN — 뿌리 주소)',
    /market\|chat\|lessons/.test(proxy) && proxy.includes(String.raw`|^\/$/`)
  );
  check(
    '덕아웃 앱(DugoutApp)은 /login(가입 폼) · /manage(관리, 2026-10-26)까지 열고, 덕아웃 틀이 덕아웃 앱을 앱으로 본다(웹 아래 탭 숨김)',
    proxy.includes(String.raw`DUGOUT_APP_OPEN = /^\/(login|manage)(\/|$)/`) &&
      proxy.includes(`surfaceOf(ua) === 'dugout-app'`) &&
      src('app/(dugout)/layout.tsx').includes(`!== 'web'`) &&
      src('components/app-shell/expo-tabs.tsx').includes('inDugoutApp()')
  );
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
  check(
    '얼굴 판별 — 싱커 앱(BullpenLogApp) · 덕아웃 앱(DugoutApp/) · 브라우저',
    surfaceOf('Mozilla/5.0 BullpenLogApp/2.0 BullpenNative/10') === 'sinker-app' &&
      surfaceOf('Mozilla/5.0 DugoutApp/1') === 'dugout-app' &&
      surfaceOf('Mozilla/5.0 (iPhone)') === 'web' &&
      surfaceOf(null) === 'web'
  );
  check(
    '싱커 앱 안 덕아웃 — 커뮤니티 흐름(내 활동 포함)은 열고 장터 · 결제 · 검색은 막는다(lib/sinker-dugout.ts)',
    ['/', '/me', '/me/community', '/me/community/x', '/community', '/community/abc', '/community/new', '/lessons/list', '/venues/v1', '/chat/r1', '/notifications', '/u/kim', '/pay/lesson/a', '/pay/venue/b'].every((p) => inSinkerDugout(p)) &&
      !['/me/payments', '/me/communityx', '/market', '/market/new', '/pay/listing/a', '/search', '/baseball', '/gear', '/sinker'].some((p) => inSinkerDugout(p))
  );
  check(
    '미국 · 일본 싱커의 덕아웃은 커뮤니티만 — 레슨 · 연습장 · 채팅 · 결제 · 예약(/me)은 막는다(lib/sinker-dugout.ts, 2026-10-28)',
    (['us', 'jp'] as const).every(
      (c) =>
        ['/', '/me/community', '/community', '/community/abc', '/notifications', '/u/kim', '/link/x'].every((p) => inSinkerDugout(p, c)) &&
        !['/me', '/lessons/list', '/venues/v1', '/chat/r1', '/pay/lesson/a', '/pay/venue/b'].some((p) => inSinkerDugout(p, c))
    )
  );
  check(
    '싱커 앱 안 덕아웃 겉모양 — 틀이 서버가 가린 얼굴을 data-surface 로 달고, 초록 덮어쓰기 · 채움 아이콘은 싱커 앱 밖에서만',
    /data-surface=\{surface\}/.test(src('components/dugout/dugout-shell.tsx')) &&
      /surface=\{surface\}/.test(src('app/(dugout)/layout.tsx')) &&
      /:not\(\[data-surface='sinker-app'\][^)]*\)/.test(src('app/globals.css'))
  );
  check(
    '이름 — 덕아웃 주소는 덕아웃, 선수 화면은 싱커',
    BRAND.sinker.name === '싱커' &&
      BRAND.dugout.name === '덕아웃' &&
      brandOfPath('/market') === 'dugout' &&
      brandOfPath('/manage/players') === 'dugout' &&
      brandOfPath('/') === 'dugout' &&
      brandOfPath('/today') === 'sinker' &&
      brandOfPath('/videos/abc') === 'sinker'
  );
  check(
    '주소 이동(2단계) — 옛 /dugout · /master 는 코드에 안 남고, 덕아웃 홈이 / 다',
    !/['"`]\/dugout/.test(src('components/dugout/dugout-shell.tsx')) &&
      !/['"`]\/master(\/|['"`])/.test(src('components/master/master-shell.tsx')) &&
      existsSync(join(ROOT, 'app/(dugout)/page.tsx')) &&
      existsSync(join(ROOT, 'app/(master)/manage/page.tsx')) &&
      !existsSync(join(ROOT, 'app/page.tsx'))
  );
  {
    const ex = parseExercises('스쿼트 3x10 60kg\n- 런지 12회\n밴드 외회전\n\n');
    check(
      '레슨 한 일 — 세트×횟수 · 횟수만 · 이름만',
      ex.length === 3 &&
        ex[0].name === '스쿼트' &&
        ex[0].sets === 3 &&
        ex[0].reps === 10 &&
        ex[0].note === '60kg' &&
        ex[1].name === '런지' &&
        ex[1].sets === null &&
        ex[1].reps === 12 &&
        ex[2].name === '밴드 외회전' &&
        ex[2].reps === null &&
        formatExercise(ex[0]) === '스쿼트 3×10 60kg' &&
        readExercises(JSON.parse(JSON.stringify(ex))).length === 3 &&
        lessonLoadOf(ex, 40).sets === 5 &&
        lessonLoadOf(ex, null).pitches === 0
    );
  }
  check(
    '싱커를 쓰는 사람 — 선수는 늘, 회원은 첫 레슨 뒤, 팀 · 레슨장은 아님',
    usesSinker({ accountType: 'PLAYER', sinkerStartedAt: null }) &&
      !usesSinker({ accountType: 'MEMBER', sinkerStartedAt: null }) &&
      usesSinker({ accountType: 'MEMBER', sinkerStartedAt: new Date() }) &&
      !usesSinker({ accountType: 'MASTER', sinkerStartedAt: new Date() })
  );
  check(
    '공개 범위 — 모르는 키는 버리고 중복은 하나',
    readPublicKeys(['velocity', 'x', 'velocity', 'days']).join() === 'velocity,days'
  );
  check(
    '마이그레이션 3단계는 더하기만(ADD COLUMN · ADD VALUE · UPDATE)',
    !/DROP|ALTER COLUMN|DELETE/.test(
      src('prisma/migrations/20261021120000_sinker_dugout_account/migration.sql')
    )
  );
  for (const f of ['sinker-log', 'sharing', 'profile-public']) {
    const body = src(`app/actions/${f}.ts`);
    const heads = [...body.matchAll(/export async function (\w+)\(([\s\S]*?)\n\}/g)];
    const bare = heads.filter((x) => !/requireUser\(/.test(x[0])).map((x) => x[1]);
    check(
      `app/actions/${f}.ts 의 동작이 모두 requireUser 를 거친다`,
      heads.length >= 1 && bare.length === 0,
      bare.join(', ')
    );
  }
  check(
    '기록 표 CSV 는 로그인한 사람의 것만',
    /getCurrentUser\(/.test(src('app/api/sinker/log.csv/route.ts')) &&
      /userId: user\.id/.test(src('app/api/sinker/log.csv/route.ts'))
  );
  check(
    '내 싱커 화면 셋',
    ['page', 'log/page', 'sharing/page'].every((p) =>
      existsSync(join(ROOT, `app/(app)/sinker/${p}.tsx`))
    )
  );
  check(
    '알림 보낼 곳 — 채팅은 덕아웃 앱 먼저, 없으면 싱커 · 레슨 기록은 싱커 먼저 · 앱이 없으면 아무 데도',
    appsFor('chat', ['sinker', 'dugout']).join() === 'dugout' &&
      appsFor('chat', ['sinker']).join() === 'sinker' &&
      appsFor('lesson', ['sinker', 'dugout']).join() === 'sinker' &&
      appsFor('lesson', ['dugout']).join() === 'dugout' &&
      appsFor('chat', []).length === 0 &&
      /* 2026-10-27 — 두 앱을 다 가진 선수: 선수 활동은 싱커, 장터 · 거래 채팅은 덕아웃 앱. 선수가 아니면 예전처럼 */
      appsFor('community', ['sinker', 'dugout'], { player: true }).join() === 'sinker' &&
      appsFor('booking', ['sinker', 'dugout'], { player: true }).join() === 'sinker' &&
      appsFor('venue', ['sinker', 'dugout'], { player: true }).join() === 'sinker' &&
      appsFor('chat', ['sinker', 'dugout'], { player: true }).join() === 'dugout' &&
      appsFor('listing', ['sinker', 'dugout'], { player: true }).join() === 'dugout' &&
      appsFor('community', ['sinker', 'dugout'], { player: false }).join() === 'dugout' &&
      appsFor('community', ['dugout'], { player: true }).join() === 'dugout' &&
      appsFor('chat', ['sinker'], { player: true }).join() === 'sinker'
  );
  check(
    'Expo 토큰 모양',
    isExpoToken('ExponentPushToken[abc-123]') &&
      isExpoToken('ExpoPushToken[xyz]') &&
      !isExpoToken('abc')
  );
  for (const f of ['push', 'notifications']) {
    const body = src(`app/actions/${f}.ts`);
    const heads = (body.match(/export async function /g) ?? []).length;
    /* 종의 읽기(loadBell · countBell, 2026-10-22)는 getCurrentUser — 로그인 전이면 빈 목록 · 0 */
    const guarded = (body.match(/await (requireUser|getCurrentUser)\(/g) ?? []).length;
    check(
      `app/actions/${f}.ts 의 동작 ${heads}개가 모두 로그인 사용자 기준이다`,
      heads >= 1 && guarded === heads
    );
  }
  check(
    '보내는 곳 — 채팅 · 레슨 예약 · 연습장 · 레슨 노트가 notify 를 부른다',
    ['chat', 'lessons', 'venues', 'org-notes'].every((f) =>
      /await notify\(/.test(src(`app/actions/${f}.ts`))
    )
  );
  check(
    '마이그레이션 5단계는 더하기만',
    !/DROP|ALTER COLUMN|DELETE/.test(
      src('prisma/migrations/20261021150000_notifications/migration.sql')
    )
  );
  {
    const code = makeTicketCode();
    const t0 = new Date('2026-10-21T10:00:00Z');
    check(
      '코드 로그인 — 8자 · 헷갈리는 글자 없음 · 하이픈 · 소문자 정리 · 상태 넷',
      isTicketCode(code) &&
        !/[01OI]/.test(code) &&
        isTicketCode(normalizeTicketCode(formatTicketCode(code).toLowerCase())) &&
        ticketStateOf(
          { userId: null, expiresAt: new Date(t0.getTime() + 1000), claimedAt: null },
          t0
        ) === 'waiting' &&
        ticketStateOf(
          { userId: 'u', expiresAt: new Date(t0.getTime() + 1000), claimedAt: null },
          t0
        ) === 'approved' &&
        ticketStateOf({ userId: 'u', expiresAt: t0, claimedAt: null }, t0) ===
          'expired' &&
        ticketStateOf(
          { userId: 'u', expiresAt: new Date(t0.getTime() + 1000), claimedAt: t0 },
          t0
        ) === 'used'
    );
  }
  check(
    '코드 로그인 — 승인은 requireUser, 받기는 claimedAt 을 먼저 찍는다(한 번만), 세션은 비밀번호 지문으로',
    /export async function approveLoginTicket[\s\S]*?await requireUser\(/.test(
      src('app/actions/login-ticket.ts')
    ) &&
      /claimedAt: null \}, data: \{ claimedAt: now \}/.test(
        src('app/actions/login-ticket.ts')
      ) &&
      /passwordFingerprint\(user\.password\)/.test(src('app/actions/login-ticket.ts'))
  );
  check(
    '검색 노출 — robots 가 선수 · 관리 · 채팅을 막고 sitemap 이 있다',
    /disallow:[\s\S]*'\/sinker'/.test(src('app/robots.ts')) &&
      existsSync(join(ROOT, 'app/sitemap.ts'))
  );
  /* 레슨 코치 찾기 3판(2026-10-22) — 추천 점수 · 까닭 · 시간대 · 후기 요약 · 더미 코치 */
  {
    const base = {
      specialties: ['pitching'],
      region: '서울 강남',
      rating: 4.8,
      reviews: 12,
      confirmHours: 3,
      sinkerReview: true,
      trialPrice: 30000,
      priceFrom: 50000,
      slots: { '1': { open: '18:00', close: '22:00' }, '6': { open: '09:00', close: '13:00' } },
    };
    const m = matchCoach(base, { specialty: 'pitching', prefs: ['rated', 'quick', 'sinker'], band: 'evening', weekday: 1 });
    check(
      '추천 점수 — 전문 · 후기 · 빠른 확정 · 싱커 · 저녁 가능이 까닭으로(셋까지)',
      m.score > 60 && m.reasons.length === 3 && m.reasons[0] === '투구 전문' && m.reasons.includes('후기 4.8'),
      m.reasons.join(',')
    );
    const weak = matchCoach(
      { ...base, rating: null, reviews: 0, confirmHours: null, sinkerReview: false, trialPrice: null, specialties: ['hitting'] },
      { specialty: 'pitching', prefs: ['rated'] }
    );
    check('추천 점수 — 조건에 안 맞는 새 코치는 낮고 까닭이 없다', weak.score < m.score && weak.reasons.length === 0);
    check(
      '시간대 겹침 — 월 저녁은 되고 월 오전은 안 되고, 쉬는 요일은 안 된다',
      openInBand(base.slots, 1, 'evening') && !openInBand(base.slots, 1, 'morning') && !openInBand(base.slots, 2, 'evening')
    );
    check(
      "'언제' → 요일 — 오늘(월)은 [1], 주말은 [6,0], 상관없으면 일곱",
      weekdaysOfWhen('today', 1).join() === '1' && weekdaysOfWhen('weekend', 1).join() === '6,0' && weekdaysOfWhen('any', 1).length === 7
    );
    check(
      '다음 가능 한 줄 — 월 17:00 이면 "오늘 18:00부터", 19:00 이면 "오늘 지금", 23:00 이면 토요일, 시간을 안 적으면 null',
      nextOpenLabel(base.slots, 1, 17 * 60) === '오늘 18:00부터' &&
        nextOpenLabel(base.slots, 1, 19 * 60) === '오늘 지금' &&
        nextOpenLabel(base.slots, 1, 23 * 60) === '토요일 09:00부터' &&
        nextOpenLabel(null, 1, 600) === null,
      `${nextOpenLabel(base.slots, 1, 17 * 60)} / ${nextOpenLabel(base.slots, 1, 23 * 60)}`
    );
    const t0 = new Date('2026-10-20T00:00:00Z');
    const h = (n: number) => new Date(t0.getTime() + n * 3_600_000);
    check(
      '확정 속도 가운데 값 — 2 · 10 · 40시간이면 10, 없으면 null',
      medianHours([
        { createdAt: t0, confirmedAt: h(2) },
        { createdAt: t0, confirmedAt: h(40) },
        { createdAt: t0, confirmedAt: h(10) },
        { createdAt: t0, confirmedAt: null },
      ]) === 10 && medianHours([]) === null
    );
    const sum = reviewSummary([
      { rating: 5, tags: ['kind', 'clear'] },
      { rating: 4, tags: ['kind'] },
      { rating: 5, tags: [] },
    ]);
    check(
      '후기 요약 — 별 분포(5점 2개 67%)와 좋았던 점 집계(친절 2 · 설명 1)',
      sum.dist[0].n === 2 && sum.dist[0].pct === 67 && sum.tags[0].key === 'kind' && sum.tags[0].n === 2 && sum.tags.length === 2
    );
    check('선호 조건 읽기 — 모르는 값은 버린다', readPrefs('rated,xx,quick').join() === 'rated,quick' && readPrefs(undefined).length === 0);
    check('목록 주소 — 빈 값은 빠진다', listHref({ specialty: 'pitching', region: undefined }) === '/lessons/list?specialty=pitching' && listHref({}) === '/lessons/list');
    const d1 = makeDummyCoach(7);
    const d2 = makeDummyCoach(7);
    const d3 = makeDummyCoach(8);
    check(
      '더미 코치 — 같은 씨앗이면 같고 다른 씨앗이면 다르며, 모양이 맞다(전문 1~3 · 가격 3~10만 · 시간 7요일 · 후기 0~8)',
      JSON.stringify(d1) === JSON.stringify(d2) &&
        JSON.stringify(d1) !== JSON.stringify(d3) &&
        d1.specialties.length >= 1 &&
        d1.specialties.length <= 3 &&
        d1.priceFrom >= 30000 &&
        d1.priceFrom <= 100000 &&
        Object.keys(d1.slots).length === 7 &&
        d1.reviews.length <= 8 &&
        d1.reviews.every((r) => r.rating >= 3 && r.rating <= 5 && r.tags.length <= 2)
    );
  }
  const picks = recommend('u13', 'pitcher', 'L');
  check(
    '장비 추천 다섯 — 글러브가 포지션 · 손을 품는다',
    picks.length === 5 &&
      picks[0].spec.includes('투수용') &&
      picks[0].spec.includes('좌투')
  );
}

console.log('\n[UI 통일] 덕아웃 화면이 같은 겉모양을 쓰는지(소스 읽기 — docs/designs/dugout-ui-audit.md)');
{
  const pages = walk(join(ROOT, 'app', '(dugout)')).filter((p) => /page\.tsx$/.test(p));
  const rel = (p: string) => p.replace(/\\/g, '/').split('/app/(dugout)/')[1];
  /* 공용 쪽 머리 — 바로 쓰거나, 머리를 품은 틀(레슨 · 결제)을 쓴다. 아래는 까닭이 있는 예외 */
  const EXCEPT: Record<string, string> = {
    'page.tsx': '홈 — 큰 로고 찾기 판이 머리',
    'gear/page.tsx': '장터 장비 추천 팝업으로 넘기기만',
    'chat/page.tsx': '채팅 — 머리는 두 칸 틀(chat-shell)에',
    'chat/[id]/page.tsx': '채팅 — 머리는 두 칸 틀(chat-shell)에',
    'market/[id]/page.tsx': '물건 상세 — 사진 옆 물건 이름이 머리(번개장터식)',
    'link/[code]/page.tsx': 'PC 로그인 승인 — 가운데 작은 카드',
    'lessons/find/page.tsx': '맞춤 찾기 흐름 — 한 화면 한 질문',
    '@modal/(.)manage/places/[id]/page.tsx': '수집 후보 팝업 — 머리는 창 제목(DayModal)',
  };
  const VIA: Record<string, string> = { 'community/page.tsx': 'app/(dugout)/community/community-page.tsx' };
  const missing = pages
    .map(rel)
    .filter((r) => !EXCEPT[r])
    .filter((r) => !/DugoutPageHeader|LessonFrame|PayShell/.test(src(VIA[r] ?? `app/(dugout)/${r}`)));
  check('덕아웃 화면은 공용 쪽 머리(DugoutPageHeader · 레슨 틀 · 결제 틀)를 쓴다', missing.length === 0, missing.join(', '));
  const ALLOWED_W = new Set(['xs', 'sm', 'xl', '2xl', '3xl', '4xl', '6xl']);
  const badW = pages.flatMap((p) =>
    [...readFileSync(p, 'utf8').matchAll(/max-w-([a-z0-9]+)/g)].filter((m) => !ALLOWED_W.has(m[1])).map((m) => `${rel(p)}:${m[0]}`)
  );
  check('덕아웃 화면 폭은 정한 것만(6xl 틀 · 폼 2xl · 읽기 3xl · 경기 상세 4xl · 작은 글 xs~xl)', badW.length === 0, badW.join(', '));
  const rawH = pages.filter((p) => /<h[12][^>]*text-\[\d+px\]/.test(readFileSync(p, 'utf8'))).map(rel);
  check('쪽 · 묶음 제목에 대괄호 글자 크기를 직접 쓰지 않는다(공용 머리 · SectionHead 로)', rawH.length === 0, rawH.join(', '));
  const greenPick = [
    ...walk(join(ROOT, 'app', '(dugout)')),
    ...walk(join(ROOT, 'components', 'dugout')),
  ]
    .filter((p) => /\.tsx$/.test(p))
    .filter((p) => !/chat-room\.tsx$|find-wizard\.tsx$/.test(p)) // 내 말풍선 · 지금 단계 표시는 상태라 초록
    .filter((p) => /\? ['"`](border-sky )?bg-sky text-white/.test(readFileSync(p, 'utf8')))
    .map((p) => p.replace(/\\/g, '/').split(`${ROOT.replace(/\\/g, '/')}/`)[1] ?? p);
  check('고른 칩 · 칸은 초록이 아니라 검은 칸(초록은 주요 단추 · 상태에만)', greenPick.length === 0, greenPick.join(', '));
  const ui = src('components/dugout/ui/index.ts');
  check(
    '공용 부품이 한 곳에 있다(쪽 머리 · 묶음 제목 · 칩 · 종류 줄 · 바로가기 · 빈 화면)',
    ['DugoutPageHeader', 'SectionHead', 'chipClass', 'CategoryRow', 'ShortcutTiles', 'DugoutEmpty'].every((n) => ui.includes(n))
  );
}

console.log('[수집 후보] 레슨 · 연습장 미확인 후보는 대표관리자만 — 통합 자료 candidates 만 · 처음 상태 약속 · 다시 넣어도 그대로 · 관리자 칸 안 덮음');
{
  const ev = (status: string) => ({ status, summary: '', scope: 'UNCONFIRMED', sourceKinds: [], sourceUrls: [], publishedDate: null, checkedDate: '2026-10-26', currentProvisionVerified: false });
  const cand = (n: string, o: Record<string, unknown> = {}) => ({
    id: `naver:${n}`,
    placeId: n,
    placeIds: [n],
    sourceCandidateIds: [`naver:${n}`],
    originGroups: ['ADDITIONAL_256'],
    name: `시험베이스볼${n}`,
    region: '서울특별시',
    address: `서울 강남구 시험로 ${n}`,
    typeHint: '레슨·훈련 후보',
    lat: 37.5,
    lng: 127,
    coordinatesNeedReview: true,
    collectionStatus: 'UNVERIFIED',
    businessStatus: 'UNKNOWN',
    contactStatus: 'NOT_CONTACTED',
    consentStatus: 'NOT_REQUESTED',
    visibility: 'ADMIN_ONLY',
    publicProfile: false,
    bookingEnabled: false,
    offersLessons: null,
    offersRental: null,
    offersHardball: null,
    phone: null,
    verifiedAt: null,
    lastContactedAt: null,
    reviewPriorityTags: [],
    operationsReview: { operation: { evidenceStatus: 'LISTED_HOURS_OR_PRODUCTS' }, lesson: ev('PUBLIC_NOTICE'), hardball: ev('NOT_ESTABLISHED'), rental: ev('NOT_ESTABLISHED') },
    ...o,
  });
  type C = ReturnType<typeof cand>;
  const fileOf = (cs: C[], extra: Record<string, unknown> = {}) => {
    const mapping = cs.flatMap((c) => (c.sourceCandidateIds as string[]).map((s) => ({ sourceCandidateId: s, canonicalCandidateId: c.id })));
    const merges = cs.filter((c) => (c.sourceCandidateIds as string[]).length > 1).map((c) => ({ canonicalCandidateId: c.id, sourceCandidateIds: c.sourceCandidateIds }));
    return {
      schemaVersion: 1,
      reviewedDate: '2026-10-26',
      counts: { total: cs.length, coordinatesMissing: cs.filter((c) => c.lat == null).length },
      sourceCounts: { combinedUniquePlaces: cs.length, totalInputRecords: mapping.length, mergedDuplicateRecords: merges.length },
      candidates: cs,
      sourceIdMapping: mapping,
      mergeLog: merges,
      addressReview: [],
      heldCandidates: [cand('999')],
      ...extra,
    };
  };
  const read = (f: unknown) => readCombinedFile(f).file;
  const ok = read(fileOf([cand('1'), cand('2', { lat: null, lng: null })]));
  check('약속을 지킨 통합 자료는 candidates 만 가져온다(보류 배열 · 연결표로 행을 안 만듦)', ok?.rows.length === 2 && !ok.rows.some((r) => r.id === 'naver:999'));
  check('좌표 없는 후보도 빠지지 않고 null 그대로(0,0 · 도시 가운데로 안 채움)', ok?.rows[1].fields.lat === null && ok.rows[1].fields.lng === null);
  check('공개 · 예약 · 서비스 · 전화 값이 켜진 후보가 하나라도 있으면 통째로 막는다', ['publicProfile', 'offersHardball', 'offersLessons', 'phone', 'verifiedAt'].every((k) => read(fileOf([cand('1'), cand('2', { [k]: k === 'publicProfile' || k.startsWith('offers') ? true : 'x' })])) === null));
  check('숫자 · 연결표가 안 맞으면 막는다', read({ ...fileOf([cand('1')]), counts: { total: 2, coordinatesMissing: 0 } }) === null && read({ ...fileOf([cand('1')]), sourceIdMapping: [] }) === null);
  check(
    '주소가 달라 좌표를 비운 곳(addressReview)에 좌표가 있으면 막는다(옛 좌표 되살림 방지)',
    read(fileOf([cand('1')], { addressReview: [{ placeId: '1', matchKind: 'SOURCE_ADDRESS_DIFFERS_COORDINATE_WITHHELD' }] })) === null &&
      read(fileOf([cand('1', { lat: null, lng: null })], { addressReview: [{ placeId: '1', matchKind: 'SOURCE_ADDRESS_DIFFERS_COORDINATE_WITHHELD' }] }))?.rows[0].fields.mapStatus ===
        'SOURCE_ADDRESS_DIFFERS_COORDINATE_WITHHELD'
  );
  check('공개 근거는 근거 칸에만 — 서비스 확정값으로 안 바뀜', !Object.keys(ok?.rows[0].fields ?? {}).some((k) => ['offersLessons', 'offersRental', 'offersHardball', 'phone', 'verifiedAt', 'approvedAt', 'collectionStatus', 'businessStatus', 'contactStatus', 'consentStatus'].includes(k)) && ok?.rows[0].fields.lessonNotice === 'PUBLIC_NOTICE');

  /* 가져오기 계획 — 메모리 DB 로 */
  const row = (id: string, o: Partial<ExistingCandidate> = {}): ExistingCandidate => ({
    id, mergedIntoId: null, coordsEdited: false, name: '옛이름', typeHint: '레슨·훈련 후보', region: '서울특별시', district: '강남구', roadAddress: '서울특별시 강남구 옛로 1',
    address: null, lat: 37.4, lng: 127.1, mapStatus: null, lessonNotice: null, rentalNotice: null, hardballNotice: null, operationNotice: null, accessNotice: null, identityNotice: null, originGroup: null,
    sharedPlaceGroup: null, duplicateGroup: null, reviewTags: [], collected: { externalPlaceId: id.split(':')[1] }, collectedAt: '2026-10-25', collectionStatus: 'UNVERIFIED',
    businessStatus: 'UNKNOWN', contactStatus: 'NOT_CONTACTED', consentStatus: 'NOT_REQUESTED', offersLessons: null, offersRental: null, offersHardball: null, phone: null,
    consentScope: null, verifiedAt: null, lastContactedAt: null, adminNote: null, approvedAt: null, ...o,
  });
  const run = (f: NonNullable<typeof ok>, db: ExistingCandidate[]) => {
    const plan = planImport(f, db);
    const next = new Map(db.map((r) => [r.id, { ...r }]));
    for (const o of plan.ops) {
      if (o.kind === 'create') next.set(o.id, { ...row(o.id), ...o.data });
      if (o.kind === 'update') Object.assign(next.get(o.id)!, o.data);
      if (o.kind === 'merge') next.get(o.id)!.mergedIntoId = o.into;
    }
    return { plan, db: [...next.values()] };
  };
  const first = run(ok!, []);
  const second = run(ok!, first.db);
  check('빈 표에는 모두 새로 만들고, 같은 파일을 다시 돌리면 아무것도 안 바뀐다', first.plan.tally.create === 2 && second.plan.tally.same === 2 && second.plan.tally.create + second.plan.tally.update === 0);

  const contacted = row('naver:1', { contactStatus: 'CONTACTED', consentStatus: 'AGREED', offersLessons: false, phone: '010', adminNote: '통화함', lastContactedAt: '2026-10-20' });
  const p1 = planImport(ok!, [contacted]);
  const up = p1.ops.find((o) => o.kind === 'update');
  check(
    '연락 · 동의 · 확인 기록이 있는 행은 수집 칸만 고치고 관리자 칸은 그대로(덮어쓰지 않음)',
    !!up && up.kind === 'update' && Object.keys(up.data).every((k) => (COLLECTED_KEYS as readonly string[]).includes(k)) && !('phone' in up.data) && !('contactStatus' in up.data)
  );
  check(
    '업체 확인값과 공개 근거가 엇갈리면 확인 우선 꼬리표만 단다(값을 바꾸지 않음)',
    up?.kind === 'update' && (up.data.reviewTags ?? []).some((t) => t.startsWith('레슨:')) && (up.data.reviewTags ?? []).some((t) => t.includes('같은 사업자'))
  );
  const edited = planImport(read(fileOf([cand('1', { lat: null, lng: null })]))!, [row('naver:1', { coordsEdited: true })]).ops[0];
  check('관리자가 손으로 정한 좌표는 다시 가져와도 그대로', edited.kind === 'update' && !('lat' in edited.data) && !('lng' in edited.data));

  const merged = read(fileOf([cand('5', { sourceCandidateIds: ['naver:5', 'semas:B'] })]))!;
  const pm = planImport(merged, [row('naver:5'), row('semas:B', { collected: {} })]);
  check('같은 장소로 통합된 이전 기록은 지우지 않고 대표 기록으로 잇는다', pm.ops.some((o) => o.kind === 'merge' && o.id === 'semas:B' && o.into === 'naver:5') && pm.tally.create === 0);
  const ph = planImport(merged, [row('naver:5'), row('semas:B', { collected: {}, adminNote: '연락함' })]);
  check('통합 대상 이전 기록에 관리자 기록이 있으면 잇지 않고 남겨 둔다', ph.tally.merge === 0 && ph.tally.hold === 1);
  const pv = planImport(merged, [row('semas:B', { collected: {} })]);
  check('기존 기본키는 바꾸지 않고 이전 id 로 찾은 행을 고친다', pv.ops.length === 1 && pv.ops[0].kind === 'update' && pv.ops[0].id === 'semas:B');
  const ps = planImport(ok!, [row('semas:Z', { collected: { externalPlaceId: '1' } })]);
  check('이전 id 로는 안 걸리는데 같은 지도 장소를 쓰는 기록이 있으면 만들지 않고 충돌로 남긴다', ps.tally.conflict === 1 && !ps.ops.some((o) => o.kind === 'create' && o.candidateId === 'naver:1'));
  const pu = planImport(ok!, [row('semas:OLD', { collected: {} })]);
  check('자료에 없는 기존 행은 지우지 않고 알리기만', pu.untouched.includes('semas:OLD') && pu.tally.create + pu.tally.update + pu.tally.same + pu.tally.conflict === 2);

  check(
    '승인은 동의 · 정보 확인 둘 다 뒤에만',
    canApprove({ consentStatus: 'AGREED', collectionStatus: 'VERIFIED' }) &&
      !canApprove({ consentStatus: 'AGREED', collectionStatus: 'UNVERIFIED' }) &&
      !canApprove({ consentStatus: 'REQUESTED', collectionStatus: 'VERIFIED' })
  );
  check('손으로 넣는 좌표는 한국 안쪽만', readCoords('37.55', '127.14')?.lat === 37.55 && readCoords('', '127') === null && readCoords('10', '127') === null);
  check(
    '좌표 없음 · 통합된 기록 · 확인 우선 꼬리표는 표시만',
    reviewFlags({ lat: null, mergedIntoId: 'x', reviewTags: ['공 종류·적용 반 확인'] }).length === 3 && reviewFlags({ lat: 1, reviewTags: [] }).length === 0
  );
  const rel = (p: string) => p.slice(join(ROOT, '.').length).replace(/\\/g, '/').replace(/^\//, '');
  const code = ['app', 'lib', 'components'].flatMap((d) => walk(join(ROOT, d))).filter((p) => /\.tsx?$/.test(p));
  const touch = code.filter((p) => /prisma\.facilityCandidate|Prisma\.FacilityCandidate/.test(readFileSync(p, 'utf8'))).map(rel).sort();
  check(
    '수집 후보 표를 읽고 쓰는 곳은 관리자 읽기 · 관리자 동작 둘뿐',
    JSON.stringify(touch) === JSON.stringify(['app/actions/admin-candidates.ts', 'lib/market/candidate-load.ts']),
    touch.join(', ')
  );
  check(
    '그 둘은 함수마다 requireAdmin(대표관리자)',
    ['app/actions/admin-candidates.ts', 'lib/market/candidate-load.ts'].every((f) => {
      const t = src(f);
      return (t.match(/export async function/g) ?? []).length === (t.match(/await requireAdmin\(\)/g) ?? []).length;
    })
  );
  const users = code.filter((p) => /candidate-load|admin-candidates/.test(readFileSync(p, 'utf8'))).map(rel).filter((f) => !/^(lib\/market\/candidate-load|app\/actions\/admin-candidates)\.ts$/.test(f));
  /* 관리 화면 밖에서 후보를 부르는 곳은 공개 지도의 관리자 전환 둘뿐(2026-10-26 김민) — 둘 다 대표관리자인지 먼저 보고, API 는 아니면 403 */
  const GATED = ['app/(dugout)/venues/page.tsx', 'app/api/places/route.ts'];
  /* 후보 하나를 보이는 곳 — 지도 위 팝업(@modal) · 덕아웃 앱 후보 창(app/embed/place, 2026-10-26). 둘 다 loadCandidate(안에서 requireAdmin)로만 읽는다 */
  const DETAIL = ['app/(dugout)/@modal/(.)manage/places/[id]/page.tsx', 'app/embed/place/[id]/page.tsx'];
  check(
    '수집 후보를 쓰는 화면은 덕아웃 관리 화면(/manage/places)과 대표관리자 전환(공개 지도 · 앱 지도 API)뿐',
    users.length > 0 && users.every((f) => f.startsWith('app/(master)/manage/places/') || GATED.includes(f) || DETAIL.includes(f)),
    users.join(', ')
  );
  check(
    '후보 팝업 · 앱 후보 창은 loadCandidate(대표관리자 확인)로만 읽고, 앱 창은 그 전에 대표관리자인지 본다',
    DETAIL.every((f) => /loadCandidate\(/.test(src(f)) && !/prisma\./.test(src(f))) && /isOwner\(/.test(src('app/embed/place/[id]/page.tsx'))
  );
  check(
    '공개 지도 · 앱 지도 API 는 대표관리자일 때만 후보를 읽는다(API 는 아니면 403)',
    GATED.every((f) => /const admin = isOwner\(/.test(src(f)) && /admin && one\(sp\.view\) === 'candidates'|if \(!admin\) return NextResponse\.json\([^)]*status: 403/.test(src(f)))
  );
  check('앱 rpc 허용 목록에 수집 후보 동작이 없다', !src('app/api/rpc/registry.ts').includes('admin-candidates'));

  /* 야구장 조사 파일(2026-10-27) — 같은 표 · 같은 가져오기 계획으로 */
  type F = Record<string, unknown>;
  const obj2 = (v: unknown): F => (v && typeof v === 'object' ? (v as F) : {});
  const fld =(n: string, o: F = {}): F => ({
    fieldId: `field-kakao-${n}`,
    name: `시험야구장${n}`,
    cityKey: '경기|수원시',
    addresses: [`경기 수원시 시험로 ${n}`],
    sourceCandidateIds: [`field-kakao-${n}`],
    accessReviewStatus: '공개 신청·대관 안내 확보',
    review5Identity: '같은 장소·면',
    operationStatus5: '현재 운영 근거 있음(5차 원문)',
    evidenceIds: [`E-${n}`],
    documentedPhone: ['031-000-0000'],
    sourceConflicts: [],
    visibility: 'ADMIN_ONLY',
    contactStatus: 'NOT_CONTACTED',
    consentStatus: 'NOT_REQUESTED',
    publicProfile: false,
    bookingEnabled: false,
    ...o,
  });
  const fieldFile = (fs: F[], extra: F = {}) => {
    const tally = (k: string) => fs.reduce<Record<string, number>>((m, r) => ({ ...m, [String(r[k])]: (m[String(r[k])] ?? 0) + 1 }), {});
    return {
      metadata: { checkedAt: '2026-10-27', counts: { totalRows: fs.length, accessStatus: tally('accessReviewStatus'), identity5: tally('review5Identity'), operationStatus5: tally('operationStatus5') } },
      fields: fs,
      evidence: fs.flatMap((r) => (r.evidenceIds as string[]).map((e) => ({ evidenceId: e, fieldId: r.fieldId, url: 'https://example.go.kr' }))),
      sourceReview5: fs.map((r) => ({ fieldId: r.fieldId, evidenceId: (r.evidenceIds as string[])[0] })),
      ...extra,
    };
  };
  const readField = (f: unknown) => readFieldReviewFile(f).file;
  const fok = readField(fieldFile([fld('11'), fld('12', { cityKey: '호남|광주 북구', review5Identity: '대응 불확실' })]));
  check(
    '야구장 파일은 정식 지역 이름 · 야구장 분류 · 좌표 없음(null) · 카카오 장소 id 이름표로 온다',
    fok?.rows.length === 2 &&
      fok.rows[1].fields.region === '전남광주통합특별시' &&
      fok.rows[1].fields.district === '광주 북구' &&
      fok.rows.every((r) => r.fields.typeHint === FIELD_TYPE_HINT && r.fields.lat === null && r.fields.lng === null) &&
      fok.rows[0].placeIds[0] === 'kakao:11'
  );
  check(
    '이용 · 대응 · 운영 근거는 코드로, 레슨 · 대관 · 경식구 근거 칸은 비운다',
    fok?.rows[0].fields.accessNotice === 'PUBLIC_APPLICATION' &&
      fok.rows[1].fields.identityNotice === 'UNSURE' &&
      fok.rows[0].fields.operationNotice === 'FIELD_OPERATING' &&
      fok.rows[0].fields.lessonNotice === null &&
      fok.rows[0].fields.rentalNotice === null &&
      !!ACCESS_NOTICE.PUBLIC_APPLICATION && !!IDENTITY_NOTICE.UNSURE && !!FIELD_OPERATION_NOTICE.FIELD_OPERATING
  );
  check('공개 출처 연락처 · 업체 확인 칸은 표 칸으로 안 간다(근거 collected 에만)', !Object.keys(fok?.rows[0].fields ?? {}).some((k) => ['phone', 'offersRental', 'contactStatus', 'consentStatus', 'approvedAt'].includes(k)));
  check('그 구장의 출처 · 점검 기록이 근거에 함께 담긴다', (obj2(fok?.rows[0].fields.collected).evidence as unknown[])?.length === 1 && (obj2(obj2(fok?.rows[0].fields.collected).audit).sourceReview5 as unknown[])?.length === 1);
  const unit = readField(fieldFile([{ ...fld('31'), fieldId: 'field-unit-abc123def', sourceCandidateIds: [] }]));
  check('이전 id 가 없는 새 면도 받고, 이전 id 에 자기 id 를 넣는다(카카오 장소 id 는 없음)', unit?.rows[0].sourceIds.join() === 'field-unit-abc123def' && unit.rows[0].placeIds.length === 0);
  check('근거가 이 구장인지 불확실하면 확인 우선 꼬리표',fok?.rows[1].fileTags.some((t) => t.includes('불확실')) === true && fok.rows[0].fileTags.length === 0);

  const masked = readField(fieldFile([fld('13', { documentedPhone: ['031-979-0909 / 010-1234-5678'] })]));
  const kept = JSON.stringify(masked?.rows[0].fields.collected);
  check('휴대전화 번호는 근거째 가리고 기관 전화는 남긴다', masked?.maskedPhones === 1 && !kept.includes('010-1234') && kept.includes('031-979-0909') && kept.includes(MOBILE_MASK));
  check('id 속 숫자는 휴대전화로 안 가린다', maskMobiles({ id: 'field-kakao-1012345678', url: 'https://place.map.kakao.com/1012345678' }).count === 0);

  check(
    '공개 · 예약 · 연락 · 동의 · 업체 확인 값이 처음 상태가 아니면 통째로 막는다',
    [{ publicProfile: true }, { bookingEnabled: true }, { contactStatus: 'CONTACTED' }, { consentStatus: 'AGREED' }, { visibility: 'PUBLIC' }, { offersRental: true }].every(
      (o) => readField(fieldFile([fld('11'), fld('12', o)])) === null
    ) && readField(fieldFile([fld('11', { visibility: undefined })])) === null
  );
  check('모르는 지역 · 이용 · 대응 · 운영 글은 짐작하지 않고 막는다', [{ cityKey: '해외|도쿄' }, { accessReviewStatus: '아마 됨' }, { review5Identity: '?' }, { operationStatus5: '?' }].every((o) => readField(fieldFile([fld('11', o)])) === null));
  check(
    '수 · 근거 연결 · 이전 id 가 안 맞으면 막는다',
    readField({ ...fieldFile([fld('11')]), metadata: { checkedAt: '2026-10-27', counts: { totalRows: 2 } } }) === null &&
      readField(fieldFile([fld('11', { evidenceIds: ['E-없음'] })], { evidence: [] })) === null &&
      readField(fieldFile([fld('11'), fld('12', { sourceCandidateIds: ['field-kakao-12', 'field-kakao-11'] })])) === null
  );
  const dupOk = readField(fieldFile([fld('21', { duplicateGroupId: 'D1', canonicalCandidateId: 'field-kakao-21' }), fld('22', { duplicateGroupId: 'D1', canonicalCandidateId: 'field-kakao-21' })]));
  check(
    '중복 기록은 합치지 않고 묶음 표시 + 대표 아닌 쪽에 꼬리표, 대표가 파일에 없으면 막는다',
    dupOk?.rows.every((r) => r.fields.duplicateGroup === 'D1') === true &&
      dupOk.rows[1].fileTags.some((t) => t.includes('대표 field-kakao-21')) &&
      readField(fieldFile([fld('22', { duplicateGroupId: 'D1', canonicalCandidateId: 'field-kakao-21' })])) === null
  );
  const fp = planImport(fok!, [row('naver:11', { collected: { externalPlaceId: '11' } })]);
  check('카카오 장소 번호가 네이버 장소 번호와 숫자가 같아도 다른 곳으로 본다(충돌 아님)', fp.tally.conflict === 0 && fp.tally.create === 2);
  check('레슨 · 연습장 자료는 야구장 칸(이용 경로 · 장소 대응)을 비운다', ok?.rows[0].fields.accessNotice === null && ok.rows[0].fields.identityNotice === null);
  check('카카오 장소 id 는 kakao: 이름표 붙은 것만 숫자로', kakaoIdsOf(['kakao:123', '456', 'naver:9']).join() === '123');
  check(
    '좌표 일괄 찾기는 같은 카카오 장소 id 만 쓴다(이름 비슷한 다른 곳 · 한국 밖 좌표는 안 씀)',
    pickKakaoPlace([{ id: '9', place_name: '다른 야구장', x: '127', y: '37.5' }, { id: '123', place_name: '시험야구장', x: '127.1', y: '37.6' }], ['123'])?.lat === 37.6 &&
      pickKakaoPlace([{ id: '9', x: '127', y: '37.5' }], ['123']) === null &&
      pickKakaoPlace([{ id: '123', x: '0', y: '0' }], ['123']) === null
  );
  check(
    '주소 검색은 번지 · 건물 주소까지 맞은 것만(동 · 길 이름만 맞으면 안 씀)',
    pickAddress([{ address_type: 'REGION', x: '127', y: '37' }]) === null &&
      pickAddress([{ address_type: 'ROAD', x: '127', y: '37' }]) === null &&
      pickAddress([{ address_type: 'REGION', x: '127', y: '37' }, { address_type: 'REGION_ADDR', address_name: '시험동 1', x: '127.2', y: '37.3' }])?.source === 'KAKAO_ADDRESS'
  );
  const ffirst = run(fok!, []);
  check('야구장 파일도 빈 표에 새로 만들고, 다시 돌리면 그대로', ffirst.plan.tally.create === 2 && run(fok!, ffirst.db).plan.tally.same === 2);
}

console.log('\n[싱커 안 덕아웃] 선수 활동 공간 — 차단 · 가림이 목록과 같고, 장터 채팅을 선수 활동처럼 두지 않고, 기록 공유는 예전 그대로');
{
  const home = src('components/dugout/sinker-dugout-home.tsx');
  const load = src('lib/sinker-dugout-load.ts');
  const page = src('app/(dugout)/page.tsx');
  check(
    '싱커 홈의 글은 커뮤니티 목록과 같은 함수(loadCommunityList — 차단 · 가림 규칙 한 곳)로만 읽는다',
    /loadCommunityList\(user, q\)/.test(load) && /loadCommunityList\(user, \{ category: 'meetup'/.test(load) && !/loadPublicPosts/.test(load) && !/communityPost\.findMany/.test(load)
  );
  check(
    '인기글은 목록의 인기 그대로(최근 7일 · 좋아요 순 — period 를 꼭 넘김), 최신글은 쓴 때 차례',
    /read\(\{ sort: 'hot', period: '7d', page: 1 \}\)/.test(load) && /read\(\{ sort: 'new', page: 1 \}\)/.test(load)
  );
  check('요약은 관리자에게도 가린 글을 빼고 보인다', /\.filter\(\(p\) => !p\.hidden\)/.test(load) && /\.find\(\(x\) => !x\.hidden && x\.meetAt\)/.test(load));
  check(
    '답변 미리보기 · 저장은 글 몇 개를 한 번에(글마다 글 화면 로더를 부르지 않음) — 가린 댓글 · 차단한 사람 · 글쓴이 댓글을 뺀다',
    /loadPostExtras\(user, qids, ids\)/.test(load) &&
      !/loadCommunityPost/.test(load) &&
      /export async function loadPostExtras[\s\S]{0,1600}hiddenAt: null[\s\S]{0,400}userId: \{ not: m\.userId, \.\.\.notBlocked \}/.test(src('lib/community-load.ts'))
  );
  check(
    '레슨 찾기 · 추천 코치 · 최근 레슨은 싱커 첫 화면에서 빠졌다(그 조회도) — 기존 레슨 예약은 내 활동이 그대로 읽는다',
    /if \(sinkerApp\) \{[\s\S]{0,1400}return \(\s*<SinkerDugoutHome/.test(page) &&
      !/if \(sinkerApp\) \{[\s\S]{0,1400}(loadRecommendedCoaches|loadLessonFeed)[\s\S]{0,600}<SinkerDugoutHome/.test(page) &&
      !/href=["{`'][^"'`]*\/lessons/.test(home) &&
      /loadMyBookings\(user\.id\)/.test(load)
  );
  check(
    '첫 화면 차례 — 이어 볼 활동 → 같이 연습(벤치) → 커뮤니티 → 연습장',
    home.indexOf('activitySummary(activity)') < home.indexOf('<BenchCard') && home.indexOf('<BenchCard') < home.indexOf('<SinkerCommunity') && home.indexOf('<SinkerCommunity') < home.indexOf('title="연습장"')
  );
  check(
    '덕아웃 홈 인기글(loadPublicPosts)도 보는 사람이 차단한 사람 글을 뺀다',
    /export async function loadPublicPosts\(take: number, viewerId[\s\S]{0,400}communityBlock\.findMany[\s\S]{0,300}notIn: blocked/.test(src('lib/market/load.ts')) &&
      /loadPublicPosts\(30, user\?\.id/.test(page)
  );
  check('싱커 홈은 자기 자료만 읽고 먼저 돌아간다(장터 · 경기 · 뉴스를 안 읽음)', /if \(sinkerApp\) \{[\s\S]{0,900}return \(\s*<SinkerDugoutHome/.test(page) && page.indexOf('if (sinkerApp) {') < page.indexOf('loadLatestListings(6'));
  check('싱커 홈에 장터 · 채팅 · 검색 · 경기 · 뉴스 길이 없다', !/href=["{`'][^"'`]*\/(market|chat|search|baseball|gear)/.test(home));
  check('싱커 위 막대에는 장터 채팅 단추가 없다(slim)', /\{!slim && <ChatButton unread=\{unread\} \/>\}/.test(src('components/dugout/dugout-topbar.tsx')));
  check(
    '장터 거래 대화는 싱커에서도 그대로 열리고(/chat 허용) 이름으로 갈린다 · 마이에서 이어 간다',
    inSinkerDugout('/chat') && inSinkerDugout('/chat/r1') && /trade=\{trade\}/.test(src('app/(dugout)/chat/layout.tsx')) && /장터 거래 대화/.test(src('app/(dugout)/me/page.tsx'))
  );
  check('기록 공유 카드는 예전 길 그대로(?card= · 자동 공개 없음) — 맨 끝 한 줄', /href=\{`\/community\/new\?card=\$\{encodeURIComponent\(record\.ref\)\}`\}/.test(home) && home.lastIndexOf('record &&') > home.indexOf('같이 연습'));
  {
    const bar = src('components/dugout/dugout-topbar.tsx');
    check(
      '세 분류(둘러보기 · 커뮤니티 · 연습장)는 실제 주소 — 둘러보기는 /?dugout=1(앱의 / 는 싱커로 간다), 첫 화면에서만 · 싱커 앱(slim)에서만',
      /href: '\/\?dugout=1', path: '\/', label: '둘러보기'/.test(bar) && /href: '\/community', path: '\/community', label: '커뮤니티'/.test(bar) && /href: '\/venues', path: '\/venues', label: '연습장'/.test(bar) &&
        /const tabRoot = slim \? sinkerTabOf\(pathname\) : null/.test(bar) && !/label: '레슨'[\s\S]{0,80}SINKER_TABS/.test(bar)
    );
    check('내 활동(티켓 모양) 단추는 이름이 있고 싱커 앱 안에만', /\{slim && \([\s\S]{0,80}href="\/me\/community" aria-label="내 활동"/.test(bar));
  }
  check('게시판 길 — 커뮤니티 분류 · 번개 목록 · 글쓰기는 실제 계약(board=)', /\/community\?category=meetup&open=1/.test(home) && /\/community\/new\?board=meetup/.test(home) && !/\/community\/new\?(category|kind)=/.test(home));
  check(
    '내 활동 · 같이 연습 · 커뮤니티 · 연습장은 못 읽음과 빈 것을 가른다(구역마다 따로)',
    /activity === null/.test(home) && /meetup === null/.test(home) && /meetup === undefined/.test(home) && /venue === null/.test(home) && /venue === undefined/.test(home) &&
      /list === null/.test(src('components/dugout/sinker-community.tsx')) && /return null;/.test(load)
  );
  {
    const bench = src('components/dugout/bench-card.tsx');
    const three = src('components/dugout/bench-three.ts');
    check(
      '벤치 장면은 카드가 보일 때만 불러오고(three 를 첫 묶음에 안 실음) 못 그리면 정적 그림 — 해상도 1.6배 · 저전력 · 문맥 잃음 · 놓기',
      /import\('\.\/bench-three'\)/.test(bench) && !/from 'three'/.test(bench) && /IntersectionObserver/.test(bench) && /StaticBench/.test(bench) &&
        /Math\.min\(window\.devicePixelRatio \|\| 1, 1\.6\)/.test(three) && /powerPreference: 'low-power'/.test(three) && /webglcontextlost/.test(three) &&
        /renderer\.dispose\(\)/.test(three) && /observer\.disconnect\(\)/.test(three) && /touch-pan-y/.test(bench)
    );
    check('벤치 장면은 번개 id 가 같으면 다시 만들지 않는다(커뮤니티 정렬을 바꿔도 그대로)', /<BenchCard key=\{meetup\.id\}/.test(home) && /\}, \[md, line, setLive\]\);/.test(bench));
  }
  check(
    '참가 티켓은 서버가 참가를 읽은 뒤에만(싱커 앱 번개 글) — 바코드 같은 입장 코드는 없다',
    /sinkerApp && post\.meetup && post\.joined && post\.meetAt && user && \(\s*<MeetupTicket/.test(src('app/(dugout)/community/[id]/page.tsx')) && !/barcode|바코드/i.test(src('components/community/meetup-ticket.tsx').replace(/바코드 같은 입장 코드를 그리지 않는다/, ''))
  );
  check(
    '싱커의 연습장은 장소(Venue)만 — 공용 지도는 레슨장도 그대로',
    /only: sinkerApp \? 'venue' : undefined/.test(src('app/(dugout)/venues/page.tsx')) && /const wantLesson = f\.only !== 'venue' &&/.test(src('lib/market/map-load.ts')) &&
      /prisma\.venue\.findFirst\(\{\s*where: \{ publicProfile: true, hiddenAt: null \}/.test(load)
  );
  check('열지 않는 화면도 돌아갈 길을 준다(뒤로 · 덕아웃 홈)', /function SinkerAway[\s\S]{0,1500}router\.back\(\)[\s\S]{0,600}\/\?dugout=1/.test(src('components/dugout/dugout-shell.tsx')));
}

console.log('\n[싱커 안 덕아웃] 첫 화면 규칙(lib/sinker-dugout-feed.ts) — 말머리 · 행동 · 답변 고르기 · 날짜 · 가격 · 활동 한 줄');
{
  const base: ListPost = { id: 'p1', category: 'question', tag: 'pitch', title: 't', preview: '본문', solved: false, answered: false, comments: 0, nickname: '민', state: null, meetAt: null, region: null, district: null, capacity: null, joins: 0 };
  const x = { answer: null, saved: false, ago: '방금' };
  check('말머리 — 질문 · 투구 / 내 기록 = 연습 기록(새 게시판 없음) / 자유 · KBO / 번개 · 캐치볼', feedLabel('question', 'pitch') === '질문 · 투구' && feedLabel('free', 'record') === '연습 기록' && feedLabel('free', 'kbo') === '자유 · KBO' && feedLabel('free', null) === '자유' && feedLabel('meetup', 'catch') === '번개 · 캐치볼');
  const open = feedCardOf(base, x);
  check('답 없는 질문만 첫 답변 남기기(댓글 칸으로)', open.cta.label === '첫 답변 남기기' && open.cta.href === '/community/p1#comments' && open.meta === '답 기다림');
  const free = feedCardOf({ ...base, category: 'free', tag: null }, x);
  check('자유 글에는 첫 답변 · 답 기다림을 붙이지 않는다', free.cta.label === '이야기 보기' && !free.meta.includes('답') && free.kind === 'story');
  const solved = feedCardOf({ ...base, answered: true, solved: true, comments: 3 }, { ...x, answer: { nickname: '코치', body: '팔을 늦게', accepted: true } });
  check('해결된 질문은 채택한 답을 보이고 행동은 답변 보기(정답 · 전문가로 말하지 않음)', solved.meta === '해결됨' && solved.answer?.accepted === true && solved.body === null && solved.cta.label === '답변 보기');
  const noPreview = feedCardOf({ ...base, answered: true, comments: 1 }, x);
  check('답변을 못 읽으면 본문 요약 — 답을 꾸미지 않는다', noPreview.answer === null && noPreview.body === '본문');
  const meet = feedCardOf({ ...base, category: 'meetup', tag: 'catch', state: 'open', meetAt: new Date('2026-10-31T01:00:00Z'), district: '성동구', capacity: 3, joins: 1 }, x);
  check('번개 글은 모집 상태 · 때 · 곳 · 인원, 질문 · 자유 단추를 안 씀', meet.kind === 'gather' && meet.meta === '모집 중' && meet.cta.label === '자세히 보기' && /10\/31\(토\) 10:00 · 성동구 · 1\/3명 모집/.test(meet.body ?? ''));
  const c = (id: string, userId: string) => ({ id, userId, body: id, nickname: id });
  check('답변 고르기 — 글쓴이 댓글만이면 없음 · 채택이 먼저 · 아니면 남의 가장 이른 답', pickAnswer([c('a', 'author')], 'author', null) === null && pickAnswer([c('first', 'u1'), c('acc', 'u2')], 'author', 'acc')?.body === 'acc' && pickAnswer([c('mine', 'author'), c('first', 'u1')], 'author', null)?.body === 'first' && pickAnswer([c('own', 'author')], 'author', 'own') === null);
  const d = benchDate(new Date('2026-10-31T01:00:00Z'));
  const late = benchDate(new Date('2026-10-31T15:30:00Z'));
  check('번개 날짜는 한국 시각(자정 넘김 포함)', d.md === '10.31' && d.weekday === 'SATURDAY' && d.time === '10:00' && late.md === '11.01' && late.weekday === 'SUNDAY' && late.dayKo === '일' && late.time === '00:30');
  check('정원을 안 적은 번개는 남은 자리를 말하지 않는다', seatsLeft(null, 3) === null && seatsLeft(4, 2) === 2 && seatsLeft(2, 5) === 0);
  check('연습장 가격 · 예약 방식 글', venuePriceText(null, 60).price === '가격 문의' && venuePriceText(30000, 60).price === '30,000원' && venuePriceText(30000, 60).unit === '/ 60분' && venueBookingText(true) === '장소 확인 후 예약 확정' && venueBookingText(false) === '바로 예약 확정');
  const a = (label: string, href: string) => ({ label, title: 'T', sub: 'S', href });
  const many = activitySummary([a('참가한 번개', '/community/x'), a('답변 있는 질문', '/community/y'), a('답변 있는 질문', '/community/z')]);
  check('이어 볼 활동 — 없으면 줄 없음 · 하나면 그것 · 여럿이면 종류별 수(새 답변 · 안 읽은 수는 말하지 않음)', activitySummary([]) === null && activitySummary([a('연습장 예약', '/me')])?.href === '/me' && many?.sub === '참가한 번개 1 · 답변 있는 질문 2' && many?.href === '/me/community' && !/새 답변/.test(many?.sub ?? '') && activitySummary([a('레슨 예약', '/me'), a('연습장 예약', '/me')])?.href === '/me');
}

console.log(
  `\n${pass} 통과${fails.length ? `, ${fails.length} 실패:\n  - ${fails.join('\n  - ')}` : ''}`
);
if (fails.length) process.exit(1);
