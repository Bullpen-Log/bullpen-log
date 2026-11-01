import { Pressable, Text, View } from 'react-native';
import { linkStateText } from '~/org/link-queue';
import { linkQueue, pendingSetsOf, useLinkPersistFailed, useLinks } from '~/org/space-store';
import { TYPE, usePalette } from '~/lib/ui';
import { Card } from '~/org/parts';

/**
 * 일정 잇기 상태(2차 검토 G04) — 선수 일정 탭 · 일정 하나 화면에 '아직 안 끝난 잇기'를 보인다. 기다림 · 세트 먼저 보내는 중 · 신호 기다림 · 이 기기에 저장 못 함 · 거절을
 * 서로 다르게 적고, 거절 · 못 보냄은 다시 보내기 · 지우기를 준다. 줄이 없으면 아무것도 안 그린다.
 */
export function LinkStatus({ memberId, eventId }: { memberId: string; eventId?: string }) {
  const c = usePalette();
  const links = useLinks();
  const failed = useLinkPersistFailed();
  const mine = links.filter((l) => l.memberId === memberId && (!eventId || l.eventId === eventId));
  if (!mine.length) return null;
  return (
    <Card c={c} style={{ gap: 6 }}>
      {mine.map((l) => {
        const t = linkStateText(l, pendingSetsOf(l.sessionId), failed);
        const canRetry = l.state === 'rejected' || !!l.lastError;
        return (
          <View key={l.key} style={{ gap: 4 }}>
            <Text style={[TYPE.sub, { color: t.tone === 'danger' ? c.danger : c.muted }]} accessibilityLiveRegion="polite">
              {t.text}
            </Text>
            {canRetry || l.state === 'rejected' ? (
              <View style={{ flexDirection: 'row', gap: 16 }}>
                {canRetry ? (
                  <Pressable accessibilityRole="button" onPress={() => void linkQueue.retry(l.key)} style={{ minHeight: 40, justifyContent: 'center' }}>
                    <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>다시 보내기</Text>
                  </Pressable>
                ) : null}
                {l.state === 'rejected' ? (
                  <Pressable accessibilityRole="button" onPress={() => void linkQueue.dismiss(l.key)} style={{ minHeight: 40, justifyContent: 'center' }}>
                    <Text style={[TYPE.sub, { color: c.muted, fontWeight: '600' }]}>지우기(개인 운동은 그대로)</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}
            {failed ? (
              <Pressable accessibilityRole="button" onPress={() => void linkQueue.retryPersist()} style={{ minHeight: 40, justifyContent: 'center' }}>
                <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>기기에 다시 저장하기</Text>
              </Pressable>
            ) : null}
          </View>
        );
      })}
    </Card>
  );
}
