/**
 * 관리자 참고자료(EX-REF02) 셀프테스트 — 지어낸 값만 쓴다(실제 자료 · 경로 · 옮긴 글 없음).
 * node --import ./scripts/alias-register.mjs scripts/admin-references-selftest.mts
 */
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canonicalYouTubeUrl, parseCatalog, parseDetail, validEntryId, CATALOG_KEY, type Entry } from '../lib/admin-references/schema.ts';
import { loadCatalogFor, loadDetailFor, originalHref, publicDetailOf, type ReferenceSource, type SourceRead } from '../lib/admin-references/load.ts';
import {
  bibNote,
  bibliographyView,
  collectionsOf,
  coverageOf,
  facetCounts,
  filterEntries,
  listItemOf,
  mergedSeconds,
  pagesText,
  readFilters,
  RIGHTS_LABEL,
  TABLE_CELL_REM,
  tableMinRem,
  reviewLabel,
  totalsOf,
} from '../lib/admin-references/view.ts';
import { CHUNK_BYTES, dispositionOf, normalizeRange, serveOriginal, type AssetFetch, type UpstreamResult } from '../lib/admin-references/original.ts';
import { isReferenceKey, localAssetFetch, localSource } from '../lib/admin-references/local-source.ts';

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) passed++;
  else failed++;
  console.log(`  ${ok ? 'OK  ' : '실패'} ${name}${detail ? ' — ' + detail : ''}`);
}

/* ─────────────── 지어낸 자료 ─────────────── */

const SHA = 'a'.repeat(64);
const key = (id: string) => `admin-references/v1/entries/${id}.json`;

function entry(over: Record<string, unknown> = {}) {
  const id = (over.id as string) ?? 'doc_alpha1';
  return {
    id,
    title: '가짜 문서 하나',
    collection: '묶음 가',
    kind: 'document',
    language: 'en',
    categories: ['strength', 'power'],
    availability: 'pending',
    rights: 'pending',
    sha256: SHA,
    bytes: 1000,
    pageCount: 10,
    coverage: { textPages: [1, 2, 3, 3], visualPages: [3, 4], videoIntervals: [], audioIntervals: [] },
    reviewStatus: 'partial',
    topics: ['스쿼트 깊이'],
    searchText: '숨은 낱말 qwertyfind',
    detailKey: key(id),
    ...over,
  };
}

const VIDEO = entry({
  id: 'vid_beta22',
  title: '가짜 영상',
  collection: '영상 모음',
  kind: 'video',
  categories: ['pitching'],
  pageCount: undefined,
  durationSeconds: 100,
  coverage: { textPages: [], visualPages: [], videoIntervals: [[0, 10], [5, 15], [20, 30], [30, 31]], audioIntervals: [[0, 40]] },
  reviewStatus: 'unread',
  topics: [],
  searchText: undefined,
});
const UNREAD = entry({ id: 'res_gamma3', title: '안 읽은 연구', collection: '묶음 가', kind: 'research', categories: ['sources'], pageCount: undefined, coverage: { textPages: [], visualPages: [], videoIntervals: [], audioIntervals: [] }, reviewStatus: 'unread', topics: [], searchText: undefined });
const LICENSED = entry({ id: 'lic_delta4', title: '허락 받은 문서', rights: 'licensed-private' });

function catalog(entries: unknown[] = [entry(), VIDEO, UNREAD, LICENSED], extra: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1,
    title: '가짜 목록',
    updatedAt: '2026-11-16T00:00:00Z',
    entries,
    bibliography: [
      { id: 'b1', url: 'https://example.org/paper', kind: 'research', title: null, metadataStatus: 'pending', uses: [{ reviewId: 'r1', exercise: '가짜 운동', note: 'https://example.org/paper', recordFile: '/secret/path.json', field: 'x' }] },
      { id: 'b2', url: 'https://example.org/other', kind: 'guideline', title: '지침 하나', publisher: '학회', year: 2020, metadataStatus: 'verified', uses: [{ exercise: '다른 운동', note: '메모' }] },
    ],
    ...extra,
  };
}

function detail(id: string, kind = 'document', over: Record<string, unknown> = {}) {
  return {
    id,
    kind,
    title: '가짜 문서 하나',
    collection: '묶음 가',
    digestKo: '쉬운 요약 <script>alert(1)</script>',
    sections: [
      { id: 's1', title: '옮김', kind: 'translation', sourcePages: [2], textKo: '옮긴 글' },
      { id: 's2', title: '표', kind: 'table', sourcePages: [3], textKo: '', table: { columns: ['가', '나'], rows: [['1', '2']] } },
    ],
    glossary: [{ en: 'squat', ko: '스쿼트', meaning: '앉았다 일어서기' }],
    claims: [
      {
        id: 'c1',
        originalClaimKo: '원래 주장',
        sourcePages: [2],
        decision: 'qualify',
        interpretationKo: '조건부',
        evidence: [{ title: '연구', url: 'https://doi.org/10.0/x', year: 2021, population: '성인', methods: '무작위', outcome: '증가', limitations: '작음', applicability: 'inferred' }],
      },
    ],
    limitationsKo: ['한계 하나'],
    ...over,
  };
}

const ASSET = { key: 'admin-references/v1/assets/lic_delta4.pdf', mime: 'application/pdf', filename: '원본 "책".pdf', rightsConfirmed: true };

/** 가짜 저장소 — 읽은 열쇠를 적어 둔다 */
function memSource(files: Record<string, unknown>, fail: Record<string, SourceRead> = {}) {
  const reads: string[] = [];
  const source: ReferenceSource = {
    async read(k, max) {
      reads.push(k);
      if (fail[k]) return fail[k];
      if (!(k in files)) return { ok: false, reason: 'missing' };
      const v = files[k];
      const text = typeof v === 'string' ? v : JSON.stringify(v);
      if (Buffer.byteLength(text) > max) return { ok: false, reason: 'too_large' };
      return { ok: true, text };
    },
  };
  return { source, reads };
}

const files = () => ({
  [CATALOG_KEY]: catalog(),
  [key('doc_alpha1')]: detail('doc_alpha1', 'document', { asset: { ...ASSET, key: 'admin-references/v1/assets/doc_alpha1.pdf' } }),
  [key('vid_beta22')]: detail('vid_beta22', 'video', { title: '가짜 영상', sections: [{ id: 'v1', title: '구간', kind: 'translation', startSeconds: 5, endSeconds: 20, textKo: '말' }], claims: [] }),
  [key('lic_delta4')]: detail('lic_delta4', 'document', { asset: ASSET }),
});

const ADMIN = { role: 'ADMIN' };
/** 목록에서 읽은 허락 문서 항목(lic_delta4) */
const LICENSED_ENTRY = (): Entry => {
  const p = parseCatalog(catalog());
  if (!p.ok) throw new Error('fixture');
  return p.value.entries.find((x) => x.id === 'lic_delta4')!;
};
const viewers: [string, { role: string } | null][] = [
  ['로그인 안 함', null],
  ['일반(USER)', { role: 'USER' }],
  ['준관리자(MANAGER)', { role: 'MANAGER' }],
];

function recFetchLite() {
  const calls: string[] = [];
  const fetchAsset: AssetFetch = async (k) => {
    calls.push(k);
    return { status: 200, headers: { get: () => null }, body: new Response('X').body };
  };
  return { fetchAsset, calls };
}

/* ─────────────── 1. 보는 사람 ─────────────── */
console.log('\n[보는 사람 — 대표관리자만, 저장소를 묻기 전에]');
for (const [name, v] of viewers) {
  const m = memSource(files());
  const c = await loadCatalogFor(v, m.source);
  const d = await loadDetailFor(v, 'doc_alpha1', m.source);
  check(`${name}: 목록 · 한 건 막힘`, !c.ok && c.reason === 'forbidden' && !d.ok && d.reason === 'forbidden');
  check(`${name}: 저장소 읽기 0번`, m.reads.length === 0, `${m.reads.length}번`);
}
{
  const m = memSource(files());
  const c = await loadCatalogFor(ADMIN, m.source);
  check('대표관리자: 목록 읽음', c.ok && c.catalog.entries.length === 4);
  const d = await loadDetailFor(ADMIN, 'doc_alpha1', m.source);
  check('대표관리자: 한 건 읽음', d.ok && d.detail.sections.length === 2);
}

