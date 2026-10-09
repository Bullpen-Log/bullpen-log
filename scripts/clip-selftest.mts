/*
 * 짧은 영상 컷 편집 셀프테스트 — `npm run clip:test`. 저장소 · DB 를 건드리지 않는다.
 *
 *   ① 순수 계산(lib/clip/plan.ts) — 결과 크기 · 비트레이트 · 자르기 구간 · 글자
 *   ② 실제 아이폰 영상으로 자르기(lib/clip/edit.ts) — 노드에는 영상 인코더가 없어 '잘라 붙이기' 길을 탄다.
 *      소리 트랙이 빠졌나 · 길이가 맞나 · 세로 영상이 세로로 남나 · MP4 인가.
 *      영상은 구속 실험대 폴더(~/bullpen-velocity-lab, scripts/velocity-lab/download.mjs 로 받음)에서 가장 긴 것 셋.
 *      폴더가 없으면 ②는 건너뛴다(그렇다고 알린다).
 *   다시 만들기(H.264) 길은 브라우저에서만 돈다 — 편집 화면에서 확인.
 */
import { existsSync, openAsBlob, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import {
  CLIP_BUDGET_BYTES,
  MIN_CLIP_SEC,
  clampTrim,
  clipTimeText,
  estimateBytes,
  even,
  initialTrim,
  lowResolution,
  pickTarget,
  sizeText,
  snapTime,
} from '../lib/clip/plan.ts';
import { exportMutedClip, probeClip } from '../lib/clip/edit.ts';

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? '  OK  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
}
const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

console.log('① 순수 계산');
{
  const t = pickTarget({ width: 1080, height: 1920, fps: 30 }, 10);
  check('세로 1080p 30 · 10초 → 그대로 1080×1920 · 6Mbps', t.width === 1080 && t.height === 1920 && t.bitrate === 6_000_000 && !t.scaled, JSON.stringify(t));
  const k = pickTarget({ width: 3840, height: 2160, fps: 60 }, 20);
  check('4K 60 · 20초 → 긴 변 1920 · 8Mbps', k.width === 1920 && k.height === 1080 && k.bitrate === 8_000_000 && k.scaled, JSON.stringify(k));
  const long = pickTarget({ width: 1920, height: 1080, fps: 30 }, 120);
  check('2분이면 48MB 안 — 720p 로 낮추고 예산 비트레이트', long.longSide === 1280 && estimateBytes(long.bitrate, 120) <= CLIP_BUDGET_BYTES, JSON.stringify(long));
  const small = pickTarget({ width: 480, height: 360, fps: 30 }, 5);
  check('작은 원본은 키우지 않는다', small.width === 480 && small.height === 360 && !small.scaled);
  check('짝수', even(1079) === 1080 && even(361) === 362 && even(1) === 2);
  const odd = pickTarget({ width: 1179, height: 2556, fps: 30 }, 8);
  check('홀수 화면(아이폰 화면 녹화)도 짝수로 줄인다', odd.width % 2 === 0 && odd.height % 2 === 0 && odd.height === 1920, JSON.stringify(odd));
}
{
  check('처음 구간 = 통째', JSON.stringify(initialTrim(7.25)) === JSON.stringify({ start: 0, end: 7.25 }));
  const a = clampTrim(5, 5.2, 10, 'end');
  check(`끝 손잡이가 시작에 붙으면 ${MIN_CLIP_SEC}초 뒤에서 멈춘다`, a.start === 5 && a.end === 6, JSON.stringify(a));
  const b = clampTrim(9.8, 10, 10, 'start');
  check('시작 손잡이가 끝에 붙으면 끝 1초 앞에서 멈춘다', b.start === 9 && b.end === 10, JSON.stringify(b));
  const c = clampTrim(-3, 99, 8);
  check('밖으로 나간 값은 0 ~ 길이로', c.start === 0 && c.end === 8);
  const d = clampTrim(0, 0.4, 0.4);
  check('1초보다 짧은 영상은 통째', d.start === 0 && d.end === 0.4, JSON.stringify(d));
  check('0.1초 단위', snapTime(3.14159) === 3.1 && snapTime(2.06) === 2.1);
  check('시각 글자', clipTimeText(7.34) === '0:07.3' && clipTimeText(65.05) === '1:05.0' && clipTimeText(0) === '0:00.0', `${clipTimeText(7.34)} ${clipTimeText(65.05)}`);
  check('크기 글자', sizeText(12.44 * 1024 * 1024) === '12.4MB' && sizeText(830 * 1024) === '830KB');
  check('웹 카메라 화질(480×360)은 낮음, 720p 이상은 괜찮음', lowResolution({ width: 480, height: 360 }) && !lowResolution({ width: 1280, height: 720 }) && !lowResolution({ width: 1080, height: 1920 }));
}

