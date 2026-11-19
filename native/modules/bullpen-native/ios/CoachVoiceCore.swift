import AVFoundation
import Speech

/// 코치에게 말로 하기(자비스 4단계, docs/designs/ai-coach-knowledge-memory.md 12절) — 시스템 틀만 쓴다(Expo 연결은 CoachVoiceModule.swift).
///   받아쓰기: 한국어 · 폰 안에서만(requiresOnDeviceRecognition — 소리가 애플 서버로도 우리 서버로도 안 간다). 폰 안 받아쓰기를 못 하는 폰이면 마이크를 숨긴다.
///   읽기: 기기의 한국어 기본 목소리(구속 측정 소리 안내와 같은 AVSpeechSynthesizer). 무음 스위치를 켜 둬도 들리게 playback.
/// 모든 함수 · 알림은 주 스레드.
final class CoachVoiceCore: NSObject, AVSpeechSynthesizerDelegate {
    /// 받아쓴 글(지금까지 전부) · 끝났나
    var onText: ((String, Bool) -> Void)?
    /// 받아쓰기가 끝남 — 글 없이 끝났으면 까닭(없으면 nil)
    var onEnd: ((String?) -> Void)?
    /// 읽기가 끝남(다 읽었거나 멈춤)
    var onSpoken: (() -> Void)?

    private let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "ko-KR"))
    private let engine = AVAudioEngine()
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    private var heard = ""
    private let synth = AVSpeechSynthesizer()
    private var utterance: AVSpeechUtterance?

    override init() {
        super.init()
        synth.delegate = self
    }

    /// 이 폰이 한국어를 폰 안에서 받아쓰나
    var onDevice: Bool { recognizer?.supportsOnDeviceRecognition ?? false }

    /// 받아쓰기 · 마이크 허락(처음엔 묻는다) → 둘 다 됐나
    func authorize(_ done: @escaping (Bool) -> Void) {
        SFSpeechRecognizer.requestAuthorization { status in
            guard status == .authorized else { return DispatchQueue.main.async { done(false) } }
            let mic: (Bool) -> Void = { ok in DispatchQueue.main.async { done(ok) } }
            if #available(iOS 17.0, *) {
                AVAudioApplication.requestRecordPermission(completionHandler: mic)
            } else {
                AVAudioSession.sharedInstance().requestRecordPermission(mic)
            }
        }
    }

    /// 듣기 시작 — 읽던 말 · 앞 듣기는 끊는다. 못 열면 까닭을 던진다
    func start() throws {
        stopSpeaking()
        cancel()
        guard let r = recognizer, r.supportsOnDeviceRecognition else { throw VoiceError("이 폰은 폰 안 받아쓰기를 못 해요.") }
        guard r.isAvailable else { throw VoiceError("받아쓰기를 지금 쓸 수 없어요. 잠시 뒤 다시 눌러 주세요.") }
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playAndRecord, mode: .measurement, options: [.duckOthers, .defaultToSpeaker])
        try session.setActive(true, options: .notifyOthersOnDeactivation)
        let req = SFSpeechAudioBufferRecognitionRequest()
        req.shouldReportPartialResults = true
        req.requiresOnDeviceRecognition = true
        request = req
        heard = ""
        let input = engine.inputNode
        input.installTap(onBus: 0, bufferSize: 1024, format: input.outputFormat(forBus: 0)) { buffer, _ in req.append(buffer) }
        engine.prepare()
        do {
            try engine.start()
        } catch {
            teardown()
            throw VoiceError("마이크를 켜지 못했어요.")
        }
        task = r.recognitionTask(with: req) { [weak self] result, error in
            DispatchQueue.main.async {
                /* 끝냈거나 새로 시작한 뒤의 늦은 알림은 버린다 */
                guard let self, self.request === req else { return }
                if let result {
                    self.heard = result.bestTranscription.formattedString
                    self.onText?(self.heard, result.isFinal)
                }
                if result?.isFinal == true || error != nil { self.finish() }
            }
        }
    }

    /// 말이 끝났다 — 받은 소리까지 마저 받아쓰고 끝(onText 끝 · onEnd)
    func stop() {
        guard request != nil else { return }
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
        request?.endAudio()
    }

    /// 듣기 그만(알림 없이) — 화면을 닫을 때 · 새로 시작할 때
    func cancel() {
        guard request != nil else { return }
        task?.cancel()
        teardown()
    }

    private func finish() {
        let empty = heard.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        teardown()
        onEnd?(empty ? "말을 듣지 못했어요. 다시 눌러 말해 주세요." : nil)
    }

    private func teardown() {
        request = nil
        task = nil
        if engine.isRunning { engine.stop() }
        engine.inputNode.removeTap(onBus: 0)
        try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    }

    /// 읽기 — 듣던 것 · 앞 말은 끊는다
    func speak(_ text: String) {
        cancel()
        let u = AVSpeechUtterance(string: text)
        u.voice = AVSpeechSynthesisVoice(language: "ko-KR")
        utterance = u
        if synth.isSpeaking { synth.stopSpeaking(at: .immediate) }
        let session = AVAudioSession.sharedInstance()
        try? session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
        try? session.setActive(true)
        synth.speak(u)
    }

    func stopSpeaking() {
        if synth.isSpeaking { synth.stopSpeaking(at: .immediate) }
    }

    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didFinish utterance: AVSpeechUtterance) {
        DispatchQueue.main.async { self.spoken(utterance) }
    }
    func speechSynthesizer(_ synthesizer: AVSpeechSynthesizer, didCancel utterance: AVSpeechUtterance) {
        DispatchQueue.main.async { self.spoken(utterance) }
    }

    /// 지금 읽는 말이 끝났을 때만 — 새 말로 끊긴 앞 말의 알림은 버린다
    private func spoken(_ u: AVSpeechUtterance) {
        guard u === utterance else { return }
        utterance = nil
        if request == nil { try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation) }
        onSpoken?()
    }
}

struct VoiceError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}