/* ─────────────── 2. 없음 · 틀림은 보여 주지 않는다 ─────────────── */
console.log('\n[없음 · 틀림 — fail closed]');
{
  const missing = await loadCatalogFor(ADMIN, memSource({}).source);
  check('목록 없음 → missing', !missing.ok && missing.reason === 'missing');
  const down = await loadCatalogFor(ADMIN, memSource({}, { [CATALOG_KEY]: { ok: false, reason: 'unavailable' } }).source);
  check('저장소 못 닿음 → unavailable', !down.ok && down.reason === 'unavailable');
  const thrown = await loadCatalogFor(ADMIN, { read: async () => { throw new Error('/secret/path SUPABASE_KEY'); } });
  check('저장소가 던짐 → unavailable(까닭 글 안 실음)', !thrown.ok && thrown.reason === 'unavailable' && !JSON.stringify(thrown).includes('secret'));
  const notJson = await loadCatalogFor(ADMIN, memSource({ [CATALOG_KEY]: '{not json' }).source);
  check('JSON 아님 → malformed', !notJson.ok && notJson.reason === 'malformed');
  const big = await loadCatalogFor(ADMIN, memSource({}, { [CATALOG_KEY]: { ok: false, reason: 'too_large' } }).source);
  check('너무 큼 → too_large', !big.ok && big.reason === 'too_large');

  const bad: [string, unknown][] = [
    ['schemaVersion 2', { ...catalog(), schemaVersion: 2 }],
    ['updatedAt 아님', { ...catalog(), updatedAt: 'yesterday' }],
    ['같은 id 둘', catalog([entry(), entry({ detailKey: key('other_1x') })])],
    ['같은 detailKey 둘', catalog([entry(), entry({ id: 'doc_other9', detailKey: key('doc_alpha1') })])],
    ['detailKey 가 폴더 밖(..)', catalog([entry({ detailKey: 'admin-references/v1/entries/../../x.json' })])],
    ['detailKey 가 다른 폴더', catalog([entry({ detailKey: 'someuser/pitch-lab/x.json' })])],
    ['id 에 /', catalog([entry({ id: 'a/b/cdef' })])],
    ['모르는 분야', catalog([entry({ categories: ['magic'] })])],
    ['모르는 종류', catalog([entry({ kind: 'podcast' })])],
    ['모르는 권리', catalog([entry({ rights: 'public' })])],
    ['sha256 모양 틀림', catalog([entry({ sha256: 'xyz' })])],
    ['쪽이 쪽 수 밖', catalog([entry({ coverage: { textPages: [11], visualPages: [], videoIntervals: [], audioIntervals: [] } })])],
    ['쪽 수 모르는데 쪽 기록', catalog([entry({ pageCount: undefined })])],
    ['구간이 길이 밖', catalog([entry({ kind: 'video', durationSeconds: 10, coverage: { textPages: [], visualPages: [], videoIntervals: [[0, 11]], audioIntervals: [] }, pageCount: undefined })])],
    ['구간 시작 ≥ 끝', catalog([entry({ kind: 'video', durationSeconds: 10, coverage: { textPages: [], visualPages: [], videoIntervals: [[5, 5]], audioIntervals: [] }, pageCount: undefined })])],
    ['상태 값에 HTML', catalog([entry({ reviewStatus: '<b>done</b>' })])],
    ['출처 주소 javascript:', catalog(undefined, { bibliography: [{ id: 'b1', url: 'javascript:alert(1)', kind: 'research' }] })],
    ['출처 주소에 계정', catalog(undefined, { bibliography: [{ id: 'b1', url: 'https://u:p@example.org/', kind: 'research' }] })],
    ['같은 출처 id 둘', catalog(undefined, { bibliography: [{ id: 'b1', url: 'https://a.org/', kind: 'r' }, { id: 'b1', url: 'https://b.org/', kind: 'r' }] })],
    ['entries 가 배열 아님', { ...catalog(), entries: {} }],
    ['entries 3001개', { ...catalog(), entries: new Array(3001).fill(0) }],
  ];
  for (const [name, raw] of bad) {
    const r = parseCatalog(raw);
    /* 까닭에는 '어느 칸 · 몇 번'만 — 값 · 경로는 담지 않는다 */
    check(`목록 거절: ${name}`, !r.ok && /^[A-Za-z]+(:\d+)?$/.test(r.where), r.ok ? '통과됨' : r.where);
    const viaLoad = await loadCatalogFor(ADMIN, memSource({ [CATALOG_KEY]: raw }).source);
    if (!(!viaLoad.ok && viaLoad.reason === 'malformed')) check(`로더도 거절: ${name}`, false);
  }

  const e = parseCatalog(catalog()).ok ? (parseCatalog(catalog()) as { ok: true; value: { entries: Entry[] } }).value.entries[0] : null;
  const badDetail: [string, unknown][] = [
    ['id 다름', detail('doc_other1')],
    ['종류 다름', detail('doc_alpha1', 'video')],
    ['표 칸 수 다름', detail('doc_alpha1', 'document', { sections: [{ id: 's', title: 't', kind: 'table', textKo: '', table: { columns: ['a'], rows: [['1', '2']] } }] })],
    ['표 없는 표 칸', detail('doc_alpha1', 'document', { sections: [{ id: 's', title: 't', kind: 'table', textKo: '' }] })],
    ['같은 칸 id 둘', detail('doc_alpha1', 'document', { sections: [{ id: 's', title: 't', kind: 'note', textKo: 'x' }, { id: 's', title: 't', kind: 'note', textKo: 'y' }] })],
    ['같은 주장 id 둘', detail('doc_alpha1', 'document', { claims: [detail('x').claims[0], detail('x').claims[0]] })],
    ['판단 값 모름', detail('doc_alpha1', 'document', { claims: [{ ...detail('x').claims[0], decision: 'maybe' }] })],
    ['근거 주소 data:', detail('doc_alpha1', 'document', { claims: [{ ...detail('x').claims[0], evidence: [{ ...detail('x').claims[0].evidence[0], url: 'data:text/html,hi' }] }] })],
    ['문서에 영상 시각', detail('doc_alpha1', 'document', { claims: [{ ...detail('x').claims[0], sourceSeconds: [3] }] })],
    ['원본 열쇠 폴더 밖', detail('doc_alpha1', 'document', { asset: { ...ASSET, key: 'admin-references/v1/assets/../entries/x.json' } })],
    ['원본 열쇠 다른 자리', detail('doc_alpha1', 'document', { asset: { ...ASSET, key: 'intake/abc/original.mov' } })],
    ['원본 형식 HTML', detail('doc_alpha1', 'document', { asset: { ...ASSET, mime: 'text/html' } })],
    ['원본 형식 SVG', detail('doc_alpha1', 'document', { asset: { ...ASSET, mime: 'image/svg+xml' } })],
  ];
  for (const [name, raw] of badDetail) {
    const r = e ? parseDetail(raw, e) : { ok: true };
    check(`한 건 거절: ${name}`, !r.ok);
  }
  const fs = files();
  fs[key('doc_alpha1')] = detail('doc_other1');
  const viaLoad = await loadDetailFor(ADMIN, 'doc_alpha1', memSource(fs).source);
  check('로더: 한 건 모양 틀림 → malformed', !viaLoad.ok && viaLoad.reason === 'malformed');
  const fs2 = files();
  delete fs2[key('doc_alpha1')];
  const gone = await loadDetailFor(ADMIN, 'doc_alpha1', memSource(fs2).source);
  check('로더: 한 건 파일 없음 → missing', !gone.ok && gone.reason === 'missing');
  const brokenCat = await loadDetailFor(ADMIN, 'doc_alpha1', memSource({ [CATALOG_KEY]: { schemaVersion: 9 } }).source);
  check('로더: 목록이 틀리면 한 건도 안 보임', !brokenCat.ok && brokenCat.reason === 'malformed');
}

