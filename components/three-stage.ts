import type * as Three from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';

/**
 * 3D 무대 — 암케어 근육 지도(app/(app)/training/muscle-map-3d.tsx)와 전신 부위
 * 그림(components/body-map-3d.tsx)이 함께 쓴다.
 *
 * 두 3D 는 무엇을 칠하고 무엇을 누르는지만 다르고, 무대(렌더러 · 빛 · 돌리기 · 카메라
 * 옮기기 · 그릴 때만 그리기 · 치우기)는 같다. 처음에는 따로 들고 있어서 고칠 때마다 두 곳을
 * 고쳐야 했다(2026-09-26 검토) — 여기로 모았다.
 *
 * 지키는 것:
 * - three 는 여기서 import() 로 불러온다 — 3D 를 안 여는 화면에는 실리지 않는다.
 * - 모델은 주소마다 한 번만 받고 한 번만 읽는다(모듈에 들고 있는다). 창을 열 때마다
 *   다시 받고 다시 읽던 것을 없앴다. 조각의 모양(geometry)은 무대끼리 나눠 쓰므로
 *   치울 때 지우지 않는다 — 렌더러를 치우면(forceContextLoss) GPU 쪽 몫은 함께 풀린다.
 * - 그릴 일이 있을 때만 그린다(dirty). 화면 밖이면 그 확인조차 멈춘다.
 * - 치울 때 WebGL 연결까지 놓는다. 브라우저는 동시에 열 수 있는 연결 수를 넘으면 가장
 *   오래된 연결을 끊는다.
 */

export type StageStatus = 'loading' | 'ready' | 'unavailable' | 'error';
export type StageView = 'front' | 'side' | 'back';

let webgl: boolean | null = null;

/**
 * WebGL 을 쓸 수 있는가 — 한 번만 잰다.
 *
 * 재려고 만든 캔버스의 연결은 바로 놓는다. 예전에는 창을 열 때마다 잰 연결이 남아
 * 쌓였고, 쌓인 연결이 브라우저 한도를 넘으면 화면의 3D 지도가 끊길 수 있었다.
 */
export function hasWebGL(): boolean {
  if (webgl != null) return webgl;
  const probe = document.createElement('canvas');
  const gl = (probe.getContext('webgl2') ?? probe.getContext('webgl')) as
    | WebGLRenderingContext
    | WebGL2RenderingContext
    | null;
  webgl = gl != null;
  gl?.getExtension('WEBGL_lose_context')?.loseContext();
  return webgl;
}

type ThreeModules = [
  typeof import('three'),
  typeof import('three/addons/loaders/GLTFLoader.js'),
  typeof import('three/addons/controls/OrbitControls.js'),
  typeof import('three/addons/environments/RoomEnvironment.js'),
];

let modules: Promise<ThreeModules> | null = null;

function loadThree(): Promise<ThreeModules> {
  if (!modules) {
    modules = Promise.all([
      import('three'),
      import('three/addons/loaders/GLTFLoader.js'),
      import('three/addons/controls/OrbitControls.js'),
      import('three/addons/environments/RoomEnvironment.js'),
    ]);
    /* 받다가 끊겼으면 다음에 다시 받게 */
    modules.catch(() => {
      modules = null;
    });
  }
  return modules;
}

const models = new Map<string, Promise<GLTF>>();

function loadModel(url: string, loader: ThreeModules[1]['GLTFLoader']): Promise<GLTF> {
  let model = models.get(url);
  if (!model) {
    model = new loader().loadAsync(url);
    models.set(url, model);
    model.catch(() => models.delete(url));
  }
  return model;
}

export type Stage = {
  THREE: typeof Three;
  /** 이 무대에 올린 모델(복제본). 조각(mesh)의 재질은 부른 쪽이 입히고 치운다 */
  root: Three.Object3D;
  renderer: Three.WebGLRenderer;
  camera: Three.PerspectiveCamera;
  /** 다음 틀에 다시 그린다 */
  invalidate: () => void;
  /** 반지름 radius 인 것을 pad 배 여유로 화면에 담는 거리 */
  fit: (radius: number, pad: number) => number;
  /** center 를 dir 쪽에서 dist 만큼 떨어져 보게 카메라를 옮긴다 */
  moveTo: (
    center: Three.Vector3,
    dir: Three.Vector3,
    dist: number,
    animate: boolean
  ) => void;
  /** 치운다 — 부른 쪽이 입힌 재질은 부른 쪽이 먼저 치운다 */
  dispose: () => void;
};

/**
 * el 안에 3D 무대를 차린다. 모델을 받는 사이에 화면이 치워졌으면(isDisposed) 아무것도
 * 만들지 않고 null 을 돌려준다. 받다가 실패하면 던진다 — GPU 쪽은 그 전에 만들지 않는다.
 */
