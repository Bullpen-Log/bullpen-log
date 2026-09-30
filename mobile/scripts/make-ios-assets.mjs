/**
 * 아이폰 앱의 아이콘 · 시작 화면 · 시작 연출의 글자 그림을 만든다 — 지금 로고 그대로.
 *
 *   cd mobile && npm run assets
 *
 * sharp 는 저장소 뿌리의 것을 쓴다(뿌리에서 npm install 을 해 둔 상태여야 한다). 글자 그림은 크롬(없으면
 * 엣지)으로 그린다 — 사이트 머리의 이름(Wordmark)과 같은 글꼴(Bebas Neue, 구글 폰트에서 받는다)이라야
 * 같은 로고로 읽힌다. 다른 곳의 크롬을 쓰려면 CHROME_PATH 에 그 실행 파일 경로를 준다. 인터넷이 필요하다.
 *
 * 그림은 scripts/make-icons.mjs(홈 화면 · 탭 아이콘) · components/logo.tsx 와 같다 — 파란 B(새 로고,
 * 2026-09-30). 로고를 바꾸면 셋을 같이 고친다.
 *
 * ■ 만드는 파일 (ios/App/App/Assets.xcassets 아래)
 *
 *   AppIcon.appiconset/AppIcon-512@2x.png   앱 아이콘 1024×1024 — 흰 네모 가운데에 파란 B(한 변의 50%).
 *                                            애플은 투명 칸이 있는 아이콘을 받지 않아서 투명 칸을 없앤다.
 *   Splash.imageset/*.png + Contents.json    아이콘을 누르면 아이폰이 먼저 띄우는 시작 화면(LaunchScreen) —
 *                                            밝은 바탕 한가운데 큰 B. 앱 코드가 돌기 전이라 그림 한 장만 된다.
 *   IntroWord.imageset/intro-word.png        시작 연출(ios/App/App/MainViewController.swift)이 펼치는 이름의
 *                                            글자 'ULLPEN LOG'.
 *
 * 시작 화면은 밝은 판 하나다. 앱 테마는 폰의 다크 모드와 상관없이 라이트로 시작해서(lib/theme.ts),
 * 폰 설정을 따라 어두운 판을 띄우면 어두운 로딩 → 밝은 첫 화면으로 번쩍였다.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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
const INK = [15, 23, 42];

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

/** 그림 모음(imageset) 하나를 쓴다 — images 는 Contents.json 의 images 칸 */
function writeImageSet(name, files, images) {
  const dir = `${ASSETS}/${name}.imageset`;
  mkdirSync(dir, { recursive: true });
  for (const [file, data] of Object.entries(files)) writeFileSync(`${dir}/${file}`, data);
  writeFileSync(
    `${dir}/Contents.json`,
    JSON.stringify({ images, info: { version: 1, author: 'xcode' } }, null, 2) + '\n'
  );
}

writeFileSync(
  `${ASSETS}/AppIcon.appiconset/AppIcon-512@2x.png`,
  await opaque(Buffer.from(markSvg(1024, '#ffffff', 512)), '#ffffff')
);

/*
 * 시작 화면 — 한가운데 큰 B 하나. 2732×2732 네모를 가운데 기준으로 화면에 꽉 차게(긴 변이 그림 한 변)
 * 보여서, B 높이는 화면 긴 변 × 437/2732(약 16%)가 된다. 앱이 켜지면 시작 연출 판이 이 그림과 같은
 * 자리 · 같은 크기의 B 를 그려 이어 받고 곧바로 움직인다 — MainViewController.swift 의 splashSidePx ·
 * splashMarkPx 와 같아야 넘어가는 순간이 안 보인다.
 */
const SPLASH = 2732;
const SPLASH_MARK_PX = 437;
const splash = await opaque(Buffer.from(markSvg(SPLASH, LIGHT_BG, SPLASH_MARK_PX)), LIGHT_BG);

/* 1x · 2x · 3x 모두 같은 그림(Xcode 템플릿과 같은 방식). 예전 어두운 판은 지운다. */
const splashFiles = {};
const splashImages = [];
for (const scale of ['1x', '2x', '3x']) {
  const name = `splash-${scale}.png`;
  splashFiles[name] = splash;
  rmSync(`${ASSETS}/Splash.imageset/splash-${scale}-dark.png`, { force: true });
  splashImages.push({ idiom: 'universal', filename: name, scale });
}
writeImageSet('Splash', splashFiles, splashImages);

/*
 * 시작 연출의 글자 — 'ULLPEN LOG'. 연출 판이 큰 B 를 줄여 이 그림의 B 자리에 내려놓고 글자를 왼쪽부터
 * 펼친다(2026-09-30 사용자: 넷플릭스 'N' 처럼, 튀지 않게).
 *
 * 짜임은 사이트 머리의 이름(components/logo.tsx 의 Wordmark)과 같다 — 글꼴 Bebas Neue · 자간 0.02em ·
 * B 높이 0.7em(대문자 높이) · B 와 글자 사이 0.07em. 크게(글자 400px) 그린 뒤 글자만 남긴다 — B 자리는
 * 비우고, 둘레는 B 높이의 WORD_PAD 만큼(왼쪽 · 위 · 아래는 B 에서, 오른쪽은 글자 끝에서) 둔다. 그래서
 * 앱은 그림 크기만 보고 B 자리를 안다(MainViewController.swift 의 wordPad 와 같아야 한다).
 */