/* ─────────────── 3. 번호 · 열쇠 ─────────────── */
console.log('\n[번호 · 열쇠 — 주소가 열쇠를 정하지 못한다]');
for (const id of ['../catalog', 'a/b/cdefg', '', 'abc', '..%2Fx1234', 'x'.repeat(81), 'doc alpha1', null, 42]) {
  const m = memSource(files());
  const d = await loadDetailFor(ADMIN, id, m.source);
  check(`번호 거절: ${JSON.stringify(id)?.slice(0, 20)}`, !d.ok && d.reason === 'not_found' && m.reads.length === 0 && !validEntryId(id));
}
{
  const m = memSource(files());
  const d = await loadDetailFor(ADMIN, 'nope_zzzz9', m.source);
  check('목록에 없는 번호 → not_found, 목록만 읽음', !d.ok && d.reason === 'not_found' && m.reads.length === 1 && m.reads[0] === CATALOG_KEY);
  const m2 = memSource(files());
  await loadDetailFor(ADMIN, 'vid_beta22', m2.source);
  check('한 건 열쇠는 목록의 detailKey 그대로', m2.reads[1] === key('vid_beta22'));
}
for (const [k, ok] of [
  ['admin-references/v1/catalog.json', true],
  ['admin-references/v1/entries/abc123.json', true],
  ['admin-references/v1/assets/abc123.pdf', true],
  ['admin-references/v1/../v2/x', false],
  ['admin-references/v1/entries//x', false],
  ['admin-references/v1/./x', false],
  ['admin-references/v1/a\\b', false],
  ['other/admin-references/v1/x', false],
  ['admin-references/v1/', false],
] as const) {
  check(`열쇠 검사 ${k} → ${ok}`, isReferenceKey(k) === ok);
}

/* ─────────────── 4. 화면으로 가는 모양 · 원본 권리 ─────────────── */
console.log('\n[화면 모양 · 원본 권리]');
{
  const parsed = parseCatalog(catalog());
  const entries = parsed.ok ? parsed.value.entries : [];
  const li = listItemOf(entries[0]);
  check('목록 한 줄에 detailKey · searchText 없음', !('detailKey' in li) && !('searchText' in li) && !JSON.stringify(li).includes('admin-references/'));
  check('출처 쓰임에서 기록 파일 경로를 버림', parsed.ok && !JSON.stringify(parsed.value.bibliography).includes('/secret/'));

  const m = memSource(files());
  const pend = await loadDetailFor(ADMIN, 'doc_alpha1', m.source);
  check('권리 확인 중 + asset 허락 표시 → 허락 확인 중(permission-pending), 종류 없음', pend.ok && pend.detail.original === 'permission-pending' && pend.detail.originalKind === null);
  check('한 건 응답에 원본 열쇠 없음', pend.ok && !('asset' in pend.detail) && !JSON.stringify(pend).includes('admin-references/'));
  const lic = await loadDetailFor(ADMIN, 'lic_delta4', memSource(files()).source);
  check('허락 받음 + asset 허락 → eligible · pdf', lic.ok && lic.detail.original === 'eligible' && lic.detail.originalKind === 'pdf');
  const fs = files();
  fs[key('lic_delta4')] = detail('lic_delta4', 'document', { asset: { ...ASSET, rightsConfirmed: 'yes' } });
  const notConfirmed = await loadDetailFor(ADMIN, 'lic_delta4', memSource(fs).source);
  check('허락 자료인데 rightsConfirmed 가 true 아님 → permission-pending', notConfirmed.ok && notConfirmed.detail.original === 'permission-pending');
  const e = entries.find((x) => x.id === 'lic_delta4')!;
  const pd = parseDetail(detail('lic_delta4'), e);
  check('허락 자료 + asset 없음 → 파일 연결 전(not-linked), 허락 확인 중이 아님', pd.ok && publicDetailOf(pd.value, e).original === 'not-linked' && publicDetailOf(pd.value, e).originalKind === null);
  const pendE = entries.find((x) => x.id === 'doc_alpha1')!;
  const pdNone = parseDetail(detail('doc_alpha1'), pendE);
  check('허락 확인 중 + asset 없음 → permission-pending(허락이 먼저)', pdNone.ok && publicDetailOf(pdNone.value, pendE).original === 'permission-pending');
  const sumE = { ...pendE, rights: 'private-summary' as const };
  const pdSum = parseDetail(detail('doc_alpha1', 'document', { asset: { ...ASSET, key: 'admin-references/v1/assets/doc_alpha1.pdf' } }), sumE);
  check('private-summary + asset 허락 표시 → original-not-offered, 원본 안 염', pdSum.ok && publicDetailOf(pdSum.value, sumE).original === 'original-not-offered' && publicDetailOf(pdSum.value, sumE).originalKind === null);
  check('원본 주소는 번호만', originalHref('lic_delta4') === '/api/admin/references/lic_delta4/original');
  check('글은 글 그대로(HTML 해석은 화면이 안 함)', pend.ok && pend.detail.digestKo.includes('<script>'));
}

/* ─────────────── 4-1. 비공개 옮김 자료(원본 없음) ─────────────── */
console.log('\n[private-summary — 전체 옮긴 글이 있어도 원본만 제공 안 함]');
{
  const fullTr = entry({ id: 'tr_epsilon5', title: '지어낸 번역 자료', rights: 'private-summary', availability: 'missing' });
  const fs = {
    [CATALOG_KEY]: catalog([entry(), VIDEO, UNREAD, LICENSED, fullTr]),
    [key('tr_epsilon5')]: detail('tr_epsilon5', 'document', {
      title: '지어낸 번역 자료',
      digestKo: '지어낸 요약',
      sections: [
        { id: 't1', title: '1장 옮김', kind: 'translation', sourcePages: [1, 2], textKo: '지어낸 1장 전체 옮김 문장. 둘째 문장.' },
        { id: 't2', title: '2장 옮김', kind: 'translation', sourcePages: [3, 4, 5], textKo: '지어낸 2장 전체 옮김 문장.' },
        { id: 't3', title: '표 옮김', kind: 'table', sourcePages: [6], textKo: '', table: { columns: ['선택', '설명'], rows: [['가', '지어낸 여러 문장 설명. 둘째 문장.']] } },
        { id: 'n1', title: '해설', kind: 'note', textKo: '지어낸 해설' },
      ],
    }),
  };
  const m = memSource(fs);
  const d = await loadDetailFor(ADMIN, 'tr_epsilon5', m.source);
  check('옮긴 칸 셋 · 해설 하나가 그대로 보임', d.ok && d.detail.sections.filter((x) => x.kind === 'translation' || x.kind === 'table').length === 3 && d.detail.sections.some((x) => x.kind === 'note'));
  check('원본 상태 original-not-offered · 원본 종류 없음(링크 없음)', d.ok && d.detail.original === 'original-not-offered' && d.detail.originalKind === null);
  check('라벨은 옮김 · 해설 · 요약을 덮고 원본 제공 안 함을 말함', d.ok && RIGHTS_LABEL[d.entry.rights] === '비공개 옮김 · 해설 · 요약(원본 파일 제공 안 함)');
  const f = recFetchLite();
  const res = await serveOriginal({ viewer: ADMIN, id: 'tr_epsilon5', rangeHeader: null, source: memSource(fs).source, fetchAsset: f.fetchAsset });
  check('원본 통로 404 · 원본 저장소 0번', res.status === 404 && f.calls.length === 0);
}