export async function createStage(
  el: HTMLElement,
  opts: {
    modelUrl: string;
    /** 화면 낭독기가 읽는 이름 */
    label: string;
    minDistance: number;
    maxDistance: number;
  },
  isDisposed: () => boolean
): Promise<Stage | null> {
  const [THREE, { GLTFLoader }, { OrbitControls }, { RoomEnvironment }] =
    await loadThree();
  const gltf = await loadModel(opts.modelUrl, GLTFLoader);
  if (isDisposed()) return null;

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.localClippingEnabled = true;
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.setAttribute('aria-label', opts.label);
  el.prepend(renderer.domElement);
  /* 다시 그릴 일이 있는가 — 있을 때만 그린다(아래 tick) */
  let dirty = true;

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envMap;
  scene.environmentIntensity = 0.45;

  const camera = new THREE.PerspectiveCamera(32, 1, 0.01, opts.maxDistance * 4);
  scene.add(camera);
  /* 빛은 카메라를 따라 돈다 — 어느 쪽에서 봐도 앞에서 비추고 뒤에서 테두리를 살린다 */
  const lights = [
    new THREE.DirectionalLight('#ffffff', 2.4),
    new THREE.DirectionalLight('#e0f2fe', 0.6),
    new THREE.DirectionalLight('#ffffff', 1.4),
  ];
  lights[0].position.set(-0.8, 1.2, 1.4);
  lights[1].position.set(1.2, 0.2, 0.8);
  lights[2].position.set(0.4, 0.8, -1.6);
  for (const light of lights) {
    light.target.position.set(0, 0, -1);
    camera.add(light, light.target);
  }
  scene.add(new THREE.HemisphereLight('#ffffff', '#94a3b8', 0.35));

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.rotateSpeed = 0.8;
  controls.minDistance = opts.minDistance;
  controls.maxDistance = opts.maxDistance;
  controls.addEventListener('change', () => {
    dirty = true;
  });
  /*
   * OrbitControls 는 손가락 스크롤을 모두 막는다(touch-action: none). 위아래는 화면
   * 스크롤에 돌려준다 — 3D 가 화면을 크게 차지해도 쓸어서 내려갈 수 있게. 좌우로 끌면 돈다.
   */
  renderer.domElement.style.touchAction = 'pan-y';

  const root = gltf.scene.clone(true);
  root.updateMatrixWorld(true);
  scene.add(root);

  const fit = (radius: number, pad: number) => {
    const v = THREE.MathUtils.degToRad(camera.fov);
    const h = 2 * Math.atan(Math.tan(v / 2) * camera.aspect);
    return (radius * pad) / Math.sin(Math.min(v, h) / 2);
  };

  /* 카메라 옮기기 — 몸을 뚫고 가지 않게 둘레(구면)를 돌아서 간다. 시작·끝은 한 번만 잰다 */
  let tween: {
    t: number;
    from: Three.Spherical;
    to: Three.Spherical;
    dTheta: number;
    fromTarget: Three.Vector3;
    toTarget: Three.Vector3;
  } | null = null;
  const step = new THREE.Spherical();
  const offset = new THREE.Vector3();
  const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const moveTo: Stage['moveTo'] = (center, dir, dist, animate) => {
    const toPos = center.clone().addScaledVector(dir, dist);
    if (!animate || reduced()) {
      tween = null;
      controls.target.copy(center);
      camera.position.copy(toPos);
      controls.update();
      dirty = true;
      return;
    }
    const from = new THREE.Spherical().setFromVector3(
      camera.position.clone().sub(controls.target)
    );
    const to = new THREE.Spherical().setFromVector3(toPos.clone().sub(center));
    let dTheta = to.theta - from.theta;
    if (dTheta > Math.PI) dTheta -= 2 * Math.PI;
    if (dTheta < -Math.PI) dTheta += 2 * Math.PI;
    tween = {
      t: 0,
      from,
      to,
      dTheta,
      fromTarget: controls.target.clone(),
      toTarget: center,
    };
  };

  /* ── 크기 · 그리기 ── */
  const resize = () => {
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    dirty = true;
  };
  const sizer = new ResizeObserver(resize);
  sizer.observe(el);
  resize();

  const tick = () => {
    if (tween) {
      tween.t = Math.min(1, tween.t + 0.045);
      const k = 1 - Math.pow(1 - tween.t, 3);
      controls.target.lerpVectors(tween.fromTarget, tween.toTarget, k);
      step.set(
        tween.from.radius + (tween.to.radius - tween.from.radius) * k,
        tween.from.phi + (tween.to.phi - tween.from.phi) * k,
        tween.from.theta + tween.dTheta * k
      );
      camera.position.copy(controls.target).add(offset.setFromSpherical(step));
      if (tween.t >= 1) tween = null;
      dirty = true;
    }
    /* 손을 뗀 뒤에도 잠시 미끄러진다(damping) — 움직였으면 true */
    if (controls.update()) dirty = true;
    if (!dirty) return;
    dirty = false;
    renderer.render(scene, camera);
  };
  const seen = new IntersectionObserver(([entry]) => {
    dirty = true;
    renderer.setAnimationLoop(entry?.isIntersecting ? tick : null);
  });
  seen.observe(el);

  return {
    THREE,
    root,
    renderer,
    camera,
    invalidate: () => {
      dirty = true;
    },
    fit,
    moveTo,
    dispose: () => {
      seen.disconnect();
      sizer.disconnect();
      renderer.setAnimationLoop(null);
      controls.dispose();
      envMap.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    },
  };
}
