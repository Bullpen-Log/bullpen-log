import assert from 'node:assert/strict';
import {
  EMPTY_VIDEO_FILTER,
  filterVideos,
  clearChip,
  filterChips,
  type MyVideoItem,
} from '../lib/my-videos.ts';
import { readVideoBackup } from '../lib/video-backup.ts';
import { readLabPractice } from '../lib/lab-journey.ts';
import { readLabMeta } from '../lib/pitch-lab-meta.ts';

let n = 0;
const check = (name: string, ok: unknown) => {
  assert.ok(ok, name);
  n++;
};
const path = 'owner/local-11111111-1111-4111-8111-111111111111';
const log = {
  id: 'log',
  kind: 'pitch' as const,
  date: '2026-11-04',
  type: '불펜',
  count: 30,
  memo: '이완',
  cuesGood: ['릴리스'],
  cuesBad: ['제구'],
  satisfaction: 5,
};
const item: MyVideoItem = {
  path,
  storage: 'phone',
  sport: 'pitch',
  date: log.date,
  dateSource: 'manual',
  origin: 'album',
  note: '이 영상은 아쉬움',
  revisit: true,
  saved: true,
  createdAt: null,
  durationSec: 4,
  logs: [log],
  clip: null,
};
const f = {
  ...EMPTY_VIDEO_FILTER,
  feeling: { cues: { 릴리스: 'good' as const }, satisfaction: 'good' as const },
};
check('feeling filters use linked record', filterVideos([item], f).length === 1);
check(
  'match explains record, not individual evaluation',
  filterVideos([item], f)[0].where === 'cue' &&
    filterVideos([item], f)[0].snippet?.includes(log.date)
);
check('individual note stays separate', item.note === '이 영상은 아쉬움');
check(
  'old logs without satisfaction excluded only when filtering',
  filterVideos([{ ...item, logs: [{ ...log, satisfaction: undefined }] }], f).length ===
    0
);
check(
  'old logs retained without new filters',
  filterVideos(
    [{ ...item, logs: [{ ...log, satisfaction: undefined }] }],
    EMPTY_VIDEO_FILTER
  ).length === 1
);
check(
  'unlinked videos cannot satisfy feeling filters',
  filterVideos([{ ...item, logs: [] }], f).length === 0
);
check(
  'good and bad are distinct',
  filterVideos([item], {
    ...f,
    feeling: { cues: { 릴리스: 'bad' }, satisfaction: null },
  }).length === 0
);
check(
  'conditions must match same linked record',
  filterVideos(
    [
      {
        ...item,
        logs: [
          { ...log, satisfaction: 1 },
          { ...log, id: 'two', cuesGood: [] },
        ],
      },
    ],
    f
  ).length === 0
);
check(
  'session type and feelings must match same record',
  filterVideos(
    [
      {
        ...item,
        logs: [
          { ...log, type: '경기' },
          { ...log, cuesGood: [] },
        ],
      },
    ],
    { ...f, types: ['불펜'] }
  ).length === 0
);
check(
  'clear feeling leaves other filters',
  clearChip({ ...f, favoriteOnly: true }, 'cue:릴리스').favoriteOnly &&
    !clearChip(f, 'cue:릴리스').feeling?.cues['릴리스']
);
check(
  'feeling chips present',
  filterChips(f, log.date).some((c) => c.key === 'satisfaction')
);
check(
  'text search and feeling combine',
  filterVideos([item], { ...f, text: '없는말' }).length === 0
);

const backup = {
  format: 'sinker-original',
  version: 1,
  path,
  file: 'original.mov',
  bytes: 999,
  sha256: 'a'.repeat(64),
  exportedAt: '',
  date: log.date,
  note: item.note,
};
check('valid backup manifest', readVideoBackup(backup, path));
for (const patch of [
  { version: 2 },
  { path: 'another/local-x' },
  { file: '../original.mov' },
  { file: '/original.mov' },
  { file: 'original.txt' },
  { sha256: 'x'.repeat(64) },
  { bytes: -1 },
  { bytes: Infinity },
])
  check(
    'reject invalid backup ' + JSON.stringify(patch),
    !readVideoBackup({ ...backup, ...patch }, path)
  );
check(
  'legacy photo identifiers cannot masquerade as restorable file',
  !readVideoBackup(backup, 'owner/local-UUID~L0~001')
);

const practice = {
  id: '22222222-2222-4222-8222-222222222222',
  date: log.date,
  goal: '  릴리스  ',
  note: ' 힘을 빼기 ',
  savedAt: '',
};
check('normalize practice', readLabPractice(practice)?.goal === '릴리스');
for (const patch of [
  { date: '2026-02-30' },
  { id: '../bad' },
  { goal: '' },
  { goal: 'a'.repeat(121) },
  { note: 'a'.repeat(501) },
])
  check(
    'reject bad practice ' + Object.keys(patch)[0],
    !readLabPractice({ ...practice, ...patch })
  );
const meta = readLabMeta(
  {
    sourcePaths: { side: path, back: '../outside', cam3: path },
    previousReportId: practice.id,
  },
  '2026-11-04T00:00:00Z'
);
check(
  'preserve real source slot only',
  meta.sourcePaths?.side === path &&
    !meta.sourcePaths.back &&
    !('cam3' in meta.sourcePaths)
);
check('explicit retake pointer survives parser', meta.previousReportId === practice.id);
check(
  'old metadata has no invented linkage',
  !readLabMeta({}, '').previousReportId && !readLabMeta({}, '').sourcePaths
);
console.log(`prelaunch functional rules: ${n} checks passed`);
