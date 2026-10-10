import AVFoundation
import Capacitor
import UIKit

/// 촬영 모드 앱 카메라 — 뒤 카메라를 1080p · 60fps 로 찍고, 찍은 파일을 사이트에 조금씩 넘긴다(사이트 lib/shoot-camera.ts,
/// 약속은 docs/designs/shoot-camera-native.md). 웹의 <input capture> 는 WebKit 이 화질을 안 정해 약 480×360 으로 찍혀 걷었고,
/// 아이폰 기본 촬영 화면(UIImagePickerController)은 프레임 수를 못 정해 늘 30fps 라 직접 만든 화면으로 바꿨다(2026-10-10 사용자: 60프레임).
/// 소리는 담지 않는다 — 사이트 편집 창이 어차피 소리 트랙을 지운다.
@objc(ShootCameraPlugin)
public class ShootCameraPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ShootCameraPlugin"
    public let jsName = "ShootCamera"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "record", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "discard", returnType: CAPPluginReturnPromise),
    ]

    /// 카메라 화면이 떠 있는 동안의 부름 — 메인 스레드에서만 만진다
    private var pending: CAPPluginCall?
    /// record 가 준 경로만 read · discard 한다(DualCamera 의 issued 와 같은 방식)
    private var issued = Set<String>()
    private let lock = NSLock()

    fileprivate static var folder: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("bullpen-shoot", isDirectory: true)
    }

    override public func load() {
        /* 하루 지난 촬영 파일 — 사이트가 넘겨받기 전에 앱이 꺼진 것 */
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(at: Self.folder, includingPropertiesForKeys: [.contentModificationDateKey]) else { return }
        let dayAgo = Date().addingTimeInterval(-86_400)
        for url in files {
            let date = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
            if let date, date < dayAgo { try? fm.removeItem(at: url) }
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) != nil
        call.resolve(["version": 1, "camera": camera, "fps": ShootRecorderViewController.targetFps])
    }

    @objc func record(_ call: CAPPluginCall) {
        let maxSeconds = call.getDouble("maxSeconds") ?? 180
        DispatchQueue.main.async {
            if self.pending != nil {
                call.reject("카메라가 이미 열려 있어요.", "busy")
                return
            }
            guard AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) != nil else {
                call.reject("이 기기에는 카메라가 없어요.", "unavailable")
                return
            }
            switch AVCaptureDevice.authorizationStatus(for: .video) {
            case .denied, .restricted:
                call.reject("카메라 권한이 꺼져 있어요.", "denied")
            case .notDetermined:
                AVCaptureDevice.requestAccess(for: .video) { ok in
                    DispatchQueue.main.async {
                        if ok { self.present(call, maxSeconds) } else { call.reject("카메라 권한이 꺼져 있어요.", "denied") }
                    }
                }
            default:
                self.present(call, maxSeconds)
            }
        }
    }

    private func present(_ call: CAPPluginCall, _ maxSeconds: Double) {
        guard var top = bridge?.viewController else {
            call.reject("화면을 찾지 못했어요.", "failed")
            return
        }
        pending = call
        let recorder = ShootRecorderViewController(maxSeconds: maxSeconds) { [weak self] result in
            guard let self, let call = self.pending else { return }
            self.pending = nil
            switch result {
            case .cancelled:
                call.resolve(["cancelled": true])
            case .failed(let message):
                call.reject(message, "failed")
            case .saved(let url):
                let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.intValue ?? 0
                self.lock.lock()
                self.issued.insert(url.path)
                self.lock.unlock()
                call.resolve(["path": url.path, "size": size])
            }
        }
        recorder.modalPresentationStyle = .fullScreen
        /* 웹뷰 위에 다른 화면이 떠 있으면 그 위에 */
        while let next = top.presentedViewController { top = next }
        top.present(recorder, animated: true)
    }

    @objc func read(_ call: CAPPluginCall) {
        guard let path = call.getString("path"), isIssued(path) else {
            call.reject("읽을 수 없는 파일이에요.", "path")
            return
        }
        let offset = UInt64(max(0, call.getInt("offset") ?? 0))
        let length = max(1, min(4 * 1024 * 1024, call.getInt("length") ?? 1024 * 1024))
        do {
            let handle = try FileHandle(forReadingFrom: URL(fileURLWithPath: path))
            defer { try? handle.close() }
            let size = try handle.seekToEnd()
            try handle.seek(toOffset: min(offset, size))
            let data = try handle.read(upToCount: length) ?? Data()
            call.resolve(["data": data.base64EncodedString(), "size": Int(size), "eof": offset + UInt64(data.count) >= size])
        } catch {
            call.reject("영상을 읽지 못했어요.", "read")
        }
    }

    @objc func discard(_ call: CAPPluginCall) {
        let paths = call.getArray("paths", String.self) ?? []
        for path in paths where isIssued(path) {
            try? FileManager.default.removeItem(atPath: path)
            lock.lock()
            issued.remove(path)
            lock.unlock()
        }
        call.resolve()
    }

    private func isIssued(_ path: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return issued.contains(path)
    }
}

