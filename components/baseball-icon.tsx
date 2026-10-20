import { createLucideIcon } from 'lucide-react';

/**
 * 야구공 아이콘 — 투구 기록(메뉴 · 홈 요약의 '투구')을 가리킨다.
 *
 * lucide 에는 야구공이 없어서, 예전 로고의 공(파란 원 속 야구공)과 같은
 * 모양을 lucide 방식으로 그렸다 — 크기 · 선 굵기 · 색을 다른 메뉴 아이콘과 똑같이
 * 받는다(className, strokeWidth). 공 테두리, 바깥으로 휜 좌우 솔기, 솔기마다 실밥
 * 두 땀. 로고처럼 네 땀을 그으면 메뉴 크기(20px)에서 뭉쳐 보인다.
 */
export const Baseball = createLucideIcon('baseball', [
  ['circle', { cx: '12', cy: '12', r: '10', key: 'ball' }],
  ['path', { d: 'M5.2 4.9C8.7 8 8.7 16 5.2 19.1', key: 'seam-left' }],
  ['path', { d: 'M18.8 4.9C15.3 8 15.3 16 18.8 19.1', key: 'seam-right' }],
  ['path', { d: 'M5.6 9.3 8.4 10M5.6 14.7 8.4 14', key: 'stitch-left' }],
  ['path', { d: 'M18.4 9.3 15.6 10M18.4 14.7 15.6 14', key: 'stitch-right' }],
]);

/**
 * 야구 방망이 — 타격(2026-10-20 하단 탭 셋째). lucide 에 없어 야구공과 같은 방식으로 그렸다 — 오른쪽 위가 굵은 몸통,
 * 왼쪽 아래로 가늘어지는 손잡이, 끝에 동그란 노브.
 */
export const BaseballBat = createLucideIcon('baseball-bat', [
  ['path', { d: 'M15.3 3.6a3.6 3.6 0 0 1 5.1 5.1L9.2 16.4l-1.6-1.6Z', key: 'barrel' }],
  ['path', { d: 'M8.4 15.6 5.2 18.8', key: 'handle' }],
  ['circle', { cx: '4.4', cy: '19.6', r: '1.2', key: 'knob' }],
]);
