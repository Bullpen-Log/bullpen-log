/**
 * 팀 · 레슨장 영상 재생 주소 기억 · 다시 받기 횟수(native/src/org/url-cache.ts — org/video.tsx 가 그대로 쓴다) 시험.
 * 실행: npm run native-org-video:test
 * 재현(2026-10-26): 경로만으로 주소를 앱이 켜진 동안 쥐어, 오래 켜 둔 뒤 다시 만든 재생기가 죽은 주소를 썼고, 계정 · 범위가 바뀌어도 같은 주소를 썼다.
 * 실제 재생기의 오류 알림 · 서명 주소 만료는 이 시험이 보지 못한다(시각을 흉내 낸다).
 */
import assert from 'node:assert/strict';
import { createRetry, createUrlCache, KEEP_MS, RETRY_MAX } from '~/org/url-cache';

let n = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  assert.deepEqual(a, b, m);
  n++;
};
let t = 0;
let epoch = 0;
const cache = createUrlCache({ epoch: () => epoch, now: () => t });
const COACH = 'coach:org1';

/* 1. 받은 주소는 20분까지 — 그 뒤 재생기를 다시 만들면 새로 받는다(서버 주소는 받은 때부터 적어도 30분 산다) */
cache.set(COACH, 'v1', 'https://x/v1?token=a');
t = KEEP_MS - 1;
eq(cache.get(COACH, 'v1'), 'https://x/v1?token=a', '20분 안 — 다시 씀');
t = KEEP_MS;
eq(cache.get(COACH, 'v1'), null, '20분 — 새로 받음');
eq(KEEP_MS < 30 * 60_000, true, '서버가 보장하는 30분보다 짧게');

/* 2. 범위가 다르면(다른 조직 · 선수 쪽) 같은 경로라도 따로 */
t = 0;
cache.set(COACH, 'v2', 'https://x/v2?coach');
eq(cache.get('coach:org2', 'v2'), null, '다른 조직');
eq(cache.get('player:m1', 'v2'), null, '선수 쪽');
eq(cache.get(COACH, 'v2'), 'https://x/v2?coach', '같은 범위');

/* 3. 로그아웃 · 다른 계정(세대가 오름) — 앞 계정 주소를 안 쓴다 */
epoch++;
eq(cache.get(COACH, 'v2'), null, '세대가 오르면 없음');
epoch--;

/* 4. 재생 중 주소가 죽음 — 지우고 새로 받는다 */
cache.forget(COACH, 'v2');
eq(cache.get(COACH, 'v2'), null, '지운 뒤 새로');

/* 5. 저절로 다시 받기는 두 번까지 — 끝없이 돌지 않게. '다시 불러오기'를 누르면 처음부터 */
const r = createRetry();
const auto = Array.from({ length: 5 }, () => r.take());
eq(auto, [true, true, false, false, false], `저절로 ${RETRY_MAX}번`);
r.reset();
eq(r.take(), true, '누르면 다시');

/* 6. 오래된 것은 둘 때 치운다 */
t = 0;
cache.set(COACH, 'old', 'u-old');
t = KEEP_MS + 1;
cache.set(COACH, 'new', 'u-new');
eq([cache.get(COACH, 'old'), cache.get(COACH, 'new')], [null, 'u-new'], '지난 것 치움');

console.log(`조직 영상 주소 ${n}개 통과`);
