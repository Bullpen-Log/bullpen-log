#!/usr/bin/env node
// 손떨림 보정이 화면을 몇 배 키웠나(DualCameraPlugin.swift 의 STAB_CROP_MEASURED 에 기종 이름으로 넣는다) — 개발용 앱이 카메라를 처음 켤 때 남긴 두 장(보정 켬 on.pgm · 끔 off.pgm, 같은 자리에서
// 멈춘 장면)을 견준다. on 의 한 점 = off 의 가운데 기준 1/s 배 자리(+ 옮김). s · 옮김을 훑어 밝기 상관(NCC)이 가장 큰 값을 고른다.
// on2(다시 켠 장면)가 있으면 on 과 견줘 그새 폰이 움직이지 않았나 본다(배율 1 · 상관이 높아야 믿는다).
// 렌즈 값(info.json 의 fx)이 있으면 그것으로 낸 화각과 나란히 보인다.
//   node scripts/velocity-lab/fov-crop.mjs ~/bullpen-velocity-lab/device/fov-<시각>
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const dir = process.argv[2]
if (!dir) {
  console.error('쓰는 법: node scripts/velocity-lab/fov-crop.mjs <fov 폴더>')
  process.exit(1)
}

function readPGM(file) {
  const buf = readFileSync(file)
  const head = buf.subarray(0, 64).toString('latin1').split(/\s+/)
  const [magic, w, h, max] = head
  if (magic !== 'P5' || max !== '255') throw new Error(`${file}: P5 가 아니에요`)
  const off = buf.indexOf('\n255\n') + 5
  return { w: +w, h: +h, px: buf.subarray(off, off + w * h) }
}

function shrink(img, k) {
  const w = Math.floor(img.w / k)
  const h = Math.floor(img.h / k)
  const px = new Float32Array(w * h)
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0
      for (let j = 0; j < k; j++) for (let i = 0; i < k; i++) s += img.px[(y * k + j) * img.w + x * k + i]
      px[y * w + x] = s / (k * k)
    }
  return { w, h, px }
}

function sample(img, x, y) {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  if (x0 < 0 || y0 < 0 || x0 >= img.w - 1 || y0 >= img.h - 1) return NaN
  const fx = x - x0
  const fy = y - y0
  const i = y0 * img.w + x0
  const p = img.px
  return (p[i] * (1 - fx) + p[i + 1] * fx) * (1 - fy) + (p[i + img.w] * (1 - fx) + p[i + img.w + 1] * fx) * fy
}

// on 의 안쪽 70% 를 step 간격으로 짚어 off 의 대응 자리와 상관
function ncc(on, off, s, tx, ty, step) {
  const cx = on.w / 2
  const cy = on.h / 2
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0
  for (let y = Math.round(on.h * 0.15); y < on.h * 0.85; y += step)
    for (let x = Math.round(on.w * 0.15); x < on.w * 0.85; x += step) {
      const b = sample(off, cx + (x - cx) / s + tx, cy + (y - cy) / s + ty)
      if (Number.isNaN(b)) continue
      const a = on.px[y * on.w + x]
      n++
      sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b
    }
  const va = saa - (sa * sa) / n
  const vb = sbb - (sb * sb) / n
  return (sab - (sa * sb) / n) / Math.sqrt(va * vb)
}

function search(on, off, ss, ts, step, start) {
  let best = { r: -2 }
  for (const s of ss)
    for (const tx of ts) for (const ty of ts) {
      const r = ncc(on, off, s, start.tx + tx, start.ty + ty, step)
      if (r > best.r) best = { r, s, tx: start.tx + tx, ty: start.ty + ty }
    }
  return best
}

const range = (a, b, d) => Array.from({ length: Math.round((b - a) / d) + 1 }, (_, i) => a + i * d)

const on = readPGM(join(dir, 'on.pgm'))
const off = readPGM(join(dir, 'off.pgm'))
const K = 4
const onS = shrink(on, K)
const offS = shrink(off, K)
const coarse = search(onS, offS, range(1, 1.35, 0.005), range(-12, 12, 1), 3, { tx: 0, ty: 0 })
const fine = search(
  { ...on, px: Float32Array.from(on.px) },
  { ...off, px: Float32Array.from(off.px) },
  range(coarse.s - 0.008, coarse.s + 0.008, 0.0005),
  range(-4, 4, 0.5),
  6,
  { tx: coarse.tx * K, ty: coarse.ty * K },
)
const same = ncc(onS, offS, 1, 0, 0, 3)
const check = existsSync(join(dir, 'on2.pgm'))
  ? (() => {
      const on2S = shrink(readPGM(join(dir, 'on2.pgm')), K)
      return search(onS, on2S, range(0.98, 1.02, 0.002), range(-6, 6, 1), 3, { tx: 0, ty: 0 })
    })()
  : null

const info = JSON.parse(readFileSync(join(dir, 'info.json'), 'utf8'))
const deg = (r) => (r * 180) / Math.PI
const fovOf = (shot) => (shot?.fx ? deg(2 * Math.atan(shot.width / 2 / shot.fx)) : null)
const narrow = (fov, k) => deg(2 * Math.atan(Math.tan((fov * Math.PI) / 360) / k))
const fmt = (v, d = 2) => (v == null ? '없음' : v.toFixed(d))

console.log(`보정 배율 s = ${fine.s.toFixed(4)}  (상관 ${fine.r.toFixed(3)}, 그대로 견주면 ${same.toFixed(3)}) · 옮김 ${fine.tx.toFixed(1)}, ${fine.ty.toFixed(1)}px`)
if (check)
  console.log(`움직임 확인(on · on2): 배율 ${check.s.toFixed(3)} · 옮김 ${(check.tx * K).toFixed(0)}, ${(check.ty * K).toFixed(0)}px · 상관 ${check.r.toFixed(3)}` + (Math.abs(check.s - 1) > 0.004 || check.r < 0.9 ? '  ← 그새 폰이 움직였어요. 다시 재요.' : ''))
if (fine.r < 0.9) console.log('← on · off 가 잘 안 맞아요(상관 0.9 밑). 장면에 무늬가 적거나 폰이 움직였어요.')
console.log(`기종 ${info.model ?? '모름'} · 장면 모드 on=${info.on?.stab} off=${info.off?.stab} (0 끔 · 1 표준 …) · 줌 ${info.zoom} · 렌즈 값 지원 ${info.intrinsicsSupported} 켬 ${info.intrinsicsEnabled}`)
console.log(`형식 화각 ${fmt(info.formatFovDeg)}° → 줌 ${fmt(info.mainFovDeg)}° → 보정 ${fmt(narrow(info.mainFovDeg, fine.s))}° (지금 짐작 1.1 이면 ${fmt(narrow(info.mainFovDeg, 1.1))}°)`)
const fOn = fovOf(info.on)
const fOff = fovOf(info.off)
console.log(`렌즈 값 화각: 보정 켬 ${fmt(fOn)}° · 끔 ${fmt(fOff)}°` + (info.on?.fx && info.off?.fx ? ` · fx 비 ${(info.on.fx / info.off.fx).toFixed(4)}` : ''))
