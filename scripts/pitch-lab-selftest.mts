/**
 * 투구 분석 실험실(베타) 샘플 정보 자체 검사 — lib/pitch-lab-meta.ts(순수, DB · 저장소 없음).
 *
 *   npm run pitch-lab:test
 */
import { groupLabSamples, isLabId, isLabView, labCardChips, labMetaChips, LAB_SUBJECT_FOLDERS, readLabMeta } from '../lib/pitch-lab-meta.ts';
import { LAB_FAIL_FIX, LAB_GUIDE_CHECKS, labGuideHref } from '../lib/pitch-lab-guide.ts';
import { V2_VIDEO_FAULT } from '../lib/pitch-3d/v2/contract.ts';

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
    distances: { side: 5, back: 4.5, front: 3 },
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
    m.distances.side === 5 &&
    m.distances.back === 4.5 &&
    !('front' in m.distances) &&
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
    distances: { side: 0, back: 'x' },
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
    Object.keys(bad.distances).length === 0 &&
    (bad.memo?.length ?? 0) === 500 &&
    Object.keys(bad.files).length === 0 &&
    bad.createdAt === NOW
);
check('null · 문자열도 받음', readLabMeta(null, NOW).hand === 'R' && readLabMeta('x', NOW).synced);

check(
  '카드 표시',
  labMetaChips(m).join(' · ') ===
    '마운드 · 한 대로 나눠 찍음 · 슬로모 240 · 왼손 · 키 182cm · 옆 5m · 뒤 4.5m',
  labMetaChips(m).join(' · ')
);
/* 마커 샘플(2026-10-12) — 종류를 읽고 표시 맨 앞에 '마커' */
check('종류 — 없으면 일반 샘플', readLabMeta({}, NOW).kind === 'sample');
{
  /* 사람 폴더 넷 — 늘 이 차례(비어 있어도), 다른 이름은 '기타' 앞, 빈 이름은 '기타'(2026-10-22 김민) */
  const g = groupLabSamples([{ s: '금윤호' }, { s: null }, { s: '홍길동' }, { s: '김민' }], (x) => x.s, LAB_SUBJECT_FOLDERS);
  check(
    '사람 폴더 — 김민 · 금윤호 · 정강민(빈) · 다른 이름 · 기타',
    g.map((x) => `${x.name}${x.items.length}`).join() === '김민1,금윤호1,정강민0,홍길동1,기타1',
    g.map((x) => `${x.name}${x.items.length}`).join()
  );
}
check('종류 — 마커', readLabMeta({ kind: 'marker' }, NOW).kind === 'marker');
check('마커 표시가 맨 앞', labMetaChips(readLabMeta({ kind: 'marker' }, NOW))[0] === '마커');
check(
  '카드 표시 — 동시 촬영 · 원본은 안 적고, 폰마다 거리가 없으면 옛 한 칸 거리',
  labMetaChips(readLabMeta({ synced: true, screenRecorded: false, distanceM: 6 }, NOW)).join(' · ') ===
    '마운드 · 슬로모 모름 · 오른손 · 거리 6m'
);
check('표시 글에 줄표 없음', !labMetaChips(d).some((t) => t.includes('—')));
check(
  '목록 카드 — 기본값 · 모름 · 키 · 거리는 빼고 다를 때만',
  labCardChips(m).join(' · ') === '한 대로 나눠 찍음 · 왼손' &&
    labCardChips(readLabMeta({ synced: true, screenRecorded: false, distanceM: 6 }, NOW)).length === 0,
  labCardChips(m).join(' · ')
);

/* 촬영 안내(2026-10-15) — lib/pitch-lab-guide.ts */
check(
  '촬영 안내 — 영상 탓 실패마다 고칠 것이 있음',
  [...V2_VIDEO_FAULT].every((code) => LAB_FAIL_FIX[code]?.fix),
  [...V2_VIDEO_FAULT].filter((code) => !LAB_FAIL_FIX[code]).join(', ')
);
check(
  '촬영 안내 — 확인 목록 열쇠가 겹치지 않음',
  new Set(LAB_GUIDE_CHECKS.map((c) => c.id)).size === LAB_GUIDE_CHECKS.length
);
const guideTexts = [
  ...LAB_GUIDE_CHECKS.map((c) => c.title),
  ...Object.values(LAB_FAIL_FIX).map((f) => f?.fix ?? ''),
];
check('촬영 안내 — 글에 줄표 없음', !guideTexts.some((t) => t.includes('—')));
check(
  '촬영 안내 — 해요체로 끝남',
  guideTexts.filter((t) => t.endsWith('.')).every((t) => /요\.$/.test(t)),
  guideTexts.filter((t) => t.endsWith('.') && !/요\.$/.test(t)).join(' / ')
);
check('촬영 안내 주소', labGuideHref() === '/videos/lab/guide' && labGuideHref('frame') === '/videos/lab/guide#frame');

console.log(`\n통과 ${passed} · 실패 ${failed}`);
if (failed > 0) process.exit(1);
