/**
 * VP01 기본 운동영상 플레이어 — 공통 규칙 시험.
 *
 * 실행: node --import ./scripts/alias-register.mjs scripts/exercise-video-player-selftest.mts
 *
 * 웹(owned-player · youtube-player)과 앱(parts.tsx ClipPlayer · exercise-video-youtube)이 실제로 쓰는 생산 코드
 * lib/exercise-video-state.ts · lib/reference-video.ts 를 그대로 불러 시험한다. 재생 · 멈춤 알림을 받았을 때의 판단
 * (onProviderPlaying · onProviderPaused · CommandTracker), 끌기(beginScrub · endScrub)는 네 어댑터가 이 함수들을 그대로 부르므로
 * 여기서 늦은 알림 순서를 흉내 내 시험한다.
 *
 * 한계(정직하게): React 부품 · HTMLVideoElement · expo-video · WebView 를 띄우지 않는다(저장소에 jsdom · 브라우저 시험 도구가
 * 없고, 시뮬레이터 · Metro 는 이번 발주에서 금지). 그래서 어댑터가 이 함수들을 '올바른 자리에서' 부르는지는 끝의
 * '연결 확인'(생산 소스 읽기)으로만 본다 — 실제 미디어 · YouTube · 기기 동작의 증거가 아니다.
 */
import { readFileSync } from 'node:fs';
import {
  CommandTracker,
  LiveSeek,
  nativeVideoStageHeight,
  videoPictureRect,
  videoTrackAspect,
  createVideoSwipeLease,
  ScrubGestureSession,
  PlaybackIntent,
  beginScrub,
  clampTime,
  createActiveRegistry,
  endScrub,
  finiteTime,
  onProviderPaused,
  onProviderPlaying,
  parseBridgeMessage,
  seekRange,
  settleExternalPause,
  serializeCommand,
  stepTime,
  supportedRates,
  timeText,
  youtubeErrorText,
  ytActiveForPause,
  ytSeekMayStart,
  YT_ID,
  type PlayTicket,
  type ScrubSession,
} from '../lib/exercise-video-state.ts';
import { referenceEmbedUrl, referencePlayerVars } from '../lib/reference-video.ts';

let pass = 0;
let fail = 0;
function ok(cond: unknown, name: string) {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.log(`FAIL ${name}`);
  }
}

/** 손으로 돌리는 시계 — CommandTracker 의 만료 시험용. */
function clock() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

/**
 * 어댑터 순서 흉내. 네 어댑터의 interrupt · tryPlay · 알림 처리 · 끌기가 부르는 생산 함수를 같은 순서로 부른다.
 * 공급자(영상 요소 · YouTube)는 명령을 큐에 쌓아 두었다가 시험이 원하는 때 알림을 보낸다 — 늦은 알림 재현용.
 */
class Adapter {
  intent = new PlaybackIntent();
  tracker: CommandTracker;
  ticket: PlayTicket | null = null;
  scrub: ScrubSession | null = null;
  /** 공급자가 실제로 재생 중인가(알림 기준). */
  providerPlaying = false;
  /** 공급자에 보낸 명령(시험이 늦게 처리). */
  sent: ('play' | 'pause')[] = [];
  want = false;
  id: string;
  reg: ReturnType<typeof createActiveRegistry>;
  acceptExternal: boolean;
  constructor(id: string, reg = createActiveRegistry(), acceptExternal = false, now?: () => number) {
    this.id = id;
    this.reg = reg;
    this.acceptExternal = acceptExternal;
    this.tracker = new CommandTracker(now);
  }
  sync() {
    this.want = this.intent.desired;
  }
  mount() {
    this.intent.setSource();
    this.ticket = this.intent.requestPlay();
    this.sync();
  }
  pausePlayer() {
    this.tracker.sentPause(this.providerPlaying);
    this.sent.push('pause');
  }
  interrupt(reason: Parameters<PlaybackIntent['pause']>[0]) {
    this.intent.pause(reason);
    this.ticket = null;
    this.sync();
    this.pausePlayer();
  }
  tryPlay(t: PlayTicket | null = this.ticket) {
    if (!this.intent.allows(t)) return false;
    this.reg.activate(this.id, () => this.interrupt('other-player'));
    this.tracker.sentPlay();
    this.sent.push('play');
    return true;
  }
  /** 화면 단추(모양 = want) — 어댑터의 toggle 과 같다. */
  toggle() {
    if (this.intent.desired) this.interrupt('user');
    else {
      this.ticket = this.intent.requestPlay();
      this.sync();
      this.tryPlay();
    }
  }
  /** 공급자 알림: 재생 시작 */
  onPlaying() {
    const r = onProviderPlaying(this.intent, this.tracker, { acceptExternal: this.acceptExternal });
    if (r.verdict === 'stop') {
      this.providerPlaying = true; // 공급자는 지금 재생 중 — 어댑터처럼 그 상태로 멈춤을 보낸다
      this.pausePlayer();
      return 'stopped';
    }
    if (r.ticket) {
      this.ticket = r.ticket;
      this.sync();
    }
    this.providerPlaying = true;
    this.reg.activate(this.id, () => this.interrupt('other-player'));
    return 'playing';
  }
  /** 공급자 알림: 자동 재생 막힘(웹 onAutoplayBlocked · 앱 'blocked') — 두 어댑터와 같은 순서 */
  blocked() {
    this.tracker.clear();
    this.intent.pause('user');
    this.ticket = null;
    this.sync();
  }
  /** 공급자 알림: 멈춤 */
  onPaused() {
    this.providerPlaying = false;
    if (onProviderPaused(this.intent, this.tracker, !!this.scrub)) {
      this.ticket = null;
      this.sync();
    }
  }
  scrubStart(at: number) {
    this.scrub = beginScrub(this.intent, at, this.scrub);
    this.sync();
    this.pausePlayer();
  }
  scrubEnd(commit: boolean, t: number, range = seekRange(30)) {
    const s = this.scrub;
    this.scrub = null;
    if (!s) return null;
    if (commit) s.draft = t;
    const r = endScrub(this.intent, s, commit, range);
    this.sync();
    if (r.resume) {
      this.ticket = this.intent.ticket();
      this.tryPlay();
    }
    return r;
  }
}

