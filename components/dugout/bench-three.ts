import {
  ACESFilmicToneMapping,
  AmbientLight,
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
  type BufferGeometry,
  type Material,
  type Object3D,
} from 'three';

/**
 * 같이 연습 카드의 입체 벤치(2026-10-27 승인 시안의 scene.ts 를 옮김 — 파란 덕아웃 벤치 · 실밥 공 · 나무 배트 · 받침).
 * 이 파일은 components/dugout/bench-card.tsx 가 카드가 화면에 들어올 때만 불러온다(three 를 첫 화면 묶음에 싣지 않는다).
 *
 * 그리기는 필요할 때만 — 손으로 돌릴 때 · 놓은 뒤 미끄러질 때 · 크기가 바뀔 때. 멈춘 장면을 매 장면 다시 그리지 않는다.
 * 옆으로 밀면 돌고 짧게 누르면 살짝 돈다. 세로 스크롤은 브라우저에 맡긴다(받침의 touch-action: pan-y — 세로로 밀면 pointercancel 이 온다).
 * 동작 줄이기면 미끄러짐 없이 누를 때 한 번에 조금만 돈다. 화면 해상도는 1.6배까지 · 저전력.
 * WebGL 을 못 만들거나 문맥을 잃으면 onLost — 카드가 정적 그림으로 돌아간다(모임 보기 · 참가는 그대로).
 * 돌려주는 함수가 장면 · 재질 · 무늬 · 렌더러 · 관찰자 · 손 이벤트를 모두 놓는다.
 */
