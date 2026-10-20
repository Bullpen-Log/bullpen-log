/**
 * 새 앱 업데이트 서버 시험 — R2 서명(AWS 문서 예와 같은 서명) · 업데이트 약속 답.
 *   npm run app-update:test
 */
import { presignUrl } from '../lib/r2.ts';
import { latestKeyOf, manifestOf, updateResponse, type StoredUpdate } from '../lib/app-update.ts';

let passed = 0;
let failed = 0;
function check(ok: boolean, name: string) {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}`);
}

/* AWS S3 문서 'Authenticating Requests: Using Query Parameters' 의 예 — 서명이 글자까지 같아야 한다 */
const url = presignUrl({
  method: 'GET',
  host: 'examplebucket.s3.amazonaws.com',
  path: '/test.txt',
  region: 'us-east-1',
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  date: new Date('2013-05-24T00:00:00Z'),
  expiresSec: 86400,
});
check(url.endsWith('X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404'), `SigV4 쿼리 서명이 AWS 예와 같다 — ${url.slice(-70)}`);

const u: StoredUpdate = {
  id: '0b8f0c5e-1111-4222-8333-444455556666',
  createdAt: '2026-10-20T12:00:00.000Z',
  runtimeVersion: 'abc123',
  launchAsset: { key: 'k0', hash: 'h0', path: 'updates/files/aa', contentType: 'application/javascript' },
  assets: [{ key: 'k1', hash: 'h1', path: 'updates/files/bb', contentType: 'image/png', fileExtension: '.png' }],
  expoClient: { name: 'Bullpen Log' },
};
const signed = (k: string) => `https://r2/${k}?sig`;
const m = manifestOf(u, signed);
check(m.launchAsset.url === 'https://r2/updates/files/aa?sig' && !('fileExtension' in m.launchAsset), 'manifest — 화면 코드 주소 · 확장자 없음');
check(m.assets[0].fileExtension === '.png' && m.extra.expoClient?.name === 'Bullpen Log', 'manifest — 그림 확장자 · expoClient');

const ask = (o: Partial<Parameters<typeof updateResponse>[0]>) =>
  updateResponse({ runtimeVersion: 'abc123', platform: 'ios', protocolVersion: '1', currentUpdateId: null, ...o }, u, signed, 'B');
const fresh = ask({});
check(fresh.status === 200 && fresh.body.includes('name="manifest"') && fresh.headers['expo-protocol-version'] === '1', '새 업데이트 — manifest 한 조각');
check(ask({ currentUpdateId: u.id }).body.includes('noUpdateAvailable'), '이미 최신이면 업데이트 없음 지시');
check(ask({ runtimeVersion: 'other' }).body.includes('noUpdateAvailable'), '다른 바닥 판이면 업데이트 없음(바닥 코드가 다른 앱에 화면 코드를 주지 않는다)');
check(ask({ protocolVersion: '0', currentUpdateId: u.id }).status === 204, '약속 0 은 204');
check(ask({ platform: 'android' }).status === 400 && ask({ runtimeVersion: null }).status === 400, 'iOS 아님 · 판 없음은 400');
check(updateResponse({ runtimeVersion: 'abc123', platform: 'ios', protocolVersion: '1', currentUpdateId: null }, null, signed, 'B').body.includes('noUpdateAvailable'), '올린 업데이트가 없으면 업데이트 없음');
check(fresh.body.startsWith('--B\r\n') && fresh.body.endsWith('--B--\r\n'), 'multipart 경계');
check(latestKeyOf('ab/../c') === 'updates/ab_.._c/latest.json', '저장 자리에 / 를 못 넣는다');

console.log(`\n통과 ${passed} / 실패 ${failed}`);
if (failed) process.exit(1);
