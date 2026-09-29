/**
 * 앱 아이콘을 만든다 — 지금 로고(굵은 막대 + 반원 둘로 짠 파란 B) 그대로.
 *
 *   npm run icons
 *
 * 홈 화면에 앱으로 추가했을 때(PWA) 뜨는 아이콘과 브라우저 탭 아이콘이다.
 * 2026-09-30 사용자분이 만든 새 로고로 바꿨다(그 전은 파란 원 + 야구공 임시판).
 *
 * ■ 만드는 파일
 *
 *   public/icons/icon-192.png           안드로이드 홈 화면 · 설치 창
 *   public/icons/icon-512.png           안드로이드 시작 화면(스플래시)
 *   public/icons/icon-maskable-512.png  안드로이드가 모양(원·둥근 네모)을 잘라 쓰는 판
 *   app/apple-icon.png                  아이폰 홈 화면 (180×180)
 *   app/favicon.ico                     브라우저 탭 (16 · 32 · 48)
 *
 * 앞의 셋은 app/manifest.ts 가, 뒤의 둘은 Next.js 가 파일 이름을 보고 알아서
 * 머리말에 건다.
 *
 * ■ 그림
 *
 * components/logo.tsx 의 BullpenMark 와 같은 모양 · 같은 색이다(594 × 613 칸).
 * 앱 안에서 보던 표시와 홈 화면 아이콘이 달라 보이면 같은 앱인지 헷갈린다.
 *
 * 홈 화면용은 원본 로고처럼 흰 네모 가운데에 파란 B. 투명 칸 없이 꽉 채운다 —
 * 아이폰은 투명한 모서리를 검게 칠하고, 안드로이드는 원·둥근 네모로 잘라 쓴다.
 * B 는 한 변의 50%(잘라 쓰는 판은 42%) — 안드로이드가 지키는 가운데 80% 원 안에
 * 모서리까지 들어간다. 탭 아이콘은 바탕 없이 B 만 크게(88%) — 16px 에서도 B 로 읽히게.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

/* components/logo.tsx 와 같은 모양 · 색 */
const BRAND = '#0297e4';
const MARK_W = 594;
const MARK_H = 613;
const MARK_PATH =
  'M0 0H237V613H0Z' +
  'M281 0H453A125 141 0 0 1 453 282H281Z' +
  'M281 329H470A124 142 0 0 1 470 613H281Z';

/**
 * 한 장의 SVG. size 는 한 변의 픽셀, ratio 는 B 높이가 한 변에서 차지하는 몫,
 * ground 는 바탕색(없으면 투명).
 */
function svg(size, ratio, ground) {
  const h = size * ratio;
  const k = h / MARK_H;
  const x = (size - MARK_W * k) / 2;
  const y = (size - h) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${ground ? `<rect width="${size}" height="${size}" fill="${ground}" />` : ''}
  <path transform="translate(${x} ${y}) scale(${k})" fill="${BRAND}" d="${MARK_PATH}" />
</svg>`;
}

/*
 * 홈 화면용은 투명 칸을 아예 없앤다(flatten). 겉보기엔 꽉 차 있어도 투명
 * 칸이 붙어 있으면, 아이폰이 그 판을 투명 그림으로 보고 모서리를 검게 칠할 수
 * 있다. 탭 아이콘은 바탕이 비쳐야 하므로 그대로 둔다.
 */
const home = (size, ratio = 0.5) =>
  sharp(Buffer.from(svg(size, ratio, '#ffffff')))
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer();
const tabIcon = (size) => sharp(Buffer.from(svg(size, 0.88))).png().toBuffer();

/**
 * PNG 여러 장을 .ico 하나로 묶는다.
 *
 * .ico 는 머리(6바이트) + 장마다 목차(16바이트) + 그림들이다. 요즘 브라우저는
 * 안에 PNG 를 그대로 넣은 .ico 를 읽는다. 따로 도구를 깔지 않으려고 직접 싼다.
 */
function ico(images) {
  const head = Buffer.alloc(6);
  head.writeUInt16LE(0, 0); // 예약
  head.writeUInt16LE(1, 2); // 1 = 아이콘
  head.writeUInt16LE(images.length, 4);

  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0); // 너비 (256 이면 0)
    e.writeUInt8(size >= 256 ? 0 : size, 1); // 높이
    e.writeUInt8(0, 2); // 팔레트 색 수 — 안 씀
    e.writeUInt8(0, 3); // 예약
    e.writeUInt16LE(1, 4); // 면
    e.writeUInt16LE(32, 6); // 색 깊이
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([head, ...entries, ...images.map((i) => i.data)]);
}

mkdirSync('public/icons', { recursive: true });

writeFileSync('public/icons/icon-192.png', await home(192));
writeFileSync('public/icons/icon-512.png', await home(512));
writeFileSync('public/icons/icon-maskable-512.png', await home(512, 0.42));
writeFileSync('app/apple-icon.png', await home(180));

const tab = await Promise.all(
  [16, 32, 48].map(async (size) => ({ size, data: await tabIcon(size) }))
);
writeFileSync('app/favicon.ico', ico(tab));

console.log('아이콘 다섯 개를 만들었습니다.');