/* ---------- AC06 늦은 콜백 ---------- */
{
  const m = new Adapter('a');
  m.mount();
  const early = m.ticket;
  m.tryPlay(); // 첫 활성화 재생 명령
  m.toggle(); // 공급자가 재생을 알리기 전에 사용자가 멈춤
  ok(!m.tryPlay(early), 'AC06 멈춘 뒤 늦은 ready 는 재생을 켜지 않는다');
  ok(m.onPlaying() === 'stopped', 'AC06 멈춤 명령 뒤 늦게 온 재생 알림은 다시 멈춘다');
  ok(!m.want, 'AC06 늦은 재생 알림 뒤에도 단추는 재생(의도 멈춤)');
  m.toggle();
  ok(m.intent.desired && m.want && m.sent.at(-1) === 'play', 'AC06 새 명시 재생은 다시 켤 수 있다');
}
{
  const m = new Adapter('a');
  m.mount();
  const ticketA = m.ticket;
  m.intent.setSource(); // 소스 A → B
  m.ticket = m.intent.requestPlay();
  ok(!m.intent.allows(ticketA), 'AC06 소스 A→B 뒤 A 의 ready 표는 무효');
  ok(m.intent.allows(m.ticket), 'AC06 B 의 표는 유효');
}
{
  const m = new Adapter('a');
  m.mount();
  const t = m.ticket;
  m.interrupt('background');
  ok(!m.tryPlay(t), 'AC05/06 배경 전환 뒤 늦은 콜백이 재생하지 않는다');
  ok(!m.intent.desired && m.intent.lastReason === 'background', 'AC05 배경 전환은 재생 의도를 내린다(돌아와도 자동 재개 없음)');
}

/* ---------- AC03 한 번 누름 = 보이는 대로 한 번 ---------- */
{
  // 불러오는 중(의도 재생, 공급자는 아직 재생 전): 단추는 '멈춤' 모양이고 누르면 멈춘다.
  const m = new Adapter('a');
  m.mount();
  m.tryPlay();
  ok(m.want, 'AC03 불러오는 중에도 단추는 의도를 따른다(멈춤 모양)');
  m.toggle();
  ok(!m.want && !m.intent.desired, 'AC03 그 단추를 한 번 누르면 멈춤(재생으로 보이는데 멈추던 문제 없음)');
  m.toggle();
  ok(m.want && m.sent.at(-1) === 'play', 'AC03 다시 한 번 누르면 재생');
}
{
  // 공급자 화면(공식 YouTube 단추 · 미디어 키 · 오디오 끊김)에서 멈춤 → 우리 단추는 한 번에 재생.
  const m = new Adapter('a');
  m.mount();
  m.tryPlay();
  m.onPlaying();
  m.onPaused(); // 우리가 보내지 않은 멈춤
  ok(!m.intent.desired && !m.want, 'AC03 바깥 멈춤은 의도도 멈춤으로 맞춘다');
  m.toggle();
  ok(m.intent.desired && m.sent.at(-1) === 'play', 'AC03 바깥 멈춤 뒤 우리 단추 한 번에 재생');
}
{
  // 우리가 보낸 멈춤의 알림은 '바깥 멈춤'이 아니다.
  const m = new Adapter('a');
  m.mount();
  m.tryPlay();
  m.onPlaying();
  m.toggle(); // 멈춤 명령
  const gen = m.intent.interrupt;
  m.onPaused();
  ok(m.intent.interrupt === gen, 'AC03 우리 멈춤 알림은 중단 세대를 또 올리지 않는다');
}