export function mountBench(
  host: HTMLElement,
  opts: { reduced: boolean; pass: { md: string; line: string } | null; onReady: () => void; onLost: () => void }
): () => void {
  let disposed = false;
  let raf = 0;
  let dragging = false;
  let velocity = 0;
  let lastX = 0;
  let moved = 0;
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch {
    opts.onLost();
    return () => {};
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  const canvas = renderer.domElement;
  canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
  host.appendChild(canvas);

  const scene = new Scene();
  const camera = new PerspectiveCamera(34, 1, 0.1, 100);
  camera.lookAt(0, 0.7, 0);
  scene.add(new AmbientLight(0xc5eaff, 2.5));
  const key = new DirectionalLight(0xfff5e6, 4.2);
  key.position.set(-3, 7, 5);
  key.castShadow = true;
  key.shadow.mapSize.set(512, 512);
  Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5 });
  key.shadow.bias = -0.001;
  scene.add(key);
  const rim = new DirectionalLight(0x66c9ff, 3.2);
  rim.position.set(5, 4, -4);
  scene.add(rim);

  const model = new Group();
  model.rotation.y = -0.36;
  scene.add(model);
  const blue = new MeshStandardMaterial({ color: 0x028ede, roughness: 0.33, metalness: 0.17 });
  const edgeBlue = new MeshStandardMaterial({ color: 0x00568f, roughness: 0.5, metalness: 0.35 });
  const lightBlue = new MeshStandardMaterial({ color: 0x6ec7f3, roughness: 0.5 });
  const dark = new MeshStandardMaterial({ color: 0x16425b, roughness: 0.6, metalness: 0.35 });
  const white = new MeshStandardMaterial({ color: 0xeef5f4, roughness: 0.8 });
  const add = (o: Object3D) => {
    o.traverse((x) => {
      if ((x as Mesh).isMesh) x.castShadow = x.receiveShadow = true;
    });
    model.add(o);
    return o;
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, m: Material = blue) => {
    const mesh = new Mesh(new BoxGeometry(w, h, d), m);
    mesh.position.set(x, y, z);
    return add(mesh);
  };

  const base = new Mesh(new CylinderGeometry(2.2, 2.3, 0.15, 64), new MeshStandardMaterial({ color: 0x0c4465, roughness: 0.7 }));
  base.position.y = -0.04;
  add(base);
  const ring = new Mesh(new CylinderGeometry(2.22, 2.22, 0.04, 64), new MeshStandardMaterial({ color: 0x3d9aca, roughness: 0.5, metalness: 0.2 }));
  ring.position.y = -0.12;
  model.add(ring);
  const floor = new Mesh(new PlaneGeometry(20, 20), new MeshStandardMaterial({ color: 0x062b4a, transparent: true, opacity: 0.1, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.13;
  floor.receiveShadow = true;
  scene.add(floor);

  /* 벤치 — 다리 · 받침 · 등받이 기둥 · 앉는 판 셋 · 등받이 둘 · 밝은 테두리 */
  for (const x of [-1.02, 1.02]) {
    box(0.13, 0.72, 0.13, x, 0.4, 0.08, dark);
    box(0.13, 0.72, 0.13, x, 0.4, -0.57, dark);
    box(0.38, 0.07, 0.95, x, 0.07, -0.24, edgeBlue);
    box(0.12, 1.45, 0.12, x, 0.76, -0.72, dark);
  }
  for (const z of [-0.5, -0.23, 0.04]) box(2.8, 0.1, 0.23, 0, 0.8, z);
  for (const y of [1.1, 1.37]) box(2.8, 0.22, 0.1, 0, y, -0.7);
  box(2.65, 0.025, 0.035, 0, 1.48, -0.64, lightBlue);
  box(2.64, 0.025, 0.035, 0, 0.865, 0.15, lightBlue);
  /* 수건 */
  const towel = box(0.48, 0.025, 0.62, -0.68, 0.87, -0.15, white);
  towel.rotation.y = 0.08;
  box(0.48, 0.36, 0.025, -0.66, 0.7, 0.19, white);
  box(0.48, 0.04, 0.031, -0.66, 0.57, 0.207);

  /* 공 — 가죽 무늬 + 빨간 실밥 */
  const textures: CanvasTexture[] = [];
  const canvasTexture = (w: number, h: number, paint: (c: CanvasRenderingContext2D) => void) => {
    const el = document.createElement('canvas');
    el.width = w;
    el.height = h;
    paint(el.getContext('2d')!);
    const t = new CanvasTexture(el);
    t.colorSpace = SRGBColorSpace;
    textures.push(t);
    return t;
  };
  const leather = canvasTexture(256, 256, (c) => {
    c.fillStyle = '#f3f1e7';
    c.fillRect(0, 0, 256, 256);
    let seed = 29;
    for (let i = 0; i < 9000; i++) {
      seed = (seed * 16807) % 2147483647;
      const x = seed % 256;
      seed = (seed * 16807) % 2147483647;
      const y = seed % 256;
      c.fillStyle = i % 2 ? 'rgba(103,113,113,.08)' : 'rgba(255,255,255,.55)';
      c.beginPath();
      c.arc(x, y, 0.5, 0, Math.PI * 2);
      c.fill();
    }
  });
  const ball = new Group();
  ball.add(new Mesh(new SphereGeometry(0.285, 36, 24), new MeshStandardMaterial({ color: 0xf9f7ef, map: leather, roughness: 0.9 })));
  const thread = new MeshStandardMaterial({ color: 0xb73b32, roughness: 0.8 });
  const seam = (sign: number, t: number) => {
    const x = sign * (0.52 + 0.1 * Math.cos(2 * t));
    const r = Math.sqrt(1 - x * x);
    return new Vector3(x, r * Math.sin(t), r * Math.cos(t));
  };
  for (const sign of [-1, 1]) {
    const pts = Array.from({ length: 89 }, (_, i) => seam(sign, (i / 88) * Math.PI * 2).multiplyScalar(0.288));
    ball.add(new Mesh(new TubeGeometry(new CatmullRomCurve3(pts, true), 88, 0.0032, 4, true), thread));
    for (let i = 0; i < 27; i++) {
      const t = ((i + 0.5) / 27) * Math.PI * 2;
      const p = seam(sign, t);
      const tangent = seam(sign, t + 0.01).sub(seam(sign, t - 0.01)).normalize();
      const side = new Vector3().crossVectors(tangent, p).normalize();
      const a = p.clone().addScaledVector(side, -0.045).addScaledVector(tangent, -0.02).normalize().multiplyScalar(0.291);
      const mid = p.clone().addScaledVector(tangent, 0.02).normalize().multiplyScalar(0.293);
      const b = p.clone().addScaledVector(side, 0.045).addScaledVector(tangent, -0.02).normalize().multiplyScalar(0.291);
      ball.add(new Mesh(new TubeGeometry(new CatmullRomCurve3([a, mid, b]), 5, 0.0045, 4, false), thread));
    }
  }
  ball.position.set(0.5, 1.11, -0.05);
  ball.rotation.set(0.2, 0.3, -0.4);
  add(ball);

  /* 배트 */
  const bat = new Group();
  const wood = new MeshStandardMaterial({ color: 0xc49660, roughness: 0.65 });
  const grip = new MeshStandardMaterial({ color: 0x1b3445, roughness: 0.9 });
  const part = (g: BufferGeometry, m: Material, y: number) => {
    const mesh = new Mesh(g, m);
    mesh.position.y = y;
    bat.add(mesh);
  };
  part(new CylinderGeometry(0.085, 0.045, 1.2, 20), wood, 0.8);
  part(new SphereGeometry(0.085, 20, 12), wood, 1.4);
  part(new CylinderGeometry(0.03, 0.035, 0.49, 16), grip, 0.18);
  part(new CylinderGeometry(0.06, 0.06, 0.045, 16), grip, -0.08);
  bat.position.set(1.45, 0.14, -0.1);
  bat.rotation.set(0.14, 0, -0.18);
  add(bat);

  /* 앉는 판 위 종이 연습표 — 실제 번개의 날짜 · 종목(시안의 고정 '10.31'을 쓰지 않는다) */
  if (opts.pass) {
    const { md, line } = opts.pass;
    const pass = canvasTexture(512, 320, (c) => {
      c.fillStyle = '#f9f7ee';
      c.fillRect(0, 0, 512, 320);
      c.fillStyle = '#123550';
      c.font = '700 32px sans-serif';
      c.fillText('DUGOUT', 32, 52);
      c.font = '800 96px sans-serif';
      c.fillText(md, 28, 159);
      c.font = '600 26px sans-serif';
      c.fillText(line, 32, 219);
    });
    const paper = new Mesh(new BoxGeometry(0.83, 0.012, 0.52), new MeshStandardMaterial({ map: pass, roughness: 0.84 }));
    paper.position.set(0.03, 0.885, 0.04);
    paper.rotation.y = -0.13;
    add(paper);
  }
  /* 등받이 이름표 */
  const badgeTex = canvasTexture(256, 64, (c) => {
    c.fillStyle = '#0078b8';
    c.fillRect(0, 0, 256, 64);
    c.fillStyle = '#d9f3ff';
    c.font = '700 27px sans-serif';
    c.textAlign = 'center';
    c.fillText('DUGOUT', 128, 42);
  });
  const badge = new Mesh(new PlaneGeometry(0.58, 0.145), new MeshStandardMaterial({ map: badgeTex, roughness: 0.6, side: DoubleSide }));
  badge.position.set(0, 1.37, -0.638);
  model.add(badge);

  const draw = () => {
    if (!disposed) renderer.render(scene, camera);
  };
  const resize = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (disposed || !w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 작은 타일에서도 받침과 벤치가 잘리지 않게 카메라를 뒤로 둔다.
    camera.position.set(3.4, 2.9, 7);
    camera.lookAt(0, 0.7, 0);
    camera.updateProjectionMatrix();
    draw();
  };
  const coast = () => {
    if (!disposed && !dragging && Math.abs(velocity) > 0.0003) {
      model.rotation.y += velocity;
      velocity *= 0.89;
      draw();
      raf = requestAnimationFrame(coast);
    } else raf = 0;
  };
  const down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    lastX = e.clientX;
    moved = 0;
    velocity = 0;
    dragging = true;
    cancelAnimationFrame(raf);
    raf = 0;
  };
  const move = (e: PointerEvent) => {
    if (!dragging || opts.reduced) return;
    const dx = e.clientX - lastX;
    lastX = e.clientX;
    moved += Math.abs(dx);
    velocity = Math.max(-0.06, Math.min(0.06, dx * 0.012));
    model.rotation.y += velocity;
    draw();
  };
  const up = () => {
    if (!dragging) return;
    dragging = false;
    if (!opts.reduced && !raf) raf = requestAnimationFrame(coast);
  };
  const click = () => {
    if (moved > 5) return;
    if (opts.reduced) {
      model.rotation.y += 0.45;
      draw();
    } else {
      velocity = 0.045;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(coast);
    }
  };
  const lost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(raf);
    raf = 0;
    opts.onLost();
  };
  host.addEventListener('pointerdown', down);
  host.addEventListener('pointermove', move);
  host.addEventListener('pointerup', up);
  host.addEventListener('pointercancel', up);
  host.addEventListener('pointerleave', up);
  host.addEventListener('click', click);
  canvas.addEventListener('webglcontextlost', lost);
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  opts.onReady();

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    observer.disconnect();
    host.removeEventListener('pointerdown', down);
    host.removeEventListener('pointermove', move);
    host.removeEventListener('pointerup', up);
    host.removeEventListener('pointercancel', up);
    host.removeEventListener('pointerleave', up);
    host.removeEventListener('click', click);
    canvas.removeEventListener('webglcontextlost', lost);
    const geometries = new Set<BufferGeometry>();
    const materials = new Set<Material>();
    scene.traverse((o) => {
      const m = o as Mesh;
      if (m.geometry) geometries.add(m.geometry);
      if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => materials.add(x));
    });
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    renderer.dispose();
    canvas.remove();
  };
}
