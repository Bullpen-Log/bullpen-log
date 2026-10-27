import assert from 'node:assert/strict';
import { register } from 'node:module';
register('./place-test-loader.mjs', import.meta.url);
const { memory } = await import('./place-test-fixtures.mjs');
const { GET } = await import('../app/api/places/route.ts');

const id = (prefix, n) => `${prefix}-${String(n).padStart(5, '0')}`;
memory.candidates = Array.from({ length: 2401 }, (_, n) => ({
  id: id('candidate', n), name: n < 200 ? '같은 이름' : `후보 ${String(n).padStart(5, '0')}`, typeHint: '야구장 후보',
  region: '서울', district: '강남구', address: '서울', roadAddress: null, lat: 37.5, lng: 127.1,
  coordsEdited: true, coordsSource: null, lessonNotice: null, rentalNotice: null, hardballNotice: null,
  operationNotice: 'FIELD_UNCONFIRMED', accessNotice: 'NOT_ESTABLISHED', identityNotice: 'UNSURE',
  reviewTags: [], mergedIntoId: null, contactStatus: 'NOT_CONTACTED', consentStatus: 'NOT_REQUESTED', approvedAt: null,
}));
memory.venues = Array.from({ length: 405 }, (_, n) => ({
  id: id('venue', n), name: `연습장 ${n}`, kind: 'indoor', region: '서울', address: '서울', lat: 37.5, lng: 127.1,
  slotMin: 60, pricePerSlot: null, approval: false, images: [], publicProfile: true, hiddenAt: null, createdAt: id('date', n),
}));
memory.orgs = Array.from({ length: 317 }, (_, n) => ({
  id: id('org', n), name: `레슨장 ${n}`, coachName: null, region: '서울', address: '서울', lat: 37.5, lng: 127.1,
  priceFrom: null, specialties: [], reviews: [], kind: 'LESSON', publicProfile: true,
}));
memory.candidates.push({ ...memory.candidates[0], id: 'merged', mergedIntoId: memory.candidates[1].id });
memory.venues.push({ ...memory.venues[0], id: 'hidden', hiddenAt: '2026-01-01' });
memory.orgs.push({ ...memory.orgs[0], id: 'unpublished', publicProfile: false });

const request = async (query) => GET(new Request(`https://example.test/api/places${query}`));
const collect = async (query) => {
  let page = 1, places = [], last;
  do {
    const res = await request(`${query}${query.includes('?') ? '&' : '?'}page=${page}`);
    assert.equal(res.status, 200);
    last = await res.json();
    assert.equal(last.page, page);
    places.push(...last.places);
    page++;
    assert.ok(page < 100, 'pagination must terminate');
  } while (last.hasMore);
  assert.equal(new Set(places.map((p) => p.id)).size, places.length, 'pages must not duplicate ids');
  return places;
};

memory.role = null;
assert.equal((await request('?view=candidates&page=1')).status, 403);
assert.equal((await request('?view=candidates')).status, 403);
memory.role = 'MANAGER';
assert.equal((await request('?view=candidates&page=2')).status, 403);
memory.role = null;
assert.equal((await collect('')).length, 722);
assert.equal((await collect('?kind=lesson')).length, 317);
assert.equal((await collect('?kind=indoor')).length, 405);
assert.equal((await collect('?q=레슨장')).length, 317);
const legacyPublic = await (await request('')).json();
assert.equal(legacyPublic.places.length, 722, 'old installed apps must receive all public records');
memory.role = 'ADMIN';
const candidates = await collect('?view=candidates');
assert.equal(candidates.length, 2401, 'candidate records beyond the former 2,000 limit must be accessible');
assert.equal(memory.statsCalls, 0, 'map queries must not load administrator statistics');
assert.equal((await collect('?view=candidates&q=후보%2000240')).length, 1);
assert.equal((await collect('?view=candidates&kind=field')).length, 2401);
const emptyPage = await (await request('?view=candidates&page=99')).json();
assert.equal(emptyPage.places.length, 0);
assert.equal(emptyPage.hasMore, false);
const legacyCandidates = await (await request('?view=candidates')).json();
assert.equal(legacyCandidates.places.length, 2401, 'old installed apps must receive all candidate records');
console.log('장소 페이지 검사 통과: 2,401개 후보 · 공개 722개 · 검색 · 필터 · 권한 · 이전 앱 호환');