/* ─────────────── 5. 확인한 범위 ─────────────── */
console.log('\n[확인한 범위 — 겹친 구간은 한 번만]');
{
  check('겹친 구간 합치기 [0,10]+[5,15]+[20,30]+[30,31] = 26초', mergedSeconds([[0, 10], [5, 15], [20, 30], [30, 31]]) === 26);
  check('안에 든 구간 [0,100]+[10,20] = 100초', mergedSeconds([[10, 20], [0, 100]]) === 100);
  check('빈 구간 0초', mergedSeconds([]) === 0);
  const parsed = parseCatalog(catalog());
  const entries = parsed.ok ? parsed.value.entries : [];
  const doc = coverageOf(entries[0]);
  check('쪽: 겹친 기록은 한 번(글 3 · 그림 2 · 합 4 · 글 남음 7)', doc.textPages === 3 && doc.visualPages === 2 && doc.reviewedPages === 4 && doc.textPending === 7);
  const vid = coverageOf(entries[1]);
  check('영상: 화면 26초 · 음성 40초 · 음성 남음 60초', vid.videoSeconds === 26 && vid.audioSeconds === 40 && vid.audioPending === 60);
  const t = totalsOf(entries);
  check('전체: 안 읽은 자료도 센다(4개)', t.entries === 4);
  check('전체: 쪽 20 중 확인 8 · 글 6', t.pagesKnown === 20 && t.pagesReviewed === 8 && t.textPagesReviewed === 6, JSON.stringify(t));
  check('전체: 쪽 수 모르는 연구 1개', t.pageCountUnknown === 1);
  check('전체: 영상 100초 중 화면 26 · 음성 40', t.durationKnown === 100 && t.videoReviewed === 26 && t.audioReviewed === 40);
  check('쪽 묶음 글 1,2,3,5 → 1–3, 5쪽', pagesText([3, 1, 2, 5, 2]) === '1–3, 5쪽');
  check('모르는 상태 값은 상태 미정', reviewLabel('weird') === '상태 미정' && reviewLabel('unread') === '아직 안 읽음');
  check('표 칸 폭 7–22rem · 좌우 여백 0.5rem', TABLE_CELL_REM.min === 7 && TABLE_CELL_REM.max === 22 && TABLE_CELL_REM.padX === 0.5);
  check('표 최소 폭 = 칸 수 × 8rem(2칸 16 · 3칸 24 · 6칸 48 · 0칸도 8)', tableMinRem(2) === 16 && tableMinRem(3) === 24 && tableMinRem(6) === 48 && tableMinRem(0) === 8);
}

/* ─────────────── 6. 찾기 · 거르기 ─────────────── */
console.log('\n[찾기 · 거르기]');
{
  const parsed = parseCatalog(catalog());
  const entries = parsed.ok ? parsed.value.entries : [];
  const cols = collectionsOf({ entries });
  const f = (sp: Record<string, string>) => filterEntries(entries, readFilters(sp, cols)).map((e) => e.id);
  check('제목', f({ q: '안 읽은' }).join() === 'res_gamma3');
  check('묶음 이름', f({ q: '모음' }).join() === 'vid_beta22');
  check('주제', f({ q: '스쿼트' }).length === 2);
  check('분야 이름(한국어)', f({ q: '투구' }).join() === 'vid_beta22');
  check('찾기용 본문(searchText)', f({ q: 'qwertyfind' }).length === 2);
  check('낱말 둘은 모두 맞아야', f({ q: '가짜 영상' }).join() === 'vid_beta22');
  check('분야 거르기', f({ category: 'sources' }).join() === 'res_gamma3');
  check('종류 거르기', f({ kind: 'video' }).join() === 'vid_beta22');
  check('묶음 거르기', f({ collection: '묶음 가' }).length === 3);
  check('모르는 거르기 값은 버림', f({ category: 'magic', kind: 'x', collection: '없는 묶음' }).length === 4);
  check('찾는 말 100자까지', readFilters({ q: 'x'.repeat(300) }, cols).q.length === 100);
  const fc = facetCounts(entries);
  check('분야 수(근력 2 · 투구 1 · 출처 1)', fc.category.strength === 2 && fc.category.pitching === 1 && fc.category.sources === 1);
  check('종류 수(문서 2 · 영상 1 · 연구 1)', fc.kind.document === 2 && fc.kind.video === 1 && fc.kind.research === 1);
  const bib = parsed.ok ? parsed.value.bibliography : [];
  check('출처 찾기: 운동 이름', bibliographyView(bib, '다른 운동').map((b) => b.id).join() === 'b2');
  check('주소뿐인 메모는 숨김', bibNote('https://example.org/x') === null && bibNote('메모') === '메모');
}

