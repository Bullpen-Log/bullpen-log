import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { AppState, Dimensions, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { ShouldStartLoadRequest, WebViewOpenWindowEvent } from 'react-native-webview/lib/WebViewTypes';
import {
  CommandTracker,
  LiveSeek,
  nativeVideoStageHeight,
  PlaybackIntent,
  beginScrub,
  clampTime,
  endScrub,
  onProviderPaused,
  onProviderPlaying,
  parseBridgeMessage,
  seekRange,
  serializeCommand,
  stepTime,
  youtubeErrorText,
  ytActiveForPause,
  ytSeekMayStart,
  YT_ID,
  type BridgeCommand,
  type InterruptReason,
  type PlayTicket,
  type ScrubSession,
  type YtState,
} from '@/lib/exercise-video-state';
import { referencePlayerVars, referenceWatchUrl } from '@/lib/reference-video';
import { SITE_URL } from '~/lib/site';
import { PALETTES, usePalette } from '~/lib/ui';
import { Press } from '~/shell/press';
import { activeExerciseVideo, nextVideoId } from './exercise-video-active';
import { EXERCISE_VIDEO_RATES, ExerciseVideoControls } from './exercise-video-controls';
import { useExerciseVideoLifecycle, useOffscreenPause, visibleFraction } from './exercise-video-visibility';

/**
 * YouTube 참고 영상(앱) — 설치된 WebView 안의 공식 IFrame Player API(VP01).
 *
 * - 공식 재생기의 조작부 · 표시 · 광고 · 링크를 그대로 두고 덮개를 올리지 않는다. 크게 보기는 공식 재생기의 전체 화면.
 *   OS 가 띄우는 전체 화면에는 우리 바깥 조작부가 따라가지 않는다(정직한 한계).
 * - WebView → 앱 메시지는 parseBridgeMessage 로 형식 · 플레이어 번호 · 세대를 검사해 맞지 않으면 버린다.
 * - 앱 → WebView 는 정해진 명령 종류와 유한한 숫자만(serializeCommand) JSON 글자로 넘기고, 페이지 안에서 다시 검사한다.
 *   메시지가 준 코드를 실행하지 않는다. 재생기 문서(최상위 창)는 처음 불러온 우리 문서에서 바뀌지 않는다 — 공식 로고 ·
 *   제목 · 'YouTube 에서 보기' 같은 링크는 이 창을 덮지 않고 앱 안 브라우저로 연다(덮으면 재생기 · 다리가 사라졌다).
 * - 공식 재생 단추로 튼 재생은 사용자 재생 요청으로 받고, 공식 멈춤은 의도에 맞춘다. 우리가 멈춘 뒤 늦게 처리된 재생만 다시 멈춘다.
 * - 출처: baseUrl 을 우리 사이트(SITE_URL)로 두고 playerVars.origin 도 같게. 이것만으로 YouTube 클라이언트 식별 요건을
 *   충족한다고 단정하지 않는다(납품 문서의 질의 참고). 153 오류는 따로 안내한다.
 * - 화면 최소 200×200 — 무대 높이를 200 밑으로 줄이지 않는다.
 */
export function YouTubeExerciseVideo(props: { videoId: string; aspectRatio: number | null; height?: number }) {
  /* 다시 불러오기 = WebView · 재생기를 통째로 새로 만들고 세대를 올린다(지난 세대 메시지는 버린다) */
  const [gen, setGen] = useState(0);
  return <YouTubeInner key={gen} {...props} gen={gen} onRetry={() => setGen((g) => g + 1)} />;
}

function YouTubeInner({ videoId, aspectRatio, height, gen, onRetry }: { videoId: string; aspectRatio: number | null; height?: number; gen: number; onRetry: () => void }) {
  const c = usePalette();
  const window = useWindowDimensions();
  const [width, setWidth] = useState(window.width - 32);
  const loopRef = useRef(true);
  const [loop, setLoop] = useState(true);
  const web = useRef<ComponentRef<typeof WebView>>(null);
  const stage = useRef<ComponentRef<typeof View>>(null);
  const intent = useRef(new PlaybackIntent());
  const tracker = useRef(new CommandTracker());
  const ticket = useRef<PlayTicket | null>(null);
  const scrub = useRef<ScrubSession | null>(null);
  const [scrubbing, setScrubbingState] = useState(false);
  const preview = useRef(new LiveSeek(160));
  const visible = useRef(true);
  const playingRef = useRef(false);
  const lastState = useRef<YtState | null>(null);
  const hasPlayed = useRef(false);
  const failed = useRef(false);
  const docLoaded = useRef(false);
  const readyRef = useRef(false);
  const mutePinnedUntil = useRef(0);
  const [pid] = useState(() => nextVideoId('yt'));

  /* 누른 뒤 마운트(첫 활성화) — 처음 의도는 재생. 단추 모양 · 동작은 이 의도를 따른다 */
  const [want, setWant] = useState(true);
  const [hint, setHint] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [rates, setRates] = useState<number[]>([]);
  const [rate, setRate] = useState(1);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<{ text: string; code: number | null } | null>(null);
  const [blocked, setBlocked] = useState(false);
  const syncWant = () => setWant(intent.current.desired);
  const markPlaying = (on: boolean) => {
    playingRef.current = on;
    if (on) hasPlayed.current = true;
    setPlaying(on);
  };

  const send = (cmd: BridgeCommand) => {
    const json = serializeCommand(cmd, gen);
    if (!json || !web.current) return;
    // JSON 글자를 다시 JSON 문자열 리터럴로 감싸 넘긴다 — 페이지는 글자만 받고 해석 · 검사한다.
    web.current.injectJavaScript(`window.__bpCmd && window.__bpCmd(${JSON.stringify(json)}); true;`);
  };
  const pausePlayer = () => {
    tracker.current.sentPause(ytActiveForPause(lastState.current, playingRef.current, hasPlayed.current));
    send({ cmd: 'pause' });
  };
  /** 멈춤. 끄는 중이어도 끌기 세션은 남긴다 — 놓을 때 이동은 하고 재개만 막는다(endScrub). */
  const interrupt = (reason: InterruptReason) => {
    preview.current.cancel();
    setScrubbingState(false);
    if (reason === 'blur' || reason === 'background' || reason === 'offscreen') visible.current = false;
    intent.current.pause(reason);
    ticket.current = null;
    syncWant();
    pausePlayer();
  };
  const startPlay = () => {
    activeExerciseVideo.activate(pid, () => interrupt('other-player'));
    tracker.current.sentPlay();
    send({ cmd: 'play' });
  };
  /** 시작. gesture = 사용자가 방금 누른 시작. 아니면(준비 뒤 · 끌기 뒤 재개) 무대가 절반 넘게 보일 때만 스크립트로 튼다. */
  const tryPlay = (gesture: boolean) => {
    if (!readyRef.current || failed.current || !intent.current.allows(ticket.current)) return;
    if (gesture && AppState.currentState === 'active') {
      visible.current = true;
      startPlay();
      return;
    }
    const t = ticket.current;
    const v = stage.current;
    if (!v) return;
    v.measureInWindow((x, y, width, height) => {
      if (!intent.current.allows(t) || failed.current || AppState.currentState !== 'active') return;
      if (visibleFraction({ x, y, width, height }, Dimensions.get('window')) > 0.5) { visible.current = true; startPlay(); }
      else {
        intent.current.pause('offscreen');
        ticket.current = null;
        syncWant();
        setHint('화면에 보이게 한 뒤 재생을 눌러 주세요');
      }
    });
  };
  /** 실패 — 의도를 내리고 재생기에 멈춤을 보낸 뒤, 이후 메시지는 다시 불러오기 전까지 무시한다. */
  const fail = (text: string, code: number | null) => {
    failed.current = true;
    intent.current.pause('source');
    ticket.current = null;
    syncWant();
    markPlaying(false);
    send({ cmd: 'pause' });
    setError({ text, code });
  };

  /* 새 세대(처음 · 다시 불러오기) = 새 소스, 누른 뒤 마운트라 재생을 한 번 요청 */
  useEffect(() => {
    const it = intent.current;
    const previews = preview.current;
    it.setSource();
    ticket.current = it.requestPlay();
    return () => {
      previews.cancel();
      it.pause('unmount');
      activeExerciseVideo.release(pid);
    };
  }, [gen, pid]);

  /* API 준비 제한 시간 — 무한 로딩 대신 다시 불러오기. 넘긴 뒤 늦게 온 준비 · 재생은 무시한다(fail) */
  useEffect(() => {
    if (ready || error) return;
    const t = setTimeout(() => fail('유튜브 재생기가 준비되지 않았어요.', null), 15_000);
    return () => clearTimeout(t);
    // fail 은 ref · 상태 설정만 한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, error, gen]);

  useExerciseVideoLifecycle((reason) => interrupt(reason));
  useOffscreenPause(stage, playing || want || scrubbing, () => interrupt('offscreen'), 0.5);

  const onMessage = (e: WebViewMessageEvent) => {
    const m = parseBridgeMessage(e.nativeEvent.data, { pid, gen });
    if (!m) return;
    if (m.t === 'state') lastState.current = m.state;
    if (failed.current) {
      // 실패(시간 넘김 · 오류) 뒤에는 다시 불러오기로만 회복 — 늦은 준비는 받지 않고, 공식 표면에서 튼 재생은 멈춘다
      // (그대로 두면 이 영상이 하나만 재생 · 화면 이탈 규칙 밖에서 소리를 냈다).
      if (m.t === 'state' && m.state === 1) pausePlayer();
      return;
    }
    switch (m.t) {
      case 'ready': {
        send({ cmd: 'loop', value: loopRef.current });
        readyRef.current = true;
        setReady(true);
        setDuration(m.duration > 0 ? m.duration : null);
        setRates(EXERCISE_VIDEO_RATES.filter((r) => m.rates.includes(r)));
        setMuted(m.muted);
        // 첫 활성화(누른 뒤)지만 준비는 몇 초 뒤일 수 있다 — 그새 굴려 절반 이하로 보이면 스크립트로 틀지 않는다.
        tryPlay(false);
        break;
      }
      case 'state':
        if (m.duration > 0) setDuration(m.duration);
        if (!scrub.current) setTime(m.time);
        if (m.state === 1) {
          const r = onProviderPlaying(intent.current, tracker.current, { acceptExternal: !scrub.current && visible.current && AppState.currentState === 'active' });
          if (r.verdict === 'stop') {
            pausePlayer();
            return;
          }
          if (r.ticket) {
            // 공식 재생 단추로 튼 것 — 사용자의 재생 요청으로 받는다.
            ticket.current = r.ticket;
            syncWant();
          }
          markPlaying(true);
          setBlocked(false);
          setHint(null);
          activeExerciseVideo.activate(pid, () => interrupt('other-player'));
        } else {
          if (m.state === 0 && !loopRef.current) { intent.current.pause('user'); ticket.current = null; syncWant(); }
          markPlaying(false);
          if (m.state === 2 && onProviderPaused(intent.current, tracker.current, !!scrub.current)) {
            ticket.current = null;
            syncWant();
          }
        }
        break;
      case 'time':
        if (!scrub.current) setTime(m.time);
        if (m.duration > 0) setDuration(m.duration);
        if (Date.now() >= mutePinnedUntil.current) setMuted(m.muted);
        break;
      case 'rate':
        setRate(m.rate);
        break;
      case 'error':
        fail(m.code === 0 ? '유튜브 재생기를 불러오지 못했어요.' : youtubeErrorText(m.code), m.code === 0 ? null : m.code);
        break;
      case 'blocked':
        tracker.current.clear(); // 우리 재생이 거절됨 — 곧 공식 단추로 튼 재생을 '우리 재생'으로 오해하지 않게
        intent.current.pause('user');
        ticket.current = null;
        syncWant();
        setBlocked(true);
        break;
    }
  };

  const range = seekRange(duration);
  const seekTo = (t: number, live = false) => {
    if (!range) return;
    const to = clampTime(t, range);
    const mayStart = ytSeekMayStart(lastState.current);
    send({ cmd: 'seek', value: to, preview: live });
    // 시작 전 · 대기 상태의 seekTo 는 재생을 시작한다 — 의도가 멈춤이면 그 재생을 늦은 재생으로 보고 멈추게 한다.
    if (!intent.current.desired) {
      if (mayStart || live) tracker.current.sentPause(true);
      send({ cmd: 'pause' });
    }
    setTime(to);
  };
  const stageH = Math.max(200, nativeVideoStageHeight(width, window.height, aspectRatio, height));
  const html = buildHtml(videoId, pid, gen);
  const embedBlocked = error?.code === 101 || error?.code === 150;

  /*
   * 최상위 창 이동: 처음 우리 문서(baseUrl 출처)를 불러오는 것만 허락한다. 그 뒤의 최상위 이동(공식 링크 · 낯선 주소)은
   * 막고, YouTube 주소면 앱 안 브라우저로 연다 — 공급자 링크는 살리고 재생기 창은 지킨다. 출처는 접두가 아니라 정확히 비교한다.
   */
  const onShouldStart = (r: ShouldStartLoadRequest) => {
    if (r.isTopFrame === false) return true;
    if (r.url === 'about:blank') return true;
    if (!docLoaded.current && originOf(r.url) === originOf(SITE_URL)) return true;
    openYouTubeLink(r.url);
    return false;
  };

  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ backgroundColor: '#000', borderRadius: 16, overflow: 'hidden' }}>
      <View
        ref={stage}
        onTouchStart={() => { if (AppState.currentState === 'active') visible.current = true; }}
        style={[s.stage, { height: stageH, minWidth: 200 }]}
      >
        {YT_ID.test(videoId) ? (
          <WebView
            key={`${pid}-${gen}`}
            ref={web}
            source={{ html, baseUrl: SITE_URL }}
            originWhitelist={['*']}
            onMessage={onMessage}
            allowsInlineMediaPlayback
            allowsFullscreenVideo
            mediaPlaybackRequiresUserAction={false}
            scrollEnabled={false}
            onShouldStartLoadWithRequest={onShouldStart}
            onLoadEnd={() => {
              docLoaded.current = true;
            }}
            onOpenWindow={(ev: WebViewOpenWindowEvent) => openYouTubeLink(ev.nativeEvent.targetUrl)}
            style={{ backgroundColor: '#000' }}
          />
        ) : null}
      </View>
      {/* 오류 안내는 공식 재생기 위가 아니라 밖(밑)에 — 공식 오류 화면 · 링크를 가리지 않는다 */}
      {error ? (
        <View style={[s.errorRow, { backgroundColor: c.card }]} accessibilityRole="alert">
          <Text style={[s.msg, { color: c.ink }]}>{error.text}</Text>
          <View style={s.errorActions}>
            {embedBlocked ? (
              <Press onPress={() => openYouTubeLink(referenceWatchUrl(videoId))} accessibilityRole="link" style={s.retry}>
                <Text style={[s.retryText, { color: '#0a84d6' }]}>유튜브에서 보기</Text>
              </Press>
            ) : null}
            <Press onPress={onRetry} accessibilityRole="button" style={s.retry}>
              <Text style={[s.retryText, { color: c.ink }]}>다시 불러오기</Text>
            </Press>
          </View>
        </View>
      ) : null}
      <ExerciseVideoControls
        c={PALETTES.navy}
        overlay={false}
        playing={want}
        ready={ready && !error}
        duration={duration}
        time={time}
        onToggle={() => {
          if (!ready || error) return;
          if (intent.current.desired) interrupt('user');
          else {
            setBlocked(false);
            setHint(null);
            ticket.current = intent.current.requestPlay();
            syncWant();
            tryPlay(true);
          }
        }}
        onScrubStart={() => {
          scrub.current = beginScrub(intent.current, time, scrub.current);
          setScrubbingState(true);
          syncWant();
          pausePlayer();
        }}
        onScrubDraft={(t) => {
          const ss = scrub.current;
          if (!ss || ss.ticket.interrupt !== intent.current.interrupt) return;
          ss.draft = t;
          preview.current.request(() => seekTo(t, true));
        }}
        onScrubEnd={(commit, t, interrupted) => {
          if (interrupted) { intent.current.pause('unmount'); ticket.current = null; }
          preview.current.cancel();
          setScrubbingState(false);
          const ss = scrub.current;
          scrub.current = null;
          if (!ss) return;
          if (commit) ss.draft = t;
          const r = endScrub(intent.current, ss, commit, range);
          if (r.seekTo != null) seekTo(r.seekTo); // final exact seek supersedes previews
          syncWant();
          if (r.resume) {
            ticket.current = intent.current.ticket();
            tryPlay(false);
          }
        }}
        onStep={(dir) => seekTo(stepTime(time, dir, range))}
        loop={loop}
        onLoop={() => {
          const next = !loopRef.current;
          loopRef.current = next;
          setLoop(next);
          send({ cmd: 'loop', value: next });
        }}
        onRestart={() => seekTo(0)}
        rates={rates}
        rate={rate}
        onRate={(r) => send({ cmd: 'rate', value: r })}
        muted={muted}
        onMute={() => {
          // 공식 API 에 소리 이벤트가 없다 — 보낸 값을 바로 보이고, 잠시 동안 조회 값이 덮지 않게 한다(페이지가 곧 실제 값을 다시 알린다).
          const next = !muted;
          send({ cmd: next ? 'mute' : 'unmute' });
          mutePinnedUntil.current = Date.now() + MUTE_PIN_MS;
          setMuted(next);
        }}
        status={error ? '오류' : blocked ? '재생을 눌러 주세요' : hint ? hint : !ready ? '유튜브 준비 중' : want && !playing ? '불러오는 중' : null}
      />
    </View>
  );
}

