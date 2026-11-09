import { type Href, router } from 'expo-router';
import { useEffect, useRef, useState, type ComponentType, type Ref } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { Bar } from '~/community/parts';
import { intakeNativeMove, intakePathMove, intakeWebMove, INTAKE_WEB_PATH, type IntakeWebMove } from '~/admin/intake-nav';
import { APP_UA, SITE_HOST, SITE_URL } from '~/lib/site';
import { usePalette } from '~/lib/ui';
import { leaveTo } from '~/shell/web-nav';

/**
 * 외부 영상 접수(앱 관리자 화면 · 3D 개발 관리자 · 위 메뉴의 '관리'에서 들어온다, 2026-11-09) — 웹 /admin/intake 를 이 화면의 웹뷰로 띄운다.
 * 접수함 · 초대 만들기 · 원본 확인은 웹 한 벌만 둔다(앱에 따로 그리면 규칙이 두 벌이 된다).
 *   - 로그인은 앱 껍데기와 같은 'session' 쿠키(sharedCookiesEnabled — 3D 결과 칸 lab/lab-3d.tsx 와 같다)
 *   - applicationNameForUserAgent={APP_UA} 를 꼭 단다. 안 달면 proxy.ts 의 휴대폰 막기가 /phone 으로 보낸다
 *   - 접수함 밖으로 가려 하면 이 웹뷰에서 그리지 않는다(admin/intake-nav.ts): 관리자 첫 화면은 뒤로, 사이트의 다른 주소는 껍데기 웹, 다른 사이트(원본 서명 주소)는 사파리
 *     원본 내려받기(웹 detail-client 의 a.download · 링크)는 저장소의 남의 주소라 이 웹뷰의 맨 위 창 이동으로 온다 — 막고 사파리로 넘기면 사파리가
 *     download 칸(Content-Disposition: attachment)으로 받는다. 웹뷰 안에서는 받은 파일을 둘 곳이 없어 받지 않는다(onFileDownload 를 안 단다)
 *   - 로그인이 풀리면: 서버 돌려보냄(/login · /api/session/clear)은 가로채기에서, 그래도 웹 로그인 자리가 그려지면 그 자리가 보내는
 *     { t: 'native' } 알림에서 껍데기 '/login' 으로 넘긴다 — 이 화면에 웹 로그인 폼을 남기지 않는다(앱 로그인 화면은 껍데기가 연다)
 *   - 못 불러오면(오류 · 25초 안에 다 못 받음 · 웹 내용이 죽음) 덮개에 '다시 불러오기' — 웹뷰를 새로 만든다.
 *     25초가 지나 덮개가 떴어도 그 뒤에 다 받으면(느린 연결) 덮개를 걷는다 — 오류로 끝났는지는 이번 시도의 표시(errored)로 본다
 *   - 위 막대는 웹 틀(MobileTopBar)이 그린다(제목 · '‹ 관리자' → 웹이 /admin 으로 가면 아래 'path' 알림이 앱 뒤로로 바꾼다).
 *     앱 막대는 덮개(불러오는 중 · 못 불러옴)에만 둔다 — 막대가 두 줄 · 뒤로가 둘이 되지 않게, 못 불러와도 나갈 길은 늘 있게
 *   - 앱 캐시를 비우는 'wrote' 알림은 받지 않는다 — 이 웹뷰는 fetch 를 감싸지 않고(껍데기 WATCH_WEB 과 다르다), 접수 자료를 읽는 앱 화면도 없다
 * 메뉴 줄을 숨기는 것은 막기가 아니다. 웹 화면이 requirePermission('intake'), 쓰기 동작이 assertIntakeAdmin 으로 다시 본다.
 */
const LOAD_TIMEOUT_MS = 25_000;
const PAGE_URL = `${SITE_URL}${INTAKE_WEB_PATH}`;

type WebViewHandle = { injectJavaScript(script: string): void; reload(): void };
/* react-native-webview 14 의 타입은 ref 를 안 받지만 실제 부품은 forwardRef 다(index.tsx · lab/lab-3d.tsx 와 같다) */
const RefWebView = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

