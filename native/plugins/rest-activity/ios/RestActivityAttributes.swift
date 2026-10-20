import ActivityKit
import Foundation

/**
 * 운동하는 동안의 시계 — 다이나믹 아일랜드 · 잠금 화면(Live Activity). 운동 화면 · 암케어 · 메커니즘 따라 하기가 같이 쓴다.
 * 앱(modules/bullpen-native RestActivity.swift)에도 같은 이름 · 같은 칸으로 하나 더 있다 — ActivityKit 은 이름과 칸으로 맞춰 본다.
 * 칸을 바꾸면 두 곳을 같이 고친다.
 */
struct SessionActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /** rest = 쉬는 중(올라감) · hold = 버티기 · 쉬기(거꾸로) · work = 운동 중(전체 시간) */
    var kind: String
    /** SF Symbol 이름 */
    var symbol: String
    /** 작은 이름 — '휴식' · '운동 중' · '암케어' · '메커니즘' */
    var label: String
    /** 지금 운동 · 드릴 */
    var title: String
    /** '세트 3/4' · '권장 1:30' 같은 한 줄 */
    var detail: String
    /** 시계가 시작한 때 */
    var since: Date
    /** 있으면 이때까지 거꾸로 센다 */
    var until: Date?
  }
}
