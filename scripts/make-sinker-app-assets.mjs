/**
 * 새 앱(native/)의 아이콘 · 시작 화면 그림을 싱커 로고로 만든다.
 *
 *   node scripts/make-sinker-app-assets.mjs
 *
 *   native/assets/icon.png    1024 · 흰 바탕 꽉 채움(아이폰은 투명 모서리를 검게 칠한다) · 로고 높이 한 변의 50%
 *   native/assets/splash.png  1024 · 투명 바탕(바탕색은 app.json splash.backgroundColor) · 로고 높이 한 변의 50%
 *
 * 로고 높이 50% 는 예전 B 그림과 같다 — app.json splash imageWidth 300 이면 로고 150pt 로, 앱 시작 연출(native/src/shell/intro.tsx)의
 * 큰 로고와 같은 크기 · 자리라 시작 화면이 걷히는 순간이 이어진다. 바꾸면 바닥 판 지문이 바뀌어 다음 푸시에서 앱을 새로 굽는다.
 * 모양 · 색은 components/logo.tsx 의 MARK_PATH · --color-brand 와 같다(2026-10-22 금윤호가 준 초안 · 임시 로고).
 */
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';

const BRAND = '#0297e4';
const MARK_W = 1006;
const MARK_H = 1001;
const MARK_PATH =
  'M275 0l631 0l17 2l18 7l13 9l9 12l5 15l1 15l-4 15l-8 14l-119 116l-14 11l-20 10l-15 4l-21 2l-75-1l-19 1l-350 0l-18 6l-10 6l-6 5l-6 7l-5 8l-5 18l-1 10l2 12l5 12l6 9l7 8l8 6l12 5l12 3l401 1l16 2l16 4l23 10l18 13l74 72l42 43l8 12l5 12l5 14l2 15l2 37l-1 103l0 64l1 8l5 8l6 5l31 4l7 2l7 5l7 7l4 7l2 11l-1 8l-4 12l-11 13l-144 139l-21 16l-15 6l-14 1l-16-3l-14-8l-16-13l-135-136l-8-8l-5-10l-3-10l1-13l4-10l6-8l7-5l8-3l34-4l8-6l3-8l0-135l-2-9l-4-11l-8-9l-9-8l-15-7l-22-3l-399 0l-27-4l-13-5l-13-6l-11-8l-10-7l-103-102l-13-14l-8-14l-9-20l-3-25l-1-61l1-50l1-14l4-14l6-14l6-11l17-22l98-97l58-56l17-11l21-10l20-6ZM198 663l355 0l11 1l10 3l8 4l10 8l8 9l5 9l3 9l1 11l-1 10l-2 11l-7 12l-9 11l-19 19l-7 9l-5 12l-6 27l-11 21l-8 9l-10 9l-13 7l-12 5l-22 3l-440-1l-9-2l-11-6l-8-9l-5-7l-3-12l0-10l3-9l5-10l13-14l81-79l41-38l11-8l14-7l15-4Z';

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

writeFileSync(
  'native/assets/icon.png',
  await sharp(Buffer.from(svg(1024, 0.5, '#ffffff'))).flatten({ background: '#ffffff' }).png().toBuffer()
);
writeFileSync('native/assets/splash.png', await sharp(Buffer.from(svg(1024, 0.5))).png().toBuffer());
console.log('앱 아이콘 · 시작 화면 그림을 만들었습니다.');
