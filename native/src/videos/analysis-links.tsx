import { router, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import type { loadMyVideoReports } from '@/app/actions/pitch-lab';
import { rpc } from '~/lib/rpc';
import { cacheEpoch } from '~/lib/store';
import { TYPE, usePalette } from '~/lib/ui';
import { Press } from '~/shell/press';
import { canOpen, pushOpen, useRelease } from '~/shell/release';

export function VideoAnalysisLinks({
  path,
  available,
}: {
  path: string;
  available: boolean;
}) {
  const c = usePalette();
  const access = useRelease();
  const enabled = canOpen('/lab', access);
  const [rows, setRows] = useState<Awaited<
    ReturnType<typeof loadMyVideoReports>
  > | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);
  useEffect(
    () => () => {
      seq.current++;
    },
    []
  );
  const load = async () => {
    if (busy) return;
    const n = ++seq.current,
      epoch = cacheEpoch();
    const current = () => n === seq.current && epoch === cacheEpoch();
    setBusy(true);
    setError(null);
    try {
      const r = await rpc<Awaited<ReturnType<typeof loadMyVideoReports>>>(
        'pitch-lab.loadMyVideoReports',
        path
      );
      if (current()) setRows(r);
    } catch {
      if (current()) setError('연결된 분석을 불러오지 못했어요. 다시 확인해 주세요.');
    } finally {
      if (current()) setBusy(false);
    }
  };
  if (!enabled) return null;
  return (
    <View style={{ gap: 8, padding: 16, borderRadius: 18, backgroundColor: c.card }}>
      <Text style={[TYPE.card, { color: c.ink }]}>이 영상의 3D 분석</Text>
      <Press
        accessibilityRole="button"
        disabled={busy}
        onPress={() => void load()}
        style={{ minHeight: 44, justifyContent: 'center' }}
      >
        <Text style={[TYPE.buttonCompact, { color: c.link }]}>
          {busy ? '확인 중…' : '연결된 분석 확인'}
        </Text>
      </Press>
      {rows?.map((r) => (
        <Press
          key={`${r.id}:${r.view}`}
          accessibilityRole="link"
          onPress={() => pushOpen(`/lab/${r.id}` as Href)}
          style={{ minHeight: 44, justifyContent: 'center' }}
        >
          <Text style={[TYPE.body, { color: c.link }]}>
            {r.createdAt.slice(0, 10)} · {r.view === 'side' ? '옆' : '뒤'} 원본으로
            사용한 분석 ›
          </Text>
        </Press>
      ))}
      {rows?.length === 0 ? (
        <Text style={[TYPE.sub, { color: c.muted }]}>
          연결된 분석이 없어요. 이전에 앨범에서 따로 올린 분석은 자동으로 연결되지
          않아요.
        </Text>
      ) : null}
      {error ? <Text style={[TYPE.sub, { color: c.danger }]}>{error}</Text> : null}
      <Press
        accessibilityRole="button"
        disabled={!available}
        onPress={() =>
          router.push({ pathname: '/lab/new' as never, params: { sourcePath: path } })
        }
        style={{
          minHeight: 44,
          justifyContent: 'center',
          opacity: available ? 1 : 0.5,
        }}
      >
        <Text style={[TYPE.buttonCompact, { color: c.link }]}>
          {available
            ? '이 원본으로 새 분석 준비'
            : '원본을 복원하면 새 분석에 사용할 수 있어요'}
        </Text>
      </Press>
    </View>
  );
}
