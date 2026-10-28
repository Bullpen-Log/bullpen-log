import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useEffect } from 'react';
import { rpc } from '~/lib/rpc';

/**
 * 휴대폰 푸시(2026-10-28 해외판 6단계, 설계 docs/designs/overseas-sinker-dugout.md) — 댓글 · 답 · 참가 같은 알림을 폰으로.
 * 보내기는 서버(lib/notify.ts → Expo 푸시)가 하고, 앱은 로그인한 뒤 Expo 토큰을 서버에 등록(push.registerPushDevice) · 로그아웃 때 지운다.
 * 누르면 알림의 link(사이트 주소)를 연다.
 *
 * Expo 프로젝트 번호(app.json extra.eas.projectId)가 없으면 아무것도 안 한다 — 김민이 Expo 계정 · 프로젝트를 만들고 애플 푸시 열쇠를 올린 뒤에 돈다.
 */
const projectId: string | undefined =
  (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ?? Constants.easConfig?.projectId;

/*
 * 앱이 앞에 떠 있을 때 — 서버 푸시는 띄우고, 앱이 건 알림은 예전 규칙 그대로(BullpenNativeModule.swift AlarmPresenter):
 * 홈 일정 알림('bullpen.event-…')만 띄우고 쉬는 시계 알림은 안 띄운다(화면이 이미 알린다).
 */
Notifications.setNotificationHandler({
  handleNotification: async (n) => {
    const id = n.request.identifier;
    const show = !id.startsWith('bullpen.') || id.startsWith('bullpen.event-');
    return { shouldShowBanner: show, shouldShowList: show, shouldPlaySound: show, shouldSetBadge: false };
  },
});

let registeredFor: string | null = null;
let token: string | null = null;

/** 로그인한 사람마다 한 번 — 허락을 묻고(처음만) 토큰을 서버에 등록. 허락하지 않았거나 실패하면 다음에 앱을 켤 때 다시 */
export async function registerPush(userId: string) {
  if (!projectId || registeredFor === userId) return;
  try {
    let perm = await Notifications.getPermissionsAsync();
    if (!perm.granted && perm.canAskAgain) perm = await Notifications.requestPermissionsAsync();
    if (!perm.granted) return;
    const t = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const r = await rpc<{ ok: boolean }>('push.registerPushDevice', { token: t, app: 'sinker', platform: 'ios' });
    if (!r.ok) return;
    token = t;
    registeredFor = userId;
  } catch {
    /* 신호 · 애플 등록 실패 — 다음에 */
  }
}

/** 로그아웃 직전 — 이 폰으로 앞사람 알림이 오지 않게 서버에서 이 토큰을 지운다(로그인이 살아 있을 때 불러야 한다) */
export async function unregisterPush() {
  const t = token;
  token = null;
  registeredFor = null;
  if (!t) return;
  await rpc('push.unregisterPushDevice', { token: t }).catch(() => undefined);
}

/** 알림을 누르면 그 주소로 — 앱이 꺼져 있다가 알림으로 켜진 때(마지막 응답)도 */
export function usePushTaps(open: (link: string) => void) {
  useEffect(() => {
    const go = (r: Notifications.NotificationResponse | null) => {
      if (!r || r.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const link = (r.notification.request.content.data as { link?: unknown } | undefined)?.link;
      if (typeof link === 'string' && link.startsWith('/')) open(link);
    };
    void Notifications.getLastNotificationResponseAsync().then((r) => {
      go(r);
      if (r) void Notifications.clearLastNotificationResponseAsync();
    });
    const sub = Notifications.addNotificationResponseReceivedListener(go);
    return () => sub.remove();
  }, [open]);
}
