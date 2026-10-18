import { headers } from 'next/headers';
import { requireUser } from '@/lib/dal';
import { expoLevel } from '@/lib/app-env';
import { OpenNative } from '@/app/(session)/velocity/open-native';
import { listLabSamples } from '@/lib/pitch-lab';
import { labHandOf } from '@/lib/pitch-lab-meta';
import { LabClient } from './lab-client';

/**
 * 3D 동작 분석(베타, 옛 이름 투구 분석) — 옆 · 뒤 영상 짝을 올려 3D 로 보는 곳. 투구 탭의 '3D 동작 분석' 단추로 들어온다.
 * 2026-10-14 부터 일반 사용자에게도 — 사람마다 자기 것만, 관리자는 관리자끼리 서로의 샘플(마커 샘플 포함)을 본다.
 *
 * 2026-10-08 사용자: "3루 · 2루에서 동시에 찍으면 3D 분석이 가능하지 않을까 — 베타 화면을 만들고 샘플을 올릴 공간을 따로".
 * 지금은 올리기 · 나란히 보기 · 지우기까지. 분석은 올린 샘플로 만든다(lib/pitch-lab.ts 의 폴더를 실험대가 내려받는다).
 * 투구 기록 아래(/videos/…)라 메뉴의 투구 기록에 불이 들어온다.
 */
export default async function PitchLabPage() {
  const user = await requireUser();
  /* 새 아이폰 앱(판 9~)은 앱 화면(native/src/app/lab/index.tsx)으로 */
  if (expoLevel((await headers()).get('user-agent')) >= 9) return <OpenNative path="/lab" cover={false} />;
  const samples = await listLabSamples(user);
  return (
    <LabClient
      samples={samples}
      defaultHeightCm={user.heightCm ?? null}
      defaultHand={labHandOf(user.throwingHand)}
    />
  );
}
