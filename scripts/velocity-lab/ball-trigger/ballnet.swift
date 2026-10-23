import CoreML
import Foundation

/// 폰 안 공 알림(학습 모델) — docs/velocity/redesign/SPEC-detect.md D1. 맥 시험대에서 먼저 재고(D1), 통과하면 앱(DualCameraCore.swift)으로 옮긴다(D3).
/// 카메라 장면(가로 밝기 면, 세로로 돌려 봄)을 사이트 훑기와 같은 입력으로 — 세로 416×736(netInputSize), 연속 세 장면 밝기 0~1 — 장면 둘에 하나(30Hz)
/// 모델에 넣고, 사이트 findThrowRun(lib/velocity-engine/ball-net.ts)과 같은 묶음 규칙으로 '날아가는 공'이면 알린다.
final class BallNetTrigger {
    struct Hit { let t: Double; let x: Float; let y: Float; let d: Float; let score: Float }
    struct Alert { let atSec: Double; let n: Int; let first: Hit; let last: Hit }

    /// 사이트와 같은 값(ball-net.ts)
    static let threshold: Float = 0.5
    static let runGapSec = 0.45
    static let runMinMovePxPerSec: Float = 30
    static let runMinMoveFloorPx: Float = 2
    static let runMinHits = 3
    /// 한 공에 알림 하나 — 알린 뒤 이만큼은 새 묶음을 안 받는다(공이 받는 면에 닿는 0.6초 + 여유)
    static let cooldownSec = 1.2

    let inW = 416, inH = 736
    private let model: MLModel
    private var ring: [[Float]] = []
    private var frames = 0
    private var run: [Hit] = []
    private var cooldownUntil = -Double.infinity
    private let input: MLMultiArray
    /// 맞춘 시간(ms) 합 · 횟수 — 시험대가 장면당 시간을 찍는다
    private(set) var predictMs = 0.0
    private(set) var predicts = 0

    init(modelURL: URL) throws {
        let cfg = MLModelConfiguration()
        cfg.computeUnits = .all
        model = try MLModel(contentsOf: modelURL, configuration: cfg)
        input = try MLMultiArray(shape: [1, 3, NSNumber(value: inH), NSNumber(value: inW)], dataType: .float32)
    }

    /// 가로 밝기 면(w × h, 회전 −90 으로 찍힌 세로 영상) → 세로 inW × inH 로 돌리며 칸 평균(0~1)
    private func shrink(_ luma: UnsafePointer<UInt8>, _ w: Int, _ h: Int, _ stride: Int) -> [Float] {
        var out = [Float](repeating: 0, count: inW * inH)
        let sx = Double(h) / Double(inW)  // 출력 x 는 원본 y 를 거꾸로
        let sy = Double(w) / Double(inH)  // 출력 y 는 원본 x
        for oy in 0..<inH {
            let x0 = Int(Double(oy) * sy), x1 = max(x0 + 1, Int(Double(oy + 1) * sy))
            for ox in 0..<inW {
                let yHi = h - Int(Double(ox) * sx), yLo = max(0, min(yHi - 1, h - Int(Double(ox + 1) * sx)))
                var s = 0, n = 0
                var yy = yLo
                while yy < yHi {
                    let row = luma + yy * stride
                    var xx = x0
                    while xx < x1 { s += Int(row[xx]); xx += 1 }
                    n += x1 - x0
                    yy += 1
                }
                out[oy * inW + ox] = Float(s) / Float(max(1, n) * 255)
            }
        }
        return out
    }

    private func detect(t: Double) -> Hit? {
        let n = inW * inH
        let p = input.dataPointer.assumingMemoryBound(to: Float.self)
        for c in 0..<3 { ring[c].withUnsafeBufferPointer { p.advanced(by: c * n).update(from: $0.baseAddress!, count: n) } }
        let t0 = Date()
        guard let out = try? model.prediction(from: MLDictionaryFeatureProvider(dictionary: ["frames": MLFeatureValue(multiArray: input)])),
              let hs = out.featureValue(for: "heat_size")?.multiArrayValue
        else { return nil }
        predictMs += Date().timeIntervalSince(t0) * 1000
        predicts += 1
        let hh = hs.shape[2].intValue, hw = hs.shape[3].intValue, plane = hh * hw
        var best = -Float.infinity, bi = 0
        // fp16 모델이어도 출력은 float32 로 받는다(MLMultiArray 가 바꿔 줌) — 모양을 보고 읽는다
        if hs.dataType == .float32 {
            let q = hs.dataPointer.assumingMemoryBound(to: Float.self)
            for i in 0..<plane where q[i] > best { best = q[i]; bi = i }
            let iy = bi / hw, ix = bi - iy * hw
            return Hit(t: t, x: (Float(ix) + 0.5) * 4, y: (Float(iy) + 0.5) * 4, d: exp(q[plane + bi]), score: 1 / (1 + exp(-best)))
        }
        for i in 0..<plane { let v = hs[i].floatValue; if v > best { best = v; bi = i } }
        let iy = bi / hw, ix = bi - iy * hw
        return Hit(t: t, x: (Float(ix) + 0.5) * 4, y: (Float(iy) + 0.5) * 4, d: exp(hs[plane + bi].floatValue), score: 1 / (1 + exp(-best)))
    }

    /// 장면 하나(60fps) — 둘에 하나만 모델에 넣는다. 알릴 공이면 Alert(시각 = 묶음의 첫 표본)
    func feed(luma: UnsafePointer<UInt8>, width: Int, height: Int, stride: Int, t: Double) -> Alert? {
        ring.append(shrink(luma, width, height, stride))
        if ring.count > 3 { ring.removeFirst() }
        frames += 1
        guard ring.count == 3, frames % 2 == 0, let h = detect(t: t) else { return nil }
        if let last = run.last, t - last.t > Self.runGapSec { run = [] }
        guard h.score >= Self.threshold, t >= cooldownUntil else { return nil }
        if let p = run.last {
            let dt = Float(h.t - p.t)
            let moved = hypot(h.x - p.x, h.y - p.y) >= max(Self.runMinMoveFloorPx, Self.runMinMovePxPerSec * dt)
            if moved && h.d <= p.d * 1.35 { run.append(h) } else { run = [h] }
        } else {
            run = [h]
        }
        guard run.count >= Self.runMinHits else { return nil }
        let a = Alert(atSec: run[0].t, n: run.count, first: run[0], last: h)
        run = []
        cooldownUntil = t + Self.cooldownSec
        return a
    }
}
