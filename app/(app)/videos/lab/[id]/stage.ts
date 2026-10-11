import type * as Three from 'three';
import type { Vec3 } from '@/lib/pitch-3d/linalg';
import type { DisplayTrack } from '@/lib/pitch-3d/v2/display';
import { MOUND } from '@/lib/pitch-3d/v2/pose-rig';

/**
 * 투구 3D 보기의 무대 — 메이저리그 · KBO 같은 야구장(낮 · 밤). 사람(뼈대 · 데생 인형)은 body-3d.tsx 가 그린다.
 *
 * 2026-10-11 김민: 사람(데생 인형)은 금윤호가, 무대는 김민이 같은 때 만들기로 해서 body-3d.tsx 에서 떼었다 — 무대를 바꿀 때는 이 파일만.
 * 정한 것(김민): 낮 · 밤 둘 다(화면 단추). 첫 판(판 겹치기 · 관중석)은 "퀄리티가 낮다"고 해서 경기장 바닥 · 하늘부터 다시 만들었다 —
 * 관중석 · 조명탑 등은 그다음.
 *
 * 땅은 판 하나 + 마운드에 같은 재질(FIELD_GLSL)을 쓰고, 화면 점마다 그 자리가 잔디 · 내야 흙 · 경고 트랙 · 분필선 · 홈플레이트 중
 * 무엇인지 규격 거리로 계산한다 — 가까이 가도 선이 또렷하고(경계는 화소 폭으로 부드럽게), 판을 겹치지 않아 멀리서 깜빡이지 않는다.
 * 규격(OBR 2.01 · 부록): 투수판 앞 → 홈 뒤 꼭짓점 18.44m · 베이스 27.43m · 내야 흙 호 28.96m(투수판 앞에서) · 홈 · 베이스 둘레 흙 3.96m ·
 * 마운드 지름 5.49m(가운데는 투수판 앞 0.457m) · 홈플레이트 43.2cm · 타석 1.22 × 1.83m(플레이트에서 15cm) · 포수석 1.09 × 2.44m ·
 * 1루 주로선(홈 · 1루 사이 뒤 절반, 파울선 밖 0.91m) · 선 폭 7.6~10cm. 펜스는 KBO 큰 구장 쯤(좌우 100m · 가운데 122m, 높이 3m).
 * 잔디는 4.57m 격자 깎기 — 보는 방향에 따라 줄 밝기가 바뀐다(잎이 누운 방향). 잔결 · 흙 알갱이는 화소 하나가 덮는 땅 크기에 맞춰 줄인다.
 *
 * 좌표: 앱 3D 무대와 같다 — y 위, x 홈 쪽, z 오른쪽(투수가 홈을 볼 때), 키 = 1(displayTrack). 1루는 −z 쪽.
 * 바닥 y = 0, 마운드만 track.groundAt. 평평한 바닥(마운드 없음)이면 투수판 자리를 몸 가운데 조금 뒤로 어림한다.
 * 그림자: 해가 그림자를 드리우고 땅이 받는다 — 사람(인형) 메시에 castShadow 를 켜면 바로 보인다(body-3d 쪽).
 */

export type StageMode = 'day' | 'night';
export const STAGE_MODES: { value: StageMode; label: string }[] = [
  { value: 'day', label: '낮' },
  { value: 'night', label: '밤' },
];
export type StageHandle = {
  /** 카메라가 이만큼 멀리까지 그려야 펜스 · 하늘이 다 보인다 */
  cameraNear: number;
  cameraFar: number;
  setMode: (mode: StageMode) => void;
};

const RUBBER_TO_PLATE = 18.44;
const FENCE_LINE = 100;
const FENCE_CENTER = 122;
const FENCE_H = 3;
const BACKSTOP = 18.3;
const FOUL_WALL_H = 1.1;
const GROUND_R = 420;
const SKY_R = 600;

