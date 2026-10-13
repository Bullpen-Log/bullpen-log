'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Pause, Play } from 'lucide-react';
import type * as Three from 'three';
import { Segmented } from '@/components/segmented';
import { hasWebGL } from '@/components/three-stage';
import { CHIP_BASE, CHIP_ON } from '@/components/velocity/kit';
import type { Vec3 } from '@/lib/pitch-3d/linalg';
import type { Pitch3dV2Ok } from '@/lib/pitch-3d/v2/contract';
import { displayTrack } from '@/lib/pitch-3d/v2/display';
import type { LabGround } from '@/lib/pitch-lab-meta';
import { canonicalFrames, mannequinFrames } from '@/lib/pitch-3d/v2/mannequin-frames';
import { labelText, labelValues, measureAngles, momentOf, type Label } from '@/lib/pitch-3d/v2/mannequin-measure';
import { anaMaterials, LEGEND, placeLabels, projectToScreen } from '@/lib/pitch-3d/v2/mannequin-pause';
import { mannequinTrack } from '@/lib/pitch-3d/v2/mannequin-prep';
import { createFigure } from './mannequin/figure';
import { createOverlay, measureHex } from './mannequin/overlay';
import { buildStage } from './stage';

/**
 * 투구 3D 보기(설계 pitch-3d-quality.md 0절 · 화면 결정 9~16 · 데생 인형 pitch-3d-mannequin.md §6) — 데생 인형(몸통 · 팔다리 · 신발 · 글러브 · 공)을
 * 맞춘 관절에 맞춰 움직인다. 무대(바탕 · 조명 · 바닥 · 마운드 · 축 화살표)는 stage.ts(김민 몫 — 여기서 다시 쓰지 않는다).
 *
 *   - 인형은 한 번 만들고(mannequin/figure.ts) 장면마다 자리 · 회전 · 배율만 바꾼다. 관절(미터 · z 위 · 우투 꼴)은 mannequin-prep →
 *     mannequin-frames 가 만들고, 묶음을 x 로 −90° 돌려 y 위로 · 1/키 배율로 보기 좌표에 놓는다. 좌투는 y 배율 −1(거울).
 *   - 무대가 넣은 바닥 · 마운드 · 화살표는 world 묶음으로 옮기고 scene.background 는 비운다(renderer 의 지우기 색만) — 네 번 그리기가 바탕에 지워지지 않게.
 *   - 늘(재생 중에도) 인형은 비치고(맨 앞 겉면만) 속 뼈 · 잰 선 다섯 · 이름표(HTML 겹침)가 보인다(ana = 1). 그릴 때는 네 번:
 *     바닥 · 뼈 → 인형 깊이만 → 인형 맨 앞 겉면 → 잰 선(예시 render). 예전엔 재생 중엔 인형만 보이고 멈추면 이 보기였는데('각도' 칩으로 끔),
 *     사용자(2026-10-13): "인형만 보이면 투구 동작이 너무 부자연스럽다" — 이 보기를 기본이자 하나로. 순간(착지 · 릴리스) 이름표는 결과 표의 값.
 *
 *   - 3D 가 기준 시계(결정 12): 1× · ½× · ¼×. 처음 열면 ½× 로 한 번 틀고 릴리스에서 멈춤(결정 9), 그 뒤 재생은 되풀이. 움직임 줄이기면 자동 재생 없음.
 *   - 고정 카메라 4각도(결정 10): 옆(3루 쪽) · 뒤(2루 쪽) · 포수(홈 쪽 가슴 높이) · 위(70°). 끌기 = 좌우 돌리기(위아래 5~80°), Ctrl + 휠 · 두 손가락 = 확대, 시점을 누르면 되돌림.
 *   - 재생 막대에 확신 낮은 구간은 엷은 회색(결정 13), 그 안이면 '이 구간은 영상에서 잘 안 보였어요.'
 *   - 키보드(결정 16): 칸에 초점이 있을 때만 스페이스 재생/멈춤 · ←/→ 한 장면 · Shift 10장면.
 *   - 원본 영상 두 칸은 부모(lab-detail.tsx)가 onTransport 로 따라간다.
 *
 * three 는 import() 로 — 결과를 안 여는 화면에 실리지 않는다.
 */

export type Speed = 1 | 0.5 | 0.25;
export type ViewName = 'side' | 'back' | 'catcher' | 'top';
export type Transport = {
  frame: number;
  playing: boolean;
  speed: Speed;
  reason: 'tick' | 'seek' | 'toggle' | 'speed';
};
export type Body3DHandle = { seek: (frame: number) => void };

