/**
 * 덕아웃 앱(native/ 의 APP_VARIANT=dugout)의 아이콘 · 시작 화면 그림을 덕아웃 로고로 만든다.
 *
 *   node scripts/make-dugout-app-assets.mjs
 *
 *   native/assets/dugout/icon.png    1024 · 흰 바탕 꽉 채움 · 로고 너비 한 변의 60%
 *   native/assets/dugout/splash.png  1024 · 투명 바탕(바탕색은 app.json splash.backgroundColor)
 *
 * 모양 · 색은 components/logo.tsx 의 DugoutMark · --color-dugout 과 같다(2026-10-22 금윤호가 준 그림 — 바뀌면 같이 고친다).
 * 바꾸면 덕아웃 앱의 바닥 판 지문이 바뀌어 다음 푸시에서 덕아웃 앱을 새로 굽는다.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import sharp from 'sharp';

const GREEN = '#1d8a4f';
/* 64 칸 그림에서 로고가 차지하는 상자(지붕 선 두께 7.2 포함) */
const BOX = { x: 3.3, y: 12.0, w: 57.7, h: 39.4 };

function svg(size, ground) {
  const k = (size * 0.6) / BOX.w;
  const tx = size / 2 - (BOX.x + BOX.w / 2) * k;
  const ty = size / 2 - (BOX.y + BOX.h / 2) * k;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  ${ground ? `<rect width="${size}" height="${size}" fill="${ground}" />` : ''}
  <g transform="translate(${tx} ${ty}) scale(${k})" fill="${GREEN}">
    <path d="M6.9 29.2 32.1 15.6 57.4 29.2" fill="none" stroke="${GREEN}" stroke-width="7.2" stroke-linecap="round" stroke-linejoin="round" />
    <rect x="11.2" y="33.3" width="42" height="7.7" rx="2.3" />
    <rect x="14.4" y="41.8" width="6.9" height="9.6" rx="2.3" />
    <rect x="43.1" y="41.8" width="6.9" height="9.6" rx="2.3" />
  </g>
</svg>`;
}

mkdirSync('native/assets/dugout', { recursive: true });
writeFileSync(
  'native/assets/dugout/icon.png',
  await sharp(Buffer.from(svg(1024, '#ffffff'))).flatten({ background: '#ffffff' }).png().toBuffer()
);
writeFileSync('native/assets/dugout/splash.png', await sharp(Buffer.from(svg(1024))).png().toBuffer());
console.log('덕아웃 앱 아이콘 · 시작 화면 그림을 만들었습니다.');