export default function IntakeAdminScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const web = useRef<WebViewHandle>(null);
  /* 바꾸면 웹뷰를 새로 만든다(다시 불러오기) */
  const [attempt, setAttempt] = useState(0);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  /* 접수함 밖으로 한 번 넘겼다 — 주소 가로채기와 사이트 알림이 한 이동에 같이 와도 두 번 넘기지 않는다 */
  const left = useRef(false);
  /* 이번 시도가 오류로 끝났나 — 상태(failed)는 25초 덮개도 켜서 늦게 끝난 성공을 가리지 못하게 따로 둔다. 상태 closure 는 낡을 수 있어 ref 로 */
  const errored = useRef(false);

  useEffect(() => {
    if (ready || failed) return;
    const t = setTimeout(() => setFailed(true), LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [ready, failed, attempt]);

  const retry = () => {
    left.current = false;
    errored.current = false;
    setFailed(false);
    setReady(false);
    setAttempt((n) => n + 1);
  };

  const leave = (move: IntakeWebMove) => {
    if (move.kind === 'outside') {
      void Linking.openURL(move.url).catch(() => undefined);
      return;
    }
    if (left.current) return;
    if (move.kind === 'back') {
      left.current = true;
      if (router.canGoBack()) router.back();
      else router.replace('/admin' as Href);
    } else if (move.kind === 'shell') {
      left.current = true;
      /* 앱 화면을 걷고 껍데기 웹을 그 주소로(로그인이 풀렸으면 /login — 껍데기가 앞사람 기록을 지운다) */
      leaveTo(move.href);
    }
  };

  const onShouldStart = (req: ShouldStartLoadRequest) => {
    if (!req.isTopFrame) return true;
    const move = intakeWebMove(req.url, SITE_HOST);
    if (move.kind === 'stay') return true;
    leave(move);
    return false;
  };

  /* 사이트 안 이동(링크 · 뒤로 단추)은 페이지를 새로 안 불러 가로채기가 못 본다 — 웹 틀이 알려 주는 'path'(components/app-shell/expo-tabs.tsx)로 본다 */
  const onMessage = (ev: WebViewMessageEvent) => {
    let msg: { t?: unknown; path?: unknown; search?: unknown };
    try {
      msg = JSON.parse(ev.nativeEvent.data);
    } catch {
      return;
    }
    if (msg.t === 'path' && typeof msg.path === 'string') {
      const move = intakePathMove(msg.path, typeof msg.search === 'string' ? msg.search : '');
      if (move.kind !== 'stay') leave(move);
      return;
    }
    /*
     * 사이트가 앱 화면을 청했다 — 서버가 로그인으로 돌려보낸 것이 가로채기를 빠져나가 웹 로그인 자리(native-login.tsx)가 이 웹뷰에 그려진 경우 등.
     * 웹 로그인 폼을 이 화면에 남기지 않고 껍데기에 넘긴다(로그인이면 껍데기가 앞사람 기록을 지우고 앱 로그인 화면을 연다)
     */
    if (msg.t === 'native' && typeof msg.path === 'string') {
      const move = intakeNativeMove(msg.path);
      if (move.kind !== 'stay') leave(move);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <View style={{ flex: 1 }}>
        <RefWebView
          key={attempt}
          ref={web}
          source={{ uri: PAGE_URL }}
          applicationNameForUserAgent={APP_UA}
          sharedCookiesEnabled
          allowsInlineMediaPlayback
          allowsLinkPreview={false}
          pullToRefreshEnabled
          contentInsetAdjustmentBehavior="never"
          automaticallyAdjustContentInsets={false}
          style={{ flex: 1, backgroundColor: c.page }}
          containerStyle={{ paddingBottom: inset.bottom }}
          onShouldStartLoadWithRequest={onShouldStart}
          onMessage={onMessage}
          onLoadEnd={(e) => {
            /* 오류로 끝난 불러오기도 onLoadEnd 가 온다 — 오류면 덮개를 그대로 둔다. 25초 뒤에 늦게 다 받았으면 못 불러옴 덮개를 걷는다 */
            if (e.nativeEvent.loading || errored.current) return;
            setReady(true);
            setFailed(false);
          }}
          onError={() => {
            errored.current = true;
            setFailed(true);
          }}
          onHttpError={(e) => {
            if (e.nativeEvent.statusCode < 400) return;
            errored.current = true;
            setFailed(true);
          }}
          onContentProcessDidTerminate={() => {
            errored.current = false;
            setReady(false);
            web.current?.reload();
          }}
        />
        {(!ready || failed) && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: c.page }]}>
            {/* 덮개 동안만 앱 막대 — 뒤로는 앱 화면 뒤로(뒤가 없으면 관리자 화면). 어디서 왔든(관리자 · 3D 개발 관리자 · 위 메뉴) 맞게 '뒤로' */}
            <Bar back="뒤로" title="외부 영상 접수" onBack={() => leave({ kind: 'back' })} c={c} />
            <View style={[styles.cover, { paddingBottom: inset.bottom }]}>
              {failed ? (
                <>
                  <Text style={[styles.title, { color: c.ink }]}>외부 영상 접수를 불러오지 못했어요.</Text>
                  <Text style={[styles.body, { color: c.muted }]}>연결을 확인하고 다시 불러와 주세요.</Text>
                  <Pressable accessibilityRole="button" onPress={retry} style={({ pressed }) => [styles.retry, { backgroundColor: c.action, opacity: pressed ? 0.7 : 1 }]}>
                    <Text style={[styles.retryText, { color: c.onAction }]}>다시 불러오기</Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <ActivityIndicator />
                  <Text style={[styles.body, { color: c.muted }]}>접수함을 불러오고 있어요.</Text>
                </>
              )}
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  cover: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingHorizontal: 24,
  },
  title: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  body: { fontSize: 15, textAlign: 'center' },
  retry: {
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: 22,
    justifyContent: 'center',
    marginTop: 4,
  },
  retryText: { fontSize: 15, fontWeight: '600' },
});