/* ───────────── 땅 재질(MeshStandardMaterial 에 끼움) — 미터 좌표 p = (가운데 쪽 a, 1루 쪽 b), 홈 뒤 꼭짓점이 원점 ───────────── */
const FIELD_GLSL = /* glsl */ `
uniform vec2 uHome;
uniform float uS;
varying vec3 vFieldPos;
vec3 fieldCol;
float fieldRough;

float fHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float fNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fHash(i), fHash(i + vec2(1.0, 0.0)), u.x), mix(fHash(i + vec2(0.0, 1.0)), fHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
/* fbm — fp(화소 하나가 덮는 미터)보다 잔 결은 줄여 멀리서 반짝이지 않게. 값은 대략 −0.5 ~ 0.5 */
float fFbm(vec2 p, float fp) {
  float a = 0.5, s = 0.0, w = 0.0, f = 1.0;
  for (int i = 0; i < 5; i++) {
    float k = 1.0 - smoothstep(0.2, 0.55, fp * f);
    s += a * k * (fNoise(p * f) - 0.5);
    w += a;
    f *= 2.03;
    a *= 0.5;
    p += vec2(17.1, 9.2);
  }
  return s / w;
}
float fCover(float sd, float aa) { return 1.0 - smoothstep(-aa, aa, sd); }
float fBox(vec2 p, vec2 h) { vec2 d = abs(p) - h; return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
vec3 fLin(vec3 c) { return pow(c, vec3(2.2)); }

void field(vec3 w, vec3 cam) {
  vec2 p = vec2(uHome.x - w.x, uHome.y - w.z) / uS;
  float fp = max(length(fwidth(p)), 1e-4);
  float aa = fp * 0.7;
  float d = length(p);
  float th = atan(p.y, p.x);
  const float Q = 0.7853981634;
  const vec2 e1 = vec2(0.7071067812, 0.7071067812);  /* 홈 → 1루 */
  const vec2 e3 = vec2(0.7071067812, -0.7071067812); /* 홈 → 3루 */
  float u = dot(p, e1);
  float v = dot(p, e3);
  float perp1 = dot(p, vec2(-0.7071067812, 0.7071067812)); /* 1루 선에서 파울 쪽 + */
  float perp3 = dot(p, vec2(0.7071067812, 0.7071067812));  /* 3루 선에서 파울 쪽 + */

  /* 잔디 — 4.57m 격자 깎기, 줄 밝기는 보는 방향에 따라(잎이 누운 쪽에서 보면 밝다) */
  float band = 4.572;
  float su = smoothstep(-0.12, 0.12, sin(u * 3.14159265 / band));
  float sv = smoothstep(-0.12, 0.12, sin(v * 3.14159265 / band));
  float chk = su * sv + (1.0 - su) * (1.0 - sv);
  vec3 vw = cam - w;
  vec2 vf = normalize(vec2(-vw.x, -vw.z) + 1e-5);
  float sheen = (2.0 * chk - 1.0) * (0.055 + 0.05 * dot(vf, e1) * (2.0 * su - 1.0));
  float gp = fFbm(p * 0.22, fp * 0.22) * 0.22 + fFbm(p * 2.3, fp * 2.3) * 0.12 + fFbm(p * 21.0, fp * 21.0) * 0.16;
  /* 잎결 — 깎은 방향으로 늘인 잔 무늬(가까이서만 보인다, 줄마다 방향이 바뀜) */
  vec2 bd = mix(vec2(u, v), vec2(v, u), su);
  float blade = fFbm(vec2(bd.x * 38.0, bd.y * 5.0), fp * 38.0);
  vec3 grass = fLin(vec3(0.29, 0.52, 0.21)) * (1.0 + sheen) * (1.0 + gp) * (1.0 + blade * 0.5);
  vec3 rough = fLin(vec3(0.27, 0.43, 0.19)) * (1.0 + gp * 1.4);

  /* 내야 흙 — 투수판 앞에서 반지름 28.96m 호, 파울선 3° 밖까지 */
  float sdArc = length(p - vec2(18.44, 0.0)) - 28.96;
  const float W = 0.8377580410; /* 48° */
  float sdWedge = max(dot(p, vec2(-sin(W), cos(W))), dot(p, vec2(-sin(W), -cos(W))));
  float dirtA = fCover(max(sdArc, sdWedge), aa);
  /* 안쪽 잔디 — 베이스 사이 정사각형을 0.91m 안으로, 홈 · 베이스 둘레 흙(3.96m) · 마운드(2.74m)는 뺌 */
  float sq = fBox(vec2(u, v) - vec2(13.715), vec2(13.715 - 0.914));
  float cut = min(
    min(length(p - vec2(0.2159, 0.0)), length(vec2(u, v) - vec2(27.43, 0.0))),
    min(length(vec2(u, v) - vec2(0.0, 27.43)), length(vec2(u, v) - vec2(27.43, 27.43)))
  ) - 3.962;
  float moundSd = length(p - vec2(17.983, 0.0)) - 2.743;
  float cutM = fCover(min(cut, moundSd), aa);
  float grassIn = fCover(sq, aa) * (1.0 - cutM);
  float dirtM = max(dirtA * (1.0 - grassIn), cutM);
  /* 흙 테두리(잔디 경계 0.3m 안은 고르게 다진 진한 흙) */
  float edge = min(abs(sq), abs(max(sdArc, sdWedge)));
  edge = min(edge, abs(min(cut, moundSd)));
  float lip = 1.0 - smoothstep(0.05, 0.35, edge);
  /* 진한 흙: 타석 · 포수석 · 마운드 위 · 착지 자리 */
  float boxes = min(fBox(vec2(p.x - 0.2157, abs(p.y) - 0.978), vec2(0.95, 0.66)), fBox(p - vec2(-1.92, 0.0), vec2(1.25, 0.6)));
  float clay = max(fCover(boxes, 0.25), fCover(moundSd + 0.6, 0.4) * 0.7);
  clay = max(clay, fCover(length(p - vec2(16.9, -0.15)) - 0.8, 0.35));
  float dp = fFbm(p * 0.7, fp * 0.7) * 0.18 + fFbm(p * 9.0, fp * 9.0) * 0.16 + fFbm(p * 60.0, fp * 60.0) * 0.22;
  /* 잔돌 — 가까이서만 */
  vec2 pc = floor(p * 45.0);
  vec2 pf = fract(p * 45.0) - 0.5 - (vec2(fHash(pc + 7.3), fHash(pc + 1.9)) - 0.5) * 0.4;
  float peb = step(0.982, fHash(pc)) * (1.0 - smoothstep(0.18, 0.3, length(pf))) * (1.0 - smoothstep(0.004, 0.02, fp)) * (fHash(pc + 3.1) - 0.45);
  vec3 dirt = mix(fLin(vec3(0.66, 0.40, 0.24)), fLin(vec3(0.52, 0.30, 0.18)), clamp(clay * 0.9 + lip * 0.35, 0.0, 1.0)) * (1.0 + dp * 1.4 + peb * 0.7);

  /* 경고 트랙 · 펜스 밖 */
  float fr = 100.0 + 22.0 * cos(2.0 * clamp(th, -Q, Q));
  float sd45 = max(dot(p, vec2(-sin(Q), cos(Q))), dot(p, vec2(-sin(Q), -cos(Q))));
  float trackM = fCover(max(max(d - fr, fr - 4.572 - d), sd45), aa);
  float outM = fCover(max(fr - d, sd45), aa);
  vec3 track = fLin(vec3(0.50, 0.34, 0.24)) * (1.0 + fFbm(p * 14.0, fp * 14.0) * 0.35);

  /* 분필선 — 파울선 10cm, 타석 · 포수석 · 1루 주로선 7.6cm */
  float hw = 0.0508;
  float tw = 0.0381;
  float line = max(abs(perp1) - hw, max(-u, u - 100.0));
  line = min(line, max(abs(perp3) - hw, max(-v, v - 100.0)));
  line = min(line, abs(fBox(vec2(p.x - 0.2157, p.y - 0.978), vec2(0.915, 0.61))) - tw);
  line = min(line, abs(fBox(vec2(p.x - 0.2157, p.y + 0.978), vec2(0.915, 0.61))) - tw);
  line = min(line, fBox(vec2(p.x + 1.92, abs(p.y) - 0.546), vec2(1.22, tw)));
  line = min(line, fBox(p - vec2(-3.14, 0.0), vec2(tw, 0.546)));
  line = min(line, fBox(vec2(u - 20.57, perp1 - 0.914), vec2(6.86, tw)));
  line = min(line, fBox(vec2(u - 13.715, perp1 - 0.457), vec2(tw, 0.457)));
  float lineM = fCover(line, aa) * (0.82 + 0.18 * (1.0 - smoothstep(0.0, 0.05, fp)));
  vec3 chalk = fLin(vec3(0.93, 0.93, 0.90)) * (1.0 + fFbm(p * 40.0, fp * 40.0) * 0.15);

  /* 홈플레이트 — 흰 고무, 둘레 1.2cm 는 짙게 */
  float plate = max(max(-p.x, p.x - 0.4314), max(abs(p.y) - 0.2159, (abs(p.y) - p.x) * 0.7071067812));
  float plateM = fCover(plate, aa * 0.6);
  float plateIn = fCover(plate + 0.012, aa * 0.6);

  /* 흙 · 트랙과 닿는 잔디 끝은 살짝 그늘(잔디가 흙보다 조금 높다) */
  grass *= 1.0 - 0.18 * (1.0 - smoothstep(0.0, 0.18, edge)) * (1.0 - dirtM);
  vec3 col = grass;
  fieldRough = 0.88;
  col = mix(col, rough, outM);
  col = mix(col, track, trackM);
  col = mix(col, dirt, dirtM);
  fieldRough = mix(fieldRough, 1.0, max(dirtM, trackM));
  col = mix(col, chalk, lineM);
  col = mix(col, fLin(vec3(0.18)), plateM);
  col = mix(col, fLin(vec3(0.95, 0.95, 0.93)), plateIn);
  fieldRough = mix(fieldRough, 0.6, plateIn);
  fieldCol = col;
}
`;

