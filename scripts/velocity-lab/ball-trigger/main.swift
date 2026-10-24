import AVFoundation
import Foundation
// 사용: run <영상>... — 각 영상에서 알린 때를 찍는다(앱과 같은 MotionTrigger)
//       run --concat [--net=<.mlmodelc>] <영상@녹화시각>... — 세션 녹화 조각을 한 흐름으로 이어 먹인다(겹친 장면은 앞 조각 것), 알림마다
//       'HIT 종류 시각 길이 세기' 한 줄, --net 이면 학습 모델 알림(ballnet.swift)도 'NET 시각 표본수 점수' 한 줄
//       (시험대 scripts/velocity-bench/detect.mjs 가 읽는다 — 조각마다 따로 먹이면 조각 머리에서 '조용한 때'를 다시 배워 공을 놓친다)
if CommandLine.arguments.dropFirst().first == "--concat" {
  let trig = MotionTrigger()
  var last = -Double.infinity
  var args = Array(CommandLine.arguments.dropFirst(2))
  var net: BallNetTrigger? = nil
  if let a = args.first, a.hasPrefix("--net=") {
    net = try! BallNetTrigger(modelURL: URL(fileURLWithPath: String(a.dropFirst(6))))
    args.removeFirst()
  }
  for arg in args {
    let at = arg.lastIndex(of: "@")!
    let path = String(arg[..<at]), offset = Double(arg[arg.index(after: at)...])!
    let asset = AVURLAsset(url: URL(fileURLWithPath: path))
    guard let track = asset.tracks(withMediaType: .video).first else { continue }
    let reader = try! AVAssetReader(asset: asset)
    let out = AVAssetReaderTrackOutput(track: track, outputSettings: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange])
    out.alwaysCopiesSampleData = false
    reader.add(out); reader.startReading()
    while let sb = out.copyNextSampleBuffer() {
      let t = offset + CMSampleBufferGetPresentationTimeStamp(sb).seconds
      if t <= last + 0.5 / 60 { continue }
      last = t
      guard let px = CMSampleBufferGetImageBuffer(sb) else { continue }
      CVPixelBufferLockBaseAddress(px, .readOnly)
      if let base = CVPixelBufferGetBaseAddressOfPlane(px, 0),
         let h = trig.feed(luma: base.assumingMemoryBound(to: UInt8.self), width: CVPixelBufferGetWidthOfPlane(px, 0),
                           height: CVPixelBufferGetHeightOfPlane(px, 0), stride: CVPixelBufferGetBytesPerRowOfPlane(px, 0), t: t) {
        print(String(format: "HIT %@ %.3f %d %.1f", h.kind, h.atSec, h.length, h.strength))
      }
      if let net, let base = CVPixelBufferGetBaseAddressOfPlane(px, 0),
         let a = net.feed(luma: base.assumingMemoryBound(to: UInt8.self), width: CVPixelBufferGetWidthOfPlane(px, 0),
                          height: CVPixelBufferGetHeightOfPlane(px, 0), stride: CVPixelBufferGetBytesPerRowOfPlane(px, 0), t: t) {
        print(String(format: "NET %.3f %d %.2f %.3f", a.atSec, a.n, a.first.score, a.last.t))
      }
      CVPixelBufferUnlockBaseAddress(px, .readOnly)
    }
  }
  if let net { print(String(format: "NETMS %.2f %d", net.predictMs / Double(max(1, net.predicts)), net.predicts)) }
  print(String(format: "END %.3f", last))
  exit(0)
}
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
      hits.append(String(format: "%@ %.2fs(len %d, 넓이 %.0f→%.0f, 자리 %.0f,%.0f, s %.0f, 퍼짐 %.1f)", h.kind, h.atSec - t0, h.length, h.areaFirst, h.areaLast, h.x, h.y, h.strength, h.spread))
    }
    ms += Date().timeIntervalSince(c) * 1000
    n += 1
  }
  let name = (path as NSString).lastPathComponent
  print("\(name): \(String(format: "%.1f", tl - t0))초 \(n)장 · 장면당 \(String(format: "%.2f", ms / Double(max(1, n))))ms · 알림 \(hits.count): \(hits.joined(separator: " | "))")
}
