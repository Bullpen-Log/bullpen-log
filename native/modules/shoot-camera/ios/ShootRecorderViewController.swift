import AVFoundation
import UIKit

/// 촬영 모드의 찍는 화면 — 옛 앱(mobile/ios/App/App/ShootCameraPlugin.swift)의 것을 그대로 옮겼다(폴더 이름만 ShootCameraModule.folder).
/// 아이폰은 화면이 세로 고정, 아이패드는 든 방향으로 화면 · 미리보기가 같이 돈다.
final class ShootRecorderViewController: UIViewController, AVCaptureFileOutputRecordingDelegate {
    enum Result {
        case saved(URL)
        case cancelled
        case failed(String)
    }

    static let targetFps: Double = 60

    private let maxSeconds: Double
    private let done: (Result) -> Void
    private var finished = false

    private let session = AVCaptureSession()
    private let output = AVCaptureMovieFileOutput()
    private let sessionQueue = DispatchQueue(label: "bullpen.shoot.session")
    private var device: AVCaptureDevice?
    private var fps: Double = 0
    private var lens = ""
    private var rotation: Any?  // AVCaptureDevice.RotationCoordinator (iOS 17+)
    /// 미리보기 각도를 따라가는 관찰 — 렌즈를 바꾸면 새 기기로 다시 단다
    private var previewRotation: NSKeyValueObservation?

    private let preview = AVCaptureVideoPreviewLayer()
    private let recordButton = UIButton(type: .custom)
    private let recordInner = UIView()
    private let cancelButton = UIButton(type: .system)
    private let timeLabel = UILabel()
    private let lensControl = UISegmentedControl(items: ["0.5×", "1×"])
    private var timer: Timer?
    private var startedAt: Date?