/* ───────────── 하늘 — 큰 공 안쪽, 지평 → 하늘 꼭대기 · 해 둘레 빛 · 밤엔 별 ───────────── */
const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vDir = wp.xyz - cameraPosition;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;
const SKY_FRAG = /* glsl */ `
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uGround;
uniform vec3 uSunDir;
uniform vec3 uSunCol;
uniform float uStars;
varying vec3 vDir;
float sHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.42));
  col = mix(col, uGround, smoothstep(0.0, -0.06, h));
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunCol * (pow(sd, 1600.0) * 18.0 + pow(sd, 90.0) * 0.6 + pow(sd, 8.0) * 0.12);
  if (uStars > 0.0 && h > 0.05) {
    vec3 c = floor(d * 380.0);
    float s = sHash(c);
    col += vec3(step(0.9975, s) * uStars * (0.4 + 0.6 * fract(s * 91.0)) * smoothstep(0.05, 0.3, h));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const PALETTE = {
  day: {
    zenith: '#2f6fc0',
    horizon: '#c9dcec',
    ground: '#7d8a6a',
    sunCol: '#fff3d6',
    stars: 0,
    sun: 2.4,
    hemi: 0.25,
    env: 0.55,
    lamps: 0,
    exposure: 0.95,
  },
  night: {
    zenith: '#020409',
    horizon: '#141c30',
    ground: '#0b0e14',
    sunCol: '#000000',
    stars: 1,
    sun: 0.08,
    hemi: 0.12,
    env: 0.12,
    lamps: 0.75,
    exposure: 1.05,
  },
};

/** 마운드 면 — 가운데에서 둘레까지 고리 40 · 둘레 120 칸, 높이는 f(규격 높이 함수) */
function moundGeometry(
  THREE: typeof import('three'),
  f: (x: number, z: number) => number,
  cx: number,
  cz: number,
  R: number
): Three.BufferGeometry {
  const rings = 40;
  const segs = 120;
  const lift = 0.002;
  const pos: number[] = [cx, f(cx, cz) + lift, cz];
  for (let i = 1; i <= rings; i++) {
    const r = (R * i) / rings;
    for (let j = 0; j < segs; j++) {
      const a = (j / segs) * Math.PI * 2;
      const x = cx + r * Math.cos(a);
      const z = cz + r * Math.sin(a);
      pos.push(x, f(x, z) + lift, z);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < segs; j++) idx.push(0, 1 + ((j + 1) % segs), 1 + j);
  for (let i = 1; i < rings; i++) {
    const a0 = 1 + (i - 1) * segs;
    const a1 = 1 + i * segs;
    for (let j = 0; j < segs; j++) {
      const j1 = (j + 1) % segs;
      idx.push(a0 + j, a0 + j1, a1 + j, a0 + j1, a1 + j1, a1 + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * 무대를 장면에 놓는다. center = 움직임 상자 가운데(카메라가 보는 곳), heightM = 투수 키(m).
 * 돌려준 setMode 로 낮 · 밤을 바꾼다(땅 · 담장은 그대로, 하늘 · 빛 · 환경광만).
 */
export function buildStage({
  THREE,
  scene,
  renderer,
  track,
  center,
  heightM,
  mode = 'day',
}: {
  THREE: typeof import('three');
  scene: Three.Scene;
  renderer: Three.WebGLRenderer;
  track: Pick<DisplayTrack, 'groundAt' | 'mound'>;
  center: Vec3;
  heightM: number;
  mode?: StageMode;
}): StageHandle {
  const s = 1 / heightM;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  /* 자리: 투수판 앞 모서리(x0, z0) → 홈 뒤 꼭짓점 H. at(d, θ) = 홈에서 d m · 가운데 선에서 θ(1루 쪽 +), fg(a, b) = (가운데 쪽 a, 1루 쪽 b) m */
  const { groundAt, mound } = track;
  const x0 = mound ? mound.x0 : center[0] - 0.4;
  const z0 = mound ? mound.z0 : center[2];
  const H = { x: x0 + RUBBER_TO_PLATE * s, z: z0 };
  const at = (d: number, th: number, y = 0) => V(H.x - d * s * Math.cos(th), y, H.z - d * s * Math.sin(th));
  const fg = (a: number, b: number, y = 0) => V(H.x - a * s, y, H.z - b * s);
  const Q = Math.PI / 4;

  /* ── 땅: 판 하나 + 마운드, 같은 재질 ── */
  const fieldMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, metalness: 0 });
  fieldMat.onBeforeCompile = (sh) => {
    sh.uniforms.uHome = { value: new THREE.Vector2(H.x, H.z) };
    sh.uniforms.uS = { value: s };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFieldPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFieldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FIELD_GLSL}`)
      .replace('#include <map_fragment>', '#include <map_fragment>\nfield(vFieldPos, cameraPosition);\ndiffuseColor.rgb = fieldCol;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = fieldRough;');
  };
  const groundGeo = new THREE.CircleGeometry(GROUND_R * s, 160);
  groundGeo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(groundGeo, fieldMat);
  ground.position.set(H.x - 50 * s, 0, H.z);
  ground.receiveShadow = true;
  scene.add(ground);
  if (mound) {
    const m = new THREE.Mesh(
      moundGeometry(THREE, groundAt, mound.x0 + MOUND.centerAhead * s, mound.z0, MOUND.radius * s),
      fieldMat
    );
    m.receiveShadow = true;
    scene.add(m);
    /* 투수판 — 흰 고무 61 × 15cm, 마운드 위로 살짝 */
    const rubber = new THREE.Mesh(
      new THREE.BoxGeometry(MOUND.rubber.depth * s, 0.03 * s, MOUND.rubber.width * s),
      new THREE.MeshStandardMaterial({ color: '#f2f0ea', roughness: 0.55 })
    );
    rubber.position.set(mound.x0 - (MOUND.rubber.depth * s) / 2, groundAt(mound.x0, mound.z0) + 0.005 * s, mound.z0);
    rubber.receiveShadow = true;
    scene.add(rubber);
  }

  /*
   * 베이스 — 38cm 흰 방석(아래 6cm + 조금 작은 위판으로 모서리가 둥글어 보이게). 1 · 3루는 파울선 · 다음 베이스 선 안쪽 모서리가
   * 베이스 자리(방석 전체가 페어 지역), 2루는 가운데가 베이스 자리.
   */
  const bagMat = new THREE.MeshStandardMaterial({ color: '#f5f4ef', roughness: 0.7 });
  const bagLow = new THREE.BoxGeometry(0.381 * s, 0.06 * s, 0.381 * s);
  const bagTop = new THREE.BoxGeometry(0.36 * s, 0.025 * s, 0.36 * s);
  const half = 0.1905 * Math.SQRT2;
  for (const [a, b] of [
    [19.396, 19.396 - half],
    [38.795, 0],
    [19.396, -19.396 + half],
  ]) {
    const g = new THREE.Group();
    const lo = new THREE.Mesh(bagLow, bagMat);
    lo.position.y = 0.03 * s;
    const hi = new THREE.Mesh(bagTop, bagMat);
    hi.position.y = 0.0725 * s;
    g.add(lo, hi);
    g.position.copy(fg(a, b));
    g.rotation.y = Q;
    g.traverse((o) => {
      o.castShadow = true;
      o.receiveShadow = true;
    });
    scene.add(g);
  }

  /* ── 담장: 3루 폴 → 3루 쪽 파울 담장 → 백스톱 호 → 1루 쪽 → 1루 폴 → 외야 펜스 ── */
  const loop: { p: Three.Vector3; wall: number }[] = [];
  const foulOff = (a: number) => 18 * Math.min(1, Math.max(0, (FENCE_LINE - a) / 25));
  const along = (a: number, th: number, off: number) => {
    const n = th > 0 ? Q * 3 : -Q * 3;
    const p = at(a, th);
    return V(p.x - off * s * Math.cos(n), 0, p.z - off * s * Math.sin(n));
  };
  for (let a = FENCE_LINE; a >= 0; a -= 4) loop.push({ p: along(a, -Q, foulOff(a)), wall: FOUL_WALL_H });
  for (let i = 1; i < 32; i++) loop.push({ p: at(BACKSTOP, -3 * Q - (2 * Q * i) / 32), wall: FOUL_WALL_H * 2.2 });
  for (let a = 0; a <= FENCE_LINE; a += 4) loop.push({ p: along(a, Q, foulOff(a)), wall: FOUL_WALL_H });
  const fenceR = (th: number) => FENCE_LINE + (FENCE_CENTER - FENCE_LINE) * Math.cos(2 * th);
  for (let i = 1; i < 90; i++) {
    const th = Q - (2 * Q * i) / 90;
    loop.push({ p: at(fenceR(th), th), wall: FENCE_H });
  }
  {
    const N = loop.length;
    const pad: number[] = [];
    const cap: number[] = [];
    const idx: number[] = [];
    for (let i = 0; i <= N; i++) {
      const e = loop[i % N];
      pad.push(e.p.x, 0, e.p.z, e.p.x, e.wall * s, e.p.z);
      cap.push(e.p.x, e.wall * s, e.p.z, e.p.x, (e.wall + 0.12) * s, e.p.z);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
    }
    const mk = (p: number[], color: string, rough: number) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: rough, side: THREE.DoubleSide }));
      m.receiveShadow = true;
      scene.add(m);
    };
    mk(pad, '#2d6342', 0.7);
    mk(cap, '#f2c230', 0.6);
  }
  for (const th of [Q, -Q]) {
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1 * s, 0.12 * s, 24 * s, 12),
      new THREE.MeshStandardMaterial({ color: '#f2c230', roughness: 0.45 })
    );
    pole.position.copy(at(FENCE_LINE + 0.4, th, 12 * s));
    scene.add(pole);
  }

  /* ── 하늘 · 빛 ── */
  const sunDir = V(0.55, 0.62, 0.42).normalize(); // 홈 · 3루 쪽 위 — 우투 옆 카메라(3루 쪽)에서 몸 앞이 밝다
  const skyUniforms = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uGround: { value: new THREE.Color() },
    uSunDir: { value: sunDir.clone() },
    uSunCol: { value: new THREE.Color() },
    uStars: { value: 0 },
  };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: skyUniforms,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(SKY_R * s, 48, 24), skyMat);
  sky.position.set(H.x - 50 * s, 0, H.z);
  sky.renderOrder = -1;
  scene.add(sky);
  /* 환경광(하늘이 둘러 비춤) — 하늘을 작은 공으로 따로 구워 쓴다 */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), skyMat));
  let envRT: Three.WebGLRenderTarget | null = null;

  const hemi = new THREE.HemisphereLight('#dfeaf7', '#5b6b45', 1);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#fff4de', 1);
  sun.position.set(center[0] + sunDir.x * 6, center[1] + sunDir.y * 6, center[2] + sunDir.z * 6);
  sun.target.position.set(center[0], center[1] * 0.5, center[2]);
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -2.6, right: 2.6, top: 2.6, bottom: -2.6, near: 0.5, far: 16 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target);
  /* 밤 조명 — 경기장 네 모서리 높은 곳에서 */
  const lamps = (
    [
      [40, 2.2],
      [40, -2.2],
      [110, 0.9],
      [110, -0.9],
    ] as [number, number][]
  ).map(([d, th]) => {
    const L = new THREE.DirectionalLight('#eef3ff', 0);
    L.position.copy(at(d, th, 45 * s));
    L.target.position.copy(at(30, 0));
    scene.add(L, L.target);
    return L;
  });
  scene.fog = new THREE.Fog('#ffffff', 140 * s, 520 * s);

  /* 축 화살표(빨강 홈 · 파랑 위 · 하늘 옆) — 분석용 */
  const corner0 = new THREE.Vector3(center[0] - 1.7, 0.004, center[2] - 1.7);
  for (const [dir, color] of [
    [[1, 0, 0], '#ef4444'],
    [[0, 1, 0], '#3b82f6'],
    [[0, 0, 1], '#38bdf8'],
  ] as [[number, number, number], string][])
    scene.add(new THREE.ArrowHelper(new THREE.Vector3(...dir), corner0, 0.35, color, 0.08, 0.04));

  const setMode = (m: StageMode) => {
    const P = PALETTE[m];
    skyUniforms.uZenith.value.set(P.zenith);
    skyUniforms.uHorizon.value.set(P.horizon);
    skyUniforms.uGround.value.set(P.ground);
    skyUniforms.uSunCol.value.set(P.sunCol);
    skyUniforms.uStars.value = P.stars;
    envRT?.dispose();
    envRT = pmrem.fromScene(envScene, 0.04);
    scene.environment = envRT.texture;
    scene.environmentIntensity = P.env;
    scene.background = new THREE.Color(P.horizon);
    renderer.setClearColor(P.horizon);
    (scene.fog as Three.Fog).color.set(P.horizon);
    hemi.intensity = P.hemi;
    sun.intensity = P.sun;
    sun.castShadow = m === 'day';
    for (const L of lamps) L.intensity = P.lamps;
    renderer.toneMappingExposure = P.exposure;
  };
  setMode(mode);

  return { cameraNear: 0.03, cameraFar: (SKY_R + 120) * s, setMode };
}
