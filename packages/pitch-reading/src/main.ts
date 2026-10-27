import './style.css';
import './app.css';
import {DISPLAY_VERSION,CARD_SHORT_EDGE_CM,validCalibration,estimateDisplay,cardCalibration,type DisplayCalibration} from './display-calibration.ts';
import {approachCutoff,OBSERVATION_VERSION} from './observation.ts';
import {GAZE_VERSION} from './gaze.ts';
import {zoneGuideMarkup,zoneGuideFrame,locationFeedback,ZONE_GUIDE_VERSION,GUIDED_OBSERVATION_VERSION,HOME_HOLD_SECONDS} from './zone-guide.ts';
import {PHONE_PRESENTATION_VERSION,PHONE_MIN_BALL_PIXELS} from './phone-presentation.ts';
declare global {interface Window {__SINKER_PITCH__?:{embedded?:boolean;presentation?:'phone';displayCalibration?:DisplayCalibration;history?:Session[];theme?:'light'|'dark'|'navy';palette?:Record<string,string>};ReactNativeWebView?:{postMessage:(message:string)=>void}}}
import { DIFFICULTIES, generatePitch, movement, PITCHERS, ENGINE_VERSION, trackingAt, trackingEnd, BALL_RADIUS,PLATE_Z,type PitchKind, type Pitcher } from './physics.ts';
import {assessZone,callName,STRIKE_ZONE,zoneExplanation,MIDDLE_Z,END_BOTTOM,type ZoneCall} from './strike-zone.ts';
import {REFERENCE_BATTER,ZONE_VERSION} from './batter-reference.ts';
import {createPracticePlan,generatePracticePitch,SAMPLING_VERSION} from './practice-sequence.ts';
import {trackingCard} from './tracking-card.ts';
import { finish, readHistory, recordAnswer, saveSession, score, type Session, type Trial } from './session.ts';
import { PitchStage, type ViewName } from './stage.ts';
import { deliveryEvents, deliveryLabel, motionSample, motionSourceLabel, FOLLOW_THROUGH, MOTION_VERSION, preparationDuration, releaseHeightRange } from './motion.ts';
import { CAMERA_VERSION, DEFAULT_BATTING_VIEW } from './world.ts';
import {replayTime} from './playback.ts';
import {PITCHER_MODEL_VERSION} from './pitcher.ts';
import {TRAINING_LEVELS,TRAINING_PROFILE_VERSION,createTrainingPitcher,createPitchPlan,trainingObservationMs,resolvePitcher,levelFor,type TrainingConfig,type LevelId} from './training-profile.ts';
const query=new URLSearchParams(location.search),INSPECTOR=query.get('lab')==='1';
const nativeBoot=window.__SINKER_PITCH__,IS_NATIVE=!!nativeBoot;
const EMBEDDED=!!nativeBoot?.embedded||query.get('embed')==='1';
const scope=query.get('scope');
const historyKey=scope&&/^[a-zA-Z0-9-]{1,64}$/.test(scope)?`sinker-pitch-reading-v1:${scope}`:'sinker-pitch-reading-v1';
const historyStorage={getItem:()=>localStorage.getItem(historyKey),setItem:(_key:string,value:string)=>localStorage.setItem(historyKey,value)};
const postNative=(value:unknown)=>window.ReactNativeWebView?.postMessage(JSON.stringify({t:'pitch-reading',...value as object}));
const touch=matchMedia('(pointer:coarse)').matches;
const PHONE_PRESENTATION=!INSPECTOR&&(nativeBoot?.presentation==='phone'||(!IS_NATIVE&&touch&&Math.min(screen.width,screen.height)<600));
const themeMedia=matchMedia('(prefers-color-scheme: dark)');
function applyAppTheme(theme?:string,palette?:Record<string,string>){
  document.documentElement.dataset.theme=['light','dark','navy'].includes(theme??'')?theme!:themeMedia.matches?'dark':'light';
  const keys:Record<string,string>={page:'--page',card:'--panel',ink:'--ink',muted:'--muted',line:'--line',lineStrong:'--line-strong',action:'--accent',link:'--link',chip:'--surface',skyTint:'--tint',ok:'--ok',danger:'--danger'};
  if(palette)for(const [key,css] of Object.entries(keys)){const color=palette[key];if(/^#[a-fA-F0-9]{6}$/.test(color??''))document.documentElement.style.setProperty(css,color);}
}
applyAppTheme(nativeBoot?.theme,nativeBoot?.palette);
window.addEventListener('sinker-theme',((event:CustomEvent)=>applyAppTheme(event.detail?.theme,event.detail?.palette)) as EventListener);
if(!nativeBoot){
  const followParent=()=>{try{applyAppTheme(window.parent!==window?window.parent.document.documentElement.dataset.theme:undefined);}catch{applyAppTheme();}};
  followParent();themeMedia.addEventListener('change',followParent);
  try{if(window.parent!==window)new MutationObserver(followParent).observe(window.parent.document.documentElement,{attributes:true,attributeFilter:['data-theme']});}catch{/* standalone cross-origin */}
}

let display=estimateDisplay(touch,Math.min(screen.width,screen.height));
try{const saved=JSON.parse(localStorage.getItem('sinker-pitch-display-v1')??'null');if(validCalibration(saved)&&saved.source==='card')display=saved;}catch{/* use visible estimate */}
if(validCalibration(nativeBoot?.displayCalibration))display=nativeBoot.displayCalibration;

const icon = (name: string, size = 20) => {
  const paths: Record<string, string> = {
    play: '<path d="m9 5 11 7-11 7z"/>', pause: '<path d="M8 5v14M16 5v14"/>',
    arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>', refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7v1"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>', check: '<path d="m5 12 4 4L19 6"/>',
    expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
    download: '<path d="M12 3v12m-5-5 5 5 5-5M5 17v4h14v-4"/>', target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/><path d="M12 10v4M10 12h4"/>',
  };
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.target}</svg>`;
};
const app = document.querySelector<HTMLDivElement>('#app')!;
app.dataset.presentation=PHONE_PRESENTATION?'phone':'physical';app.dataset.inspector=String(INSPECTOR);app.dataset.embedded=String(EMBEDDED);app.dataset.displaySource=display.source;
app.innerHTML = `
  <header class="topbar">
    <a class="brand" href="#" aria-label="싱커 선구안 훈련 홈"><span class="brand-mark"><i></i><i></i><i></i></span><span>sinker<span class="brand-dot">.</span></span><span class="brand-divider"></span><span class="lab-word">PITCH LAB</span></a>
    ${INSPECTOR?`<nav class="mode-switch" aria-label="사용 모드"><button id="mode-training" class="active" aria-pressed="true">${icon('eye',16)} 선구안 훈련</button><button id="mode-lab" aria-pressed="false">${icon('settings',16)} 궤적 검수</button></nav>`:'<span class="public-mode">선구안 훈련</span>'}
    <div class="header-actions"><span class="prototype-tag">PROTOTYPE 19</span><button class="icon-button" id="about-open" aria-label="시제품 안내">${icon('info')}</button></div>
  </header>
  <main>
    <section class="page-heading"><div><p class="eyebrow">SEE EARLIER. READ BETTER.</p><h1 id="page-title">선구안 훈련</h1><p id="page-description">투수의 공을 보고, 구종과 스트라이크·볼을 판단해요.</p></div><button class="text-button history-open">${icon('clock',17)} 최근 훈련 <span class="history-count">0</span></button></section>
    ${!INSPECTOR?`<section class="setup-panel" id="setup-panel" aria-labelledby="setup-title">
      <div class="setup-intro"><button class="text-button history-open setup-history">${icon('clock',17)} 최근 훈련</button><span class="eyebrow">10구 · 구종과 볼 판별</span><h2 id="setup-title">오늘의 타석</h2><p>투수 · 타석 · 난이도를 선택하면 바로 시작해요.</p></div>
      <nav id="setup-progress" class="setup-progress" aria-label="연습 조건 선택 단계"></nav>
      <div class="setup-body"><p class="section-kicker" id="setup-kicker"></p><h3 id="setup-question"></h3><div id="setup-options" class="setup-options"></div></div>
      <div class="display-guide"><div><span id="display-guide-text"></span>${PHONE_PRESENTATION?'<label class="guide-choice"><input id="zone-guide-choice" type="checkbox" checked/><span>존 가이드 사용</span></label>':''}</div><button id="display-open" class="text-button">화면 크기 확인</button></div>
      <div class="setup-summary" id="setup-summary" aria-live="polite"></div>
      <div class="setup-actions"><button id="setup-back" class="text-button">이전</button><button id="setup-start" class="primary-button" disabled>10구 훈련 시작 ${icon('arrow',18)}</button></div>
      <details class="level-evidence"><summary>난이도는 어떤 기준인가요?</summary><p>구종별 구속 범위를 달리하고 ${PHONE_PRESENTATION?'폰에서는 넓은 고정 시야와 공의 최소 표시 크기 보정을 사용합니다. 구속과 비행 시간은 실제 시간으로 재생하며, 구종·판정 계산은 실제 공 크기를 사용합니다.':'공을 실제 속도로 보여 주고, 홈 앞 약 1.5m 또는 화면을 벗어나기 직전에 가립니다. 눈 위치와 실제 공 크기는 고정하며, 화면 크기에 맞춰 전체 장면을 보정합니다.'} 시선은 선택한 타석의 구도에 고정되며 공을 따라 움직이지 않습니다. 화면 밖으로 나가는 공은 그 직전까지 보여 줍니다.</p><p>중·고교는 청소년 측정 연구를 참고한 연습 범위이며 국내 선수의 대표 평균으로 검증된 값은 아닙니다. KBO는 공개 구속 보도, MLB는 2025 Statcast 자료를 참고했습니다. 실제 타격 실력이나 훈련 효과를 인증하는 단계는 아닙니다.</p><p><a href="https://ijspt.scholasticahq.com/article/21495-comparative-pitching-biomechanics-among-adolescent-baseball-athletes-are-there-fundamental-differences-between-pitchers-and-non-pitchers" target="_blank" rel="noopener">청소년 측정 연구 ↗</a> · <a href="https://mobile.newsis.com/view_amp.html?ar_id=NISX20250315_0003100099" target="_blank" rel="noopener">KBO 구속 자료 ↗</a> · <a href="https://baseballsavant.mlb.com/leaderboard/pitch-movement?year=2025&pitch_type=FF&min=q" target="_blank" rel="noopener">2025 Statcast ↗</a></p></details>
    </section>`:''}
    <div class="workspace">
      <section class="simulation-column" aria-label="시뮬레이션과 훈련">
        <div class="review-toolbar" id="review-toolbar" hidden><div class="review-switch"><button data-review="trajectory" class="active" aria-pressed="true">공 궤적</button><button data-review="delivery" aria-pressed="false">투구 동작</button></div><span id="review-caption">같은 공을 세 시점에서 확인</span></div>
        <div class="viewport-shell">
          <div id="viewport"></div>
          <div class="scene-vignette"></div>
          <div id="tracking-card" class="tracking-card" hidden></div>
          <div class="scene-top"><span class="camera-label">${icon('eye',15)} <span id="camera-name">타자 시점 · 우타자</span></span><div class="scene-tools"><span id="scene-progress" class="scene-progress"></span>${!INSPECTOR?'<button class="text-button public-end" id="end-session" hidden>훈련 종료</button>':''}<span class="live-label"><i></i><span id="scene-state">READY</span></span><button ${!INSPECTOR?'hidden':''} id="focus-toggle" class="focus-toggle" aria-pressed="false">${icon('expand',15)} <span>타석 화면</span></button></div></div>
          <div class="scene-bottom"><span class="scene-pitcher"><span id="scene-number">01</span><span id="scene-pitcher-name">우완 오버핸드</span><small>가상 투수</small></span><span class="scale-label" id="scene-scale">학습용 공 확대 1.8×</span></div>
          <button class="stage-start primary-button" id="stage-start">10구 훈련 시작 ${icon('arrow',18)}</button>
          <div class="view-selector" id="view-selector" hidden aria-label="궤적 시점"><button data-view="batter" class="active">타자</button><button data-view="side">측면</button><button data-view="top">위쪽</button></div>
          <div id="stage-message" class="stage-message" hidden><div id="stage-message-icon">${icon('eye',32)}</div><p class="stage-eyebrow" id="stage-message-kicker">MAKE YOUR CALL</p><h2 id="stage-message-title">어떤 공이었나요?</h2><p id="stage-message-description">아래에서 구종을 골라 주세요.</p></div>
          <div class="preparation-label" id="preparation-label" hidden>투수의 릴리스를 보세요</div>
          <div class="render-error" id="render-error" role="alert" hidden></div>
          <span class="orbit-hint" id="orbit-hint" hidden>드래그로 회전 · 스크롤로 확대</span>
        </div>
        ${!INSPECTOR?'<div class="practice-condition"><span id="public-condition"></span><button id="change-settings" class="text-button">조건 다시 선택</button></div>':''}
        <aside id="zone-guide" class="zone-guide" aria-label="홈 통과 위치 가이드" hidden>${zoneGuideMarkup()}</aside>
        <div id="training-console" class="training-console">
          <div class="round-line"><div><span class="section-kicker" id="round-kicker">YOUR NEXT REP</span><h2 id="round-title">준비되면 첫 공을 만나보세요.</h2></div><div class="round-count"><strong id="round-current">00</strong><span>/ 10</span></div></div>
          <div class="progress-dots" id="progress-dots" aria-label="10구 진행 상황"></div>
          <div class="answer-controls"><div class="answer-group"><h3>구종</h3><div class="answer-row" id="answer-row"></div></div><div class="answer-group"><h3>스트라이크 · 볼</h3><div class="call-row" id="call-row"></div></div></div>
          <div class="action-row"><p id="training-hint" role="status" aria-live="polite">구종과 스트라이크·볼을 고르면 공 추적으로 확인해요.</p><button class="primary-button" id="primary-action">10구 훈련 시작 ${icon('arrow',18)}</button><button class="secondary-button" id="real-replay-action" hidden>실제 속도 1×</button><button class="secondary-button" id="replay-action" hidden>${icon('refresh',16)} 다시 보기</button></div>
          <div id="feedback-detail" class="feedback-detail" hidden></div>
        </div>
        <div id="lab-console" class="lab-console" hidden>
          <div class="delivery-phase" id="delivery-phase" hidden><span class="section-kicker">DELIVERY REVIEW</span><strong id="delivery-phase-label">준비 · 무릎 들기</strong><span id="delivery-motion-source">투구 4 · 우완 · 3D 분석 샘플</span></div>
          <div class="playback-row"><button class="round-button" id="lab-play" aria-label="궤적 재생">${icon('play')}</button><input id="timeline" type="range" min="0" max="1000" value="0" aria-label="투구 재생 위치"/><span id="timeline-time">0.000 / 0.500s</span><select id="playback-speed" aria-label="재생 속도"><option value="0.25">0.25× · 느리게</option><option value="0.5">0.5× · 느리게</option><option value="1" selected>1× · 실제 속도</option></select></div>
          <div id="delivery-events" class="delivery-events" hidden></div>
          <div class="lab-metrics"><div><span>릴리스 구속</span><strong id="metric-speed">—</strong><small>km/h</small></div><div><span>도착 시간</span><strong id="metric-time">—</strong><small>초</small></div><div><span>가로 변화</span><strong id="metric-x">—</strong><small>cm</small></div><div><span>수직 변화</span><strong id="metric-y">—</strong><small>cm</small></div></div>
          <p class="metric-note">변화량은 초기 진행방향의 직선 대비 차이이며, 수직 값에는 중력이 포함됩니다. 실제 측정값이 아닙니다.</p>
        </div>
        <div class="how-it-works" id="how-it-works"><div><span>01</span><p>손을 떠나는 순간부터<strong>공을 봅니다.</strong></p></div><i></i><div><span>02</span><p>화면이 가려지면<strong>구종과 스트라이크·볼을 고릅니다.</strong></p></div><i></i><div><span>03</span><p>전체 움직임을 보며<strong>다시 확인합니다.</strong></p></div></div>
      </section>
      ${INSPECTOR?`<aside class="controls-panel" aria-label="훈련 설정">
        <div class="panel-heading"><h2 id="panel-title">오늘 상대할 투수</h2><span class="tiny-label">VIRTUAL ROSTER</span></div>
        <div class="pitcher-list" id="pitcher-list"></div>
        <div id="training-settings">
          <section class="control-section"><div class="control-heading"><h3>공을 보여 주는 최대 시간</h3><span id="difficulty-value">340ms</span></div><div id="difficulty-options" class="segmented"></div><p class="control-caption">릴리스부터의 최대 시간 · 화면 밖으로 벗어나면 먼저 가립니다.</p></section>
          <section class="control-section"><div class="control-heading"><h3>공 크기</h3><span class="small-tag">학습 설정</span></div><div class="segmented" id="scale-options"><button data-scale="1" class="active" aria-pressed="true">실제 크기 1×</button><button data-scale="1.8" aria-pressed="false">식별 보조 1.8×</button></div><p class="control-caption">확대 여부가 다른 연습은 같은 조건으로 비교하지 않아요.</p></section>
          <div class="training-condition"><span>${icon('target',17)} 오늘의 구성</span><p id="condition-description"></p></div>
          <button class="end-session text-button" id="end-session" hidden>이번 훈련 종료</button>
        </div>
        <div id="lab-settings" hidden>
          <section class="control-section"><div class="control-heading"><h3>구종</h3></div><div id="lab-pitches" class="segmented"></div></section>
          <section class="control-section lab-sliders">
            <label for="speed-slider">구속 <output id="speed-output"></output></label><input type="range" id="speed-slider" min="80" max="150" step="1"/>
            <label for="height-slider">릴리스 높이 <output id="height-output"></output></label><input type="range" id="height-slider" min="1.15" max="2.15" step="0.01"/>
            <label for="ax-slider">가로 가속도 <output id="ax-output"></output></label><input type="range" id="ax-slider" min="-12" max="12" step="0.1"/>
            <label for="ay-slider">수직 가속도 <output id="ay-output"></output></label><input type="range" id="ay-slider" min="-18" max="0" step="0.1"/>
            <p class="control-caption">가속도 단위 m/s² · 포수 시점 오른쪽이 +<br/>수직 가속도는 중력을 합친 값입니다.</p>
          </section>
          <section class="control-section target-section"><div><h3>도착 위치</h3><p class="control-caption">포수 시점<br/>기준 존 ${(STRIKE_ZONE.halfWidth*200).toFixed(2)} × ${Math.round((STRIKE_ZONE.top-STRIKE_ZONE.bottom)*100)}cm</p></div><div class="target-grid" id="target-grid" aria-label="도착 위치"></div></section>
          <button class="secondary-button reset-lab" id="reset-lab">${icon('refresh',15)} 이 투수의 기본값으로</button>
        </div>
        <section class="control-section fixed-batter" id="fixed-batter"><div class="control-heading"><h3>기준 타석</h3><span class="small-tag">고정 시점</span></div>
          <p class="reference-batter">180cm 기준 타자 · 우타석</p>
          <dl><div><dt>눈높이</dt><dd>${REFERENCE_BATTER.eyeHeight.toFixed(2)}m</dd></div><div><dt>가로 시야각</dt><dd>${REFERENCE_BATTER.horizontalFov}°</dd></div><div><dt>존 가로 폭</dt><dd>${(STRIKE_ZONE.halfWidth*200).toFixed(2)}cm</dd></div><div><dt>존 아래 · 위</dt><dd>${(STRIKE_ZONE.bottom*100).toFixed(2)} · ${(STRIKE_ZONE.top*100).toFixed(2)}cm</dd></div></dl>
          <p class="control-caption">180cm 타자의 2026 KBO ABS 기준입니다. 좌우는 중간면, 높이는 중간면과 끝면에서 확인합니다.</p>
        </section>
        <p class="panel-footnote" id="motion-note">${icon('info',14)} 투구 4 · 우완 · 공 궤적은 가상 설정입니다.</p>
      </aside>`: ''}
    </div>
    <footer><span><i class="status-dot"></i> 이 기기에만 훈련 결과 저장</span><span>단축키 <kbd>Space</kbd> 시작·다음 <kbd>1</kbd>–<kbd>${INSPECTOR?2:4}</kbd> 구종 <kbd>${INSPECTOR?3:5}</kbd><kbd>${INSPECTOR?4:6}</kbd> 스트라이크·볼</span><span>SINKER EXPERIMENTS / 019</span></footer>
  </main>
  ${!INSPECTOR?`<dialog id="display-dialog"><div class="dialog-header"><span class="eyebrow">SCREEN SIZE</span><button class="icon-button dialog-close" aria-label="화면 크기 확인 닫기">${icon('close')}</button></div><h2>카드의 짧은 변에 맞춰 주세요.</h2><p>일반 신용·체크카드의 짧은 변(약 5.4cm)을 화면에 대고 아래 세로선을 카드의 짧은 변과 같은 길이로 맞춰 주세요. 카드 정보는 촬영하거나 입력하지 않아요.</p><div class="card-measure" id="card-measure"><span id="card-measure-line"></span></div><label for="card-measure-range">세로선 길이<input id="card-measure-range" type="range" min="100" max="480" step="1" /></label><p id="display-distance-note"></p><button id="display-save" class="primary-button">이 화면 크기로 맞추기 ${icon('check',18)}</button></dialog>`:''}
  <div id="toast" class="toast" role="status" hidden></div>
  <dialog id="about-dialog"><div class="dialog-header"><span class="eyebrow">선구안 훈련</span><button class="icon-button dialog-close" aria-label="안내 닫기">${icon('close')}</button></div><h2>타석에서 공을 읽어보세요.</h2><p>투수의 손을 떠나는 공을 보고 직구·커브·슬라이더·체인지업과 스트라이크·볼을 판단해요.</p><div class="about-list"><p><strong>실제 속도로 접근해요</strong>훈련의 공은 느려지지 않아요. ${PHONE_PRESENTATION?'존 가이드를 켜면 홈을 지나는 순간까지 이어서 보고, 통과 위치를 잠깐 확인한 뒤 답해요. 가이드를 끄면 화면을 벗어나기 전까지 관찰합니다.':'홈 앞 약 1.5m 또는 화면을 벗어나기 직전까지 보여 준 뒤 가립니다.'} 결과의 느린 공 추적과 실제 속도 1× 다시 보기는 별도입니다.</p><p><strong>화면에 맞춘 표시</strong>${PHONE_PRESENTATION?'휴대폰은 공의 접근 구간이 보이는 넓은 고정 구도를 사용합니다. 먼 공은 최소 5px로 표시해 식별을 돕습니다. 실제 크기와 시야를 1:1로 재현하는 모드는 아닙니다.':'PC는 약 60cm 거리로 보세요. 장면 전체를 화면 크기에 맞춥니다. 크기가 추정된 화면은 처음 한 번 카드로 확인할 수 있어요.'}</p><p><strong>타석은 고정해요</strong>선택한 우타석·좌타석의 눈 위치를 유지합니다. 궤적·판정은 실제 공 지름 7.32cm로 계산합니다. 시선도 선택한 타석 구도에 고정되며 공을 따라 움직이지 않습니다. 존은 180cm 타자의 KBO ABS 기준입니다.</p><p><strong>실측을 참고한 가상 투수예요</strong>우투는 투구 4, 좌투는 투구 3 동작입니다. 구질은 공개 투구 자료를 참고한 합성 값이며, 실제 선수와 동일한 동작·구질이나 국내 중·고교 실력 검증을 마친 모델은 아닙니다.</p><p><strong>답한 공까지 남겨요</strong>기기에 최근 30회 연습을 보관합니다. 공이 재생 중 크게 끊기거나 앱이 가려진 경우 그 공은 평가하지 않고 새 공을 보여 줍니다.</p></div><button class="primary-button dialog-close">알겠습니다 ${icon('check',18)}</button></dialog>
  <dialog id="history-dialog"><div class="dialog-header"><span class="eyebrow">YOUR PRACTICE</span><button class="icon-button dialog-close" aria-label="연습 내역 닫기">${icon('close')}</button></div><h2>최근 훈련</h2><p>투수 손·타석·단계·화면 조건이 같은 연습끼리 확인해 주세요.</p><div id="history-list"></div><button class="secondary-button" id="export-history">${icon('download',16)} 훈련 결과 JSON 받기</button></dialog>
  <dialog id="result-dialog"><div class="dialog-header"><span class="eyebrow">SESSION COMPLETE</span><button class="icon-button dialog-close" aria-label="결과 닫기">${icon('close')}</button></div><div id="result-content"></div><div class="result-actions"><button class="primary-button" id="practice-again">같은 조건으로 한 번 더 ${icon('arrow',18)}</button><button class="text-button" id="result-settings">조건 다시 선택</button></div></dialog>
`;

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
let mode: 'training' | 'lab' = 'training';
let pitcher: Pitcher = PITCHERS[0];
let difficulty: {id:string;name:string;milliseconds:number} = DIFFICULTIES[0];
let eye:'R'|'L'=REFERENCE_BATTER.eye;
const battingView=DEFAULT_BATTING_VIEW;
let config:TrainingConfig|null=null;
let zoneGuide=PHONE_PRESENTATION;
let draft:Partial<TrainingConfig>={};
let setupStep=0;
let pitchPlan:PitchKind[]=[];
let ballScale = 1;
let trialView:Trial['view'];
let visibleObservationLimit=Infinity;
let currentPitch = generatePitch(pitcher, pitcher.pitches[0].kind, 1, false);
let session: Session | null = null;
let practicePlan:ZoneCall[]=[];
let history: Session[] = [];
try { history = IS_NATIVE?readHistory({getItem:()=>JSON.stringify(nativeBoot?.history??[])}):readHistory(historyStorage); } catch { /* private mode: use memory for this visit */ }
let phase: 'ready' | 'windup' | 'flight' | 'question' | 'feedback' | 'interrupted' | 'error' = 'ready';
let trialId = '', observedMs = 0;
let selectedPitch:PitchKind|null=null,selectedCall:ZoneCall|null=null,trackingRevealed=false;
let motion: { kind: 'trial' | 'replay' | 'lab'; start: number; speed: number; from: number; lastFrame: number } | null = null;
let labTime = 0;
let reviewMode:'trajectory'|'delivery'='trajectory';
let labKind: PitchKind = pitcher.pitches[0].kind;
let view: ViewName = 'batter';
let targetIndex = 4;
let stage: PitchStage | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let rendererFailed = false;
const uniqueId = () => globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const newSeed = () => {
  const values = new Uint32Array(1);
  if (typeof globalThis.crypto !== 'undefined') { crypto.getRandomValues(values); return values[0]; }
  return Math.floor(Math.random() * 4294967296);
};
function toast(message: string) {
  $('toast').textContent = message; $('toast').hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { $('toast').hidden = true; }, 4000);
}
function setPhase(value: typeof phase) { phase = value; app.dataset.phase = value; }
function setMessage(title?: string, description = '', kicker = 'MAKE YOUR CALL') {
  $('stage-message').hidden = !title;
  if (!title) return;
  $('stage-message-title').textContent = title; $('stage-message-description').textContent = description;
  $('stage-message-kicker').textContent = kicker;
}
function renderError(message: string) {
  rendererFailed = true; motion = null; setPhase('error');
  if(IS_NATIVE)postNative({kind:'error',message});
  $('render-error').hidden = false; $('render-error').textContent = message;
  $('primary-action').setAttribute('disabled', ''); $('lab-play').setAttribute('disabled', '');
  setMessage(); renderAnswers();
}
try { stage = new PitchStage($('viewport'), renderError);if(!INSPECTOR)stage.configureDisplay(display,PHONE_PRESENTATION); }
catch { renderError('이 브라우저에서 3D 화면을 시작하지 못했습니다. WebGL 2를 지원하는 최신 Safari 또는 Chrome에서 열어 주세요.'); }

function drawStatic() {
  const time=mode==='lab'?labTime:phase==='feedback'?trackingEnd(currentPitch):-preparationDuration(pitcher);
  stage?.draw({time:Math.max(0,time),deliveryTime:time,
    ballVisible:time>=0&&(mode==='lab'||phase==='feedback'),held:time<0,
    reveal:(mode==='lab'&&reviewMode==='trajectory')||phase==='feedback',ballScale});
}
function renderPitchers() {
  if(INSPECTOR)$('pitcher-list').innerHTML = PITCHERS.map(p => `<button class="pitcher-card ${p.id===pitcher.id?'active':''}" data-pitcher="${p.id}" aria-pressed="${p.id===pitcher.id}" ${session?'disabled':''}><span class="pitcher-number" style="--pitcher-color:${p.color}">${p.number}<small>${p.hand==='R'?'RHP':'LHP'}</small></span><span class="pitcher-card-copy"><strong>${p.name}</strong><small>${p.pitches.map(s=>s.name).join(' · ')} <span>${Math.min(...p.pitches.map(s=>s.speed[0]))}–${Math.max(...p.pitches.map(s=>s.speed[1]))} km/h</span></small></span><span class="selection-indicator">${icon('check',12)}</span></button>`).join('');
  $('scene-number').textContent = pitcher.number; $('scene-pitcher-name').textContent = pitcher.name;
  $('delivery-motion-source').textContent=motionSourceLabel(pitcher)+' · 3D 분석 샘플';
  if(INSPECTOR)$('motion-note').innerHTML=icon('info',14)+' '+motionSourceLabel(pitcher)+' · 공 궤적은 가상 설정입니다.';
}
function renderSettings() {
  if(!INSPECTOR){
    $('public-condition').textContent=config?`${pitcher.name} · ${eye==='R'?'우타':'좌타'} 시점 · 직구 / 커브 / 슬라이더 / 체인지업`:'';
    $<HTMLButtonElement>('change-settings').disabled=!!session;
    $('end-session').hidden=!session;
    $('stage-start').hidden=!!session||!config||rendererFailed;
    $('scene-scale').textContent=PHONE_PRESENTATION?'폰 화면 보정 · 시선 고정':'실제 속도 1× · 시선 고정';renderPitchers();return;
  }
  $('difficulty-options').innerHTML = DIFFICULTIES.map(d=>`<button data-difficulty="${d.id}" class="${d.id===difficulty.id?'active':''}" aria-pressed="${d.id===difficulty.id}" ${session?'disabled':''}>${d.name}</button>`).join('');
  $('difficulty-value').textContent=`${difficulty.milliseconds}ms`;
  $('condition-description').textContent=`${pitcher.pitches.map(p=>p.name).join(' / ')} · 10구\n최대 ${difficulty.milliseconds}ms 관찰 · 스트라이크·볼 혼합 · ${ballScale===1?'기준 공':'공 확대 1.8×'}`;
  $('scene-scale').textContent=ballScale===1?'기준 공 1× · 지름 7.32cm':'학습용 공 확대 1.8×';
  document.querySelectorAll<HTMLButtonElement>('[data-scale]').forEach(b=>{
    b.classList.toggle('active',Number(b.dataset.scale)===ballScale); b.setAttribute('aria-pressed',String(Number(b.dataset.scale)===ballScale)); b.disabled=!!session;
  });
  $('end-session').hidden=!session;
  $('stage-start').hidden=mode!=='training'||!!session||rendererFailed;
  renderPitchers();
}
function immersiveConsoleHeight(){return mode==='lab'?'210px':window.innerHeight<550&&window.innerWidth>window.innerHeight?'112px':window.innerWidth<760?(INSPECTOR?'240px':'300px'):(INSPECTOR?'190px':'210px');}
function toggleFocus(force?:boolean){
  if(motion?.kind==='trial')interruptTrial('타석 화면 크기가 바뀌었습니다.');
  const active=force??!document.body.classList.contains('immersive');
  document.body.classList.toggle('immersive',active);
  if(IS_NATIVE)postNative({kind:'immersive',active});
  document.body.style.setProperty('--immersive-console',immersiveConsoleHeight());
  $('focus-toggle').setAttribute('aria-pressed',String(active));
  $('focus-toggle').innerHTML=`${icon(active?'close':'expand',15)} <span>${active?'돌아가기':'타석 화면'}</span>`;
}
function renderProgress() {
  const trials=session?.trials??[];
  $('round-current').textContent=String(trials.length).padStart(2,'0');
  $('scene-progress').textContent=`${Math.min(10,trials.length+(phase==='feedback'?0:1))} / 10구`;
  $('progress-dots').innerHTML=Array.from({length:10},(_,i)=>`<span class="${trials[i]?(trials[i].correct?'correct':'incorrect'):i===trials.length&&session?'current':''}" aria-label="${i+1}구 ${trials[i]?(trials[i].correct?'정답':'오답'):'미진행'}">${trials[i]?icon(trials[i].correct?'check':'close',10):''}</span>`).join('');
}
function renderAnswers() {
  const focused=document.activeElement as HTMLElement|null;
  const focusedAnswer=focused?.dataset.answer,focusedCall=focused?.dataset.call;
  $('answer-row').innerHTML=pitcher.pitches.map((spec,i)=>{
    const trial=session?.trials.find(t=>t.id===trialId);
    const resultClass=phase==='feedback'&&trackingRevealed?(spec.kind===currentPitch.kind?'answer-correct':trial?.answer===spec.kind?'answer-wrong':''):'';
    return `<button class="answer-button ${resultClass} ${selectedPitch===spec.kind?'answer-selected':''}" aria-pressed="${selectedPitch===spec.kind}" data-answer="${spec.kind}" ${phase!=='question'?'disabled':''}><kbd>${i+1}</kbd><span><strong>${spec.name}</strong><small>${spec.english}</small></span><span class="answer-mark">${phase==='feedback'&&trackingRevealed&&spec.kind===currentPitch.kind?icon('check',18):icon('arrow',17)}</span></button>`;
  }).join('');
  const trial=session?.trials.find(t=>t.id===trialId);
  $('call-row').innerHTML=(['strike','ball'] as ZoneCall[]).map((call,i)=>{
    const correct=phase==='feedback'&&trackingRevealed,style=correct?(call===trial?.actualCall?'answer-correct':call===trial?.call?'answer-wrong':''):'';
    return `<button class="answer-button ${style} ${selectedCall===call?'answer-selected':''}" data-call="${call}" aria-pressed="${selectedCall===call}" ${phase!=='question'?'disabled':''}><kbd>${i+pitcher.pitches.length+1}</kbd><span><strong>${callName(call)}</strong><small>${call.toUpperCase()}</small></span></button>`;
  }).join('');
  if(phase==='question'){
    const selector=focusedAnswer?`[data-answer="${focusedAnswer}"]`:focusedCall?`[data-call="${focusedCall}"]`:null;
    if(selector)document.querySelector<HTMLButtonElement>(selector)?.focus({preventScroll:true});
  }
}
function updateCamera() {
  app.dataset.cameraView=view;
  stage?.setView(view,eye);
  $('camera-name').textContent=view==='batter'?`타자 시점 · ${eye==='R'?'우타자':'좌타자'}`:view==='tracking'?'투구 추적 · 투수 → 홈':view==='side'?'측면 · 전체 궤적':view==='top'?'위쪽 · 전체 궤적':view==='delivery-front'?'정면 · 동작 검수':view==='delivery-side'?'측면 · 동작 검수':'뒤쪽 · 동작 검수';
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(b=>{
    b.classList.toggle('active',b.dataset.view===view);b.setAttribute('aria-pressed',String(b.dataset.view===view));
  });
  $('orbit-hint').hidden=!view.startsWith('delivery-');
  if(!document.body.classList.contains('immersive'))$('focus-toggle').innerHTML=`${icon('expand',15)} <span>${view==='batter'?'타석 화면':'크게 보기'}</span>`;
}
function renderViewButtons() {
  if(!INSPECTOR){$('view-selector').innerHTML='';$('view-selector').hidden=true;return;}
  const views=mode==='lab'&&reviewMode==='delivery'?[['batter','타석'],['delivery-front','정면'],['delivery-side','측면'],['delivery-back','뒤쪽']]:phase==='feedback'?[['tracking','공 추적'],['batter','타자'],['side','측면'],['top','위쪽']]:[['batter','타자'],['side','측면'],['top','위쪽']];
  $('view-selector').innerHTML=views.map(([id,name])=>`<button data-view="${id}" class="${view===id?'active':''}" aria-pressed="${view===id}">${name}</button>`).join('');
}
function resetTraining() {
  $('zone-guide').hidden=true;app.dataset.zoneGuide='false';
  motion=null;session=null;practicePlan=[];trialId='';selectedPitch=null;selectedCall=null;trackingRevealed=false;$('tracking-card').hidden=true;setPhase(rendererFailed?'error':'ready');setMessage();
  $('preparation-label').hidden=true;$('view-selector').hidden=true;view='batter';
  $('feedback-detail').hidden=true;$('replay-action').hidden=true;$('real-replay-action').hidden=true;
  $('primary-action').hidden=false;$('primary-action').innerHTML=`10구 훈련 시작 ${icon('arrow',18)}`;
  ($('primary-action') as HTMLButtonElement).disabled=rendererFailed;
  $('round-kicker').textContent='YOUR NEXT REP';$('round-title').textContent='준비되면 첫 공을 만나보세요.';
  $('training-hint').textContent='구종과 스트라이크·볼을 고르면 공 추적으로 확인해요.';
  $('scene-state').textContent='READY';
  currentPitch=generatePitch(pitcher,pitcher.pitches[0].kind,1,false);
  stage?.setPitch(pitcher,currentPitch);renderViewButtons();updateCamera();renderSettings();renderProgress();renderAnswers();drawStatic();
}
function startSession() {
  if(rendererFailed||(!INSPECTOR&&!config))return;
  if(!INSPECTOR&&config){app.dataset.zoneGuide=String(zoneGuide);app.dataset.screen='practice';pitcher=createTrainingPitcher(config.level,config.pitchHand,newSeed());toggleFocus(true);stage?.syncViewport();}
  pitchPlan=createPitchPlan(newSeed());
  practicePlan=createPracticePlan(newSeed());
  session={id:uniqueId(),startedAt:new Date().toISOString(),pitcherId:pitcher.id,difficulty:difficulty.id,
    samplingVersion:SAMPLING_VERSION,modelVersion:PITCHER_MODEL_VERSION,
    ...(!INSPECTOR&&config?{trainingLevel:config.level,pitchHand:config.pitchHand,trainingProfileVersion:TRAINING_PROFILE_VERSION,speedRanges:Object.fromEntries(pitcher.pitches.map(p=>[p.kind,p.speed])),pitchReferenceProfile:pitcher.referenceProfile,observationVersion:zoneGuide?GUIDED_OBSERVATION_VERSION:OBSERVATION_VERSION,zoneGuide,guideVersion:zoneGuide?ZONE_GUIDE_VERSION:undefined,gazeVersion:GAZE_VERSION,displayCalibration:{...display}}:{}),
    batterProfileId:eye==='R'?REFERENCE_BATTER.id:'adult-180-left',zoneVersion:ZONE_VERSION,strikeZone:{...STRIKE_ZONE},
    zoneRules:{middleZ:MIDDLE_Z,endZ:PLATE_Z,endBottom:END_BOTTOM,ballRadius:BALL_RADIUS},
    occlusionMs:INSPECTOR?difficulty.milliseconds:0,ballScale,eye,trials:[],targetCount:10,taskVersion:'pitch-and-zone-v1',engineVersion:ENGINE_VERSION,motionVersion:MOTION_VERSION,motionSample:motionSample(pitcher),cameraVersion:INSPECTOR?CAMERA_VERSION:PHONE_PRESENTATION?PHONE_PRESENTATION_VERSION:DISPLAY_VERSION,...(PHONE_PRESENTATION?{presentationVersion:PHONE_PRESENTATION_VERSION,minBallPixels:PHONE_MIN_BALL_PIXELS}:{}),battingView:{...battingView,...(!INSPECTOR?stage?.projection():{})}};
  renderSettings();throwNext();
}
function throwNext(retry=false) {
  if(!session||rendererFailed)return;
  if(!retry) {
    const random = new Uint32Array(1);
    if(typeof globalThis.crypto !== 'undefined') crypto.getRandomValues(random); else random[0]=newSeed();
    const kind=INSPECTOR?pitcher.pitches[random[0]%pitcher.pitches.length].kind:pitchPlan[session.trials.length];
    currentPitch=generatePracticePitch(pitcher,kind,practicePlan[session.trials.length],newSeed());trialId=uniqueId();
  }
  observedMs=0;selectedPitch=null;selectedCall=null;trackingRevealed=false;$('tracking-card').hidden=true;setPhase('windup');setMessage();
  $('preparation-label').hidden=false;
  $('feedback-detail').hidden=true;$('replay-action').hidden=true;$('real-replay-action').hidden=true;$('view-selector').hidden=true;
  $('primary-action').hidden=true;view='batter';updateCamera();
  stage?.setPitch(pitcher,currentPitch);stage?.syncViewport();
  trialView={...battingView,...(!INSPECTOR?stage?.projection():{}),width:$('viewport').clientWidth,height:$('viewport').clientHeight,immersive:document.body.classList.contains('immersive')};
  resetZoneGuide();
  visibleObservationLimit=INSPECTOR?(stage?.observationLimit(Math.min(difficulty.milliseconds/1000,currentPitch.duration-.025),ballScale)??Infinity):session.zoneGuide?assessZone(currentPitch).decisionTime:Math.min(approachCutoff(currentPitch),stage?.observationLimit(approachCutoff(currentPitch),ballScale)??Infinity);
  $('round-kicker').textContent=`PITCH ${String(session.trials.length+1).padStart(2,'0')}`;
  $('round-title').textContent='손을 떠나는 순간부터 공을 보세요.';
  $('training-hint').classList.remove('location-feedback');
  $('training-hint').textContent=session.zoneGuide?'홈을 지나는 공의 높이와 좌우를 보세요.':'화면이 가려진 뒤 구종과 스트라이크·볼을 골라 주세요.';
  $('scene-state').textContent='ON THE MOUND';
  renderAnswers();renderProgress();
  const now=performance.now();motion={kind:'trial',start:now,speed:1,from:0,lastFrame:now};
  $('viewport').parentElement?.scrollIntoView({block:'start',behavior:'instant'});
}
function askQuestion(actualMs:number) {
  motion=null;observedMs=actualMs;setPhase('question');
  $('preparation-label').hidden=true;
  setMessage('어떤 공이었나요?',session?.zoneGuide?'홈 통과 위치를 보고 구종과 스트라이크·볼을 골라요.':'구종 하나, 스트라이크·볼 하나를 골라요.');
  $('round-title').textContent='구종과 스트라이크·볼을 각각 골라 주세요.';
  $('training-hint').textContent='판단하는 시간은 점수에 포함하지 않아요.';
  $('scene-state').textContent='MAKE YOUR CALL';renderAnswers();
}
function selectPitch(kind:PitchKind){
  if(phase!=='question')return;selectedPitch=kind;renderAnswers();if(selectedCall)submitAnswer();
}
function selectCall(call:ZoneCall){
  if(phase!=='question')return;selectedCall=call;renderAnswers();if(selectedPitch)submitAnswer();
}
function submitAnswer(){
  if(phase!=='question'||!session||!selectedPitch||!selectedCall)return;
  if(!recordAnswer(session,currentPitch,trialId,selectedPitch,observedMs,selectedCall))return;
  session.trials[session.trials.length-1].view=trialView;persist(finish(session));
  setPhase('feedback');setMessage();trackingRevealed=false;renderProgress();renderAnswers();
  $('round-kicker').textContent='PITCH TRACK';$('round-title').textContent='공이 존을 통과하는 위치를 확인하세요.';
  $('training-hint').textContent=`내 선택: ${pitcher.pitches.find(p=>p.kind===selectedPitch)!.name} · ${callName(selectedCall)}`;
  $('primary-action').hidden=true;$('replay-action').hidden=true;$('real-replay-action').hidden=true;$('feedback-detail').hidden=true;
  $('view-selector').hidden=!INSPECTOR;startReplay();
}
function revealTrackingResult(){
  if(trackingRevealed||!session)return;trackingRevealed=true;
  const trial=session.trials[session.trials.length-1],result=assessZone(currentPitch);
  $('track-call').textContent=INSPECTOR?(result.call==='strike'?'STRIKE':'BALL'):callName(result.call);
  $('track-call-detail').textContent=zoneExplanation(result);$('tracking-card').classList.add('has-result');
  $('tracking-card').querySelector('.track-impact')?.removeAttribute('hidden');
  $('tracking-card').querySelector('.track-live')?.setAttribute('hidden','');
  $('round-kicker').textContent=trial.correct?'BOTH CORRECT':'CHECK THE PITCH';
  $('round-title').textContent=`${currentPitch.name} · ${callName(result.call)} — ${trial.correct?'둘 다 맞았어요':trial.pitchCorrect?'구종은 맞았어요':trial.callCorrect?'스트라이크·볼은 맞았어요':'다시 확인해 보세요'}`;
  $('feedback-detail').hidden=false;$('feedback-detail').textContent=`구종 ${trial.pitchCorrect?'정답':'오답'} · 스트라이크/볼 ${trial.callCorrect?'정답':'오답'} · KBO ABS · ${zoneExplanation(result)} · 중간면 좌우 ${result.checks.horizontal?'통과':'벗어남'} / 높이 ${result.checks.middleVertical?'통과':'벗어남'} · 끝면 높이 ${result.checks.endVertical?'통과':'벗어남'}.`;
  $('training-hint').textContent=`${currentPitch.name} · ${callName(result.call)} / ${locationFeedback(result,eye)} · ${trial.correct?'둘 다 정답':trial.pitchCorrect?'구종 정답':trial.callCorrect?'볼 판단 정답':'다시 확인해요'}`;
  $('training-hint').classList.add('location-feedback');
  $('primary-action').hidden=false;$('primary-action').innerHTML=session.trials.length===10?`훈련 결과 보기 ${icon('arrow',18)}`:`다음 공 ${icon('arrow',18)}`;
  $('replay-action').hidden=false;$('real-replay-action').hidden=INSPECTOR;$('replay-action').innerHTML=`${icon('refresh',16)} ${INSPECTOR?'다시 보기':'느린 공 추적'}`;renderAnswers();
}
function resetZoneGuide(){
  const active=!!session?.zoneGuide&&view==='batter';
  $('zone-guide').hidden=!active;
  $('guide-ball').setAttribute('hidden','');$('guide-arrow').setAttribute('hidden','');
  $('guide-state').textContent='투구를 보세요';$('zone-guide').dataset.state='waiting';
}
function updateZoneGuide(time:number){
  if(!session?.zoneGuide||view!=='batter')return;
  const frame=zoneGuideFrame(currentPitch,time),ball=$('guide-ball'),arrow=$('guide-arrow');
  $('zone-guide').hidden=false;
  ball.toggleAttribute('hidden',!frame.near);
  if(frame.near){ball.setAttribute('cx',String(frame.x));ball.setAttribute('cy',String(frame.y));}
  arrow.toggleAttribute('hidden',!frame.near||!frame.clipped);
  if(frame.near&&frame.clipped)arrow.setAttribute('transform',`translate(${frame.x} ${frame.y}) rotate(${frame.arrowAngle})`);
  const state=frame.complete?'crossed':frame.near?'approaching':'waiting';
  if($('zone-guide').dataset.state!==state){
    $('zone-guide').dataset.state=state;
    $('guide-state').textContent=frame.complete?'홈 통과':frame.near?'홈 접근 중':'투구를 보세요';
  }
}
function updateTrackingBall(time:number){
  const ball=$('tracking-card').querySelector('.track-live');if(!ball)return;
  const approaching=time>=currentPitch.duration-.12&&time<assessZone(currentPitch).decisionTime&&!trackingRevealed;
  ball.toggleAttribute('hidden',!approaching);
  if(approaching){const p=trackingAt(currentPitch,time);ball.setAttribute('cx',String(120-p.x*140));ball.setAttribute('cy',String(225-p.y*140));}
}
function startReplay(replayView:ViewName='tracking'){
  if(rendererFailed)return;if(!INSPECTOR&&replayView!=='batter')replayView='tracking';trackingRevealed=false;
  $('primary-action').hidden=true;$('replay-action').hidden=true;$('real-replay-action').hidden=true;$('feedback-detail').hidden=true;
  $('round-kicker').textContent='PITCH TRACK';$('round-title').textContent='공이 존을 통과하는 위치를 확인하세요.';
  renderAnswers();
  $('tracking-card').hidden=replayView!=='tracking';$('tracking-card').className=`tracking-card ${assessZone(currentPitch).call}`;
  $('tracking-card').innerHTML=trackingCard(currentPitch,assessZone(currentPitch));
  view=replayView;renderViewButtons();updateCamera();stage?.syncViewport();
  resetZoneGuide();
  const now=performance.now();motion={kind:'replay',start:now,speed:view==='tracking'?.65:1,from:!INSPECTOR&&view==='batter'?-preparationDuration(pitcher):-.12,lastFrame:now};
  $('scene-state').textContent=INSPECTOR?(view==='tracking'?'PITCH TRACK · SLOW ZONE':'REAL TIME · 1×'):(view==='tracking'?'느린 공 추적 · 판정 확인':'실제 속도 · 1×');
}
function completeInterruptedReplay(){
  motion=null;drawStatic();
  if(session?.zoneGuide&&view==='batter')updateZoneGuide(assessZone(currentPitch).decisionTime);
  revealTrackingResult();$('scene-state').textContent='재생 중단 · 결과 확인';
}
function persist(result:Session) {
  history=[result,...history.filter(s=>s.id!==result.id)].slice(0,30);
  try { if(IS_NATIVE)postNative({kind:'history',sessions:history});else history=saveSession(historyStorage,result); }
  catch { toast('브라우저 저장 공간을 사용할 수 없어 이번 방문 중에만 결과를 보관합니다.'); }
  updateHistoryCount();
}
function finishSession(showResult=true) {
  if(!session)return;
  const result=finish(session);
  motion=null;
  if(result.trials.length)persist(result);
  resetTraining();if(!INSPECTOR){toggleFocus(false);app.dataset.screen='setup';renderSetup();}
  if(showResult&&result.trials.length)showResults(result);
  else if(!result.trials.length)toast('아직 답한 공이 없어 결과를 저장하지 않았습니다.');
}
function showResults(result:Session) {
  const p=resolvePitcher(result.pitcherId)!;
  const correct=result.trials.filter(t=>t.correct).length;
  $('result-content').innerHTML=`<p class="result-pitcher">${p.name} · ${result.zoneGuide?'홈 통과 · 존 가이드':result.observationVersion?'실제 속도 · 접근 관찰':`${result.occlusionMs}ms 관찰`}</p><h2>${result.completed?'10구 훈련을 마쳤어요.':'답한 공까지 남겼어요.'}</h2><div class="result-score"><strong>${score(result)}</strong><span>%</span><p>${result.trials.length}구 중 ${correct}구 정답</p></div><div class="result-breakdown">${p.pitches.map(spec=>{const ts=result.trials.filter(t=>t.pitch.kind===spec.kind);return `<div><span>${spec.name}</span><strong>${ts.filter(t=>t.correct).length} <small>/ ${ts.length}구</small></strong></div>`;}).join('')}</div><p class="result-dual">구종 ${result.trials.filter(t=>t.pitchCorrect??t.correct).length}/${result.trials.length} · 스트라이크/볼 ${result.trials.filter(t=>t.callCorrect).length}/${result.trials.length}<br/>위 점수는 두 판단을 모두 맞힌 비율입니다.</p><p class="result-note">${result.zoneGuide?'존 가이드 켬 · ':''}${result.presentationVersion===PHONE_PRESENTATION_VERSION?'폰 화면 보정':result.ballScale===1?'기준 공 1×':'학습용 공 확대 1.8×'} · ${result.eye==='R'?'우타자':'좌타자'} 시점<br/>이 가상 설정에서의 정답률입니다. 실제 타격 능력 점수가 아닙니다.</p>`;
  $('result-dialog').querySelector('.eyebrow')!.textContent=result.completed?'훈련 완료':'훈련 저장';
  showDialog('result-dialog');
}
function updateHistoryCount() {document.querySelectorAll('.history-count').forEach(e=>{e.textContent=String(history.length);});}
function renderHistory() {
  $('history-list').innerHTML=history.length?history.map(s=>{
    const p=resolvePitcher(s.pitcherId);
    const date=new Date(s.startedAt);
    const dateLabel=Number.isNaN(date.valueOf())?'날짜 없음':new Intl.DateTimeFormat('ko-KR',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(date);
    return `<article class="history-item"><div><span>${dateLabel} · ${s.completed?'10구 완료':`${s.trials.length}구 기록`}</span><strong>${p?.name??'가상 투수'} · ${s.eye==='R'?'우타석':'좌타석'}</strong><small>구종 ${s.trials.filter(t=>t.pitchCorrect??t.correct).length}/${s.trials.length} · 볼 판별 ${s.trials.filter(t=>t.callCorrect).length}/${s.trials.length} · ${s.gazeVersion===GAZE_VERSION?'시선 고정':s.gazeVersion?'이전 자동 시선':'이전 시선 조건'}${s.zoneGuide?' · 존 가이드':''}${s.presentationVersion===PHONE_PRESENTATION_VERSION?' · 폰 화면 보정':s.ballScale!==1?' · 공 확대':''}</small></div><div class="history-score">${score(s)}<small>%</small></div></article>`;
  }).join(''):`<div class="empty-history">${icon('clock',35)}<h3>아직 남긴 연습이 없어요.</h3><p>10구 훈련을 시작하면 답한 공과 설정이<br/>이 기기에 함께 저장됩니다.</p></div>`;
  ($('export-history') as HTMLButtonElement).disabled=!history.length;
}
function showDialog(id:string) {
  if(motion?.kind==='trial')interruptTrial('안내를 여는 동안 투구를 중단했습니다.');
  if(motion?.kind==='lab'){motion=null;updateLabPlayback();}
  const dialog=$<HTMLDialogElement>(id);if(!dialog.open)dialog.showModal();
  if(IS_NATIVE)postNative({kind:'sheet',open:true});
}
function interruptTrial(reason:string) {
  if(motion?.kind!=='trial')return;
  motion=null;$('zone-guide').hidden=true;setPhase('interrupted');$('preparation-label').hidden=true;
  setMessage('새 공으로 다시 볼게요.',`${reason} 이번 공은 평가에서 제외합니다.`,'PAUSED');
  $('round-title').textContent='중단된 공을 건너뛰고 새 공을 봅니다.';
  $('primary-action').hidden=false;$('primary-action').innerHTML=`새 공으로 다시 시작 ${icon('refresh',17)}`;
  $('scene-state').textContent='PAUSED';renderAnswers();
}

function renderLabPitches() {
  $('lab-pitches').innerHTML=pitcher.pitches.map(p=>`<button data-lab-pitch="${p.kind}" class="${labKind===p.kind?'active':''}" aria-pressed="${labKind===p.kind}">${p.name}</button>`).join('');
}
function defaultLab() {
  labKind=pitcher.pitches.some(p=>p.kind===labKind)?labKind:pitcher.pitches[0].kind;
  const spec=pitcher.pitches.find(p=>p.kind===labKind)!;
  $<HTMLInputElement>('speed-slider').value=String((spec.speed[0]+spec.speed[1])/2);
  const heightRange=releaseHeightRange(pitcher);
  $<HTMLInputElement>('height-slider').min=String(heightRange.min);$<HTMLInputElement>('height-slider').max=String(heightRange.max);
  $<HTMLInputElement>('height-slider').value=String(pitcher.release.y);
  $<HTMLInputElement>('ax-slider').value=String(spec.ax);$<HTMLInputElement>('ay-slider').value=String(spec.ay);
  targetIndex=4;renderLabPitches();renderTarget();updateLabPitch();
}
function renderTarget() {
  const names=['왼쪽 높은','가운데 높은','오른쪽 높은','왼쪽 중간','가운데 중간','오른쪽 중간','왼쪽 낮은','가운데 낮은','오른쪽 낮은'];
  $('target-grid').innerHTML=names.map((name,i)=>`<button data-target="${i}" aria-label="${name} 코스" aria-pressed="${i===targetIndex}" class="${i===targetIndex?'active':''}">${i===targetIndex?'<span></span>':''}</button>`).join('');
}
function updateLabPitch() {
  motion=null;labTime=reviewMode==='delivery'?-preparationDuration(pitcher):0;
  const value=(id:string)=>Number($<HTMLInputElement>(id).value);
  const overrides={speedKmh:value('speed-slider'),height:value('height-slider'),ax:value('ax-slider'),ay:value('ay-slider'),
    targetX:(targetIndex%3-1)*STRIKE_ZONE.halfWidth*2/3,targetY:STRIKE_ZONE.top-(Math.floor(targetIndex/3)+.5)*(STRIKE_ZONE.top-STRIKE_ZONE.bottom)/3};
  $('speed-output').textContent=`${overrides.speedKmh} km/h`;$('height-output').textContent=`${overrides.height.toFixed(2)} m`;
  $('ax-output').textContent=`${overrides.ax>0?'+':''}${overrides.ax.toFixed(1)}`;$('ay-output').textContent=overrides.ay.toFixed(1);
  try {currentPitch=generatePitch(pitcher,labKind,1,false,overrides);}
  catch {toast('이 설정에서 궤적을 계산하지 못했습니다. 기본값으로 돌아가 주세요.');return;}
  stage?.setPitch(pitcher,currentPitch);renderLabMetrics();updateLabPlayback();drawStatic();
}
function labBounds(){return reviewMode==='delivery'?{start:-preparationDuration(pitcher),end:FOLLOW_THROUGH}:{start:0,end:currentPitch.duration};}
function setReviewMode(next:typeof reviewMode) {
  motion=null;reviewMode=next;labTime=labBounds().start;
  view=next==='delivery'?'delivery-front':'side';
  $('delivery-phase').hidden=next!=='delivery';$('delivery-events').hidden=next!=='delivery';$('orbit-hint').hidden=next!=='delivery';
  $('review-caption').textContent=next==='delivery'?'릴리스 전후를 천천히 확인 · 시점 회전 가능':'같은 공을 세 시점에서 확인';
  document.querySelectorAll<HTMLButtonElement>('[data-review]').forEach(b=>{b.classList.toggle('active',b.dataset.review===next);b.setAttribute('aria-pressed',String(b.dataset.review===next));});
  $('delivery-events').innerHTML=deliveryEvents(pitcher).map((e,i)=>`<button data-delivery-event="${i}">${e.name}</button>`).join('');
  renderViewButtons();updateCamera();updateLabPlayback();drawStatic();
}
function renderLabMetrics() {
  const m=movement(currentPitch);
  $('metric-speed').textContent=currentPitch.speedKmh.toFixed(1);$('metric-time').textContent=currentPitch.duration.toFixed(3);
  $('metric-x').textContent=`${m.horizontalCm>0?'+':''}${m.horizontalCm.toFixed(0)}`;$('metric-y').textContent=m.verticalCm.toFixed(0);
}
function updateLabPlayback() {
  const bounds=labBounds();
  $<HTMLInputElement>('timeline').value=String((labTime-bounds.start)/(bounds.end-bounds.start)*1000);
  $('timeline-time').textContent=reviewMode==='delivery'?`${labTime>=0?'+':''}${labTime.toFixed(3)}s · 릴리스 0`:`${labTime.toFixed(3)} / ${currentPitch.duration.toFixed(3)}s`;
  const label=deliveryLabel(pitcher,labTime);
  if($('delivery-phase-label').textContent!==label)$('delivery-phase-label').textContent=label;
  document.querySelectorAll<HTMLButtonElement>('[data-delivery-event]').forEach(b=>{const e=deliveryEvents(pitcher)[Number(b.dataset.deliveryEvent)];b.classList.toggle('active',Math.abs(labTime-e.time)<.035);});
  const action=motion?.kind==='lab'?'궤적 일시정지':'궤적 재생';
  if($('lab-play').getAttribute('aria-label')!==action){
    $('lab-play').innerHTML=icon(motion?.kind==='lab'?'pause':'play');
    $('lab-play').setAttribute('aria-label',action);
  }
  const speed=Number($<HTMLSelectElement>('playback-speed').value);
  const state=motion?.kind==='lab'?(speed===1?'REAL TIME · 1×':`SLOW MOTION · ${speed}×`):`TRAJECTORY LAB · ${speed}×`;
  if($('scene-state').textContent!==state)$('scene-state').textContent=state;
}
function toggleLab() {
  if(rendererFailed)return;
  if(motion?.kind==='lab'){motion=null;updateLabPlayback();return;}
  const bounds=labBounds();if(labTime>=bounds.end-.001)labTime=bounds.start;
  const now=performance.now();motion={kind:'lab',start:now,from:labTime,speed:Number($<HTMLSelectElement>('playback-speed').value),lastFrame:now};updateLabPlayback();
}
function switchMode(next:typeof mode) {
  if(!INSPECTOR||mode===next)return;
  if(session)finishSession(false);
  $('tracking-card').hidden=true;motion=null;mode=next;app.dataset.mode=mode;
  if(document.body.classList.contains('immersive'))document.body.style.setProperty('--immersive-console',immersiveConsoleHeight());
  document.querySelectorAll<HTMLButtonElement>('.mode-switch button').forEach(b=>{const active=b.id===`mode-${mode}`;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));});
  $('training-console').hidden=mode!=='training';$('training-settings').hidden=mode!=='training';$('how-it-works').hidden=mode!=='training';
  $('lab-console').hidden=mode!=='lab';$('lab-settings').hidden=mode!=='lab';$('view-selector').hidden=mode!=='lab';
  $('review-toolbar').hidden=mode!=='lab';$('orbit-hint').hidden=mode!=='lab'||reviewMode!=='delivery';
  $('page-title').innerHTML=mode==='training'?'선구안 훈련':'같은 공을, <em>다른 시점에서.</em>';
  $('page-description').textContent=mode==='training'?'투수의 공을 보고, 구종과 스트라이크·볼을 판단해요.':'구속과 릴리스를 조절하고, 움직임이 자연스러운지 확인해 보세요.';
  $('panel-title').textContent=mode==='training'?'오늘 상대할 투수':'투수와 궤적 설정';
  $('preparation-label').hidden=true;setMessage();
  if(mode==='training')resetTraining();else{setPhase('ready');defaultLab();renderSettings();setReviewMode(reviewMode);}
}

function renderDisplayGuide(){
  if(INSPECTOR)return;
  if(PHONE_PRESENTATION){$('display-guide-text').textContent='폰 전용 고정 시야 · 먼 공 식별 보조';$('display-open').hidden=true;return;}
  $('display-guide-text').textContent=`${display.source==='device'?'기기 화면 크기 자동 반영':display.source==='card'?'화면 크기 확인 완료':'화면 크기 추정 · 처음 한 번 확인을 권해요'} · 눈에서 약 ${display.viewDistanceCm}cm 떨어뜨려 주세요.`;
  app.dataset.displaySource=display.source;
}
$('display-open')?.addEventListener('click',()=>{
  showDialog('display-dialog');const range=$<HTMLInputElement>('card-measure-range');range.max=String(Math.max(100,Math.min(480,innerHeight-90)));range.value=String(Math.min(Number(range.max),display.cssPixelsPerCm*CARD_SHORT_EDGE_CM));
  $('card-measure-line').style.height=`${range.value}px`;
  $('display-distance-note').textContent=`연습할 때는 눈과 화면 사이를 약 ${display.viewDistanceCm}cm로 유지해 주세요. 화면을 가까이하거나 멀리하면 체감 크기도 달라져요.`;
  showDialog('display-dialog');
});
$('card-measure-range')?.addEventListener('input',()=>{$('card-measure-line').style.height=`${$<HTMLInputElement>('card-measure-range').value}px`;});
$('display-save')?.addEventListener('click',()=>{
  display=cardCalibration(Number($<HTMLInputElement>('card-measure-range').value),display.viewDistanceCm);
  try{localStorage.setItem('sinker-pitch-display-v1',JSON.stringify(display));}catch{/* this visit only */}
  if(IS_NATIVE)postNative({kind:'display',value:display});stage?.configureDisplay(display,PHONE_PRESENTATION);renderDisplayGuide();$<HTMLDialogElement>('display-dialog').close();
});
function renderSetup(){
  renderDisplayGuide();
  const labels=['투수 손','타자 시점','난이도'];
  $('setup-progress').innerHTML=labels.map((label,i)=>`<button data-step="${i}" class="${i===setupStep?'active':''}" aria-current="${i===setupStep?'step':'false'}" ${i>setupStep?'disabled':''}><span>0${i+1}</span>${label}</button>`).join('');
  $('setup-kicker').textContent=`STEP 0${setupStep+1} / 03`;
  $('setup-question').textContent=['어느 손 투수를 상대할까요?','어느 타석에서 볼까요?','어떤 속도의 공을 읽을까요?'][setupStep];
  const options=setupStep===0?[['R','우투','오른손으로 던지는 투수'],['L','좌투','왼손으로 던지는 투수']]:setupStep===1?[['R','우타 시점','홈 왼쪽의 우타석'],['L','좌타 시점','홈 오른쪽의 좌타석']]:TRAINING_LEVELS.map(l=>[l.id,l.name,`직구 ${l.speeds.fastball[0]}–${l.speeds.fastball[1]} km/h`,l.description,l.evidence]);
  const value=setupStep===0?draft.pitchHand:setupStep===1?draft.eye:draft.level;
  $('setup-options').innerHTML=options.map(([id,name,description,extra,evidence])=>`<button class="setup-card ${value===id?'selected':''}" data-choice="${id}" aria-pressed="${value===id}"><span class="setup-card-mark">${value===id?icon('check',18):icon(setupStep===2?'clock':'target',23)}</span><strong>${name}</strong><span>${description}</span>${extra?`<small>${extra}</small>`:''}${evidence?`<small class="evidence-caption">${evidence}</small>`:''}</button>`).join('');
  $('setup-options').classList.toggle('four-levels',setupStep===2);
  $('setup-summary').textContent=[draft.pitchHand?(draft.pitchHand==='R'?'우투':'좌투'):'투수 손 선택',draft.eye?(draft.eye==='R'?'우타 시점':'좌타 시점'):'타자 시점 선택',draft.level?levelFor(draft.level).name:'난이도 선택'].join('  /  ');
  $('setup-back').hidden=setupStep===0;
  $<HTMLButtonElement>('setup-start').disabled=!(draft.pitchHand&&draft.eye&&draft.level)||rendererFailed;
}
$('zone-guide-choice')?.addEventListener('change',()=>{zoneGuide=$<HTMLInputElement>('zone-guide-choice').checked;});
$('setup-back')?.addEventListener('click',()=>{setupStep=Math.max(0,setupStep-1);renderSetup();});
$('setup-start')?.addEventListener('click',()=>{
  if(!draft.pitchHand||!draft.eye||!draft.level)return;
  config={pitchHand:draft.pitchHand,eye:draft.eye,level:draft.level};eye=config.eye;
  pitcher=createTrainingPitcher(config.level,config.pitchHand);
  difficulty={id:config.level,name:levelFor(config.level).name,milliseconds:trainingObservationMs(pitcher)};
  ballScale=1;app.dataset.screen='practice';resetTraining();startSession();
});
$('change-settings')?.addEventListener('click',()=>{if(session)return;toggleFocus(false);setupStep=0;app.dataset.screen='setup';renderSetup();window.scrollTo({top:0});});
app.addEventListener('click',event=>{
  const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!button||button.disabled)return;
  if(button.dataset.step!==undefined){setupStep=Number(button.dataset.step);renderSetup();}
  if(button.dataset.choice){if(setupStep===0){draft.pitchHand=button.dataset.choice as 'R'|'L';setupStep=1;}else if(setupStep===1){draft.eye=button.dataset.choice as 'R'|'L';setupStep=2;}else draft.level=button.dataset.choice as LevelId;renderSetup();}
  if(button.dataset.pitcher){if(session)return;pitcher=PITCHERS.find(p=>p.id===button.dataset.pitcher)!;if(mode==='lab'){labKind=pitcher.pitches[0].kind;defaultLab();renderSettings();}else resetTraining();}
  if(button.dataset.difficulty){if(session)return;difficulty=DIFFICULTIES.find(d=>d.id===button.dataset.difficulty)!;renderSettings();}
  if(button.dataset.scale){if(session)return;ballScale=Number(button.dataset.scale);renderSettings();drawStatic();}
  if(button.dataset.answer)selectPitch(button.dataset.answer as PitchKind);
  if(button.dataset.call)selectCall(button.dataset.call as ZoneCall);
  if(INSPECTOR&&button.dataset.view){
    const next=button.dataset.view as ViewName;
    if(mode==='training'&&phase==='feedback')startReplay(next);
    else{view=next;updateCamera();}
  }
  if(button.dataset.review)setReviewMode(button.dataset.review as typeof reviewMode);
  if(button.dataset.deliveryEvent){motion=null;labTime=deliveryEvents(pitcher)[Number(button.dataset.deliveryEvent)].time;updateLabPlayback();drawStatic();}
  if(button.dataset.labPitch){labKind=button.dataset.labPitch as PitchKind;defaultLab();}
  if(button.dataset.target){targetIndex=Number(button.dataset.target);renderTarget();updateLabPitch();}
  if(button.classList.contains('dialog-close'))button.closest('dialog')?.close();
});
$('primary-action').addEventListener('click',()=>{
  if(rendererFailed)return;
  if(phase==='ready')startSession();
  else if(phase==='interrupted')throwNext();
  else if(phase==='feedback'&&trackingRevealed){if(session?.trials.length===10)finishSession();else throwNext();}
});
$('stage-start').addEventListener('click',()=>{if(!session&&phase==='ready')startSession();});
$('focus-toggle').addEventListener('click',()=>toggleFocus());
$('replay-action').addEventListener('click',()=>{if(phase==='feedback')startReplay(view);});
$('real-replay-action').addEventListener('click',()=>{if(phase==='feedback')startReplay('batter');});
$('end-session').addEventListener('click',()=>finishSession());
$('mode-training')?.addEventListener('click',()=>switchMode('training'));
$('mode-lab')?.addEventListener('click',()=>switchMode('lab'));
$('about-open').addEventListener('click',()=>showDialog('about-dialog'));
document.querySelectorAll('.history-open').forEach(b=>b.addEventListener('click',()=>{renderHistory();showDialog('history-dialog');}));
document.querySelectorAll<HTMLDialogElement>('dialog').forEach(dialog=>{
  dialog.addEventListener('close',()=>{if(IS_NATIVE)postNative({kind:'sheet',open:!!document.querySelector('dialog[open]')});});
  dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
});
$('result-settings').addEventListener('click',()=>{$<HTMLDialogElement>('result-dialog').close();toggleFocus(false);setupStep=0;app.dataset.screen='setup';renderSetup();});
$('practice-again').addEventListener('click',()=>{$<HTMLDialogElement>('result-dialog').close();startSession();});
$('export-history').addEventListener('click',()=>{
  if(IS_NATIVE){postNative({kind:'export',sessions:history});return;}
  const blob=new Blob([JSON.stringify({prototype:'sinker-pitch-reading',exportedAt:new Date().toISOString(),sessions:history},null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`sinker-pitch-reading-${new Date().toISOString().slice(0,10)}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
for(const id of ['speed-slider','height-slider','ax-slider','ay-slider'])$(id)?.addEventListener('input',updateLabPitch);
$('reset-lab')?.addEventListener('click',defaultLab);$('lab-play').addEventListener('click',toggleLab);
$('timeline').addEventListener('input',()=>{motion=null;const bounds=labBounds();labTime=bounds.start+Number($<HTMLInputElement>('timeline').value)/1000*(bounds.end-bounds.start);updateLabPlayback();drawStatic();});
$('playback-speed').addEventListener('change',()=>{if(motion?.kind==='lab'){motion=null;toggleLab();}else updateLabPlayback();});
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden)return;
  if(motion?.kind==='trial')interruptTrial('다른 화면으로 이동했습니다.');
  else if(motion?.kind==='lab'){motion=null;updateLabPlayback();}
  else if(motion?.kind==='replay'){
    completeInterruptedReplay();
  }
});
let lastViewportWidth=window.innerWidth;
window.addEventListener('resize',()=>{
  if(document.body.classList.contains('immersive'))document.body.style.setProperty('--immersive-console',immersiveConsoleHeight());
  const changed=Math.abs(window.innerWidth-lastViewportWidth)>40;lastViewportWidth=window.innerWidth;
  if(changed&&motion?.kind==='trial')interruptTrial('화면 방향이 바뀌었습니다.');
});
window.addEventListener('sinker-pause',()=>{if(motion?.kind==='trial')interruptTrial('앱이 잠시 가려졌습니다.');else if(motion?.kind==='replay')completeInterruptedReplay();});
window.addEventListener('keydown',e=>{
  if(INSPECTOR&&e.key==='Escape'&&document.body.classList.contains('immersive')&&!document.querySelector('dialog[open]')){toggleFocus(false);return;}
  if(document.querySelector('dialog[open]')||(e.target instanceof HTMLElement&&['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)))return;
  if(e.code==='Space'){
    if(e.target instanceof HTMLButtonElement&&!e.target.disabled)return;
    e.preventDefault();if(mode==='lab')toggleLab();else if(!$('primary-action').hidden)$('primary-action').click();
  }
  if(mode==='training'&&phase==='question'){const n=Number(e.key);if(n>=1&&n<=pitcher.pitches.length)selectPitch(pitcher.pitches[n-1].kind);else if(n===pitcher.pitches.length+1||n===pitcher.pitches.length+2)selectCall(n===pitcher.pitches.length+1?'strike':'ball');}
});

function animate(now:number) {
  requestAnimationFrame(animate);
  if(!motion||!stage||document.hidden)return;
  const current=motion;
  const elapsed=(now-current.start)/1000*current.speed;
  const gap=now-current.lastFrame;current.lastFrame=now;
  if(current.kind==='trial') {
    const preparation=preparationDuration(pitcher);
    if(elapsed<preparation) {
      stage.draw({time:0,deliveryTime:elapsed-preparation,ballVisible:false,held:true,reveal:false,ballScale});
      return;
    }
    const time=elapsed-preparation;
    if(gap>120&&!(session?.zoneGuide&&$('zone-guide').dataset.state==='crossed')){interruptTrial('재생이 잠시 끊겼습니다.');return;}
    if(phase!=='flight'){setPhase('flight');$('preparation-label').hidden=true;$('scene-state').textContent='READ THE PITCH';}
    const cutoff=INSPECTOR?Math.min(difficulty.milliseconds/1000,currentPitch.duration-.025,visibleObservationLimit):visibleObservationLimit;
    if(time>=cutoff){
      if(session?.zoneGuide){
        if($('zone-guide').dataset.state!=='crossed'){
          if(time-cutoff>.065){interruptTrial('홈 통과 표시가 지연됐습니다.');return;}
          stage.draw({time:cutoff,deliveryTime:cutoff,ballVisible:true,held:false,reveal:false,ballScale});
          updateZoneGuide(cutoff);
        }
        if(time>=cutoff+HOME_HOLD_SECONDS)askQuestion(cutoff*1000);
        return;
      }
      if(time-cutoff>.065){interruptTrial('공을 가리는 시점이 지연됐습니다.');return;}
      stage.draw({time:cutoff,deliveryTime:cutoff,ballVisible:false,held:false,reveal:false,ballScale});
      askQuestion((INSPECTOR?Math.min(time,visibleObservationLimit):time)*1000);return;
    }
    stage.draw({time,deliveryTime:time,ballVisible:true,held:false,reveal:false,ballScale});
    updateZoneGuide(time);
  } else {
    const end=current.kind==='lab'?labBounds().end:!INSPECTOR&&view==='batter'?(session?.zoneGuide?assessZone(currentPitch).decisionTime:approachCutoff(currentPitch)):trackingEnd(currentPitch);
    const time=Math.min(end,current.kind==='replay'&&view==='tracking'?replayTime(elapsed,current.from,currentPitch.duration):current.from+elapsed);
    stage.draw({time:Math.max(0,time),deliveryTime:time,ballVisible:time>=0,held:time<0,reveal:current.kind==='replay'?(INSPECTOR||view==='tracking'):reviewMode==='trajectory',ballScale});
    if(current.kind==='replay'){updateZoneGuide(time);updateTrackingBall(time);if(time>=assessZone(currentPitch).decisionTime)revealTrackingResult();}
    if(current.kind==='lab'){labTime=time;updateLabPlayback();}
    if(time>=end){motion=null;if(current.kind==='lab')updateLabPlayback();else {revealTrackingResult();$('scene-state').textContent=view==='batter'?'실제 속도 재생 완료':'TRACK COMPLETE';}}
  }
}
resetTraining();if(INSPECTOR){renderLabPitches();renderTarget();}else{app.dataset.screen='setup';renderSetup();}updateHistoryCount();requestAnimationFrame(animate);
if(IS_NATIVE&&!rendererFailed)postNative({kind:'ready',version:DISPLAY_VERSION});
