import { MARK_PATH, MARK_VIEWBOX } from '@/components/logo';

/**
 * 아이폰 앱을 켤 때 한 번 도는 시작 연출 — 큰 B 가 작아졌다 커졌다 튀고, 작아지며 왼쪽으로 가
 * 'ULLPEN LOG' 가 한 글자씩 튀어나오고, 로고 전체가 한 번 더 튄 뒤 홈이 드러난다(2026-09-30 사용자).
 *
 * 앱의 로딩 그림(mobile/scripts/make-ios-assets.mjs)은 움직일 수 없는 그림 한 장이라, 그림에는
 * 큰 B 만 두고 이 판이 같은 자리 · 같은 크기(화면 높이의 INTRO_B_RATIO)로 이어 받는다. 이 판이
 * 그려지면 로딩 그림을 바로 걷고(끊김 없이) 연출을 시작한다 — 그동안 뒤에서 홈이 뜬다.
 *
 * 앱에서만, 앱을 켠 뒤 한 번만(sessionStorage) — lib/native-app.ts 가 <html data-intro> 를 붙일
 * 때만 보인다(globals.css '앱 시작 연출'). 서버가 그리고 리액트는 손대지 않는다(속성을 바꾸지 않고
 * Web Animations 로만 움직인다 — 붙이기(hydration)가 어긋나지 않게).
 */

/** 로딩 그림 속 B 높이 ÷ 화면 높이 — make-ios-assets.mjs 의 SPLASH_B_RATIO 와 같아야 이어진다 */
export const INTRO_B_RATIO = 0.16;

const WORD = 'ULLPEN LOG';

const INTRO_SCRIPT = `(function () {
  var root = document.documentElement;
  if (!root.hasAttribute('data-intro')) return;
  var box = document.getElementById('app-intro');
  try { sessionStorage.setItem('bullpen-intro', '1'); } catch (e) {}
  if (!box || !box.animate) { root.removeAttribute('data-intro'); return; }
  var stage = box.querySelector('.intro-stage');
  var b = box.querySelector('.intro-b');
  var slot = box.querySelector('.intro-slot');
  var letters = [].slice.call(box.querySelectorAll('.intro-letter'));
  var calm = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  var started = false;
  var ready = new Promise(function (done) {
    if (document.readyState !== 'loading') done();
    else document.addEventListener('DOMContentLoaded', function () { done(); });
  });
  var fonts = document.fonts && document.fonts.ready
    ? Promise.race([document.fonts.ready, new Promise(function (d) { setTimeout(d, 900); })])
    : Promise.resolve();
  var wait = function (ms) { return new Promise(function (d) { setTimeout(d, ms); }); };
  var done = function (a) { return a.finished.catch(function () {}); };

  function finish() {
    var out = box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 320, easing: 'ease-in', fill: 'forwards' });
    stage.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.06)' }], { duration: 320, easing: 'ease-in', fill: 'forwards' });
    done(out).then(function () { root.removeAttribute('data-intro'); });
  }

  function play() {
    if (started) return;
    started = true;
    if (calm) {
      /* 움직임 줄이기 — 큰 B 그대로 잠깐 있다 걷힌다 */
      Promise.all([ready, wait(600)]).then(finish);
      return;
    }
    var bounce = 'cubic-bezier(0.34, 1.56, 0.64, 1)';

    /* 1. 큰 B 가 작아졌다 커졌다, 커졌다 작아졌다 */
    var pulse = b.animate(
      [
        { transform: 'translate(-50%, -50%) scale(1)' },
        { transform: 'translate(-50%, -50%) scale(0.8)', offset: 0.2 },
        { transform: 'translate(-50%, -50%) scale(1.16)', offset: 0.45 },
        { transform: 'translate(-50%, -50%) scale(0.9)', offset: 0.65 },
        { transform: 'translate(-50%, -50%) scale(1.05)', offset: 0.82 },
        { transform: 'translate(-50%, -50%) scale(1)' }
      ],
      { duration: 1000, easing: 'ease-in-out' }
    );

    Promise.all([done(pulse), fonts]).then(function () {
      /* 2. 작아지며 이름 첫 글자 자리로 — 조금 지나쳤다 돌아온다 */
      var s = slot.getBoundingClientRect();
      var r = b.getBoundingClientRect();
      var k = s.height / r.height;
      var dx = s.left + s.width / 2 - innerWidth / 2;
      var dy = s.top + s.height / 2 - innerHeight / 2;
      var at = function (scale) {
        return 'translate(calc(-50% + ' + dx + 'px), calc(-50% + ' + dy + 'px)) scale(' + scale + ')';
      };
      b.animate(
        [
          { transform: 'translate(-50%, -50%) scale(1)' },
          { transform: 'translate(-50%, -50%) scale(1.1)', offset: 0.18 },
          { transform: at(k * 0.82), offset: 0.62 },
          { transform: at(k * 1.12), offset: 0.82 },
          { transform: at(k) }
        ],
        { duration: 700, easing: 'ease-in-out', fill: 'forwards' }
      );

      /* 3. 'ULLPEN LOG' 가 한 글자씩 작게 나왔다 커졌다 제 크기로 */
      var last;
      letters.forEach(function (l, i) {
        last = l.animate(
          [
            { opacity: 0, transform: 'translateY(0.35em) scale(0.3)' },
            { opacity: 1, transform: 'translateY(-0.08em) scale(1.3)', offset: 0.6 },
            { opacity: 1, transform: 'translateY(0) scale(1)' }
          ],
          { duration: 420, delay: 380 + i * 45, easing: bounce, fill: 'forwards' }
        );
      });
      return done(last);
    }).then(function () {
      /* 4. 로고 전체가 한 번 커졌다 작아진다 */
      return done(
        stage.animate(
          [
            { transform: 'scale(1)' },
            { transform: 'scale(1.12)', offset: 0.4 },
            { transform: 'scale(0.96)', offset: 0.75 },
            { transform: 'scale(1)' }
          ],
          { duration: 520, easing: 'ease-in-out' }
        )
      );
    }).then(function () {
      /* 5. 홈이 다 왔으면 걷힌다(아직이면 기다린다) */
      return Promise.all([ready, wait(150)]);
    }).then(finish, finish);
  }

  /* 판이 그려진 뒤 로딩 그림을 바로 걷고 시작한다 — 같은 그림이라 바뀌는 것이 안 보인다 */
  requestAnimationFrame(function () {
    requestAnimationFrame(function () {
      var cap = window.Capacitor;
      var hid = cap && cap.nativePromise
        ? cap.nativePromise('SplashScreen', 'hide', { fadeOutDuration: 0 })
        : Promise.resolve();
      hid.then(play, play);
      setTimeout(play, 500);
    });
  });
  /* 무엇이 막혀도 판이 홈을 가리고 남지 않게 */
  setTimeout(function () { root.removeAttribute('data-intro'); }, 9000);
})();`;

export function AppIntro() {
  return (
    <>
      <div id="app-intro" aria-hidden>
        <div className="intro-stage">
          <div className="intro-word">
            <span className="intro-slot" />
            {[...WORD].map((ch, i) => (
              <span key={i} className="intro-letter">
                {ch === ' ' ? ' ' : ch}
              </span>
            ))}
          </div>
          <svg className="intro-b" viewBox={MARK_VIEWBOX}>
            <path d={MARK_PATH} />
          </svg>
        </div>
      </div>
      <script dangerouslySetInnerHTML={{ __html: INTRO_SCRIPT }} />
    </>
  );
}