/* ─────────────── 7. 원본 통로 ─────────────── */
console.log('\n[원본 통로 — 대표관리자 · 허락 · Range · 저장 금지]');
function fakeUpstream(status: number, headers: Record<string, string>, body = 'BYTES'): UpstreamResult {
  return {
    status,
    headers: { get: (n) => headers[n.toLowerCase()] ?? null },
    body: new Response(body).body,
  };
}
function recFetch(result: () => UpstreamResult | Promise<UpstreamResult>) {
  const calls: { key: string; range: string | null }[] = [];
  const fetchAsset: AssetFetch = async (k, r) => {
    calls.push({ key: k, range: r });
    return result();
  };
  return { fetchAsset, calls };
}
{
  for (const [name, v] of viewers) {
    const m = memSource(files());
    const f = recFetch(() => fakeUpstream(200, {}));
    const res = await serveOriginal({ viewer: v, id: 'lic_delta4', rangeHeader: null, source: m.source, fetchAsset: f.fetchAsset });
    check(`${name}: ${v ? 403 : 401}, 저장소 · 원본 0번`, res.status === (v ? 403 : 401) && m.reads.length === 0 && f.calls.length === 0 && /no-store/.test(res.headers.get('cache-control') ?? ''));
  }
  const cases: [string, string, Record<string, unknown> | null, number][] = [
    ['번호 모양 틀림', '../catalog', null, 404],
    ['목록에 없는 번호', 'nope_zzzz9', null, 404],
    ['권리 확인 중(asset 허락 표시가 있어도)', 'doc_alpha1', null, 404],
  ];
  for (const [name, id, , status] of cases) {
    const f = recFetch(() => fakeUpstream(200, {}));
    const res = await serveOriginal({ viewer: ADMIN, id, rangeHeader: null, source: memSource(files()).source, fetchAsset: f.fetchAsset });
    check(`${name} → ${status}, 원본 0번`, res.status === status && f.calls.length === 0);
  }
  {
    const fs = files();
    fs[key('lic_delta4')] = detail('lic_delta4', 'document', { asset: { ...ASSET, rightsConfirmed: false } });
    const f = recFetch(() => fakeUpstream(200, {}));
    const res = await serveOriginal({ viewer: ADMIN, id: 'lic_delta4', rangeHeader: null, source: memSource(fs).source, fetchAsset: f.fetchAsset });
    check('허락 받음 + rightsConfirmed false → 404, 원본 0번', res.status === 404 && f.calls.length === 0);
    const fs2 = files();
    fs2[key('lic_delta4')] = detail('lic_delta4');
    const f2 = recFetch(() => fakeUpstream(200, {}));
    const res2 = await serveOriginal({ viewer: ADMIN, id: 'lic_delta4', rangeHeader: null, source: memSource(fs2).source, fetchAsset: f2.fetchAsset });
    check('asset 없음 → 404, 원본 0번', res2.status === 404 && f2.calls.length === 0);
    const sumCat = catalog([entry(), VIDEO, UNREAD, entry({ id: 'lic_delta4', title: '비공개 정리 자료', rights: 'private-summary' })]);
    const fsSum = { ...files(), [CATALOG_KEY]: sumCat };
    const fS = recFetch(() => fakeUpstream(200, {}));
    const resS = await serveOriginal({ viewer: ADMIN, id: 'lic_delta4', rangeHeader: null, source: memSource(fsSum).source, fetchAsset: fS.fetchAsset });
    check('private-summary + asset 허락 표시 → 404, 원본 0번(원본 문은 그대로)', resS.status === 404 && fS.calls.length === 0);
    const f3 = recFetch(() => fakeUpstream(200, {}));
    const res3 = await serveOriginal({ viewer: ADMIN, id: 'lic_delta4', rangeHeader: null, source: memSource({ [CATALOG_KEY]: { bad: 1 } }).source, fetchAsset: f3.fetchAsset });
    check('목록 틀림 → 503, 원본 0번', res3.status === 503 && f3.calls.length === 0);
  }
  {
    const f = recFetch(() => fakeUpstream(200, { 'content-type': 'application/octet-stream', 'content-length': '5' }));
    const res = await serveOriginal({ viewer: ADMIN, id: 'lic_delta4', rangeHeader: null, source: memSource(files()).source, fetchAsset: f.fetchAsset });
    const body = await res.text();
    check('허락 받은 원본 → 200 그대로 흘려보냄', res.status === 200 && body === 'BYTES');
    check('원본 열쇠는 한 건의 asset.key 그대로', f.calls[0]?.key === ASSET.key && f.calls[0]?.range === null);
    check('형식은 한 건의 asset.mime(저장소의 octet-stream 아님)', res.headers.get('content-type') === 'application/pdf');
    check('저장 금지 · nosniff · Accept-Ranges', /private, no-store/.test(res.headers.get('cache-control') ?? '') && res.headers.get('x-content-type-options') === 'nosniff' && res.headers.get('accept-ranges') === 'bytes');
    const cd = res.headers.get('content-disposition') ?? '';
    check('이름: 따옴표 · 줄바꿈 지움, 한국어는 filename*', cd.startsWith('inline; filename="') && !cd.slice(18).split('";')[0].includes('"') && cd.includes("filename*=UTF-8''"));
  }
  {
    const f = recFetch(() => fakeUpstream(206, { 'content-range': 'bytes 0-4/100' }));
    const res = await serveOriginal({ viewer: ADMIN, id: 'lic_delta4', rangeHeader: 'bytes=0-', source: memSource(files()).source, fetchAsset: f.fetchAsset });
    check('bytes=0- → 한 번 최대 4MB 로 줄여 넘김', f.calls[0]?.range === `bytes=0-${CHUNK_BYTES - 1}`);
    check('206 · Content-Range · Content-Length', res.status === 206 && res.headers.get('content-range') === 'bytes 0-4/100' && res.headers.get('content-length') === '5');
  }
  {
    const f = recFetch(() => fakeUpstream(206, { 'content-range': 'garbage' }));
    const res = await serveOriginal({ viewer: ADMIN, id: 'lic_delta4', rangeHeader: 'bytes=0-4', source: memSource(files()).source, fetchAsset: f.fetchAsset });
    check('저장소 206 의 Content-Range 가 틀림 → 502', res.status === 502);
    const f2 = recFetch(() => fakeUpstream(416, { 'content-range': 'bytes */100' }, ''));
    const res2 = await serveOriginal({ viewer: ADMIN, id: 'lic_delta4', rangeHeader: 'bytes=500-', source: memSource(files()).source, fetchAsset: f2.fetchAsset });
    check('파일 밖 구간 → 416 · bytes */100', res2.status === 416 && res2.headers.get('content-range') === 'bytes */100');
    const f3 = recFetch(() => fakeUpstream(500, {}, 'upstream secret /internal/path'));
    const res3 = await serveOriginal({ viewer: ADMIN, id: 'lic_delta4', rangeHeader: null, source: memSource(files()).source, fetchAsset: f3.fetchAsset });
    const t3 = await res3.text();
    check('저장소 500 → 502, 저장소 글 안 실음', res3.status === 502 && !t3.includes('secret'));
    const f4 = recFetch(() => fakeUpstream(404, {}));
    const res4 = await serveOriginal({ viewer: ADMIN, id: 'lic_delta4', rangeHeader: null, source: memSource(files()).source, fetchAsset: f4.fetchAsset });
    check('원본 파일 없음 → 404', res4.status === 404);
    const res5 = await serveOriginal({ viewer: ADMIN, id: 'lic_delta4', rangeHeader: null, source: memSource(files()).source, fetchAsset: async () => { throw new Error('key=abc /secret'); } });
    check('원본 받기가 던짐 → 503, 까닭 글 안 실음', res5.status === 503 && !(await res5.text()).includes('secret'));
    const f6 = recFetch(() => fakeUpstream(302, { location: 'https://evil.example/' }));
    const res6 = await serveOriginal({ viewer: ADMIN, id: 'lic_delta4', rangeHeader: null, source: memSource(files()).source, fetchAsset: f6.fetchAsset });
    check('저장소가 돌려보냄(302) → 502, 따라가지 않음', res6.status === 502 && !res6.headers.get('location'));
  }
  const ranges: [string | null, string | null][] = [
    [null, null],
    ['bytes=10-20', 'bytes=10-20'],
    ['bytes=0-', `bytes=0-${CHUNK_BYTES - 1}`],
    ['bytes=100-99999999999', `bytes=100-${100 + CHUNK_BYTES - 1}`],
    ['bytes=-500', 'bytes=-500'],
    ['bytes=-99999999999', `bytes=-${CHUNK_BYTES}`],
    ['bytes=-0', null],
    ['bytes=5-1', null],
    ['bytes=0-1,5-6', null],
    ['items=0-1', null],
    ['bytes=-', null],
    ['bytes=0-1\r\nX: y', null],
  ];
  for (const [input, want] of ranges) {
    check(`Range ${JSON.stringify(input)} → ${want}`, normalizeRange(input) === want);
  }
  check('이름 줄바꿈 · 경로 글자 지움', !/[\r\n/\\]/.test(dispositionOf('a\r\nb/../c\\d.pdf').split('filename*')[0]));
}

/* ─────────────── 8. 내 컴퓨터 미리보기 폴더 ─────────────── */
console.log('\n[내 컴퓨터 미리보기 폴더 — 폴더 밖 거절 · Range]');
{
  const base = await mkdtemp(path.join(os.tmpdir(), 'admin-ref-selftest-'));
  const root = path.join(base, 'root');
  try {
    await mkdir(path.join(root, 'entries'), { recursive: true });
    await mkdir(path.join(root, 'assets'), { recursive: true });
    await writeFile(path.join(base, 'outside.json'), JSON.stringify({ leaked: true }));
    const fs = files();
    await writeFile(path.join(root, 'catalog.json'), JSON.stringify(fs[CATALOG_KEY]));
    await writeFile(path.join(root, 'entries', 'lic_delta4.json'), JSON.stringify(fs[key('lic_delta4')]));
    await symlink(path.join(base, 'outside.json'), path.join(root, 'entries', 'doc_alpha1.json'));
    const bytes = Buffer.from(Array.from({ length: 1000 }, (_, i) => i % 251));
    await writeFile(path.join(root, 'assets', 'lic_delta4.pdf'), bytes);
    await symlink(path.join(base, 'outside.json'), path.join(root, 'assets', 'escape1.pdf'));

    const src = localSource(root);
    const cat = await loadCatalogFor(ADMIN, src);
    check('폴더에서 목록 읽음', cat.ok && cat.catalog.entries.length === 4);
    const esc = await loadDetailFor(ADMIN, 'doc_alpha1', src);
    check('폴더 밖을 가리키는 바로가기 → unavailable', !esc.ok && esc.reason === 'unavailable');
    const dot = await src.read('admin-references/v1/../../outside.json', 1e6);
    check("'..' 열쇠 → 거절", !dot.ok);
    const missing = await loadDetailFor(ADMIN, 'vid_beta22', src);
    check('폴더에 없는 한 건 → missing', !missing.ok && missing.reason === 'missing');
    const small = await src.read(CATALOG_KEY, 10);
    check('크기 넘음 → too_large', !small.ok && small.reason === 'too_large');

    const fetchAsset = localAssetFetch(root);
    const full = await serveOriginal({ viewer: ADMIN, id: 'lic_delta4', rangeHeader: null, source: src, fetchAsset });
    const fullBytes = Buffer.from(await full.arrayBuffer());
    check('원본 전체 200 · 1000바이트 그대로', full.status === 200 && fullBytes.equals(bytes) && full.headers.get('content-length') === '1000');
    const part = await serveOriginal({ viewer: ADMIN, id: 'lic_delta4', rangeHeader: 'bytes=10-19', source: src, fetchAsset });
    const partBytes = Buffer.from(await part.arrayBuffer());
    check('bytes=10-19 → 206 · 10바이트 맞음', part.status === 206 && partBytes.equals(bytes.subarray(10, 20)) && part.headers.get('content-range') === 'bytes 10-19/1000' && part.headers.get('content-length') === '10');
    const tail = await serveOriginal({ viewer: ADMIN, id: 'lic_delta4', rangeHeader: 'bytes=-5', source: src, fetchAsset });
    const tailBytes = Buffer.from(await tail.arrayBuffer());
    check('bytes=-5 → 끝 5바이트', tail.status === 206 && tailBytes.equals(bytes.subarray(995)) && tail.headers.get('content-range') === 'bytes 995-999/1000');
    const open = await serveOriginal({ viewer: ADMIN, id: 'lic_delta4', rangeHeader: 'bytes=990-', source: src, fetchAsset });
    check('bytes=990- → 990-999', open.status === 206 && open.headers.get('content-range') === 'bytes 990-999/1000');
    await open.arrayBuffer();
    const out = await serveOriginal({ viewer: ADMIN, id: 'lic_delta4', rangeHeader: 'bytes=5000-', source: src, fetchAsset });
    check('파일 밖 → 416 · bytes */1000', out.status === 416 && out.headers.get('content-range') === 'bytes */1000');
    const escAsset = await fetchAsset('admin-references/v1/assets/escape1.pdf', null);
    check('원본 바로가기가 폴더 밖 → 거절(400)', escAsset.status === 400 && escAsset.body === null);
    const notAsset = await fetchAsset('admin-references/v1/catalog.json', null);
    check('assets/ 밖 열쇠는 원본으로 안 보냄', notAsset.status === 400);
    void readFile;
  } finally {
    await rm(base, { recursive: true, force: true });
  }
}