    init(maxSeconds: Double, done: @escaping (Result) -> Void) {
        self.maxSeconds = maxSeconds
        self.done = done
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

    override var prefersStatusBarHidden: Bool { true }
    /// 아이패드는 앱이 모든 방향 · 화면 나누기를 받아 세로로 잠글 수 없다 — 잠그는 척하면 화면만 돌고 미리보기는 옆으로 누웠다(2026-10-18 사용자:
    /// 아이패드 촬영 카메라). 그래서 아이패드는 방향을 받고 미리보기도 같이 돌린다(applyPreviewRotation).
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask {
        UIDevice.current.userInterfaceIdiom == .pad ? .all : .portrait
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        preview.session = session
        preview.videoGravity = .resizeAspect
        view.layer.addSublayer(preview)

        timeLabel.font = .monospacedDigitSystemFont(ofSize: 17, weight: .semibold)
        timeLabel.textColor = .white
        timeLabel.textAlignment = .center
        timeLabel.backgroundColor = UIColor.black.withAlphaComponent(0.45)
        timeLabel.layer.cornerRadius = 8
        timeLabel.clipsToBounds = true
        timeLabel.text = "카메라 준비 중"
        timeLabel.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(timeLabel)

        cancelButton.setTitle("취소", for: .normal)
        cancelButton.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        cancelButton.tintColor = .white
        cancelButton.addTarget(self, action: #selector(cancelTapped), for: .touchUpInside)
        cancelButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(cancelButton)

        lensControl.selectedSegmentIndex = 0
        lensControl.isHidden = !hasUltraWide
        lensControl.isEnabled = false
        lensControl.backgroundColor = UIColor.black.withAlphaComponent(0.45)
        lensControl.selectedSegmentTintColor = .white
        lensControl.setTitleTextAttributes([.foregroundColor: UIColor.white, .font: UIFont.systemFont(ofSize: 15, weight: .semibold)], for: .normal)
        lensControl.setTitleTextAttributes([.foregroundColor: UIColor.black, .font: UIFont.systemFont(ofSize: 15, weight: .semibold)], for: .selected)
        lensControl.accessibilityLabel = "렌즈"
        lensControl.addTarget(self, action: #selector(lensChanged), for: .valueChanged)
        lensControl.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(lensControl)

        recordButton.layer.cornerRadius = 38
        recordButton.layer.borderWidth = 5
        recordButton.layer.borderColor = UIColor.white.cgColor
        recordButton.addTarget(self, action: #selector(recordTapped), for: .touchUpInside)
        recordButton.accessibilityLabel = "녹화"
        recordButton.isEnabled = false
        recordButton.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(recordButton)
        recordInner.backgroundColor = .systemRed
        recordInner.isUserInteractionEnabled = false
        recordInner.layer.cornerRadius = 29
        recordInner.translatesAutoresizingMaskIntoConstraints = false
        recordButton.addSubview(recordInner)
        innerSize = [recordInner.widthAnchor.constraint(equalToConstant: 58), recordInner.heightAnchor.constraint(equalToConstant: 58)]

        let g = view.safeAreaLayoutGuide
        NSLayoutConstraint.activate([
            timeLabel.topAnchor.constraint(equalTo: g.topAnchor, constant: 12),
            timeLabel.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            timeLabel.heightAnchor.constraint(equalToConstant: 32),
            timeLabel.widthAnchor.constraint(greaterThanOrEqualToConstant: 150),
            recordButton.bottomAnchor.constraint(equalTo: g.bottomAnchor, constant: -24),
            recordButton.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            recordButton.widthAnchor.constraint(equalToConstant: 76),
            recordButton.heightAnchor.constraint(equalToConstant: 76),
            recordInner.centerXAnchor.constraint(equalTo: recordButton.centerXAnchor),
            recordInner.centerYAnchor.constraint(equalTo: recordButton.centerYAnchor),
            cancelButton.centerYAnchor.constraint(equalTo: recordButton.centerYAnchor),
            cancelButton.leadingAnchor.constraint(equalTo: g.leadingAnchor, constant: 24),
            cancelButton.heightAnchor.constraint(equalToConstant: 44),
            lensControl.bottomAnchor.constraint(equalTo: recordButton.topAnchor, constant: -20),
            lensControl.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            lensControl.widthAnchor.constraint(equalToConstant: 140),
            lensControl.heightAnchor.constraint(equalToConstant: 36),
        ] + innerSize)

        sessionQueue.async { self.configure() }
    }

    private var innerSize: [NSLayoutConstraint] = []

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        /* 돌릴 때 미리보기 판이 따로 움직이지 않게 */
        CATransaction.begin()
        CATransaction.setDisableActions(true)
        preview.frame = view.bounds
        CATransaction.commit()
        if #unavailable(iOS 17.0) { applyLegacyPreviewOrientation() }
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        UIApplication.shared.isIdleTimerDisabled = true
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        UIApplication.shared.isIdleTimerDisabled = false
        timer?.invalidate()
        sessionQueue.async { if self.session.isRunning { self.session.stopRunning() } }
    }

    // MARK: 카메라

    private let hasUltraWide = AVCaptureDevice.default(.builtInUltraWideCamera, for: .video, position: .back) != nil
    /// 0.5배 광각으로 찍는지 — 기본은 광각(2026-10-10 사용자: 광각을 고를 수 있게), 광각이 없는 기종은 늘 1배
    private var useUltraWide = true

    /// 렌즈를 (다시) 고른다 — 처음 켤 때와 [0.5× | 1×] 를 바꿀 때. sessionQueue 에서만 부른다.
    private func configure() {
        let ultra = useUltraWide && hasUltraWide
        guard let camera = AVCaptureDevice.default(ultra ? .builtInUltraWideCamera : .builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: camera) else {
            DispatchQueue.main.async { self.finish(.failed("카메라를 켜지 못했어요.")) }
            return
        }
        session.beginConfiguration()
        /* 색 공간은 아래에서 직접 정한다(일반 색) — 세션이 넓은 색으로 되돌리지 않게 */
        session.automaticallyConfiguresCaptureDeviceForWideColor = false
        for old in session.inputs { session.removeInput(old) }
        guard session.canAddInput(input) else {
            session.commitConfiguration()
            DispatchQueue.main.async { self.finish(.failed("카메라를 켜지 못했어요.")) }
            return
        }
        session.addInput(input)
        if !session.outputs.contains(output) {
            guard session.canAddOutput(output) else {
                session.commitConfiguration()
                DispatchQueue.main.async { self.finish(.failed("카메라를 켜지 못했어요.")) }
                return
            }
            session.addOutput(output)
            output.maxRecordedDuration = CMTime(seconds: maxSeconds, preferredTimescale: 600)
        }

        /* 1920×1080 중 60fps 를 내는 형식 — 없으면 1080p 에서 가장 높은 fps. 손떨림 보정이 되는 것을 먼저 고른다 */
        let candidates = camera.formats.filter {
            let d = CMVideoFormatDescriptionGetDimensions($0.formatDescription)
            return d.width == 1920 && d.height == 1080
        }
        func maxRate(_ f: AVCaptureDevice.Format) -> Double { f.videoSupportedFrameRateRanges.map(\.maxFrameRate).max() ?? 0 }
        let sixty = candidates.filter { maxRate($0) >= Self.targetFps }
        let pool = sixty.isEmpty ? candidates : sixty
        let format = pool.first(where: { $0.isVideoStabilizationModeSupported(.cinematicExtended) && maxRate($0) <= 120 })
            ?? pool.first(where: { $0.isVideoStabilizationModeSupported(.cinematic) && maxRate($0) <= 120 })
            ?? pool.first(where: { $0.isVideoStabilizationModeSupported(.standard) && maxRate($0) <= 120 })
            ?? pool.first(where: { maxRate($0) <= 120 })
            ?? pool.first
        let rate = format.map { min(Self.targetFps, maxRate($0)) } ?? 30
        do {
            try camera.lockForConfiguration()
            if let format { camera.activeFormat = format }
            let duration = CMTime(value: 1, timescale: CMTimeScale(rate.rounded()))
            camera.activeVideoMinFrameDuration = duration
            camera.activeVideoMaxFrameDuration = duration
            if camera.isFocusModeSupported(.continuousAutoFocus) { camera.focusMode = .continuousAutoFocus }
            if camera.isExposureModeSupported(.continuousAutoExposure) { camera.exposureMode = .continuousAutoExposure }
            /* 일반 색(SDR)으로 — HDR(HLG)이면 사이트가 H.264 로 다시 만들어야 해서 올리기가 느렸다(2026-10-18) */
            if camera.activeFormat.supportedColorSpaces.contains(.sRGB) { camera.activeColorSpace = .sRGB }
            camera.unlockForConfiguration()
        } catch {}
        applyUploadSettings(fps: rate)
        if let connection = output.connection(with: .video), connection.isVideoStabilizationSupported {
            /* 흔들림 보정 — 강한 것부터(2026-10-10 사용자) */
            let f = camera.activeFormat
            connection.preferredVideoStabilizationMode = f.isVideoStabilizationModeSupported(.cinematicExtended) ? .cinematicExtended
                : f.isVideoStabilizationModeSupported(.cinematic) ? .cinematic : .standard
        }
        session.commitConfiguration()
        device = camera
        fps = rate
        lens = ultra ? "0.5× · " : (hasUltraWide ? "1× · " : "")
        if !session.isRunning { session.startRunning() }

        DispatchQueue.main.async {
            if #available(iOS 17.0, *) {
                let coordinator = AVCaptureDevice.RotationCoordinator(device: camera, previewLayer: self.preview)
                self.rotation = coordinator
                self.previewRotation = coordinator.observe(\.videoRotationAngleForHorizonLevelPreview, options: [.initial, .new]) { [weak self] c, _ in
                    let angle = c.videoRotationAngleForHorizonLevelPreview
                    DispatchQueue.main.async { self?.applyPreviewRotation(angle) }
                }
            } else {
                self.applyLegacyPreviewOrientation()
            }
            self.recordButton.isEnabled = true
            self.lensControl.isEnabled = true
            self.timeLabel.text = "  \(self.lens)1080p · \(Int(self.fps))fps  "
        }
    }

    @objc private func lensChanged() {
        useUltraWide = lensControl.selectedSegmentIndex == 0
        recordButton.isEnabled = false
        lensControl.isEnabled = false
        timeLabel.text = "카메라 바꾸는 중"
        sessionQueue.async { self.configure() }
    }

    /// 올릴 모양 그대로 찍는다 — H.264 · 1080p · 사이트가 올리는 비트레이트(60fps 8Mbps · 30fps 6Mbps, lib/clip/plan.ts) · 1초마다 키프레임.
    /// 그러면 사이트 편집 창이 다시 만들지 않고 앞뒤만 잘라 붙인다(lib/clip/edit.ts — 2026-10-18 사용자: "올라가는 속도를 더 빠르게").
    /// 이 폰이 비트레이트 칸을 못 받으면 코덱만 바꾼다 — 그때는 사이트가 예전처럼 다시 만든다.
    private func applyUploadSettings(fps: Double) {
        guard let connection = output.connection(with: .video) else { return }
        var settings: [String: Any] = [:]
        if output.availableVideoCodecTypes.contains(.h264) { settings[AVVideoCodecKey] = AVVideoCodecType.h264 }
        if output.supportedOutputSettingsKeys(for: connection).contains(AVVideoCompressionPropertiesKey) {
            settings[AVVideoCompressionPropertiesKey] = [
                AVVideoAverageBitRateKey: fps > 45 ? 8_000_000 : 6_000_000,
                AVVideoMaxKeyFrameIntervalKey: max(1, Int(fps.rounded())),
                AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
            ]
        }
        if !settings.isEmpty { output.setOutputSettings(settings, for: connection) }
    }

    /// 미리보기를 기기를 든 방향으로 세운다(iOS 17+) — 아이폰은 늘 세로라 90° 그대로, 아이패드는 돌릴 때마다 바뀐다
    @available(iOS 17.0, *)
    private func applyPreviewRotation(_ angle: CGFloat) {
        guard let connection = preview.connection, connection.isVideoRotationAngleSupported(angle) else { return }
        connection.videoRotationAngle = angle
    }

    /// iOS 16 — 화면 방향 그대로 미리보기를 세운다
    private func applyLegacyPreviewOrientation() {
        guard let connection = preview.connection, connection.isVideoOrientationSupported else { return }
        connection.videoOrientation = Self.videoOrientation(view.window?.windowScene?.interfaceOrientation ?? .portrait)
    }

    /// 화면 방향 → 영상 방향(두 이름이 같은 뜻 — 홈 단추 자리 기준)
    private static func videoOrientation(_ o: UIInterfaceOrientation) -> AVCaptureVideoOrientation {
        switch o {
        case .landscapeLeft: return .landscapeLeft
        case .landscapeRight: return .landscapeRight
        case .portraitUpsideDown: return .portraitUpsideDown
        default: return .portrait
        }
    }

    /// 녹화를 시작하는 순간 폰을 든 방향(세로 · 가로)으로 영상을 세운다
    private func applyRotation(_ connection: AVCaptureConnection) {
        if #available(iOS 17.0, *), let coordinator = rotation as? AVCaptureDevice.RotationCoordinator {
            let angle = coordinator.videoRotationAngleForHorizonLevelCapture
            if connection.isVideoRotationAngleSupported(angle) { connection.videoRotationAngle = angle }
            return
        }
        guard connection.isVideoOrientationSupported else { return }
        switch UIDevice.current.orientation {
        case .landscapeLeft: connection.videoOrientation = .landscapeRight
        case .landscapeRight: connection.videoOrientation = .landscapeLeft
        case .portraitUpsideDown: connection.videoOrientation = .portraitUpsideDown
        case .portrait: connection.videoOrientation = .portrait
        /* 눕혀 둔 아이패드 · 모름 — 화면 방향을 따른다 */
        default: connection.videoOrientation = Self.videoOrientation(view.window?.windowScene?.interfaceOrientation ?? .portrait)
        }
    }

    // MARK: 단추

    /// 녹화를 시작했다(startRecording 을 큐에 넣음) — isRecording 은 조금 뒤에야 켜져, 그 사이 또 누르면 AVFoundation 이 예외를 낸다
    private var starting = false

    @objc private func recordTapped() {
        if starting && !output.isRecording { return }
        if output.isRecording {
            recordButton.isEnabled = false
            sessionQueue.async { self.output.stopRecording() }
            return
        }
        guard let connection = output.connection(with: .video) else { return }
        applyRotation(connection)
        do {
            try FileManager.default.createDirectory(at: ShootCameraModule.folder, withIntermediateDirectories: true)
        } catch {
            finish(.failed("찍은 영상을 저장하지 못했어요."))
            return
        }
        let url = ShootCameraModule.folder.appendingPathComponent(UUID().uuidString + ".mov")
        starting = true
        cancelButton.isHidden = true
        lensControl.isEnabled = false
        setRecordingLook(true)
        startedAt = Date()
        tick()
        timer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in self?.tick() }
        sessionQueue.async { self.output.startRecording(to: url, recordingDelegate: self) }
    }