console.log('② 실제 아이폰 영상 — 잘라 붙이기');
const labDirs = ['2026-09-28', '2026-10-03'].map((d) => path.join(homedir(), 'bullpen-velocity-lab', d, 'clips'));
const samples = labDirs
  .filter((d) => existsSync(d))
  .flatMap((d) => readdirSync(d).filter((f) => /\.(mov|mp4)$/i.test(f)).map((f) => path.join(d, f)))
  .sort((x, y) => statSync(y).size - statSync(x).size)
  .slice(0, 3);
if (samples.length === 0) {
  console.log('  (건너뜀) ~/bullpen-velocity-lab 영상이 없어요 — scripts/velocity-lab/download.mjs 로 받으면 돈다');
}
for (const file of samples) {
  const name = path.basename(file);
  const blob = await openAsBlob(file);
  const info = await probeClip(blob);
  const start = Math.min(0.4, info.duration / 4);
  const end = Math.max(start + 1, info.duration - 0.3);
  const progress: number[] = [];
  const out = await exportMutedClip(blob, { start, end }, { onProgress: (p) => progress.push(p) });
  const back = new Input({ source: new BlobSource(out.file), formats: ALL_FORMATS });
  const video = await back.getPrimaryVideoTrack();
  const audio = await back.getPrimaryAudioTrack();
  const tracks = await back.getTracks();
  const dur = await back.computeDuration();
  const w = video ? await video.getDisplayWidth() : 0;
  const h = video ? await video.getDisplayHeight() : 0;
  const format = await back.getFormat();
  back.dispose();
  const label = `${name} (${info.codec} ${info.width}×${info.height} ${info.duration.toFixed(2)}초, 소리 ${info.hasAudio ? '있음' : '없음'})`;
  check(`${label} — 소리 트랙 없음`, audio === null && tracks.every((t) => t.type !== 'audio'), `트랙 ${tracks.map((t) => t.type).join(',')}`);
  check(`${label} — 영상 트랙 하나`, !!video && tracks.length === 1);
  check(`${label} — 노드는 잘라 붙이기`, out.path === 'copy');
  check(`${label} — 길이 ${(end - start).toFixed(2)}초(±0.1)`, near(dur, end - start, 0.1), `결과 ${dur.toFixed(3)}초`);
  check(`${label} — 화면 모양 그대로(세로는 세로)`, w === info.width && h === info.height && near(out.aspectRatio, info.width / info.height, 0.01), `${w}×${h}`);
  check(`${label} — MP4 · clip.mp4`, format.name === 'MP4' && out.file.name === 'clip.mp4' && out.file.type === 'video/mp4', format.name);
  check(`${label} — 원본보다 작다`, out.file.size < blob.size, `${sizeText(out.file.size)} < ${sizeText(blob.size)}`);
  check(`${label} — 진행률을 알린다`, progress.length > 0 && progress.every((p) => p >= 0 && p <= 1));
}

console.log(`\n${pass}개 통과, ${fail}개 실패`);
if (fail > 0) process.exit(1);
