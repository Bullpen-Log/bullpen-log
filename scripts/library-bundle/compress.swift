// 라이브러리 영상 줄이기 — 짧은 변 720, 소리 없음, 장면 수(fps) 그대로.
// 맥의 AVFoundation 만 쓴다(ffmpeg 없이). scripts/library-bundle.mts 가 부른다.
//
//   swift scripts/library-bundle/compress.swift <목록 파일> [hevc]
//   목록 파일: 한 줄에 "원본<TAB>결과" — 결과가 이미 있으면 건너뛴다.
//
// H.264(기본 — 웹 library-720/): 60fps 2.5Mbps · 30fps 1.8Mbps 고정(폰 카드 크기의 시연 영상 기준 — 빠른 동작에서 뭉개지지 않는 선).
// HEVC(hevc — 앱 library-hevc/, 2026-10-20 김민: "폰은 720p HEVC"): 화질 고정 0.72 로 굽고, 결과가 60fps 2.0Mbps · 30fps 1.4Mbps 를
// 넘으면(배경 결이 복잡한 영상 — 화질 고정이 오히려 커진다) 평균 1.3 · 0.94Mbps 로 다시 굽는다. 영상 10개 시험: H.264 40.1MB → 17.6MB(−56%),
// SSIM 평균 0.984 → 0.980 · 나쁜 1% 장면 0.965 → 0.970, 가장 빠른 장면을 3배 키워 봐도 차이가 안 보였다.
import AVFoundation
import Foundation

func compress(_ src: URL, _ dst: URL, hevc: Bool = false, quality: Double = 0, hevcRate: Int = 0) throws {
    let asset = AVURLAsset(url: src)
    guard let track = asset.tracks(withMediaType: .video).first else { throw NSError(domain: "no-video", code: 1) }
    let size = track.naturalSize
    let fps = track.nominalFrameRate > 0 ? track.nominalFrameRate : 30
    let short = min(size.width, size.height)
    let scale = min(1, 720 / short)
    func even(_ v: CGFloat) -> Int { max(2, Int((v * scale / 2).rounded()) * 2) }
    let w = even(size.width), h = even(size.height)
    let bitrate = fps > 45 ? 2_500_000 : 1_800_000

    let reader = try AVAssetReader(asset: asset)
    let out = AVAssetReaderTrackOutput(track: track, outputSettings: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
    ])
    out.alwaysCopiesSampleData = false
    reader.add(out)

    try? FileManager.default.removeItem(at: dst)
    let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("lib-" + dst.lastPathComponent)
    try? FileManager.default.removeItem(at: tmp)
    let writer = try AVAssetWriter(outputURL: tmp, fileType: .mp4)
    writer.shouldOptimizeForNetworkUse = true
    var props: [String: Any] = [
        AVVideoExpectedSourceFrameRateKey: Int(fps.rounded()),
        AVVideoMaxKeyFrameIntervalKey: Int(fps.rounded()) * 2,
    ]
    if !hevc {
        props[AVVideoAverageBitRateKey] = bitrate
        props[AVVideoProfileLevelKey] = AVVideoProfileLevelH264HighAutoLevel
    } else if hevcRate > 0 {
        props[AVVideoAverageBitRateKey] = hevcRate
    } else {
        props[AVVideoQualityKey] = quality
    }
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
        AVVideoCodecKey: hevc ? AVVideoCodecType.hevc : AVVideoCodecType.h264,
        AVVideoWidthKey: w,
        AVVideoHeightKey: h,
        AVVideoScalingModeKey: AVVideoScalingModeResizeAspect,
        AVVideoCompressionPropertiesKey: props,
    ])
    input.transform = track.preferredTransform
    input.expectsMediaDataInRealTime = false
    writer.add(input)

    guard reader.startReading(), writer.startWriting() else {
        throw reader.error ?? writer.error ?? NSError(domain: "start", code: 2)
    }
    writer.startSession(atSourceTime: .zero)
    let done = DispatchSemaphore(value: 0)
    let queue = DispatchQueue(label: "compress")
    input.requestMediaDataWhenReady(on: queue) {
        while input.isReadyForMoreMediaData {
            guard let buf = out.copyNextSampleBuffer() else {
                input.markAsFinished()
                writer.finishWriting { done.signal() }
                return
            }
            input.append(buf)
        }
    }
    done.wait()
    if writer.status != .completed || reader.status == .failed {
        try? FileManager.default.removeItem(at: tmp)
        throw writer.error ?? reader.error ?? NSError(domain: "write", code: 3)
    }
    try FileManager.default.moveItem(at: tmp, to: dst)
}

/// HEVC: 화질 고정으로 굽고, 너무 크면(배경 결이 복잡) 평균 비트레이트로 다시
func compressHevc(_ src: URL, _ dst: URL) throws {
    try compress(src, dst, hevc: true, quality: 0.72)
    let asset = AVURLAsset(url: src)
    let fps = asset.tracks(withMediaType: .video).first?.nominalFrameRate ?? 30
    let secs = CMTimeGetSeconds(asset.duration)
    let bytes = (try? FileManager.default.attributesOfItem(atPath: dst.path)[.size] as? Int) ?? 0
    let cap = fps > 45 ? 2_000_000.0 : 1_400_000.0
    if secs > 0, Double(bytes) * 8 / secs > cap {
        try FileManager.default.removeItem(at: dst)
        try compress(src, dst, hevc: true, hevcRate: fps > 45 ? 1_300_000 : 940_000)
    }
}

let useHevc = CommandLine.arguments.count > 2 && CommandLine.arguments[2] == "hevc"
let list = try String(contentsOfFile: CommandLine.arguments[1], encoding: .utf8)
var failed = 0
for line in list.split(separator: "\n") {
    let parts = line.split(separator: "\t").map(String.init)
    guard parts.count == 2 else { continue }
    let src = URL(fileURLWithPath: parts[0]), dst = URL(fileURLWithPath: parts[1])
    if FileManager.default.fileExists(atPath: dst.path) { continue }
    do {
        if useHevc { try compressHevc(src, dst) } else { try compress(src, dst) }
        print("ok\t\(dst.lastPathComponent)")
    } catch {
        failed += 1
        print("fail\t\(src.lastPathComponent)\t\(error)")
    }
}
exit(failed > 0 ? 1 : 0)