/** 소리 단추를 누른 뒤 이 시간 동안은 조회 값이 화면 값을 덮지 않는다(공식 isMuted 는 늦게 바뀐다). */
const MUTE_PIN_MS = 1500;

/** 'https://a.b:1/c' → 'https://a.b:1'. 접두 비교(https://dugout-baseball.com.attacker…)를 막으려 출처만 정확히 견준다. */
function originOf(url: string): string | null {
  const m = /^(https?:\/\/[^/?#]+)/i.exec(url);
  return m ? m[1].toLowerCase() : null;
}

/** YouTube 공식 링크(로고 · 제목 · 'YouTube 에서 보기')는 앱 안 브라우저로 — 재생기 창을 덮지 않는다. 그 밖 주소는 열지 않는다. */
function openYouTubeLink(url: string | undefined) {
  if (!url || !/^https:\/\/((www|m)\.)?(youtube\.com|youtu\.be)\//i.test(url)) return;
  void WebBrowser.openBrowserAsync(url).catch(() => undefined);
}

/**
 * WebView 안 페이지 — 공식 API 스크립트 하나, 재생기 하나. 메시지에 pid · gen 을 붙인다.
 * 명령은 __bpCmd(글자)로만 받고, 세대 · 종류 · 숫자를 다시 검사한다.
 */
function buildHtml(videoId: string, pid: string, gen: number): string {
  const vars = JSON.stringify(referencePlayerVars(videoId, SITE_URL));
  const meta = JSON.stringify({ pid, gen, videoId });
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>html,body{margin:0;background:#000;height:100%;overflow:hidden}#p{width:100%;height:100%}</style></head><body><div id="p"></div><script>
(function(){
var M=${meta};var V=${vars};var P=null;var T=null;
function post(o){o.pid=M.pid;o.gen=M.gen;try{window.ReactNativeWebView.postMessage(JSON.stringify(o));}catch(e){}}
function num(v){return typeof v==='number'&&isFinite(v)?v:0;}
function tick(){if(!P)return;post({t:'time',time:num(P.getCurrentTime()),duration:num(P.getDuration()),muted:!!P.isMuted()});}
window.__bpCmd=function(s){if(!P||typeof s!=='string')return;var c;try{c=JSON.parse(s);}catch(e){return;}
if(!c||c.gen!==M.gen)return;
if(c.cmd==='play')P.playVideo();else if(c.cmd==='pause')P.pauseVideo();
else if(c.cmd==='seek'&&typeof c.value==='number'&&isFinite(c.value)&&c.value>=0)P.seekTo(c.value,c.preview!==true);
else if(c.cmd==='loop'&&typeof c.value==='boolean')P.setLoop(c.value);
else if(c.cmd==='rate'&&typeof c.value==='number'&&isFinite(c.value)&&c.value>0&&c.value<=4)P.setPlaybackRate(c.value);
else if(c.cmd==='mute'||c.cmd==='unmute'){if(c.cmd==='mute')P.mute();else P.unMute();setTimeout(tick,${MUTE_PIN_MS + 300});}};
window.onYouTubeIframeAPIReady=function(){P=new YT.Player('p',{host:'https://www.youtube-nocookie.com',videoId:M.videoId,width:'100%',height:'100%',playerVars:V,events:{
onReady:function(e){post({t:'ready',duration:num(P.getDuration()),rates:(P.getAvailablePlaybackRates()||[]).filter(function(r){return typeof r==='number'&&isFinite(r);}),muted:!!P.isMuted()});},
onStateChange:function(e){post({t:'state',state:e.data,time:num(P.getCurrentTime()),duration:num(P.getDuration())});
if(e.data===1){if(!T)T=setInterval(tick,500);}else if(T){clearInterval(T);T=null;}},
onPlaybackRateChange:function(e){post({t:'rate',rate:num(e.data)});},
onError:function(e){post({t:'error',code:num(e.data)});},
onAutoplayBlocked:function(){post({t:'blocked'});}}});};
var s=document.createElement('script');s.src='https://www.youtube.com/iframe_api';s.onerror=function(){post({t:'error',code:0});};document.head.appendChild(s);
})();
</script></body></html>`;
}

const s = StyleSheet.create({
  stage: { width: '100%', backgroundColor: '#000', overflow: 'hidden' },
  errorRow: { borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  errorActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 4 },
  msg: { fontSize: 14 },
  retry: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, justifyContent: 'center' },
  retryText: { fontSize: 13, fontWeight: '600' },
});
