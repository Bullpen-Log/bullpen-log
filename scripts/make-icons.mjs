/**
 * 앱 아이콘을 만든다 — 지금 로고(아래로 꺾인 화살표가 붙은 파란 S, 싱커 — 2026-10-22 초안 · 임시) 그대로.
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
 *   public/icons/{sinker,dugout}-tab.png  브라우저 탭 (64, 투명)
 *   public/icons/{sinker,dugout}-apple.png 아이폰 홈 화면 (180×180)
 *   public/favicon.ico                  링크 없이 묻는 곳 (16 · 32 · 48, 덕아웃)
 *
 * 앞의 셋은 app/manifest.ts 가, 탭 · 홈 화면 넷은 레이아웃의 metadata.icons 가 건다. 예전엔 app/favicon.ico ·
 * app/apple-icon.png(파일 규칙)였는데, 파일 규칙은 사이트 전체에 하나뿐이고 metadata 보다 이겨서 싱커 · 덕아웃을 못 갈랐다.
 *
 * ■ 그림
 *
 * components/logo.tsx 의 SinkerMark 와 같은 모양 · 같은 색이다(1006 × 1001 칸 — MARK_PATH 를 그대로 옮김).
 * 앱 안에서 보던 표시와 홈 화면 아이콘이 달라 보이면 같은 앱인지 헷갈린다.
 *
 * 홈 화면용은 원본 로고처럼 흰 네모 가운데에 파란 로고. 투명 칸 없이 꽉 채운다 —
 * 아이폰은 투명한 모서리를 검게 칠하고, 안드로이드는 원·둥근 네모로 잘라 쓴다.
 * B 는 한 변의 50%(잘라 쓰는 판은 42%) — 안드로이드가 지키는 가운데 80% 원 안에
 * 모서리까지 들어간다. 탭 아이콘은 바탕 없이 B 만 크게(88%) — 16px 에서도 B 로 읽히게.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

/* components/logo.tsx 와 같은 모양 · 색 */
const BRAND = '#0297e4';
const MARK_W = 1006;
const MARK_H = 1001;
const MARK_PATH =
  'M275 0l631 0l17 2l18 7l13 9l9 12l5 15l1 15l-4 15l-8 14l-119 116l-14 11l-20 10l-15 4l-21 2l-75-1l-19 1l-350 0l-18 6l-10 6l-6 5l-6 7l-5 8l-5 18l-1 10l2 12l5 12l6 9l7 8l8 6l12 5l12 3l401 1l16 2l16 4l23 10l18 13l74 72l42 43l8 12l5 12l5 14l2 15l2 37l-1 103l0 64l1 8l5 8l6 5l31 4l7 2l7 5l7 7l4 7l2 11l-1 8l-4 12l-11 13l-144 139l-21 16l-15 6l-14 1l-16-3l-14-8l-16-13l-135-136l-8-8l-5-10l-3-10l1-13l4-10l6-8l7-5l8-3l34-4l8-6l3-8l0-135l-2-9l-4-11l-8-9l-9-8l-15-7l-22-3l-399 0l-27-4l-13-5l-13-6l-11-8l-10-7l-103-102l-13-14l-8-14l-9-20l-3-25l-1-61l1-50l1-14l4-14l6-14l6-11l17-22l98-97l58-56l17-11l21-10l20-6ZM198 663l355 0l11 1l10 3l8 4l10 8l8 9l5 9l3 9l1 11l-1 10l-2 11l-7 12l-9 11l-19 19l-7 9l-5 12l-6 27l-11 21l-8 9l-10 9l-13 7l-12 5l-22 3l-440-1l-9-2l-11-6l-8-9l-5-7l-3-12l0-10l3-9l5-10l13-14l81-79l41-38l11-8l14-7l15-4Z';

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

/*
 * 덕아웃 로고(components/logo.tsx DugoutMark 와 같은 모양 · 색) — 64칸 판 안에서 그림이 차지하는 네모(지붕 선 굵기 포함)를
 * 가운데에 맞춰 키운다. 싱커와 덕아웃은 같은 서버의 두 얼굴이라 브라우저 탭 · 아이폰 홈 화면 아이콘을 구역마다 따로 건다
 * (싱커 = app/(app) · (session) 레이아웃, 덕아웃 = 뿌리 레이아웃 — 2026-10-22 금윤호 "싱커에 들어가면 싱커 로고, 덕아웃이면 덕아웃 로고").
 */
