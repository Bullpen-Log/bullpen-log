/**
 * 공개 결과의 모양 — 서버가 보내는 것과 화면이 그리는 것의 경계다. 순수 파일이라 브라우저에서도 부른다.
 *
 * 허용 칸만 고른다. 결과 파일을 통째로 내보내지 않고 toPublicResult 가 그리는 데 필요한 칸만 새 객체로 옮긴다 — 결과 모양에 칸이 늘어도 저절로 새지 않게.
 * 넣지 않는 것: 실행 번호 · GPU 번호 · 엔진 지문 · 품질 수치 · 뼈 길이 · 경고 · 원본 시각표 · 카메라 초점 · AI 실험 값 · 내부 메모 · 담당자 · 저장 경로 · 서명 주소.
 */
import type { Pitch3dQuality } from '@/lib/pitch-3d/analyze';
import type { Camera } from '@/lib/pitch-3d/camera';
import type { Metric } from '@/lib/pitch-3d/metrics';
import { PITCH3D_V2_VERSION, type Pitch3dV2Ok, type V2Contact, type V2FitQuality } from '@/lib/pitch-3d/v2/contract';

export type PublicMetric = Pick<Metric, 'key' | 'value' | 'unit' | 'pm' | 'trust'>;

/** 카메라는 3D 를 영상과 같은 쪽에서 보이는 데 쓰는 방향만 — 초점 · 화면 크기는 뺀다 */
type PublicCamera = Pick<Camera, 'R' | 't'>;

export type PublicPitchView = {
  hand: 'R' | 'L';
  t: number[];
  joints: number[][][];
  conf: number[][];
  lowConf: [number, number][];
  events: { kneeUp: number | null; footPlant: number; footContact?: number; release: number; contactBy?: 'heel' };
  contacts: V2Contact[];
  metrics: PublicMetric[];
  cameras: { side: PublicCamera; back: PublicCamera } | null;
};

export type PublicResult = {
  /** 공개 판 번호 — 같은 접수의 몇 번째 공개인가. 내부 번호를 대신해 화면이 바뀐 것을 알아본다 */
  version: number;
  athleteName: string;
  /** 승인된 설명 */
  explanation: string | null;
  /** 결과일(공개한 날, 한국 날짜) */
  resultDate: string;
  view: PublicPitchView;
};

const camera = (c: PublicCamera): PublicCamera => ({ R: c.R, t: c.t });

/** 결과 → 공개 칸. 칸을 하나씩 옮긴다 */
export function toPublicView(r: Pitch3dV2Ok): PublicPitchView {
  const e = r.events;
  return {
    hand: r.hand,
    t: r.t,
    joints: r.joints,
    conf: r.conf,
    lowConf: r.lowConf,
    events: {
      kneeUp: e.kneeUp,
      footPlant: e.footPlant,
      ...(e.footContact !== undefined ? { footContact: e.footContact } : {}),
      release: e.release,
      ...(e.contactBy ? { contactBy: e.contactBy } : {}),
    },
    contacts: (r.fit.contacts ?? []).map((c) => ({ side: c.side, from: c.from, to: c.to })),
    metrics: r.metrics.map((m) => ({ key: m.key, value: m.value, unit: m.unit, pm: m.pm, trust: m.trust })),
    cameras: r.cameras ? { side: camera(r.cameras.side), back: camera(r.cameras.back) } : null,
  };
}

export function toPublicResult(input: {
  version: number;
  athleteName: string;
  explanation: string | null;
  resultDate: string;
  result: Pitch3dV2Ok;
}): PublicResult {
  return {
    version: input.version,
    athleteName: input.athleteName,
    explanation: input.explanation,
    resultDate: input.resultDate,
    view: toPublicView(input.result),
  };
}

const NO_FIT: Omit<V2FitQuality, 'contacts'> = { boneCvPct: 0, reprojPct: 0, filled: 0, accelP95: 0, boneLen: {} };
const NO_CAMERA = { f: 0, cx: 0, cy: 0, W: 0, H: 0 };

/**
 * 공개 칸 → 3D 보기(Body3D)가 받는 모양. 그 부품을 바꾸지 않으려고 빠진 칸을 빈 값으로 채운다.
 * 채운 칸은 그리기에 안 쓰인다 — 카메라는 R · t 로 방향만, fit 은 contacts 만 읽는다(body-3d.tsx · display.ts).
 */
export function body3dResultOf(v: PublicPitchView): Pitch3dV2Ok {
  return {
    ok: true,
    version: PITCH3D_V2_VERSION,
    jobId: '',
    hand: v.hand,
    engine: { v1: '', pose: '' },
    t: v.t,
    tBack: v.t,
    joints: v.joints,
    conf: v.conf,
    lowConf: v.lowConf,
    events: v.events,
    metrics: v.metrics as Metric[],
    quality: {} as Pitch3dQuality,
    fit: { ...NO_FIT, contacts: v.contacts },
    warnings: [],
    cameras: v.cameras ? { side: { ...NO_CAMERA, ...v.cameras.side }, back: { ...NO_CAMERA, ...v.cameras.back } } : null,
    segment: { fromSec: v.t[0] ?? 0, toSec: v.t[v.t.length - 1] ?? 0 },
  };
}
