import ActivityKit
import SwiftUI
import WidgetKit

/** 휴식 시계 — 마지막 세트로부터 올라가는 시계. 앱의 10분 상한과 같게 10분에서 멈춘다 */
/// timerInterval 글은 늘 가장 긴 모양('0:00:00')만큼 자리를 잡아 그대로 두면 한쪽으로 쏠린다 — 가운데 정렬로 숫자를 칸 가운데에(2026-10-20 김민: 너무 오른쪽에 붙어 있다)
private func clock(_ s: RestActivityAttributes.ContentState) -> some View {
  Text(timerInterval: s.since...s.since.addingTimeInterval(600), countsDown: false)
    .monospacedDigit()
    .multilineTextAlignment(.center)
}

private func targetText(_ s: RestActivityAttributes.ContentState) -> String {
  s.target > 0 ? String(format: "권장 %d:%02d", s.target / 60, s.target % 60) : "쉬는 중"
}

private let sky = Color(red: 0.04, green: 0.52, blue: 0.84)

struct RestActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: RestActivityAttributes.self) { ctx in
      // 잠금 화면 · 알림 배너
      HStack(spacing: 12) {
        Image(systemName: "timer").font(.title2).foregroundStyle(sky)
        VStack(alignment: .leading, spacing: 2) {
          Text(ctx.state.exercise.isEmpty ? "쉬는 시간" : ctx.state.exercise).font(.subheadline).lineLimit(1)
          Text(targetText(ctx.state)).font(.caption).foregroundStyle(.secondary)
        }
        Spacer()
        clock(ctx.state).font(.system(size: 34, weight: .semibold)).frame(width: 110)
      }
      .padding(16)
      .activityBackgroundTint(Color.black.opacity(0.35))
    } dynamicIsland: { ctx in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Label("휴식", systemImage: "timer").font(.subheadline).foregroundStyle(sky)
        }
        DynamicIslandExpandedRegion(.trailing) {
          Text(targetText(ctx.state)).font(.caption).foregroundStyle(.secondary)
        }
        /* 숫자는 가운데 칸(카메라 밑)에 크게 */
        DynamicIslandExpandedRegion(.center) {
          clock(ctx.state).font(.system(size: 34, weight: .semibold)).frame(maxWidth: .infinity)
        }
        DynamicIslandExpandedRegion(.bottom) {
          Text(ctx.state.exercise).font(.caption).lineLimit(1).frame(maxWidth: .infinity)
        }
      } compactLeading: {
        Image(systemName: "timer").foregroundStyle(sky)
      } compactTrailing: {
        clock(ctx.state).frame(width: 44).foregroundStyle(sky)
      } minimal: {
        Image(systemName: "timer").foregroundStyle(sky)
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
