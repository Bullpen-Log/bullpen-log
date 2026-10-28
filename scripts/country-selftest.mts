/** 나라 규칙(lib/country.ts) — 타격 · 영양 주소만 빠지는지(2026-10-28 부터 세 나라 모두 숨김) */
import assert from 'node:assert/strict';
import { countryOf, countryOfStorefront, forCountry, hiddenIn } from '../lib/country.ts';
assert.equal(countryOf(null), 'kr'); assert.equal(countryOf('us'), 'us'); assert.equal(countryOf('xx'), 'kr');
for (const h of ['/hitting', '/hitting?view=log', '/hitting/lab', '/training?sport=hit', '/training?x=1&sport=hit']) assert.ok(hiddenIn('us', h), h);
for (const h of ['/videos', '/training?sport=pitch', '/today', '/hittingx', '/training?sport=hitter']) assert.ok(!hiddenIn('jp', h), h);
for (const c of ['kr', 'us', 'jp'] as const) for (const h of ['/hitting', '/swing', '/nutrition', '/training?sport=hit']) assert.ok(hiddenIn(c, h), `${c} ${h}`);
assert.deepEqual(forCountry([{ href: '/videos' }, { href: '/hitting' }], 'us'), [{ href: '/videos' }]);
for (const h of ['/nutrition', '/nutrition?date=2026-10-28', '/nutrition/setup', '/swing', '/swing/abc']) assert.ok(hiddenIn('us', h), h);
for (const h of ['/videos', '/today', '/training?sport=pitch']) assert.ok(!hiddenIn('kr', h), h);
assert.ok(!hiddenIn('us', '/nutritionist'));
assert.equal(countryOfStorefront('KOR'), 'kr'); assert.equal(countryOfStorefront('usa'), 'us'); assert.equal(countryOfStorefront('JPN'), 'jp');
for (const v of ['CAN', '', null, undefined, 3, 'KR']) assert.equal(countryOfStorefront(v), null, String(v));
console.log('ok');
