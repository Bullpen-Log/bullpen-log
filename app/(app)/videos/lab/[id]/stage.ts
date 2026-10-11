import type * as Three from 'three';
import type { Vec3 } from '@/lib/pitch-3d/linalg';
import type { DisplayTrack } from '@/lib/pitch-3d/v2/display';
import { MOUND } from '@/lib/pitch-3d/v2/pose-rig';
import { buildStadium, buildSurroundings, fenceDist, wallHeight, WALL_BLUE } from './stadium';

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
  /** 늦게 오는 것(하늘 사진)이 도착하면 부른다 — 보는 쪽이 한 번 더 그리게 */
  onChange?: () => void;
};

const RUBBER_TO_PLATE = 18.44;
const GROUND_R = 420;
const SKY_R = 600;

/* ───────────── 땅 재질(MeshStandardMaterial 에 끼움) — 미터 좌표 p = (가운데 쪽 a, 1루 쪽 b), 홈 뒤 꼭짓점이 원점 ───────────── */
const FIELD_GLSL = /* glsl */ `
uniform vec2 uHome;
uniform float uS;
uniform float uNight;
uniform sampler2D uGrassTex;
uniform sampler2D uDirtTex;
uniform float uTexOn;
uniform sampler2D uGrassN;
uniform sampler2D uDirtN;
varying vec3 vFieldPos;
vec3 fieldCol;
float fieldRough;
/* 땅 높이 굴곡(m) — 잔디결 · 흙 알갱이 · 갈퀴 자국 · 잔디 턱. 노멀을 이것의 화면 미분으로 기울여 해를 받으면 오돌토돌하게 보인다 */
float fieldH;
/* 표면 굴곡 노멀(접선 공간, 경기장 좌표 p 방향) — 잔디결 · 흙 알갱이 사진 노멀 맵(Grass005 · baseball_playground, CC0) */
vec3 fieldN;
/* 잔디 자리(1) — 흙 · 트랙 · 선 · 주차장은 0. 3D 잔디 잎(셸)이 이 자리에만 돋는다 */
float fieldGrassW;

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
/*
 * 사진 질감의 잔결만 쓴다 — 두 크기 · 두 방향으로 겹쳐 되풀이가 안 보이게 하고, 사진 평균색으로 나눠 밝기 1 근처의 무늬로 만든다(색은 위에서 정한 색).
 * 잔디 Grass005(ambientCG, CC0) 1.25m 한 장, 흙 baseball_playground(Poly Haven, CC0 — 실제 야구장 내야) 3m 한 장.
 */
vec3 fGrassTex(vec2 p) {
  vec3 a = texture2D(uGrassTex, p * 0.8).rgb;
  vec3 b = texture2D(uGrassTex, mat2(0.8, -0.6, 0.6, 0.8) * p * 0.31 + 0.37).rgb;
  vec3 t = mix(a, b, 0.45);
  return mix(vec3(dot(t, vec3(0.2126, 0.7152, 0.0722)) / 0.194), t / vec3(0.127, 0.231, 0.022), 0.25);
}
/* 두 크기로 겹친 노멀 — 돌린 쪽은 기울기를 p 좌표로 되돌린다(q = M p → n_p = Mᵀ n_q) */
vec3 fGrassN(vec2 p) {
  vec3 a = texture2D(uGrassN, p * 0.8).rgb * 2.0 - 1.0;
  vec3 b = texture2D(uGrassN, mat2(0.8, -0.6, 0.6, 0.8) * p * 0.31 + 0.37).rgb * 2.0 - 1.0;
  b.xy = vec2(0.8 * b.x - 0.6 * b.y, 0.6 * b.x + 0.8 * b.y);
  return normalize(mix(a, b, 0.45));
}
vec3 fDirtN(vec2 p) {
  vec3 a = texture2D(uDirtN, p / 3.0).rgb * 2.0 - 1.0;
  vec3 b = texture2D(uDirtN, mat2(0.6, 0.8, -0.8, 0.6) * p / 7.1 + 0.21).rgb * 2.0 - 1.0;
  b.xy = vec2(0.6 * b.x + 0.8 * b.y, -0.8 * b.x + 0.6 * b.y);
  float k = smoothstep(0.3, 0.7, fNoise(p * 0.07));
  return normalize(mix(a, b, k));
}
vec3 fDirtTex(vec2 p) {
  vec3 a = texture2D(uDirtTex, p / 3.0).rgb;
  vec3 b = texture2D(uDirtTex, mat2(0.6, 0.8, -0.8, 0.6) * p / 7.1 + 0.21).rgb;
  float k = smoothstep(0.3, 0.7, fNoise(p * 0.07));
  vec3 t = mix(a, b, k);
  return mix(vec3(dot(t, vec3(0.2126, 0.7152, 0.0722)) / 0.187), t / vec3(0.250, 0.176, 0.114), 0.4);
}

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
  float perp3 = dot(p, vec2(0.7071067812, 0.7071067812));  /* 3루 선에서 페어 쪽 + (부호가 1루와 반대) */

  /*
   * 잔디 깎은 무늬(다저스 사진) — 외야 · 파울 지역은 가운데 선에 수직인 4.57m 띠, 내야(베이스 사이)는 베이스 선을 따른 격자.
   * 띠마다 깎은 방향이 반대라 잎이 눕는 쪽이 다르다 — 깎은 방향으로 보면 밝고 거슬러 보면 어둡다(뒤에서 보면 줄 밝기가 뒤집힌다).
   */
  float band = 4.572;
  float sx = smoothstep(-0.1, 0.1, sin(p.x * 3.14159265 / band));
  float su = smoothstep(-0.1, 0.1, sin(u * 3.14159265 / band));
  float sv = smoothstep(-0.1, 0.1, sin(v * 3.14159265 / band));
  float chk = su * sv + (1.0 - su) * (1.0 - sv);
  vec2 camF = vec2(uHome.x - cam.x, uHome.y - cam.z) / uS;
  vec2 vd = normalize(p - camF + 1e-5);
  float sheenOut = 0.16 * dot(vd, vec2(2.0 * sx - 1.0, 0.0)) + 0.035 * (2.0 * sx - 1.0);
  float sheenIn = 0.08 * (dot(vd, (2.0 * su - 1.0) * e1) + dot(vd, (2.0 * sv - 1.0) * e3)) + 0.035 * (2.0 * chk - 1.0);
  float inSq = fCover(fBox(vec2(u, v) - vec2(13.715), vec2(13.715)), aa);
  float sheen = mix(sheenOut, sheenIn, inSq);
  float gp = fFbm(p * 0.22, fp * 0.22) * 0.2 + fFbm(p * 2.3, fp * 2.3) * 0.1 + fFbm(p * 21.0, fp * 21.0) * 0.16;
  /* 잎결 — 깎은 방향으로 늘인 잔 무늬(가까이서만 보인다) */
  vec2 bd = mix(vec2(p.x, p.y), mix(vec2(u, v), vec2(v, u), su), inSq);
  float blade = fFbm(vec2(bd.x * 38.0, bd.y * 5.0), fp * 38.0);
  vec3 grass = fLin(vec3(0.27, 0.49, 0.16)) * (1.0 + sheen) * (1.0 + gp);
  vec3 gTex = fGrassTex(p);
  grass *= mix(vec3(1.0 + blade * 0.5), mix(vec3(1.0), gTex, 0.85), uTexOn);
  /* 닳은 잔디 — 수비 자리(좌 · 중 · 우익수, 1 · 2루수)와 잔디 가장자리에 옅게 누렇다 */
  float wear = 0.0;
  wear = max(wear, 1.0 - smoothstep(1.5, 6.0, length(p - vec2(88.0, -32.0))));
  wear = max(wear, 1.0 - smoothstep(1.5, 6.0, length(p - vec2(98.0, 0.0))));
  wear = max(wear, 1.0 - smoothstep(1.5, 6.0, length(p - vec2(88.0, 32.0))));
  wear = max(wear, 1.0 - smoothstep(1.0, 4.0, length(p - vec2(36.0, 16.0))));
  wear = max(wear, 1.0 - smoothstep(1.0, 4.0, length(p - vec2(36.0, -16.0))));
  wear *= 0.35 + 0.65 * smoothstep(0.35, 0.75, fNoise(p * 0.9) + fFbm(p * 4.0, fp * 4.0));
  grass = mix(grass, grass * vec3(1.35, 1.12, 0.75), wear * 0.55);
  float hGrass = (dot(gTex, vec3(0.333)) * 0.012 + blade * 0.006) * uTexOn + blade * 0.004;
  vec3 rough = fLin(vec3(0.26, 0.42, 0.18)) * (1.0 + gp * 1.4);

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
  /* 마운드 · 홈 둘레는 통째로 붉은 점토(사진) — 가장자리는 황토와 섞인다 */
  clay = max(clay, fCover(moundSd + 0.25, 0.45) * 0.85);
  clay = max(clay, fCover(length(p - vec2(0.2159, 0.0)) - 3.7, 0.4) * 0.7);
  float dp = fFbm(p * 0.7, fp * 0.7) * 0.18 + fFbm(p * 9.0, fp * 9.0) * 0.16 + fFbm(p * 60.0, fp * 60.0) * 0.22;
  /* 잔돌 — 가까이서만 */
  vec2 pc = floor(p * 45.0);
  vec2 pf = fract(p * 45.0) - 0.5 - (vec2(fHash(pc + 7.3), fHash(pc + 1.9)) - 0.5) * 0.4;
  float peb = step(0.982, fHash(pc)) * (1.0 - smoothstep(0.18, 0.3, length(pf))) * (1.0 - smoothstep(0.004, 0.02, fp)) * (fHash(pc + 3.1) - 0.45);
  /* 내야는 밝은 황토(사진), 마운드 · 타석 · 홈 둘레는 붉은 점토 */
  vec3 dirt = mix(fLin(vec3(0.77, 0.61, 0.46)), fLin(vec3(0.66, 0.42, 0.30)), clamp(clay * 0.95 + lip * 0.3, 0.0, 1.0));
  vec3 dTex = fDirtTex(p);
  dirt *= mix(vec3(1.0 + dp * 1.2 + peb * 0.7), (1.0 + dp * 0.6) * dTex, uTexOn);
  /* 갈퀴 자국 — 내야 흙을 고르며 끈 판의 줄(투수판 앞 중심 동심원, 0.42m 간격), 점토 자리는 없다 */
  float drag = sin(length(p - vec2(18.44, 0.0)) * 14.96) * (1.0 - smoothstep(0.02, 0.08, fp)) * (1.0 - clay);
  dirt *= 1.0 + drag * 0.035;
  /* 발 디딘 자리 — 투수판 앞 착지 자리 · 타석은 움푹하고 짙다 */
  float dig = max(fCover(length(p - vec2(16.9, -0.15)) - 0.55, 0.3), fCover(boxes + 0.25, 0.25) * 0.6);
  dirt *= 1.0 - 0.12 * dig;
  float hDirt = (dot(dTex, vec3(0.333)) * 0.009 + peb * 0.004) * uTexOn + drag * 0.0025 - dig * 0.03 + dp * 0.01;

  /* 경고 트랙 · 펜스 밖 — 펜스 거리는 stadium.ts fenceDist 와 같은 식 */
  float ft = min(1.0, abs(th) / Q);
  float fr = 122.0 - 40.2 * ft * ft + 18.8 * ft * ft * ft;
  float sd45 = max(dot(p, vec2(-sin(Q), cos(Q))), dot(p, vec2(-sin(Q), -cos(Q))));
  float trackM = fCover(max(max(d - fr, fr - 4.572 - d), sd45), aa);
  float outM = fCover(max(fr - d, sd45), aa);
  /* 경고 트랙 — 붉은 벽돌빛 */
  vec3 track = fLin(vec3(0.57, 0.33, 0.25)) * (1.0 + fFbm(p * 0.8, fp * 0.8) * 0.12);
  track *= mix(vec3(1.0 + fFbm(p * 14.0, fp * 14.0) * 0.3), mix(vec3(1.0), fDirtTex(p * 1.3), 0.7), uTexOn);
  /* 주차장(아스팔트) — 외야석 뒤, 파울 지역 밖(관중석 밑 · 뒤). 파울 지역 폭은 stadium.ts foulOff 와 같은 식 */
  float alongF = p.y > 0.0 ? u : v;
  float perpF = p.y > 0.0 ? perp1 : -perp3;
  float foulW = 1.0 + 15.8 * (1.0 - smoothstep(42.0, 100.6, alongF));
  float foulSd = alongF > 0.0 ? perpF - foulW : d - 16.8;
  float lotM = max(fCover(max(fr + 27.0 - d, sd45), aa), fCover(max(-foulSd, -sd45), aa));
  /* 파울 지역도 관중석 벽 앞 4.5m 는 트랙(사진: 트랙이 구장을 한 바퀴 두른다) */
  trackM = max(trackM, fCover(max(max(-foulSd - 4.5, foulSd), -sd45), aa));
  /* 주차 칸 — 2.7m 마다 흰 줄, 16m 마다 칸 두 줄 + 통로 */
  vec2 lp = vec2(p.x, abs(p.y));
  float sdl = (0.5 - abs(fract(lp.y / 2.7) - 0.5)) * 2.7 - 0.06;
  float stripe = fCover(max(sdl, abs(fract(lp.x / 16.0) - 0.5) * 16.0 - 5.5), aa);
  vec3 asphalt = fLin(vec3(0.33, 0.33, 0.34)) * (1.0 + fFbm(p * 3.0, fp * 3.0) * 0.25 + fFbm(p * 40.0, fp * 40.0) * 0.15);
  asphalt = mix(asphalt, fLin(vec3(0.85, 0.85, 0.82)), stripe * (1.0 - smoothstep(0.02, 0.2, fp)) * 0.8);

  /* 분필선 — 파울선 10cm, 타석 · 포수석 · 1루 주로선 7.6cm */
  float hw = 0.0508;
  float tw = 0.0381;
  float line = max(abs(perp1) - hw, max(-u, u - 100.6));
  line = min(line, max(abs(perp3) - hw, max(-v, v - 100.6)));
  line = min(line, abs(fBox(vec2(p.x - 0.2157, p.y - 0.978), vec2(0.915, 0.61))) - tw);
  line = min(line, abs(fBox(vec2(p.x - 0.2157, p.y + 0.978), vec2(0.915, 0.61))) - tw);
  line = min(line, fBox(vec2(p.x + 1.92, abs(p.y) - 0.546), vec2(1.22, tw)));
  line = min(line, fBox(p - vec2(-3.14, 0.0), vec2(tw, 0.546)));
  line = min(line, fBox(vec2(u - 20.57, perp1 - 0.914), vec2(6.86, tw)));
  line = min(line, fBox(vec2(u - 13.715, perp1 - 0.457), vec2(tw, 0.457)));
  /* 코치 박스(1 · 3루 옆, 파울선에서 4.57m 밖 · 6.1 × 3.05m — 열린 쪽은 그라운드 쪽) */
  line = min(line, abs(fBox(vec2(u - 24.4, perp1 - 6.1), vec2(3.05, 1.52))) - tw);
  line = min(line, abs(fBox(vec2(v - 24.4, -perp3 - 6.1), vec2(3.05, 1.52))) - tw);
  float lineM = fCover(line, aa) * (0.82 + 0.18 * (1.0 - smoothstep(0.0, 0.05, fp)));
  /* 대기 원(지름 1.52m) — 홈과 더그아웃 사이, 흙 위 짙은 원 */
  float odc = min(length(vec2(u - 9.0, perp1 - 9.5)), length(vec2(v - 9.0, -perp3 - 9.5))) - 0.76;
  float odcM = fCover(odc, aa);
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
  col = mix(col, asphalt * (1.0 - 0.85 * uNight), lotM);
  col = mix(col, track, trackM);
  col = mix(col, dirt, dirtM);
  fieldRough = mix(fieldRough, 1.0, max(max(dirtM, trackM), lotM));
  col = mix(col, fLin(vec3(0.42, 0.26, 0.19)) * (1.0 + dp), odcM);
  col = mix(col, chalk, lineM);
  col = mix(col, fLin(vec3(0.18)), plateM);
  col = mix(col, fLin(vec3(0.95, 0.95, 0.93)), plateIn);
  fieldRough = mix(fieldRough, 0.6, plateIn);
  fieldCol = col;
  /* 잔디는 흙보다 2.5cm 높다(턱) — 경계에서 그늘 · 밝은 테가 생긴다 */
  fieldH = mix(hGrass + 0.025, hDirt, max(dirtM, trackM)) * (1.0 - lineM * 0.5) * (1.0 - lotM);
  /* 사진 노멀 — 잔디는 세게(잎결), 흙 · 트랙은 알갱이, 선 · 홈플레이트 · 주차장은 평평. 멀리서는 화소보다 잘아 반짝이니 줄인다 */
  float far = 1.0 - smoothstep(0.03, 0.12, fp);
  vec3 nG = fGrassN(p);
  vec3 nD = fDirtN(p * (trackM > 0.5 ? 1.3 : 1.0));
  float dW = max(dirtM, trackM);
  vec3 tn = mix(nG * vec3(1.25, 1.25, 1.0), nD * vec3(0.9, 0.9, 1.0), dW);
  float k = uTexOn * far * (1.0 - lineM) * (1.0 - plateM) * (1.0 - lotM);
  fieldN = normalize(mix(vec3(0.0, 0.0, 1.0), tn, k));
  fieldGrassW = (1.0 - max(dW, lotM)) * (1.0 - lineM) * (1.0 - plateM) * (1.0 - odcM);
}
`;

