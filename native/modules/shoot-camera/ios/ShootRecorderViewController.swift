import AVFoundation
import UIKit

/// 촬영 모드의 찍는 화면 — 옛 앱(mobile/ios/App/App/ShootCameraPlugin.swift)의 것을 그대로 옮겼다(폴더 이름만 ShootCameraModule.folder).
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
    override var supportedInterfaceOrientations: UIInterfaceOrientationMask { .portrait }

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
        preview.frame = view.bounds
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
            camera.unlockForConfiguration()
        } catch {}
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
                self.rotation = AVCaptureDevice.RotationCoordinator(device: camera, previewLayer: self.preview)
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
        default: connection.videoOrientation = .portrait
        }
    }

    // MARK: 단추

    @objc private func recordTapped() {
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
