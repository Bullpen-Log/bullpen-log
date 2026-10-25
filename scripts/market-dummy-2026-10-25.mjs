/**
 * 장터 더미 물건(2026-10-25 금윤호: "장터에 더미물건 50개 정도 채워줘 · 사진까지") — 화면을 채워 보려고 넣는 가짜 물건.
 * 주인은 넘긴 이메일의 계정, 본문 끝에 MARK 를 달아 알아보고 --remove 로 한 번에 지운다(사진 파일까지).
 * 사진은 실제 사진이 아니라 sharp 로 그린 품목 그림(배경 · 모양 · 이름)이다. 씨앗이 고정이라 다시 돌려도 같은 물건이 나온다.
 *
 *   node --env-file=.env scripts/market-dummy-2026-10-25.mjs <이메일>            # 확인만
 *   node --env-file=.env scripts/market-dummy-2026-10-25.mjs <이메일> --apply    # 넣기
 *   node --env-file=.env scripts/market-dummy-2026-10-25.mjs <이메일> --remove   # 지우기
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const bucket = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY).storage.from('pitch-videos');
const email = process.argv[2];
const apply = process.argv.includes('--apply');
const remove = process.argv.includes('--remove');
const MARK = '[더미 물건]';
const COUNT = 50;

let seed = 20261025;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (a) => a[Math.floor(rand() * a.length)];
const between = (a, b) => a + Math.floor(rand() * (b - a + 1));

const BRANDS = ['윌슨', '롤링스', '미즈노', '제트', '아식스', '이스턴', '루이스빌', '하타케야마', '사사키', '골드', '나이키', '언더아머'];
const REGIONS = ['전국(택배)', '서울', '경기', '인천', '부산', '대구', '대전', '광주', '울산', '강원', '충북', '충남', '경남'];
const CONDITIONS = ['new', 'like-new', 'used', 'used', 'worn'];
const NOTE = {
  new: '포장도 안 뜯은 새 상품이에요.',
  'like-new': '몇 번 안 쓴 거의 새것이에요.',
  used: '사용감은 있지만 쓰는 데 문제없어요.',
  worn: '많이 썼어요. 사진 꼭 보고 연락 주세요.',
};

/* 품목별: 제목 · 규격 · 가격 범위 · 그림 */
const MAKERS = {
  glove() {
    const position = pick(['pitcher', 'infield', 'outfield', 'catcher', 'first', 'all']);
    const inch = { pitcher: 12, infield: 11.5, outfield: 12.75, catcher: 33.5, first: 12.5, all: 12 }[position];
    const name = { pitcher: '투수 글러브', infield: '내야 글러브', outfield: '외야 글러브', catcher: '포수 미트', first: '1루 미트', all: '올라운드 글러브' }[position];
    return { title: `${pick(BRANDS)} ${name} ${position === 'catcher' ? '' : inch + '인치'}`.trim(), specs: { hand: pick(['rh', 'rh', 'lh']), position, inch: Math.min(14, inch) }, price: [60, 380] };
  },
  bat() {
    const material = pick(['wood', 'alloy', 'composite', 'hybrid']);
    const lengthInch = between(30, 34);
    const label = { wood: '나무 배트', alloy: '알루미늄 배트', composite: '카본 배트', hybrid: '하이브리드 배트' }[material];
    return { title: `${pick(BRANDS)} ${label} ${lengthInch}인치`, specs: { lengthInch, weightOz: lengthInch - between(2, 4), material, cert: pick(['none', 'kbo', 'amateur']) }, price: [40, 420] };
  },
  spikes() {
    const sizeMm = pick([250, 255, 260, 265, 270, 275, 280, 285]);
    const stud = pick(['metal', 'rubber', 'turf']);
    return { title: `${pick(BRANDS)} ${{ metal: '징 스파이크', rubber: '고무 스파이크', turf: '터프화' }[stud]} ${sizeMm}`, specs: { sizeMm, stud }, price: [30, 160] };
  },
  protector() {
    const kind = pick(['helmet', 'catcher', 'battingGlove', 'guard']);
    return { title: `${pick(BRANDS)} ${{ helmet: '타자 헬멧', catcher: '포수 장비 세트', battingGlove: '배팅 장갑', guard: '암가드' }[kind]}`, specs: { kind }, price: [15, 250] };
  },
  uniform() {
    const piece = pick(['top', 'pants', 'set', 'cap']);
    return { title: `${pick(['사회인', '팀', '연습용', '레트로'])} ${{ top: '유니폼 상의', pants: '야구 바지', set: '유니폼 세트', cap: '야구 모자' }[piece]}`, specs: { piece }, price: [10, 90] };
  },
  ball() {
    const count = pick([6, 12, 24, 50]);
    return { title: `${pick(['연식', '경식', '연습용', '시합구'])} 야구공 ${count}개`, specs: { count }, price: [10, 120] };
  },
  bag() {
    return { title: `${pick(BRANDS)} ${pick(['배트 백팩', '롤링 장비가방', '숄더 가방'])}`, specs: {}, price: [20, 140] };
  },
  training() {
    return { title: pick(['투구 연습 그물', '티배팅 거치대', '웨이티드볼 세트', '메디신볼 3kg', '저항 밴드 세트', '스피드건']), specs: {}, price: [15, 200] };
  },
};
const MIX = ['glove', 'glove', 'glove', 'bat', 'bat', 'bat', 'spikes', 'spikes', 'protector', 'protector', 'uniform', 'ball', 'bag', 'training', 'training'];

