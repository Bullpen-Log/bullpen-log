import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { MyVideoItem } from '@/lib/my-videos';
import { cacheEpoch } from '~/lib/store';
import { TYPE, usePalette } from '~/lib/ui';
import { Press } from '~/shell/press';
import { exportOriginal, restoreOriginal, videoBackupAvailable } from './backup';

export function VideoBackupCard({
  video,
  missing,
  onRestored,
}: {
  video: MyVideoItem;
  missing: boolean;
  onRestored: () => void;
}) {
  const c = usePalette();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const locked = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const run = async () => {
    if (locked.current) return;
    const epoch = cacheEpoch();
    const current = () => alive.current && epoch === cacheEpoch();
    locked.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const done = await (missing
        ? restoreOriginal(video, current)
        : exportOriginal(video, current));
      if (!done || !current()) return;
      setMessage(
        missing
          ? '원본을 복원했어요. 메모와 기록 연결은 그대로예요.'
          : '선택한 폴더에 원본과 영상 정보를 보관했어요. 기기를 바꿀 때 이 폴더를 함께 옮겨 주세요.'
      );
      if (missing) onRestored();
    } catch (e) {
      // Both picker implementations reject cancellation; leave the prior state intact.
      if (current() && !/cancel|취소/i.test(String(e)))
        setMessage(
          e instanceof Error
            ? e.message
            : '처리하지 못했어요. 저장 공간과 폴더를 확인해 주세요.'
        );
    } finally {
      locked.current = false;
      if (current()) setBusy(false);
    }
  };
  return (
    <View style={{ gap: 10, padding: 16, borderRadius: 18, backgroundColor: c.card }}>
      <Text style={[TYPE.card, { color: c.ink }]}>원본 보관과 복원</Text>
      <Text style={[TYPE.sub, { color: c.muted }]}>
        {missing
          ? '파일 앱에서 이 영상을 내보냈던 Sinker 보관 폴더를 선택해 주세요. 같은 계정의 영상만 복원할 수 있어요.'
          : '원본 영상과 메모 사본을 파일 앱의 폴더에 저장해요. 앱을 지워도 남도록 iCloud Drive나 외장 저장소 등 앱 밖의 폴더를 선택해 주세요. 공개 게시되지 않아요.'}
      </Text>
      {videoBackupAvailable() ? (
        <Press
          accessibilityRole="button"
          disabled={busy}
          accessibilityState={{ disabled: busy }}
          onPress={() => void run()}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={[TYPE.buttonCompact, { color: c.link }]}>
            {busy
              ? '처리 중…'
              : missing
                ? '보관 사본에서 원본 복원'
                : '원본 보관 사본 만들기'}
          </Text>
        </Press>
      ) : (
        <Text style={[TYPE.sub, { color: c.muted }]}>
          원본 보관·복원 기능이 포함된 새 앱으로 업데이트해 주세요.
        </Text>
      )}
      {message ? (
        <Text accessibilityLiveRegion="polite" style={[TYPE.sub, { color: c.ink }]}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}
