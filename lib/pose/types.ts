/**
 * 자세 추출 결과의 공통 타입.
 *
 * 좌표는 영상 프레임 기준 0~1 정규화 값이고,
 * visibility는 그 관절이 화면에서 얼마나 확실하게 보였는지(0~1)다.
 * 이후 단계(구간 검출·지표 계산)가 전부 이 타입 위에서 동작한다.
 */

export type PosePoint = {
  x: number;
  y: number;
  z: number;
  visibility: number;
};

export type PoseFrame = {
  /** 영상에서의 시각 (초) */
  t: number;
  /** MediaPipe 관절 33개 */
  landmarks: PosePoint[];
  /**
   * 미터 단위 3D 좌표 (골반 중심이 원점, 화면 축과 정렬).
   * 카메라 한 대에서 추정한 깊이라 절대 정확도는 낮지만,
   * 수평면 회전(골반·어깨가 언제 열리는가)의 시간 흐름을 보는 데 쓴다.
   */
  world?: PosePoint[];
};

export type PoseTrack = {
  frames: PoseFrame[];
  /** 관절 연결선 (그리기용) */
  connections: { start: number; end: number }[];
  /** 영상 원본 크기 */
  videoWidth: number;
  videoHeight: number;
  /** 분석 샘플링 간격 (초) */
  sampleStep: number;
  /** 몸통 핵심 관절의 평균 인식 신뢰도 (0~1) */
  quality: number;
  /** 분석한 프레임 중 사람이 인식된 비율 (0~1) — 낮으면 스켈레톤이 끊긴다 */
  coverage: number;
};

/** MediaPipe Pose 관절 번호 중 우리가 쓰는 것들 */
export const LM = {
  nose: 0,
  leftShoulder: 11,
  rightShoulder: 12,
  leftElbow: 13,
  rightElbow: 14,
  leftWrist: 15,
  rightWrist: 16,
  leftHip: 23,
  rightHip: 24,
  leftKnee: 25,
  rightKnee: 26,
  leftAnkle: 27,
  rightAnkle: 28,
} as const;

/** 신뢰도 평균을 낼 때 보는 몸통 핵심 관절 */
export const CORE_LANDMARKS: number[] = [
  LM.leftShoulder,
  LM.rightShoulder,
  LM.leftHip,
  LM.rightHip,
  LM.leftKnee,
  LM.rightKnee,
  LM.leftAnkle,
  LM.rightAnkle,
];

/** 이 값보다 신뢰도가 낮으면 측정을 신뢰하지 않는다. */
export const QUALITY_THRESHOLD = 0.5;