/* ─────────────── 9. 화면 · 통로 코드 ─────────────── */
console.log('\n[화면 · 통로 코드 — 순서 · 날 HTML · 비공개 경로]');
{
  const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  const list = read('app/(app)/admin/references/page.tsx');
  const det = read('app/(app)/admin/references/[id]/page.tsx');
  const route = read('app/api/admin/references/[id]/original/route.ts');
  const order = (src: string, a: string, b: string) => src.indexOf(a) >= 0 && src.indexOf(b) > src.indexOf(a);
  check('목록 화면: requireAdmin 다음에 읽기', order(list, 'await requireAdmin()', 'loadReferenceCatalog(user)'));
  check('한 건 화면: requireAdmin 다음에 읽기', order(det, 'await requireAdmin()', 'loadReferenceDetail(user, id)'));
  check('원본 통로: getCurrentUser 다음에 보내기', order(route, 'await getCurrentUser()', 'serveReferenceOriginal(viewer'));
  const dirs = ['app/(app)/admin/references', 'app/api/admin/references', 'lib/admin-references'];
  const walk = (d: string): string[] =>
    readdirSync(new URL(`../${d}`, import.meta.url)).flatMap((n) => {
      const p = `${d}/${n}`;
      return statSync(new URL(`../${p}`, import.meta.url)).isDirectory() ? walk(p) : [p];
    });
  const all = dirs.flatMap(walk);
  check('날 HTML 그리기 없음(dangerouslySetInnerHTML)', all.every((p) => !read(p).includes('dangerouslySetInnerHTML')));
  check('비공개 폴더 경로 없음(/Users/ · Downloads)', all.every((p) => !/\/Users\/|Downloads|\.codex/.test(read(p))));
  check("화면 쪽 파일에 'use client' 없음(목록 · 내용은 서버에서만)", all.filter((p) => p.startsWith('app/')).every((p) => !read(p).includes("'use client'")));
  check('lib 의 서버 저장소 연결만 server-only', read('lib/admin-references/storage.ts').startsWith("import 'server-only'"));
  const parts = read('app/(app)/admin/references/[id]/detail-parts.tsx');
  check('표: 글 길이만큼 늘어나는 min-w-max 없음', !det.includes('min-w-max') && !parts.includes('min-w-max'));
  check('표: 칸 최대 폭 · 줄바꿈(긴 글자도 줄바꿈) · 최소 폭은 칸 수로', parts.includes('maxWidth') && parts.includes('[overflow-wrap:anywhere]') && parts.includes('tableMinRem(columns.length)'));
  check('원본 상태 글 넷이 서로 다름', ['연결되지 않았어요', '원본 파일은 이 화면에서 제공하지 않아요', '허락을 확인하는 중', '원본 열기'].every((t) => parts.includes(t)));
  check("private-summary 를 '요약만'이라고 쓰지 않음(라벨 · 원본 상태 글)", !RIGHTS_LABEL['private-summary'].includes('요약만') && !/요약만/.test(parts) && RIGHTS_LABEL['private-summary'].includes('옮김') && RIGHTS_LABEL['private-summary'].includes('원본'));
  check("바로가기를 '그 자리로 가요'라고 단정하지 않음", !/그 자리로 가요/.test(parts + det + read('lib/admin-references/README.md')));
}