/** 각도 이름표의 짧은 이름 — 상자를 작게(긴 이름은 이름표에 마우스를 대면 · 결과 표에서) */
/** 화면 속 몸 키(px)가 이보다 작으면 이름표는 숫자만 */
const LABEL_FULL_BODY_PX = 420;
const SHORT_NAME: Record<string, string> = { separation: '상하체 분리', trunk: '기울기', knee: '무릎', arm: '벌림', elbow: '팔꿈치' };

const VIEWS: { value: ViewName; label: string }[] = [
  { value: 'side', label: '옆' },
  { value: 'back', label: '뒤' },
  { value: 'catcher', label: '포수' },
  { value: 'top', label: '위' },
];
const SPEEDS: { value: Speed; label: string }[] = [
  { value: 1, label: '1×' },
  { value: 0.5, label: '½×' },
  { value: 0.25, label: '¼×' },
];
const EVENT_LABELS = { kneeUp: '니업', footPlant: '착지', release: '릴리스' } as const;

/* ───────────────────────────── three(한 번만) ───────────────────────────── */

type ThreeMods = [typeof import('three'), typeof import('three/addons/controls/OrbitControls.js')];
let mods: Promise<ThreeMods> | null = null;
const loadThree = () => {
  if (!mods) {
    mods = Promise.all([import('three'), import('three/addons/controls/OrbitControls.js')]);
    mods.catch(() => {
      mods = null;
    });
  }
  return mods;
};

/* ───────────────────────────── 보기 ───────────────────────────── */

type Status = 'loading' | 'ready' | 'unavailable' | 'error';

export const Body3D = forwardRef<
  Body3DHandle,
  {
    result: Pitch3dV2Ok;
    onTransport?: (t: Transport) => void;
    /** 던진 곳 — 마운드면 규격 마운드를 놓고 발을 그 경사 위에(없으면 마운드) */
    ground?: LabGround;
    /** 투수 키(cm) — 마운드 크기를 키 단위로 바꾼다(없으면 180) */
    heightCm?: number | null;
    /** AI 스켈레톤 보정을 섞을지(결과에 AI 관절이 있을 때만 효과) */
    ai?: boolean;
  }
