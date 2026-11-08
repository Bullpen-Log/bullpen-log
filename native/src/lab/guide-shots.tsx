import { Text, View } from 'react-native';
import type { LabGuideScreen, LabGuideShot } from '@/lib/pitch-lab-guide';
import { forHand, type LabHand } from '@/lib/pitch-lab-meta';
import type { Palette } from '~/lib/ui';

/**
 * 촬영 안내의 폰 화면 그림(카메라 설정 · AirDrop) — 자료는 lib/pitch-lab-guide.ts LAB_GUIDE_CAMERA · LAB_GUIDE_MOVE,
 * 웹 app/(app)/videos/lab/guide/guide-shots.tsx 와 같은 짜임. 그림 속은 늘 아이폰 밝은 화면 색(앱 테마와 따로 — 실제 폰 화면처럼).
 * 그림은 읽어 주지 않는다(옆 글이 같은 말을 한다).
 */
const BLUE = '#0a84ff';
const GREEN = '#34c759';
const YELLOW = '#ffd60a';
const GREY = '#8e8e93';
const W = 112;
/** 그림 속 크기는 W 기준으로 적고 통째로 키운다(글자 하나하나 키우지 않게) */
const K = 1.25;

export function GuideShots({ shots, hand, c }: { shots: readonly LabGuideShot[]; hand: LabHand; c: Palette }) {
  return (
    <View style={{ gap: 16 }}>
      {shots.map((shot, i) => (
        <View key={shot.text} style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}>
          <PhoneShot screen={shot.screen} />
          <View style={{ flex: 1, gap: 6 }}>
            <View style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.action }}>
              <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{i + 1}</Text>
            </View>
            <Text style={{ color: c.ink, fontSize: 15, lineHeight: 22 }}>{forHand(shot.text, hand)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function PhoneShot({ screen }: { screen: LabGuideScreen }) {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: W * K, aspectRatio: 9 / 18.5 }}>
      <View
        style={{
          width: W,
          aspectRatio: 9 / 18.5,
          transform: [{ scale: K }],
          transformOrigin: 'top left',
          borderRadius: 20,
          borderWidth: 4,
          borderColor: '#1c1c1e',
          overflow: 'hidden',
          backgroundColor: screen.kind === 'camera' ? '#000' : '#f2f2f7',
        }}
      >
        {screen.kind === 'list' ? <ListScreen s={screen} /> : screen.kind === 'camera' ? <CameraScreen lock={!!screen.lock} /> : <ShareScreen hot={screen.hot} />}
      </View>
    </View>
  );
}

const hotRing = { borderWidth: 2, borderColor: BLUE, borderRadius: 7 } as const;

