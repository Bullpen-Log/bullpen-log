/**
 * 아이폰 앱의 아이콘과 시작 화면(스플래시 · 로딩 화면)을 만든다 — 지금 로고 그대로.
 *
 *   cd mobile && npm run assets
 *
 * sharp 는 저장소 뿌리의 것을 쓴다(뿌리에서 npm install 을 해 둔 상태여야 한다).
 *
 * 그림은 scripts/make-icons.mjs(홈 화면 · 탭 아이콘) · components/logo.tsx 와 같다 — 파란 B(새 로고,
 * 2026-09-30). 로고를 바꾸면 셋을 같이 고친다.
 *
 * ■ 만드는 파일 (ios/App/App/Assets.xcassets 아래)
 *
 *   AppIcon.appiconset/AppIcon-512@2x.png   앱 아이콘 1024×1024 — 흰 네모 가운데에 파란 B(한 변의 50%).
 *                                            애플은 투명 칸이 있는 아이콘을 받지 않아서 투명 칸을 없앤다.
 *   Splash.imageset/*.png + Contents.json    앱을 켤 때부터 첫 화면이 뜰 때까지 보이는 화면 — 밝은 바탕
 *                                            한가운데 큰 B(시작 연출이 이어 받는다). 아이폰이 켤 때 그리는
 *                                            시작 화면(LaunchScreen)과, 페이지가 뜰 때까지 덮어 두는 로딩
 *                                            화면(@capacitor/splash-screen)이 같은 그림을 써서 끊김 없이 이어진다.
 *
 * 시작 화면은 밝은 판 하나다. 앱 테마는 폰의 다크 모드와 상관없이 라이트로 시작해서(lib/theme.ts),
 * 폰 설정을 따라 어두운 판을 띄우면 어두운 로딩 → 밝은 첫 화면으로 번쩍였다.
 *
 * 2732×2732 네모를 화면에 꽉 차게(가운데 기준으로 잘라) 보인다 — 아이폰 15 Pro Max 에서 그림 1px 이
 * 약 0.34pt.
 */
import { rmSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

/* components/logo.tsx 의 BullpenMark · scripts/make-icons.mjs 와 같은 모양 · 색 (594 × 613 칸) */
const BRAND = '#0297e4';
const MARK_W = 594;
const MARK_H = 613;
const MARK_PATH =
  'M0 0H237V613H0Z' +
  'M281 0H453A125 141 0 0 1 453 282H281Z' +
  'M281 329H470A124 142 0 0 1 470 613H281Z';
/* app/globals.css 의 밝은 바탕(--color-page) */
const LIGHT_BG = '#f4f7fb';

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
const opaque = (input, bg) =>
  sharp(input)
    .flatten({ background: bg })
    .removeAlpha()
    .png({ compressionLevel: 9 })
    .toBuffer();

writeFileSync(
  `${ASSETS}/AppIcon.appiconset/AppIcon-512@2x.png`,
  await opaque(Buffer.from(markSvg(1024, '#ffffff', 512)), '#ffffff')
);

/*
 * 시작 화면 — 한가운데 큰 B 하나. 앱을 켜면 사이트의 시작 연출(components/app-intro.tsx)이 같은 자리 ·
 * 같은 크기의 B 로 이어 받아 튀기고 BULLPEN LOG 로 펼친다(2026-09-30 사용자). 그림은 화면에 꽉 차게
 * (가운데 기준으로 잘라) 보여서 B 높이는 화면 높이 × SPLASH_B_RATIO 가 된다 — app-intro.tsx 의
 * INTRO_B_RATIO 와 같아야 넘어가는 순간이 안 보인다. 로딩 표시(돌아가는 톱니)는 끈다(capacitor.config.json).
 */
const SPLASH = 2732;
const SPLASH_B_RATIO = 0.16;
const splash = await opaque(
  Buffer.from(markSvg(SPLASH, LIGHT_BG, Math.round(SPLASH * SPLASH_B_RATIO))),
  LIGHT_BG
);

/* 1x · 2x · 3x 모두 같은 그림(Xcode 템플릿과 같은 방식). 예전 어두운 판은 지운다. */
const images = [];
for (const scale of ['1x', '2x', '3x']) {
  const name = `splash-${scale}.png`;
  writeFileSync(`${ASSETS}/Splash.imageset/${name}`, splash);
  rmSync(`${ASSETS}/Splash.imageset/splash-${scale}-dark.png`, { force: true });
  images.push({ idiom: 'universal', filename: name, scale });
}
writeFileSync(
  `${ASSETS}/Splash.imageset/Contents.json`,
  JSON.stringify({ images, info: { version: 1, author: 'xcode' } }, null, 2) + '\n'
);

console.log('앱 아이콘 1장 · 시작 화면(큰 B, 밝은 판) 3장을 만들었습니다.');