/* ---------- AC12 공식 YouTube 재생 단추 ---------- */
{
  // 자동 재생이 막혀(onAutoplayBlocked → 의도 멈춤) 사용자가 공식 재생 단추를 누른 경우: 멈추지 않고 받아들인다.
  const reg = createActiveRegistry();
  const m = new Adapter('yt', reg, true);
  m.mount();
  m.tryPlay(); // 준비 뒤 우리 재생 명령
  m.blocked(); // 거절됨 — 멈춤 알림 없이 끝난다
  ok(!m.want, 'AC12 막히면 단추는 재생 모양');
  ok(m.onPlaying() === 'playing', 'AC12 막힌 직후(4초 안) 공식 단추로 튼 재생도 멈추지 않는다');
  ok(m.intent.desired && m.want && m.intent.allows(m.ticket), 'AC12 공식 단추 재생은 사용자 재생 요청으로 받아 새 표를 연다');
  ok(reg.current() === 'yt', 'AC05 공식 단추 재생도 하나만 재생 표에 오른다');
}
{
  // 같은 바깥 재생이라도 자체 영상(acceptExternal=false)은 멈춘다 — 자체 영상의 늦은 'playing' 은 우리 예전 play() 의 것이다.
  const m = new Adapter('own', createActiveRegistry(), false);
  m.mount();
  m.interrupt('user');
  m.tracker.onPaused();
  ok(m.onPlaying() === 'stopped', 'AC06 자체 영상은 원하지 않은 재생을 멈춘다');
}
{
  // 우리가 멈춘 직후(재생기가 아직 처리 전) 늦게 온 재생 = late → YouTube 여도 멈춘다(공식 단추로 오해하지 않는다).
  const m = new Adapter('yt', createActiveRegistry(), true);
  m.mount();
  m.tryPlay();
  m.toggle();
  ok(m.onPlaying() === 'stopped' && !m.intent.desired, 'AC06 멈춤 뒤 늦게 처리된 재생 명령은 YouTube 도 다시 멈춘다');
}
{
  // 처리 안 된 명령은 만료 — 이미 멈춘 것을 또 멈춰 알림이 안 와도, 나중의 공식 재생을 '늦은 재생'으로 오해하지 않는다.
  const c = clock();
  const m = new Adapter('yt', createActiveRegistry(), true, c.now);
  m.mount();
  m.tryPlay();
  m.onPlaying();
  m.toggle(); // 멈춤 명령(알림이 안 왔다고 가정)
  c.advance(5000);
  ok(m.tracker.current() === null, 'AC06 기다리던 명령은 시간이 지나면 잊는다');
  ok(m.onPlaying() === 'playing' && m.intent.desired, 'AC12 만료 뒤 공식 재생은 사용자 재생으로 받는다');
}
{
  // 재생 중이 아닐 때 보낸 멈춤은 알림을 기다리지 않는다.
  const t = new CommandTracker();
  t.sentPause(false);
  ok(t.current() === null, 'AC06 재생 중이 아닐 때의 멈춤은 기다리지 않는다');
  t.sentPlay();
  t.sentPause(false);
  ok(t.current() === 'pause', 'AC06 재생 명령을 기다리는 중의 멈춤은 기다린다');
}

