import ActivityKit
import SwiftUI
import WidgetKit

/*
 * 운동하는 동안의 시계 — 운동 화면(쉬기는 마지막 세트부터 올라감 · 운동 중은 전체 시간) · 암케어 따라 하기(버티기 · 쉬기는 거꾸로) ·
 * 메커니즘 따라 하기(운동 중). 앱이 상태만 넘기고 시계는 시스템이 센다(native/src/shell/live-activity.ts).
 */
typealias LiveState = SessionActivityAttributes.ContentState

/// timerInterval 글은 늘 가장 긴 모양만큼 자리를 잡아 그대로 두면 한쪽으로 쏠린다 — 가운데 정렬로 숫자를 칸 가운데에(2026-10-20 김민)
@ViewBuilder
private func clock(_ s: LiveState) -> some View {
  if let until = s.until, until > s.since {
    Text(timerInterval: s.since...until, countsDown: true).monospacedDigit().multilineTextAlignment(.center)
  } else {
    /* 쉬기는 앱 휴식 시계처럼 10분, 운동 중은 4시간에서 멈춘다 */
    Text(timerInterval: s.since...s.since.addingTimeInterval(s.kind == "rest" ? 600 : 4 * 3600), countsDown: false)
      .monospacedDigit()
      .multilineTextAlignment(.center)
  }
}

private let sky = Color(red: 0.04, green: 0.52, blue: 0.84)

private func icon(_ s: LiveState) -> some View {
  Image(systemName: s.symbol.isEmpty ? "timer" : s.symbol).foregroundStyle(sky)
}

struct RestActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: SessionActivityAttributes.self) { ctx in
      // 잠금 화면 · 알림 배너
      HStack(spacing: 12) {
        icon(ctx.state).font(.title2)
        VStack(alignment: .leading, spacing: 2) {
          Text(ctx.state.title.isEmpty ? ctx.state.label : ctx.state.title).font(.subheadline).lineLimit(1)
          Text(ctx.state.detail.isEmpty ? ctx.state.label : "\(ctx.state.label) · \(ctx.state.detail)").font(.caption).foregroundStyle(.secondary).lineLimit(1)
        }
        Spacer()
        clock(ctx.state).font(.system(size: 34, weight: .semibold)).frame(width: 120)
      }
      .padding(16)
      .activityBackgroundTint(Color.black.opacity(0.35))
    } dynamicIsland: { ctx in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Label { Text(ctx.state.label) } icon: { icon(ctx.state) }.font(.subheadline).foregroundStyle(sky)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(ctx.state.detail).font(.caption).foregroundStyle(.secondary).lineLimit(1)
        }
        /* 숫자는 가운데 칸(카메라 밑)에 크게 */
        DynamicIslandExpandedRegion(.center) {
          clock(ctx.state).font(.system(size: 34, weight: .semibold)).frame(maxWidth: .infinity)
        }
        DynamicIslandExpandedRegion(.bottom) {
          Text(ctx.state.title).font(.caption).lineLimit(1).frame(maxWidth: .infinity)
        }
      } compactLeading: {
        icon(ctx.state)
      } compactTrailing: {
        clock(ctx.state).frame(width: 44).foregroundStyle(sky)
      } minimal: {
        icon(ctx.state)
      }
    }
  }
}

@main
struct RestActivityBundle: WidgetBundle {
  var body: some Widget {
    RestActivityWidget()
  }
}
