'use client';

import { useEffect } from 'react';
import { DEFAULT_THEME, THEME_STORAGE_KEY } from '@/lib/theme';
import { APP_INIT_SCRIPT } from '@/lib/native-app';

/**
 * 맨 바깥 레이아웃까지 터졌을 때 — 마지막 방어선.
 *
 * app/(app)/error.tsx 와 app/error.tsx 는 레이아웃 안에서 난 오류를 잡는다.
 * 레이아웃 자체가 터지면 그 둘도 못 뜨고, 그때 이 파일이 나온다.
 *
 * 이 화면은 다른 것에 하나도 기대지 않는다. 문서(html·body)를 직접 만들고,
 * 색도 여기서 직접 칠한다 — Next.js 가 이 화면에는 앱의 CSS를 안 넣어주기
 * 때문에 Tailwind 클래스가 통하지 않는다. 오류 화면이 오류를 내면 사용자는
 * 정말 아무것도 못 본다.
 *
 * 색은 app/globals.css 에 적힌 값을 손으로 옮겨 적었다. 두 곳에 같은 색이
 * 있는 셈인데, 여기서 그 파일을 불러오면 이 화면이 그 파일에 기대게 된다.
 * 색이 조금 어긋나도 이 화면이 뜨는 것이 먼저다.
 */

const LIGHT = {
  bg: '#f2f2f7',
  surface: '#ffffff',
  ink: '#1d1d1f',
  muted: '#6e6e73',
  line: '#e5e5ea',
};
const DARK = {
  bg: '#0b1220',
  surface: '#141d2b',
  ink: '#e8eef7',
  muted: '#94a3b8',
  line: '#1e293b',
};

/**
 * 고른 테마를 첫 페인트 전에 칠한다.
 *
 * 앱 나머지와 같은 값(localStorage)을 본다. 못 읽으면 기본값으로 둔다 —
 * 브라우저 설정으로 저장소가 막혀 있어도 화면은 떠야 한다.
 */
const THEME_STYLE = `
  :root { color-scheme: light; --bg:${LIGHT.bg}; --surface:${LIGHT.surface}; --ink:${LIGHT.ink}; --muted:${LIGHT.muted}; --line:${LIGHT.line}; }
  :root[data-theme='dark'] { color-scheme: dark; --bg:${DARK.bg}; --surface:${DARK.surface}; --ink:${DARK.ink}; --muted:${DARK.muted}; --line:${DARK.line}; }
  body { margin:0; background:var(--bg); color:var(--ink);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans KR', sans-serif; }
`;

const THEME_SCRIPT = `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');document.documentElement.dataset.theme=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches)?'dark':'${DEFAULT_THEME}';}catch(e){}`;

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error('[전체 오류]', error);
  }, [error]);

  return (
    <html lang="ko">
      <head>
        {/* 문서를 직접 만들므로 폰 화면 폭도 직접 — 없으면 아이폰이 PC 폭(980px)으로 그려 글자가 작아진다 */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <style dangerouslySetInnerHTML={{ __html: THEME_STYLE }} />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* 아이폰 앱이면 시작 연출 판을 걷고 상태바를 맞춘다 — 안 알리면 연출 판이 10초 동안 이 화면을 덮었다 */}
        <script dangerouslySetInnerHTML={{ __html: APP_INIT_SCRIPT }} />
      </head>
      <body>
        <div
          style={{
            /* 100vh 는 사파리 주소창이 펴진 높이까지 쳐서 가운데가 아래로 밀렸다 */
            minHeight: '100dvh',
            boxSizing: 'border-box',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding:
              'max(48px, env(safe-area-inset-top)) 16px max(48px, env(safe-area-inset-bottom))',
          }}
        >
          <div style={{ maxWidth: 420, textAlign: 'center' }}>
            <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
              앱을 불러오지 못했어요
            </h1>
            <p
              style={{
                marginTop: 12,
                fontSize: 14,
                lineHeight: 1.7,
                color: 'var(--muted)',
              }}
            >
              잠깐 문제가 생겼어요. 다시 시도해보시고, 계속 같은 화면이 나오면 조금 뒤에
              열어주세요. 기록은 그대로 남아 있어요.
            </p>
            <div
              style={{
                marginTop: 28,
                display: 'flex',
                gap: 12,
                justifyContent: 'center',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={() => retry()}
                style={{
                  border: 0,
                  borderRadius: 12,
                  padding: '10px 16px',
                  fontSize: 14,
                  fontWeight: 600,
                  color: '#fff',
                  background: '#2563eb',
                  cursor: 'pointer',
                }}
              >
                다시 시도
              </button>
              <a
                href="/today"
                style={{
                  borderRadius: 12,
                  border: '1px solid var(--line)',
                  padding: '10px 16px',
                  fontSize: 14,
                  color: 'var(--ink)',
                  textDecoration: 'none',
                }}
              >
                홈으로
              </a>
            </div>
            {error.digest && (
              <p style={{ marginTop: 24, fontSize: 11, color: 'var(--muted)' }}>
                오류 번호 {error.digest}
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