{
  // YouTube 멈춤의 '활동 중' 판단 — 버퍼링 · 반복 재시작 중에 멈춰도 뒤따르는 재생을 늦은 재생으로 멈춘다.
  ok(ytActiveForPause(3, false, true) && ytActiveForPause(0, false, true) && ytActiveForPause(-1, false, true), 'AC06 버퍼링 · 끝 · 반복 재시작 중 멈춤은 알림을 기다린다');
  ok(!ytActiveForPause(2, false, true) && !ytActiveForPause(5, false, false) && !ytActiveForPause(-1, false, false), 'AC06 이미 멈춤 · 대기 · 첫 시작 전 멈춤은 기다리지 않는다');
  const m = new Adapter('yt', createActiveRegistry(), true);
  m.mount();
  m.tryPlay();
  m.onPlaying();
  m.tracker.onPaused(); // (만료 등으로) 기다리던 명령 없음
  m.intent.pause('user');
  m.tracker.sentPause(ytActiveForPause(3, false, true)); // 버퍼링 중 사용자 멈춤
  ok(m.onPlaying() === 'stopped', 'AC06 버퍼링 중 멈춤 뒤 온 재생은 공식 단추로 오해하지 않고 멈춘다');
}
{
  // 시작 전 · 대기 상태의 탐색은 재생을 시작한다(공식 문서) — 의도가 멈춤이면 그 재생을 멈춘다.
  ok(ytSeekMayStart(null) && ytSeekMayStart(-1) && ytSeekMayStart(5) && !ytSeekMayStart(2) && !ytSeekMayStart(1), 'AC09 탐색이 재생을 시작할 수 있는 상태');
  const m = new Adapter('yt', createActiveRegistry(), true);
  m.mount();
  m.interrupt('hidden'); // 준비 전에 화면을 떠남 — 재생기는 대기(5)
  m.tracker.onPaused();
  if (ytSeekMayStart(5) && !m.intent.desired) m.tracker.sentPause(true); // 어댑터 seekTo 와 같은 순서
  ok(m.onPlaying() === 'stopped' && !m.intent.desired, 'AC09 멈춘 채 처음부터 · 탐색이 재생을 켜지 않는다');
}
{
  // 앱 자체 영상: 바깥 멈춤 확정(잠시 뒤에도 멈춰 있을 때만).
  const it = new PlaybackIntent();
  it.setSource();
  it.requestPlay();
  ok(!settleExternalPause(it, { playing: true, scrubbing: false, ready: true }) && it.desired, 'AC02 iOS 반복 끝의 잠깐 멈춤(곧 재생)은 사용자 멈춤이 아니다');
  ok(!settleExternalPause(it, { playing: false, scrubbing: false, ready: false }) && it.desired, 'AC02 버퍼링 중 멈춤은 사용자 멈춤이 아니다');
  ok(!settleExternalPause(it, { playing: false, scrubbing: true, ready: true }) && it.desired, 'AC07 끄는 중 멈춤은 사용자 멈춤이 아니다');
  ok(settleExternalPause(it, { playing: false, scrubbing: false, ready: true }) && !it.desired, 'AC03 준비된 채 멈춰 있으면(오디오 끊김 등) 의도를 멈춤으로');
}
{
  const t = new CommandTracker();
  t.sentPlay();
  t.clear();
  ok(t.current() === null && t.onPlaying() === 'external', 'AC12 거절된 재생 명령을 버리면 다음 재생은 바깥(공식 단추)');
}

/* ---------- AC02 반복 ---------- */
{
  // 끝 도달 = 반복은 공급자 몫(loop). 반복 재시작의 재생 알림은 의도가 재생이면 그대로 둔다.
  const m = new Adapter('a');
  m.mount();
  m.tryPlay();
  m.onPlaying();
  ok(m.onPlaying() === 'playing' && m.intent.desired, 'AC02 반복 재시작 알림은 재생을 유지한다');
  const v = referencePlayerVars('dQw4w9WgXcQ', 'https://example.com');
  ok(v.loop === 1 && v.playlist === 'dQw4w9WgXcQ', 'AC02 YouTube 한 영상 반복 = loop 1 + 같은 영상 playlist');
}

/* ---------- AC05 하나만 재생 ---------- */
{
  const reg = createActiveRegistry();
  const a = new Adapter('a', reg);
  const b = new Adapter('b', reg);
  a.mount();
  a.tryPlay();
  a.onPlaying();
  b.mount();
  b.tryPlay();
  ok(reg.current() === 'b', 'AC05 두 번째 활성화가 현재 플레이어');
  ok(!a.intent.desired && a.intent.lastReason === 'other-player', 'AC05 앞 플레이어는 멈추고 의도를 잃는다');
  ok(!a.tryPlay(a.ticket), 'AC05 앞 플레이어의 늦은 콜백은 재생하지 않는다');
  reg.release('a');
  ok(reg.current() === 'b', 'AC05 다른 플레이어 해제는 현재 플레이어를 지우지 않는다');
  reg.release('b');
  ok(reg.current() === null, 'AC05 해제');
}