/* ─────────────── 10. EX-REF03 — 원본 영상은 링크로만, 영상 원본 파일은 받지 않음 ─────────────── */
console.log('\n[EX-REF03 — 원본 영상 링크 · 영상 원본 파일 거절]');
{
  const ID = 'AbCdEfGhIj0';
  const CANON = `https://www.youtube.com/watch?v=${ID}`;
  const ev = (url: unknown, over: Record<string, unknown> = {}) => ({ url, title: '지어낸 영상 제목', author: '지어낸 채널', checkedAt: '2026-11-16T00:00:00Z', ...over });
  const parsedCat = parseCatalog(catalog());
  const cat = parsedCat.ok ? parsedCat.value.entries : [];
  const vidE = cat.find((x) => x.id === 'vid_beta22')!;
  const docE = cat.find((x) => x.id === 'doc_alpha1')!;
  const resE = cat.find((x) => x.id === 'res_gamma3')!;
  const vidDetail = (over: Record<string, unknown> = {}) =>
    detail('vid_beta22', 'video', { title: '가짜 영상', sections: [{ id: 'v1', title: '구간', kind: 'note', startSeconds: 5, endSeconds: 20, textKo: '지어낸 화면 메모' }], claims: [], ...over });

  /* 옛 JSON · null */
  const old = parseDetail(vidDetail(), vidE);
  check('옛 영상 한 건(externalVideo 없음) 그대로 읽힘 → null', old.ok && old.value.externalVideo === null);
  const nul = parseDetail(vidDetail({ externalVideo: null }), vidE);
  check('externalVideo: null 도 읽힘', nul.ok && nul.value.externalVideo === null);
  const oldDoc = parseDetail(detail('doc_alpha1'), docE);
  check('옛 문서 한 건도 그대로 읽힘(externalVideo null)', oldDoc.ok && oldDoc.value.externalVideo === null);

  /* 바른 주소 → 하나의 모양 */
  for (const [input, note] of [
    [CANON, 'www watch'],
    [`https://youtube.com/watch?v=${ID}`, 'youtube.com'],
    [`https://m.youtube.com/watch?v=${ID}`, 'm.youtube.com'],
    [`https://youtu.be/${ID}`, 'youtu.be'],
    [`HTTPS://WWW.YOUTUBE.COM/watch?v=${ID}`, '대문자 머리'],
    [`https://youtu.be/${ID}?`, '빈 쿼리'],
    [`https://www.youtube.com/watch?v=Zz_-0123456`, '_ · - 든 번호'],
  ] as const) {
    const want = input.includes('Zz_-0123456') ? 'https://www.youtube.com/watch?v=Zz_-0123456' : CANON;
    check(`바른 주소(${note}) → ${want}`, canonicalYouTubeUrl(input) === want, String(canonicalYouTubeUrl(input)));
  }
  const good = parseDetail(vidDetail({ externalVideo: ev(`https://youtu.be/${ID}`) }), vidE);
  check('한 건에서 바꿔 둔 주소 · 제목 · 올린 사람 · 확인 시각', good.ok && good.value.externalVideo?.url === CANON && good.value.externalVideo.title === '지어낸 영상 제목' && good.value.externalVideo.author === '지어낸 채널' && good.value.externalVideo.checkedAt === '2026-11-16T00:00:00Z');

  /* 틀린 주소 — 모두 null, 한 건 전체 거절 */
  const bad: [string, unknown][] = [
    ['계정:비밀번호', `https://user:pw@www.youtube.com/watch?v=${ID}`],
    ['계정', `https://user@www.youtube.com/watch?v=${ID}`],
    ['기본 포트 :443', `https://www.youtube.com:443/watch?v=${ID}`],
    ['포트 :8080', `https://www.youtube.com:8080/watch?v=${ID}`],
    ['# 붙음', `https://www.youtube.com/watch?v=${ID}#t=10`],
    ['닮은 호스트(뒤에 붙임)', `https://www.youtube.com.evil.example/watch?v=${ID}`],
    ['닮은 호스트(.co)', `https://youtube.co/watch?v=${ID}`],
    ['닮은 호스트(점 빠짐)', `https://wwwyoutube.com/watch?v=${ID}`],
    ['닮은 호스트(키릴 о)', `https://www.yоutube.com/watch?v=${ID}`],
    ['닮은 호스트(youtu.be.)', `https://youtu.be.evil.example/${ID}`],
    ['끝에 점 붙은 호스트', `https://www.youtube.com./watch?v=${ID}`],
    ['다른 호스트 경로에 이름', `https://evil.example/www.youtube.com/watch?v=${ID}`],
    ['nocookie embed', `https://www.youtube-nocookie.com/embed/${ID}`],
    ['music 호스트', `https://music.youtube.com/watch?v=${ID}`],
    ['IP', `https://127.0.0.1/watch?v=${ID}`],
    ['localhost', `https://localhost/watch?v=${ID}`],
    ['IPv6', `https://[::1]/watch?v=${ID}`],
    ['http', `http://www.youtube.com/watch?v=${ID}`],
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:text/html,hi'],
    ['file:', 'file:///tmp/x.mp4'],
    ['머리 없음(//)', `//www.youtube.com/watch?v=${ID}`],
    ['머리 없음', `www.youtube.com/watch?v=${ID}`],
    ['영상 파일 주소(googlevideo)', 'https://rr1---sn-abc.googlevideo.com/videoplayback?id=x'],
    ['썸네일 주소(ytimg)', `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`],
    ['YouTube 돌려보내기', 'https://www.youtube.com/redirect?q=https://evil.example'],
    ['공유 토큰 si', `https://www.youtube.com/watch?v=${ID}&si=tok123`],
    ['youtu.be 공유 토큰', `https://youtu.be/${ID}?si=tok123`],
    ['재생목록', `https://www.youtube.com/watch?v=${ID}&list=PLxyz`],
    ['시각 t', `https://www.youtube.com/watch?v=${ID}&t=30`],
    ['돌려보내기 값', `https://www.youtube.com/watch?v=${ID}&redirect=https://evil.example`],
    ['v 둘', `https://www.youtube.com/watch?v=${ID}&v=Zz_-0123456`],
    ['v 앞에 다른 값', `https://www.youtube.com/watch?feature=share&v=${ID}`],
    ['번호 10자', 'https://www.youtube.com/watch?v=AbCdEfGhIj'],
    ['번호 12자', 'https://www.youtube.com/watch?v=AbCdEfGhIj01'],
    ['번호에 !', 'https://www.youtube.com/watch?v=AbCdEfGhIj!'],
    ['빈 v', 'https://www.youtube.com/watch?v='],
    ['/watch/', `https://www.youtube.com/watch/?v=${ID}`],
    ['shorts', `https://www.youtube.com/shorts/${ID}`],
    ['embed', `https://www.youtube.com/embed/${ID}`],
    ['/v/', `https://www.youtube.com/v/${ID}`],
    ['인코딩된 ?', `https://www.youtube.com/watch%3Fv=${ID}`],
    ['번호 뒤 .mp4', `https://youtu.be/${ID}.mp4`],
    ['youtu.be 하위 경로', `https://youtu.be/${ID}/x`],
    ['빈칸', `https://www.youtube.com/watch?v=AbCdE fGhIj0`],
    ['줄바꿈', `https://www.youtube.com/watch?v=${ID}\nhttps://evil.example`],
    ['역슬래시', `https://www.youtube.com\\@evil.example/watch?v=${ID}`],
    ['너무 김', `https://www.youtube.com/watch?v=${ID}${'&x'.repeat(200)}`],
    ['문자열 아님', 42],
    ['null 주소', null],
  ];
  for (const [name, url] of bad) {
    const r = parseDetail(vidDetail({ externalVideo: ev(url) }), vidE);
    check(`틀린 주소 거절: ${name}`, canonicalYouTubeUrl(url) === null && !r.ok);
  }
  for (const [name, over] of [
    ['제목 없음', { title: '' }],
    ['올린 사람 없음', { author: undefined }],
    ['확인 시각 없음', { checkedAt: undefined }],
    ['확인 시각이 날짜 아님', { checkedAt: 'yesterday' }],
    ['객체 아님', null],
  ] as const) {
    const value = over === null ? 'https://youtu.be/x' : ev(CANON, over as Record<string, unknown>);
    check(`externalVideo 모양 틀림 거절: ${name}`, !parseDetail(vidDetail({ externalVideo: value }), vidE).ok);
  }

  /* 영상이 아닌 자료에는 원본 영상 링크를 두지 않는다 */
  check('문서 자료에 externalVideo → 한 건 거절', !parseDetail(detail('doc_alpha1', 'document', { externalVideo: ev(CANON) }), docE).ok);
  check('연구 자료에 externalVideo → 한 건 거절', !parseDetail(detail('res_gamma3', 'research', { externalVideo: ev(CANON) }), resE).ok);

  /* 영상 자료의 화면 상태 */
  const m = memSource({ ...files(), [key('vid_beta22')]: vidDetail({ externalVideo: ev(`https://m.youtube.com/watch?v=${ID}`) }) });
  const vd = await loadDetailFor(ADMIN, 'vid_beta22', m.source);
  check('영상 한 건: 원본 상태 external-video · 우리 통로 종류 없음 · 바꿔 둔 링크', vd.ok && vd.detail.original === 'external-video' && vd.detail.originalKind === null && vd.detail.externalVideo?.url === CANON);
  const noLink = await loadDetailFor(ADMIN, 'vid_beta22', memSource(files()).source);
  check('링크 없는 영상 한 건: externalVideo null(화면은 링크 확인 중)', noLink.ok && noLink.detail.externalVideo === null && noLink.detail.original === 'external-video');
  const licVidCat = catalog([entry(), entry({ ...VIDEO, rights: 'licensed-private' }), UNREAD, LICENSED]);
  const licVid = await loadDetailFor(ADMIN, 'vid_beta22', memSource({ ...files(), [CATALOG_KEY]: licVidCat }).source);
  check('허락 받은 영상 자료도 원본 파일 상태가 아니라 external-video', licVid.ok && licVid.detail.original === 'external-video' && licVid.detail.originalKind === null);

  /* 확인한 범위는 링크와 상관없이 목록 기록 그대로 */
  const plain = await loadDetailFor(ADMIN, 'vid_beta22', memSource(files()).source);
  check('링크가 붙어도 확인한 범위 같음(화면 26초 · 음성 40초, 길이 100초를 확인으로 치지 않음)',
    vd.ok && plain.ok && JSON.stringify(vd.entry.coverageView) === JSON.stringify(plain.entry.coverageView) && vd.entry.coverageView.videoSeconds === 26 && vd.entry.coverageView.audioSeconds === 40 && vd.entry.coverageView.audioPending === 60);
  check('목록 전체 범위도 같음(한 건의 링크는 목록 계산에 안 들어감)', JSON.stringify(totalsOf(cat)) === JSON.stringify(totalsOf(parseCatalog(catalog()).ok ? (parseCatalog(catalog()) as { ok: true; value: { entries: Entry[] } }).value.entries : [])) && !('externalVideo' in listItemOf(vidE)));

  /* 보는 사람 — 영상 자료도 저장소를 묻기 전에 막힘 */
  for (const [name, v] of viewers) {
    const mm = memSource(files());
    const d = await loadDetailFor(v, 'vid_beta22', mm.source);
    const f = recFetch(() => fakeUpstream(200, {}));
    const r = await serveOriginal({ viewer: v, id: 'vid_beta22', rangeHeader: null, source: mm.source, fetchAsset: f.fetchAsset });
    check(`${name}: 영상 자료 한 건 · 원본 통로 모두 막힘, 저장소 0번`, !d.ok && d.reason === 'forbidden' && r.status === (v ? 403 : 401) && mm.reads.length === 0 && f.calls.length === 0);
  }

  /* 영상 원본 파일 — 형식 · 이름 · 영상 자료 어디로든 거절, 원본 받기 전에 */
  const licDocCat = catalog([entry(), VIDEO, UNREAD, LICENSED]);
  const VIDEO_MIMES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/ogg', 'video/x-msvideo', 'video/mpeg', 'video/3gpp', 'application/x-mpegURL', 'application/vnd.apple.mpegurl', 'application/dash+xml', 'application/octet-stream'];
  for (const mime of VIDEO_MIMES) {
    const forged = { ...files(), [CATALOG_KEY]: licDocCat, [key('lic_delta4')]: detail('lic_delta4', 'document', { asset: { ...ASSET, key: 'admin-references/v1/assets/lic_delta4.bin', mime } }) };
    const pr = parseDetail(forged[key('lic_delta4')], LICENSED_ENTRY());
    const f = recFetch(() => fakeUpstream(200, { 'content-type': mime }));
    const r = await serveOriginal({ viewer: ADMIN, id: 'lic_delta4', rangeHeader: 'bytes=0-', source: memSource(forged).source, fetchAsset: f.fetchAsset });
    check(`영상 · 스트림 형식 ${mime} → 거절, 원본 받기 0번`, !pr.ok && r.status !== 200 && r.status !== 206 && f.calls.length === 0);
  }
  for (const ext of ['mp4', 'mov', 'webm', 'm4v', 'mkv', 'avi', 'mpeg', '3gp']) {
    const forged = { ...files(), [key('lic_delta4')]: detail('lic_delta4', 'document', { asset: { ...ASSET, key: `admin-references/v1/assets/lic_delta4.${ext}` } }) };
    const f = recFetch(() => fakeUpstream(200, {}));
    const r = await serveOriginal({ viewer: ADMIN, id: 'lic_delta4', rangeHeader: null, source: memSource(forged).source, fetchAsset: f.fetchAsset });
    check(`영상 파일 이름 .${ext}(형식은 PDF 라고 적어도) → 거절, 원본 받기 0번`, !parseDetail(forged[key('lic_delta4')], LICENSED_ENTRY()).ok && f.calls.length === 0 && r.status === 503);
  }
  {
    /* 영상 자료에 원본 파일을 적은 위조 한 건 — 허락 · 확인 표시까지 다 달아도 */
    const forgedVid = { ...files(), [CATALOG_KEY]: licVidCat, [key('vid_beta22')]: vidDetail({ asset: { ...ASSET, key: 'admin-references/v1/assets/vid_beta22.pdf' } }) };
    check('영상 자료의 asset(PDF 라도) → 한 건 거절', !parseDetail(forgedVid[key('vid_beta22')], vidE).ok);
    const viaLoad = await loadDetailFor(ADMIN, 'vid_beta22', memSource(forgedVid).source);
    check('화면 로더도 거절(malformed)', !viaLoad.ok && viaLoad.reason === 'malformed');
    const mm = memSource(forgedVid);
    const f = recFetch(() => fakeUpstream(206, { 'content-range': 'bytes 0-4/100' }));
    const r = await serveOriginal({ viewer: ADMIN, id: 'vid_beta22', rangeHeader: 'bytes=0-4', source: mm.source, fetchAsset: f.fetchAsset });
    check('원본 통로: 영상 자료는 한 건도 안 읽고 404, 원본 받기 0번', r.status === 404 && f.calls.length === 0 && mm.reads.length === 1 && mm.reads[0] === CATALOG_KEY);
  }

  /* PDF · 소리 원본은 그대로 */
  {
    const f = recFetch(() => fakeUpstream(206, { 'content-range': 'bytes 0-9/1000' }));
    const r = await serveOriginal({ viewer: ADMIN, id: 'lic_delta4', rangeHeader: 'bytes=0-9', source: memSource(files()).source, fetchAsset: f.fetchAsset });
    check('PDF 원본은 그대로 206 · application/pdf · 저장 금지', r.status === 206 && r.headers.get('content-type') === 'application/pdf' && /no-store/.test(r.headers.get('cache-control') ?? '') && f.calls[0]?.key === ASSET.key);
    const audio = parseDetail(detail('lic_delta4', 'document', { asset: { ...ASSET, key: 'admin-references/v1/assets/lic_delta4.m4a', mime: 'audio/mp4' } }), LICENSED_ENTRY());
    check('소리 원본(.m4a · audio/mp4)은 문서 자료에 그대로 허용 · 종류 audio', audio.ok && publicDetailOf(audio.value, LICENSED_ENTRY()).originalKind === 'audio');
    const img = parseDetail(detail('lic_delta4', 'document', { asset: { ...ASSET, key: 'admin-references/v1/assets/lic_delta4.png', mime: 'image/png' } }), LICENSED_ENTRY());
    check('그림 원본(png)도 그대로', img.ok && publicDetailOf(img.value, LICENSED_ENTRY()).original === 'eligible');
  }

  /* 화면 코드 — 링크만, 플레이어 · 썸네일 · 서버 읽기 없음 */
  const rd = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  const parts = rd('app/(app)/admin/references/[id]/detail-parts.tsx');
  const page = rd('app/(app)/admin/references/[id]/page.tsx');
  const ext = parts.slice(parts.indexOf('export function ExternalVideoNotice'));
  check("원본 영상 링크: '원본 영상 보기' · 새 창 · noopener noreferrer", ext.includes('원본 영상 보기') && ext.includes('target="_blank"') && ext.includes('rel="noopener noreferrer"') && ext.includes('href={video.url}'));
  check("링크 없으면 '원본 링크 확인 중' · 그 갈래에 링크 없음", (() => { const pend = ext.slice(ext.indexOf('if (!video)'), ext.indexOf('return (', ext.indexOf('if (!video)') + 20) + 400); return pend.includes('원본 링크 확인 중') && !pend.slice(0, pend.indexOf('</p>')).includes('href='); })());
  check('링크가 영상 · 음성 확인을 뜻하지 않는다고 적음', ext.includes('다 확인했다는 뜻은 아니에요'));
  check('영상 자료는 우리 원본 통로 상태 대신 원본 영상 링크', page.includes("entry.kind === 'video' ?") && page.includes('<ExternalVideoNotice video={detail.externalVideo} />'));
  const allFiles = ['lib/admin-references/schema.ts', 'lib/admin-references/load.ts', 'lib/admin-references/view.ts', 'lib/admin-references/original.ts', 'app/(app)/admin/references/page.tsx', 'app/(app)/admin/references/[id]/page.tsx', 'app/(app)/admin/references/[id]/detail-parts.tsx'].map(rd).join('\n');
  check('플레이어 · iframe · 썸네일 · 찾기 결과 링크 없음', !/<iframe|<video|ytimg|youtube-nocookie|\/embed\/|results\?search_query/.test(allFiles));
  check('서버가 영상 주소를 읽지 않음(검사 · 화면 모듈에 fetch 없음)', !['lib/admin-references/schema.ts', 'lib/admin-references/load.ts', 'lib/admin-references/view.ts'].map(rd).join('\n').includes('fetch('));
  check('우리 통로로 여는 형식 목록에 영상 없음', !/'video\//.test(rd('lib/admin-references/schema.ts').split('export const ASSET_MIMES')[1].split('\n')[0]));
}

console.log(`\n통과 ${passed} · 실패 ${failed}`);
if (failed) process.exit(1);
