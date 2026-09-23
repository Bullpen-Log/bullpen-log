/**
 * 앱 아이콘을 만든다 — 지금 로고(파란 원 + 야구공 선그림) 그대로.
 *
 *   npm run icons
 *
 * 홈 화면에 앱으로 추가했을 때(PWA) 뜨는 아이콘과 브라우저 탭 아이콘이다.
 * 전용 아이콘을 따로 디자인하기 전까지 쓰는 임시판이다(2026-09-23, C안).
 * 새 아이콘이 오면 아래 '만드는 파일'을 같은 이름·같은 크기로 바꿔 넣으면
 * 되고, 이 스크립트는 다시 돌리지 않는다.
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
 * components/logo.tsx 의 BaseballMark 와 같은 선이다(24 칸 기준 좌표). 앱
 * 안에서 보던 표시와 홈 화면 아이콘이 달라 보이면 같은 앱인지 헷갈린다.
 *
 * 홈 화면용은 네모를 파랗게 꽉 채운다. 아이폰은 투명한 모서리를 검게 칠하고,
 * 안드로이드는 원·둥근 네모로 잘라 쓰기 때문이다. 공은 가운데 62% 안에 두어
 * 어떤 모양으로 잘려도 안 잘린다(안드로이드는 가운데 80% 원 안을 지킨다).
 * 탭 아이콘은 앱 안의 표시처럼 둥근 배지로, 모서리는 투명하다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const SKY = '#0ea5e9';

/* components/logo.tsx 와 같은 선 — 공 테두리, 좌우 솔기, 실밥 */
const BALL = `
  <g stroke-width="1.6">
    <circle cx="12" cy="12" r="9.5" />
    <path d="M5.3 5C8.5 8 8.5 16 5.3 19" />
    <path d="M18.7 5C15.5 8 15.5 16 18.7 19" />
  </g>
  <g stroke-width="1.2">
    <path d="M5.3 6.7 8.4 7.95M6 10 9.2 10.7M6 14 9.2 13.3M5.3 17.3 8.4 16.05" />
    <path d="M18.7 6.7 15.6 7.95M18 10 14.8 10.7M18 14 14.8 13.3M18.7 17.3 15.6 16.05" />
  </g>`;

/**
 * 한 장의 SVG. size 는 한 변의 픽셀, shape 는 바탕 모양.
 * 공(24 칸 상자)은 한 변의 62% — 앱 안의 배지와 같은 비율이다.
 */
function svg(size, shape) {
  const box = size * 0.62;
  const at = (size - box) / 2;
  const ground =
    shape === 'square'
      ? `<rect width="${size}" height="${size}" fill="${SKY}" />`
      : `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${SKY}" />`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${ground}
  <g transform="translate(${at} ${at}) scale(${box / 24})" fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round">${BALL}
  </g>
</svg>`;
}

/*
 * 홈 화면용 네모는 투명 칸을 아예 없앤다(flatten). 겉보기엔 꽉 차 있어도 투명
 * 칸이 붙어 있으면, 아이폰이 그 판을 투명 그림으로 보고 모서리를 검게 칠할 수
 * 있다. 탭 아이콘(둥근 배지)은 모서리가 투명해야 하므로 그대로 둔다.
 */
const png = (size, shape) => {
  const img = sharp(Buffer.from(svg(size, shape)));
  return (shape === 'square' ? img.flatten({ background: SKY }) : img).png().toBuffer();
};

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

writeFileSync('public/icons/icon-192.png', await png(192, 'square'));
writeFileSync('public/icons/icon-512.png', await png(512, 'square'));
writeFileSync('public/icons/icon-maskable-512.png', await png(512, 'square'));
writeFileSync('app/apple-icon.png', await png(180, 'square'));

const tab = await Promise.all(
  [16, 32, 48].map(async (size) => ({ size, data: await png(size, 'circle') }))
);
writeFileSync('app/favicon.ico', ico(tab));

console.log('아이콘 다섯 개를 만들었습니다.');
