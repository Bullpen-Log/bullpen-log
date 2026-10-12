// 라이브러리 영상 줄이기 — 짧은 변 720, H.264, 소리 없음, 장면 수(fps) 그대로.
// 맥의 AVFoundation 만 쓴다(ffmpeg 없이). scripts/library-bundle.mts 가 부른다.
//
//   swift scripts/library-bundle/compress.swift <목록 파일>
//   목록 파일: 한 줄에 "원본<TAB>결과" — 결과가 이미 있으면 건너뛴다.
//
// 비트레이트: 60fps 2.5Mbps · 30fps 1.8Mbps(폰 카드 크기의 시연 영상 기준 — 빠른 동작에서 뭉개지지 않는 선).
import AVFoundation
import Foundation

func compress(_ src: URL, _ dst: URL) throws {
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
    let tmp = dst.deletingLastPathComponent().appendingPathComponent(".tmp-" + dst.lastPathComponent)
    try? FileManager.default.removeItem(at: tmp)
    let writer = try AVAssetWriter(outputURL: tmp, fileType: .mp4)
    writer.shouldOptimizeForNetworkUse = true
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: w,
        AVVideoHeightKey: h,
        AVVideoScalingModeKey: AVVideoScalingModeResizeAspect,
        AVVideoCompressionPropertiesKey: [
            AVVideoAverageBitRateKey: bitrate,
            AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
            AVVideoExpectedSourceFrameRateKey: Int(fps.rounded()),
            AVVideoMaxKeyFrameIntervalKey: Int(fps.rounded()) * 2,
        ],
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

let list = try String(contentsOfFile: CommandLine.arguments[1], encoding: .utf8)
var failed = 0
for line in list.split(separator: "\n") {
    let parts = line.split(separator: "\t").map(String.init)
    guard parts.count == 2 else { continue }
    let src = URL(fileURLWithPath: parts[0]), dst = URL(fileURLWithPath: parts[1])
    if FileManager.default.fileExists(atPath: dst.path) { continue }
    do {
        try compress(src, dst)
        print("ok\t\(dst.lastPathComponent)")
    } catch {
        failed += 1
        print("fail\t\(src.lastPathComponent)\t\(error)")
    }
}
exit(failed > 0 ? 1 : 0)
