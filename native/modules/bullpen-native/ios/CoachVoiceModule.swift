import ExpoModulesCore

/// 코치에게 말로 하기 — CoachVoiceCore 를 JS 로(native/src/coach/voice.ts). 옛 앱 판에는 없다(JS 가 마이크를 숨긴다).
///   available()            폰 안 한국어 받아쓰기가 되나
///   authorize()            받아쓰기 · 마이크 허락 → 둘 다 됐나
///   start() · stop() · cancel()   듣기(알림 'text' { text, final } · 'end' { error })
///   speak(text) · stopSpeaking()  읽기(알림 'spoken')
public class CoachVoiceModule: Module {
    private let core = CoachVoiceCore()

    public func definition() -> ModuleDefinition {
        Name("CoachVoice")
        Events("text", "end", "spoken")

        OnCreate {
            self.core.onText = { [weak self] text, final in self?.sendEvent("text", ["text": text, "final": final]) }
            self.core.onEnd = { [weak self] error in self?.sendEvent("end", ["error": error ?? ""]) }
            self.core.onSpoken = { [weak self] in self?.sendEvent("spoken", [:]) }
        }

        Function("available") { self.core.onDevice }

        AsyncFunction("authorize") { (promise: Promise) in
            self.core.authorize { promise.resolve($0) }
        }

        AsyncFunction("start") { (promise: Promise) in
            DispatchQueue.main.async {
                do {
                    try self.core.start()
                    promise.resolve(nil)
                } catch {
                    promise.reject("voice", error.localizedDescription)
                }
            }
        }

        AsyncFunction("stop") {
            DispatchQueue.main.async { self.core.stop() }
        }

        AsyncFunction("cancel") {
            DispatchQueue.main.async { self.core.cancel() }
        }

        AsyncFunction("speak") { (text: String) in
            DispatchQueue.main.async { self.core.speak(text) }
        }

        AsyncFunction("stopSpeaking") {
            DispatchQueue.main.async { self.core.stopSpeaking() }
        }

        OnDestroy {
            DispatchQueue.main.async {
                self.core.cancel()
                self.core.stopSpeaking()
            }
        }
    }
}
