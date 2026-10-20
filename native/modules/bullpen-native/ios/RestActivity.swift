import ActivityKit
import Foundation

/// 운동하는 동안의 시계(Live Activity) — 그리는 쪽은 위젯 확장(plugins/rest-activity/ios).
/// ActivityKit 은 이름과 칸으로 맞춰 보므로 위젯 확장의 SessionActivityAttributes 와 이름 · 칸이 같아야 한다 — 바꾸면 두 곳을 같이.
struct SessionActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var kind: String
        var symbol: String
        var label: String
        var title: String
        var detail: String
        var since: Date
        var until: Date?
    }
}

enum SessionLive {
    /// 지금 상태를 띄운다 — 이미 떠 있으면 고치고, 없으면 새로. 꺼 둔 사람(설정)은 조용히 넘어간다
    static func show(_ state: SessionActivityAttributes.ContentState) async {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        /* 시계가 끝나거나(거꾸로) 앱의 상한(쉬기 10분 · 운동 4시간)이 지나면 낡은 것으로 — 시스템이 흐리게 둔다 */
        let stale = state.until ?? state.since.addingTimeInterval(state.kind == "rest" ? 600 : 4 * 3600)
        let content = ActivityContent(state: state, staleDate: stale)
        let live = Activity<SessionActivityAttributes>.activities
        if let first = live.first {
            await first.update(content)
            for extra in live.dropFirst() { await extra.end(nil, dismissalPolicy: .immediate) }
        } else {
            _ = try? Activity.request(attributes: SessionActivityAttributes(), content: content, pushType: nil)
        }
    }

    static func end() async {
        for a in Activity<SessionActivityAttributes>.activities { await a.end(nil, dismissalPolicy: .immediate) }
    }
}
