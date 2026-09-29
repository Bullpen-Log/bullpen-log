/**
 * 아이폰 앱의 아이콘과 시작 화면(스플래시)을 만든다 — 지금 로고 그대로.
 *
 *   cd mobile && npm run assets
 *
 * sharp 는 저장소 뿌리의 것을 쓴다(뿌리에서 npm install 을 해 둔 상태여야 한다).
 *
 * 그림은 scripts/make-icons.mjs(홈 화면 · 탭 아이콘)와 같다 — 파란 네모에 흰 야구공 선,
 * 공은 한 변의 62%. 앱 아이콘과 웹 아이콘이 달라 보이면 같은 앱인지 헷갈린다. 로고를 바꾸면
 * 두 스크립트를 같이 고친다.
 *
 * ■ 만드는 파일 (ios/App/App/Assets.xcassets 아래)
 *
 *   AppIcon.appiconset/AppIcon-512@2x.png   앱 아이콘 1024×1024. 애플은 투명 칸이 있는
 *                                            아이콘을 받지 않아서 투명 칸을 아예 없앤다.
 *   Splash.imageset/*.png + Contents.json    앱을 켤 때 잠깐 보이는 화면. 밝은 판 · 어두운 판
 *                                            (폰이 다크 모드면 어두운 판). 사이트의 바탕색과 같게.
 *
 * 시작 화면은 2732×2732 네모를 화면에 꽉 차게(가운데 기준으로 잘라) 보인다. 그래서 로고는
 * 가운데에 작게 둔다 — 보통 아이폰에서 지름 100pt 쯤으로 보인다.
 */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';

const SKY = '#0ea5e9';
/* app/manifest.ts · app/layout.tsx 의 바탕색 */
const LIGHT_BG = '#f4f7fb';
const DARK_BG = '#0b1220';

const ASSETS = 'ios/App/App/Assets.xcassets';

/* components/logo.tsx 의 BaseballMark · scripts/make-icons.mjs 와 같은 선 (24 칸 기준) */
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

/** 공 그림 — 한 변 box 짜리 상자를 (x, y) 에 */
const ball = (x, y, box) =>
  `<g transform="translate(${x} ${y}) scale(${box / 24})" fill="none" stroke="#ffffff" stroke-linecap="round" stroke-linejoin="round">${BALL}</g>`;

/** 앱 아이콘 — 네모를 파랗게 꽉 채운다(아이폰이 모서리를 알아서 둥글게 자른다) */
function iconSvg(size) {
  const box = size * 0.62;
  const at = (size - box) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="${SKY}" />
  ${ball(at, at, box)}
</svg>`;
}

/** 시작 화면 — 바탕색 위 가운데에 둥근 로고 배지 */
function splashSvg(size, bg, badge) {
  const c = size / 2;
  const box = badge * 0.62;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="${bg}" />
  <circle cx="${c}" cy="${c}" r="${badge / 2}" fill="${SKY}" />
  ${ball(c - box / 2, c - box / 2, box)}
</svg>`;
}

/* 투명 칸을 없앤 PNG — 앱 아이콘은 투명 칸(알파)이 있으면 애플이 올리기를 거절한다 */
const opaque = (svg, bg) =>
  sharp(Buffer.from(svg)).flatten({ background: bg }).removeAlpha().png().toBuffer();

writeFileSync(`${ASSETS}/AppIcon.appiconset/AppIcon-512@2x.png`, await opaque(iconSvg(1024), SKY));

/*
 * 2732 네모가 세로 화면(예: 390×844pt)을 꽉 채우려면 0.62배쯤 줄어든다.
 * 배지 320px(= 160pt @2x) → 화면에서 약 100pt.
 */
const SPLASH = 2732;
const BADGE = 320;
const light = await opaque(splashSvg(SPLASH, LIGHT_BG, BADGE), LIGHT_BG);
const dark = await opaque(splashSvg(SPLASH, DARK_BG, BADGE), DARK_BG);

const scales = ['1x', '2x', '3x'];
const images = [];
for (const scale of scales) {
  const name = `splash-${scale}.png`;
  const darkName = `splash-${scale}-dark.png`;
  writeFileSync(`${ASSETS}/Splash.imageset/${name}`, light);
  writeFileSync(`${ASSETS}/Splash.imageset/${darkName}`, dark);
  images.push({ idiom: 'universal', filename: name, scale });
  images.push({
    idiom: 'universal',
    filename: darkName,
    scale,
    appearances: [{ appearance: 'luminosity', value: 'dark' }],
  });
}
writeFileSync(
  `${ASSETS}/Splash.imageset/Contents.json`,
  JSON.stringify({ images, info: { version: 1, author: 'xcode' } }, null, 2) + '\n'
);

console.log('앱 아이콘 1장 · 시작 화면 밝은 판 3장 · 어두운 판 3장을 만들었습니다.');