/* ---------- AC07 끌기 ---------- */
{
  const m = new Adapter('a');
  m.mount();
  m.tryPlay();
  m.onPlaying();
  m.scrubStart(10);
  const r = m.scrubEnd(true, 99);
  ok(r?.seekTo === 30 && r.resume && m.sent.at(-1) === 'play', 'AC07 놓으면 범위 안으로 잘라 이동하고 재생 중이었으면 재개');
}
{
  const m = new Adapter('a');
  m.mount();
  m.interrupt('user');
  m.scrubStart(10);
  const r = m.scrubEnd(true, 12);
  ok(r?.seekTo === 12 && !r.resume && !m.intent.desired, 'AC07 멈춘 영상은 끌어도 멈춘 채');
}
{
  // 검토 보완: 우리 멈춤을 누른 직후(공급자 알림 전, 화면 playing 은 아직 true) 끌어도 재개하지 않는다.
  const m = new Adapter('a');
  m.mount();
  m.tryPlay();
  m.onPlaying();
  m.toggle(); // 멈춤 — providerPlaying 은 알림 전이라 아직 true
  ok(m.providerPlaying, '(전제) 공급자 멈춤 알림 전');
  m.scrubStart(10);
  const r = m.scrubEnd(true, 15);
  ok(r?.seekTo === 15 && !r.resume, 'AC07 멈춤 직후 끌기는 재생을 되살리지 않는다');
}
{
  // 검토 보완: 공급자 화면에서 멈춘 뒤 끌어도 재개하지 않는다.
  const m = new Adapter('yt', createActiveRegistry(), true);
  m.mount();
  m.tryPlay();
  m.onPlaying();
  m.onPaused(); // 공식 멈춤
  m.scrubStart(10);
  const r = m.scrubEnd(true, 15);
  ok(r?.seekTo === 15 && !r.resume && !m.intent.desired, 'AC07 공식 멈춤 뒤 끌기는 멈춘 채');
}
{
  // 검토 보완: 끄는 중 중단(배경 · 화면 이탈 · 다른 영상)이면 놓을 때 이동은 하고 재개만 막는다(세션을 버리지 않는다).
  const m = new Adapter('a');
  m.mount();
  m.tryPlay();
  m.onPlaying();
  m.scrubStart(10);
  m.interrupt('background');
  ok(m.scrub !== null, 'AC07 중단이 끌기 세션을 지우지 않는다');
  const r = m.scrubEnd(true, 20);
  ok(r?.seekTo === null && !r.resume && !m.intent.desired, 'AC07 끄는 중 배경 전환이면 늦은 이동·재개 모두 막는다');
}
{
  const m = new Adapter('a');
  m.mount();
  m.tryPlay();
  m.onPlaying();
  m.scrubStart(10);
  const r = m.scrubEnd(false, 20);
  ok(r?.seekTo === 10 && r.resume, 'AC07 취소는 미리보기 이전 원래 위치 복원, 재생 중이었으면 재개');
}
{
  const m = new Adapter('a');
  m.mount();
  m.tryPlay();
  m.onPlaying();
  m.scrubStart(10);
  m.intent.setSource(); // 소스 교체
  const r = m.scrubEnd(true, 20);
  ok(!r?.resume, 'AC07 끄는 중 소스 교체면 재개하지 않는다');
}
{
  // 검토 보완: 두 번째 손가락 · 두 번째 끌기 시작은 처음 세션(재생 의도)을 덮지 않는다.
  const m = new Adapter('a');
  m.mount();
  m.tryPlay();
  m.onPlaying();
  m.scrubStart(10);
  const first = m.scrub;
  m.scrubStart(11);
  ok(m.scrub === first && first?.wasPlaying, 'AC07 끄는 중 다시 시작해도 처음 세션 유지');
  ok(m.scrubEnd(true, 12)?.resume, 'AC07 그래서 놓으면 원래대로 재개');
}
{
  // 끄는 중의 우리 멈춤 알림 · 늦은 바깥 멈춤은 의도를 바꾸지 않는다(끝난 뒤 재개 판단은 세션이 한다).
  const m = new Adapter('a');
  m.mount();
  m.tryPlay();
  m.onPlaying();
  m.scrubStart(10);
  m.onPaused();
  ok(m.scrubEnd(true, 12)?.resume, 'AC07 끄는 동안의 멈춤 알림은 재개를 막지 않는다');
}
ok(stepTime(28, 1, seekRange(30)) === 30 && stepTime(3, -1, seekRange(30)) === 0, 'AC07 ±5초 증감과 범위');