function ListScreen({ s }: { s: Extract<LabGuideScreen, { kind: 'list' }> }) {
  return (
    <View style={{ paddingTop: 14, paddingHorizontal: 6, gap: 8 }}>
      <View style={{ height: 14, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 8, fontWeight: '700', color: '#000' }}>{s.title}</Text>
        {s.done ? <Text style={{ position: 'absolute', right: 0, fontSize: 8, fontWeight: '700', color: BLUE }}>완료</Text> : null}
      </View>
      <View style={{ borderRadius: 7, backgroundColor: '#fff' }}>
        {s.rows.map((r, i) => (
          <View
            key={r.label}
            style={[
              { minHeight: 22, paddingHorizontal: 5, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: i ? 0.5 : 0, borderTopColor: '#d1d1d6' },
              r.hot ? hotRing : null,
            ]}
          >
            <Text style={{ flex: 1, fontSize: 7, color: '#000', fontWeight: r.hot ? '700' : '400' }}>{r.label}</Text>
            {r.check ? <Text style={{ fontSize: 9, fontWeight: '800', color: BLUE }}>✓</Text> : null}
            {r.on != null ? (
              <View style={{ width: 18, height: 11, borderRadius: 6, padding: 1, backgroundColor: r.on ? GREEN : '#e5e5ea', alignItems: r.on ? 'flex-end' : 'flex-start' }}>
                <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: '#fff' }} />
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}

function CameraScreen({ lock }: { lock: boolean }) {
  return (
    <View style={{ flex: 1 }}>
      {/* 위 줄: 잠금 표시 · HD 240 */}
      <View style={{ height: 30, paddingTop: 12, paddingHorizontal: 6, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }}>
        <View style={{ borderRadius: 4, borderWidth: 1, borderColor: lock ? 'transparent' : YELLOW, paddingHorizontal: 3 }}>
          <Text style={{ fontSize: 6, fontWeight: '700', color: lock ? '#fff' : YELLOW }}>HD · 240</Text>
        </View>
      </View>
      {/* 화면: 투수 + 잠근 자리 */}
      <View style={{ flex: 1, backgroundColor: '#3a3f2f', alignItems: 'center', justifyContent: 'center' }}>
        {lock ? (
          <View style={{ position: 'absolute', top: 6, borderRadius: 3, backgroundColor: YELLOW, paddingHorizontal: 4, paddingVertical: 1 }}>
            <Text style={{ fontSize: 6, fontWeight: '800', color: '#000' }}>AE/AF 잠금</Text>
          </View>
        ) : null}
        <View style={{ alignItems: 'center' }}>
          <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: '#d9d4c7' }} />
          <View style={{ width: 4, height: 24, backgroundColor: '#d9d4c7', marginTop: 1 }} />
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <View style={{ width: 3, height: 16, backgroundColor: '#d9d4c7', transform: [{ rotate: '20deg' }] }} />
            <View style={{ width: 3, height: 16, backgroundColor: '#d9d4c7', transform: [{ rotate: '-20deg' }] }} />
          </View>
        </View>
        {lock ? <View style={{ position: 'absolute', width: 40, height: 40, borderWidth: 1.5, borderColor: YELLOW }} /> : null}
      </View>
      {/* 아래: 배율 · 모드 · 셔터 */}
      <View style={{ height: 66, alignItems: 'center', gap: 4, paddingTop: 4 }}>
        <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
          <Text style={{ fontSize: 6, color: '#fff' }}>.5</Text>
          <View style={[{ width: 14, height: 14, borderRadius: 7, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }, lock ? null : { borderWidth: 1.5, borderColor: BLUE }]}>
            <Text style={{ fontSize: 6, fontWeight: '800', color: YELLOW }}>1×</Text>
          </View>
          <Text style={{ fontSize: 6, color: '#fff' }}>2</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 5 }}>
          <Text style={{ fontSize: 6, color: GREY }}>동영상</Text>
          <Text style={{ fontSize: 6, fontWeight: '800', color: YELLOW }}>슬로 모션</Text>
          <Text style={{ fontSize: 6, color: GREY }}>사진</Text>
        </View>
        <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: 15, height: 15, borderRadius: 8, backgroundColor: '#ff3b30' }} />
        </View>
      </View>
    </View>
  );
}

function ShareScreen({ hot }: { hot: 'options' | 'airdrop' }) {
  return (
    <View style={{ flex: 1 }}>
      {/* 뒤: 사진 */}
      <View style={{ height: 70, backgroundColor: '#3a3f2f' }} />
      <View style={{ flex: 1, marginTop: -8, borderTopLeftRadius: 10, borderTopRightRadius: 10, backgroundColor: '#f2f2f7', paddingHorizontal: 6, paddingTop: 8, gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <View style={{ width: 16, height: 16, borderRadius: 3, backgroundColor: '#3a3f2f' }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 6, fontWeight: '700', color: '#000' }}>비디오 1개 선택됨</Text>
            <View style={[{ alignSelf: 'flex-start', paddingHorizontal: 2 }, hot === 'options' ? hotRing : null]}>
              <Text style={{ fontSize: 6, fontWeight: '700', color: BLUE }}>옵션 ›</Text>
            </View>
          </View>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          {(['AirDrop', '메시지', '메일'] as const).map((name) => (
            <View key={name} style={[{ alignItems: 'center', gap: 2, padding: 2 }, hot === 'airdrop' && name === 'AirDrop' ? hotRing : null]}>
              <View style={{ width: 20, height: 20, borderRadius: name === 'AirDrop' ? 10 : 5, backgroundColor: name === 'AirDrop' ? BLUE : name === '메시지' ? GREEN : '#5ac8fa' }} />
              <Text style={{ fontSize: 5.5, color: '#000' }}>{name}</Text>
            </View>
          ))}
        </View>
        <View style={{ borderRadius: 6, backgroundColor: '#fff', height: 20, justifyContent: 'center', paddingHorizontal: 5 }}>
          <Text style={{ fontSize: 6, color: '#000' }}>복사하기</Text>
        </View>
      </View>
    </View>
  );
}
