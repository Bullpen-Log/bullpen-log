/**
 * 3D 분석 국외 이전 동의 규칙(lib/analysis-consent.ts) 자체 시험 — npm run analysis-consent:test
 * 유효 = 철회 안 함 + 지금 판 + 문서 확정. 확정 전이면 어떤 줄도 유효하지 않다(전송 근거로 안 씀).
 */
import assert from 'node:assert/strict';
import { ANALYSIS_CONSENT, ANALYSIS_CONSENT_PENDING, analysisConsentReady, ageOn, consentAgeBlock, consentStateOf, type ConsentRecord } from '@/lib/analysis-consent';
import { HEALTH_CONSENT, healthConsentOf } from '@/lib/health-consent';
import { GUARDIAN_WAIT_DAYS, guardianExpiry, guardianStateOf, type GuardianRow } from '@/lib/guardian';

const V = '2026-10-29';
const rec = (o: Partial<ConsentRecord>): ConsentRecord => ({ id: 'x', version: V, source: 'signup', agreedAt: new Date('2026-10-29T01:00:00Z'), revokedAt: null, ...o });

/* 확정 전 — 기록이 있어도 유효하지 않다 */
assert.equal(consentStateOf([rec({})], false, V).valid, false);
assert.equal(consentStateOf([rec({})], false, V).current, null);
/* 지금 문서는 확인할 것이 남아 확정 전이다(짐작으로 채우지 않았다) */
assert.equal(analysisConsentReady(), ANALYSIS_CONSENT_PENDING.length === 0);
assert.ok(ANALYSIS_CONSENT.contact == null && ANALYSIS_CONSENT.retention == null, '연락처 · 보유 기간은 확인 전이라 비어 있어야 한다');
assert.equal(analysisConsentReady(), false);

/* 확정 뒤 */
assert.equal(consentStateOf([], true, V).valid, false);
assert.equal(consentStateOf([rec({})], true, V).valid, true);
assert.equal(consentStateOf([rec({})], true, V).current?.source, 'signup');
/* 철회하면 무효 */
assert.equal(consentStateOf([rec({ revokedAt: new Date('2026-10-29T02:00:00Z') })], true, V).valid, false);
/* 판이 바뀌면 다시 동의 — 옛 판만 있으면 outdated */
const old = consentStateOf([rec({ version: '2026-10-01' })], true, V);
assert.equal(old.valid, false);
assert.equal(old.outdated, true);
/* 철회 뒤 다시 동의 — 마지막 유효 줄 */
const again = consentStateOf(
  [rec({ id: 'a', revokedAt: new Date('2026-10-29T02:00:00Z') }), rec({ id: 'b', source: 'first_use', agreedAt: new Date('2026-10-29T03:00:00Z') })],
  true,
  V
);
assert.equal(again.valid, true);
assert.equal(again.current?.source, 'first_use');
/* 모르는 출처는 첫 분석으로 */
assert.equal(consentStateOf([rec({ source: 'weird' })], true, V).current?.source, 'first_use');

/* 만 14세 미만은 본인 동의 불가, 생년월일 모르면 막지 않음 */
const now = new Date('2026-10-29T00:00:00Z');
assert.equal(ageOn(new Date('2012-10-30T00:00:00Z'), now), 13);
assert.equal(ageOn(new Date('2012-10-29T00:00:00Z'), now), 14);
assert.ok(consentAgeBlock(new Date('2013-01-01T00:00:00Z'), now));
assert.equal(consentAgeBlock(new Date('2000-01-01T00:00:00Z'), now), null);
assert.equal(consentAgeBlock(null, now), null);

console.log('국외 이전 동의 규칙 18개 통과 — 확정 전 무효 · 지금 판 · 철회 · 재동의 · 만 14세');

/* ─── 건강정보 동의(lib/health-consent.ts) — 우리 문서라 늘 확정, 같은 판 · 철회 틀 ─── */
const H = HEALTH_CONSENT.version;
assert.equal(healthConsentOf([]).valid, false);
assert.equal(healthConsentOf([rec({ version: H })]).valid, true);
assert.equal(healthConsentOf([rec({ version: H, revokedAt: new Date('2026-11-02T00:00:00Z') })]).valid, false);
assert.equal(healthConsentOf([rec({ version: '옛 판' })]).outdated, true);
assert.ok(!/컨디션|수면|키|몸무게/.test(HEALTH_CONSENT.items), '일반 정보는 건강정보 항목에 안 들어간다(U17)');

/* ─── 보호자 동의(lib/guardian.ts) ─── */
const t = new Date('2026-11-01T00:00:00Z');
const kid = new Date('2015-05-01T00:00:00Z');
const row = (o: Partial<NonNullable<GuardianRow>> = {}): GuardianRow => ({ expiresAt: guardianExpiry(t), agreedAt: null, revokedAt: null, ...o });
assert.equal(guardianStateOf(new Date('2000-01-01T00:00:00Z'), null, t), 'none');
assert.equal(guardianStateOf(null, null, t), 'none');
assert.equal(guardianStateOf(kid, null, t), 'needed');
assert.equal(guardianStateOf(kid, row(), t), 'pending');
assert.equal(guardianStateOf(kid, row({ agreedAt: t }), new Date('2026-12-01T00:00:00Z')), 'verified');
assert.equal(guardianStateOf(kid, row(), new Date(t.getTime() + GUARDIAN_WAIT_DAYS * 86_400_000 - 1)), 'pending');
assert.equal(guardianStateOf(kid, row(), new Date(t.getTime() + GUARDIAN_WAIT_DAYS * 86_400_000 + 1)), 'expired');
/* 14세 생일이 지나면 보호자 관문 밖 */
assert.equal(guardianStateOf(new Date('2012-11-01T00:00:00Z'), row(), t), 'none');

console.log('건강정보 · 보호자 동의 규칙 13개 통과 — 늘 확정 · 철회 · 옛 판 · 일반 정보 빠짐 · 대기 · 동의 · 7일 · 14세 생일');