/* ---------- AC08 길이 경계 ---------- */
for (const d of [NaN, Infinity, -1, 0, null, undefined]) ok(seekRange(d as number) === null, `AC08 길이 ${String(d)} 면 탐색 끔`);
ok(seekRange(30, { start: 5, end: 3 }) === null, 'AC08 뒤집힌 seekable 범위면 탐색 끔');
ok(JSON.stringify(seekRange(30, { start: 2, end: 40 })) === '{"min":2,"max":30}', 'AC08 seekable 교차');
ok(timeText(NaN) === '--:--' && timeText(Infinity) === '--:--' && timeText(-3) === '--:--', 'AC08 모르는 시간은 --:--');
ok(timeText(65.9) === '1:05', 'AC08 m:ss');
ok(clampTime(NaN, seekRange(30)) === 0 && clampTime(5, null) === 0, 'AC08 이상한 값은 범위 시작');
ok(finiteTime(Infinity) === 0, 'AC08 finiteTime');
ok(stepTime(NaN, 1, null) === 0, 'AC08 범위 없으면 증감 0');

/* ---------- AC09 배속 ---------- */
ok(JSON.stringify(supportedRates([0.25, 0.5, 1, 1.5, 2])) === '[0.5,1]', 'AC09 공식 목록과 겹치는 배속만');
ok(JSON.stringify(supportedRates([1])) === '[1]', 'AC09 0.5 를 안 주면 0.5 를 내밀지 않는다');
ok(supportedRates(null).length === 0, 'AC09 목록 없으면 배속 없음');

/* ---------- AC11/12 YouTube 설정 ---------- */
{
  const v = referencePlayerVars('dQw4w9WgXcQ', 'https://example.com');
  ok(v.enablejsapi === 1 && v.origin === 'https://example.com', 'AC11 API 켜기 + 삽입 문서 출처');
  ok(!('autoplay' in v), 'AC11 autoplay 없음 — 준비 뒤 의도를 확인하고 우리가 튼다(준비 전 이탈 뒤 저절로 재생 방지)');
  ok(!('controls' in v) || v.controls !== 0, 'AC12 공식 조작부를 끄지 않는다');
  ok(referenceEmbedUrl('dQw4w9WgXcQ').includes('rel=0'), 'AC12 옛 삽입 주소 유지');
  ok(YT_ID.test('dQw4w9WgXcQ') && !YT_ID.test('abc"><script'), 'AC13 영상 번호 검사');
  ok(youtubeErrorText(153).includes('확인하지 못했어요'), 'AC12 153 따로 안내');
  ok(youtubeErrorText(150) === youtubeErrorText(101), 'AC11 삽입 막힘 101/150 같은 안내');
}

/* ---------- AC13 앱 다리 ---------- */
{
  const ex = { pid: 'yt-1', gen: 2 };
  const msg = (o: object) => JSON.stringify({ pid: 'yt-1', gen: 2, ...o });
  ok(parseBridgeMessage(msg({ t: 'ready', duration: 30, rates: [0.5, 1], muted: false }), ex)?.t === 'ready', 'AC13 정상 ready');
  ok(parseBridgeMessage(JSON.stringify({ pid: 'yt-1', gen: 1, t: 'blocked' }), ex) === null, 'AC13 지난 세대 무시');
  ok(parseBridgeMessage(JSON.stringify({ pid: 'yt-9', gen: 2, t: 'blocked' }), ex) === null, 'AC13 다른 플레이어 무시');
  ok(parseBridgeMessage('{bad json', ex) === null, 'AC13 깨진 JSON 무시');
  ok(parseBridgeMessage(42, ex) === null, 'AC13 글자가 아니면 무시');
  ok(parseBridgeMessage('x'.repeat(3000), ex) === null, 'AC13 너무 긴 메시지 무시');
  ok(parseBridgeMessage(msg({ t: 'time', time: 'NaN', duration: 30, muted: false }), ex) === null, 'AC13 숫자 아닌 시간 무시');
  ok(parseBridgeMessage(msg({ t: 'time', time: -1, duration: 30, muted: false }), ex) === null, 'AC13 음수 시간 무시');
  ok(parseBridgeMessage(msg({ t: 'state', state: 7, time: 1, duration: 30 }), ex) === null, 'AC13 모르는 상태 무시');
  ok(parseBridgeMessage(msg({ t: 'rate', rate: 99 }), ex) === null, 'AC13 범위 밖 배속 무시');
  ok(parseBridgeMessage(msg({ t: 'error', code: 1.5 }), ex) === null, 'AC13 정수 아닌 오류 코드 무시');
  ok(parseBridgeMessage(msg({ t: 'eval', code: 'alert(1)' }), ex) === null, 'AC13 모르는 종류 무시');
  ok(parseBridgeMessage(msg({ t: 'ready', duration: 30, rates: [Infinity, 1], muted: false }), ex)?.t === 'ready', 'AC13 배속 목록의 무한값은 걸러냄');
  ok(serializeCommand({ cmd: 'seek', value: Infinity }, 2) === null, 'AC13 무한 seek 명령 거절');
  ok(serializeCommand({ cmd: 'rate', value: 0 }, 2) === null, 'AC13 0 배속 거절');
  ok(serializeCommand({ cmd: 'eval' } as never, 2) === null, 'AC13 모르는 명령 거절');
  ok(serializeCommand({ cmd: 'play' }, -1) === null, 'AC13 잘못된 세대 거절');
  ok(serializeCommand({ cmd: 'seek', value: 12.5 }, 2) === '{"cmd":"seek","value":12.5,"preview":false,"gen":2}', 'AC13 정상 seek 명령');
}