>(function Body3D({ result, onTransport, ground = 'mound', heightCm, ai = false }, ref) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<Status>(() =>
    typeof window !== 'undefined' && !hasWebGL() ? 'unavailable' : 'loading'
  );
  const [frame, setFrame] = useState(result.events.release);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<Speed>(0.5);
  const [view, setView] = useState<ViewName>('side');
  const [retry, setRetry] = useState(0);
  /* 읽어 주는 글(스크린 리더용 잰 값 다섯, 멈췄을 때) */
  const [said, setSaid] = useState<string[]>([]);
  const labelsRef = useRef<HTMLDivElement>(null);
  const legendRef = useRef<HTMLUListElement>(null);
  const n = result.t.length;

  /* 무대에 내리는 명령(렌더 루프가 읽는다) */
  const ctrl = useRef<{
    seek: (k: number) => void;
    play: (on: boolean) => void;
    speed: (s: Speed) => void;
    view: (v: ViewName, animate: boolean) => void;
  } | null>(null);
  const transport = useRef(onTransport);
  useEffect(() => {
    transport.current = onTransport;
  }, [onTransport]);

  /* 장면 → 보기용 관절(키 = 1, 사람 몸 한계 · 떨림 다듬기 · 바닥 하나 — display.ts) */
  const track = useMemo(
    () => displayTrack(result, { ground, heightM: (heightCm ?? 180) / 100, ai }),
    [result, ground, heightCm, ai]
  );
  const frames = track.frames;
  /* 인형 관절(미터 · z 위 · 우투 꼴)과 장면 틀 — 순수 계산이라 한 번만 */
  const mann = useMemo(() => {
    const H = (heightCm ?? 180) / 100;
    const joints = canonicalFrames(mannequinTrack(track, result, H));
    return { H, joints, frames: mannequinFrames(joints, H) };
  }, [track, result, heightCm]);
  /*
   * 움직임 상자 — 카메라 거리 · 격자 자리. 관절 자리의 2~98% 로 잡는다(튄 장면 하나가 상자를 키의 절반만큼 부풀려 처음 화면이
   * 멀었다 — 2026-10-08 샘플 1 첫 장면 손목 503mm). 높이는 바닥(0) ~ 위 끝.
   */
  const bounds = useMemo(() => {
    const axes: number[][] = [[], [], []];
    for (const fr of frames) for (const p of fr) for (let d = 0; d < 3; d++) axes[d].push(p[d]);
    const pct = (xs: number[], q: number) => {
      const s = [...xs].sort((a, b) => a - b);
      return s[Math.min(s.length - 1, Math.max(0, Math.round(q * (s.length - 1))))] ?? 0;
    };
    const mn: Vec3 = [pct(axes[0], 0.02), 0, pct(axes[2], 0.02)];
    const mx: Vec3 = [pct(axes[0], 0.98), Math.max(1, pct(axes[1], 0.98)), pct(axes[2], 0.98)];
    const center: Vec3 = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
    const half: Vec3 = [
      Math.max(0.3, (mx[0] - mn[0]) / 2),
      Math.max(0.5, (mx[1] - mn[1]) / 2),
      Math.max(0.3, (mx[2] - mn[2]) / 2),
    ];
    return { center, half };
  }, [frames]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    if (!hasWebGL()) return;
    let disposed = false;
    let cleanup: (() => void) | null = null;
    (async () => {
      const [THREE, { OrbitControls }] = await loadThree();
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      renderer.domElement.style.touchAction = 'pan-y';
      host.prepend(renderer.domElement);
      /* 이름표 다섯(HTML, 캔버스 위에 겹침) — 글은 장면이 바뀔 때만, 자리는 그릴 때마다(placeLabelsDom) */
      /* 이름표를 누르면 다시 그리기 — dirty 는 아래에서 생기므로 나중에 잇는다 */
      let dirtyLabels = () => {};
      const labelEls = Array.from({ length: 1 }, () => {
        const el = document.createElement('div');
        el.className =
          'absolute left-0 top-0 whitespace-nowrap rounded py-[2px] pl-1 pr-[5px] text-[11px] font-semibold leading-none text-white tabular-nums will-change-transform';
        /* 짧은 이름 + 숫자로 작게(사용자 2026-10-13: 상자가 커서 투구 폼이 가렸다) */
        el.style.background = 'rgba(12,16,22,.55)';
        el.style.borderLeft = '3px solid #fff';
        el.style.display = 'none';
        el.addEventListener('click', () => {
          el.dataset.open = el.dataset.open === '1' ? '' : '1';
          dirtyLabels();
        });
        labelsRef.current?.appendChild(el);
        return el;
      });

      const scene = new THREE.Scene();
      const { center, half } = bounds;
      /*
       * 무대(바탕 · 조명 · 바닥 · 마운드 · 축) — stage.ts(김민 몫, 사람 그리기와 따로 고친다). 무대가 넣은 것 중 빛이 아닌 것은 world 묶음으로 옮겨
       * 네 번 그리기에서 따로 끄고 켠다. scene.background 는 비운다(Color 면 render 마다 강제로 지워 여러 번 그리기가 깨진다 — 지우기 색은 renderer 에 남는다).
       */
      const before = new Set(scene.children);
      buildStage({ THREE, scene, renderer, track, center, heightM: mann.H });
      scene.background = null;
      const world = new THREE.Group();
      for (const o of [...scene.children]) if (!before.has(o) && !(o as Three.Light).isLight) world.add(o);
      scene.add(world);
      const H = mann.H;

      /*
       * 데생 인형 — 관절은 미터 · z 위 · 우투 꼴(mannequin-frames). 묶음을 x 로 −90° 돌리면 z 위 → y 위 · y 왼쪽 → −z(보기 좌표의 옆),
       * 1/키 배율로 키 = 1 보기 단위에 맞춘다. 좌투는 y 배율 −1 로 거울(three 가 음수 행렬식이면 면 감김을 뒤집어 준다).
       */
      const fig = createFigure(THREE, { heightM: H, hand: result.hand });
      /* 몸통 · 골반 뼈대는 따로 받아 붙는다 — 붙으면 한 번 다시 그린다(dirty 는 아래에서 생기므로 나중에 잇는다) */
      let redraw = () => {};
      const ov = createOverlay(THREE, { heightM: H, onReady: () => redraw() });
      const rig = new THREE.Group();
      rig.rotation.x = -Math.PI / 2;
      rig.scale.set(1 / H, result.hand === 'L' ? -1 / H : 1 / H, 1 / H);
      rig.add(fig.group, ov.bones, ov.lines);
      scene.add(rig);
      /* 인형 깊이만 쓰는 재질(네 번 그리기 둘째 패스) */
      const depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, side: THREE.DoubleSide });
      const sV = new THREE.Vector3();

      const camera = new THREE.PerspectiveCamera(32, 1, 0.01, 60);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enablePan = false;
      controls.enableDamping = true;
      controls.dampingFactor = 0.08;
      controls.rotateSpeed = 0.8;
      controls.minPolarAngle = THREE.MathUtils.degToRad(10);
      controls.maxPolarAngle = THREE.MathUtils.degToRad(85);
      const target = new THREE.Vector3(center[0], center[1], center[2]);
      controls.target.copy(target);
      let dirty = true;
      redraw = () => {
        dirty = true;
      };
      dirtyLabels = () => {
        dirty = true;
      };
      controls.addEventListener('change', () => {
        dirty = true;
      });
      renderer.domElement.addEventListener(
        'wheel',
        (e) => (controls.enableZoom = e.ctrlKey),
        { capture: true, passive: true }
      );
      renderer.domElement.addEventListener(
        'wheel',
        () => (controls.enableZoom = true),
        { passive: true }
      );

      /*
       * 보는 방향에서 상자가 화면 가로 · 세로에 맞는 거리 — 예전엔 상자 대각선을 지름으로 삼아 옆에서 볼 때 앞뒤 폭까지 넣어 멀었다.
       * 상자의 8 꼭짓점을 화면 가로 · 세로 축에 내려 가장 먼 것으로, 앞뒤 깊이의 절반을 더한다(가까운 쪽이 잘리지 않게).
       */
      const fitDist = (dir: Three.Vector3) => {
        const v = THREE.MathUtils.degToRad(camera.fov);
        const tanV = Math.tan(v / 2);
        const tanH = tanV * camera.aspect;
        const d = dir.clone().normalize();
        const up = Math.abs(d.y) > 0.95 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
        const right = new THREE.Vector3().crossVectors(up, d).normalize();
        const upS = new THREE.Vector3().crossVectors(d, right).normalize();
        let w = 0;
        let h = 0;
        let depth = 0;
        for (const sx of [-1, 1])
          for (const sy of [-1, 1])
            for (const sz of [-1, 1]) {
              const c = new THREE.Vector3(sx * half[0], sy * half[1], sz * half[2]);
              w = Math.max(w, Math.abs(c.dot(right)));
              h = Math.max(h, Math.abs(c.dot(upS)));
              depth = Math.max(depth, Math.abs(c.dot(d)));
            }
        return Math.max(w / tanH, h / tanV) * 1.06 + depth;
      };
      /*
       * 옆 · 뒤 = 결과에 담긴 실제 카메라 자리(몸 가운데에서 본 방향) — 영상과 같은 각도로 본다. 예전엔 고정 방향(우투 −z · 좌투 +z)이라
       * 2026-10-09 샘플 3 · 4 둘 다 옆 카메라 반대편에서 봐, 영상의 앞모습이 뒷모습으로 · 팔다리가 거울처럼 보였다. 위아래는 3~30° 로.
       */
      const camDir = (v: 'side' | 'back'): Three.Vector3 | null => {
        const c = result.cameras?.[v];
        if (!c) return null;
        const R = c.R;
        const C = [0, 1, 2].map((i) => -(R[i] * c.t[0] + R[3 + i] * c.t[1] + R[6 + i] * c.t[2]));
        const m = [0, 0, 0];
        let cnt = 0;
        for (const fr of result.joints)
          for (const p of fr) {
            m[0] += p[0] / 1000;
            m[1] += p[1] / 1000;
            m[2] += p[2] / 1000;
            cnt++;
          }
        const d = new THREE.Vector3(C[0] - m[0] / cnt, 0, C[2] - m[2] / cnt);
        if (d.length() < 1e-6) return null;
        const flat = d.length();
        d.normalize();
        d.y = Math.tan(THREE.MathUtils.clamp(Math.atan2(C[1] - m[1] / cnt, flat), 0.05, 0.52));
        return d;
      };
      const sideCam = camDir('side');
      const backCam = camDir('back');
      const viewDir = (name: ViewName): Three.Vector3 => {
        const sideZ = sideCam ? Math.sign(sideCam.z) || 1 : result.hand === 'L' ? 1 : -1;
        switch (name) {
          case 'side':
            return sideCam?.clone() ?? new THREE.Vector3(0, 0.08, sideZ);
          case 'back':
            return backCam?.clone() ?? new THREE.Vector3(-1, 0.1, 0);
          case 'catcher':
            return new THREE.Vector3(1, 0.05, 0);
          case 'top':
            return new THREE.Vector3(
              0,
              Math.sin(THREE.MathUtils.degToRad(70)),
              sideZ * Math.cos(THREE.MathUtils.degToRad(70))
            );
        }
      };
      let tween: { t: number; from: Three.Vector3; to: Three.Vector3 } | null = null;
      const moveTo = (name: ViewName, animate: boolean) => {
        const dir = viewDir(name).normalize();
        const dist = fitDist(dir);
        controls.minDistance = dist * 0.35;
        controls.maxDistance = dist * 3;
        const to = target.clone().addScaledVector(dir, dist);
        if (!animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          camera.position.copy(to);
          controls.update();
          dirty = true;
          return;
        }
        tween = { t: 0, from: camera.position.clone(), to };
      };

      /* 시계 */
      const t0 = result.t[0];
      const tEnd = result.t[n - 1];
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      let cur = reduced ? result.events.release : 0;
      let clock = result.t[cur];
      let isPlaying = !reduced;
      let spd: Speed = 0.5;
      let stopAtRelease = !reduced;
      let lastTick = 0;

      /*
       * 뼈 · 각도 보기 — 늘 켬(인형 비침 + 속 뼈 · 잰 선 · 이름표). 뼈 · 선 자리는 장면이 바뀔 때만 다시 잡는다(rAF 마다가 아니다).
       */
      let labels: Label[] = [];
      let labelsVersion = 0;
      const applyAna = (a: number) => {
        const m = anaMaterials(a);
        for (const [key, mat] of Object.entries(fig.materials)) {
          if (mat.transparent !== m.figTransparent) {
            mat.transparent = m.figTransparent;
            mat.needsUpdate = true;
          }
          mat.opacity = key === 'twist' ? m.twistOpacity : m.figOpacity;
          mat.depthWrite = m.figDepthWrite;
        }
        ov.setAna(a);
        if (legendRef.current) legendRef.current.style.opacity = String(a);
      };
      const refreshOverlay = () => {
        const J = mann.joints[cur];
        labels = ov.update(J, mann.frames[cur], labelValues(measureAngles(J), momentOf(cur, result.events), result.metrics));
        labelsVersion++;
        if (!isPlaying) setSaid(labels.map((l) => `${l.name} ${labelText(l.key, l.value)}${l.off && l.table != null ? ` (결과 표 ${Math.round(l.table)}°)` : ''}`));
      };
      /* 효과가 다시 돌 때(새 결과) 범례 · 재질을 비침으로 */
      applyAna(1);
      setSaid([]);
      /* 장면 — 인형은 자리 · 회전 · 배율만 바꾼다(도형은 안 만든다). 장면 틀은 useMemo 로 한 번 계산해 둔 것 */
      const applyFrame = (k: number) => {
        fig.update(mann.joints[k], mann.frames[k]);
        refreshOverlay();
        dirty = true;
      };
      const emit = (reason: Transport['reason']) =>
        transport.current?.({ frame: cur, playing: isPlaying, speed: spd, reason });
      const frameAt = (time: number) => {
        let lo = 0;
        let hi = n - 1;
        while (hi - lo > 1) {
          const m = (lo + hi) >> 1;
          if (result.t[m] <= time) lo = m;
          else hi = m;
        }
        return time >= result.t[hi] ? hi : lo;
      };
      const show = (k: number) => {
        cur = Math.max(0, Math.min(n - 1, k));
        applyFrame(cur);
        setFrame(cur);
      };
      ctrl.current = {
        seek: (k) => {
          isPlaying = false;
          stopAtRelease = false;
          setPlaying(false);
          show(k);
          clock = result.t[cur];
          emit('seek');
        },
        play: (on) => {
          isPlaying = on;
          stopAtRelease = false;
          setPlaying(on);
          if (on && cur >= n - 1) {
            show(0);
            clock = t0;
          }
          emit('toggle');
        },
        speed: (s) => {
          spd = s;
          setSpeed(s);
          emit('speed');
        },
        view: moveTo,
      };
      show(cur);
      setPlaying(isPlaying);
      emit(isPlaying ? 'toggle' : 'seek');

      const resize = () => {
        const w = host.clientWidth;
        const h = host.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        dirty = true;
      };
      const sizer = new ResizeObserver(resize);
      sizer.observe(host);
      resize();
      moveTo('side', false);

      /* 이름표 자리 — rig 좌표(미터 · 우투 꼴) → 세계 → 화면. 겹치면 위아래로 비키고 칸 안으로 가둔다(mannequin-pause) */
      const placeLabelsDom = () => {
        const w = host.clientWidth;
        const h = host.clientHeight;
        /*
         * 멀리서 보면(화면 속 몸이 작으면) 이름을 빼고 숫자만 — 글자는 그대로인데 몸만 작아져 상자가 폼을 가렸다(사용자 2026-10-13).
         * 무슨 각인지는 색 줄 · 왼쪽 위 범례로 안다. 글자는 11px 아래로 줄이지 않는다(앱 규칙).
         */
        let brief = false;
        if (labels[0]) {
          const a = rig.localToWorld(sV.set(...labels[0].p)).project(camera);
          const ax = a.x;
          const ay = a.y;
          const b = rig.localToWorld(sV.set(labels[0].p[0], labels[0].p[1], labels[0].p[2] + H)).project(camera);
          const bodyPx = Math.hypot(((b.x - ax) / 2) * w, ((b.y - ay) / 2) * h);
          brief = bodyPx < LABEL_FULL_BODY_PX;
        }
        const boxes: { i: number; x: number; y: number; w: number; h: number }[] = [];
        labelEls.forEach((el, i) => {
          const L = labels[i];
          if (!L) {
            el.style.display = 'none';
            return;
          }
          const v = rig.localToWorld(sV.set(L.p[0], L.p[1], L.p[2])).project(camera);
          if (v.z > 1) {
            el.style.display = 'none';
            return;
          }
          /*
           * 값은 늘 그림(보기용 관절)의 각도. 순간에 결과 표 값과 8° 넘게 벌어지면 흐리게 하고, 누르면 표 값 한 줄을 펼친다
           * (2026-10-12 김민 — 숫자 칸이 공식 값, 이름표는 보이는 각도).
           */
          const key = `${labelsVersion}:${el.dataset.open ?? ''}:${brief ? 1 : 0}`;
          if (el.dataset.v !== key) {
            el.dataset.v = key;
            el.style.borderLeftColor = measureHex(L.key);
            const open = L.off && el.dataset.open === '1';
            el.innerHTML = `${brief ? '' : `<span class="font-normal text-[#c7cfdd]">${SHORT_NAME[L.key] ?? L.name}</span> `}${labelText(L.key, L.value)}${
              open && L.table != null ? `<span class="ml-1 text-[#9aa5b4]">· 표 ${Math.round(L.table)}°</span>` : ''
            }`;
            el.style.pointerEvents = L.off ? 'auto' : 'none';
            el.style.cursor = L.off ? 'pointer' : '';
            el.title =
              L.off && L.table != null
                ? `${L.name} · 결과 표 값 ${Math.round(L.table)}° — 화면 자세와 ${Math.round(Math.abs(L.value - L.table))}° 달라요`
                : L.name;
          }
          el.style.display = '';
          el.style.opacity = L.off ? '0.55' : '1';
          const s = projectToScreen([v.x, v.y, v.z], w, h);
          boxes.push({ i, x: s.x, y: s.y, w: el.offsetWidth + 6, h: el.offsetHeight + 4 });
        });
        const at = placeLabels(boxes, w, h);
        boxes.forEach((b, j) => {
          labelEls[b.i].style.transform = `translate(${at[j].x}px, ${at[j].y}px) translate(-50%, -50%)`;
        });
      };
      /*
       * 비칠 때는 네 번 그린다(예시 render): 바닥 · 뼈(인형은 그림자만 — 색 · 깊이를 안 쓴다) → 인형 깊이만(overrideMaterial) → 인형 맨 앞 겉면
       * (깊이가 같은 면만 통과) → 잰 선. scene.background 가 null 이라 autoClear 를 끄면 앞 패스가 남는다. 그림자 지도는 첫 패스에서만 만든다.
       */
      const figMats = Object.values(fig.materials);
      const render = () => {
        try {
          ov.lines.visible = false;
          for (const m of figMats) m.colorWrite = false;
          renderer.autoClear = true;
          renderer.render(scene, camera);
          renderer.shadowMap.autoUpdate = false;
          renderer.autoClear = false;
          world.visible = false;
          ov.bones.visible = false;
          scene.overrideMaterial = depthMat;
          renderer.render(scene, camera);
          scene.overrideMaterial = null;
          for (const m of figMats) m.colorWrite = true;
          renderer.render(scene, camera);
          fig.group.visible = false;
          ov.lines.visible = true;
          renderer.render(scene, camera);
        } finally {
          scene.overrideMaterial = null;
          renderer.autoClear = true;
          renderer.shadowMap.autoUpdate = true;
          for (const m of figMats) m.colorWrite = true;
          world.visible = fig.group.visible = ov.bones.visible = ov.lines.visible = true;
        }
        placeLabelsDom();
      };

      let last = performance.now();
      let raf = 0;
      const loop = (now: number) => {
        raf = requestAnimationFrame(loop);
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (isPlaying) {
          clock += dt * spd;
          if (clock > tEnd) clock = t0;
          const k = frameAt(clock);
          if (k !== cur) show(k);
          if (stopAtRelease && cur >= result.events.release) {
            isPlaying = false;
            stopAtRelease = false;
            setPlaying(false);
            emit('toggle');
          } else if (now - lastTick > 500) {
            lastTick = now;
            emit('tick');
          }
        }
        if (tween) {
          tween.t = Math.min(1, tween.t + dt / 0.35);
          const e = 1 - Math.pow(1 - tween.t, 3);
          camera.position.lerpVectors(tween.from, tween.to, e);
          if (tween.t >= 1) tween = null;
          dirty = true;
        }
        if (controls.update()) dirty = true;
        if (!dirty) return;
        dirty = false;
        render();
      };
      raf = requestAnimationFrame(loop);
      setStatus('ready');

      cleanup = () => {
        cancelAnimationFrame(raf);
        sizer.disconnect();
        controls.dispose();
        fig.dispose();
        ov.dispose();
        depthMat.dispose();
        for (const el of labelEls) el.remove();
        renderer.dispose();
        renderer.forceContextLoss();
        renderer.domElement.remove();
        ctrl.current = null;
      };
    })().catch((err) => {
      console.error('[body-3d]', err);
      if (!disposed) setStatus('error');
    });
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [bounds, track, mann, n, result.events.release, result.hand, result.t, result.cameras, result.joints, result.events, result.metrics, retry]);

  useImperativeHandle(ref, () => ({ seek: (k) => ctrl.current?.seek(k) }), []);

  const toggle = useCallback(() => ctrl.current?.play(!playing), [playing]);
  const seek = (k: number) => ctrl.current?.seek(k);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === ' ') {
      e.preventDefault();
      toggle();
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const step = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowLeft' ? -1 : 1);
      seek(frame + step);
    }
  };

  const lowSpan = result.lowConf.find(([a, b]) => frame >= a && frame <= b);
  const eventAt = (Object.keys(EVENT_LABELS) as (keyof typeof EVENT_LABELS)[]).find(
    (k) => result.events[k] === frame
  );
  const analysisOn = status === 'ready';
  const label = `투구 3D 모션, ${playing ? '재생 중' : '멈춤'}${eventAt ? ` · ${EVENT_LABELS[eventAt]}` : ''}${
    analysisOn ? ' · 뼈와 각도 표시' : ''
  }`;
  const sec = (result.t[frame] - result.t[0]).toFixed(3);

  return (
    <div className="space-y-3">
      <div
        ref={hostRef}
        role="group"
        tabIndex={0}
        aria-label={label}
        onKeyDown={onKey}
        className="relative aspect-[4/5] max-h-[60vh] w-full overflow-hidden rounded-2xl bg-[#151722] outline-none focus-visible:ring-2 focus-visible:ring-sky"
      >
        {status !== 'ready' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center text-sm text-[#c7cfdd]">
            {status === 'loading' && <p>인형을 만드는 중이에요</p>}
            {status === 'unavailable' && (
              <p>이 브라우저는 3D 를 그릴 수 없어요. 숫자는 아래에 그대로 있어요.</p>
            )}
            {status === 'error' && (
              <>
                <p>3D 를 불러오지 못했어요.</p>
                <button
                  type="button"
                  onClick={() => {
                    setStatus('loading');
                    setRetry((v) => v + 1);
                  }}
                  className="min-h-10 rounded-full bg-white/10 px-4 text-sm text-white"
                >
                  다시
                </button>
              </>
            )}
          </div>
        )}
        {lowSpan && status === 'ready' && (
          <p className="pointer-events-none absolute inset-x-3 bottom-3 rounded-xl bg-black/45 px-3 py-1.5 text-center text-xs text-[#dde3ee] backdrop-blur-sm">
            이 구간은 영상에서 잘 안 보였어요.
          </p>
        )}
        {/* 범례 · 이름표 — 둘 다 그림이라 보조 기술에는 숨긴다(아래 sr-only 목록이 읽어 준다) */}
        <ul
          ref={legendRef}
          aria-hidden
          className="pointer-events-none absolute left-3 top-3 flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-[#d6dee8]"
        >
          {LEGEND.map((l) => (
            <li key={l.key} className="flex items-center gap-[5px]">
              <i className="inline-block h-[3px] w-[10px] rounded-[2px]" style={{ background: measureHex(l.key) }} />
              {l.text}
            </li>
          ))}
        </ul>
        <div ref={labelsRef} aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden" />
      </div>
      <ul className="sr-only" aria-live="polite">
        {said.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggle}
          disabled={status !== 'ready'}
          aria-label={playing ? '멈춤' : '재생'}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink/6 text-ink transition-colors active:bg-ink/10 disabled:opacity-40"
        >
          {playing ? (
            <Pause aria-hidden className="h-5 w-5" />
          ) : (
            <Play aria-hidden className="h-5 w-5" />
          )}
        </button>
        <Scrubber frame={frame} n={n} result={result} onSeek={seek} />
        <span className="text-numeric w-16 shrink-0 text-right text-xs text-muted">
          {sec}s
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1.5" role="radiogroup" aria-label="재생 속도">
          {SPEEDS.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={speed === s.value}
              onClick={() => ctrl.current?.speed(s.value)}
              className={speed === s.value ? `${CHIP_BASE} ${CHIP_ON}` : CHIP_BASE}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex gap-1.5">
          {(['kneeUp', 'footPlant', 'release'] as const)
            .filter((k) => result.events[k] != null)
            .map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => seek(result.events[k]!)}
                className={
                  frame === result.events[k] ? `${CHIP_BASE} ${CHIP_ON}` : CHIP_BASE
                }
              >
                {EVENT_LABELS[k]}
              </button>
            ))}
        </div>
      </div>

      <Segmented
        label="시점"
        value={view}
        onChange={(v) => {
          setView(v);
          ctrl.current?.view(v, true);
        }}
        options={VIEWS}
      />
    </div>
  );
});