/* 3D 잔디 잎(셸) — 1.4cm 칸마다 잎 하나, 키 · 자리 · 굵기는 칸마다 다르고 위로 갈수록 가늘고 밝다(뿌리는 그늘) */
const SHELL_GLSL = /* glsl */ `
#ifdef SHELL
{
  vec2 sp = vec2(uHome.x - vFieldPos.x, uHome.y - vFieldPos.z) / uS;
  float spx = length(fwidth(sp));
  if (fieldGrassW < 0.6 || spx > 0.012) discard;
  vec2 q = sp * 70.0;
  vec2 c = floor(q);
  float lean = (fHash(c + 5.3) - 0.5) * 0.6 * uShellH;
  vec2 f = fract(q) - 0.5 - vec2(lean, lean * 0.5);
  float r = fHash(c);
  vec2 off = (vec2(fHash(c + 3.7), fHash(c + 9.1)) - 0.5) * 0.5;
  float hgt = 0.5 + 0.5 * r;
  if (uShellH > hgt) discard;
  float wdt = 0.45 * (1.0 - uShellH / hgt) + 0.04;
  if (length(f - off) > wdt) discard;
  diffuseColor.rgb *= 0.72 + 0.45 * uShellH * (0.8 + 0.4 * fHash(c + 1.1));
}
#endif
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
uniform vec3 uMtn;
uniform vec2 uCf;
uniform float uClouds;
uniform sampler2D uSky;
uniform float uSkyOn;
uniform float uSkyOff;
varying vec3 vDir;
float sHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float cHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float cNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(cHash(i), cHash(i + vec2(1.0, 0.0)), u.x), mix(cHash(i + vec2(0.0, 1.0)), cHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float cFbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * cNoise(p); p = p * 2.07 + vec2(5.3, 1.7); a *= 0.5; }
  return s;
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 col = mix(uHorizon, uZenith, pow(clamp(h, 0.0, 1.0), 0.42));
  col = mix(col, uGround, smoothstep(0.0, -0.06, h));
  /* 먼 산(샌게이브리얼 산맥) — 가운데 쪽(외야 너머)에 높게, 나머지는 낮은 언덕 줄. 두 겹(먼 것은 옅게) */
  vec2 dz = normalize(d.xz + 1e-5);
  float az = atan(dz.x * uCf.y - dz.y * uCf.x, dot(dz, uCf));
  float env = smoothstep(2.2, 0.5, abs(az));
  float r1 = 0.5 * sin(az * 3.1 + 1.3) + 0.3 * sin(az * 7.7 + 0.4) + 0.15 * sin(az * 19.0 + 2.1) + 0.07 * sin(az * 47.0 + 0.7);
  float r2 = 0.5 * sin(az * 5.3 + 4.1) + 0.3 * sin(az * 13.0 + 1.9) + 0.12 * sin(az * 31.0 + 3.3);
  float far = 0.015 + env * (0.085 + 0.035 * r1);
  float near = 0.008 + env * (0.045 + 0.02 * r2) + 0.01 * (0.5 + 0.5 * sin(az * 2.0));
  float aaH = 0.0015;
  float mFar = smoothstep(far + aaH, far - aaH, h) * step(-0.02, h);
  float mNear = smoothstep(near + aaH, near - aaH, h) * step(-0.02, h);
  vec3 farCol = mix(uHorizon, uMtn, 0.45 + 0.3 * clamp((far - h) / 0.05, 0.0, 1.0));
  vec3 nearCol = mix(uHorizon, uMtn, 0.75);
  col = mix(col, farCol, mFar);
  col = mix(col, nearCol, mNear);
  /* 낮 하늘 사진(지평 위 반구, 가로 = 방위 · 세로 = 높이각) — 해 자리를 무대의 해 방향에 맞춰 돌린다 */
  if (uSkyOn > 0.0 && h > -0.01) {
    float u = fract(atan(d.z, d.x) * 0.1591549431 + uSkyOff);
    float v = asin(clamp(h, 0.0, 1.0)) / 1.5707963268;
    vec3 photo = texture2D(uSky, vec2(u, v)).rgb;
    col = mix(col, photo, uSkyOn * smoothstep(-0.004, 0.025, h));
  }
  /* 옅은 구름 — 하늘 높은 판(높이에 반비례해 늘인 무늬), 지평 가까이는 엷게 */
  if (uClouds > 0.0 && h > 0.0) {
    vec2 cp = d.xz / (h + 0.12) * 1.6;
    float n = cFbm(cp + vec2(3.1, 0.0)) * 0.7 + cFbm(cp * vec2(3.0, 0.8) + 11.0) * 0.3;
    float cover = smoothstep(0.52, 0.78, n) * smoothstep(0.02, 0.25, h) * uClouds;
    col = mix(col, mix(uHorizon, vec3(1.0, 0.99, 0.97), 0.75), cover * 0.85);
  }
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  col += uSunCol * (pow(sd, 1600.0) * 18.0 + pow(sd, 90.0) * 0.6 + pow(sd, 8.0) * 0.12);
  /* 별 — 칸마다 하나를 작은 점으로(도시 불빛에 많이는 안 보인다) */
  if (uStars > 0.0 && h > 0.05 && mFar < 0.5) {
    vec3 q = d * 420.0;
    vec3 c = floor(q);
    float s = sHash(c);
    float r = length(fract(q) - 0.5);
    col += vec3(step(0.9982, s) * (1.0 - smoothstep(0.08, 0.22, r)) * uStars * (0.35 + 0.65 * fract(s * 91.0)) * smoothstep(0.08, 0.4, h));
  }
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

const PALETTE = {
  day: {
    zenith: '#2f6fc0',
    horizon: '#d3dde8',
    ground: '#8a8a7a',
    mtn: '#5d6f86',
    sunCol: '#000000',
    stars: 0,
    clouds: 0,
    sun: 2.4,
    hemi: 0.3,
    env: 0.8,
    lamps: 0,
    exposure: 0.95,
  },
  night: {
    zenith: '#03050c',
    horizon: '#262535',
    ground: '#0b0e14',
    mtn: '#05070b',
    sunCol: '#000000',
    stars: 1,
    clouds: 0,
    sun: 0.08,
    hemi: 0.12,
    env: 0.12,
    lamps: 0.8,
    exposure: 1.1,
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

/** 육각 전광판 화면 — 이닝 점수판(숫자만, 로고 · 글자 없음). 짙은 남색 + 노란 이닝 + 흰 점수 + 볼 · 스트 · 아웃 */
function scoreboardTexture(THREE: typeof import('three')) {
  const cv = document.createElement('canvas');
  cv.width = 1024;
  cv.height = 472;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#061330';
  c.fillRect(0, 0, 1024, 472);
  const g = c.createLinearGradient(0, 0, 0, 472);
  g.addColorStop(0, 'rgba(60,110,200,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 1024, 472);
  c.fillStyle = '#0f2a58';
  for (let i = 0; i < 12; i++) for (let j = 0; j < 2; j++) c.fillRect(150 + i * 64, 170 + j * 104, 58, 96);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = '#ffcf4a';
  c.font = 'bold 64px system-ui, sans-serif';
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'R', 'H', 'E'].forEach((t, i) => c.fillText(t, 179 + i * 64, 120));
  c.fillStyle = '#f5f8fc';
  c.font = 'bold 76px system-ui, sans-serif';
  ['0', '0', '1', '0', '0', '0', '', '', '', '1', '4', '0'].forEach((t, i) => c.fillText(t, 179 + i * 64, 220));
  ['0', '2', '0', '0', '1', '', '', '', '', '3', '6', '1'].forEach((t, i) => c.fillText(t, 179 + i * 64, 324));
  (
    [
      [2, '#4ade80'],
      [1, '#f87171'],
      [1, '#fbbf24'],
    ] as [number, string][]
  ).forEach(([n, col], j) => {
    for (let k = 0; k < 3; k++) {
      c.fillStyle = k < n ? col : '#1d3560';
      c.beginPath();
      c.arc(330 + j * 180 + k * 44, 418, 17, 0, Math.PI * 2);
      c.fill();
    }
  });
  /* LED 화소 결 */
  c.fillStyle = 'rgba(0,0,0,0.28)';
  for (let x = 0; x < 1024; x += 4) c.fillRect(x, 0, 1, 472);
  for (let y = 0; y < 472; y += 4) c.fillRect(0, y, 1024, 1);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/**
 * 전광판 화면 uv — 압축 도구가 질감 없는 uv 를 지우고 두 화면을 한 메시로 합쳐서, 점마다 노멀로 판을 가려(묶음별) 가로 · 세로를 0~1 로 편다.
 */
function screenUv(THREE: typeof import('three'), g: Three.BufferGeometry, home: Three.Vector3) {
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const n = new THREE.Vector3();
  const p = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const keyOf = (i: number) => {
    n.fromBufferAttribute(nor, i).normalize();
    return `${Math.round(n.x * 4)},${Math.round(n.z * 4)}`;
  };
  const groups = new Map<string, { t: Three.Vector3; idx: number[] }>();
  for (let i = 0; i < pos.count; i++) {
    const k = keyOf(i);
    if (!groups.has(k)) groups.set(k, { t: new THREE.Vector3(), idx: [] });
    groups.get(k)!.idx.push(i);
  }
  /* 판마다 홈 쪽을 보는 노멀로 가로 방향을 정한다(내보낸 한 장짜리 면은 노멀이 어느 쪽일지 모른다) */
  for (const gr of groups.values()) {
    const c = new THREE.Vector3();
    for (const i of gr.idx) c.add(p.fromBufferAttribute(pos, i));
    c.divideScalar(gr.idx.length);
    n.fromBufferAttribute(nor, gr.idx[0]).normalize();
    n.y = 0;
    const toHome = home.clone().sub(c);
    toHome.y = 0;
    if (n.dot(toHome) < 0) n.negate();
    gr.t.crossVectors(up, n).normalize();
  }
  const uv = new Float32Array(pos.count * 2);
  for (const { t, idx } of groups.values()) {
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (const i of idx) {
      p.fromBufferAttribute(pos, i);
      u0 = Math.min(u0, p.dot(t));
      u1 = Math.max(u1, p.dot(t));
      v0 = Math.min(v0, p.y);
      v1 = Math.max(v1, p.y);
    }
    for (const i of idx) {
      p.fromBufferAttribute(pos, i);
      uv[i * 2] = (p.dot(t) - u0) / (u1 - u0 || 1);
      uv[i * 2 + 1] = (p.y - v0) / (v1 - v0 || 1);
    }
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
}

/** 등 빛 번짐 */
function glowTexture(THREE: typeof import('three')) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d')!;
  const g = c.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.15, 'rgba(255,250,235,0.55)');
  g.addColorStop(0.5, 'rgba(255,245,225,0.12)');
  g.addColorStop(1, 'rgba(255,245,225,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
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
  glb = '/stage/dodger.glb',
}: {
  THREE: typeof import('three');
  scene: Three.Scene;
  renderer: Three.WebGLRenderer;
  track: Pick<DisplayTrack, 'groundAt' | 'mound'>;
  center: Vec3;
  heightM: number;
  mode?: StageMode;
  /** Blender 로 만든 구장(scripts/stadium/build_dodger.py) — 있으면 코드 구장(stadium.ts) · 펜스 대신 이것을 불러온다 */
  glb?: string;
}): StageHandle {
  const s = 1 / heightM;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  let bakedMats: Three.MeshBasicMaterial[] = [];
  let current0: StageMode = mode;
  /** 구운 빛 재질의 밝기 — 낮 1, 밤은 조명탑 빛을 따로 굽기 전까지 어둡게 */
  const lampMat = new THREE.MeshBasicMaterial({ color: '#c9cdd2' });
  /* 조명판 앞면 — 등이 촘촘히 박힌 격자(세계 좌표 0.9m 칸마다 둥근 등) */
  lampMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLampW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLampW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLampW;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        {
          vec2 q = vec2(vLampW.x + vLampW.z, vLampW.y) / (0.9 * ${s.toFixed(5)});
          float dotm = 1.0 - smoothstep(0.28, 0.38, length(fract(q) - 0.5));
          diffuseColor.rgb *= mix(0.35, 1.0, dotm);
        }`
      );
  };
  const lampSpots: { at: Three.Vector3; size: number }[] = [];
  /** 톱 덱 지붕 밑 조명 띠 — 낮엔 그늘진 크림색, 밤엔 따뜻하게 빛남(사진) */
  const roofGlowMat = new THREE.MeshBasicMaterial({ color: '#8f8a80' });
  const glows: Three.Sprite[] = [];
  const applyBaked = () => {
    const night = current0 === 'night';
    /* 밤 — 조명탑 · 지붕 조명이 관중석까지 비춘다(경기 중 관중석은 꽤 밝다), 조금 따뜻하게 */
    for (const b of bakedMats) {
      b.color.copy(b.userData.base as Three.Color);
      if (night) b.color.multiply(new THREE.Color(0.55, 0.52, 0.47));
    }
    lampMat.color.set(night ? '#ffffff' : '#c9cdd2');
    roofGlowMat.color.set(night ? '#ffe2a8' : '#8f8a80');
    for (const g of glows) g.visible = night;
  };
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
  /* 밤이면 주차장(경기장 밖)을 어둡게 — 조명이 방향광이라 거리로 줄지 않는다 */
  const fieldNight = { value: 0 };
  /* 땅 사진 질감 — 늦게 와도 된다(오기 전엔 계산 무늬만) */
  const fieldTex = {
    grass: { value: null as Three.Texture | null },
    dirt: { value: null as Three.Texture | null },
    grassN: { value: null as Three.Texture | null },
    dirtN: { value: null as Three.Texture | null },
    on: { value: 0 },
  };
  const fieldCompile = (shellH?: { value: number }) => (sh: Three.WebGLProgramParametersWithUniforms) => {
    sh.uniforms.uHome = { value: new THREE.Vector2(H.x, H.z) };
    sh.uniforms.uS = { value: s };
    sh.uniforms.uNight = fieldNight;
    sh.uniforms.uGrassTex = fieldTex.grass;
    sh.uniforms.uDirtTex = fieldTex.dirt;
    sh.uniforms.uTexOn = fieldTex.on;
    sh.uniforms.uGrassN = fieldTex.grassN;
    sh.uniforms.uDirtN = fieldTex.dirtN;
    if (shellH) sh.uniforms.uShellH = shellH;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vFieldPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFieldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${shellH ? '#define SHELL\nuniform float uShellH;' : ''}\n${FIELD_GLSL}`)
      .replace('#include <map_fragment>', `#include <map_fragment>\nfield(vFieldPos, cameraPosition);\ndiffuseColor.rgb = fieldCol;\n${SHELL_GLSL}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = fieldRough;')
      /* 굴곡 노멀 — 높이(m, 무대 단위로 바꿔)의 화면 미분으로 노멀을 기울인다(three 범프 맵과 같은 식) */
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        {
          float hh = fieldH * uS;
          vec3 dpx = dFdx(-vViewPosition);
          vec3 dpy = dFdy(-vViewPosition);
          float dhx = dFdx(hh);
          float dhy = dFdy(hh);
          vec3 r1 = cross(dpy, normal);
          vec3 r2 = cross(normal, dpx);
          float det = dot(dpx, r1);
          vec3 grad = sign(det) * (dhx * r1 + dhy * r2);
          normal = normalize(abs(det) * normal - grad);
          /* 사진 노멀 — 접선은 경기장 p.x(세계 −x), 쌍접선은 p.y(세계 −z) */
          vec3 T = (viewMatrix * vec4(-1.0, 0.0, 0.0, 0.0)).xyz;
          T = normalize(T - normal * dot(normal, T));
          vec3 B = normalize(cross(T, normal));
          normal = normalize(T * fieldN.x + B * fieldN.y + normal * fieldN.z);
        }`
      );
  };
  fieldMat.onBeforeCompile = fieldCompile();
  /*
   * 3D 잔디 잎 — 땅 위 3cm 를 8 층으로 쌓은 판(셸). 층마다 잎 자리만 남기고 버려 위로 갈수록 가늘어지는 잎이 된다.
   * 화소 하나가 1.2cm 보다 커지는(먼) 곳은 그리지 않아 반짝이지 않고, 마운드 둘레 25m 만 덮는다.
   */
  const SHELLS = 8;
  for (let i = 0; i < SHELLS; i++) {
    const h = (i + 1) / SHELLS;
    const mat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.9, metalness: 0 });
    mat.onBeforeCompile = fieldCompile({ value: h });
    mat.customProgramCacheKey = () => 'field-shell';
    const g = new THREE.CircleGeometry(25 * s, 96);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, mat);
    m.position.set((mound ? mound.x0 + MOUND.centerAhead * s : center[0]), h * 0.03 * s, mound ? mound.z0 : center[2]);
    m.receiveShadow = true;
    m.renderOrder = 1;
    scene.add(m);
  }

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

  if (!glb) {
  /*
   * ── 외야 펜스: 3루 폴 → 가운데 → 1루 폴, 다저스 높이(폴 근처 1.2m · 나머지 2.4m) — 파울 지역 벽 · 관중석은 stadium.ts ──
   * 사진: 연한 하늘빛 회색 쿠션에 짙은 판(광고 자리 — 글자 · 로고 없이 빈 판)이 띄엄띄엄.
   */
  {
    const N = 200;
    const pos: number[] = [];
    const uv: number[] = [];
    const cap: number[] = [];
    const idx: number[] = [];
    let len = 0;
    let prev: Three.Vector3 | null = null;
    for (let i = 0; i <= N; i++) {
      const th = -Q + (2 * Q * i) / N;
      const p = at(fenceDist(th), th);
      if (prev) len += p.distanceTo(prev) / s;
      prev = p;
      const h = wallHeight(th);
      pos.push(p.x, 0, p.z, p.x, h * s, p.z);
      uv.push(len, 0, len, h / 2.4);
      cap.push(p.x, h * s, p.z, p.x, (h + 0.08) * s, p.z);
    }
    for (let i = 0; i < N; i++) {
      const a = i * 2;
      idx.push(a, a + 2, a + 1, a + 2, a + 3, a + 1);
    }
    const tex = (() => {
      const cv = document.createElement('canvas');
      cv.width = 1024;
      cv.height = 64;
      const c = cv.getContext('2d')!;
      c.fillStyle = WALL_BLUE;
      c.fillRect(0, 0, 1024, 64);
      c.fillStyle = 'rgba(0,0,0,0.16)';
      for (let x = 0; x < 1024; x += 43) c.fillRect(x, 0, 2, 64);
      /* 24m 한 칸에 짙은 판 하나(11m) — 판 위아래 30cm 는 쿠션이 보인다 */
      const g = c.createLinearGradient(0, 8, 0, 56);
      g.addColorStop(0, '#1b2433');
      g.addColorStop(1, '#0f151f');
      c.fillStyle = g;
      c.fillRect(200, 8, 470, 48);
      c.fillStyle = 'rgba(255,255,255,0.10)';
      c.fillRect(200, 8, 470, 2);
      const t = new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace;
      t.wrapS = THREE.RepeatWrapping;
      t.repeat.set(1 / 24, 1);
      t.anisotropy = 8;
      return t;
    })();
    const mk = (p: number[], mat: Three.Material, withUv: boolean) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
      if (withUv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      scene.add(m);
    };
    mk(pos, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, side: THREE.DoubleSide }), true);
    mk(cap, new THREE.MeshStandardMaterial({ color: '#5f7186', roughness: 0.7, side: THREE.DoubleSide }), false);
  }
  /* 파울 폴 — 노랑, 30m, 페어 쪽에 0.9m 날개 그물(사진) */
  for (const th of [Q, -Q]) {
    const yellow = new THREE.MeshStandardMaterial({ color: '#f0c02c', roughness: 0.5 });
    const base = at(fenceDist(th) + 0.3, th);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.14 * s, 0.18 * s, 30 * s, 12), yellow);
    pole.position.set(base.x, 15 * s, base.z);
    scene.add(pole);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.9 * s, 26 * s, 0.05 * s), yellow);
    /* 페어 쪽(θ 가 0 으로 가는 쪽) 0.55m 옆, 판은 홈을 본다 — 무대 좌표는 (a, b) → (−a, −b) 방향 */
    const k = Math.sign(th);
    wing.position.set(base.x - k * Math.sin(th) * 0.55 * s, 15.5 * s, base.z + k * Math.cos(th) * 0.55 * s);
    wing.lookAt(wing.position.clone().add(V(Math.cos(th), 0, Math.sin(th))));
    scene.add(wing);
  }
  }
  const stadium = glb ? buildSurroundings({ THREE, scene, fg, s, fenceR: fenceDist }) : buildStadium({ THREE, scene, fg, s, fenceR: fenceDist });

  /* ── 하늘 · 빛 ── */
  /* 홈 · 3루 쪽 위, 높이 49°(하늘 사진 속 해와 같다) — 우투 옆 카메라(3루 쪽)에서 몸 앞이 밝다 */
  const sunH = V(0.55, 0, 0.42).normalize();
  const sunDir = V(sunH.x, Math.tan((49 * Math.PI) / 180), sunH.z).normalize();
  const skyUniforms = {
    uZenith: { value: new THREE.Color() },
    uHorizon: { value: new THREE.Color() },
    uGround: { value: new THREE.Color() },
    uSunDir: { value: sunDir.clone() },
    uSunCol: { value: new THREE.Color() },
    uStars: { value: 0 },
    uMtn: { value: new THREE.Color() },
    uClouds: { value: 0 },
    uSky: { value: null as Three.Texture | null },
    uSkyOn: { value: 0 },
    /* 사진 속 해는 가로 0.6016(높이 49°) — 무대 해 방위가 그 자리에 오게 */
    uSkyOff: { value: 0.6016 - Math.atan2(sunDir.z, sunDir.x) / (2 * Math.PI) },
    /* 가운데(외야) 쪽 — 홈에서 −x */
    uCf: { value: new THREE.Vector2(-1, 0) },
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

  const hemi = new THREE.HemisphereLight('#dfeaf7', '#6f7060', 1);
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
  scene.fog = new THREE.Fog('#ffffff', 220 * s, 1100 * s);

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
    skyUniforms.uMtn.value.set(P.mtn);
    skyUniforms.uSkyOn.value = m === 'day' && skyUniforms.uSky.value ? 1 : 0;
    skyUniforms.uClouds.value = P.clouds;
    stadium.setNight(m === 'night');
    current0 = m;
    applyBaked();
    fieldNight.value = m === 'night' ? 1 : 0;
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
  let current = mode;
  const handle: StageHandle = {
    cameraNear: 0.03,
    cameraFar: (SKY_R + 120) * s,
    setMode: (m) => {
      current = m;
      setMode(m);
    },
  };
  setMode(mode);
  /*
   * Blender 구장 GLB — glTF 좌표 (a, 높이, b)(미터) → y 축 180° 돌리고 s 배, 홈 뒤 꼭짓점 H 로. 의자는 EXT_mesh_gpu_instancing(InstancedMesh),
   * 정점은 meshopt 압축이라 디코더를 붙인다.
   */
  if (glb) {
    void (async () => {
      const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([
        import('three/addons/loaders/GLTFLoader.js'),
        import('three/addons/libs/meshopt_decoder.module.js'),
      ]);
      const loader = new GLTFLoader();
      loader.setMeshoptDecoder(MeshoptDecoder);
      const g = await loader.loadAsync(glb);
      const root = g.scene;
      root.rotation.y = Math.PI;
      root.scale.setScalar(s);
      root.position.set(H.x, 0, H.z);
      /*
       * 재질 손질 — 콘크리트 계열에는 사진 질감(Poly Haven 'concrete_wall_008', CC0)을 세계 좌표로 세 방향에서 비춰(트라이플래너) 잔결만 곱한다
       * (GLB 에 uv · 질감을 넣지 않아 파일이 작다). 꼭짓점 색(COLOR_0)은 Blender 에서 구운 구석 어둠.
       */
      const concrete = await new THREE.TextureLoader().loadAsync('/stage/concrete.jpg');
      concrete.colorSpace = THREE.SRGBColorSpace;
      concrete.wrapS = concrete.wrapT = THREE.RepeatWrapping;
      const detailed = new Set(['BO_concrete', 'BO_concrete_deck', 'BO_roof', 'BO_wall']);
      /*
       * 구운 빛 — Blender 에서 해 · 하늘 · 반사광을 구조물 꼭짓점 색(COLOR_0)과 의자마다(instanceColor)에 구워 왔다.
       * 그래서 구장은 실시간 조명 없이 '재질 색 × 구운 빛'(MeshBasicMaterial)으로 그린다 — 그림자 · 반사광이 들어가고 휴대폰에서 싸다.
       * 밤에는 setMode 가 bakedNight 로 어둡게 누른다(조명탑 빛은 다음에 따로 굽는다).
       */
      const basics = new Map<string, Three.MeshBasicMaterial>();
      const toBasic = (m: Three.MeshStandardMaterial, vc: boolean) => {
        const key = m.uuid + (vc ? 'v' : 'i');
        let b = basics.get(key);
        if (!b) {
          /* 앞면만 — 닫힌 덩어리라 뒷면은 안 보이고, 양면이면 1mm 붙은 안팎 면이 서로 깜빡여 얼룩처럼 보였다 */
          b = new THREE.MeshBasicMaterial({ color: m.color.clone(), vertexColors: vc, name: m.name, side: THREE.FrontSide });
          b.userData.base = m.color.clone();
          const detail = detailed.has(m.name);
          {
            b.onBeforeCompile = (sh) => {
              /* 구운 빛은 밝기만(반사광에 묻은 의자 색은 버림) · 1.05 를 넘지 않게 */
              sh.fragmentShader = sh.fragmentShader.replace(
                '#include <color_fragment>',
                `#if defined( USE_COLOR )
                  diffuseColor.rgb *= vec3(min(1.05, dot(vColor.rgb, vec3(0.2126, 0.7152, 0.0722))));
                #elif defined( USE_INSTANCING_COLOR )
                  diffuseColor.rgb *= vColor.rgb;
                #endif`
              );
              if (!detail) return;
              sh.uniforms.uDetail = { value: concrete };
              sh.uniforms.uDetailScale = { value: 1 / (2 * s) };
              sh.vertexShader = sh.vertexShader
                .replace('#include <common>', '#include <common>\nvarying vec3 vWorldD;\nvarying vec3 vNormD;')
                .replace(
                  '#include <begin_vertex>',
                  '#include <begin_vertex>\nvWorldD = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvNormD = normalize(mat3(modelMatrix) * normal);'
                );
              sh.fragmentShader = sh.fragmentShader
                .replace('#include <common>', '#include <common>\nuniform sampler2D uDetail;\nuniform float uDetailScale;\nvarying vec3 vWorldD;\nvarying vec3 vNormD;')
                .replace(
                  '#include <map_fragment>',
                  `#include <map_fragment>
                  {
                    vec3 wn = abs(normalize(vNormD));
                    wn /= (wn.x + wn.y + wn.z);
                    vec3 p = vWorldD * uDetailScale;
                    vec3 t = texture2D(uDetail, p.zy).rgb * wn.x + texture2D(uDetail, p.xz).rgb * wn.y + texture2D(uDetail, p.xy).rgb * wn.z;
                    diffuseColor.rgb *= mix(1.0, dot(t, vec3(0.2126, 0.7152, 0.0722)) / 0.242, 0.45);
                  }`
                );
            };
          }
          basics.set(key, b);
        }
        return b;
      };
      /* 빛나는 것 · 비치는 것은 구운 빛 대신 따로 — 전광판 화면(점수판 그림) · 띠 전광판 · 조명판 · 백스톱 그물 */
      const special: Record<string, Three.Material> = {
        BO_screen: new THREE.MeshBasicMaterial({ map: scoreboardTexture(THREE), side: THREE.DoubleSide }),
        /* 펜스 · 쿠션 벽은 길고 가는 면이라 꼭짓점 빛이 세모 얼룩으로 보인다 — 실시간 해 · 하늘빛으로 */
        BO_wall: new THREE.MeshStandardMaterial({ color: WALL_BLUE, roughness: 0.85 }),
        BO_led: new THREE.MeshBasicMaterial({ color: '#2a66c4' }),
        BO_net: new THREE.MeshBasicMaterial({ color: '#1e1e1e', transparent: true, opacity: 0.24, depthWrite: false, side: THREE.DoubleSide }),
      };
      lampMat.color.set('#c9cdd2');
      special.BO_lamp = lampMat;
      special.BO_roof_glow = roofGlowMat;
      root.traverse((o) => {
        const mesh = o as Three.Mesh;
        if (!mesh.isMesh) return;
        const m = mesh.material as Three.MeshStandardMaterial;
        if (special[m.name]) {
          mesh.material = special[m.name];
          if (m.name === 'BO_screen') {
            mesh.updateWorldMatrix(true, false);
            screenUv(THREE, mesh.geometry, new THREE.Vector3(H.x, 0, H.z).applyMatrix4(mesh.matrixWorld.clone().invert()));
          }
          if (m.name === 'BO_lamp') {
            /* 압축 때 조명판들이 한 메시로 합쳐져 있다 — 점들을 20m 칸으로 묶어 판마다 빛 번짐 하나 */
            mesh.updateWorldMatrix(true, false);
            const pos = mesh.geometry.attributes.position;
            const cl = new Map<string, { sum: Three.Vector3; n: number; box: Three.Box3 }>();
            const q = new THREE.Vector3();
            for (let i = 0; i < pos.count; i++) {
              q.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
              const k = `${Math.round(q.x / (40 * s))},${Math.round(q.y / (40 * s))},${Math.round(q.z / (40 * s))}`;
              const c = cl.get(k) ?? { sum: new THREE.Vector3(), n: 0, box: new THREE.Box3() };
              c.sum.add(q);
              c.n++;
              c.box.expandByPoint(q);
              cl.set(k, c);
            }
            for (const c of cl.values()) lampSpots.push({ at: c.sum.divideScalar(c.n), size: c.box.getSize(q).length() * 2.6 });
          }
          return;
        }
        /* 의자 줄 판 — 그림(밝기 + 의자 자리) × 층 색 × 구운 빛. 의자 자리 밖은 콘크리트 */
        if (m.name.startsWith('BO_seatrow_')) {
          const rgb = (m.userData.seat_rgb as number[] | undefined) ?? [0.5, 0.5, 0.5];
          const b = new THREE.MeshBasicMaterial({ map: m.map, vertexColors: true, name: m.name, side: THREE.DoubleSide });
          b.userData.base = new THREE.Color(1, 1, 1);
          const seatCol = new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2]);
          b.onBeforeCompile = (sh) => {
            sh.uniforms.uSeat = { value: seatCol };
            sh.fragmentShader = sh.fragmentShader
              .replace('#include <common>', '#include <common>\nuniform vec3 uSeat;')
              .replace(
                '#include <map_fragment>',
                `#ifdef USE_MAP
                  vec4 st = texture2D(map, vMapUv);
                  diffuseColor.rgb *= mix(vec3(0.74, 0.72, 0.68), uSeat, st.a) * st.rgb;
                #endif`
              )
              .replace(
                '#include <color_fragment>',
                `#if defined( USE_COLOR )
                  diffuseColor.rgb *= vec3(min(1.05, dot(vColor.rgb, vec3(0.2126, 0.7152, 0.0722))));
                #endif`
              );
          };
          if (b.map) b.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
          basics.set(m.uuid + 'seat', b);
          mesh.material = b;
          return;
        }
        const vc = !!mesh.geometry.attributes.color;
        const inst = !!(mesh as Three.InstancedMesh).instanceColor;
        if (vc || inst) mesh.material = toBasic(m, vc);
      });
      bakedMats = [...basics.values()];
      /* 조명판 빛 번짐(밤에만) */
      const glowMat = new THREE.SpriteMaterial({ map: glowTexture(THREE), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
      for (const l of lampSpots) {
        const sp = new THREE.Sprite(glowMat);
        sp.position.copy(l.at);
        sp.scale.setScalar(l.size);
        glows.push(sp);
        scene.add(sp);
      }
      applyBaked();
      /* 해 그림자는 투수 둘레 5m 만 덮는다 — 구장은 그림자를 그리지도 받지도 않는다(의자 5만여 개를 그림자 판에 또 그리면 휴대폰이 버겁다) */
      root.traverse((o) => {
        o.castShadow = false;
        o.receiveShadow = false;
      });
      scene.add(root);
      handle.onChange?.();
    })().catch((e) => console.error('[stage] glb', e));
  }
  /* 땅 질감 둘이 다 오면 켠다 */
  const loader = new THREE.TextureLoader();
  let texLeft = 4;
  for (const [key, url] of [
    ['grass', '/stage/grass.jpg'],
    ['dirt', '/stage/dirt.jpg'],
    ['grassN', '/stage/grass_n.jpg'],
    ['dirtN', '/stage/dirt_n.jpg'],
  ] as const) {
    loader.load(url, (t) => {
      /* 노멀 맵은 색이 아니라 방향 — sRGB 로 풀면 기울기가 틀어진다 */
      t.colorSpace = key.endsWith('N') ? THREE.NoColorSpace : THREE.SRGBColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      fieldTex[key].value = t;
      if (--texLeft === 0) {
        fieldTex.on.value = 1;
        handle.onChange?.();
      }
    });
  }
  /* 낮 하늘 사진(Poly Haven 'Kloofendal 48d Partly Cloudy (Pure Sky)', CC0) — 지평 위 반구만 8192 × 2048 로 줄여 public/stage 에 둠 */
  loader.load('/stage/sky-day.jpg', (t) => {
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = THREE.RepeatWrapping;
    t.minFilter = THREE.LinearFilter;
    t.generateMipmaps = false;
    skyUniforms.uSky.value = t;
    setMode(current);
    handle.onChange?.();
  });

  return handle;
}