/*
 * ---------- 연결 확인(생산 소스 읽기) ----------
 * 위 규칙을 어댑터가 실제로 부르는지 — 동작 증거가 아니라 연결이 빠지지 않았는지만 본다(빠지면 실패).
 */
{
  const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
  const files = {
    webOwned: src('components/exercise-video/owned-player.tsx'),
    webYt: src('components/exercise-video/youtube-player.tsx'),
    appOwned: src('native/src/workout/parts.tsx'),
    appYt: src('native/src/workout/exercise-video-youtube.tsx'),
  };
  for (const [name, s] of Object.entries(files)) {
    ok(/onProviderPlaying\(/.test(s), `연결 ${name}: 재생 알림을 공통 판단으로`);
    ok(/beginScrub\([^;]{0,80}scrub\.current\)/.test(s), `연결 ${name}: 끌기 시작이 기존 세션을 넘긴다`);
    ok(/playing(=\{|: )want/.test(s), `연결 ${name}: 조작부 단추는 의도(want)를 따른다`);
    ok(!/const interrupt = [\s\S]{0,200}scrub\.current = null/.test(s), `연결 ${name}: 중단이 끌기 세션을 지우지 않는다`);
  }
  ok(/acceptExternal:/.test(files.webYt) && /acceptExternal:/.test(files.appYt), '연결 YouTube 두 곳: 공식 재생 단추를 받아들인다');
  ok(/acceptExternal: false/.test(files.webOwned) && /acceptExternal: false/.test(files.appOwned), '연결 자체 영상 두 곳: 원하지 않은 재생을 멈춘다');
  ok(/onProviderPaused\(/.test(files.webOwned) && /onProviderPaused\(/.test(files.webYt) && /onProviderPaused\(/.test(files.appYt), '연결 바깥 멈춤 맞추기(웹 둘 · 앱 YouTube)');
  ok(/EXTERNAL_PAUSE_SETTLE_MS/.test(files.appOwned) && /settleExternalPause\(/.test(files.appOwned), '연결 앱 자체 영상: iOS 반복 끝 잠깐 멈춤을 기다렸다 공통 판단으로 확정');
  for (const [name, s] of Object.entries(files)) ok(/const tryPlay = [\s\S]{0,260}intent\.current\.allows\(/.test(s), `연결 ${name}: tryPlay 가 의도 표를 확인`);
  ok(/onAutoplayBlocked[\s\S]{0,120}tracker\.current\.clear\(\)/.test(files.webYt) && /case 'blocked':[\s\S]{0,80}tracker\.current\.clear\(\)/.test(files.appYt), '연결 YouTube 두 곳: 막히면 기다리던 재생 명령을 버린다');
  ok(/ytSeekMayStart\(/.test(files.webYt) && /ytSeekMayStart\(/.test(files.appYt), '연결 YouTube 두 곳: 대기 상태 탐색이 재생을 켜지 않게');
  ok(/originOf\(r\.url\) === originOf\(SITE_URL\)/.test(files.appYt) && !/startsWith\(SITE_URL\)/.test(files.appYt), '연결 앱 YouTube: 최상위 이동 출처를 정확히 비교');
  ok(/onOpenWindow=/.test(files.appYt), '연결 앱 YouTube: 새 창 링크가 재생기 창을 덮지 않는다');
}

// Real timer boundaries: latest-only previews cannot overwrite final seek or survive interruption.
{
  const calls: number[] = [];
  const live = new LiveSeek(20);
  live.request(() => calls.push(1));
  for (let i = 2; i <= 20; i++) live.request(() => calls.push(i));
  ok(calls.join(',') === '1', 'live preview first frame is immediate; burst coalesced');
  await new Promise((resolve) => setTimeout(resolve, 35));
  ok(calls.join(',') === '1,20', 'live preview sends latest target only');
  live.request(() => calls.push(99));
  live.cancel();
  calls.push(50); // final exact seek
  await new Promise((resolve) => setTimeout(resolve, 30));
  ok(calls.join(',') === '1,20,50', 'pending preview cannot overwrite final seek');
  live.request(() => calls.push(60));
  live.request(() => calls.push(70));
  live.cancel();
  await new Promise((resolve) => setTimeout(resolve, 30));
  ok(!calls.includes(70), 'interrupt/unmount drops pending preview');
  ok(nativeVideoStageHeight(343, 667, 9 / 16) === 420, 'portrait inline stays bounded');
  ok(nativeVideoStageHeight(700, 375, 9 / 16) === 135, 'landscape reserves separate footer and safe space');
  ok(nativeVideoStageHeight(343, 667, 16 / 9, 600) === 420, 'explicit height cannot overflow available stage');
  ok(Number.isFinite(nativeVideoStageHeight(343, 667, NaN)), 'invalid aspect falls back safely');
  ok(serializeCommand({ cmd: 'loop', value: false }, 1) === '{"cmd":"loop","value":false,"gen":1}', 'bridge preserves loop off');
  ok(JSON.parse(serializeCommand({ cmd: 'seek', value: 5, preview: true }, 1)!).preview === true, 'bridge distinguishes preview from committed seek');
}

// R2 real production geometry / lease / touch ownership. No native-device claim.
{
  const wide = videoPictureRect(343, 218, 16 / 9);
  ok(Math.abs(wide.height - 192.9375) < 0.001 && wide.width === 343, 'R2 fixed detail height is only a cap; no invented 25pt bezel');
  const portrait = videoPictureRect(343, 420, 9 / 16);
  ok(portrait.width === 236.25 && portrait.height === 420, 'R2 portrait entire picture fits without crop');
  const landscape = videoPictureRect(750, 320, 9 / 16);
  ok(landscape.width === 180 && landscape.height === 320 && landscape.x === 285, 'R2 fullscreen portrait keeps source ratio when rotated');
  for (const [w, h, r] of [[343,218,16/9],[343,420,9/16],[750,320,16/9],[750,320,9/21],[320,500,3],[343,400,1]]) {
    const q = videoPictureRect(w,h,r);
    ok(q.width <= w + 1e-8 && q.height <= h + 1e-8 && Math.abs(q.width/q.height-r) < 1e-9, `R2 fit invariant ${w}x${h} ratio ${r}`);
  }
  ok(Number.isFinite(videoPictureRect(NaN,0,Infinity).width), 'R2 invalid dimensions stay finite');
  ok(videoTrackAspect(1920,1080,16/9) === 16/9, 'R2 landscape track dimensions');
  ok(videoTrackAspect(1920,1080,9/16) === 9/16, 'R2 registered portrait disambiguates iOS natural-size rotation');
  ok(videoTrackAspect(undefined,undefined,9/16) === 9/16, 'R2 metadata pending uses registered orientation');
  ok(videoTrackAspect(0,1080,null) === 9/16, 'R2 invalid track dimensions use owned fallback');

  const calls: boolean[] = [];
  const lease = createVideoSwipeLease((blocked) => calls.push(blocked));
  const a = lease.acquire(); const b = lease.acquire();
  ok(calls.join(',') === 'true', 'R2 two players exclude full-screen pop once before touch');
  a(); a(); ok(calls.length === 1, 'R2 one unmount/duplicate cleanup cannot release another player');
  b(); ok(calls.join(',') === 'true,false', 'R2 last blur/unmount restores route default exactly once');
  const c = lease.acquire(); c(); ok(calls.join(',') === 'true,false,true,false', 'R2 focus return reacquires and later releases');
  const other: boolean[] = []; const d = createVideoSwipeLease((v) => other.push(v)).acquire();
  ok(calls.length === 4 && other.join(',') === 'true', 'R2 separate routes do not share navigation exclusion'); d();

  const touch = new ScrubGestureSession();
  ok(touch.begin(3) && !touch.begin(99) && touch.value === 3, 'R2 initial down owns one session, no secondary-touch reset');
  ok(touch.move(7) && touch.value === 7, 'R2 movement updates owned session');
  const end = touch.finish(true);
  ok(end?.commit && end.time === 7 && touch.finish(true) === null, 'R2 successful release commits exactly once');
  ok(!touch.move(99), 'R2 late move after finalize ignored');
  touch.begin(4); touch.move(8);
  ok(touch.finish(false)?.commit === false && touch.finish(true) === null, 'R2 native cancellation cannot later commit');
  touch.begin(2);
  ok(touch.finish(false) != null && !touch.active, 'R2 layout/unmount cancellation releases ownership');
}

console.log(`exercise-video-player selftest: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