const DUGOUT = '#1d8a4f';
const DUGOUT_BOX = { x: 3.3, y: 12, w: 57.7, h: 39.4 };
const DUGOUT_BODY =
  '<path d="M6.9 29.2 32.1 15.6 57.4 29.2" fill="none" stroke="currentColor" stroke-width="7.2" stroke-linecap="round" stroke-linejoin="round" />' +
  '<rect x="11.2" y="33.3" width="42" height="7.7" rx="2.3" />' +
  '<rect x="14.4" y="41.8" width="6.9" height="9.6" rx="2.3" />' +
  '<rect x="43.1" y="41.8" width="6.9" height="9.6" rx="2.3" />';

/** 덕아웃 한 장 — ratio 는 그림 폭이 한 변에서 차지하는 몫(가로로 긴 그림이라 폭으로 맞춘다) */
function dugoutSvg(size, ratio, ground) {
  const k = (size * ratio) / DUGOUT_BOX.w;
  const x = (size - DUGOUT_BOX.w * k) / 2 - DUGOUT_BOX.x * k;
  const y = (size - DUGOUT_BOX.h * k) / 2 - DUGOUT_BOX.y * k;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${ground ? `<rect width="${size}" height="${size}" fill="${ground}" />` : ''}
  <g transform="translate(${x} ${y}) scale(${k})" fill="${DUGOUT}" color="${DUGOUT}">${DUGOUT_BODY}</g>
</svg>`;
}
const flatPng = (markup, size) =>
  sharp(Buffer.from(markup)).resize(size, size).flatten({ background: '#ffffff' }).png().toBuffer();
const clearPng = (markup) => sharp(Buffer.from(markup)).png().toBuffer();

mkdirSync('public/icons', { recursive: true });

/* 홈 화면에 앱으로 추가(PWA, app/manifest.ts) — 싱커(첫 화면이 /today) */
writeFileSync('public/icons/icon-192.png', await home(192));
writeFileSync('public/icons/icon-512.png', await home(512));
writeFileSync('public/icons/icon-maskable-512.png', await home(512, 0.42));

/* 브라우저 탭 · 아이폰 홈 화면 — 구역마다(app/layout.tsx · app/(app)/layout.tsx 의 metadata.icons) */
/*
 * 파일 이름에 그림 판(-s1)을 넣는다 — 사파리는 탭 아이콘을 주소째 오래 붙들어, 같은 이름(?v= 를 달아도)이면 옛 B 를 계속 보였다(2026-10-22).
 * 그림을 바꾸면 판을 올리고 lib/brand-metadata.ts 의 이름도 같이 바꾼다. SVG 는 어느 크기에서도 또렷하게(사파리 · 크롬 둘 다 읽는다).
 */
mkdirSync('public/brand', { recursive: true });
writeFileSync('public/brand/sinker-s1.svg', svg(64, 0.88));
writeFileSync('public/brand/sinker-s1-32.png', await tabIcon(32));
writeFileSync('public/brand/sinker-s1-64.png', await tabIcon(64));
writeFileSync('public/brand/sinker-s1-apple.png', await home(180));
writeFileSync('public/brand/dugout-s1.svg', dugoutSvg(64, 0.94));
writeFileSync('public/brand/dugout-s1-32.png', await clearPng(dugoutSvg(32, 0.94)));
writeFileSync('public/brand/dugout-s1-64.png', await clearPng(dugoutSvg(64, 0.94)));
writeFileSync('public/brand/dugout-s1-apple.png', await flatPng(dugoutSvg(180, 0.62, '#ffffff'), 180));

/* 링크 없이 /favicon.ico 를 묻는 곳(옛 브라우저 · 북마크)에 줄 것 — 바깥 첫 화면이 덕아웃이라 덕아웃 */
const tab = await Promise.all(
  [16, 32, 48].map(async (size) => ({ size, data: await clearPng(dugoutSvg(size, 0.94)) }))
);
writeFileSync('public/favicon.ico', ico(tab));

console.log('아이콘을 만들었습니다(public/icons · public/brand).');
