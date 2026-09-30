/**
 * 아이폰 앱의 아이콘과 시작 화면(스플래시 · 로딩 화면)을 만든다 — 지금 로고 그대로.
 *
 *   cd mobile && npm run assets
 *
 * sharp 는 저장소 뿌리의 것을 쓴다(뿌리에서 npm install 을 해 둔 상태여야 한다).
 * 시작 화면의 글자(ULLPEN LOG)는 크롬(없으면 엣지)으로 그린다 — 앱 머리의 이름(Wordmark)과 같은
 * 글꼴(Bebas Neue, 구글 폰트에서 받는다)이라야 같은 로고로 읽힌다. 다른 곳의 크롬을 쓰려면
 * CHROME_PATH 에 그 실행 파일 경로를 준다. 인터넷이 필요하다(글꼴).
 *
 * 그림은 scripts/make-icons.mjs(홈 화면 · 탭 아이콘) · components/logo.tsx 와 같다 — 파란 B(새 로고,
 * 2026-09-30). 로고를 바꾸면 셋을 같이 고친다.
 *
 * ■ 만드는 파일 (ios/App/App/Assets.xcassets 아래)
 *
 *   AppIcon.appiconset/AppIcon-512@2x.png   앱 아이콘 1024×1024 — 흰 네모 가운데에 파란 B(한 변의 50%).
 *                                            애플은 투명 칸이 있는 아이콘을 받지 않아서 투명 칸을 없앤다.
 *   Splash.imageset/*.png + Contents.json    앱을 켤 때부터 첫 화면이 뜰 때까지 보이는 화면 — 밝은 바탕에
 *                                            [B]ULLPEN LOG(2026-09-30 사용자 요청). 아이폰이 켤 때 그리는
 *                                            시작 화면(LaunchScreen)과, 페이지가 뜰 때까지 덮어 두는 로딩
 *                                            화면(@capacitor/splash-screen)이 같은 그림을 써서 끊김 없이 이어진다.
 *
 * 시작 화면은 밝은 판 하나다. 앱 테마는 폰의 다크 모드와 상관없이 라이트로 시작해서(lib/theme.ts),
 * 폰 설정을 따라 어두운 판을 띄우면 어두운 로딩 → 밝은 첫 화면으로 번쩍였다.
 *
 * 2732×2732 네모를 화면에 꽉 차게(가운데 기준으로 잘라) 보인다 — 아이폰 15 Pro Max 에서 그림 1px 이
 * 약 0.34pt. 로딩 표시(작은 동그라미)가 화면 한가운데에 돌아서 로고는 그 조금 위에 둔다.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import sharp from 'sharp';

/* components/logo.tsx 의 BullpenMark · scripts/make-icons.mjs 와 같은 모양 · 색 (594 × 613 칸) */
const BRAND = '#0297e4';
const MARK_W = 594;
const MARK_H = 613;
const MARK_PATH =
  'M0 0H237V613H0Z' +
  'M281 0H453A125 141 0 0 1 453 282H281Z' +
  'M281 329H470A124 142 0 0 1 470 613H281Z';
/* app/globals.css 의 밝은 바탕(--color-page) · 글자(--color-ink) */
const LIGHT_BG = '#f4f7fb';
const INK = '#0f172a';

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
 * 시작 화면 — [B]ULLPEN LOG. components/logo.tsx 의 Wordmark 와 같은 짜임: B 높이 0.7em(글꼴의
 * 대문자 높이), B 와 글자 사이 0.07em, 글자 사이 0.02em(globals.css 의 text-display).
 * 글자 152px → 로고 너비 약 680px(15 Pro Max 에서 약 230pt). 로고는 한가운데보다 140px(약 48pt) 위.
 */
const SPLASH = 2732;
const FONT_PX = 152;
const LIFT_PX = 140;
const html = `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&display=block">
<style>
  html, body { margin: 0; width: ${SPLASH}px; height: ${SPLASH}px; background: ${LIGHT_BG}; overflow: hidden; }
  .wm { position: absolute; left: 50%; top: calc(50% - ${LIFT_PX}px); transform: translate(-50%, -50%);
        display: inline-flex; align-items: baseline; white-space: nowrap;
        font-family: 'Bebas Neue', sans-serif; font-size: ${FONT_PX}px; line-height: 1;
        letter-spacing: 0.02em; color: ${INK}; }
  .wm svg { height: 0.7em; width: auto; margin-right: 0.07em; fill: ${BRAND}; }
</style></head>
<body><div class="wm"><svg viewBox="0 0 ${MARK_W} ${MARK_H}"><path d="${MARK_PATH}"/></svg>ULLPEN LOG</div></body></html>`;

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) {
    throw new Error(
      '크롬(또는 엣지)을 못 찾았습니다 — CHROME_PATH 에 실행 파일 경로를 주세요.'
    );
  }
  return found;
}

const work = mkdtempSync(join(tmpdir(), 'bullpen-splash-'));
try {
  const page = join(work, 'splash.html');
  const shot = join(work, 'splash.png');
  writeFileSync(page, html);
  execFileSync(
    findChrome(),
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=${SPLASH},${SPLASH}`,
      '--virtual-time-budget=10000',
      `--user-data-dir=${join(work, 'profile')}`,
      `--screenshot=${shot}`,
      pathToFileURL(page).href,
    ],
    { stdio: 'ignore' }
  );
  const splash = await opaque(readFileSync(shot), LIGHT_BG);

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
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log('앱 아이콘 1장 · 시작 화면([B]ULLPEN LOG, 밝은 판) 3장을 만들었습니다.');
