/**
 * 투구 분석 실험실(베타) 샘플 정보 자체 검사 — lib/pitch-lab-meta.ts(순수, DB · 저장소 없음).
 *
 *   npm run pitch-lab:test
 */
import { isLabId, isLabView, labMetaChips, readLabMeta } from '../lib/pitch-lab-meta.ts';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? 'OK  ' : '실패'} ${name}${detail ? ' — ' + detail : ''}`);
}

const NOW = '2026-10-08T05:00:00.000Z';

check(
  '샘플 번호는 UUID 만(경로에 들어가므로)',
  isLabId('2b0c7c1e-8f7a-4d1e-9a51-0c9d2f3e4a5b') &&
    !isLabId('../x') &&
    !isLabId('2b0c7c1e-8f7a-4d1e-9a51-0c9d2f3e4a5b/..') &&
    !isLabId(42)
);
check('쪽은 옆 · 뒤만', isLabView('side') && isLabView('back') && !isLabView('front'));

const d = readLabMeta({}, NOW);
check(
  '빈 정보 = 기본값(동시 촬영 · 화면 녹화 · 오른손 · 슬로모 모름)',
  d.synced && d.screenRecorded && d.hand === 'R' && d.slowmoFps === null && d.createdAt === NOW
);

const m = readLabMeta(
  {
    synced: false,
    slowmoFps: 240,
    screenRecorded: false,
    hand: 'L',
    heightCm: 182,
    distanceM: 6.5,
    memo: '  직구, 세게  ',
    files: { side: { name: 'a.mp4', size: 1000 }, back: { name: 'b.mp4', size: 2000 } },
  },
  NOW
);
check(
  '받은 값 그대로',
  !m.synced &&
    m.slowmoFps === 240 &&
    !m.screenRecorded &&
    m.hand === 'L' &&
    m.heightCm === 182 &&
    m.distanceM === 6.5 &&
    m.memo === '직구, 세게' &&
    m.files.side?.name === 'a.mp4' &&
    m.files.back?.size === 2000
);

const bad = readLabMeta(
  {
    slowmoFps: 60,
    hand: 'X',
    heightCm: 900,
    distanceM: -1,
    memo: 'x'.repeat(900),
    files: { side: { name: '', size: 5 }, front: { name: 'c', size: 1 } },
    createdAt: 7,
  },
  NOW
);
check(
  '모양이 틀린 칸은 버리거나 기본값',
  bad.slowmoFps === null &&
    bad.hand === 'R' &&
    bad.heightCm === null &&
    bad.distanceM === null &&
    (bad.memo?.length ?? 0) === 500 &&
    Object.keys(bad.files).length === 0 &&
    bad.createdAt === NOW
);
check('null · 문자열도 받음', readLabMeta(null, NOW).hand === 'R' && readLabMeta('x', NOW).synced);

check(
  '카드 표시',
  labMetaChips(m).join(' · ') ===
    '한 대로 나눠 찍음 · 슬로모 240 · 왼손 · 원본 · 키 182cm · 거리 6.5m',
  labMetaChips(m).join(' · ')
);
check('표시 글에 줄표 없음', !labMetaChips(d).some((t) => t.includes('—')));

console.log(`\n통과 ${passed} · 실패 ${failed}`);
if (failed > 0) process.exit(1);