const WORD_PAD = 0.05;
const WORD_FONT_PX = 400;
const CANVAS = { width: 2400, height: 800 };

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
    throw new Error('크롬(또는 엣지)을 못 찾았습니다 — CHROME_PATH 에 실행 파일 경로를 주세요.');
  }
  return found;
}

const wordHtml = `<!doctype html>
<html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bebas+Neue&display=block">
<style>
  html, body { margin: 0; width: ${CANVAS.width}px; height: ${CANVAS.height}px; background: #fff; overflow: hidden; }
  .wm { position: absolute; left: 160px; top: 200px; display: inline-flex; align-items: baseline;
        white-space: nowrap; font-family: 'Bebas Neue', sans-serif; font-size: ${WORD_FONT_PX}px;
        line-height: 1; letter-spacing: 0.02em; color: #000; }
  .wm svg { height: 0.7em; width: auto; margin-right: 0.07em; fill: ${BRAND}; }
</style></head>
<body><div class="wm"><svg viewBox="0 0 ${MARK_W} ${MARK_H}"><path d="${MARK_PATH}"/></svg>ULLPEN LOG</div></body></html>`;

const work = mkdtempSync(join(tmpdir(), 'bullpen-intro-'));
let wordInfo;
try {
  const page = join(work, 'word.html');
  const shot = join(work, 'word.png');
  writeFileSync(page, wordHtml);
  execFileSync(
    findChrome(),
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      `--window-size=${CANVAS.width},${CANVAS.height}`,
      '--virtual-time-budget=10000',
      `--user-data-dir=${join(work, 'profile')}`,
      `--screenshot=${shot}`,
      pathToFileURL(page).href,
    ],
    { stdio: 'ignore' }
  );

  const { data, info } = await sharp(shot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const px = (x, y) => {
    const i = (y * width + x) * 3;
    return [data[i], data[i + 1], data[i + 2]];
  };
  const box = () => ({ x1: Infinity, y1: Infinity, x2: -1, y2: -1 });
  const grow = (b, x, y) => {
    b.x1 = Math.min(b.x1, x);
    b.y1 = Math.min(b.y1, y);
    b.x2 = Math.max(b.x2, x);
    b.y2 = Math.max(b.y2, y);
  };

  /* B(파랑)의 자리 */
  const mark = box();
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const [r, , b] = px(x, y);
      if (b - r > 60 && b > 120) grow(mark, x, y);
    }
  if (mark.x2 < 0) throw new Error('글자 그림: B 를 못 찾았습니다(크롬 그림이 비었는지 보세요).');

  /* 글자(검정)의 자리 — B 오른쪽에서만 */
  const text = box();
  for (let y = 0; y < height; y++)
    for (let x = mark.x2 + 3; x < width; x++) {
      const [r, g, b] = px(x, y);
      if (Math.max(r, g, b) < 200 && Math.abs(b - r) < 40) grow(text, x, y);
    }
  if (text.x2 < 0) throw new Error('글자 그림: 글자를 못 찾았습니다(글꼴을 못 받았는지 보세요).');

  const markH = mark.y2 - mark.y1 + 1;
  const markW = mark.x2 - mark.x1 + 1;
  const pad = Math.round(WORD_PAD * markH);
  const crop = { left: mark.x1 - pad, top: mark.y1 - pad, right: text.x2 + pad, bottom: mark.y2 + pad };
  if (text.y1 < crop.top || text.y2 > crop.bottom) {
    throw new Error(`글자 그림: 글자가 B 높이 ± ${WORD_PAD} 밖으로 나갑니다 — WORD_PAD 를 키우세요.`);
  }
  const w = crop.right - crop.left + 1;
  const h = crop.bottom - crop.top + 1;

  /* 글자만 남긴 투명 그림 — 검은 정도를 불투명도로, 색은 --color-ink. B 자리(와 그 가장자리)는 비운다 */
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const sx = crop.left + x;
      const [r, g, b] = px(sx, crop.top + y);
      const o = (y * w + x) * 4;
      out[o] = INK[0];
      out[o + 1] = INK[1];
      out[o + 2] = INK[2];
      out[o + 3] = sx <= mark.x2 + 2 ? 0 : 255 - Math.round((r + g + b) / 3);
    }
  const png = await sharp(out, { raw: { width: w, height: h, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeImageSet('IntroWord', { 'intro-word.png': png }, [
    { idiom: 'universal', filename: 'intro-word.png' },
  ]);
  wordInfo = `${w}×${h}px · B ${markW}×${markH}px(가로÷세로 ${(markW / markH).toFixed(3)}, 원본 ${(
    MARK_W / MARK_H
  ).toFixed(3)}) · 둘레 ${pad}px`;
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log('앱 아이콘 1장 · 시작 화면(큰 B, 밝은 판) 3장 · 시작 연출 글자 1장을 만들었습니다.');
console.log(`시작 연출 글자: ${wordInfo}`);