const PALETTE = [['#e9f3ff', '#0a84d6'], ['#fff3e6', '#d9730d'], ['#eef8ef', '#2e8b57'], ['#f6eefc', '#8a4fd1'], ['#fdeeee', '#c9383a'], ['#f1f1f1', '#3a3a3a']];
const SHAPES = {
  glove: '<path d="M300 560c-60-40-90-140-80-230 6-56 40-70 62-40l18 120 10-210c4-50 60-50 64 0l6 190 18-220c6-50 62-48 64 2l2 216 30-170c10-48 64-40 60 10l-14 210c40-60 90-80 110-50 20 30-60 120-120 200-50 66-150 80-230 22z"/>',
  bat: '<rect x="180" y="380" width="460" height="56" rx="28" transform="rotate(-35 400 400)"/><rect x="150" y="390" width="160" height="30" rx="15" transform="rotate(-35 400 400)"/>',
  spikes: '<path d="M180 470c0-70 40-130 110-140l90-14c40 60 120 80 220 90 30 4 40 30 40 60v20H180z"/><rect x="190" y="500" width="460" height="22" rx="8"/>',
  protector: '<path d="M240 470c0-130 70-210 170-210s170 80 170 200v30H470l-20 50H300v-70z"/>',
  uniform: '<path d="M300 250l-110 70 50 90 50-30v250h220V380l50 30 50-90-110-70c-20 40-60 60-100 60s-80-20-100-60z"/>',
  ball: '<circle cx="400" cy="400" r="170"/>',
  bag: '<rect x="230" y="300" width="340" height="260" rx="40"/><path d="M330 300v-50h140v50" fill="none" stroke-width="22"/>',
  training: '<circle cx="400" cy="400" r="150" fill="none" stroke-width="22"/><path d="M290 290l220 220M510 290L290 510" stroke-width="12"/>',
};

async function drawImage(category, title, i) {
  const [bg, fg] = PALETTE[i % PALETTE.length];
  const shape = SHAPES[category] ?? SHAPES.ball;
  const seams = category === 'ball' ? `<path d="M290 280c40 70 40 170 0 240M510 280c-40 70-40 170 0 240" fill="none" stroke="#fff" stroke-width="10"/>` : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800">
    <rect width="800" height="800" fill="${bg}"/>
    <g fill="${fg}" stroke="${fg}" opacity="0.9" transform="rotate(${(i % 7) * 4 - 12} 400 400)">${shape}</g>${seams}
    <text x="400" y="720" font-family="Apple SD Gothic Neo, sans-serif" font-size="34" font-weight="700" fill="${fg}" text-anchor="middle">${title.replace(/&/g, '&amp;').slice(0, 22)}</text>
  </svg>`;
  return sharp(Buffer.from(svg)).jpeg({ quality: 82 }).toBuffer();
}

async function main() {
  if (!email) throw new Error('이메일을 넘겨 주세요');
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, nickname: true } });
  if (!user) throw new Error('그 이메일의 계정이 없어요');
  const existing = await prisma.listing.findMany({ where: { userId: user.id, body: { endsWith: MARK } }, select: { id: true, images: true } });
  console.log(`주인 ${user.nickname} · 이미 있는 더미 ${existing.length}개`);

  if (remove) {
    const paths = existing.flatMap((l) => l.images);
    if (paths.length) await bucket.remove(paths);
    const { count } = await prisma.listing.deleteMany({ where: { id: { in: existing.map((l) => l.id) } } });
    console.log(`지움 ${count}개 · 사진 ${paths.length}장`);
    return;
  }
  if (existing.length) throw new Error('더미가 이미 있어요 — 먼저 --remove');

  const plans = Array.from({ length: COUNT }, (_, i) => {
    const category = MIX[i % MIX.length];
    const m = MAKERS[category]();
    const condition = pick(CONDITIONS);
    const share = rand() < 0.06;
    const price = share ? 0 : between(m.price[0], m.price[1]) * 1000;
    return { category, ...m, condition, price, region: pick(REGIONS), photos: between(1, 3), daysAgo: rand() * 14 };
  });
  for (const p of plans.slice(0, 8)) console.log(`${p.category} · ${p.title} · ${p.price.toLocaleString()}원 · ${p.region}`);
  console.log(`… 모두 ${plans.length}개`);
  if (!apply) return console.log('확인만 했어요 — 넣으려면 --apply');

  let n = 0;
  for (const [i, p] of plans.entries()) {
    const images = [];
    for (let k = 0; k < p.photos; k++) {
      const path = `${user.id}/market-dummy-${crypto.randomUUID()}.jpg`;
      const { error } = await bucket.upload(path, await drawImage(p.category, p.title, i + k), { contentType: 'image/jpeg' });
      if (error) throw error;
      images.push(path);
    }
    const at = new Date(Date.now() - p.daysAgo * 86400000);
    await prisma.listing.create({
      data: {
        userId: user.id, category: p.category, title: p.title, price: p.price, condition: p.condition, specs: p.specs,
        region: p.region, images, views: between(0, 180), createdAt: at,
        status: rand() < 0.12 ? 'RESERVED' : 'ACTIVE',
        body: `${NOTE[p.condition]}\n${p.region === '전국(택배)' ? '택배 거래해요.' : `${p.region}에서 직거래 가능해요.`}\n\n${MARK}`,
      },
    });
    n++;
  }
  console.log(`넣음 ${n}개`);
}

main().catch((e) => { console.error(e.message ?? e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
