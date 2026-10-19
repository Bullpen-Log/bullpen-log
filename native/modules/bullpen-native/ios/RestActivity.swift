import ActivityKit
import Foundation

/// 세트 사이 휴식 — 다이나믹 아일랜드 · 잠금 화면 시계(Live Activity). 그리는 쪽은 위젯 확장(plugins/rest-activity/ios).
/// ActivityKit 은 이름과 칸으로 맞춰 보므로 위젯 확장의 RestActivityAttributes 와 이름 · 칸이 같아야 한다 — 바꾸면 두 곳을 같이.
struct RestActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var since: Date
        var target: Int
        var exercise: String
    }
}

enum RestLive {
    /// 마지막 세트를 남긴 때(since)부터 올라가는 시계 — 이미 떠 있으면 고치고, 없으면 새로 띄운다. 꺼 둔 사람(설정)은 조용히 넘어간다
    static func start(since: Date, target: Int, exercise: String) async {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let state = RestActivityAttributes.ContentState(since: since, target: target, exercise: exercise)
        /* 앱의 휴식 시계와 같게 10분 뒤에는 낡은 것으로 — 시스템이 흐리게 둔다 */
        let content = ActivityContent(state: state, staleDate: since.addingTimeInterval(600))
        let live = Activity<RestActivityAttributes>.activities
        if let first = live.first {
            await first.update(content)
            for extra in live.dropFirst() { await extra.end(nil, dismissalPolicy: .immediate) }
        } else {
            _ = try? Activity.request(attributes: RestActivityAttributes(), content: content, pushType: nil)
        }
    }

    static func end() async {
        for a in Activity<RestActivityAttributes>.activities { await a.end(nil, dismissalPolicy: .immediate) }
    }
}