/// 찍는 화면 — 미리보기 · 녹화 단추 · 시간 · 취소. 화면은 세로 고정이고, 찍히는 영상은 폰을 든 방향을 따른다.
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
    private var rotation: Any?  // AVCaptureDevice.RotationCoordinator (iOS 17+)

    private let preview = AVCaptureVideoPreviewLayer()
    private let recordButton = UIButton(type: .custom)
    private let recordInner = UIView()
    private let cancelButton = UIButton(type: .system)
    private let timeLabel = UILabel()
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

    private func configure() {
        guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
              let input = try? AVCaptureDeviceInput(device: camera) else {
            DispatchQueue.main.async { self.finish(.failed("카메라를 켜지 못했어요.")) }
            return
        }
        session.beginConfiguration()
        guard session.canAddInput(input), session.canAddOutput(output) else {
            session.commitConfiguration()
            DispatchQueue.main.async { self.finish(.failed("카메라를 켜지 못했어요.")) }
            return
        }
        session.addInput(input)
        session.addOutput(output)
        output.maxRecordedDuration = CMTime(seconds: maxSeconds, preferredTimescale: 600)

        /* 1920×1080 중 60fps 를 내는 형식 — 없으면 1080p 에서 가장 높은 fps. 손떨림 보정이 되는 것을 먼저 고른다 */
        let candidates = camera.formats.filter {
            let d = CMVideoFormatDescriptionGetDimensions($0.formatDescription)
            return d.width == 1920 && d.height == 1080
        }
        func maxRate(_ f: AVCaptureDevice.Format) -> Double { f.videoSupportedFrameRateRanges.map(\.maxFrameRate).max() ?? 0 }
        let sixty = candidates.filter { maxRate($0) >= Self.targetFps }
        let pool = sixty.isEmpty ? candidates : sixty
        let format = pool.first(where: { $0.isVideoStabilizationModeSupported(.standard) && maxRate($0) <= 120 })
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
            connection.preferredVideoStabilizationMode = .standard
        }
        session.commitConfiguration()
        device = camera
        fps = rate
        session.startRunning()

        DispatchQueue.main.async {
            if #available(iOS 17.0, *) {
                self.rotation = AVCaptureDevice.RotationCoordinator(device: camera, previewLayer: self.preview)
            }
            self.recordButton.isEnabled = true
            self.timeLabel.text = "  1080p · \(Int(self.fps))fps  "
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
            try FileManager.default.createDirectory(at: ShootCameraPlugin.folder, withIntermediateDirectories: true)
        } catch {
            finish(.failed("찍은 영상을 저장하지 못했어요."))
            return
        }
        let url = ShootCameraPlugin.folder.appendingPathComponent(UUID().uuidString + ".mov")
        cancelButton.isHidden = true
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
