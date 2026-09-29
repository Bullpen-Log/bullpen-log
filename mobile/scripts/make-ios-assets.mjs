/**
 * 아이폰 앱의 아이콘과 시작 화면(스플래시)을 만든다 — 지금 로고 그대로.
 *
 *   cd mobile && npm run assets
 *
 * sharp 는 저장소 뿌리의 것을 쓴다(뿌리에서 npm install 을 해 둔 상태여야 한다).
 *
 * 그림은 scripts/make-icons.mjs(홈 화면 · 탭 아이콘)와 같다 — 흰 네모 가운데에 파란 B(새 로고,
 * 2026-09-30), B 높이는 한 변의 50%. 앱 아이콘과 웹 아이콘이 달라 보이면 같은 앱인지 헷갈린다.
 * 로고를 바꾸면 components/logo.tsx 와 두 스크립트를 같이 고친다.
 *
 * ■ 만드는 파일 (ios/App/App/Assets.xcassets 아래)
 *
 *   AppIcon.appiconset/AppIcon-512@2x.png   앱 아이콘 1024×1024. 애플은 투명 칸이 있는
 *                                            아이콘을 받지 않아서 투명 칸을 아예 없앤다.
 *   Splash.imageset/*.png + Contents.json    앱을 켤 때 잠깐 보이는 화면. 밝은 판 · 어두운 판
 *                                            (폰이 다크 모드면 어두운 판). 사이트의 바탕색과 같게.
 *
 * 시작 화면은 2732×2732 네모를 화면에 꽉 차게(가운데 기준으로 잘라) 보인다. 그래서 로고는
 * 가운데에 작게 둔다 — 보통 아이폰에서 높이 75pt 쯤으로 보인다.
 */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';

/* components/logo.tsx 의 BullpenMark · scripts/make-icons.mjs 와 같은 모양 · 색 (594 × 613 칸) */
const BRAND = '#0297e4';
const MARK_W = 594;
const MARK_H = 613;
const MARK_PATH =
  'M0 0H237V613H0Z' +
  'M281 0H453A125 141 0 0 1 453 282H281Z' +
  'M281 329H470A124 142 0 0 1 470 613H281Z';
/* app/manifest.ts · app/layout.tsx 의 바탕색 */
const LIGHT_BG = '#f4f7fb';
const DARK_BG = '#0b1220';

const ASSETS = 'ios/App/App/Assets.xcassets';

/** size 네모 바탕(bg) 가운데에 높이 h 짜리 B */
function markSvg(size, bg, h) {
  const k = h / MARK_H;
  const x = (size - MARK_W * k) / 2;
  const y = (size - h) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="${bg}" />
  <path transform="translate(${x} ${y}) scale(${k})" fill="${BRAND}" d="${MARK_PATH}" />
</svg>`;
}

/* 투명 칸을 없앤 PNG — 앱 아이콘은 투명 칸(알파)이 있으면 애플이 올리기를 거절한다 */
const opaque = (svg, bg) =>
  sharp(Buffer.from(svg)).flatten({ background: bg }).removeAlpha().png().toBuffer();

writeFileSync(`${ASSETS}/AppIcon.appiconset/AppIcon-512@2x.png`, await opaque(markSvg(1024, '#ffffff', 512), '#ffffff'));

/*
 * 2732 네모가 세로 화면(예: 390×844pt)을 꽉 채우려면 0.62배쯤 줄어든다.
 * B 높이 240px → 화면에서 약 75pt(예전 둥근 배지 100pt 와 비슷한 무게).
 */
const SPLASH = 2732;
const MARK = 240;
const light = await opaque(markSvg(SPLASH, LIGHT_BG, MARK), LIGHT_BG);
const dark = await opaque(markSvg(SPLASH, DARK_BG, MARK), DARK_BG);

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