    @objc private func cancelTapped() {
        finish(.cancelled)
    }

    private func setRecordingLook(_ on: Bool) {
        UIView.animate(withDuration: 0.18) {
            let side: CGFloat = on ? 30 : 58
            self.innerSize.forEach { $0.constant = side }
            self.recordInner.layer.cornerRadius = on ? 7 : 29
            self.recordButton.layoutIfNeeded()
        }
        recordButton.accessibilityLabel = on ? "녹화 멈추기" : "녹화"
    }

    private func tick() {
        guard let startedAt else { return }
        let s = Int(Date().timeIntervalSince(startedAt))
        timeLabel.text = String(format: "  ● %02d:%02d · %dfps  ", s / 60, s % 60, Int(fps))
        timeLabel.textColor = .systemRed
    }

    // MARK: 녹화 끝

    func fileOutput(_ output: AVCaptureFileOutput, didFinishRecordingTo outputFileURL: URL, from connections: [AVCaptureConnection], error: Error?) {
        /* 최대 길이에 닿아 멈춘 것도 error 로 오지만 파일은 끝까지 쓰였다 */
        let ok = error == nil
            || ((error as NSError?)?.userInfo[AVErrorRecordingSuccessfullyFinishedKey] as? Bool ?? false)
        DispatchQueue.main.async {
            self.timer?.invalidate()
            if ok {
                self.finish(.saved(outputFileURL))
            } else {
                try? FileManager.default.removeItem(at: outputFileURL)
                self.finish(.failed("영상을 끝까지 찍지 못했어요."))
            }
        }
    }

    private func finish(_ result: Result) {
        guard !finished else { return }
        finished = true
        dismiss(animated: true) { self.done(result) }
    }
}
