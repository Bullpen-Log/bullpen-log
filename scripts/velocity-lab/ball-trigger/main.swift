import AVFoundation
import Foundation
// 사용: run <영상>... — 각 영상에서 알린 때를 찍는다(앱과 같은 MotionTrigger)
for path in CommandLine.arguments.dropFirst() {
  if path.hasSuffix(".y8") {
    // 밝기 장면 묶음(dump) — <이름>.json 의 w · h · t
    let meta = try! JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: String(path.dropLast(3)) + ".json"))) as! [String: Any]
    let w = meta["w"] as! Int, h = meta["h"] as! Int, ts = meta["t"] as! [Double]
    let data = try! Data(contentsOf: URL(fileURLWithPath: path))
    let trig = MotionTrigger()
    let nm = (path as NSString).lastPathComponent
    if ProcessInfo.processInfo.environment["V"] != nil { trig.debug = { print("\(nm) \($0) T0=0") } }
    var hits: [String] = []
    data.withUnsafeBytes { raw in
      let base = raw.bindMemory(to: UInt8.self).baseAddress!
      for (k, t) in ts.enumerated() {
        if let hh = trig.feed(luma: base + k * w * h, width: w, height: h, stride: w, t: t) {
          hits.append(String(format: "%@ %.2fs(넓이 %.0f→%.0f)", hh.kind, hh.atSec, hh.areaFirst, hh.areaLast))
        }
      }
    }
    print("\((path as NSString).lastPathComponent): \(ts.count)장 · 알림 \(hits.count): \(hits.joined(separator: " | "))")
    continue
  }
  let asset = AVURLAsset(url: URL(fileURLWithPath: path))
  guard let track = asset.tracks(withMediaType: .video).first else { print("\(path): 영상 없음"); continue }
  let reader = try! AVAssetReader(asset: asset)
  let out = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange])
  out.alwaysCopiesSampleData = false
  reader.add(out); reader.startReading()
  let trig = MotionTrigger()
  let verbose = ProcessInfo.processInfo.environment["V"] != nil
  var t0v = -1.0
  let name0 = (path as NSString).lastPathComponent
  if verbose { trig.debug = { print("\(name0) \($0) T0=\(t0v)") } }
  var hits: [String] = []
  var n = 0, t0 = -1.0, tl = 0.0
  var ms = 0.0
  while let sb = out.copyNextSampleBuffer() {
    let t = CMSampleBufferGetPresentationTimeStamp(sb).seconds
    if t0 < 0 { t0 = t; t0v = t }
    tl = t
    let c = Date()
    if let h = trig.feed(sb) {
      hits.append(String(format: "%@ %.2fs(len %d, 넓이 %.0f→%.0f, 자리 %.0f,%.0f, s %.0f)", h.kind, h.atSec - t0, h.length, h.areaFirst, h.areaLast, h.x, h.y, h.strength))
    }
    ms += Date().timeIntervalSince(c) * 1000
    n += 1
  }
  let name = (path as NSString).lastPathComponent
  print("\(name): \(String(format: "%.1f", tl - t0))초 \(n)장 · 장면당 \(String(format: "%.2f", ms / Double(max(1, n))))ms · 알림 \(hits.count): \(hits.joined(separator: " | "))")
}