/** 재생 막대 — 엷은 회색 = 확신 낮은 구간, 작은 금 = 니업 · 착지 · 릴리스. 끌어서 장면을 고른다(키보드는 3D 칸에서) */
function Scrubber({
  frame,
  n,
  result,
  onSeek,
}: {
  frame: number;
  n: number;
  result: Pitch3dV2Ok;
  onSeek: (k: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pct = (k: number) => (n > 1 ? (k / (n - 1)) * 100 : 0);
  const pick = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const u = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    onSeek(Math.round(u * (n - 1)));
  };
  return (
    <div
      ref={ref}
      role="slider"
      aria-label="장면"
      aria-valuemin={0}
      aria-valuemax={n - 1}
      aria-valuenow={frame}
      aria-valuetext={`${frame + 1} / ${n}`}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        pick(e);
      }}
      onPointerMove={(e) => {
        if (e.currentTarget.hasPointerCapture(e.pointerId)) pick(e);
      }}
      className="relative min-w-0 flex-1 touch-none py-4"
    >
      <div className="relative h-1.5 overflow-hidden rounded-full bg-ink/10">
        {result.lowConf.map(([a, b]) => (
          <span
            key={`${a}-${b}`}
            aria-hidden
            className="absolute inset-y-0 bg-muted/40"
            style={{ left: `${pct(a)}%`, width: `${Math.max(0.5, pct(b) - pct(a))}%` }}
          />
        ))}
        <span
          aria-hidden
          className="absolute inset-y-0 left-0 bg-sky"
          style={{ width: `${pct(frame)}%` }}
        />
      </div>
      {(['kneeUp', 'footPlant', 'release'] as const).map((k) => {
        const at = result.events[k];
        if (at == null) return null;
        return (
          <span
            key={k}
            aria-hidden
            className="absolute top-2.5 h-4.5 w-0.5 -translate-x-1/2 rounded-full bg-ink/40"
            style={{ left: `${pct(at)}%` }}
          />
        );
      })}
      <span
        aria-hidden
        className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-sky shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
        style={{ left: `${pct(frame)}%` }}
      />
    </div>
  );
}
